/**
 * 固定分類：旅伴之間要比較「誰在什麼項目花多少」，所以全員共用、不開放自訂。
 * 要和 supabase/schema.sql 的 fixed_categories() 與 transactions_category_fixed 一致。
 *
 * color 是圖表用的類別色，順序固定（色盲安全已驗證），
 * 顏色跟著分類走，不會因為某天沒有某分類而換色。
 */
export interface FixedCategory {
  name: string
  /** src/utils/categoryIcons.ts 的圖示 key */
  icon: string
  color: string
}

export const FIXED_CATEGORIES: FixedCategory[] = [
  { name: '餐飲', icon: 'food', color: '#2a78d6' },
  { name: '交通', icon: 'transit', color: '#eb6834' },
  // 機票、住宿：算進總預算，但不算進每日花費（見 NON_DAILY_CATEGORIES）
  { name: '機票', icon: 'flight', color: '#e34948' },
  { name: '購物', icon: 'shopping', color: '#1baf7a' },
  { name: '住宿', icon: 'hotel', color: '#eda100' },
  { name: '門票娛樂', icon: 'ticket', color: '#e87ba4' },
  { name: '通訊雜支', icon: 'phone', color: '#008300' },
  { name: '其他', icon: 'other', color: '#6250d6' },
]

/**
 * 不算進「每天花多少」的分類：機票、住宿通常出發前就一次付清，
 * 算進去某一天會失真。總預算照樣會扣。
 */
export const NON_DAILY_CATEGORIES = ['機票', '住宿']

export function isDailyCategory(name: string): boolean {
  return !NON_DAILY_CATEGORIES.includes(name)
}

/** 每日統計用的分類（排除機票、住宿），順序與顏色不變 */
export const DAILY_CATEGORIES = FIXED_CATEGORIES.filter((c) => isDailyCategory(c.name))

/** 加值／換匯不算花費，帳上用這個分類名稱 */
export const TOPUP_CATEGORY = '加值換匯'

const byName = new Map(FIXED_CATEGORIES.map((c) => [c.name, c]))

/** 舊資料若有不在清單內的分類，一律當「其他」 */
export function normalizeCategory(name: string): string {
  return byName.has(name) ? name : '其他'
}

export function categoryColor(name: string): string {
  return byName.get(normalizeCategory(name))!.color
}

export function fixedCategoryIcon(name: string): string | undefined {
  return byName.get(name)?.icon
}
