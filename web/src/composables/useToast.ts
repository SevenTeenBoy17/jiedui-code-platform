/** 轻提示（R5 裁决3）：六份 flash() 复制体收敛。修共享 bug：旧定时器不清会把新 tip 提前抹掉。 */
import { ref, onUnmounted } from 'vue'
export function useToast(ms = 2500) {
  const tip = ref('')
  let t: number | undefined
  function flash(m: string) { tip.value = m; window.clearTimeout(t); t = window.setTimeout(() => (tip.value = ''), ms) }
  onUnmounted(() => window.clearTimeout(t))
  return { tip, flash }
}
