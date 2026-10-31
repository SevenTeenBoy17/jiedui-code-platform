<template>
  <section class="evidence-list" :aria-label="title">
    <div class="evidence-list__head"><h3>{{ title }}</h3><span>{{ items.length }}</span></div>
    <div v-if="items.length" class="evidence-list__items">
      <article v-for="item in items" :key="`${item.id}-${item.version}`" :class="`evidence--${item.relation}`">
        <div class="evidence-list__meta">
          <span>{{ item.id }}</span><span>{{ item.version }}</span>
          <GrowthStatus :state="item.state" :label="item.relation === 'supporting' ? '支持' : '冲突'" />
        </div>
        <strong>{{ item.title }}</strong><small>{{ item.source }}</small><p>{{ item.summary }}</p>
        <button type="button" :disabled="!originalFor(item)" @click="openOriginal(item, $event)">
          <BaseIcon :name="originalFor(item) ? 'file-text' : 'lock'" :size="13" />
          <span>{{ originalFor(item) ? '打开原件' : '原件不可用' }}</span>
        </button>
      </article>
    </div>
    <p v-else class="evidence-list__empty">当前范围暂无可复核原件</p>
    <EvidenceOriginalDialog ref="originalDialog" />
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import { findEvidenceOriginal, type EvidenceItem } from '@/data/studentGrowth'
import EvidenceOriginalDialog from './EvidenceOriginalDialog.vue'
import GrowthStatus from './GrowthStatus.vue'

defineProps<{ title: string; items: EvidenceItem[] }>()
const originalDialog = ref<InstanceType<typeof EvidenceOriginalDialog> | null>(null)
const originalFor = (item: EvidenceItem) => findEvidenceOriginal(item.id, item.version)

function openOriginal(item: EvidenceItem, event: MouseEvent) {
  const original = originalFor(item)
  if (original) originalDialog.value?.open(original, event.currentTarget as HTMLElement)
}
</script>

<style scoped>
.evidence-list { min-width: 0; }
.evidence-list__head { margin-bottom: 9px; display: flex; align-items: center; justify-content: space-between; }
.evidence-list__head h3 { margin: 0; color: #272d44; font-size: 14px; }
.evidence-list__head > span { min-width: 24px; height: 24px; border-radius: 8px; display: grid; place-items: center; color: #6966c6; background: #efedff; font-size: 10px; font-weight: 800; }
.evidence-list__items { display: grid; gap: 8px; }
.evidence-list article { min-width: 0; padding: 13px 15px; border: 1px solid #e3e1eb; border-radius: 15px; background: #fffefb; }
.evidence-list article.evidence--supporting { border-color: #d7e7da; }
.evidence-list article.evidence--conflicting { border-color: #efd9c2; background:#fffaf4; }
.evidence-list__meta { display: flex; align-items: center; flex-wrap:wrap; gap: 5px; color: #756b80; font-size: 11px; overflow-wrap:anywhere; }
.evidence-list__meta :deep(.growth-status) { margin-left: auto; }
.evidence-list article > strong { margin-top: 7px; display: block; color: #30364d; font-size: 15px; }
.evidence-list article > small { margin-top: 2px; display: block; color: #736a7d; font-size: 12px; }
.evidence-list article > p { margin: 7px 0; color: #5f667a; font-size: 13px; line-height: 1.6; }
.evidence-list article > button { width: fit-content; min-height:36px; padding: 0 10px; border: 1px solid #ded9ed; border-radius:9px; display: inline-flex; align-items: center; gap: 5px; color: #5b50a1; background: #fcfafc; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.evidence-list article > button:disabled { color: #8d92a3; cursor: not-allowed; }
.evidence-list article > button:focus-visible { outline: 3px solid rgba(102,96,205,.25); outline-offset: 2px; }
.evidence-list__empty { margin: 0; padding: 18px; border: 1px dashed #d8d9e4; border-radius: 12px; color: #7f8598; background: #f8f8fb; font-size: 11px; text-align: center; }
</style>
