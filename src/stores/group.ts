import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as api from '../db/api'
import type { GroupSpendingRow, TripGroup, TripMember } from '../db/api'
import { useSessionStore } from './session'

/**
 * 旅伴群組：各自記帳，但總覽可以一起看「每天 × 每人 × 分類」花了多少。
 * 只拿得到彙總數字，看不到別人的明細與餘額（資料庫 group_spending() 把關）。
 */
export const useGroupStore = defineStore('group', () => {
  const group = ref<TripGroup | null>(null)
  const members = ref<TripMember[]>([])
  const spending = ref<GroupSpendingRow[]>([])
  const loading = ref(false)
  const error = ref('')

  async function run(task: () => Promise<void>): Promise<boolean> {
    error.value = ''
    try {
      await task()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return false
    }
  }

  /** 載入我的群組、成員與彙總花費 */
  async function refresh() {
    loading.value = true
    await run(async () => {
      const mine = await api.getMyGroup()
      group.value = mine?.group ?? null
      members.value = mine?.members ?? []
      spending.value = mine ? await api.getGroupSpending(mine.group.id) : []
    })
    loading.value = false
  }

  async function create(name: string, displayName: string) {
    const ok = await run(() => api.createGroup(name, displayName).then(() => undefined))
    if (ok) await refresh()
    return ok
  }

  async function join(code: string, displayName: string) {
    const ok = await run(() => api.joinGroup(code, displayName).then(() => undefined))
    if (ok) await refresh()
    return ok
  }

  async function rename(displayName: string) {
    const userId = useSessionStore().userId
    if (!group.value || !userId) return false
    const ok = await run(() => api.renameMe(group.value!.id, userId, displayName))
    if (ok) await refresh()
    return ok
  }

  async function leave() {
    const userId = useSessionStore().userId
    if (!group.value || !userId) return false
    const ok = await run(() => api.leaveGroup(group.value!.id, userId))
    if (ok) await refresh()
    return ok
  }

  function reset() {
    group.value = null
    members.value = []
    spending.value = []
  }

  return { group, members, spending, loading, error, refresh, create, join, rename, leave, reset }
})
