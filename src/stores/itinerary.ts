import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import * as api from '../db/api'
import type { Itinerary, ItineraryDay } from '../db/api'
import { useGroupStore } from './group'
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
  const group = useGroupStore()

  const data = ref<Itinerary | null>(null)
  const loading = ref(false)
  const error = ref('')

  /**
   * 分享連結帶來的 Notion 網址（#/itinerary?src=...）。
   * 沒登入的人看不到別人設定裡的連結，所以公開分享時行程來源放在網址上。
   */
  const sharedUrl = ref('')
  /** 目前 data 是哪個連結讀來的 */
  let dataUrl = ''
  /**
   * 用哪份行程：分享連結 ＞ 群組共用（建立群組的人設定）＞ 自己設定的。
   * 有群組就大家看同一份，記帳的日期、分類才不會對不上。
   */
  const groupUrl = computed(() => group.group?.itinerary_url?.trim() ?? '')
  const url = computed(
    () => sharedUrl.value || groupUrl.value || (ledger.settings?.itinerary_url?.trim() ?? ''),
  )
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
      dataUrl = ''
      return
    }
    // 換了行程來源（例如打開別人分享的連結）就先清掉舊的，不要顯示錯的行程
    if (dataUrl !== url.value) {
      data.value = null
      error.value = ''
      dataUrl = url.value
    }
    const cached = readCache()
    if (cached && cached.url === url.value && !data.value) data.value = cached.data
    // 15 分鐘內抓過就不重抓（除非手動重新整理）。
    // 但如果存的是舊版函式回的資料（沒有圖片欄位），就算剛抓過也要重抓：
    // 先推前端、後部署函式時，手機會先存到一份沒有圖片的行程。
    const isCurrentFormat = (data.value?.days ?? []).every((d) => Array.isArray(d.noteImages))
    const fresh =
      data.value &&
      isCurrentFormat &&
      Date.now() - new Date(data.value.fetchedAt).getTime() < 15 * 60 * 1000
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

  // 行程來源換了（例如群組資料晚一步載入、建立者改了連結）就重讀
  watch(url, () => {
    if (dataUrl || data.value) load()
  })

  return { data, days, loading, error, url, groupUrl, sharedUrl, dayByDate, defaultDay, upcomingDay, load }
})
