<template>
  <div class="pair-duo-illustration" role="img" :aria-label="label">
    <img class="pair-duo-illustration__horse" :src="horseSource" alt="" aria-hidden="true" decoding="async" />
    <img class="pair-duo-illustration__panda" :src="pandaSource" alt="" aria-hidden="true" decoding="async" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { asset } from '@/assets/assets'

const props = withDefaults(defineProps<{
  label?: string
  scene?: 'welcome' | 'plan' | 'review' | 'celebrate'
}>(), {
  label: '树小骥导航员与熊猫泡泡领航员陪伴编程学习',
  scene: 'welcome',
})
const horseSource = computed(() => asset(props.scene === 'celebrate' ? 'ip_horse_celebrate' : props.scene === 'plan' ? 'ip_horse_plan' : 'ip_horse'))
const pandaSource = computed(() => asset(props.scene === 'review' ? 'ip_panda_check' : props.scene === 'plan' ? 'ip_panda_thinking' : 'ip_panda'))
</script>

<style scoped>
.pair-duo-illustration {
  position: relative;
  isolation: isolate;
  aspect-ratio: 4 / 3;
  min-width: 0;
}
.pair-duo-illustration > img {
  position: absolute;
  display: block;
  object-fit: contain;
  object-position: center bottom;
  pointer-events: none;
}
.pair-duo-illustration__horse {
  z-index: 1;
  left: 0;
  bottom: 3%;
  width: 55%;
  height: 93%;
}
.pair-duo-illustration__panda {
  z-index: 2;
  right: 0;
  bottom: 0;
  width: 50%;
  height: 84%;
}
</style>
