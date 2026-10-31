<template>
  <div data-app="teacher" class="shell">
    <aside class="side">
      <div class="brand">
        <img :src="asset('teacher_owl')" class="brand__ava" alt="" />
        <span>教师端</span>
      </div>

      <!-- 板块切换：教学 ⇄ 教研（切区即换整套二级导航与配色） -->
      <div class="zone">
        <RouterLink to="/teacher/teaching/today" class="zone__b" :class="{ on: zone === 'teach' }">教学</RouterLink>
        <RouterLink to="/teacher/research/study" class="zone__b" :class="{ on: zone === 'research' }">教研</RouterLink>
      </div>

      <nav class="menu">
        <RouterLink v-for="m in menu" :key="m.to" :to="m.to" class="menu__i">
          <BaseIcon :name="m.icon" :size="16" />
          {{ m.label }}
          <i v-if="m.badge && urgent" class="badge">{{ urgent }}</i>
        </RouterLink>
      </nav>

      <div class="side__foot">
        <span class="who">{{ auth.user?.name }}</span>
        <BaseButton size="sm" variant="ghost" @click="onLogout">退出</BaseButton>
      </div>
    </aside>

    <!-- 只用 key 触发内容入场（fade-in），不做路由级 <Transition>：
         out-in 在快速连点导航时会卡在 leave 态导致新页不渲染（已实测）。动效不能以内容不渲染为代价。 -->
    <!-- 跳转链接（R5 裁决1）：键盘用户一步跳过侧栏导航直达主内容 -->
    <a class="sr-only" href="#main">跳到主内容</a>
    <main id="main" class="content">
      <RouterView v-slot="{ Component, route }">
        <component :is="Component" :key="route.path" class="fade-in" />
      </RouterView>
    </main>
    <PeekHost />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { RouterView, RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDensity } from '@/composables/useDensity'
import { useTeacherHome } from '@/composables/useTeacherHome'
import { asset } from '@/assets/assets'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import type { IconName } from '@/components/ui/BaseIcon.vue'
import PeekHost from '@/components/peek/PeekHost.vue'

const auth = useAuthStore()
const router = useRouter()
const { zone } = useDensity()
const { urgent, load } = useTeacherHome()

/** 教学 7 项（预警已降级为「今日」角标 + Peek）；教研 7 项。R4：每项配 16px 线性图标。
 *  「观察」用 eye（现场用肉眼判定，与 monitor=看屏幕的「课堂」区分开），不新增 PATHS 条目。 */
interface MenuItem { to: string; label: string; icon: IconName; badge?: boolean }
const TEACH: MenuItem[] = [
  { to: '/teacher/teaching/today', label: '今日', icon: 'calendar', badge: true },
  { to: '/teacher/teaching/classes', label: '班级', icon: 'school' },
  { to: '/teacher/teaching/resources', label: '资源', icon: 'folder' },
  { to: '/teacher/teaching/tasks', label: '任务', icon: 'clipboard' },
  { to: '/teacher/teaching/live', label: '课堂', icon: 'monitor' },
  { to: '/teacher/teaching/observe', label: '观察', icon: 'eye' },
  { to: '/teacher/teaching/students', label: '学情', icon: 'chart-bar' },
]
const RESEARCH: MenuItem[] = [
  { to: '/teacher/research/study', label: '课题', icon: 'flask' },
  { to: '/teacher/research/analysis', label: '分析', icon: 'trend' },
  { to: '/teacher/research/profiles', label: '画像', icon: 'user' },
  { to: '/teacher/research/cases', label: '课例', icon: 'book' },
  { to: '/teacher/research/rubrics', label: '量表', icon: 'ruler' },
  { to: '/teacher/research/report', label: '报告', icon: 'file-text' },
  { to: '/teacher/research/export', label: '导出', icon: 'download' },
]
const menu = computed(() => (zone.value === 'research' ? RESEARCH : TEACH))

async function onLogout() {
  try {
    if (await auth.logout() === false) return
  } catch {
    // The store preserves a visible uncertainty message on the login screen.
  }
  await router.push('/login')
}
onMounted(() => load())
</script>

<style scoped>
.shell { height: 100%; display: flex; background: var(--color-bg); }
.side { width: 200px; flex-shrink: 0; display: flex; flex-direction: column;
  padding: var(--sp-4) var(--sp-3); background: var(--color-surface);
  border-right: 1px solid var(--color-border); }   /* 企业控制台：不透明白侧栏 */
.brand { display: flex; align-items: center; gap: 8px; font-weight: var(--fw-bold);
  color: var(--color-primary-strong); padding: 0 var(--sp-2) var(--sp-3); }
.brand__ava { width: 30px; height: 30px; }

