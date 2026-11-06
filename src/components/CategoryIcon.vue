<script setup lang="ts">
import { computed } from 'vue'
import { useLedgerStore } from '../stores/ledger'
import { categoryIcon } from '../utils/categoryIcons'

/** 依分類名稱顯示線條圖示（取代原本的 emoji） */
const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })

const ledger = useLedgerStore()
const icon = computed(() =>
  categoryIcon(props.name, ledger.categories.find((c) => c.name === props.name)?.emoji),
)
</script>

<template>
  <component :is="icon" :size="size" :stroke-width="1.75" aria-hidden="true" />
</template>
