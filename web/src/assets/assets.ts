/**
 * 元素资产注册表（§4.10 / S7）。
 * - 基线：内置手写 SVG（builtin/*.svg）——可主题化、矢量、<2KB、离线、低配友好。
 * - 升级：generated/*.png（Codex 用 gpt-image-2 出图的产物）若存在，则按同名 key 覆盖 SVG。
 * 组件统一用 asset(name) 取 URL，套 <img :src>；缺失自动回退吉祥物，绝不白屏。
 */
// 旧海龟品牌资产留在源码历史中便于回滚，但不再注册、打包或作为任何界面回退。
const svg = import.meta.glob([
  './builtin/*.svg',
  '!./builtin/mascot_turtle.svg',
  '!./builtin/tutor_turtle.svg',
  '!./builtin/tile_ai.svg',
  '!./builtin/empty_projects.svg',
  '!./builtin/empty_tasks.svg',
], { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const png = import.meta.glob([
  './generated/*.png',
  '!./generated/mascot_turtle.png',
  '!./generated/teacher_turtle.png',
  '!./generated/tutor_turtle.png',
  '!./generated/hero_computer.png',
  '!./generated/tile_ai.png',
  // 保留无损源图供后续迭代；运行时只发同名 149KB WebP，避免首屏多带 1.8MB PNG。
  '!./generated/coding_cat_workspace.png',
], { eager: true, query: '?url', import: 'default' }) as Record<string, string>
// R5 裁决7：WebP 管线（Pillow q82 离线转换，5.6MB→0.6MB）。同名 webp 再覆盖 png——
// 三层回退 svg→png→webp，打包只带被引用的最终层，课机首屏最大单项改善。
const webp = import.meta.glob([
  './generated/*.webp',
  '!./generated/mascot_turtle.webp',
  '!./generated/teacher_turtle.webp',
  '!./generated/tutor_turtle.webp',
  '!./generated/hero_computer.webp',
  '!./generated/tile_ai.webp',
], { eager: true, query: '?url', import: 'default' }) as Record<string, string>

const base = (p: string) => p.split('/').pop()!.replace(/\.\w+$/, '')
const reg: Record<string, string> = {}
for (const k in svg) reg[base(k)] = svg[k]
for (const k in png) reg[base(k)] = png[k] // 同名 PNG 覆盖 SVG（生图产物优先）
for (const k in webp) reg[base(k)] = webp[k] // 同名 WebP 再覆盖 PNG（体积 -89%）

// 公共伙伴形象按场景映射；学生自己的侧栏头像不经过此注册表。
const ipHorse = '/generated/pair-ip-v1/horse-guide.png'
const ipPanda = '/generated/pair-ip-v2/panda-wave.png'
const ipHorsePlan = '/generated/pair-ip-v2/horse-plan.png'
// 庆祝构图保留在素材画布；生产浮层使用已验证透明的挥手姿势。
const ipHorseCelebrate = '/generated/pair-ip-v2/horse-welcome.png'
const ipPandaCheck = '/generated/pair-ip-v2/panda-check.png'
const ipPandaThinking = '/generated/pair-ip-v2/panda-thinking.png'
Object.assign(reg, {
  ip_horse: ipHorse,
  ip_panda: ipPanda,
  ip_horse_plan: ipHorsePlan,
  ip_horse_celebrate: ipHorseCelebrate,
  ip_panda_check: ipPandaCheck,
  ip_panda_thinking: ipPandaThinking,
  // 双人主视觉由 PairDuoIllustration 组合；旧单图入口使用导航员。
  ip_duo: ipHorse,
  mascot_cat: ipHorse,
  mate_fox: ipHorsePlan,
  mate_fox_cheer: ipHorseCelebrate,
  pair_student_cat: ipHorse,
  teacher_owl: ipPanda,
  mate_owl: ipPandaCheck,
  mate_owl_think: ipPandaThinking,
  pair_teacher_fox: ipPanda,
  mate_duo: ipHorse,
  coding_cat_workspace: ipHorse,
})

export function asset(name: string, fallback = 'mascot_cat'): string {
  return reg[name] || reg[fallback] || ''
}
export const hasAsset = (n: string) => !!reg[n]
