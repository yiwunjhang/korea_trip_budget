<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Currency } from '../../db/api'
import { formatMoney } from '../../utils/money'

/**
 * 直立長條圖：下面是分類，每個分類一組，組裡每人一條（顏色代表成員）。
 * 長條頂端直接標金額（縮寫，例如 12萬），點長條看完整金額。
 * 用 SVG 畫，viewBox 固定、寬度跟著畫面縮放。
 */
export interface BarGroup {
  label: string
  values: { id: string; name: string; color: string; value: number }[]
}

const props = defineProps<{ groups: BarGroup[]; currency: Currency }>()

const W = 340
const H = 210
const PAD = { top: 18, right: 4, bottom: 30, left: 38 }
const plotW = W - PAD.left - PAD.right
const plotH = H - PAD.top - PAD.bottom

/** 刻度取整數好讀的值：1、2、5 × 10 的次方 */
function niceMax(value: number): number {
  if (value <= 0) return 1
  const exp = 10 ** Math.floor(Math.log10(value))
  const n = value / exp
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * exp
}

const max = computed(() =>
  niceMax(Math.max(0, ...props.groups.flatMap((g) => g.values.map((v) => v.value)))),
)
const ticks = computed(() => [0, max.value / 2, max.value])
const y = (value: number) => PAD.top + plotH - (Math.max(0, value) / max.value) * plotH

/** 縮寫金額：韓元用「萬」，台幣超過一萬也用「萬」 */
function compact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 10000) {
    const wan = value / 10000
    return `${wan >= 100 ? Math.round(wan) : Number(wan.toFixed(1))}萬`
  }
  return Math.round(value).toLocaleString('zh-TW')
}

const layout = computed(() => {
  const n = Math.max(1, props.groups.length)
  const groupW = plotW / n
  const people = Math.max(1, props.groups[0]?.values.length ?? 1)
  const barW = Math.min(22, (groupW * 0.72 - (people - 1) * 2) / people)
  const clusterW = barW * people + (people - 1) * 2
  return props.groups.map((g, gi) => {
    const x0 = PAD.left + gi * groupW + (groupW - clusterW) / 2
    return {
      label: g.label,
      cx: PAD.left + gi * groupW + groupW / 2,
      bars: g.values.map((v, vi) => {
        const x = x0 + vi * (barW + 2)
        const top = y(v.value)
        const height = PAD.top + plotH - top
        // 只有上方兩角圓角，底部貼齊基準線
        const r = Math.min(4, barW / 2, height)
        const path =
          height > 0
            ? `M${x},${PAD.top + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${PAD.top + plotH} Z`
            : ''
        return { ...v, x, w: barW, top, path, key: `${gi}-${v.id}` }
      }),
    }
  })
})

/** 太擠時（很多條）就不標每條金額，改成點了才看 */
const showLabels = computed(() => (layout.value[0]?.bars[0]?.w ?? 0) >= 14)

const picked = ref<string | null>(null)
const pickedInfo = computed(() => {
  for (const g of layout.value) {
    const bar = g.bars.find((b) => b.key === picked.value)
    if (bar) return `${bar.name}・${g.label} ${formatMoney(bar.value, props.currency)}`
  }
  return ''
})
</script>

<template>
  <div>
    <svg :viewBox="`0 0 ${W} ${H}`" class="w-full" role="img" aria-label="各分類每人花費長條圖">
      <!-- 刻度線 -->
      <g v-for="t in ticks" :key="t">
        <line
          :x1="PAD.left"
          :x2="W - PAD.right"
          :y1="y(t)"
          :y2="y(t)"
          :stroke="t === 0 ? 'rgb(111 92 62 / 0.45)' : 'rgb(111 92 62 / 0.15)'"
          :stroke-dasharray="t === 0 ? '' : '3 3'"
        />
        <text :x="PAD.left - 5" :y="y(t) + 3.5" text-anchor="end" class="tabular fill-ink-400" font-size="10">
          {{ compact(t) }}
        </text>
      </g>

      <!-- 長條 -->
      <g v-for="g in layout" :key="g.label">
        <g v-for="bar in g.bars" :key="bar.key" class="cursor-pointer" @click="picked = picked === bar.key ? null : bar.key">
          <!-- 加大點擊範圍 -->
          <rect :x="bar.x - 1" :y="PAD.top" :width="bar.w + 2" :height="plotH" fill="transparent" />
          <path
            v-if="bar.path"
            :d="bar.path"
            :fill="bar.color"
            :opacity="picked && picked !== bar.key ? 0.35 : 1"
            class="transition-opacity"
          >
            <title>{{ bar.name }}・{{ g.label }} {{ formatMoney(bar.value, currency) }}</title>
          </path>
          <text
            v-if="showLabels && bar.value > 0"
            :x="bar.x + bar.w / 2"
            :y="bar.top - 4"
            text-anchor="middle"
            font-size="9"
            class="tabular fill-ink-800"
          >
            {{ compact(bar.value) }}
          </text>
        </g>
        <text :x="g.cx" :y="H - PAD.bottom + 16" text-anchor="middle" font-size="11" class="fill-ink-800">
          {{ g.label }}
        </text>
      </g>
    </svg>

    <p class="tabular min-h-4 text-center text-xs text-ink-600">
      <template v-if="pickedInfo">{{ pickedInfo }}</template>
      <span v-else class="text-ink-400">點長條看完整金額</span>
    </p>
  </div>
</template>
