<template>
  <span class="pw" :style="{ color }">{{ text }}</span>
</template>

<script setup lang="ts">
// 像素风品牌字（F1 · 登录 hero）。以等宽粗体 + 方块投影模拟像素质感（后续可换真像素 webfont）。
withDefaults(defineProps<{ text: string; color?: string }>(), { color: 'var(--color-accent)' })
</script>

<style scoped>
.pw {
  font-family: var(--font-code);
  font-weight: 800;
  letter-spacing: .06em;
  font-size: var(--fs-2xl);
  line-height: 1.1;
  text-shadow: 2px 2px 0 var(--ink-a12);
}
</style>
