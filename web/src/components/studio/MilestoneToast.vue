<!-- @lintOverlay 里程碑提示：position:fixed 浮层，2.6 秒自动消失，不占宿主屏。 -->
<template>
  <Transition name="ms">
    <div v-if="current" class="ms glass" data-lint="overlay" role="status" aria-live="polite">
      <img :src="asset('mate_fox_cheer')" class="ms__ava" alt="" />
      <b class="ms__t">{{ current.text }}</b>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { asset } from '@/assets/assets'
import { current } from '@/composables/useMilestone'
</script>

<style scoped>
/* 只在状态变化的瞬间出现，2.6 秒后自己走 —— 不留计数、不留徽章、不可回看。 */
.ms {
  position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px;
  padding: 10px 18px 10px 12px; border-radius: var(--r-pill);
  z-index: var(--z-toast); pointer-events: none;
}
.ms__ava { width: 40px; height: 40px; }
.ms__t { font-size: var(--fs-sm); color: var(--color-text); white-space: nowrap; }

.ms-enter-active { transition: opacity var(--d-base) var(--e-out), transform var(--d-base) var(--e-spring); }
.ms-leave-active { transition: opacity var(--d-fast) var(--e-out), transform var(--d-fast) var(--e-out); }
.ms-enter-from { opacity: 0; transform: translate(-50%, 14px) scale(.94); }
.ms-leave-to { opacity: 0; transform: translate(-50%, -6px); }
/* 低配/reduced-motion 下 --d-* 已被 motion.css 压到 .01ms，自动退化为瞬间出现，无需额外分支 */
</style>
