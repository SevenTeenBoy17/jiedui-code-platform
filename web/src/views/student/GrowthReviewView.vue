<!-- @copyBudget 250 -->
<template>
  <div class="growth-page review-page">
    <GrowthPageHeader eyebrow="教师反馈与低支架重做" title="重做复核" :task-code="currentReview.taskCode"
      :description="currentReview.pageDescription" />
    <section class="review-toolbar">
      <GrowthScopeSwitch v-model="scope" />
      <span>{{ currentScope.description }}</span>
      <button v-if="currentReview.activeReview" class="primary-action" type="button" aria-controls="redo-workspace"
        :aria-expanded="redoExpanded" @click="openRedoWorkspace">
        <BaseIcon name="play" :size="14" /><span>{{ redoExpanded ? '重做准备已展开' : '准备低支架重做' }}</span>
      </button>
    </section>

    <div ref="motionRoot" class="review-content">
      <section class="scope-bands" aria-label="成长范围状态">
        <article v-for="band in currentReview.bands" :key="band.label">
          <img :src="scope === 'task' ? '/generated/student-growth/thinking-growth.png' : '/generated/student-growth/my-data.png'" alt="" />
          <div><span>{{ band.label }}</span><strong>{{ band.value }}</strong></div>
          <GrowthStatus v-for="status in band.statuses" :key="status.label" :state="status.state" :label="status.label" />
        </article>
      </section>

      <section v-if="!currentReview.activeReview" class="growth-card empty-review" aria-labelledby="empty-review-title">
        <BaseIcon name="clock" :size="28" />
        <h2 id="empty-review-title">{{ currentReview.emptyTitle }}</h2>
        <p>{{ currentReview.emptyDescription }}</p>
        <button type="button" @click="scope = 'task'">返回本任务范围</button>
      </section>

      <template v-else>
        <section class="flow-grid" aria-label="重做复核流程">
          <article v-for="(step, index) in currentReview.steps" :key="step.id" class="flow-card">
            <img class="flow-card__art" :src="`/generated/student-growth/${['teacher-feedback', 'stage-task', 'profile-detail'][index]}.png`" alt="" />
            <span class="flow-card__index">{{ step.index }}</span>
            <div class="flow-card__title"><h2>{{ step.title }}</h2><GrowthStatus :state="step.state" :label="step.stateLabel" /></div>
            <p>{{ step.description }}</p>
            <dl v-if="index === 0">
              <div><dt>反馈原件</dt><dd>FB-A03-TEACHER-v1 · v1.1</dd></div>
              <div><dt>支架等级</dt><dd>{{ currentReview.scaffold.level }}</dd></div>
            </dl>
            <div v-else-if="index === 1" class="flow-card__redo"><BaseIcon name="clipboard" :size="24" /><span>{{ currentReview.scaffold.precondition }}</span></div>
            <div v-else class="flow-card__review"><span>干预前</span><BaseIcon name="arrow-right" :size="15" /><span>重做后</span><BaseIcon name="arrow-right" :size="15" /><span>教师复核</span></div>
          </article>
        </section>

        <section v-if="redoExpanded" id="redo-workspace" ref="redoWorkspace" class="growth-card redo-workspace" tabindex="-1" aria-labelledby="redo-workspace-title">
          <div class="card-heading">
            <div><span>LOW-SCAFFOLD WORKSPACE</span><h2 id="redo-workspace-title">{{ currentReview.scaffold.level }}重做准备</h2></div>
            <GrowthStatus :state="redoStarted ? 'verified' : 'pending'" :label="redoStarted ? '前置条件已满足' : '先完成边界说明'" />
          </div>
          <p class="redo-workspace__precondition">{{ currentReview.scaffold.precondition }}</p>
          <p class="redo-workspace__precondition">前端演示：支架等级仅记录练习约定，工坊尚未强制限制提示。</p>
          <div class="redo-workspace__grid">
            <div>
              <h3>任务约束</h3>
              <ul><li v-for="constraint in currentReview.scaffold.constraints" :key="constraint"><BaseIcon name="check-square" :size="14" />{{ constraint }}</li></ul>
            </div>
            <div>
              <label for="boundary-explanation">{{ currentReview.scaffold.explanationLabel }}</label>
              <textarea id="boundary-explanation" v-model="boundaryExplanation" rows="4" :placeholder="currentReview.scaffold.explanationHint" />
              <label class="confirm-row"><input v-model="constraintsConfirmed" type="checkbox" /> <span>我确认只使用目标与检查表，不索取完整代码。</span></label>
            </div>
          </div>
          <div class="redo-workspace__actions">
            <span aria-live="polite">{{ redoMessage }}</span>
            <button type="button" :disabled="!canStartRedo" @click="startRedo"><BaseIcon name="check" :size="14" />开始重做</button>
            <RouterLink v-if="redoStarted" :to="{ path: '/student/ide', query: { mode: 'python', taskId: 'A-03', taskTitle: '校园温度提醒器', feedbackId: 'FB-A03-TEACHER-v1', scaffold: '1' } }"><BaseIcon name="arrow-right" :size="14" />继续到 Python 工坊</RouterLink>
          </div>
        </section>

        <section class="growth-card originals-card">
          <div class="card-heading"><div><span>ORIGINAL EVIDENCE</span><h2>前后原件链</h2></div><GrowthStatus state="pending" label="复核尚未完成" /></div>
          <div class="originals-grid">
            <article v-for="(item, index) in currentReview.evidence" :key="item.id">
              <img class="original-art" :src="`/generated/student-growth/${['stage-code', 'teacher-feedback', 'stage-code', 'stage-task'][index]}.png`" alt="" />
              <div><strong>{{ item.label }}</strong><small>{{ item.id }} · {{ item.version }}</small></div>
              <GrowthStatus :state="item.state" :label="item.state === 'verified' ? '已留存' : '待生成'" />
              <button type="button" :disabled="!originalFor(item)" :aria-label="originalFor(item) ? `查看${item.label}原件` : `${item.label}原件不可用`" @click="openOriginal(item, $event)">
                <BaseIcon :name="originalFor(item) ? 'file-text' : 'lock'" :size="14" />
              </button>
            </article>
          </div>
          <p>{{ currentReview.outcomeNote }}</p>
          <EvidenceOriginalDialog ref="originalDialog" />
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import EvidenceOriginalDialog from '@/components/student/growth/EvidenceOriginalDialog.vue'
import GrowthPageHeader from '@/components/student/growth/GrowthPageHeader.vue'
import GrowthScopeSwitch from '@/components/student/growth/GrowthScopeSwitch.vue'
import GrowthStatus from '@/components/student/growth/GrowthStatus.vue'
import { useGrowthMotion } from '@/composables/useGrowthMotion'
import { useGrowthDisplay } from '@/composables/useGrowthDisplay'
import { findEvidenceOriginal, reviewByScope, scopeOptions, type ReviewEvidenceItem } from '@/data/studentGrowth'

