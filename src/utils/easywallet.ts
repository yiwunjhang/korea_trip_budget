import type { Transaction, WalletBalance } from '../db/api'

/**
 * 悠遊付「韓國 TWQR」回饋估算（2026/9/1 ~ 2026/12/31）。
 *
 * 活動一：每筆扣款台幣 × 10.5%，四捨五入到整數；每個階段（主活動／連假加開）
 *         每位會員上限 600 元，退款會扣回。另外免 1.5% 海外手續費（直接少扣，不是回饋）。
 * 活動二：每月第一筆成功交易送兩張券（樂天免稅店 100 元券、返台 10% 券，上限 50 元）。
 *
 * 上限是「每位會員」各自算，所以這裡以「每個悠遊付錢包」為單位：
 * 兩個人各建一個悠遊付錢包，額度就各自扣。
 *
 * 這裡只是估算：實際扣款匯率、活動總額度是否額滿，以悠遊付 APP 為準。
 * 「週五會員日 2%」「月級挑戰 3%」有自己的規則與上限，沒有算進來。
 */

export const REBATE_RATE = 0.105
export const FEE_WAIVED_RATE = 0.015
export const STAGE_CAP_TWD = 600
/** 刷到這個金額（台幣）回饋就會到 600 上限：600 ÷ 10.5% ≈ 5,714 */
export const STAGE_SPEND_CAP_TWD = Math.floor(STAGE_CAP_TWD / REBATE_RATE)

export interface RebateStage {
  /** 例：11月主活動 */
  label: string
  /** 臺灣日期，含頭含尾 yyyy-mm-dd */
  from: string
  to: string
}

export const STAGES: RebateStage[] = [
  { label: '9月主活動', from: '2026-09-01', to: '2026-09-24' },
  { label: '9月連假加開', from: '2026-09-25', to: '2026-09-30' },
  { label: '10月主活動', from: '2026-10-01', to: '2026-10-22' },
  { label: '10月連假加開', from: '2026-10-23', to: '2026-10-31' },
  { label: '11月主活動', from: '2026-11-01', to: '2026-11-24' },
  { label: '11月連假加開', from: '2026-11-25', to: '2026-11-30' },
  { label: '12月主活動', from: '2026-12-01', to: '2026-12-23' },
  { label: '12月連假加開', from: '2026-12-24', to: '2026-12-31' },
]

/** 已公告額滿的「樂天免稅店 100 元券」月份（yyyy-mm） */
export const LOTTE_COUPON_SOLD_OUT = new Set(['2026-09', '2026-10'])

/** 活動以臺灣時間（UTC+8）判定日期 */
export function taipeiDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

export function stageOf(iso: string): RebateStage | undefined {
  const day = taipeiDate(iso)
  return STAGES.find((s) => day >= s.from && day <= s.to)
}

/** 單筆回饋（四捨五入到整數，未套上限） */
export function rebateFor(amountTwd: number): number {
  return Math.round(amountTwd * REBATE_RATE)
}

export interface StageRebate {
  walletId: number
  walletName: string
  stage: RebateStage
  /** 這階段這個錢包的淨扣款（台幣，退款已扣除） */
  spentTwd: number
  /** 未套上限的回饋合計 */
  rawRebate: number
  /** 套上 600 上限後 */
  rebate: number
  /** 回饋還差多少到上限 */
  roomLeft: number
  /** 刷卡額度還剩多少台幣（= 5,714 − 已刷；負數表示超過） */
  quotaLeft: number
  count: number
}

export interface MonthCoupons {
  walletId: number
  walletName: string
  /** yyyy-mm */
  month: string
  /** 該月第一筆悠遊付交易時間 */
  firstAt: string
  lotteSoldOut: boolean
}

export interface RebateReport {
  stages: StageRebate[]
  totalRebate: number
  totalSpentTwd: number
  /** 免 1.5% 海外手續費省下的錢 */
  feeSaved: number
  coupons: MonthCoupons[]
}

const stageKey = (walletId: number, label: string) => `${walletId}|${label}`

