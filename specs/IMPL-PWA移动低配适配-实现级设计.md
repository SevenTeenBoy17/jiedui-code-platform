# PWA / 移动端 / 低配适配 · 实现级设计

> 本文是《补充与优化升级_开发计划书与技术路线.md》**§4.11 的实现级展开**。
> 目标：把现有 PWA 外壳（`manifest.webmanifest` + `sw.js` cache-first）升级为**工程化 PWA + 重资源懒加载 + 移动适配 + 低配降级**，适配学校低配 Windows 电脑与移动端。
> 衔接：离线缓存/同步队列对接 `specs/IMPL-云本地存储-实现级设计.md`（§4.3 IndexedDB）；Monaco/Pyodide/绘图懒加载对接 `specs/IMPL-双模编辑器-实现级设计.md`（§4.1）；3D 形象 LOD/降级对接 `specs/IMPL-双AI导师智能体-实现级设计.md`（§4.5）；令牌/断点取 `specs/IMPL-UI高保真还原-实现级设计.md`（§4.10）。

---

## 0. 目标与现状
- **现状**：`manifest.webmanifest`（name "CodeX / AI小海龟"、`standalone`、theme `#4A90E2`）+ `sw.js`（cache-first，缓存 index/app.js/styles/manifest/icon）。够"可安装"，但**未处理重资源缓存、更新陈旧、移动布局、低配降级**。
- **重资源**（必须懒加载/分包）：Monaco（按语言）、Pyodide（首次跑 Python 才加载）、Blockly、ECharts、3D 形象。
- **首屏预算**：JS+CSS gzip < **2-3MB**，先可交互（编辑器骨架），AI/同步/Pyodide 稍后恢复。

---

## 1. PWA 工程化

### 1.1 manifest 完善 `public/manifest.webmanifest`
```json
{
  "name":"AI小海龟 · 结对编程", "short_name":"AI小海龟",
  "start_url":"/?source=pwa", "scope":"/",
  "display":"standalone", "display_override":["window-controls-overlay","standalone"],
  "theme_color":"#4A90E2", "background_color":"#F7FAFF", "lang":"zh-CN", "dir":"ltr",
  "orientation":"any",
  "icons":[
    {"src":"/icons/icon-192.png","sizes":"192x192","type":"image/png"},
    {"src":"/icons/icon-512.png","sizes":"512x512","type":"image/png"},
    {"src":"/icons/maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}
  ],
  "screenshots":[
    {"src":"/screenshots/student-wide.png","sizes":"1280x720","type":"image/png","form_factor":"wide"},
    {"src":"/screenshots/student-narrow.png","sizes":"720x1280","type":"image/png","form_factor":"narrow"}
  ],
  "shortcuts":[
    {"name":"我的作品","url":"/student/projects"},
    {"name":"继续编程","url":"/student/ide"},
    {"name":"教师工作台","url":"/teacher"}
  ]
}
```
> 教师端独立子域（§4.4 方案 A）时，教师端用各自的 manifest（`scope:/`、`start_url:/teacher`）。

### 1.2 Service Worker 策略（Workbox 或手写，建议 Workbox）
分三类缓存，**版本化**避免陈旧：
| 资源 | 策略 | 说明 |
|---|---|---|
| 应用外壳（HTML/入口 JS/CSS） | **预缓存 + 导航回退** | `index.html` 作 SPA fallback |
| 重资源（Monaco/Pyodide/Blockly/ECharts/字体/GPT 图） | **CacheFirst + 版本化 + 过期** | 体积大、低频变；命中即离线可用 |
| API（`/api/*`） | **NetworkFirst（短超时）+ 失败回退离线队列** | 数据要新；断网走 §4.3 队列 |

```js
// sw.js（Workbox 风格；手写等价）
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute, setDefaultHandler } from 'workbox-routing'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

precacheAndRoute(self.__WB_MANIFEST)   // vite-plugin-pwa 注入外壳清单

// 重资源（pyodide/monaco/blockly cdn 或本地 chunk）
registerRoute(({url}) => /(pyodide|monaco|blockly|echarts)/.test(url.pathname),
  new CacheFirst({ cacheName:'heavy-v1',
    plugins:[ new ExpirationPlugin({ maxEntries:120, maxAgeSeconds:60*60*24*30 }) ] }))
// GPT 生成素材
registerRoute(({url}) => url.pathname.includes('/assets/generated/'),
  new StaleWhileRevalidate({ cacheName:'art-v1' }))
// API
registerRoute(({url}) => url.pathname.startsWith('/api/'),
  new NetworkFirst({ cacheName:'api-v1', networkTimeoutSeconds:4 }))

// 更新流程：新 SW 等待 → 通知前端弹"有新版本，点击刷新"
self.addEventListener('message', e => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting() })
```
```ts
// src/pwa/register.ts —— 注册 + 更新提示
import { registerSW } from 'virtual:pwa-register'
export function setupPWA(onUpdate:()=>void){
  const update = registerSW({ onNeedRefresh:onUpdate, onOfflineReady:()=>toast('已可离线使用') })
  return update                  // onUpdate 里弹 toast，用户点"刷新"调 update(true)
}
```
> **更新陈旧防护**：每次发版资源带 hash；SW 版本号随构建变更；新版就绪只提示不强刷（避免学生编辑中被打断），用户确认后 `skipWaiting`+`clients.claim`。

