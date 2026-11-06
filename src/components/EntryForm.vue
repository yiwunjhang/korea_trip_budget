<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { Currency, TxKind } from '../db/api'
import { useLedgerStore } from '../stores/ledger'
import { formatMoney, krwToTwd, seoulInputToISO, toSeoulInputValue, twdToKrw } from '../utils/money'
import { previewRebate, STAGE_CAP_TWD } from '../utils/easywallet'
import { tracksBalance } from '../utils/wallet'
import CategoryIcon from './CategoryIcon.vue'
import { FIXED_CATEGORIES, TOPUP_CATEGORY } from '../utils/categories'
import { ChevronDown } from 'lucide-vue-next'
import { alertError, toastSaved } from '../utils/alert'

/**
 * 記帳表單，順序照結帳當下的動作排：
 * 金額 → 用哪個付（悠遊付會馬上顯示額度剩多少）→ 分類 → 品項 → 記一筆。
 * 時間、匯率、備註平常用預設值就好，收在「更多」裡。
 */
const ledger = useLedgerStore()

const kind = ref<TxKind>('expense')
const walletId = ref<number | null>(null)
const fundedWalletId = ref<number | null>(null)
const currency = ref<Currency>('KRW')
const amount = ref('')
const rate = ref(ledger.baseRate)
const rateTouched = ref(false)
const category = ref('餐飲')
const title = ref('')
const note = ref('')
const spentAt = ref(toSeoulInputValue(new Date()))
const showMore = ref(false)
const saving = ref(false)
const amountInput = ref<HTMLInputElement | null>(null)
const route = useRoute()
const router = useRouter()

/**
 * 從行程「記一筆」過來：網址帶 ?title=無垢屋&category=餐飲，
 * 帶入品項與分類後把網址清乾淨，並把游標放到金額。
 */
watch(
  () => route.query,
  async (q) => {
    if (typeof q.title !== 'string' || !q.title) return
    title.value = q.title
    if (typeof q.category === 'string' && FIXED_CATEGORIES.some((c) => c.name === q.category)) {
      category.value = q.category
    }
    kind.value = 'expense'
    await router.replace({ query: {} })
    await nextTick()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    amountInput.value?.focus()
  },
  { immediate: true },
)

const wallet = computed(() => (walletId.value === null ? undefined : ledger.walletById(walletId.value)))

/** 預設選第一個可用錢包（seed 後是悠遊付） */
watch(
  () => ledger.activeWallets,
  (list) => {
    if (walletId.value === null && list.length) walletId.value = list[0].wallet_id
  },
  { immediate: true, deep: true },
)

/** 換錢包就帶入該錢包的匯率；使用者手動改過就不再覆蓋 */
watch([walletId, () => ledger.baseRate], () => {
  if (!rateTouched.value) rate.value = ledger.rateFor(walletId.value)
})

/** 加值只對有餘額的錢包（現金、交通卡）有意義；悠遊付、信用卡不算餘額 */
const balanceWallets = computed(() => ledger.activeWallets.filter((w) => tracksBalance(w.kind)))
const walletChoices = computed(() =>
  kind.value === 'topup' ? balanceWallets.value : ledger.activeWallets,
)

watch(kind, (value) => {
  if (value !== 'topup') fundedWalletId.value = null
  // 切到加值時，若目前選的是悠遊付／信用卡，改選第一個現金錢包
  if (!walletChoices.value.some((w) => w.wallet_id === walletId.value)) {
    walletId.value = walletChoices.value[0]?.wallet_id ?? null
  }
})

/**
 * 加值來源預設：Wowpass、T-money 是拿韓幣現金去儲值，預設從韓幣現金扣；
 * 韓幣現金本身是拿台幣換來的，預設「外部匯入」。
 */
watch([kind, walletId], () => {
  if (kind.value !== 'topup') return
  const target = wallet.value
  if (target && (target.kind === 'prepaid' || target.kind === 'transit')) {
    const krwCash = balanceWallets.value.find(
      (w) => w.kind === 'cash' && w.balance_currency === 'KRW' && w.wallet_id !== target.wallet_id,
    )
    fundedWalletId.value = krwCash?.wallet_id ?? null
  } else {
    fundedWalletId.value = null
  }
})

const numericAmount = computed(() => {
  const value = Number(amount.value.replace(/,/g, ''))
  return Number.isFinite(value) && value > 0 ? value : 0
})

