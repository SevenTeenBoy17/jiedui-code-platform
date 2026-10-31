<template>
  <!-- 学生端任务胶囊（V3.5 · D8）：老师推送不常驻，只在有内容时出现一枚胶囊 + 红点。 -->
  <div v-if="items.length" class="wrap">
    <button class="task-chip" @click="open = !open">
      <BaseIcon name="pin" :size="14" /> 老师推送
      <i v-if="unread" class="dot">{{ unread }}</i>
    </button>

    <GlassPanel v-if="open" strong class="pop">
      <ul class="list">
        <li v-for="it in items" :key="it.target_id" :class="{ done: it.done_at }">
          <span class="kind">{{ KIND[it.res_type] }}</span>
          <div class="body">
            <b>{{ it.title }}</b>
            <small v-if="it.reason">{{ it.reason }}</small>
          </div>
          <button v-if="!it.done_at" class="go" @click="finish(it)">
            {{ it.res_type === 'assessment' ? '去答题' : '完成' }}
          </button>
          <span v-else class="ok">✓</span>
        </li>
      </ul>
    </GlassPanel>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { resourcesApi, type MyPush } from '@/api/resources'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'

const KIND: Record<string, string> = { exercise: '题目', video: '视频', set: '练习', assessment: '测评' }
const router = useRouter()
const items = ref<MyPush[]>([])
const unread = ref(0)
const open = ref(false)

async function load() {
  try {
    const r = await resourcesApi.myPushes()
    items.value = r.items
    unread.value = r.unread
  } catch { /* 后端不可用则不显示 */ }
}

async function finish(it: MyPush) {
  // 测评必须真的去答题：直接标完成会把前测记成"已交"却没有任何作答，
  // 交卷率与前后测数据当场作废。完成状态由交卷端点写回。
  if (it.res_type === 'assessment') {
    router.push(`/student/assess/${it.res_id}?t=${it.target_id}`)
    return
  }
  await resourcesApi.markRead(it.target_id).catch(() => {})
  await resourcesApi.markDone(it.target_id)
  it.done_at = Math.floor(Date.now() / 1000)
  unread.value = Math.max(0, unread.value - (it.read_at ? 0 : 1))
}

onMounted(load)
</script>

<style scoped>
.wrap { position: relative; }
/* 根类由 .chip 改 .task-chip（R5 裁决6）：global .chip 回归纯状态药丸，控件不再蹭它的名。
   原先蹭到的 global 基线（inline-flex/gap/字重/nowrap）就地补齐，视觉不变 */
.task-chip { border: 1.5px solid var(--color-accent-soft); background: var(--color-surface); color: var(--color-text-2);
  font-size: var(--fs-xs); padding: 5px 12px; border-radius: var(--r-pill); cursor: pointer; position: relative;
  display: inline-flex; align-items: center; gap: 4px; font-weight: var(--fw-medium); line-height: 1.7; white-space: nowrap; }
.dot { position: absolute; top: -6px; right: -6px; font-style: normal; font-size: var(--fs-xs); min-width: 16px;
  background: var(--on-danger-bg); color: var(--on-danger-fg); border-radius: var(--r-pill); padding: 1px 4px; text-align: center; }
.pop { position: absolute; bottom: 38px; left: 0; width: min(320px, 80vw); z-index: var(--z-panel); padding: var(--sp-2); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 240px; overflow-y: auto; }
.list li { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: var(--r-md); }
.list li:hover { background: var(--ink-a04); }
.list li.done { opacity: .55; }
.kind { font-size: var(--fs-xs); background: var(--color-primary-soft); color: var(--color-primary-strong);
  padding: 2px 7px; border-radius: var(--r-pill); flex-shrink: 0; }
.body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.body b { font-size: var(--fs-sm); }
.body small { font-size: var(--fs-xs); color: var(--color-text-3); }
.go { border: none; background: var(--on-accent-bg); color: var(--on-accent-fg); font-size: var(--fs-xs); padding: 4px 10px;
  border-radius: var(--r-pill); cursor: pointer; flex-shrink: 0; }
.ok { color: var(--color-success); font-weight: var(--fw-bold); }
</style>
