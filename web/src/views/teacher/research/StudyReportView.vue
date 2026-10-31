<!-- @copyBudget 150  教研·课题结论：可直接抄进结题报告。本页是"文档"不是应用界面，故放宽文案预算（同 ReportView 先例） -->
<template>
  <div v-if="rep" class="rp">
    <!-- 页头组件化（R6 裁决5）：back 回课题列表；title 用课题名（meta.title 是通名，此页传显式 title） -->
    <PageHead back="/teacher/research/study" backLabel="返回课题列表" :title="rep.study.title" :desc="sub">
      <button class="print no-print" @click="print">打印 / 存 PDF</button>
    </PageHead>

    <!-- ① 大白话结论 -->
    <GlassPanel class="lead">
      <p class="lead__t">{{ rep.plain.headline }}</p>
    </GlassPanel>

    <!-- ② 三张卡：起点 / 现在 / 进步 -->
    <BentoGrid min="230px">
      <GlassPanel v-for="c in cards" :key="c.k" class="card">
        <b class="card__t">{{ c.k }}</b>
        <div class="two">
          <span class="two__i"><i>实验组</i><b>{{ c.exp }}</b></span>
          <span class="two__i"><i>对照组</i><b>{{ c.ctrl }}</b></span>
        </div>
        <p class="thin">{{ c.note }}</p>
      </GlassPanel>
    </BentoGrid>

    <!-- ③ 六维雷达：过程指标 -->
    <GlassPanel>
      <b class="sec">干预期内的行为表现（过程指标）</b>
      <p class="thin">这一段解释「为什么会有差异」，不能单独当作能力提升的证据。</p>
      <!-- 图表 aria（R4 裁决4）：双系列按「维度：实验组X、对照组Y」成对读，读屏拿到的对比信息和看图等价 -->
      <div ref="radarEl" class="chart" role="img" :aria-label="radarAria" />
    </GlassPanel>

    <!-- ④ 给论文用的写法 -->
    <details class="fold" open>
      <summary>给论文用的写法</summary>
      <p v-for="(w, i) in rep.writeup" :key="i" class="para">{{ w }}</p>
      <!-- α 范畴修正（升级方案 L47）：α 只作同质性参考值，不作信度主张 —— 能力卷六维异质是设计而非缺陷 -->
      <p class="para thin">测量工具 α 参考值（同质性参考，非信度主张）：前测 α={{ fmt(rep.assess.alpha_reference.pre) }}、后测 α={{ fmt(rep.assess.alpha_reference.post) }}；
        工具质量证据见逐题难度与区分度（item_stats）。
        两组增值之差 {{ fmt(rep.assess.between_gain_diff) }}<span v-if="rep.assess.cohens_d !== null">，Cohen's d={{ rep.assess.cohens_d }}</span>。</p>
      <!-- 效度小节（后端并行契约）：validity 缺失时整节不渲染（旧报告兼容）。
           r 是与外部标准相关的估计——note 定位说明（「估计不是检验」）必须原样呈现，写论文的人要看见 -->
      <template v-if="validityRows.length || validityNote">
        <p class="para"><b>效度参考</b></p>
        <p v-for="row in validityRows" :key="row.phase" class="para">
          {{ row.phase }}：{{ row.overall }}
          <span v-if="row.dims" class="vdims">{{ row.dims }}</span>
        </p>
        <p v-if="validityNote" class="para thin">{{ validityNote }}</p>
      </template>
    </details>

    <!-- ⑤ 边界：必须一起打印 -->
    <details class="fold" open>
      <summary>这份结论的边界（写报告时必须一并说明）</summary>
      <ul class="cav">
        <li v-for="(c, i) in rep.caveats" :key="i">{{ c }}</li>
      </ul>
    </details>

    <!-- ⑥ 样本与流失 -->
    <details class="fold">
      <summary>样本与流失</summary>
      <!-- .tbl-scroll（R6 裁决7）：窄屏横向滚动；本表在 details 里不受 sticky 吸附影响 -->
      <div class="tbl-scroll">
      <table class="tbl">
        <thead><tr><th>组</th><th>分配</th><th>退出</th><th>已签同意</th><th>做了前测</th><th>做了后测</th><th>前后都做</th></tr></thead>
        <tbody>
          <tr v-for="g in (['exp', 'ctrl'] as const)" :key="g">
            <td>{{ g === 'exp' ? '实验组' : '对照组' }}</td>
            <td>{{ rep.attrition[g].assigned }}</td><td>{{ rep.attrition[g].withdrawn }}</td>
            <td>{{ rep.attrition[g].consent_ok }}</td><td>{{ rep.attrition[g].pre_done }}</td>
            <td>{{ rep.attrition[g].post_done }}</td><td>{{ rep.attrition[g].both }}</td>
          </tr>
        </tbody>
      </table>
      </div>
    </details>

    <div class="dl no-print">
      <button class="ok" @click="dl('wide')">下载数据（CSV）</button>
      <button class="cancel" @click="dl('json')">下载数据（JSON）</button>
      <span v-if="dlErr" class="thin">{{ dlErr }}</span>
    </div>
  </div>
  <p v-else-if="err" class="alert">{{ err }}</p>
  <p v-else class="thin">读取中…</p>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { studyApi, type StudyReport, type ValidityStat, type ValidityPhase } from '@/api/study'
