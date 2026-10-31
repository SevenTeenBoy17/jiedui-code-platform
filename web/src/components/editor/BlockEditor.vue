<template>
  <div ref="host" class="block-editor"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { CHART_GRID } from '@/constants/chartTheme'

// `blocks` 是块数。曾经只发 state（JSON 字符串），消费方 IdeView 用 `/<block/g` 去数 ——
// 那是 Blockly **XML** 序列化的形状，对 JSON 恒为 null，于是 design_create 埋点与
// first_blocks3 里程碑从来没触发过（而 ct.py 的 FORMULA_VERSION 已经为这次口径变更升到 v2）。
// 序列化格式是这里的实现细节，不该让消费方去猜。
const props = defineProps<{ initialState?: string | null }>()
const emit = defineEmits<{ code: [string]; state: [string]; blocks: [number] }>()
const host = ref<HTMLElement>()
let workspace: any = null
let api: any = null
let resizeObserver: ResizeObserver | undefined
let resizeFrame = 0

function scheduleWorkspaceResize() {
  if (!workspace || !api || !host.value) return
  const rect = host.value.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return
  if (resizeFrame) return
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0
    if (workspace && api) api.Blockly.svgResize(workspace)
  })
}

function emitSnapshot() {
  if (!workspace || !api) return
  emit('code', api.pythonGenerator.workspaceToCode(workspace))
  emit('blocks', workspace.getAllBlocks(false).length)
  try {
    emit('state', JSON.stringify(api.Blockly.serialization.workspaces.save(workspace)))
  } catch {}
}

onMounted(async () => {
  api = await import('@/editor/blockly/setup')
  if (!host.value) return
  workspace = api.Blockly.inject(host.value, {
    toolbox: api.PYTHON_TOOLBOX,
    theme: api.eduTheme,
    renderer: 'zelos',
    // Blockly 与 ECharts 同病：读不了 CSS 变量，网格色走 chartTheme 常量（与 --chart-grid 同源）
    grid: { spacing: 22, length: 3, colour: CHART_GRID, snap: true },
    zoom: { controls: true, wheel: true, startScale: 0.95 },
    trashcan: true,
    move: { scrollbars: true, drag: true, wheel: true },
  })
  // 云端版本保存的是 Blockly JSON。必须在监听 change 之前恢复，否则打开作品时
  // 空工作区会先发一次 code/state，把已保存的积木布局覆盖掉。
  if (props.initialState) {
    try {
      api.Blockly.serialization.workspaces.load(JSON.parse(props.initialState), workspace)
    } catch {
      // 旧版本或损坏的 block_state 不阻断文本代码；父组件仍保留 latest.code。
    }
  }
  workspace.addChangeListener((event: any) => {
    if (workspace.isDragging() || event?.isUiEvent || event?.type === 'viewport_change') return
    emitSnapshot()
  })
  if (typeof ResizeObserver !== 'undefined' && host.value) {
    resizeObserver = new ResizeObserver(scheduleWorkspaceResize)
    resizeObserver.observe(host.value)
  }
  window.addEventListener('resize', scheduleWorkspaceResize)
  scheduleWorkspaceResize()
  emitSnapshot()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', scheduleWorkspaceResize)
  if (resizeFrame) cancelAnimationFrame(resizeFrame)
  if (workspace) workspace.dispose()
})

defineExpose({
  getCode: () => (workspace && api ? api.pythonGenerator.workspaceToCode(workspace) : ''),
})
</script>

<style scoped>
.block-editor { width: 100%; height: 100%; min-height: 200px; }
</style>
