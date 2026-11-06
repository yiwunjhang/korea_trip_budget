import { supabase } from '../supabase'

/* ------------------------------------------------------------------ */
/* 型別                                                                */
/* ------------------------------------------------------------------ */

/** 幣別：韓元 / 台幣 */
export type Currency = 'KRW' | 'TWD'

/** 帳目種類：花費 / 退款 / 加值或換匯 */
export type TxKind = 'expense' | 'refund' | 'topup'

/** 錢包種類（只影響 UI 圖示與分組） */
export type WalletKind = 'easywallet' | 'cash' | 'card' | 'transit' | 'prepaid' | 'other'

/** 這趟旅行的預算與預設匯率 */
export interface TripSettings {
  user_id: string
  title: string
  start_date: string | null
  end_date: string | null
  budget_krw: number
  budget_twd: number
  /** 1 台幣 = ? 韓元 */
  krw_per_twd: number
}

export interface Wallet {
  id: number
  name: string
  kind: WalletKind
  /** 餘額以哪個幣別計算（悠遊付／信用卡 = TWD；韓元現金 = KRW） */
  balance_currency: Currency
  opening_balance: number
  /** 此錢包專屬匯率，null 表示沿用 trip_settings.krw_per_twd */
  default_krw_per_twd: number | null
  sort_order: number
  is_active: boolean
}

/** v_wallet_balances：錢包 + 即時餘額 */
export interface WalletBalance extends Wallet {
  wallet_id: number
  /** 期初之後的淨變動（含加值、退款） */
  net_change: number
  /** 目前餘額 = 期初 + 淨變動 */
  balance: number
  /** 這個錢包總共花掉多少（退款已扣除） */
  spent: number
}

export interface Transaction {
  id: number
  kind: TxKind
  spent_at: string
  title: string
  category: string
  wallet_id: number
  currency: Currency
  amount: number
  krw_per_twd: number
  /** 由資料庫換算，唯讀 */
  amount_krw: number
  /** 由資料庫換算，唯讀 */
  amount_twd: number
  funded_wallet_id: number | null
  note: string
}

/** 新增一筆帳需要的欄位（金額換算交給資料庫） */
export interface TransactionInput {
  kind?: TxKind
  spent_at?: string
  title?: string
  category?: string
  wallet_id: number
  currency: Currency
  amount: number
  krw_per_twd: number
  funded_wallet_id?: number | null
  note?: string
}

/** v_budget_summary：預算扣完剩多少 */
export interface BudgetSummary {
  title: string
  start_date: string | null
  end_date: string | null
  krw_per_twd: number
  budget_krw: number
  budget_twd: number
  spent_krw: number
  spent_twd: number
  remaining_krw: number
  remaining_twd: number
  entry_count: number
  spend_days: number
}

export interface DailyTotal {
  day: string
  krw: number
  twd: number
  entry_count: number
}

export interface CategoryTotal {
  category: string
  krw: number
  twd: number
  entry_count: number
}

/* ------------------------------------------------------------------ */
/* 共用小工具                                                          */
/* ------------------------------------------------------------------ */

/** PostgREST 回來的一列資料。沒有產生 Database 型別，所以用寬鬆型別接。 */
type Row = Record<string, any>