import { ApiError } from '@/api/http'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import BentoGrid from '@/components/ui/BentoGrid.vue'
import PageHead from '@/components/ui/PageHead.vue'

const ASSIGN: Record<string, string> = { intact: '原有教学班整群分配', random: '随机分配' }
const DIM_CN: Record<string, string> = {
  decompose: '分解', abstract: '抽象', model: '建模',
  algorithm: '算法设计', verify: '验证优化', transfer: '迁移',
}

const route = useRoute()
const sid = Number(route.params.sid)
const rep = ref<StudyReport | null>(null)
const err = ref('')
const dlErr = ref('')
const radarEl = ref<HTMLElement>()

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v)
const span = computed(() => {
  const s = rep.value?.study
  if (!s?.started_at) return '未开始'
  const d = (t: number) => new Date(t * 1000).toLocaleDateString('zh-CN')
  return `${d(s.started_at)} — ${s.ended_at ? d(s.ended_at) : '进行中'}`
})
/** 页头副标（PageHead 的 desc）：时间跨度 · 分配方式 */
const sub = computed(() => {
  const s = rep.value?.study
  return s ? `${span.value} · ${ASSIGN[s.assign_method] || s.assign_method}` : ''
})

const cards = computed(() => {
  const a = rep.value!.assess
  return [
    { k: '起点（前测均分）', exp: a.exp.mean, ctrl: a.ctrl.mean, note: `实验组 n=${a.exp.n}，对照组 n=${a.ctrl.n}` },
    { k: '现在（后测均分）', exp: a.exp.post_mean, ctrl: a.ctrl.post_mean, note: `实验组 n=${a.exp.post_n}，对照组 n=${a.ctrl.post_n}` },
    { k: '进步（增值）', exp: a.exp.gain_mean, ctrl: a.ctrl.gain_mean, note: `前后都做的人数：${a.exp.n_paired} / ${a.ctrl.n_paired}` },
  ]
})

// —— 效度小节（给论文用的写法）——
const PHASE_CN: Record<string, string> = { pre: '前测', post: '后测', probe: '轮次小测（probe）' }
/** 效度一行文案：r=0.42 [0.12, 0.65]，n=14；r 为 null = 样本不足未算（估计不是检验，不给显著性星号） */
function fmtV(s: ValidityStat | undefined): string {
  if (!s) return '—'
  if (s.r === null || s.r === undefined) return `样本不足未算（n=${s.n}）`
  const ci = Array.isArray(s.ci) && s.ci.length === 2 ? ` [${s.ci[0].toFixed(2)}, ${s.ci[1].toFixed(2)}]` : ''
  return `r=${s.r.toFixed(2)}${ci}，n=${s.n}`
}
/** validity 契约：phase 键与 note 并列（{probe:{overall,by_dim}, note}）；也兼容包一层 phases 的落地形态 */
const validityRows = computed(() => {
  const v = rep.value?.validity
  if (!v) return []
  const raw = v as Record<string, unknown>
  const nested = raw.phases
  const src = nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Record<string, unknown>) : raw
  const rows: { phase: string; overall: string; dims: string }[] = []
  for (const [k, p] of Object.entries(src)) {
    if (k === 'note' || !p || typeof p !== 'object' || !('overall' in p)) continue
    const ph = p as ValidityPhase
    rows.push({
      phase: PHASE_CN[k] || k,
      overall: fmtV(ph.overall),
      // 四要素 by_dim 小字排列；键名后端可能直接给中文（同 report_dims 先例），英文键走 DIM_CN 兜底
      dims: Object.entries(ph.by_dim ?? {}).map(([d, s]) => `${DIM_CN[d] || d} ${fmtV(s)}`).join('；'),
    })
  }
  return rows
})
const validityNote = computed(() => rep.value?.validity?.note ?? '')

