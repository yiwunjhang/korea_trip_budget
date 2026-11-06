<script setup lang="ts">
import { computed } from 'vue'
import { fixedCategoryIcon } from '../utils/categories'
import { categoryIcon } from '../utils/categoryIcons'

/** 依分類名稱顯示線條圖示：固定分類用指定圖示，其他（加值、舊資料）依名稱猜 */
const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })

const icon = computed(() => categoryIcon(props.name, fixedCategoryIcon(props.name)))
</script>

<template>
  <component :is="icon" :size="size" :stroke-width="1.75" aria-hidden="true" />
</template>
