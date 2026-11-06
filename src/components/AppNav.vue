<script setup lang="ts">
// 底部導覽：旅行中單手操作，所以放在拇指可及的位置。記帳放第一個。
const tabs = [
  { name: 'home', label: '記帳', icon: '✏️' },
  { name: 'overview', label: '總覽', icon: '📊' },
  { name: 'records', label: '明細', icon: '🧾' },
  { name: 'wallets', label: '錢包', icon: '👛' },
  { name: 'settings', label: '設定', icon: '⚙️' },
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
        :to="{ name: tab.name }"
        class="flex flex-col items-center gap-0.5 py-2.5 text-xs text-ink-400 transition"
        exact-active-class="font-semibold !text-brand-600"
      >
        <span class="text-lg leading-none">{{ tab.icon }}</span>
        {{ tab.label }}
      </router-link>
    </div>
  </nav>
</template>
