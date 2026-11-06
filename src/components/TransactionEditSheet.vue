<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { Trash2, X } from 'lucide-vue-next'
import type { Currency, Transaction, TxKind } from '../db/api'
import { useLedgerStore } from '../stores/ledger'
import { alertError, confirmDelete, toastSaved } from '../utils/alert'
import { FIXED_CATEGORIES, normalizeCategory, TOPUP_CATEGORY } from '../utils/categories'
import { formatMoney, krwToTwd, seoulInputToISO, toSeoulInputValue, twdToKrw } from '../utils/money'
import { tracksBalance } from '../utils/wallet'
import CategoryIcon from './CategoryIcon.vue'

/**
 * 修改一筆帳：從下方滑出的面板。tx 為 null 時關閉。
 * 存檔後帳本會重新載入，餘額、預算、回饋額度都會跟著重算。
 */
const props = defineProps<{ tx: Transaction | null }>()
const emit = defineEmits<{ close: [] }>()

const ledger = useLedgerStore()
const saving = ref(false)

const form = reactive({
  kind: 'expense' as TxKind,
  walletId: 0,
  fundedWalletId: null as number | null,
  currency: 'KRW' as Currency,
  amount: '',
  rate: 43,
  category: '餐飲',
  title: '',
  note: '',
  spentAt: '',
})

/** 打開時把這筆帳的內容帶進表單 */
watch(
  () => props.tx,
  (tx) => {
    if (!tx) return
    form.kind = tx.kind
    form.walletId = tx.wallet_id
    form.fundedWalletId = tx.funded_wallet_id
    form.currency = tx.currency
    form.amount = String(tx.amount)
    form.rate = tx.krw_per_twd
    // 舊資料若是不在固定清單的分類，改存時會變成「其他」
    form.category = tx.kind === 'topup' ? '餐飲' : normalizeCategory(tx.category)
    form.title = tx.title
    form.note = tx.note
    form.spentAt = toSeoulInputValue(new Date(tx.spent_at))
  },
  { immediate: true },
)

/** 開著面板時鎖住後面頁面的捲動 */
watch(
  () => props.tx,
  (tx) => (document.body.style.overflow = tx ? 'hidden' : ''),
  { immediate: true },
)
onBeforeUnmount(() => (document.body.style.overflow = ''))

/** 可選的付款方式：啟用中的，加上這筆原本用的（就算已停用） */
const walletChoices = computed(() => {
  const list = ledger.wallets.filter((w) => w.is_active || w.wallet_id === props.tx?.wallet_id)
  return form.kind === 'topup' ? list.filter((w) => tracksBalance(w.kind)) : list
})
const fundedChoices = computed(() =>
  ledger.wallets.filter(
    (w) =>
      tracksBalance(w.kind) &&
      w.wallet_id !== form.walletId &&
      (w.is_active || w.wallet_id === props.tx?.funded_wallet_id),
  ),
)

watch(
  () => form.kind,
  (kind) => {
    if (kind !== 'topup') form.fundedWalletId = null
    if (!walletChoices.value.some((w) => w.wallet_id === form.walletId)) {
      form.walletId = walletChoices.value[0]?.wallet_id ?? 0
    }
  },
)

/** 加值的來源不能跟收款錢包同一個（資料庫也會擋），換錢包時自動清掉 */
watch(
  () => form.walletId,
  (id) => {
    if (form.fundedWalletId === id) form.fundedWalletId = null
  },
)

const numericAmount = computed(() => {
  const value = Number(form.amount.replace(/,/g, ''))
  return Number.isFinite(value) && value > 0 ? value : 0
})

const converted = computed(() =>
  form.currency === 'KRW'
    ? `≈ ${formatMoney(krwToTwd(numericAmount.value, form.rate), 'TWD')}`
    : `≈ ${formatMoney(twdToKrw(numericAmount.value, form.rate), 'KRW')}`,
)

const canSave = computed(
  () => numericAmount.value > 0 && form.walletId > 0 && form.rate > 0 && !saving.value,
)

const kinds: { value: TxKind; label: string }[] = [
  { value: 'expense', label: '花費' },
  { value: 'topup', label: '加值／換匯' },
  { value: 'refund', label: '退款' },
]

async function save() {
  if (!props.tx || !canSave.value) return
  saving.value = true
  const ok = await ledger.editTransaction(props.tx.id, {
    kind: form.kind,
    wallet_id: form.walletId,
    funded_wallet_id: form.kind === 'topup' ? form.fundedWalletId : null,
    currency: form.currency,
    amount: numericAmount.value,
    krw_per_twd: form.rate,
    category: form.kind === 'topup' ? TOPUP_CATEGORY : form.category,
    title: form.title.trim(),
    note: form.note.trim(),
    spent_at: seoulInputToISO(form.spentAt),
  })
  saving.value = false
  if (ok) {
    toastSaved('已更新')
    emit('close')
  } else {
    alertError(ledger.error || '請稍後再試', '修改失敗')
  }
}

