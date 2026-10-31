<template>
  <!-- 全站唯一下钻宿主：挂在 Shell 里一次即可（V1 · usePeek 栈式抽屉） -->
  <Teleport to="body">
    <div v-if="depth" class="peek-mask" @click="reset" />
    <TransitionGroup name="peek">
      <!-- 焦点圈闭走 useModalA11y（裁决8）；面板上原有的 @keydown.esc 已删：
           焦点进面板后它会和下面的 window Esc 兜底各关一层，一次按键关两层 -->
      <aside
        v-for="(t, i) in stack" :key="t"
        :ref="(el) => setPanelRef(el, i)"
        class="peek glass glass--strong"
        :style="{
          transform: `translateX(${(stack.length - 1 - i) * -26}px)`,
          zIndex: 240 + i,
          opacity: i === stack.length - 1 ? 1 : 0.55,
        }"
        role="dialog" aria-modal="true" :aria-label="kindLabel(parse(t).kind)"
        :aria-hidden="i !== stack.length - 1" tabindex="-1"
      >
        <header class="peek__h">
          <span class="peek__kind">{{ kindLabel(parse(t).kind) }}</span>
          <button class="peek__x" aria-label="关闭" @click="close"><BaseIcon name="x" /></button>
        </header>
        <div class="peek__body">
          <!-- 默认就渲染真实内容。原来只留了一个 slot 兜底，而全站没有任何地方给它传插槽，
               于是「看学情」「N 条待介入」点开都只有一行占位文字。 -->
          <slot :target="t" :kind="parse(t).kind" :id="parse(t).id">
            <PeekStudent v-if="parse(t).kind === 'student'" :id="parse(t).id" />
            <PeekAlert v-else-if="parse(t).kind === 'alert'" :id="parse(t).id" />
            <p v-else class="peek__todo">{{ kindLabel(parse(t).kind) }} · {{ parse(t).id }}</p>
          </slot>
        </div>
      </aside>
    </TransitionGroup>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePeek, type PeekKind } from '@/composables/usePeek'
import { useModalA11y } from '@/composables/useModalA11y'
import PeekStudent from '@/components/peek/PeekStudent.vue'
import PeekAlert from '@/components/peek/PeekAlert.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'

const { stack, depth, close, reset, parse } = usePeek()

const LABEL: Record<PeekKind, string> = {
  student: '学生', class: '班级', roster: '名册', task: '任务', submission: '提交',
  run: '运行记录', alert: '预警', exercise: '题目', video: '视频', set: '练习集', push: '推送',
}
const kindLabel = (k: PeekKind) => LABEL[k] ?? k

/** 栈顶面板元素：焦点圈闭永远跟着最上层抽屉走（裁决8） */
const topPanel = ref<HTMLElement>()
function setPanelRef(el: unknown, i: number) {
  if (i === stack.value.length - 1) topPanel.value = (el as HTMLElement | null) ?? undefined
}
// 只接圈闭与还焦点，不传 onClose：Esc 仍由下面既有的 window 兜底处理（单一出口，避免关两层）
useModalA11y(computed(() => depth.value > 0), topPanel)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && depth.value) close()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<style scoped>
.peek-mask { position: fixed; inset: 0; background: var(--ink-a30); z-index: 235; }
.peek {
  position: fixed; top: 0; right: 0; height: 100dvh; width: min(560px, 92vw);
  display: flex; flex-direction: column; border-radius: var(--glass-radius) 0 0 var(--glass-radius);
}
.peek__h { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-4) var(--sp-5) var(--sp-2); }
.peek__kind { font-weight: var(--fw-bold); color: var(--color-text); }
.peek__x { border: none; background: var(--ink-a06); width: 28px; height: 28px; border-radius: var(--r-pill); cursor: pointer; }
.peek__body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 var(--sp-5) var(--sp-5); }
.peek__todo { color: var(--color-text-3); font-size: var(--fs-sm); }
@media (max-width: 760px) { .peek { width: 100vw; border-radius: 0; } }
</style>
