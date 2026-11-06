import type { WalletKind } from '../db/api'

/**
 * 悠遊付（綁銀行帳戶扣款）和信用卡沒有「期初金額」，算餘額沒有意義，
 * 只顯示「已刷多少」。現金、交通卡等才顯示餘額。
 */
const PAY_ONLY_KINDS: WalletKind[] = ['easywallet', 'card']

export function tracksBalance(kind: WalletKind): boolean {
  return !PAY_ONLY_KINDS.includes(kind)
}
