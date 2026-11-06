<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Currency } from '../../db/api'
import { formatMoney } from '../../utils/money'

/**
 * 實心圓餅圖（做法同 quiz_game 的幸運轉盤）：扇形之間用白線分隔，
 * 夠大的扇形直接寫上「分類 + 百分比」；太小的不寫字，看下面的清單。
 * 點一塊會往外凸出、下面顯示金額；清單也可以點。
 */
export interface PieSegment {
  key: string
  label: string
  value: number
  color: string
}

const props = defineProps<{ title: string; segments: PieSegment[]; currency: Currency }>()

const CENTER = 100
const R = 92
/** 扇形佔比低於這個就不在圖上寫字（字會擠出去） */
const LABEL_MIN_SHARE = 0.08

const positive = computed(() =>
  props.segments.filter((s) => s.value > 0).sort((a, b) => b.value - a.value),
)
const total = computed(() => positive.value.reduce((sum, s) => sum + s.value, 0))

function pointOn(angleDeg: number, r: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return [CENTER + r * Math.cos(a), CENTER + r * Math.sin(a)]
}

const slices = computed(() => {
  let start = 0
  return positive.value.map((s) => {
    const share = total.value > 0 ? s.value / total.value : 0
    const sweep = share * 360
    const end = start + sweep
    const mid = start + sweep / 2
    const [x1, y1] = pointOn(start, R)
    const [x2, y2] = pointOn(end, R)
    // 只有一塊時畫不出扇形，直接鋪滿整個圓
    const d =
      positive.value.length === 1
        ? `M ${CENTER} ${CENTER - R} A ${R} ${R} 0 1 1 ${CENTER - 0.01} ${CENTER - R} Z`
        : `M ${CENTER} ${CENTER} L ${x1} ${y1} A ${R} ${R} 0 ${sweep > 180 ? 1 : 0} 1 ${x2} ${y2} Z`
    // 字放在扇形中線、離圓心 62% 半徑處（一塊時放正中間）
    const [lx, ly] = positive.value.length === 1 ? [CENTER, CENTER] : pointOn(mid, R * 0.62)
    // 點選時往外凸出 6
    const [ox, oy] = pointOn(mid, 6)
    start = end
    return {
      ...s,
      share,
      d,
      lx,
      ly,
      pop: `translate(${ox - CENTER} ${oy - CENTER})`,
      showLabel: share >= LABEL_MIN_SHARE,
    }
  })
})

const picked = ref<string | null>(null)
const pickedSlice = computed(() => slices.value.find((s) => s.key === picked.value) ?? null)

function toggle(key: string) {
  picked.value = picked.value === key ? null : key
}

const percent = (share: number) => `${Math.round(share * 100)}%`
</script>

<template>
  <div class="flex flex-col items-center">
    <p class="mb-1 text-sm font-semibold text-ink-900">
      {{ title }}
      <span class="tabular font-normal text-ink-600">{{ formatMoney(total, currency) }}</span>
    </p>

    <svg viewBox="0 0 200 200" class="w-full max-w-[13rem]" role="img" :aria-label="`${title} 各分類花費圓餅圖`">
      <!-- 外圈白邊 -->
      <circle :cx="CENTER" :cy="CENTER" :r="R + 3" fill="#fff" fill-opacity="0.85" />
      <circle v-if="!slices.length" :cx="CENTER" :cy="CENTER" :r="R" fill="#f3ead6" />

      <g
        v-for="s in slices"
        :key="s.key"
        class="cursor-pointer"
        :transform="picked === s.key ? s.pop : undefined"
        :opacity="picked && picked !== s.key ? 0.45 : 1"
        style="transition: opacity 0.15s"
        @click="toggle(s.key)"
      >
        <path :d="s.d" :fill="s.color" stroke="#fff" stroke-width="1.5" stroke-linejoin="round">
          <title>{{ s.label }} {{ formatMoney(s.value, currency) }}（{{ percent(s.share) }}）</title>
        </path>
        <text
          v-if="s.showLabel"
          :x="s.lx"
          :y="s.ly - 6"
          text-anchor="middle"
          font-size="15"
          font-weight="700"
          fill="#fff"
          class="pointer-events-none"
          style="paint-order: stroke; stroke: rgb(0 0 0 / 0.25); stroke-width: 2px"
        >
          {{ s.label }}
        </text>
        <text
          v-if="s.showLabel"
          :x="s.lx"
          :y="s.ly + 11"
          text-anchor="middle"
          font-size="13"
          fill="#fff"
          class="tabular pointer-events-none"
          style="paint-order: stroke; stroke: rgb(0 0 0 / 0.25); stroke-width: 2px"
        >
          {{ percent(s.share) }}
        </text>
      </g>

      <text
        v-if="!slices.length"
        :x="CENTER"
        :y="CENTER + 4"
        text-anchor="middle"
        font-size="12"
        class="fill-ink-400"
      >
        沒有花費
      </text>
    </svg>

    <p class="tabular mt-1 min-h-4 text-center text-xs text-ink-800">
      <template v-if="pickedSlice">
        <b>{{ pickedSlice.label }}</b> {{ formatMoney(pickedSlice.value, currency) }}（{{ percent(pickedSlice.share) }}）
      </template>
    </p>

    <!-- 各分類數字：小扇形沒寫字也看得到 -->
    <ul class="mt-1 w-full space-y-0.5 text-xs">
      <li
        v-for="s in slices"
        :key="s.key"
        class="flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 transition"
        :class="picked === s.key ? 'bg-white/70' : ''"
        @click="toggle(s.key)"
      >
        <span class="h-2.5 w-2.5 shrink-0 rounded-sm" :style="{ background: s.color }" />
        <span class="min-w-0 flex-1 truncate text-ink-800">{{ s.label }}</span>
        <span class="tabular text-ink-900">{{ formatMoney(s.value, currency) }}</span>
        <span class="tabular w-8 text-right text-ink-400">{{ percent(s.share) }}</span>
      </li>
    </ul>
  </div>
</template>
