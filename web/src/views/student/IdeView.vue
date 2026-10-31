<!-- @copyBudget 190 — full-screen guided workbench: task, creation, results and traceable evidence. -->
<template>
  <div class="guided-workbench" data-testid="guided-workbench" :inert="isCloudDeployment && cloudLogoutPending" :aria-busy="cloudLogoutPending">
    <header class="command-bar">
      <button class="back-btn" type="button" aria-label="返回学生首页" @click="router.push('/student/home')">
        <BaseIcon name="arrow-left" :size="18" /><span>工作区</span>
      </button>
      <div class="command-context">
        <span class="command-logo" aria-hidden="true"><img :src="asset('ip_horse_plan')" alt="" /></span>
        <span class="command-copy">
          <b>结对编程伙伴</b>
          <small>{{ taskTitleResolved }} / 当前草稿</small>
        </span>
      </div>
      <span class="saved" role="status" aria-live="polite">{{ savedTip || '当前草稿 · 留意保存位置' }}</span>
      <div class="spacer" />
      <details class="more">
        <summary class="more__btn" title="更多" aria-label="更多作品操作">⋯</summary>
        <div class="more__menu glass">
          <label class="more__project">当前作品
            <select class="proj-sel" aria-label="选择当前作品" :value="currentId ?? ''" @change="onSwitch(($event.target as HTMLSelectElement).value)">
              <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.title }}（v{{ p.latest_version }}）</option>
              <option v-if="!projects.length" value="">（暂无作品）</option>
            </select>
          </label>
          <button class="more__item" type="button" :disabled="projBusy" @click="newProject"><BaseIcon name="plus" /> {{ projBusy ? '新建中…' : '新建作品' }}</button>
          <label class="more__item"><BaseIcon name="upload" /> 从本地上传<input ref="fileInput" type="file" accept=".zip" hidden @change="onUpload" /></label>
          <button class="more__item" type="button" :disabled="saving || !currentId" @click="save()"><BaseIcon name="save" /> {{ saving ? '保存中…' : '保存到云端' }}</button>
          <button class="more__item" type="button" :disabled="!currentId || projBusy" @click="download()"><BaseIcon name="download" /> 下载到本地</button>
        </div>
      </details>
      <BaseButton variant="run" size="sm" :disabled="running || testsRunning || projBusy" data-testid="run-program" @click="runProgram"><BaseIcon name="play" /> {{ running ? '运行中…' : '运行程序' }}</BaseButton>
      <BaseButton variant="secondary" size="sm" :disabled="running || testsRunning || projBusy" data-testid="run-tests" @click="runTests"><BaseIcon name="flask" /> {{ testsRunning ? '检查中…' : '运行并检查' }}</BaseButton>
    </header>

    <div v-show="mobileViewport" class="mobile-panel-tabs" data-lint="overlay" role="tablist" aria-label="手机工作面板">
      <button id="mobile-panel-task" type="button" role="tab" data-testid="mobile-panel-task" :aria-selected="mobilePanel === 'task'" aria-controls="task-rail" @click="mobilePanel = 'task'">任务</button>
      <button id="mobile-panel-editor" type="button" role="tab" data-testid="mobile-panel-editor" :aria-selected="mobilePanel === 'editor'" aria-controls="creation-workspace" @click="mobilePanel = 'editor'">编程</button>
      <button id="mobile-panel-result" type="button" role="tab" data-testid="mobile-panel-result" :aria-selected="mobilePanel === 'result'" aria-controls="creation-workspace" @click="openMobileResult">结果</button>
    </div>

    <span class="rail-resize-status" role="status" aria-live="polite">{{ layoutAnnouncement }}</span>

    <div
      ref="workbenchGrid"
      class="workbench-grid"
      :class="{ 'is-resizing': resizingRail }"
      :style="workbenchGridStyle"
      :data-layout="workbenchLayout"
      :data-mobile-panel="mobilePanel"
    >
      <aside id="task-rail" class="task-rail" data-testid="task-rail" aria-label="任务与学习阶段">
        <section class="task-card">
          <span>任务情境 · {{ taskId }} · 说明未接入</span>
          <h1>{{ taskTitleResolved }}</h1>
          <p>{{ taskBrief }}</p>
        </section>

        <nav class="stage-nav" aria-label="六阶段学习路径">
          <button
            v-for="stage in stageItems"
            :key="stage.id"
            type="button"
            :class="['stage-item', { active: activeStage === stage.id, done: stage.done }]"
            :data-testid="`phase-${stage.key}`"
            :aria-current="activeStage === stage.id ? 'step' : undefined"
            @click="selectStage(stage.id)"
          >
            <span class="stage-number"><BaseIcon v-if="stage.done" name="check" :size="15" /><template v-else>{{ stage.id }}</template></span>
            <span><b>{{ stage.label }}</b><small>{{ stage.detail }}</small></span>
            <em>{{ stage.state }}</em>
          </button>
        </nav>

        <p class="stage-gate" :class="{ ready: analysisComplete }">
          <BaseIcon :name="analysisComplete ? 'check-square' : 'lock'" :size="16" />
          {{ analysisComplete ? '三个分析字段已填写；不代表答案正确或能力达标。' : '可以先探索代码，再补充输入、输出和约束。' }}
        </p>
      </aside>

      <button
        v-if="!mobileViewport"
        type="button"
        class="rail-resizer rail-resizer--task"
        :class="{ 'is-active': resizingRail === 'task', 'is-at-limit': railAtLimit('task') }"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整任务区宽度"
        aria-controls="task-rail creation-workspace"
        :aria-valuemin="railLimits('task').min"
        :aria-valuemax="railLimits('task').max"
        :aria-valuenow="railValue('task')"
        :aria-valuetext="`任务区宽度 ${railValue('task')} 像素`"
        title="拖动或使用方向键调整任务区；双击恢复默认"
        data-testid="task-rail-resizer"
        @pointerdown="beginRailResize('task', $event)"
        @lostpointercapture="onRailLostPointerCapture($event)"
        @keydown="onRailKeydown('task', $event)"
        @dblclick="resetRailWidth('task')"
      ><span aria-hidden="true">⋮</span></button>

      <section id="creation-workspace" class="creation-workspace" data-testid="creation-workspace" aria-label="当前阶段创作区">
        <div class="workspace-toolbar">
          <div class="mode-tabs" role="tablist" aria-label="编程语言与表示方式">
            <button
              v-for="mode in MODES" :key="mode.id" role="tab"
              :data-testid="`editor-mode-${mode.id}`"
              :class="['mode-tab', { active: workspaceMode === mode.id }]"
              :aria-selected="workspaceMode === mode.id"
              :disabled="projBusy"
              @click="switchWorkspaceMode(mode.id)"
            >{{ mode.label }}</button>
          </div>
          <span class="version-link"><BaseIcon name="swap" :size="14" /> {{ languageLabel(lang) }} · {{ currentProject ? `云端 v${currentVersion} · 草稿可能不同` : '云端版本未确认' }}</span>
        </div>

        <div class="editor-head">
          <span class="file-pill"><BaseIcon :name="workspaceMode === 'blocks' ? 'blocks' : 'file-text'" /> {{ currentFileName }}</span>
          <span>阶段 {{ activeStage }} · {{ activeStageLabel }}</span>
        </div>

        <main class="stage-canvas">
          <section v-if="activeStage === 1" class="focus-sheet task-focus" data-testid="task-sheet">
            <div class="focus-heading"><span>任务</span><h2>{{ taskTitleResolved }}</h2><p>任务要求尚未接入，请以老师发布的说明为准。下方仅为温度题示例。</p></div>
            <dl v-if="isTemperatureExample" class="task-spec">
              <div><dt>目标</dt><dd>读取温度并依据课堂规则给出活动建议。</dd></div>
              <div><dt>输入</dt><dd>一个表示当前温度的值。</dd></div>
              <div><dt>输出</dt><dd>“适合户外活动”或“留在室内”。</dd></div>
              <div><dt>检查点</dt><dd>边界值与非数字输入都要有明确处理。</dd></div>
            </dl>
            <BaseButton variant="secondary" @click="selectStage(2)">开始分析 <BaseIcon name="arrow-right" /></BaseButton>
          </section>

          <section v-else-if="activeStage === 2 || activeStage === 3" class="focus-sheet design-workspace" data-testid="analysis-panel">
            <div class="focus-heading"><span>{{ activeStage === 2 ? '分析' : '建模' }}</span><h2>{{ activeStage === 2 ? '把输入、输出和约束说清楚' : '把思路排成可执行步骤' }}</h2><p>分析仅在本机尝试保存；伪代码需点击保存并收到云端回执。</p></div>
            <div class="analysis-grid">
              <label><span>输入</span><textarea v-model="analysis.input" data-testid="analysis-input" rows="3" placeholder="程序会接收什么信息？" /></label>
              <label><span>输出</span><textarea v-model="analysis.output" data-testid="analysis-output" rows="3" placeholder="最后要得到什么结果？" /></label>
              <label><span>约束</span><textarea v-model="analysis.constraints" data-testid="analysis-constraints" rows="3" placeholder="范围、边界或不能违反的条件是什么？" /></label>
            </div>
            <label class="pseudo-field"><span>伪代码 · 每行一步</span><textarea v-model="designText" data-testid="pseudocode-editor" rows="7" placeholder="1. 读取输入&#10;2. 验证输入是否合法&#10;3. 按边界条件判断&#10;4. 输出活动建议" /></label>
            <div class="design-foot"><span>{{ designTip || (analysisComplete ? '三个字段已填写，请再检查内容是否准确。' : '先补充三个分析字段。') }}</span><BaseButton size="sm" variant="secondary" :disabled="!currentId || designSaving" @click="saveDesign">{{ designSaving ? '保存中…' : '保存分析与伪代码' }}</BaseButton></div>
          </section>

          <section v-else-if="activeStage === 5" class="focus-sheet test-focus" data-testid="test-sheet">
            <div class="focus-heading"><span>测试优化 · 用例尚未验证</span><h2>先看运行，再检查代码线索</h2><p>这里只执行一次草稿并搜索文本，没有逐个输入用例、核对预期与实际输出。</p></div>
            <div class="test-grid">
              <article v-for="item in testCases" :key="item.id" :class="['test-card', `is-${item.status}`]">
                <span><BaseIcon name="file-text" />{{ item.label }}</span>
                <b>{{ testStatusLabel(item.status) }}</b>
                <p>{{ item.message }}</p>
              </article>
            </div>
            <p class="check-next-step">下一步：在自己的记录中写下输入和预期，回到“编码运行”调整程序、运行并人工对照。此页不支持逐用例输入与比对。</p>
            <BaseButton variant="secondary" :disabled="testsRunning || running" @click="runTests"><BaseIcon name="flask" /> {{ testsRunning ? '检查中…' : '运行并检查' }}</BaseButton>
          </section>

          <section v-else-if="activeStage === 6" class="focus-sheet reflection-focus" data-testid="reflection-sheet">
            <div class="focus-heading"><span>反思迁移 · 本机草稿</span><h2>说明你改了什么，还要验证什么</h2><p>内容仅在本机尝试保存，尚未发送给老师；填写长度不代表掌握程度。</p></div>
            <label><span>我解决的关键问题</span><textarea v-model="reflection" rows="4" data-testid="reflection-input" placeholder="例如：我先区分了正常输入和异常输入，再设计对应测试。" /></label>
            <label><span>下次可以迁移的方法</span><textarea v-model="transferNote" rows="4" placeholder="例如：遇到需要转换输入的题目，都先验证输入是否合法。" /></label>
            <p class="reflection-status"><BaseIcon name="file-text" />{{ reflectionComplete ? '已填写 20 字以上，请自己回看解释是否清楚。' : '试着写下 20 字自己的解释。' }}</p>
          </section>

          <div v-else class="editor" data-testid="code-editor-region">
            <BlockEditor
              v-if="lang === 'python' && pyMode === 'block'"
              :key="`blocks-${currentId ?? 'draft'}-${blockRevision}`"
              :initial-state="blockState"
              @code="onBlockCode" @state="onBlockState" @blocks="onBlockCount"
            />
            <CodeEditor v-else v-model="code[lang]" :language="lang" />
          </div>
        </main>

        <details ref="outputDrawer" class="output-drawer" :class="{ 'cloud-output-drawer': isCloudDeployment }" aria-label="程序输出、测试与预览">
          <summary class="output-summary">
            <span><BaseIcon name="monitor" :size="15" />运行结果</span>
            <small>{{ testsRun ? '本页检查 · 用例未验证' : output ? '已有运行输出' : '运行后自动展开' }}</small>
          </summary>
          <div class="output-content">
          <div class="output-tabs" role="tablist" aria-label="结果类型">
            <button v-for="tab in outputTabs" :key="tab.id" type="button" role="tab" :aria-selected="outputTab === tab.id" :class="{ active: outputTab === tab.id }" @click="outputTab = tab.id">{{ tab.label }}</button>
          </div>
          <pre v-if="outputTab === 'run'" class="console-body" :class="{ err: hasError }" role="status" aria-live="polite" data-testid="console-output">{{ output || '程序尚未运行。\n点击「运行程序」执行当前草稿。' }}</pre>
          <div v-else-if="outputTab === 'tests'" class="test-results" data-testid="test-results">
            <p>用例尚未验证：没有逐用例的输入、预期和实际输出比对。</p>
            <p v-if="!testsRun">点击「运行并检查」查看本次运行与文本线索。</p>
            <button v-for="item in testCases" v-else :key="item.id" type="button" @click="selectStage(5)"><BaseIcon name="file-text" /><span><b>{{ item.label }}</b><small>{{ item.message }}</small></span><em>{{ testStatusLabel(item.status) }}</em></button>
          </div>
          <div v-else-if="outputTab === 'preview'" class="turtle-wrap" aria-label="程序绘图预览"><TurtleCanvas :cmds="turtleCmds" /></div>
          <div v-else class="mobile-evidence-list">
            <section v-if="decisionEvidenceOpen && companionEvidence" class="companion-evidence-original" data-testid="companion-evidence-original" aria-label="伙伴建议决策原件">
              <b>伙伴建议决策 · 本机记录，尚未发送给老师</b>
              <dl>
                <div><dt>我的思路</dt><dd>{{ companionEvidence.thought }}</dd></div>
                <div><dt>局部建议</dt><dd>{{ companionEvidence.suggestion }}</dd></div>
                <div><dt>我的决策</dt><dd>{{ companionEvidenceDecisionLabel }}</dd></div>
              </dl>
            </section>
            <button v-for="item in evidenceItems" :key="item.id" type="button" @click="openEvidenceItem(item)"><span><b>{{ item.title }}</b><small>{{ item.detail }}</small></span><BaseIcon name="arrow-right" /></button>
          </div>
          </div>
        </details>
      </section>

      <button
        v-if="!mobileViewport"
        type="button"
        class="rail-resizer rail-resizer--evidence"
        :class="{ 'is-active': resizingRail === 'evidence', 'is-at-limit': railAtLimit('evidence') }"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整过程证据区宽度"
        aria-controls="creation-workspace evidence-rail"
        :aria-valuemin="railLimits('evidence').min"
        :aria-valuemax="railLimits('evidence').max"
        :aria-valuenow="railValue('evidence')"
        :aria-valuetext="`过程证据区宽度 ${railValue('evidence')} 像素`"
        title="拖动或使用方向键调整过程证据区；双击恢复默认"
        data-testid="evidence-rail-resizer"
        @pointerdown="beginRailResize('evidence', $event)"
        @lostpointercapture="onRailLostPointerCapture($event)"
        @keydown="onRailKeydown('evidence', $event)"
        @dblclick="resetRailWidth('evidence')"
      ><span aria-hidden="true">⋮</span></button>

      <aside id="evidence-rail" class="evidence-rail" data-testid="evidence-rail" aria-label="过程证据">
        <header><div><h2>过程记录</h2><p>点开回看，留意保存位置</p></div><span>非评分</span></header>
        <button v-for="item in evidenceItems" :key="item.id" type="button" :class="['evidence-card', { ready: item.ready }]" @click="openEvidenceItem(item)">
          <span class="evidence-icon"><BaseIcon :name="item.icon" /></span>
          <span><b>{{ item.title }}</b><small>{{ item.detail }}</small></span>
          <BaseIcon name="arrow-right" />
        </button>
        <section class="teacher-anchor">
          <b>老师会怎样看 · 示例</b>
          <p><span>目前</span>检查未同步</p>
          <p><span>下一步</span>准备输入、预期与实际输出</p>
          <p><span>对照</span>前后作品</p>
        </section>
      </aside>
    </div>
    <MilestoneToast />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router'
