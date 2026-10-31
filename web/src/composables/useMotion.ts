/**
 * useMotion（V1 · L1 层，~2KB，对应 V2 方案 D4）。
 * 用 WAAPI + rAF 覆盖 CSS 做不到的少量场景（数字滚动、元素入场编排）。
 * 所有时长读 motion.css 的 --d-* 变量 → 低配/reduced-motion 自动为 0（唯一降级入口）。
 * 红线：只动 transform / opacity；不做 layout 属性动画。
 */
import { ref, onUnmounted, type Ref } from 'vue'

/** 读取 CSS 时长令牌（ms）。低配下返回 ~0，动画自然失效。 */
export function dur(name: 'instant' | 'fast' | 'base' | 'slow' | 'page' = 'base'): number {
  if (typeof getComputedStyle === 'undefined') return 0
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--d-${name}`).trim()
  const n = parseFloat(v)
  return v.endsWith('ms') ? n : n * 1000
}

export const motionOff = () => dur('base') < 20   // 低配/reduced-motion 判定

/** KPI 数字滚动。返回可绑定的 ref，值从 0 平滑到 target。 */
export function useCountUp(target: Ref<number> | (() => number), decimals = 0) {
  const shown = ref(0)
  let raf = 0
  const read = () => (typeof target === 'function' ? target() : target.value)

  function run() {
    cancelAnimationFrame(raf)
    const to = read() || 0
    const ms = dur('slow')
    if (motionOff() || ms < 20) { shown.value = to; return }
    const from = shown.value
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms)
      const eased = 1 - Math.pow(1 - p, 3)                 // easeOutCubic
      const v = from + (to - from) * eased
      shown.value = decimals ? Number(v.toFixed(decimals)) : Math.round(v)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  }

  onUnmounted(() => cancelAnimationFrame(raf))
  return { shown, run }
}

/** 元素入场（WAAPI）。用于 CSS 类不便表达的动态列表。 */
export function enter(el: Element | null, opts: { y?: number; delay?: number } = {}) {
  if (!el || motionOff() || !('animate' in el)) return
  const { y = 10, delay = 0 } = opts
  ;(el as HTMLElement).animate(
    [{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: 'none' }],
    { duration: dur('base'), delay, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' },
  )
}

/** 成功庆祝：轻量缩放脉冲（不引粒子库）。 */
export function celebrate(el: Element | null) {
  if (!el || motionOff() || !('animate' in el)) return
  ;(el as HTMLElement).animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
    { duration: dur('slow'), easing: 'cubic-bezier(.34,1.56,.64,1)' },
  )
}
