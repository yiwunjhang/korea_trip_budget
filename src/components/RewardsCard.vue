<script setup lang="ts">
import { computed } from 'vue'
import type { Transaction } from '../db/api'
import { useLedgerStore } from '../stores/ledger'
import { formatKRW, formatTWD } from '../utils/money'

/**
 * 回饋與退稅：把記成「退款」的帳整理成一張卡，看得到總共拿回多少。
 * - 名稱有「回饋」→ 回饋，依來源分組（「LINE Points 回饋：樂天超市」歸在「LINE Points 回饋」）
 * - 名稱有「退稅」→ 退稅
 * - 其他退款另外列
 * 這些都已經從總花費扣掉；店家即時退稅結帳時就少付了，不會出現在這裡。
 */
const ledger = useLedgerStore()

interface Group {
  name: string
  items: Transaction[]
  twd: number
  krw: number
}

const refunds = computed(() =>
  ledger.transactions
    .filter((tx) => tx.kind === 'refund')
    .sort((a, b) => a.spent_at.localeCompare(b.spent_at)),
)

function groupBy(list: Transaction[], nameOf: (tx: Transaction) => string): Group[] {
  const map = new Map<string, Group>()
  for (const tx of list) {
    const name = nameOf(tx)
    const g = map.get(name) ?? { name, items: [], twd: 0, krw: 0 }
    g.items.push(tx)
    g.twd += tx.amount_twd
    g.krw += tx.amount_krw
    map.set(name, g)
  }
  return [...map.values()].sort((a, b) => b.twd - a.twd)
}

const sourceOf = (tx: Transaction) => tx.title.split(/[：:]/)[0]!.trim() || '回饋'

const sections = computed(() => {
  const rewards = refunds.value.filter((tx) => tx.title.includes('回饋'))
  const tax = refunds.value.filter((tx) => !tx.title.includes('回饋') && tx.title.includes('退稅'))
  const other = refunds.value.filter((tx) => !tx.title.includes('回饋') && !tx.title.includes('退稅'))
  return [
    { key: 'reward', label: '回饋', groups: groupBy(rewards, sourceOf) },
    { key: 'tax', label: '退稅', groups: groupBy(tax, (tx) => tx.title) },
    { key: 'other', label: '其他退款', groups: groupBy(other, (tx) => tx.title) },
  ]
    .filter((s) => s.groups.length)
    .map((s) => ({ ...s, twd: s.groups.reduce((sum, g) => sum + g.twd, 0) }))
})

const totalTwd = computed(() => sections.value.reduce((s, sec) => s + sec.twd, 0))

/** 退稅是韓幣拿回來的，金額旁邊附上韓幣 */
const isKrw = (g: Group) => g.items.every((tx) => tx.currency === 'KRW')
const itemLabel = (tx: Transaction) => {
  const parts = tx.title.split(/[：:]/)
  return parts.length > 1 ? parts.slice(1).join('：').trim() : tx.title
}
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }).format(new Date(iso))
const twd = (v: number) => formatTWD(Math.round(v))
</script>

<template>
  <section v-if="sections.length" class="card space-y-3">
    <div class="flex items-baseline justify-between">
      <h2 class="text-sm font-semibold text-ink-800">回饋與退稅</h2>
      <span class="tabular text-sm font-bold text-mint-600">合計 {{ twd(totalTwd) }}</span>
    </div>

    <div v-for="sec in sections" :key="sec.key" class="space-y-1.5">
      <div class="flex items-baseline justify-between text-xs text-ink-400">
        <span>{{ sec.label }}</span>
        <span class="tabular">{{ twd(sec.twd) }}</span>
      </div>
      <ul class="space-y-1.5">
        <li v-for="g in sec.groups" :key="g.name">
          <details class="group rounded-xl bg-white/50 px-3 py-2">
            <summary class="flex cursor-pointer list-none items-baseline justify-between gap-2 text-sm">
              <span class="min-w-0 truncate text-ink-800">
                {{ g.name }}
                <span v-if="g.items.length > 1" class="text-xs text-ink-400">{{ g.items.length }} 筆</span>
              </span>
              <span class="tabular shrink-0 font-semibold text-mint-600">
                <span v-if="isKrw(g)" class="mr-1 text-xs font-normal text-ink-400">{{ formatKRW(Math.round(g.krw)) }}</span>
                {{ isKrw(g) ? '約 ' : '' }}{{ twd(g.twd) }}
              </span>
            </summary>
            <ul class="mt-2 space-y-1 border-t border-line pt-2 text-xs text-ink-600">
              <li v-for="tx in g.items" :key="tx.id" class="flex justify-between gap-2">
                <span class="min-w-0 truncate">{{ shortDate(tx.spent_at) }}・{{ itemLabel(tx) }}</span>
                <span class="tabular shrink-0">
                  {{ tx.currency === 'KRW' ? formatKRW(Math.round(tx.amount)) : twd(tx.amount) }}
                </span>
              </li>
            </ul>
          </details>
        </li>
      </ul>
    </div>

    <p class="text-xs leading-relaxed text-ink-400">
      只算已經記帳的回饋和退稅，總花費已扣掉。店家即時退稅結帳時就少付了，不在這裡。點一下可以看明細。
    </p>
  </section>
</template>
