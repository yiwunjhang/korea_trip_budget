<script setup lang="ts">
import { computed, ref } from 'vue'
import CategoryIcon from '../components/CategoryIcon.vue'
import { FIXED_CATEGORIES } from '../utils/categories'
import TransactionList from '../components/TransactionList.vue'
import { useLedgerStore } from '../stores/ledger'
import { formatKRW, formatTWD } from '../utils/money'

const ledger = useLedgerStore()

const walletFilter = ref<number | null>(null)
const categoryFilter = ref<string | null>(null)

const filtered = computed(() =>
  ledger.transactions.filter((tx) => {
    if (walletFilter.value !== null && tx.wallet_id !== walletFilter.value) return false
    if (categoryFilter.value !== null && tx.category !== categoryFilter.value) return false
    return true
  }),
)

/** 依分類小計（只算花費，退款相抵） */
const byCategory = computed(() => {
  const map = new Map<string, { krw: number; twd: number; count: number }>()
  for (const tx of ledger.transactions) {
    if (tx.kind === 'topup') continue
    const sign = tx.kind === 'refund' ? -1 : 1
    const row = map.get(tx.category) ?? { krw: 0, twd: 0, count: 0 }
    row.krw += sign * tx.amount_krw
    row.twd += sign * tx.amount_twd
    row.count += 1
    map.set(tx.category, row)
  }
  return [...map.entries()]
    .map(([category, row]) => ({ category, ...row }))
    .sort((a, b) => b.krw - a.krw)
})

const totalKrw = computed(() => byCategory.value.reduce((sum, row) => sum + row.krw, 0))
</script>

<template>
  <div class="space-y-5">
    <!-- 分類統計 -->
    <section>
      <h2 class="mb-2 px-1 text-sm font-semibold text-ink-800">分類統計</h2>
      <div v-if="!byCategory.length" class="card text-center text-sm text-ink-400">
        還沒有花費紀錄
      </div>
      <ul v-else class="glass divide-y divide-line overflow-hidden">
        <li
          v-for="row in byCategory"
          :key="row.category"
          class="flex items-center gap-3 px-4 py-3"
        >
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <CategoryIcon :name="row.category" :size="18" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-ink-900">{{ row.category }}</p>
            <div class="mt-1 h-1 overflow-hidden rounded-full bg-brand-50">
              <div
                class="h-full rounded-full bg-brand-500"
                :style="{ width: `${totalKrw > 0 ? (row.krw / totalKrw) * 100 : 0}%` }"
              />
            </div>
          </div>
          <div class="shrink-0 text-right">
            <p class="tabular text-sm font-semibold text-ink-900">{{ formatKRW(row.krw) }}</p>
            <p class="tabular text-xs text-ink-400">{{ formatTWD(row.twd) }}</p>
          </div>
        </li>
      </ul>
    </section>

    <!-- 篩選 -->
    <section class="space-y-2">
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="chip"
          :class="{ 'chip-on': walletFilter === null }"
          @click="walletFilter = null"
        >
          全部錢包
        </button>
        <button
          v-for="w in ledger.wallets"
          :key="w.wallet_id"
          type="button"
          class="chip"
          :class="{ 'chip-on': walletFilter === w.wallet_id }"
          @click="walletFilter = w.wallet_id"
        >
          {{ w.name }}
        </button>
      </div>

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="chip"
          :class="{ 'chip-on': categoryFilter === null }"
          @click="categoryFilter = null"
        >
          全部分類
        </button>
        <button
          v-for="c in FIXED_CATEGORIES"
          :key="c.name"
          type="button"
          class="chip"
          :class="{ 'chip-on': categoryFilter === c.name }"
          @click="categoryFilter = c.name"
        >
          <CategoryIcon :name="c.name" :size="15" />
          {{ c.name }}
        </button>
      </div>
    </section>

    <!-- 明細 -->
    <section>
      <h2 class="mb-2 px-1 text-sm font-semibold text-ink-800">
        明細（{{ filtered.length }} 筆）
      </h2>
      <TransactionList :items="filtered" empty-text="這個條件下沒有紀錄" />
    </section>
  </div>
</template>
