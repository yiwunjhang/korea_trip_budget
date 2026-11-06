import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase, supabaseConfigured } from '../supabase'
import { seedDefaults } from '../db/api'

/**
 * 登入狀態。記帳資料全部靠 RLS 以 auth.uid() 隔離，
 * 所以一定要先登入才看得到／寫得進自己的帳。
 */
export const useSessionStore = defineStore('session', () => {
  const userId = ref<string | null>(null)
  const email = ref<string | null>(null)
  const ready = ref(false)

  const signedIn = () => userId.value !== null

  function apply(session: { user: { id: string; email?: string | null } } | null) {
    userId.value = session?.user.id ?? null
    email.value = session?.user.email ?? null
  }

  /** 還原既有的登入狀態（App 啟動時呼叫一次） */
  async function restore() {
    if (!supabaseConfigured) {
      ready.value = true
      return
    }
    const { data } = await supabase.auth.getSession()
    apply(data.session)

    // 之後 token 自動續期或在其他分頁登出時同步更新
    supabase.auth.onAuthStateChange((_event, session) => apply(session))
    ready.value = true
  }

  async function signIn(mail: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: mail.trim(),
      password,
    })
    if (error) throw new Error(error.message)
    apply(data.session)
    await seedDefaults()
  }

  async function signUp(mail: string, password: string) {
    const { data, error } = await supabase.auth.signUp({ email: mail.trim(), password })
    if (error) throw new Error(error.message)
    // Supabase 專案若開啟 email 驗證，這裡不會拿到 session，需先去信箱點連結
    if (data.session) {
      apply(data.session)
      await seedDefaults()
      return true
    }
    return false
  }

  async function signOut() {
    await supabase.auth.signOut()
    apply(null)
  }

  return { userId, email, ready, signedIn, restore, signIn, signUp, signOut }
})
