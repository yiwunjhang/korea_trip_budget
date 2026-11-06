import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as api from '../db/api'
import { buildRebateReport } from '../utils/easywallet'
import type {
  BudgetSummary,
  Category,
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
  const categories = ref<Category[]>([])
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
      const [s, sum, w, c, t] = await Promise.all([
        api.getTripSettings(),
        api.getBudgetSummary(),
        api.listWalletBalances(),
        api.listCategories(),
        api.listTransactions(),
      ])
      settings.value = s
      summary.value = sum
      wallets.value = w
      categories.value = c
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
    return created
  }

  async function editTransaction(id: number, patch: Partial<TransactionInput>) {
    await run(() => api.updateTransaction(id, patch))
    await refresh()
  }

  async function removeTransaction(id: number) {
    await run(() => api.deleteTransaction(id))
    await refresh()
  }

  async function saveSettings(patch: Partial<Omit<TripSettings, 'user_id'>>) {
    await run(() => api.saveTripSettings(patch))
    await refresh()
  }

  async function addWallet(input: Parameters<typeof api.createWallet>[0]) {
    await run(() => api.createWallet(input))
    await refresh()
  }

  async function editWallet(id: number, patch: Partial<Omit<Wallet, 'id'>>) {
    await run(() => api.updateWallet(id, patch))
    await refresh()
  }

  async function removeWallet(id: number) {
    await run(() => api.deleteWallet(id))
    await refresh()
  }

  async function addCategory(name: string, emoji?: string) {
    await run(() => api.createCategory(name, emoji))
    await refresh()
  }

  async function removeCategory(id: number) {
    await run(() => api.deleteCategory(id))
    await refresh()
  }

  return {
    settings,
    summary,
    wallets,
    categories,
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
    addCategory,
    removeCategory,
  }
})
