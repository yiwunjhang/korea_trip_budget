<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Currency, GroupSpendingRow } from '../db/api'
import { useGroupStore } from '../stores/group'
import { useLedgerStore } from '../stores/ledger'
import { useSessionStore } from '../stores/session'
import { FIXED_CATEGORIES, normalizeCategory } from '../utils/categories'
import { formatMoney } from '../utils/money'
import CategoryIcon from './CategoryIcon.vue'

/**
 * 旅伴花費：每天一組，每人一條堆疊長條（分類分段），全部共用同一個比例尺，
 * 所以「誰花比較多、花在哪」可以直接比。點色塊看金額；也可以切成表格。
 * 沒加入群組時只畫自己的。
 */
const group = useGroupStore()
const ledger = useLedgerStore()
const session = useSessionStore()

const currency = ref<Currency>('KRW')
const view = ref<'chart' | 'table'>('chart')

/** 資料來源：有群組用群組彙總；沒有就用自己的帳在前端算 */
const rows = computed<GroupSpendingRow[]>(() => {
  if (group.group) return group.spending
  const map = new Map<string, GroupSpendingRow>()
  for (const tx of ledger.transactions) {
    if (tx.kind === 'topup') continue
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(tx.spent_at))
    const category = normalizeCategory(tx.category)
    const key = `${day}|${category}`
    const sign = tx.kind === 'refund' ? -1 : 1
    const row =
      map.get(key) ??
      { member_id: session.userId ?? 'me', display_name: '我', day, category, krw: 0, twd: 0, entry_count: 0 }
    row.krw += sign * tx.amount_krw
    row.twd += sign * tx.amount_twd
    row.entry_count += 1
    map.set(key, row)
  }
  return [...map.values()]
})

/** 成員順序：自己排第一，其他照加入順序 */
const people = computed(() => {
  if (!group.group) return [{ id: session.userId ?? 'me', name: '我' }]
  const list = group.members.map((m) => ({
    id: m.user_id,
    name: m.user_id === session.userId ? `${m.display_name}（我）` : m.display_name,
  }))
  return list.sort((a, b) => Number(b.id === session.userId) - Number(a.id === session.userId))
})

const days = computed(() => [...new Set(rows.value.map((r) => r.day))].sort())

const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
const selectedDay = ref<string>('all')
watch(
  days,
  (list) => {
    if (selectedDay.value !== 'all' && !list.includes(selectedDay.value)) selectedDay.value = 'all'
    if (selectedDay.value === 'all' && list.includes(todayKey)) selectedDay.value = todayKey
  },
  { immediate: true },
)

const shownDays = computed(() => (selectedDay.value === 'all' ? days.value : [selectedDay.value]))

const amountOf = (r: GroupSpendingRow) => (currency.value === 'KRW' ? r.krw : r.twd)

interface Bar {
  personId: string
  name: string
  total: number
  segments: { category: string; value: number; color: string }[]
}

function barsFor(dayFilter: (day: string) => boolean): Bar[] {
  return people.value.map((p) => {
    const mine = rows.value.filter((r) => r.member_id === p.id && dayFilter(r.day))
    const segments = FIXED_CATEGORIES.map((c) => ({
      category: c.name,
      color: c.color,
      value: mine.filter((r) => r.category === c.name).reduce((s, r) => s + amountOf(r), 0),
    })).filter((s) => s.value > 0)
    return { personId: p.id, name: p.name, total: segments.reduce((s, x) => s + x.value, 0), segments }
  })
}

/** 每一天的長條；選「全部」時最上面多一組「合計」 */
const groups = computed(() => {
  const list = shownDays.value.map((day) => ({ key: day, label: dayLabel(day), bars: barsFor((d) => d === day) }))
  if (selectedDay.value === 'all' && days.value.length > 1) {
    list.unshift({ key: 'total', label: '全部合計', bars: barsFor(() => true) })
  }
  return list
})

