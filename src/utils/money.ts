import type { Currency } from '../db/api'

/** 韓元不用小數：10,000 ₩ */
export function formatKRW(value: number): string {
  return `₩${Math.round(value).toLocaleString('zh-TW')}`
}

/** 台幣留到小數一位以內，整數就不顯示小數 */
export function formatTWD(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return `NT$${rounded.toLocaleString('zh-TW', { maximumFractionDigits: 1 })}`
}

export function formatMoney(value: number, currency: Currency): string {
  return currency === 'KRW' ? formatKRW(value) : formatTWD(value)
}

/** 韓元 → 台幣（rate = 1 台幣換多少韓元） */
export function krwToTwd(krw: number, rate: number): number {
  return rate > 0 ? krw / rate : 0
}

/** 台幣 → 韓元 */
export function twdToKrw(twd: number, rate: number): number {
  return twd * rate
}

/** 以首爾時間顯示日期時間（旅行途中看到的時間要跟當地一致） */
export function formatSeoulDateTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-TW', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function formatSeoulDate(iso: string): string {
  return new Date(iso).toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  })
}

/** <input type="datetime-local"> 需要首爾當地時間字串 */
export function toSeoulInputValue(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/** 把首爾當地時間字串轉回 ISO（韓國固定 UTC+9，無日光節約） */
export function seoulInputToISO(value: string): string {
  if (!value) return new Date().toISOString()
  return new Date(`${value}:00+09:00`).toISOString()
}
