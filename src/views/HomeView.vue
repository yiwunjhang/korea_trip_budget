<script setup lang="ts">
import { computed } from 'vue'
import BudgetCard from '../components/BudgetCard.vue'
import EntryForm from '../components/EntryForm.vue'
import RebateCard from '../components/RebateCard.vue'
import TransactionList from '../components/TransactionList.vue'
import { useLedgerStore } from '../stores/ledger'
import { formatMoney, formatSeoulDate } from '../utils/money'

const ledger = useLedgerStore()

const summary = computed(() => ledger.summary)

/** 今天（首爾時間）花了多少 */
const today = computed(() => {
  const todayLabel = formatSeoulDate(new Date().toISOString())
  const todays = ledger.transactions.filter(
    (tx) => tx.kind !== 'topup' && formatSeoulDate(tx.spent_at) === todayLabel,
  )
  const sign = (kind: string) => (kind === 'refund' ? -1 : 1)
  return {
    krw: todays.reduce((sum, tx) => sum + sign(tx.kind) * tx.amount_krw, 0),
    twd: todays.reduce((sum, tx) => sum + sign(tx.kind) * tx.amount_twd, 0),
    count: todays.length,
  }
})

const recent = computed(() => ledger.transactions.slice(0, 8))
</script>

<template>
  <div class="space-y-5">
    <!-- 預算：剩多少 -->
    <section v-if="summary" class="grid grid-cols-2 gap-3">
      <BudgetCard
        label="韓元預算"
        currency="KRW"
        :budget="summary.budget_krw"
        :spent="summary.spent_krw"
        :remaining="summary.remaining_krw"
      />
      <BudgetCard
        label="台幣預算"
        currency="TWD"
        :budget="summary.budget_twd"
        :spent="summary.spent_twd"
        :remaining="summary.remaining_twd"
      />
    </section>

    <!-- 今日 -->
    <section class="card flex items-center justify-between">
      <div>
        <p class="text-xs font-medium text-ink-600">今天花費（{{ today.count }} 筆）</p>
        <p class="tabular mt-1 text-xl font-bold text-ink-900">
          {{ formatMoney(today.krw, 'KRW') }}
        </p>
      </div>
      <p class="tabular text-sm text-ink-600">{{ formatMoney(today.twd, 'TWD') }}</p>
    </section>

    <!-- 錢包餘額 -->
    <section>
      <h2 class="mb-2 px-1 text-sm font-semibold text-ink-800">錢包餘額</h2>
      <ul class="grid grid-cols-2 gap-3">
        <li v-for="w in ledger.activeWallets" :key="w.wallet_id" class="card">
          <p class="truncate text-xs font-medium text-ink-600">{{ w.name }}</p>
          <p
            class="tabular mt-1 text-lg font-bold"
            :class="w.balance < 0 ? 'text-flame-600' : 'text-ink-900'"
          >
            {{ formatMoney(w.balance, w.balance_currency) }}
          </p>
          <p class="tabular text-xs text-ink-400">
            已用 {{ formatMoney(w.spent, w.balance_currency) }}
          </p>
        </li>
      </ul>
    </section>

    <!-- 悠遊付回饋 -->
    <RebateCard />

    <!-- 記一筆 -->
    <section>
      <h2 class="mb-2 px-1 text-sm font-semibold text-ink-800">記一筆</h2>
      <EntryForm />
    </section>

    <!-- 最近紀錄 -->
    <section>
      <div class="mb-2 flex items-baseline justify-between px-1">
        <h2 class="text-sm font-semibold text-ink-800">最近紀錄</h2>
        <router-link class="text-xs text-brand-600" :to="{ name: 'records' }">看全部</router-link>
      </div>
      <TransactionList :items="recent" empty-text="還沒有紀錄，從上面記第一筆吧" />
    </section>
  </div>
</template>
