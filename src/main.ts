import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router'
import { useSessionStore } from './stores/session'

/**
 * 部署新版後，舊分頁要載入的頁面檔（例如 SettingsView-xxxx.js）已經被換掉，
 * 會出現「Failed to fetch dynamically imported module」。
 * 遇到這種情況就自動重新整理一次，拿到新版；10 秒內不重複重整，避免無限循環。
 */
const RELOAD_KEY = 'korea-trip:chunk-reload-at'

function reloadForNewVersion(targetPath?: string): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    if (Date.now() - last < 10_000) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    /* 私密模式拿不到 sessionStorage，還是重整一次 */
  }
  // hash 路由：先把網址換成要去的頁面，重整後直接到那裡
  if (targetPath) window.location.hash = `#${targetPath}`
  window.location.reload()
  return true
}

const isStaleChunkError = (message: string) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
    message,
  )

// Vite 預先載入檔案失敗時會發出這個事件
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewVersion()) event.preventDefault()
})

// 切換頁面時載入頁面檔失敗
router.onError((error, to) => {
  if (error instanceof Error && isStaleChunkError(error.message)) reloadForNewVersion(to.fullPath)
})

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)

  // 先還原 Supabase 登入狀態，再掛載，避免路由守衛誤判
  const session = useSessionStore(pinia)
  await session.restore()

  app.use(router)
  app.mount('#app')
}

bootstrap()
