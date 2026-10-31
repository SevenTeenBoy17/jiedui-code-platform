/** 教师预警工作台 API（§4.8）。 */
import { request } from '@/api/http'

export interface TeacherHome {
  class_ct_n: number
  class_id: number
  kpis: { students: number; online: number; submissions: number; alerts: number }
  students: {
    id: string; name: string; online: boolean; runs: number; errors: number; fixes: number
    success_rate: number; ct: Record<string, number>; risk: number; last_at: number | null
  }[]
  class_ct: Record<string, number>
  alerts: { id: number; user_id: string; studentName: string; category: string; level: number; detail: string; created_at: number }[]
  funnel: { entered: number; ran: number; fixed: number; transferred: number }
}

/** 课堂监看：一屏看清谁卡住（V5） */
export interface LiveSeat {
  id: string; name: string; state: 'stuck' | 'active' | 'idle' | 'away'
  runs: number; errors: number; fixes: number; helps: number
  idle_sec: number | null; last_at: number
}
export interface TeacherLive {
  now: number; window: number; seats: LiveSeat[]
  tally: Record<'stuck' | 'active' | 'idle' | 'away', number>
}

export const teacherApi = {
  /** 失败会抛 ApiError（401 已在 http.ts 里跳登录）——调用方必须区分「没数据」和「没取到」 */
  home: (classId = 0) => request<TeacherHome>(`/api/teacher/home?class_id=${classId}`),
  /** 执行学生数据删除（学生/监护人申请 → 教师与家长确认后执行；不可撤销）。
      返回逐表删除条数 ——「已删除」必须能被核对，界面要把总数说出来。 */
  eraseStudentData: (studentId: string) =>
    request<{ total_rows: number; deleted: Record<string, number> }>(
      `/api/teacher/data/${encodeURIComponent(studentId)}`, { method: 'DELETE' }),
  /** 批量登记监护人同意（教师核验纸质件后）。合规上与逐个开通等价：批量的只是点击，不是审查 */
  grantConsentBatch: (studentIds: string[]) =>
    request<{ granted: number; skipped: number; skipped_ids: string[] }>('/api/teacher/consent/batch', {
      method: 'POST', body: JSON.stringify({ student_ids: studentIds }),
    }),
  live: (classId = 0, window = 900) =>
    request<TeacherLive>(`/api/teacher/live?window=${window}&class_id=${classId}`),
}
