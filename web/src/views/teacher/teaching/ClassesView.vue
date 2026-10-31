<!-- @copyBudget 60  教学·班级：下发与统计的单位（名单折叠，不铺满屏） -->
<template>
  <div class="cl">
    <PageHead desc="建班与名单管理：下发和统计都以班为单位">
      <button class="add" @click="creating = true"><BaseIcon name="plus" :size="14" /> 新建班级</button>
    </PageHead>
    <div class="bar">
      <!-- 未确认加载完成前不显示计数：避免闪一下「0 个班」的假数字 -->
      <span v-if="loaded" class="count">{{ items.length }} 个班 · {{ covered }}/{{ roster.length }} 人已分班</span>
    </div>

    <p v-if="loadErr" class="alert">{{ loadErr }}<button class="retry" @click="load">重试</button></p>

    <BentoGrid min="300px" class="stagger">
      <GlassPanel v-for="(c, i) in items" :key="c.id" class="card" :style="{ '--i': i }">
        <div class="card__h">
          <b class="card__t">{{ c.name }}</b>
          <span v-if="c.grade" class="chip chip--muted">{{ c.grade }}</span>
          <span class="size">{{ c.size }} 人</span>
        </div>
        <p class="names">{{ c.size ? nameList(c) : '还没有学生，展开下面勾选' }}</p>

        <details class="more" @toggle="onToggle(c, $event)">
          <summary>编辑名单</summary>
          <div class="roster">
            <label v-for="s in roster" :key="s.id" class="pick">
              <input type="checkbox" :value="s.id" v-model="drafts[c.id]" />{{ s.name }}
            </label>
          </div>
          <textarea v-model="paste[c.id]" class="paste" rows="2"
                    placeholder="批量添加：一行一个学号，粘贴后点下面按钮" />
          <div class="acts">
            <button class="mini" :disabled="!paste[c.id]" @click="appendPaste(c)">追加到名单</button>
            <button class="mini ok" :disabled="busy" @click="saveRoster(c)">保存名单</button>
          </div>
        </details>

        <div class="opts">
          <label class="soc" title="开启后本班学生的 AI 只提问、不写代码，学生端关不掉">
            <input type="checkbox" :checked="c.socratic" @change="toggleSocratic(c, $event)" />
            苏格拉底
          </label>
          <select class="grp" :value="c.group_kind || ''" @change="setGroup(c, $event)"
                  title="课题分组：实验组用苏格拉底引导，对照组照常上课">
            <option v-for="g in GROUPS" :key="g.k" :value="g.k">{{ g.label }}</option>
          </select>
        </div>

        <div class="acts"><button class="mini ghost" @click="del(c)">删除</button></div>
      </GlassPanel>
      <!-- 建班引导只在「确认拉到数据且确实为空」时出现，错误态不冒充空态 -->
      <p v-if="loaded && !items.length" class="empty">还没有班级，先建一个再下发任务</p>
    </BentoGrid>

    <div v-if="creating" class="mask" @click.self="creating = false">
      <GlassPanel ref="sheetEl" strong class="sheet" role="dialog" aria-modal="true" aria-label="新建班级" tabindex="-1">
        <h3 class="sheet__t">新建班级</h3>
        <label class="f"><span>班级名称</span><input v-model="form.name" placeholder="如：初一(2)班" /></label>
        <label class="f"><span>年级</span>
          <select v-model="form.grade"><option>七年级</option><option>八年级</option><option>九年级</option></select>
        </label>
        <div class="acts">
          <button class="ok" :disabled="busy || !form.name.trim()" @click="submit">{{ busy ? '保存中…' : '保存' }}</button>
          <button class="cancel" @click="creating = false">取消</button>
        </div>
      </GlassPanel>
    </div>

    <p v-if="tip" class="toast">{{ tip }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { resourcesApi, type Klass, type RosterItem } from '@/api/resources'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import BentoGrid from '@/components/ui/BentoGrid.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import PageHead from '@/components/ui/PageHead.vue'
import { useModalA11y } from '@/composables/useModalA11y'
import { useToast } from '@/composables/useToast'

const items = ref<Klass[]>([])
const roster = ref<RosterItem[]>([])
/**
 * 勾选草稿**按班级 id 分开存**。
 * 曾经是共用一个 draft：同时展开两个班的名单，后展开的会把先展开那个面板里的
 * 勾选状态一起改掉，在第一个班点「保存名单」就把 A 班存成了 B 班的人。
 */
const drafts = reactive<Record<number, string[]>>({})
const paste = reactive<Record<number, string>>({})
const GROUPS = [{ k: '', label: '不参与课题' }, { k: 'exp', label: '实验组' }, { k: 'ctrl', label: '对照组' }]
const creating = ref(false)
// 弹层焦点圈闭（R3 裁决8）
const sheetEl = ref<InstanceType<typeof GlassPanel>>()
useModalA11y(creating, computed(() => sheetEl.value?.$el as HTMLElement | undefined), () => (creating.value = false))
const busy = ref(false)
const { tip, flash } = useToast()
/** 读取三态：loaded=确认 200 过、loadErr=最近一次失败原因（空串即无错） */
const loaded = ref(false)
const loadErr = ref('')
const form = reactive({ name: '', grade: '七年级' })

/** 已分班人数：同一学生进多个班只算一次 */
const covered = computed(() => new Set(items.value.flatMap((c) => c.student_ids)).size)
const nameOf = (id: string) => roster.value.find((r) => r.id === id)?.name || id
const nameList = (c: Klass) =>
  c.student_ids.slice(0, 6).map(nameOf).join('、') + (c.size > 6 ? ` 等 ${c.size} 人` : '')

/** 展开时把该班当前名单灌进它自己的草稿槽 */
function onToggle(c: Klass, e: Event) {
  if ((e.target as HTMLDetailsElement).open) drafts[c.id] = [...c.student_ids]
}

/**
 * 批量粘贴学号。开学第一节课名册是空的：roster 只列「已产生过行为」的学生，
 * 光靠勾选根本无人可勾，整条研究流程在第 0 步就走不通。
 */
function appendPaste(c: Klass) {
  const ids = (paste[c.id] || '').split('\n').map((s) => s.trim()).filter(Boolean)
    .map((s) => (s.startsWith('stu-') ? s : `stu-${s}`))
  drafts[c.id] = [...new Set([...(drafts[c.id] || c.student_ids), ...ids])]
  paste[c.id] = ''
  flash(`已加入 ${ids.length} 人，记得点「保存名单」`)
}

async function setGroup(c: Klass, e: Event) {
  const kind = (e.target as HTMLSelectElement).value
  try {
    const r = await resourcesApi.setClassGroup(c.id, kind)
    c.group_kind = kind
    if (r.socratic_hint && !c.socratic) {
      // 实验组的干预就是苏格拉底引导 —— 顺手提醒，但不替老师做决定
      flash('已设为实验组。记得把上面的「强制苏格拉底引导」也打开')
    } else {
      flash('已保存分组')
    }
  } catch {
    flash('设置失败')
  }
}

async function toggleSocratic(c: Klass, e: Event) {
  const on = (e.target as HTMLInputElement).checked
  try {
    await resourcesApi.setClassSocratic(c.id, on)
    c.socratic = on
    flash(on ? `已锁定「${c.name}」为苏格拉底式引导` : '已解除锁定')
  } catch {
    ;(e.target as HTMLInputElement).checked = !on
    flash('设置失败')
  }
}

async function load() {
  try {
    const d = await resourcesApi.classes()
    items.value = d.items
    roster.value = d.roster
    loaded.value = true
    loadErr.value = ''
  } catch (e) {
    // 失败要说失败，不能把错误渲染成「还没有班级」的空态引导
    loadErr.value = e instanceof Error ? e.message : '班级数据加载失败'
  }
}
async function submit() {
  busy.value = true
  try {
    await resourcesApi.createClass({ name: form.name, grade: form.grade })
    creating.value = false
    form.name = ''
    await load()
    flash('已创建')
  } catch { flash('保存失败') } finally { busy.value = false }
}
async function saveRoster(c: Klass) {
  busy.value = true
  try {
    const r = await resourcesApi.setClassStudents(c.id, drafts[c.id] || [])
    await load()
    flash(`已保存 ${r.size} 人`)
  } catch { flash('保存失败') } finally { busy.value = false }
}
async function del(c: Klass) {
  if (!confirm(`删除「${c.name}」？已下发的任务记录不受影响。`)) return
  try {
    await resourcesApi.deleteClass(c.id)
    await load()
    flash('已删除')
  } catch (e) {
    // 不接住的话删除失败会变成未捕获的 Promise 拒绝：既不提示也不刷新，老师以为删掉了
    flash(e instanceof Error ? e.message : '删除失败')
  }
}

onMounted(load)
</script>

<style scoped>
.cl { display: flex; flex-direction: column; gap: var(--sp-3); }
.bar { display: flex; align-items: center; gap: var(--sp-3); }
.count { font-size: var(--fs-sm); color: var(--color-text-3); font-variant-numeric: tabular-nums; }
.add { margin-left: auto; border: none; background: var(--on-primary-bg); color: var(--on-primary-fg);
  padding: 8px 16px; border-radius: var(--r-md); cursor: pointer; font-weight: var(--fw-medium); font-size: var(--fs-sm); }
.card { display: flex; flex-direction: column; gap: 6px; }
.card__h { display: flex; align-items: center; gap: 6px; }
.card__t { font-size: var(--fs-sm); font-weight: var(--fw-bold); flex: 1; }
.size { font-size: var(--fs-xs); color: var(--color-text-3); font-variant-numeric: tabular-nums; }
.names { font-size: var(--fs-xs); color: var(--color-text-2); line-height: 1.7; min-height: 16px; }
.more { font-size: var(--fs-xs); }
.more > summary { cursor: pointer; color: var(--color-primary-ontext); }
.roster { display: flex; flex-wrap: wrap; gap: 4px 10px; margin: 8px 0; max-height: 140px; overflow: auto; }
.pick { display: flex; align-items: center; gap: 4px; font-size: var(--fs-xs); color: var(--color-text-2); cursor: pointer; }
.soc { display: flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--color-text-2); cursor: pointer; }
.opts { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.grp { height: 26px; border: 1px solid var(--color-border); background: var(--color-surface);
  border-radius: var(--r-pill); padding: 0 8px; font: inherit; font-size: var(--fs-xs); color: var(--color-text-2); }
.paste { width: 100%; border: 1px solid var(--color-border); background: var(--color-surface);
  border-radius: var(--r-md); padding: 6px 10px; font: inherit; font-size: var(--fs-xs);
  color: var(--color-text); outline: none; resize: vertical; margin-bottom: 6px; }
.acts { display: flex; gap: 6px; margin-top: auto; }
.mini { border: none; font-size: var(--fs-xs); padding: 4px 12px; border-radius: var(--r-pill); cursor: pointer; }
.mini.ghost { background: var(--ink-a06); color: var(--color-text-3); }
.mini.ok { background: var(--on-primary-bg); color: var(--on-primary-fg); }
.empty { color: var(--color-text-3); font-size: var(--fs-sm); padding: var(--sp-5); grid-column: 1 / -1; text-align: center; }
.mask { position: fixed; inset: 0; background: var(--ink-a04); display: grid; place-items: center; z-index: var(--z-modal); padding: var(--sp-4); }
.sheet { width: min(400px, 94vw); display: flex; flex-direction: column; gap: var(--sp-3); }
.sheet__t { font-size: var(--fs-md); font-weight: var(--fw-bold); }
.f { display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-xs); color: var(--color-text-2); }
.f input, .f select { height: 38px; border: 1px solid var(--color-border); background: var(--color-surface);
  border-radius: var(--r-md); padding: 0 var(--sp-3); outline: none; font: inherit; font-size: var(--fs-sm); color: var(--color-text); }
.ok { border: none; background: var(--on-primary-bg); color: var(--on-primary-fg); padding: 10px;
  border-radius: var(--r-md); cursor: pointer; font-weight: var(--fw-medium); }
.sheet .ok { flex: 1; }
.ok:disabled { opacity: .5; cursor: not-allowed; }
.cancel { border: none; background: var(--ink-a06); color: var(--color-text-2); padding: 10px 18px; border-radius: var(--r-md); cursor: pointer; }
/* .toast 已收编为 global.css 全局工具类 */
/* .alert / .retry 已收编为 global.css 全局错误条 */
</style>
