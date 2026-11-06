<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { Currency, WalletKind } from '../db/api'
import { useLedgerStore } from '../stores/ledger'
import { formatMoney } from '../utils/money'

const ledger = useLedgerStore()

const kindLabels: Record<WalletKind, string> = {
  easywallet: '悠遊付',
  cash: '現金',
  card: '信用卡',
  transit: '交通卡',
  other: '其他',
}

/** 新增錢包的草稿 */
const draft = reactive({
  name: '',
  kind: 'other' as WalletKind,
  balance_currency: 'TWD' as Currency,
  opening_balance: 0,
  default_krw_per_twd: null as number | null,
})

const adding = ref(false)

async function add() {
  if (!draft.name.trim()) return
  await ledger.addWallet({
    name: draft.name.trim(),
    kind: draft.kind,
    balance_currency: draft.balance_currency,
    opening_balance: draft.opening_balance || 0,
    default_krw_per_twd: draft.default_krw_per_twd,
  })
  draft.name = ''
  draft.opening_balance = 0
  draft.default_krw_per_twd = null
  adding.value = false
}

async function saveOpening(id: number, value: number) {
  await ledger.editWallet(id, { opening_balance: value })
}

async function saveRate(id: number, value: string) {
  const rate = Number(value)
  await ledger.editWallet(id, {
    default_krw_per_twd: value === '' || !Number.isFinite(rate) || rate <= 0 ? null : rate,
  })
}

async function toggleActive(id: number, isActive: boolean) {
  await ledger.editWallet(id, { is_active: !isActive })
}

async function remove(id: number, name: string) {
  if (!window.confirm(`刪除錢包「${name}」？（已經有帳掛在上面會刪不掉，請改用停用）`)) return
  await ledger.removeWallet(id)
}
</script>

<template>
  <div class="space-y-5">
    <section class="space-y-3">
      <h2 class="px-1 text-sm font-semibold text-ink-800">錢包與餘額</h2>

      <div v-for="w in ledger.wallets" :key="w.wallet_id" class="card space-y-3">
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

    <!-- 新增錢包 -->
    <section>
      <button v-if="!adding" class="btn-ghost w-full" @click="adding = true">＋ 新增錢包</button>

      <form v-else class="card space-y-3" @submit.prevent="add">
        <div>
          <label class="label" for="w-name">名稱</label>
          <input id="w-name" v-model="draft.name" class="field" placeholder="例：T-money 卡" required />
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
          <div>
            <label class="label" for="w-currency">餘額幣別</label>
            <select id="w-currency" v-model="draft.balance_currency" class="field">
              <option value="TWD">台幣（悠遊付、信用卡）</option>
              <option value="KRW">韓元（現金、T-money）</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
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
            <label class="label" for="w-rate">專屬匯率（選填）</label>
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

        <div class="flex gap-2">
          <button class="btn-primary flex-1" type="submit">新增</button>
          <button class="btn-ghost" type="button" @click="adding = false">取消</button>
        </div>
      </form>
    </section>
  </div>
</template>
