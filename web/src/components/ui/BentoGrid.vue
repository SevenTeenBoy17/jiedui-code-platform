<template>
  <div class="bento"><slot /></div>
</template>

<script setup lang="ts">
// 响应式 bento 网格（F1）。min=每列最小宽，gap=间距。
withDefaults(defineProps<{ min?: string; gap?: string }>(), { min: '150px', gap: 'var(--sp-4)' })
</script>

<style scoped>
.bento {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(v-bind(min), 1fr));
  gap: v-bind(gap);
}
</style>
