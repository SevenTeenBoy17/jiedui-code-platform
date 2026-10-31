<!-- @lintOverlay @copyBudget 360 — approved 03/04 right-side detail canvas: teacher quote, immutable original, AI limitation, and release rules remain readable. One mode is visible; provenance and extended rules use real details disclosure. -->
<template>
  <dialog ref="dialog" class="assessment-drawer" :aria-labelledby="titleId" :aria-describedby="demoId"
    data-testid="assessment-detail-drawer" @cancel.prevent="requestClose" @close="onNativeClose"
    @pointerdown="onBackdropPointerDown" @click="onBackdropClick">
    <header class="drawer-header">
      <div class="drawer-header__line">
        <p class="drawer-context" data-testid="drawer-task-context">{{ context }}</p>
        <button class="drawer-close" type="button" data-testid="drawer-close" aria-label="关闭详情并返回原来的按钮" @click="requestClose">关闭 <span aria-hidden="true">×</span></button>
      </div>
      <h2 :id="titleId" ref="heading" tabindex="-1" data-testid="drawer-title">{{ title }}</h2>
      <p :id="demoId" class="drawer-demo">设计演示 · 不会发送给老师<span v-if="isResearch"> · 非真实回执</span></p>
    </header>

    <div ref="body" class="drawer-body">
      <template v-if="activeKind === 'submission'">
        <section class="teacher-feedback" aria-labelledby="teacher-feedback-title">
          <h3 id="teacher-feedback-title"><img :src="demoAssessment.resources.feedback" alt="" />林老师的反馈</h3>
          <blockquote data-testid="teacher-feedback-quote">“{{ demoAssessment.FB01.quote }}”</blockquote>
          <small>这条反馈来自演示中的老师；不代表老师已核对下方 AI 建议。</small>
        </section>

        <section aria-labelledby="submission-original-title">
          <div class="section-heading"><h3 id="submission-original-title">看看我交的内容</h3><span>第一次提交 · 仅这次任务</span></div>
          <div class="original-table-wrap">
            <table class="original-table" data-testid="assessment-original-table">
              <caption class="drawer-visually-hidden">校园温度提醒器，第一次提交的测试预期</caption>
              <thead><tr><th scope="col">温度</th><th scope="col">我的预期</th><th scope="col">我的理由</th></tr></thead>
              <tbody><tr v-for="row in demoAssessment.E01.rows" :key="row.temperature"><th scope="row">{{ row.temperature }}℃</th><td>{{ row.expected ?? '—' }}</td><td>{{ row.reason ?? '—' }}</td></tr></tbody>
            </table>
          </div>
          <p class="system-hint">系统提示：30℃这一行还没填写。</p>
          <details class="drawer-disclosure"><summary>看看我第一次写的说明</summary><blockquote class="student-original" data-testid="student-original-explanation">{{ demoAssessment.E02.text }}</blockquote></details>
        </section>

        <details class="drawer-disclosure" data-section="rules">
          <summary>看看完整要求</summary>
          <div class="disclosure-content">
            <h4>先看原任务规则</h4>
            <p>输入范围是0–45℃。低于30℃时建议户外活动；等于或高于30℃时建议室内活动；超出范围时提示输入不在范围内。</p>
            <p class="system-hint">这些是本轮演示的任务规则，不是学生原话。</p>
            <ol class="rubric-list"><li v-for="criterion in demoAssessment.R1.criteria" :key="criterion.title"><strong>{{ criterion.title }}</strong><p>{{ criterion.detail }}</p></li></ol>
            <h4>怎样知道这一步有没有补好？</h4><p>老师会对照新写的预期、理由和实际测试再看一次。只看见“保存了”，还不能说已经学会。</p>
            <p>可以查看规则、询问提示；预期和理由要由你自己写，不提供完整程序。</p>
          </div>
        </details>

        <section class="ai-feedback" data-section="ai" aria-labelledby="ai-feedback-title">
          <div class="ai-avatar" aria-hidden="true"><img :src="demoAssessment.resources.avatar" alt="" /><span>AI</span></div>
          <div class="ai-feedback__content">
            <h3 id="ai-feedback-title">AI导师 · 老师还没核对</h3>
            <p>{{ demoAssessment.AI01.observation }}{{ demoAssessment.AI01.uncertainty }}</p>
            <p class="ai-scope">仅校园温度提醒器 · 第一次提交</p>
            <small>人工编写的演示建议，未调用真实 AI；不是能力结论。</small>
            <details class="ai-response"><summary>我有不同想法</summary>
              <div class="disclosure-content">
                <div class="ai-decisions" aria-label="我对这条提示的决定">
                  <button class="drawer-button drawer-button--secondary" type="button" :aria-pressed="aiDecision === 'adopt'" @click="aiDecision = 'adopt'">采用这条提示</button>
                  <button class="drawer-button drawer-button--secondary" type="button" :aria-pressed="aiDecision === 'decline'" data-testid="decline-ai-suggestion" @click="aiDecision = 'decline'">不采用这条提示</button>
                </div>
                <label :for="`${titleId}-ai-response`">想补充或不同意的地方（可不填）</label>
                <textarea :id="`${titleId}-ai-response`" v-model="aiResponse" rows="3" maxlength="500" placeholder="可以告诉老师，你是怎样想的。这里仅暂存在演示中。" />
                <p v-if="aiDecision" role="status" class="system-hint">已在本页记下：{{ aiDecision === 'adopt' ? '采用提示' : '不采用提示' }}。未发送给老师。</p>
                <p class="system-hint">不同意或不采用 AI 建议，也可以直接补充这一步；这里不会发送。</p>
              </div>
            </details>
          </div>
        </section>

        <details class="drawer-disclosure"><summary>材料的版本和来历</summary>
          <dl class="provenance-list">
            <dt>任务范围</dt><dd>{{ demoAssessment.task.title }} · 仅本任务</dd>
            <dt>已保存的演示原件</dt><dd>E01 v1：测试预期；E02 v1：第一次说明。30℃空值保留为空。</dd>
            <dt>老师反馈</dt><dd data-testid="teacher-feedback-provenance">FB01 · {{ demoAssessment.FB01.version }}，仅本任务（scope={{ demoAssessment.FB01.scope }}）；针对原件 E01 / E02 {{ demoAssessment.FB01.evidenceVersion }}。</dd>
            <dt>任务要求</dt><dd>R1 · demo-1，本次演示规则及检查标准。</dd>
            <dt>AI 建议</dt><dd data-testid="ai-feedback-provenance">AI01 · {{ demoAssessment.AI01.version }}，仅本任务（scope={{ demoAssessment.AI01.scope }}）；引用同一 E01 / E02 {{ demoAssessment.AI01.evidenceVersion }} 和 R1，待老师核对，不算另一份学生表现证据。</dd>
            <dt>新的尝试与复核</dt><dd>尚未产生新版本，也没有迁移复核结果；不会自动更新成长画像。</dd>
          </dl>
        </details>
      </template>

      <template v-else-if="activeKind === 'supplement'">
        <section class="drawer-callout"><h3>先看规则，再写自己的想法</h3><p>林老师想请你补上：30℃时，预期会得到什么结果？为什么？</p></section>
        <details class="drawer-disclosure" open data-section="rules"><summary>原任务规则 · 本轮演示约定</summary>
          <div class="disclosure-content"><p>允许输入0–45℃。低于30℃建议户外活动；等于或高于30℃建议室内活动；超出范围要提示输入不在范围内。</p><p>这是题目已经给出的条件，不是完整程序，也不是对你能力的评价。</p></div>
        </details>
        <form :id="formId" class="supplement-form" @submit.prevent="saveDraft">
          <label :for="`${formId}-expected`">30℃时，我预期会得到什么结果？</label>
          <input :id="`${formId}-expected`" v-model="draft.expected" type="text" maxlength="120" required autocomplete="off" data-testid="supplement-expected" @input="draftError = ''" />
          <label :for="`${formId}-reason`">我的理由是什么？</label>
          <textarea :id="`${formId}-reason`" v-model="draft.reason" rows="4" maxlength="600" required data-testid="supplement-reason" @input="draftError = ''" />
          <p class="system-hint">可以不采用 AI 建议。写自己的判断，不需要凑字数。</p>
          <p v-if="draftError" role="alert" class="draft-error">{{ draftError }}</p>
          <div class="draft-status" role="status" aria-live="polite" data-testid="supplement-status">
            <p v-if="!savedDraft">当前是本页的演示草稿，尚未暂存，也未发送给老师。</p>
            <p v-else-if="draftHasChanges">有未暂存的修改；上次暂存仍保留。未发送给老师。</p>
            <p v-else>已暂存演示草稿；未提交、未发送给老师。</p>
          </div>
          <button v-if="savedDraft && draftHasChanges" class="drawer-button drawer-button--secondary" type="button" data-testid="restore-supplement" @click="restoreSavedDraft">恢复上次暂存</button>
        </form>
        <details v-if="savedDraft" class="drawer-disclosure" data-testid="saved-supplement"><summary>看看上次暂存</summary><dl class="provenance-list"><dt>30℃时的预期</dt><dd data-testid="supplement-saved-expected">{{ savedDraft.expected }}</dd><dt>我的理由</dt><dd data-testid="supplement-saved-reason">{{ savedDraft.reason }}</dd></dl></details>
        <details class="drawer-disclosure"><summary>暂存后会发生什么？</summary><div class="disclosure-content"><p>关闭再打开详情，正在编辑的内容和上次暂存都还在本页。刷新页面、退出演示或切换账号后会清空。</p><p>恢复上次暂存，会替换当前未暂存的修改。第一次提交 E01 / E02 v1 不会改变；这里不创建真实 v2，不发送老师，不更新画像。</p></div></details>
      </template>

      <template v-else-if="activeKind === 'receipt'">
        <section class="receipt-intro"><img :src="demoAssessment.resources.notebook" alt="" /><div><h3>不用重复提交</h3><p>结果还没发布，请等老师通知。</p></div></section>
        <ol class="release-steps" aria-label="反馈发布进度"><li class="release-steps__done"><span aria-hidden="true">✓</span>已提交</li><li><span aria-hidden="true"></span>老师发布</li><li><span aria-hidden="true"></span>看反馈</li></ol>
        <details class="drawer-disclosure release-rules" open><summary>什么时候能看反馈？</summary>
          <div class="disclosure-content"><ol><li>老师发布，并允许你查看后，这里才会出现反馈。</li><li>目前没有公布时间，请等老师通知。</li></ol><p class="drawer-callout">这张凭证只说明交上了，不代表已经学会。</p></div>
        </details>
        <details class="drawer-disclosure"><summary>看提交凭证的详细信息</summary><dl class="provenance-list"><dt>小测</dt><dd>学习前小测（单元前测）· 条件判断单元</dd><dt>凭证编号</dt><dd>{{ demoAssessment.receipt.id }} · 人工编写的演示回执</dd><dt>提交时间</dt><dd>—（未提供真实时间）</dd><dt>发布状态</dt><dd>未发布，没有成绩或答案内容。</dd></dl></details>
        <details class="drawer-disclosure"><summary>谁能看到我的答案？</summary><div class="disclosure-content"><p>这页没有真实答案，也不会读取题卷。正式参与前，老师需要说明谁能看答案、收集哪些材料、保存多久和怎样退出。</p><button class="drawer-button drawer-button--secondary" type="button" @click="showKind('privacy')">看看参与与隐私说明</button></div></details>
        <section class="ai-feedback"><div class="ai-avatar" aria-hidden="true"><img :src="demoAssessment.resources.avatar" alt="" /><span>AI</span></div><div class="ai-feedback__content"><h3>AI导师 · 只提供流程帮助</h3><p>现在只帮你了解流程。发布后只讲老师允许的反馈，不提供题目答案。</p><small>人工编写的演示说明，未调用真实 AI。</small></div></section>
      </template>

      <template v-else-if="activeKind === 'loop'">
        <section class="drawer-empty"><img :src="demoAssessment.resources.notebook" alt="" /><h3>暂时看不到这份提交</h3><p>“循环绘图检查”的原件没有包含在这次演示中。</p><p>这不表示你没有提交；也不能用其他任务的材料代替。</p></section>
        <section class="drawer-callout"><h3>现在可以怎么做？</h3><p>先返回任务记录；如果真实课堂里也看不到，可以请老师帮你确认提交情况。</p><button class="drawer-button drawer-button--secondary" type="button" data-testid="loop-contact" @click="showKind('contact')">看看怎么问老师</button></section>
      </template>

      <template v-else-if="activeKind === 'requirements'">
        <section class="drawer-empty"><img :src="demoAssessment.resources.notebook" alt="" /><h3>先弄清楚老师要你做什么</h3><p>“信息来源辨识”还没开始。本次演示没有提供它的完整任务要求或原件，不会编造你的答案和评价。</p></section>
        <section class="drawer-callout"><h3>开始前，向老师确认三件事</h3><ol><li>要解决什么问题，使用哪些材料？</li><li>需要交什么，怎样说明信息来自哪里？</li><li>什么时候完成，可以使用哪些帮助？</li></ol></section>
        <p class="system-hint">没有这份任务的材料，暂不判断信息意识、创新或问题解决能力。</p>
      </template>

      <template v-else-if="activeKind === 'privacy'">
        <section class="drawer-callout"><h3>看说明，不等于同意参加</h3><p>当前只是设计演示，没有真实题目，不采集研究答案，也不会替你勾选同意。</p></section>
        <section><h3>正式参加前，需要告诉你什么？</h3><ul class="plain-list"><li>为什么做这次研究小测，它与日常课堂练习有什么不同。</li><li>会收集哪些作答材料、谁可以看、保存多久、怎样保护身份。</li><li>需要什么参与说明或同意程序，以及怎样拒绝或撤回。</li></ul></section>
        <section class="drawer-callout"><h3>不想参加，或后来想退出？</h3><p>请联系老师说明“我想了解如何拒绝或撤回参加”。老师应向你说明可选安排，以及已收集材料如何处理。</p><p>本页不会发消息，也不会把查看说明当成同意。</p></section>
      </template>

      <template v-else-if="activeKind === 'contact'">
        <section class="drawer-callout"><h3>这页不会替你发消息</h3><p>下次上课时可以当面问老师，或使用学校已经提供的联系渠道。</p></section>
        <section><h3>可以这样说明你的问题</h3><ul class="plain-list"><li>“这份任务的提交暂时看不到，请帮我确认一下。”</li><li>“这次小测什么时候能看反馈？现在需要我做什么？”</li><li>“我想了解参加研究、拒绝或撤回的办法。”</li></ul></section>
        <p class="system-hint">不用在这里填写姓名、联系方式或研究答案。</p>
      </template>

      <template v-else-if="activeKind === 'flow'">
        <section class="receipt-intro"><img :src="demoAssessment.resources.calendar" alt="" /><div><h3>现在不用作答</h3><p>开放后，安排里才会出现“开始小测”按钮。</p></div></section>
        <ol class="flow-list"><li><strong>先看老师的安排</strong><p>确认小测是否开放，了解参与说明；没开放就等待老师通知。</p></li><li><strong>开放后，按规则自己作答</strong><p>作答时 AI 只说明操作流程，不讲答案、不评价表现。</p></li><li><strong>提交后，等老师发布</strong><p>提交凭证不等于学会。老师允许查看后，才看反馈和下一步。</p></li></ol>
        <p class="drawer-callout">研究记录与日常学习分开，不生成能力总分。本演示没有题目、作答接口或真实 AI。</p>
      </template>
    </div>

    <footer class="drawer-footer">
      <template v-if="activeKind === 'submission'"><button class="drawer-button drawer-button--primary" type="button" data-testid="open-supplement" @click="showKind('supplement')">补充这一步</button><button class="drawer-button drawer-button--secondary" type="button" data-testid="return-assessment-page" @click="requestClose">返回刚才页面</button><p>只在当前演示里填写，不会跳转或替你写答案。</p></template>
      <template v-else-if="activeKind === 'supplement'"><button class="drawer-button drawer-button--primary" type="submit" :form="formId" data-testid="save-supplement">暂存演示草稿</button><button class="drawer-button drawer-button--secondary" type="button" data-testid="return-submission" @click="showKind('submission')">再看提交和反馈</button><p>未发送给老师 · 原件保持不变</p></template>
      <template v-else-if="activeKind === 'receipt'"><button class="drawer-button drawer-button--secondary" type="button" data-testid="receipt-privacy" @click="showKind('privacy')">参与与隐私说明</button><button class="drawer-button drawer-button--primary" type="button" @click="requestClose">返回小测安排</button></template>
      <template v-else-if="activeKind === 'privacy'"><button class="drawer-button drawer-button--secondary" type="button" data-testid="privacy-contact" @click="showKind('contact')">看看怎么联系老师</button><button class="drawer-button drawer-button--primary" type="button" data-testid="drawer-back" @click="goBack">返回刚才的详情</button></template>
      <template v-else-if="activeKind === 'requirements'"><button class="drawer-button drawer-button--secondary" type="button" data-testid="requirements-contact" @click="showKind('contact')">看看怎么问老师</button><button class="drawer-button drawer-button--primary" type="button" @click="requestClose">返回我的记录</button></template>
      <template v-else-if="activeKind === 'flow'"><button class="drawer-button drawer-button--secondary" type="button" data-testid="flow-privacy" @click="showKind('privacy')">参与与隐私说明</button><button class="drawer-button drawer-button--primary" type="button" @click="requestClose">返回小测安排</button></template>
      <template v-else><button class="drawer-button drawer-button--secondary" type="button" data-testid="drawer-back" @click="goBack">返回刚才的详情</button><button class="drawer-button drawer-button--primary" type="button" @click="requestClose">关闭详情</button></template>
    </footer>
  </dialog>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { gsap } from 'gsap'
