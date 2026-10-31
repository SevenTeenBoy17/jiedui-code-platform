<!-- @copyBudget 70  教研·课例：可复用教学课例与实施记录（课题操作性成果） -->
<template>
  <div class="cs">
    <PageHead desc="沉淀可复用的教学课例与反思">
      <button class="add" @click="creating = true"><BaseIcon name="plus" :size="14" /> 新建课例</button>
    </PageHead>
    <div class="bar">
      <input v-model="q" class="search" type="search" aria-label="搜索课例" placeholder="搜课例…" />
      <!-- 未确认加载完成前不显示计数：避免闪一下「0 例」的假数字 -->
      <span v-if="loaded" class="count">{{ items.length }} 例</span>
    </div>

    <p v-if="loadErr" class="alert">{{ loadErr }}<button class="retry" @click="load">重试</button></p>

    <BentoGrid min="300px" class="stagger">
      <!-- 加载中先铺骨架空卡，防空态闪帧 -->
      <template v-if="loading && !items.length">
        <div v-for="n in 3" :key="`sk${n}`" class="skeleton sk-card" />
      </template>
      <GlassPanel v-for="(c, i) in items" :key="c.id" class="card" :style="{ '--i': i }">
        <div class="card__h">
          <b class="card__t">{{ c.title }}</b>
          <span v-if="c.grade" class="chip chip--muted">{{ c.grade }}</span>
        </div>
        <p class="goal">{{ c.goal || '—' }}</p>
        <div class="meta">
          <span v-if="c.language" class="chip chip--muted">{{ c.language }}</span>
          <span v-for="d in dimsOf(c)" :key="d" class="chip chip--primary">{{ d }}</span>
          <span class="chip chip--muted">{{ c.flow.length }} 环节 · {{ mins(c) }} 分钟</span>
        </div>

        <details v-if="c.flow.length || c.reflection" class="more">
          <summary>看教学流程与反思</summary>
          <ol class="flow">
            <li v-for="(f, j) in c.flow" :key="j">
              <b>{{ f.stage }}</b><i>{{ f.minutes }}′</i>
              <span>师：{{ f.teacher }}</span>
              <span>生：{{ f.student }}</span>
            </li>
          </ol>
          <p v-if="c.reflection" class="ref"><b>教学反思：</b>{{ c.reflection }}</p>
        </details>

        <div class="acts">
          <button class="mini ghost" :disabled="deleting.has(c.id)" @click="del(c)">
            {{ deleting.has(c.id) ? '删除中…' : '删除' }}
          </button>
        </div>
      </GlassPanel>
      <!-- 真空态只在确认成功且确实为空时出现；有搜索词时说清「没匹配」 -->
      <p v-if="loaded && !loading && !items.length" class="empty">
        {{ q ? `没有匹配「${q}」的课例` : '还没有课例，点右上「新建课例」沉淀一节课' }}
      </p>
    </BentoGrid>

    <!-- 新建。data-lint="screen"：整屏阻断层按独立一屏计（lint-copy 口径⑤），
         不并进宿主屏 —— PageHead 组件化后宿主控件数到顶，这层本来就该单独算 -->
    <div v-if="creating" class="mask" data-lint="screen" @click.self="creating = false">
      <GlassPanel ref="sheetEl" strong class="sheet" role="dialog" aria-modal="true" aria-label="新建课例" tabindex="-1">
        <h3 class="sheet__t">新建课例</h3>
        <label class="f"><span>课例标题</span><input v-model="form.title" placeholder="如：猜数字·一课时" /></label>
        <div class="row">
          <label class="f"><span>年级</span>
            <select v-model="form.grade"><option>七年级</option><option>八年级</option><option>九年级</option></select>
          </label>
          <label class="f"><span>语言</span>
            <select v-model="form.language"><option>python</option><option>cpp</option><option>c</option></select>
          </label>
        </div>
        <label class="f"><span>教学目标</span><input v-model="form.goal" placeholder="一句话，如：用循环与条件解决猜数问题" /></label>
        <label class="f"><span>主要培养</span>
          <select v-model="form.dim">
            <option value="">不指定</option>
            <option v-for="(l, k) in DIM" :key="k" :value="k">{{ l }}</option>
          </select>
        </label>
        <label class="f"><span>教学反思</span><textarea v-model="form.reflection" rows="2" placeholder="这节课哪里卡住、下次怎么改" /></label>
        <div class="acts">
          <button class="ok" :disabled="busy || !form.title.trim()" @click="submit">{{ busy ? '保存中…' : '保存' }}</button>
          <button class="cancel" @click="creating = false">取消</button>
        </div>
      </GlassPanel>
    </div>

    <p v-if="tip" class="toast">{{ tip }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { resourcesApi, type TeachCase } from '@/api/resources'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import BentoGrid from '@/components/ui/BentoGrid.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import PageHead from '@/components/ui/PageHead.vue'
import { useModalA11y } from '@/composables/useModalA11y'
import { useToast } from '@/composables/useToast'

const DIM: Record<string, string> = {
  decompose: '分解', abstract: '抽象', model: '建模', algorithm: '算法设计', verify: '验证优化', transfer: '迁移',
}

const items = ref<TeachCase[]>([])
const q = ref('')
const creating = ref(false)
// 弹层焦点圈闭（R3 裁决8）
const sheetEl = ref<InstanceType<typeof GlassPanel>>()
useModalA11y(creating, computed(() => sheetEl.value?.$el as HTMLElement | undefined), () => (creating.value = false))
const busy = ref(false)
const { tip, flash } = useToast()
/** 读取三态（照 ClassesView 样板）：loading=骨架、loaded=确认 200 过、loadErr=最近一次失败摘要 */
const loading = ref(true)
const loaded = ref(false)
const loadErr = ref('')
/** 请求序号守卫：发出前 ++，回包时序号不等则丢弃 —— 杜绝慢的旧响应覆盖新结果 */
let reqSeq = 0
/** 删除中集合：防双击重复删，按钮显「删除中…」并 disabled */
const deleting = ref(new Set<number>())
const form = reactive({ title: '', grade: '七年级', language: 'python', goal: '', dim: '', reflection: '' })

const dimsOf = (c: TeachCase) => Object.keys(c.ct_dims || {}).map((k) => DIM[k] || k).slice(0, 2)
const mins = (c: TeachCase) => c.flow.reduce((a, f) => a + (Number(f.minutes) || 0), 0)

async function load() {
  const seq = ++reqSeq
  loading.value = true
  try {
    const d = await resourcesApi.cases(q.value)
    if (seq !== reqSeq) return              // 已有更新的请求在路上，这包旧数据作废
    items.value = d
    loaded.value = true
    loadErr.value = ''
  } catch (e) {
    if (seq !== reqSeq) return
    // 失败要说失败，不能把错误渲染成「还没有课例」的空态引导
    loadErr.value = e instanceof Error ? e.message : '课例数据加载失败'
  } finally {
    if (seq === reqSeq) loading.value = false
  }
}
async function submit() {
  busy.value = true
  try {
    await resourcesApi.createCase({
      title: form.title, grade: form.grade, language: form.language, goal: form.goal,
      ct_dims: form.dim ? { [form.dim]: 5 } : {}, reflection: form.reflection,
    })
    creating.value = false
    form.title = ''; form.goal = ''; form.reflection = ''
    await load()
    flash('已保存')
  } catch { flash('保存失败') } finally { busy.value = false }
}
/** 硬删无回收站：删除前确认，失败要提示 —— 「看流程」和「删除」两个键紧挨着，很容易点错 */
async function del(c: TeachCase) {
  if (deleting.value.has(c.id)) return      // 双击第二下直接吞掉
  if (!confirm(`删除课例「${c.title}」？删除后无法恢复。`)) return
  deleting.value.add(c.id)
  try {
    await resourcesApi.deleteCase(c.id)
    await load()
    flash('已删除')
  } catch (e) {
    flash(e instanceof Error ? e.message : '删除失败')
  } finally {
    deleting.value.delete(c.id)
  }
}

let qTimer: number | undefined
watch(q, () => {                            // 搜索词 250ms 防抖：停手再查；乱序回包由序号守卫兜底
  window.clearTimeout(qTimer)
  qTimer = window.setTimeout(load, 250)
})
onMounted(load)
onUnmounted(() => window.clearTimeout(qTimer))
</script>

<style scoped>
.cs { display: flex; flex-direction: column; gap: var(--sp-3); }
.bar { display: flex; align-items: center; gap: var(--sp-3); }
.search { height: 34px; width: 200px; border: 1px solid var(--color-border); background: var(--color-surface);
  border-radius: var(--r-md); padding: 0 var(--sp-3); outline: none; font: inherit; }
.count { font-size: var(--fs-sm); color: var(--color-text-3); font-variant-numeric: tabular-nums; }
.add { margin-left: auto; border: none; background: var(--on-primary-bg); color: var(--on-primary-fg);
  padding: 8px 16px; border-radius: var(--r-md); cursor: pointer; font-weight: var(--fw-medium); font-size: var(--fs-sm); }
.card { display: flex; flex-direction: column; gap: 6px; }
.card__h { display: flex; align-items: center; gap: 6px; }
.card__t { font-size: var(--fs-sm); font-weight: var(--fw-bold); flex: 1; }
.goal { font-size: var(--fs-xs); color: var(--color-text-2); min-height: 16px; }
.meta { display: flex; flex-wrap: wrap; gap: 4px; }
.more { font-size: var(--fs-xs); }
.more > summary { cursor: pointer; color: var(--color-primary-ontext); }
.flow { margin: 8px 0 0; padding-left: 18px; font-size: var(--fs-xs); color: var(--color-text-2); }
.flow li { margin-bottom: 5px; line-height: 1.7; }
.flow b { margin-right: 5px; }
.flow i { font-style: normal; color: var(--color-text-3); margin-right: 6px; }
.flow span { display: block; }
.ref { margin-top: 8px; font-size: var(--fs-xs); color: var(--color-text-2); line-height: 1.8; }
.acts { display: flex; gap: 6px; margin-top: auto; }
.mini { border: none; font-size: var(--fs-xs); padding: 4px 12px; border-radius: var(--r-pill); cursor: pointer; }
.mini.ghost { background: var(--ink-a06); color: var(--color-text-3); }
.mini:disabled { opacity: .5; cursor: not-allowed; }
.empty { color: var(--color-text-3); font-size: var(--fs-sm); padding: var(--sp-5); grid-column: 1 / -1; text-align: center; }
.sk-card { height: 72px; border-radius: var(--r-lg); }
/* .alert / .retry 已收编为 global.css 全局错误条 */
.mask { position: fixed; inset: 0; background: var(--ink-a04); display: grid; place-items: center; z-index: var(--z-modal); padding: var(--sp-4); }
.sheet { width: min(440px, 94vw); display: flex; flex-direction: column; gap: var(--sp-3); }
.sheet__t { font-size: var(--fs-md); font-weight: var(--fw-bold); }
.f { display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-xs); color: var(--color-text-2); }
.f input, .f select, .f textarea { border: 1px solid var(--color-border); background: var(--color-surface);
  border-radius: var(--r-md); padding: 9px var(--sp-3); outline: none; font: inherit; font-size: var(--fs-sm); color: var(--color-text); }
.f input, .f select { height: 38px; padding-top: 0; padding-bottom: 0; }
.f textarea { resize: vertical; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); }
.ok { flex: 1; border: none; background: var(--on-primary-bg); color: var(--on-primary-fg); padding: 10px;
  border-radius: var(--r-md); cursor: pointer; font-weight: var(--fw-medium); }
.ok:disabled { opacity: .5; cursor: not-allowed; }
.cancel { border: none; background: var(--ink-a06); color: var(--color-text-2); padding: 10px 18px; border-radius: var(--r-md); cursor: pointer; }
</style>
