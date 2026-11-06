import type { ItineraryDay, ItineraryStop } from '../db/api'

/**
 * 行程站名常帶備註，例如「德壽宮 덕수궁 ※免費參觀，德壽宮石牆路銀杏很美!!」。
 * 記帳的品項只要前面的地名：遇到 ※ ⇒ ( （ 等就截斷，最多 20 字。
 */
export function shortStopTitle(title: string): string {
  const cut = title.split(/[※⇒→（(｜|!！]/)[0].trim()
  const base = cut || title.trim()
  return base.length > 20 ? `${base.slice(0, 20)}…` : base
}

/** 分類關鍵字，越前面越優先（「交通卡夾」要算購物，所以購物排在交通前面） */
const CATEGORY_RULES: [RegExp, string][] = [
  [/住宿|飯店|旅館|hotel|house/i, '住宿'],
  [/航班|機場|機票/, '機票'],
  [/購物|大創|百貨|免稅|商店|outlet|包包|卡夾|退稅/i, '購物'],
  // 「搭觀光巴士」要算交通，不能被「昌慶宮」的宮字搶走
  [/巴士|搭車|搭地鐵|纜車/, '交通'],
  [/門票|宮|公園|博物館|展|樂園|聖誕村|體驗|似顏繪|導覽|投影/, '門票娛樂'],
  [/早餐|午餐|晚餐|餐|食|吃|咖啡|茶屋|茶|貝果|蛋塔|麵包|拉麵|炸雞|烤肉|燒肉|鰻魚|湯|市場|cafe|bakery/i, '餐飲'],
  [/交通|巴士|地鐵|纜車|計程車|列車|T-?money/i, '交通'],
  [/網卡|sim|esim/i, '通訊雜支'],
]

/**
 * 依站名猜分類：先看站名，站名猜不到才看前兩行說明；都猜不到回 null（沿用目前選的）。
 * 換匯不猜（換匯是加值，不是花費）。
 */
export function guessCategory(stop: ItineraryStop): string | null {
  const match = (text: string) => CATEGORY_RULES.find(([re]) => re.test(text))?.[1] ?? null
  if (/換匯/.test(stop.title)) return null
  return match(stop.title) ?? match(stop.lines.slice(0, 2).join(' '))
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 2026-11-08 → { md: '11/8', weekday: '日' } */
export function dateParts(date: string | null): { md: string; weekday: string } {
  if (!date) return { md: '', weekday: '' }
  const [y, m, d] = date.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return { md: `${m}/${d}`, weekday: WEEKDAYS[wd] }
}

/** 「Day 2」；沒寫 Day 幾就用第幾個 */
export function dayLabel(day: ItineraryDay, index: number): string {
  return `Day ${day.dayNo ?? index + 1}`
}