/* UI调研'26-08 落地（rauno.me Exclusion Tabs）：白药丸不再两侧各自淡入淡出，而是**滑**过去 ——
   一个 ::before 指示器随激活侧位移（transform-only，吃 reduced-motion 降级）。
   位置由 :has() 驱动；不支持 :has() 的引擎经 @supports 退回「各自白底」的旧画法，状态永远可读。 */
.zone { display: flex; gap: 3px; background: var(--ink-a06); padding: 3px; border-radius: var(--r-md); position: relative; }
.zone::before { content: ''; position: absolute; top: 3px; bottom: 3px; left: 3px;
  width: calc((100% - 9px) / 2); background: var(--color-surface); border-radius: var(--r-sm);
  box-shadow: var(--shadow-sm); transition: transform var(--d-fast) var(--e-out); }
.zone:has(.zone__b:last-child.on)::before { transform: translateX(calc(100% + 3px)); }
.zone__b { flex: 1; text-align: center; padding: 7px 0; border-radius: var(--r-sm); text-decoration: none;
  font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--color-text-2);
  position: relative; transition: color var(--d-fast); }
.zone__b.on { color: var(--color-primary-strong); }
@supports not (selector(:has(a))) {
  .zone::before { display: none; }
  .zone__b.on { background: var(--color-surface); box-shadow: var(--shadow-sm); }
}

.menu { display: flex; flex-direction: column; gap: 2px; margin-top: var(--sp-4); }
.menu__i { display: flex; align-items: center; gap: 8px; color: var(--color-text-2); text-decoration: none;
  padding: 9px 12px; border-radius: var(--r-md); font-size: var(--fs-sm); }
.menu__i:hover { background: var(--ink-a06); }
.menu__i.router-link-active { background: var(--color-primary-soft); color: var(--color-primary-strong); font-weight: var(--fw-medium); }
.badge { margin-left: auto; font-style: normal; font-size: var(--fs-xs); background: var(--color-danger);
  color: #fff; min-width: 18px; text-align: center; padding: 1px 5px; border-radius: var(--r-pill); }

.side__foot { margin-top: auto; display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2); }
.who { font-size: var(--fs-sm); color: var(--color-text-3); flex: 1; }
.content { flex: 1; min-width: 0; overflow-y: auto; padding: var(--sp-5); position: relative; }
/* 移动端（V6 实测修复）：原「侧栏压到 62px」会把 Zone 按钮挤成 14px 宽、菜单项 37×38（低于 44px 触控标准）。
   手机上改为**顶部区切换 + 底部导航条**，触控区全部 ≥44px。 */
@media (max-width: 860px) {
  .shell { flex-direction: column; }
  .side {
    width: 100%; flex-direction: row; align-items: center; gap: var(--sp-2);
    padding: 6px var(--sp-3); border-right: none; border-bottom: 1px solid var(--color-border);
    position: sticky; top: 0; z-index: var(--z-panel);
  }
  .brand { padding: 0; }
  .brand span { display: none; }
  .zone { flex: 1; max-width: 220px; }
  .zone__b { padding: 10px 0; min-height: 44px; display: grid; place-items: center; }
  .side__foot { margin: 0 0 0 auto; padding: 0; }
  .who { display: none; }
  .side__foot :deep(.btn) { min-height: 44px; min-width: 44px; }
  /* 二级导航移到底部，横向平铺，指头够得着 */
  .menu {
    position: fixed; left: 0; right: 0; bottom: 0; margin: 0; z-index: var(--z-panel);
    flex-direction: row; justify-content: flex-start; gap: 0;
    overflow-x: auto; -webkit-overflow-scrolling: touch;
    background: var(--color-surface);
    border-top: 1px solid var(--color-border); padding: 4px 2px calc(4px + env(safe-area-inset-bottom));
  }
  .menu__i {
    /* 教研区有 7 项：7×62px 会超出 375 宽的屏。用 min-width 保住 48px 触控标准，
       宽度不够时让底栏横向滚动，而不是把每一项压扁到点不中。
       R4：图标进底栏后改「图标上/文字下」竖排（原生 TabBar 惯例）。 */
    flex: 1 0 auto; min-width: 52px; justify-content: center; min-height: 48px; padding: 4px 6px;
    flex-direction: column; gap: 2px; position: relative;
    font-size: 11px; border-radius: var(--r-sm); white-space: nowrap;
  }
  /* 竖排后图标是主视觉，18px 才够（16px 在底栏里偏瘦）——直接缩放 svg，模板 :size 不必分支 */
  .menu__i svg { width: 18px; height: 18px; }
  /* badge 重锚：竖排布局下不再靠 margin/位移凑，锚定到图标右上角 */
  .badge { position: absolute; margin: 0; top: 2px; left: calc(50% + 6px); transform: none; }
  .content { padding: var(--sp-3) var(--sp-3) 64px; }   /* 给底栏留出空间 */
}
</style>
