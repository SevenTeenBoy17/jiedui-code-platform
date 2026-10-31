<!-- @copyBudget 70  教学·今日：本节课要处理什么（signal 4） -->
<template>
  <div class="today">
    <div class="hello">
      <img :src="asset('teacher_owl')" class="hello__ava" alt="" />
      <div>
        <h2 class="hello__t">{{ greeting }}，{{ auth.user?.name || '老师' }}</h2>
        <p class="hello__s">{{ summary }}</p>
      </div>
      <button v-if="urgent" class="urgent pulse-risk" @click="peek.open('alert:all')">
        {{ urgent }} 条待介入 →
      </button>
    </div>

    <!-- 读取失败必须明说：不能拿空数据把「平稳」演给正在上课的老师看 -->
    <p v-if="error" class="alert">
      {{ error }}<button class="retry" :disabled="loading" @click="load(true)">重试</button>
    </p>

    <BentoGrid min="170px" class="stagger">
      <CeramicTile v-for="(t, i) in tiles" :key="t.id" :spec="t" :style="{ '--i': i }" />
    </BentoGrid>

    <GlassPanel v-if="alerts.length" class="quick">
      <h3 class="quick__t">需要你看一眼</h3>
      <ul class="alist">
        <!-- 干预入口收进 button：Tab 可达、Enter 可开，focus-visible 走全局 -->
        <li v-for="a in alerts.slice(0, 4)" :key="a.id">
          <button class="row-btn" @click="peek.open(`alert:${a.id}`)">
            <span class="lv" :class="{ hi: a.level >= 4 }">{{ a.level >= 4 ? '高危' : '中危' }}</span>
            <b>{{ a.studentName }}</b>
            <span class="cat">{{ catLabel(a.category) }}</span>
          </button>
        </li>
      </ul>
    </GlassPanel>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { asset } from '@/assets/assets'
import { useAuthStore } from '@/stores/auth'
import { useTeacherHome } from '@/composables/useTeacherHome'
import { usePeek } from '@/composables/usePeek'
import BentoGrid from '@/components/ui/BentoGrid.vue'
import CeramicTile from '@/components/ui/CeramicTile.vue'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import type { TileSpec } from '@/types/tile'

const auth = useAuthStore()
const peek = usePeek()
const { kpis, alerts, urgent, error, loading, load } = useTeacherHome()

const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 11 ? '早上好' : h < 18 ? '下午好' : '晚上好'
})
/** 三态口径：错误 → 明说不可信；没拿到数据 → 不许说「平稳」；只有确认拿到才下判断 */
const summary = computed(() => {
  if (error.value) return '数据没取到，下面的数字不可信'
  if (!kpis.value) return '数据加载中…'
  return urgent.value ? `有 ${urgent.value} 位同学需要你介入` : '班级状态平稳，可以开始上课了'
})

/** KPI 瓷片：1 判断 + 1 动作（解释走 hint、明细走 drill）；未拿到数据显 '—'，0 是数据不是占位 */
const tiles = computed<TileSpec[]>(() => [
  { id: 'stu', label: '学生', value: kpis.value?.students ?? '—', icon: 'tile_bank', tint: 'blue',
    hint: '平台上有学习记录的学生数', drill: { to: '/teacher/teaching/students' } },
  { id: 'on', label: '在线', value: kpis.value?.online ?? '—', icon: 'tile_practice', tint: 'teal', state: 'ok',
    hint: '最近 10 分钟有活动', drill: { to: '/teacher/teaching/live' } },
  { id: 'sub', label: '今日提交', value: kpis.value?.submissions ?? '—', icon: 'tile_report', tint: 'lavender',
    hint: '学生保存的作品版本数', drill: { to: '/teacher/teaching/tasks' } },
  { id: 'alert', label: '待介入', value: kpis.value?.alerts ?? '—', icon: 'tile_push', tint: 'peach',
    state: (kpis.value?.alerts ?? 0) > 0 ? 'risk' : 'ok',
    hint: '安全护栏触发的高危/中危事件', drill: { peek: 'alert:all' } },
])

function catLabel(c: string) {
  return ({ self_harm: '情绪风险', violence: '暴力倾向', fraud: '诈骗话术', adult: '不良内容', profanity: '不文明用语' } as any)[c] || c
}

onMounted(() => load())
</script>

<style scoped>
.today { display: flex; flex-direction: column; gap: var(--sp-4); }
.hello { display: flex; align-items: center; gap: var(--sp-3); }
.hello__ava { width: 56px; height: 56px; }
.hello__t { font-size: var(--fs-lg); font-weight: var(--fw-bold); }
.hello__s { font-size: var(--fs-sm); color: var(--color-text-2); margin-top: 2px; }
.urgent { margin-left: auto; border: none; background: var(--on-danger-bg); color: var(--on-danger-fg);
  padding: 8px 16px; border-radius: var(--r-pill); cursor: pointer; font-weight: var(--fw-medium); }
/* .alert / .retry 已收编为 global.css 全局错误条 */
.quick__t { font-size: var(--fs-md); font-weight: var(--fw-bold); margin-bottom: var(--sp-2); }
.alist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.alist li { border-radius: var(--r-md); font-size: var(--fs-sm); }
/* 行级干预入口是 button（键盘可达）：同等 padding 从 li 移入 */
.row-btn { width: 100%; text-align: inherit; background: none; border: none; font: inherit; cursor: pointer;
  display: flex; align-items: center; gap: var(--sp-2); padding: 8px 10px; border-radius: var(--r-md); }
.row-btn:hover { background: var(--ink-a06); }
.lv { font-size: var(--fs-xs); color: var(--ink-900); background: var(--color-warning); padding: 1px 9px; border-radius: var(--r-pill); }
.lv.hi { background: var(--on-danger-bg); color: var(--on-danger-fg); }
.cat { color: var(--color-text-3); }
</style>