import CodeEditor from '@/components/editor/CodeEditor.vue'
import BlockEditor from '@/components/editor/BlockEditor.vue'
import TurtleCanvas from '@/components/editor/TurtleCanvas.vue'
import { asset } from '@/assets/assets'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseIcon, { type IconName } from '@/components/ui/BaseIcon.vue'
import MilestoneToast from '@/components/studio/MilestoneToast.vue'
import { runCode } from '@/api/run'
import { runPythonTurtle, pyodideReady } from '@/editor/turtle/usePyodide'
import { projectsApi, saveLocalDraft, loadLocalDraft, type Project } from '@/api/projects'
import { ctApi } from '@/api/ct'
import { useMilestone } from '@/composables/useMilestone'
import { useAuthStore } from '@/stores/auth'
import { isCloudDeployment } from '@/config/deployment'
import { canLeaveCloudDraft, cloudDraftFingerprint } from '@/api/cloudDraft'

let prevError = false // 用于识别"报错→修复"的问题解决路径

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { claim: milestone } = useMilestone()
const pyMode = ref<'block' | 'code'>('block') // Python 默认积木模式（海龟编辑器风格）
const blockState = ref<string | null>(null)
const blockRevision = ref(0)
const pythonTextDirty = ref(false)
let syncingProject = false
const projects = ref<Project[]>([])
const currentId = ref<number | null>(null)
const saving = ref(false)
const projBusy = ref(false)   // 新建/下载/导入互斥忙标志（裁决1：防双击）
/** 埋点公共上下文。
 *  房间号（P0-1）：IDE 侧埋点同样要归房 —— observation 窗与 ct_events 的 join 键是 room+round。
 *  与结对台同一记忆键，两处只需填一次；URL ?room= 优先（老师发带参链接）。
 *
 *  另带**创作情境协变量** lang / editMode：
 *  design_create 只在「Python + 积木模式」下才可能触发（见下方 onBlockCount 与模板的 v-if），
 *  而它扛着 model 维 70%、decompose 25%、abstract（研究口径）30%。不记录情境，
 *  事后就永远分不开「没建模」与「在代码模式下做了但测不到」——而这两者对结论的含义相反。
 *  editMode 按**实际渲染条件**派生而不是直接读 pyMode：C++/C 下根本没有积木编辑器，
 *  pyMode 的残留值在那里不代表任何事实。 */
const trackOpt = () => {
  const r = String(route.query.room || localStorage.getItem('cx-studio-room') || '')
  const editMode = lang.value === 'python' && pyMode.value === 'block' ? 'block' : 'code'
  return { ...(r ? { roomId: r } : {}), lang: lang.value, editMode }
}
const savedTip = ref('')
const fileInput = ref<HTMLInputElement>()
const outputDrawer = ref<HTMLDetailsElement>()
const mobileViewport = ref(false)
let mobileMedia: MediaQueryList | undefined
type RailSide = 'task' | 'evidence'
type WorkbenchLayout = 'wide' | 'compact' | 'mobile'
interface RailDragState {
  side: RailSide
  pointerId: number
  startX: number
  startWidth: number
  pendingX: number
  handle: HTMLElement
}
const TASK_RAIL_MIN = 200
const TASK_RAIL_MAX = 360
const EVIDENCE_RAIL_MIN = 220
const EVIDENCE_RAIL_MAX = 380
const WORKBENCH_WIDE_MIN = 980
const workbenchGrid = ref<HTMLElement>()
const workbenchWidth = ref(0)
const taskRailWidth = ref<number | null>(null)
const evidenceRailWidth = ref<number | null>(null)
const resizingRail = ref<RailSide | null>(null)
const layoutAnnouncement = ref('')
const workbenchLayout = computed<WorkbenchLayout>(() => {
  if (mobileViewport.value) return 'mobile'
  return workbenchWidth.value >= WORKBENCH_WIDE_MIN ? 'wide' : 'compact'
})
const workbenchGridStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {}
  if (taskRailWidth.value != null) style['--task-rail-width'] = `${taskRailWidth.value}px`
  if (evidenceRailWidth.value != null) style['--evidence-rail-width'] = `${evidenceRailWidth.value}px`
  return style
})
let workbenchResizeObserver: ResizeObserver | undefined
let railDrag: RailDragState | null = null
let railResizeFrame = 0

function railDefault(side: RailSide) {
  if (side === 'task') return workbenchLayout.value === 'wide' ? 238 : 205
  return 256
}

function railValue(side: RailSide) {
  const stored = side === 'task' ? taskRailWidth.value : evidenceRailWidth.value
  return Math.round(stored ?? railDefault(side))
}

function railVisible(side: RailSide) {
  if (workbenchLayout.value === 'mobile') return false
  return side === 'task' || workbenchLayout.value === 'wide'
}

function gridMeasurements() {
  const grid = workbenchGrid.value
  if (!grid) return { width: 0, padding: 0, splitters: 0 }
  const styles = getComputedStyle(grid)
  const padding = Number.parseFloat(styles.paddingLeft) + Number.parseFloat(styles.paddingRight)
  const splitters = Array.from(grid.querySelectorAll<HTMLElement>('.rail-resizer'))
    .filter((item) => getComputedStyle(item).display !== 'none')
    .reduce((total, item) => total + item.getBoundingClientRect().width, 0)
  return { width: grid.getBoundingClientRect().width, padding, splitters }
}

function centerMinimum() {
  if (workbenchLayout.value === 'wide') return workspaceMode.value === 'blocks' ? 480 : 420
  return workspaceMode.value === 'blocks' ? 420 : 360
}

function railLimits(side: RailSide) {
  const min = side === 'task' ? TASK_RAIL_MIN : EVIDENCE_RAIL_MIN
  const nominalMax = side === 'task' ? TASK_RAIL_MAX : EVIDENCE_RAIL_MAX
  if (!railVisible(side)) return { min, max: min }
  const { width, padding, splitters } = gridMeasurements()
  if (!width) return { min, max: nominalMax }
  const otherWidth = side === 'task'
    ? (workbenchLayout.value === 'wide' ? railValue('evidence') : 0)
    : railValue('task')
  const available = Math.floor(width - padding - splitters - centerMinimum() - otherWidth)
  return { min, max: Math.max(min, Math.min(nominalMax, available)) }
}

function railAtLimit(side: RailSide) {
  const value = railValue(side)
  const limits = railLimits(side)
  return value <= limits.min || value >= limits.max
}

function setRailWidth(side: RailSide, requested: number) {
  if (!railVisible(side)) return railValue(side)
  const { min, max } = railLimits(side)
  const next = Math.round(Math.max(min, Math.min(max, requested)))
  if (side === 'task') taskRailWidth.value = next
  else evidenceRailWidth.value = next
  return next
}

function announceRail(side: RailSide, prefix = '') {
  const label = side === 'task' ? '任务区' : '过程证据区'
  layoutAnnouncement.value = `${prefix}${label}宽度 ${railValue(side)} 像素`
}

function fitRailWidths() {
  if (workbenchLayout.value === 'mobile') return
  if (workbenchLayout.value === 'compact') {
    const current = railValue('task')
    const { min, max } = railLimits('task')
    if (taskRailWidth.value != null || current < min || current > max) setRailWidth('task', current)
    return
  }
  const { width, padding, splitters } = gridMeasurements()
  if (!width) return
  const budget = Math.floor(width - padding - splitters - centerMinimum())
  let task = railValue('task')
  let evidence = railValue('evidence')
  let excess = task + evidence - budget
  if (excess <= 0) return
  const evidenceReduction = Math.min(excess, evidence - EVIDENCE_RAIL_MIN)
  evidence -= evidenceReduction
  excess -= evidenceReduction
  if (excess > 0) task -= Math.min(excess, task - TASK_RAIL_MIN)
  taskRailWidth.value = Math.max(TASK_RAIL_MIN, task)
  evidenceRailWidth.value = Math.max(EVIDENCE_RAIL_MIN, evidence)
}

function updateWorkbenchWidth() {
  if (!workbenchGrid.value) return
  workbenchWidth.value = Math.round(workbenchGrid.value.getBoundingClientRect().width)
  void nextTick(fitRailWidths)
}

function beginRailResize(side: RailSide, event: PointerEvent) {
  if (!railVisible(side) || event.button !== 0) return
  if (railDrag) finishRailResize(false)
  const handle = event.currentTarget as HTMLElement
  railDrag = {
    side,
    pointerId: event.pointerId,
    startX: event.clientX,
    startWidth: railValue(side),
    pendingX: event.clientX,
    handle,
  }
  resizingRail.value = side
  window.addEventListener('pointermove', continueRailResize, { passive: false })
  window.addEventListener('pointerup', completeRailResize)
  window.addEventListener('pointercancel', cancelRailPointer)
  try {
    handle.setPointerCapture(event.pointerId)
  } catch {
    // Some embedded browsers can begin a valid resize without exposing capture.
  }
  event.preventDefault()
}

function applyRailPointer(clientX: number) {
  if (!railDrag) return
  const delta = clientX - railDrag.startX
  const requested = railDrag.startWidth + (railDrag.side === 'task' ? delta : -delta)
  setRailWidth(railDrag.side, requested)
}

function continueRailResize(event: PointerEvent) {
  if (!railDrag || event.pointerId !== railDrag.pointerId) return
  if (event.cancelable) event.preventDefault()
  railDrag.pendingX = event.clientX
  if (railResizeFrame) return
  railResizeFrame = requestAnimationFrame(() => {
    railResizeFrame = 0
    if (railDrag) applyRailPointer(railDrag.pendingX)
  })
}

function finishRailResize(shouldAnnounce = true) {
  if (!railDrag) return
  const finished = railDrag
  railDrag = null
  window.removeEventListener('pointermove', continueRailResize)
  window.removeEventListener('pointerup', completeRailResize)
  window.removeEventListener('pointercancel', cancelRailPointer)
  if (railResizeFrame) cancelAnimationFrame(railResizeFrame)
  railResizeFrame = 0
  resizingRail.value = null
  try {
    if (finished.handle.hasPointerCapture(finished.pointerId)) finished.handle.releasePointerCapture(finished.pointerId)
  } catch {}
  if (shouldAnnounce) announceRail(finished.side)
}

function completeRailResize(event: PointerEvent) {
  if (!railDrag || event.pointerId !== railDrag.pointerId) return
  if (railResizeFrame) {
    cancelAnimationFrame(railResizeFrame)
    railResizeFrame = 0
  }
  applyRailPointer(event.clientX)
  finishRailResize()
}

function cancelRailPointer(event: PointerEvent) {
  if (!railDrag || event.pointerId !== railDrag.pointerId) return
  cancelRailResize()
}

function onRailLostPointerCapture(event: PointerEvent) {
  if (!railDrag || event.pointerId !== railDrag.pointerId) return
  finishRailResize()
}

function cancelRailResize() {
  if (!railDrag) return
  const { side, startWidth } = railDrag
  setRailWidth(side, startWidth)
  finishRailResize(false)
  announceRail(side, '已取消调整，')
}

function resetRailWidth(side: RailSide) {
  if (!railVisible(side)) return
  if (side === 'task') taskRailWidth.value = null
  else evidenceRailWidth.value = null
  fitRailWidths()
  announceRail(side, '已恢复默认，')
}

function onRailKeydown(side: RailSide, event: KeyboardEvent) {
  if (!railVisible(side)) return
  const step = event.shiftKey ? 32 : 16
  const current = railValue(side)
  let requested: number | null = null
  if (event.key === 'ArrowLeft') requested = current + (side === 'task' ? -step : step)
  else if (event.key === 'ArrowRight') requested = current + (side === 'task' ? step : -step)
  else if (event.key === 'Home') requested = railLimits(side).min
  else if (event.key === 'End') requested = railLimits(side).max
  else if (event.key === 'Enter') {
    event.preventDefault()
    resetRailWidth(side)
    return
  } else return
  event.preventDefault()
  setRailWidth(side, requested)
  announceRail(side)
}

function onWorkbenchKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && railDrag) cancelRailResize()
}

function onWorkbenchBlur() {
  if (railDrag) finishRailResize()
}
function onBlockCode(generated: string) {
  // 只有图形化面板实际显示时，积木才是 Python 文本的来源。这样加载一个隐藏的
  // BlockEditor 不会静默覆盖学生刚写的文本代码。
  if (pyMode.value === 'block') {
    code.python = generated
    pythonTextDirty.value = false
  }
}
function onBlockState(s: string) {
  blockState.value = s
}
// —— 设计抽屉（D3 拍板执行）——
const design = ref(false)
const designText = ref('')
const designTip = ref('')
const designSaving = ref(false)
const analysis = reactive({ input: '', output: '', constraints: '' })
const analysisComplete = computed(() => Boolean(analysis.input.trim() && analysis.output.trim() && analysis.constraints.trim()))
const designFired = new Set<number>()   // design_create 每作品一次（会话内，语义同 blocksMilestone）
let loadingAnalysis = false
let loadingDesign = false
let designRequest = 0

function toggleDesign() {
  design.value = !design.value
}

function analysisKey(pid: number) {
  return scopedDraftKey(`cx_project_analysis_${pid}`)
}

