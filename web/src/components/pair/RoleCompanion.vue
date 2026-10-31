<!-- @lintOverlay @copyBudget 210 — same-page companion dialog, independently budgeted from the workbench. -->
<template>
  <div
    v-if="visible"
    ref="rootEl"
    class="role-companion"
    :class="[
      `is-${accountRole}`,
      `persona-${personaId}`,
      {
        'is-studio': route.path === '/student/studio',
        'is-workbench': isWorkbench,
        'is-observe': route.path === '/teacher/teaching/observe',
        'is-open': open,
      },
    ]"
  >
    <Transition name="companion-panel">
      <section
        v-if="open"
        :id="PANEL_ID"
        ref="panelEl"
        class="companion-panel"
        :style="{ maxHeight: `${panelMaxHeight}px` }"
        data-testid="companion-dialog"
        role="dialog"
        :aria-labelledby="TITLE_ID"
      >
        <header class="panel-head">
          <span class="panel-avatar" aria-hidden="true">
            <img :src="mascot" alt="" />
          </span>
          <span class="panel-heading">
            <small>{{ identityLabel }}</small>
            <b :id="TITLE_ID">{{ panelTitle }}</b>
          </span>
          <button ref="closeButton" class="panel-close" type="button" aria-label="关闭结对编程伙伴" @click="closePanel(true)">
            <BaseIcon name="x" :size="18" />
          </button>
        </header>

        <div class="persona-options" role="group" aria-label="选择结对伙伴角色">
          <button v-for="option in PAIR_PERSONAS" :key="option.id" type="button"
            :data-testid="`companion-persona-${option.id}`" :aria-pressed="personaId === option.id"
            :disabled="requestBusy" @click="selectPersona(option.id)">
            <img :src="option.image" alt="" />
            <span><b>{{ option.name }}</b><small>{{ option.roleLabel }}</small></span>
          </button>
        </div>

        <p class="panel-copy">{{ panelCopy }}</p>
        <p class="role-state"><span class="role-state__dot" aria-hidden="true" />本地引导 · 不自动发送或评价</p>

        <nav v-if="!temperatureExampleOpen" class="quick-actions" :aria-label="`${roleName}引导功能`">
          <button v-for="action in actions" :key="action.id" class="quick-action"
            :class="{ active: selectedAction === action.id }" type="button"
            :aria-expanded="selectedAction === action.id" aria-controls="companion-local-guide"
            @click="selectedAction = selectedAction === action.id ? '' : action.id">
            <span class="quick-action__icon" aria-hidden="true"><BaseIcon :name="personaId === 'guide' ? 'compass' : 'check-square'" :size="18" /></span>
            <span><b>{{ action.label }}</b><small>{{ action.detail }}</small></span>
            <BaseIcon :name="selectedAction === action.id ? 'eye-off' : 'plus'" :size="16" />
          </button>
        </nav>
        <section v-if="activeAction && !temperatureExampleOpen" id="companion-local-guide" class="local-guide" aria-live="polite">
          <b>{{ activeAction.label }}</b>
          <ol><li v-for="step in activeAction.steps" :key="step">{{ step }}</li></ol>
        </section>

        <details v-if="temperatureCoachAvailable" :key="`${personaId}-${workbenchContext.projectId}-${workbenchContext.taskId}-${route.fullPath}`"
          class="temperature-example" @toggle="onTemperatureToggle">
          <summary>温度任务示例（可选）</summary>
          <div class="workbench-context" aria-label="当前任务上下文">
            <span>{{ workbenchContext.language }}</span>
            <span>{{ workbenchContext.version }}</span>
            <span :class="{ danger: workbenchContext.failedTests > 0 }">
              {{ workbenchContext.failedTests > 0 ? `${workbenchContext.failedTests} 项待修复` : '等待测试' }}
            </span>
          </div>

          <p class="panel-copy coach-copy">温度任务的本地示例：先说清你准备检查什么。</p>

          <label class="thought-field" for="pair-thought">
            <span><b>先写你的思路</b><small>至少 20 字</small></span>
            <textarea
              id="pair-thought"
              ref="thoughtInput"
              v-model="thought"
              data-testid="thought-input"
              maxlength="300"
              placeholder="例如：我先读取温度并检查输入是否合法，再按阈值输出提醒……"
            />
            <em :class="{ ready: thoughtReady }">{{ thoughtCount }} / 20</em>
          </label>

          <button
            class="coach-primary"
            data-testid="reveal-suggestion"
            type="button"
            :disabled="!thoughtReady"
            :aria-expanded="suggestionOpen"
            @click="toggleSuggestion"
          >
            <BaseIcon :name="suggestionOpen ? 'eye-off' : 'help-circle'" :size="17" />
            {{ suggestionOpen ? '收起局部建议' : thoughtReady ? '展开局部建议' : '写满 20 字后可展开' }}
          </button>

          <Transition name="coach-reveal">
            <section v-if="suggestionOpen" class="suggestion-card" aria-label="局部建议">
              <div class="suggestion-level">
                <span>本地示例 · 等级 2</span>
                <small>不含完整程序</small>
              </div>
              <p><b>先做输入守卫：</b>把“温度是否为有效数字”的判断放在主条件前，再处理阈值分支。</p>
              <code>输入检查 → 阈值判断 → 输出提醒</code>

              <div v-if="!decisionMode" class="suggestion-actions">
                <button data-testid="adopt-preview" type="button" @click="decisionMode = 'adopt'">预览采纳</button>
                <button data-testid="reject-suggestion" type="button" @click="decisionMode = 'reject'">不采用</button>
              </div>

              <div v-else-if="decisionMode === 'adopt'" class="decision-box">
                <b>只会加入一行局部 TODO</b>
                <p>不会替换你的代码；采纳后仍需你运行并验证。</p>
                <div>
                  <button data-testid="adopt-confirm" type="button" @click="confirmAdopt">确认加入草稿</button>
                  <button type="button" @click="decisionMode = ''">返回</button>
                </div>
              </div>

              <div v-else class="decision-box reject-box">
                <label for="reject-reason">为什么这条建议不适合？</label>
                <textarea
                  id="reject-reason"
                  v-model="rejectReason"
                  data-testid="reject-reason"
                  maxlength="120"
                  placeholder="例如：我已经在读取输入时校验过了"
                />
                <div>
                  <button data-testid="reject-save" type="button" :disabled="!rejectReason.trim()" @click="saveReject">记录并继续</button>
                  <button type="button" @click="decisionMode = ''">返回</button>
                </div>
              </div>
            </section>
          </Transition>

          <p v-if="decisionNotice" class="decision-notice" role="status">{{ decisionNotice }}</p>
          <p class="panel-foot">建议决策保存在本机，不代表已上传或学习效果。</p>
        </details>

        <button v-if="accountRole === 'student' && !isAssessment && !temperatureExampleOpen && route.path !== '/student/studio'"
          class="studio-link" type="button" @click="go('/student/studio')">
          打开完整结对台 <BaseIcon name="arrow-right" :size="15" />
        </button>
        <p class="panel-foot">{{ isAssessment ? '只讲操作，不读取试题、答案或未发布结果。' : '切换伙伴不改变账号权限；键盘和判断仍在你手里。' }}</p>
      </section>
    </Transition>

    <button
      ref="triggerButton"
      class="companion-trigger"
      data-testid="companion-launcher"
      type="button"
      :aria-label="`${open ? '收起' : '打开'}${roleName}`"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-controls="PANEL_ID"
      @click="togglePanel"
    >
      <span class="trigger-halo" aria-hidden="true" />
      <Transition name="mascot-swap" mode="out-in">
        <img :key="personaId" :src="mascot" class="trigger-mascot" alt="" />
      </Transition>
      <span class="trigger-code" aria-hidden="true">&lt;/&gt;</span>
      <span class="trigger-status" aria-hidden="true" />
    </button>

    <span class="companion-tooltip" aria-hidden="true">{{ roleName }}</span>
    <span class="sr-only" aria-live="polite">{{ announcement }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import { PAIR_PERSONAS, usePairPersona, type PairGuideAction } from '@/data/pairPersonas'

type CompanionRole = 'student' | 'teacher'
interface WorkbenchContext {
  taskId: string
  taskTitle: string
  language: string
  version: string | number
  projectId: number | null
  failedTests: number
  stage: number
  pairRole: string
}

const PANEL_ID = 'role-companion-panel'
const TITLE_ID = 'role-companion-title'
const SUGGESTION_ID = 'input-guard-v1'
const SUGGESTION_TEXT = '先做输入守卫：把“温度是否为有效数字”的判断放在主条件前，再处理阈值分支。'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { personaId, persona, requestBusy, selectPersona } = usePairPersona()
const open = ref(false)
const panelMaxHeight = ref(0)
const temperatureExampleOpen = ref(false)
const selectedAction = ref('')
const announcement = ref('')
const rootEl = ref<HTMLElement>()
const panelEl = ref<HTMLElement>()
const triggerButton = ref<HTMLButtonElement>()
const closeButton = ref<HTMLButtonElement>()
const thoughtInput = ref<HTMLTextAreaElement>()
const thought = ref('')
const suggestionOpen = ref(false)
const decisionMode = ref<'' | 'adopt' | 'reject'>('')
const rejectReason = ref('')
const decisionNotice = ref('')
const workbenchContext = ref<WorkbenchContext>({
  taskId: '',
  taskTitle: '当前编程任务',
  language: 'Python',
  version: '本地草稿',
  projectId: null,
  failedTests: 0,
  stage: 1,
  pairRole: '驾驶员',
})

const visible = computed(
  () =>
    auth.isLoggedIn &&
    (auth.role === 'student' || auth.role === 'teacher'),
)
const accountRole = computed<CompanionRole>(() => auth.role === 'teacher' ? 'teacher' : 'student')
const isWorkbench = computed(() => accountRole.value === 'student' && route.path === '/student/ide')
const isAssessment = computed(() => route.path.startsWith('/student/assess'))
const temperatureCoachAvailable = computed(() => isWorkbench.value && personaId.value === 'guide'
  && route.query.taskId === 'A-03'
  && workbenchContext.value.taskId === 'A-03' && /温度/.test(workbenchContext.value.taskTitle)
  && workbenchContext.value.projectId != null)
const mascot = computed(() => persona.value.image)
const roleName = computed(() => `${persona.value.name}·${persona.value.roleLabel}`)
const identityLabel = computed(() => `${accountRole.value === 'teacher' ? '教师支持' : '学生学习'} · 本地引导`)
const panelTitle = computed(() => roleName.value)
const panelCopy = computed(() => isAssessment.value ? '测评期间，我只帮你了解操作流程。' : persona.value.description)
const actions = computed<readonly PairGuideAction[]>(() => {
  if (isAssessment.value) return personaId.value === 'guide' ? [
    { id: 'assessment-start', label: '了解作答流程', detail: '先看安排，再独立完成', steps: ['先查看老师安排的测评是否开放。', '按页面说明独立作答；未开放时等待老师通知。'] },
    { id: 'assessment-submit', label: '找到提交记录', detail: '确认自己的提交状态', steps: ['在“我的记录”找到本次测评。', '查看提交回执；尚无记录时不要把草稿当作已提交。'] },
    { id: 'assessment-ready', label: '准备独立作答', detail: '先看页面要求', steps: ['检查页面提示的作答时间和可用工具。', '按老师要求独立完成；不在伙伴面板里讨论试题。'] },
  ] : [
    { id: 'assessment-feedback', label: '了解反馈开放条件', detail: '何时可以看结果？', steps: ['先查看页面标明的反馈开放条件。', '结果未发布时，我不会评价作答表现。'] },
    { id: 'assessment-help', label: '遇到操作问题', detail: '让老师帮忙确认', steps: ['保留页面显示的状态或提示文字。', '向老师说明卡在哪一步，不在这里粘贴试题或答案。'] },
    { id: 'assessment-wait', label: '确认反馈状态', detail: '以页面发布状态为准', steps: ['看清反馈是否已经发布。', '未发布时先等待老师通知，不推测分数或答案。'] },
  ]
  if (accountRole.value === 'teacher') return personaId.value === 'guide' ? [
    { id: 'teacher-goal', label: '明确支持目标', detail: '谁需要帮助，下一步做什么', steps: ['先打开该学生有权限查看的任务原件。', '写清要支持的具体步骤和预期变化；不要只按次数下判断。'] },
    { id: 'teacher-plan', label: '安排支持步骤', detail: '一次只推进一小步', steps: ['给出一个学生能执行的小动作。', '约定用哪份新作品或测试结果复核。'] },
    { id: 'teacher-question', label: '准备一个问题', detail: '让学生说清自己的想法', steps: ['围绕学生已有的作品提出一个具体问题。', '留出独立思考和解释的机会，再决定下一步支持。'] },
  ] : [
    { id: 'teacher-check', label: '核对证据', detail: '分清事实与暂定判断', steps: ['核对任务范围、作品版本和学生解释。', '同时查看支持与冲突证据，缺失时保留判断。'] },
    { id: 'teacher-review', label: '准备效果复核', detail: '送达不等于有效', steps: ['确认学生实际收到并如何处理反馈。', '用不同的前后证据复核；没有新证据时只能标记待验证。'] },
    { id: 'teacher-boundary', label: '保留待核判断', detail: '缺少证据时先不定级', steps: ['指出判断依据来自哪个任务与版本。', '证据不足时写明待教师核对，并列出还需要什么原件。'] },
  ]
  return persona.value.actions
})
const activeAction = computed(() => actions.value.find(action => action.id === selectedAction.value))
const thoughtCount = computed(() => thought.value.trim().length)
const thoughtReady = computed(() => thoughtCount.value >= 20)

function togglePanel() {
  if (open.value) closePanel(true)
  else openPanel()
}

function updatePanelBounds() {
  const trigger = triggerButton.value
  if (!open.value || !trigger) return
  const viewportTop = window.visualViewport?.offsetTop ?? 0
  const gap = Number.parseFloat(getComputedStyle(rootEl.value ?? trigger).getPropertyValue('--panel-gap')) || 10
  panelMaxHeight.value = Math.max(0, Math.min(690, trigger.getBoundingClientRect().top - viewportTop - gap - 12))
}

async function openPanel() {
  open.value = true
  announcement.value = `${roleName.value}功能面板已展开`
  await nextTick()
  updatePanelBounds()
  closeButton.value?.focus({ preventScroll: true })
}

function closePanel(restoreFocus = false) {
  if (!open.value) return
  open.value = false
  temperatureExampleOpen.value = false
  announcement.value = `${roleName.value}功能面板已收起`
  if (restoreFocus) nextTick(() => triggerButton.value?.focus())
}

function onTemperatureToggle(event: Event) {
  temperatureExampleOpen.value = (event.target as HTMLDetailsElement).open
}

async function go(path: string) {
  closePanel(false)
  if (route.path !== path) await router.push(path)
  await nextTick()
  triggerButton.value?.focus()
}

function toggleSuggestion() {
  if (!temperatureCoachAvailable.value || !thoughtReady.value) return
  suggestionOpen.value = !suggestionOpen.value
  decisionMode.value = ''
  decisionNotice.value = ''
}

function confirmAdopt() {
  const answer = thought.value.trim()
  if (!temperatureCoachAvailable.value || answer.length < 20 || !workbenchContext.value.taskId || workbenchContext.value.projectId == null) return
  const evidence = {
    suggestionId: SUGGESTION_ID,
    suggestion: SUGGESTION_TEXT,
    thought: answer,
    taskId: workbenchContext.value.taskId,
    projectId: workbenchContext.value.projectId,
  }
  window.dispatchEvent(new CustomEvent('cx:pair-suggestion-adopt', {
    detail: evidence,
  }))
  window.dispatchEvent(new CustomEvent('cx:pair-suggestion-decision', {
    detail: { ...evidence, type: 'adopted' },
  }))
  decisionMode.value = ''
  decisionNotice.value = '已发送本机草稿请求，请到编辑区确认并运行验证。'
  announcement.value = decisionNotice.value
}

function saveReject() {
  const reason = rejectReason.value.trim()
  const answer = thought.value.trim()
  if (!temperatureCoachAvailable.value || !reason || answer.length < 20 || !workbenchContext.value.taskId || workbenchContext.value.projectId == null) return
  window.dispatchEvent(new CustomEvent('cx:pair-suggestion-decision', {
    detail: {
      type: 'rejected',
      suggestionId: SUGGESTION_ID,
      suggestion: SUGGESTION_TEXT,
      thought: answer,
      taskId: workbenchContext.value.taskId,
      projectId: workbenchContext.value.projectId,
      reason,
    },
  }))
  decisionMode.value = ''
  decisionNotice.value = '已发送本机记录请求，请到过程记录中确认。'
  announcement.value = decisionNotice.value
  rejectReason.value = ''
}

function resetCoach() {
  temperatureExampleOpen.value = false
  selectedAction.value = ''
  thought.value = ''
  suggestionOpen.value = false
  decisionMode.value = ''
  rejectReason.value = ''
  decisionNotice.value = ''
}

function onWorkbenchContext(event: Event) {
  if (!isWorkbench.value) return
  const detail = (event as CustomEvent<Partial<WorkbenchContext>>).detail
  if (!detail || typeof detail !== 'object') return
  if (detail.taskId !== workbenchContext.value.taskId || detail.projectId !== workbenchContext.value.projectId) resetCoach()
  workbenchContext.value = { ...workbenchContext.value, ...detail }
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!open.value || rootEl.value?.contains(event.target as Node)) return
  closePanel(false)
}

function onDocumentKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !open.value) return
  event.preventDefault()
  closePanel(true)
}

watch(() => auth.user?.id, () => {
  closePanel(false)
  resetCoach()
  workbenchContext.value = { ...workbenchContext.value, taskId: '', taskTitle: '', projectId: null }
})
watch(personaId, () => {
  resetCoach()
  announcement.value = `已切换为${roleName.value}，${persona.value.description}`
})
watch(() => route.fullPath, () => {
  const shouldRestoreFocus = open.value && !!panelEl.value?.contains(document.activeElement)
  closePanel(shouldRestoreFocus && visible.value)
  resetCoach()
  if (!isWorkbench.value) workbenchContext.value = { ...workbenchContext.value, taskId: '', taskTitle: '', projectId: null }
})
watch(thoughtReady, ready => {
  if (!ready) {
    suggestionOpen.value = false
    decisionMode.value = ''
  }
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeyDown)
  window.addEventListener('cx:workbench-context', onWorkbenchContext)
  window.addEventListener('resize', updatePanelBounds)
  window.visualViewport?.addEventListener('resize', updatePanelBounds)
  window.visualViewport?.addEventListener('scroll', updatePanelBounds)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeyDown)
  window.removeEventListener('cx:workbench-context', onWorkbenchContext)
  window.removeEventListener('resize', updatePanelBounds)
  window.visualViewport?.removeEventListener('resize', updatePanelBounds)
  window.visualViewport?.removeEventListener('scroll', updatePanelBounds)
})
</script>

