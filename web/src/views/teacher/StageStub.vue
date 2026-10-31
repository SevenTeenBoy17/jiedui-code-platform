<template>
  <!-- 阶段占位（V3）：明确标注"尚未实装"，避免假功能误导教师。 -->
  <GlassPanel class="stub">
    <img :src="asset(icon)" class="stub__ic" alt="" />
    <h3 class="stub__t">{{ title }}</h3>
    <p class="stub__s">{{ sub }}</p>
    <span class="stub__tag">{{ stage }} 实装</span>
  </GlassPanel>
</template>

<script setup lang="ts">
import { asset } from '@/assets/assets'
import GlassPanel from '@/components/ui/GlassPanel.vue'

withDefaults(defineProps<{ title: string; sub?: string; stage?: string; icon?: string }>(), {
  sub: '', stage: 'V3.5', icon: 'teacher_owl',
})
</script>

<style scoped>
.stub { text-align: center; padding: var(--sp-10) var(--sp-5); max-width: 520px; margin: var(--sp-6) auto; }
.stub__ic { width: 88px; height: 88px; opacity: .9; }
.stub__t { font-size: var(--fs-md); font-weight: var(--fw-bold); margin-top: var(--sp-3); }
.stub__s { font-size: var(--fs-sm); color: var(--color-text-3); margin-top: 6px; line-height: 1.7; }
.stub__tag { display: inline-block; margin-top: var(--sp-4); font-size: var(--fs-xs);
  background: var(--color-primary-soft); color: var(--color-primary-strong); padding: 3px 12px; border-radius: var(--r-pill); }
</style>
