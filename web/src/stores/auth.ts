import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi, type UserInfo } from '@/api/auth'
import { isCloudDeployment } from '@/config/deployment'
import { CloudApiError } from '@/api/cloud'

const LS_TOKEN = 'jiedui_token'
const LS_USER = 'jiedui_user'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(isCloudDeployment ? '' : localStorage.getItem(LS_TOKEN) || '')
  const user = ref<UserInfo | null>(isCloudDeployment ? null : JSON.parse(localStorage.getItem(LS_USER) || 'null'))

  const isLoggedIn = computed(() => isCloudDeployment ? !!user.value : !!token.value)
  const role = computed(() => user.value?.role)
  const sessionRevision = ref(0)
  const sessionError = ref('')
  let initialized = !isCloudDeployment
  let initialization: Promise<void> | undefined
  let loginInFlight: Promise<UserInfo> | undefined
  let logoutInFlight: Promise<boolean> | undefined

  function clearSession(message = '') {
    sessionRevision.value++
    token.value = ''
    user.value = null
    sessionError.value = message
    initialized = true
    localStorage.removeItem(LS_TOKEN)
    localStorage.removeItem(LS_USER)
  }

  async function initializeSession() {
    if (initialized) return
    if (initialization) return initialization
    const revision = sessionRevision.value
    initialization = (async () => {
      try {
        const identity = await authApi.me()
        if (revision === sessionRevision.value) {
          user.value = identity
          sessionRevision.value++
          sessionError.value = ''
        }
      } catch (error) {
        if (revision === sessionRevision.value) {
          clearSession(error instanceof CloudApiError && error.status === 401 ? '' :
            error instanceof Error ? error.message : '暂时无法确认登录身份，请重新登录')
        }
      } finally {
        initialized = true
      }
    })()
    return initialization
  }

  async function login(username: string, password: string, r: 'student' | 'teacher') {
    if (loginInFlight || logoutInFlight) throw new Error('身份请求正在处理，请稍候再试')
    const revision = ++sessionRevision.value
    sessionError.value = ''
    loginInFlight = (async () => {
      const res = await authApi.login(username, password, r)
      if (revision !== sessionRevision.value) throw new Error('登录状态已变化，请重新登录')
      token.value = res.token
      user.value = res.user
      initialized = true
      if (!isCloudDeployment) {
        localStorage.setItem(LS_TOKEN, res.token)
        localStorage.setItem(LS_USER, JSON.stringify(res.user))
      }
      return res.user
    })()
    try { return await loginInFlight } finally { loginInFlight = undefined }
  }

  async function logout(): Promise<boolean> {
    if (logoutInFlight) return logoutInFlight
    if (isCloudDeployment && typeof window !== 'undefined') {
      const preflight = new Event('jiedui:before-cloud-logout', { cancelable: true })
      if (!window.dispatchEvent(preflight)) return false
    }
    clearSession()
    if (!isCloudDeployment) return true
    logoutInFlight = (async () => {
      // A late Set-Cookie from login must settle before the revocation request.
      if (loginInFlight) await loginInFlight.catch(() => undefined)
      try {
        const result = await authApi.logout()
        if (!result.ok || (result.remoteRevoked !== true && !result.alreadySignedOut)) {
          throw new Error('本页已退出，但服务器尚未确认撤销，请重新登录后再退出')
        }
        return true
      } catch (error) {
        sessionError.value = error instanceof Error ? error.message : '退出未获服务器确认，请稍后重试'
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('jiedui:cloud-logout-failed'))
        throw error
      }
    })()
    try { return await logoutInFlight } finally { logoutInFlight = undefined }
  }

  return { token, user, isLoggedIn, role, sessionRevision, sessionError, initializeSession, clearSession, login, logout }
})
