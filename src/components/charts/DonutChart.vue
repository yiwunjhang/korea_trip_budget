<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Currency } from '../../db/api'
import { formatMoney } from '../../utils/money'

/**
 * 圓餅圖（甜甜圈）：一個人一個，顏色代表分類。
 * 中間顯示名字與合計；點一塊，中間改成那個分類的金額與比例。
 * 下面列出每個分類的金額與百分比，不用點也看得到數字。
 */
export interface DonutSegment {
  key: string
  label: string
  value: number
  color: string
}

const props = defineProps<{ title: string; segments: DonutSegment[]; currency: Currency }>()

const R = 52
const STROKE = 18
const C = 2 * Math.PI * R
/** 每塊之間留 2px 的縫（用米白底色的縫分開，不畫邊框） */
const GAP = 2

const positive = computed(() => props.segments.filter((s) => s.value > 0))
const total = computed(() => positive.value.reduce((sum, s) => sum + s.value, 0))

const arcs = computed(() => {
  let offset = 0
  return positive.value.map((s) => {
    const length = total.value > 0 ? (s.value / total.value) * C : 0
    const visible = positive.value.length > 1 ? Math.max(0, length - GAP) : length
    const arc = {
      ...s,
      share: total.value > 0 ? s.value / total.value : 0,
      dasharray: `${visible} ${C - visible}`,
      dashoffset: -offset,
    }
    offset += length
    return arc
  })
})

const picked = ref<string | null>(null)
const pickedArc = computed(() => arcs.value.find((a) => a.key === picked.value) ?? null)

function toggle(key: string) {
  picked.value = picked.value === key ? null : key
}

const percent = (share: number) => `${Math.round(share * 100)}%`
</script>

<template>
  <div class="flex flex-col items-center">
    <div class="relative h-36 w-36">
      <svg viewBox="0 0 140 140" class="h-full w-full -rotate-90" role="img" :aria-label="`${title} 各分類花費`">
        <!-- 沒資料時畫一圈淡色底 -->
        <circle cx="70" cy="70" :r="R" fill="none" stroke="rgb(255 255 255 / 0.6)" :stroke-width="STROKE" />
        <circle
          v-for="arc in arcs"
          :key="arc.key"
          cx="70"
          cy="70"
          :r="R"
          fill="none"
          :stroke="arc.color"
          :stroke-width="picked === arc.key ? STROKE + 4 : STROKE"
          :stroke-dasharray="arc.dasharray"
          :stroke-dashoffset="arc.dashoffset"
          class="cursor-pointer transition-all"
          :opacity="picked && picked !== arc.key ? 0.35 : 1"
          @click="toggle(arc.key)"
        >
          <title>{{ arc.label }} {{ formatMoney(arc.value, currency) }}（{{ percent(arc.share) }}）</title>
        </circle>
      </svg>

      <!-- 中間的字 -->
      <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
        <template v-if="pickedArc">
          <span class="text-[11px] text-ink-600">{{ pickedArc.label }}</span>
          <span class="tabular text-sm leading-tight font-bold text-ink-900">{{ formatMoney(pickedArc.value, currency) }}</span>
          <span class="tabular text-[11px] text-ink-600">{{ percent(pickedArc.share) }}</span>
        </template>
        <template v-else>
          <span class="w-full truncate text-[11px] text-ink-600">{{ title }}</span>
          <span class="tabular text-sm leading-tight font-bold text-ink-900">{{ formatMoney(total, currency) }}</span>
        </template>
      </div>
    </div>

    <!-- 各分類數字 -->
    <ul class="mt-2 w-full space-y-0.5 text-xs">
      <li v-if="!arcs.length" class="text-center text-ink-400">這段期間沒有花費</li>
      <li
        v-for="arc in arcs"
        :key="arc.key"
        class="flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 transition"
        :class="picked === arc.key ? 'bg-white/70' : ''"
        @click="toggle(arc.key)"
      >
        <span class="h-2.5 w-2.5 shrink-0 rounded-sm" :style="{ background: arc.color }" />
        <span class="min-w-0 flex-1 truncate text-ink-800">{{ arc.label }}</span>
        <span class="tabular text-ink-900">{{ formatMoney(arc.value, currency) }}</span>
        <span class="tabular w-8 text-right text-ink-400">{{ percent(arc.share) }}</span>
      </li>
    </ul>
  </div>
</template>