import { demoAssessment, type DrawerKind, type DrawerSection } from '@/data/assessmentDemo'

const props = withDefaults(defineProps<{ open: boolean; kind: DrawerKind; section?: DrawerSection }>(), { section: undefined })
const emit = defineEmits<{ close: [] }>()
const uid = getCurrentInstance()!.uid
const titleId = `assessment-detail-title-${uid}`
const demoId = `assessment-detail-demo-${uid}`
const formId = `assessment-supplement-${uid}`
const dialog = ref<HTMLDialogElement | null>(null)
const heading = ref<HTMLHeadingElement | null>(null)
const body = ref<HTMLDivElement | null>(null)
const activeKind = ref<DrawerKind>(props.kind)
const entryKind = ref<DrawerKind>(props.kind)
const navigationStack = ref<DrawerKind[]>([])
const draft = reactive({ expected: '', reason: '' })
const savedDraft = ref<Readonly<{ expected: string; reason: string }> | null>(null)
const draftHasChanges = computed(() => savedDraft.value !== null &&
  (draft.expected !== savedDraft.value.expected || draft.reason !== savedDraft.value.reason))
const draftError = ref('')
const aiResponse = ref('')
const aiDecision = ref<'adopt' | 'decline' | null>(null)
let opener: HTMLElement | null = null
let animation: gsap.core.Tween | null = null
let savedOverflow: string | null = null
let closing = false
let mounted = false
let disposed = false
let notified = true
let pointerStartedOnBackdrop = false

