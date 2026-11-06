import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router'
import { useSessionStore } from './stores/session'

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
