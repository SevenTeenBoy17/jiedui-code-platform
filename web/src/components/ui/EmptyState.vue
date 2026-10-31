<!-- 通用真空态：插画 + 一句话 + 可选 CTA。调用方须保证只在「确认加载成功且确实为空」时渲染 -->
<template>
  <div class="es">
    <img v-if="icon" :src="asset(icon)" class="es__img" alt="" />
    <p class="es__t">{{ title }}</p>
    <!-- ctaIcon（R5 裁决2）：CTA 文案里的全角＋前缀改为真图标，由调用方按需传入 -->
    <BaseButton v-if="cta" variant="secondary" size="sm" @click="emit('cta')">
      <BaseIcon v-if="ctaIcon" :name="ctaIcon" :size="14" />{{ cta }}
    </BaseButton>
  </div>
</template>

<script setup lang="ts">
import { asset } from '@/assets/assets'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseIcon, { type IconName } from '@/components/ui/BaseIcon.vue'

defineProps<{ icon?: string; title: string; cta?: string; ctaIcon?: IconName }>()
const emit = defineEmits<{ (e: 'cta'): void }>()
</script>

<style scoped>
/* grid-column 撑满 BentoGrid 整行；在普通 flex/块容器里无副作用 */
.es { grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center;
  gap: var(--sp-2); padding: var(--sp-5); text-align: center; }
.es__img { width: 96px; height: 96px; }
.es__t { font-size: var(--fs-sm); color: var(--color-text-3); }
</style>
