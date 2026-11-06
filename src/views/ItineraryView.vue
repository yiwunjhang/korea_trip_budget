<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MapPin,
  PenLine,
  RefreshCw,
  Settings,
} from 'lucide-vue-next'
import type { ItineraryDay, ItineraryStop } from '../db/api'
import { seoulToday, useItineraryStore } from '../stores/itinerary'
import { useLedgerStore } from '../stores/ledger'
import { isDailyCategory } from '../utils/categories'
import { dateParts, dayLabel, guessCategory, shortStopTitle } from '../utils/itinerary'
import { formatMoney } from '../utils/money'
import ImageStrip from '../components/ImageStrip.vue'

/**
 * 行程頁：上方一排天數（Day N／日期／地點，今天有標記），
 * 內容可以左右滑換天，底部也有「前一天／後一天」。
 * 每一站都能開地圖、直接「記一筆」（跳回記帳並帶入品項）。
 */
const itinerary = useItineraryStore()
const ledger = useLedgerStore()
const route = useRoute()
const router = useRouter()

onMounted(() => itinerary.load())

const days = computed(() => itinerary.days)
const today = seoulToday()

/** 目前看的那天：網址 ?day=2026-11-08 優先，否則今天／下一天 */
const selectedId = ref<string | null>(null)
watch(
  [days, () => route.query.day],
  () => {
    const fromQuery = typeof route.query.day === 'string' ? itinerary.dayByDate(route.query.day) : undefined
    if (fromQuery) selectedId.value = fromQuery.id
    else if (!days.value.some((d) => d.id === selectedId.value)) selectedId.value = itinerary.defaultDay?.id ?? null
  },
  { immediate: true },
)

const index = computed(() => days.value.findIndex((d) => d.id === selectedId.value))
const day = computed<ItineraryDay | undefined>(() => days.value[index.value])
const prevDay = computed(() => (index.value > 0 ? days.value[index.value - 1] : undefined))
const nextDay = computed(() => (index.value >= 0 ? days.value[index.value + 1] : undefined))

/** 換天：網址跟著變，重新整理或分享都會停在同一天 */
function select(d: ItineraryDay | undefined) {
  if (!d) return
  selectedId.value = d.id
  router.replace({ query: d.date ? { day: d.date } : {} })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** 選中的天數按鈕捲到中間 */
const pillRefs = ref<Record<string, HTMLElement | null>>({})
watch(
  selectedId,
  async (id) => {
    await nextTick()
    if (id) pillRefs.value[id]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  },
  { immediate: true },
)

/* ---------- 左右滑換天 ---------- */
let touchX = 0
let touchY = 0
function onTouchStart(e: TouchEvent) {
  touchX = e.touches[0].clientX
  touchY = e.touches[0].clientY
}
function onTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0].clientX - touchX
  const dy = e.changedTouches[0].clientY - touchY
  if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return
  select(dx < 0 ? nextDay.value : prevDay.value)
}

/* ---------- 這天花了多少（自己的帳，不含機票、住宿） ---------- */
const daySpending = computed(() => {
  const date = day.value?.date
  if (!date) return null
  const list = ledger.transactions.filter(
    (tx) =>
      tx.kind !== 'topup' &&
      isDailyCategory(tx.category) &&
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(tx.spent_at)) === date,
  )
  const krw = list.reduce((s, tx) => s + (tx.kind === 'refund' ? -1 : 1) * tx.amount_krw, 0)
  return { krw, count: list.length }
})

/* ---------- 每站說明預設收合，太長的可以展開 ---------- */
const expanded = ref<Set<string>>(new Set())
const stopKey = (i: number) => `${selectedId.value}-${i}`
function toggle(i: number) {
  const next = new Set(expanded.value)
  const key = stopKey(i)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expanded.value = next
}

/** 記一筆：回記帳頁，帶入品項與猜到的分類 */
function record(stop: ItineraryStop) {
  const query: Record<string, string> = { title: shortStopTitle(stop.title) }
  const category = guessCategory(stop)
  if (category) query.category = category
  router.push({ name: 'home', query })
}

const updatedAt = computed(() => {
  const at = itinerary.data?.fetchedAt
  if (!at) return ''
  return new Date(at).toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
})
</script>

