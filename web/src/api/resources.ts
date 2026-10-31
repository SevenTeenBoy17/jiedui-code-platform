/** 资源中心 API（V3.5）：题库 / 视频 / 练习集 / 推送。 */
import { request } from '@/api/http'

// 走统一出入口：401 自动跳登录，其他失败抛 ApiError（带后端 detail 文案），不再静默吞掉
const req = <T>(path: string, init?: RequestInit) => request<T>(`/api/resources${path}`, init)

export interface Exercise {
  id: number; title: string; summary: string; statement?: string
  language: string; difficulty: number; tags: string[]; ct_dims: Record<string, number>
  ct_primary?: string; case_count: number; hints?: string[]; status: string; updated_at: number
}
export interface Video {
  id: number; title: string; summary: string; url: string; category?: string
  duration_sec: number; review_state: string; status: string; updated_at: number
}
export interface ExSet {
  id: number; title: string; goal: string; item_count: number; updated_at: number
  items?: { item_type: string; ref_id: number; title: string; required: number }[]
}
export interface PushRec {
  id: number; res_type: string; res_id: number; title: string; reason: string
  total: number; read: number; done: number; created_at: number
  due_at: number | null; required: number
}
/** 班级：教学下发与学情统计的单位 */
export interface Klass {
  id: number; name: string; grade?: string; note: string
  student_ids: string[]; size: number; updated_at: number
  socratic?: boolean          // 本班是否被锁定为强制苏格拉底式引导
  group_kind?: string         // 课题分组：exp 实验组 | ctrl 对照组 | '' 不参与
}
export interface RosterItem { id: string; name: string }
export interface TaskNode {
  target_id: number; title: string; kind: string; res_id: number
  done: boolean; required: number; due_at: number | null
}
export interface MyPush {
  target_id: number; res_type: string; res_id: number; title: string; reason: string
  required: number; read_at: number | null; done_at: number | null; created_at: number
}

export interface CaseFlow { stage: string; minutes: number; teacher: string; student: string }
export interface TeachCase {
  id: number; title: string; grade?: string; language?: string; goal: string
  ct_dims: Record<string, number>; flow: CaseFlow[]; reflection: string
  set_id?: number | null; updated_at: number
}

export const resourcesApi = {
  cases: (q = '') => req<{ items: TeachCase[] }>(`/cases?q=${encodeURIComponent(q)}`).then((r) => r.items),
  createCase: (d: Record<string, any>) => req<{ id: number }>('/cases', { method: 'POST', body: JSON.stringify(d) }),
  deleteCase: (id: number) => req<any>(`/cases/${id}`, { method: 'DELETE' }),

  exercises: (q = '', language = '', difficulty = 0) =>
    req<{ items: Exercise[] }>(`/exercises?q=${encodeURIComponent(q)}&language=${language}&difficulty=${difficulty}`).then((r) => r.items),
  exercise: (id: number) => req<any>(`/exercises/${id}`),
  createExercise: (d: Partial<Exercise> & Record<string, any>) =>
    req<{ id: number }>('/exercises', { method: 'POST', body: JSON.stringify(d) }),
  deleteExercise: (id: number) => req<any>(`/exercises/${id}`, { method: 'DELETE' }),

  videos: (q = '', category = '') =>
    req<{ items: Video[] }>(`/videos?q=${encodeURIComponent(q)}&category=${category}`).then((r) => r.items),
  createVideo: (d: Record<string, any>) =>
    req<{ id: number; review_state: string; note?: string }>('/videos', { method: 'POST', body: JSON.stringify(d) }),
  deleteVideo: (id: number) => req<any>(`/videos/${id}`, { method: 'DELETE' }),

  sets: () => req<{ items: ExSet[] }>('/sets').then((r) => r.items),
  set: (id: number) => req<ExSet>(`/sets/${id}`),
  createSet: (d: Record<string, any>) => req<{ id: number }>('/sets', { method: 'POST', body: JSON.stringify(d) }),
  setItems: (id: number, items: any[]) =>
    req<{ count: number }>(`/sets/${id}/items`, { method: 'PUT', body: JSON.stringify({ items }) }),

  classes: () => req<{ items: Klass[]; roster: RosterItem[] }>('/classes'),
  createClass: (d: { name: string; grade?: string; note?: string }) =>
    req<{ id: number }>('/classes', { method: 'POST', body: JSON.stringify(d) }),
  setClassStudents: (id: number, student_ids: string[]) =>
    req<{ size: number }>(`/classes/${id}/students`, { method: 'PUT', body: JSON.stringify({ student_ids }) }),
  deleteClass: (id: number) => req<any>(`/classes/${id}`, { method: 'DELETE' }),
  setClassGroup: (id: number, group_kind: string) =>
    req<{ ok: boolean; socratic_hint: boolean }>(`/classes/${id}/group`,
      { method: 'PUT', body: JSON.stringify({ group_kind }) }),
  setClassSocratic: (id: number, socratic: boolean) =>
    req<{ ok: boolean }>(`/classes/${id}/socratic`, { method: 'PUT', body: JSON.stringify({ socratic }) }),

  /** 推送；带 class_ids + due_at 即「任务下发」 */
  push: (d: {
    res_type: string; res_id: number; student_ids?: string[]; class_ids?: number[]
    reason?: string; required?: number; due_at?: number | null
  }) => req<{ id: number; targets: number }>('/push', { method: 'POST', body: JSON.stringify(d) }),
  pushes: () => req<{ items: PushRec[] }>('/pushes').then((r) => r.items),

  /** 任务链条：老师推给我的最近几件事。只表示做没做，**没有分数/百分比/排名** */
  taskChain: () => req<{ items: TaskNode[] }>('/my/tasks/chain').then((r) => r.items),
  myPushes: () => req<{ items: MyPush[]; unread: number }>('/my/pushes'),
  markRead: (tid: number) => req<any>(`/my/pushes/${tid}/read`, { method: 'POST', body: '{}' }),
  markDone: (tid: number) => req<any>(`/my/pushes/${tid}/done`, { method: 'POST', body: '{}' }),
}
