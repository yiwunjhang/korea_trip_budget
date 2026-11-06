<script setup lang="ts">
// 底部導覽：旅行中單手操作，所以放在拇指可及的位置
const tabs = [
  { name: 'home', label: '總覽', icon: '🏠' },
  { name: 'records', label: '明細', icon: '🧾' },
  { name: 'wallets', label: '錢包', icon: '👛' },
  { name: 'settings', label: '設定', icon: '⚙️' },
] as const
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
  >
    <div class="mx-auto grid max-w-xl grid-cols-4">
      <router-link
        v-for="tab in tabs"
        :key="tab.name"
        :to="{ name: tab.name }"
        class="flex flex-col items-center gap-0.5 py-2.5 text-xs text-ink-400 transition"
        active-class="text-brand-600"
      >
        <span class="text-lg leading-none">{{ tab.icon }}</span>
        {{ tab.label }}
      </router-link>
    </div>
  </nav>
</template>