/** 把 Supabase 的 { data, error } 攤平成值或丟錯，呼叫端只要 try/catch */
function unwrap<T>({ data, error }: { data: unknown; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

/** numeric 欄位在 PostgREST 會回字串（避免精度流失），統一轉成 number */
function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function nullableNum(value: unknown): number | null {
  return value === null || value === undefined ? null : num(value)
}

function toWalletBalance(row: Row): WalletBalance {
  return {
    id: num(row.wallet_id),
    wallet_id: num(row.wallet_id),
    name: String(row.name),
    kind: row.kind as WalletKind,
    balance_currency: row.balance_currency as Currency,
    opening_balance: num(row.opening_balance),
    default_krw_per_twd: nullableNum(row.default_krw_per_twd),
    sort_order: num(row.sort_order),
    is_active: Boolean(row.is_active),
    net_change: num(row.net_change),
    balance: num(row.balance),
    spent: num(row.spent),
  }
}

function toTransaction(row: Row): Transaction {
  return {
    id: num(row.id),
    kind: row.kind as TxKind,
    spent_at: String(row.spent_at),
    title: String(row.title ?? ''),
    category: String(row.category ?? ''),
    wallet_id: num(row.wallet_id),
    currency: row.currency as Currency,
    amount: num(row.amount),
    krw_per_twd: num(row.krw_per_twd),
    amount_krw: num(row.amount_krw),
    amount_twd: num(row.amount_twd),
    funded_wallet_id: nullableNum(row.funded_wallet_id),
    note: String(row.note ?? ''),
  }
}

/* ------------------------------------------------------------------ */
/* 初始化                                                              */
/* ------------------------------------------------------------------ */

/** 第一次登入時建立預設設定、錢包與分類（可重複呼叫） */
export async function seedDefaults(): Promise<void> {
  const { error } = await supabase.rpc('seed_defaults')
  if (error) throw new Error(error.message)
}

/* ------------------------------------------------------------------ */
/* 旅行設定（預算 / 匯率）                                              */
/* ------------------------------------------------------------------ */

export async function getTripSettings(): Promise<TripSettings | null> {
  const row = unwrap<Row | null>(
    await supabase.from('trip_settings').select('*').maybeSingle(),
  )
  if (!row) return null
  return {
    user_id: String(row.user_id),
    title: String(row.title),
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
    budget_krw: num(row.budget_krw),
    budget_twd: num(row.budget_twd),
    krw_per_twd: num(row.krw_per_twd),
  }
}

export async function saveTripSettings(
  patch: Partial<Omit<TripSettings, 'user_id'>>,
): Promise<void> {
  const { error } = await supabase
    .from('trip_settings')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .not('user_id', 'is', null)
  if (error) throw new Error(error.message)
}

export async function getBudgetSummary(): Promise<BudgetSummary | null> {
  const row = unwrap<Row | null>(
    await supabase.from('v_budget_summary').select('*').maybeSingle(),
  )
  if (!row) return null
  return {
    title: String(row.title),
    start_date: row.start_date ?? null,
    end_date: row.end_date ?? null,
    krw_per_twd: num(row.krw_per_twd),
    budget_krw: num(row.budget_krw),
    budget_twd: num(row.budget_twd),
    spent_krw: num(row.spent_krw),
    spent_twd: num(row.spent_twd),
    remaining_krw: num(row.remaining_krw),
    remaining_twd: num(row.remaining_twd),
    entry_count: num(row.entry_count),
    spend_days: num(row.spend_days),
  }
}

/* ------------------------------------------------------------------ */
/* 錢包                                                                */
/* ------------------------------------------------------------------ */

/** 錢包 + 即時餘額（含停用的，設定頁要顯示） */
export async function listWalletBalances(): Promise<WalletBalance[]> {
  const rows = unwrap<Row[]>(
    await supabase.from('v_wallet_balances').select('*').order('sort_order', { ascending: true }),
  )
  return (rows ?? []).map(toWalletBalance)
}

export async function createWallet(input: {
  name: string
  kind: WalletKind
  balance_currency: Currency
  opening_balance?: number
  default_krw_per_twd?: number | null
  sort_order?: number
}): Promise<void> {
  const { error } = await supabase.from('wallets').insert({
    name: input.name,
    kind: input.kind,
    balance_currency: input.balance_currency,
    opening_balance: input.opening_balance ?? 0,
    default_krw_per_twd: input.default_krw_per_twd ?? null,
    sort_order: input.sort_order ?? 99,
  })
  if (error) throw new Error(error.message)
}

export async function updateWallet(
  id: number,
  patch: Partial<Omit<Wallet, 'id'>>,
): Promise<void> {
  const { error } = await supabase.from('wallets').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

/** 刪除錢包。已有帳掛在上面時資料庫會擋（on delete restrict），改為停用即可。 */
export async function deleteWallet(id: number): Promise<void> {
  const { error } = await supabase.from('wallets').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/* ------------------------------------------------------------------ */
/* 旅伴群組                                                            */
/* 各自記帳，群組成員只看得到彼此「每天 × 分類」的彙總（group_spending）  */
/* ------------------------------------------------------------------ */

export interface TripGroup {
  id: string
  name: string
  invite_code: string
  created_by: string
}

export interface TripMember {
  group_id: string
  user_id: string
  display_name: string
}

/** group_spending()：每位成員 × 每天（首爾）× 分類 */
export interface GroupSpendingRow {
  member_id: string
  display_name: string
  /** yyyy-mm-dd */
  day: string
  category: string
  krw: number
  twd: number
  entry_count: number
}

/** 我所在的群組（通常只有一個，取最早加入的） */
export async function getMyGroup(): Promise<{ group: TripGroup; members: TripMember[] } | null> {
  const groups = unwrap<Row[]>(
    await supabase.from('trip_groups').select('*').order('created_at', { ascending: true }).limit(1),
  )
  const row = groups?.[0]
  if (!row) return null
  const members = unwrap<Row[]>(
    await supabase
      .from('trip_members')
      .select('*')
      .eq('group_id', row.id)
      .order('joined_at', { ascending: true }),
  )
  return {
    group: {
      id: String(row.id),
      name: String(row.name),
      invite_code: String(row.invite_code),
      created_by: String(row.created_by),
    },
    members: (members ?? []).map((m) => ({
      group_id: String(m.group_id),
      user_id: String(m.user_id),
      display_name: String(m.display_name),
    })),
  }
}

export async function createGroup(name: string, displayName: string): Promise<string> {
  return unwrap<string>(
    await supabase.rpc('create_trip_group', { p_name: name, p_display_name: displayName }),
  )
}

export async function joinGroup(code: string, displayName: string): Promise<string> {
  return unwrap<string>(
    await supabase.rpc('join_trip_group', { p_code: code, p_display_name: displayName }),
  )
}

export async function renameMe(groupId: string, userId: string, displayName: string): Promise<void> {
  const { error } = await supabase
    .from('trip_members')
    .update({ display_name: displayName })
    .eq('group_id', groupId)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

export async function leaveGroup(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('trip_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

export async function getGroupSpending(groupId: string): Promise<GroupSpendingRow[]> {
  const rows = unwrap<Row[]>(await supabase.rpc('group_spending', { p_group: groupId }))
  return (rows ?? []).map((row) => ({
    member_id: String(row.member_id),
    display_name: String(row.display_name),
    day: String(row.day),
    category: String(row.category),
    krw: num(row.krw),
    twd: num(row.twd),
    entry_count: num(row.entry_count),
  }))
}

/* ------------------------------------------------------------------ */
/* 帳目                                                                */
/* ------------------------------------------------------------------ */

export async function listTransactions(options: { limit?: number } = {}): Promise<Transaction[]> {
  const rows = unwrap<Row[]>(
    await supabase
      .from('transactions')
      .select('*')
      .order('spent_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(options.limit ?? 200),
  )
  return (rows ?? []).map(toTransaction)
}

/** 新增一筆帳；回傳資料庫換算後的完整資料 */
export async function createTransaction(input: TransactionInput): Promise<Transaction> {
  const row = unwrap<Row>(
    await supabase
      .from('transactions')
      .insert({
        kind: input.kind ?? 'expense',
        spent_at: input.spent_at ?? new Date().toISOString(),
        title: input.title ?? '',
        category: input.category ?? '其他',
        wallet_id: input.wallet_id,
        currency: input.currency,
        amount: input.amount,
        krw_per_twd: input.krw_per_twd,
        funded_wallet_id: input.funded_wallet_id ?? null,
        note: input.note ?? '',
      })
      .select('*')
      .single(),
  )
  return toTransaction(row)
}

export async function updateTransaction(
  id: number,
  patch: Partial<TransactionInput>,
): Promise<void> {
  const { error } = await supabase.from('transactions').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteTransaction(id: number): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/* ------------------------------------------------------------------ */
/* 統計                                                                */
/* ------------------------------------------------------------------ */

export async function listDailyTotals(): Promise<DailyTotal[]> {
  const rows = unwrap<Row[]>(
    await supabase.from('v_daily_totals').select('*').order('day', { ascending: false }),
  )
  return (rows ?? []).map((row) => ({
    day: String(row.day),
    krw: num(row.krw),
    twd: num(row.twd),
    entry_count: num(row.entry_count),
  }))
}

export async function listCategoryTotals(): Promise<CategoryTotal[]> {
  const rows = unwrap<Row[]>(
    await supabase.from('v_category_totals').select('*').order('krw', { ascending: false }),
  )
  return (rows ?? []).map((row) => ({
    category: String(row.category),
    krw: num(row.krw),
    twd: num(row.twd),
    entry_count: num(row.entry_count),
  }))
}
