<script setup lang="ts">
import { computed, onMounted } from 'vue'
import BudgetCard from '../components/BudgetCard.vue'
import GroupSpendingChart from '../components/GroupSpendingChart.vue'
import { useGroupStore } from '../stores/group'
import RebateCard from '../components/RebateCard.vue'
import { useLedgerStore } from '../stores/ledger'
import { formatMoney } from '../utils/money'
import { tracksBalance } from '../utils/wallet'

/** 總覽：預算剩多少、悠遊付回饋額度、現金餘額、刷卡已刷 */
const ledger = useLedgerStore()
const summary = computed(() => ledger.summary)
const balanceWallets = computed(() => ledger.activeWallets.filter((w) => tracksBalance(w.kind)))
const payWallets = computed(() => ledger.activeWallets.filter((w) => !tracksBalance(w.kind)))

/** 旅伴的花費會一直變，每次進總覽都重抓 */
const group = useGroupStore()
onMounted(() => group.refresh())
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

    <!-- 旅伴：每天各自花在哪 -->
    <GroupSpendingChart />

    <!-- 悠遊付回饋 -->
    <RebateCard />

    <!-- 現金：剩多少 -->
    <section v-if="balanceWallets.length">
      <h2 class="mb-2 px-1 text-sm font-semibold text-ink-800">現金餘額</h2>
      <ul class="grid grid-cols-2 gap-3">
        <li v-for="w in balanceWallets" :key="w.wallet_id" class="card">
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

    <!-- 悠遊付、信用卡：刷了多少 -->
    <section v-if="payWallets.length">
      <h2 class="mb-2 px-1 text-sm font-semibold text-ink-800">悠遊付・信用卡已刷</h2>
      <ul class="grid grid-cols-2 gap-3">
        <li v-for="w in payWallets" :key="w.wallet_id" class="card">
          <p class="truncate text-xs font-medium text-ink-600">{{ w.name }}</p>
          <p class="tabular mt-1 text-lg font-bold text-ink-900">
            {{ formatMoney(w.spent, w.balance_currency) }}
          </p>
          <p class="text-xs text-ink-400">已刷</p>
        </li>
      </ul>
    </section>
  </div>
</template>
