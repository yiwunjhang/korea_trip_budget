<script setup lang="ts">
/**
 * 背景的銀杏葉：固定在畫面後方、稍微模糊，讓前面的毛玻璃卡片透出金黃色。
 * 純裝飾，不吃點擊；有開「減少動態效果」的話就不飄。
 */
const leaves = [
  { left: '6%', top: '8%', size: 92, rotate: -24, blur: 1, opacity: 0.3, color: '#f4c22b', delay: 0 },
  { left: '72%', top: '4%', size: 120, rotate: 32, blur: 3, opacity: 0.25, color: '#e3a50b', delay: -4 },
  { left: '82%', top: '42%', size: 70, rotate: -48, blur: 0, opacity: 0.32, color: '#f9d873', delay: -8 },
  { left: '-4%', top: '48%', size: 140, rotate: 18, blur: 4, opacity: 0.22, color: '#f4c22b', delay: -2 },
  { left: '40%', top: '70%', size: 84, rotate: -12, blur: 2, opacity: 0.25, color: '#e3a50b', delay: -6 },
  { left: '78%', top: '80%', size: 110, rotate: 40, blur: 3, opacity: 0.28, color: '#f4c22b', delay: -10 },
  { left: '20%', top: '28%', size: 46, rotate: 60, blur: 0, opacity: 0.3, color: '#a8b82c', delay: -3 },
]
</script>

<template>
  <div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
    <svg
      v-for="(leaf, i) in leaves"
      :key="i"
      class="leaf absolute"
      viewBox="0 0 100 100"
      :width="leaf.size"
      :height="leaf.size"
      :style="{
        left: leaf.left,
        top: leaf.top,
        opacity: leaf.opacity,
        filter: `blur(${leaf.blur}px)`,
        '--r': `${leaf.rotate}deg`,
        animationDelay: `${leaf.delay}s`,
      }"
    >
      <!-- 扇形葉片，中間一道淺凹口，下方葉柄 -->
      <path
        d="M50 64 C30 62 9 48 6 24 C19 11 37 7 47 19 L50 29 L53 19 C63 7 81 11 94 24 C91 48 70 62 50 64 Z"
        :fill="leaf.color"
      />
      <path d="M50 64 L50 94" :stroke="leaf.color" stroke-width="3" stroke-linecap="round" />
      <!-- 葉脈 -->
      <path
        d="M50 62 L20 28 M50 62 L35 18 M50 62 L65 18 M50 62 L80 28"
        stroke="#fff"
        stroke-opacity="0.35"
        stroke-width="1.2"
        fill="none"
      />
    </svg>
  </div>
</template>

<style scoped>
.leaf {
  transform: rotate(var(--r));
  animation: sway 14s ease-in-out infinite;
}

@keyframes sway {
  0%,
  100% {
    transform: translate(0, 0) rotate(var(--r));
  }
  50% {
    transform: translate(10px, 14px) rotate(calc(var(--r) + 10deg));
  }
}

@media (prefers-reduced-motion: reduce) {
  .leaf {
    animation: none;
  }
}
</style>
