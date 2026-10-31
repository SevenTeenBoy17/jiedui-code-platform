<!-- @copyBudget 220 -->
<template>
  <div class="growth-page">
    <GrowthPageHeader eyebrow="证据驱动的学习成长" title="思维成长" :task-code="currentOverview.taskCode"
      :description="currentOverview.pageDescription" />
    <section class="scope-row" aria-label="成长范围">
      <GrowthScopeSwitch v-model="scope" />
      <div><strong>{{ currentScope.label }}</strong><span>{{ currentScope.description }}</span></div>
      <GrowthStatus state="tentative" label="判断均为暂定" />
    </section>
    <div ref="motionRoot" class="overview-grid">
      <section class="growth-card growth-card--map" aria-labelledby="growth-map-title">
        <div class="card-heading">
          <div><h2 id="growth-map-title">成长地图</h2><p>看见每一步，回到自己的原件</p></div>
          <GrowthStatus state="pending" :label="currentOverview.stageStatus" />
        </div>
        <GrowthStageRail :stages="stages" />
        <div class="map-footer">
          <span><BaseIcon name="file-text" :size="16" />每个原件保留来源与版本</span>
          <span>未开始的阶段，不提前形成判断</span>
        </div>
      </section>
      <aside class="growth-card action-card" aria-labelledby="current-action-title">
        <img class="section-art section-art--action" src="/generated/student-growth/stage-task.png" alt="" />
        <div class="action-card__content">
          <span class="section-kicker">现在要做</span>
          <h2 id="current-action-title">{{ currentOverview.action.title }}</h2>
          <p>{{ currentOverview.action.description }}</p>
          <RouterLink class="primary-action" :to="actionTo"><BaseIcon name="play" :size="15" />{{ currentOverview.action.label }}</RouterLink>
        </div>
      </aside>
      <section class="growth-card profile-card" aria-labelledby="profile-summary-title">
        <div class="illustrated-heading">
          <img class="section-art" src="/generated/student-growth/profile-detail.png" alt="" />
          <div><h2 id="profile-summary-title">成长画像</h2><GrowthStatus :state="selectedClaim.state" :label="selectedClaim.confidence" /></div>
        </div>
        <div class="profile-summary"><strong>{{ selectedClaim.title }}</strong><p>{{ selectedClaim.summary }}</p></div>
        <div class="evidence-summary" aria-label="当前主张的证据摘要">
          <button v-for="anchor in evidenceAnchors" :key="anchor.relation" type="button" :class="'evidence-summary--' + anchor.relation"
            :disabled="!findEvidenceOriginal(anchor.id, anchor.version)" :aria-label="anchor.label + '：打开' + anchor.title + '原件'" @click="openOriginal(anchor, $event)">
            <span>{{ anchor.label }} {{ anchor.count }}</span><strong>{{ anchor.title }}</strong><BaseIcon name="arrow-right" :size="13" />
          </button>
          <p v-if="!selectedClaim.conflicting.length" class="evidence-summary__note">暂无冲突原件，不代表判断已确定。</p>
          <p v-if="!selectedClaim.supporting.length" class="evidence-summary__note">支持原件待补，暂不形成判断。</p>
        </div>
        <RouterLink class="secondary-action" :to="linkTo('/student/thinking/profile')">查看完整画像<BaseIcon name="arrow-right" :size="15" /></RouterLink>
      </section>
      <section class="growth-card feedback-card" aria-labelledby="teacher-feedback-title">
        <div class="illustrated-heading">
          <img class="section-art" src="/generated/student-growth/teacher-feedback.png" alt="" />
          <div><h2 id="teacher-feedback-title">教师反馈</h2><GrowthStatus state="pending" :label="currentOverview.feedback.state" /></div>
        </div>
        <blockquote>{{ currentOverview.feedback.summary }}</blockquote>
        <p class="review-timing"><span>何时复核</span>{{ currentOverview.feedback.reviewTiming }}</p>
        <div class="feedback-card__actions">
          <RouterLink class="secondary-action" :to="linkTo('/student/thinking/review')">进入复核</RouterLink>
          <RouterLink class="secondary-action" :to="linkTo('/student/thinking/profile', { response: 'correct' })">补充或更正</RouterLink>
        </div>
      </section>
    </div>
    <EvidenceOriginalDialog ref="originalDialog" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import EvidenceOriginalDialog from '@/components/student/growth/EvidenceOriginalDialog.vue'
