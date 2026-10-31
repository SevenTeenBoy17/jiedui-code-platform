<!-- @copyBudget 60  教学·学情：谁需要帮助（signal 5） -->
<template>
  <div class="stu">
    <PageHead desc="谁需要帮助：按班筛、按列排，预警行标红" />
    <div class="bar">
      <input v-model="q" class="search" type="search" aria-label="搜索学生" placeholder="搜学生…" />
      <!-- 班级筛选（R5 裁决5）：选项取自 resourcesApi.classes()，0=全部；过滤在前端按名单交集做 -->
      <select v-model.number="classId" class="cls-sel" aria-label="按班级筛选">
        <option :value="0">全部班级</option>
        <option v-for="c in classes" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <label class="only"><input type="checkbox" v-model="onlyRisk" /> 只看有预警</label>
      <!-- 筛过就报「命中/总数」：单独一个「3 人」会被误读成全班只有 3 人 -->
      <span class="count">{{ rows.length === students.length ? rows.length + ' 人' : rows.length + '/' + students.length + ' 人' }}</span>
    </div>

    <GlassPanel>
      <!-- .tbl-scroll（R6 裁决7）：桌面基态为空保住 sticky 表头吸附，窄屏才横向滚动 -->
      <div class="tbl-scroll">
      <table class="tbl">
        <thead>
          <!-- 数字四列可排序：th 内嵌透明按钮，aria-sort 报当前方向；
               首击方向按「困难者置顶」定：成功率升序，报错/预警/运行降序，同列再击翻转 -->
          <tr>
            <th>学生</th>
            <th>状态</th>
            <th class="num" :aria-sort="ariaSort('runs')">
              <button class="th-sort" @click="toggleSort('runs')">运行<span aria-hidden="true">{{ sortMark('runs') }}</span></button>
            </th>
            <th class="num" :aria-sort="ariaSort('errors')">
              <button class="th-sort" @click="toggleSort('errors')">报错<span aria-hidden="true">{{ sortMark('errors') }}</span></button>
            </th>
            <!-- 修复列（R5 裁决5）：与报错并排看「犯了多少、救回多少」，首击降序（多者置顶） -->
            <th class="num" :aria-sort="ariaSort('fixes')">
              <button class="th-sort" @click="toggleSort('fixes')">修复<span aria-hidden="true">{{ sortMark('fixes') }}</span></button>
            </th>
            <th class="num" :aria-sort="ariaSort('success_rate')">
              <button class="th-sort" @click="toggleSort('success_rate')">成功率<span aria-hidden="true">{{ sortMark('success_rate') }}</span></button>
            </th>
            <th class="num" :aria-sort="ariaSort('risk')">
              <button class="th-sort" @click="toggleSort('risk')">安全预警<span aria-hidden="true">{{ sortMark('risk') }}</span></button>
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <!-- 渲染护栏（R6 裁决7）：computed 不动（先排序），模板截断前 100 行，防大名单卡整页 -->
          <tr v-for="s in rows.slice(0, 100)" :key="s.id" :class="{ risky: s.risk > 0 }">
            <td>{{ s.name }}</td>
            <td><i class="dot" :class="{ on: s.online }" />{{ s.online ? '在线' : '离线' }}</td>
            <td class="num">{{ s.runs }}</td>
            <td class="num">{{ s.errors }}</td>
            <td class="num">{{ s.fixes }}</td>
            <td class="num">{{ s.success_rate }}%</td>
            <!-- 预警格：图标 + 「N 条」+ title 说明去哪看详情，不再是一个孤零零的 ⚠ 数字 -->
            <td class="num">
              <span v-if="s.risk" class="risk" :title="`触发 ${s.risk} 条安全预警，点学情查看详情`">
                <BaseIcon name="alert-triangle" :size="13" /> {{ s.risk }} 条
              </span>
              <span v-else class="mute">—</span>
            </td>
            <!-- 站内动作用 button 不用假链接 <a href="#">：语义对、无 href 噪音 -->
            <td><button class="link" @click="peek.open(`student:${s.id}`)">学情 →</button></td>
          </tr>
          <!-- 超过 100 人时的尾行提示：明说被截断了多少，引导缩小范围 -->
          <tr v-if="rows.length > 100">
            <td colspan="8" class="empty">共 {{ rows.length }} 人，仅显示前 100 —— 用搜索或班级筛选缩小范围</td>
          </tr>
          <!-- 读取三态：骨架（加载中/未拿到过数据）→ 错误+重试 → 真·空态（区分「搜索无命中」与「本来就没数据」） -->
          <template v-if="!rows.length">
            <template v-if="loading || (!data && !error)">
              <tr v-for="i in 5" :key="`skl-${i}`">
                <td v-for="j in 8" :key="j"><span class="skl" /></td>
              </tr>
            </template>
            <tr v-else-if="error">
              <td colspan="8" class="empty">
                <span class="alert">{{ error }}<button class="retry" @click="load(true)">重试</button></span>
              </td>
            </tr>
            <tr v-else>
              <td colspan="8" class="empty">{{ q || onlyRisk || classId ? '没有匹配的学生，试试清掉搜索/筛选' : '还没有学生数据' }}</td>
            </tr>
          </template>
        </tbody>
      </table>
      </div>
    </GlassPanel>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTeacherHome } from '@/composables/useTeacherHome'
import { usePeek } from '@/composables/usePeek'
import { resourcesApi, type Klass } from '@/api/resources'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import PageHead from '@/components/ui/PageHead.vue'

