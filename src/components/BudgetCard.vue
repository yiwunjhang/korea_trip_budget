<script setup lang="ts">
import { computed } from 'vue'
import type { Currency } from '../db/api'
import { formatMoney } from '../utils/money'

const props = defineProps<{
  label: string
  currency: Currency
  budget: number
  spent: number
  remaining: number
}>()

/** 已用掉的比例；沒設預算就不畫進度條 */
const percent = computed(() => {
  if (props.budget <= 0) return 0
  return Math.min(100, Math.max(0, (props.spent / props.budget) * 100))
})

const overspent = computed(() => props.remaining < 0)
</script>

<template>
  <div class="card">
    <div class="flex items-baseline justify-between">
      <span class="text-xs font-medium text-ink-600">{{ label }}</span>
      <span class="text-xs text-ink-400">
        {{ currency === 'KRW' ? '韓元' : '台幣' }}
      </span>
    </div>

    <p
      class="tabular mt-1 text-2xl font-bold"
      :class="overspent ? 'text-flame-600' : 'text-ink-900'"
    >
      {{ formatMoney(remaining, currency) }}
    </p>
    <p class="mt-0.5 text-xs text-ink-400">
      {{ overspent ? '已超支' : '剩餘' }}
    </p>

    <div v-if="budget > 0" class="mt-3">
      <div class="h-1.5 overflow-hidden rounded-full bg-brand-50">
        <div
          class="h-full rounded-full transition-all"
          :class="overspent ? 'bg-flame-500' : 'bg-brand-500'"
          :style="{ width: `${percent}%` }"
        />
      </div>
      <p class="tabular mt-2 text-xs text-ink-600">
        已花 {{ formatMoney(spent, currency) }} / 預算 {{ formatMoney(budget, currency) }}
      </p>
    </div>
    <p v-else class="tabular mt-3 text-xs text-ink-600">
      已花 {{ formatMoney(spent, currency) }}（未設預算）
    </p>
  </div>
</template>
