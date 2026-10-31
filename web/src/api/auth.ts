import { isCloudDeployment } from '@/config/deployment'
import { cloudRequest, CloudApiError } from '@/api/cloud'

/**
 * 鉴权 API。优先调用真实后端 `/api/auth/{role}/login`（经 vite 代理 → FastAPI :9099）；
 * 后端不可用（断网/未启）时回退本地 mock（演示韧性）。契约见 specs/IMPL-师生分离登录。
 */
export interface UserInfo {
  id: string
  name: string
  role: 'student' | 'teacher'
  className?: string
}
export interface LoginResult {
  token: string
  user: UserInfo
}

function validatedCloudUser(value: unknown): UserInfo {
  const user = value as UserInfo | undefined
  if (!user || typeof user.id !== 'string' || !user.id || typeof user.name !== 'string' ||
      !['student', 'teacher'].includes(user.role)) {
    throw new CloudApiError(502, 'INVALID_IDENTITY', '身份信息不完整，请重新登录')
  }
  return { id: user.id, name: user.name, role: user.role }
}

const DEMO = {
  student: { id: 'stu-xiaoma', name: '小码', role: 'student' as const, className: '初一(2)班' },
  teacher: { id: 'tea-lishen', name: '李深老师', role: 'teacher' as const },
}

function mockLogin(username: string, password: string, role: 'student' | 'teacher'): LoginResult {
  if (password !== '123456') throw new Error('演示密码为 123456')
  const base = DEMO[role]
  const user: UserInfo = { ...base, name: role === 'teacher' ? base.name : username }
  return { token: `mock.${role}.${btoa(unescape(encodeURIComponent(username)))}`, user }
}

export const authApi = {
  async login(username: string, password: string, role: 'student' | 'teacher'): Promise<LoginResult> {
    if (!username.trim() || !password.trim()) throw new Error('请输入账号和密码')
    if (isCloudDeployment) {
      const result = await cloudRequest<{ user: unknown }>('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ email: username.trim(), password }),
      })
      return { token: '', user: validatedCloudUser(result.user) }
    }
    try {
      const res = await fetch(`/api/auth/${role}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) return (await res.json()) as LoginResult
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || '登录失败')
    } catch (e: any) {
      // fetch 网络层失败（后端未启）→ 回退 mock；业务错误（密码错）直接抛
      if (e instanceof TypeError) return mockLogin(username, password, role)
      throw e
    }
  },
  async me(): Promise<UserInfo> {
    const result = await cloudRequest<{ user: unknown }>('/api/auth/me')
    return validatedCloudUser(result.user)
  },
  logout() {
    return cloudRequest<{ ok: boolean; remoteRevoked: boolean | null; alreadySignedOut?: boolean }>('/api/auth/logout', { method: 'POST', body: '{}' })
  },
}