function loadAnalysis(pid: number) {
  loadingAnalysis = true
  analysis.input = ''
  analysis.output = ''
  analysis.constraints = ''
  try {
    const saved = JSON.parse(localStorage.getItem(analysisKey(pid)) || 'null')
    if (saved && typeof saved === 'object') {
      analysis.input = typeof saved.input === 'string' ? saved.input : ''
      analysis.output = typeof saved.output === 'string' ? saved.output : ''
      analysis.constraints = typeof saved.constraints === 'string' ? saved.constraints : ''
    }
  } catch {}
  queueMicrotask(() => { loadingAnalysis = false })
}

function saveAnalysisDraft(pid: number) {
  try { localStorage.setItem(analysisKey(pid), JSON.stringify(analysis)) } catch {}
}

async function loadDesign(pid: number) {
  const request = ++designRequest
  loadingDesign = true
  designText.value = ''
  try {
    const items = await projectsApi.getDesign(pid)
    if (request !== designRequest || currentId.value !== pid) return
    const ps = items.filter(i => i.type === 'pseudocode')
    designText.value = ps.length ? ps[0].payload : ''
    designTip.value = ''
  } catch {
    if (request === designRequest && currentId.value === pid) designTip.value = '伪代码暂未加载，可稍后重试'
  } finally {
    if (request === designRequest) {
      await nextTick()
      loadingDesign = false
    }
  }
}

async function saveDesign() {
  if (!currentId.value || designSaving.value) return
  designSaving.value = true
  try {
    saveAnalysisDraft(currentId.value)
    await projectsApi.saveDesign(currentId.value, 'pseudocode', designText.value)
    const lines = designText.value.split(String.fromCharCode(10)).filter(l => l.trim()).length
    // ≥3 行才记 design_create（与积木「拼出 ≥3 块」同阈值语义：一两行是备注，多步才是分解）；
    // 每作品一次，防止反复保存刷 model 维（公式对 designs 饱和 k=3，刷三次就到半分点）。
    if (lines >= 3 && !designFired.has(currentId.value)) {
      designFired.add(currentId.value)
      ctApi.track('design_create', `伪代码 ${lines} 行`, currentId.value, trackOpt())
      milestone('first_blocks3')
    }
    designTip.value = '伪代码保存请求已发送，云端结果尚未核验；分析仅在本机尝试保存。'
  } catch {
    designTip.value = '保存失败，稍后再试（内容还在框里）'
  } finally {
    designSaving.value = false
  }
}

let blocksMilestone = false
function onBlockCount(n: number) {
  // `design_create` 的来源：从「打开过设计面板」改为「积木首次拼出 >=3 块」。
  // 打开面板只说明他点了一下，拼出多块才说明他真的在做分解。
  // 这是**口径变更**，已同步升 ct.py 的 FORMULA_VERSION 到 v2。
  //
  // 块数改由 BlockEditor 直接给出。这里曾经拿正则去数 state 字符串里的 XML 标签 ——
  // 而 state 发的是 JSON，匹配恒为空：design_create 与 first_blocks3 从来没触发过，
  // 六维的 model 维一直退化成 `25 + runs*2`，而快照与导出都带着
  // 「已含积木分解证据」的 v2 标签出去了。序列化格式不该让消费方去猜。
  if (blocksMilestone || n < 3) return
  blocksMilestone = true
  ctApi.track('design_create', `积木拼出 ${n} 块`, currentId.value, trackOpt())
  milestone('first_blocks3')
}

type Lang = 'python' | 'cpp' | 'c'
type WorkspaceMode = 'blocks' | 'python' | 'cpp' | 'c'
type StageId = 1 | 2 | 3 | 4 | 5 | 6
type MobilePanel = 'task' | 'editor' | 'result'
type OutputTab = 'run' | 'tests' | 'preview' | 'evidence'
type TestStatus = 'idle' | 'executed' | 'error' | 'hint' | 'missing' | 'filled' | 'incomplete'
interface TestCaseState { id: string; label: string; status: TestStatus; message: string }
interface EvidenceItem { id: string; title: string; detail: string; icon: IconName; ready: boolean; stage: StageId; tab?: OutputTab }
interface CompanionEvidence {
  suggestionId: string
  suggestion: string
  thought: string
  taskId: string
  projectId: number
  decision: 'adopted' | 'rejected'
  reason?: string
  createdAt: string
  stale: boolean
}
interface CompanionEventDetail {
  suggestionId?: string
  suggestion?: string
  thought?: string
  taskId?: string
  projectId?: number
  type?: 'adopted' | 'rejected'
  reason?: string
}
const LANGS: { id: Lang; label: string }[] = [
  { id: 'python', label: 'Python' },
  { id: 'cpp', label: 'C++' },
  { id: 'c', label: 'C' },
]
const MODES: { id: WorkspaceMode; label: string; icon: IconName }[] = [
  { id: 'blocks', label: '图形化', icon: 'blocks' },
  { id: 'python', label: 'Python', icon: 'keyboard' },
  { id: 'cpp', label: 'C++', icon: 'file-text' },
  { id: 'c', label: 'C', icon: 'file-text' },
]

const STARTERS: Record<Lang, string> = {
  python: '# 用海龟画一个正方形\nfor i in range(4):\n    print("画一条边")\n',
  cpp: '#include <iostream>\nint main(){\n    std::cout << "Hello 结对编程" << std::endl;\n    return 0;\n}\n',
  c: '#include <stdio.h>\nint main(){\n    printf("Hello 结对编程\\n");\n    return 0;\n}\n',
}

const lang = ref<Lang>('python')
const code = reactive<Record<Lang, string>>({ ...STARTERS })
const workspaceMode = computed<WorkspaceMode>(() => lang.value === 'python' ? (pyMode.value === 'block' ? 'blocks' : 'python') : lang.value)
watch(workspaceMode, () => fitRailWidths(), { flush: 'sync' })
const currentProject = computed(() => projects.value.find((project) => project.id === currentId.value) ?? null)
const taskTitle = computed(() => typeof route.query.taskTitle === 'string' ? route.query.taskTitle.slice(0, 80) : '')
const taskTitleResolved = computed(() => taskTitle.value || '校园温度提醒器')
const taskId = computed(() => typeof route.query.taskId === 'string' ? route.query.taskId.slice(0, 24) : 'A-03')
const isTemperatureExample = computed(() => taskId.value === 'A-03' && taskTitleResolved.value === '校园温度提醒器')
const taskBrief = computed(() => isTemperatureExample.value
  ? '温度题示例：读取温度并处理边界与异常输入。实际要求以老师说明为准。'
  : '当前任务的具体要求尚未接入，请先查看老师发布的说明。')
const currentFileName = computed(() => workspaceMode.value === 'blocks' ? '图形化积木' : lang.value === 'python' ? 'main.py' : lang.value === 'cpp' ? 'main.cpp' : 'main.c')
const currentVersion = computed(() => currentProject.value?.latest_version ?? 1)
const output = ref('')
const running = ref(false)
const hasError = ref(false)
const lastMock = ref(false)
const turtleCmds = ref<any[]>([])
const activeStage = ref<StageId>(4)
const mobilePanel = ref<MobilePanel>('editor')
const outputTab = ref<OutputTab>('run')
const outputTabs: { id: OutputTab; label: string }[] = [
  { id: 'run', label: '运行输出' },
  { id: 'tests', label: '检查记录' },
  { id: 'preview', label: '预览舞台' },
  { id: 'evidence', label: '证据' },
]
const lastRunOk = ref<boolean | null>(null)
const runOrigin = ref('')
const runVersion = ref('')
let executionRevision = 0
const testsRunning = ref(false)
const testsRun = ref(false)
const reflection = ref('')
const transferNote = ref('')
const companionDecision = ref('尚未作出建议决策')
const companionEvidence = ref<CompanionEvidence | null>(null)
const decisionEvidenceOpen = ref(false)
const testCases = ref<TestCaseState[]>([
  { id: 'basic', label: '本次运行', status: 'idle', message: '还没有当前草稿的运行结果。' },
  { id: 'boundary', label: '条件分支线索', status: 'idle', message: '仅搜索文本，不验证逻辑。' },
  { id: 'invalid', label: '输入处理线索', status: 'idle', message: '仅搜索文本，不验证输入处理。' },
  { id: 'analysis', label: '分析填写', status: 'idle', message: '查看三个字段是否填写，不判断正确性。' },
])
const reflectionComplete = computed(() => Array.from(`${reflection.value}${transferNote.value}`.trim()).length >= 20)
const executionDraftFingerprint = computed(() => JSON.stringify({
  projectId: currentId.value,
  taskId: taskId.value,
  taskTitle: taskTitleResolved.value,
  mode: workspaceMode.value,
  language: lang.value,
  code: code[lang.value],
  blocks: workspaceMode.value === 'blocks' ? blockState.value : null,
  design: designText.value,
  analysis: [analysis.input, analysis.output, analysis.constraints],
}))
const companionEvidenceDecisionLabel = computed(() => {
  const evidence = companionEvidence.value
  if (!evidence) return '尚未形成原件'
  const decision = evidence.decision === 'adopted' ? '采纳，等待运行验证' : `不采用：${evidence.reason || '继续自己的方案'}`
  return evidence.stale ? `${decision}（草稿已变化，需重新确认）` : decision
})
const activeStageLabel = computed(() => stageItems.value.find(item => item.id === activeStage.value)?.label || '编码运行')
const stageItems = computed(() => [
  { id: 1 as StageId, key: 'task', label: '任务', detail: '明确目标与检查点', done: false, state: '待确认' },
  { id: 2 as StageId, key: 'analysis', label: '分析', detail: '输入 / 输出 / 约束', done: analysisComplete.value, state: analysisComplete.value ? '已填写' : '待补全' },
  { id: 3 as StageId, key: 'model', label: '建模', detail: '伪代码与步骤', done: Boolean(designText.value.trim()), state: designText.value.trim() ? '已填写' : '待开始' },
  { id: 4 as StageId, key: 'code', label: '编码运行', detail: '实现并运行草稿', done: analysisComplete.value && lastRunOk.value === true, state: running.value ? '运行中' : lastRunOk.value === false ? '报错/超时' : lastRunOk.value === true ? '已运行' : lastMock.value ? '仅演示' : '待运行' },
  { id: 5 as StageId, key: 'test', label: '测试优化', detail: '查看检查记录', done: false, state: '待验证' },
  { id: 6 as StageId, key: 'reflect', label: '反思迁移', detail: '解释方法与迁移', done: reflectionComplete.value, state: reflectionComplete.value ? '已填写' : '待填写' },
])
const evidenceItems = computed<EvidenceItem[]>(() => [
  { id: 'analysis', title: analysisComplete.value ? '分析已填写' : '分析待补全', detail: '本机草稿 · 点击回看三个字段', icon: 'file-text' as IconName, ready: analysisComplete.value, stage: 2 as StageId },
  { id: 'model', title: '建模草稿', detail: '点击回看内容与保存回执', icon: 'ruler' as IconName, ready: Boolean(designText.value.trim()), stage: 3 as StageId },
  { id: 'version', title: '当前草稿运行', detail: runOrigin.value ? `${lastRunOk.value === false ? '报错/超时 · ' : lastRunOk.value === true ? '本次未报错 · ' : ''}${runOrigin.value} · ${runVersion.value}` : '尚无当前草稿的执行结果', icon: 'file-text' as IconName, ready: false, stage: 4 as StageId, tab: 'run' as OutputTab },
  { id: 'tests', title: '用例尚未验证', detail: testsRun.value ? '本页检查记录 · 不是用例结果' : '运行并检查，查看文本线索', icon: 'flask' as IconName, ready: false, stage: 5 as StageId, tab: 'tests' as OutputTab },
  { id: 'decision', title: '伙伴建议决策', detail: `本机记录 · ${companionDecision.value}`, icon: 'help-circle' as IconName, ready: Boolean(companionEvidence.value), stage: 4 as StageId, tab: 'evidence' as OutputTab },
  { id: 'reflection', title: reflectionComplete.value ? '反思已填写' : '反思待填写', detail: '本机草稿 · 尚未发送给老师', icon: 'compass' as IconName, ready: reflectionComplete.value, stage: 6 as StageId },
])
function languageLabel(value: Lang) {
  return value === 'python' ? 'Python' : value === 'cpp' ? 'C++' : 'C'
}
const COMPANION_SUGGESTION_ID = 'input-guard-v1'
const COMPANION_SUGGESTION_TEXT = '先做输入守卫：把“温度是否为有效数字”的判断放在主条件前，再处理阈值分支。'

function selectStage(stage: StageId) {
  activeStage.value = stage
  design.value = stage === 2 || stage === 3
  mobilePanel.value = 'editor'
  if (stage === 5) outputTab.value = 'tests'
  if (stage === 4) outputTab.value = 'run'
}

function openEvidence(stage: StageId, tab?: OutputTab) {
  selectStage(stage)
  if (tab) {
    outputTab.value = tab
    if (outputDrawer.value) outputDrawer.value.open = true
  }
  if (window.matchMedia('(max-width: 760px)').matches && tab) mobilePanel.value = 'result'
}

function openEvidenceItem(item: EvidenceItem) {
  decisionEvidenceOpen.value = item.id === 'decision' && Boolean(companionEvidence.value)
  openEvidence(item.stage, item.tab)
}

function openMobileResult() {
  mobilePanel.value = 'result'
  if (outputDrawer.value) outputDrawer.value.open = true
  if (outputTab.value === 'preview' && lang.value !== 'python') outputTab.value = 'run'
}

function syncMobileViewport(event?: MediaQueryListEvent) {
  mobileViewport.value = event?.matches ?? mobileMedia?.matches ?? false
}

function testStatusLabel(status: TestStatus) {
  return { idle: '待检查', executed: '本次未报错', error: '本次报错', hint: '发现线索', missing: '暂未发现', filled: '已填写', incomplete: '待补充' }[status]
}

function hasBoundaryBranch(source: string) {
  return /(?:>=|<=|==|>|<|if\s*\(|if\s+|else|switch)/.test(source)
}

function hasInputGuard(source: string) {
  return /(?:try\s*:|except\s+ValueError|isdigit|isnumeric|cin\.fail|scanf\s*\([^)]*\)\s*[!=]=?\s*1|输入校验|异常输入)/i.test(source)
}

async function runProgram() {
  activeStage.value = 4
  design.value = false
  outputTab.value = 'run'
  if (outputDrawer.value) outputDrawer.value.open = true
  await run()
  if (window.matchMedia('(max-width: 760px)').matches) mobilePanel.value = 'result'
}

