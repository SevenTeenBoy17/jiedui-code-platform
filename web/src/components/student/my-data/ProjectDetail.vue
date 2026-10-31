<!-- @copyBudget 180 V3 approved wide test-original screen; separately reviewed in review-integration.md. No global threshold changed. -->
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import { asset } from '@/assets/assets'
import { request } from '@/api/http'
import { assetRoot, demoData, languageLabel, previewFor, type DataProject, type ProjectOriginal } from './model'

const props = withDefaults(defineProps<{ project: DataProject; demo: boolean; initialTarget?: string }>(),{initialTarget:''})
const emit = defineEmits<{ close: []; workshop: [project: DataProject] }>()
type DetailTab = 'preview' | 'tests' | 'receipt' | 'sources'
const tabs: Array<{ id: DetailTab; label: string }> = [
  { id: 'preview', label: '作品预览' }, { id: 'tests', label: '测试记录' }, { id: 'receipt', label: '提交回执' },
  { id: 'sources', label: '资料来源' },
]
const tab = ref<DetailTab>('preview')
const original = ref<ProjectOriginal | null>(null)
const loading = ref(false)
const error = ref('')
let controller: AbortController | undefined
let sequence = 0
const thumbnail = computed(() => props.demo ? previewFor(props.project) : null)
const tests = computed(() => props.demo ? props.project.tests : undefined)
const cases = computed(() => tests.value?.cases ?? [])
const submitted = computed(() => props.demo && props.project.submission_state === 'submitted' && !!props.project.submission_id)
const hasGuessCases = computed(() => props.demo && props.project.id === 'DEMO-P02' && cases.value.length > 0)
const displayedVersion = computed(() => original.value?.latest?.version_no ?? props.project.version)
const needsWork = computed(() => tests.value ? Math.max(0, tests.value.total - tests.value.passed) : 0)
const sourceNodes = computed(() => props.demo && props.project.id === demoData.trace.project ? demoData.trace.nodes : [])
function applyTarget(){tab.value=props.initialTarget.startsWith('source:')?'sources':tabs.some(t=>t.id===props.initialTarget)?props.initialTarget as DetailTab:props.demo&&props.project.tests?'tests':'preview'}
watch(()=>props.initialTarget,applyTarget)

async function loadOriginal() {
  controller?.abort()
  const current = ++sequence
  original.value = null
  error.value = ''
  loading.value = false
  if (props.demo) return
  controller = new AbortController()
  loading.value = true
  try {
    const result = await request<ProjectOriginal>(`/api/projects/${encodeURIComponent(String(props.project.id))}`, { signal: controller.signal })
    if (current === sequence) original.value = result
  } catch (cause) {
    if (current === sequence) error.value = cause instanceof Error ? cause.message : '暂时读不到这份作品，请稍后重试。'
  } finally {
    if (current === sequence) loading.value = false
  }
}
watch(() => [props.project.id, props.demo], () => {
  applyTarget()
  void loadOriginal()
}, { immediate: true })
onBeforeUnmount(() => { sequence++; controller?.abort() })

function moveTab(event: KeyboardEvent, index: number) {
  let next: number
  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
  else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = tabs.length - 1
  else return
  event.preventDefault()
  tab.value = tabs[next].id
  const buttons = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  buttons?.[next]?.focus()
}
</script>

