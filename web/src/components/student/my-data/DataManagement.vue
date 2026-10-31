<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { complianceApi, type MyData } from '@/api/compliance'

type Section = 'use' | 'manage'
type Action = 'export' | 'withdraw' | 'erase'

const props = withDefaults(defineProps<{
  demo: boolean
  summary: MyData | null
  initialSection?: Section
}>(), { initialSection: 'use' })

const emit = defineEmits<{ updated: [] }>()
const section = ref<Section>(props.initialSection)
const selected = ref<Action | null>(null)
const pending = ref(false)
const acknowledged = ref(false)
const message = ref('')
const error = ref('')
const root = ref<HTMLElement | null>(null)
const confirmPanel = ref<HTMLElement | null>(null)
const lastAction = ref<Action | null>(null)
const revokeTimers = new Map<ReturnType<typeof setTimeout>, string>()

const actions: Record<Action, { title: string; short: string; explanation: string; confirm: string; demoResult: string }> = {
  export: {
    title: '下载我的资料',
    short: '保留一份自己的完整副本。',
    explanation: '下载的是完整 JSON 文件，包含你的原始资料，没有隐藏姓名等个人信息。请和家长一起妥善保存，不要随意转发。',
    confirm: '确认下载 JSON',
    demoResult: '未执行真实操作。真实账号确认后会下载完整 JSON，这里没有下载或读取你的个人资料。',
  },
  withdraw: {
    title: '撤回使用同意',
    short: '停用 AI，并退出研究分析。',
    explanation: '撤回后，AI 功能停止，你的数据不再进入研究分析。已有记录仍会保存，不会被删除。若想删除，需要另外申请。',
    confirm: '确认撤回同意',
    demoResult: '未执行真实操作。这里只演示撤回说明，没有改变你的 AI 使用或研究参与状态，也没有删除资料。',
  },
  erase: {
    title: '申请删除资料',
    short: '先由老师与你和监护人确认。',
    explanation: '这里只提交删除申请，不会立刻删除。老师会与你和监护人确认后执行。真正删除后，作品和记录无法恢复。',
    confirm: '确认提交删除申请',
    demoResult: '未执行真实操作。没有向老师提交申请，也没有删除资料。真实申请需要老师与你和监护人确认。',
  },
}
const selectedAction = computed(() => selected.value ? actions[selected.value] : null)

watch(() => props.initialSection, (value) => {
  if (!pending.value) changeSection(value)
})
watch(() => props.demo, () => {
  if (!pending.value) changeSection(section.value)
})

function changeSection(value: Section) {
  if (pending.value) return
  section.value = value
  selected.value = null
  acknowledged.value = false
  message.value = ''
  error.value = ''
}

async function chooseAction(action: Action) {
  if (pending.value) return
  lastAction.value = action
  selected.value = action
  acknowledged.value = false
  message.value = ''
  error.value = ''
  await nextTick()
  confirmPanel.value?.focus()
}

async function cancelAction() {
  if (pending.value) return
  selected.value = null
  acknowledged.value = false
  error.value = ''
  await nextTick()
  focusAction()
}

function focusAction() {
  if (lastAction.value) root.value?.querySelector<HTMLButtonElement>(`button[data-action="${lastAction.value}"]`)?.focus()
}

function downloadJson(value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = '我的数据.json'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  const timer = setTimeout(() => {
    URL.revokeObjectURL(url)
    revokeTimers.delete(timer)
  }, 1000)
  revokeTimers.set(timer, url)
}

async function executeAction() {
  const action = selected.value
  if (!action || pending.value || (action === 'erase' && !acknowledged.value)) return
  pending.value = true
  error.value = ''
  message.value = ''
  try {
    if (props.demo) {
      // Preview never reads/exports personal data and never sends a rights request.
      message.value = actions[action].demoResult
    } else if (action === 'export') {
      const data = await complianceApi.exportMyData()
      if (data === null) throw new Error('暂时无法下载，请检查网络后重试。没有生成空文件。')
      downloadJson(data)
      message.value = '已发起 JSON 文件下载。请查看浏览器下载记录，并妥善保管这份原始资料。'
    } else if (action === 'withdraw') {
      const result = await complianceApi.withdrawConsent()
      message.value = result.message || '已撤回同意。AI 功能停止，数据不再进入研究分析；已有资料没有删除。'
      emit('updated')
    } else {
      const result = await complianceApi.requestErasure()
      if (!result.pending) throw new Error(result.message || '申请没有提交成功，请稍后重试。资料没有删除。')
      message.value = result.message || '已提交申请，等待老师与你和监护人确认。资料尚未删除。'
      emit('updated')
    }
    selected.value = null
    acknowledged.value = false
    pending.value = false
    await nextTick()
    focusAction()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '暂时没有完成，请稍后重试。'
  } finally {
    pending.value = false
  }
}

