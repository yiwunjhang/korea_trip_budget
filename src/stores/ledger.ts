import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as api from '../db/api'
import { buildRebateReport } from '../utils/easywallet'
import type {
  BudgetSummary,
  Transaction,
  TransactionInput,
  TripSettings,
  Wallet,
  WalletBalance,
} from '../db/api'

/**
 * 帳本：旅行設定、錢包餘額、分類、帳目明細都放在這裡。
 * 任何寫入後一律重新向資料庫拿一次（餘額與預算都是 view 算的，
 * 前端不自己維護扣款結果，才不會對不起來）。
 */
export const useLedgerStore = defineStore('ledger', () => {
  const settings = ref<TripSettings | null>(null)
  const summary = ref<BudgetSummary | null>(null)
  const wallets = ref<WalletBalance[]>([])
  const transactions = ref<Transaction[]>([])

  const loading = ref(false)
  const error = ref('')

  /** 可用於記帳的錢包（設定頁才看得到停用的） */
  const activeWallets = computed(() => wallets.value.filter((w) => w.is_active))

  /** 悠遊付韓國 TWQR 回饋估算（每階段上限 600） */
  const rebateReport = computed(() => buildRebateReport(transactions.value, wallets.value))

  /** 預設匯率：1 台幣 = ? 韓元 */
  const baseRate = computed(() => settings.value?.krw_per_twd ?? 43)

  function walletById(id: number): WalletBalance | undefined {
    return wallets.value.find((w) => w.wallet_id === id)
  }

  /** 該錢包記帳時要帶入的匯率：錢包專屬優先，否則用旅行預設 */
  function rateFor(walletId: number | null): number {
    const wallet = walletId === null ? undefined : walletById(walletId)
    return wallet?.default_krw_per_twd ?? baseRate.value
  }

  async function run<T>(task: () => Promise<T>): Promise<T | null> {
    error.value = ''
    try {
      return await task()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return null
    }
  }

  /** 重新載入整本帳 */
  async function refresh() {
    loading.value = true
    await run(async () => {
      const [s, sum, w, t] = await Promise.all([
        api.getTripSettings(),
        api.getBudgetSummary(),
        api.listWalletBalances(),
        api.listTransactions(),
      ])
      settings.value = s
      summary.value = sum
      wallets.value = w
      transactions.value = t
    })
    loading.value = false
  }

  /** 第一次進來若沒有設定（新帳號），先建預設值 */
  async function ensureSeeded() {
    if (settings.value) return
    await run(async () => {
      await api.seedDefaults()
      await refresh()
    })
  }

  async function addTransaction(input: TransactionInput) {
    const created = await run(() => api.createTransaction(input))
    if (created) await refresh()
    return created // 失敗時為 null，error 會保留錯誤訊息
  }

  /**
   * 寫入後重新載入，回傳是否成功（給畫面決定要跳成功還是失敗提示）。
   * refresh() 會清掉 error，所以失敗訊息要先存起來再放回去。
   */
  async function write(task: () => Promise<unknown>): Promise<boolean> {
    const ok = (await run(task)) !== null
    const message = error.value
    await refresh()
    if (!ok) error.value = message
    return ok
  }

  const editTransaction = (id: number, patch: Partial<TransactionInput>) =>
    write(() => api.updateTransaction(id, patch))

  const removeTransaction = (id: number) => write(() => api.deleteTransaction(id))

  const saveSettings = (patch: Partial<Omit<TripSettings, 'user_id'>>) =>
    write(() => api.saveTripSettings(patch))

  const addWallet = (input: Parameters<typeof api.createWallet>[0]) =>
    write(() => api.createWallet(input))

  const editWallet = (id: number, patch: Partial<Omit<Wallet, 'id'>>) =>
    write(() => api.updateWallet(id, patch))

  const removeWallet = (id: number) => write(() => api.deleteWallet(id))
  const resetWallets = () => write(() => api.resetDefaultWallets())

  return {
    settings,
    summary,
    wallets,
    transactions,
    loading,
    error,
    activeWallets,
    rebateReport,
    baseRate,
    walletById,
    rateFor,
    refresh,
    ensureSeeded,
    addTransaction,
    editTransaction,
    removeTransaction,
    saveSettings,
    addWallet,
    editWallet,
    removeWallet,
    resetWallets,
  }
})
