<script setup lang="ts">
import { computed } from 'vue'
import { useLedgerStore } from '../stores/ledger'
import { STAGE_CAP_TWD } from '../utils/easywallet'
import { formatSeoulDate, formatTWD } from '../utils/money'

const ledger = useLedgerStore()
const report = computed(() => ledger.rebateReport)

/** 沒有悠遊付錢包就不顯示 */
const hasEasyWallet = computed(() => ledger.activeWallets.some((w) => w.kind === 'easywallet'))
</script>

<template>
  <section v-if="hasEasyWallet" class="card space-y-3">
    <div class="flex items-baseline justify-between">
      <h2 class="text-sm font-semibold text-ink-800">悠遊付回饋（估算）</h2>
      <span class="text-xs text-ink-400">10.5%／每階段上限 NT${{ STAGE_CAP_TWD }}</span>
    </div>

    <div class="flex items-end justify-between">
      <p class="tabular text-2xl font-bold text-mint-600">{{ formatTWD(report.totalRebate) }}</p>
      <p class="tabular text-right text-xs text-ink-600">
        悠遊付扣款 {{ formatTWD(report.totalSpentTwd) }}<br />
        免手續費省 {{ formatTWD(report.feeSaved) }}
      </p>
    </div>

    <ul v-if="report.stages.length" class="space-y-2">
      <li v-for="s in report.stages" :key="s.stage.label">
        <div class="flex items-baseline justify-between text-xs">
          <span class="font-medium text-ink-800">
            {{ s.stage.label }}
            <span class="text-ink-400">{{ s.stage.from.slice(5).replace('-', '/') }}–{{ s.stage.to.slice(5).replace('-', '/') }}</span>
          </span>
          <span class="tabular text-ink-600">
            {{ formatTWD(s.rebate) }} / {{ STAGE_CAP_TWD }}
          </span>
        </div>
        <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-mint-50">
          <div
            class="h-full rounded-full bg-mint-500 transition-all"
            :style="{ width: `${(s.rebate / STAGE_CAP_TWD) * 100}%` }"
          />
        </div>
        <p class="tabular mt-1 text-xs text-ink-400">
          <template v-if="s.roomLeft > 0">再刷約 {{ formatTWD(s.spendToCap) }} 到上限</template>
          <template v-else>已達上限，這階段改用別的付款比較划算</template>
        </p>
      </li>
    </ul>
    <p v-else class="text-xs text-ink-400">用悠遊付在韓國 TWQR 店家付款後，這裡會估算回饋。</p>

    <!-- 活動二：每月一次的券 -->
    <ul v-if="report.coupons.length" class="space-y-1 border-t border-line pt-3 text-xs text-ink-600">
      <li v-for="c in report.coupons" :key="c.month">
        <span class="font-medium text-ink-800">{{ Number(c.month.slice(5)) }}月禮券</span>
        （{{ formatSeoulDate(c.firstAt) }} 首刷）：
        <span :class="c.lotteSoldOut ? 'text-ink-400 line-through' : ''">樂天免稅 100 元券</span>
        <span v-if="c.lotteSoldOut" class="text-flame-600">已額滿</span>
        ・返台 10% 券（上限 50）
      </li>
    </ul>

    <p class="text-xs leading-relaxed text-ink-400">
      依記帳匯率估算，實際以悠遊付 APP 為準；活動總額度額滿就沒有。未含週五會員日 2%、月級挑戰 3%。
    </p>
  </section>
</template>
