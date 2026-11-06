<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Currency, GroupSpendingRow } from '../db/api'
import { useGroupStore } from '../stores/group'
import { useItineraryStore } from '../stores/itinerary'
import { useLedgerStore } from '../stores/ledger'
import { useSessionStore } from '../stores/session'
import {
  DAILY_CATEGORIES,
  FIXED_CATEGORIES,
  isDailyCategory,
  NON_DAILY_CATEGORIES,
  normalizeCategory,
} from '../utils/categories'
import { Check } from 'lucide-vue-next'
import { formatMoney } from '../utils/money'
import CategoryIcon from './CategoryIcon.vue'
import PieChart from './charts/PieChart.vue'
import GroupedBarChart from './charts/GroupedBarChart.vue'

/**
 * 旅伴花費長條圖：依分類分組，每組裡每人一條（顏色代表成員），
 * 分類由花最多排到最少，全部共用同一個比例尺。
 * 可選全部天數或某一天、勾選要看的成員，也可以切成表格。
 * 機票、住宿不進長條，另外列。沒加入群組時只畫自己的。
 */
const group = useGroupStore()
const ledger = useLedgerStore()
const session = useSessionStore()

const currency = ref<Currency>('KRW')
/** 呈現方式：圓餅圖（每人一個）／長條圖（依分類）／表格 */
type ViewMode = 'pie' | 'bar' | 'table'
const view = ref<ViewMode>('pie')
const viewModes: { value: ViewMode; label: string }[] = [
  { value: 'pie', label: '圓餅圖' },
  { value: 'bar', label: '長條圖' },
  { value: 'table', label: '表格' },
]

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

/** 所有成員：自己排第一，其他照加入順序 */
const allPeople = computed(() => {
  if (!group.group) return [{ id: session.userId ?? 'me', name: '我' }]
  const list = group.members.map((m) => ({
    id: m.user_id,
    name: m.user_id === session.userId ? `${m.display_name}（我）` : m.display_name,
  }))
  return list.sort((a, b) => Number(b.id === session.userId) - Number(a.id === session.userId))
})

/** 勾選要看的成員；空集合 = 全部人 */
const selectedIds = ref<Set<string>>(new Set())
const showAll = computed(() => selectedIds.value.size === 0)

function toggleMember(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  // 全部勾滿就等於「全部」
  selectedIds.value = next.size === allPeople.value.length ? new Set() : next
}

/** 成員離開群組後，把不存在的勾選清掉 */
watch(allPeople, (list) => {
  const ids = new Set(list.map((p) => p.id))
  const kept = [...selectedIds.value].filter((id) => ids.has(id))
  if (kept.length !== selectedIds.value.size) selectedIds.value = new Set(kept)
})

/** 目前要畫的成員 */
const people = computed(() =>
  showAll.value ? allPeople.value : allPeople.value.filter((p) => selectedIds.value.has(p.id)),
)

/** 只留勾選成員的資料（天數清單也跟著變） */
const visibleRows = computed(() => {
  const ids = new Set(people.value.map((p) => p.id))
  return rows.value.filter((r) => ids.has(r.member_id))
})

/** 每日統計排除機票、住宿：常在出發前一次付清，算進某一天會失真 */
const dailyRows = computed(() => visibleRows.value.filter((r) => isDailyCategory(r.category)))

/** 機票、住宿另外列：每個人各花多少（不進每日長條） */
const nonDaily = computed(() =>
  people.value
    .map((p) => {
      const items = NON_DAILY_CATEGORIES.map((category) => ({
        category,
        value: rows.value
          .filter((r) => r.member_id === p.id && r.category === category)
          .reduce((s, r) => s + amountOf(r), 0),
      }))
      return { id: p.id, name: p.name, items, total: items.reduce((s, i) => s + i.value, 0) }
    })
    .filter((p) => p.total !== 0),
)

const days = computed(() => [...new Set(dailyRows.value.map((r) => r.day))].sort())

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

const amountOf = (r: GroupSpendingRow) => (currency.value === 'KRW' ? r.krw : r.twd)

/**
 * 成員顏色：依「全部成員」的順序固定配色（色盲安全的類別色），
 * 篩選掉某人時，其他人的顏色不會跟著換。
 */
const PERSON_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']
function colorOf(personId: string): string {
  const index = allPeople.value.findIndex((p) => p.id === personId)
  return PERSON_COLORS[Math.max(0, index) % PERSON_COLORS.length]
}

/**
 * 要不要把機票、住宿也算進圖表。
 * 使用者沒選過時自動決定：還沒有旅途中的花費（例如出發前只記了機票住宿）就先算進去，
 * 不然圖表會一片空白；開始記旅途花費後預設只看旅途中的。
 */
const includeChoice = ref<boolean | null>(null)
const hasNonDaily = computed(() => visibleRows.value.some((r) => !isDailyCategory(r.category)))
const includeNonDaily = computed(() => includeChoice.value ?? (days.value.length === 0 && hasNonDaily.value))
const chartCategories = computed(() => (includeNonDaily.value ? FIXED_CATEGORIES : DAILY_CATEGORIES))

