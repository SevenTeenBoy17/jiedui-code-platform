/**
 * 滚动叙事揭示（V4 报告页）。IntersectionObserver 逐章淡入，**不引 GSAP**（对应动效 D4：L0/L1 覆盖 97%）。
 * 低配 / reduced-motion / 打印时直接全部显形，绝不因动效导致内容看不见。
 */
import { onMounted, onUnmounted, ref } from 'vue'
import { motionOff } from './useMotion'

export function useReveal(selector = '.reveal') {
  const ready = ref(false)
  let io: IntersectionObserver | null = null

  function showAll(root: ParentNode = document) {
    root.querySelectorAll<HTMLElement>(selector).forEach((el) => el.classList.add('is-in'))
  }

  onMounted(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(selector))
    // 无动效需求 / 不支持 IO / 打印 → 直接显形
    if (motionOff() || typeof IntersectionObserver === 'undefined') {
      showAll()
      ready.value = true
      return
    }
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in')
            io?.unobserve(e.target)          // 只揭示一次，回滚不重播
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
    )
    els.forEach((el) => io!.observe(el))
    // 打印前强制全显，避免导出的报告出现空白章节
    window.addEventListener('beforeprint', () => showAll())
    ready.value = true
  })

  onUnmounted(() => io?.disconnect())

  return { ready, showAll }
}