const amountKrw = computed(() =>
  currency.value === 'KRW' ? numericAmount.value : twdToKrw(numericAmount.value, rate.value),
)
const amountTwd = computed(() =>
  currency.value === 'TWD' ? numericAmount.value : krwToTwd(numericAmount.value, rate.value),
)

/** 換算後的另一個幣別，顯示在金額下面 */
const convertedLabel = computed(() =>
  currency.value === 'KRW'
    ? `≈ ${formatMoney(amountTwd.value, 'TWD')}`
    : `≈ ${formatMoney(amountKrw.value, 'KRW')}`,
)

/** 這筆會從錢包扣（或加）多少，以錢包的計價幣別表示 */
const walletDelta = computed(() => {
  if (!wallet.value) return 0
  const value = wallet.value.balance_currency === 'KRW' ? amountKrw.value : amountTwd.value
  return kind.value === 'expense' ? -value : value
})
const balanceAfter = computed(() => (wallet.value ? wallet.value.balance + walletDelta.value : 0))

/** 用悠遊付花費時：額度 − 已刷 − 這筆 = 剩多少，以及這筆能拿多少回饋 */
const rebatePreview = computed(() => {
  if (kind.value !== 'expense' || wallet.value?.kind !== 'easywallet' || walletId.value === null)
    return null
  return previewRebate(
    walletId.value,
    amountTwd.value,
    seoulInputToISO(spentAt.value),
    ledger.rebateReport,
  )
})

/** 額度用掉的比例（含這筆），給進度條用 */
const quotaUsedPercent = computed(() => {
  const p = rebatePreview.value
  if (!p) return 0
  return Math.min(100, Math.max(0, ((p.quota - p.quotaAfter) / p.quota) * 100))
})

const canSubmit = computed(() => walletId.value !== null && numericAmount.value > 0 && !saving.value)

const kinds: { value: TxKind; label: string }[] = [
  { value: 'expense', label: '花費' },
  { value: 'topup', label: '加值／換匯' },
  { value: 'refund', label: '退款' },
]

const submitLabel = computed(() => {
  if (saving.value) return '儲存中…'
  const verb = kind.value === 'topup' ? '記加值' : kind.value === 'refund' ? '記退款' : '記一筆'
  return numericAmount.value > 0 ? `${verb} ${formatMoney(numericAmount.value, currency.value)}` : verb
})

/** 時間有改過才在「更多」旁邊提示，避免忘記改回來 */
const timeEdited = computed(() => spentAt.value !== toSeoulInputValue(new Date()))

async function submit() {
  if (!canSubmit.value || walletId.value === null) return
  saving.value = true
  const created = await ledger.addTransaction({
    kind: kind.value,
    spent_at: seoulInputToISO(spentAt.value),
    title: title.value.trim(),
    category: kind.value === 'topup' ? TOPUP_CATEGORY : category.value,
    wallet_id: walletId.value,
    currency: currency.value,
    amount: numericAmount.value,
    krw_per_twd: rate.value,
    funded_wallet_id: kind.value === 'topup' ? fundedWalletId.value : null,
    note: note.value.trim(),
  })
  saving.value = false

  if (created) {
    // 保留錢包、分類、匯率，讓下一筆可以直接按數字
    amount.value = ''
    title.value = ''
    note.value = ''
    spentAt.value = toSeoulInputValue(new Date())
    kind.value = 'expense'
    toastSaved(
      `已記 ${formatMoney(created.amount_krw, 'KRW')}`,
      `${formatMoney(created.amount_twd, 'TWD')}${created.title ? `・${created.title}` : ''}`,
    )
  } else {
    alertError(ledger.error || '請稍後再試', '記帳失敗')
  }
}
</script>

