<!-- @lintOverlay 研究退出登记弹层（伦理红线：随时可退、必须留因）。mask+sheet 模式，照 PushSheet。 -->
<template>
  <div class="mask" @click.self="$emit('close')">
    <GlassPanel ref="sheetEl" strong class="sheet" role="dialog" aria-modal="true"
                aria-label="登记退出研究" tabindex="-1">
      <h3 class="t">登记退出：{{ student.name }}</h3>
      <p class="thin">退出后不再参加测评、数据不进对比；平台其他功能照常使用。</p>

      <label class="f"><span>退出原因（必填，留档）</span>
        <input v-model="reason" placeholder="如：监护人来电要求退出" @keydown.enter="submit" />
      </label>

      <div class="acts">
        <button class="ok" :disabled="busy || !reason.trim()" @click="submit">
          {{ busy ? '登记中…' : '确认退出' }}
        </button>
        <button class="cancel" @click="$emit('close')">取消</button>
      </div>
      <p v-if="err" class="alert">{{ err }}</p>
    </GlassPanel>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { studyApi } from '@/api/study'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import { useModalA11y } from '@/composables/useModalA11y'

const props = defineProps<{ sid: number; student: { id: string; name: string } }>()
const emit = defineEmits<{ close: []; done: [] }>()

// 弹层焦点圈闭（R3 裁决8）：挂载即打开；卸载前置 false 触发焦点还位；Esc 可取消
const modalOpen = ref(true)
const sheetEl = ref<InstanceType<typeof GlassPanel>>()
useModalA11y(modalOpen, computed(() => sheetEl.value?.$el as HTMLElement | undefined), () => emit('close'))
onBeforeUnmount(() => (modalOpen.value = false))

const reason = ref('')
const busy = ref(false)
const err = ref('')

/** 原因必填：伦理留档不是可省略的仪式；空原因由按钮禁用挡住，这里只兜底 */
async function submit() {
  if (busy.value || !reason.value.trim()) return
  busy.value = true
  err.value = ''
  try {
    await studyApi.withdraw(props.sid, props.student.id, reason.value.trim())
    emit('done')
  } catch (e) {
    err.value = e instanceof Error ? e.message : '登记失败，请重试'
  } finally { busy.value = false }
}
</script>

<style scoped>
.mask { position: fixed; inset: 0; background: var(--ink-a04); display: grid; place-items: center;
  z-index: var(--z-modal); padding: var(--sp-4); }
.sheet { width: min(400px, 94vw); display: flex; flex-direction: column; gap: var(--sp-3); }
.t { font-size: var(--fs-md); font-weight: var(--fw-bold); }
.thin { font-size: var(--fs-xs); color: var(--color-text-3); line-height: 1.7; }
.f { display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-xs); color: var(--color-text-2); }
.f input { height: 38px; border: 1px solid var(--color-border); background: var(--color-surface);
  border-radius: var(--r-md); padding: 0 var(--sp-3); outline: none; font: inherit; font-size: var(--fs-sm);
  color: var(--color-text); }
.acts { display: flex; gap: var(--sp-2); margin-top: var(--sp-1); }
.ok { flex: 1; border: none; background: var(--on-primary-bg); color: var(--on-primary-fg); padding: 10px;
  border-radius: var(--r-md); cursor: pointer; font-weight: var(--fw-medium); }
.ok:disabled { opacity: .5; cursor: not-allowed; }
.cancel { border: none; background: var(--ink-a06); color: var(--color-text-2); padding: 10px 18px;
  border-radius: var(--r-md); cursor: pointer; }
</style>
