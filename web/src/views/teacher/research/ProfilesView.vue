<!-- @copyBudget 75  教研·画像：AI 结论 + 学生数字画像（dense）。
     70→75：互动占比「聊天通道未接通——不可用」是契约要求的诚实显示文案（不可缩写），+5 容纳它 -->
<template>
  <div class="pf">
    <!-- 班级数据没取到：明说 + 可重试，不能拿空列表装「暂无学生」 -->
    <p v-if="klassErr" class="alert">
      <span>{{ klassErr }}</span>
      <button class="retry" @click="loadKlass">重试</button>
    </p>

    <!-- 班级共性结论 -->
    <GlassPanel v-if="klass" class="cls">
      <b class="cls__h">{{ klass.headline }}</b>
      <div class="cls__w">
        <span v-for="w in klass.common_weak" :key="w.dim" class="wchip">{{ w.dim }} · {{ w.count }} 人</span>
      </div>
    </GlassPanel>

    <div class="body">
      <!-- 学生列表 -->
      <GlassPanel class="list">
        <input v-model="q" class="search" type="search" aria-label="搜索学生" placeholder="搜学生…" />
        <ul>
          <!-- 选人入口收进 button：Tab 可达、Enter 可选，focus-visible 走全局；选中项标 aria-current -->
          <!-- 渲染护栏（R6 裁决7）：computed 不动，模板截断前 100 行，防大名单卡整页 -->
          <li v-for="s in rows.slice(0, 100)" :key="s.id" :class="{ on: s.id === picked }">
            <button class="row-btn" :aria-current="s.id === picked ? 'true' : undefined" @click="pick(s.id)">
              <b>{{ s.name }}</b>
              <span class="weak">{{ s.weakest }} {{ s.score }}</span>
            </button>
          </li>
          <li v-if="rows.length > 100" class="none">共 {{ rows.length }} 人，仅显示前 100 —— 用搜索缩小范围</li>
          <li v-if="!rows.length" class="none">暂无学生数据</li>
        </ul>
      </GlassPanel>

      <!-- 画像详情 -->
      <div class="detail">
        <template v-if="cur">
          <InsightCard :card="cur.card" :evidence="cur.evidence" />

          <!-- 报告层四要素（对外口径，neutral）：六维只作内部证据分组，对师/对生/对论文一律四要素 -->
          <GlassPanel v-if="report" class="rep">
            <div class="rep__h">
              <h3 class="t">四要素报告<span class="rep__v">（{{ report.report_version }} · 内部 {{ report.formula_version }}）</span></h3>
              <span v-if="!report.has_real_data" class="chip chip--muted">暂无真实证据</span>
              <span v-else class="chip chip--muted">{{ report.evidence_count }} 条证据</span>
            </div>
            <div class="rep__grid">
              <div v-for="(v, k) in report.report_dims" :key="k" class="rep__cell">
                <span class="rep__k">{{ k }}</span>
                <b class="rep__n">{{ v }}</b>
              </div>
            </div>
            <p class="rep__foot">
              人际互动占比：
              <!-- 诚实显示：聊天通道未接通时 ratio 无意义，绝不画 0%——「不可用」和「0」是两回事；
                   chat_channel_available 缺省 = 旧契约响应，按原有 ratio 逻辑走 -->
              <template v-if="inter && inter.chat_channel_available === false">
                <span class="chip chip--muted">聊天通道未接通——不可用</span>
                <span v-if="inter.note" class="rep__meta">（{{ inter.note }}）</span>
              </template>
              <template v-else-if="inter && inter.ratio != null">
                <b>{{ Math.round(inter.ratio * 100) }}%</b>
                <span class="rep__meta">（生生 {{ inter.peer_turns }} · 人机 {{ inter.ai_turns }}）</span>
              </template>
              <template v-else>—<span class="rep__meta">（暂无对话数据）</span></template>
            </p>
          </GlassPanel>

          <!-- AI 建议推送：分析 → 干预 一键闭环 -->
          <GlassPanel v-if="rec?.exercises?.length" class="rec">
            <div class="rec__h">
              <b>AI 建议推送</b>
              <span class="rec__why">{{ rec.reason }}</span>
            </div>
            <ul class="rec__list">
              <li v-for="e in rec.exercises" :key="e.id">
                <span class="rec__t">{{ e.title }}</span>
                <span class="rec__meta">{{ DIFF[e.difficulty] }} · {{ e.why }}</span>
                <button class="rec__go" @click="pushOne(e.id)">推送</button>
              </li>
            </ul>
          </GlassPanel>
          <GlassPanel>
            <h3 class="t">六维画像</h3>
            <!-- 图表 aria（R4 裁决4）：按维度读分值，读屏拿到和看图等价的信息 -->
            <div ref="radarEl" class="chart" role="img" :aria-label="radarAria" />
          </GlassPanel>
          <GlassPanel v-if="cur.path?.length">
            <h3 class="t">问题解决路径</h3>
            <div class="path">
              <template v-for="(p, i) in cur.path" :key="i">
                <span class="node">{{ PATH[p.type] || p.type }}</span>
                <span v-if="i < cur.path.length - 1" class="arrow">→</span>
              </template>
            </div>
          </GlassPanel>
        </template>
        <!-- role="status"（R5 裁决4）：读屏用户也要知道正在分析，不是页面死了 -->
        <p v-else-if="loading" class="hint" role="status">分析中…</p>
        <!-- 选了人但主画像取失败：明说是谁没取到，给重试，不能退回「选一位学生」装没发生。
             用全局 .alert 错误条（.retry 子样式挂在它下面，本地不再自带一套） -->
        <div v-else-if="picked && pickErr" class="alert">
          {{ pickErr }}
          <button class="retry" @click="pick(picked)">重试</button>
        </div>
        <!-- hint 正文非按钮前缀，勿换图标（R5 裁决2）：这里的 ← 是指向左侧列表的正文语气 -->
        <p v-else class="hint">← 选一位学生查看 AI 画像</p>
      </div>
    </div>

    <p v-if="tip" class="toast">{{ tip }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import echarts from '@/utils/echartsLite'
import { insightsApi, type ClassInsight, type StudentInsight, type Recommend } from '@/api/insights'
import { ctApi, type CtReport } from '@/api/ct'
import { learnerApi, type Interaction } from '@/api/learner'
import { resourcesApi } from '@/api/resources'
import { animationsOn } from '@/composables/useDeviceCapability'
import { useToast } from '@/composables/useToast'
import { CHART_COLORS, CHART_GRID, CHART_AXIS } from '@/constants/chartTheme'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import InsightCard from '@/components/insights/InsightCard.vue'

const PATH: Record<string, string> = {
  run: '运行', error: '报错', fix: '修复', ai_help: '求助', role_switch: '换位', design_create: '设计', save: '保存',
}
const DIMS: [string, string][] = [
  ['decompose', '分解'], ['abstract', '抽象'], ['model', '建模'],
  ['algorithm', '算法设计'], ['verify', '验证优化'], ['transfer', '迁移'],
]

const DIFF: Record<number, string> = { 1: '入门', 2: '基础', 3: '提高', 4: '挑战' }

const klass = ref<ClassInsight | null>(null)
const cur = ref<StudentInsight | null>(null)
const rec = ref<Recommend | null>(null)
const report = ref<CtReport | null>(null)     // 报告层四要素（对外口径）
const inter = ref<Interaction | null>(null)   // 人际互动占比（对抗性指标）
const picked = ref('')
const q = ref('')
const loading = ref(false)
const { tip, flash } = useToast()
const pickErr = ref('')     // 主画像（结论卡）取失败时的错误文案，含学生名
const klassErr = ref('')    // 班级共性数据取失败时的错误条
const radarEl = ref<HTMLElement>()

/** 一键推送：把 AI 推荐的题直接推给这名学生（分析→干预闭环）。 */
async function pushOne(exId: number) {
  if (!cur.value || !rec.value) return
  try {
    await resourcesApi.push({
      res_type: 'exercise', res_id: exId,
      student_ids: [cur.value.student_id], reason: rec.value.reason,
    })
    flash(`已推送给 ${cur.value.name}`)
  } catch {
    flash('推送失败')
  }
}

const rows = computed(() =>
  (klass.value?.students ?? []).filter((s) => !q.value || s.name.includes(q.value)),
)

async function pick(id: string) {
  picked.value = id
  loading.value = true
  cur.value = null
  rec.value = null
  report.value = null
  inter.value = null
  try {
    // 结论卡/推荐/四要素报告/互动占比并行拉取，任一失败不影响其余（requestOr 失败即 null）
    const [c, r, rep, itc] = await Promise.allSettled([
      insightsApi.student(id), insightsApi.recommend(id), ctApi.report(id), learnerApi.interaction(id),
    ])
    if (c.status === 'fulfilled') {
      cur.value = c.value
      pickErr.value = ''
    } else {
      // 主画像失败必须点名说清，不能让老师以为"这学生没画像"
      const name = klass.value?.students.find((s) => s.id === id)?.name ?? '该学生'
      pickErr.value = `${name} 的画像没取到`
    }
    if (r.status === 'fulfilled') rec.value = r.value
    if (rep.status === 'fulfilled') report.value = rep.value
    if (itc.status === 'fulfilled') inter.value = itc.value
    await nextTick()
    drawRadar()
  } catch { /* 失败留空态 */ } finally {
    loading.value = false
  }
}

/* 图表 aria（R4 裁决4）：六维画像按维度读分值；缺维读「暂无数据」不读 0 分 */
const radarAria = computed(() => {
  const s = cur.value?.ct_scores
  if (!s) return '六维画像雷达图：暂无数据'
  return '六维画像：' + DIMS.map(([k, n]) => (s[k] == null ? `${n}暂无数据` : `${n} ${s[k]} 分`)).join('、')
})

// chart 实例缓存：修「每次选人都 echarts.init 同一节点」的真 bug（告警 + 实例泄漏）；
// 详情区 v-if 重挂后旧实例绑在已卸载节点上，先弃再建 —— 照 AnalysisView 的实例缓存写法
let radarChart: ReturnType<typeof echarts.init> | null = null

function drawRadar() {
  if (!radarEl.value || !cur.value) return
  const s = cur.value.ct_scores
  if (radarChart && radarChart.getDom() !== radarEl.value) { radarChart.dispose(); radarChart = null }
  radarChart ??= echarts.init(radarEl.value)
  radarChart.setOption({
    animation: animationsOn(),
    radar: {
      indicator: DIMS.map(([, n]) => ({ name: n, max: 100 })), radius: '62%',
      axisName: { color: CHART_AXIS, fontSize: 11 },
      splitArea: { areaStyle: { color: ['rgba(255,255,255,.5)', 'rgba(255,255,255,.2)'] } },
      splitLine: { lineStyle: { color: CHART_GRID } }, axisLine: { lineStyle: { color: CHART_GRID } },
    },
    series: [{ type: 'radar', data: [{ value: DIMS.map(([k]) => s[k] ?? 0),
      areaStyle: { color: 'rgba(51,112,255,.22)' }, lineStyle: { color: CHART_COLORS[0] }, itemStyle: { color: CHART_COLORS[1] } }] }],
  })
}

watch(cur, () => nextTick(drawRadar))

/** 班级共性数据：失败给错误条 + 重试，而不是静默留一片"暂无学生"。 */
async function loadKlass() {
  klassErr.value = ''
  try {
    klass.value = await insightsApi.klass()
    const first = klass.value.students[0]
    if (first) pick(first.id)
  } catch {
    klassErr.value = '班级画像数据没取到'
  }
}
onMounted(loadKlass)
</script>

<style scoped>
.pf { display: flex; flex-direction: column; gap: var(--sp-3); }
.cls { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.cls__h { font-size: var(--fs-md); font-weight: var(--fw-bold); }
.cls__w { display: flex; gap: 5px; }
.wchip { font-size: var(--fs-xs); background: var(--color-primary-soft); color: var(--color-primary-strong);
  padding: 3px 10px; border-radius: var(--r-pill); }
.body { display: grid; grid-template-columns: 220px 1fr; gap: var(--sp-3); align-items: start; }
.list ul { list-style: none; margin: var(--sp-2) 0 0; padding: 0; max-height: 62vh; overflow-y: auto; }
.list li { border-radius: var(--r-md); font-size: var(--fs-sm); }
.list li.on { background: var(--color-primary-soft); }
/* 选人入口是 button（键盘可达）：同等 padding 从 li 移入 */
.row-btn { width: 100%; text-align: inherit; background: none; border: none; font: inherit; cursor: pointer;
  display: flex; align-items: center; gap: 6px; padding: 7px 9px; border-radius: var(--r-md); }
.row-btn:hover { background: var(--ink-a06); }
.row-btn b { flex: 1; font-weight: var(--fw-medium); }
.weak { font-size: var(--fs-xs); color: var(--color-text-3); font-variant-numeric: tabular-nums; }
.none { color: var(--color-text-3); cursor: default; padding: 7px 9px; }
.search { width: 100%; height: 32px; border: 1px solid var(--color-border); background: var(--color-surface);
  border-radius: var(--r-md); padding: 0 var(--sp-2); font: inherit; font-size: var(--fs-sm); }
/* 焦点环（R5 裁决1）：键盘焦点要看得见，不再裸删 outline */
.search:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
.detail { display: flex; flex-direction: column; gap: var(--sp-3); min-width: 0; }
.t { font-size: var(--fs-sm); font-weight: var(--fw-bold); margin-bottom: 6px; }
.rep__h { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rep__h .t { margin-bottom: 0; }
.rep__v { font-weight: var(--fw-regular); font-size: var(--fs-xs); color: var(--color-text-3); margin-left: 4px; }
.rep__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--sp-2); margin-top: var(--sp-2); }
.rep__cell { background: var(--color-fill-1); border: 1px solid var(--color-border); border-radius: var(--r-md);
  padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
.rep__k { font-size: var(--fs-xs); color: var(--color-text-2); }
.rep__n { font-size: var(--fs-lg); font-variant-numeric: tabular-nums; color: var(--color-text); }
.rep__foot { margin: var(--sp-2) 0 0; font-size: var(--fs-xs); color: var(--color-text-2); }
.rep__meta { color: var(--color-text-3); }
@media (max-width: 700px) { .rep__grid { grid-template-columns: repeat(2, 1fr); } }
.chart { height: 240px; }
.path { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.node { font-size: var(--fs-xs); background: var(--ink-a06); padding: 4px 10px; border-radius: var(--r-pill); }
.arrow { color: var(--color-text-3); }
.hint { color: var(--color-text-3); font-size: var(--fs-sm); padding: var(--sp-6); text-align: center; }
/* .alert / .retry 已收编为 global.css 全局错误条 */
.rec__h { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.rec__h b { font-size: var(--fs-sm); }
.rec__why { font-size: var(--fs-xs); color: var(--color-text-3); }
.rec__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.rec__list li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: var(--r-md); }
.rec__list li:hover { background: var(--ink-a04); }
.rec__t { font-size: var(--fs-sm); flex: 1; min-width: 0; }
.rec__meta { font-size: var(--fs-xs); color: var(--color-text-3); }
.rec__go { border: none; background: var(--on-accent-bg); color: var(--on-accent-fg); font-size: var(--fs-xs);
  padding: 4px 12px; border-radius: var(--r-pill); cursor: pointer; }
/* .toast 已收编为 global.css 全局工具类 */
@media (max-width: 900px) { .body { grid-template-columns: 1fr; } }
</style>