<template>
  <div class="project-detail">
    <header class="detail-heading">
      <img v-if="thumbnail" class="project-thumbnail" :src="thumbnail" alt="" width="160" height="90" />
      <div v-else class="project-file" aria-hidden="true"><img :src="assetRoot + 'document.png'" alt="" width="72" height="72" /></div>
      <div class="heading-copy">
        <h2 id="project-detail-title">{{ project.title }}</h2>
        <p>{{ languageLabel(project.language) }} · 作品 v{{ displayedVersion }} · {{ submitted ? '已完成提交' : demo ? '创作中' : '已保存' }}</p>
        <p class="fine-print"><BaseIcon name="help-circle" />{{ submitted ? '已完成提交，不代表每个测试都通过。' : demo ? '这是演示作品，未连接真实账号。' : '只读查看已保存作品；提交状态暂未提供。' }}</p>
      </div>
      <span class="mode-badge">{{ demo ? '演示数据' : '我的原件' }}</span>
    </header>

    <div class="detail-tabs" role="tablist" aria-label="作品资料">
      <button v-for="(item, index) in tabs" :id="'project-tab-' + item.id" :key="item.id" type="button" role="tab"
        :aria-selected="tab === item.id" :aria-controls="'project-panel-' + item.id" :tabindex="tab === item.id ? 0 : -1"
        @click="tab = item.id" @keydown="moveTab($event, index)">{{ item.label }}</button>
    </div>

    <section v-if="tab === 'tests'" id="project-panel-tests" role="tabpanel" aria-labelledby="project-tab-tests" tabindex="0" class="detail-panel">
      <p class="scope-label">仅本作品 <template v-if="demo && project.submission_id">· 本次提交 {{ project.submission_id }}</template><template v-if="tests?.record_id"> · 测试记录 {{ tests.record_id }}</template></p>
      <div class="detail-columns">
        <section class="test-original">
          <template v-if="tests">
            <h3>这次测试，<span class="passed">{{ tests.passed }} 项通过</span><template v-if="needsWork">，<span class="needs-work">{{ needsWork }} 项待改进</span></template></h3>
            <ol v-if="cases.length" class="case-path" aria-label="本次用例结果">
              <li v-for="(test, index) in cases" :key="index" :class="test.result === 'pass' ? 'passed' : 'needs-work'">
                <span class="result-medallion"><BaseIcon :name="test.result === 'pass' ? 'check' : 'wrench'" :size="32" /></span>
                <span class="input-label">输入 {{ test.input }}</span><strong>{{ test.result === 'pass' ? '通过' : '待改进' }}</strong>
              </li>
            </ol>
            <p v-if="hasGuessCases" class="fine-print">示例：目标 7，输入范围 1–10。</p>
            <div v-if="cases.length" class="test-table-wrap" tabindex="0" role="region" aria-label="测试原件表格，可横向滚动">
              <table class="test-table"><caption class="sr-only">{{ project.title }}测试原件</caption>
                <thead><tr><th scope="col">测试输入</th><th scope="col">预期结果</th><th scope="col">实际输出</th><th scope="col">结果</th></tr></thead>
                <tbody><tr v-for="(test, index) in cases" :key="index" :class="{ 'case-needs-work': test.result !== 'pass' }">
                  <th scope="row">{{ test.input }}</th><td>{{ test.expected }}</td><td>{{ test.actual }}</td>
                  <td :class="test.result === 'pass' ? 'passed' : 'needs-work'"><span class="result-label"><BaseIcon :name="test.result === 'pass' ? 'check' : 'wrench'" :size="18" />{{ test.result === 'pass' ? '通过' : '待改进' }}</span></td>
                </tr></tbody>
              </table>
            </div>
            <div v-else class="empty-original"><img :src="assetRoot + 'clipboard.png'" alt="" width="64" height="64" /><h4>已有汇总，还缺用例原件</h4><p>演示记录只有 {{ tests.passed }}/{{ tests.total }} 的汇总，没有每项测试的输入和输出。这里不会补写测试内容。</p></div>
          </template>
          <div v-else class="empty-original"><img :src="assetRoot + 'clipboard.png'" alt="" width="64" height="64" /><h3>{{ demo ? '还没有测试记录' : '暂时无法查看测试原件' }}</h3><p>{{ demo ? '先回工坊运行几个不同的输入，再保存实际看到的结果。' : '当前作品接口没有提供测试数据，不能据此判断你没有做过测试。' }}</p></div>
          <details class="source-details"><summary><BaseIcon name="file-text" /><span>查看原件来源与版本</span><small>{{ project.id }} · v{{ displayedVersion }}</small></summary>
            <dl><div><dt>作品编号</dt><dd>{{ project.id }}</dd></div><div><dt>作品版本</dt><dd>v{{ displayedVersion }}</dd></div>
              <div><dt>测试原件</dt><dd>{{ tests?.record_id ? tests.record_id + (tests.record_version != null ? ' · v' + tests.record_version : ' · 版本未提供') : '未提供原件编号' }}</dd></div>
              <div><dt>数据来源</dt><dd>{{ demo ? '固定演示样例，不是真实学生记录' : '当前账号的已保存作品接口；测试原件尚未提供' }}</dd></div>
            </dl>
          </details>
        </section>
        <aside class="detail-support" aria-label="说明与下一步">
          <section class="support-card ai-card"><div class="support-title"><img :src="asset('ip_panda_check')" alt="" width="56" height="56" /><h3>{{ demo ? 'AI 导师说明 · 演示' : 'AI 说明' }}</h3></div>
            <template v-if="hasGuessCases"><h4>输入 11，程序没有提醒超出范围。</h4><p>先回看输入约束，再尝试修改。</p></template>
            <template v-else><h4>{{ demo ? '先找到实际记录，再看哪里需要补充。' : '当前未调用 AI' }}</h4><p>{{ demo ? '这里没有足够的用例原件，不会根据汇总数字判断你的能力。' : '当前没有可供解读的测试原件，不会自动生成评价。' }}</p></template>
            <p class="fine-print">{{ demo ? '这是演示说明，不是教师评价，也不代写答案。' : '读取作品不代表已把内容发送给 AI。' }}</p>
          </section>
          <section class="support-card"><div class="support-title"><h3>教师反馈</h3><span class="waiting-badge">{{ demo ? '等待发布' : '暂未提供' }}</span></div><p>{{ demo ? '发布后，你可以对照原件再试一次。' : '当前接口未提供教师反馈，不能判断老师是否已评价。' }}</p></section>
          <section class="support-card next-step"><h3>下一步</h3><p><img :src="assetRoot + 'clipboard.png'" alt="" width="30" height="30" />{{ hasGuessCases ? '回工坊检查输入范围' : '回工坊继续查看和补充作品' }}</p><button type="button" class="primary-button" :disabled="demo" @click="emit('workshop', project)">{{demo?'演示作品 · 不支持编辑':'回工坊继续修改'}}<BaseIcon name="arrow-right" /></button><button type="button" class="secondary-button" @click="emit('close')"><BaseIcon name="arrow-left" />返回数据总览</button></section>
        </aside>
      </div>
      <p class="detail-footnote"><BaseIcon name="help-circle" />本次用例结果，不代表能力水平。</p>
    </section>

    <section v-else-if="tab === 'preview'" id="project-panel-preview" role="tabpanel" aria-labelledby="project-tab-preview" tabindex="0" class="detail-panel preview-panel">
      <p class="scope-label">作品 v{{ displayedVersion }} · 只读预览</p>
      <template v-if="demo"><figure v-if="thumbnail" class="preview-art"><img :src="thumbnail" :alt="project.title + '的演示封面'" /><figcaption>演示封面图，不是程序实时运行结果。</figcaption></figure><div v-else class="empty-original"><img :src="assetRoot + 'document.png'" alt="" width="72" height="72" /><h3>这份演示作品还没有预览图</h3></div><p class="preview-note">演示资料未提供代码原文，这里不会自动生成或补写程序。</p></template>
      <template v-else><p v-if="loading" class="load-message" role="status">正在读取你保存的作品…</p><div v-else-if="error" class="error-message" role="alert"><p>{{ error }}</p><button type="button" class="secondary-button" @click="loadOriginal">重新读取</button></div><template v-else-if="original?.latest"><pre class="original-code" tabindex="0" aria-label="已保存代码原文">{{ original.latest.code }}</pre><p v-if="!original.latest.code" class="scope-label">这个保存版本的代码为空。</p><details class="source-details"><summary><BaseIcon name="file-text" />来源与版本信息</summary><dl><div><dt>作品编号</dt><dd>{{ original.id }}</dd></div><div><dt>保存版本</dt><dd>v{{ original.latest.version_no }}</dd></div><div><dt>原件编号</dt><dd>{{ original.latest.source_id ?? '当前接口未提供' }}</dd></div><div><dt>原件版本</dt><dd>{{ original.latest.source_version ?? '当前接口未提供' }}</dd></div></dl></details></template><div v-else class="empty-original"><h3>没有可预览的保存版本</h3><p>当前接口未返回代码原件，请回工坊确认保存情况。</p></div></template>
      <button type="button" class="primary-button preview-action" :disabled="demo" @click="emit('workshop', project)">{{demo?'演示作品 · 不支持编辑':'回工坊查看作品'}}<BaseIcon name="arrow-right" /></button>
    </section>

    <section v-else-if="tab==='receipt'" id="project-panel-receipt" role="tabpanel" aria-labelledby="project-tab-receipt" tabindex="0" class="detail-panel receipt-panel">
      <img :src="assetRoot + 'document.png'" alt="" width="76" height="76" />
      <h3>{{ submitted ? '这份作品已完成提交' : demo ? '还没有提交回执' : '当前还无法查看提交回执' }}</h3>
      <template v-if="submitted"><p>这张演示回执对应当前作品的保存版本。</p><dl class="receipt-data"><div><dt>提交编号</dt><dd>{{ project.submission_id }}</dd></div><div><dt>作品与版本</dt><dd>{{ project.title }} · v{{ project.version }}</dd></div><div><dt>对应作品编号</dt><dd>{{ project.id }}</dd></div></dl><p class="receipt-notice"><BaseIcon name="help-circle" />完成提交不等于测试全部通过，也不代表老师已确认或能力达标。</p></template>
      <p v-else>{{ demo ? '可以继续完善草稿。这里不会把保存版本当作已经提交。' : '当前作品接口未提供提交记录。已保存、已提交、测试通过和教师确认是不同状态。' }}</p>
      <button type="button" class="primary-button" :disabled="demo" @click="emit('workshop', project)">{{demo?'演示作品 · 不支持编辑':'回工坊查看作品'}}<BaseIcon name="arrow-right" /></button>
    </section>
    <section v-else id="project-panel-sources" role="tabpanel" aria-labelledby="project-tab-sources" tabindex="0" class="detail-panel">
      <h3>{{ project.title }} · 资料来源</h3>
      <p class="scope-label">只显示当前作品的关联，不跨任务拼接。</p>
      <div v-if="sourceNodes.length" class="source-grid"><section v-for="node in sourceNodes" :key="node.evidence_id" class="support-card" :class="{'source-selected':initialTarget==='source:'+node.evidence_id}"><h4>{{node.label}} · v{{node.version}}</h4><p>{{node.evidence_id}}</p><p>已登记编号，尚未提供原文。</p><button v-if="node.type==='test'" class="secondary-button" @click="tab='tests'">查看现有测试汇总</button></section></div>
      <div v-else class="source-grid"><section class="support-card"><h4>作品版本</h4><p>{{project.id}} · v{{displayedVersion}}</p><p>{{demo?'演示作品未提供代码原文':'只读查看当前已保存版本'}}</p><button class="secondary-button" @click="tab='preview'">查看作品预览</button></section><section class="support-card"><h4>测试原件</h4><p>{{tests?.record_id??'当前接口未提供'}}</p><button class="secondary-button" @click="tab='tests'">查看测试记录</button></section></div>
    </section>
  </div>
