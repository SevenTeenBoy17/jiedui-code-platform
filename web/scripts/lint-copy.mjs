/**
 * 文案密度 lint —— 把「少即是多」变成能卡住构建的规则。
 * 用法：node scripts/lint-copy.mjs [--verbose]
 *
 * 规则：
 *  R1 单屏**常驻中文正文** ≤ copyBudget（默认 90 字，文件头 `@copyBudget N` 可声明）
 *  R2 瓷片正面禁止长解释：CeramicTile/BentoTile 的 sub/label/title ≤ 14 字（解释进 hint）
 *  R3 单屏**常驻可交互元素** ≤ 12
 *  R4 视图 + 它常驻引用的自写组件**合并计算**（组件里的字和控件同样占用户的屏幕）
 *
 * 口径（这四条是踩过坑才定下来的，改之前先读）：
 *  ① 扫描范围含 src/views **与** src/components —— 只扫 views 的话，
 *    InsightRail(120字) / AiTutorPanel(130字) 这类常驻面板从来不被任何规则看见，规则只管了一半界面。
 *  ② <template> 用**深度匹配**取，不能用 /<template>([\s\S]*?)<\/template>/ ——
 *    模板里有嵌套 <template v-if> 时会在第一个 </template> 处截断，后半屏漏检。
 *  ③ 未展开的 <details> 内容与控件**不计入** —— 折叠正是本规则要求的补救手段，
 *    把折叠内容计进"首屏"等于惩罚补救。
 *  ④ v-if / v-else-if / v-else 是**互斥分支**，取各分支的**最大值**而不是求和 ——
 *    求和会把「同意门禁弹层」「交卷成功页」这些一屏只出现一个的东西叠加起来，
 *    据此去删文案，删掉的是本来就合理的说明。
 *  ⑤ 标了 data-lint="overlay" 的块、或文件头声明 `@lintOverlay` 的组件，按**独立浮层**计，
 *    不并进宿主屏 —— 弹窗/浮动面板盖在页面之上，和常驻信息不是一回事；
 *    但它们**仍会被单独检查**，不是免检。
 *    `@lintOverlay` 会被**核验**：样式里必须真有 position: fixed，否则报错。
 *    不核验的话，这个标记就是一个"随便标一下就免检"的后门。
 *
 * 退出码 1 = 有违规。已串进 npm run build。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')
const DEFAULT_BUDGET = 90
const MAX_INTERACTIVE = 12
const MAX_TILE_TEXT = 14
// 浮层（toast / 下拉菜单 / 阻断层）的独立额度：承认渐进披露，但不给无限免检
const OVERLAY_MAX_CJK = 30
const OVERLAY_MAX_CTRL = 6
const VERBOSE = process.argv.includes('--verbose')

const CJK = /[一-龥]/g
const INTERACTIVE_TAG = /^(button|input|select|textarea|routerlink|router-link|a)$/i

// ———— 工具 ————
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    fs.statSync(p).isDirectory() ? walk(p, out) : f.endsWith('.vue') && out.push(p)
  }
  return out
}

/** 深度匹配取根 <template>：模板里有嵌套 <template v-if> 时，惰性正则会提前截断 */
function rootTemplate(src) {
  const open = src.search(/<template[\s>]/)
  if (open < 0) return ''
  let i = open, depth = 0, start = -1
  const tag = /<(\/?)template\b[^>]*?(\/?)>/g
  tag.lastIndex = open
  let m
  while ((m = tag.exec(src))) {
    const closing = m[1] === '/'
    const selfClose = m[2] === '/'
    if (selfClose) continue
    if (!closing) {
      if (depth === 0) start = m.index + m[0].length
      depth++
    } else {
      depth--
      if (depth === 0) return src.slice(start, m.index)
    }
    i = tag.lastIndex
  }
  return src.slice(start < 0 ? open : start)
}

/** 去掉注释、未展开的 details、浮层块 */
function stripNonResident(tpl) {
  return tpl
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<details(?![^>]*\bopen\b)[\s\S]*?<\/details>/g, ' ')
    // data-lint="overlay"（瞬时叠加层）与 data-lint="screen"（整屏阻断层）都独立于宿主屏计
    .replace(/<([A-Za-z][\w-]*)\b[^>]*\bdata-lint="(?:overlay|screen)"[\s\S]*?<\/\1>/g, ' ')
}

const countCjk = (s) => (s.replace(/\{\{[\s\S]*?\}\}/g, '').replace(/<[^>]+>/g, ' ').match(CJK) || []).length