const { students, data, loading, error, load } = useTeacherHome()
const peek = usePeek()
const q = ref('')
const onlyRisk = ref(false)
/* 班级筛选（R5 裁决5）：students 数据本身无班级字段（/api/teacher/home 全量返回），
   用 resourcesApi.classes() 的 student_ids 名单在前端做交集；0=全部。班级源挂了只退化为无此筛选 */
const classId = ref(0)
const classes = ref<Klass[]>([])

/* 表头排序：sortKey 为空 = 保持后端原始顺序 */
type SortKey = 'runs' | 'errors' | 'fixes' | 'success_rate' | 'risk'
const sortKey = ref<SortKey | null>(null)
const sortDir = ref<'asc' | 'desc'>('asc')
/** 各列首击方向：成功率升序（困难者置顶）、报错/修复/预警/运行降序（多者置顶） */
const FIRST_DIR: Record<SortKey, 'asc' | 'desc'> = {
  runs: 'desc', errors: 'desc', fixes: 'desc', success_rate: 'asc', risk: 'desc',
}
function toggleSort(k: SortKey) {
  if (sortKey.value === k) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else { sortKey.value = k; sortDir.value = FIRST_DIR[k] }
}
/** th 的 aria-sort：非当前列返回 undefined（Vue 会摘掉该属性） */
const ariaSort = (k: SortKey) =>
  sortKey.value === k ? (sortDir.value === 'asc' ? 'ascending' : 'descending') : undefined
/** 排序指示：仅当前列显 ↑/↓（视觉件，aria-hidden，读屏靠 aria-sort） */
const sortMark = (k: SortKey) => (sortKey.value === k ? (sortDir.value === 'asc' ? '↑' : '↓') : '')

/** 选中班级的学生名单（Set 提查找效率）；未选班或班没找到 = null 表示不过滤 */
const classIds = computed(() => {
  if (!classId.value) return null
  const c = classes.value.find((x) => x.id === classId.value)
  return c ? new Set(c.student_ids) : null
})

const rows = computed(() => {
  const ids = classIds.value
  const base = students.value.filter((s) => {
    if (ids && !ids.has(s.id)) return false
    if (onlyRisk.value && !s.risk) return false
    return !q.value || s.name.includes(q.value)
  })
  const k = sortKey.value
  if (!k) return base
  const dir = sortDir.value === 'asc' ? 1 : -1
  return base.slice().sort((a, b) => (a[k] - b[k]) * dir)
})

onMounted(() => {
  load()
  // 班级选项独立拉取：失败不影响主表，只是少一个筛选维度
  resourcesApi.classes().then((d) => { classes.value = d.items }).catch(() => {})
})
</script>

<style scoped>
.stu { display: flex; flex-direction: column; gap: var(--sp-3); }
.bar { display: flex; align-items: center; gap: var(--sp-3); }
.search { height: 36px; flex: 1; max-width: 260px; border: 1px solid var(--color-border);
  background: var(--color-surface); border-radius: var(--r-md); padding: 0 var(--sp-3); font: inherit; }
/* 焦点环（R5 裁决1）：键盘焦点要看得见，不再裸删 outline */
.search:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
/* 班级筛选下拉：观感对齐 .search */
.cls-sel { height: 36px; border: 1px solid var(--color-border); background: var(--color-surface);
  border-radius: var(--r-md); padding: 0 var(--sp-2); font: inherit; font-size: var(--fs-sm); color: var(--color-text-2); }
.only { font-size: var(--fs-sm); color: var(--color-text-2); display: flex; align-items: center; gap: 5px; cursor: pointer; }
.count { margin-left: auto; font-size: var(--fs-sm); color: var(--color-text-3); font-variant-numeric: tabular-nums; }
/* .tbl / .num 已收编为 global.css 全局表格（R4 裁决1，照 .alert 收编先例） */
/* 表头排序按钮：透明底、继承字体，只加 ↑↓ 指示，不破坏 th 原有观感 */
.th-sort { background: none; border: none; padding: 0; cursor: pointer; font: inherit; color: inherit;
  display: inline-flex; align-items: center; gap: 2px; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--ink-200); margin-right: 6px; }
.dot.on { background: var(--color-success); }
/* 左侧色条破「纯颜色信号」：色弱/灰度打印下预警行仍可辨 */
.risky { background: rgba(232,93,117,.05); border-left: 3px solid var(--color-danger); }
/* 预警行 hover 保持红调：全局 .tbl tbody tr:hover 会盖掉浅红底，这里提特异性压回来 */
.tbl tbody tr.risky:hover { background: rgba(232,93,117,.09); }
.risk { color: var(--color-danger); font-weight: var(--fw-bold); display: inline-flex; align-items: center; gap: 3px; }
.mute { color: var(--color-text-3); }
/* 「学情 →」由假链接 <a href="#"> 改为 button：补按钮复位，颜色沿用链接观感 */
.link { background: none; border: none; padding: 0; cursor: pointer; font: inherit;
  color: var(--color-primary); text-decoration: none; font-weight: var(--fw-medium); }
.empty { text-align: center; color: var(--color-text-3); padding: var(--sp-5); }
/* 加载骨架：纯 CSS 灰条呼吸，不引依赖 */
.skl { display: block; height: 12px; border-radius: 4px; background: var(--color-fill-2); animation: sklPulse 1.2s ease-in-out infinite; }
@keyframes sklPulse { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
/* .alert / .retry 已收编为 global.css 全局错误条 */
</style>
