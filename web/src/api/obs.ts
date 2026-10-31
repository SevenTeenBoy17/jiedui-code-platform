/**
 * 教师结构化观察表 obs_window API（定稿《观察表与评分金标准》§A1 / §A2）。
 *
 * 分析单位 = 一个 pair × 一个观察窗。sweep 一窗 ≈13 秒（**瞬时状态判定**），
 * focus 一窗 = 整轮连续 ≈8 分钟。两层口径不同，**报告中不得合并**，故 layer 是批级必填。
 *
 * 契约按 server/app/obs.py 对齐（批级页眉 + items[] 主表），三条纪律由服务端兜底、
 * 客户端**不许重复实现也不许绕开**：
 *  ① **observer_id 从令牌 sub 取**（§A1「绝不可空」）—— 客户端传了也会被丢弃。
 *  ② **observed_from / observed_to 由服务端写**（§A1「表单自动写，禁人工填」）：
 *    以提交时刻为窗末端、按 layer 回推窗长。所以本模块**没有**这两个字段 ——
 *    前端记的"开始扫描"时刻只用于老师自己的节奏提示，不是落库口径。
 *  ③ **window_offset_sec 由服务端 join learning_round 回填**，前端无从得知轮起点。
 *
 * 端点失败时本模块照常抛 ApiError，由调用页降级成全局 .alert，绝不静默吞掉
 * （吞掉 = 老师以为记上了，其实一条没存）。
 */
import { request } from '@/api/http'

/** 键鼠归属（§A2 ①）：此刻手触键或握鼠的是谁。手搭桌沿不算 */
export type KbCode = 'L' | 'R' | 'none' | 'both' | 'unclear'
/** 停滞·离题·争执（§A2 ③）。服务端白名单是**小写**（store_obs.N_CODES） */
export type NCode = 'none' | 'n1' | 'n2' | 'n3' | 'unclear'
/** 页眉级技术状况（每轮一次） */
export type TechStatus = '正常' | '卡顿' | '掉线'

/** 主表一格 = 一个 pair × 一个观察窗。seat / student_id 由 seat_map 定，教师端不填 */
export interface ObsItemIn {
  pair_id: string               // 机位号，如 '01'
  window_seq: number            // 本 study×room×round 内的窗序（从 1 起）
  kb: KbCode | null
  /** 支架来源三码（§A2 ②）：多选并存、**不互斥** —— SRC 是因变量本身，
   *  「同时出现 P 与 A 时判 P」这类保护稀有类的仲裁在这一维就是伪造结论（定稿 §A5）。
   *  src_unclear=1 时三码一律 null（服务端也会再清一次）：判不出 ≠ 三个都没出现。 */
  src_a: 0 | 1 | null
  src_p: 0 | 1 | null
  src_s: 0 | 1 | null
  src_unclear: 0 | 1
  n_code: NCode | null
  evt_tag?: string | null       // 6 预置标签之一，一击
  evt_note?: string             // ≤20 字，全表唯一自由字段；服务端类型是 str，**不接受 null**
}

/** 批级页眉（§A2：每轮一次，3 秒）+ 主表。教师不填任何标识字段 */
export interface ObsBatchIn {
  study_id: string
  round_index: number           // 1-3
  layer: 'sweep' | 'focus'
  room_id: string               // 批级缺省房间；逐格不再重复
  tech_status: TechStatus | null
  items: ObsItemIn[]
}

/** 回读行：比提交多出服务端回填的列 */
export interface ObsWindowRow extends ObsItemIn {
  id: number
  study_id: string
  room_id: string
  round_index: number
  layer: string
  seat: string | null
  student_id: string | null
  observer_id: string
  observed_from: number
  observed_to: number
  window_offset_sec: number | null
  tech_status: string | null
  created_at: number
}

/** 6 预置事件标签（§A2 事件栏，一击）。必须与 store_obs.EVT_TAGS 逐字一致，否则服务端 400 */
export const EVT_TAGS = ['争执升级', '一方退出', '求助无人应', '设备故障', 'AI给整段码', '其他'] as const

export const obsApi = {
  /** 批量提交一个扫描窗（一轮走位 = 一次提交，N 对一起走）。返回落库条数 */
  async submitWindows(batch: ObsBatchIn): Promise<number> {
    const d = await request<{ count?: number; ids?: number[] }>('/api/obs/window', {
      method: 'POST',
      body: JSON.stringify(batch),
    })
    // 服务端回包字段是 count；失败在 http.ts 已抛 ApiError，到不了这里，
    // 所以这里的兜底只是"字段名变了"，不是"把失败当成功"
    return d?.count ?? d?.ids?.length ?? batch.items.length
  },

  /** 回读已提交的窗（用于续算 window_seq，以及日后的观察者一致性核对） */
  async listWindows(studyId: string, roomId = '', roundIndex?: number): Promise<ObsWindowRow[]> {
    const q = new URLSearchParams({ study_id: studyId })
    if (roomId) q.set('room_id', roomId)
    if (roundIndex) q.set('round_index', String(roundIndex))
    const d = await request<{ items?: ObsWindowRow[] }>(`/api/obs/windows?${q}`)
    return d?.items ?? []
  },
}
