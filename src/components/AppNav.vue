<script setup lang="ts">
import { ChartPie, PenLine, ReceiptText, Settings, Wallet } from 'lucide-vue-next'

// 底部導覽：旅行中單手操作，所以放在拇指可及的位置。記帳放第一個。
const tabs = [
  { name: 'home', label: '記帳', icon: PenLine },
  { name: 'overview', label: '總覽', icon: ChartPie },
  { name: 'records', label: '明細', icon: ReceiptText },
  { name: 'wallets', label: '錢包', icon: Wallet },
  { name: 'settings', label: '設定', icon: Settings },
] as const
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-20 border-t border-white/60 bg-white/40 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-16px_rgba(122,80,4,0.35)] backdrop-blur-xl backdrop-saturate-150"
  >
    <div class="mx-auto grid max-w-xl grid-cols-5">
      <router-link
        v-for="tab in tabs"
        :key="tab.name"
        v-slot="{ isExactActive, navigate, href }"
        :to="{ name: tab.name }"
        custom
      >
        <a
          :href="href"
          class="flex flex-col items-center gap-1 py-2 text-[11px] transition"
          :class="isExactActive ? 'font-semibold text-brand-600' : 'text-ink-400'"
          @click="navigate"
        >
          <span
            class="flex h-7 w-12 items-center justify-center rounded-full transition"
            :class="isExactActive ? 'bg-brand-100/80' : ''"
          >
            <component :is="tab.icon" :size="20" :stroke-width="isExactActive ? 2.25 : 1.75" />
          </span>
          {{ tab.label }}
        </a>
      </router-link>
    </div>
  </nav>
</template>
