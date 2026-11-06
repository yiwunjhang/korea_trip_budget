import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** 是否已正確設定 Supabase 連線資訊 */
export const supabaseConfigured = Boolean(url && anonKey)

if (!supabaseConfigured) {
  // 未設定時給出明確提示，方便部署時排錯
  console.error(
    '[Supabase] 缺少環境變數 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY，請參考 README 設定。',
  )
}

// 未設定時用合法格式的佔位值，避免 createClient 於載入期拋錯而白畫面；
// UI 會依 supabaseConfigured 顯示提示。
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
)
