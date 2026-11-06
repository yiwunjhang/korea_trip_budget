<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppNav from './components/AppNav.vue'
import { useSessionStore } from './stores/session'
import { useLedgerStore } from './stores/ledger'
import { supabaseConfigured } from './supabase'

const route = useRoute()
const session = useSessionStore()
const ledger = useLedgerStore()

const showNav = computed(() => session.signedIn() && route.name !== 'login')
const title = computed(() => ledger.settings?.title || '韓國旅行記帳')

/** 登入後載入整本帳；新帳號則先建立預設錢包與分類 */
async function load() {
  if (!session.signedIn()) return
  await ledger.refresh()
  await ledger.ensureSeeded()
}

onMounted(load)
watch(() => session.userId, load)
</script>

<template>
  <div class="min-h-screen bg-canvas pb-24">
    <header
      v-if="showNav"
      class="sticky top-0 z-10 border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur"
    >
      <div class="mx-auto flex max-w-xl items-center justify-between">
        <h1 class="text-base font-bold text-ink-900">🇰🇷 {{ title }}</h1>
        <span v-if="ledger.loading" class="text-xs text-ink-400">同步中…</span>
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