</template>

<style scoped>
.project-detail .fine-print .ico{display:inline-block;vertical-align:middle}
.project-detail { --detail-ink: #203558; --detail-blue: #245cd6; --detail-muted: #536985; --detail-border: #dce6f4; color: var(--detail-ink); font-size: 15px; line-height: 1.65; min-width: 0; }
.project-detail h2, .project-detail h3, .project-detail h4, .project-detail p, .project-detail figure { margin: 0; }
.project-detail h2 { font-size: clamp(22px, 2vw, 28px); line-height: 1.3; }
.project-detail h3 { font-size: 19px; line-height: 1.5; }
.project-detail h4 { font-size: 18px; line-height: 1.65; }
.detail-heading { display: flex; align-items: center; gap: 20px; padding: 4px 6px 22px; }
.project-thumbnail { width: 150px; height: 86px; border-radius: 12px; object-fit: cover; flex: none; }
.support-title > img { object-fit: contain; flex: none; }
.project-file { width: 90px; height: 86px; background: #f0f6ff; display: grid; place-items: center; border-radius: 16px; flex: none; }
.heading-copy { min-width: 0; flex: 1; }.heading-copy h2 { overflow-wrap: anywhere; }.heading-copy > p { margin-top: 5px; }
.project-detail .fine-print, .scope-label { color: var(--detail-muted); font-size: 13px; }.fine-print .ico { margin-right: 6px; }
.mode-badge, .waiting-badge { padding: 4px 11px; background: #e4f4f4; color: #176a6c; border-radius: 9px; white-space: nowrap; font-size: 13px; }.mode-badge { align-self: flex-start; margin-right: 36px; }.waiting-badge { background: #eef1fa; color: #51627f; }
.detail-tabs { display: grid; grid-template-columns: repeat(4, 1fr); width: min(100%, 650px); background: #f5f8fe; border: 1px solid var(--detail-border); border-radius: 13px; padding: 3px; margin: 0 6px 18px; }
.source-grid {display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:15px}.source-selected{outline:2px solid #3683da;outline-offset:2px}.project-detail button:disabled{opacity:.6;cursor:not-allowed;transform:none}
.project-detail button { min-height: 44px; cursor: pointer; font: inherit; border-radius: 10px; border: 1px solid transparent; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
.detail-tabs button { background: transparent; color: #425d84; border-radius: 10px; padding: 6px 12px; }.detail-tabs button[aria-selected="true"] { background: var(--detail-blue); color: #fff; box-shadow: 0 3px 8px #245cd62b; }
.project-detail button:focus-visible, .project-detail summary:focus-visible, .project-detail [tabindex="0"]:focus-visible { outline: 3px solid #4478d4; outline-offset: 3px; }
.detail-panel { background: #fbfdff; border: 1px solid var(--detail-border); border-radius: 19px; padding: 18px; }.project-detail .scope-label { margin: 0 0 12px; }
.detail-columns { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(290px, 1fr); gap: 20px; align-items: start; }.test-original { min-width: 0; background: #fff; border: 1px solid var(--detail-border); border-radius: 16px; padding: 20px; }
.passed { color: #087f6d; }.needs-work { color: #a9570c; }.case-path { display: flex; justify-content: space-around; list-style: none; padding: 24px 0 18px; margin: 0; }.case-path li { display: grid; justify-items: center; align-content: start; flex: 1; position: relative; line-height: 1.6; gap: 1px; }.case-path li + li::before { content: ''; position: absolute; top: 34px; height: 2px; width: calc(100% - 78px); right: calc(50% + 39px); background: repeating-linear-gradient(90deg, #c6d5e9 0 9px, transparent 9px 12px); }
.result-medallion { display: grid; place-items: center; width: 68px; height: 68px; border-radius: 50%; margin-bottom: 5px; background: linear-gradient(145deg, #65d5bd, #149b81); color: #fff; border: 5px solid #c9f0e7; box-shadow: inset 0 1px 2px #ffffffb3, 0 5px 9px #21887718; }.needs-work .result-medallion { background: linear-gradient(145deg, #ffc660, #e39828); border-color: #ffedc7; }.input-label { color: var(--detail-ink); }
.test-table-wrap { overflow-x: auto; border: 1px solid #cfdbef; border-radius: 12px; margin-top: 7px; }.test-table { width: 100%; min-width: 420px; border-collapse: collapse; text-align: center; font-size: 15px; }.test-table th, .test-table td { padding: 10px 8px; border-bottom: 1px solid #e4eaf3; }.test-table th { font-weight: 500; }.test-table thead { background: #f1f5fd; }.test-table tbody tr:last-child > * { border-bottom: 0; }.case-needs-work { background: #fff8ed; }.result-label { display: inline-flex; gap: 6px; align-items: center; white-space: nowrap; }
.source-details { margin-top: 18px; background: #f4f8fe; border: 1px solid #dae5f5; border-radius: 11px; }.source-details summary { cursor: pointer; padding: 11px 13px; min-height: 44px; font-weight: 500; }.source-details summary .ico { margin-right: 8px; }.source-details summary small { display: block; margin-left: 25px; color: var(--detail-muted); font-weight: 400; overflow-wrap: anywhere; }.source-details dl { padding: 0 15px 13px; margin: 0; }.source-details dl > div, .receipt-data > div { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 12px; padding-top: 7px; }.source-details dt, .receipt-data dt { color: var(--detail-muted); }.source-details dd, .receipt-data dd { margin: 0; overflow-wrap: anywhere; }
.detail-support { display: grid; gap: 15px; }.support-card { padding: 20px; border: 1px solid var(--detail-border); background: #fff; border-radius: 16px; box-shadow: 0 3px 7px #2c528210; }.support-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }.ai-card .support-title { justify-content: flex-start; }.support-card p { color: var(--detail-muted); }.ai-card h4 { margin-bottom: 10px; }.ai-card .fine-print { margin-top: 12px; font-size: 12px; }.next-step p { display: flex; align-items: center; gap: 10px; margin: 8px 0 13px; }.next-step button { width: 100%; }.next-step button + button { margin-top: 8px; }
.primary-button { background: var(--detail-blue); color: white; padding: 8px 16px; }.secondary-button { background: #fff; border-color: #b8cbee !important; color: #2458b0; padding: 8px 16px; }.primary-button:hover { background: #174dbd; }.secondary-button:hover { background: #f0f5ff; }.project-detail .detail-footnote { display: flex; align-items: flex-start; gap: 8px; color: var(--detail-muted); font-size: 13px; margin-top: 16px; }.detail-footnote .ico { margin-top: 3px; }
.empty-original { display: grid; justify-items: center; text-align: center; gap: 12px; padding: 34px 15px; color: var(--detail-muted); }.empty-original h3, .empty-original h4 { color: var(--detail-ink); }.empty-original p { max-width: 440px; }
.preview-panel { padding: 22px; }.preview-art { max-width: 650px; margin: 0 auto !important; }.preview-art img { width: 100%; max-height: 290px; object-fit: contain; border-radius: 15px; background: #edf5fc; }.preview-art figcaption { font-size: 13px; color: var(--detail-muted); text-align: center; margin-top: 8px; }.project-detail .preview-note { margin: 18px auto; text-align: center; color: var(--detail-muted); }.preview-action { display: flex !important; margin: 20px auto 0; }.original-code { margin: 0 0 18px; max-height: 390px; overflow: auto; padding: 20px; border: 1px solid var(--detail-border); border-radius: 13px; background: #f2f6fc; color: #28486f; font: 14px/1.8 Consolas, monospace; tab-size: 4; white-space: pre; }.load-message { padding: 55px 20px; text-align: center; }.error-message { background: #fff4e5; padding: 20px; border-radius: 12px; }.error-message button { margin-top: 15px; }
.receipt-panel { text-align: center; display: grid; justify-items: center; gap: 16px; padding: 30px; }.receipt-data { text-align: left; background: #f0f6fd; border-radius: 13px; padding: 15px 22px; width: min(100%, 560px); margin: 0; }.receipt-notice { color: var(--detail-muted); max-width: 580px; }.receipt-notice .ico { margin-right: 5px; }.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
@media (max-width: 1050px) { .detail-columns { grid-template-columns: minmax(0, 1fr); }.detail-support { grid-template-columns: repeat(2, minmax(0, 1fr)); }.ai-card { grid-column: 1 / -1; }.detail-heading { gap: 14px; }.mode-badge { margin-right: 18px; } }
@media (max-width: 640px) { .project-detail { font-size: 14px; }.detail-heading { flex-wrap: wrap; align-items: flex-start; padding: 2px 0 18px; gap: 12px; }.project-thumbnail { width: 105px; height: 66px; }.project-file { width: 64px; height: 64px; }.project-file img { width: 50px; height: 50px; }.heading-copy { flex-basis: calc(100% - 120px); }.heading-copy h2 { font-size: 21px; }.heading-copy > p { font-size: 13px; }.mode-badge { margin: 0; }.detail-tabs { margin-inline: 0; }.detail-tabs button { padding: 6px; font-size: 14px; }.detail-panel { padding: 12px; }.test-original, .support-card { padding: 15px; }.project-detail h3 { font-size: 18px; }.detail-support { grid-template-columns: minmax(0, 1fr); }.ai-card { grid-column: auto; }.result-medallion { width: 56px; height: 56px; border-width: 4px; }.case-path li + li::before { top: 28px; width: calc(100% - 66px); right: calc(50% + 33px); }.case-path { font-size: 13px; }.source-details dl > div, .receipt-data > div { grid-template-columns: 76px minmax(0, 1fr); gap: 8px; }.receipt-panel { padding: 20px 14px; } }
@media (prefers-reduced-motion: no-preference) { .project-detail button { transition: background-color 160ms, box-shadow 160ms; }.project-detail button:active { transform: translateY(1px); } }
</style>