onBeforeUnmount(() => {
  for (const [timer, url] of revokeTimers) {
    clearTimeout(timer)
    URL.revokeObjectURL(url)
  }
})
</script>

<template>
  <div ref="root" class="data-management" :aria-busy="pending">
    <nav class="dm-switch" aria-label="资料说明与管理">
      <button type="button" :aria-pressed="section === 'use'" :disabled="pending" @click="changeSection('use')">资料怎么用</button>
      <button type="button" :aria-pressed="section === 'manage'" :disabled="pending" @click="changeSection('manage')">管理我的资料</button>
    </nav>
    <p v-if="demo" class="dm-demo">演示模式，未连接真实账号</p>

    <section v-if="section === 'use'" class="dm-use" aria-label="资料用途说明">
      <div class="dm-intro">
        <img src="/generated/my-data-v2/document.png" width="72" height="72" alt="" />
        <div><h3>留下记录，是为了回看学习</h3><p>作品、解释和反馈各有来源。</p></div>
      </div>
      <ol class="dm-purpose">
        <li><b>回看自己</b><span>找到保存的作品、设计稿与作答。</span></li>
        <li><b>读懂反馈</b><span>老师结合原件给建议，不只看次数。</span></li>
        <li><b>理解成长</b><span>有依据的暂定判断，才进入成长画像。</span></li>
      </ol>
      <details class="dm-detail">
        <summary>哪些记录不能直接当成能力？</summary>
        <p>运行、报错、求助和使用时长只是过程信息。记录多，不代表能力强；记录少，也不代表能力弱。缺少原件时，不能补出能力结论。</p>
      </details>
      <details class="dm-detail">
        <summary>AI 和老师分别做什么？</summary>
        <p>AI 可以解释当前可见的记录，不能代替老师确认能力，也不能补写你的原件。教师反馈是否发布，以测评中心的实际状态为准。</p>
        <p v-if="demo">本页没有调用真实 AI，也没有生成真实评价。</p>
      </details>
      <details class="dm-detail">
        <summary>有哪些文字会留下？</summary>
        <p>作品与历史版本包含代码；求助事件可能包含话语前 40 字。结对聊天与 AI 回复的日志只保存各自的分类或时间等信息，不含完整正文。</p>
        <p>这里只说明当前已核对的记录类型，不承诺存在访问日志、固定保存期限或新的共享权限。</p>
      </details>
    </section>

    <section v-else class="dm-manage" aria-label="个人资料管理">
      <div class="dm-intro">
        <img src="/generated/my-data-v2/gear.png" width="72" height="72" alt="" />
        <div><h3>我的资料，我先看清楚</h3><p>每个操作都要再次确认。</p></div>
      </div>

      <div v-if="!selected" class="dm-actions">
        <button v-for="(action, key) in actions" :key="key" type="button" class="dm-action" :data-action="key" :disabled="pending" @click="chooseAction(key)">
          <span><b>{{ action.title }}</b><small>{{ action.short }}</small></span><span aria-hidden="true">›</span>
        </button>
      </div>

      <section v-else-if="selectedAction" ref="confirmPanel" class="dm-confirm" tabindex="-1" aria-label="操作前再次确认">
        <h4>{{ selectedAction.title }}</h4>
        <p>{{ selectedAction.explanation }}</p>
        <p v-if="demo" class="dm-preview-note">这里只演示确认过程，不会执行真实操作。</p>
        <label v-if="selected === 'erase'" class="dm-ack">
          <input v-model="acknowledged" type="checkbox" :disabled="pending" />
          <span>我知道这里只提出申请，还没有删除。</span>
        </label>
        <div class="dm-confirm-actions">
          <button type="button" class="dm-btn" :disabled="pending" @click="cancelAction">先不操作</button>
          <button type="button" class="dm-btn dm-btn--primary" :disabled="pending || (selected === 'erase' && !acknowledged)" @click="executeAction">
            {{ pending ? '正在处理，请稍等' : selectedAction.confirm }}
          </button>
        </div>
      </section>

      <p v-if="error" class="dm-error" role="alert">{{ error }}</p>
      <p v-if="message" class="dm-result" role="status">{{ message }}</p>

      <details class="dm-detail">
        <summary>删除后，哪些资料不能一起收回？</summary>
        <template v-if="summary">
          <p>{{ summary.notes.exported }}</p>
          <p>{{ summary.notes.retained }}</p>
          <ul class="dm-retained"><li v-for="item in summary.retained" :key="`${item.category}:${item.column}`">{{ item.why }}</li></ul>
        </template>
        <p v-else>暂未读取账号的保留说明。已有研究副本不保证能够收回，请和老师、监护人一起查看同意书。不要把撤回同意或提交申请理解成已删除。</p>
      </details>
      <p class="dm-footnote">申请、确认和真正删除，是不同的状态。</p>
    </section>
  </div>