/** 目前範圍（全部天數或某一天）的資料 */
const scopeRows = computed(() =>
  (includeNonDaily.value ? visibleRows.value : dailyRows.value).filter(
    (r) => selectedDay.value === 'all' || r.day === selectedDay.value,
  ),
)

/** 每位成員在這個範圍的合計（兼圖例） */
const personTotals = computed(() =>
  people.value.map((p) => ({
    id: p.id,
    name: p.name,
    color: colorOf(p.id),
    total: scopeRows.value.filter((r) => r.member_id === p.id).reduce((s, r) => s + amountOf(r), 0),
  })),
)

/** 依分類：每個分類一組，組內每人一條；分類由花最多排到最少 */
const categoryRows = computed(() =>
  chartCategories.value.map((c) => {
    const values = people.value.map((p) => ({
      id: p.id,
      name: p.name,
      color: colorOf(p.id),
      value: scopeRows.value
        .filter((r) => r.member_id === p.id && r.category === c.name)
        .reduce((s, r) => s + amountOf(r), 0),
    }))
    return { category: c.name, values, total: values.reduce((s, v) => s + v.value, 0) }
  })
    .filter((row) => row.values.some((v) => v.value !== 0))
    .sort((a, b) => b.total - a.total),
)

/** 圓餅圖：每人一個實心圓餅，顏色代表分類（固定色，不會因篩選換色） */
const pies = computed(() =>
  people.value.map((p) => ({
    id: p.id,
    name: p.name.replace('（我）', ''),
    segments: chartCategories.value.map((c) => ({
      key: c.name,
      label: c.name,
      color: c.color,
      value: scopeRows.value
        .filter((r) => r.member_id === p.id && r.category === c.name)
        .reduce((s, r) => s + amountOf(r), 0),
    })).sort((a, b) => b.value - a.value),
  })),
)

/** 長條圖：每個分類一組、每人一條（顏色代表成員） */
const barGroups = computed(() =>
  categoryRows.value.map((row) => ({
    label: row.category,
    values: row.values.map((v) => ({ ...v, name: v.name.replace('（我）', '') })),
  })),
)

const itinerary = useItineraryStore()

/** 天數按鈕：有 Notion 行程就顯示「Day 2 明洞」，沒有就「第 N 天 11/8」 */
function dayChipLabel(day: string, index: number): string {
  const trip = itinerary.dayByDate(day)
  if (trip) return `Day ${trip.dayNo ?? index + 1} ${trip.place}`
  return `第${index + 1}天 ${dayLabel(day).split('（')[0]}`
}

