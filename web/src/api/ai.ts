/** 双 AI 导师 API（§4.5）。 */
import { useAuthStore } from '@/stores/auth'

export interface ChatReply {
  reply: string
  role: string
  source: 'llm' | 'fallback' | 'guard'
  socratic?: boolean          // 本轮是否按苏格拉底式作答（服务端裁决）
  socraticLocked?: boolean    // 是否由教师给班级锁定 —— 锁上时学生端勾选框应变灰
  /** 回答的**终态**（服务端判定）：written 写了代码 / asked 在问你 / blocked 不能写。
      刻意没有进行时 —— 非流式下写「正在写第 3 步…」是在界面上撒谎。 */
  phase?: 'written' | 'asked' | 'blocked'
  asks?: number
}

export const aiApi = {
  async chat(
    message: string,
    role: 'turtle' | 'reviewer',
    opts: {
      codeContext?: string
      history?: { role: string; content: string }[]
      socratic?: boolean
      /** 结对房间号（协作层提供时透传）：触发 navigator 锚点注入与 hop 渐退度量（终审 #1/#3）。 */
      roomId?: string
    } = {},
  ): Promise<ChatReply> {
    const r = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${useAuthStore().token}` },
      // socratic 必须真的发给服务端 —— 只把档位降到 0 是拦不住驾驶员写码的。
      // 不再发 scaffold：档位是服务端按 learner_state 判的，前端发了也会被忽略（终审 #2 + 越权修复）。
      body: JSON.stringify({
        message, role, socratic: !!opts.socratic,
        codeContext: opts.codeContext, history: opts.history, roomId: opts.roomId,
      }),
    })
    if (r.status === 403) throw new Error('CONSENT_REQUIRED')
    if (!r.ok) throw new Error('AI 服务暂时不可用')
    return r.json()
  },

  /** 生图（密钥留服务端；同样过同意门禁与内容护栏）。返回 data:image 或 url。 */
  async image(prompt: string): Promise<string> {
    const r = await fetch('/api/ai/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${useAuthStore().token}` },
      body: JSON.stringify({ prompt }),
    })
    if (r.status === 403) throw new Error('CONSENT_REQUIRED')
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || '画图服务暂时忙')
    return (await r.json()).image
  },
}