async function remove() {
  if (!props.tx) return
  const tx = props.tx
  const ok = await confirmDelete(
    `刪除「${tx.title || tx.category}」？`,
    `${formatMoney(tx.amount_krw, 'KRW')}（${formatMoney(tx.amount_twd, 'TWD')}）`,
  )
  if (!ok) return
  if (await ledger.removeTransaction(tx.id)) {
    toastSaved('已刪除')
    emit('close')
  } else {
    alertError(ledger.error || '請稍後再試', '刪除失敗')
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
      enter-active-class="transition duration-200"
      leave-active-class="transition duration-200"
    >
      <div v-if="tx" class="fixed inset-0 z-40 bg-ink-900/25" @click="emit('close')" />
    </Transition>

    <Transition
      enter-from-class="translate-y-full"
      leave-to-class="translate-y-full"
      enter-active-class="transition duration-250 ease-out"
      leave-active-class="transition duration-200 ease-in"
    >
      <form
        v-if="tx"
        class="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88vh] max-w-xl space-y-4 overflow-y-auto rounded-t-3xl border border-white/80 bg-[#fffdf8]/90 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-12px_40px_-12px_rgba(122,80,4,0.35)] backdrop-blur-xl"
        role="dialog"
        aria-label="修改這筆帳"
        @submit.prevent="save"
      >
        <!-- 標題列 -->
        <div class="mx-auto h-1 w-10 rounded-full bg-ink-400/40" />
        <div class="flex items-center justify-between">
          <h2 class="text-base font-bold text-ink-900">修改這筆帳</h2>
          <button type="button" class="p-1 text-ink-400" aria-label="關閉" @click="emit('close')">
            <X :size="20" />
          </button>
        </div>

        <!-- 種類 + 幣別 -->
        <div class="flex items-center justify-between gap-2">
          <div class="flex rounded-full bg-white/70 p-0.5 text-xs">
            <button
              v-for="option in kinds"
              :key="option.value"
              type="button"
              class="rounded-full px-2.5 py-1 transition"
              :class="form.kind === option.value ? 'bg-white font-semibold text-ink-900 shadow-sm' : 'text-ink-600'"
              @click="form.kind = option.value"
            >
              {{ option.label }}
            </button>
          </div>
          <div class="flex rounded-full bg-white/70 p-0.5 text-sm">
            <button
              v-for="c in (['KRW', 'TWD'] as Currency[])"
              :key="c"
              type="button"
              class="rounded-full px-3 py-1 font-medium transition"
              :class="form.currency === c ? 'bg-brand-400 text-ink-900 shadow-sm' : 'text-ink-600'"
              @click="form.currency = c"
            >
              {{ c === 'KRW' ? '₩' : 'NT$' }}
            </button>
          </div>
        </div>

        <!-- 金額 -->
        <label class="block">
          <span class="label">金額</span>
          <span class="flex items-baseline gap-2">
            <span class="text-xl font-semibold text-ink-400">{{ form.currency === 'KRW' ? '₩' : 'NT$' }}</span>
            <input
              v-model="form.amount"
              class="field tabular text-2xl font-bold"
              type="text"
              inputmode="decimal"
              aria-label="金額"
            />
          </span>
          <span class="tabular mt-1 block text-xs text-ink-600">{{ converted }}</span>
        </label>

        <!-- 付款方式 -->
        <div>
          <span class="label">{{ form.kind === 'topup' ? '加值到哪個錢包' : '用哪個付' }}</span>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="w in walletChoices"
              :key="w.wallet_id"
              type="button"
              class="truncate rounded-xl border px-2 py-2 text-sm transition"
              :class="
                form.walletId === w.wallet_id
                  ? 'border-brand-400 bg-brand-100/80 font-semibold text-ink-900'
                  : 'border-white/80 bg-white/60 text-ink-800'
              "
              @click="form.walletId = w.wallet_id"
            >
              {{ w.name }}
            </button>
          </div>
        </div>

        <!-- 加值來源 -->
        <div v-if="form.kind === 'topup'">
          <label class="label" for="edit-funded">這筆錢從哪裡來</label>
          <select id="edit-funded" v-model="form.fundedWalletId" class="field">
            <option :value="null">台灣帳戶／外部匯入（不扣任何錢包）</option>
            <option v-for="w in fundedChoices" :key="w.wallet_id" :value="w.wallet_id">{{ w.name }}</option>
          </select>
        </div>

        <!-- 分類 -->
        <div v-else>
          <span class="label">分類</span>
          <div class="grid grid-cols-4 gap-2">
            <button
              v-for="c in FIXED_CATEGORIES"
              :key="c.name"
              type="button"
              class="flex flex-col items-center gap-0.5 rounded-xl border py-2 text-xs transition"
              :class="
                form.category === c.name
                  ? 'border-brand-400 bg-brand-100/80 font-semibold text-brand-700'
                  : 'border-white/80 bg-white/60 text-ink-800'
              "
              @click="form.category = c.name"
            >
              <CategoryIcon :name="c.name" :size="20" />
              <span class="w-full truncate px-1 text-center">{{ c.name }}</span>
            </button>
          </div>
        </div>

        <!-- 品項、時間、匯率、備註 -->
        <div>
          <label class="label" for="edit-title">品項</label>
          <input id="edit-title" v-model="form.title" class="field" type="text" placeholder="選填" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="label" for="edit-time">時間（首爾）</label>
            <input id="edit-time" v-model="form.spentAt" class="field text-sm" type="datetime-local" />
          </div>
          <div>
            <label class="label" for="edit-rate">1 台幣 = ? 韓元</label>
            <input
              id="edit-rate"
              v-model.number="form.rate"
              class="field tabular"
              type="number"
              step="0.01"
              min="0.01"
            />
          </div>
        </div>
        <div>
          <label class="label" for="edit-note">備註</label>
          <input id="edit-note" v-model="form.note" class="field" type="text" placeholder="選填" />
        </div>

        <!-- 動作 -->
        <div class="flex gap-2 pt-1">
          <button type="button" class="btn-danger px-3" aria-label="刪除這筆" @click="remove">
            <Trash2 :size="16" />
          </button>
          <button type="button" class="btn-ghost" @click="emit('close')">取消</button>
          <button class="btn-primary flex-1" type="submit" :disabled="!canSave">
            {{ saving ? '儲存中…' : '儲存修改' }}
          </button>
        </div>
      </form>
    </Transition>
  </Teleport>
</template>
