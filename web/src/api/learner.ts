/** 学习者状态 / 教学轮 / 认知负荷自评 / 人际互动 API（承重墙 T1，见 docs/文献研读/第三波总审 §七）。 */
import { request, requestOr } from '@/api/http'

export interface LearnerState {
  student_id: string
  scaffold_level: number        // 支架档位（满档 3 起步；策略层只读原始信号，禁读 CT 分）
  round_index: number           // 教学轮 1-3（R1能跑/R2跑对/R3跑好）
  fallback_count: number
  mastery_snapshot: Record<string, number>
  stuck_points: string[]
  updated_at: number | null
  exists: boolean               // false=还没有落库记录（缺省态，前端别把默认值当真实状态渲染）
}

export interface Interaction {
  peer_turns: number            // 生生对话轮次（chat_log 元数据）
  ai_turns: number              // 人机求助轮次（ai_help 事件）
  ratio: number | null          // peer/(peer+ai)；分母 0 时 null——「没有数据」和「占比 0」必须分开画
  // 后端并行契约（诚实显示）：false=聊天通道未接通——此时 ratio 无意义，UI 显「不可用」，绝不画 0%。
  // 字段缺省 = 旧契约响应，按原有 ratio 逻辑走（可空兼容）
  chat_channel_available?: boolean
  note?: string                 // 通道定位说明（如未接通原因），有则原样随行展示
}

/** 教学轮（learning_round 行）：R1能跑/R2跑对/R3跑好。开轮/结轮只由教师操作。 */
export interface TeachRound {
  id: number
  room_id: string
  round_index: number           // 1-3
  label: string                 // 开轮时不传由服务端按轮序补默认（R1 能跑…）
  started_at: number
  exited_at: number | null      // null=进行中
  exit_task_passed: number | null   // 1/0/null：达标/未达标/没做出口任务（null 不是 0，语义不同）
}

/** 轮级快照行（研究件）：结轮时服务端冻结的单个学生四要素画像。红线：仅教师端消费，分数不下发学生 */
export interface RoundSnapshot {
  student_id: string
  report_dims?: Record<string, number>  // 四要素（对外口径，与 CtReport.report_dims 同源）
  created_at?: number
}

/** 轮末认知负荷自评（1-9）。⚠️ 这是学生的自我感受，不是成绩——任何 UI 不得当分数展示 */
export interface CogloadItem {
  score: number                 // 1-9（1=很轻松 9=非常费劲）
  round_index?: number | null
  room_id?: string | null
  created_at?: number
}

export const learnerApi = {
  /** 学生读自己的状态（轮次徽章用；教师可读任意学生）。失败返回 null 静默隐藏。 */
  async state(studentId: string): Promise<LearnerState | null> {
    return requestOr<LearnerState | null>(`/api/learner/state/${encodeURIComponent(studentId)}`, null)
  },
  /** 教师：某学生的人际互动占比（对抗性指标——支架来源迁移是否真的发生的唯一验证量） */
  async interaction(studentId: string): Promise<Interaction | null> {
    return requestOr<Interaction | null>(`/api/learner/interaction?student_id=${encodeURIComponent(studentId)}`, null)
  },

  // —— 教学轮（写路径断线最后一环：生产 round_index 恒 NULL 的根因是只有 API 无 UI）——
  /** 教师：某房间的教学轮列表（时间正序；未结束的即当前轮）。失败抛 ApiError，由调用方 .alert */
  rounds: (roomId: string) =>
    request<{ items: TeachRound[] }>(`/api/learner/rounds?room_id=${encodeURIComponent(roomId)}`)
      .then((r) => r.items),
  /** 教师：开轮。label 缺省交服务端按轮序补（R1能跑/R2跑对/R3跑好）；同房已有进行中的轮回 409 */
  roundOpen: (room_id: string, round_index: number, label = '') =>
    request<{ id: number; round: TeachRound }>('/api/learner/rounds/open', {
      method: 'POST', body: JSON.stringify({ room_id, round_index, label }),
    }),
  /** 教师：结轮。passed 三态：true 达标 / false 未达标 / null 跳过判定（没做出口任务） */
  roundExit: (rid: number, passed: boolean | null) =>
    request<{ ok: boolean }>(`/api/learner/rounds/${rid}/exit`, {
      method: 'POST', body: JSON.stringify({ exit_task_passed: passed }),
    }),
  /** 教师：某轮冻结的学生四要素快照列表（研究件）。端点未活/失败抛 ApiError——调用方自行决定静默或提示 */
  roundSnapshot: (rid: number) =>
    request<{ items: RoundSnapshot[] }>(`/api/learner/rounds/${rid}/snapshot`)
      .then((r) => r.items),

  // —— 认知负荷自评（后端并行契约：score 1-9，room_id/round_index 可选）——
  /** 学生：轮末负荷自评落库。红线：这是感受不是成绩，不回显、不排名、不下发他人 */
  cogload: (score: number, opts: { room_id?: string; round_index?: number } = {}) =>
    request<{ ok?: boolean }>('/api/learner/cogload', {
      method: 'POST', body: JSON.stringify({ score, ...opts }),
    }),
  /** 教师：读某学生的负荷自评记录（研究用；不做学生端消费） */
  cogloadOf: (studentId: string) =>
    request<{ items: CogloadItem[] }>(`/api/learner/cogload?student_id=${encodeURIComponent(studentId)}`)
      .then((r) => r.items),
}
