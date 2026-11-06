<script setup lang="ts">
import { computed } from 'vue'
import { useLedgerStore } from '../stores/ledger'
import { STAGE_CAP_TWD, STAGE_SPEND_CAP_TWD, stageOf } from '../utils/easywallet'
import { formatSeoulDate, formatTWD } from '../utils/money'

const ledger = useLedgerStore()
const report = computed(() => ledger.rebateReport)

const easyWallets = computed(() => ledger.activeWallets.filter((w) => w.kind === 'easywallet'))

/** 今天所在的階段：還沒刷的悠遊付錢包也要顯示滿額度 */
const currentStage = computed(() => stageOf(new Date().toISOString()))

/** 列表：今天這個階段每個悠遊付錢包都列出來（沒刷過 = 額度全滿），再加上其他有刷過的階段 */
const rows = computed(() => {
  const list = [...report.value.stages]
  const stage = currentStage.value
  if (stage) {
    for (const w of easyWallets.value) {
      const exists = list.some((s) => s.walletId === w.wallet_id && s.stage.label === stage.label)
      if (!exists) {
        list.push({
          walletId: w.wallet_id,
          walletName: w.name,
          stage,
          spentTwd: 0,
          rawRebate: 0,
          rebate: 0,
          roomLeft: STAGE_CAP_TWD,
          quotaLeft: STAGE_SPEND_CAP_TWD,
          count: 0,
        })
      }
    }
  }
  // 目前階段排最前面
  return list.sort(
    (a, b) => Number(b.stage.label === stage?.label) - Number(a.stage.label === stage?.label),
  )
})

const dateRange = (from: string, to: string) =>
  `${from.slice(5).replace('-', '/')}–${to.slice(5).replace('-', '/')}`
</script>

<template>
  <section v-if="easyWallets.length" class="card space-y-3">
    <div class="flex items-baseline justify-between">
      <h2 class="text-sm font-semibold text-ink-800">悠遊付回饋額度</h2>
      <span class="text-xs text-ink-400">
        每階段刷 NT${{ STAGE_SPEND_CAP_TWD.toLocaleString('zh-TW') }} = 回饋 {{ STAGE_CAP_TWD }}
      </span>
    </div>

    <ul v-if="rows.length" class="space-y-3">
      <li v-for="s in rows" :key="`${s.walletId}-${s.stage.label}`">
        <div class="flex items-baseline justify-between text-xs">
          <span class="font-medium text-ink-800">
            {{ s.walletName }}・{{ s.stage.label }}
            <span class="text-ink-400">{{ dateRange(s.stage.from, s.stage.to) }}</span>
          </span>
          <span class="tabular text-mint-600">回饋 {{ formatTWD(s.rebate) }} / {{ STAGE_CAP_TWD }}</span>
        </div>

        <p
          class="tabular mt-1 text-xl font-bold"
          :class="s.quotaLeft < 0 ? 'text-flame-600' : 'text-ink-900'"
        >
          <template v-if="s.quotaLeft >= 0">剩 {{ formatTWD(s.quotaLeft) }}</template>
          <template v-else>超過 {{ formatTWD(-s.quotaLeft) }}</template>
        </p>
        <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-white/70">
          <div
            class="h-full rounded-full transition-all"
            :class="s.quotaLeft < 0 ? 'bg-flame-500' : 'bg-brand-500'"
            :style="{ width: `${Math.min(100, Math.max(0, (s.spentTwd / STAGE_SPEND_CAP_TWD) * 100))}%` }"
          />
        </div>
        <p class="tabular mt-1 text-xs text-ink-400">
          已刷 {{ formatTWD(s.spentTwd) }} / {{ formatTWD(STAGE_SPEND_CAP_TWD) }}
          <template v-if="s.quotaLeft <= 0">・額度用完，接下來改刷卡或付現</template>
        </p>
      </li>
    </ul>
    <p v-else class="text-xs text-ink-400">目前不在活動期間（2026/9/1–12/31）。</p>

    <div class="flex justify-between border-t border-line pt-3 text-xs text-ink-600">
      <span class="tabular">總回饋 <b class="text-mint-600">{{ formatTWD(report.totalRebate) }}</b></span>
      <span class="tabular">免手續費省 {{ formatTWD(report.feeSaved) }}</span>
    </div>

    <!-- 活動二：每月一次的券 -->
    <ul v-if="report.coupons.length" class="space-y-1 text-xs text-ink-600">
      <li v-for="c in report.coupons" :key="`${c.walletId}-${c.month}`">
        <span class="font-medium text-ink-800">{{ c.walletName }}・{{ Number(c.month.slice(5)) }}月禮券</span>
        （{{ formatSeoulDate(c.firstAt) }} 首刷）：
        <span :class="c.lotteSoldOut ? 'text-ink-400 line-through' : ''">樂天免稅 100 元券</span>
        <span v-if="c.lotteSoldOut" class="text-flame-600">已額滿</span>
        ・返台 10% 券
      </li>
    </ul>

    <p class="text-xs leading-relaxed text-ink-400">
      依記帳匯率估算，記帳時直接填悠遊付扣的台幣最準。活動總額度額滿就沒有回饋，以 APP 為準。
    </p>
  </section>
</template>
