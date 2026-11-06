import { createRouter, createWebHashHistory } from 'vue-router'
import { useSessionStore } from '../stores/session'

// hash 模式：部署到 GitHub Pages 重新整理也不會 404
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      meta: { requiresUser: true },
    },
    {
      path: '/itinerary',
      name: 'itinerary',
      component: () => import('../views/ItineraryView.vue'),
      meta: { requiresUser: true },
    },
    {
      path: '/overview',
      name: 'overview',
      component: () => import('../views/OverviewView.vue'),
      meta: { requiresUser: true },
    },
    {
      path: '/records',
      name: 'records',
      component: () => import('../views/RecordsView.vue'),
      meta: { requiresUser: true },
    },
    {
      path: '/wallets',
      name: 'wallets',
      component: () => import('../views/WalletsView.vue'),
      meta: { requiresUser: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
      meta: { requiresUser: true },
    },
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const session = useSessionStore()
  if (to.meta.requiresUser && !session.signedIn()) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.name === 'login' && session.signedIn()) {
    return { name: 'home' }
  }
  return true
})

export default router
