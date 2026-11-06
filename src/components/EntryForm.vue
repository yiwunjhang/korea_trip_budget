<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Currency, TxKind } from '../db/api'
import { useLedgerStore } from '../stores/ledger'
import { formatMoney, krwToTwd, seoulInputToISO, toSeoulInputValue, twdToKrw } from '../utils/money'
import { previewRebate, STAGE_CAP_TWD } from '../utils/easywallet'

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
const saving = ref(false)
const savedHint = ref('')

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

/** 選台幣錢包時，預設仍以韓元輸入（在韓國看到的都是韓元標價） */
watch(kind, (value) => {
  if (value !== 'topup') fundedWalletId.value = null
})

const numericAmount = computed(() => {
  const value = Number(amount.value)
  return Number.isFinite(value) && value > 0 ? value : 0
})

const amountKrw = computed(() =>
  currency.value === 'KRW' ? numericAmount.value : twdToKrw(numericAmount.value, rate.value),
)
const amountTwd = computed(() =>
  currency.value === 'TWD' ? numericAmount.value : krwToTwd(numericAmount.value, rate.value),
)

/** 這筆會從錢包扣（或加）多少，以錢包的計價幣別表示 */
const walletDelta = computed(() => {
  if (!wallet.value) return 0
  const value = wallet.value.balance_currency === 'KRW' ? amountKrw.value : amountTwd.value
  return kind.value === 'expense' ? -value : value
})

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

const balanceAfter = computed(() => (wallet.value ? wallet.value.balance + walletDelta.value : 0))

const canSubmit = computed(() => walletId.value !== null && numericAmount.value > 0 && !saving.value)

const kinds: { value: TxKind; label: string }[] = [
  { value: 'expense', label: '花費' },
  { value: 'topup', label: '加值／換匯' },
  { value: 'refund', label: '退款' },
]

