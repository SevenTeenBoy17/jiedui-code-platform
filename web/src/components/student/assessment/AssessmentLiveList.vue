<!-- @copyBudget 155 真实列表只读元数据，不预取题卷，不推算学习结论。 -->
<template>
  <div class="assessment-live">
    <div class="assessment-heading-row"><div class="assessment-section-heading"><h2>老师发给我的小测</h2><p>这里显示课堂实际安排，不含演示记录。</p></div><button class="assessment-button" type="button" :disabled="loading" @click="load">{{ loading ? '正在刷新' : '刷新安排' }}</button></div>
    <details class="assessment-live-privacy"><summary>参与与隐私说明</summary><p>用于教学研究，和日常练习分开。请先与老师核对参与范围及监护人同意登记；不愿参与、想退出或撤回时，可联系老师确认处理方式。打开此说明不代表同意。</p><p>本页只读取本人安排与提交状态，不读取题目、答案或得分。具体答卷可见范围以本次研究说明为准。</p></details>
    <div v-if="loading" class="assessment-loading" role="status" aria-label="正在读取小测安排"><div /><div /><span>正在读取老师的安排…</span></div>
    <section v-else-if="error" class="assessment-inline-note" role="alert"><h3>暂时没取到安排</h3><p>{{ error }}</p><p>这不表示没有小测，请使用上方“刷新安排”重试。</p></section>
    <section v-else-if="!items.length" class="assessment-empty"><img src="/generated/assessment-center-v1/calendar-clock.png" alt="" /><h3>现在没有发给你的小测</h3><p>有新安排时，再来这里看看。</p></section>
    <div v-else class="assessment-live-rows">
      <article v-for="item in items" :key="item.target_id" class="assessment-live-row">
        <img :src="item.done ? '/generated/assessment-center-v1/checked-notebook.png' : '/generated/assessment-center-v1/calendar-clock.png'" alt="" />
        <div><span class="assessment-note">{{ item.kind === 'probe' ? '课堂小测' : '研究测评' }}</span><h3>{{ item.title }}</h3><p>{{ stateLabel(item) }}</p><small v-if="item.due_at || item.due">老师安排的截止时间：{{ day(item.due_at || item.due!) }}</small></div>
        <button v-if="!item.done && !item.closed" class="assessment-button assessment-button--primary" type="button" @click="start(item)">{{ drafts.has(item.assessment_id) ? '继续作答' : '开始小测' }}</button>
        <span v-else class="assessment-status">{{ item.done ? '已交上' : '已结束' }}</span>
      </article>
    </div>
    <p v-if="draftWarning" class="assessment-inline-note" role="status">{{ draftWarning }}</p>
    <p class="assessment-footnote">提交状态不代表掌握程度。结果说明请以老师发布的内容为准。</p>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { studyApi, type MyAssessment } from '@/api/study'
import { useAuthStore } from '@/stores/auth'
// Read-only extension of fields already returned by FastAPI. No API contract mutation.
type Arrangement = MyAssessment & { closed?: boolean; due_at?: number | null; status?: string }
const router = useRouter(), auth = useAuthStore()
const items = ref<Arrangement[]>([]), drafts = ref(new Set<number>())
const loading = ref(true), error = ref(''), draftWarning = ref('')
let requestId = 0
const day = (ts: number) => new Date(ts * 1000).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
function stateLabel(item: Arrangement) {
  if (item.done) return '已经交上了，不用重复提交'
  if (item.closed) return '作答已经结束，如有疑问请和老师确认'
  return drafts.value.has(item.assessment_id) ? '上次的草稿还在，可以接着做' : '老师已经下发，可以开始'
}
function start(item: Arrangement) {
  if (item.done || item.closed) return
  router.push(`/student/assess/${item.assessment_id}?t=${item.target_id}`)
}
async function load() {
  const current = ++requestId
  loading.value = true; error.value = ''; draftWarning.value = ''
  try {
    const result = await studyApi.mine()
    if (current !== requestId) return
    items.value = result
    const found = new Set<number>()
    try { for (const item of result) if (localStorage.getItem(`assess-draft-${item.assessment_id}-${auth.user?.id || 'anon'}`)) found.add(item.assessment_id) }
    catch { draftWarning.value = '浏览器暂时不能读取本机草稿。进入后请先核对内容。' }
    drafts.value = found
  } catch (e) { if (current === requestId) error.value = e instanceof Error ? e.message : '网络暂时不可用' }
  finally { if (current === requestId) loading.value = false }
}
onMounted(load)
onBeforeUnmount(() => { requestId++ })
</script>