const titles: Record<DrawerKind, string> = {
  submission: '这一步，怎么补？', receipt: '这次已经交上了', loop: '看看循环绘图的提交',
  requirements: '这次任务，要做什么？', privacy: '参与与隐私说明', contact: '有疑问，怎么问老师？',
  flow: '小测按什么顺序进行？', supplement: '补充30℃这一行',
}
const title = computed(() => titles[activeKind.value])
// Auxiliary views inherit the nearest task/research context from the real back stack.
const contextKind = computed(() => {
  const isAuxiliary = (kind: DrawerKind) => kind === 'privacy' || kind === 'contact'
  if (!isAuxiliary(activeKind.value)) return activeKind.value
  return [...navigationStack.value].reverse().find((kind) => !isAuxiliary(kind)) ?? entryKind.value
})
const isResearch = computed(() => ['receipt', 'privacy', 'flow'].includes(contextKind.value))
const context = computed(() => {
  if (contextKind.value === 'receipt') return `${demoAssessment.receipt.unit}单元 · ${demoAssessment.receipt.title}`
  if (['submission', 'supplement'].includes(contextKind.value)) return `${demoAssessment.task.title} · 我的记录`
  if (contextKind.value === 'loop') return '循环绘图检查 · 我的记录'
  if (contextKind.value === 'requirements') return '信息来源辨识 · 我的记录'
  return '老师安排的小测 · 流程帮助'
})

function reduceMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches }
function clearAnimation() {
  animation?.kill()
  animation = null
  if (dialog.value) gsap.set(dialog.value, { clearProps: 'transform,opacity' })
}

async function focusContent(section?: DrawerSection) {
  await nextTick()
  if (!dialog.value?.open || disposed) return
  if (body.value) body.value.scrollTop = 0
  heading.value?.focus({ preventScroll: true })
  if (!section || !body.value) return
  const target = body.value.querySelector<HTMLElement>(`[data-section="${section}"]`)
  if (!target) return
  if (target instanceof HTMLDetailsElement) target.open = true
  body.value.scrollTop += target.getBoundingClientRect().top - body.value.getBoundingClientRect().top - 12
}

function openDialog() {
  const element = dialog.value
  if (!mounted || !element || disposed) return
  if (element.open) { closing = false; clearAnimation(); return }
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  activeKind.value = props.kind
  entryKind.value = props.kind
  navigationStack.value = []
  closing = false
  notified = false
  savedOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  element.showModal()
  clearAnimation()
  if (!reduceMotion()) {
    animation = gsap.fromTo(element, { x: 24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.2, ease: 'power2.out', onComplete: clearAnimation })
  }
  void focusContent(props.section)
}

function requestClose() {
  const element = dialog.value
  if (!element?.open || closing || disposed) return
  closing = true
  clearAnimation()
  if (reduceMotion()) { element.close(); return }
  animation = gsap.to(element, { x: 24, opacity: 0, duration: 0.18, ease: 'power2.in', onComplete: () => element.close() })
}

