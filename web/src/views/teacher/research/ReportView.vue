<!-- @copyBudget 150  教研·报告：滚动叙事式班级分析（可打印为结题材料）
     预算高于全站默认 90 是**有意为之**：本页是「文档」而非应用界面——六个章节标题与结论句本身即交付内容，
     打印出来就是结题材料。可折叠的（合规说明、各维分值）已折叠；剩余为不可再压的正文。 -->
<template>
  <div class="rp">
    <header class="rp__bar no-print">
      <div>
        <b class="rp__t">班级研究报告</b>
        <span class="rp__s">数据取自平台真实记录 · 学生一律以假名呈现</span>
      </div>
      <button class="print" @click="doPrint"><BaseIcon name="printer" :size="14" /> 导出 / 打印</button>
    </header>

    <!-- 数据缺失警示：**故意不加 no-print** —— 缺了哪些数据要随报告一起印出来自证，不能印成一份"看起来完整"的报告 -->
    <p v-if="missing.length" class="miss">以下数据未取到：{{ missing.join('、') }}，报告不完整</p>

    <!-- ① 结论摘要 -->
    <section class="reveal card glass">
      <h3 class="h">一、总体结论</h3>
      <p class="lead">{{ klass?.headline || '暂无足够数据形成班级结论' }}</p>
      <div class="kpis">
        <div v-for="k in kpiRow" :key="k.label" class="kpi">
          <b>{{ k.value }}</b><small>{{ k.label }}</small>
        </div>
      </div>
    </section>

    <!-- ② 六维现状 -->
    <section class="reveal card glass">
      <h3 class="h">二、计算思维六维现状</h3>
      <!-- 图表 aria（R4 裁决4）：裸 canvas 对读屏是空白，把数据用自然中文读出来 -->
      <div ref="radarEl" class="chart" role="img" :aria-label="radarAria" />
      <details class="more no-print">
        <summary>看各维分值</summary>
        <ul class="flat">
          <li v-for="d in dims" :key="d.k">{{ d.label }}：{{ d.v }}</li>
        </ul>
      </details>
    </section>

    <!-- ③ 共性薄弱 -->
    <section class="reveal card glass">
      <h3 class="h">三、共性薄弱与分布</h3>
      <div class="weak">
        <span v-for="w in klass?.common_weak || []" :key="w.dim" class="wchip">
          {{ w.dim }} · {{ w.count }} 人
        </span>
        <span v-if="!klass?.common_weak?.length" class="muted">暂无</span>
      </div>
      <!-- .tbl-scroll（R6 裁决7）：窄屏横向滚动。本表在 .card（padding sp-5）里，
           sticky top 按 -sp-4 算会露 4px 缝 —— 但只 12 行短表基本滚不出吸附，先不特调 -->
      <div v-if="klass?.students?.length" class="tbl-scroll">
        <table class="tbl">
          <thead><tr><th>学生（假名）</th><th>最弱维</th><th>分值</th></tr></thead>
          <tbody>
            <tr v-for="(s, i) in klass.students.slice(0, 12)" :key="s.id">
              <td>S{{ String(i + 1).padStart(2, '0') }}</td>
              <td>{{ s.weakest }}</td>
              <td class="num">{{ s.score }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- ④ 学习任务漏斗 -->
    <section class="reveal card glass">
      <h3 class="h">四、学习过程漏斗</h3>
      <div ref="funnelEl" class="chart" role="img" :aria-label="funnelAria" />
    </section>

    <!-- ⑤ 干预与完成 -->
    <section class="reveal card glass">
      <h3 class="h">五、教师干预与完成情况</h3>
      <p class="lead">共下发 {{ pushes.length }} 次资源推送，完成率 {{ doneRate }}%。</p>
      <ul class="flat">
        <li v-for="p in pushes.slice(0, 6)" :key="p.id">
          {{ p.title }} — {{ p.done }}/{{ p.total }} 完成<span v-if="p.reason"> · {{ p.reason }}</span>
        </li>
        <li v-if="!pushes.length" class="muted">尚无推送记录</li>
      </ul>
    </section>

    <!-- ⑥ 安全与合规 -->
    <section class="reveal card glass">
      <h3 class="h">六、安全与合规</h3>
      <p class="lead">安全护栏累计触发 {{ alerts.length }} 次，均已留痕。</p>
      <details class="more">
        <summary>合规说明</summary>
        <p class="note">本报告不含学生真实姓名与对话原文，学生以 S01…假名呈现；如需研究数据，请用「导出」页的脱敏数据集。</p>
      </details>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import echarts from '@/utils/echartsLite'
import { insightsApi, type ClassInsight } from '@/api/insights'
import { resourcesApi, type PushRec } from '@/api/resources'
import { useTeacherHome } from '@/composables/useTeacherHome'
import { useReveal } from '@/composables/useReveal'
import { animationsOn } from '@/composables/useDeviceCapability'
import { CHART_COLORS, CHART_GRID, CHART_AXIS } from '@/constants/chartTheme'
import BaseIcon from '@/components/ui/BaseIcon.vue'

const { kpis, alerts, classCt, funnel, load, error } = useTeacherHome()
const klass = ref<ClassInsight | null>(null)
const pushes = ref<PushRec[]>([])
const missing = ref<string[]>([])   // 取数失败的来源名——非空时报告顶部挂警示条，打印前二次确认
const radarEl = ref<HTMLElement>()
const funnelEl = ref<HTMLElement>()

useReveal()

const DIMS: [string, string][] = [
  ['decompose', '分解'], ['abstract', '抽象'], ['model', '建模'],
  ['algorithm', '算法设计'], ['verify', '验证优化'], ['transfer', '迁移'],
]
const dims = computed(() => DIMS.map(([k, label]) => ({ k, label, v: (classCt.value as any)?.[k] ?? 0 })))
const kpiRow = computed(() => [
  { label: '学生', value: kpis.value?.students ?? 0 },
  { label: '今日提交', value: kpis.value?.submissions ?? 0 },
  { label: '安全提醒', value: alerts.value.length },
  { label: '推送', value: pushes.value.length },
])
const doneRate = computed(() => {
  const t = pushes.value.reduce((a, p) => a + (p.total || 0), 0)
  const d = pushes.value.reduce((a, p) => a + (p.done || 0), 0)
  return t ? Math.round((d / t) * 100) : 0
})

/* 图表 aria（R4 裁决4）：从已有数据拼自然中文，读屏用户拿到和看图者等价的信息 */
const radarAria = computed(
  () => '班级计算思维六维雷达图：' + dims.value.map((d) => `${d.label} ${d.v} 分`).join('、'),
)
const funnelAria = computed(() => {
  const f = funnel.value
  return f
    ? `学习过程漏斗图：进入 ${f.entered} 人、运行 ${f.ran} 人、修复 ${f.fixed} 人、迁移 ${f.transferred} 人`
    : '学习过程漏斗图：漏斗数据未取到'
})

function draw() {
  if (radarEl.value) {
    echarts.init(radarEl.value).setOption({
      animation: animationsOn(),
      radar: { indicator: DIMS.map(([, n]) => ({ name: n, max: 100 })), radius: '62%',
        axisName: { color: CHART_AXIS, fontSize: 11 },
        splitLine: { lineStyle: { color: CHART_GRID } }, axisLine: { lineStyle: { color: CHART_GRID } } },
      series: [{ type: 'radar', data: [{ value: dims.value.map((d) => d.v),
        areaStyle: { color: 'rgba(51,112,255,.25)' }, lineStyle: { color: CHART_COLORS[0] } }] }],
    })
  }
  const f = funnel.value
  if (funnelEl.value && f) {
    echarts.init(funnelEl.value).setOption({
      animation: animationsOn(),
      series: [{ type: 'funnel', left: 10, right: 10, top: 10, bottom: 10, minSize: '24%',
        label: { position: 'inside' },
        data: [{ value: f.entered, name: '进入 ' + f.entered }, { value: f.ran, name: '运行 ' + f.ran },
               { value: f.fixed, name: '修复 ' + f.fixed }, { value: f.transferred, name: '迁移 ' + f.transferred }],
        color: CHART_COLORS }],
    })
  }
}

function doPrint() {
  // 打印门禁：缺数据的报告不能一键印出去当结题材料，先让老师确认
  if (missing.value.length && !confirm('部分数据缺失，仍要打印吗？')) return
  window.print()
}

onMounted(async () => {
  await load()
  const [k, p] = await Promise.allSettled([insightsApi.klass(), resourcesApi.pushes()])
  const miss: string[] = []
  if (error.value) miss.push('班级概况（KPI/六维/漏斗）')
  if (k.status === 'fulfilled') klass.value = k.value
  else miss.push('班级画像结论')
  if (p.status === 'fulfilled') pushes.value = p.value
  else miss.push('资源推送记录')
  missing.value = miss
  await nextTick()
  draw()
})
</script>

<style scoped>
.rp { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 900px; }
.rp__bar { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
.rp__t { font-size: var(--fs-lg); font-weight: var(--fw-bold); display: block; }
.rp__s { font-size: var(--fs-xs); color: var(--color-text-3); }
.print { border: none; background: var(--on-primary-bg); color: var(--on-primary-fg);
  padding: 9px 16px; border-radius: var(--r-md); cursor: pointer; font-weight: var(--fw-medium); font-size: var(--fs-sm); }
/* 数据缺失警示条：警告底色 + 深字（AA），打印时保留原色自证 */
.miss { margin: 0; background: #FFF6E0; color: #8A5B00; border: 1px solid rgba(138,91,0,.18);
  border-radius: var(--r-md); padding: 10px 14px; font-size: var(--fs-sm); }
.card { padding: var(--sp-5); }
/* 滚动叙事：默认隐去，进入视口才淡入；低配/打印由 useReveal 直接显形 */
.reveal { opacity: 0; transform: translateY(14px); transition: opacity var(--d-slow) var(--e-out), transform var(--d-slow) var(--e-out); }
.reveal.is-in { opacity: 1; transform: none; }
.h { font-size: var(--fs-md); font-weight: var(--fw-bold); margin-bottom: var(--sp-2); }
.lead { font-size: var(--fs-sm); color: var(--color-text-2); line-height: 1.8; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--sp-3); margin-top: var(--sp-3); }
.kpi { text-align: center; background: var(--color-fill-1); border-radius: var(--r-md); padding: 10px 4px; }
.kpi b { display: block; font-size: var(--fs-lg); font-variant-numeric: tabular-nums; }
.kpi small { font-size: var(--fs-xs); color: var(--color-text-3); }
.chart { height: 260px; }
.weak { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: var(--sp-3); }
.wchip { font-size: var(--fs-xs); background: var(--color-primary-soft); color: var(--color-primary-strong);
  padding: 3px 10px; border-radius: var(--r-pill); }
/* .tbl / .num 已收编为 global.css 全局表格（R4 裁决1，照 .alert 收编先例） */
.flat { margin: var(--sp-2) 0 0; padding-left: 18px; font-size: var(--fs-sm); color: var(--color-text-2); line-height: 1.9; }
.muted { color: var(--color-text-3); }
.note { font-size: var(--fs-xs); color: var(--color-text-3); margin-top: var(--sp-2); line-height: 1.8; }
.more { font-size: var(--fs-xs); margin-top: var(--sp-2); }
.more > summary { cursor: pointer; color: var(--color-primary-ontext); }

/* 打印：去玻璃与阴影、章节不跨页；.no-print 已收编为 global.css 打印工具类 */
@media print {
  .rp { max-width: none; gap: 12px; }
  .card { background: #fff !important; box-shadow: none !important; border: 1px solid #ddd;
    -webkit-backdrop-filter: none !important; backdrop-filter: none !important; break-inside: avoid; }
  .reveal { opacity: 1 !important; transform: none !important; }
}
</style>