<template>
  <form class="space-y-3" @submit.prevent="submit">
    <!-- 1. 金額：最大、最先看到 -->
    <section class="card" @click="amountInput?.focus()">
      <div class="flex items-center justify-between">
        <div class="flex rounded-full bg-white/60 p-0.5 text-xs">
          <button
            v-for="option in kinds"
            :key="option.value"
            type="button"
            class="rounded-full px-2.5 py-1 transition"
            :class="kind === option.value ? 'bg-white font-semibold text-ink-900 shadow-sm' : 'text-ink-600'"
            @click.stop="kind = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <div class="flex rounded-full bg-white/60 p-0.5 text-sm">
          <button
            v-for="c in (['KRW', 'TWD'] as Currency[])"
            :key="c"
            type="button"
            class="rounded-full px-3 py-1 font-medium transition"
            :class="currency === c ? 'bg-brand-400 text-ink-900 shadow-sm' : 'text-ink-600'"
            @click.stop="currency = c"
          >
            {{ c === 'KRW' ? '₩ 韓元' : 'NT$' }}
          </button>
        </div>
      </div>

      <label class="mt-3 flex items-baseline gap-2">
        <span class="text-2xl font-semibold text-ink-400">{{ currency === 'KRW' ? '₩' : 'NT$' }}</span>
        <input
          ref="amountInput"
          v-model="amount"
          class="tabular w-full min-w-0 bg-transparent text-5xl font-bold text-ink-900 outline-none placeholder:text-ink-400/50"
          type="text"
          inputmode="decimal"
          enterkeyhint="done"
          placeholder="0"
          aria-label="金額"
        />
      </label>
      <p class="tabular mt-1 min-h-5 truncate text-sm text-ink-600">
        <template v-if="numericAmount > 0">{{ convertedLabel }}</template>
        <template v-if="title"><span v-if="numericAmount > 0"> ・ </span>品項：<b class="text-ink-900">{{ title }}</b></template>
      </p>
    </section>

    <!-- 2. 用哪個付 -->
    <section class="card space-y-3">
      <div>
        <span class="label">{{ kind === 'topup' ? '加值到哪個錢包' : '用哪個付' }}</span>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="w in walletChoices"
            :key="w.wallet_id"
            type="button"
            class="rounded-xl border px-3 py-2 text-left transition"
            :class="
              walletId === w.wallet_id
                ? 'border-brand-400 bg-brand-100/80 shadow-sm'
                : 'border-white/80 bg-white/55'
            "
            @click="walletId = w.wallet_id"
          >
            <span class="block truncate text-sm font-medium text-ink-900">{{ w.name }}</span>
            <span class="tabular block text-xs text-ink-400">
              <template v-if="tracksBalance(w.kind)">餘額 {{ formatMoney(w.balance, w.balance_currency) }}</template>
              <template v-else>已刷 {{ formatMoney(w.spent, w.balance_currency) }}</template>
            </span>
          </button>
        </div>
        <p v-if="kind === 'topup' && !walletChoices.length" class="text-xs text-ink-400">
          還沒有現金錢包可以加值，請先到「錢包」頁新增。
        </p>
        <p
          v-if="wallet && tracksBalance(wallet.kind) && numericAmount > 0"
          class="tabular mt-2 text-xs text-ink-600"
        >
          {{ wallet.name }}餘額 {{ formatMoney(wallet.balance, wallet.balance_currency) }} →
          <b :class="balanceAfter < 0 ? 'text-flame-600' : 'text-ink-900'">
            {{ formatMoney(balanceAfter, wallet.balance_currency) }}
          </b>
        </p>
      </div>

      <!-- 悠遊付回饋額度：用減法顯示還剩多少 -->
      <div
        v-if="rebatePreview"
        class="rounded-xl border p-3"
        :class="rebatePreview.quotaAfter < 0 ? 'border-flame-100 bg-flame-50/80' : 'border-white/80 bg-white/50'"
      >
        <div class="flex items-baseline justify-between text-xs">
          <span class="font-medium text-ink-800">{{ rebatePreview.stage.label }}回饋額度</span>
          <span class="text-ink-400">上限回饋 NT${{ STAGE_CAP_TWD }}</span>
        </div>
        <div class="mt-1 flex items-end justify-between gap-2">
          <p
            class="tabular text-2xl font-bold"
            :class="rebatePreview.quotaAfter < 0 ? 'text-flame-600' : 'text-ink-900'"
          >
            <template v-if="rebatePreview.quotaAfter >= 0">
              剩 {{ formatMoney(rebatePreview.quotaAfter, 'TWD') }}
            </template>
            <template v-else>超過 {{ formatMoney(-rebatePreview.quotaAfter, 'TWD') }}</template>
          </p>
          <p class="tabular pb-1 text-right text-xs text-ink-600">
            {{ formatMoney(rebatePreview.quota, 'TWD') }} − 已刷
            {{ formatMoney(rebatePreview.spentBefore, 'TWD') }}
            <template v-if="numericAmount > 0"><br />− 這筆 {{ formatMoney(amountTwd, 'TWD') }}</template>
          </p>
        </div>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-white/70">
          <div
            class="h-full rounded-full transition-all"
            :class="rebatePreview.quotaAfter < 0 ? 'bg-flame-500' : 'bg-brand-500'"
            :style="{ width: `${quotaUsedPercent}%` }"
          />
        </div>
        <p v-if="numericAmount > 0" class="tabular mt-2 text-xs">
          <span v-if="rebatePreview.rebate > 0" class="text-mint-600">
            這筆回饋約 {{ formatMoney(rebatePreview.rebate, 'TWD') }}，累積
            {{ rebatePreview.stageTotalAfter }} / {{ STAGE_CAP_TWD }}
          </span>
          <span v-else class="text-flame-600">回饋已經拿滿，這筆沒有 10.5%</span>
        </p>
        <p v-if="numericAmount > 0 && rebatePreview.overBy > 0" class="mt-1 text-xs text-flame-600">
          有 {{ formatMoney(rebatePreview.overBy, 'TWD') }} 超出額度、沒有回饋，建議改刷卡或付現。
        </p>
      </div>

      <!-- 加值來源 -->
      <div v-if="kind === 'topup'">
        <label class="label" for="funded">這筆錢從哪裡來</label>
        <select id="funded" v-model="fundedWalletId" class="field">
          <option :value="null">台灣帳戶／外部匯入（不扣任何錢包）</option>
          <option
            v-for="w in balanceWallets.filter((x) => x.wallet_id !== walletId)"
            :key="w.wallet_id"
            :value="w.wallet_id"
          >
            {{ w.name }}（{{ formatMoney(w.balance, w.balance_currency) }}）
          </option>
        </select>
      </div>
    </section>

    <!-- 3. 分類 + 品項 -->
    <section class="card space-y-3">
      <div v-if="kind !== 'topup'">
        <span class="label">分類</span>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="c in FIXED_CATEGORIES"
            :key="c.name"
            type="button"
            class="flex flex-col items-center gap-0.5 rounded-xl border py-2 text-xs transition"
            :class="
              category === c.name
                ? 'border-brand-400 bg-brand-100/80 font-semibold text-brand-700'
                : 'border-white/80 bg-white/55 text-ink-800'
            "
            @click="category = c.name"
          >
            <CategoryIcon :name="c.name" :size="22" />
            <span class="w-full truncate px-1 text-center">{{ c.name }}</span>
          </button>
        </div>
      </div>

      <div>
        <label class="label" for="title">品項（選填）</label>
        <input id="title" v-model="title" class="field" type="text" placeholder="例：橄欖油炸雞、T-money" />
      </div>

      <!-- 不常改的欄位收起來 -->
      <button
        type="button"
        class="flex w-full items-center justify-between text-xs text-ink-600"
        @click="showMore = !showMore"
      >
        <span>
          更多：時間、匯率、備註
          <span v-if="timeEdited && !showMore" class="text-brand-600">（時間已修改）</span>
        </span>
        <ChevronDown :size="16" class="transition" :class="showMore ? 'rotate-180' : ''" />
      </button>

      <div v-if="showMore" class="space-y-3">
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="label" for="spent-at">時間（首爾）</label>
            <input id="spent-at" v-model="spentAt" class="field text-sm" type="datetime-local" />
          </div>
          <div>
            <label class="label" for="rate">1 台幣 = ? 韓元</label>
            <input
              id="rate"
              v-model.number="rate"
              class="field tabular"
              type="number"
              step="0.01"
              min="0.01"
              @input="rateTouched = true"
            />
          </div>
        </div>
        <p v-if="wallet?.default_krw_per_twd" class="text-xs text-ink-400">
          已帶入「{{ wallet.name }}」的專屬匯率 {{ wallet.default_krw_per_twd }}
        </p>
        <div>
          <label class="label" for="note">備註</label>
          <input id="note" v-model="note" class="field" type="text" placeholder="選填" />
        </div>
      </div>
    </section>

    <!-- 送出：固定在底部導覽上方，不用捲到最下面 -->
    <div class="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10">
      <button class="btn-primary w-full py-3.5 text-base" type="submit" :disabled="!canSubmit">
        {{ submitLabel }}
      </button>
    </div>
  </form>
</template>
