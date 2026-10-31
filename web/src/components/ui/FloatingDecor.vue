<template>
  <div class="decor" aria-hidden="true">
    <img v-for="(it, i) in items" :key="i" :src="asset(it.icon)" class="decor__it float"
         :style="{ top: it.top, left: it.left, right: it.right, bottom: it.bottom,
                   width: it.size || '56px', animationDelay: i * 0.6 + 's' }" alt="" />
  </div>
</template>

<script setup lang="ts">
import { asset } from '@/assets/assets'
// 漂浮 3D 装饰层（F1）。纯装饰 → aria-hidden；用全局 float 动画，reduced-motion/低配自动停动。
defineProps<{
  items: { icon: string; top?: string; left?: string; right?: string; bottom?: string; size?: string }[]
}>()
</script>

<style scoped>
.decor { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 0; }
.decor__it {
  position: absolute;
  animation: float 5s var(--ease) infinite;
  filter: drop-shadow(0 6px 12px var(--ink-a12));
  opacity: .92;
}
</style>
