<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import { languageLabel, type DataProject } from './model'
import { normalizeCoverLanguage, projectCoverFor } from './covers'

const props = defineProps<{ project: Pick<DataProject, 'id' | 'language'> }>()
const source = computed(() => projectCoverFor(props.project))
const failed = ref(false)
const label = computed(() => languageLabel(normalizeCoverLanguage(props.project.language) ?? props.project.language.trim()) || '未标注语言')
watch(source, () => { failed.value = false })
</script>

<template>
  <span class="project-cover" aria-hidden="true">
    <img v-if="source && !failed" :key="source" :src="source" alt="" width="1600" height="900" loading="lazy" decoding="async" @error="failed = true" />
    <span v-else class="project-cover__fallback"><BaseIcon name="keyboard" :size="36" /><strong>{{ label }}</strong></span>
    <span class="project-cover__badge">{{ source && !failed ? '语言主题插画' : '暂无主题插画' }}</span>
  </span>
</template>

<style scoped>
.project-cover{position:relative;display:block;width:100%;aspect-ratio:16/9;overflow:hidden;background:oklch(.96 .015 245)}
.project-cover>img{display:block;width:100%;height:100%;object-fit:contain}
.project-cover__fallback{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:16px 16px 32px;color:oklch(.43 .065 250)}
.project-cover__fallback strong{max-width:100%;font:inherit;font-size:20px;font-weight:700;overflow-wrap:anywhere}
.project-cover__badge{position:absolute;right:7px;bottom:7px;padding:3px 6px;border:1px solid oklch(.87 .025 245);border-radius:5px;background:oklch(.985 .008 245 / .96);color:oklch(.4 .045 245);font:inherit;font-size:11px;font-weight:500;line-height:1.25;white-space:nowrap}
</style>
