/**
 * 样式护栏（R5 裁决8 + R6 裁决8 扩容）：四轮人肉收编的机器化。
 * 规则一：<style scoped> 里不允许重新定义全局工具类的**根定义**——唯一源在 global.css，
 *         同名 scoped 定义就是「同名双定义」死灰复燃。
 *         允许：后代/组合选择器（`.tbl tbody tr.risky:hover`）、修饰类（`.alert--warn`）、换名类（`.task-chip`）。
 * 规则二（R6）：<script>/<template> 段禁出现颜色字面量（hex/linear-gradient）——
 *         颜色决策逃进 TS 层再经 :style 注入，是 lint 只扫 CSS 的盲区（ThinkingView 实锤利用过）。
 *         允许：<style> 段内（由规则一与人审管）；BaseIcon PATHS 的 path 数据不含色值天然不命中。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const GUARDED = ['chip', 'toast', 'alert', 'tbl', 'tbl-scroll', 'page-head', 'skeleton']
// 命中「根定义」：行首（或 } 后）直接 .chip { … / .chip, … {，不含前置父选择器
const RULE = new RegExp(`(^|[}\\n])\\s*\\.(${GUARDED.join('|')})(\\s*[,{])`, 'g')
// 规则二：script/template 里的注色（#RGB/#RRGGBB 色值或渐变函数）
const COLOR_IN_CODE = /(#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b|linear-gradient\s*\()/g

const bad = []
function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (f.endsWith('.vue')) check(p)
  }
}
function check(file) {
  const src = readFileSync(file, 'utf8')
  const m = src.match(/<style[^>]*scoped[^>]*>([\s\S]*?)<\/style>/g)
  if (m) {
    for (const block of m) {
      let hit
      while ((hit = RULE.exec(block))) {
        const cls = hit[2]
        // 白名单：修饰类（.alert--warn 等带 -- 的）与换名类不在此正则命中范围，无需另行放行
        const line = block.slice(0, hit.index).split('\n').length
        bad.push(`${file} (<style> 内约第 ${line} 行): scoped 重新定义了全局工具类 .${cls}`)
      }
    }
  }
  // 规则二：把 <style> 段全部剥掉后，剩余（template+script）不允许出现颜色字面量
  const noStyle = src.replace(/<style[\s\S]*?<\/style>/g, '')
  let ch
  while ((ch = COLOR_IN_CODE.exec(noStyle))) {
    const line = noStyle.slice(0, ch.index).split('\n').length
    bad.push(`${file} (约第 ${line} 行): <script>/<template> 出现颜色字面量 ${ch[1]} —— 颜色决策必须走令牌/类名`)
  }
}
walk(ROOT)
if (bad.length) {
  console.error('✗ lint-style：违规（唯一源纪律 / 注色旁路）：')
  for (const b of bad) console.error('  ' + b)
  process.exit(1)
}
console.log('✓ lint-style：无 scoped 重定义、无 script/template 注色')