function countInteractive(s) {
  let n = 0
  for (const m of s.matchAll(/<([A-Za-z][\w-]*)\b([^>]*)>/g)) {
    const [, tag, attrs] = m
    if (attrs.startsWith('/')) continue
    if (INTERACTIVE_TAG.test(tag) || /@click(?:\.\w+)*=/.test(attrs)) n++
  }
  return n
}

/**
 * 按互斥分支切块：v-if / v-else-if / v-else 一屏只出现一个，取 max 而不是求和。
 * 做法：把顶层带 v-if/v-else* 的元素整块抠出来分别计量，剩余部分为"共有骨架"。
 * 骨架 + max(各互斥分支) = 这一屏的真实值。
 */
function splitBranches(tpl) {
  const spans = []
  const re = /<([A-Za-z][\w-]*)\b[^>]*\sv-(?:if|else-if|else)\b[^>]*>/g
  let m
  while ((m = re.exec(tpl))) {
    const end = matchEnd(tpl, m.index, m[1])
    if (end > m.index) spans.push([m.index, end])
  }
  // 只保留互不嵌套的顶层块
  const top = spans.filter(([a, b]) => !spans.some(([c, d]) => c < a && b <= d))
  const branches = top.map(([a, b]) => tpl.slice(a, b))
  let skeleton = tpl
  for (const [a, b] of top.slice().reverse()) skeleton = skeleton.slice(0, a) + ' ' + skeleton.slice(b)
  return { skeleton, branches }
}

/** 找到 <tag ...> 对应的闭合位置（自闭合直接返回） */
function matchEnd(s, from, tag) {
  const openTag = new RegExp(`<${tag}\\b[^>]*?(/?)>`, 'g')
  openTag.lastIndex = from
  const first = openTag.exec(s)
  if (!first) return -1
  if (first[1] === '/') return openTag.lastIndex
  let depth = 1
  const re = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, 'g')
  re.lastIndex = openTag.lastIndex
  let m
  while ((m = re.exec(s))) {
    if (m[2] === '/') continue
    depth += m[1] === '/' ? -1 : 1
    if (depth === 0) return re.lastIndex
  }
  return -1
}

// ———— 装载 ————
const files = walk(SRC)
const byName = new Map()          // 组件名 → 文件
for (const f of files) byName.set(path.basename(f, '.vue'), f)

/**
 * 组件是否为浮层。**声明必须被核验**：文件头写了 @lintOverlay，样式里就得真有 position: fixed，
 * 否则这个标记会变成"标一下就免检"的后门。核验不通过的在主循环里报错。
 */
const overlayCache = new Map()
/**
 * 判据是「是否把宿主整个盖住」，不是死抠关键字：
 * absolute/fixed + 四边都钉住即可（`inset: 88px 0 0 0` 这种避开标题栏的写法同样是整屏阻断）。
 */
const coversScreen = (src) => {
  if (!/position:\s*(fixed|absolute)/.test(src)) return false
  if (/\binset:\s*[^;]+/.test(src)) return true
  return ['top', 'right', 'bottom', 'left'].every((k) => new RegExp(`\\b${k}:\\s*[^;]+`).test(src))
}

/**
 * 组件级浮层的判据是「**定位**浮层」，不是「整屏覆盖」——
 * toast 本来就不该盖住整屏，用 coversScreen 去卡它是把类别搞混了。
 * 它不并进宿主屏，但**自己仍会被按预算单独检查**，所以不是免检。
 */
const isPositioned = (src) => /position:\s*(fixed|absolute)/.test(src)

function isOverlay(file) {
  if (overlayCache.has(file)) return overlayCache.get(file)
  const src = fs.readFileSync(file, 'utf8')
  const v = /@lintOverlay\b/.test(src) && isPositioned(src)
  overlayCache.set(file, v)
  return v
}
function overlayClaimIsFalse(file) {
  const src = fs.readFileSync(file, 'utf8')
  return /@lintOverlay\b/.test(src) && !isPositioned(src)
}

/**
 * 行内 `data-lint="overlay"` 同样要被核验，否则这就是"标一下就免检"的后门。
 * 判据：该元素必须是**条件渲染**（v-if/v-show，浮层不该常驻），
 * 且它的首个 class 在本文件样式里有整屏覆盖的规则。
 */
