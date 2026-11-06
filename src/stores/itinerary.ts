import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as api from '../db/api'
import type { Itinerary, ItineraryDay } from '../db/api'
import { useLedgerStore } from './ledger'

/**
 * Notion 行程。讀過一次就存在這支手機（localStorage），
 * 在韓國網路不穩、地鐵裡沒訊號時也看得到；有網路時再背景更新。
 */
// 資料格式有變（例如加了圖片）就換版本號，舊的快取自動作廢
const CACHE_KEY = 'korea-trip:itinerary:v2'

function readCache(): { url: string; data: Itinerary } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeCache(url: string, data: Itinerary) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ url, data }))
  } catch {
    /* 私密模式或空間不足就算了，下次再抓 */
  }
}

/** 首爾今天的日期 yyyy-mm-dd */
export function seoulToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
}

export const useItineraryStore = defineStore('itinerary', () => {
  const ledger = useLedgerStore()

  const data = ref<Itinerary | null>(null)
  const loading = ref(false)
  const error = ref('')

  const url = computed(() => ledger.settings?.itinerary_url?.trim() ?? '')
  const days = computed(() => data.value?.days ?? [])

  function dayByDate(date: string): ItineraryDay | undefined {
    return days.value.find((d) => d.date === date)
  }

  /** 預設要看哪一天：今天；還沒出發看第一天；回國後看最後一天 */
  const defaultDay = computed<ItineraryDay | undefined>(() => {
    const list = days.value
    if (!list.length) return undefined
    const today = seoulToday()
    return (
      list.find((d) => d.date === today) ??
      list.find((d) => (d.date ?? '') > today) ??
      list[list.length - 1]
    )
  })

  /** 首頁用：今天的行程（旅途中）或下一天（還沒出發／當天沒排） */
  const upcomingDay = computed(() => {
    const today = seoulToday()
    return days.value.find((d) => d.date === today) ?? days.value.find((d) => (d.date ?? '') > today)
  })

  /** 讀行程：先用手機裡的快取，再去 Notion 抓最新的 */
  async function load(force = false) {
    if (!url.value) {
      data.value = null
      return
    }
    const cached = readCache()
    if (cached && cached.url === url.value && !data.value) data.value = cached.data
    // 15 分鐘內抓過就不重抓（除非手動重新整理）
    const fresh =
      data.value && Date.now() - new Date(data.value.fetchedAt).getTime() < 15 * 60 * 1000
    if (fresh && !force) return

    loading.value = true
    error.value = ''
    try {
      const result = await api.fetchItinerary(url.value)
      data.value = result
      writeCache(url.value, result)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  return { data, days, loading, error, url, dayByDate, defaultDay, upcomingDay, load }
})
