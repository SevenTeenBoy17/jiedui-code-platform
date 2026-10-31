/** 计算思维过程评价 API（§4.6）。 */
import { useAuthStore } from '@/stores/auth'
import { requestOr } from '@/api/http'

export interface CtSummary {
  runs: number; errors: number; fixes: number; ai_helps: number
  role_switches: number; designs: number
  success_rate: number; minutes: number
  /** 教师视角才有：六维分值。学生端一律不下发（分数会诱导学生刷行为，而行为正是研究的过程数据） */
  ct_scores?: { decompose: number; abstract: number; model: number; algorithm: number; verify: number; transfer: number }
  /** 学生视角：六维**相对强弱**，没有可追逐的数字 */
  ct_rank?: { dim: string; band: number; label: string }[]
  path: { type: string; detail: string; ts: number }[]
  timeline: { type: string; detail: string; ts: number }[]
  has_real_data: boolean
  evidence_count: number
}
/** 错题：按报错文本归集，反复犯的排在前面 */
export interface Mistake { text: string; count: number; first_at: number; last_at: number }

function authH(json = true): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${useAuthStore().token}` }
  if (json) h['Content-Type'] = 'application/json'
  return h
}

export const ctApi = {
  /** 埋点上报（fire-and-forget，失败静默不打断学习）。
      opts.reason 仅 role_switch 用（forced/negotiated，Zhong 2017 轮换机制检验源）；roomId 归房。
      opts.lang / opts.editMode 是**创作情境协变量**：design_create 只在「Python + 积木模式」下
      才可能触发，不带这两个字段就永远分不开「没建模」与「在代码模式下做了但测不到」。
      服务端白名单校验，脏值置 NULL；不在 IDE 情境下的埋点不必传。 */
  track(type: string, detail?: string, projectId?: number | null,
        opts: { reason?: string; roomId?: string; lang?: string; editMode?: string } = {}) {
    fetch('/api/ct/events', {
      method: 'POST', headers: authH(),
      body: JSON.stringify({
        type, detail, projectId, reason: opts.reason, roomId: opts.roomId,
        lang: opts.lang, editMode: opts.editMode,
      }),
    }).catch(() => {})
  },
  /** 错题本：按报错文本归集的真实记录（不是占位文案）。经 requestOr：401 统一跳登录 */
  async mistakes(userId?: string): Promise<{ items: Mistake[]; total: number }> {
    const q = userId ? `?user_id=${encodeURIComponent(userId)}` : ''
    return requestOr(`/api/ct/mistakes${q}`, { items: [], total: 0 })
  },
  /** 同上，但失败返回 null —— 学生端要把「接口挂了」和「没有错题」分开画 */
  async mistakesOrNull(userId?: string): Promise<{ items: Mistake[]; total: number } | null> {
    const q = userId ? `?user_id=${encodeURIComponent(userId)}` : ''
    return requestOr<{ items: Mistake[]; total: number } | null>(`/api/ct/mistakes${q}`, null)
  },
  /** null = 没取到（调用方显示 — 号或错误态，不装作零数据）。经 requestOr：401 统一跳登录 */
  async summary(userId?: string): Promise<CtSummary | null> {
    const q = userId ? `?user_id=${encodeURIComponent(userId)}` : ''
    return requestOr<CtSummary | null>(`/api/ct/summary${q}`, null)
  },
  /** 报告层画像（教师）：六内部维折叠成四报告维（对外口径，neutral）。transfer 只在 internal 备查。 */
  async report(userId: string): Promise<CtReport | null> {
    return requestOr<CtReport | null>(`/api/ct/report?user_id=${encodeURIComponent(userId)}`, null)
  },
}

export interface CtReport {
  report_version: string
  formula_version: string
  scoring_profile: string
  student_id: string
  has_real_data: boolean
  evidence_count: number
  internal_dims: Record<string, number>
  /** 键为中文四要素：问题分解 / 抽象建模 / 算法设计 / 调试评估 */
  report_dims: Record<string, number>
}
