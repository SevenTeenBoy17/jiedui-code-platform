import { useAuthStore } from '@/stores/auth'

export interface PairCapabilities {
  mode: 'legacy' | 'trusted_required'
  trusted_chat_enabled: boolean
  trusted_image_enabled: false
  history_mode: 'current_question_only'
}
export interface PairRound { round_id: string; session_id?: string; round_index: number; ended_at: string | null }
export interface PairSession {
  session_id: string
  task_snapshot: { title?: string; [key: string]: unknown }
  human_role: 'driver' | 'navigator'
  status: string
  project_id: number | null
  ai_policy: { scaffold: number; socratic: boolean; policy_hash: string } | null
  actions: { can_chat: boolean; can_open_round: boolean; reason_code: string | null }
  rounds: PairRound[]
}
export type PairSessionSummary = Pick<PairSession, 'session_id' | 'task_snapshot' | 'status' | 'actions'>
export interface PairReceipt {
  status: 'pending' | 'released' | 'invalidated' | 'failed'
  reason_code?: string | null
  request_id: string
  session_id: string
  round_id: string
  project_version_id?: number | null
  version_no?: number | null
  requested_persona?: 'guide' | 'review'
  effective_role?: string
  assigned_scaffold?: number
  scaffold_applied?: boolean
  socratic?: boolean
  policy_hash?: string
  prompt_version?: string
  code_source?: string
}
export interface PairChatReply { reply: string; source: 'model' | 'fallback' | 'guard'; receipt: PairReceipt | null }
export interface PairChatRequest { request_id: string; message: string; persona: 'guide' | 'review' }

export class PairApiError extends Error {
  constructor(public status: number, public code: string, public receipt: PairReceipt | null = null) {
    super(code)
    this.name = 'PairApiError'
  }
}

// Do not surface arbitrary provider/detail bodies, or collapse every 403 into consent.
export function pairErrorText(error: { status?: number; code?: string }): string {
  const code = error.code || ''
  if (code === 'CONFIG_UNAVAILABLE') return '配置读取失败，发送已暂停。请重试读取。'
  if (code === 'REQUEST_TIMEOUT') return '等待时间较长，结果暂未确认。请按页面提示查询状态或重新读取；不会自动重发。'
  if (code === 'REQUEST_PENDING') return '结果未确认：请求仍在处理中。请先查询状态，不要重复发送。'
  if (code === 'REQUEST_RELEASED') return '服务端已处理本次请求，但本页没有收到正文。状态不代表已阅读；确认后可手动发起新问题。'
  if (code === 'REQUEST_NOT_FOUND') return '未查到本次请求，未自动重发。可手动发起新问题。'
  if (code === 'REQUEST_FAILED') return '本次请求未完成，未自动重发。请核实会话后手动提问。'
  if (code === 'OUTPUT_CONSTRAINT_FAILED') return '这次 AI 回复未通过检查，暂未展示。系统不会自动重试；你可以手动重新提问，或请老师帮助。'
  if (/CONSENT|REVOKED/.test(code)) return '本会话的授权无效或已撤回。请找老师核实监护人同意；旧会话不会自动恢复。'
  if (/EXPIRED/.test(code) || error.status === 410) return '本会话已到期，请老师建立新会话。'
  if (/ASSESSMENT/.test(code) || error.status === 423) return '独立测评期间暂停 AI 辅导。请先完成测评，再刷新会话。'
  if (code === 'POLICY_NOT_READY') return '本会话规则尚未配置，请老师配置后再刷新。'
  if (/ATTEMPT/.test(code)) return '本次任务尝试已结束或失效。请老师核实并安排新尝试。'
  if (code === 'SESSION_ENDED' || code === 'SESSION_CLOSED') return '本会话已结束，请老师安排新会话。'
  if (code === 'CONTEXT_REVIEW_REQUIRED') return '材料需要老师核实，本次未发送给 AI。请联系老师检查任务；如需修改代码，请保存新版本后再试。'
  if (/ROUND/.test(code)) return '本轮已结束或不再可用。请刷新会话，只有允许时才能开始下一轮。'
  if (code === 'CONTEXT_TOO_LARGE') return '材料超过本次可读取的范围，请缩小问题或保存的代码后再试。'
  if (error.status === 401) return '登录已失效，请重新登录后再进入会话。'
  if (error.status === 403) return '当前账号没有本次操作权限，请老师核实账号、班级和任务安排。'
  if (error.status === 404) return '会话不存在或不可访问，请核对老师提供的会话入口。'
  if (error.status === 409) return '会话状态或请求发生冲突，请先刷新会话；不会自动重发问题。'
  if (error.status === 422) return '问题或请求格式不符合要求，请缩短到 4000 字以内后再试。'
  if (error.status === 0) return '网络中断，结果未确认。请查询本次请求状态；不会自动重发。'
  return '辅导服务暂时不可用，请稍后刷新重试。'
}

const base = '/api/pair/sessions'
const idPath = (id: string) => encodeURIComponent(id)
async function request<T>(path: string, body?: object, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Client expiry does not say whether the server completed this request.
      // Reject first so an abort during body decoding still follows uncertainty recovery.
      reject(new PairApiError(0, 'REQUEST_TIMEOUT'))
      controller.abort()
    }, timeoutMs)
  })
  const exchange = async (): Promise<T> => {
    let result: Response
    try {
      const token = useAuthStore().token
      result = await fetch(base + path, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: controller.signal,
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    } catch { throw new PairApiError(0, 'NETWORK_ERROR') }
    let data: any
    try { data = await result.json() } catch { throw new PairApiError(result.ok ? 0 : result.status, 'INVALID_RESPONSE') }
    if (!result.ok) {
      const detail = data?.detail
      // Old M1a routes may still return Chinese/string errors, not a coded object.
      const legacyCode = typeof detail === 'string' && /授权已撤回/.test(detail) ? 'CONSENT_REVOKED'
        : typeof detail === 'string' && /需要有效的课堂数据授权|CONSENT_REQUIRED/.test(detail) ? 'CONSENT_REQUIRED' : 'REQUEST_REJECTED'
      throw new PairApiError(result.status, typeof detail?.code === 'string' ? detail.code : legacyCode, detail?.receipt || null)
    }
    return data as T
  }
  try {
    return await Promise.race([exchange(), deadline])
  } finally { clearTimeout(timer) }
}

export const pairSessionsApi = {
  async getCapabilities(): Promise<PairCapabilities> {
    const value = await request<PairCapabilities>('/capabilities')
    if (!['legacy', 'trusted_required'].includes(value?.mode) || typeof value?.trusted_chat_enabled !== 'boolean'
      || value.trusted_image_enabled !== false || value.history_mode !== 'current_question_only') throw new PairApiError(503, 'CONFIG_UNAVAILABLE')
    return value
  },
  getAvailableSessions: () => request<{ sessions: PairSessionSummary[] }>('/available'),
  getSession: (id: string) => request<PairSession>(`/${idPath(id)}`),
  openRound: (id: string, request_id: string) => request<PairRound>(`/${idPath(id)}/rounds`, { request_id }),
  chat: (sid: string, rid: string, payload: PairChatRequest) => request<PairChatReply>(`/${idPath(sid)}/rounds/${idPath(rid)}/chat`, {
    request_id: payload.request_id, message: payload.message, persona: payload.persona,
  }, 90_000),
  getRequestStatus: (sid: string, requestId: string) => request<PairReceipt>(`/${idPath(sid)}/ai-requests/${idPath(requestId)}`),
}