function onNativeClose() {
  clearAnimation()
  closing = false
  if (savedOverflow !== null) { document.body.style.overflow = savedOverflow; savedOverflow = null }
  if (opener?.isConnected) opener.focus({ preventScroll: true })
  opener = null
  if (!notified && !disposed) { notified = true; emit('close') }
}

function isOutsideDialog(event: MouseEvent | PointerEvent) {
  if (event.target !== dialog.value || !dialog.value) return false
  const rect = dialog.value.getBoundingClientRect()
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom
}
function onBackdropPointerDown(event: PointerEvent) { pointerStartedOnBackdrop = isOutsideDialog(event) }
function onBackdropClick(event: MouseEvent) {
  if (pointerStartedOnBackdrop && isOutsideDialog(event)) requestClose()
  pointerStartedOnBackdrop = false
}

function showKind(kind: DrawerKind) {
  if (kind === activeKind.value) return
  const priorIndex = navigationStack.value.lastIndexOf(kind)
  if (priorIndex >= 0) navigationStack.value = navigationStack.value.slice(0, priorIndex)
  else navigationStack.value.push(activeKind.value)
  activeKind.value = kind
  void focusContent()
}
function goBack() {
  const target = navigationStack.value.pop()
  if (!target) { requestClose(); return }
  activeKind.value = target
  void focusContent()
}

