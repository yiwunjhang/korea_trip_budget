<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session'
import { supabaseConfigured } from '../supabase'

const session = useSessionStore()
const router = useRouter()
const route = useRoute()

const mode = ref<'signin' | 'signup'>('signin')
const email = ref('')
const password = ref('')
const busy = ref(false)
const message = ref('')
const error = ref('')

async function submit() {
  busy.value = true
  error.value = ''
  message.value = ''
  try {
    if (mode.value === 'signin') {
      await session.signIn(email.value, password.value)
    } else {
      const hasSession = await session.signUp(email.value, password.value)
      if (!hasSession) {
        message.value = '註冊成功，請到信箱點驗證連結後再登入。'
        return
      }
    }
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mx-auto mt-10 max-w-sm">
    <h1 class="text-center text-2xl font-bold text-ink-900">🇰🇷 韓國旅行記帳</h1>
    <p class="mt-1 text-center text-sm text-ink-600">韓元／台幣雙幣別，花多少就扣多少</p>

    <form class="card mt-6 space-y-4" @submit.prevent="submit">
      <div>
        <label class="label" for="email">Email</label>
        <input
          id="email"
          v-model="email"
          class="field"
          type="email"
          autocomplete="email"
          required
        />
      </div>

      <div>
        <label class="label" for="password">密碼</label>
        <input
          id="password"
          v-model="password"
          class="field"
          type="password"
          autocomplete="current-password"
          minlength="6"
          required
        />
      </div>

      <button class="btn-primary w-full" type="submit" :disabled="busy || !supabaseConfigured">
        {{ busy ? '處理中…' : mode === 'signin' ? '登入' : '註冊' }}
      </button>

      <p v-if="error" class="text-sm text-flame-600">{{ error }}</p>
      <p v-if="message" class="text-sm text-mint-600">{{ message }}</p>

      <button
        type="button"
        class="w-full text-center text-sm text-brand-600"
        @click="mode = mode === 'signin' ? 'signup' : 'signin'"
      >
        {{ mode === 'signin' ? '還沒有帳號？註冊一個' : '已經有帳號？回去登入' }}
      </button>
    </form>
  </div>
</template>
