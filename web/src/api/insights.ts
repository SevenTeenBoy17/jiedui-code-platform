/** AI 学情洞察 API（V5）。 */
import { useAuthStore } from '@/stores/auth'

const H = () => ({ Authorization: `Bearer ${useAuthStore().token}` })

export interface InsightCard {
  headline: string; confidence: number
  strengths: string[]; weaknesses: string[]; suggestions: string[]
  next_step?: string; source: 'llm' | 'rule'; audited: boolean; blocked_words?: string[]
}
export interface StudentInsight {
  student_id: string; name: string; card: InsightCard
  evidence: Record<string, any>
  ct_scores: Record<string, number>
  path: { type: string; ts: number }[]
  timeline: { type: string; detail: string; ts: number }[]
}
export interface ClassInsight {
  n: number; headline: string
  common_weak: { dim: string; count: number }[]
  students: { id: string; name: string; weakest: string; score: number }[]
}

export interface Recommend {
  student_id: string; weak_dim: string; weak_score: number; reason: string
  exercises: { id: number; title: string; difficulty: number; language: string; why: string }[]
  videos: { id: number; title: string }[]
}

export const insightsApi = {
  recommend: (uid: string) =>
    fetch(`/api/insights/recommend/${encodeURIComponent(uid)}`, { headers: H() })
      .then((r) => (r.ok ? r.json() as Promise<Recommend> : Promise.reject(new Error('获取失败')))),
  /** 学生看自己的进阶推荐 —— 教师端那个 recommend 学生调是 403 */
  myRecommend: () =>
    fetch('/api/insights/my/recommend', { headers: H() })
      .then((r) => (r.ok ? r.json() as Promise<Recommend> : Promise.reject(new Error('获取失败')))),
  student: (uid: string) =>
    fetch(`/api/insights/student/${encodeURIComponent(uid)}`, { headers: H() })
      .then((r) => (r.ok ? r.json() as Promise<StudentInsight> : Promise.reject(new Error('获取失败')))),
  klass: () =>
    fetch('/api/insights/class', { headers: H() })
      .then((r) => (r.ok ? r.json() as Promise<ClassInsight> : Promise.reject(new Error('获取失败')))),
}
