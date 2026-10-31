<template>
  <div data-app="student" :class="['shell', { 'shell--focus': isFocus }]">
    <a class="skip-link" href="#student-main">跳到主内容</a>

    <aside class="shell__sidebar" aria-label="学生学习空间">
      <RouterLink class="student-profile" to="/student/home" aria-label="返回学习首页">
        <span class="student-profile__avatar"><img :src="studentAvatar" alt="" /></span>
        <strong>{{ auth.user?.name || '小创客' }}</strong>
        <small>{{ auth.user?.className || '学生空间' }}</small>
      </RouterLink>

      <nav class="primary-nav" aria-label="学生主导航">
        <template v-for="item in navigation" :key="item.key">
          <RouterLink v-if="item.to" v-slot="{ href, navigate }" :to="item.to" custom>
            <a :href="href" :class="['nav-item', { active: activeNav === item.key, 'nav-item--divider': item.key === 'settings' }]"
              :aria-current="activeNav === item.key ? 'page' : undefined" :aria-label="item.label" :title="item.label" @click="navigate">
              <img class="nav-item__icon" :src="item.icon" alt="" /><span>{{ item.label }}</span>
            </a>
          </RouterLink>
          <button v-else class="nav-item" type="button" :aria-label="item.label" :title="item.label" @click="onLogout">
            <img class="nav-item__icon" :src="item.icon" alt="" /><span>{{ item.label }}</span>
          </button>
        </template>
      </nav>
    </aside>

    <section class="shell__body">
      <header v-if="!isFocus" class="utility-bar">
        <div class="page-title" aria-live="polite">
          <h1>{{ pageTitle }}</h1><small>{{ pageDescription }}</small>
        </div>
        <form class="global-search" role="search" @submit.prevent="submitSearch">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
          <input v-model="searchTerm" type="search" autocomplete="off" placeholder="搜索作品或课堂任务…" aria-label="搜索作品或课堂任务" @keydown.enter.prevent="submitSearch" />
        </form>
        <div class="header-actions">
          <button class="notification-button" type="button" aria-label="查看教师下发任务" title="教师下发任务" @click="openTasks">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>
            <span v-if="notificationCount" class="notification-badge">{{ notificationLabel }}</span>
          </button>
          <RouterLink class="header-avatar" to="/student/my-data" aria-label="打开我的账户" title="我的账户">
            <BaseIcon name="user" :size="25" />
          </RouterLink>
        </div>
      </header>

      <main id="student-main" :class="['shell__main', { 'shell__main--focus': isFocus }]" tabindex="-1"><RouterView /></main>
    </section>
    <PeekHost />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { complianceApi } from '@/api/compliance'
import { resourcesApi } from '@/api/resources'
import PeekHost from '@/components/peek/PeekHost.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'

type StudentNavKey = 'home' | 'pair' | 'workshop' | 'assessment' | 'growth' | 'data' | 'settings' | 'help'

const studentAvatar = '/generated/student-canvas/student-cat-avatar-v2.png'
const iconRoot = '/generated/student-growth'
const navigation: Array<{ key: string; label: string; to?: string; icon: string }> = [
  { key: 'home', label: '学习首页', to: '/student/home', icon: `${iconRoot}/learning-home.png` },
  { key: 'pair', label: '结对编程', to: '/student/studio', icon: `${iconRoot}/pair-programming.png` },
  { key: 'workshop', label: '编程工坊', to: '/student/ide', icon: `${iconRoot}/coding-workshop.png` },
  { key: 'assessment', label: '测评中心', to: '/student/assess', icon: `${iconRoot}/assessment-center.png` },
  { key: 'growth', label: '思维成长', to: '/student/thinking', icon: `${iconRoot}/thinking-growth.png` },
  { key: 'data', label: '我的数据', to: '/student/my-data', icon: `${iconRoot}/my-data.png` },
  { key: 'settings', label: '账户设置', to: '/student/my-data?section=account', icon: `${iconRoot}/account-settings.png` },
  { key: 'help', label: '帮助中心', to: '/student/studio?mode=help', icon: `${iconRoot}/help-center.png` },
  { key: 'logout', label: '退出登录', icon: `${iconRoot}/logout.png` },
]
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const searchTerm = ref(queryText(route.query.q))
const notificationCount = ref(0)
const activeNav = computed<StudentNavKey>(() => {
  if (route.path === '/student/my-data' && queryText(route.query.section) === 'account') return 'settings'
  if (route.path === '/student/studio' && queryText(route.query.mode) === 'help') return 'help'
  return String(route.meta.studentNav || 'home') as StudentNavKey
})
const isFocus = computed(() => route.meta.studentChrome === 'focus')
const pageTitle = computed(() => String(route.meta.title || '学习首页'))
const pageDescription = computed(() => String(route.meta.description || '继续当前学习任务'))
const notificationLabel = computed(() => notificationCount.value > 9 ? '9+' : String(notificationCount.value))
let timer: ReturnType<typeof setInterval> | null = null

