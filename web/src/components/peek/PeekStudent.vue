<!-- 下钻抽屉·学生学情：谁、卡在哪、下一步给什么。教师端所有「看学情」入口的落点。 -->
<template>
  <div class="ps">
    <p v-if="err" class="err">{{ err }}</p>
    <p v-else-if="!ct" class="load">读取中…</p>

    <template v-else>
      <div class="nums">
        <span><b>{{ ct.runs }}</b>运行</span>
        <span><b>{{ ct.errors }}</b>报错</span>
        <span><b>{{ ct.fixes }}</b>修复</span>
        <span><b>{{ ct.success_rate }}%</b>成功率</span>
        <span><b>{{ ct.minutes }}</b>分钟</span>
      </div>
      <p v-if="!ct.has_real_data" class="thin">编程行为不足 3 次，下面的六维分只是起评基线，先别据此下判断</p>

      <ul class="dims">
        <li v-for="(v, k) in ct.ct_scores" :key="k">
          <span class="dim__n">{{ DIM[k] || k }}</span>
          <i class="bar"><em :style="{ width: v + '%' }" /></i>
          <b class="dim__v">{{ v }}</b>
        </li>
      </ul>

      <details class="fold" @toggle="loadRec">
        <summary>该给他练什么</summary>
        <p v-if="recErr" class="err">{{ recErr }}</p>
        <template v-else-if="rec">
          <p class="reason">{{ rec.reason }}</p>
          <ol class="recs">
            <li v-for="e in rec.exercises" :key="e.id">{{ e.title }}<i>{{ e.why }}</i></li>
            <li v-if="!rec.exercises.length" class="thin">题库里还没有合适的题</li>
          </ol>
        </template>
        <p v-else class="load">读取中…</p>
      </details>

      <details class="fold">
        <summary>最近做了什么（{{ ct.timeline.length }} 步）</summary>
        <ol class="tl">
          <li v-for="(e, i) in [...ct.timeline].reverse()" :key="i">
            <span class="tl__t">{{ EV[e.type] || e.type }}</span>
            <span class="tl__d">{{ e.detail || '—' }}</span>
            <i>{{ hhmm(e.ts) }}</i>
          </li>
          <li v-if="!ct.timeline.length" class="thin">本节还没有记录</li>
        </ol>
      </details>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { ctApi, type CtSummary } from '@/api/ct'
import { insightsApi, type Recommend } from '@/api/insights'

const props = defineProps<{ id: string }>()

const DIM: Record<string, string> = {
  decompose: '分解', abstract: '抽象', model: '建模',
  algorithm: '算法设计', verify: '验证优化', transfer: '迁移',
}
const EV: Record<string, string> = {
  run: '运行', error: '报错', fix: '修复', ai_help: '问 AI',
  role_switch: '换位', design_create: '做设计', task_done: '完成任务', save: '保存',
}

const ct = ref<CtSummary | null>(null)
const rec = ref<Recommend | null>(null)
const err = ref('')
const recErr = ref('')

const hhmm = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

async function load() {
  ct.value = null
  rec.value = null
  err.value = ''
  const d = await ctApi.summary(props.id)
  if (d) ct.value = d
  else err.value = '这名学生的学情暂时取不到，请稍后重试'
}
/** 推荐要调 LLM，展开才拉 —— 抽屉一开就并发两个慢请求没必要 */
async function loadRec(e: Event) {
  if (!(e.target as HTMLDetailsElement).open || rec.value) return
  try {
    rec.value = await insightsApi.recommend(props.id)
  } catch {
    recErr.value = '推荐暂时取不到'
  }
}

watch(() => props.id, load)
onMounted(load)
</script>

<style scoped>
.ps { display: flex; flex-direction: column; gap: var(--sp-3); font-size: var(--fs-sm); }
.load, .thin { color: var(--color-text-3); font-size: var(--fs-xs); }
.err { color: var(--color-danger-ontext); font-size: var(--fs-xs); }
.nums { display: flex; flex-wrap: wrap; gap: var(--sp-3); }
.nums span { display: flex; flex-direction: column; font-size: var(--fs-xs); color: var(--color-text-3); }
.nums b { font-size: var(--fs-md); color: var(--color-text); font-variant-numeric: tabular-nums; }
.dims { display: flex; flex-direction: column; gap: 6px; }
.dims li { display: grid; grid-template-columns: 56px 1fr 28px; align-items: center; gap: 8px; }
.dim__n { font-size: var(--fs-xs); color: var(--color-text-2); }
.dim__v { font-size: var(--fs-xs); text-align: right; font-variant-numeric: tabular-nums; }
.bar { display: block; height: 6px; background: var(--ink-a08); border-radius: var(--r-pill); overflow: hidden; }
.bar em { display: block; height: 100%; background: var(--color-primary); border-radius: var(--r-pill); }
.fold { font-size: var(--fs-xs); }
.fold > summary { cursor: pointer; color: var(--color-primary-ontext); }
.reason { margin: 8px 0; color: var(--color-text-2); line-height: 1.7; }
.recs, .tl { margin: 6px 0 0; padding-left: 18px; color: var(--color-text-2); }
.recs li, .tl li { margin-bottom: 5px; line-height: 1.6; }
.recs i, .tl i { font-style: normal; color: var(--color-text-3); margin-left: 6px; }
.tl { list-style: none; padding-left: 0; }
.tl li { display: flex; gap: 8px; }
.tl__t { flex-shrink: 0; color: var(--color-text); }
.tl__d { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
