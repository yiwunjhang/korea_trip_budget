<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Copy, LogOut, Users } from 'lucide-vue-next'
import { useGroupStore } from '../stores/group'
import { useLedgerStore } from '../stores/ledger'
import { useSessionStore } from '../stores/session'
import { formatKRW, formatTWD, krwToTwd } from '../utils/money'
import { alertError, alertSaved, confirmDelete, toastSaved } from '../utils/alert'
import CategoryIcon from '../components/CategoryIcon.vue'
import { FIXED_CATEGORIES } from '../utils/categories'

const ledger = useLedgerStore()
const session = useSessionStore()
const group = useGroupStore()
const router = useRouter()

/* ---------- 旅伴群組 ---------- */
onMounted(() => group.refresh())

const groupMode = ref<'join' | 'create'>('join')
const groupForm = reactive({
  name: '韓國賞銀杏',
  code: '',
  /** 預設用 email @ 前面那段當名字 */
  displayName: session.email?.split('@')[0] ?? '',
})

const me = computed(() => group.members.find((m) => m.user_id === session.userId))
const myName = ref('')
watch(me, (m) => (myName.value = m?.display_name ?? ''), { immediate: true })

async function submitGroup() {
  const name = groupForm.displayName.trim()
  if (!name) return alertError('請輸入你在群組裡的名字', '還差一步')
  const ok =
    groupMode.value === 'create'
      ? await group.create(groupForm.name, name)
      : await group.join(groupForm.code, name)
  if (ok) {
    alertSaved(
      groupMode.value === 'create' ? '群組建立好了' : '已加入群組',
      groupMode.value === 'create' ? `把邀請碼 ${group.group?.invite_code} 傳給旅伴` : undefined,
    )
  } else {
    alertError(group.error || '請稍後再試', groupMode.value === 'create' ? '建立失敗' : '加入失敗')
  }
}

async function copyCode() {
  if (!group.group) return
  try {
    await navigator.clipboard.writeText(group.group.invite_code)
    toastSaved('邀請碼已複製')
  } catch {
    alertError(`請手動複製：${group.group.invite_code}`, '無法自動複製')
  }
}

async function saveMyName() {
  const name = myName.value.trim()
  if (!name || name === me.value?.display_name) return
  if (await group.rename(name)) toastSaved('名字已更新')
  else alertError(group.error || '請稍後再試')
}

async function leaveGroup() {
  if (!(await confirmDelete('退出群組？', '你的帳不會被刪除，只是旅伴看不到你的花費統計。'))) return
  if (await group.leave()) toastSaved('已退出群組')
  else alertError(group.error || '請稍後再試', '退出失敗')
}

const form = reactive({
  title: '',
  start_date: '',
  end_date: '',
  budget_krw: 0,
  budget_twd: 0,
  krw_per_twd: 43,
})

/** 設定載入後填進表單 */
watch(
  () => ledger.settings,
  (s) => {
    if (!s) return
    form.title = s.title
    form.start_date = s.start_date ?? ''
    form.end_date = s.end_date ?? ''
    form.budget_krw = s.budget_krw
    form.budget_twd = s.budget_twd
    form.krw_per_twd = s.krw_per_twd
  },
  { immediate: true },
)

async function save() {
  const ok = await ledger.saveSettings({
    title: form.title.trim() || '韓國旅行',
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    budget_krw: form.budget_krw || 0,
    budget_twd: form.budget_twd || 0,
    krw_per_twd: form.krw_per_twd > 0 ? form.krw_per_twd : 43,
  })
  if (ok) alertSaved('設定已儲存')
  else alertError(ledger.error || '請稍後再試')
}

