import type { Component } from 'vue'
import {
  Beer,
  BedDouble,
  Bus,
  Camera,
  CarTaxiFront,
  Coffee,
  Coins,
  Croissant,
  Gift,
  Heart,
  Landmark,
  Pill,
  Plane,
  Shirt,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Store,
  Ticket,
  TrainFront,
  UtensilsCrossed,
  ArrowLeftRight,
} from 'lucide-vue-next'

/**
 * 分類圖示。資料庫 categories.emoji 欄位沿用：
 * 存的是這裡的 key（例：'coffee'）就用那個圖示；
 * 舊資料存的是 emoji，就依分類名稱猜一個，猜不到用 coins。
 */
export const CATEGORY_ICONS: Record<string, Component> = {
  food: UtensilsCrossed,
  coffee: Coffee,
  snack: Croissant,
  drink: Beer,
  transit: TrainFront,
  bus: Bus,
  taxi: CarTaxiFront,
  flight: Plane,
  shopping: ShoppingBag,
  store: Store,
  clothes: Shirt,
  beauty: Sparkles,
  gift: Gift,
  hotel: BedDouble,
  ticket: Ticket,
  sight: Landmark,
  photo: Camera,
  phone: Smartphone,
  health: Pill,
  love: Heart,
  topup: ArrowLeftRight,
  other: Coins,
}

/** 名稱關鍵字 → 圖示 key（給預設分類與舊資料用） */
const NAME_RULES: [RegExp, string][] = [
  [/加值|換匯/, 'topup'],
  [/咖啡|飲料|cafe/i, 'coffee'],
  [/酒|啤酒/, 'drink'],
  [/點心|甜點|麵包|小吃/, 'snack'],
  [/餐|食|吃|飯/, 'food'],
  [/計程車|taxi/i, 'taxi'],
  [/公車|巴士/, 'bus'],
  [/機票|飛機/, 'flight'],
  [/交通|地鐵|捷運|車/, 'transit'],
  [/超商|便利/, 'store'],
  [/衣|鞋/, 'clothes'],
  [/美妝|保養|面膜|化妝/, 'beauty'],
  [/伴手禮|禮物|紀念/, 'gift'],
  [/購物|買|免稅/, 'shopping'],
  [/住宿|飯店|旅館/, 'hotel'],
  [/門票|娛樂|票/, 'ticket'],
  [/景點|觀光/, 'sight'],
  [/通訊|網路|電話|sim/i, 'phone'],
  [/藥|醫/, 'health'],
]

export function categoryIconKey(name: string, stored?: string | null): string {
  if (stored && stored in CATEGORY_ICONS) return stored
  return NAME_RULES.find(([re]) => re.test(name))?.[1] ?? 'other'
}

export function categoryIcon(name: string, stored?: string | null): Component {
  return CATEGORY_ICONS[categoryIconKey(name, stored)]
}