async function runTests() {
  if (testsRunning.value || running.value) return
  const revision = executionRevision
  testsRunning.value = true
  try {
    activeStage.value = 5
    if (outputDrawer.value) outputDrawer.value.open = true
    testsRun.value = false
    testCases.value = testCases.value.map(item => ({ ...item, status: 'idle', message: '正在执行当前草稿。' }))
    const executed = await run()
    if (revision !== executionRevision) return
    if (!executed) { outputTab.value = 'run'; return }
    const source = code[lang.value]
    testCases.value = [
      { id: 'basic', label: '本次运行', status: hasError.value ? 'error' : 'executed', message: `${runOrigin.value} · ${runVersion.value}。未比对预期输出。` },
      { id: 'boundary', label: '条件分支线索', status: hasBoundaryBranch(source) ? 'hint' : 'missing', message: '仅搜索文本，注释也可能命中；其他写法可能漏检。请用实际输入验证。' },
      { id: 'invalid', label: '输入处理线索', status: hasInputGuard(source) ? 'hint' : 'missing', message: '仅搜索文本，注释也可能命中；不能证明异常输入已被正确处理。' },
      { id: 'analysis', label: '分析填写', status: analysisComplete.value ? 'filled' : 'incomplete', message: '只检查输入、输出、约束是否填写，不判断内容是否正确。' },
    ]
    testsRun.value = true
    outputTab.value = 'tests'
    emitWorkbenchContext()
    if (window.matchMedia('(max-width: 760px)').matches) mobilePanel.value = 'result'
  } finally {
    testsRunning.value = false
  }
}

function reflectionKey(pid: number) {
  return scopedDraftKey(`cx_project_reflection_${pid}`)
}

function loadReflection(pid: number) {
  try {
    const saved = JSON.parse(localStorage.getItem(reflectionKey(pid)) || 'null')
    reflection.value = typeof saved?.reflection === 'string' ? saved.reflection : ''
    transferNote.value = typeof saved?.transfer === 'string' ? saved.transfer : ''
  } catch {
    reflection.value = ''
    transferNote.value = ''
  }
}

function saveReflectionDraft() {
  if (!currentId.value) return
  try { localStorage.setItem(reflectionKey(currentId.value), JSON.stringify({ reflection: reflection.value, transfer: transferNote.value })) } catch {}
}

function companionEvidenceKey(pid: number) {
  return scopedDraftKey(`cx_project_companion_evidence_${pid}_${encodeURIComponent(taskId.value)}`)
}

function syncCompanionDecisionLabel() {
  const evidence = companionEvidence.value
  if (!evidence) {
    companionDecision.value = '尚未作出建议决策'
    return
  }
  companionDecision.value = companionEvidenceDecisionLabel.value
}

function loadCompanionEvidence(pid: number) {
  decisionEvidenceOpen.value = false
  companionEvidence.value = null
  try {
    const saved = JSON.parse(localStorage.getItem(companionEvidenceKey(pid)) || 'null') as Partial<CompanionEvidence> | null
    if (
      saved
      && saved.projectId === pid
      && saved.taskId === taskId.value
      && saved.suggestionId === COMPANION_SUGGESTION_ID
      && typeof saved.suggestion === 'string'
      && typeof saved.thought === 'string'
      && (saved.decision === 'adopted' || saved.decision === 'rejected')
    ) {
      companionEvidence.value = {
        suggestionId: saved.suggestionId,
        suggestion: saved.suggestion,
        thought: saved.thought,
        taskId: saved.taskId,
        projectId: saved.projectId,
        decision: saved.decision,
        reason: typeof saved.reason === 'string' ? saved.reason : undefined,
        createdAt: typeof saved.createdAt === 'string' ? saved.createdAt : new Date().toISOString(),
        stale: saved.stale === true,
      }
    }
  } catch {}
  syncCompanionDecisionLabel()
}

function saveCompanionEvidence() {
  if (!currentId.value || !companionEvidence.value) return
  try { localStorage.setItem(companionEvidenceKey(currentId.value), JSON.stringify(companionEvidence.value)) } catch {}
}

function resetExecutionEvidence(message = '草稿已变化，请重新运行并检查。') {
  lastRunOk.value = null
  lastMock.value = false
  runOrigin.value = ''
  runVersion.value = ''
  testsRun.value = false
  hasError.value = false
  output.value = ''
  turtleCmds.value = []
  testCases.value = testCases.value.map(item => ({ ...item, status: 'idle', message }))
}

function invalidateExecutionEvidence(preserveCompanion = false) {
  resetExecutionEvidence()
  decisionEvidenceOpen.value = false
  if (preserveCompanion || !companionEvidence.value) return
  companionEvidence.value = { ...companionEvidence.value, stale: true }
  saveCompanionEvidence()
  syncCompanionDecisionLabel()
}

function emitWorkbenchContext() {
  window.dispatchEvent(new CustomEvent('cx:workbench-context', {
    detail: {
      taskId: taskId.value,
      taskTitle: taskTitleResolved.value,
      language: languageLabel(lang.value),
      version: currentVersion.value,
      projectId: currentId.value,
      // Compatibility field only: no real case runner is connected here.
      failedTests: 0,
      testVerification: 'unverified',
      stage: activeStage.value,
      pairRole: '驾驶员',
    },
  }))
}

function validCompanionDetail(detail?: CompanionEventDetail): detail is Required<Pick<CompanionEventDetail, 'suggestionId' | 'suggestion' | 'thought' | 'taskId' | 'projectId'>> & CompanionEventDetail {
  return Boolean(
    detail
    && detail.suggestionId === COMPANION_SUGGESTION_ID
    && detail.suggestion === COMPANION_SUGGESTION_TEXT
    && typeof detail.thought === 'string'
    && detail.thought.trim().length >= 20
    && detail.taskId === taskId.value
    && detail.projectId === currentId.value,
  )
}

let acceptedCompanionFingerprint = ''

function onCompanionAdopt(event: Event) {
  const detail = (event as CustomEvent<CompanionEventDetail>).detail
  if (!validCompanionDetail(detail) || !currentId.value) {
    flash('建议上下文已变化，请重新写满 20 字思路')
    return
  }
  const marker = lang.value === 'python'
    ? '# TODO(伙伴局部建议): 先校验输入是否合法，再进入条件判断'
    : '// TODO(伙伴局部建议): 先校验输入是否合法，再进入条件判断'
  if (workspaceMode.value === 'blocks') {
    if (!designText.value.includes('先验证输入是否合法')) designText.value += `${designText.value.trim() ? '\n' : ''}5. 先验证输入是否合法，再进入条件判断`
    flash('局部建议已加入伪代码草稿，积木未被替换')
  } else if (!code[lang.value].includes(marker)) {
    code[lang.value] = `${marker}\n${code[lang.value]}`
    flash('局部建议已加入当前草稿，尚未运行')
  }
  acceptedCompanionFingerprint = executionDraftFingerprint.value
  invalidateExecutionEvidence(true)
  companionEvidence.value = {
    suggestionId: detail.suggestionId,
    suggestion: detail.suggestion,
    thought: detail.thought.trim(),
    taskId: detail.taskId,
    projectId: detail.projectId,
    decision: 'adopted',
    createdAt: new Date().toISOString(),
    stale: false,
  }
  saveCompanionEvidence()
  syncCompanionDecisionLabel()
}

function onCompanionDecision(event: Event) {
  const detail = (event as CustomEvent<CompanionEventDetail>).detail
  if (!validCompanionDetail(detail) || !currentId.value || detail.type !== 'rejected') return
  companionEvidence.value = {
    suggestionId: detail.suggestionId,
    suggestion: detail.suggestion,
    thought: detail.thought.trim(),
    taskId: detail.taskId,
    projectId: detail.projectId,
    decision: 'rejected',
    reason: detail.reason?.trim() || '继续自己的方案',
    createdAt: new Date().toISOString(),
    stale: false,
  }
  saveCompanionEvidence()
  syncCompanionDecisionLabel()
}

// —— 作品云端/本地存储（§4.3）——
let openRequest = 0
const editorOwner = auth.user?.id || 'signed-out'
const savedCloudFingerprint = ref<string | null>(null)
const cloudAutoSaving = ref(false)
const cloudLogoutPending = ref(false)
let cloudLogoutConfirmed = false
function scopedDraftKey(key: string) {
  return isCloudDeployment ? `cloud:${editorOwner}:${key}` : key
}
function currentCloudFingerprint() {
  return cloudDraftFingerprint({ id: currentId.value, language: lang.value, code: code[lang.value], blockState: blockState.value })
}
function confirmCloudLeave() {
  if (!isCloudDeployment || cloudLogoutConfirmed) return true
  const pending = saving.value || cloudAutoSaving.value || projBusy.value
  if (pending) flash('正在保存或切换作品，请等结果确认后再离开')
  const dirty = savedCloudFingerprint.value !== null && currentCloudFingerprint() !== savedCloudFingerprint.value
  return canLeaveCloudDraft(pending, dirty, () => window.confirm('还有未保存到云端的修改。确定离开吗？建议先取消并保存，或复制草稿留存。'))
}
function beforeCloudLogout(event: Event) {
  if (!confirmCloudLeave()) event.preventDefault()
  else { cloudLogoutConfirmed = true; cloudLogoutPending.value = true }
}
function cloudLogoutFailed() {
  cloudLogoutConfirmed = false
  cloudLogoutPending.value = false
}
function beforeCloudUnload(event: BeforeUnloadEvent) {
  if (!isCloudDeployment) return
  if (saving.value || cloudAutoSaving.value || (savedCloudFingerprint.value !== null && currentCloudFingerprint() !== savedCloudFingerprint.value)) {
    event.preventDefault(); event.returnValue = ''
  }
}
onBeforeRouteLeave(() => confirmCloudLeave())

function setModeState(mode: WorkspaceMode) {
  if (mode === 'blocks') { lang.value = 'python'; pyMode.value = 'block' }
  else if (mode === 'python') { lang.value = 'python'; pyMode.value = 'code' }
  else lang.value = mode
}

function syncWorkspaceRoute(mode: WorkspaceMode, projectId: number) {
  const query = { ...route.query, project: String(projectId), mode } as Record<string, any>
  delete query.lang
  delete query.ai
  router.replace({ query })
}

async function loadProjects(selectId?: number, preferredMode?: WorkspaceMode, leaveConfirmed = false): Promise<boolean> {
  const beforeList = currentCloudFingerprint()
  projects.value = await projectsApi.list()
  if (isCloudDeployment && beforeList !== currentCloudFingerprint()) {
    if (savedCloudFingerprint.value === null) savedCloudFingerprint.value = 'unconfirmed-local-draft'
    flash('载入期间草稿有新修改，已保留；请先复制留存再打开作品')
    return false
  }
  const sameLanguage = projects.value.find((project) => project.language === lang.value)
  // “开始创作某语言”没有同语言作品时必须留空，让调用方创建目标语言；不能回退到第一项作品。
  const target = selectId ?? sameLanguage?.id ?? null
  if (target) {
    await openProject(target, preferredMode, leaveConfirmed)
    return false
  }
  currentId.value = null
  return true
}

async function openProject(id: number, preferredMode?: WorkspaceMode, leaveConfirmed = false) {
  // Clicking the open item must not silently rebase its unsaved cloud draft.
  if (isCloudDeployment && currentId.value === id) { ++openRequest; return }
  if (isCloudDeployment && !leaveConfirmed && currentId.value && currentId.value !== id && !confirmCloudLeave()) return
  const request = ++openRequest
  const previousFingerprint = executionDraftFingerprint.value
  let p: Project
  try {
    p = await projectsApi.get(id)
  } catch {
    if (request === openRequest) flash('作品打开失败，请稍后再试')
    return
  }
  if (request !== openRequest) return // 快速连点作品时，旧请求不能覆盖最后一次选择
  if (isCloudDeployment && previousFingerprint !== executionDraftFingerprint.value) {
    if (savedCloudFingerprint.value === null) savedCloudFingerprint.value = 'unconfirmed-local-draft'
    flash('打开期间草稿又有修改，已保留当前内容；请保存后再打开作品')
    return
  }

  if (currentId.value && currentId.value !== p.id) saveAnalysisDraft(currentId.value)
  syncingProject = true
  const listIndex = projects.value.findIndex((project) => project.id === p.id)
  if (listIndex >= 0) projects.value[listIndex] = { ...projects.value[listIndex], ...p }
  currentId.value = p.id
  lang.value = p.language
  if (p.language === 'python') {
    const wantsPythonMode = preferredMode === 'blocks' || preferredMode === 'python'
    const mode = wantsPythonMode ? preferredMode : (p.latest?.block_state ? 'blocks' : 'python')
    pyMode.value = mode === 'blocks' ? 'block' : 'code'
  }
  blockState.value = p.language === 'python' ? (p.latest?.block_state ?? null) : null
  blockRevision.value += 1
  code[p.language] = p.latest?.code ?? STARTERS[p.language]
  if (isCloudDeployment) savedCloudFingerprint.value = currentCloudFingerprint()
  pythonTextDirty.value = false
  loadAnalysis(p.id)
  loadDesign(p.id)      // 换作品同步换设计稿（读不到不拦打开）
  loadReflection(p.id)
  if (previousFingerprint !== executionDraftFingerprint.value) {
    resetExecutionEvidence()
    loadCompanionEvidence(p.id)
  }
  syncWorkspaceRoute(workspaceMode.value, p.id)
  await nextTick()
  syncingProject = false
}

async function createProjectFor(targetLang: Lang, targetMode: WorkspaceMode) {
  if (isCloudDeployment) {
    const previous = executionDraftFingerprint.value
    const initialCode = targetMode === 'blocks' ? '' : STARTERS[targetLang]
    const p = await projectsApi.create(`${languageLabel(targetLang)} 作品 ${projects.value.length + 1}`, targetLang)
    await projectsApi.saveVersion(p.id, initialCode, null)
    projects.value = await projectsApi.list()
    if (previous !== executionDraftFingerprint.value) {
      flash('新作品已创建；当前草稿有新修改，请保存后再切换')
      return
    }
    await openProject(p.id, targetMode, true)
    return
  }
  setModeState(targetMode)
  blockState.value = null
  blockRevision.value += 1
  // 空积木区必须对应空代码，避免学生看见空画布却运行了隐藏 starter。
  code[targetLang] = targetMode === 'blocks' ? '' : STARTERS[targetLang]
  const p = await projectsApi.create(`${languageLabel(targetLang)} 作品 ${projects.value.length + 1}`, targetLang)
  await projectsApi.saveVersion(p.id, code[targetLang], null)
  await loadProjects(p.id, targetMode, true)
}

/** 新建、语言切换、导入共用 busy 守卫，避免双击造出多个空作品。 */
async function newProject() {
  if (projBusy.value) return
  if (!confirmCloudLeave()) return
  projBusy.value = true
  try {
    await createProjectFor(lang.value, workspaceMode.value)
    flash('已新建同语言作品')
  } catch {
    flash('新建失败')
  } finally {
    projBusy.value = false
  }
}

function onSwitch(v: string) {
  if (v) openProject(Number(v))
}

