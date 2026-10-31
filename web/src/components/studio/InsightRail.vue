<template>
  <!-- 学习面板（V2）：默认不展开；展开后 340px。四页签：总结/错题/行为/进阶。 -->
  <aside class="rail glass">
    <header class="rail__h">
      <nav class="tabs">
        <button v-for="t in TABS" :key="t.k" class="tab" :class="{ on: tab === t.k }" @click="$emit('tab', t.k)">
          {{ t.label }}
        </button>
      </nav>
      <button class="x" aria-label="收起" @click="$emit('close')"><BaseIcon name="x" /></button>
    </header>

    <div class="rail__b">
      <!-- 过程统计仅陈述已有记录，不据次数展示能力等级。 -->
      <template v-if="tab === 'behavior'">
        <div v-if="ct" class="stats">
          <div class="stat"><b>{{ ct.runs }}</b><small>运行</small></div>
          <div class="stat"><b>{{ ct.errors }}</b><small>报错</small></div>
          <div class="stat"><b>{{ ct.fixes }}</b><small>修复</small></div>
          <div class="stat"><b>{{ ct.success_rate }}%</b><small>成功率</small></div>
        </div>
        <details v-if="ct" class="thin">
          <summary>怎样理解这些记录</summary>
          <p>次数只描述过程，不能当作计算思维分数。请结合任务作品、测试与自己的解释判断。</p>
        </details>
        <p v-if="ctErr" class="empty">加载失败<button class="retry" @click="loadCt" title="重新加载">↻</button></p>
        <p v-else-if="!ct" class="empty">暂无学习记录</p>
      </template>

      <!-- 错题本：由 error 事件归集，反复犯的排最前 -->
      <template v-else-if="tab === 'mistakes'">
        <!-- 不给按钮：切走再切回本页签就会重试（loadTab 的守卫按「无数据」判）。交互配额已满 -->
        <p v-if="misErr" class="empty">加载失败，切走再切回可重试</p>
        <ul v-else-if="mistakes.length" class="mis">
          <li v-for="(m, i) in mistakes" :key="i">
            <div class="mis__h">
              <span class="mis__n">{{ i + 1 }}</span>
              <b v-if="m.count > 1" class="mis__c">犯过 {{ m.count }} 次</b>
              <i class="mis__t">{{ day(m.last_at) }}</i>
            </div>
            <code class="mis__x">{{ m.text }}</code>
            <button class="mis__ask" @click="$emit('ask', `这个报错是什么意思：${m.text}`)">问问它为什么</button>
          </li>
        </ul>
        <div v-else class="ph">
          <img :src="asset('tile_bank')" class="ph__ic" alt="" />
          <p class="ph__t">错题本还是空的</p>
          <p class="ph__s">运行出错会自动收到这里</p>
        </div>
      </template>

      <!-- 进阶：按最弱维推荐的真实题目 -->
      <template v-else-if="tab === 'next'">
        <template v-if="rec">
          <p class="rec__why">{{ rec.reason }}</p>
          <ul class="recs">
            <li v-for="e in rec.exercises" :key="e.id">
              <b>{{ e.title }}</b><i>{{ DIFF[e.difficulty] || '' }} · {{ e.why }}</i>
            </li>
          </ul>
          <p v-if="!rec.exercises.length" class="thin">老师还没有放合适的题目</p>
        </template>
        <div v-else class="ph">
          <img :src="asset('tile_practice')" class="ph__ic" alt="" />
          <p class="ph__t">进阶推荐</p>
          <p v-if="recErr === '__fail__'" class="ph__s">加载失败，切走再切回可重试</p>
          <p v-else class="ph__s">{{ recErr || '多练几次，就能按你的薄弱环节推荐下一题' }}</p>
        </div>
      </template>

      <!-- 总结：显示最近一次 AI 总结，而不是叫用户再去点一次 📋 -->
      <template v-else>
        <div v-if="summary" class="sum">{{ summary }}</div>
        <div v-else class="ph">
          <img :src="asset('tile_report')" class="ph__ic" alt="" />
          <p class="ph__t">学习总结</p>
          <p class="ph__s">用「＋ 总结这次学习」让搭档替你梳理</p>
        </div>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { asset } from '@/assets/assets'
import { ctApi, type CtSummary, type Mistake } from '@/api/ct'
import { insightsApi, type Recommend } from '@/api/insights'
import BaseIcon from '@/components/ui/BaseIcon.vue'

const props = defineProps<{ tab: string; summary?: string }>()
defineEmits<{ tab: [string]; close: []; ask: [string] }>()

const TABS = [
  { k: 'summary', label: '总结' },
  { k: 'mistakes', label: '错题' },
  { k: 'behavior', label: '行为' },
  { k: 'next', label: '进阶' },
]
const DIFF: Record<number, string> = { 1: '入门', 2: '基础', 3: '提高', 4: '挑战' }

const ct = ref<CtSummary | null>(null)
const ctErr = ref(false)
const mistakes = ref<Mistake[]>([])
const misErr = ref(false)
const rec = ref<Recommend | null>(null)
const recErr = ref('')

const day = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })

/** 按需拉：切到哪个页签才请求哪份数据，展开面板不该并发三个请求 */
async function loadTab(t: string) {
  if (t === 'mistakes' && !mistakes.value.length) {
    // requestOr 失败给 null：接口挂了和「一道错题都没有」是两回事
    const r = await ctApi.mistakesOrNull()
    if (r === null) misErr.value = true
    else { misErr.value = false; mistakes.value = r.items }
  }
  if (t === 'next' && !rec.value) {
    recErr.value = ''
    try {
      rec.value = await insightsApi.myRecommend()
    } catch (e: unknown) {
      // 400 = 服务端明说「练得还少」（真空态）；其余是没取到，语义完全不同且要能重试
      const notEnough = (e as { status?: number })?.status === 400
      recErr.value = notEnough ? '再多练几次，就能按你的薄弱环节推荐下一题' : '__fail__'
    }
  }
}

watch(() => props.tab, loadTab)
async function loadCt() {
  ctErr.value = false
  ct.value = await ctApi.summary()        // 失败返回 null —— 不能装成「还没有学习记录」
  if (ct.value === null) ctErr.value = true
}
onMounted(async () => {
  await loadCt()
  await loadTab(props.tab)
})
</script>

<style scoped>
.rail { width: 340px; flex-shrink: 0; display: flex; flex-direction: column; overflow: hidden; }
.rail__h { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); }
.tabs { display: flex; gap: 2px; flex: 1; }
.tab { border: none; background: transparent; font-size: var(--fs-xs); color: var(--color-text-3);
  padding: 5px 9px; border-radius: var(--r-pill); cursor: pointer; }
.tab.on { background: var(--color-surface); color: var(--color-primary-strong); font-weight: var(--fw-medium); box-shadow: var(--shadow-sm); }
.x { border: none; background: var(--ink-a06); width: 24px; height: 24px; border-radius: var(--r-pill); cursor: pointer; }
.rail__b { flex: 1; min-height: 0; overflow-y: auto; padding: 0 var(--sp-3) var(--sp-3); }

.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: var(--sp-3); }
.stat { background: var(--color-fill-1); border-radius: var(--r-md); padding: 8px 4px; text-align: center; }
.stat b { display: block; font-size: var(--fs-md); font-variant-numeric: tabular-nums; }
.stat small { font-size: var(--fs-xs); color: var(--color-text-3); }
.dims { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.dims li { display: flex; align-items: center; gap: 7px; font-size: var(--fs-xs); color: var(--color-text-2); }
.dims__ic { width: 22px; height: 22px; }
.band { margin-left: auto; font-size: var(--fs-xs); padding: 2px 9px; border-radius: var(--r-pill);
  background: var(--ink-a06); color: var(--color-text-2); }
.dims li.b0 .band { background: var(--on-success-bg); color: var(--on-success-fg); }
.dims li.b2 .band { background: var(--on-accent-bg); color: var(--on-accent-fg); }
.bar { flex: 1; height: 6px; background: #e8eef9; border-radius: var(--r-pill); overflow: hidden; }
.bar > i { display: block; height: 100%; background: var(--color-primary); border-radius: var(--r-pill);
  transition: width var(--d-slow) var(--e-out); }
.dims b { font-variant-numeric: tabular-nums; color: var(--color-text); min-width: 20px; text-align: right; }

.thin { font-size: var(--fs-xs); color: var(--color-text-3); line-height: 1.7; margin-bottom: var(--sp-2); }
.mis { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.mis li { background: var(--color-fill-1); border-radius: var(--r-md); padding: 8px 10px; }
.mis__h { display: flex; align-items: center; gap: 6px; }
.mis__n { width: 18px; height: 18px; display: grid; place-items: center; border-radius: 50%;
  background: var(--on-accent-bg); color: var(--on-accent-fg); font-size: var(--fs-xs); font-weight: var(--fw-bold); }
.mis__c { font-size: var(--fs-xs); color: var(--color-danger-ontext); }
.mis__t { font-style: normal; font-size: var(--fs-xs); color: var(--color-text-3); margin-left: auto; }
.mis__x { display: block; margin: 5px 0; font-size: var(--fs-xs); color: var(--color-text-2);
  word-break: break-all; line-height: 1.6; }
.mis__ask { border: none; background: var(--ink-a06); color: var(--color-text-2);
  font-size: var(--fs-xs); padding: 3px 10px; border-radius: var(--r-pill); cursor: pointer; }
.rec__why { font-size: var(--fs-xs); color: var(--color-text-2); line-height: 1.7; margin-bottom: var(--sp-2); }
.recs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.recs li { background: var(--color-fill-1); border-radius: var(--r-md); padding: 8px 10px; font-size: var(--fs-xs); }
.recs b { display: block; color: var(--color-text); }
.recs i { font-style: normal; color: var(--color-text-3); font-size: var(--fs-xs); }
.sum { font-size: var(--fs-xs); color: var(--color-text-2); line-height: 1.8; white-space: pre-wrap;
  background: var(--color-fill-1); border-radius: var(--r-md); padding: var(--sp-3); }
.ph { text-align: center; padding: var(--sp-6) var(--sp-3); }
.ph__ic { width: 72px; height: 72px; }
.ph__t { font-weight: var(--fw-bold); margin-top: var(--sp-2); }
.ph__s { font-size: var(--fs-xs); color: var(--color-text-3); margin-top: 4px; line-height: 1.7; }
.empty { color: var(--color-text-3); font-size: var(--fs-sm); text-align: center; padding: var(--sp-5) 0; }
.retry { border: none; background: var(--ink-a08); color: var(--color-text-2); margin-left: 6px;
  font-size: var(--fs-xs); padding: 2px 10px; border-radius: var(--r-pill); cursor: pointer; }

@media (max-width: 760px) {
  .rail { position: fixed; inset: auto 8px 8px; width: auto; height: 62vh; z-index: var(--z-panel); }
}
</style>