/** 共用比例尺：每天的長條都用同一個最大值，才能跨天比較（合計另外算） */
const dayMax = computed(() =>
  Math.max(1, ...groups.value.filter((g) => g.key !== 'total').flatMap((g) => g.bars.map((b) => b.total))),
)
const totalMax = computed(() =>
  Math.max(1, ...(groups.value.find((g) => g.key === 'total')?.bars.map((b) => b.total) ?? [1])),
)

/** 點選的色塊（手機沒有 hover，用點的） */
const picked = ref<{ group: string; personId: string; category: string } | null>(null)
function pick(groupKey: string, personId: string, category: string) {
  const same =
    picked.value?.group === groupKey && picked.value.personId === personId && picked.value.category === category
  picked.value = same ? null : { group: groupKey, personId, category }
}
function pickedLabel(groupKey: string, bars: Bar[]) {
  const p = picked.value
  if (!p || p.group !== groupKey) return ''
  const bar = bars.find((b) => b.personId === p.personId)
  const seg = bar?.segments.find((s) => s.category === p.category)
  if (!bar || !seg) return ''
  const share = bar.total > 0 ? Math.round((seg.value / bar.total) * 100) : 0
  return `${bar.name}・${seg.category} ${formatMoney(seg.value, currency.value)}（${share}%）`
}

/** 表格：目前選的範圍，分類 × 人 */
const table = computed(() => {
  const inScope = (d: string) => selectedDay.value === 'all' || d === selectedDay.value
  const bars = barsFor(inScope)
  return {
    people: bars.map((b) => ({ id: b.personId, name: b.name, total: b.total })),
    rows: FIXED_CATEGORIES.map((c) => ({
      category: c.name,
      color: c.color,
      values: bars.map((b) => b.segments.find((s) => s.category === c.name)?.value ?? 0),
    })).filter((r) => r.values.some((v) => v !== 0)),
  }
})

function dayLabel(day: string): string {
  const date = new Date(`${day}T12:00:00+09:00`)
  const md = `${date.getUTCMonth() + 1}/${date.getUTCDate()}`
  const wd = date.toLocaleDateString('zh-TW', { timeZone: 'Asia/Seoul', weekday: 'short' }).replace('週', '')
  return `${md}（${wd}）`
}
</script>