---

## 2. 资源加载与代码分割

### 2.1 Vite 分包 `vite.config.ts`
```ts
build:{ chunkSizeWarningLimit:1500, rollupOptions:{ output:{ manualChunks:{
  monaco:['monaco-editor'],
  blockly:['blockly'],
  echarts:['echarts'],
  three:['three'],
  vendor:['vue','vue-router','pinia'],
  // pyodide 不打包：运行时从 CDN/本地按需 loadPyodide()
}}}}
```
### 2.2 按需加载
- **路由级**：`const StudentIDE = () => import('@/views/student/IDE.vue')`（学生/教师布局各自异步）。
- **Monaco 按语言**：仅在打开代码模式时 `import('monaco-editor')`，且只注册当前语言 worker（见 §4.1 `useMonaco` 懒加载封装）。
- **Pyodide 首次运行才加载**：`usePyodide()` 内 `await loadPyodide()`，加载期显示进度；C/C++ 走后端不触发。
- **Blockly/ECharts/3D**：`defineAsyncComponent` + 占位骨架；3D 形象懒加载、不在首屏。
- **首屏度量**：CI 跑 Lighthouse，目标 LCP<2.5s（校园网）、TBT<300ms、首屏传输<3MB。

---

## 3. 低配降级策略

### 3.1 能力探测 `src/composables/useDeviceCapability.ts`
```ts
export type Tier = 'low'|'mid'|'high'
export function detectTier():Tier{
  const mem = (navigator as any).deviceMemory ?? 4          // GB（Chromium）
  const cpu = navigator.hardwareConcurrency ?? 4
  const eff = (navigator as any).connection?.effectiveType ?? '4g'
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced || mem <= 2 || cpu <= 2 || /2g/.test(eff)) return 'low'
  if (mem <= 4 || cpu <= 4 || eff === '3g') return 'mid'
  return 'high'
}
```
### 3.2 全局降级 store `src/stores/degrade.ts`
```ts
import { defineStore } from 'pinia'; import { detectTier } from '@/composables/useDeviceCapability'
export const useDegrade = defineStore('degrade', {
  state:()=>({ tier: detectTier() }),
  getters:{
    char3d:(s)=> s.tier==='high',          // 3D 形象：仅高配；mid/low → 2D/Lottie/静态
    motion:(s)=> s.tier!=='low',           // 动效：低配关
    pyodide:(s)=> s.tier!=='low',          // 低配 Python 转后端兜底（不在浏览器跑 WASM）
    monacoRich:(s)=> s.tier==='high',      // 低/中配：关 minimap、降补全
    echartsAnim:(s)=> s.tier==='high',
  },
})
```
### 3.3 降级开关落点
| 能力 | high | mid | low |
|---|---|---|---|
| AI 3D 形象 | GLTF/Live2D | 2D Lottie | 静态 PNG |
| 动效/过渡 | 全开 | 减弱 | 关 |
| Python 执行 | Pyodide | Pyodide | **后端兜底** |
| Monaco | minimap+全补全 | 关 minimap | 关 minimap+轻补全 |
| ECharts 动画 | 开 | 开 | 关 |
| 首屏 | 全量 | 懒加载更激进 | 仅编辑器骨架先行 |

---

## 4. 移动端适配

### 4.1 断点（取 §4.10 令牌）
`sm:640 md:768 lg:1024 xl:1280`。`< md` 视为移动布局。

