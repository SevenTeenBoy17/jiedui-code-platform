/** 合规 API（§4.9）：监护人同意、使用时长。

一律走 http.ts 的 request()：401 统一跳登录，其余失败**如实返回「未知」**。
原来 consentStatus 把 401/断网一律 catch 成 false —— 而 false 在界面上的含义是
「监护人未同意」，会对一个老师已核验过的学生弹出全屏阻断门禁。
失败就是失败，不能翻译成一个恰好同型的业务事实。 */
import { request, requestOr, ApiError } from '@/api/http'

/** 查阅权的返回形状。items 含 n=0 的类别 —— 「这一类没有你的数据」也是查阅权要回答的问题。 */
export interface MyData {
  total_rows: number
  items: { category: string; what: string; n: number }[]
  retained: { category: string; column: string; why: string }[]
  notes: { retained: string; exported: string }
}

export const complianceApi = {
  /** null = 状态未知（服务器打不通）。门禁只在**确凿 false** 时出现；
      未知态放行由服务端兜底 —— 学生若真没同意，第一次对话就会被 403 拦回来。 */
  async consentStatus(): Promise<boolean | null> {
    try {
      return (await request<{ granted: boolean }>('/api/consent')).granted
    } catch {
      return null
    }
  },
  /**
   * 学生侧**只能发起申请**，不能自签（PIPL 第 31 条：监护人同意由教师核验纸质件后登记）。
   * 后端返回 {granted:false, pending:true, message}，这里必须把整个结果透出去 ——
   * 早先只返回 `r.ok`，界面就表现得像已经开通了，而学生其实仍然用不了 AI，
   * 也不知道自己该去把同意书交给老师。
   */
  async requestConsent(guardian = '监护人'): Promise<{ granted: boolean; pending: boolean; message: string }> {
    try {
      const d = await request<{ granted: boolean; pending: boolean; message?: string }>(
        '/api/consent', { method: 'POST', body: JSON.stringify({ guardian }) })
      return { granted: !!d.granted, pending: !!d.pending, message: d.message || '' }
    } catch (e) {
      const msg = e instanceof ApiError && e.status ? '提交失败，请稍后再试' : '连不上服务器，请稍后再试'
      return { granted: false, pending: false, message: msg }
    }
  },
  // —— 个人信息主体权利（PIPL 第 44–47 条）——
  // 查阅/复制是本人自助；删除只能申请，由教师核验后执行（同监护人同意的形态，且删除不可撤销）。

  /** 查阅权：我身上存了哪些类别的数据、各多少条。null = 没取到（与「没有数据」不同）。 */
  async myData(): Promise<MyData | null> {
    return requestOr<MyData | null>('/api/my/data', null)
  },

  /** 可携带权：下载本人原始数据副本。**不脱敏** —— 对数据主体本人脱敏没有意义。 */
  async exportMyData(): Promise<unknown | null> {
    return requestOr<unknown | null>('/api/my/data/export', null)
  },

  /** 删除申请。返回 pending 表示已通知教师，**尚未删除** —— 界面不能说成「已删除」。 */
  async requestErasure(): Promise<{ pending: boolean; rowsPending: number; message: string }> {
    try {
      const d = await request<{ pending: boolean; rows_pending: number; message?: string }>(
        '/api/my/data/erasure', { method: 'POST' })
      return { pending: !!d.pending, rowsPending: d.rows_pending || 0, message: d.message || '' }
    } catch (e) {
      const msg = e instanceof ApiError && e.status ? '提交失败，请稍后再试' : '连不上服务器，请稍后再试'
      return { pending: false, rowsPending: 0, message: msg }
    }
  },

  /** 撤回同意。注意后端返回 data_deleted:false —— 撤回**不删数据**，界面必须照实说。 */
  async withdrawConsent(): Promise<{ dataDeleted: boolean; message: string }> {
    const d = await request<{ data_deleted: boolean; message?: string }>(
      '/api/consent', { method: 'DELETE' })
    return { dataDeleted: !!d.data_deleted, message: d.message || '' }
  },

  /** 心跳 fire-and-forget；401 会经 request() 统一跳登录（课上 token 过期不该静默吞掉） */
  heartbeat(seconds = 30) {
    request('/api/usage/heartbeat', { method: 'POST', body: JSON.stringify({ seconds }) }).catch(() => {})
  },
  /** null = 没取到（和「今天用了 0 分钟」是两回事，界面显示 — 号） */
  async usage(): Promise<number | null> {
    const d = await requestOr<{ minutes: number } | null>('/api/student/usage', null)
    return d ? d.minutes : null
  },
}
