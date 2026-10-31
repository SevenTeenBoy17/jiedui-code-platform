<!-- @copyBudget 230 -->
<template>
  <div class="growth-page profile-page">
    <GrowthPageHeader eyebrow="能力主张与原件" title="成长画像" :task-code="currentProfile.taskCode"
      :description="currentProfile.pageDescription" />
    <section class="profile-toolbar">
      <GrowthScopeSwitch v-model="scope" />
      <span>{{ currentScope.description }}</span>
      <GrowthStatus state="tentative" label="置信表达为暂定" />
    </section>
    <GrowthStageRail :stages="stages" compact />

    <div ref="motionRoot" class="profile-grid">
      <section class="growth-card claims-card">
        <div class="card-heading"><div><span>ABILITY CLAIMS</span><h2>能力主张</h2></div></div>
        <div class="claim-list" aria-label="能力主张">
          <button v-for="claim in currentClaims" :id="claim.id" :key="claim.id" type="button"
            :aria-pressed="selectedClaim.id === claim.id" :class="{ active: selectedClaim.id === claim.id }" @click="selectClaim(claim.id)">
            <img :src="claimIcon(claim.title)" alt="" />
            <span><strong>{{ claim.title }}</strong><small>支持 {{ claim.supporting.length }} / 冲突 {{ claim.conflicting.length }}</small></span>
            <GrowthStatus :state="claim.state" :label="claim.state === 'verified' ? '已复核' : claim.state === 'conflict' ? '有冲突' : claim.state === 'pending' ? '待证据' : '暂定'" />
          </button>
        </div>
        <p>{{ currentProfile.provenanceNote }}</p>
      </section>

      <section class="growth-card evidence-card">
        <div class="card-heading"><div><h2>证据原件</h2></div><GrowthStatus :state="selectedClaim.state" :label="selectedClaim.confidence" /></div>
        <h3 class="selected-claim-title">{{ selectedClaim.title }}</h3>
        <p class="claim-summary">{{ selectedClaim.summary }}</p>
        <div class="evidence-columns">
          <EvidenceList title="支持证据" :items="selectedClaim.supporting" />
          <EvidenceList title="冲突证据" :items="selectedClaim.conflicting" />
        </div>
      </section>

      <aside class="growth-card calibration-card">
        <div class="card-heading"><div><h2>当前暂定画像</h2></div><img class="profile-icon" src="/generated/student-growth/profile-detail.png" alt="" /></div>
        <dl>
          <div><dt>主张编号</dt><dd>{{ selectedClaim.id }}</dd></div>
          <div><dt>置信表达</dt><dd>{{ selectedClaim.confidence }}</dd></div>
          <div><dt>教师校准</dt><dd>{{ selectedClaim.calibration }}</dd></div>
          <div><dt>更新条件</dt><dd>{{ currentProfile.updateRule }}</dd></div>
        </dl>
        <div class="calibration-card__notice"><BaseIcon name="help-circle" :size="16" /><span>{{ currentProfile.scopeNotice }}</span></div>
        <RouterLink class="review-link" :to="linkTo('/student/thinking/review')"><img src="/generated/student-growth/teacher-feedback.png" alt="" />查看教师反馈与复核</RouterLink>
      </aside>

      <section class="growth-card response-card">
        <div class="card-heading"><div><span>STUDENT RESPONSE</span><h2>我的解释或更正</h2></div><span aria-live="polite">{{ responseState }}</span></div>
        <label for="student-response">针对「{{ selectedClaim.title }}」补充依据</label>
        <textarea id="student-response" ref="responseInput" v-model="studentResponse" rows="3" :placeholder="currentProfile.responsePrompt" aria-describedby="response-help" />
        <small id="response-help">按范围与主张分别保留草稿。前端演示，尚未发送教师；刷新后清空。</small>
        <div>
          <button type="button" @click="recordResponse('explanation')"><BaseIcon name="save" :size="16" />保留解释</button>
          <button type="button" @click="recordResponse('correction')"><BaseIcon name="ruler" :size="16" />保留更正草稿</button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import EvidenceList from '@/components/student/growth/EvidenceList.vue'
