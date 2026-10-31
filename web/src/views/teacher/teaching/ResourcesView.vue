<!-- @copyBudget 70  教学·资源：题库 | 视频 | 练习集（signal 4） -->
<template>
  <div class="res">
    <PageHead desc="管理题库、视频与练习集">
      <button class="add" @click="creating = true"><BaseIcon name="plus" :size="14" /> 新建</button>
    </PageHead>
    <div class="bar">
      <nav class="tabs">
        <button v-for="t in TABS" :key="t.k" class="tab" :class="{ on: tab === t.k }" @click="setTab(t.k)">
          {{ t.label }}
        </button>
      </nav>
      <input v-model="q" class="search" type="search" aria-label="搜索资源" placeholder="搜索…" />
    </div>

    <p v-if="loadErr" class="alert">{{ loadErr }}<button class="retry" @click="load">重试</button></p>

    <!-- 题库 -->
    <BentoGrid v-if="tab === 'bank'" min="230px" class="stagger">
      <!-- 加载中先铺骨架空卡，防空态闪帧 -->
      <template v-if="loading && !exercises.length">
        <div v-for="n in 3" :key="`sk${n}`" class="skeleton sk-card" />
      </template>
      <GlassPanel v-for="(e, i) in exercises" :key="e.id" class="card" :style="{ '--i': i }">
        <div class="card__h">
          <b class="card__t">{{ e.title }}</b>
          <span class="diff" :class="'d' + e.difficulty">{{ DIFF[e.difficulty] }}</span>
        </div>
        <p class="card__s">{{ e.summary || '—' }}</p>
        <div class="meta">
          <span class="chip chip--muted">{{ e.language }}</span>
          <span v-if="e.ct_primary" class="chip chip--muted">{{ DIM[e.ct_primary] || e.ct_primary }}</span>
          <span class="chip chip--muted">{{ e.case_count }} 测试点</span>
        </div>
        <div class="acts">
          <button class="mini" @click="openPush('exercise', e.id)">推送</button>
          <button class="mini ghost" :disabled="deleting.has(`exercise:${e.id}`)"
                  @click="del('exercise', e.id, e.title)">
            {{ deleting.has(`exercise:${e.id}`) ? '删除中…' : '删除' }}
          </button>
        </div>
      </GlassPanel>
      <!-- 真空态只在确认成功且确实为空时出现；有搜索词时说清「没匹配」而不是「没有题」 -->
      <p v-if="loaded && !loading && !exercises.length && q" class="empty">没有匹配「{{ q }}」的题目</p>
      <EmptyState v-else-if="loaded && !loading && !exercises.length" icon="mascot_cat"
                  title="还没有题目" cta="新建" cta-icon="plus" @cta="creating = true" />
    </BentoGrid>

    <!-- 视频 -->
    <BentoGrid v-else-if="tab === 'video'" min="230px" class="stagger">
      <template v-if="loading && !videos.length">
        <div v-for="n in 3" :key="`sk${n}`" class="skeleton sk-card" />
      </template>
      <GlassPanel v-for="(v, i) in videos" :key="v.id" class="card" :style="{ '--i': i }">
        <div class="card__h">
          <b class="card__t">{{ v.title }}</b>
          <span v-if="v.review_state !== 'ok'" class="warn" title="外链不在白名单，学生端暂不可见">待审核</span>
        </div>
        <p class="card__s">{{ v.summary || '—' }}</p>
        <div class="meta"><span v-if="v.category" class="chip chip--muted">{{ v.category }}</span></div>
        <div class="acts">
          <button class="mini" @click="openPush('video', v.id)">推送</button>
          <button class="mini ghost" :disabled="deleting.has(`video:${v.id}`)"
                  @click="del('video', v.id, v.title)">
            {{ deleting.has(`video:${v.id}`) ? '删除中…' : '删除' }}
          </button>
        </div>
      </GlassPanel>
      <p v-if="loaded && !loading && !videos.length" class="empty">
        {{ q ? `没有匹配「${q}」的视频` : '还没有视频，点右上「新建」加一个链接' }}
      </p>
    </BentoGrid>

    <!-- 练习集 -->
    <BentoGrid v-else min="230px" class="stagger">
      <template v-if="loading && !sets.length">
        <div v-for="n in 3" :key="`sk${n}`" class="skeleton sk-card" />
      </template>
      <GlassPanel v-for="(s, i) in sets" :key="s.id" class="card" :style="{ '--i': i }">
        <b class="card__t">{{ s.title }}</b>
        <p class="card__s">{{ s.goal || '—' }}</p>
        <div class="meta"><span class="chip chip--muted">{{ s.item_count }} 项</span></div>
        <div class="acts"><button class="mini" @click="openPush('set', s.id)">推送</button></div>
      </GlassPanel>
      <!-- 练习集接口不带搜索，空态不分 q -->
      <p v-if="loaded && !loading && !sets.length" class="empty">还没有练习集</p>
    </BentoGrid>

    <NewResource v-if="creating" :kind="tab" @close="creating = false" @done="onCreated" />
    <PushSheet v-if="push" :res-type="push.t" :res-id="push.id" @close="push = null" @done="onPushed" />
    <p v-if="tip" class="toast">{{ tip }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { resourcesApi, type Exercise, type Video, type ExSet } from '@/api/resources'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import BentoGrid from '@/components/ui/BentoGrid.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PageHead from '@/components/ui/PageHead.vue'
import NewResource from '@/components/resources/NewResource.vue'
import PushSheet from '@/components/resources/PushSheet.vue'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const TABS = [{ k: 'bank', label: '题库' }, { k: 'video', label: '视频' }, { k: 'set', label: '练习集' }]
const DIFF: Record<number, string> = { 1: '入门', 2: '基础', 3: '提高', 4: '挑战' }
const DIM: Record<string, string> = {
  decompose: '分解', abstract: '抽象', model: '建模', algorithm: '算法', verify: '验证', transfer: '迁移',
}

const tab = computed(() => String(route.query.tab || 'bank'))
const q = ref('')
const creating = ref(false)
const push = ref<{ t: string; id: number } | null>(null)
const { tip, flash } = useToast()
/** 读取三态（照 ClassesView 样板）：loading=骨架、loaded=确认 200 过、loadErr=最近一次失败摘要 */
const loading = ref(true)
const loaded = ref(false)
const loadErr = ref('')
/** 请求序号守卫：发出前 ++，回包时序号不等则丢弃 —— 杜绝慢的旧响应覆盖新结果 */
let reqSeq = 0
/** 删除中集合（`kind:id`）：防双击重复删，按钮显「删除中…」并 disabled */
const deleting = ref(new Set<string>())

const exercises = ref<Exercise[]>([])
const videos = ref<Video[]>([])
const sets = ref<ExSet[]>([])

function setTab(k: string) { router.replace({ query: { ...route.query, tab: k } }) }

async function load() {
  const seq = ++reqSeq
  loading.value = true
  try {
    if (tab.value === 'bank') {
      const d = await resourcesApi.exercises(q.value)
      if (seq !== reqSeq) return               // 已有更新的请求在路上，这包旧数据作废
      exercises.value = d
    } else if (tab.value === 'video') {
      const d = await resourcesApi.videos(q.value)
      if (seq !== reqSeq) return
      videos.value = d
    } else {
      const d = await resourcesApi.sets()
      if (seq !== reqSeq) return
      sets.value = d
    }
    loaded.value = true
    loadErr.value = ''
  } catch (e) {
    if (seq !== reqSeq) return
    // 失败要说失败，不能把错误渲染成「还没有资源」的空态引导
    loadErr.value = e instanceof Error ? e.message : '资源数据加载失败'
  } finally {
    if (seq === reqSeq) loading.value = false
  }
}

function openPush(t: string, id: number) { push.value = { t, id } }
function onPushed(n: number) { push.value = null; flash(`已推送给 ${n} 位学生`) }
function onCreated() { creating.value = false; load(); flash('已创建') }
/** 后端是硬删、没有回收站，删除前必须确认；失败也要说出来，不能默默什么都没发生。 */
async function del(kind: string, id: number, title = '') {
  const key = `${kind}:${id}`
  if (deleting.value.has(key)) return          // 双击第二下直接吞掉
  const what = kind === 'exercise' ? '题目' : '视频'
  if (!confirm(`删除${what}「${title || id}」？删除后无法恢复。`)) return
  deleting.value.add(key)
  try {
    if (kind === 'exercise') await resourcesApi.deleteExercise(id)
    else await resourcesApi.deleteVideo(id)
    await load()
    flash('已删除')
  } catch (e) {
    flash(e instanceof Error ? e.message : '删除失败')
  } finally {
    deleting.value.delete(key)
  }
}

watch(tab, load)                               // 切页签立即取
let qTimer: number | undefined
watch(q, () => {                               // 搜索词 250ms 防抖：停手再查；乱序回包由序号守卫兜底
  window.clearTimeout(qTimer)
  qTimer = window.setTimeout(load, 250)
})
onMounted(load)
onUnmounted(() => window.clearTimeout(qTimer))
</script>

<style scoped>
.res { display: flex; flex-direction: column; gap: var(--sp-3); }
.bar { display: flex; align-items: center; gap: var(--sp-3); }
.tabs { display: flex; gap: 3px; background: var(--ink-a06); padding: 3px; border-radius: var(--r-md); }
.tab { border: none; background: transparent; padding: 6px 14px; border-radius: var(--r-sm); cursor: pointer;
  font-size: var(--fs-sm); color: var(--color-text-2); }
.tab.on { background: #fff; color: var(--color-primary-strong); font-weight: var(--fw-medium); box-shadow: var(--shadow-sm); }
.search { height: 34px; width: 180px; border: 1px solid var(--color-border); background: var(--color-surface);
  border-radius: var(--r-md); padding: 0 var(--sp-3); outline: none; font: inherit; }
.add { margin-left: auto; border: none; background: var(--color-primary); color: #fff;
  padding: 8px 16px; border-radius: var(--r-md); cursor: pointer; font-weight: var(--fw-medium); font-size: var(--fs-sm); }
.card { display: flex; flex-direction: column; gap: 6px; }
.card__h { display: flex; align-items: center; gap: 6px; }
.card__t { font-size: var(--fs-sm); font-weight: var(--fw-bold); flex: 1; }
.card__s { font-size: var(--fs-xs); color: var(--color-text-3); min-height: 16px; }
.meta { display: flex; flex-wrap: wrap; gap: 4px; }
.diff { font-size: var(--fs-xs); padding: 2px 8px; border-radius: var(--r-pill); background: var(--color-primary-soft); color: var(--color-primary-strong); }
.diff.d3, .diff.d4 { background: #ffe9c9; color: var(--color-accent-ontext); }
.warn { font-size: var(--fs-xs); background: #ffe3e3; color: var(--color-danger); padding: 2px 8px; border-radius: var(--r-pill); }
.acts { display: flex; gap: 6px; margin-top: 2px; }
.mini { border: none; background: var(--color-primary-soft); color: var(--color-primary-strong);
  font-size: var(--fs-xs); padding: 4px 12px; border-radius: var(--r-pill); cursor: pointer; }
.mini.ghost { background: var(--ink-a06); color: var(--color-text-3); }
.mini:disabled { opacity: .5; cursor: not-allowed; }
.empty { color: var(--color-text-3); font-size: var(--fs-sm); padding: var(--sp-5); grid-column: 1 / -1; text-align: center; }
.sk-card { height: 72px; border-radius: var(--r-lg); }
/* .alert / .retry 已收编为 global.css 全局错误条 */
</style>
