<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { Currency, WalletKind } from '../db/api'
import { useLedgerStore } from '../stores/ledger'
import { formatMoney } from '../utils/money'
import { tracksBalance } from '../utils/wallet'
import { alertError, alertSaved, confirmDelete, toastSaved } from '../utils/alert'

const ledger = useLedgerStore()

const kindLabels: Record<WalletKind, string> = {
  easywallet: '悠遊付',
  cash: '現金',
  card: '信用卡',
  transit: '交通卡（T-money）',
  prepaid: '儲值卡（Wowpass）',
  other: '其他',
}

/** 現金、交通卡：有餘額 */
const balanceWallets = computed(() => ledger.wallets.filter((w) => tracksBalance(w.kind)))
/** 悠遊付、信用卡：只記已刷多少 */
const payWallets = computed(() => ledger.wallets.filter((w) => !tracksBalance(w.kind)))

/** 新增錢包的草稿 */
const draft = reactive({
  name: '',
  kind: 'cash' as WalletKind,
  balance_currency: 'KRW' as Currency,
  opening_balance: 0,
  default_krw_per_twd: null as number | null,
})

/** 悠遊付／信用卡一律以台幣計、沒有期初金額 */
watch(
  () => draft.kind,
  (kind) => {
    if (!tracksBalance(kind)) {
      draft.balance_currency = 'TWD'
      draft.opening_balance = 0
    } else if (kind === 'cash' || kind === 'transit' || kind === 'prepaid') {
      // 韓幣現金、T-money、Wowpass 在韓國都是韓元
      draft.balance_currency = 'KRW'
    }
  },
)

const adding = ref(false)

async function add() {
  if (!draft.name.trim()) return
  const ok = await ledger.addWallet({
    name: draft.name.trim(),
    kind: draft.kind,
    balance_currency: draft.balance_currency,
    opening_balance: tracksBalance(draft.kind) ? draft.opening_balance || 0 : 0,
    default_krw_per_twd: draft.default_krw_per_twd,
  })
  if (!ok) {
    alertError(ledger.error || '請稍後再試', '新增失敗')
    return
  }
  alertSaved(`已新增「${draft.name.trim()}」`)
  draft.name = ''
  draft.opening_balance = 0
  draft.default_krw_per_twd = null
  adding.value = false
}

/** 欄位改完（離開輸入框）就存，用小 toast 告知 */
async function notify(ok: boolean, message: string) {
  if (ok) toastSaved(message)
  else alertError(ledger.error || '請稍後再試')
}

async function saveOpening(id: number, value: number) {
  notify(await ledger.editWallet(id, { opening_balance: value }), '期初餘額已儲存')
}

async function saveRate(id: number, value: string) {
  const rate = Number(value)
  notify(
    await ledger.editWallet(id, {
      default_krw_per_twd: value === '' || !Number.isFinite(rate) || rate <= 0 ? null : rate,
    }),
    '匯率已儲存',
  )
}

async function toggleActive(id: number, isActive: boolean) {
  notify(await ledger.editWallet(id, { is_active: !isActive }), isActive ? '已停用' : '已啟用')
}