function saveDraft() {
  if (!draft.expected.trim() || !draft.reason.trim()) {
    draftError.value = '请先写下预期结果和自己的理由，再暂存。'
    return
  }
  draftError.value = ''
  // An independent, immutable snapshot; editing the live draft cannot alter it.
  // In-memory only. Never mutate E01/E02, create v2, navigate, or call an API here.
  savedDraft.value = Object.freeze({ expected: draft.expected, reason: draft.reason })
}

function restoreSavedDraft() {
  if (!savedDraft.value) return
  draft.expected = savedDraft.value.expected
  draft.reason = savedDraft.value.reason
  draftError.value = ''
}

watch(() => props.open, (open) => { if (open) openDialog(); else requestClose() }, { flush: 'post' })
watch(() => props.kind, (kind) => {
  activeKind.value = kind
  entryKind.value = kind
  navigationStack.value = []
  if (props.open) void focusContent(props.section)
}, { flush: 'post' })
watch(() => props.section, (section) => { if (props.open) void focusContent(section) }, { flush: 'post' })
onMounted(() => { mounted = true; if (props.open) openDialog() })
onBeforeUnmount(() => {
  disposed = true
  clearAnimation()
  dialog.value?.close()
  if (savedOverflow !== null) { document.body.style.overflow = savedOverflow; savedOverflow = null }
  if (opener?.isConnected) opener.focus({ preventScroll: true })
})
</script>

