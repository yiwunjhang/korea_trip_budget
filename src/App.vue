<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Leaf, Settings } from 'lucide-vue-next'
import AppNav from './components/AppNav.vue'
import GinkgoBackdrop from './components/GinkgoBackdrop.vue'
import { useSessionStore } from './stores/session'
import { useLedgerStore } from './stores/ledger'
import { useItineraryStore } from './stores/itinerary'
import { useGroupStore } from './stores/group'
import { supabaseConfigured } from './supabase'

const route = useRoute()
const session = useSessionStore()
const ledger = useLedgerStore()

const showNav = computed(() => session.signedIn() && route.name !== 'login')
/** 沒登入看公開的行程頁：顯示簡單的標題列（登入按鈕），沒有底部導覽 */
const showPublicHeader = computed(() => !session.signedIn() && route.meta.public === true)
const title = computed(() => ledger.settings?.title || (showPublicHeader.value ? '韓國旅行行程' : '韓國旅行記帳'))

/** 登入後載入整本帳；新帳號則先建立預設錢包與分類 */
async function load() {
  if (!session.signedIn()) return
  const group = useGroupStore()
  await Promise.all([ledger.refresh(), group.refresh()])
  await ledger.ensureSeeded()
  // 行程在背景載入（先用手機裡的快取），不擋記帳畫面；有群組就用群組共用的行程
  useItineraryStore().load()
}

onMounted(load)
watch(() => session.userId, load)

/**
 * 從別的 App 切回來、或回到這個分頁時，重新同步帳目
 * （例如在 Supabase 直接匯入、或在另一支手機記了帳）。30 秒內不重複載入。
 */
function onVisible() {
  if (document.visibilityState === 'visible' && session.signedIn()) ledger.refreshIfStale()
}
onMounted(() => document.addEventListener('visibilitychange', onVisible))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))
</script>

<template>
  <div class="relative isolate min-h-screen pb-24">
    <GinkgoBackdrop />

    <header
      v-if="showNav || showPublicHeader"
      class="sticky top-0 z-10 border-b border-white/60 bg-white/35 px-4 py-3 backdrop-blur-xl backdrop-saturate-150"
    >
      <div class="mx-auto flex max-w-xl items-center justify-between">
        <h1 class="flex items-center gap-1.5 text-base font-bold text-ink-900">
          <Leaf :size="18" :stroke-width="2" class="text-brand-500" aria-hidden="true" />
          {{ title }}
        </h1>
        <router-link
          v-if="showPublicHeader"
          :to="{ name: 'login' }"
          class="rounded-full bg-white/70 px-3 py-1.5 text-xs font-medium text-brand-700"
        >
          登入記帳
        </router-link>
        <div v-else class="flex items-center gap-2">
          <span v-if="ledger.loading" class="text-xs text-ink-400">同步中…</span>
          <router-link
            :to="{ name: 'settings' }"
            class="rounded-full p-1.5 text-ink-600 transition hover:bg-white/60"
            active-class="bg-white/70 text-brand-600"
            aria-label="設定"
          >
            <Settings :size="19" />
          </router-link>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-xl px-4 py-4">
      <p
        v-if="!supabaseConfigured"
        class="mb-4 rounded-xl border border-flame-100 bg-flame-50 px-4 py-3 text-sm text-flame-600"
      >
        尚未設定 Supabase 連線（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY），請參考 README。
      </p>

      <p
        v-if="ledger.error"
        class="mb-4 rounded-xl border border-flame-100 bg-flame-50 px-4 py-3 text-sm text-flame-600"
      >
        {{ ledger.error }}
      </p>

      <router-view />
    </main>

    <AppNav v-if="showNav" />
  </div>
</template>