async function switchWorkspaceMode(mode: WorkspaceMode) {
  if (mode === workspaceMode.value || projBusy.value) return
  if (!confirmCloudLeave()) return

  // 手写 Python 不能无损还原为积木。只有学生明确确认后才让积木重新成为代码来源。
  const textCannotRoundTrip = lang.value === 'python'
    && pyMode.value === 'code'
    && (pythonTextDirty.value || (!blockState.value && Boolean(code.python.trim())))
  if (mode === 'blocks' && textCannotRoundTrip) {
    const confirmed = window.confirm('图形化积木无法自动还原你刚写的 Python 文本。继续会用积木生成结果替换当前代码；取消可保留文本继续编辑。')
    if (!confirmed) return
    // 没有可恢复积木时，从真正的空画布开始；已有积木状态则由 BlockEditor 重新生成对应代码。
    if (!blockState.value) code.python = ''
  }

  const targetLang: Lang = mode === 'blocks' || mode === 'python' ? 'python' : mode
  if (targetLang === lang.value) {
    setModeState(mode)
    if (mode === 'blocks') blockRevision.value += 1
    if (currentId.value) syncWorkspaceRoute(mode, currentId.value)
    return
  }

  projBusy.value = true
  try {
    const candidate = projects.value.find((project) => project.language === targetLang)
    if (candidate) await openProject(candidate.id, mode, true)
    else await createProjectFor(targetLang, mode)
    flash(`已切换到 ${languageLabel(targetLang)} 作品`)
  } catch {
    flash('语言切换失败，当前作品没有变化')
  } finally {
    projBusy.value = false
  }
}

function persistenceBlockState(action: '保存' | '运行'): { cancelled: boolean; value: string | null } {
  if (lang.value !== 'python') return { cancelled: false, value: null }
  if (pyMode.value === 'block' || !pythonTextDirty.value) {
    // 未改动积木生成的 Python 文本时继续携带原 JSON，切换视图不能变成一次数据删除。
    return { cancelled: false, value: blockState.value }
  }
  if (!blockState.value) return { cancelled: false, value: null }

  const confirmed = window.confirm(`你修改了由积木生成的 Python 文本。继续${action}会保留文本，并让这个新版本不再关联旧积木；取消不会改动云端作品。`)
  if (!confirmed) {
    flash(`已取消${action}，云端积木仍保留`)
    return { cancelled: true, value: blockState.value }
  }
  blockState.value = null
  return { cancelled: false, value: null }
}

