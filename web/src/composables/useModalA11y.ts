/**
 * 弹层可及性 composable（R3 裁决8）：焦点圈闭三件套。
 *  - open 变 true：记录当前 activeElement → nextTick 聚焦面板内首个可聚焦元素
 *    （一个都没有时聚焦面板根 —— 面板根须自带 tabindex="-1" 兜底）；
 *  - 打开期间 Tab / Shift+Tab 在面板内循环；
 *  - 传了 onClose 才响应 Esc —— 监护人同意门这类不可跳过的阻断层就不传；
 *    宿主已有自己的 window Esc 兜底时（PeekHost）也不传，避免一次按键关两层；
 *  - open 变 false：焦点还给打开前的元素。
 * 键盘监听挂 document 捕获阶段而不是面板元素上：面板可能随栈推进被整个替换
 * （Peek 抽屉压新层），挂在元素上会跟着旧面板一起被卸掉。
 */
import { watch, nextTick, onUnmounted, type Ref } from 'vue'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function useModalA11y(
  open: Ref<boolean>,
  panelRef: Ref<HTMLElement | undefined>,
  onClose?: () => void,
) {
  let restoreEl: HTMLElement | null = null

  const focusables = (): HTMLElement[] => {
    const root = panelRef.value
    return root ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)) : []
  }

  /** 聚焦面板：首个可聚焦元素，退而求其次面板根（需 tabindex=-1） */
  const focusPanel = () => {
    const root = panelRef.value
    if (root) (focusables()[0] ?? root).focus()
  }

  function onKeydown(e: KeyboardEvent) {
    const root = panelRef.value
    if (!root) return
    if (e.key === 'Escape') {
      if (onClose) { e.stopPropagation(); onClose() }
      return
    }
    if (e.key !== 'Tab') return
    const els = focusables()
    if (!els.length) { e.preventDefault(); root.focus(); return }
    const first = els[0]
    const last = els[els.length - 1]
    const active = document.activeElement
    // 焦点到边界（或飘到面板外）时拉回圈内：Tab 从尾回头，Shift+Tab 从头回尾
    if (e.shiftKey) {
      if (active === first || !root.contains(active)) { e.preventDefault(); last.focus() }
    } else if (active === last || !root.contains(active)) {
      e.preventDefault(); first.focus()
    }
  }

  watch(
    open,
    (v) => {
      if (v) {
        restoreEl = document.activeElement as HTMLElement | null
        document.addEventListener('keydown', onKeydown, true)
        nextTick(focusPanel)
      } else {
        document.removeEventListener('keydown', onKeydown, true)
        if (restoreEl && restoreEl.isConnected) restoreEl.focus()
        restoreEl = null
      }
    },
    { immediate: true },
  )

  // 面板被替换（Peek 栈推进/收起一层）时，焦点跟到新的栈顶面板
  watch(panelRef, (el, prev) => {
    if (open.value && el && el !== prev) nextTick(focusPanel)
  })

  onUnmounted(() => document.removeEventListener('keydown', onKeydown, true))
}
