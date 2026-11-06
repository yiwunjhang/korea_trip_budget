<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Transaction } from '../db/api'
import { Trash2 } from 'lucide-vue-next'
import { useLedgerStore } from '../stores/ledger'
import CategoryIcon from './CategoryIcon.vue'
import TransactionEditSheet from './TransactionEditSheet.vue'
import { alertError, confirmDelete, toastSaved } from '../utils/alert'
import { formatKRW, formatSeoulDate, formatSeoulDateTime, formatTWD } from '../utils/money'

const props = defineProps<{ items: Transaction[]; emptyText?: string }>()

const ledger = useLedgerStore()

/** 正在修改的那筆（點一筆就打開編輯面板） */
const editing = ref<Transaction | null>(null)

/** 以首爾日期分組，每組顯示當日花費小計（加值不計入） */
const groups = computed(() => {
  const map = new Map<string, Transaction[]>()
  for (const tx of props.items) {
    const day = formatSeoulDate(tx.spent_at)
    const list = map.get(day)
    if (list) list.push(tx)
    else map.set(day, [tx])
  }
  return [...map.entries()].map(([day, list]) => ({
    day,
    list,
    krw: list.reduce(
      (sum, tx) => sum + (tx.kind === 'expense' ? tx.amount_krw : tx.kind === 'refund' ? -tx.amount_krw : 0),
      0,
    ),
  }))
})

function walletName(id: number): string {
  return ledger.walletById(id)?.name ?? '—'
}

function kindLabel(tx: Transaction): string {
  if (tx.kind === 'topup') return '加值'
  if (tx.kind === 'refund') return '退款'
  return tx.category
}

async function remove(tx: Transaction) {
  const label = tx.title || kindLabel(tx)
  const ok = await confirmDelete(
    `刪除「${label}」？`,
    `${formatKRW(tx.amount_krw)}（${formatTWD(tx.amount_twd)}）・${formatSeoulDateTime(tx.spent_at)}`,
  )
  if (!ok) return
  if (await ledger.removeTransaction(tx.id)) toastSaved('已刪除')
  else alertError(ledger.error || '請稍後再試', '刪除失敗')
}
</script>

<template>
  <div v-if="!items.length" class="card text-center text-sm text-ink-400">
    {{ emptyText ?? '還沒有任何紀錄' }}
  </div>

  <div v-else class="space-y-4">
    <section v-for="group in groups" :key="group.day">
      <div class="mb-1.5 flex items-baseline justify-between px-1">
        <h3 class="text-xs font-semibold text-ink-600">{{ group.day }}</h3>
        <span class="tabular text-xs text-ink-400">{{ formatKRW(group.krw) }}</span>
      </div>

      <ul class="glass divide-y divide-line overflow-hidden">
        <li
          v-for="tx in group.list"
          :key="tx.id"
          class="flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-white/40 active:bg-white/60"
          role="button"
          tabindex="0"
          :aria-label="`修改 ${tx.title || kindLabel(tx)}`"
          @click="editing = tx"
          @keydown.enter="editing = tx"
        >
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <CategoryIcon :name="tx.kind === 'topup' ? '加值換匯' : tx.category" :size="18" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-ink-900">
              {{ tx.title || kindLabel(tx) }}
            </p>
            <p class="truncate text-xs text-ink-400">
              {{ kindLabel(tx) }} · {{ walletName(tx.wallet_id) }} ·
              {{ formatSeoulDateTime(tx.spent_at) }}
              <template v-if="tx.funded_wallet_id">
                ← {{ walletName(tx.funded_wallet_id) }}
              </template>
            </p>
            <p v-if="tx.note" class="truncate text-xs text-ink-400">{{ tx.note }}</p>
          </div>

          <div class="shrink-0 text-right">
            <p
              class="tabular text-sm font-semibold"
              :class="{
                'text-ink-900': tx.kind === 'expense',
                'text-mint-600': tx.kind === 'refund',
                'text-brand-600': tx.kind === 'topup',
              }"
            >
              {{ tx.kind === 'expense' ? '-' : '+' }}{{ formatKRW(tx.amount_krw) }}
            </p>
            <p class="tabular text-xs text-ink-400">{{ formatTWD(tx.amount_twd) }}</p>
          </div>

          <button
            type="button"
            class="shrink-0 p-1 text-ink-400 transition hover:text-flame-600"
            aria-label="刪除"
            @click.stop="remove(tx)"
            @keydown.enter.stop
          >
            <Trash2 :size="16" :stroke-width="1.75" />
          </button>
        </li>
      </ul>
    </section>
    <p class="text-center text-xs text-ink-400">點一筆可以修改</p>
  </div>

  <TransactionEditSheet :tx="editing" @close="editing = null" />
</template>