/** 範圍說明：「Day 2 明洞・11/8（日）」 */
function scopeLabel(day: string): string {
  const trip = itinerary.dayByDate(day)
  return trip ? `Day ${trip.dayNo ?? ''} ${trip.place}・${dayLabel(day)}` : dayLabel(day)
}

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

    <!-- 讀取旅伴資料失敗（最常見：Supabase 還沒重跑最新的 schema.sql） -->
    <div v-if="group.error" class="rounded-xl border border-flame-100 bg-flame-50/80 px-3 py-2 text-xs text-flame-600">
      讀取大家的花費失敗：{{ group.error }}<br />
      <span class="text-ink-600">請到 Supabase → SQL Editor 重新執行一次 supabase/schema.sql，再按「重新整理」。</span>
      <button
        type="button"
        class="mt-1.5 block font-medium text-brand-600"
        :disabled="group.loading"
        @click="group.refresh()"
      >
        {{ group.loading ? '更新中…' : '重新整理 ›' }}
      </button>
    </div>

    <!-- 篩選：看哪些成員（可複選） -->
    <div v-if="allPeople.length > 1" class="flex flex-wrap items-center gap-1.5">
      <span class="text-xs text-ink-400">看誰</span>
      <button
        type="button"
        class="chip text-xs"
        :class="{ 'chip-on': showAll }"
        :aria-pressed="showAll"
        @click="selectedIds = new Set()"
      >
        全部人
      </button>
      <button
        v-for="p in allPeople"
        :key="p.id"
        type="button"
        class="chip text-xs"
        :class="{ 'chip-on': !showAll && selectedIds.has(p.id) }"
        :aria-pressed="!showAll && selectedIds.has(p.id)"
        @click="toggleMember(p.id)"
      >
        <Check v-if="!showAll && selectedIds.has(p.id)" :size="12" :stroke-width="2.5" />
        {{ p.name }}
      </button>
    </div>

    <p v-if="!rows.length && !group.error" class="py-6 text-center text-sm text-ink-400">還沒有花費紀錄</p>
    <template v-else-if="!rows.length" />
    <p v-else-if="!visibleRows.length" class="py-6 text-center text-sm text-ink-400">
      勾選的成員還沒有花費紀錄
    </p>

    <template v-else>
      <!-- 機票、住宿：另外列，不算進每天 -->
      <div v-if="nonDaily.length && !includeNonDaily" class="rounded-xl border border-white/80 bg-white/50 px-3 py-2.5">
        <p class="text-xs font-medium text-ink-800">
          機票・住宿 <span class="font-normal text-ink-400">（不算進每日花費）</span>
        </p>
        <table class="tabular mt-1.5 w-full text-xs">
          <thead>
            <tr class="text-ink-400">
              <th class="py-0.5 text-left font-normal"></th>
              <th v-for="c in NON_DAILY_CATEGORIES" :key="c" class="py-0.5 text-right font-normal">
                <span class="inline-flex items-center gap-1">
                  <CategoryIcon :name="c" :size="13" /> {{ c }}
                </span>
              </th>
              <th class="py-0.5 text-right font-normal">合計</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in nonDaily" :key="p.id">
              <td class="py-0.5 text-ink-600">{{ p.name }}</td>
              <td v-for="i in p.items" :key="i.category" class="py-0.5 text-right text-ink-800">
                {{ i.value ? formatMoney(i.value, currency) : '—' }}
              </td>
              <td class="py-0.5 text-right font-semibold text-ink-900">{{ formatMoney(p.total, currency) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 篩選：天數（只有旅途中有花費才有天數可選） -->
      <div v-if="days.length" class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
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
          {{ dayChipLabel(d, i) }}
        </button>
      </div>

      <!-- 呈現方式 -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex rounded-full bg-white/60 p-0.5 text-xs" role="tablist" aria-label="呈現方式">
          <button
            v-for="m in viewModes"
            :key="m.value"
            type="button"
            role="tab"
            class="rounded-full px-3 py-1 transition"
            :class="view === m.value ? 'bg-brand-400 font-semibold text-ink-900 shadow-sm' : 'text-ink-600'"
            :aria-selected="view === m.value"
            @click="view = m.value"
          >
            {{ m.label }}
          </button>
        </div>
        <button
          v-if="hasNonDaily"
          type="button"
          class="chip shrink-0 py-1 text-[11px]"
          :class="{ 'chip-on': includeNonDaily }"
          :aria-pressed="includeNonDaily"
          @click="includeChoice = !includeNonDaily"
        >
          <Check v-if="includeNonDaily" :size="11" :stroke-width="2.5" />
          含機票住宿
        </button>
      </div>
      <p class="-mt-2 text-[11px] text-ink-400">
        {{ selectedDay === 'all' ? '全部天數' : scopeLabel(selectedDay) }}・{{ includeNonDaily ? '含機票、住宿' : '只算旅途中的花費（不含機票、住宿）' }}
      </p>

      <p v-if="!scopeRows.length" class="py-6 text-center text-sm text-ink-400">
        還沒有旅途中的花費<template v-if="hasNonDaily">，可以打開「含機票住宿」看總花費</template>
      </p>

      <template v-else>

      <!-- 圖例：長條圖、表格的顏色代表成員 -->
      <ul v-if="view !== 'pie'" class="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
        <li v-for="p in personTotals" :key="p.id" class="flex items-center gap-1.5">
          <span class="h-2.5 w-2.5 rounded-sm" :style="{ background: p.color }" />
          <span class="text-ink-600">{{ p.name }}</span>
          <b class="tabular text-ink-900">{{ formatMoney(p.total, currency) }}</b>
        </li>
      </ul>

      <!-- 圓餅圖：每人一個 -->
      <div
        v-if="view === 'pie'"
        class="grid gap-x-4 gap-y-5"
        :class="pies.length > 1 ? 'grid-cols-2' : 'mx-auto max-w-[15rem] grid-cols-1'"
      >
        <PieChart v-for="p in pies" :key="p.id" :title="p.name" :segments="p.segments" :currency="currency" />
      </div>

      <!-- 長條圖：依分類，每人一條 -->
      <GroupedBarChart v-else-if="view === 'bar'" :groups="barGroups" :currency="currency" />

      <!-- 表格 -->
      <div v-else class="-mx-1 overflow-x-auto">
        <table class="tabular w-full text-xs">
          <thead>
            <tr class="text-ink-600">
              <th class="px-1 py-1.5 text-left font-medium">
                {{ selectedDay === 'all' ? '全部天數' : scopeLabel(selectedDay) }}
              </th>
              <th v-for="p in personTotals" :key="p.id" class="px-1 py-1.5 text-right font-medium">
                <span class="inline-flex items-center gap-1">
                  <span class="h-2 w-2 rounded-sm" :style="{ background: p.color }" />
                  {{ p.name }}
                </span>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            <tr v-for="r in categoryRows" :key="r.category">
              <td class="px-1 py-1.5">
                <span class="flex items-center gap-1.5 text-ink-800">
                  <CategoryIcon :name="r.category" :size="14" class="text-ink-600" />
                  {{ r.category }}
                </span>
              </td>
              <td v-for="v in r.values" :key="v.id" class="px-1 py-1.5 text-right text-ink-900">
                {{ v.value ? formatMoney(v.value, currency) : '—' }}
              </td>
            </tr>
            <tr class="font-semibold text-ink-900">
              <td class="px-1 py-1.5">合計</td>
              <td v-for="p in personTotals" :key="p.id" class="px-1 py-1.5 text-right">
                {{ formatMoney(p.total, currency) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      </template>

      <div class="flex items-center justify-between">
        <span />
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
