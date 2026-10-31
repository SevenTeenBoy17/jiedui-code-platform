<!-- @lintOverlay -->
<template>
  <dialog ref="dialog" class="evidence-dialog" :aria-labelledby="titleId"
    @cancel.prevent="close" @close="finishClose" @click="closeFromBackdrop">
    <article v-if="current" class="evidence-dialog__panel">
      <header>
        <div>
          <span>{{ current.type }}</span>
          <h2 :id="titleId">{{ current.title }}</h2>
        </div>
        <button ref="closeButton" type="button" aria-label="关闭证据原件" @click="close">
          <BaseIcon name="x" :size="18" />
        </button>
      </header>
      <dl>
        <div><dt>证据编号</dt><dd>{{ current.id }}</dd></div>
        <div><dt>稳定版本</dt><dd>{{ current.version }}</dd></div>
        <div><dt>原件来源</dt><dd>{{ current.source }}</dd></div>
        <div><dt>留存时点</dt><dd>{{ current.capturedAt }}</dd></div>
      </dl>
      <section aria-label="原件内容">
        <h3>原件内容</h3>
        <ol><li v-for="line in current.content" :key="line">{{ line }}</li></ol>
      </section>
      <footer>
        <span>只读前端演示原件</span>
        <button type="button" @click="close">返回证据列表</button>
      </footer>
    </article>
  </dialog>
</template>

<script setup lang="ts">
import { getCurrentInstance, nextTick, ref } from 'vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import type { EvidenceOriginal } from '@/data/studentGrowth'

const dialog = ref<HTMLDialogElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const current = ref<EvidenceOriginal | null>(null)
const titleId = `evidence-dialog-title-${getCurrentInstance()!.uid}`
let opener: HTMLElement | null = null

async function open(original: EvidenceOriginal, trigger?: HTMLElement | null) {
  current.value = original
  opener = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
  if (!dialog.value?.open) dialog.value?.showModal()
  await nextTick()
  closeButton.value?.focus()
}

function close() { dialog.value?.close() }
function finishClose() {
  opener?.focus()
  opener = null
  current.value = null
}
function closeFromBackdrop(event: MouseEvent) { if (event.target === dialog.value) close() }

defineExpose({ open })
</script>

<style scoped>
.evidence-dialog { position: fixed; inset: 0; width: min(620px, calc(100vw - 28px)); max-height: min(720px, calc(100vh - 28px)); margin: auto; padding: 0; border: 0; border-radius: 22px; color: #2d334a; background: transparent; box-shadow: 0 28px 80px rgba(27,29,67,.30); overflow: visible; }
.evidence-dialog::backdrop { background: rgba(31,34,62,.52); backdrop-filter: blur(4px); }
.evidence-dialog__panel { max-height: min(720px, calc(100vh - 28px)); box-sizing: border-box; padding: 20px; border: 1px solid #e4e3ef; border-radius: 22px; display: grid; gap: 15px; background: #fff; overflow-y: auto; }
header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
header span { color: #716bc5; font-size: 10px; font-weight: 900; letter-spacing: .08em; }
header h2 { margin: 4px 0 0; font-size: 20px; }
header button { flex: none; width: 38px; height: 38px; border: 1px solid #dedee9; border-radius: 12px; display: grid; place-items: center; color: #5c6276; background: #fff; cursor: pointer; }
dl { margin: 0; padding: 12px; border-radius: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 16px; background: #f7f7fb; }
dl div { min-width: 0; display: grid; gap: 3px; }
dt { color: #868b9d; font-size: 9px; }
dd { margin: 0; overflow-wrap: anywhere; color: #41475c; font-size: 11px; font-weight: 750; }
section { padding: 14px; border: 1px solid #e5e4ee; border-radius: 15px; background: #fcfcfe; }
section h3 { margin: 0 0 9px; font-size: 13px; }
section ol { margin: 0; padding-left: 20px; display: grid; gap: 7px; color: #51586e; font-size: 11px; line-height: 1.55; }
footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
footer span { color: #8b90a1; font-size: 9px; }
footer button { min-height: 38px; padding: 0 14px; border: 0; border-radius: 11px; color: #fff; background: #625fca; font: inherit; font-size: 11px; font-weight: 800; cursor: pointer; }
button:focus-visible { outline: 3px solid rgba(102,96,205,.28); outline-offset: 2px; }
@media (max-width: 520px) { .evidence-dialog__panel { padding: 15px; } dl { grid-template-columns: 1fr; } footer { align-items: stretch; flex-direction: column; } }
</style>
