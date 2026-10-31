/**
 * 把 Pyodide 运行时下载到 web/public/pyodide/，供机房离线使用。
 *
 * 为什么必须做：usePyodide.ts 原本固定从 jsdelivr 拉 ~6MB，而 sw.js 不缓存第三方源，
 * 于是一个班 40 台机器第一次进 IDE 就是 40 × 6MB 打境外 CDN；
 * 拉不下来时 IdeView 会回退后端执行 —— 代码还能跑，但**海龟绘图整个消失**。
 *
 * 用法：npm run fetch:pyodide
 * 部署：把生成的 public/pyodide/ 一起发布即可（sw.js 已按 CacheFirst 缓存 /pyodide/）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const VER = process.env.PYODIDE_VER || 'v0.26.4'
const BASE = `https://cdn.jsdelivr.net/pyodide/${VER}/full/`
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'pyodide')

// 只取「跑起来 + 海龟绘图」必需的文件。整包有几百个 wheel，全下会把仓库撑爆，
// 而我们的 SHIM 只用到标准库，不需要 numpy/pandas 那些。
const FILES = [
  'pyodide.js',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
]

async function get(name) {
  const url = BASE + name
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${name} → HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(path.join(OUT, name), buf)
  return buf.length
}

fs.mkdirSync(OUT, { recursive: true })
let total = 0
for (const f of FILES) {
  try {
    const n = await get(f)
    total += n
    console.log(`  ✓ ${f.padEnd(22)} ${(n / 1024 / 1024).toFixed(2)} MB`)
  } catch (e) {
    console.error(`  ✗ ${f}：${e.message}`)
    process.exitCode = 1
  }
}
console.log(`\nPyodide ${VER} → public/pyodide/  合计 ${(total / 1024 / 1024).toFixed(1)} MB`)
if (process.exitCode) {
  console.error('有文件没下全。机房部署前必须补齐，否则海龟绘图会在那些机器上消失。')
} else {
  console.log('机房部署时把 public/pyodide/ 一并发布；sw.js 会 CacheFirst 缓存它。')
}
