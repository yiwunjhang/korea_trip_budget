<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Currency, Transaction } from '../db/api'
import { useLedgerStore } from '../stores/ledger'
import { FIXED_CATEGORIES, isDailyCategory, normalizeCategory } from '../utils/categories'
import { formatMoney as formatMoneyRaw } from '../utils/money'
import CategoryIcon from './CategoryIcon.vue'

/**
 * 總覽最上面：「我總共花了多少、花在哪」一眼看懂。
 * - 大數字：總花費（含機票、住宿、信用卡；退款會扣掉；換匯、儲值、加值不算）
 * - 依分類：由多到少排的長條，金額＋百分比
 * - 依付款方式：每個錢包花了多少
 * 直接用自己的帳目算，跟明細一致。
 */
const ledger = useLedgerStore()

/** 總覽看大概就好：金額一律取整數，不顯示小數 */
const formatMoney = (value: number, c: Currency) => formatMoneyRaw(Math.round(value), c)
/** 很小的分類寫「<1%」，不要寫 0% */
const percentLabel = (value: number, sum: number) => {
  const p = (value / sum) * 100
  return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`
}
const currency = ref<Currency>('TWD')

const amountOf = (tx: Transaction) => (currency.value === 'KRW' ? tx.amount_krw : tx.amount_twd)
const signOf = (tx: Transaction) => (tx.kind === 'expense' ? 1 : tx.kind === 'refund' ? -1 : 0)

/** 只算花費和退款；加值／換匯只是錢搬家 */
const spending = computed(() => ledger.transactions.filter((tx) => signOf(tx) !== 0))

const total = computed(() => spending.value.reduce((s, tx) => s + signOf(tx) * amountOf(tx), 0))
const otherTotal = computed(() => {
  const other: Currency = currency.value === 'KRW' ? 'TWD' : 'KRW'
  return {
    currency: other,
    value: spending.value.reduce(
      (s, tx) => s + signOf(tx) * (other === 'KRW' ? tx.amount_krw : tx.amount_twd),
      0,
    ),
  }
})

/** 旅途中（不含機票、住宿）平均每天花多少 */
const daily = computed(() => {
  const list = spending.value.filter((tx) => isDailyCategory(tx.category))
  const days = new Set(
    list.map((tx) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(tx.spent_at))),
  )
  const sum = list.reduce((s, tx) => s + signOf(tx) * amountOf(tx), 0)
  return { sum, days: days.size, average: days.size ? sum / days.size : 0 }
})

/** 依分類，由多到少 */
const byCategory = computed(() => {
  const rows = FIXED_CATEGORIES.map((c) => ({
    name: c.name,
    value: spending.value
      .filter((tx) => normalizeCategory(tx.category) === c.name)
      .reduce((s, tx) => s + signOf(tx) * amountOf(tx), 0),
  }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
  const max = Math.max(1, ...rows.map((r) => r.value))
  const sum = rows.reduce((s, r) => s + r.value, 0) || 1
  return rows.map((r) => ({ ...r, width: `${(r.value / max) * 100}%`, share: percentLabel(r.value, sum) }))
})

/** 依付款方式（含停用的錢包，舊帳才不會漏） */
const byWallet = computed(() => {
  const map = new Map<number, number>()
  for (const tx of spending.value) map.set(tx.wallet_id, (map.get(tx.wallet_id) ?? 0) + signOf(tx) * amountOf(tx))
  const rows = [...map.entries()]
    .map(([id, value]) => {
      const wallet = ledger.walletById(id)
      return { id, name: wallet?.name ?? '其他', isCard: wallet?.kind === 'card', value }
    })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
  const max = Math.max(1, ...rows.map((r) => r.value))
  return rows.map((r) => ({ ...r, width: `${(r.value / max) * 100}%` }))
})

const showWallets = ref(false)
</script>

<template>
  <section class="card space-y-4">
    <!-- 大數字 -->
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="text-xs font-medium text-ink-600">我的總花費</p>
        <p class="tabular mt-0.5 text-3xl font-bold text-ink-900">{{ formatMoney(total, currency) }}</p>
        <p class="tabular text-xs text-ink-400">≈ {{ formatMoney(otherTotal.value, otherTotal.currency) }}</p>
      </div>
      <div class="flex shrink-0 rounded-full bg-white/60 p-0.5 text-xs">
        <button
          v-for="c in (['TWD', 'KRW'] as Currency[])"
          :key="c"
          type="button"
          class="rounded-full px-2.5 py-1 transition"
          :class="currency === c ? 'bg-white font-semibold text-ink-900 shadow-sm' : 'text-ink-600'"
          @click="currency = c"
        >
          {{ c === 'KRW' ? '₩' : 'NT$' }}
        </button>
      </div>
    </div>

    <p v-if="daily.days" class="tabular -mt-2 rounded-xl bg-brand-50/80 px-3 py-2 text-xs text-ink-600">
      旅途中（不含機票、住宿）<b class="text-ink-900">{{ formatMoney(daily.sum, currency) }}</b>，
      {{ daily.days }} 天，平均每天 <b class="text-ink-900">{{ formatMoney(daily.average, currency) }}</b>
    </p>

    <p v-if="!byCategory.length" class="py-4 text-center text-sm text-ink-400">還沒有花費紀錄</p>

    <!-- 依分類：由多到少 -->
    <div v-else>
      <h3 class="mb-2 text-xs font-semibold text-ink-800">花在哪裡</h3>
      <ul class="space-y-2.5">
        <li v-for="row in byCategory" :key="row.name">
          <div class="flex items-center gap-2 text-sm">
            <CategoryIcon :name="row.name" :size="16" class="shrink-0 text-brand-600" />
            <span class="min-w-0 flex-1 truncate text-ink-800">{{ row.name }}</span>
            <span class="tabular font-semibold text-ink-900">{{ formatMoney(row.value, currency) }}</span>
            <span class="tabular w-9 text-right text-xs text-ink-400">{{ row.share }}</span>
          </div>
          <div class="mt-1 ml-6 h-2 overflow-hidden rounded-full bg-white/70">
            <div class="h-full rounded-full bg-brand-500" :style="{ width: row.width }" />
          </div>
        </li>
      </ul>
    </div>

    <!-- 依付款方式：預設收起 -->
    <div v-if="byWallet.length" class="border-t border-line pt-3">
      <button
        type="button"
        class="flex w-full items-center justify-between text-xs font-semibold text-ink-800"
        :aria-expanded="showWallets"
        @click="showWallets = !showWallets"
      >
        用什麼付
        <span class="font-normal text-brand-600">{{ showWallets ? '收起' : '展開' }}</span>
      </button>
      <ul v-if="showWallets" class="mt-2 space-y-2">
        <li v-for="w in byWallet" :key="w.id">
          <div class="flex items-center gap-2 text-sm">
            <span class="min-w-0 flex-1 truncate text-ink-800">
              {{ w.name }}
              <span v-if="w.isCard" class="text-[11px] text-ink-400">（不扣預算）</span>
            </span>
            <span class="tabular font-semibold text-ink-900">{{ formatMoney(w.value, currency) }}</span>
          </div>
          <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-white/70">
            <div class="h-full rounded-full bg-ink-400" :style="{ width: w.width }" />
          </div>
        </li>
      </ul>
    </div>

    <p class="text-[11px] leading-relaxed text-ink-400">
      含機票、住宿、信用卡，退款（例如悠遊付回饋）已扣掉；換匯、儲值、加值只是錢搬家，不算花費。
    </p>
  </section>
</template>
