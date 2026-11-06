<script setup lang="ts">
import { computed } from 'vue'
import EntryForm from '../components/EntryForm.vue'
import TodayStops from '../components/TodayStops.vue'
import TransactionList from '../components/TransactionList.vue'
import { useLedgerStore } from '../stores/ledger'
import { formatMoney, formatSeoulDate } from '../utils/money'
import { isDailyCategory } from '../utils/categories'

/** 首頁就是記帳：上面一行今天花多少／預算剩多少，接著直接輸入金額 */
const ledger = useLedgerStore()

/** 今天（首爾時間）花了多少 */
const today = computed(() => {
  const todayLabel = formatSeoulDate(new Date().toISOString())
  // 機票、住宿不算「今天花多少」，不然付款那天會失真
  const todays = ledger.transactions.filter(
    (tx) =>
      tx.kind !== 'topup' &&
      isDailyCategory(tx.category) &&
      formatSeoulDate(tx.spent_at) === todayLabel,
  )
  const sign = (kind: string) => (kind === 'refund' ? -1 : 1)
  return {
    krw: todays.reduce((sum, tx) => sum + sign(tx.kind) * tx.amount_krw, 0),
    count: todays.length,
  }
})

const remainingKrw = computed(() =>
  ledger.summary && ledger.summary.budget_krw > 0 ? ledger.summary.remaining_krw : null,
)

const recent = computed(() => ledger.transactions.slice(0, 5))
</script>

<template>
  <div class="space-y-4">
    <!-- 今天／預算：一行就好，細節在「總覽」 -->
    <router-link
      :to="{ name: 'overview' }"
      class="glass flex items-center justify-between px-4 py-2.5 text-xs text-ink-600"
    >
      <span class="tabular">
        今天 <b class="text-sm text-ink-900">{{ formatMoney(today.krw, 'KRW') }}</b>
        <span class="text-ink-400">（{{ today.count }} 筆）</span>
      </span>
      <span v-if="remainingKrw !== null" class="tabular">
        預算剩
        <b class="text-sm" :class="remainingKrw < 0 ? 'text-flame-600' : 'text-ink-900'">
          {{ formatMoney(remainingKrw, 'KRW') }}
        </b>
        ›
      </span>
      <span v-else class="text-ink-400">看總覽 ›</span>
    </router-link>

    <!-- 今天的行程：點一站就帶入品項 -->
    <TodayStops />

    <EntryForm />

    <!-- 最近紀錄：記完馬上確認有沒有記錯 -->
    <section class="pt-2">
      <div class="mb-2 flex items-baseline justify-between px-1">
        <h2 class="text-sm font-semibold text-ink-800">最近紀錄</h2>
        <router-link class="text-xs text-brand-600" :to="{ name: 'records' }">看全部 ›</router-link>
      </div>
      <TransactionList :items="recent" empty-text="還沒有紀錄，輸入金額記第一筆吧" />
    </section>
  </div>
</template>