</template>

<style scoped>
.data-management { color: #203558; font-size: 15px; line-height: 1.65; }
.dm-switch { display: flex; gap: 6px; padding: 5px; border-radius: 15px; background: #eef5fc; margin-bottom: 18px; }
.dm-switch button { flex: 1; min-height: 44px; border: 1px solid transparent; border-radius: 11px; background: transparent; color: #526780; padding: 8px 12px; font: inherit; font-weight: 700; cursor: pointer; }
.dm-switch button[aria-pressed="true"] { background: #fbfdff; border-color: #c5dbed; color: #2865ac; box-shadow: 0 2px 5px rgb(50 93 135 / 7%); }
.dm-demo { display: inline-flex; margin: 0 0 18px; padding: 4px 10px; border-radius: 8px; background: #fff4df; color: #825317; font-size: 13px; }
.dm-intro { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
.dm-intro img { flex-shrink: 0; object-fit: contain; }
.dm-intro h3 { margin: 0 0 4px; font-size: 20px; line-height: 1.35; }
.dm-intro p { margin: 0; color: #526780; }
.dm-purpose { list-style: none; margin: 0 0 22px; padding: 0; display: grid; gap: 17px; }
.dm-purpose li { display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 12px; align-items: baseline; }
.dm-purpose b { color: #2865ac; }
.dm-purpose span { color: #526780; }
.dm-detail { padding: 13px 0; border-top: 1px solid #dbe7f2; }
.dm-detail summary { min-height: 44px; display: flex; align-items: center; gap: 12px; cursor: pointer; font-weight: 700; list-style: none; }
.dm-detail summary::-webkit-details-marker { display: none; }
.dm-detail summary::after { content: '+'; margin-left: auto; color: #326db4; font-size: 20px; font-weight: 400; }
.dm-detail[open] summary::after { content: '−'; }
.dm-detail p { margin: 10px 0; color: #526780; overflow-wrap: anywhere; }
.dm-actions { display: grid; gap: 10px; margin-bottom: 18px; }
.dm-action { display: flex; align-items: center; gap: 16px; width: 100%; min-height: 72px; padding: 13px 17px; border: 1px solid #d7e5f2; border-radius: 15px; background: #f8fbfe; color: #203558; text-align: left; font: inherit; cursor: pointer; }
.dm-action > span:first-child { flex: 1; }
.dm-action > span:last-child { font-size: 24px; color: #326db4; }
.dm-action b, .dm-action small { display: block; }
.dm-action small { color: #526780; font-size: 13px; margin-top: 3px; }
.dm-confirm { padding: 18px; border: 1px solid #bcd5ed; border-radius: 17px; background: #f4f9fe; margin-bottom: 18px; }
.dm-confirm h4 { font-size: 18px; margin: 0 0 10px; }
.dm-confirm p { margin: 0 0 16px; }
.dm-preview-note { color: #825317; font-size: 13px; }
.dm-ack { display: flex; align-items: center; gap: 10px; min-height: 44px; margin-bottom: 14px; cursor: pointer; }
.dm-ack input { width: 20px; height: 20px; accent-color: #326db4; flex-shrink: 0; }
.dm-confirm-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
.dm-btn { min-height: 44px; border: 1px solid #bdd3e9; border-radius: 12px; padding: 10px 15px; color: #2865ac; background: #fbfdff; font: inherit; font-weight: 700; cursor: pointer; }
.dm-btn--primary { color: #fbfdff; border-color: #2865ac; background: #2865ac; }
.dm-error, .dm-result { margin: 14px 0; padding: 12px 15px; border: 1px solid #c5dfd8; border-radius: 12px; background: #edf8f4; color: #275c4c; overflow-wrap: anywhere; }
.dm-error { background: #fff3ed; border-color: #ebd0c0; color: #8a4327; }
.dm-retained { padding-left: 20px; color: #526780; }
.dm-retained li { margin: 8px 0; }
.dm-footnote { color: #526780; font-size: 13px; margin: 12px 0 0; }
.data-management button:disabled { opacity: .55; cursor: not-allowed; }
.data-management button:not(:disabled):hover { filter: brightness(.97); }
.data-management :is(button, summary, input):focus-visible, .dm-confirm:focus-visible { outline: 3px solid #2865ac; outline-offset: 3px; }
@media (max-width: 560px) {
  .data-management { font-size: 14px; }
  .dm-intro { gap: 10px; }
  .dm-intro img { width: 54px; height: 54px; }
  .dm-intro h3 { font-size: 18px; }
  .dm-purpose li { grid-template-columns: 1fr; gap: 2px; }
  .dm-confirm { padding: 14px; }
  .dm-confirm-actions { flex-direction: column-reverse; }
  .dm-btn { width: 100%; }
}
</style>