import GrowthPageHeader from '@/components/student/growth/GrowthPageHeader.vue'
import GrowthScopeSwitch from '@/components/student/growth/GrowthScopeSwitch.vue'
import GrowthStageRail from '@/components/student/growth/GrowthStageRail.vue'
import GrowthStatus from '@/components/student/growth/GrowthStatus.vue'
import { useGrowthDisplay } from '@/composables/useGrowthDisplay'
import { useGrowthMotion } from '@/composables/useGrowthMotion'
import { findEvidenceOriginal, growthStagesByScope, overviewByScope, scopeOptions, type EvidenceItem } from '@/data/studentGrowth'

const { scope, selectedClaim, linkTo } = useGrowthDisplay()
const motionRoot = ref<HTMLElement | null>(null)
const originalDialog = ref<InstanceType<typeof EvidenceOriginalDialog> | null>(null)
const currentScope = computed(() => scopeOptions.find((item) => item.key === scope.value) ?? scopeOptions[0])
const stages = computed(() => growthStagesByScope[scope.value])
const currentOverview = computed(() => overviewByScope[scope.value])
const actionTo = computed(() => scope.value === 'unit'
  ? linkTo('/student/thinking/profile')
  : linkTo('/student/ide', { taskId: 'A-03', taskTitle: '校园温度提醒器', mode: 'python' }))
const evidenceAnchors = computed(() => [
  ...selectedClaim.value.supporting.slice(0, 1).map((item) => ({ ...item, label: '支持证据', count: selectedClaim.value.supporting.length })),
  ...selectedClaim.value.conflicting.slice(0, 1).map((item) => ({ ...item, label: '冲突证据', count: selectedClaim.value.conflicting.length })),
])
const { transition } = useGrowthMotion(motionRoot)
watch([scope, () => selectedClaim.value.id], transition)

function openOriginal(evidence: EvidenceItem, event: MouseEvent) {
  const original = findEvidenceOriginal(evidence.id, evidence.version)
  if (original) originalDialog.value?.open(original, event.currentTarget as HTMLElement)
}
</script>