async function remove(id: number, name: string) {
  if (!(await confirmDelete(`刪除「${name}」？`, '已經有帳記在上面的話會刪不掉，可以改用「停用」。'))) return
  if (await ledger.removeWallet(id)) {
    toastSaved('已刪除')
  } else {
    alertError('這個錢包已經有帳記在上面，請改用「停用」。', '無法刪除')
    ledger.error = ''
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- 現金類：有餘額 -->
    <section class="space-y-3">
      <h2 class="px-1 text-sm font-semibold text-ink-800">現金與餘額</h2>
      <p v-if="!balanceWallets.length" class="card text-center text-sm text-ink-400">還沒有現金錢包</p>

      <div v-for="w in balanceWallets" :key="w.wallet_id" class="card space-y-3" :class="{ 'opacity-60': !w.is_active }">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate font-medium text-ink-900">
              {{ w.name }}
              <span class="ml-1 text-xs font-normal text-ink-400">
                {{ kindLabels[w.kind] }} · 以{{ w.balance_currency === 'KRW' ? '韓元' : '台幣' }}計
              </span>
            </p>
            <p
              class="tabular mt-1 text-xl font-bold"
              :class="w.balance < 0 ? 'text-flame-600' : 'text-ink-900'"
            >
              {{ formatMoney(w.balance, w.balance_currency) }}
            </p>
            <p class="tabular text-xs text-ink-400">
              期初 {{ formatMoney(w.opening_balance, w.balance_currency) }} · 已用
              {{ formatMoney(w.spent, w.balance_currency) }}
            </p>
          </div>

          <div class="flex shrink-0 flex-col gap-1">
            <button class="btn-ghost px-3 py-1.5 text-xs" @click="toggleActive(w.wallet_id, w.is_active)">
              {{ w.is_active ? '停用' : '啟用' }}
            </button>
            <button class="btn-danger px-3 py-1.5 text-xs" @click="remove(w.wallet_id, w.name)">
              刪除
            </button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <span class="label">期初餘額</span>
            <input
              class="field tabular"
              type="number"
              step="0.01"
              :value="w.opening_balance"
              @change="saveOpening(w.wallet_id, Number(($event.target as HTMLInputElement).value))"
            />
          </div>
          <div>
            <span class="label">專屬匯率（留空＝用預設）</span>
            <input
              class="field tabular"
              type="number"
              step="0.01"
              placeholder="沿用預設"
              :value="w.default_krw_per_twd ?? ''"
              @change="saveRate(w.wallet_id, ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- 悠遊付、信用卡：只看已刷多少 -->
    <section class="space-y-3">
      <h2 class="px-1 text-sm font-semibold text-ink-800">
        付款方式 <span class="font-normal text-ink-400">悠遊付・信用卡（不算餘額）</span>
      </h2>
      <p v-if="!payWallets.length" class="card text-center text-sm text-ink-400">還沒有悠遊付或信用卡</p>

      <div v-for="w in payWallets" :key="w.wallet_id" class="card space-y-3" :class="{ 'opacity-60': !w.is_active }">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate font-medium text-ink-900">
              {{ w.name }}
              <span class="ml-1 text-xs font-normal text-ink-400">{{ kindLabels[w.kind] }}</span>
            </p>
            <p class="tabular mt-1 text-xl font-bold text-ink-900">
              {{ formatMoney(w.spent, w.balance_currency) }}
            </p>
            <p class="text-xs text-ink-400">已刷（退款已扣除）</p>
          </div>

          <div class="flex shrink-0 flex-col gap-1">
            <button class="btn-ghost px-3 py-1.5 text-xs" @click="toggleActive(w.wallet_id, w.is_active)">
              {{ w.is_active ? '停用' : '啟用' }}
            </button>
            <button class="btn-danger px-3 py-1.5 text-xs" @click="remove(w.wallet_id, w.name)">
              刪除
            </button>
          </div>
        </div>

        <div>
          <span class="label">實際扣款匯率（1 台幣 = ? 韓元，留空＝用預設）</span>
          <input
            class="field tabular"
            type="number"
            step="0.01"
            placeholder="沿用預設"
            :value="w.default_krw_per_twd ?? ''"
            @change="saveRate(w.wallet_id, ($event.target as HTMLInputElement).value)"
          />
        </div>
      </div>
    </section>

    <!-- 新增 -->
    <section>
      <button v-if="!adding" class="btn-ghost w-full" @click="adding = true">＋ 新增錢包／付款方式</button>

      <form v-else class="card space-y-3" @submit.prevent="add">
        <div>
          <label class="label" for="w-name">名稱</label>
          <input id="w-name" v-model="draft.name" class="field" placeholder="例：Wowpass、T-money" required />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="label" for="w-kind">種類</label>
            <select id="w-kind" v-model="draft.kind" class="field">
              <option v-for="(label, value) in kindLabels" :key="value" :value="value">
                {{ label }}
              </option>
            </select>
          </div>
          <div v-if="tracksBalance(draft.kind)">
            <label class="label" for="w-currency">餘額幣別</label>
            <select id="w-currency" v-model="draft.balance_currency" class="field">
              <option value="KRW">韓元（現金、T-money）</option>
              <option value="TWD">台幣</option>
            </select>
          </div>
          <div v-else>
            <label class="label" for="w-rate">實際扣款匯率（選填）</label>
            <input
              id="w-rate"
              v-model.number="draft.default_krw_per_twd"
              class="field tabular"
              type="number"
              step="0.01"
              placeholder="沿用預設"
            />
          </div>
        </div>

        <div v-if="tracksBalance(draft.kind)" class="grid grid-cols-2 gap-2">
          <div>
            <label class="label" for="w-opening">期初餘額</label>
            <input
              id="w-opening"
              v-model.number="draft.opening_balance"
              class="field tabular"
              type="number"
              step="0.01"
            />
          </div>
          <div>
            <label class="label" for="w-rate2">專屬匯率（選填）</label>
            <input
              id="w-rate2"
              v-model.number="draft.default_krw_per_twd"
              class="field tabular"
              type="number"
              step="0.01"
              placeholder="沿用預設"
            />
          </div>
        </div>

        <div class="flex gap-2">
          <button class="btn-primary flex-1" type="submit">新增</button>
          <button class="btn-ghost" type="button" @click="adding = false">取消</button>
        </div>
      </form>
    </section>
  </div>
</template>