async function save() {
  if (!currentId.value) return
  if (isCloudDeployment && saving.value) return
  const project = projects.value.find((item) => item.id === currentId.value)
  if (!project || project.language !== lang.value) {
    flash('当前语言与作品不匹配，已停止保存以保护原作品')
    return
  }
  const persistedBlocks = persistenceBlockState('保存')
  if (persistedBlocks.cancelled) return
  const submittedId = currentId.value
  const submittedLanguage = lang.value
  const submittedCode = code[submittedLanguage]
  const submittedFingerprint = currentCloudFingerprint()
  saving.value = true
  try {
    const r = await projectsApi.saveVersion(submittedId, submittedCode, persistedBlocks.value)
    ctApi.track('save', `保存 v${r.versionNo}`, currentId.value, trackOpt())
    if (isCloudDeployment) {
      savedCloudFingerprint.value = submittedFingerprint
      const index = projects.value.findIndex(item => item.id === submittedId)
      if (index >= 0) projects.value[index] = { ...projects.value[index], latest_version: r.versionNo,
        latest: { code: submittedCode, block_state: persistedBlocks.value, version_no: r.versionNo } }
    } else await loadProjects(currentId.value, workspaceMode.value)
    flash(isCloudDeployment && currentCloudFingerprint() !== submittedFingerprint
      ? `已保存先前草稿 v${r.versionNo}；刚输入的新修改仍待保存`
      : r.changed ? `已保存到云端 v${r.versionNo}` : `没有新改动（云端已是 v${r.versionNo}）`)
  } catch (error) {
    flash(isCloudDeployment && error instanceof Error ? error.message : '保存失败（已留本地缓存）')
  } finally {
    saving.value = false
  }
}
async function download() {
  if (projBusy.value || !currentId.value) return
  projBusy.value = true
  try {
    const p = projects.value.find((x) => x.id === currentId.value)
    await projectsApi.download(currentId.value, p?.title || 'work')
  } catch (error) {
    flash(error instanceof Error ? error.message : '下载失败')
  } finally {
    projBusy.value = false
  }
}
async function onUpload(e: Event) {
  if (projBusy.value) return
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  projBusy.value = true
  try {
    const p = await projectsApi.upload(f)
    await loadProjects(p.id)
    flash('已导入')
  } catch (error) {
    flash(isCloudDeployment && error instanceof Error ? error.message : '导入失败')
  } finally {
    projBusy.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}
function flash(msg: string) {
  savedTip.value = msg
  setTimeout(() => { if (savedTip.value === msg) savedTip.value = '' }, isCloudDeployment ? 8000 : 2200)
}
watch(
  () => [lang.value, code[lang.value]],
  () => saveLocalDraft({ projectId: currentId.value, language: lang.value, code: code[lang.value] }),
)
watch(
  executionDraftFingerprint,
  () => { executionRevision++; savedTip.value = '' },
  { flush: 'sync' },
)
// A normal edit can repair the previous error. Only a context switch breaks that history.
watch([currentId, taskId, workspaceMode], () => { prevError = false }, { flush: 'sync' })
watch(
  executionDraftFingerprint,
  (next, previous) => {
    if (!previous || syncingProject || loadingAnalysis || loadingDesign) return
    const preserveCompanion = acceptedCompanionFingerprint === next
    acceptedCompanionFingerprint = ''
    invalidateExecutionEvidence(preserveCompanion)
  },
  { flush: 'post' },
)
watch(
  () => code.python,
  () => {
    if (!syncingProject && lang.value === 'python' && pyMode.value === 'code') pythonTextDirty.value = true
  },
)
watch(analysis, () => {
  if (!loadingAnalysis && currentId.value) saveAnalysisDraft(currentId.value)
})
watch([reflection, transferNote], saveReflectionDraft)
watch(taskId, () => {
  if (!currentId.value || syncingProject) return
  resetExecutionEvidence('任务已切换，请为当前任务重新运行并检查。')
  loadCompanionEvidence(currentId.value)
})
watch(
  [taskId, taskTitleResolved, currentId, workspaceMode, currentVersion, activeStage],
  emitWorkbenchContext,
  { flush: 'post' },
)

function requestedMode(): WorkspaceMode | undefined {
  const q = route.query
  if (typeof q.mode === 'string' && MODES.some((mode) => mode.id === q.mode)) return q.mode as WorkspaceMode
  if (q.lang === 'cpp' || q.lang === 'c') return q.lang
  if (q.lang === 'python') return 'python'
  return undefined
}

onMounted(async () => {
  if (isCloudDeployment) {
    window.addEventListener('jiedui:before-cloud-logout', beforeCloudLogout)
    window.addEventListener('jiedui:cloud-logout-failed', cloudLogoutFailed)
    window.addEventListener('beforeunload', beforeCloudUnload)
  }
  mobileMedia = window.matchMedia('(max-width: 760px)')
  syncMobileViewport()
  mobileMedia.addEventListener('change', syncMobileViewport)
  window.addEventListener('keydown', onWorkbenchKeydown)
  window.addEventListener('blur', onWorkbenchBlur)
  window.addEventListener('cx:pair-suggestion-adopt', onCompanionAdopt)
  window.addEventListener('cx:pair-suggestion-decision', onCompanionDecision)
  await nextTick()
  updateWorkbenchWidth()
  if (typeof ResizeObserver !== 'undefined' && workbenchGrid.value) {
    workbenchResizeObserver = new ResizeObserver(updateWorkbenchWidth)
    workbenchResizeObserver.observe(workbenchGrid.value)
  }
  const preferredMode = requestedMode()
  const initialMode = preferredMode ?? 'blocks'
  setModeState(initialMode)
  if (isCloudDeployment) savedCloudFingerprint.value = currentCloudFingerprint()
  const requestedId = typeof route.query.project === 'string' && /^\d+$/.test(route.query.project)
    ? Number(route.query.project)
    : undefined
  try {
    const needsTargetProject = await loadProjects(requestedId, preferredMode)
    if (needsTargetProject) {
      projBusy.value = true
      try { await createProjectFor(lang.value, initialMode) } finally { projBusy.value = false }
    }
  } catch {
    const d = loadLocalDraft()
    if (d && LANGS.some((item) => item.id === d.language)) {
      lang.value = d.language as Lang
      pyMode.value = lang.value === 'python' && initialMode === 'blocks' ? 'block' : 'code'
      code[d.language as Lang] = d.code
      if (isCloudDeployment) savedCloudFingerprint.value = 'unconfirmed-recovered-draft'
    }
  }
  emitWorkbenchContext()
})

onUnmounted(() => {
  window.removeEventListener('jiedui:before-cloud-logout', beforeCloudLogout)
  window.removeEventListener('jiedui:cloud-logout-failed', cloudLogoutFailed)
  window.removeEventListener('beforeunload', beforeCloudUnload)
  executionRevision++ // Pending responses belong to the disposed page, never a new workspace.
  mobileMedia?.removeEventListener('change', syncMobileViewport)
  window.removeEventListener('keydown', onWorkbenchKeydown)
  window.removeEventListener('blur', onWorkbenchBlur)
  window.removeEventListener('cx:pair-suggestion-adopt', onCompanionAdopt)
  window.removeEventListener('cx:pair-suggestion-decision', onCompanionDecision)
  workbenchResizeObserver?.disconnect()
  finishRailResize(false)
})

/**
 * 每次运行都记一条 `run`（= 尝试次数），失败再记 `error`，报错后跑通再补一条 `fix`——
 * 后端的 `success = runs - errors` 才成立。
 * 曾经写成「成功且此前报过错 → 只记 fix、不记 run」：越是完整走过「错→改→对」的学生
 * runs 越低，成功率被算成 0%、算法设计维恒等地板分，信号方向正好反了。
 * `error` 带上真实报错首行，学习面板的错题本才有内容可归集（不带代码，只带报错文本）。
 */
function trackRun(ok: boolean, errText = '') {
  // 离线 mock 的"成功"是正则回显不是真跑通，写进事件流会给研究数据掺假成功记录
  if (lastMock.value) return
  ctApi.track('run', ok ? '运行成功' : '运行出错', currentId.value, trackOpt())
  if (ok) {
    milestone('first_run', '这次未报错，继续核对输出')
    if (prevError) { ctApi.track('fix', '报错后修复成功', currentId.value, trackOpt()); milestone('first_fix', '这次未报错，继续核对输出') }
    prevError = false
  } else {
    ctApi.track('error', errDigest(errText), currentId.value, trackOpt())
    prevError = true
  }
}

/** 取报错最后一行有内容的文本（Python traceback 的结论行），截断到 120 字 */
function errDigest(raw: string): string {
  const line = raw.split('\n').map((s) => s.trim()).filter(Boolean).pop() || ''
  return line ? line.slice(0, 120) : '运行出错'
}

/** 运行即自动保存（UI调研二期：现代编辑器惯例，Replit/VS Code 同款心智）。
 *  服务端按内容去重：代码没变不落新版，也就不打扰学生。
 *  ⚠️ 刻意**不发 save 埋点**：ct_events 里 save 的研究语义是「学生主动保存」，
 *  把系统自动行为混进去，刚接上的 save 数据流就被污染了（系统行为≠学生行为）。
 *  静默失败：自动保存挂了不打断运行 —— 学生是来跑代码的，本地缓存仍在。 */
async function autoSave(isCurrent: () => boolean): Promise<{ allowed: boolean; version: number | null }> {
  if (!currentId.value) return { allowed: true, version: null }
  const projectId = currentId.value
  const project = projects.value.find((item) => item.id === projectId)
  if (!project || project.language !== lang.value) return { allowed: false, version: null }
  const persistedBlocks = persistenceBlockState('运行')
  if (persistedBlocks.cancelled) return { allowed: false, version: null }
  const submittedCode = code[lang.value]
  const submittedFingerprint = currentCloudFingerprint()
  if (isCloudDeployment) cloudAutoSaving.value = true
  try {
    const r = await projectsApi.saveVersion(projectId, submittedCode, persistedBlocks.value)
    if (isCloudDeployment) savedCloudFingerprint.value = submittedFingerprint
    const index = projects.value.findIndex(item => item.id === projectId)
    if (index >= 0 && isCurrent()) {
      projects.value[index] = {
        ...projects.value[index],
        latest_version: r.versionNo,
        latest: { code: submittedCode, block_state: persistedBlocks.value, version_no: r.versionNo },
      }
    }
    if (isCurrent()) savedTip.value = `代码已保存到云端 v${r.versionNo}`
    return { allowed: true, version: r.versionNo }
  } catch {
    if (isCurrent()) savedTip.value = '云端保存未确认 · 本次运行当前草稿'
    return { allowed: true, version: null }
  } finally {
    cloudAutoSaving.value = false
  }
}

async function run(): Promise<boolean> {
  if (running.value) return false
  const revision = executionRevision
  const fingerprint = executionDraftFingerprint.value
  const submittedLanguage = lang.value
  const submittedCode = code[submittedLanguage]
  const isCurrent = () => revision === executionRevision && fingerprint === executionDraftFingerprint.value
  running.value = true
  resetExecutionEvidence('本次正在运行，旧检查已清除。')
  try {
    // Save the captured draft first, but never attach a late response to another draft.
    const saved = await autoSave(isCurrent)
    if (!isCurrent() || !saved.allowed) return false
    runVersion.value = saved.version === null ? '当前草稿 · 云端版本未确认' : `本次代码对应云端 v${saved.version}`
    if (submittedLanguage === 'python') {
      output.value = pyodideReady() ? '正在运行…' : '首次加载 Python 运行环境…'
      try {
        const r = await runPythonTurtle(submittedCode)
        if (!isCurrent()) return false
        runOrigin.value = '浏览器 Python 执行'
        turtleCmds.value = r.turtle
        const body = r.error ? `${r.stdout || ''}\n${r.error}` : r.stdout || (r.turtle.length ? '已在绘图区作画' : '(无输出)')
        output.value = `${runOrigin.value} · ${runVersion.value}\n${r.error ? '本次报错' : '本次执行结束，未报错'} · 不等于用例通过\n\n${body}`
        hasError.value = !!r.error
        lastRunOk.value = !r.error
        trackRun(!r.error, r.error || '')
        return true
      } catch {
        if (!isCurrent()) return false
        // Failed browser environment: fallback executes code only, not turtle graphics.
      }
    }
    output.value = '正在请求服务端执行…'
    const r = await runCode(submittedLanguage, submittedCode, auth.token)
    if (!isCurrent()) return false
    const body = ((r.stdout || '') + (r.stderr ? '\n' + r.stderr : '')).trim() || '(无输出)'
    runOrigin.value = r.mock ? '离线演示（非真实执行）' : '服务端执行'
    output.value = r.mock
      ? `离线演示 · 不形成运行或测试证据\n${runVersion.value}\n\n${body}`
      : `${runOrigin.value} · ${runVersion.value}\n${r.status === 'success' ? '本次执行结束，未报错' : r.status === 'timeout' ? '本次执行超时' : '本次报错'} · 不等于用例通过\n${submittedLanguage === 'python' ? '浏览器绘图环境不可用，本次未绘图。\n' : ''}\n${body}`
    hasError.value = !r.mock && r.status !== 'success'
    lastRunOk.value = r.mock ? null : r.status === 'success'
    lastMock.value = r.mock
    trackRun(r.status === 'success', r.stderr || '')
    return !r.mock
  } catch {
    if (isCurrent()) output.value = '本次执行未完成，请重试；没有生成运行或用例结论。'
    return false
  } finally {
    running.value = false
    if (!isCurrent()) {
      resetExecutionEvidence('草稿已变化，旧运行结果已舍弃，请重新运行。')
      output.value = '草稿已变化，旧运行结果已舍弃，请重新运行。'
    }
    if (isCurrent()) emitWorkbenchContext()
  }
}
</script>

<style scoped>
.ide { height: 100%; display: grid; grid-template-rows: 40px 48px 1fr 200px; background: #1a1a2e; position: relative; }
/* 深色 chrome 上的白透明一律走 --white-a* 档（R6 裁决5）；#16213e 底色挂账暗色轮，不动 */
.projbar { display: flex; align-items: center; gap: var(--sp-2); padding: 0 var(--sp-4); background: #16213e; border-bottom: 1px solid var(--white-a06); }
/* 图标改 BaseIcon 后靠 currentColor 上色：深色作品条上给浅灰 */
.proj-ico { display: flex; align-items: center; color: #cfd6e6; }
.proj-sel { background: var(--white-a08); color: #e6eaf5; border: 1px solid var(--white-a12); border-radius: var(--r-sm); padding: 4px 8px; font-size: var(--fs-sm); max-width: 200px; }
.projbar .spacer { flex: 1; }
.saved { font-size: var(--fs-xs); color: var(--color-success); }
.more { position: relative; }
.more__btn { display: inline-grid; place-items: center; width: 28px; height: 26px; border-radius: var(--r-sm);
  color: #cfd6e6; cursor: pointer; font-size: 16px; line-height: 1; }
.more__btn:hover { background: var(--white-a08); } /* .1 并入 a08 档 */
.more__menu { position: absolute; right: 0; top: 30px; z-index: var(--z-panel); min-width: 148px; padding: 5px; }
/* label 与 button 共用一套菜单项样式（下载项已从 <a href="#"> 转正为 button） */
.more__item { display: flex; align-items: center; gap: 6px; width: 100%; padding: 8px 10px;
  border: none; background: none; font-family: inherit; text-align: left;
  border-radius: var(--r-sm); font-size: var(--fs-sm); color: var(--color-text); cursor: pointer; }
.more__item:hover:not(:disabled) { background: var(--ink-a06); }
.more__item:disabled { opacity: .45; cursor: not-allowed; }
.projbar :deep(.btn--ghost), .projbar :deep(.btn--secondary) { color: #cfd6e6; }
.projbar :deep(.btn--secondary) { color: var(--color-primary-strong); }
.toolbar { display: flex; align-items: center; gap: var(--sp-3); padding: 0 var(--sp-4); background: linear-gradient(90deg, var(--color-primary), var(--blue-700)); }
.lang-sel { background: var(--white-a18); color: #fff; border: none; border-radius: var(--r-pill);
  padding: 5px 12px; font-size: var(--fs-sm); font-weight: var(--fw-medium); cursor: pointer; }
.lang-sel option { color: var(--color-text); background: var(--color-surface); }
.pymode { display: flex; background: var(--white-a12); border-radius: var(--r-pill); padding: 2px; } /* .14 并入 a12 档 */
.pm { border: none; background: transparent; color: #fff; padding: 5px 12px; border-radius: var(--r-pill); cursor: pointer; font-size: var(--fs-xs);
  display: inline-flex; align-items: center; gap: 4px; }
.pm.on { background: var(--color-accent); color: #fff; }
.spacer { flex: 1; }
.hint { color: var(--white-a85); font-size: var(--fs-xs); }
.editor { min-height: 0; }
.bottom { display: flex; min-height: 0; border-top: 2px solid var(--white-a08); }
.bottom :deep(.turtle) { width: 360px; flex-shrink: 0; }
.console { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.console__head { display: flex; align-items: center; gap: var(--sp-3); padding: 4px var(--sp-4); background: #16213e; color: #a0a8c0; font-size: var(--fs-sm); }
.badge { font-size: var(--fs-xs); background: var(--color-warning-soft); color: var(--color-accent-ontext); padding: 1px 8px; border-radius: var(--r-pill); }
.console__head .spacer, .console__head :deep(.btn) { margin-left: auto; }
.console__body { flex: 1; margin: 0; overflow: auto; padding: var(--sp-3) var(--sp-4); background: #0d1117; color: #a8dba8; font-family: var(--font-code); font-size: var(--fs-sm); white-space: pre-wrap; }
.console__body.err { color: #ff6b6b; }
.ai-fab { position: absolute; right: 20px; bottom: 220px; width: 56px; height: 56px; border-radius: var(--r-pill); border: 2px solid rgba(255,255,255,.7); cursor: pointer; padding: 0; overflow: hidden; display: grid; place-items: center; background: linear-gradient(135deg, #7C6BF0, #6C9CE9); box-shadow: var(--shadow-md); transition: transform var(--dur-fast) var(--ease); }
.ai-fab:hover { transform: translateY(-2px) scale(1.04); }
.ai-fab__img { width: 46px; height: 46px; }

/* 移动/窄屏（§4.11 + V6 触控实测修复）：工具条换行、绘图区下移、AI 浮标贴边。
   实测原控件 .lang 41×30 / .more__btn 28×26 / BaseButton 32px 高，均低于 44px 触控标准 → 统一抬到 44。 */
@media (max-width: 760px) {
  .ide { grid-template-rows: auto auto minmax(150px, 1fr) minmax(140px, 38vh); }
  .projbar, .toolbar { flex-wrap: wrap; height: auto; padding: 6px var(--sp-3); gap: 6px; }
  .proj-sel { max-width: 130px; min-height: 44px; }
  .hint { display: none; }
  .bottom { flex-direction: column; }
  .bottom :deep(.turtle) { width: 100%; height: 150px; }
  .ai-fab { bottom: 16px; right: 16px; width: 52px; height: 52px; }
  .ai-fab__img { width: 42px; height: 42px; }
  /* 触控区 ≥44px（含手写按钮与 Base 组件） */
  .lang-sel, .pm { min-height: 44px; min-width: 44px; padding: 6px 14px; }
  .more__btn { min-width: 44px; min-height: 44px; }
  .projbar :deep(.btn), .toolbar :deep(.btn), .console__head :deep(.btn) { min-height: 44px; }
}
/* UI调研'26-08 落地（同 Studio ＋菜单）：origin 锚在右上角的 ⋯ 触发器。
   <details> 内 @starting-style 仅 Chromium 触发；其余引擎无动画直接显示（与现状一致，零回归）。 */
.more__menu { transform-origin: top right;
  transition: opacity var(--d-fast) var(--e-out), transform var(--d-fast) var(--e-out); }
@starting-style { .more__menu { opacity: 0; transform: translateY(-4px) scale(.97); } }
/* 设计抽屉（D3）：工具条下方展开的浅色卡片；@starting-style 入场与其余浮层同工艺 */
/* 真浮层（lint 口径⑤的契约：瞬时浮层必须脱离文档流）：锚在工具条下方、盖在编辑器上沿。
   学生「先想后写」——写完计划点保存/再点「设计」收起，即回到代码。 */
.design { position: absolute; top: 96px; left: var(--sp-3); right: var(--sp-3); z-index: var(--z-panel);
  padding: var(--sp-3); display: flex; flex-direction: column; gap: 8px;
  box-shadow: var(--shadow-lg); transform-origin: top left;
  transition: opacity var(--d-fast) var(--e-out), transform var(--d-fast) var(--e-out); }
@starting-style { .design { opacity: 0; transform: translateY(-4px) scale(.98); } }
.design__hint { font-size: var(--fs-sm); color: var(--color-text-2); margin: 0; }
.design__ta { width: 100%; resize: vertical; border: 1px solid var(--color-border); border-radius: var(--r-sm);
  padding: 8px 10px; font: inherit; font-size: var(--fs-sm); line-height: 1.7; color: var(--color-text);
  background: var(--color-surface); outline: none; }
.design__ta:focus-visible { border-color: var(--color-primary); }
.design__foot { display: flex; align-items: center; gap: var(--sp-2); }
.design__tip { flex: 1; font-size: var(--fs-xs); color: var(--color-text-3); }
.design-btn { display: inline-flex; align-items: center; gap: 4px; }

/* 统一工坊：作品、编辑器、预览各守一栏；保留原有运行与保存逻辑，只重组信息架构。 */
.ide { height: 100%; min-height: 0; display: grid; grid-template-rows: 56px 50px minmax(0, 1fr); overflow: hidden; background: #eef3f9; color: var(--color-text); }
.workspace-topbar { min-width: 0; padding: 0 14px; display: flex; align-items: center; gap: 9px; background: var(--color-surface); border-bottom: 1px solid var(--color-border); }
.back-btn { min-height: 38px; padding: 0 10px; border: 1px solid var(--color-border); border-radius: var(--r-md); background: var(--color-surface); color: var(--color-text-2); display: inline-flex; align-items: center; gap: 7px; font: inherit; font-size: var(--fs-xs); cursor: pointer; }
.back-btn:hover { color: var(--color-primary-strong); border-color: var(--color-primary); }
.top-divider { width: 1px; height: 26px; background: var(--color-border); }
.workspace-topbar .proj-ico { color: var(--color-primary); }
.workspace-topbar .proj-sel { max-width: 230px; min-height: 36px; padding: 0 8px; border: 0; border-radius: var(--r-sm); background: var(--color-fill-1); color: var(--color-text); font-weight: var(--fw-medium); }
.language-chip { padding: 4px 8px; border-radius: var(--r-pill); background: var(--color-primary-soft); color: var(--color-primary-strong); font-size: 10px; font-weight: var(--fw-bold); }
.workspace-topbar .saved { min-width: 98px; color: var(--color-success); }
.workspace-topbar :deep(.btn--ghost) { color: var(--color-text-2); }
.workspace-topbar .more__btn { color: var(--color-text-2); }
.workspace-topbar .more__btn:hover { background: var(--color-fill-1); }
.workspace-topbar .more__menu { top: 38px; }

.mode-strip { min-width: 0; padding: 0 14px; display: flex; align-items: center; gap: 12px; background: var(--color-surface); border-bottom: 1px solid var(--color-border); }
.mode-tabs { height: 38px; padding: 3px; display: flex; align-items: stretch; border-radius: var(--r-md); background: var(--color-fill-1); }
.mode-tab, .design-btn { min-width: 88px; padding: 0 12px; border: 0; border-radius: 9px; background: transparent; color: var(--color-text-2); display: inline-flex; align-items: center; justify-content: center; gap: 6px; font: inherit; font-size: var(--fs-xs); font-weight: var(--fw-medium); cursor: pointer; }
.mode-tab:hover:not(:disabled), .design-btn:hover { color: var(--color-primary-strong); }
.mode-tab.active { background: var(--color-surface); color: var(--color-primary-strong); box-shadow: 0 2px 8px rgba(22, 47, 90, .1); }
.mode-tab:disabled { opacity: .5; cursor: wait; }
.design-btn { min-height: 38px; border: 1px solid var(--color-border); }
.design-btn.active { color: var(--color-primary-strong); border-color: var(--color-primary); background: var(--color-primary-soft); }
.mode-note { margin-left: auto; color: var(--color-text-3); font-size: 10px; white-space: nowrap; }

.ide-workspace { min-width: 0; min-height: 0; display: grid; grid-template-columns: 220px minmax(360px, 1fr) minmax(280px, 330px); border: 12px solid #eef3f9; border-top-width: 10px; gap: 10px; }
.project-panel, .editor-panel, .result-panel { min-width: 0; min-height: 0; border: 1px solid var(--color-border); border-radius: var(--r-lg); background: var(--color-surface); overflow: hidden; }
.project-panel { display: flex; flex-direction: column; }
.panel-title { min-height: 54px; padding: 0 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--color-border); }
.panel-title > div { min-width: 0; display: grid; gap: 2px; }
.panel-title span, .panel-title b { font-size: var(--fs-sm); font-weight: var(--fw-bold); }
.panel-title small { color: var(--color-text-3); font-size: 10px; }
.panel-title button { width: 32px; height: 32px; border: 1px solid var(--color-border); border-radius: var(--r-sm); background: var(--color-surface); color: var(--color-primary); display: grid; place-items: center; cursor: pointer; }
.panel-title.simple { min-height: 42px; }
.project-list { max-height: 42%; padding: 8px; overflow: auto; display: grid; align-content: start; gap: 5px; }
.project-item { width: 100%; min-height: 54px; padding: 7px 8px; border: 1px solid transparent; border-radius: var(--r-md); background: transparent; display: flex; align-items: center; gap: 8px; color: var(--color-text); font: inherit; text-align: left; cursor: pointer; }
.project-item:hover { background: var(--color-fill-1); }
.project-item.active { border-color: var(--color-primary); background: var(--color-primary-soft); }
.project-item > span:last-child { min-width: 0; display: grid; gap: 2px; }
.project-item b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-xs); }
.project-item small { color: var(--color-text-3); font-size: 10px; }
.project-lang { flex: 0 0 36px; width: 36px; height: 36px; border-radius: 10px; background: #e8f0ff; color: #2f62d9; display: grid; place-items: center; font-size: 9px; font-weight: var(--fw-bold); }
.project-lang.cpp { background: #eeeaff; color: #6651cf; }
.project-lang.c { background: #e6f8f3; color: #188267; }
.panel-empty { padding: 14px; color: var(--color-text-3); font-size: var(--fs-xs); text-align: center; }
.stage-panel { min-height: 0; flex: 1; border-top: 1px solid var(--color-border); overflow: auto; }
.stage-panel ol { list-style: none; margin: 0; padding: 8px 12px 14px; display: grid; gap: 3px; }
.stage-panel li { min-height: 43px; position: relative; display: flex; align-items: center; gap: 9px; color: var(--color-text-2); }
.stage-panel li:not(:last-child)::after { content: ''; position: absolute; left: 13px; top: 34px; width: 1px; height: 18px; background: var(--color-border); }
.stage-panel li > span { flex: 0 0 27px; width: 27px; height: 27px; border-radius: 50%; display: grid; place-items: center; background: var(--color-fill-1); color: var(--color-text-3); font-size: 10px; }
.stage-panel li.current > span { background: var(--color-primary); color: #fff; }
.stage-panel li.current b { color: var(--color-primary-strong); }
.stage-panel li > div { min-width: 0; display: grid; gap: 1px; }
.stage-panel b { font-size: var(--fs-xs); }
.stage-panel small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text-3); font-size: 9px; }

.editor-panel { display: grid; grid-template-rows: 44px minmax(0, 1fr); }
.editor-head { padding: 0 12px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid var(--color-border); background: #f8faff; color: var(--color-text-3); font-size: var(--fs-xs); }
.editor-head > span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.editor-head > button { margin-left: auto; border: 0; background: none; color: var(--color-primary-strong); font: inherit; cursor: pointer; }
.file-pill { padding: 5px 9px; border-radius: var(--r-sm); background: var(--color-surface); color: var(--color-primary-strong); display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 1px 4px rgba(20, 40, 80, .08); }
.editor { min-height: 0; overflow: hidden; }
.design-workspace { min-height: 0; padding: clamp(16px, 2vw, 26px); overflow: auto; background: #fbfcff; }
.design-intro { margin-bottom: 18px; }
.design-intro h2 { margin: 3px 0 4px; font-size: var(--fs-xl); }
.design-intro > span { color: var(--color-text-3); font-size: var(--fs-xs); }
.eyebrow { margin: 0; color: var(--color-primary); font-size: 10px; font-weight: var(--fw-bold); letter-spacing: .12em; }
.design-details { border: 1px solid var(--color-border); border-radius: var(--r-lg); background: var(--color-surface); }
.design-details > summary { min-height: 48px; padding: 0 14px; display: flex; align-items: center; color: var(--color-primary-strong); font-size: var(--fs-sm); font-weight: var(--fw-medium); cursor: pointer; }
.design-details[open] { padding-bottom: 14px; }
.design-details[open] > summary { border-bottom: 1px solid var(--color-border); margin-bottom: 14px; }
.analysis-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.design-details .analysis-grid, .design-details .pseudo-field { margin-left: 14px; margin-right: 14px; }
.analysis-grid label, .pseudo-field { display: grid; gap: 6px; color: var(--color-text-2); font-size: var(--fs-xs); font-weight: var(--fw-medium); }
.analysis-grid textarea, .pseudo-field textarea { width: 100%; resize: vertical; border: 1px solid var(--color-border); border-radius: var(--r-md); padding: 10px 11px; background: var(--color-surface); color: var(--color-text); font: inherit; font-size: var(--fs-sm); line-height: 1.55; outline: none; }
.analysis-grid textarea:focus-visible, .pseudo-field textarea:focus-visible { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-soft); }
.pseudo-field { margin-top: 14px; }
.pseudo-field textarea { font-family: var(--font-code); }
.design-foot { margin-top: 12px; display: flex; align-items: center; gap: 12px; }
.design-foot > span { flex: 1; color: var(--color-text-3); font-size: var(--fs-xs); }

.result-panel { padding: 9px; border: 0; background: transparent; display: flex; flex-direction: column; gap: 9px; overflow: auto; }
.result-card, .ask-cat { border: 1px solid var(--color-border); border-radius: var(--r-lg); background: var(--color-surface); overflow: hidden; }
.preview-card { min-height: 210px; flex: 1; display: grid; grid-template-rows: 42px minmax(0, 1fr); }
.result-head { min-height: 42px; padding: 0 11px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid var(--color-border); color: var(--color-text-2); font-size: var(--fs-xs); font-weight: var(--fw-bold); }
.result-head small { color: var(--color-text-3); font-size: 9px; font-weight: var(--fw-regular); }
.result-head button { margin-left: auto; border: 0; background: none; color: var(--color-text-3); font: inherit; font-size: 10px; cursor: pointer; }
.turtle-wrap { min-height: 0; overflow: hidden; }
.turtle-wrap :deep(.turtle) { width: 100%; height: 100%; border: 0; }
.turtle-wrap :deep(.turtle__head) { display: none; }
.console-card { min-height: 170px; flex: 1; display: grid; grid-template-rows: 42px minmax(0, 1fr); }
.console-body { min-height: 0; margin: 0; padding: 12px; overflow: auto; background: #101826; color: #b8e3be; font: 11px/1.6 var(--font-code); white-space: pre-wrap; }
.console-body.err { color: #ff8f8f; }
.badge { padding: 2px 6px; border-radius: var(--r-pill); background: var(--color-warning-soft); color: var(--color-accent-ontext); font-size: 9px; }
.ask-cat { flex: 0 0 auto; min-height: 68px; padding: 8px 10px; display: flex; align-items: center; gap: 9px; color: var(--color-text); font: inherit; text-align: left; cursor: pointer; }
.ask-cat:hover { border-color: var(--color-primary); background: var(--color-primary-soft); }
.ask-cat img { width: 48px; height: 48px; object-fit: contain; }
.ask-cat > span { min-width: 0; flex: 1; display: grid; gap: 3px; }
.ask-cat b { font-size: var(--fs-xs); }
.ask-cat small { color: var(--color-text-3); font-size: 9px; }
.ask-cat > svg { color: var(--color-primary); }

@media (max-width: 1120px) {
  .ide-workspace { grid-template-columns: 190px minmax(320px, 1fr) 270px; }
  .mode-note { display: none; }
  .analysis-grid { grid-template-columns: 1fr; }
}
@media (max-width: 760px) {
  .ide { display: block; height: 100%; overflow: auto; background: #eef3f9; }
  .workspace-topbar { min-height: 58px; padding: 8px 10px; position: sticky; top: 0; z-index: var(--z-panel); flex-wrap: wrap; }
  .back-btn, .workspace-topbar .proj-sel, .workspace-topbar :deep(.btn), .workspace-topbar .more__btn { min-height: 44px; }
  .back-btn span, .top-divider, .proj-ico, .language-chip, .workspace-topbar .saved { display: none; }
  .workspace-topbar .proj-sel { flex: 1; min-width: 120px; max-width: none; }
  .mode-strip { min-height: 52px; padding: 6px 10px; overflow-x: auto; }
  .mode-tabs { flex: 0 0 auto; height: 44px; }
  .mode-tab { min-width: 86px; }
  .design-btn { flex: 0 0 auto; min-height: 44px; white-space: nowrap; }
  .ide-workspace { display: flex; flex-direction: column; min-height: auto; border-width: 8px; gap: 8px; }
  .project-panel { flex: 0 0 auto; overflow: visible; }
  .project-list { max-height: none; display: flex; overflow-x: auto; }
  .project-item { flex: 0 0 180px; }
  .panel-title > button, .result-head button { min-width: 44px; min-height: 44px; }
  .stage-panel { display: none; }
  .editor-panel { flex: 0 0 58vh; min-height: 420px; }
  .design-workspace { padding: 16px; }
  .result-panel { flex: 0 0 auto; overflow: visible; }
  .preview-card { min-height: 250px; }
  .console-card { min-height: 210px; }
  .ask-cat { min-height: 72px; }
}
@media (prefers-reduced-motion: reduce) {
  .back-btn, .mode-tab, .project-item, .ask-cat { transition: none; }
}
</style>

<style scoped>
.guided-workbench {
  --wb-bg: #eef2f8;
  --wb-panel: #fff;
  --wb-panel-soft: #f7f9fd;
  --wb-line: #dfe5ef;
  --wb-ink: #142034;
  --wb-muted: #667188;
  --wb-blue: #5b70f2;
  --wb-blue-strong: #4259db;
  --wb-blue-soft: #eef0ff;
  --wb-green: #43ad85;
  --wb-orange: #f29a38;
  --wb-purple: #9367e8;
  position: fixed;
  inset: 0;
  z-index: var(--z-panel);
  display: grid;
  grid-template-rows: 54px minmax(0, 1fr);
  color: var(--wb-ink);
  background: var(--wb-bg);
  overflow: hidden;
}

.command-bar {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  border-bottom: 1px solid var(--wb-line);
  background: rgba(255,255,255,.98);
  box-shadow: 0 1px 0 rgba(25,39,76,.03);
}
.mobile-panel-tabs { position: fixed; display: none; }
.back-btn,
.more__btn,
.editor-head button,
.task-card button,
.stage-item,
.mode-tab,
.output-tabs button,
.test-results button,
.mobile-evidence-list button,
.evidence-card,
.mobile-panel-tabs button {
  font-family: var(--font-sans);
}
.back-btn { min-width: 44px; min-height: 40px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 1px solid var(--wb-line); border-radius: 10px; color: var(--wb-muted); background: #fff; cursor: pointer; }
.back-btn:hover { color: var(--wb-blue-strong); border-color: #b9c4ef; }
.command-context { min-width: 0; display: flex; align-items: center; gap: 9px; }
.command-logo { width: 34px; height: 34px; flex: 0 0 34px; display: grid; place-items: center; border-radius: 11px; background: var(--wb-blue-soft); overflow: hidden; }
.command-logo img { width: 39px; height: 39px; object-fit: contain; transform: translateY(2px); }
.command-copy { min-width: 0; display: grid; gap: 1px; }
.command-copy b { font-size: 14px; }
.command-copy small { max-width: 300px; overflow: hidden; color: var(--wb-muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.proj-sel { max-width: 190px; min-height: 36px; padding: 0 28px 0 10px; border: 1px solid var(--wb-line); border-radius: 9px; color: var(--wb-ink); background: var(--wb-panel-soft); font: 500 12px/1 var(--font-sans); }
.saved { min-height: 30px; display: inline-flex; align-items: center; padding: 0 9px; border: 1px solid var(--wb-line); border-radius: 8px; color: var(--wb-muted); background: var(--wb-panel-soft); font-size: 11px; white-space: nowrap; }
.spacer { flex: 1; }
.command-bar :deep(.btn) { min-height: 40px; }
.more { position: relative; }
.more__btn { width: 40px; height: 40px; display: grid; place-items: center; border: 1px solid transparent; border-radius: 9px; color: var(--wb-muted); cursor: pointer; list-style: none; }
.more__btn::-webkit-details-marker { display: none; }
.more[open] .more__btn { border-color: var(--wb-line); background: var(--wb-panel-soft); }
.more__menu { position: absolute; z-index: 20; right: 0; top: 45px; width: 216px; padding: 6px; }
.more__project { display: grid; gap: 5px; padding: 7px 8px 9px; color: var(--wb-muted); font-size: 10px; font-weight: 700; }
.more__project .proj-sel { width: 100%; max-width: none; }
.more__item { width: 100%; min-height: 40px; display: flex; align-items: center; gap: 8px; padding: 0 10px; border: 0; border-radius: 8px; color: var(--wb-ink); background: transparent; font: 500 12px/1 var(--font-sans); cursor: pointer; }
.more__item:hover { background: var(--wb-panel-soft); }

.workbench-grid {
  --task-rail-default: 238px;
  --evidence-rail-default: 256px;
  --rail-splitter-size: 16px;
  width: 100%;
  max-width: 1440px;
  min-width: 0;
  min-height: 0;
  margin: 0 auto;
  padding: 14px;
  display: grid;
  grid-template-columns:
    var(--task-rail-width, var(--task-rail-default))
    var(--rail-splitter-size)
    minmax(0, 1fr)
    var(--rail-splitter-size)
    var(--evidence-rail-width, var(--evidence-rail-default));
  gap: 0;
}
.workbench-grid[data-layout="compact"] {
  --task-rail-default: 205px;
  grid-template-columns:
    var(--task-rail-width, var(--task-rail-default))
    var(--rail-splitter-size)
    minmax(0, 1fr);
}
.workbench-grid[data-layout="compact"] .rail-resizer--evidence,
.workbench-grid[data-layout="compact"] .evidence-rail,
.workbench-grid[data-layout="mobile"] .rail-resizer { display: none; }
.workbench-grid[data-layout="mobile"] { grid-template-columns: minmax(0, 1fr); }
.rail-resize-status { position: fixed; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.rail-resizer {
  position: relative;
  align-self: stretch;
  min-width: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  color: var(--wb-muted);
  background: transparent;
  cursor: col-resize;
  touch-action: none;
}
.rail-resizer::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 50%;
  width: 2px;
  border-radius: 2px;
  background: #d4dbea;
  transform: translateX(-50%);
  transition: width 120ms ease, background-color 120ms ease;
}
.rail-resizer > span {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 50%;
  min-width: 18px;
  min-height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid #c8d0e2;
  border-radius: 9px;
  color: var(--wb-blue-strong);
  background: #fff;
  box-shadow: 0 4px 12px rgba(33,48,84,.1);
  opacity: 0;
  transform: translate(-50%, -50%);
  transition: opacity 120ms ease;
}
.rail-resizer:hover::before,
.rail-resizer:focus-visible::before,
.rail-resizer.is-active::before { width: 4px; background: var(--wb-blue); }
.rail-resizer:hover > span,
.rail-resizer:focus-visible > span,
.rail-resizer.is-active > span,
.rail-resizer.is-at-limit > span { opacity: 1; }
.rail-resizer:focus-visible { outline: 3px solid rgba(91,112,242,.28); outline-offset: -3px; }
.workbench-grid.is-resizing,
.workbench-grid.is-resizing * { cursor: col-resize !important; user-select: none !important; }
.task-rail,
.creation-workspace,
.evidence-rail { min-width: 0; min-height: 0; border: 1px solid var(--wb-line); background: var(--wb-panel); }
.task-rail { overflow: auto; border-radius: 16px 0 0 16px; padding: 14px; }
.task-card { padding: 13px; border: 1px solid #e5e9f3; border-radius: 12px; background: linear-gradient(145deg, #fff, #fafbff); }
.task-card > span { color: var(--color-accent-ontext); font-size: 11px; font-weight: 700; }
.task-card h1 { margin: 7px 0 5px; font-size: 17px; line-height: 1.35; }
.task-card p { margin: 0; color: var(--wb-muted); font-size: 12px; line-height: 1.65; }
.task-card button { min-height: 40px; margin-top: 10px; display: inline-flex; align-items: center; gap: 5px; border: 0; color: var(--wb-blue-strong); background: transparent; font-size: 12px; font-weight: 700; cursor: pointer; }
.stage-nav { display: grid; gap: 5px; margin-top: 13px; }
.stage-item { width: 100%; min-height: 52px; display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 6px 9px; border: 1px solid transparent; border-radius: 11px; color: var(--wb-muted); text-align: left; background: transparent; cursor: pointer; }
.stage-item:hover { background: var(--wb-panel-soft); }
.stage-item.active { border-color: #d7dcff; color: var(--wb-blue-strong); background: var(--wb-blue-soft); box-shadow: inset 3px 0 0 var(--wb-blue); }
.stage-number { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 10px; color: var(--wb-muted); background: #f0f3f8; font-size: 12px; font-weight: 700; }
.stage-item.done .stage-number { color: #26795d; background: #eaf7f1; }
.stage-item.active .stage-number { color: #fff; background: var(--wb-blue); }
.stage-item > span:nth-child(2) { min-width: 0; display: grid; gap: 2px; }
.stage-item b { color: inherit; font-size: 13px; }
.stage-item small { overflow: hidden; color: var(--wb-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.stage-item em { color: var(--wb-muted); font-size: 10px; font-style: normal; white-space: nowrap; }
.stage-gate { margin: 13px 0 0; display: flex; gap: 8px; padding: 10px; border-radius: 10px; color: #78551c; background: #fff8e9; font-size: 11px; line-height: 1.5; }
.stage-gate.ready { color: #26795d; background: #edf9f4; }

.creation-workspace { display: grid; grid-template-rows: 48px 44px minmax(0, 1fr) auto; border-radius: 0; overflow: hidden; }
.workspace-toolbar { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 13px; border-bottom: 1px solid var(--wb-line); }
.mode-tabs { display: flex; align-items: center; gap: 2px; }
.mode-tab { min-height: 34px; padding: 0 11px; border: 0; border-radius: 8px; color: var(--wb-muted); background: transparent; font-size: 12px; font-weight: 600; cursor: pointer; }
.mode-tab:hover { background: var(--wb-panel-soft); }
.mode-tab.active { color: var(--wb-blue-strong); background: var(--wb-blue-soft); }
.version-link { display: inline-flex; align-items: center; gap: 5px; color: #41856f; font-size: 11px; white-space: nowrap; }
.editor-head { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 0 13px; border-bottom: 1px solid var(--wb-line); color: var(--wb-muted); font-size: 11px; }
.file-pill { min-height: 28px; display: inline-flex; align-items: center; gap: 5px; padding: 0 8px; border: 1px solid #e6e9f4; border-radius: 8px; color: var(--wb-blue-strong); background: #fff; font-weight: 700; }
.editor-head > span:nth-child(2) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.editor-head button { min-height: 34px; margin-left: auto; border: 0; color: var(--wb-blue-strong); background: transparent; font-size: 11px; font-weight: 700; cursor: pointer; }
.stage-canvas { min-width: 0; min-height: 0; overflow: hidden; background: #172031; }
.editor { width: 100%; height: 100%; min-height: 0; overflow: hidden; background: #172031; }
.focus-sheet { width: 100%; height: 100%; overflow: auto; padding: 24px; color: var(--wb-ink); background: var(--wb-panel-soft); }
.focus-heading > span { color: var(--wb-blue-strong); font-size: 11px; font-weight: 800; letter-spacing: .05em; }
.focus-heading h2 { margin: 5px 0 6px; font-size: 21px; line-height: 1.35; }
.focus-heading p { max-width: 700px; margin: 0; color: var(--wb-muted); font-size: 13px; line-height: 1.65; }
.task-spec { margin: 20px 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.task-spec > div { padding: 13px; border: 1px solid var(--wb-line); border-radius: 11px; background: #fff; }
.task-spec dt { color: var(--wb-blue-strong); font-size: 11px; font-weight: 800; }
.task-spec dd { margin: 6px 0 0; color: var(--wb-muted); font-size: 13px; line-height: 1.55; }
.analysis-grid { margin-top: 18px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.analysis-grid label,
.pseudo-field,
.reflection-focus label { display: grid; gap: 6px; color: var(--wb-muted); font-size: 12px; font-weight: 700; }
.analysis-grid textarea,
.pseudo-field textarea,
.reflection-focus textarea { width: 100%; resize: vertical; border: 1px solid var(--wb-line); border-radius: 10px; padding: 10px 11px; color: var(--wb-ink); background: #fff; font: 13px/1.55 var(--font-sans); outline: none; }
.analysis-grid textarea:focus-visible,
.pseudo-field textarea:focus-visible,
.reflection-focus textarea:focus-visible { border-color: var(--wb-blue); box-shadow: 0 0 0 3px var(--wb-blue-soft); }
.pseudo-field { margin-top: 12px; }
.pseudo-field textarea { font-family: var(--font-code); }
.design-foot { margin-top: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--wb-muted); font-size: 11px; }
.test-grid { margin: 18px 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.test-card { min-height: 104px; padding: 13px; border: 1px solid var(--wb-line); border-radius: 11px; background: #fff; }
.test-card > span { display: flex; align-items: center; gap: 6px; color: var(--wb-muted); font-size: 12px; }
.test-card b { display: block; margin-top: 8px; font-size: 14px; }
.test-card p { margin: 5px 0 0; color: var(--wb-muted); font-size: 11px; line-height: 1.5; }
.test-card.is-error { border-color: #f0d3d3; background: #fff7f7; }
.test-card.is-error b { color: #a44c4c; }
.check-next-step { padding: 12px; border-radius: 10px; background: var(--wb-panel-soft); color: var(--wb-ink); font-size: 13px; line-height: 1.6; }
.reflection-focus { display: grid; align-content: start; gap: 13px; }
.reflection-focus label { max-width: 780px; }
.reflection-status { display: flex; align-items: center; gap: 7px; margin: 0; color: var(--wb-muted); font-size: 12px; }

.output-drawer { min-width: 0; min-height: 0; height: 40px; display: grid; grid-template-rows: 38px 38px minmax(0, 1fr); border-top: 1px solid var(--wb-line); background: #111a29; overflow: hidden; }
.output-drawer[open] { height: 166px; }
.output-content { display: contents; }
/* Native details lays out its non-summary children in an anonymous box.
   Bound the cloud result grid explicitly, so a canvas cannot size itself
   beyond the visible drawer. Local deployment keeps its existing layout. */
.cloud-output-drawer { position: relative; display: block; }
.cloud-output-drawer[open] { height: clamp(190px, 32vh, 300px); }
.cloud-output-drawer[open] .output-content { position: absolute; inset: 38px 0 0; display: grid; grid-template-rows: 38px minmax(0, 1fr); min-height: 0; overflow: hidden; }
.output-summary { min-height: 38px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 11px; border-bottom: 1px solid rgba(255,255,255,.1); color: #d5dbea; background: #111a29; cursor: pointer; list-style: none; }
.output-summary::-webkit-details-marker { display: none; }
.output-summary > span { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 750; }
.output-summary small { color: #9ea9bd; font-size: 10px; }
.output-drawer[open] .output-summary { color: #fff; background: #172031; }
.output-tabs { display: flex; align-items: center; gap: 3px; padding: 0 9px; border-bottom: 1px solid rgba(255,255,255,.1); background: #172031; overflow-x: auto; }
.output-tabs button { min-height: 32px; padding: 0 9px; border: 0; border-radius: 7px; color: #aeb9cd; background: transparent; font-size: 11px; white-space: nowrap; cursor: pointer; }
.output-tabs button.active { color: #fff; background: rgba(91,112,242,.25); }
.output-tabs i { margin-left: 5px; color: #9ed8c4; font-style: normal; }
.console-body { min-width: 0; min-height: 0; margin: 0; overflow: auto; padding: 11px 13px; color: #c8d1e2; background: #111a29; font: 12px/1.65 var(--font-code); white-space: pre-wrap; }
.console-body.err { color: #ffaaaa; }
.test-results { min-height: 0; overflow: auto; padding: 8px; color: #d5dbea; }
.test-results > p { margin: 8px; color: #aeb9cd; font-size: 12px; }
.test-results button { width: 100%; min-height: 38px; display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; gap: 7px; padding: 5px 8px; border: 0; border-radius: 7px; color: #d5dbea; text-align: left; background: transparent; cursor: pointer; }
.test-results button:hover { background: rgba(255,255,255,.06); }
.test-results button span { min-width: 0; display: grid; gap: 1px; }
.test-results button b { font-size: 11px; }
.test-results button small { color: #b8c2d4; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.test-results button em { color: #d5dbea; font-size: 12px; font-style: normal; }
.turtle-wrap { min-height: 0; overflow: hidden; background: #f7f9fd; }
.mobile-evidence-list { min-height: 0; overflow: auto; padding: 8px; }
.mobile-evidence-list button { width: 100%; min-height: 44px; display: flex; align-items: center; gap: 8px; padding: 7px 9px; border: 0; border-radius: 8px; color: #d5dbea; text-align: left; background: transparent; cursor: pointer; }
.mobile-evidence-list button:hover { background: rgba(255,255,255,.06); }
.mobile-evidence-list span { flex: 1; display: grid; gap: 2px; }
.mobile-evidence-list b { font-size: 11px; }
.mobile-evidence-list small { color: #9ea9bd; font-size: 10px; }
.companion-evidence-original { margin: 9px 0 0; padding: 10px; border: 1px solid rgba(91,112,242,.22); border-radius: 10px; color: #25324a; background: #f4f6ff; }
.companion-evidence-original > b { color: var(--wb-blue-strong); font-size: 11px; }
.companion-evidence-original dl { margin: 8px 0 0; display: grid; gap: 8px; }
.companion-evidence-original dl div { display: grid; gap: 2px; }
.companion-evidence-original dt { color: #68728a; font-size: 9px; font-weight: 800; }
.companion-evidence-original dd { margin: 0; font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
.mobile-evidence-list .companion-evidence-original { color: #dfe5f2; background: rgba(91,112,242,.12); }
.mobile-evidence-list .companion-evidence-original dt { color: #9eabc3; }

.evidence-rail { overflow: auto; border-radius: 0 16px 16px 0; padding: 13px; }
.evidence-rail > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.evidence-rail h2 { margin: 0; font-size: 16px; }
.evidence-rail header p { margin: 3px 0 0; color: var(--wb-muted); font-size: 10px; }
.evidence-rail header > span { min-width: 36px; height: 26px; display: grid; place-items: center; border-radius: 8px; color: var(--wb-blue-strong); background: var(--wb-blue-soft); font-size: 11px; font-weight: 800; }
.evidence-card { width: 100%; min-height: 66px; margin-bottom: 7px; display: grid; grid-template-columns: 34px minmax(0, 1fr) 16px; align-items: center; gap: 8px; padding: 8px; border: 1px solid var(--wb-line); border-radius: 11px; color: var(--wb-ink); text-align: left; background: #fff; cursor: pointer; }
.evidence-card:hover { border-color: #bfc8ec; background: #fbfcff; }
.evidence-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; color: var(--wb-blue-strong); background: var(--wb-blue-soft); }
.evidence-card.ready .evidence-icon { color: #26795d; background: #eaf7f1; }
.evidence-card > span:nth-child(2) { min-width: 0; display: grid; gap: 3px; }
.evidence-card b { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.evidence-card small { color: var(--wb-muted); font-size: 10px; line-height: 1.4; }
.teacher-anchor { margin-top: 11px; padding: 11px; border-radius: 11px; color: #314059; background: #f1f3ff; }
.teacher-anchor > b { font-size: 11px; }
.teacher-anchor p { margin: 7px 0 0; display: grid; grid-template-columns: 60px minmax(0, 1fr); gap: 5px; font-size: 10px; line-height: 1.4; }
.teacher-anchor p span { color: var(--wb-blue-strong); font-weight: 800; }

@media (max-width: 1120px) {
  .command-copy small { max-width: 190px; }
  .compact-action { display: none; }
  .analysis-grid { grid-template-columns: 1fr; }
}

@media (max-width: 900px) and (min-width: 761px) {
  .command-copy small,
  .saved { display: none; }
}

@media (max-width: 760px) {
  .guided-workbench { grid-template-rows: 52px minmax(0, 1fr); }
  .command-bar { gap: 6px; padding: 0 7px; }
  .back-btn { width: 42px; min-width: 42px; min-height: 42px; padding: 0; }
  .back-btn span,
  .command-copy,
  .saved,
  .compact-action,
  .more { display: none; }
  .command-context { flex: 0 0 34px; }
  .command-bar :deep(.btn) { width: 44px; min-width: 44px; height: 42px; min-height: 42px; padding: 0; gap: 0; font-size: 0; }
  .mobile-panel-tabs { z-index: 18; left: 8px; right: 8px; bottom: calc(8px + env(safe-area-inset-bottom)); display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; padding: 4px; border: 1px solid var(--wb-line); border-radius: 13px; background: rgba(255,255,255,.96); box-shadow: 0 12px 30px rgba(29,44,78,.18); backdrop-filter: blur(14px); }
  .mobile-panel-tabs button { min-height: 36px; border: 0; border-radius: 8px; color: var(--wb-muted); background: transparent; font-size: 12px; font-weight: 700; cursor: pointer; }
  .mobile-panel-tabs button[aria-selected="true"] { color: var(--wb-blue-strong); background: var(--wb-blue-soft); }
  .rail-resizer { display: none; }
  .workbench-grid { width: 100%; padding: 7px 7px 60px; grid-template-columns: minmax(0, 1fr); gap: 0; }
  .task-rail,
  .creation-workspace,
  .evidence-rail { border-radius: 12px; }
  .workbench-grid[data-mobile-panel="task"] .creation-workspace,
  .workbench-grid[data-mobile-panel="task"] .evidence-rail,
  .workbench-grid[data-mobile-panel="editor"] .task-rail,
  .workbench-grid[data-mobile-panel="editor"] .evidence-rail,
  .workbench-grid[data-mobile-panel="result"] .task-rail,
  .workbench-grid[data-mobile-panel="result"] .evidence-rail { display: none; }
  .task-rail { padding: 10px; }
  .creation-workspace { grid-template-rows: 44px 40px minmax(0, 1fr) auto; }
  .output-drawer[open] { height: 154px; }
  .output-summary { padding-right: 68px; }
  .workspace-toolbar { padding: 0 8px; }
  .mode-tabs { min-width: 0; overflow-x: auto; }
  .mode-tab { min-width: max-content; min-height: 36px; padding: 0 9px; }
  .version-link { display: none; }
  .editor-head { padding: 0 9px; }
  .focus-sheet { padding: 16px 13px; }
  .task-spec,
  .test-grid { grid-template-columns: 1fr; }
  .analysis-grid { grid-template-columns: 1fr; }
  .design-foot { align-items: stretch; flex-direction: column; }
  .workbench-grid[data-mobile-panel="result"] .creation-workspace { display: grid; grid-template-rows: minmax(0, 1fr); }
  .workbench-grid[data-mobile-panel="result"] .workspace-toolbar,
  .workbench-grid[data-mobile-panel="result"] .editor-head,
  .workbench-grid[data-mobile-panel="result"] .stage-canvas { display: none; }
  .workbench-grid[data-mobile-panel="result"] .output-drawer { grid-row: 1; height: 100%; border-top: 0; border-radius: 12px; overflow: hidden; }
}

@media (max-width: 420px) {
  .task-card { padding: 11px; }
  .stage-item { min-height: 50px; }
  .output-tabs button { min-width: max-content; }
}

@media (pointer: coarse) {
  .workbench-grid { --rail-splitter-size: 24px; }
}

@media (prefers-reduced-motion: reduce) {
  .guided-workbench *,
  .guided-workbench *::before,
  .guided-workbench *::after { scroll-behavior: auto !important; }
  .rail-resizer::before,
  .rail-resizer > span { transition: none; }
}
</style>