watch(() => route.query.q, (value) => { searchTerm.value = queryText(value) })
onMounted(async () => {
  await refreshNotifications()
  window.addEventListener('student-push-read', refreshNotifications)
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') complianceApi.heartbeat(30)
    refreshNotifications()
  }, 30000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('student-push-read', refreshNotifications)
})

function queryText(value: unknown) {
  if (Array.isArray(value)) return String(value[0] || '')
  return value == null ? '' : String(value)
}
async function refreshNotifications() {
  try { notificationCount.value = (await resourcesApi.myPushes()).unread } catch { notificationCount.value = 0 }
}
function submitSearch() {
  const q = searchTerm.value.trim()
  router.push({ path: '/student/home', query: q ? { q } : {} })
}
function openTasks() { router.push({ path: '/student/home', query: { section: 'tasks' } }) }
async function onLogout() {
  try {
    if (await auth.logout() === false) return
  } catch {
    // The store preserves a visible uncertainty message on the login screen.
  }
  await router.push('/login')
}
</script>

<style scoped>
.shell { height: 100%; min-height: 0; box-sizing: border-box; padding: 10px; display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 12px; color: var(--color-text); background: #eef1f7; overflow: hidden; }
.skip-link { position: fixed; top: 14px; left: 14px; z-index: var(--z-modal); padding: 10px 14px; border-radius: var(--r-md); color: var(--color-primary-strong); background: #fff; box-shadow: var(--shadow-lg); transform: translateY(-160%); transition: transform var(--dur-fast) var(--ease); }
.skip-link:focus { transform: translateY(0); }
.shell__sidebar { position: relative; z-index: calc(var(--z-panel) + 1); min-width: 0; padding: 24px 18px 18px; border-radius: 26px; display: flex; flex-direction: column; gap: 20px; color: #fff; background: radial-gradient(circle at 50% 7%, rgba(255,255,255,.24), transparent 25%), linear-gradient(165deg, #9495e9 0%, #7e82df 56%, #7379d7 100%); box-shadow: 0 18px 42px rgba(74,78,159,.20); overflow-x: hidden; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.42) transparent; }
.student-profile { min-height: 204px; padding: 2px 8px 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: inherit; text-align: center; text-decoration: none; }
.student-profile__avatar { width: 124px; height: 124px; margin-bottom: 7px; border: 5px solid rgba(255,255,255,.82); border-radius: 50%; display: grid; place-items: center; background: linear-gradient(150deg, #eeeaff, #fff7ef); box-shadow: 0 14px 30px rgba(51,48,132,.22), inset 0 0 0 1px rgba(80,74,168,.1); overflow: hidden; }
.student-profile__avatar img { width: 112%; height: 112%; object-fit: contain; transform: translateY(5%); }
.student-profile strong { max-width: 100%; overflow: hidden; font-size: 18px; text-overflow: ellipsis; white-space: nowrap; }
.student-profile small { color: rgba(255,255,255,.78); font-size: 12px; }
.primary-nav { min-height: 0; margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
.nav-item { width: 100%; min-height: 48px; box-sizing: border-box; padding: 0 14px; border: 0; border-radius: 15px; display: flex; align-items: center; gap: 12px; color: rgba(255,255,255,.88); background: transparent; font: inherit; font-size: 14px; font-weight: var(--fw-medium); text-align: left; text-decoration: none; cursor: pointer; transition: color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease), transform var(--dur-fast) var(--ease); }
.nav-item:hover { color: #fff; background: rgba(255,255,255,.13); transform: translateX(2px); }
.nav-item.active { color: #4f54aa; background: rgba(255,255,255,.96); box-shadow: 0 10px 24px rgba(49,48,119,.17); }
.nav-item:focus-visible, .student-profile:focus-visible { outline: 3px solid rgba(255,255,255,.82); outline-offset: 3px; }
.nav-item--divider { margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,.20); border-radius: 0 0 15px 15px; }
.nav-item__icon { flex: 0 0 31px; width: 31px; height: 31px; object-fit: contain; filter: drop-shadow(0 3px 3px rgba(37,38,91,.18)); }
.shell__body { min-width: 0; min-height: 0; border-radius: 26px; display: flex; flex-direction: column; background: #f8f9fc; box-shadow: 0 16px 40px rgba(56,65,105,.10); overflow: hidden; }
.utility-bar { flex: 0 0 88px; min-width: 0; padding: 0 30px; border-bottom: 1px solid #edf0f5; display: grid; grid-template-columns: 574px 486px minmax(132px, 1fr); align-items: center; gap: 24px; background: rgba(255,255,255,.96); }
.page-title { min-width: 0; }
.page-title h1 { margin: 0; font-size: clamp(22px, 2vw, 29px); line-height: 1.1; }
.page-title small { display: block; margin-top: 5px; overflow: hidden; color: var(--color-text-3); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.global-search { width: min(486px, 100%); height: 46px; justify-self: center; padding: 0 17px; border: 1px solid #e4e7ef; border-radius: 16px; display: flex; align-items: center; gap: 10px; background: #f8f9fc; box-shadow: inset 0 1px rgba(255,255,255,.85); }
.global-search:focus-within { border-color: #8589e1; box-shadow: 0 0 0 4px rgba(126,130,223,.13); }
.global-search svg { width: 19px; height: 19px; fill: none; stroke: #8d93a6; stroke-width: 1.7; stroke-linecap: round; }
.global-search input { min-width: 0; width: 100%; border: 0; outline: 0; color: var(--color-text); background: transparent; font: inherit; font-size: 13px; }
.global-search input::placeholder { color: #a2a7b7; }
.header-actions { justify-self: end; display: flex; align-items: center; gap: 14px; }
.notification-button, .header-avatar { position: relative; width: 46px; height: 46px; border: 1px solid #e6e8ef; border-radius: 15px; display: grid; place-items: center; color: #646a7b; background: #fff; box-shadow: 0 6px 16px rgba(60,66,100,.08); cursor: pointer; }
.notification-button:hover, .header-avatar:hover { color: #6268c8; border-color: #cfd2f1; transform: translateY(-1px); }
.notification-button svg { width: 21px; height: 21px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.notification-badge { position: absolute; top: -5px; right: -5px; min-width: 19px; height: 19px; padding: 0 4px; border: 2px solid #fff; border-radius: 12px; display: grid; place-items: center; color: #fff; background: #ef6b8f; font-size: 9px; font-weight: 800; }
.header-avatar { overflow: hidden; background: #f0ecff; }
.header-avatar :deep(.ico) { color: #6963ad; }
.notification-button:focus-visible, .header-avatar:focus-visible { outline: none; box-shadow: 0 0 0 4px rgba(126,130,223,.18); }
.shell__main { flex: 1; min-width: 0; min-height: 0; overflow: auto; scroll-behavior: smooth; }
.shell__main--focus { overflow: hidden; }
.shell--focus { grid-template-columns: 72px minmax(0, 1fr); gap: 8px; padding: 8px; }
.shell--focus .shell__sidebar { padding: 12px 8px; gap: 12px; border-radius: 20px; }
.shell--focus .student-profile { min-height: 58px; padding: 0; }
.shell--focus .student-profile__avatar { width: 50px; height: 50px; margin: 0; border-width: 3px; }
.shell--focus .student-profile strong, .shell--focus .student-profile small, .shell--focus .nav-item span { display: none; }
.shell--focus .nav-item { justify-content: center; padding: 0; }
.shell :deep(.guided-workbench) {
  position: relative;
  inset: auto;
  left: auto;
  width: 100%;
  height: 100%;
  min-height: 0;
  z-index: 0;
}
@media (max-width: 1500px) and (min-width: 1121px) {
  .utility-bar { grid-template-columns: minmax(220px, .8fr) minmax(320px, 1.2fr) minmax(132px, .45fr); }
}
@media (max-width: 1120px) {
  .shell { grid-template-columns: 72px minmax(0, 1fr); gap: 8px; padding: 8px; }
  .shell__sidebar { padding: 12px 8px; gap: 12px; border-radius: 20px; }
  .student-profile { min-height: 58px; padding: 0; }
  .student-profile__avatar { width: 50px; height: 50px; margin: 0; border-width: 3px; }
  .student-profile strong, .student-profile small, .nav-item span { display: none; }
  .nav-item { justify-content: center; padding: 0; }
  .nav-item--divider { padding-top: 7px; }
  .utility-bar { padding: 0 22px; grid-template-columns: minmax(160px, .7fr) minmax(240px, 1.3fr) 112px; gap: 16px; }
}
@media (max-height: 800px) and (min-width: 1121px) {
  .shell__sidebar { padding-block: 12px; gap: 8px; }
  .student-profile { min-height: 86px; flex-direction: row; justify-content: flex-start; gap: 9px; text-align: left; }
  .student-profile__avatar { flex: 0 0 66px; width: 66px; height: 66px; margin: 0; border-width: 3px; }
  .student-profile small { display: none; }
  .primary-nav { margin-top: 0; gap: 2px; }
  .nav-item { min-height: 38px; }
  .nav-item__icon { width: 28px; height: 28px; flex-basis: 28px; }
  .nav-item--divider { margin-top: 4px; padding-top: 3px; }
}
@media (max-width: 760px) {
  .shell :deep(.mobile-panel-tabs) { position: absolute; }
}
@media (max-width: 720px) {
  .utility-bar { flex-basis: 72px; padding: 0 14px; grid-template-columns: auto minmax(160px, 1fr) 104px; gap: 10px; }
  .page-title small { display: none; }
  .page-title h1 { font-size: 18px; }
  .global-search { height: 40px; padding-inline: 12px; }
  .notification-button, .header-avatar { width: 40px; height: 40px; border-radius: 13px; }
  .header-actions { gap: 8px; }
}
@media (max-width: 540px) {
  .shell { grid-template-columns: 62px minmax(0, 1fr); gap: 4px; padding: 4px; }
  .shell__sidebar { padding: 9px 5px; border-radius: 17px; }
  .utility-bar { flex-basis: 60px; padding: 0 10px; grid-template-columns: minmax(0, 1fr) 88px; gap: 7px; }
  .page-title { display: block; }
  .page-title h1 { font-size: 15px; }
  .global-search { display: none; }
  .notification-button, .header-avatar { width: 36px; height: 36px; }
  .student-profile__avatar { width: 44px; height: 44px; }
  .nav-item { min-height: 44px; }
  .nav-item__icon { width: 30px; height: 30px; flex-basis: 30px; }
}
@media (prefers-reduced-motion: reduce) {
  .skip-link, .nav-item, .notification-button, .header-avatar { transition: none; }
  .shell__main { scroll-behavior: auto; }
}
</style>
