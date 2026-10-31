<!-- @lintOverlay 推送弹窗：遮罩浮层，不占资源页的常驻屏。 -->
<template>
  <!-- 推送面板（V3.5 · D7）：推送是跨页面动作，资源页与学情/预警页共用同一入口。 -->
  <div class="mask" @click.self="$emit('close')">
    <GlassPanel ref="sheetEl" strong class="sheet" role="dialog" aria-modal="true" aria-label="推送给学生" tabindex="-1">
      <h3 class="t">推送给学生</h3>

      <div class="who">
        <label class="all"><input type="checkbox" v-model="toAll" /> 全部学生（{{ students.length }} 人）</label>
        <div v-if="!toAll" class="list">
          <label v-for="s in students" :key="s.id" class="one">
            <input type="checkbox" :value="s.id" v-model="picked" />
            {{ s.name }}<i v-if="s.risk" class="risk">需关注</i>
          </label>
        </div>
      </div>

      <label class="f"><span>推荐理由（学生可见）</span>
        <input v-model="reason" placeholder="如：课后巩固循环" />
      </label>
      <label class="req"><input type="checkbox" v-model="required" /> 设为必做</label>

      <div class="acts">
        <button class="ok" :disabled="busy || (!toAll && !picked.length)" @click="submit">
          {{ busy ? '推送中…' : `推送给 ${toAll ? students.length : picked.length} 人` }}
        </button>
        <button class="cancel" @click="$emit('close')">取消</button>
      </div>
      <p v-if="err" class="err">{{ err }}</p>
    </GlassPanel>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { resourcesApi } from '@/api/resources'
import { useTeacherHome } from '@/composables/useTeacherHome'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import { useModalA11y } from '@/composables/useModalA11y'

const props = defineProps<{ resType: string; resId: number; preselect?: string[] }>()
const emit = defineEmits<{ close: []; done: [number] }>()

const { students, load } = useTeacherHome()
// 弹层焦点圈闭（R3 裁决8）：组件挂载即打开；卸载前置 false 触发焦点还位
const modalOpen = ref(true)
const sheetEl = ref<InstanceType<typeof GlassPanel>>()
useModalA11y(modalOpen, computed(() => sheetEl.value?.$el as HTMLElement | undefined), () => emit('close'))
onBeforeUnmount(() => (modalOpen.value = false))
const toAll = ref(true)
const picked = ref<string[]>([])
const reason = ref('')
const required = ref(false)
const busy = ref(false)
const err = ref('')

async function submit() {
  busy.value = true
  err.value = ''
  try {
    const r = await resourcesApi.push({
      res_type: props.resType, res_id: props.resId,
      student_ids: toAll.value ? [] : picked.value,
      reason: reason.value, required: required.value ? 1 : 0,
    })
    emit('done', r.targets)
  } catch (e: any) {
    err.value = e?.message || '推送失败'
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  await load()
  if (props.preselect?.length) { toAll.value = false; picked.value = [...props.preselect] }
})
</script>

<style scoped>
.mask { position: fixed; inset: 0; background: var(--ink-a04); display: grid; place-items: center;
  z-index: var(--z-modal); padding: var(--sp-4); }
.sheet { width: min(440px, 94vw); display: flex; flex-direction: column; gap: var(--sp-3); }
.t { font-size: var(--fs-md); font-weight: var(--fw-bold); }
.who { display: flex; flex-direction: column; gap: 6px; }
.all { font-size: var(--fs-sm); display: flex; align-items: center; gap: 6px; cursor: pointer; }
.list { max-height: 180px; overflow-y: auto; display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px;
  background: var(--color-fill-1); border-radius: var(--r-md); padding: var(--sp-2); }
.one { display: flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--color-text-2); cursor: pointer; }
.risk { font-style: normal; font-size: var(--fs-xs); color: var(--color-danger); }
.f { display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-xs); color: var(--color-text-2); }
.f input { height: 38px; border: 1px solid var(--color-border); background: var(--color-surface);
  border-radius: var(--r-md); padding: 0 var(--sp-3); outline: none; font: inherit; font-size: var(--fs-sm); }
.req { font-size: var(--fs-sm); display: flex; align-items: center; gap: 6px; cursor: pointer; color: var(--color-text-2); }
.acts { display: flex; gap: var(--sp-2); margin-top: var(--sp-2); }
.ok { flex: 1; border: none; background: var(--color-primary); color: #fff; padding: 10px; border-radius: var(--r-md);
  cursor: pointer; font-weight: var(--fw-medium); }
.ok:disabled { opacity: .5; cursor: not-allowed; }
.cancel { border: none; background: var(--ink-a06); color: var(--color-text-2); padding: 10px 18px;
  border-radius: var(--r-md); cursor: pointer; }
.err { color: var(--color-danger); font-size: var(--fs-sm); }
</style>
