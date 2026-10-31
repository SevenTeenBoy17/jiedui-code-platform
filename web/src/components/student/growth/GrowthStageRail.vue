<template>
  <div :class="['stage-rail-host', { 'stage-rail-host--compact': compact }]">
    <ol :class="['stage-rail', { 'stage-rail--compact': compact }]" aria-label="学习阶段">
      <li v-for="stage in stages" :key="stage.key" :class="'stage--' + stage.state"
        :aria-current="stage.state === 'current' ? 'step' : undefined" :aria-label="stage.label + '：' + stateLabel(stage.state)">
        <span class="stage-rail__marker" aria-hidden="true"><BaseIcon :name="stateIcon(stage.state)" :size="compact ? 13 : 17" /></span>
        <div class="stage-rail__island" aria-hidden="true"><img :src="'/generated/student-growth/stage-' + stage.key + '.png'" alt="" /></div>
        <div class="stage-rail__label"><strong>{{ stage.label }}</strong><small>{{ stage.note }}</small></div>
        <span class="stage-rail__state">{{ stateLabel(stage.state) }}</span>
        <button v-if="stage.evidenceId && stage.evidenceVersion" type="button"
          :disabled="!findEvidenceOriginal(stage.evidenceId, stage.evidenceVersion)"
          :aria-label="'查看' + stage.label + '阶段证据 ' + stage.evidenceId + ' ' + stage.evidenceVersion" @click="openOriginal(stage, $event)">
          <BaseIcon name="file-text" :size="12" /><span>{{ compact ? stage.evidenceVersion : '查看原件' }}</span>
        </button>
        <span v-else class="stage-rail__unavailable"><BaseIcon name="lock" :size="11" />待留存</span>
      </li>
    </ol>
    <EvidenceOriginalDialog ref="originalDialog" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import BaseIcon, { type IconName } from '@/components/ui/BaseIcon.vue'
import { findEvidenceOriginal, type GrowthStage, type GrowthStageState } from '@/data/studentGrowth'
import EvidenceOriginalDialog from './EvidenceOriginalDialog.vue'

withDefaults(defineProps<{ stages: GrowthStage[]; compact?: boolean }>(), { compact: false })
const originalDialog = ref<InstanceType<typeof EvidenceOriginalDialog> | null>(null)
const stateLabel = (state: GrowthStageState) => ({ complete: '已留存', current: '当前阶段', upcoming: '未开始' })[state]
const stateIcon = (state: GrowthStageState): IconName => ({ complete: 'check', current: 'pin', upcoming: 'clock' })[state] as IconName

function openOriginal(stage: GrowthStage, event: MouseEvent) {
  if (!stage.evidenceId || !stage.evidenceVersion) return
  const original = findEvidenceOriginal(stage.evidenceId, stage.evidenceVersion)
  if (original) originalDialog.value?.open(original, event.currentTarget as HTMLElement)
}
</script>

