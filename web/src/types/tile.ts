/**
 * TileSpec（V1 · 对应 V2 方案 D3「每张瓷片 1 判断 + 1 动作」）。
 * 铁律：瓷片正面只允许 label + value + state + spark；
 *   解释性文字 → hint（hover/长按才出现）；明细 → drill（Peek 抽屉或独立路由）。
 * 这一条直接砍掉现有 Dashboard 的大量常驻文字。
 */
import type { RouteLocationRaw } from 'vue-router'
import type { PeekTarget } from '@/composables/usePeek'

export type TileState = 'ok' | 'warn' | 'risk'

export interface TileSpec {
  id: string
  label: string                                   // '待介入'
  value: string | number                          // 17
  /** 语义化涨跌：good 指明"哪个方向是好的"，组件不猜红绿 */
  delta?: { v: number; good: 'up' | 'down' }
  state?: TileState
  spark?: number[]                                // ≤24 点迷你趋势（SVG polyline，不上 ECharts）
  icon?: string                                   // assets key
  tint?: string                                   // 瓷片渐变令牌名 blue|orange|purple|teal|lavender|peach|mint
  drill?: { peek: PeekTarget } | { to: RouteLocationRaw }
  hint?: string                                   // 仅 hover / 长按显示的一句解释
}
