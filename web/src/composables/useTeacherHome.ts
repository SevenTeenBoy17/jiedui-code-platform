/**
 * 教师端共享数据（V3）。
 * `/api/teacher/home` 已一次返回 kpis / students / class_ct / alerts / funnel，
 * 双区各页只取自己需要的切片 → 拆页面不需要改后端，也避免每页重复请求。
 *
 * `error` 必须暴露出去：请求失败时页面要说"没取到"，
 * 不能拿空数据渲染成「班级状态平稳」—— 那是在骗正在上课的老师。
 */
import { ref, computed } from 'vue'
import { teacherApi, type TeacherHome } from '@/api/teacher'
import { ApiError } from '@/api/http'

const data = ref<TeacherHome | null>(null)
const loading = ref(false)
const error = ref('')
let inflight: Promise<void> | null = null
let loadedAt = 0
const TTL = 30_000

export function useTeacherHome() {
  async function load(force = false) {
    if (!force && data.value && Date.now() - loadedAt < TTL) return
    if (inflight) return inflight
    loading.value = true
    inflight = (async () => {
      try {
        data.value = await teacherApi.home()
        error.value = ''
        loadedAt = Date.now()
      } catch (e) {
        error.value = e instanceof ApiError ? e.message : '数据加载失败'
      } finally {
        loading.value = false
        inflight = null
      }
    })()
    return inflight
  }

  return {
    data,
    loading,
    error,
    load,
    kpis: computed(() => data.value?.kpis),
    students: computed(() => data.value?.students ?? []),
    alerts: computed(() => data.value?.alerts ?? []),
    classCt: computed(() => data.value?.class_ct ?? {}),
    /** 班级均值基于几名有效样本 —— 图上要写出来，3 人和 40 人的均值不能长得一样 */
    classCtN: computed(() => data.value?.class_ct_n ?? 0),
    funnel: computed(() => data.value?.funnel),
    /** 高危未处理数：今日页角标（预警已降级为角标 + Peek） */
    urgent: computed(() => (data.value?.alerts ?? []).filter((a) => (a.level ?? 0) >= 3).length),
  }
}
