/** Build-only demo identity. Never reads or writes real authentication storage. */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { UserInfo } from '@/api/auth'

export const useAuthStore = defineStore('auth', () => {
  const token = ref('')
  const user = ref<UserInfo | null>(null)
  const sessionRevision = ref(0)
  const sessionError = ref('')
  const isLoggedIn = computed(() => !!user.value)
  const role = computed(() => user.value?.role)
  let initialized = false
  function enter(next: 'student' | 'teacher') {
    token.value = 'showcase-only-not-a-credential'
    user.value = { id: `demo-${next}-1`, name: next === 'teacher' ? '林老师（演示）' : '小禾（演示）', role: next, className: '七年级演示班' }
    sessionRevision.value++
    initialized = true
    return user.value
  }
  async function initializeSession() {
    if (initialized) return
    initialized = true
    if (location.pathname.startsWith('/student')) enter('student')
    if (location.pathname.startsWith('/teacher')) enter('teacher')
  }
  function clearSession() { token.value = ''; user.value = null; sessionRevision.value++; initialized = true }
  async function login(_username: string, _password: string, next: 'student' | 'teacher') { return enter(next) }
  async function logout() { clearSession(); return true }
  return { token, user, sessionRevision, sessionError, isLoggedIn, role, enter, initializeSession, clearSession, login, logout }
})