<style scoped>
.role-companion {
  --companion-accent: #5c7cff;
  --companion-accent-soft: rgba(92, 124, 255, .14);
  --companion-size: 70px;
  --companion-radius: 35px;
  --panel-gap: 10px;
  --panel-tail-size: 14px;
  --panel-tail-half: 7px;
  position: fixed;
  right: 22px;
  bottom: calc(22px + env(safe-area-inset-bottom));
  z-index: var(--z-fab, 120);
  display: grid;
  justify-items: end;
}
.role-companion::before {
  content: '';
  position: absolute;
  right: calc(var(--companion-radius) - var(--panel-tail-half));
  bottom: calc(var(--companion-size) + var(--panel-gap) - var(--panel-tail-half) - 1px);
  z-index: 1;
  width: var(--panel-tail-size);
  height: var(--panel-tail-size);
  border-right: 1px solid rgba(211, 220, 238, .9);
  border-bottom: 1px solid rgba(211, 220, 238, .9);
  border-radius: 2px;
  background: rgba(255, 255, 255, .98);
  box-shadow: 4px 4px 10px rgba(30, 47, 83, .08);
  opacity: 0;
  transform: translateY(5px) rotate(45deg) scale(.72);
  pointer-events: none;
  transition: opacity 140ms ease, transform 180ms cubic-bezier(.08, .82, .17, 1);
}
.role-companion.is-open::before {
  opacity: 1;
  transform: translateY(0) rotate(45deg) scale(1);
}
.role-companion.is-teacher {
  --companion-accent: #14a07f;
  --companion-accent-soft: rgba(20, 160, 127, .14);
}
.role-companion.persona-guide {
  --companion-accent: #bd533b;
  --companion-accent-soft: rgba(189, 83, 59, .1);
}
.role-companion.persona-review {
  --companion-accent: #427d55;
  --companion-accent-soft: rgba(66, 125, 85, .12);
}
.role-companion.is-observe { bottom: calc(80px + env(safe-area-inset-bottom)); }
.role-companion.is-studio { bottom: calc(88px + env(safe-area-inset-bottom)); }

