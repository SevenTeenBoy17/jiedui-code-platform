import { nextTick, onMounted, onScopeDispose, type Ref } from 'vue'
import { gsap } from 'gsap'

export function useGrowthMotion(target: Ref<HTMLElement | null>) {
  let tween: gsap.core.Tween | null = null
  const media = gsap.matchMedia()
  let disposed = false

  function transition() {
    void nextTick(() => {
      const element = target.value
      if (!element || disposed) return
      tween?.kill()
      media.revert()
      media.add(
        { all: 'all', reduceMotion: '(prefers-reduced-motion: reduce)' },
        (context) => {
          if (context.conditions?.reduceMotion) {
            gsap.set(element, { clearProps: 'transform,opacity' })
            return
          }
          tween = gsap.fromTo(
            element,
            { opacity: 0.72, y: 8 },
            {
              opacity: 1,
              y: 0,
              duration: 0.2,
              ease: 'power2.out',
              overwrite: 'auto',
              clearProps: 'transform,opacity',
            },
          )
        },
      )
    })
  }

  onMounted(transition)
  onScopeDispose(() => {
    disposed = true
    tween?.kill()
    media.revert()
    const element = target.value
    if (element) gsap.set(element, { clearProps: 'transform,opacity' })
  })

  return { transition }
}
