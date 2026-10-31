<template>
  <span :class="['growth-status', `growth-status--${state}`]">
    <BaseIcon :name="icon" :size="13" />
    <span>{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BaseIcon, { type IconName } from '@/components/ui/BaseIcon.vue'
import type { ReviewState } from '@/data/studentGrowth'

const props = defineProps<{ state: ReviewState; label: string }>()
const icon = computed<IconName>(() => ({
  verified: 'check-square',
  pending: 'clock',
  tentative: 'help-circle',
  conflict: 'alert-triangle',
})[props.state] as IconName)
</script>

<style scoped>
.growth-status { min-height: 25px; width: fit-content; padding: 2px 9px; border: 1px solid transparent; border-radius: 999px; display: inline-flex; align-items: center; gap: 5px; color: #4b5268; background: #f0f2f7; font-size: 11px; font-weight: 700; white-space: nowrap; }
.growth-status--verified { color: #26704a; border-color: #c7ead8; background: #edf9f2; }
.growth-status--pending { color: #875c13; border-color: #f4ddb3; background: #fff8e9; }
.growth-status--tentative { color: #5d51bd; border-color: #dcd6ff; background: #f3f0ff; }
.growth-status--conflict { color: #a34d2e; border-color: #f5d0c1; background: #fff2ed; }
</style>