const { scope, redoExplanation: boundaryExplanation } = useGrowthDisplay()
const motionRoot = ref<HTMLElement | null>(null)
const redoWorkspace = ref<HTMLElement | null>(null)
const originalDialog = ref<InstanceType<typeof EvidenceOriginalDialog> | null>(null)
const redoExpanded = ref(false)
const redoStarted = ref(false)
const constraintsConfirmed = ref(false)
const redoMessage = ref('请先完成边界说明并确认约束')
const currentScope = computed(() => scopeOptions.find((item) => item.key === scope.value) ?? scopeOptions[0])
const currentReview = computed(() => reviewByScope[scope.value])
const canStartRedo = computed(() => boundaryExplanation.value.trim().length >= 8 && constraintsConfirmed.value)
const { transition } = useGrowthMotion(motionRoot)

watch(scope, () => { resetRedo(); transition() })
watch(canStartRedo, (ready) => {
  if (!ready) {
    redoStarted.value = false
    redoMessage.value = '请先完成边界说明并确认约束'
  }
})

async function openRedoWorkspace() {
  redoExpanded.value = true
  await nextTick()
  redoWorkspace.value?.focus()
}

function startRedo() {
  if (!canStartRedo.value) return
  redoStarted.value = true
  redoMessage.value = '说明仅保留在本标签页，尚未提交教师。可进入工坊继续练习。'
}