import GrowthPageHeader from '@/components/student/growth/GrowthPageHeader.vue'
import GrowthScopeSwitch from '@/components/student/growth/GrowthScopeSwitch.vue'
import GrowthStageRail from '@/components/student/growth/GrowthStageRail.vue'
import GrowthStatus from '@/components/student/growth/GrowthStatus.vue'
import { useGrowthMotion } from '@/composables/useGrowthMotion'
import { useGrowthDisplay } from '@/composables/useGrowthDisplay'
import { growthStagesByScope, profileByScope, scopeOptions } from '@/data/studentGrowth'

const route = useRoute()
const { scope, selectedClaim, selectClaim, linkTo, studentResponse, responseState, recordResponse } = useGrowthDisplay()
const responseInput = ref<HTMLTextAreaElement | null>(null)
const motionRoot = ref<HTMLElement | null>(null)
const currentScope = computed(() => scopeOptions.find((item) => item.key === scope.value) ?? scopeOptions[0])
const stages = computed(() => growthStagesByScope[scope.value])
const currentProfile = computed(() => profileByScope[scope.value])
const currentClaims = computed(() => currentProfile.value.claims)
const { transition } = useGrowthMotion(motionRoot)

watch([scope, () => selectedClaim.value.id], transition)
watch(() => route.query.response, (response) => {
  if (response) void nextTick(() => responseInput.value?.focus())
}, { immediate: true })
function claimIcon(title: string) {
  const name = /分解|分析/.test(title) ? 'analysis' : /建模/.test(title) ? 'model' : /算法/.test(title) ? 'code' : /测试/.test(title) ? 'test' : 'transfer'
  return `/generated/student-growth/stage-${name}.png`
}
</script>

