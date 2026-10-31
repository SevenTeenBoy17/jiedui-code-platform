<template>
  <div class="gp glass" :class="{ 'glass--strong': strong }"><slot /></div>
</template>

<script setup lang="ts">
// 磨砂玻璃容器（F1）。材质由全局 .glass 提供（含 -webkit- 前缀 + [data-app=teacher] 冷色 + [data-cap=low] 降级）。
withDefaults(defineProps<{ strong?: boolean }>(), { strong: false })
</script>

<style scoped>
.gp { padding: var(--sp-4); }
</style>
