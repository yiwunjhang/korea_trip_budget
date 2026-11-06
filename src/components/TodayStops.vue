<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, MapPin } from 'lucide-vue-next'
import type { ItineraryStop } from '../db/api'
import { seoulToday, useItineraryStore } from '../stores/itinerary'
import { dateParts, guessCategory, shortStopTitle } from '../utils/itinerary'

/**
 * 記帳畫面上方的「今天的行程」：一排可以左右滑的站點，
 * 點一站就把品項（和猜到的分類）帶進下面的記帳表單，不用切到行程頁。
 */
const itinerary = useItineraryStore()
const router = useRouter()

const day = computed(() => itinerary.upcomingDay)
const index = computed(() => itinerary.days.findIndex((d) => d.id === day.value?.id))

const whenLabel = computed(() => {
  const date = day.value?.date
  if (!date) return ''
  const today = seoulToday()
  if (date === today) return '今天'
  const diff = Math.round((Date.parse(date) - Date.parse(today)) / 86400000)
  if (diff === 1) return '明天'
  return `${dateParts(date).md}（${dateParts(date).weekday}）`
})

/** 只列有編號的站；整天都沒編號就全部列 */
const stops = computed(() => {
  const list = day.value?.stops ?? []
  const numbered = list.filter((s) => s.num !== null)
  return numbered.length ? numbered : list
})

function pick(stop: ItineraryStop) {
  const query: Record<string, string> = { title: shortStopTitle(stop.title) }
  const category = guessCategory(stop)
  if (category) query.category = category
  // 顯示的是明天或之後的行程時，記帳時間也帶入那一天
  if (day.value?.date) query.date = day.value.date
  router.replace({ name: 'home', query })
}
</script>

<template>
  <section v-if="day" class="glass space-y-2 px-3 py-2.5">
    <router-link
      :to="{ name: 'itinerary', query: day.date ? { day: day.date } : {} }"
      class="flex items-center justify-between text-xs"
    >
      <span class="flex items-center gap-1.5 text-ink-600">
        <MapPin :size="14" class="text-brand-500" />
        <b class="text-ink-900">{{ whenLabel }}</b>
        Day {{ day.dayNo ?? index + 1 }}・{{ day.place }}
      </span>
      <span class="flex items-center text-brand-600">看行程 <ChevronRight :size="14" /></span>
    </router-link>

    <div v-if="stops.length" class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
      <button
        v-for="(stop, i) in stops"
        :key="i"
        type="button"
        class="chip shrink-0 py-1 text-xs"
        :title="`記一筆：${stop.title}`"
        @click="pick(stop)"
      >
        <span v-if="stop.num !== null" class="font-bold text-brand-600">{{ stop.num }}</span>
        {{ shortStopTitle(stop.title) }}
      </button>
    </div>
    <p class="text-[11px] text-ink-400">點一站，下面的品項就會自動填好</p>
  </section>
</template>
