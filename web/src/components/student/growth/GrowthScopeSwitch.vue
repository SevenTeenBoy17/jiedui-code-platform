<template>
  <div class="scope-switch" role="group" aria-label="证据范围">
    <button v-for="option in scopeOptions" :key="option.key" type="button"
      :class="{ active: modelValue === option.key }" :aria-pressed="modelValue === option.key"
      @click="$emit('update:modelValue', option.key)">
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { scopeOptions, type GrowthScope } from '@/data/studentGrowth'

defineProps<{ modelValue: GrowthScope }>()
defineEmits<{ 'update:modelValue': [value: GrowthScope] }>()
</script>

<style scoped>
.scope-switch { width: fit-content; padding: 4px; border: 1px solid #e1e2eb; border-radius: 14px; display: flex; background: #f3f3f7; }
.scope-switch button { min-width: 96px; min-height: 38px; padding: 0 16px; border: 0; border-radius: 10px; color: #555d72; background: transparent; font: inherit; font-size: 13px; font-weight: 750; cursor: pointer; }
.scope-switch button.active { color: #fff; background: linear-gradient(135deg, #7771df, #5b5ccf); box-shadow: 0 5px 12px rgba(86,81,191,.22); }
.scope-switch button:focus-visible { outline: 3px solid rgba(102,96,205,.25); outline-offset: 2px; }
@media (max-width: 460px) { .scope-switch { width: 100%; } .scope-switch button { min-width: 0; flex: 1; } }
</style>