### 4.2 IDE 窄屏布局
- 三区（编程区/终端区/绘图区）由"并排"改 **Tab 切换或底部抽屉**；积木编辑触摸优化（拖拽热区放大、长按菜单）。
- AI 双导师面板 `< md` 变**底部抽屉**（上滑展开），不抢编辑区。
- 教师仪表盘卡片**单列堆叠**（瓷片/StatCard `grid auto-fill` 自然回流）。
- 关键 CSS：
```css
.ide{ display:grid; grid-template-columns:minmax(0,1fr) 360px; }
@media (max-width:768px){
  .ide{ grid-template-columns:1fr; }                  /* 单列 */
  .ide__panels{ position:fixed; inset:auto 0 0 0; }   /* AI 抽屉 */
  .ide__regions{ display:block; }                     /* 三区改 Tab */
  .tap{ min-width:44px; min-height:44px; }            /* 触摸目标 */
}
```
- **虚拟键盘/安全区**：`viewport-fit=cover` + `env(safe-area-inset-*)`；输入聚焦时编辑区不被键盘遮挡（`visualViewport` 监听上推）。

### 4.3 触摸与手势
- 触摸目标 ≥ 44×44px；积木拖拽用 pointer events；长按=上下文菜单；避免 hover-only 交互（移动端无 hover）。

---

## 5. 离线与网络容错（对接 §4.3）
- **本地先行**：编辑即写 IndexedDB（§4.3 `useAutosave` 本地镜像），断网零丢失。
- **同步队列**：断网时云端写入入队 `sync-queue`，联网重放（带幂等键，冲突走 §4.3 三选面板）。
- **UI 提示**：`online/offline` 事件 → 顶部条「离线编辑中，联网后自动同步」。
- **加载顺序**：先进编辑器（可写码），Pyodide/AI/同步稍后恢复；弱网先本地后云。
- **Background Sync**（可选）：SW `sync` 事件在恢复网络时触发队列重放。

---

## 6. 性能预算与监控

### 6.1 首屏预算表（gzip）
| 资源 | 预算 | 手段 |
|---|---|---|
| 入口 JS（vendor+app 外壳） | ≤ 700KB | 分包 + 懒加载 |
| 首屏 CSS | ≤ 80KB | Tailwind purge + 令牌 |
| Monaco | 按需，不计首屏 | 打开代码模式才载 |
| Pyodide(~6MB) | 按需，不计首屏 | 首次跑 Python 才载，带进度 |
| 字体（中文） | ≤ 300KB | **子集化** + `font-display:swap` |
| 图片 | 懒加载 | `loading="lazy"` + `srcset` + GPT 素材 ≤512px |

### 6.2 加载优先级
- `<link rel="preload">` 入口 JS/CSS、首屏字体子集；`prefetch` 大概率下一步资源（如进入 IDE 前 prefetch monaco chunk）。
- 字体中文子集：按常用 3500 字 + 代码 ASCII 子集化，woff2。
- Web Vitals 上报（可选）：`onLCP/onINP/onCLS` 采样回传，供持续优化。

---

## 7. 配置 / 数据结构
```ts
// 能力分级与降级开关（可被教师端/管理端覆盖，便于机房统一设低配）
interface DegradeConfig{ forceTier?:Tier; disable3D?:boolean; pyodideMaxMem?:number; swCacheVersion:string }
// SW 资源清单版本：构建注入，发版即变，驱动缓存更新
```

---

## 8. 验收标准 + 测试点
| # | 验收点 |
|---|---|
| P1 | 首屏 JS+CSS gzip **< 3MB** 且 3s 内可编辑（校园网模拟） |
| P2 | Monaco 仅打开代码模式才加载；Pyodide 仅首次运行 Python 才加载（带进度） |
| P3 | 低配机（deviceMemory≤2/2 核）自动 **2D 形象 + 关动效 + Python 转后端**，不卡顿 |
| P4 | `prefers-reduced-motion` 下动效关闭 |
| P5 | 移动端（<768）三区可 Tab 切换、AI 底部抽屉可用、触摸目标≥44px、键盘不遮挡 |
| P6 | 断网可编辑 → 联网自动同步（§4.3 队列）；离线提示出现 |
| P7 | PWA **可安装**（桌面/移动）、有快捷方式；新版本**提示刷新**且不打断编辑 |
| P8 | Lighthouse：PWA 通过、Performance ≥ 良好阈值、无重资源进首屏 |

---

## 附：与上游/同级文档的衔接
- 离线缓存/同步队列/冲突：§4.3 `specs/IMPL-云本地存储-实现级设计.md`（IndexedDB `useAutosave`、`sync-queue`、三选冲突）。
- 懒加载封装：§4.1 `useMonaco`/`usePyodide`；3D 降级：§4.5 LOD/`prefers-reduced-motion`/`deviceMemory`。
- 令牌/断点/素材：§4.10 设计系统（`art-v1` 缓存的 GPT 素材、`--sp/--r` 令牌、`sm/md/lg/xl` 断点）。
- 现有 `manifest.webmanifest`/`sw.js` 在此升级为工程化 PWA（建议 `vite-plugin-pwa` 接管 `__WB_MANIFEST` 注入）。