/* 图表 aria（R4 裁决4）：双系列雷达按「维度：实验组X、对照组Y」成对读 */
const radarAria = computed(() => {
  const iv = rep.value?.process
  if (!iv) return '干预期行为表现雷达图：暂无过程数据'
  const val = (g: 'exp' | 'ctrl', d: string) => iv[g]?.intervention?.[d] ?? 0
  return (
    '干预期行为表现雷达图，' +
    Object.keys(DIM_CN)
      .map((d) => `${DIM_CN[d]}：实验组 ${val('exp', d)}、对照组 ${val('ctrl', d)}`)
      .join('；')
  )
})

async function drawRadar() {
  const iv = rep.value?.process
  if (!iv || !radarEl.value) return
  const echarts = (await import('@/utils/echartsLite')).default   // 动态导入精简入口：ECharts 不进首屏 chunk
  const chart = echarts.init(radarEl.value)
  const dims = Object.keys(DIM_CN)
  const pick = (g: 'exp' | 'ctrl') => dims.map((d) => iv[g]?.intervention?.[d] ?? 0)
  chart.setOption({
    tooltip: {},
    legend: { data: ['实验组', '对照组'], bottom: 0 },
    radar: { indicator: dims.map((d) => ({ name: DIM_CN[d], max: 100 })), radius: '62%' },
    series: [{
      type: 'radar',
      data: [
        { value: pick('exp'), name: '实验组' },
        { value: pick('ctrl'), name: '对照组' },
      ],
    }],
  })
}

async function dl(fmtKind: 'wide' | 'json') {
  dlErr.value = ''
  try {
    await studyApi.download(sid, fmtKind)
  } catch (e) {
    dlErr.value = e instanceof Error ? e.message : '导出失败'
  }
}

const print = () => window.print()

onMounted(async () => {
  try {
    rep.value = await studyApi.report(sid)
    await nextTick()
    await drawRadar()
  } catch (e) {
    err.value = e instanceof ApiError ? e.message : '结论读取失败'
  }
})
</script>

<style scoped>
.rp { display: flex; flex-direction: column; gap: var(--sp-3); }
/* 页头（含返回链接）已组件化为 PageHead：.crumb/.hd 系列 scoped 样式随之删除 */
.print { border: none; background: var(--ink-a06); color: var(--color-text-2);
  font-size: var(--fs-xs); padding: 6px 14px; border-radius: var(--r-pill); cursor: pointer; }
.lead__t { font-size: var(--fs-md); line-height: 1.9; }
.card { display: flex; flex-direction: column; gap: 6px; }
.card__t { font-size: var(--fs-sm); font-weight: var(--fw-bold); }
.two { display: flex; gap: var(--sp-4); }
.two__i { display: flex; flex-direction: column; }
.two__i i { font-style: normal; font-size: var(--fs-xs); color: var(--color-text-3); }
.two__i b { font-size: var(--fs-lg); font-variant-numeric: tabular-nums; }
.sec { font-size: var(--fs-sm); font-weight: var(--fw-bold); }
.thin { font-size: var(--fs-xs); color: var(--color-text-3); line-height: 1.8; }
/* .alert 已收编为 global.css 全局错误条 */
.chart { height: 300px; margin-top: var(--sp-2); }
.fold { font-size: var(--fs-sm); break-inside: avoid; }
.fold > summary { cursor: pointer; color: var(--color-primary-ontext); font-weight: var(--fw-medium); }
.para { font-size: var(--fs-sm); color: var(--color-text-2); line-height: 2; margin-top: 8px; }
/* 效度小节：四要素 by_dim 换行小字排列，与主行（overall）区分层级 */
.vdims { display: block; font-size: var(--fs-xs); color: var(--color-text-3); line-height: 1.9; }
.cav { margin: 8px 0 0; padding-left: 18px; }
.cav li { font-size: var(--fs-sm); color: var(--color-text-2); line-height: 1.9; margin-bottom: 6px; }
/* .tbl 已收编为 global.css 全局表格（R4 裁决1，照 .alert 收编先例） */
.dl { display: flex; align-items: center; gap: var(--sp-2); }
.ok { border: none; background: var(--on-primary-bg); color: var(--on-primary-fg); padding: 9px 18px;
  border-radius: var(--r-md); cursor: pointer; font-weight: var(--fw-medium); font-size: var(--fs-sm); }
.cancel { border: none; background: var(--ink-a06); color: var(--color-text-2); padding: 9px 18px;
  border-radius: var(--r-md); cursor: pointer; font-size: var(--fs-sm); }

@media print {
  /* 打印即结题附件：去掉玻璃阴影，章节不跨页断开，
     **边界清单必须一起打印** —— 不给它加 .no-print。
     .no-print 本身已收编为 global.css 打印工具类（PageHead 内的返回链接跨作用域，scoped 版够不着） */
  .rp :deep(.glass) { box-shadow: none; backdrop-filter: none; background: #fff; }
  .fold { break-inside: avoid; }
}
</style>