.companion-trigger {
  position: relative;
  z-index: 2;
  width: var(--companion-size);
  height: var(--companion-size);
  border: 1px solid rgba(255, 255, 255, .9);
  border-radius: 50%;
  padding: 0;
  overflow: visible;
  cursor: pointer;
  background: linear-gradient(145deg, rgba(255,255,255,.98), rgba(240,245,255,.92));
  box-shadow: 0 18px 44px rgba(55, 76, 126, .24), inset 0 1px 0 #fff;
  isolation: isolate;
  animation: companion-float 3.8s ease-in-out infinite;
  transition: transform 180ms ease, box-shadow 180ms ease;
}
.is-teacher .companion-trigger { background: linear-gradient(145deg, #fff, #effbf7); }
.companion-trigger:hover { transform: translateY(-2px) scale(1.035); box-shadow: 0 22px 48px rgba(55, 76, 126, .3); }
.companion-trigger:active { transform: translateY(0) scale(.98); }
.companion-trigger:focus-visible { outline: 3px solid var(--companion-accent); outline-offset: 4px; }
.role-companion.is-open .companion-trigger {
  animation: none;
  translate: 0 0;
  transform: translateY(0) scale(.96);
  box-shadow: 0 14px 34px rgba(55, 76, 126, .2), inset 0 1px 0 #fff;
}
.trigger-halo {
  position: absolute;
  inset: -7px;
  z-index: -1;
  border-radius: inherit;
  background: radial-gradient(circle, var(--companion-accent-soft) 0 52%, transparent 54%);
  box-shadow: 0 0 0 1px var(--companion-accent-soft);
}
.trigger-mascot {
  position: absolute;
  width: 88px;
  height: 88px;
  right: -8px;
  bottom: -4px;
  object-fit: contain;
  filter: drop-shadow(0 9px 8px rgba(44, 62, 99, .16));
  pointer-events: none;
}
.trigger-code {
  position: absolute;
  left: -8px;
  top: -6px;
  min-width: 31px;
  height: 24px;
  padding: 0 6px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  color: #fff;
  background: var(--companion-accent);
  box-shadow: 0 5px 14px rgba(55, 76, 126, .25);
  font: 700 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.trigger-status {
  position: absolute;
  right: 1px;
  bottom: 2px;
  width: 13px;
  height: 13px;
  border: 3px solid #fff;
  border-radius: 50%;
  background: #38c793;
}

.companion-tooltip {
  position: absolute;
  right: 78px;
  bottom: 20px;
  width: max-content;
  max-width: 180px;
  padding: 7px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--r-pill);
  color: var(--color-text-2);
  background: rgba(255,255,255,.94);
  box-shadow: var(--shadow-sm);
  font-size: var(--fs-xs);
  opacity: 0;
  transform: translateX(5px);
  pointer-events: none;
  transition: opacity 160ms ease, transform 160ms ease;
}
.companion-trigger:hover + .companion-tooltip,
.companion-trigger:focus-visible + .companion-tooltip { opacity: 1; transform: translateX(0); }
.role-companion.is-open .companion-tooltip { opacity: 0; transform: translateX(5px); }

.companion-panel {
  box-sizing: border-box;
  overscroll-behavior: contain;
  position: absolute;
  z-index: 2;
  right: 0;
  bottom: calc(var(--companion-size) + var(--panel-gap));
  width: min(344px, calc(100vw - 24px));
  max-height: min(560px, calc(100vh - 132px));
  max-height: min(560px, calc(100dvh - 132px));
  overflow: auto;
  padding: 16px;
  border: 1px solid rgba(211, 220, 238, .9);
  border-radius: 22px;
  color: var(--color-text);
  background: rgba(255, 255, 255, .97);
  box-shadow: 0 22px 60px rgba(30, 47, 83, .22), inset 0 1px 0 rgba(255, 255, 255, .96);
  backdrop-filter: blur(18px);
  transform-origin:
    calc(100% - var(--companion-radius))
    calc(100% + var(--panel-gap) + var(--companion-radius));
}
.role-companion.is-studio .companion-panel {
  max-height: min(560px, calc(100vh - 184px - env(safe-area-inset-bottom)));
  max-height: min(560px, calc(100dvh - 184px - env(safe-area-inset-bottom)));
}
.role-companion.is-observe .companion-panel {
  max-height: min(560px, calc(100vh - 176px - env(safe-area-inset-bottom)));
  max-height: min(560px, calc(100dvh - 176px - env(safe-area-inset-bottom)));
}
.panel-head { display: flex; align-items: center; gap: 11px; }
.panel-avatar {
  width: 48px;
  height: 48px;
  flex: 0 0 48px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 17px;
  background: linear-gradient(145deg, #f4f7ff, var(--companion-accent-soft));
}
.panel-avatar img { width: 44px; height: 46px; object-fit: contain; }
.panel-heading { min-width: 0; display: grid; gap: 2px; }
.panel-heading small { color: var(--companion-accent); font-size: 11px; font-weight: var(--fw-bold); letter-spacing: .05em; }
.panel-heading b { font-size: 17px; line-height: 1.3; }
.panel-close {
  width: 40px;
  height: 40px;
  margin-left: auto;
  display: grid;
  place-items: center;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  color: var(--color-text-2);
  background: var(--color-surface);
  cursor: pointer;
}
.panel-close:hover { color: var(--color-text); background: var(--ink-a06); }
.panel-close:focus-visible,
.quick-action:focus-visible { outline: 3px solid var(--companion-accent); outline-offset: 2px; }
.panel-copy { margin: 12px 0 11px; color: var(--color-text-2); font-size: var(--fs-sm); line-height: 1.6; }
.persona-options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
.persona-options button {
  display: flex; align-items: center; gap: 7px; min-width: 0; min-height: 64px;
  padding: 7px; border: 1px solid var(--color-border); border-radius: 15px;
  background: #fff; color: var(--color-text); text-align: left; cursor: pointer;
}
.persona-options button[aria-pressed="true"] { border-color: var(--companion-accent); background: var(--companion-accent-soft); box-shadow: inset 0 0 0 1px var(--companion-accent); }
.persona-options button:disabled { cursor: wait; opacity: .6; }
.persona-options img { width: 38px; height: 46px; object-fit: contain; flex-shrink: 0; }
.persona-options span { display: grid; gap: 3px; min-width: 0; }
.persona-options b { font-size: 12px; }
.persona-options small { color: var(--color-text-2); font-size: 11px; }
.persona-options button:focus-visible, .studio-link:focus-visible { outline: 3px solid var(--companion-accent); outline-offset: 3px; }
.local-guide { padding: 12px; margin-top: 10px; border: 1px solid var(--companion-accent-soft); border-radius: 14px; background: var(--companion-accent-soft); font-size: 13px; line-height: 1.6; }
.local-guide ol { margin: 8px 0 0; padding-left: 20px; }
.local-guide li + li { margin-top: 6px; }
.temperature-example { margin-top: 12px; padding: 0 10px 10px; border: 1px solid var(--color-border); border-radius: 14px; background: #fbfcff; }
.temperature-example:not([open]) { padding-bottom: 0; }
.temperature-example summary { min-height: 44px; padding: 12px 0; cursor: pointer; font-size: 12px; font-weight: 700; color: var(--companion-accent); }
.temperature-example summary:focus-visible { outline: 3px solid var(--companion-accent); outline-offset: 2px; border-radius: 6px; }
.studio-link { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 42px; padding: 8px 10px; margin-top: 12px; border: 1px solid var(--color-border); border-radius: 13px; color: var(--color-text-2); background: #fff; cursor: pointer; font-size: 12px; }
.role-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  border: 1px solid var(--companion-accent-soft);
  border-radius: 13px;
  color: var(--color-text-2);
  background: var(--companion-accent-soft);
  font-size: 12px;
}
.role-state__dot { width: 8px; height: 8px; border-radius: 50%; background: #38c793; box-shadow: 0 0 0 4px rgba(56,199,147,.14); }
.quick-actions { display: grid; gap: 7px; margin-top: 12px; }
.quick-action {
  width: 100%;
  min-height: 56px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid var(--color-border);
  border-radius: 15px;
  text-align: left;
  color: var(--color-text);
  background: var(--color-surface);
  cursor: pointer;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}
.quick-action:hover,
.quick-action.active { transform: translateY(-1px); border-color: var(--companion-accent); background: var(--companion-accent-soft); }
.quick-action__icon { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 11px; color: var(--companion-accent); background: var(--companion-accent-soft); }
.quick-action > span:nth-child(2) { min-width: 0; display: grid; gap: 2px; }
.quick-action b { font-size: var(--fs-sm); }
.quick-action small { overflow: hidden; color: var(--color-text-3); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.panel-foot { margin: 10px 2px 0; color: var(--color-text-3); font-size: 11px; line-height: 1.5; }

.role-companion.is-workbench {
  bottom: calc(18px + env(safe-area-inset-bottom));
}
.role-companion.is-workbench .companion-trigger { animation: none; }
.is-workbench .companion-panel {
  width: min(392px, calc(100vw - 24px));
  max-height: min(690px, calc(100vh - 112px));
  max-height: min(690px, calc(100dvh - 112px));
  border-color: rgba(199, 210, 236, .94);
  background: rgba(255, 255, 255, .985);
}
.workbench-context {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 12px 0 0;
}
.workbench-context span {
  min-height: 26px;
  display: inline-flex;
  align-items: center;
  padding: 4px 9px;
  border: 1px solid rgba(79, 111, 245, .16);
  border-radius: 999px;
  color: #4059b7;
  background: #f3f6ff;
  font-size: 11px;
  font-weight: 700;
}
.workbench-context span.danger {
  border-color: rgba(225, 101, 78, .18);
  color: #bd4d38;
  background: #fff3ef;
}
.coach-copy { margin-bottom: 12px; }
.thought-field {
  position: relative;
  display: grid;
  gap: 7px;
  padding: 11px;
  border: 1px solid #dce4f2;
  border-radius: 15px;
  background: #fbfcff;
}
.thought-field > span {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}
.thought-field small { color: var(--color-text-3); font-size: 11px; font-weight: 500; }
.thought-field textarea,
.reject-box textarea {
  width: 100%;
  resize: vertical;
  border: 0;
  outline: 0;
  color: var(--color-text);
  background: transparent;
  font: inherit;
  font-size: 13px;
  line-height: 1.55;
}
.thought-field textarea { min-height: 76px; padding: 0 0 20px; }
.thought-field textarea::placeholder,
.reject-box textarea::placeholder { color: #98a3b5; }
.thought-field:focus-within { border-color: var(--companion-accent); box-shadow: 0 0 0 3px var(--companion-accent-soft); }
.thought-field em {
  position: absolute;
  right: 11px;
  bottom: 9px;
  color: #8b96a8;
  font-size: 11px;
  font-style: normal;
  font-variant-numeric: tabular-nums;
}
.thought-field em.ready { color: #178c6f; font-weight: 700; }
.coach-primary {
  width: 100%;
  min-height: 44px;
  margin-top: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--companion-accent);
  border-radius: 13px;
  color: #fff;
  background: var(--companion-accent);
  box-shadow: 0 9px 20px rgba(79, 111, 245, .18);
  cursor: pointer;
  font-size: 13px;
  font-weight: 750;
}
.coach-primary:hover:not(:disabled) { filter: brightness(.97); transform: translateY(-1px); }
.coach-primary:disabled {
  border-color: #d7deeb;
  color: #8d98aa;
  background: #eef1f6;
  box-shadow: none;
  cursor: not-allowed;
}
.suggestion-card {
  margin-top: 9px;
  padding: 12px;
  border: 1px solid rgba(79, 111, 245, .2);
  border-radius: 15px;
  background: linear-gradient(145deg, #f8faff, #f3f6ff);
}
.suggestion-level { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.suggestion-level span {
  padding: 4px 8px;
  border-radius: 999px;
  color: #fff;
  background: var(--companion-accent);
  font-size: 10px;
  font-weight: 800;
}
.suggestion-level small { color: #67758d; font-size: 10px; }
.suggestion-card > p { margin: 10px 0 8px; color: #3a465b; font-size: 12px; line-height: 1.6; }
.suggestion-card > code {
  display: block;
  padding: 8px 10px;
  border: 1px dashed rgba(79, 111, 245, .28);
  border-radius: 10px;
  color: #4159b4;
  background: rgba(255,255,255,.72);
  font-size: 11px;
  text-align: center;
}
.suggestion-actions,
.decision-box > div { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
.suggestion-actions button,
.decision-box button {
  min-height: 40px;
  border: 1px solid #d4ddec;
  border-radius: 11px;
  color: #3c4b65;
  background: #fff;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}
.suggestion-actions button:first-child,
.decision-box button:first-child { border-color: var(--companion-accent); color: #fff; background: var(--companion-accent); }
.suggestion-actions button:hover,
.decision-box button:hover:not(:disabled) { transform: translateY(-1px); }
.decision-box {
  margin-top: 10px;
  padding: 10px;
  border: 1px solid #dbe3f1;
  border-radius: 12px;
  background: rgba(255,255,255,.82);
}
.decision-box > b,
.decision-box > label { color: #33415a; font-size: 12px; font-weight: 750; }
.decision-box > p { margin: 4px 0 0; color: #6f7c90; font-size: 11px; line-height: 1.45; }
.decision-box button:disabled { opacity: .5; cursor: not-allowed; }
.reject-box textarea {
  min-height: 58px;
  margin-top: 7px;
  padding: 8px;
  border: 1px solid #d9e1ee;
  border-radius: 9px;
  background: #fff;
}
.decision-notice {
  margin: 9px 0 0;
  padding: 9px 10px;
  border: 1px solid rgba(24, 157, 119, .18);
  border-radius: 11px;
  color: #14795f;
  background: #edf9f5;
  font-size: 11px;
  line-height: 1.45;
}
.coach-primary:focus-visible,
.suggestion-actions button:focus-visible,
.decision-box button:focus-visible,
.reject-box textarea:focus-visible { outline: 3px solid var(--companion-accent-soft); outline-offset: 2px; }
.coach-reveal-enter-active,
.coach-reveal-leave-active { transition: opacity 160ms ease, transform 180ms ease; }
.coach-reveal-enter-from,
.coach-reveal-leave-to { opacity: 0; transform: translateY(-5px) scale(.98); }

.companion-panel-enter-active {
  will-change: transform, opacity;
  transition: opacity 180ms ease, transform 220ms cubic-bezier(.08, .82, .17, 1);
}
.companion-panel-leave-active {
  will-change: transform, opacity;
  transition: opacity 140ms ease, transform 170ms cubic-bezier(.4, 0, 1, 1);
}
.companion-panel-enter-from { opacity: 0; transform: translateY(12px) scale(.86); }
.companion-panel-leave-to { opacity: 0; transform: translateY(8px) scale(.94); }
.mascot-swap-enter-active,
.mascot-swap-leave-active { transition: opacity 180ms ease, transform 200ms ease; }
.mascot-swap-enter-from { opacity: 0; transform: translateY(5px) scale(.9) rotate(4deg); }
.mascot-swap-leave-to { opacity: 0; transform: translateY(-4px) scale(.92) rotate(-4deg); }

@keyframes companion-float {
  0%, 100% { translate: 0 0; }
  50% { translate: 0 -4px; }
}

@media (max-width: 860px) {
  .role-companion {
    --companion-size: 64px;
    --companion-radius: 32px;
    --panel-gap: 10px;
    right: 13px;
    bottom: calc(14px + env(safe-area-inset-bottom));
  }
  .role-companion.is-teacher { bottom: calc(70px + env(safe-area-inset-bottom)); }
  .role-companion.is-studio { bottom: calc(84px + env(safe-area-inset-bottom)); }
  .role-companion.is-observe { bottom: calc(140px + env(safe-area-inset-bottom)); }
  .role-companion.is-workbench {
    --companion-size: 52px;
    --companion-radius: 26px;
    bottom: calc(74px + env(safe-area-inset-bottom));
  }
  .role-companion.is-workbench .trigger-mascot { width: 64px; height: 64px; right: -5px; bottom: -2px; }
  .role-companion.is-workbench .trigger-code { left: -7px; top: -5px; transform: scale(.86); }
  .role-companion.is-workbench .companion-trigger { animation: none; }
  .role-companion.is-workbench .companion-panel {
    max-height: calc(100vh - 154px);
    max-height: calc(100dvh - 154px - env(safe-area-inset-bottom));
  }
  .role-companion.is-observe .companion-panel {
    max-height: calc(100vh - 246px);
    max-height: calc(100dvh - 246px);
  }
  .trigger-mascot { width: 80px; height: 80px; }
  .companion-panel {
    max-height: calc(100vh - 164px);
    max-height: calc(100dvh - 164px);
    border-radius: 20px;
  }
  .companion-tooltip { display: none; }
}

@media (max-width: 420px) {
  .companion-panel { padding: 15px; }
  .quick-action small { white-space: normal; }
  .is-workbench .companion-panel {
    width: calc(100vw - 20px);
    max-height: calc(100vh - 154px);
    max-height: calc(100dvh - 154px - env(safe-area-inset-bottom));
    padding: 13px;
    border-radius: 18px;
  }
  .is-workbench .panel-avatar { width: 42px; height: 42px; flex-basis: 42px; }
  .is-workbench .panel-heading b { font-size: 15px; }
  .suggestion-level { align-items: flex-start; }
  .suggestion-level small { max-width: 150px; text-align: right; }
}

@media (max-height: 520px) {
  .role-companion[class] {
    --companion-size: 52px;
    --companion-radius: 26px;
    bottom: calc(12px + env(safe-area-inset-bottom));
  }
  .role-companion[class] .trigger-mascot { width: 64px; height: 64px; right: -5px; bottom: -2px; }
}

@media (prefers-reduced-motion: reduce) {
  .companion-trigger { animation: none; transition-duration: 1ms; }
  .companion-panel-enter-active,
  .companion-panel-leave-active,
  .mascot-swap-enter-active,
  .mascot-swap-leave-active,
  .role-companion::before,
  .quick-action,
  .coach-primary,
  .coach-reveal-enter-active,
  .coach-reveal-leave-active,
  .companion-tooltip { transition-duration: 1ms; }
}
</style>
