<template>
  <div class="showcase-frame">
    <header class="showcase-toolbar" aria-label="产品演示导航">
      <div class="showcase-caption"><strong>产品演示</strong><span>示例数据 · 刷新重置 · 不连接真实课堂 / AI</span></div>
      <nav class="showcase-actions" aria-label="切换演示身份">
        <button :aria-pressed="auth.role === 'student'" @click="go('/student/home')">学生端</button>
        <button :aria-pressed="auth.role === 'teacher'" @click="go('/teacher/teaching/today')">教师端</button>
        <label class="showcase-directory">全部页面
          <select aria-label="全部演示页面" :value="selected" @change="go(($event.target as HTMLSelectElement).value)">
            <option value="" disabled>选择页面 · 24 页</option>
            <optgroup v-for="group in groups" :key="group" :label="group">
              <option v-for="page in showcasePages.filter(p => p.group === group)" :key="page.path" :value="page.path">{{ page.label }}</option>
            </optgroup>
          </select>
        </label>
      </nav>
    </header>
    <div class="showcase-content"><router-view /></div>
    <RoleCompanion />
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './auth'
import { showcasePages } from './catalog'
import RoleCompanion from '@/components/pair/RoleCompanion.vue'
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const groups = [...new Set(showcasePages.map(p => p.group))]
const selected = computed(() => showcasePages.find(p => p.path.split('?')[0] === route.path)?.path || '')
async function go(path: string) {
  if (!path) return
  const previousRole = auth.role
  auth.enter(path.startsWith('/teacher') ? 'teacher' : 'student')
  try {
    const failure = await router.push(path)
    if (failure) previousRole ? auth.enter(previousRole) : auth.clearSession()
  } catch (error) {
    previousRole ? auth.enter(previousRole) : auth.clearSession()
    throw error
  }
}
</script>
<style scoped>
.showcase-frame { height: 100dvh; display: grid; grid-template-rows: auto minmax(0,1fr); }
.showcase-toolbar { position: relative; z-index: 80; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 20px; background: #f8f6ff; border-bottom: 1px solid #ded7f5; color: #44366b; font-size: 12px; }
.showcase-caption { display: flex; align-items: center; gap: 10px; }
.showcase-caption strong { font-size: 13px; white-space: nowrap; }
.showcase-actions { display: flex; gap: 8px; align-items: center; }
.showcase-actions button, .showcase-directory select { border: 1px solid #c8bde7; background: white; border-radius: 8px; color: #493775; min-height: 34px; padding: 5px 12px; cursor: pointer; font: inherit; }
.showcase-actions button[aria-pressed="true"] { background: #6652b6; color: white; border-color: #6652b6; }
.showcase-actions button:focus-visible, .showcase-directory select:focus-visible { outline: 3px solid #e6a23c; outline-offset: 2px; }
.showcase-directory { display: flex; gap: 6px; align-items: center; white-space: nowrap; }
.showcase-content { min-width: 0; min-height: 0; overflow: auto; }
.showcase-content :deep(.login-page) { min-height: calc(100dvh - 51px); }
.showcase-content :deep(.ob .fold) { overflow-x: auto; }
.showcase-content :deep(.ob table.grid) { min-width: 1050px; table-layout: fixed; }
.showcase-content :deep(.ob table.grid th:first-child) { width: 60px; }
.showcase-content :deep(.ob table.grid th:last-child) { width: 130px; }
.showcase-content :deep(.ob table.grid td.cells) { display: table-cell; vertical-align: top; }
.showcase-content :deep(.ob table.grid td.cells .c) { margin: 2px; }
@media(max-width: 760px) { .showcase-toolbar { flex-wrap: wrap; padding: 8px 10px; } .showcase-caption { width: 100%; font-size: 11px; } .showcase-actions { width: 100%; } .showcase-directory { margin-left: auto; font-size: 11px; } .showcase-directory select { max-width: 130px; } }
</style>