async function submit() {
  if (!canSubmit.value || walletId.value === null) return
  saving.value = true
  const created = await ledger.addTransaction({
    kind: kind.value,
    spent_at: seoulInputToISO(spentAt.value),
    title: title.value.trim(),
    category: kind.value === 'topup' ? '加值換匯' : category.value,
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
    savedHint.value = `已記一筆 ${formatMoney(created.amount_krw, 'KRW')}（${formatMoney(created.amount_twd, 'TWD')}）`
    setTimeout(() => (savedHint.value = ''), 2500)
  }
}
</script>

<template>
  <form class="card space-y-4" @submit.prevent="submit">
    <!-- 種類 -->
    <div class="flex gap-2">
      <button
        v-for="option in kinds"
        :key="option.value"
        type="button"
        class="chip flex-1 justify-center"
        :class="{ 'chip-on': kind === option.value }"
        @click="kind = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <!-- 錢包 -->
    <div>
      <span class="label">{{ kind === 'topup' ? '加值到哪個錢包' : '用哪個付' }}</span>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="w in ledger.activeWallets"
          :key="w.wallet_id"
          type="button"
          class="chip"
          :class="{ 'chip-on': walletId === w.wallet_id }"
          @click="walletId = w.wallet_id"
        >
          {{ w.name }}
          <span class="tabular text-xs text-ink-400">
            {{ formatMoney(w.balance, w.balance_currency) }}
          </span>
        </button>
      </div>
    </div>

    <!-- 金額 -->
    <div>
      <span class="label">金額</span>
      <div class="flex gap-2">
        <div class="flex overflow-hidden rounded-xl border border-white/80">
          <button
            v-for="c in (['KRW', 'TWD'] as Currency[])"
            :key="c"
            type="button"
            class="px-3 text-sm font-medium transition"
            :class="currency === c ? 'bg-brand-400 text-ink-900' : 'bg-white/55 text-ink-600'"
            @click="currency = c"
          >
            {{ c === 'KRW' ? '₩' : 'NT$' }}
          </button>
        </div>
        <input
          v-model="amount"
          class="field tabular flex-1 text-lg font-semibold"
          type="text"
          inputmode="decimal"
          placeholder="0"
        />
      </div>
      <p class="tabular mt-2 text-sm text-ink-600">
        ₩{{ Math.round(amountKrw).toLocaleString('zh-TW') }}
        ≈ {{ formatMoney(amountTwd, 'TWD') }}
      </p>
    </div>

    <!-- 匯率 -->
    <div>
      <label class="label" for="rate">匯率（1 台幣 = ? 韓元）</label>
      <input
        id="rate"
        v-model.number="rate"
        class="field tabular"
        type="number"
        step="0.01"
        min="0.01"
        @input="rateTouched = true"
      />
      <p v-if="wallet?.default_krw_per_twd" class="mt-1 text-xs text-ink-400">
        已帶入「{{ wallet.name }}」的專屬匯率 {{ wallet.default_krw_per_twd }}
      </p>
    </div>

    <!-- 分類（加值不需要） -->
    <div v-if="kind !== 'topup'">
      <span class="label">分類</span>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="c in ledger.categories"
          :key="c.id"
          type="button"
          class="chip"
          :class="{ 'chip-on': category === c.name }"
          @click="category = c.name"
        >
          {{ c.emoji }} {{ c.name }}
        </button>
      </div>
    </div>

    <!-- 加值來源 -->
    <div v-else>
      <label class="label" for="funded">這筆錢從哪裡來</label>
      <select id="funded" v-model="fundedWalletId" class="field">
        <option :value="null">台灣帳戶／外部匯入（不扣任何錢包）</option>
        <option
          v-for="w in ledger.activeWallets.filter((x) => x.wallet_id !== walletId)"
          :key="w.wallet_id"
          :value="w.wallet_id"
        >
          {{ w.name }}（{{ formatMoney(w.balance, w.balance_currency) }}）
        </option>
      </select>
    </div>

    <!-- 品項與時間 -->
    <div class="grid grid-cols-2 gap-2">
      <div>
        <label class="label" for="title">品項</label>
        <input id="title" v-model="title" class="field" type="text" placeholder="例：地鐵一日券" />
      </div>
      <div>
        <label class="label" for="spent-at">時間（首爾）</label>
        <input id="spent-at" v-model="spentAt" class="field" type="datetime-local" />
      </div>
    </div>

    <div>
      <label class="label" for="note">備註</label>
      <input id="note" v-model="note" class="field" type="text" placeholder="選填" />
    </div>

    <!-- 扣完剩多少 -->
    <p v-if="wallet && numericAmount > 0" class="tabular text-sm text-ink-600">
      {{ wallet.name }}：{{ formatMoney(wallet.balance, wallet.balance_currency) }}
      →
      <span :class="balanceAfter < 0 ? 'font-semibold text-flame-600' : 'font-semibold text-ink-900'">
        {{ formatMoney(balanceAfter, wallet.balance_currency) }}
      </span>
    </p>

    <!-- 悠遊付回饋額度：用減法顯示還剩多少 -->
    <div
      v-if="rebatePreview"
      class="rounded-xl border p-3"
      :class="rebatePreview.quotaAfter < 0 ? 'border-flame-100 bg-flame-50/80' : 'border-white/80 bg-white/50'"
    >
      <div class="flex items-baseline justify-between text-xs">
        <span class="font-medium text-ink-800">
          {{ wallet?.name }}・{{ rebatePreview.stage.label }}額度
        </span>
        <span class="text-ink-400">回饋上限 NT${{ STAGE_CAP_TWD }}</span>
      </div>

      <p class="tabular mt-1.5 text-sm text-ink-600">
        {{ formatMoney(rebatePreview.quota, 'TWD') }}
        − 已刷 {{ formatMoney(rebatePreview.spentBefore, 'TWD') }}
        <template v-if="numericAmount > 0">− 這筆 {{ formatMoney(amountTwd, 'TWD') }}</template>
      </p>
      <p
        class="tabular text-xl font-bold"
        :class="rebatePreview.quotaAfter < 0 ? 'text-flame-600' : 'text-ink-900'"
      >
        <template v-if="rebatePreview.quotaAfter >= 0">
          剩 {{ formatMoney(rebatePreview.quotaAfter, 'TWD') }}
        </template>
        <template v-else>超過 {{ formatMoney(-rebatePreview.quotaAfter, 'TWD') }}</template>
      </p>

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
        這筆有 {{ formatMoney(rebatePreview.overBy, 'TWD') }} 超出額度、沒有回饋，建議改刷卡或付現。
      </p>
    </div>

    <button class="btn-primary w-full" type="submit" :disabled="!canSubmit">
      {{ saving ? '儲存中…' : '記一筆' }}
    </button>

    <p v-if="savedHint" class="text-center text-sm text-mint-600">{{ savedHint }}</p>
  </form>
</template>