export function buildRebateReport(
  transactions: Transaction[],
  walletList: WalletBalance[],
): RebateReport {
  const wallets = new Map(walletList.map((w) => [w.wallet_id, w]))
  const eligible = transactions
    .filter(
      (tx) =>
        (tx.kind === 'expense' || tx.kind === 'refund') &&
        wallets.get(tx.wallet_id)?.kind === 'easywallet' &&
        stageOf(tx.spent_at) !== undefined,
    )
    .sort((a, b) => a.spent_at.localeCompare(b.spent_at))

  const byStage = new Map<string, StageRebate>()
  const firstByMonth = new Map<string, MonthCoupons>()

  for (const tx of eligible) {
    const stage = stageOf(tx.spent_at)!
    const walletName = wallets.get(tx.wallet_id)?.name ?? ''
    const sign = tx.kind === 'refund' ? -1 : 1
    const key = stageKey(tx.wallet_id, stage.label)
    const entry =
      byStage.get(key) ??
      {
        walletId: tx.wallet_id,
        walletName,
        stage,
        spentTwd: 0,
        rawRebate: 0,
        rebate: 0,
        roomLeft: 0,
        quotaLeft: 0,
        count: 0,
      }
    entry.spentTwd += sign * tx.amount_twd
    entry.rawRebate += sign * rebateFor(tx.amount_twd)
    entry.count += 1
    byStage.set(key, entry)

    if (tx.kind === 'expense') {
      const month = taipeiDate(tx.spent_at).slice(0, 7)
      const monthKey = `${tx.wallet_id}|${month}`
      if (!firstByMonth.has(monthKey)) {
        firstByMonth.set(monthKey, {
          walletId: tx.wallet_id,
          walletName,
          month,
          firstAt: tx.spent_at,
          lotteSoldOut: LOTTE_COUPON_SOLD_OUT.has(month),
        })
      }
    }
  }

  const stageOrder = (label: string) => STAGES.findIndex((s) => s.label === label)
  const stages = [...byStage.values()]
    .sort(
      (a, b) =>
        stageOrder(a.stage.label) - stageOrder(b.stage.label) ||
        (wallets.get(a.walletId)?.sort_order ?? 0) - (wallets.get(b.walletId)?.sort_order ?? 0),
    )
    .map((entry) => {
      const rebate = Math.min(STAGE_CAP_TWD, Math.max(0, entry.rawRebate))
      return {
        ...entry,
        rebate,
        roomLeft: STAGE_CAP_TWD - rebate,
        quotaLeft: STAGE_SPEND_CAP_TWD - entry.spentTwd,
      }
    })

  const totalSpentTwd = stages.reduce((sum, s) => sum + s.spentTwd, 0)

  return {
    stages,
    totalRebate: stages.reduce((sum, s) => sum + s.rebate, 0),
    totalSpentTwd,
    feeSaved: Math.max(0, totalSpentTwd * FEE_WAIVED_RATE),
    coupons: [...firstByMonth.values()],
  }
}

export interface RebatePreview {
  stage: RebateStage
  /** 額度 */
  quota: number
  /** 這階段這個錢包已刷 */
  spentBefore: number
  /** 扣掉這筆後還剩多少額度（負數 = 超過） */
  quotaAfter: number
  /** 這筆超出額度的部分（沒有回饋） */
  overBy: number
  /** 這筆大概能拿多少回饋 */
  rebate: number
  /** 這筆之後這階段累積回饋 */
  stageTotalAfter: number
}

/**
 * 記帳前預覽：這筆（台幣 amountTwd，時間 iso）用 walletId 付，
 * 額度扣完剩多少、能拿多少回饋。
 */
export function previewRebate(
  walletId: number,
  amountTwd: number,
  iso: string,
  report: RebateReport,
): RebatePreview | null {
  const stage = stageOf(iso)
  if (!stage) return null
  const current = report.stages.find(
    (s) => s.walletId === walletId && s.stage.label === stage.label,
  )
  const spentBefore = current?.spentTwd ?? 0
  const rebateBefore = current?.rebate ?? 0
  const rebateAfter = Math.min(STAGE_CAP_TWD, rebateBefore + rebateFor(amountTwd))
  const quotaBefore = STAGE_SPEND_CAP_TWD - spentBefore
  const quotaAfter = quotaBefore - amountTwd
  return {
    stage,
    quota: STAGE_SPEND_CAP_TWD,
    spentBefore,
    quotaAfter,
    overBy: Math.min(amountTwd, Math.max(0, -quotaAfter)),
    rebate: rebateAfter - rebateBefore,
    stageTotalAfter: rebateAfter,
  }
}
