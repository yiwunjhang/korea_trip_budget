<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, X } from 'lucide-vue-next'
import type { ItineraryImage } from '../db/api'

/**
 * 行程圖片：一張就整張寬；多張就一排可以左右滑的縮圖。
 * 點圖片開全螢幕看原圖，可以左右滑／按箭頭換張，點背景或 ✕ 關閉。
 */
const props = defineProps<{ images: ItineraryImage[]; alt?: string }>()

const single = computed(() => props.images.length === 1)

/** 縮圖寬度依原圖比例，高度固定，避免一排高高低低 */
function thumbWidth(image: ItineraryImage): string {
  const ratio = Math.min(1.9, Math.max(0.6, image.ratio ?? 4 / 3))
  return `${Math.round(128 * ratio)}px`
}

/* ---------- 全螢幕檢視 ---------- */
const openIndex = ref<number | null>(null)
const current = computed(() => (openIndex.value === null ? null : props.images[openIndex.value]))

function open(i: number) {
  openIndex.value = i
}
function close() {
  openIndex.value = null
}
function step(delta: number) {
  if (openIndex.value === null) return
  const count = props.images.length
  openIndex.value = (openIndex.value + delta + count) % count
}

function onKey(e: KeyboardEvent) {
  if (openIndex.value === null) return
  if (e.key === 'Escape') close()
  else if (e.key === 'ArrowRight') step(1)
  else if (e.key === 'ArrowLeft') step(-1)
}

watch(openIndex, (i) => {
  document.body.style.overflow = i === null ? '' : 'hidden'
  if (i === null) window.removeEventListener('keydown', onKey)
  else window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKey)
})

let touchX = 0
function onTouchStart(e: TouchEvent) {
  touchX = e.touches[0].clientX
}
function onTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0].clientX - touchX
  if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1)
}
</script>

<template>
  <div v-if="images.length">
    <!-- 一張：整張寬 -->
    <button
      v-if="single"
      type="button"
      class="block w-full overflow-hidden rounded-xl bg-white/50"
      :aria-label="`放大圖片${alt ? `：${alt}` : ''}`"
      @click="open(0)"
    >
      <img
        :src="images[0].thumb"
        :alt="images[0].caption || alt || ''"
        class="max-h-64 w-full object-cover"
        loading="lazy"
        decoding="async"
      />
    </button>

    <!-- 多張：一排縮圖 -->
    <div v-else class="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      <button
        v-for="(image, i) in images"
        :key="image.thumb"
        type="button"
        class="relative h-32 shrink-0 overflow-hidden rounded-xl bg-white/50"
        :style="{ width: thumbWidth(image) }"
        :aria-label="`放大第 ${i + 1} 張圖片`"
        @click="open(i)"
      >
        <img
          :src="image.thumb"
          :alt="image.caption || alt || ''"
          class="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
        <span
          v-if="i === 0"
          class="absolute right-1.5 bottom-1.5 rounded-full bg-ink-900/55 px-1.5 text-[10px] leading-4 text-white"
        >
          {{ images.length }} 張
        </span>
      </button>
    </div>

    <!-- 全螢幕 -->
    <Teleport to="body">
      <Transition
        enter-from-class="opacity-0"
        leave-to-class="opacity-0"
        enter-active-class="transition duration-200"
        leave-active-class="transition duration-150"
      >
        <div
          v-if="current"
          class="fixed inset-0 z-[60] flex flex-col bg-ink-900/90 backdrop-blur-sm"
          role="dialog"
          aria-label="圖片檢視"
          @click.self="close"
          @touchstart.passive="onTouchStart"
          @touchend.passive="onTouchEnd"
        >
          <div class="flex items-center justify-between px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] text-sm text-white/80">
            <span class="tabular">{{ (openIndex ?? 0) + 1 }} / {{ images.length }}</span>
            <button type="button" class="rounded-full p-2 text-white" aria-label="關閉" @click="close">
              <X :size="22" />
            </button>
          </div>

          <div class="relative flex min-h-0 flex-1 items-center justify-center px-2" @click.self="close">
            <img
              :key="current.full"
              :src="current.full"
              :alt="current.caption || alt || ''"
              class="max-h-full max-w-full rounded-lg object-contain"
            />
            <template v-if="images.length > 1">
              <button
                type="button"
                class="absolute left-2 rounded-full bg-black/35 p-2 text-white"
                aria-label="上一張"
                @click="step(-1)"
              >
                <ChevronLeft :size="22" />
              </button>
              <button
                type="button"
                class="absolute right-2 rounded-full bg-black/35 p-2 text-white"
                aria-label="下一張"
                @click="step(1)"
              >
                <ChevronRight :size="22" />
              </button>
            </template>
          </div>

          <p
            class="min-h-10 px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center text-sm text-white/80"
          >
            {{ current.caption }}
          </p>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