/**
 * 行内浮层有两类，额度不同 —— 混成一类会逼着人去删本该说清楚的话：
 *   data-lint="overlay" 瞬时叠加层（下拉菜单、toast）：额度小（30 字 / 6 控件）。
 *   data-lint="screen"  整屏阻断层（监护人同意门禁这种，出现时页面其余部分不可用）：
 *                       它**就是一屏**，按默认屏预算算，不该被菜单的额度卡。
 * 两者都要被核验，否则标记就是"标一下就免检"的后门。
 */
function badInlineOverlays(src) {
  const bad = []
  for (const m of src.matchAll(/<([A-Za-z][\w-]*)\b([^>]*\bdata-lint="(overlay|screen)"[^>]*)>/g)) {
    const attrs = m[2]
    const kind = m[3]
    const cls = (attrs.match(/\bclass="([^"]*)"/) || [, ''])[1].split(/\s+/)[0]
    const conditional = /\bv-(?:if|else-if|show)\b/.test(attrs)
    const rule = cls && new RegExp(`\\.${cls}\\b[^{]*\\{[^}]*\\}`).exec(src)
    const ruleSrc = rule ? rule[0] : ''

    if (!conditional) {
      bad.push(`<${m[1]} class="${cls}">：浮层必须是条件渲染（v-if/v-show），常驻的不算浮层`)
      continue
    }
    if (kind === 'screen') {
      if (!coversScreen(ruleSrc)) {
        bad.push(`<${m[1]} class="${cls}">：声明为整屏阻断层，但样式不是整屏覆盖`)
        continue
      }
      const end = matchEnd(src, m.index, m[1])
      const body = end > m.index ? src.slice(m.index, end) : ''
      const c = countCjk(body)
      if (c > DEFAULT_BUDGET) {
        bad.push(`<${m[1]} class="${cls}">：阻断层 ${c} 字 > ${DEFAULT_BUDGET}（它自己就是一屏，也要守预算）`)
      }
      continue
    }
    if (!/position:\s*(fixed|absolute)/.test(ruleSrc)) {
      bad.push(`<${m[1]} class="${cls}">：瞬时浮层必须是绝对/固定定位`)
      continue
    }
    // 承认渐进披露，但不给无限免检：把整墙文字塞进 class="menu" 的 div 也绕不过去
    const end = matchEnd(src, m.index, m[1])
    const body = end > m.index ? src.slice(m.index, end) : ''
    const c = countCjk(body)
    const k = countInteractive(body)
    if (c > OVERLAY_MAX_CJK || k > OVERLAY_MAX_CTRL) {
      bad.push(`<${m[1]} class="${cls}">：浮层 ${c} 字 / ${k} 控件`
             + ` 超出上限 ${OVERLAY_MAX_CJK} 字 / ${OVERLAY_MAX_CTRL} 控件`)
    }
  }
  return bad
}

const cache = new Map()
function measureFile(file, seen = new Set()) {
  if (cache.has(file)) return cache.get(file)
  const src = fs.readFileSync(file, 'utf8')
  const tpl = rootTemplate(src)
  if (!tpl) return { cjk: 0, ctrl: 0, budget: DEFAULT_BUDGET, own: { cjk: 0, ctrl: 0 }, children: [] }

  const visible = stripNonResident(tpl)
  const budget = Number((src.match(/@copyBudget\s+(\d+)/) || [, DEFAULT_BUDGET])[1])
  const { skeleton, branches } = splitBranches(visible)

  seen.add(file)
  const allKids = []
  /**
   * R4：常驻引用的自写组件并入本屏计量。
   * **子组件必须跟着它所在的互斥分支走** —— 只出现在 `v-if="creating"` 里的表单组件，
   * 和只出现在 `v-if="study"` 里的状态面板，用户一次只能看到一个，不能相加。
   * 早先按"整屏出现过的组件全并"算，`StudyView` 会被计成 表单+面板，凭空多出一屏。
   */
  /**
   * 递归量一段模板：自己的字与控件 + 常驻子组件 + max(嵌套互斥分支)。
   * **必须递归**：只处理顶层分支的话，`v-if="ct"` 与 `v-else` 这种嵌在分支里的互斥块仍会被求和，
   * 于是一屏被算成"空态文案 + 有数据文案"两份，据此去删文案，删掉的是本来就合理的说明。
   */
  const measureChunk = (chunk, depth = 0) => {
    const { skeleton: sk, branches: br } = depth < 4 ? splitBranches(chunk) : { skeleton: chunk, branches: [] }
    let acc = { cjk: countCjk(sk), ctrl: countInteractive(sk) }
    for (const m of sk.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)) {
      const child = byName.get(m[1])
      if (!child || seen.has(child) || allKids.some((c) => c.file === child)) continue
      if (isOverlay(child)) continue        // 浮层不并进宿主屏（它自己仍被单独检查）
      const sub = measureFile(child, seen)
      allKids.push({ file: child, ...sub })
      acc = { cjk: acc.cjk + sub.cjk, ctrl: acc.ctrl + sub.ctrl }
    }
    const worstIn = br.reduce((a, b) => {
      const v = measureChunk(b, depth + 1)
      return { cjk: Math.max(a.cjk, v.cjk), ctrl: Math.max(a.ctrl, v.ctrl) }
    }, { cjk: 0, ctrl: 0 })
    return { cjk: acc.cjk + worstIn.cjk, ctrl: acc.ctrl + worstIn.ctrl }
  }

  const base = measureChunk(skeleton)
  const worst = branches.reduce((a, b) => {
    const v = measureChunk(b)
    return { cjk: Math.max(a.cjk, v.cjk), ctrl: Math.max(a.ctrl, v.ctrl) }
  }, { cjk: 0, ctrl: 0 })
  seen.delete(file)

  const own = { cjk: countCjk(skeleton), ctrl: countInteractive(skeleton) }
  const total = { cjk: base.cjk + worst.cjk, ctrl: base.ctrl + worst.ctrl }
  const out = { ...total, budget, own, children: allKids }
  cache.set(file, out)
  return out
}

