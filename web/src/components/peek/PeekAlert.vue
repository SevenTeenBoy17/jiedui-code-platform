<!-- 下钻抽屉·预警：谁、什么类别、多严重、原文摘要。id='all' 时列全部。 -->
<template>
  <div class="pa">
    <p v-if="!rows.length" class="thin">没有需要处理的预警</p>
    <ul v-else class="list">
      <li v-for="a in rows" :key="a.id" :class="{ hi: (a.level ?? 0) >= 3 }">
        <div class="row1">
          <b>{{ a.studentName || a.user_id }}</b>
          <span class="cat">{{ CAT[a.category] || a.category }}</span>
          <span class="lv">L{{ a.level }}</span>
        </div>
        <p class="detail">{{ a.detail || '—' }}</p>
        <i class="ts">{{ when(a.created_at) }}</i>
        <!-- 删除申请的执行入口（权利通道的最后一环——端点早在，此前无 UI 等于通道断头）。
             双确认（浏览器 confirm + 文案强调不可撤销），执行后报**总条数**供核对。 -->
        <div v-if="a.category === 'erasure_request'" class="act">
          <button class="erase" :disabled="erasing === a.user_id" @click="doErase(a)">
            {{ erasing === a.user_id ? '删除中…' : '已与家长确认，执行删除' }}
          </button>
        </div>
      </li>
    </ul>
    <p class="note">高危话题在送进 AI 之前就已拦截，学生看到的是引导语，不是原始回答。</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { teacherApi } from '@/api/teacher'
import { useTeacherHome } from '@/composables/useTeacherHome'

const props = defineProps<{ id: string }>()
const { alerts, load } = useTeacherHome()

const CAT: Record<string, string> = {
  self_harm: '自伤倾向', violence: '暴力', fraud: '涉赌涉诈', adult: '不良内容',
  profanity: '不文明用语', consent_request: '待核验监护人同意',
  erasure_request: '学生申请删除其全部数据', erasure_done: '已执行数据删除',
}

const erasing = ref('')
async function doErase(a: { user_id: string; studentName?: string }) {
  const who = a.studentName || a.user_id
  if (!confirm(`即将删除 ${who} 的全部数据（作品/行为/测评/画像等），不可撤销。
确认已与学生和监护人当面核实？`)) return
  erasing.value = a.user_id
  try {
    const r = await teacherApi.eraseStudentData(a.user_id)
    alert(`已删除 ${who} 的 ${r.total_rows} 条记录（逐表条数已留审计）。`)
    await load(true)                              // 强刷（load 有 TTL 缓存）：申请告警随删除一并消失
  } catch {
    alert('删除失败：请稍后重试或联系管理员')
  } finally {
    erasing.value = ''
  }
}

const rows = computed(() =>
  props.id === 'all' ? alerts.value : alerts.value.filter((a) => String(a.id) === props.id))

const when = (ts: number) =>
  new Date(ts * 1000).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>

<style scoped>
.pa { display: flex; flex-direction: column; gap: var(--sp-3); }
.thin { color: var(--color-text-3); font-size: var(--fs-sm); }
.list { display: flex; flex-direction: column; gap: 8px; }
.list li { padding: 10px 12px; border-radius: var(--r-md); background: var(--ink-a04); }
.list li.hi { background: #FDEBEC; }
.row1 { display: flex; align-items: center; gap: 6px; font-size: var(--fs-sm); }
.cat { font-size: var(--fs-xs); background: var(--ink-a08); padding: 2px 8px; border-radius: var(--r-pill); color: var(--color-text-2); }
.lv { font-size: var(--fs-xs); color: var(--color-danger-ontext); font-weight: var(--fw-bold); }
.detail { font-size: var(--fs-xs); color: var(--color-text-2); margin-top: 4px; line-height: 1.6; word-break: break-all; }
.ts { font-style: normal; font-size: var(--fs-xs); color: var(--color-text-3); }
.note { font-size: var(--fs-xs); color: var(--color-text-3); line-height: 1.7; }
.act { margin-top: 6px; }
.erase { border: 1px solid var(--color-danger); color: var(--color-danger); background: transparent;
  border-radius: var(--r-sm); padding: 6px 10px; font-size: var(--fs-xs); cursor: pointer;
  transition: background var(--d-fast) var(--e-out), color var(--d-fast); }
.erase:hover:not(:disabled) { background: var(--color-danger); color: #fff; }
.erase:disabled { opacity: .6; cursor: wait; }
</style>