<template>
  <div class="space-y-4">
    <!-- 還沒設定 Notion 連結 -->
    <section v-if="!itinerary.url" class="card space-y-3 text-center">
      <MapPin :size="28" class="mx-auto text-brand-500" />
      <p class="text-sm font-semibold text-ink-900">還沒連結 Notion 行程</p>
      <p class="text-xs leading-relaxed text-ink-600">
        在 Notion 把行程資料庫「發佈到網路」，複製 notion.site 連結，貼到設定頁就能在這裡看行程。
      </p>
      <router-link :to="{ name: 'settings' }" class="btn-primary w-full">
        <Settings :size="16" /> 去設定
      </router-link>
    </section>

    <template v-else>
      <!-- 讀取失敗（有快取時仍會顯示舊的行程） -->
      <div
        v-if="itinerary.error"
        class="rounded-xl border border-flame-100 bg-flame-50/80 px-3 py-2 text-xs text-flame-600"
      >
        行程更新失敗：{{ itinerary.error }}
        <template v-if="days.length">（先顯示上次存的版本）</template>
        <button type="button" class="ml-1 font-medium text-brand-600" @click="itinerary.load(true)">再試一次</button>
      </div>

      <p v-if="!days.length && itinerary.loading" class="card text-center text-sm text-ink-400">讀取行程中…</p>
      <p v-else-if="!days.length && !itinerary.error" class="card text-center text-sm text-ink-400">
        這個 Notion 資料庫裡還沒有行程
      </p>

      <template v-if="days.length">
        <!-- 天數切換：固定在上方，今天有標記 -->
        <nav
          class="glass sticky top-[3.75rem] z-10 -mx-1 flex gap-1.5 overflow-x-auto p-1.5"
          aria-label="選擇天數"
        >
          <button
            v-for="(d, i) in days"
            :key="d.id"
            :ref="(el) => (pillRefs[d.id] = el as HTMLElement | null)"
            type="button"
            class="relative flex w-[4.75rem] shrink-0 flex-col items-center rounded-xl px-1 py-1.5 transition"
            :class="
              d.id === selectedId
                ? 'bg-linear-to-br from-brand-400 to-brand-500 text-ink-900 shadow-sm'
                : 'text-ink-600 hover:bg-white/50'
            "
            :aria-current="d.id === selectedId ? 'date' : undefined"
            @click="select(d)"
          >
            <span
              v-if="d.date === today"
              class="absolute -top-1 right-0.5 rounded-full bg-flame-500 px-1.5 text-[10px] leading-4 font-semibold text-white"
            >
              今天
            </span>
            <span class="text-sm font-bold">{{ dayLabel(d, i) }}</span>
            <span class="tabular text-[11px]">{{ dateParts(d.date).md }}（{{ dateParts(d.date).weekday }}）</span>
            <span class="w-full truncate text-center text-[11px]" :class="d.id === selectedId ? 'font-medium' : 'text-ink-400'">
              {{ d.place }}
            </span>
          </button>
        </nav>

        <!-- 這一天（可左右滑換天） -->
        <div v-if="day" class="space-y-3" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
          <!-- 標題 -->
          <section class="card">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-xs font-medium text-brand-600">
                  {{ dayLabel(day, index) }}・{{ dateParts(day.date).md }}（{{ dateParts(day.date).weekday }}）
                  <span v-if="day.date === today" class="ml-1 rounded-full bg-flame-500 px-1.5 text-[10px] text-white">今天</span>
                </p>
                <h2 class="mt-0.5 text-2xl font-bold text-ink-900">{{ day.place }}</h2>
              </div>
              <a
                :href="day.notionUrl"
                target="_blank"
                rel="noopener"
                class="flex shrink-0 items-center gap-1 text-xs text-ink-400"
              >
                Notion <ExternalLink :size="12" />
              </a>
            </div>
            <p v-if="daySpending" class="tabular mt-2 text-xs text-ink-600">
              這天花了
              <b class="text-sm text-ink-900">{{ formatMoney(daySpending.krw, 'KRW') }}</b>
              （{{ daySpending.count }} 筆，不含機票、住宿）
            </p>
          </section>

          <!-- 當天備註（例如航班表） -->
          <section
            v-if="day.notes.length || day.noteLinks.length || day.noteImages?.length"
            class="card space-y-1 text-xs text-ink-600"
          >
            <p v-for="(line, i) in day.notes" :key="i">{{ line }}</p>
            <div v-if="day.noteLinks.length" class="flex flex-wrap gap-1.5 pt-1">
              <a
                v-for="l in day.noteLinks"
                :key="l.url"
                :href="l.url"
                target="_blank"
                rel="noopener"
                class="chip text-xs"
              >
                {{ l.label }} <ExternalLink :size="11" />
              </a>
            </div>
            <ImageStrip v-if="day.noteImages?.length" :images="day.noteImages" :alt="day.place" class="pt-1.5" />
          </section>

          <!-- 各站：時間軸 -->
          <ol v-if="day.stops.length" class="relative space-y-3 pl-9">
            <span class="absolute top-3 bottom-3 left-[0.9rem] w-0.5 rounded bg-brand-200/70" aria-hidden="true" />
            <li v-for="(stop, i) in day.stops" :key="i" class="relative">
              <span
                class="absolute top-3 -left-9 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shadow-sm"
                :class="stop.num !== null ? 'bg-brand-400 text-ink-900' : 'border border-white/80 bg-white/80 text-ink-400'"
                aria-hidden="true"
              >
                {{ stop.num ?? '・' }}
              </span>

              <div class="card space-y-2 py-3">
                <p class="text-sm leading-snug font-semibold text-ink-900">{{ stop.title }}</p>

                <ImageStrip v-if="stop.images?.length" :images="stop.images" :alt="stop.title" />

                <div v-if="stop.lines.length" class="space-y-0.5 text-xs leading-relaxed text-ink-600">
                  <p v-for="(line, j) in expanded.has(stopKey(i)) ? stop.lines : stop.lines.slice(0, 3)" :key="j">
                    {{ line }}
                  </p>
                  <button
                    v-if="stop.lines.length > 3"
                    type="button"
                    class="font-medium text-brand-600"
                    @click="toggle(i)"
                  >
                    {{ expanded.has(stopKey(i)) ? '收起' : `展開（還有 ${stop.lines.length - 3} 行）` }}
                  </button>
                </div>

                <div class="flex flex-wrap gap-1.5 pt-0.5">
                  <a
                    v-if="stop.mapUrl"
                    :href="stop.mapUrl"
                    target="_blank"
                    rel="noopener"
                    class="chip border-white/80 text-xs"
                  >
                    <MapPin :size="13" class="text-mint-600" /> 地圖
                  </a>
                  <button type="button" class="chip chip-on text-xs" @click="record(stop)">
                    <PenLine :size="13" /> 記一筆
                  </button>
                  <a
                    v-for="l in stop.links"
                    :key="l.url"
                    :href="l.url"
                    target="_blank"
                    rel="noopener"
                    class="chip text-xs"
                  >
                    {{ l.label }} <ExternalLink :size="11" />
                  </a>
                </div>
              </div>
            </li>
          </ol>
          <p v-else class="card text-center text-sm text-ink-400">這天還沒排行程</p>

          <!-- 前一天／後一天 -->
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="btn-ghost justify-start"
              :disabled="!prevDay"
              @click="select(prevDay)"
            >
              <ChevronLeft :size="16" />
              <span class="truncate">{{ prevDay ? `${dayLabel(prevDay, index - 1)} ${prevDay.place}` : '已是第一天' }}</span>
            </button>
            <button
              type="button"
              class="btn-ghost justify-end"
              :disabled="!nextDay"
              @click="select(nextDay)"
            >
              <span class="truncate">{{ nextDay ? `${dayLabel(nextDay, index + 1)} ${nextDay.place}` : '已是最後一天' }}</span>
              <ChevronRight :size="16" />
            </button>
          </div>
          <p class="text-center text-xs text-ink-400">也可以左右滑動切換天數</p>
        </div>
      </template>

      <div class="flex items-center justify-center gap-2 text-xs text-ink-400">
        <span v-if="updatedAt">行程更新於 {{ updatedAt }}</span>
        <button
          type="button"
          class="flex items-center gap-1 text-brand-600"
          :disabled="itinerary.loading"
          @click="itinerary.load(true)"
        >
          <RefreshCw :size="12" :class="itinerary.loading ? 'animate-spin' : ''" />
          {{ itinerary.loading ? '更新中…' : '從 Notion 更新' }}
        </button>
      </div>
    </template>
  </div>
</template>
