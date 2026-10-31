/**
 * 设备能力探测与低配降级（§4.11）。
 * 依据 deviceMemory / CPU 核数 / 网络(saveData·effectiveType) / 减少动效偏好，给出三档与开关，
 * 供首屏分流（3D→2D、关动画、关 minimap、Pyodide→后端）与 CSS（[data-cap]）使用。
 * 仅在启动探测一次（导出常量），避免重复计算。
 */
export type CapTier = 'low' | 'mid' | 'high'

export interface Capability {
  tier: CapTier
  reducedMotion: boolean
  lowData: boolean
  mem: number
  cores: number
}

function detect(): Capability {
  const nav: any = typeof navigator !== 'undefined' ? navigator : {}
  const mem = Number(nav.deviceMemory) || 4
  const cores = Number(nav.hardwareConcurrency) || 4
  const conn = nav.connection || {}
  const saveData = !!conn.saveData
  const slowNet = ['slow-2g', '2g', '3g'].includes(conn.effectiveType)
  const reducedMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

  let tier: CapTier = 'high'
  if (mem <= 2 || cores <= 2 || saveData || slowNet) tier = 'low'
  else if (mem <= 4 || cores <= 4) tier = 'mid'

  return { tier, reducedMotion, lowData: saveData || slowNet, mem, cores }
}

export const capability: Capability = detect()

/** ECharts/过渡动画是否开启：低配或用户要求减少动效时关闭。 */
export const animationsOn = (): boolean => capability.tier !== 'low' && !capability.reducedMotion

/** 重资源（Pyodide/3D 等）是否走轻量路径。 */
export const preferLight = (): boolean => capability.tier === 'low' || capability.lowData
