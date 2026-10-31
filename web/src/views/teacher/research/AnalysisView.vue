<!-- @copyBudget 60  教研·分析：班级群体数据（dense） -->
<template>
  <div class="ana">
    <!-- 取数失败：明说 + 可重试，不能拿空数据画一张"全 0 但看起来正常"的图 -->
    <p v-if="error" class="alert">
      <span>{{ error }}</span>
      <button class="retry" @click="retry">重试</button>
    </p>

    <div class="row">
      <GlassPanel class="card">
        <h3 class="t">班级计算思维六维 <span class="chip chip--muted">样本 {{ classCtN }} 人</span></h3>
        <!-- 骨架对读屏也要有交代：role=status 报「加载中」，不然这一格是空白 -->
        <div v-if="loading" class="skeleton skl-chart" role="status" aria-label="图表加载中" />
        <p v-else-if="noData" class="empty">暂无足够数据，学生开始编程后自动生成</p>
        <!-- 图表 aria（R4 裁决4）：缺维读「暂无数据」不读 0 分——两种完全不同的事实 -->
        <div v-else ref="radarEl" class="chart" role="img" :aria-label="radarAria" />
      </GlassPanel>
      <GlassPanel class="card">
        <h3 class="t">学习任务漏斗</h3>
        <div v-if="loading" class="skeleton skl-chart" role="status" aria-label="图表加载中" />
        <div v-else ref="funnelEl" class="chart" role="img" :aria-label="funnelAria" />
      </GlassPanel>
    </div>

    <GlassPanel>
      <h3 class="t">六维明细</h3>
      <ul class="dims">
        <li v-for="d in dims" :key="d.key">
          <img :src="asset(d.key)" class="dims__ic" alt="" />
          <span>{{ d.label }}</span>
          <i class="bar"><i :style="{ width: (d.v ?? 0) + '%' }" /></i>
          <b>{{ d.v ?? '—' }}</b>
        </li>
      </ul>
    </GlassPanel>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue'
import echarts from '@/utils/echartsLite'
import { asset } from '@/assets/assets'
import { useTeacherHome } from '@/composables/useTeacherHome'
import { animationsOn } from '@/composables/useDeviceCapability'
import { CHART_COLORS, CHART_GRID, CHART_AXIS } from '@/constants/chartTheme'
import GlassPanel from '@/components/ui/GlassPanel.vue'

const { classCt, classCtN, funnel, load, error, loading } = useTeacherHome()
const radarEl = ref<HTMLElement>()
const funnelEl = ref<HTMLElement>()

const DIMS = [
  { key: 'ct_decompose', sk: 'decompose', label: '分解' },
  { key: 'ct_abstract', sk: 'abstract', label: '抽象' },
  { key: 'ct_model', sk: 'model', label: '建模' },
  { key: 'ct_algorithm', sk: 'algorithm', label: '算法设计' },
  { key: 'ct_verify', sk: 'verify', label: '验证优化' },
  { key: 'ct_transfer', sk: 'transfer', label: '迁移' },
]
/** 缺维保持 null（明细显「—」）：`?? 0` 会把"没数据"画成"得了 0 分"，是两种完全不同的事实 */
const dims = computed(() => DIMS.map((d) => ({ ...d, v: ((classCt.value as any)?.[d.sk] ?? null) as number | null })))
/** 全 0 门禁：没有有效样本、或六维全缺时不画雷达——空图会被读成"班级全面垫底" */
const noData = computed(() => !classCtN.value || dims.value.every((d) => d.v === null))

/* 图表 aria（R4 裁决4）：从已有数据拼自然中文；缺维读「暂无数据」，与明细「—」同一口径 */
const radarAria = computed(
  () =>
    `班级计算思维六维雷达图（样本 ${classCtN.value} 人）：` +
    dims.value.map((d) => (d.v === null ? `${d.label}暂无数据` : `${d.label} ${d.v} 分`)).join('、'),
)
const funnelAria = computed(() => {
  const f = funnel.value
  return f
    ? `学习任务漏斗图：进入 ${f.entered} 人、运行 ${f.ran} 人、修复 ${f.fixed} 人、迁移 ${f.transferred} 人`
    : '学习任务漏斗图：漏斗数据未取到'
})

