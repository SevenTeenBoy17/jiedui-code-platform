<template>
  <div class="ring" :style="ringStyle" role="img" :aria-label="`${value}%`">
    <div class="ring__hole"><slot>{{ value }}</slot></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
// 环形进度/指标（F1）。纯 CSS conic-gradient，低配友好，不额外拉 ECharts。
const props = withDefaults(
  defineProps<{ value: number; size?: string; color?: string; track?: string }>(),
  { size: '72px', color: 'var(--color-primary)', track: 'var(--color-fill-2)' },
)
const ringStyle = computed(() => {
  const deg = Math.max(0, Math.min(100, props.value)) * 3.6
  return {
    width: props.size,
    height: props.size,
    background: `conic-gradient(${props.color} ${deg}deg, ${props.track} 0)`,
  }
})
</script>

<style scoped>
.ring { border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; }
.ring__hole {
  width: 74%; height: 74%; background: var(--color-surface); border-radius: 50%;
  display: grid; place-items: center; font-weight: var(--fw-bold); font-size: var(--fs-sm); color: var(--color-text);
}
</style>
