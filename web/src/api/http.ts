/**
 * 全站统一的请求出入口。
 *
 * 为什么需要它：各个 api/*.ts 原来各写各的 fetch，把 401 / 500 / 断网一律 catch 成 null，
 * 页面拿到 null 就渲染空态——教师第二天上课打开浏览器（token 12 小时过期），
 * 首页会显示「班级状态平稳」、课堂页显示「还没有人开始编程」。
 * 页面在骗人，比报错危险得多。
 *
 * 规则：
 *  - 401/403 且确为登录态失效 → 清登录态并跳登录页（只跳一次，避免多请求并发时反复跳）。
 *  - 其他失败 → 抛 ApiError，由调用方决定怎么提示；不再静默变 null。
 */
import { useAuthStore } from '@/stores/auth'
import { isCloudDeployment } from '@/config/deployment'
import { cloudRequest, CloudApiError } from '@/api/cloud'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

let redirecting = false

function onSessionExpired() {
  if (redirecting) return
  redirecting = true
  try {
    useAuthStore().clearSession()
  } finally {
    const back = encodeURIComponent(location.pathname + location.search)
    location.replace(`/login?expired=1&back=${back}`)
  }
}

/**
 * FastAPI 的 detail 有两种形态：HTTPException 给字符串，**422 校验错给对象数组**
 * （[{loc,msg,type},…]）。直接塞进 Error.message，老师看到的是 `[object Object]` ——
 * 一句既不说明哪错了也无法求助的乱码。这里把数组摊成「字段：原因」的人话。
 */
function fmtDetail(d: unknown): string {
  if (typeof d === 'string') return d
  if (Array.isArray(d)) {
    return d.map((e: any) => {
      const field = Array.isArray(e?.loc) ? e.loc.filter((x: unknown) => x !== 'body').join('.') : ''
      const msg = e?.msg || '格式不正确'
      return field ? `${field}：${msg}` : String(msg)
    }).filter(Boolean).join('；').slice(0, 200)
  }
  return d ? String((d as any)?.msg || d) : ''
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (isCloudDeployment) {
    const auth = useAuthStore()
    const revision = auth.sessionRevision
    try {
      return await cloudRequest<T>(path, init)
    } catch (error) {
      if (error instanceof CloudApiError) {
        // Do not unload an unsaved editor merely because an API session expired.
        if (error.status === 401 && revision === auth.sessionRevision) auth.clearSession('登录已过期，请保留未保存内容后重新登录')
        throw new ApiError(error.status, error.message)
      }
      throw error
    }
  }
  const token = useAuthStore().token
  let r: Response
  try {
    r = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) },
    })
  } catch {
    throw new ApiError(0, '连不上服务器，请检查网络或稍后重试')
  }

  if (r.status === 401) {
    onSessionExpired()
    throw new ApiError(401, '登录已过期，正在跳转登录页')
  }
  if (!r.ok) {
    const detail = await r.json().then((d) => d?.detail).catch(() => null)
    throw new ApiError(r.status, fmtDetail(detail) || (r.status === 403 ? '没有权限执行该操作' : `请求失败（${r.status}）`))
  }
  return r.status === 204 ? (null as T) : r.json()
}

/** 给"读不到就显示空态也无所谓"的场景用：仍然会处理 401，但把其他错误交给调用方兜底 */
export async function requestOr<T>(path: string, fallback: T, onErr?: (e: ApiError) => void): Promise<T> {
  try {
    return await request<T>(path)
  } catch (e) {
    if (e instanceof ApiError) onErr?.(e)
    if (isCloudDeployment) throw e
    return fallback
  }
}