// chart 实例缓存：防重复 init；v-if 重挂后旧实例绑在已卸载的节点上，先弃再建
let radarChart: ReturnType<typeof echarts.init> | null = null
let funnelChart: ReturnType<typeof echarts.init> | null = null

function draw() {
  if (radarEl.value) {
    if (radarChart && radarChart.getDom() !== radarEl.value) { radarChart.dispose(); radarChart = null }
    radarChart ??= echarts.init(radarEl.value)
    radarChart.setOption({
      animation: animationsOn(),
      radar: {
        indicator: DIMS.map((d) => ({ name: d.label, max: 100 })), radius: '64%',
        axisName: { color: CHART_AXIS, fontSize: 11 },
        splitArea: { areaStyle: { color: ['rgba(255,255,255,.5)', 'rgba(255,255,255,.2)'] } },
        splitLine: { lineStyle: { color: CHART_GRID } }, axisLine: { lineStyle: { color: CHART_GRID } },
      },
      series: [{ type: 'radar', data: [{ value: dims.value.map((d) => d.v ?? 0),
        areaStyle: { color: 'rgba(51,112,255,.25)' }, lineStyle: { color: CHART_COLORS[0] }, itemStyle: { color: CHART_COLORS[1] } }] }],
    })
  }
  const f = funnel.value
  if (funnelEl.value && f) {
    if (funnelChart && funnelChart.getDom() !== funnelEl.value) { funnelChart.dispose(); funnelChart = null }
    funnelChart ??= echarts.init(funnelEl.value)
    funnelChart.setOption({
      animation: animationsOn(), tooltip: { trigger: 'item' },
      series: [{ type: 'funnel', left: 10, right: 10, top: 10, bottom: 10, minSize: '24%',
        label: { position: 'inside' },
        data: [
          { value: f.entered, name: '进入 ' + f.entered }, { value: f.ran, name: '运行 ' + f.ran },
          { value: f.fixed, name: '修复 ' + f.fixed }, { value: f.transferred, name: '迁移 ' + f.transferred },
        ],
        color: CHART_COLORS }],
    })
  }
}

/** 重试：强刷共享数据后等 DOM（骨架 → 图表容器）换完再画 */
async function retry() {
  await load(true)
  await nextTick()
  draw()
}

onMounted(async () => { await load(); await nextTick(); draw() })
watch(classCt, () => nextTick(draw))
</script>

<style scoped>
.ana { display: flex; flex-direction: column; gap: var(--sp-4); }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-4); }
.t { font-size: var(--fs-md); font-weight: var(--fw-bold); margin-bottom: var(--sp-2); }
.t .chip { margin-left: 6px; vertical-align: 2px; }
.chart { height: 260px; }
.skl-chart { height: 260px; }
.empty { height: 260px; display: flex; align-items: center; justify-content: center; margin: 0;
  color: var(--color-text-3); font-size: var(--fs-sm); }
/* .alert / .retry 已收编为 global.css 全局错误条 */
.dims { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 20px; }
.dims li { display: flex; align-items: center; gap: 8px; font-size: var(--fs-sm); color: var(--color-text-2); }
.dims__ic { width: 24px; height: 24px; }
.bar { flex: 1; height: 6px; background: var(--chart-grid); border-radius: var(--r-pill); overflow: hidden; }
.bar > i { display: block; height: 100%; background: var(--color-primary); border-radius: var(--r-pill);
  transition: width var(--d-slow) var(--e-out); }
.dims b { font-variant-numeric: tabular-nums; min-width: 22px; text-align: right; color: var(--color-text); }
@media (max-width: 1000px) { .row { grid-template-columns: 1fr; } .dims { grid-template-columns: 1fr; } }
</style>