<style scoped>
.growth-page { min-height: 100%; box-sizing: border-box; padding: 20px; display: grid; align-content: start; gap: 18px; color: #292c43; background: radial-gradient(circle at 95% 0%, #f0edfb 0, transparent 32%), #f9f8f5; }
.scope-row { min-width: 0; display: flex; align-items: center; gap: 16px; padding: 0 4px; }
.scope-row > div:nth-child(2) { min-width: 0; flex: 1; display: grid; gap: 3px; }
.scope-row strong { font-size: 13px; }
.scope-row span { color: #70758a; font-size: 12px; line-height: 1.45; }
.overview-grid { min-width: 0; display: grid; grid-template-columns: minmax(0, 1.9fr) minmax(310px, .95fr); grid-template-rows: auto auto auto; gap: 14px; align-items: stretch; }
.growth-card { min-width: 0; padding: 16px; border: 1px solid #e8e4e3; border-radius: 25px; background: #fffefd; box-shadow: 0 4px 6px #57506608, 0 12px 26px #5b53600a, inset 0 1px 0 #fffff9; }
.growth-card--map { grid-column: 1; grid-row: 1 / 4; min-height: 604px; display: flex; flex-direction: column; padding: 27px 22px 22px; }
.card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.card-heading h2 { margin: 0; font-size: 24px; font-weight: 800; }
.card-heading p { margin: 7px 0 0; color: #77798b; font-size: 13px; }
.growth-card--map > :deep(.stage-rail-host) { flex: 1; display: flex; align-items: center; padding: 45px 0 58px; }
.map-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 9px 16px; border-top: 1px solid #efebed; padding-top: 16px; color: #77768c; font-size: 12px; line-height: 1.5; }
.map-footer > span:first-child { display: inline-flex; align-items: center; gap: 6px; color: #68628c; }
.section-art { flex: none; width: 54px; height: 54px; object-fit: contain; }
.section-art--action { width: 76px; height: 84px; align-self: center; }
.action-card { grid-column: 2; grid-row: 1; display: flex; align-items: flex-start; gap: 12px; }
.action-card__content { min-width: 0; flex: 1; }
.section-kicker { color: #56546f; font-size: 13px; font-weight: 750; }
.action-card h2 { margin: 7px 0 0; font-size: 19px; line-height: 1.45; }
.action-card p { margin: 6px 0 8px; color: #737386; font-size: 12px; line-height: 1.5; }
.primary-action, .secondary-action { box-sizing: border-box; min-height: 40px; padding: 8px 14px; border: 1px solid #e3dfdf; border-radius: 13px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; color: #474357; background: #fffefd; box-shadow: 0 3px 4px #5c526914; font-size: 13px; font-weight: 750; text-decoration: none; transition: background-color .18s, box-shadow .18s; }
.primary-action { width: 100%; border-color: #7165cc; color: #fffefa; background: linear-gradient(180deg, #9587e9, #7367d0); box-shadow: inset 0 1px 1px #cfc3fb, 0 3px 0 #6055b8, 0 5px 9px #7165b92b; }
.primary-action:hover { background: #7667d5; }
.secondary-action:hover { background: #f6f2fd; border-color: #cfc6e8; }
.profile-card { grid-column: 2; grid-row: 2; display: grid; gap: 6px; }
.illustrated-heading { display: flex; align-items: center; gap: 14px; }
.illustrated-heading > div { min-width: 0; display: grid; gap: 7px; }
.illustrated-heading h2 { margin: 0; font-size: 20px; }
.profile-summary strong { color: #494258; font-size: 14px; }
.profile-summary p { margin: 4px 0 0; color: #676477; font-size: 13px; line-height: 1.5; }
.evidence-summary { display: grid; gap: 7px; }
.evidence-summary button { width: 100%; min-height: 31px; padding: 2px 0; border: 0; display: flex; align-items: center; gap: 8px; color: #676477; background: transparent; font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
.evidence-summary button > span { flex: none; padding: 5px 7px; border-radius: 8px; color: #347552; background: #edf4ed; font-weight: 650; }
.evidence-summary button strong { min-width: 0; flex: 1; font-weight: 500; overflow-wrap: anywhere; }
.evidence-summary button:hover strong { text-decoration: underline; }
.evidence-summary button:disabled { opacity: .55; cursor: not-allowed; }
.evidence-summary button.evidence-summary--conflicting > span { color: #9c5c2f; background: #fbefdf; }
.evidence-summary__note { margin: 0; color: #888092; font-size: 12px; line-height: 1.5; }
.feedback-card { grid-column: 2; grid-row: 3; display: grid; gap: 6px; }
.feedback-card blockquote { margin: 0; color: #514d60; font-size: 13px; line-height: 1.6; }
.review-timing { margin: 0; display: flex; align-items: baseline; gap: 9px; color: #666071; font-size: 12px; line-height: 1.55; }
.review-timing > span { flex: none; color: #7365b9; font-weight: 700; }
.feedback-card__actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.growth-page a:focus-visible, .growth-page button:focus-visible { outline: 3px solid #9a8ddd; outline-offset: 3px; }
@media (min-width: 1700px) { .overview-grid { grid-template-columns: minmax(0, 2fr) minmax(360px, 1fr); } .growth-card--map { min-height: 655px; } }
@media (max-width: 1100px) { .overview-grid { grid-template-columns: 1fr; } .growth-card--map, .action-card, .profile-card, .feedback-card { grid-column: 1; grid-row: auto; } .growth-card--map { min-height: 360px; } .growth-card--map > :deep(.stage-rail-host) { padding: 28px 0; } .action-card { align-items: center; } .action-card__content { display: grid; grid-template-columns: 1fr auto; column-gap: 22px; } .section-kicker, .action-card h2, .action-card p { grid-column: 1; } .action-card .primary-action { grid-column: 2; grid-row: 1 / 4; align-self: center; width: auto; min-width: 150px; } }
@media (max-width: 620px) { .growth-page { padding: 12px; gap: 14px; } .scope-row { align-items: stretch; flex-wrap: wrap; padding: 0; } .scope-row > div:nth-child(2) { flex-basis: 100%; order: 3; } .scope-row > :last-child { margin-left: auto; } .growth-card { padding: 18px; border-radius: 20px; } .card-heading { flex-wrap: wrap; } .card-heading h2 { font-size: 21px; } .growth-card--map { min-height: 0; } .growth-card--map > :deep(.stage-rail-host) { padding: 20px 0; } .map-footer { display: grid; } .section-art--action { width: 75px; height: 85px; } .action-card__content { display: block; } .action-card .primary-action { min-width: 0; width: 100%; } .illustrated-heading h2 { font-size: 19px; } }
@media (prefers-reduced-motion: reduce) { .primary-action, .secondary-action { transition: none; } }
</style>