<style scoped>
.assessment-drawer { --drawer-ink: #272247; --drawer-muted: #706a85; --drawer-purple: #6651bb; --drawer-line: #e5dfef; position: fixed; inset: 8px 8px 8px auto; width: min(650px, calc(100vw - 16px)); height: calc(100dvh - 16px); max-width: none; max-height: none; margin: 0; padding: 0; border: 1px solid #fefcff; border-radius: 26px; color: var(--drawer-ink); background: #fcfafb; box-shadow: -12px 0 50px #30254424; overflow: hidden; box-sizing: border-box; }
.assessment-drawer[open] { display: flex; flex-direction: column; }
.assessment-drawer:not([open]) { display: none; }
.assessment-drawer::backdrop { background: #24223860; backdrop-filter: blur(2px); }
.assessment-drawer *, .assessment-drawer *::before, .assessment-drawer *::after { box-sizing: border-box; }
.drawer-header { flex: none; padding: 21px 26px 15px; border-bottom: 1px solid var(--drawer-line); background: #fcfafbf5; }
.drawer-header__line { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
.drawer-context { margin: 0; color: #5e567c; font-size: 12px; font-weight: 600; }
.drawer-close { flex: none; min-height: 44px; padding: 4px 0 4px 10px; display: flex; align-items: center; gap: 10px; border: 0; background: transparent; color: var(--drawer-ink); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; }
.drawer-close span { font-size: 25px; line-height: 1; color: #7e719d; }
.drawer-header h2 { margin: 3px 0 12px; font-size: clamp(23px, 2.4vw, 30px); line-height: 1.3; letter-spacing: -.02em; }
.drawer-header h2:focus { outline: none; }
.drawer-demo { display: inline-block; margin: 0; padding: 4px 9px; border: 1px solid #efdbc6; border-radius: 9px; color: #8c512c; background: #fff7ee; font-size: 12px; line-height: 1.5; }
.drawer-body { flex: 1 1 auto; min-height: 0; padding: 22px 26px; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; display: flex; flex-direction: column; gap: 20px; }
.drawer-body > * { flex-shrink: 0; }
.drawer-body h3 { margin: 0 0 10px; font-size: 17px; line-height: 1.5; font-weight: 750; }
.drawer-body h4 { margin: 12px 0 6px; font-size: 14px; line-height: 1.5; }
.drawer-body p { margin: 7px 0; font-size: 14px; line-height: 1.7; }
.drawer-body small { color: var(--drawer-muted); font-size: 12px; line-height: 1.65; }
.teacher-feedback { padding-bottom: 18px; border-bottom: 1px solid var(--drawer-line); }
.teacher-feedback h3 { display: flex; align-items: center; gap: 8px; }
.teacher-feedback h3 img { width: 30px; height: 30px; object-fit: contain; }
.teacher-feedback blockquote { margin: 6px 0 9px; font-size: 16px; line-height: 1.7; font-weight: 600; }
.section-heading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 5px 12px; margin-bottom: 12px; }
.section-heading h3 { margin: 0; }
.section-heading span { color: var(--drawer-muted); font-size: 12px; }
.original-table-wrap { overflow: hidden; border: 1px solid #dcd6e9; border-radius: 10px; }
.original-table { width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.55; table-layout: fixed; }
.original-table th, .original-table td { padding: 12px 9px; text-align: center; overflow-wrap: anywhere; border-bottom: 1px solid #e5dfed; border-right: 1px solid #e5dfed; }
.original-table th:first-child { width: 24%; }
.original-table thead { background: #f0edf5; }
.original-table tbody th { font-weight: 500; }
.original-table tr:last-child td, .original-table tbody tr:last-child th { border-bottom: 0; }
.original-table td:last-child, .original-table th:last-child { border-right: 0; }
.drawer-body .system-hint { color: var(--drawer-muted); font-size: 12px; line-height: 1.7; }
.drawer-disclosure { border: 1px solid var(--drawer-line); border-radius: 14px; background: #fffdfd; overflow: hidden; box-shadow: 0 3px 8px #3e2c5010; }
.drawer-disclosure summary, .ai-response summary { position: relative; padding: 15px 40px 15px 16px; list-style: none; cursor: pointer; font-size: 15px; font-weight: 700; line-height: 1.5; }
.drawer-disclosure summary::-webkit-details-marker, .ai-response summary::-webkit-details-marker { display: none; }
.drawer-disclosure summary::after, .ai-response summary::after { content: ''; position: absolute; right: 20px; top: 21px; width: 9px; height: 9px; border-right: 2px solid #82729f; border-bottom: 2px solid #82729f; transform: rotate(45deg); }
.drawer-disclosure[open] > summary::after, .ai-response[open] > summary::after { transform: rotate(225deg); top: 25px; }
.drawer-disclosure[open] > summary { border-bottom: 1px solid #eee8f4; }
.disclosure-content { padding: 6px 16px 16px; }
.disclosure-content > :first-child { margin-top: 8px; }
.student-original { margin: 0; padding: 16px; font-size: 14px; line-height: 1.8; }
.rubric-list, .plain-list, .flow-list { margin: 8px 0; padding-left: 23px; font-size: 14px; line-height: 1.8; }
.rubric-list li, .plain-list li, .flow-list li { margin-bottom: 13px; padding-left: 2px; }
.rubric-list p, .flow-list p { margin: 2px 0 0; }
.ai-feedback { display: flex; align-items: flex-start; gap: 12px; padding: 17px 15px; border: 1px solid #e8e0fa; border-radius: 16px; background: #f1edf9; }
.ai-avatar { position: relative; flex: none; width: 54px; height: 62px; }
.ai-avatar img { width: 54px; height: 58px; object-fit: contain; }
.ai-avatar span { position: absolute; right: -3px; top: -4px; padding: 3px 4px; border-radius: 8px; background: #7455cc; color: #fff; font-size: 11px; font-weight: 700; }
.ai-feedback__content { min-width: 0; flex: 1; }
.ai-feedback__content h3 { color: #5d47ad; font-size: 14px; }
.ai-feedback__content p { margin: 4px 0; }
.ai-feedback__content .ai-scope { color: #76698d; font-size: 12px; }
.ai-response { margin-top: 10px; border: 1px solid #b6a9da; border-radius: 10px; background: #fffaff; }
.ai-response summary { min-height: 44px; padding-top: 10px; padding-bottom: 10px; color: #624aae; font-size: 14px; }
.ai-response summary::after { top: 15px; }
.ai-response[open] > summary::after { top: 19px; }
.ai-response label { display: block; font-size: 13px; line-height: 1.7; }
.provenance-list { display: grid; grid-template-columns: 108px minmax(0, 1fr); gap: 11px 13px; margin: 0; padding: 16px; font-size: 12px; line-height: 1.8; }
.provenance-list dt { color: #726682; }
.provenance-list dd { margin: 0; overflow-wrap: anywhere; }
.drawer-callout { padding: 15px 16px; border: 1px solid #e5dff2; border-radius: 14px; background: #f4f0fa; }
.drawer-body .drawer-callout p:first-child { margin-top: 0; }
.supplement-form { display: grid; gap: 10px; }
.supplement-form label { font-size: 15px; font-weight: 700; line-height: 1.6; }
.supplement-form input, .supplement-form textarea, .ai-response textarea { display: block; width: 100%; min-width: 0; min-height: 44px; padding: 11px 12px; border: 1px solid #bdb2d4; border-radius: 10px; background: #fffefe; color: var(--drawer-ink); font: inherit; font-size: 15px; line-height: 1.7; }
.supplement-form textarea, .ai-response textarea { resize: vertical; max-height: 260px; }
.ai-response textarea { margin-top: 8px; }
.ai-decisions { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 12px; }
.ai-decisions .drawer-button { min-height: 44px; padding: 7px 10px; font-size: 13px; }
.ai-decisions .drawer-button[aria-pressed="true"] { border-color: #6d54ba; color: #4e358b; background: #e4daf5; box-shadow: inset 0 0 0 1px #6d54ba; }
.draft-status { padding: 11px 13px; border: 1px solid #c9ddce; border-radius: 10px; background: #f0f8f0; color: #386442; }
.drawer-body .draft-error { color: #9d412b; font-weight: 600; }
.receipt-intro { display: flex; align-items: center; gap: 20px; padding: 4px 3px; }
.receipt-intro img { width: 84px; height: 88px; object-fit: contain; }
.receipt-intro h3 { font-size: 21px; margin-bottom: 4px; }
.receipt-intro p { margin: 3px 0; }
.release-steps { display: grid; grid-template-columns: repeat(3, 1fr); margin: 0; padding: 18px 7px 15px; list-style: none; border: 1px solid var(--drawer-line); border-radius: 16px; background: #fffdfd; }
.release-steps li { position: relative; display: flex; align-items: center; flex-direction: column; gap: 10px; font-size: 14px; }
.release-steps li:not(:last-child)::after { content: ''; position: absolute; top: 16px; left: calc(50% + 23px); width: calc(100% - 46px); border-top: 2px dashed #ddd0f7; }
.release-steps li > span { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border: 1px solid #c5b5e8; border-radius: 50%; background: #f5f0fd; }
.release-steps .release-steps__done > span { background: linear-gradient(#ac99e9, #7860c8); color: #fff; font-size: 23px; box-shadow: inset 0 2px 3px #ded0ff; }
.release-rules ol { padding: 5px 0 0 22px; font-size: 14px; line-height: 1.8; }
.release-rules li { margin-bottom: 9px; padding-left: 3px; }
.drawer-empty { padding: 13px 8px; text-align: center; }
.drawer-empty > img { width: 92px; height: 92px; object-fit: contain; margin-bottom: 10px; }
.drawer-footer { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 16px 22px 15px; border-top: 1px solid var(--drawer-line); background: #fffdfd; box-shadow: 0 -5px 18px #51416d06; }
.drawer-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 48px; padding: 11px 16px; border: 1px solid #8974c5; border-radius: 12px; font: inherit; font-size: 15px; line-height: 1.5; font-weight: 700; text-align: center; cursor: pointer; text-decoration: none; }
.drawer-footer > .drawer-button { flex: 1 1 160px; }
.drawer-button--primary { color: #fff; border-color: #6e53bf; background: linear-gradient(#8972d5, #674bbb); box-shadow: inset 0 1px 1px #bdabea, 0 3px 4px #69518c26; }
.drawer-button--secondary { color: #634ca9; background: #fffbff; }
.drawer-button:hover { filter: brightness(.97); }
.drawer-footer > p { width: 100%; margin: 1px 0 0; text-align: center; color: var(--drawer-muted); font-size: 12px; line-height: 1.5; }
.assessment-drawer button:focus-visible, .assessment-drawer summary:focus-visible, .assessment-drawer input:focus-visible, .assessment-drawer textarea:focus-visible { outline: 3px solid #b19ce7; outline-offset: 3px; }
.drawer-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
@media (max-width: 520px) { .assessment-drawer { border-radius: 20px; }.drawer-header { padding: 14px 17px 12px; }.drawer-header h2 { font-size: 23px; }.drawer-context { font-size: 11px; }.drawer-body { padding: 18px 15px; gap: 17px; }.drawer-footer { padding: 13px 14px; gap: 8px; }.drawer-footer > .drawer-button { flex-basis: 135px; padding-inline: 9px; font-size: 14px; }.original-table { font-size: 13px; }.original-table th, .original-table td { padding: 11px 6px; }.ai-feedback { gap: 9px; padding: 15px 12px; }.ai-avatar { width: 43px; height: 54px; }.ai-avatar img { width: 43px; height: 51px; }.provenance-list { grid-template-columns: 1fr; gap: 4px; }.provenance-list dd { margin-bottom: 9px; }.receipt-intro { gap: 12px; }.receipt-intro img { width: 66px; height: 74px; }.receipt-intro h3 { font-size: 19px; } }
@media (max-height: 550px) { .drawer-header { padding-block: 8px; }.drawer-header h2 { margin-block: 0 6px; font-size: 22px; }.drawer-close { min-height: 44px; }.drawer-footer { padding-block: 8px; }.drawer-body { padding-block: 14px; } }
@media (prefers-reduced-motion: reduce) { .assessment-drawer { scroll-behavior: auto; } }
</style>
