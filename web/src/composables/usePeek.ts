/**
 * usePeek（V1 · 全站唯一下钻基础设施，对应 V2 方案 D3「层级 ≤3 跳」）。
 * 抽屉栈序列化进 URL query（?peek=student:12,run:88）：
 *  - 浏览器后退键天然 = 收起一层
 *  - 链接可直接分享给同事
 *  - 列表页不卸载，用户不丢上下文
 * 硬约束：depth ≤ 3，超出应改用独立路由（见 canOpen）。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export type PeekKind =
  | 'student' | 'class' | 'roster' | 'task' | 'submission' | 'run' | 'alert'
  | 'exercise' | 'video' | 'set' | 'push'          // V3.5 资源中心
export type PeekTarget = `${PeekKind}:${string}`

export const PEEK_MAX_DEPTH = 3

/**
 * 我们自己压进历史的层数（模块级，跨组件实例共享 —— 抽屉宿主与触发方不是同一个组件）。
 * 用户按浏览器后退键时 popstate 会绕过 close()，所以要在这里同步减回来，
 * 否则计数只增不减，后面的 close() 会 go(-1) 到别的页面去。
 */
let pushedByUs = 0
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (pushedByUs > 0) pushedByUs--
  })
}

export function usePeek() {
  const route = useRoute()
  const router = useRouter()

  const stack = computed<PeekTarget[]>(
    () => String(route.query.peek ?? '').split(',').filter(Boolean) as PeekTarget[],
  )
  const top = computed<PeekTarget | null>(() => stack.value[stack.value.length - 1] ?? null)
  const depth = computed(() => stack.value.length)
  const canOpen = computed(() => depth.value < PEEK_MAX_DEPTH)

  function open(t: PeekTarget) {
    if (stack.value.includes(t)) return                    // 幂等：已在栈中不重复推
    if (!canOpen.value) {
      console.warn(`[peek] 深度已达 ${PEEK_MAX_DEPTH}，请改用独立路由：${t}`)
      return
    }
    router.push({ query: { ...route.query, peek: [...stack.value, t].join(',') } })
    pushedByUs++
  }

  /**
   * 关闭 = **后退一格**，不是再压一条历史。
   * 原来 close/reset 都用 router.push：点「✕」也算前进一步，于是按浏览器后退键
   * 会把刚关掉的抽屉重新打开 —— 和本文件开头宣称的「后退键天然 = 收起一层」正好相反。
   * 只有当这一格确实是我们压进去的时候才 go(-1)；否则（例如用户是直接带 ?peek= 进来的）
   * 用 replace 改 query，免得把用户带离本页。
   */
  function close() {
    if (pushedByUs > 0) {
      pushedByUs--
      router.go(-1)
      return
    }
    const s = stack.value.slice(0, -1)
    router.replace({ query: { ...route.query, peek: s.length ? s.join(',') : undefined } })
  }

  function reset() {
    if (pushedByUs > 0) {
      const n = pushedByUs
      pushedByUs = 0
      router.go(-n)
      return
    }
    router.replace({ query: { ...route.query, peek: undefined } })
  }

  /** 解析 target → {kind, id} */
  function parse(t: PeekTarget): { kind: PeekKind; id: string } {
    const i = t.indexOf(':')
    return { kind: t.slice(0, i) as PeekKind, id: t.slice(i + 1) }
  }

  return { stack, top, depth, canOpen, open, close, reset, parse }
}
