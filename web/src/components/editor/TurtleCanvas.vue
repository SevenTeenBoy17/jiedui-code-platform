<template>
  <div class="turtle" ref="box">
    <div class="turtle__head">🐾 绘图区</div>
    <canvas ref="cv" class="turtle__cv"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { drawTurtle, type TurtleCmd } from '@/editor/turtle/renderer'

const props = defineProps<{ cmds: TurtleCmd[] }>()
const cv = ref<HTMLCanvasElement>()
const box = ref<HTMLElement>()
let ro: ResizeObserver | undefined

/**
 * 画布内部尺寸必须**跟随实际显示尺寸**。
 *
 * 原来写死 `<canvas width="360" height="320">` 再用 CSS `flex:1; width:100%` 拉伸：
 * 底部区实际是 360×172，于是 360×320 的画面被**垂直压扁到 0.54** ——
 * 学生用海龟画的正方形显示出来是扁的矩形。渲染器本身是等比缩放的（scale 取 min），
 * 几何没错，是 CSS 拉伸把它毁掉的，所以光改渲染器没用。
 *
 * 顺带处理高清屏：backing store 乘 devicePixelRatio，否则线条发虚。
 */
function resize() {
  const c = cv.value
  if (!c) return
  const r = c.getBoundingClientRect()
  if (r.width < 1 || r.height < 1) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)   // 封顶 2：3x 屏上再翻倍只是浪费内存
  const w = Math.round(r.width * dpr)
  const h = Math.round(r.height * dpr)
  if (c.width === w && c.height === h) return             // 尺寸没变就别重画，避免 RO 抖动
  c.width = w
  c.height = h
  render()
}

function render() {
  if (!cv.value) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  drawTurtle(cv.value, props.cmds || [], dpr)
}

onMounted(async () => {
  await nextTick()
  resize()
  if (typeof ResizeObserver !== 'undefined' && box.value) {
    ro = new ResizeObserver(resize)
    ro.observe(box.value)
  }
})
onUnmounted(() => ro?.disconnect())
watch(() => props.cmds, render, { deep: true })
</script>

<style scoped>
.turtle { display: flex; flex-direction: column; background: #fff; border-left: 2px solid rgba(255,255,255,.08); }
.turtle__head { padding: 4px var(--sp-3); background: #16213e; color: #a0a8c0; font-size: var(--fs-sm); }
/* 不设 width/height 属性，尺寸由 JS 按实际显示区 × dpr 计算 —— 见上方注释 */
.turtle__cv { flex: 1; width: 100%; min-height: 0; display: block; background: var(--paper-student); }
</style>