<style scoped>
.growth-page { min-height: 100%; box-sizing: border-box; padding: 18px; display: grid; align-content: start; gap: 13px; color: #282e45; background: radial-gradient(circle at 90% 5%, rgba(219,213,255,.46), transparent 27%), linear-gradient(145deg, #faf9f7, #f4f5fb); }
.profile-toolbar { min-width: 0; padding: 9px 12px; border: 1px solid #e8e7f0; border-radius: 16px; display: flex; align-items: center; gap: 13px; background: rgba(255,255,255,.86); }
.profile-toolbar > span { min-width: 0; flex: 1; overflow: hidden; color: #7e8496; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.profile-page > :deep(.stage-rail) { padding: 9px; border: 1px solid #e8e7f0; border-radius: 18px; background: rgba(255,255,255,.88); }
.profile-grid { min-width: 0; display: grid; grid-template-columns: minmax(220px, .62fr) minmax(390px, 1.45fr) minmax(245px, .72fr); gap: 13px; }
.growth-card { min-width: 0; padding: 15px; border: 1px solid #e7e6ef; border-radius: 19px; background: rgba(255,255,255,.96); box-shadow: 0 9px 22px rgba(61,66,111,.055); }
.card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.card-heading > div > span { display: block; margin-bottom: 3px; color: #8d83cc; font-size: 8px; font-weight: 900; letter-spacing: .1em; }
.card-heading h2 { margin: 0; color: #272d45; font-size: 16px; }
.card-heading > span { color: #777d91; font-size: 9px; }
.claims-card { display: flex; flex-direction: column; }
.claim-list { margin-top: 11px; display: grid; gap: 7px; }
.claim-list button { width: 100%; min-height: 59px; padding: 8px 9px; border: 1px solid #e7e7ef; border-radius: 13px; display: flex; align-items: center; gap: 8px; color: #3b4157; background: #fff; font: inherit; text-align: left; cursor: pointer; }
.claim-list button.active { border-color: #bdb9ef; background: #f4f1ff; box-shadow: 0 5px 13px rgba(91,86,183,.09); }
.claim-list button > span:first-child { min-width: 0; flex: 1; }
.claim-list strong { display: block; font-size: 11px; }
.claim-list small { margin-top: 3px; display: block; overflow: hidden; color: #7d8396; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
.claims-card > p { margin: auto 0 0; padding-top: 12px; color: #8a6d3d; font-size: 9px; line-height: 1.5; }
.claim-summary { margin: 9px 0 12px; color: #61687b; font-size: 10px; }
.evidence-columns { display: grid; grid-template-columns: 1fr; gap: 16px; }
.calibration-card { align-self: start; }
.calibration-card dl { margin: 13px 0; display: grid; gap: 8px; }
.calibration-card dl div { padding-bottom: 7px; border-bottom: 1px solid #ededf3; display: grid; gap: 3px; }
.calibration-card dt { color: #898ea0; font-size: 8px; }
.calibration-card dd { margin: 0; color: #3c4358; font-size: 10px; font-weight: 700; }
.calibration-card__notice { padding: 10px; border-radius: 12px; display: flex; align-items: flex-start; gap: 7px; color: #625f82; background: #f3f1ff; font-size: 9px; line-height: 1.45; }
.response-card { grid-column: 2 / 4; display: grid; gap: 9px; }
.response-card label { color: #697084; font-size: 10px; }
.response-card textarea { width: 100%; box-sizing: border-box; resize: vertical; padding: 10px 11px; border: 1px solid #dcdee8; border-radius: 12px; outline: none; color: #32384f; background: #fafafe; font: inherit; font-size: 11px; line-height: 1.5; }
.response-card textarea:focus { border-color: #8884dc; box-shadow: 0 0 0 4px rgba(104,99,201,.12); }
.response-card > div:last-child { display: flex; justify-content: flex-end; gap: 8px; }
.response-card button { min-height: 36px; padding: 0 13px; border: 1px solid #d9d8e7; border-radius: 10px; display: inline-flex; align-items: center; gap: 6px; color: #555c70; background: #fff; font: inherit; font-size: 10px; font-weight: 750; cursor: pointer; }
.response-card button:last-child { color: #fff; border-color: #6563ca; background: #6563ca; }
.growth-page button:focus-visible, .growth-page a:focus-visible { outline: 3px solid rgba(102,96,205,.25); outline-offset: 2px; }
@media (max-width: 1120px) { .profile-grid { grid-template-columns: minmax(210px, .65fr) minmax(0, 1.35fr); } .calibration-card { grid-column: 1; } .response-card { grid-column: 2; grid-row: 2; } }
@media (max-width: 760px) { .profile-grid { grid-template-columns: 1fr; } .calibration-card, .response-card { grid-column: 1; grid-row: auto; } .evidence-columns { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .growth-page { padding: 10px; gap: 10px; } .profile-toolbar { align-items: stretch; flex-direction: column; } .growth-card { padding: 13px; border-radius: 16px; } .response-card > div:last-child { flex-direction: column; } .response-card button { justify-content: center; } }
.profile-grid { grid-template-columns: minmax(210px,.8fr) minmax(300px,1.35fr) minmax(230px,.9fr); gap:16px; }
.growth-card { border-radius:22px; padding:20px; background:#fffdfa; box-shadow:0 4px 8px #5b4d6820,inset 0 1px 1px #ffffff; }
.profile-toolbar { background:transparent; border:0; padding:0 2px; }
.profile-toolbar > span { color:#686176; font-size:13px; }
.card-heading > div > span { display:none; }
.card-heading h2 { font-size:19px; }
.claim-list { gap:12px; }
.claim-list button { min-height:82px; padding:12px; border-radius:17px; }
.claim-list button > img { width:44px; height:44px; object-fit:contain; flex:none; }
.claim-list button > span { min-width:0; flex:1; }
.claim-list strong { font-size:14px; }.claim-list small { font-size:12px; color:#696078; }
.claim-list button :deep(.growth-status) { font-size:11px; }
.claims-card > p { font-size:12px; color:#72604c; line-height:1.6; }
.selected-claim-title { font-size:17px; margin:18px 0 0; }.claim-summary { font-size:14px; line-height:1.6; }
.calibration-card dt { font-size:12px; color:#706879; }.calibration-card dd { font-size:14px; line-height:1.5; overflow-wrap:anywhere; }
.calibration-card__notice { font-size:13px; line-height:1.6; }.profile-icon { width:45px; height:45px; object-fit:contain; }
.review-link { display:flex; align-items:center; gap:8px; min-height:44px; margin-top:15px; color:#554796; font-size:13px; text-decoration:none; }.review-link img { width:32px; height:32px; }
.response-card { grid-column:2 / 4; }.response-card label, .response-card textarea { font-size:14px; }.response-card small,.card-heading > span { font-size:12px; color:#716578; }.response-card button { min-height:44px; font-size:14px; }
@media(max-width:1400px) { .profile-grid { grid-template-columns:minmax(210px,.75fr) minmax(0,1.3fr); }.calibration-card { grid-column:1; }.response-card { grid-column:2; grid-row:2; } }
@media(max-width:760px) { .profile-grid { grid-template-columns:1fr; }.calibration-card,.response-card { grid-column:1; grid-row:auto; }.growth-card { padding:16px; } }
</style>