// ———— 检查 ————
let problems = 0
const isView = (f) => f.includes(`${path.sep}views${path.sep}`)

for (const file of files) {
  const rel = path.relative(ROOT, file)
  const src = fs.readFileSync(file, 'utf8')
  const tpl = rootTemplate(src)
  if (!tpl) continue

  if (overlayClaimIsFalse(file)) {
    console.log(`✗ [浮层声明不成立] ${rel}: 声明了 @lintOverlay，但样式里没有 position: fixed/absolute（不是定位浮层）`)
    problems++
  }
  for (const b of badInlineOverlays(src)) {
    console.log(`✗ [浮层声明不成立] ${rel}: ${b}`)
    problems++
  }

  // 视图与组件一律按「这一屏的合并值」判 —— 组件被 own(骨架) 判会漏掉它分支里的整墙文字
  const r = measureFile(file)
  const scope = r
  const extra = r.cjk - r.own.cjk
  const detail = extra > 0 ? `（骨架 ${r.own.cjk} + 分支/子组件 ${extra}）` : ''
  const detailC = r.ctrl - r.own.ctrl > 0 ? `（骨架 ${r.own.ctrl} + 分支/子组件 ${r.ctrl - r.own.ctrl}）` : ''

  if (scope.cjk > scope.budget) {
    console.log(`✗ [R1 文案超预算] ${rel}: ${scope.cjk} 字${detail} > ${scope.budget}（长文请折叠/进 hint/进 Peek）`)
    problems++
  }
  if (scope.ctrl > MAX_INTERACTIVE) {
    console.log(`✗ [R3 交互元素过多] ${rel}: ${scope.ctrl}${detailC} > ${MAX_INTERACTIVE}（收进折叠/Peek/浮层）`)
    problems++
  }

  for (const m of tpl.matchAll(/<(CeramicTile|BentoTile)\b([^>]*)>/g)) {
    for (const a of m[2].matchAll(/\b(?:sub|label|title)="([^"{}]{1,80})"/g)) {
      const n = (a[1].match(CJK) || []).length
      if (n > MAX_TILE_TEXT) {
        console.log(`✗ [R2 瓷片文字过长] ${rel}: "${a[1]}" ${n} 字 > ${MAX_TILE_TEXT}（解释请进 hint）`)
        problems++
      }
    }
  }

  if (VERBOSE) {
    const kids = r.children.map((c) => path.basename(c.file, '.vue')).join(',')
    console.log(`  ${rel.padEnd(52)} 字 ${String(scope.cjk).padStart(3)}/${scope.budget}` +
                `  控件 ${String(scope.ctrl).padStart(2)}/${MAX_INTERACTIVE}${kids ? '  ← ' + kids : ''}`)
  }
}

console.log(problems
  ? `\n共 ${problems} 处违反「少即是多」规则。`
  : `✓ 文案密度检查通过（${files.length} 个 .vue：${files.filter(isView).length} 视图 + ${files.length - files.filter(isView).length} 组件）`)
process.exit(problems ? 1 : 0)