<style scoped>
.stage-rail-host { min-width: 0; width: 100%; }
.stage-rail { width: 100%; box-sizing: border-box; margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 7px; }
.stage-rail li { position: relative; min-width: 0; text-align: center; display: flex; flex-direction: column; align-items: center; }
.stage-rail li::before { content: ''; position: absolute; z-index: 0; top: 129px; left: calc(-50% - 4px); width: calc(100% + 8px); height: 8px; border-radius: 8px; background: #d4c9ee; box-shadow: inset 0 2px 2px #bfb0db55; }
.stage-rail li:first-child::before { display: none; }
.stage-rail li.stage--upcoming::before { background: #f2d0a1; box-shadow: inset 0 2px 2px #d3a16c33; }
.stage-rail__marker { position: relative; z-index: 1; width: 28px; height: 28px; box-sizing: border-box; margin: 0 0 20px; border: 1px dashed #d9b387; border-radius: 50%; display: grid; place-items: center; color: #b8854e; background: #fffaf2; }
.stage--complete .stage-rail__marker { color: #fffdf9; border: 1px solid #8e81d6; background: linear-gradient(160deg, #a798ee, #7667ca); box-shadow: inset 0 1px 1px #d7cffa, 0 2px 2px #9180b522; }
.stage--current .stage-rail__marker { color: #fffdf9; border: 1px solid #83b592; background: linear-gradient(160deg, #b1d5a6, #67a27e); box-shadow: inset 0 1px 1px #e4f1dc, 0 2px 3px #709b6b25; }
.stage-rail__island { position: relative; z-index: 1; width: 100%; height: 107px; display: flex; align-items: flex-start; justify-content: center; }
.stage-rail__island::before { content: ''; position: absolute; z-index: -1; right: 1%; bottom: 2px; left: 1%; height: 28px; border: 1px solid #b6a5dd; border-radius: 50%; background: linear-gradient(180deg, #e1d5ff, #b7a2e3); box-shadow: inset 0 2px 1px #f1eaff, 0 5px 0 #a08bcb, 0 9px 5px #a393bc26; }
.stage-rail__island img { position: relative; width: min(100%, 95px); height: 93px; object-fit: contain; filter: drop-shadow(0 3px 2px #5d526029); }
.stage--current .stage-rail__island::before { border-color: #91bba6; background: linear-gradient(180deg, #daedda, #aad5bc); box-shadow: inset 0 2px 1px #f2faef, 0 5px 0 #87b6a5, 0 9px 5px #96b29b26; }
.stage--upcoming .stage-rail__island::before { border-color: #ebbe86; background: linear-gradient(180deg, #ffedcf, #f6d19d); box-shadow: inset 0 2px 1px #fff5e3, 0 5px 0 #d9ab78, 0 9px 5px #b2967c26; }
.stage-rail__label { min-width: 0; width: 100%; margin-top: 18px; }
.stage-rail strong { display: block; color: #6152a7; font-size: 18px; line-height: 1.4; font-weight: 750; }
.stage--current strong { color: #467d5a; }
.stage--upcoming strong { color: #ab713a; }
.stage-rail small { min-height: 32px; display: block; margin-top: 6px; color: #82788c; font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
.stage-rail__state { margin-top: 6px; color: #7b7189; font-size: 12px; }
.stage--current .stage-rail__state { color: #508260; font-weight: 700; }
.stage-rail button { min-height: 33px; max-width: 100%; margin: 9px auto 0; padding: 5px 7px; border: 1px solid #e7e0f0; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; gap: 3px; color: #6a59ae; background: #f5f0fa; font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; }
.stage-rail button:hover { border-color: #beacd8; background: #eee5f9; }
.stage-rail button:disabled { color: #9691a2; background: #f6f4f7; cursor: not-allowed; }
.stage-rail button:focus-visible { outline: 3px solid #9a8ddd; outline-offset: 3px; }
.stage-rail__unavailable { min-height: 33px; box-sizing: border-box; margin-top: 9px; display: inline-flex; align-items: center; gap: 3px; color: #9a8795; font-size: 12px; }
.stage-rail--compact { padding: 6px 10px; gap: 9px; }
.stage-rail--compact li::before { top: 28px; height: 1px; background: repeating-linear-gradient(90deg, #cfc9df 0 5px, transparent 5px 9px); box-shadow: none; }
.stage-rail--compact .stage-rail__island { height: 50px; order: 0; }
.stage-rail--compact .stage-rail__island::before { display: none; }
.stage-rail--compact .stage-rail__island img { width: 48px; height: 48px; filter: drop-shadow(0 2px 2px #5d526019); }
.stage-rail--compact .stage-rail__label { order: 1; margin-top: 7px; }
.stage-rail--compact strong { color: #413c53; font-size: 14px; }
.stage-rail--compact small { display: none; }
.stage-rail--compact .stage-rail__marker { order: 2; width: 20px; height: 20px; margin: 7px 0 0; }
.stage-rail--compact .stage-rail__state { display: none; }
.stage-rail--compact button, .stage-rail--compact .stage-rail__unavailable { order: 4; min-height: 28px; margin-top: 6px; font-size: 12px; }
@media (max-width: 1380px) and (min-width: 1101px) { .stage-rail:not(.stage-rail--compact) { gap: 4px; } .stage-rail:not(.stage-rail--compact) strong { font-size: 16px; } .stage-rail:not(.stage-rail--compact) button { padding-right: 4px; padding-left: 4px; font-size: 11px; } }
@media (max-width: 620px) { .stage-rail, .stage-rail--compact { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 23px 17px; padding: 0; } .stage-rail li { padding: 0 5px 15px; border-bottom: 1px solid #ebe6f0; } .stage-rail li::before { display: none; } .stage-rail__island { width: 110px; } .stage-rail__marker { margin-bottom: 9px; } .stage-rail__label { margin-top: 13px; } .stage-rail small { min-height: 0; } .stage-rail__state { margin-top: 4px; } .stage-rail--compact .stage-rail__island { width: 70px; } .stage-rail--compact .stage-rail__label { margin-top: 5px; } }
</style>
