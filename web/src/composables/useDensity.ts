/**
 * useDensity（V1 · 对应 V2 方案 §2「教研 dense / 教学 cozy」）。
 * 教学区在讲台投影 + 教师视距下使用 → 强制 cozy（不给 12px 小字）；
 * 教研区单人近距离看数据 → 允许 dense。
 * 写到 <html data-density>，CSS 用 [data-density="dense"] 覆写间距/字号。
 */
import { computed, watchEffect } from 'vue'
import { useRoute } from 'vue-router'

export type Density = 'cozy' | 'dense'
const KEY = 'jiedui.density'

/** 教师教研区可由用户切换；其余一律 cozy。 */
export function useDensity() {
  const route = useRoute()

  const zone = computed<'teach' | 'research' | 'student'>(() => {
    const p = route.path
    if (p.startsWith('/teacher/research')) return 'research'
    if (p.startsWith('/teacher')) return 'teach'
    return 'student'
  })

  const density = computed<Density>(() => {
    if (zone.value !== 'research') return 'cozy'            // 教学/学生强制 cozy
    return (localStorage.getItem(KEY) as Density) || 'dense'
  })

  function setDensity(d: Density) {
    localStorage.setItem(KEY, d)
    document.documentElement.dataset.density = d
  }

  // 区域 + 密度写到根节点，供 CSS 与主题使用
  watchEffect(() => {
    document.documentElement.dataset.zone = zone.value
    document.documentElement.dataset.density = density.value
  })

  return { zone, density, setDensity, canSwitch: computed(() => zone.value === 'research') }
}
