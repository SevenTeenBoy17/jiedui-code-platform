/** 课题研究 API（V6）：分组 → 前测 → 干预期 → 后测 → 对比结论 → 去标识化导出。 */
import { request } from '@/api/http'
import { useAuthStore } from '@/stores/auth'

const req = <T>(path: string, init?: RequestInit) => request<T>(`/api/research${path}`, init)

export type Phase = 'draft' | 'pretest' | 'running' | 'posttest' | 'closed'

export interface NextAction { key: string; label: string; hint: string }
export interface Study {
  id: number; title: string; question: string; phase: Phase
  assign_method: string; scoring_profile: string; formula_version: string
  exp_class_ids: number[]; ctrl_class_ids: number[]
  exp_class_names: string[]; ctrl_class_names: string[]
  started_at: number | null; ended_at: number | null
  pre_assessment_id: number | null; post_assessment_id: number | null
  forced_start: number
  next_action: NextAction
  n: { exp: number; ctrl: number }
  consent_missing: string[]
  pre_progress: { done: number; total: number }
  post_progress: { done: number; total: number }
  fidelity: { breaks: { class_id: number; expected: boolean; actual: boolean }[]; forced_start: boolean }
}

export interface GroupResult {
  n: number; mean: number; sd: number; dims: Record<string, number>
  post_n: number; post_mean: number; post_sd: number; post_dims: Record<string, number>
  n_paired: number; gain_mean: number; gain_sd: number
}
/** 效度统计（与外部标准的相关）：r 为 null = 样本不足未算；ci 为 95% 置信区间 [下, 上] */
export interface ValidityStat { r: number | null; ci: [number, number] | null; n: number }
export interface ValidityPhase { overall: ValidityStat; by_dim: Record<string, ValidityStat> }
/**
 * validity 块（后端并行契约）：phase 名（pre/probe/post…）→ {overall, by_dim}，note 与 phase 并列。
 * note 是定位说明（「估计不是检验」）——前端必须原样展示给写论文的人，不得改写省略。
 */
export type ValidityBlock = { note?: string } & Record<string, ValidityPhase | string | undefined>

export interface StudyReport {
  study: { id: number; title: string; question: string; phase: Phase; assign_method: string
    started_at: number | null; ended_at: number | null; scoring_profile: string; formula_version: string }
  plain: { headline: string }
  assess: {
    exp: GroupResult; ctrl: GroupResult
    between_gain_diff: number | null; cohens_d: number | null
    // α 范畴修正（升级方案 L47）：alpha 更名 alpha_reference —— 同质性参考值，非信度主张；
    // 能力卷的工具质量主张改由 item_stats（逐题通过率/点二列区分度）承担。
    alpha_reference: { pre: number | null; post: number | null }
    item_stats: Record<'pre' | 'post', { difficulty: number[]; discrimination: (number | null)[] }>
  }
  process: Record<'exp' | 'ctrl', Record<string, Record<string, number>>>
  attrition: Record<'exp' | 'ctrl', Record<string, number>>
  fidelity: Study['fidelity']
  caveats: string[]
  writeup: string[]
  // 效度块（可缺省兼容旧报告）：缺失时「给论文用的写法」里的效度小节整节不渲染
  validity?: ValidityBlock | null
}

export interface PaperItem { id: number; stem: string; options: string[]; level: number }
export interface Paper { id: number; title: string; kind: string; item_count: number; items: PaperItem[] }
export interface MyAssessment {
  assessment_id: number; title: string; kind: string; item_count: number
  target_id: number; done: boolean
  // probe 卷绑定的轮序（1-3，服务端 assessment.round_id 即轮序）；pre/post 无轮为 null
  round_id?: number | null
  // 蓝图 3.1 扩展位（后端并行补充中，可空兼容）：截止时间 / 交卷时间（秒）
  due?: number | null
  done_at?: number | null
}

/** 轮次小测（probe）状态行（蓝图 2.1：running 期子事件，轮 1-3） */
export interface ProbeRoundStat {
  round_index: number
  status: 'idle' | 'open' | 'closed'
  submitted: number
  total: number
}

export const studyApi = {
  list: () => req<{ items: Study[] }>('/studies').then((r) => r.items),
  get: (sid: number) => req<Study>(`/studies/${sid}`),
  create: (d: { title?: string; question?: string; assign_method?: string
    exp_class_ids: number[]; ctrl_class_ids: number[] }) =>
    req<{ id: number }>('/studies', { method: 'POST', body: JSON.stringify(d) }),
  remove: (sid: number) => req<any>(`/studies/${sid}`, { method: 'DELETE' }),

  /** 状态机推进。start 可能返回 {blocked:true}（前测没收齐），由调用方决定是否 force */
  step: (sid: number, key: string, body: Record<string, unknown> = {}) =>
    req<any>(`/studies/${sid}/${key}`, { method: 'POST', body: JSON.stringify(body) }),
  report: (sid: number) => req<StudyReport>(`/studies/${sid}/report`),

  /** 导出走 blob，文件名从 Content-Disposition 取 */
  async download(sid: number, format: 'wide' | 'json' = 'wide') {
    const r = await fetch(`/api/research/studies/${sid}/export?format=${format}`, {
      headers: { Authorization: `Bearer ${useAuthStore().token}` },
    })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || '导出失败')
    const blob = await r.blob()
    const name = /filename=([^;]+)/.exec(r.headers.get('Content-Disposition') || '')?.[1]
      || `study_${sid}.${format === 'json' ? 'json' : 'csv'}`
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    a.click()
    URL.revokeObjectURL(a.href)
  },

  /** 研究退出登记（伦理红线：随时可退、必须留因）。后端并行契约：student_id + reason */
  withdraw: (sid: number, student_id: string, reason: string) =>
    req<{ ok?: boolean }>(`/studies/${sid}/withdraw`, {
      method: 'POST', body: JSON.stringify({ student_id, reason }),
    }),

  // —— 轮次小测（probe，蓝图 2.1/3.2）：发放/回收按轮走，学生分数不回显 ——
  probeRounds: (sid: number) =>
    req<{ items: ProbeRoundStat[] }>(`/studies/${sid}/probe`).then((r) => r.items),
  probeOpen: (sid: number, round_index: number) =>
    req<{ ok?: boolean }>(`/studies/${sid}/probe/open`, { method: 'POST', body: JSON.stringify({ round_index }) }),
  probeClose: (sid: number, round_index: number) =>
    req<{ ok?: boolean }>(`/studies/${sid}/probe/close`, { method: 'POST', body: JSON.stringify({ round_index }) }),

  // —— 学生端 ——
  mine: () => req<{ items: MyAssessment[] }>('/my/assessments').then((r) => r.items),
  paper: (aid: number) => req<Paper>(`/my/assessments/${aid}`),
  /** 红线（蓝图第五章）：分数不下发学生 —— 交卷响应只认 ok，total/max/dim_scores 不进类型、不消费 */
  submit: (aid: number, d: { answers: number[]; duration_sec: number; target_id?: number | null }) =>
    req<{ ok: boolean }>(`/my/assessments/${aid}/submit`, { method: 'POST', body: JSON.stringify(d) }),
}