<template>
  <section class="card space-y-4">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold text-ink-800">
        {{ group.group ? `${group.group.name}・大家的花費` : '我的每日花費' }}
      </h2>
      <div class="flex rounded-full bg-white/60 p-0.5 text-xs">
        <button
          v-for="c in (['KRW', 'TWD'] as Currency[])"
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

    <p v-if="!group.group" class="rounded-xl bg-brand-50/80 px-3 py-2 text-xs text-ink-600">
      到「設定 → 旅伴群組」建立或加入群組，就能和旅伴一起看每天各自花在哪。
    </p>

    <p v-if="!rows.length" class="py-6 text-center text-sm text-ink-400">還沒有花費紀錄</p>

    <template v-else>
      <!-- 篩選：天數 -->
      <div class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <button
          type="button"
          class="chip shrink-0 text-xs"
          :class="{ 'chip-on': selectedDay === 'all' }"
          @click="selectedDay = 'all'"
        >
          全部
        </button>
        <button
          v-for="(d, i) in days"
          :key="d"
          type="button"
          class="chip shrink-0 text-xs"
          :class="{ 'chip-on': selectedDay === d }"
          @click="selectedDay = d"
        >
          第{{ i + 1 }}天 {{ dayLabel(d).split('（')[0] }}
        </button>
      </div>

      <!-- 圖例：分類固定、顏色固定 -->
      <ul class="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-ink-600">
        <li v-for="c in FIXED_CATEGORIES" :key="c.name" class="flex items-center gap-1">
          <span class="h-2.5 w-2.5 rounded-sm" :style="{ background: c.color }" />
          {{ c.name }}
        </li>
      </ul>

      <!-- 圖 -->
      <div v-if="view === 'chart'" class="space-y-5">
        <div v-for="g in groups" :key="g.key">
          <h3 class="mb-2 text-xs font-semibold text-ink-800">{{ g.label }}</h3>
          <ul class="space-y-2.5">
            <li v-for="bar in g.bars" :key="bar.personId">
              <div class="mb-1 flex items-baseline justify-between text-xs">
                <span class="truncate text-ink-800">{{ bar.name }}</span>
                <span class="tabular font-semibold text-ink-900">{{ formatMoney(bar.total, currency) }}</span>
              </div>
              <div class="h-4 w-full">
                <div
                  v-if="bar.total > 0"
                  class="flex h-full gap-[2px] overflow-hidden rounded"
                  :style="{ width: `${(bar.total / (g.key === 'total' ? totalMax : dayMax)) * 100}%` }"
                >
                  <button
                    v-for="seg in bar.segments"
                    :key="seg.category"
                    type="button"
                    class="h-full min-w-[3px] transition"
                    :class="
                      picked && picked.group === g.key && !(picked.personId === bar.personId && picked.category === seg.category)
                        ? 'opacity-40'
                        : ''
                    "
                    :style="{ flexGrow: seg.value, flexBasis: 0, background: seg.color }"
                    :title="`${seg.category} ${formatMoney(seg.value, currency)}`"
                    :aria-label="`${bar.name} ${seg.category} ${formatMoney(seg.value, currency)}`"
                    @click="pick(g.key, bar.personId, seg.category)"
                  />
                </div>
                <div v-else class="h-full w-full rounded bg-white/50" />
              </div>
            </li>
          </ul>
          <p class="tabular mt-1.5 min-h-4 text-xs text-ink-600">
            <template v-if="pickedLabel(g.key, g.bars)">{{ pickedLabel(g.key, g.bars) }}</template>
            <template v-else-if="g === groups[0]"><span class="text-ink-400">點色塊看金額</span></template>
          </p>
        </div>
      </div>

      <!-- 表格 -->
      <div v-else class="-mx-1 overflow-x-auto">
        <table class="tabular w-full text-xs">
          <thead>
            <tr class="text-ink-600">
              <th class="px-1 py-1.5 text-left font-medium">
                {{ selectedDay === 'all' ? '全部天數' : dayLabel(selectedDay) }}
              </th>
              <th v-for="p in table.people" :key="p.id" class="px-1 py-1.5 text-right font-medium">
                {{ p.name }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            <tr v-for="r in table.rows" :key="r.category">
              <td class="px-1 py-1.5">
                <span class="flex items-center gap-1.5 text-ink-800">
                  <span class="h-2.5 w-2.5 shrink-0 rounded-sm" :style="{ background: r.color }" />
                  <CategoryIcon :name="r.category" :size="14" class="text-ink-600" />
                  {{ r.category }}
                </span>
              </td>
              <td v-for="(v, i) in r.values" :key="i" class="px-1 py-1.5 text-right text-ink-900">
                {{ v ? formatMoney(v, currency) : '—' }}
              </td>
            </tr>
            <tr class="font-semibold text-ink-900">
              <td class="px-1 py-1.5">合計</td>
              <td v-for="p in table.people" :key="p.id" class="px-1 py-1.5 text-right">
                {{ formatMoney(p.total, currency) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="flex items-center justify-between">
        <button type="button" class="text-xs text-brand-600" @click="view = view === 'chart' ? 'table' : 'chart'">
          {{ view === 'chart' ? '改看表格 ›' : '改看圖表 ›' }}
        </button>
        <button
          v-if="group.group"
          type="button"
          class="text-xs text-ink-400"
          :disabled="group.loading"
          @click="group.refresh()"
        >
          {{ group.loading ? '更新中…' : '重新整理' }}
        </button>
      </div>
    </template>
  </section>
</template>