function resetRedo() {
  redoExpanded.value = false
  redoStarted.value = false
  constraintsConfirmed.value = false
  redoMessage.value = '请先完成边界说明并确认约束'
}

const originalFor = (item: ReviewEvidenceItem) => findEvidenceOriginal(item.id, item.version)
function openOriginal(item: ReviewEvidenceItem, event: MouseEvent) {
  const original = originalFor(item)
  if (original) originalDialog.value?.open(original, event.currentTarget as HTMLElement)
}
</script>

<style scoped>
.growth-page { min-height: 100%; box-sizing: border-box; padding: 18px; display: grid; align-content: start; gap: 13px; color: #282e45; background: radial-gradient(circle at 92% 4%, rgba(219,213,255,.46), transparent 27%), linear-gradient(145deg, #faf9f7, #f4f5fb); }
.review-toolbar { min-width: 0; padding: 9px 12px; border: 1px solid #e8e7f0; border-radius: 16px; display: flex; align-items: center; gap: 13px; background: rgba(255,255,255,.86); }
.review-toolbar > span { min-width: 0; flex: 1; overflow: hidden; color: #7e8496; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.primary-action { min-height: 38px; padding: 0 14px; border: 0; border-radius: 11px; display: inline-flex; align-items: center; gap: 7px; color: #fff; background: linear-gradient(135deg, #726ede, #585bc9); box-shadow: 0 6px 14px rgba(81,78,184,.22); font: inherit; font-size: 10px; font-weight: 800; cursor: pointer; white-space: nowrap; }
.review-content { min-width: 0; display: grid; gap: 13px; }
.scope-bands { display: grid; gap: 9px; }
.scope-bands article { min-width: 0; padding: 10px 14px; border: 1px solid #dddcef; border-radius: 16px; display: flex; align-items: center; gap: 11px; background: linear-gradient(90deg, #f3f1ff, #fff); }
.scope-bands article + article { border-color: #d9e8df; background: linear-gradient(90deg, #eff9f4, #fffaf4); }
.scope-bands img { flex: none; width: 48px; height: 48px; object-fit: contain; }
.scope-bands article > div { min-width: 150px; flex: 1; display: grid; gap: 2px; }
.scope-bands div span { color: #777d91; font-size: 9px; }
.scope-bands div strong { color: #30364c; font-size: 13px; }
.flow-grid { min-width: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 13px; }
.flow-card { position: relative; min-width: 0; min-height: 180px; padding: 16px; border: 1px solid #e6e5ef; border-radius: 19px; background: rgba(255,255,255,.96); box-shadow: 0 8px 20px rgba(61,66,111,.05); }
.flow-card__index { width: 30px; height: 30px; margin-bottom: 9px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: #6b68d1; font-size: 13px; font-weight: 900; }
.flow-card:nth-child(2) .flow-card__index { background: #61ad78; }.flow-card:nth-child(3) .flow-card__index { background: #e18b4f; }
.flow-card__title { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }.flow-card h2 { margin: 0; color: #2b3148; font-size: 15px; }.flow-card > p { margin: 8px 0 11px; color: #687084; font-size: 10px; line-height: 1.5; }
.flow-card dl { margin: 0; display: grid; gap: 7px; }.flow-card dl div { padding: 7px 9px; border-radius: 9px; display: flex; justify-content: space-between; gap: 8px; background: #f8f8fb; font-size: 9px; }.flow-card dt { color: #84899b; }.flow-card dd { margin: 0; color: #434a60; text-align: right; }
.flow-card__redo { min-height: 52px; padding: 8px; border: 1px solid #cfe7d8; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 9px; color: #33724d; background: #eef9f2; font-size: 9px; font-weight: 800; line-height: 1.4; }
.flow-card__review { min-height: 52px; padding: 8px; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 7px; color: #655e78; background: #faf6ef; font-size: 9px; font-weight: 800; }
.growth-card { min-width: 0; padding: 16px; border: 1px solid #e7e6ef; border-radius: 19px; background: rgba(255,255,255,.96); box-shadow: 0 9px 22px rgba(61,66,111,.055); }
.card-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }.card-heading > div > span { display: block; margin-bottom: 3px; color: #8d83cc; font-size: 8px; font-weight: 900; letter-spacing: .1em; }.card-heading h2 { margin: 0; color: #272d45; font-size: 16px; }
.redo-workspace { outline: none; border-color: #c9c5ef; background: linear-gradient(145deg, #fff, #f5f3ff); }.redo-workspace:focus-visible { box-shadow: 0 0 0 4px rgba(102,96,205,.18); }.redo-workspace__precondition { margin: 11px 0; padding: 10px 12px; border-left: 3px solid #736ed4; color: #565d73; background: #f0eeff; font-size: 10px; line-height: 1.5; }.redo-workspace__grid { display: grid; grid-template-columns: .8fr 1.2fr; gap: 14px; }.redo-workspace h3 { margin: 0 0 8px; font-size: 12px; }.redo-workspace ul { margin: 0; padding: 0; list-style: none; display: grid; gap: 7px; }.redo-workspace li { display: flex; align-items: flex-start; gap: 6px; color: #596177; font-size: 10px; }.redo-workspace label { display: block; color: #4c5368; font-size: 10px; font-weight: 750; }.redo-workspace textarea { width: 100%; box-sizing: border-box; margin-top: 7px; padding: 10px; border: 1px solid #d9d9e7; border-radius: 11px; resize: vertical; color: #343a50; background: #fff; font: inherit; font-size: 11px; }.confirm-row { margin-top: 8px; display: flex !important; align-items: flex-start; gap: 7px; font-weight: 500 !important; line-height: 1.4; }.confirm-row input { flex: none; margin-top: 2px; }.redo-workspace__actions { margin-top: 12px; display: flex; align-items: center; justify-content: flex-end; gap: 8px; }.redo-workspace__actions > span { min-width: 0; margin-right: auto; color: #73798d; font-size: 9px; }.redo-workspace__actions button, .redo-workspace__actions a { min-height: 36px; padding: 0 12px; border: 1px solid #6563ca; border-radius: 10px; display: inline-flex; align-items: center; gap: 6px; color: #fff; background: #6563ca; font: inherit; font-size: 10px; font-weight: 800; text-decoration: none; cursor: pointer; }.redo-workspace__actions button:disabled { color: #8c91a1; border-color: #dcdde6; background: #f0f1f4; cursor: not-allowed; }
.originals-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }.originals-grid article { min-width: 0; padding: 10px; border: 1px solid #e6e6ef; border-radius: 13px; display: grid; grid-template-columns: 23px minmax(0, 1fr) auto; align-items: center; gap: 7px; background: #fbfbfe; }.originals-grid article > div { min-width: 0; }.originals-grid strong { display: block; font-size: 10px; }.originals-grid small { margin-top: 3px; display: block; overflow: hidden; color: #858a9d; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }.originals-grid :deep(.growth-status) { grid-column: 2; }.originals-grid button { grid-column: 3; grid-row: 1 / 3; width: 31px; height: 31px; border: 1px solid #dedee8; border-radius: 9px; display: grid; place-items: center; color: #5c5aba; background: #fff; cursor: pointer; }.originals-grid button:disabled { color: #999ead; background: #f1f2f5; cursor: not-allowed; }.originals-card > p { margin: 11px 0 0; color: #8a663e; font-size: 9px; text-align: right; }
.empty-review { padding-block: 36px; display: grid; justify-items: center; text-align: center; }.empty-review > svg { color: #6c68cc; }.empty-review h2 { margin: 10px 0 5px; font-size: 18px; }.empty-review p { max-width: 520px; margin: 0; color: #687084; font-size: 11px; line-height: 1.55; }.empty-review button { min-height: 38px; margin-top: 14px; padding: 0 14px; border: 0; border-radius: 11px; color: #fff; background: #6563ca; font: inherit; font-size: 10px; font-weight: 800; cursor: pointer; }
.growth-page button:focus-visible, .growth-page a:focus-visible, .growth-page textarea:focus-visible, .growth-page input:focus-visible { outline: 3px solid rgba(102,96,205,.25); outline-offset: 2px; }
@media (max-width: 900px) { .flow-grid { grid-template-columns: 1fr; }.flow-card { min-height: 0; }.originals-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }.scope-bands article { align-items: flex-start; flex-wrap: wrap; }.scope-bands article > div { min-width: calc(100% - 64px); }.redo-workspace__grid { grid-template-columns: 1fr; } }
@media (max-width: 620px) { .growth-page { padding: 10px; gap: 10px; }.review-toolbar { align-items: stretch; flex-direction: column; }.primary-action { justify-content: center; }.originals-grid { grid-template-columns: 1fr; }.growth-card, .flow-card { padding: 13px; border-radius: 16px; }.redo-workspace__actions { align-items: stretch; flex-direction: column; }.redo-workspace__actions > span { margin: 0; }.redo-workspace__actions button, .redo-workspace__actions a { justify-content: center; } }
.review-toolbar { border:0; background:transparent; padding:0 2px; }.review-toolbar > span { font-size:13px; color:#696078; }
.scope-bands article { min-height:66px; border-radius:19px; }.scope-bands div span { font-size:12px; color:#70647b; }.scope-bands div strong { font-size:16px; }
.flow-card { min-height:240px; padding:22px; border-radius:22px; background:#fffdfb; box-shadow:0 4px 9px #63537b1c; }
.flow-card__art { width:66px; height:66px; object-fit:contain; float:right; }.flow-card__index { width:38px; height:38px; font-size:17px; }
.flow-card h2 { font-size:19px; }.flow-card > p { font-size:14px; line-height:1.65; }.flow-card dl div { font-size:12px; }.flow-card dt { color:#706778; }
.flow-card__redo,.flow-card__review { font-size:13px; min-height:66px; line-height:1.6; }
.originals-grid article { grid-template-columns:55px minmax(0,1fr) auto; padding:16px; gap:10px; min-height:95px; }.original-art { width:55px; height:60px; object-fit:contain; grid-row:1 / 3; }.originals-grid strong { font-size:14px; }.originals-grid small { font-size:11px; color:#70647b; }.originals-grid button { min-width:40px; min-height:40px; }.originals-card > p { font-size:12px; }
.card-heading h2 { font-size:19px; }.card-heading > div > span { display:none; }.primary-action { font-size:14px; min-height:44px; }
.redo-workspace__precondition { border-left:0; border-radius:12px; font-size:14px; }.redo-workspace h3 { font-size:16px; }.redo-workspace li,.redo-workspace label,.redo-workspace textarea { font-size:14px; }.redo-workspace__actions > span { font-size:12px; }.redo-workspace__actions button,.redo-workspace__actions a { min-height:44px; font-size:14px; }
.empty-review p { font-size:14px; }.empty-review button { font-size:14px; min-height:44px; }
@media(max-width:1200px) { .flow-grid { grid-template-columns:1fr; }.flow-card { min-height:0; }.originals-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media(max-width:620px) { .originals-grid { grid-template-columns:1fr; }.scope-bands article > div { min-width:calc(100% - 64px); }.flow-card { padding:17px; } }
</style>
