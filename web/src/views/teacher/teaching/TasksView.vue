<!-- @copyBudget 70  教学·任务：按班下发 + 完成率（任务 = 带班级与截止的推送，不另造一套） -->
<template>
  <div class="tk">
    <PageHead desc="按班下发练习并跟进完成率">
      <button class="add" :disabled="!classes.length"
              :title="classes.length ? '' : classesOk ? '还没有班级，先到「班级」建一个班' : '班级数据没取到，暂时不能选班下发'"
              @click="creating = true"><BaseIcon name="plus" :size="14" /> 下发任务</button>
    </PageHead>
    <div class="bar">
      <!-- 未确认加载完成前不显示计数：避免闪一下「0 次下发」的假数字 -->
      <span v-if="loaded" class="count">{{ items.length }} 次下发 · 平均完成 {{ avgDone }}%</span>
    </div>
    <p v-if="loadErr" class="alert">{{ loadErr }}<button class="retry" @click="load">重试</button></p>
    <!-- 建班引导只在 classes 源确认成功且真没有班时出现：源挂了不冒充 -->
    <p v-if="classesOk && !classes.length" class="hint">先到「班级」建一个班，才能按班下发</p>

    <!-- 下发记录转表（R6 裁决6）：卡片墙 → 数据表，一屏对比完成率/截止/必做。
         「班级」列不做：PushRec 无班级字段，待后端补 class_names 再加列 -->
    <GlassPanel v-if="loading || items.length">
      <div class="tbl-scroll">
        <table class="tbl">
          <thead>
            <tr>
              <th>资源</th>
              <th class="num">完成率</th>
              <th class="num">已读</th>
              <th>截止</th>
              <th>必做</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <!-- 加载中铺骨架行（colspan 三态模式照 StudentsView）：不让空态引导闪一帧假「没下发」 -->
            <template v-if="loading && !items.length">
              <tr v-for="n in 3" :key="`sk${n}`">
                <td v-for="j in 6" :key="j"><span class="skeleton sk-cell" /></td>
              </tr>
            </template>
            <tr v-for="p in items" :key="p.id">
              <td>
                <b class="res__t">{{ p.title }}</b>
                <span class="chip chip--muted">{{ RES_CN[p.res_type] || p.res_type }}</span>
              </td>
              <td class="num">
                <b class="rate" :class="{ good: rate(p) >= 60 }">{{ rate(p) }}%</b>
                <span class="sub">{{ p.done }}/{{ p.total }}</span>
              </td>
              <td class="num">{{ p.read }}</td>
              <td><span class="chip" :class="overdue(p) ? 'chip--danger' : 'chip--muted'">{{ dueText(p) }}</span></td>
              <td><span v-if="p.required" class="chip chip--primary">必做</span><span v-else class="mute">—</span></td>
              <td><span class="ellip" :title="p.reason || undefined">{{ p.reason || '—' }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </GlassPanel>
    <!-- 空态双轨（R6 裁决6）：真·零数据不渲染表格，原地走表外 EmptyState；错误态/加载中不许冒充空态 -->
    <EmptyState v-if="loaded && !loading && !items.length" icon="mascot_cat"
                title="还没有下发任务" cta="下发第一份任务" cta-icon="plus" @cta="creating = true" />

    <div v-if="creating" class="mask" @click.self="creating = false">
      <GlassPanel ref="sheetEl" strong class="sheet" role="dialog" aria-modal="true" aria-label="下发任务" tabindex="-1">
        <h3 class="sheet__t">下发任务</h3>
        <label class="f"><span>选资源</span>
          <select v-model="form.res">
            <optgroup label="题目">
              <option v-for="e in exercises" :key="`e${e.id}`" :value="`exercise:${e.id}`">{{ e.title }}</option>
            </optgroup>
            <optgroup label="练习集">
              <option v-for="s in sets" :key="`s${s.id}`" :value="`set:${s.id}`">{{ s.title }}</option>
            </optgroup>
            <optgroup label="视频">
              <option v-for="v in videos" :key="`v${v.id}`" :value="`video:${v.id}`">{{ v.title }}</option>
            </optgroup>
          </select>
        </label>
        <div class="f"><span>发给哪些班（{{ picked }} 人）</span>
          <div class="cls">
            <label v-for="c in classes" :key="c.id" class="pick">
              <input type="checkbox" :value="c.id" v-model="form.class_ids" />{{ c.name }}·{{ c.size }}人
            </label>
          </div>
        </div>
        <div class="row">
          <label class="f"><span>截止日期</span><input v-model="form.due" type="date" /></label>
          <label class="f chk"><span>必做</span><input v-model="form.required" type="checkbox" /></label>
        </div>
        <label class="f"><span>一句话说明</span><input v-model="form.reason" placeholder="如：周三前完成，重点练循环" /></label>
        <div class="acts">
          <button class="ok" :disabled="busy || !form.res || !form.class_ids.length" @click="submit">
            {{ busy ? '下发中…' : '下发' }}
          </button>
          <button class="cancel" @click="creating = false">取消</button>
        </div>
      </GlassPanel>
    </div>

    <p v-if="tip" class="toast">{{ tip }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { resourcesApi, type PushRec, type Klass, type Exercise, type ExSet, type Video } from '@/api/resources'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import PageHead from '@/components/ui/PageHead.vue'
import { useModalA11y } from '@/composables/useModalA11y'
import { useToast } from '@/composables/useToast'

/** 资源类型中文名：表格「资源」列的小 chip 用（未知类型回退原值） */
const RES_CN: Record<string, string> = { exercise: '题目', set: '练习集', video: '视频', assessment: '测评' }

const items = ref<PushRec[]>([])
const classes = ref<Klass[]>([])
const exercises = ref<Exercise[]>([])
const sets = ref<ExSet[]>([])
const videos = ref<Video[]>([])
const creating = ref(false)
// 弹层焦点圈闭（R3 裁决8）：Esc 关、Tab 圈内循环、关闭还焦点
const sheetEl = ref<InstanceType<typeof GlassPanel>>()
useModalA11y(creating, computed(() => sheetEl.value?.$el as HTMLElement | undefined), () => (creating.value = false))
const busy = ref(false)
const { tip, flash } = useToast()
/** 读取三态：loading=骨架占位、loaded=下发列表源确认 200 过、loadErr=最近一次失败摘要（空串即无错） */
const loading = ref(true)
const loaded = ref(false)
const loadErr = ref('')
/** classes 源确认成功过：区分「真没有班」与「班级数据没取到」 */
const classesOk = ref(false)
const form = reactive({ res: '', class_ids: [] as number[], due: '', required: false, reason: '' })

const rate = (p: PushRec) => (p.total ? Math.round((p.done / p.total) * 100) : 0)
const avgDone = computed(() =>
  items.value.length ? Math.round(items.value.reduce((a, p) => a + rate(p), 0) / items.value.length) : 0)
/** 覆盖人数去重：同一学生在两个班只算一次 */
const picked = computed(() =>
  new Set(classes.value.filter((c) => form.class_ids.includes(c.id)).flatMap((c) => c.student_ids)).size)

const overdue = (p: PushRec) => !!p.due_at && p.due_at * 1000 < Date.now() && rate(p) < 100
const dueText = (p: PushRec) =>
  p.due_at ? `截止 ${new Date(p.due_at * 1000).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}` : '不限时'

/**
 * 五源 allSettled 逐源降级：任何一源挂掉都不拖垮整页 ——
 * 曾经是 Promise.all + 空 catch，classes 一挂五个源全部清零，
 * 页面渲染成「还没有下发记录」的假空态，在骗老师。
 */
async function load() {
  loading.value = true
  const [ps, cs, ex, st, vd] = await Promise.allSettled([
    resourcesApi.pushes(), resourcesApi.classes(),
    resourcesApi.exercises(), resourcesApi.sets(), resourcesApi.videos(),
  ])
  if (ps.status === 'fulfilled') { items.value = ps.value; loaded.value = true }
  if (cs.status === 'fulfilled') { classes.value = cs.value.items; classesOk.value = true }
  if (ex.status === 'fulfilled') exercises.value = ex.value
  if (st.status === 'fulfilled') sets.value = st.value
  if (vd.status === 'fulfilled') videos.value = vd.value
  // 失败要说失败：主列表挂了直说；辅源挂了提示下发面板可能不全
  loadErr.value = ps.status === 'rejected'
    ? '任务数据没取到，不是真的没下发'
    : [cs, ex, st, vd].some((r) => r.status === 'rejected')
      ? '部分数据没取到（班级或资源），下发面板可能不全'
      : ''
  loading.value = false
}
async function submit() {
  busy.value = true
  try {
    const [res_type, id] = form.res.split(':')
    const r = await resourcesApi.push({
      res_type, res_id: Number(id), class_ids: form.class_ids, reason: form.reason,
      required: form.required ? 1 : 0,
      due_at: form.due ? Math.floor(new Date(`${form.due}T23:59:59`).getTime() / 1000) : null,
    })
    creating.value = false
    form.reason = ''; form.class_ids = []
    await load()
    flash(`已下发给 ${r.targets} 人`)
  } catch { flash('下发失败') } finally { busy.value = false }
}

onMounted(load)
</script>

<style scoped>
.tk { display: flex; flex-direction: column; gap: var(--sp-3); }
.bar { display: flex; align-items: center; gap: var(--sp-3); }
.count { font-size: var(--fs-sm); color: var(--color-text-3); font-variant-numeric: tabular-nums; }
.hint { font-size: var(--fs-xs); color: var(--color-text-3); }
.add { margin-left: auto; border: none; background: var(--on-primary-bg); color: var(--on-primary-fg);
  padding: 8px 16px; border-radius: var(--r-md); cursor: pointer; font-weight: var(--fw-medium); font-size: var(--fs-sm); }
.add:disabled { opacity: .5; cursor: not-allowed; }
/* .tbl / .num / .tbl-scroll 走 global.css；下面只有本表专属的格内元素 */
.res__t { font-weight: var(--fw-bold); margin-right: 6px; }
.rate { font-variant-numeric: tabular-nums; }
.rate.good { color: var(--color-success); }
.sub { font-size: var(--fs-xs); color: var(--color-text-3); margin-left: 4px; font-variant-numeric: tabular-nums; }
.mute { color: var(--color-text-3); }
/* 说明列单行截断：完整文案挂在 title 属性上悬停看 */
.ellip { display: inline-block; max-width: 220px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; vertical-align: bottom; }
/* 骨架行格子：shimmer 背景走 motion.css 的 .skeleton */
.sk-cell { display: block; height: 12px; }
/* .alert / .retry 已收编为 global.css 全局错误条 */
.mask { position: fixed; inset: 0; background: var(--ink-a04); display: grid; place-items: center; z-index: var(--z-modal); padding: var(--sp-4); }
.sheet { width: min(440px, 94vw); display: flex; flex-direction: column; gap: var(--sp-3); }
.sheet__t { font-size: var(--fs-md); font-weight: var(--fw-bold); }
.f { display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-xs); color: var(--color-text-2); }
.f input, .f select { border: 1px solid var(--color-border); background: var(--color-surface);
  border-radius: var(--r-md); padding: 0 var(--sp-3); outline: none; font: inherit; font-size: var(--fs-sm);
  color: var(--color-text); height: 38px; }
.f.chk { justify-content: flex-end; }
.f.chk input { height: 18px; width: 18px; margin-bottom: 10px; }
.cls { display: flex; flex-wrap: wrap; gap: 4px 10px; max-height: 96px; overflow: auto; }
.pick { display: flex; align-items: center; gap: 4px; cursor: pointer; }
.row { display: grid; grid-template-columns: 1fr auto; gap: var(--sp-3); }
.acts { display: flex; gap: 6px; }
.ok { flex: 1; border: none; background: var(--on-primary-bg); color: var(--on-primary-fg); padding: 10px;
  border-radius: var(--r-md); cursor: pointer; font-weight: var(--fw-medium); }
.ok:disabled { opacity: .5; cursor: not-allowed; }
.cancel { border: none; background: var(--ink-a06); color: var(--color-text-2); padding: 10px 18px; border-radius: var(--r-md); cursor: pointer; }
</style>