async function logout() {
  await session.signOut()
  group.reset()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <div class="space-y-5">
    <!-- 旅行與預算 -->
    <form class="card space-y-4" @submit.prevent="save">
      <h2 class="text-sm font-semibold text-ink-800">旅行與預算</h2>

      <div>
        <label class="label" for="s-title">旅行名稱</label>
        <input id="s-title" v-model="form.title" class="field" placeholder="韓國旅行" />
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="label" for="s-start">出發日</label>
          <input id="s-start" v-model="form.start_date" class="field" type="date" />
        </div>
        <div>
          <label class="label" for="s-end">回程日</label>
          <input id="s-end" v-model="form.end_date" class="field" type="date" />
        </div>
      </div>

      <div>
        <label class="label" for="s-rate">預設匯率（1 台幣 = ? 韓元）</label>
        <input
          id="s-rate"
          v-model.number="form.krw_per_twd"
          class="field tabular"
          type="number"
          step="0.01"
          min="0.01"
        />
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="label" for="s-budget-krw">韓元預算</label>
          <input
            id="s-budget-krw"
            v-model.number="form.budget_krw"
            class="field tabular"
            type="number"
            step="1"
            min="0"
          />
          <p class="tabular mt-1 text-xs text-ink-400">
            ≈ {{ formatTWD(krwToTwd(form.budget_krw, form.krw_per_twd)) }}
          </p>
        </div>
        <div>
          <label class="label" for="s-budget-twd">台幣預算</label>
          <input
            id="s-budget-twd"
            v-model.number="form.budget_twd"
            class="field tabular"
            type="number"
            step="1"
            min="0"
          />
          <p class="tabular mt-1 text-xs text-ink-400">
            ≈ {{ formatKRW(form.budget_twd * form.krw_per_twd) }}
          </p>
        </div>
      </div>

      <p class="rounded-xl bg-brand-50 px-3 py-2 text-xs text-ink-600">
        每一筆花費都會同時換算成韓元與台幣，兩個預算各自扣一次（看的是同一筆錢的兩種幣別）。
        習慣看哪一邊就設那一邊，另一邊填 0 就不顯示進度。
        <b>預算不含機票、住宿</b>，只管旅途中的花費；機票、住宿會算進總花費。
      </p>

      <div class="flex items-center gap-3">
        <button class="btn-primary flex-1" type="submit">儲存設定</button>
      </div>
    </form>

    <!-- 旅伴群組 -->
    <section class="card space-y-3">
      <h2 class="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
        <Users :size="16" class="text-brand-600" /> 旅伴群組
      </h2>

      <!-- 已在群組 -->
      <template v-if="group.group">
        <div class="flex items-center justify-between gap-2 rounded-xl bg-brand-50/80 px-3 py-2.5">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-ink-900">{{ group.group.name }}</p>
            <p class="text-xs text-ink-600">
              邀請碼 <b class="tabular tracking-widest text-ink-900">{{ group.group.invite_code }}</b>
            </p>
          </div>
          <button type="button" class="btn-ghost shrink-0 px-3 py-1.5 text-xs" @click="copyCode">
            <Copy :size="14" /> 複製
          </button>
        </div>

        <div>
          <span class="label">成員（{{ group.members.length }}）</span>
          <ul class="flex flex-wrap gap-2">
            <li
              v-for="m in group.members"
              :key="m.user_id"
              class="chip"
              :class="{ 'chip-on': m.user_id === session.userId }"
            >
              {{ m.display_name }}<template v-if="m.user_id === session.userId">（我）</template>
            </li>
          </ul>
        </div>

        <form class="flex gap-2" @submit.prevent="saveMyName">
          <input v-model="myName" class="field flex-1" placeholder="我在群組裡的名字" />
          <button class="btn-ghost" type="submit">改名</button>
        </form>

        <button type="button" class="flex items-center gap-1 text-xs text-ink-400" @click="leaveGroup">
          <LogOut :size="13" /> 退出群組
        </button>
      </template>

      <!-- 還沒加入 -->
      <template v-else>
        <p class="text-xs leading-relaxed text-ink-600">
          各自用自己的帳號記帳，加入同一個群組後，在「總覽」可以一起看每天誰在哪個分類花了多少。
          旅伴只看得到統計，看不到你的每一筆明細和餘額。
        </p>

        <div class="flex rounded-full bg-white/60 p-0.5 text-sm">
          <button
            v-for="m in [{ v: 'join', l: '輸入邀請碼加入' }, { v: 'create', l: '建立新群組' }] as const"
            :key="m.v"
            type="button"
            class="flex-1 rounded-full py-1.5 transition"
            :class="groupMode === m.v ? 'bg-white font-semibold text-ink-900 shadow-sm' : 'text-ink-600'"
            @click="groupMode = m.v"
          >
            {{ m.l }}
          </button>
        </div>

        <form class="space-y-2" @submit.prevent="submitGroup">
          <input
            v-if="groupMode === 'join'"
            v-model="groupForm.code"
            class="field tabular uppercase tracking-widest"
            placeholder="6 碼邀請碼"
            maxlength="6"
            autocapitalize="characters"
          />
          <input v-else v-model="groupForm.name" class="field" placeholder="群組名稱" />
          <input v-model="groupForm.displayName" class="field" placeholder="你的名字（旅伴看到的）" />
          <button class="btn-primary w-full" type="submit" :disabled="group.loading">
            {{ groupMode === 'join' ? '加入' : '建立並取得邀請碼' }}
          </button>
        </form>
      </template>
    </section>

    <!-- 分類（固定） -->
    <section class="card space-y-3">
      <h2 class="text-sm font-semibold text-ink-800">消費分類</h2>
      <ul class="flex flex-wrap gap-2">
        <li v-for="c in FIXED_CATEGORIES" :key="c.name" class="chip">
          <span class="h-2.5 w-2.5 rounded-sm" :style="{ background: c.color }" />
          <CategoryIcon :name="c.name" :size="16" class="text-ink-600" />
          {{ c.name }}
        </li>
      </ul>
      <p class="text-xs text-ink-400">分類是固定的，旅伴之間才能互相比較。</p>
    </section>

    <!-- 統計小結 -->
    <section v-if="ledger.summary" class="card space-y-1 text-sm text-ink-600">
      <h2 class="text-sm font-semibold text-ink-800">目前總計</h2>
      <p class="tabular">
        共 {{ ledger.summary.entry_count }} 筆、{{ ledger.summary.spend_days }} 天有花費
      </p>
      <p class="tabular">
        總花費 {{ formatKRW(ledger.summary.total_spent_krw) }}（{{ formatTWD(ledger.summary.total_spent_twd) }}）
      </p>
      <p class="tabular text-xs text-ink-400">
        其中算進預算的（不含機票、住宿）{{ formatKRW(ledger.summary.spent_krw) }}
      </p>
    </section>

    <!-- 帳號 -->
    <section class="card space-y-3">
      <h2 class="text-sm font-semibold text-ink-800">帳號</h2>
      <p class="text-sm text-ink-600">{{ session.email }}</p>
      <button class="btn-ghost w-full" @click="logout">登出</button>
    </section>
  </div>
</template>
