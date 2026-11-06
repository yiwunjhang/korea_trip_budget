<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useLedgerStore } from '../stores/ledger'
import { useSessionStore } from '../stores/session'
import { formatKRW, formatTWD, krwToTwd } from '../utils/money'

const ledger = useLedgerStore()
const session = useSessionStore()
const router = useRouter()

const form = reactive({
  title: '',
  start_date: '',
  end_date: '',
  budget_krw: 0,
  budget_twd: 0,
  krw_per_twd: 43,
})

const saved = ref(false)
const newCategory = ref('')
const newEmoji = ref('💸')

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
  await ledger.saveSettings({
    title: form.title.trim() || '韓國旅行',
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    budget_krw: form.budget_krw || 0,
    budget_twd: form.budget_twd || 0,
    krw_per_twd: form.krw_per_twd > 0 ? form.krw_per_twd : 43,
  })
  saved.value = true
  setTimeout(() => (saved.value = false), 2000)
}

async function addCategory() {
  const name = newCategory.value.trim()
  if (!name) return
  await ledger.addCategory(name, newEmoji.value.trim() || '💸')
  newCategory.value = ''
  newEmoji.value = '💸'
}

async function logout() {
  await session.signOut()
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
      </p>

      <div class="flex items-center gap-3">
        <button class="btn-primary flex-1" type="submit">儲存設定</button>
        <span v-if="saved" class="text-sm text-mint-600">已儲存</span>
      </div>
    </form>

    <!-- 分類 -->
    <section class="card space-y-3">
      <h2 class="text-sm font-semibold text-ink-800">消費分類</h2>

      <ul class="flex flex-wrap gap-2">
        <li v-for="c in ledger.categories" :key="c.id">
          <span class="chip">
            {{ c.emoji }} {{ c.name }}
            <button
              type="button"
              class="ml-1 text-ink-400 transition hover:text-flame-600"
              aria-label="刪除分類"
              @click="ledger.removeCategory(c.id)"
            >
              ✕
            </button>
          </span>
        </li>
      </ul>

      <form class="flex gap-2" @submit.prevent="addCategory">
        <input v-model="newEmoji" class="field w-16 text-center" maxlength="4" />
        <input v-model="newCategory" class="field flex-1" placeholder="新分類名稱" />
        <button class="btn-ghost" type="submit">新增</button>
      </form>
      <p class="text-xs text-ink-400">
        刪除分類不會動到已經記過的帳（帳上存的是分類名稱文字）。
      </p>
    </section>

    <!-- 統計小結 -->
    <section v-if="ledger.summary" class="card space-y-1 text-sm text-ink-600">
      <h2 class="text-sm font-semibold text-ink-800">目前總計</h2>
      <p class="tabular">
        共 {{ ledger.summary.entry_count }} 筆、{{ ledger.summary.spend_days }} 天有花費
      </p>
      <p class="tabular">
        韓元花費 {{ formatKRW(ledger.summary.spent_krw) }}；台幣花費
        {{ formatTWD(ledger.summary.spent_twd) }}
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
