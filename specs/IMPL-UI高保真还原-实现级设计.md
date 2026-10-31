# UI 高保真还原 · 实现级设计

> 本文是《补充与优化升级_开发计划书与技术路线.md》**§4.10 的实现级展开**。
> 目标：建立**全局设计令牌系统（单一权威源）** → 组件库 → 按 5 张参考图高保真还原 → GPT 生图管线产出素材。
> 关系：本文是设计系统的**权威源**；教师端（`specs/IMPL-教师预警工作台-实现级设计.md` 的 `--t-` 令牌）、编辑器（`specs/IMPL-双模编辑器-实现级设计.md`）、登录（`specs/IMPL-师生分离登录-实现级设计.md`）均引用本系统的语义层。
> 栈：Vue3 + TS + Vite + Tailwind CSS（教师端表格/表单可叠 Element Plus）。

---

## 0. 设计原则
1. **令牌单一权威源**：组件**禁止硬编码色值**，一律用 CSS 变量/Tailwind token。
2. **语义分层**：primitive（原始色阶）→ semantic（primary/accent/success…）→ scoped（student/teacher 主题各自映射语义）。
3. **师生端视觉硬区分**：同一语义层，不同作用域主题（`[data-app="student"]` pastel 活泼 / `[data-app="teacher"]` 浅色数据大屏）。
4. **素材可缺失回退**：GPT 生成素材用 `import.meta.glob` 装载，缺失回退占位/吉祥物，永不白屏。
5. **WCAG AA**：正文对比度 ≥ 4.5:1、大字/图标 ≥ 3:1；所有交互元素有可见焦点态。

---

## 1. 设计令牌系统（权威源）

### 1.1 全局令牌 `src/styles/tokens.css`
```css
:root {
  /* —— 原始色阶 primitive —— */
  --blue-50:#EAF2FD; --blue-100:#D2E4FB; --blue-300:#7DB0F0; --blue-500:#4A90E2; --blue-700:#2F6BB8;
  --orange-300:#FFD089; --orange-500:#F5A623; --orange-700:#C97E10;
  --teal-500:#2EC4B6; --amber-500:#FFB020; --rose-500:#E85D75;
  --ink-900:#1F2A44; --ink-600:#4B5872; --ink-400:#8A93AD; --ink-200:#C9D0DE;
  --paper:#FFFFFF; --paper-student:#F7FAFF; --paper-teacher:#F4F7FB;

  /* —— 语义 semantic（组件只用这一层）—— */
  --color-primary:var(--blue-500);  --color-primary-strong:var(--blue-700); --color-primary-soft:var(--blue-100);
  --color-accent:var(--orange-500); --color-accent-soft:var(--orange-300);
  --color-success:var(--teal-500);  --color-warning:var(--amber-500); --color-danger:var(--rose-500);
  --color-text:var(--ink-900); --color-text-2:var(--ink-600); --color-text-3:var(--ink-400);
  --color-border:var(--ink-200); --color-surface:var(--paper); --color-bg:var(--paper-student);

  /* —— 间距（8px 基准网格）—— */
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:24px; --sp-6:32px; --sp-8:48px; --sp-10:64px;
  /* —— 圆角 —— */
  --r-sm:8px; --r-md:12px; --r-lg:16px; --r-xl:24px; --r-pill:999px;
  /* —— 阴影 —— */
  --shadow-sm:0 2px 8px rgba(31,42,68,.06);
  --shadow-md:0 6px 20px rgba(31,42,68,.10);
  --shadow-lg:0 12px 36px rgba(31,42,68,.14);
  /* —— 字体 —— */
  --font-sans:'HarmonyOS Sans SC','Microsoft YaHei',system-ui,sans-serif;
  --font-code:'JetBrains Mono','Cascadia Code',Consolas,monospace;
  --fs-xs:12px; --fs-sm:13px; --fs-base:14px; --fs-md:16px; --fs-lg:20px; --fs-xl:28px; --fs-2xl:36px;
  --lh-tight:1.25; --lh-normal:1.6;
  --fw-regular:400; --fw-medium:500; --fw-bold:700;
  /* —— 动效 —— */
  --ease:cubic-bezier(.4,0,.2,1); --dur-fast:160ms; --dur:280ms;
  /* —— z-index —— */
  --z-panel:100; --z-fab:120; --z-modal:200; --z-toast:300;
}
```

### 1.2 作用域主题（师生区分）`src/styles/themes.css`
```css
/* 学生端：活泼 pastel，暖橙强调，圆角更大 */
[data-app="student"]{
  --color-bg:var(--paper-student);
  --card-radius:var(--r-lg);
  --accent-cta:var(--color-accent);     /* 运行/创作按钮暖橙 */
  --elev:var(--shadow-md);
}
/* 教师端：浅色数据大屏，蓝绿点缀，数据密度高，圆角更收敛 */
[data-app="teacher"]{
  --color-bg:var(--paper-teacher);
  --card-radius:var(--r-md);
  --t-primary:var(--color-primary);     /* §4.8 用 --t- 前缀，统一映射到本系统语义层 */
  --t-accent:var(--color-success);
  --t-surface:var(--color-surface);
  --t-grid-gap:var(--sp-4);
  --elev:var(--shadow-sm);
}
```
> 教师端规范里出现的 `--t-*` 全部在此**桥接到全局语义层**，避免两套真相源漂移。

### 1.3 Tailwind 映射 `tailwind.config.ts`
```ts
export default {
  content: ['./index.html','./src/**/*.{vue,ts}'],
  theme: { extend: {
    colors: {
      primary:'var(--color-primary)', accent:'var(--color-accent)',
      success:'var(--color-success)', warning:'var(--color-warning)', danger:'var(--color-danger)',
      ink:{900:'var(--ink-900)',600:'var(--ink-600)',400:'var(--ink-400)',200:'var(--ink-200)'},
      surface:'var(--color-surface)', bg:'var(--color-bg)',
    },
    borderRadius:{ sm:'var(--r-sm)', md:'var(--r-md)', lg:'var(--r-lg)', xl:'var(--r-xl)' },
    boxShadow:{ sm:'var(--shadow-sm)', md:'var(--shadow-md)', lg:'var(--shadow-lg)' },
    fontFamily:{ sans:'var(--font-sans)', code:'var(--font-code)' },
    spacing:{ 1:'var(--sp-1)',2:'var(--sp-2)',3:'var(--sp-3)',4:'var(--sp-4)',5:'var(--sp-5)',6:'var(--sp-6)',8:'var(--sp-8)' },
  }},
}
```
> 断点（令牌级，移动细节交 §4.11）：`sm:640 md:768 lg:1024 xl:1280`。

---

## 2. 组件库规范（实现级）

### 2.1 BaseButton `src/components/ui/BaseButton.vue`
```vue
<script setup lang="ts">
defineProps<{ variant?:'primary'|'secondary'|'run'|'danger'|'ghost'; size?:'sm'|'md'|'lg'; block?:boolean }>()
</script>
<template>
  <button :class="['btn', `btn--${variant||'primary'}`, `btn--${size||'md'}`, block&&'btn--block']">
    <slot/>
  </button>
</template>
<style scoped>
.btn{ font-family:var(--font-sans); font-weight:var(--fw-medium); border:none; cursor:pointer;
  border-radius:var(--r-md); transition:var(--dur-fast) var(--ease); display:inline-flex; gap:var(--sp-2);
  align-items:center; justify-content:center; }
.btn:focus-visible{ outline:2px solid var(--color-primary); outline-offset:2px; }
.btn--sm{ height:32px; padding:0 var(--sp-3); font-size:var(--fs-sm); }
.btn--md{ height:40px; padding:0 var(--sp-4); font-size:var(--fs-base); }
.btn--lg{ height:48px; padding:0 var(--sp-5); font-size:var(--fs-md); }
.btn--block{ width:100%; }
.btn--primary{ background:var(--color-primary); color:#fff; }
.btn--primary:hover{ background:var(--color-primary-strong); }
.btn--run{ background:var(--color-accent); color:#fff; }      /* 运行=暖橙，呼应令牌语义 */
.btn--secondary{ background:var(--color-primary-soft); color:var(--color-primary-strong); }
.btn--danger{ background:var(--color-danger); color:#fff; }
.btn--ghost{ background:transparent; color:var(--color-text-2); }
.btn:disabled{ opacity:.5; cursor:not-allowed; }
</style>
```

### 2.2 BaseCard / BentoTile
```vue
<!-- BaseCard.vue -->
<template><section class="card"><slot/></section></template>
<style scoped>
.card{ background:var(--color-surface); border-radius:var(--card-radius,var(--r-lg));
  box-shadow:var(--elev,var(--shadow-sm)); padding:var(--sp-5); }
</style>
```
```vue
<!-- BentoTile.vue —— 瓷片区单元（对应 UI瓷片区样式.jpg）-->
<script setup lang="ts">
defineProps<{ title:string; subtitle?:string; icon?:string; tone?:'blue'|'orange'|'teal'|'purple'; badge?:string }>()
</script>
<template>
  <button class="tile" :data-tone="tone||'blue'">
    <span v-if="badge" class="tile__badge">{{ badge }}</span>
    <img v-if="icon" :src="icon" class="tile__icon" alt=""/>
    <div class="tile__txt"><b class="tile__title">{{ title }}</b><small v-if="subtitle">{{ subtitle }}</small></div>
  </button>
</template>
<style scoped>
.tile{ position:relative; display:flex; gap:var(--sp-3); align-items:center; text-align:left;
  padding:var(--sp-4); border:none; cursor:pointer; border-radius:var(--r-lg);
  background:linear-gradient(135deg,var(--tone-a),var(--tone-b)); box-shadow:var(--shadow-sm);
  transition:transform var(--dur) var(--ease); }
.tile:hover{ transform:translateY(-3px); box-shadow:var(--shadow-md); }
.tile[data-tone="blue"]{ --tone-a:#EAF2FD; --tone-b:#D2E4FB; }
.tile[data-tone="orange"]{ --tone-a:#FFF1DD; --tone-b:#FFD089; }
.tile[data-tone="teal"]{ --tone-a:#E2F7F4; --tone-b:#BDEBE5; }
.tile[data-tone="purple"]{ --tone-a:#EFEAFE; --tone-b:#D9CEFB; }
.tile__icon{ width:48px; height:48px; object-fit:contain; }
.tile__title{ font-size:var(--fs-md); color:var(--color-text); }
.tile__txt small{ color:var(--color-text-2); font-size:var(--fs-sm); }
.tile__badge{ position:absolute; top:var(--sp-2); right:var(--sp-2); font-size:var(--fs-xs);
  background:var(--color-danger); color:#fff; padding:2px 8px; border-radius:var(--r-pill); }
</style>
```

### 2.3 其余组件（同样绑定令牌，给 class 约定）
| 组件 | 关键 class / 令牌 | 用途 |
|---|---|---|
| `BaseInput` | `bg:surface border:--color-border radius:--r-md focus:outline primary` | 表单/搜索 |
| `Tag` / `Badge` | `success/warning/danger soft 底 + 同色文` | 状态/语言/难度/预警级 |
| `Avatar` | 圆形 `--r-pill`，缺图回退首字母 | 学生/教师/AI |
| `ProgressRing` | SVG `stroke:--color-primary`，轨道 `--color-primary-soft` | 学习进度/完成率 |
| `EmptyState` | 居中插画(GPT 素材)+提示文，缺图回退吉祥物 | 空作品/空任务 |
| `StatCard` | 图标圆角块 + 大数字(`--fs-xl`)+标签 | 学生统计/教师 KPI |

---

## 3. 逐图高保真还原

### 3.1 登录页（`登录界面.png` · Pixel Rise → AI 小海龟）
- 栅格：左文案 + 中央 3D 物件 + 右数字，浅灰底；顶部胶囊导航 + 右上黑色「登录/注册」。
- 区块→组件：`PixelTitle`（像素字体大标题，CSS `font-family:'Press Start 2P'` 子集 + 描边）；`Hero3DComputer`（GPT 生成的 3D 橙色复古电脑，屏内嵌 `<TurtleCanvasPreview>` 跑海龟画布动画）；`GrowthStat`（"132% GROWTH"→「计算思维成长指数」）。
- 关键 CSS：
```css
.login{ display:grid; grid-template-columns:1fr 1.1fr 0.7fr; align-items:center; gap:var(--sp-6);
  min-height:100vh; padding:var(--sp-8); background:radial-gradient(120% 120% at 50% 0,#fff, #ECEFF4); }
.login__title{ font-family:'Press Start 2P',var(--font-sans); font-size:clamp(28px,5vw,56px);
  line-height:1.1; color:var(--color-text); letter-spacing:1px; }
.hero3d{ width:min(420px,40vw); filter:drop-shadow(0 24px 40px rgba(245,166,35,.25)); }
```
- 入口分离：登录组件按 `aud`（student/teacher）渲染不同品牌色与跳转（对接 §4.4）。

### 3.2 学生工作台（`学生用户界面.png` · Hello Len → 作品工作台）
- 栅格：顶部 logo+导航+搜索+头像；左列 `StatCard×3`（作品数/任务/学习时长）+ pastel 业务卡；**中央吉祥物(小龟) + ProgressRing**；右列「我的课表/任务」。
- 区块→组件：`WorkbenchHeader`、`StatCard`、`ContinueCreating`（继续创作大卡）、`MascotProgress`（吉祥物+进度环）、`TaskSchedule`、`RecentErrors`（最近运行错误，链到 IDE）。
- 视觉：`[data-app="student"]` pastel；卡片 `--r-lg`；吉祥物用 GPT 生成 `mascot-turtle`（2D/Lottie）。

### 3.3 瓷片区（`UI瓷片区样式.jpg`）
- `BentoGrid`：`display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:var(--sp-4)`；用 `BentoTile` 承载：模板库、任务库、作品类型(Python/C++/C)、AI 支架入口、报告快捷入口；各 tile `tone` + 3D 图标(GPT 素材) + 状态 `badge`。

### 3.4 教师数据大屏（`教师后端界面.jpg`）→ 详见 §4.8
- 本文只供令牌与图表配色：六维雷达/漏斗/环形/柱状统一取 `--color-primary / --color-success / --color-accent` 三色阶；KPI `StatCard` 用 `[data-app="teacher"]` 收敛圆角。

### 3.5 教师预警首页（`教师后端界面2.jpg`）→ 详见 §4.8
- 本文供：中央教师 3D 形象素材（GPT 生成 `teacher-3d`）、预警级颜色（高=danger/中=warning/低=text-3）、学生关怀/班级分布卡片令牌。

---

## 4. GPT 生图管线（落地脚本）

### 4.1 素材清单（`src/assets/generated/`）
| 名称 | 用途 | 透明底 |
|---|---|---|
| `mascot-turtle` / `mascot-reviewer` | 双 AI 导师（小龟/智伴，多表情，§4.5） | 是 |
| `teacher-3d` | 教师端中央形象（§4.8/3.5） | 是 |
| `hero-3d-computer` | 登录页 3D 复古电脑（§3.1） | 是 |
| `tile-*`（template/task/python/cpp/c/ai/report） | 瓷片 3D 图标 | 是 |
| `empty-projects` / `empty-tasks` | 空状态插画 | 是 |
| `badge-star` | 成就徽章 | 是 |
| `ct-icon-*`（六维：抽象/分解/建模/算法/验证/迁移） | 计算思维图标 | 是 |

### 4.2 统一风格 Prompt 模板
```
卡通 3D 渲染，粗描边，圆润可爱，活泼明亮；主色 教育蓝 #4A90E2 + 暖橙 #F5A623，辅 青绿 #2EC4B6；
干净白底（便于抠图）；居中构图，单一主体，无文字水印；面向初中生编程教育；高质量、柔和投影。
主体：<具体物体描述>
```

### 4.3 批量生成脚本 `scripts/gen-assets.mjs`（走平台 `gpt-image-2` 路由）
```js
import fs from 'node:fs'; import path from 'node:path';
import { callImageModel } from './model-provider.mjs';   // 平台已有图像路由（/v1/images, gpt-image-2）

const STYLE = '卡通3D,粗描边,圆润可爱,教育蓝#4A90E2+暖橙#F5A623+青绿#2EC4B6,干净白底,居中单主体,无文字,初中编程教育';
const ASSETS = {
  'mascot-turtle': '一只蓝橙配色戴眼镜的小海龟程序员，背壳有发光代码纹理，鼓励表情',
  'mascot-reviewer': '一个白蓝色小机器人/书本精灵，戴小眼镜，手持检查清单',
  'teacher-3d': '一位友好的卡通老师半身像，戴眼镜，手持平板',
  'hero-3d-computer': '一台橙色复古台式电脑，屏幕显示海龟绘图，悬浮',
  'tile-python':'一条蓝色卡通蟒蛇图标', 'tile-cpp':'C++积木方块图标', 'tile-c':'C语言徽标积木',
  'tile-template':'模板文件夹图标','tile-task':'任务清单图标','tile-ai':'AI对话气泡图标','tile-report':'数据报表图标',
  'empty-projects':'小海龟看着空空的画板','empty-tasks':'小海龟拿着空任务清单','badge-star':'金色星星成就奖章',
};
const OUT = 'src/assets/generated'; fs.mkdirSync(OUT,{recursive:true});
const queue = Object.entries(ASSETS);
const CONC = 3;   // 控制并发，避免限流
async function worker(){ for(;;){ const item=queue.shift(); if(!item)break;
  const [name,desc]=item;
  try{
    const b64 = await callImageModel({ model:'gpt-image-2', prompt:`${STYLE}\n主体：${desc}`,
      size:'1024x1024', quality:'high', n:1 });           // 返回 b64_json
    fs.writeFileSync(path.join(OUT,`${name}.png`), Buffer.from(b64,'base64'));
    console.log('OK', name);
  }catch(e){ console.error('FAIL', name, e.message); }    // 失败不阻塞其余
}}
await Promise.all(Array.from({length:CONC}, worker));
console.log('done');
```

### 4.4 透明化 + 压缩（CodeAgent 已验证管线）`scripts/post-assets.py`
```python
# 四角洪水填充去白底 + 缩放到 512 + PNG 优化（依赖 Pillow）
import glob, os
from PIL import Image, ImageDraw
for p in glob.glob('src/assets/generated/*.png'):
    im = Image.open(p).convert('RGBA'); w,h = im.size
    if sum(im.split()[3].histogram()[:10]) / (w*h) > .05:   # 已透明则跳过
        pass
    else:
        rgb = im.convert('RGB')
        for c in [(0,0),(w-1,0),(0,h-1),(w-1,h-1)]:
            px = rgb.getpixel(c)
            if min(px) >= 235:                              # 近白角才填
                ImageDraw.floodfill(rgb, c, (255,0,254), thresh=42)
        src = im.load(); rp = rgb.load()
        for y in range(h):
            for x in range(w):
                if rp[x,y]==(255,0,254): r,g,b,_=src[x,y]; src[x,y]=(r,g,b,0)
    im.thumbnail((512,512), Image.LANCZOS)
    im.save(p, 'PNG', optimize=True)
    print('post', os.path.basename(p))
```

### 4.5 动态装载与缺失回退 `src/assets/assets.ts`
```ts
const mods = import.meta.glob('./generated/*.png', { eager:true, import:'default' }) as Record<string,string>
const map:Record<string,string> = {}
for (const k in mods) map[k.split('/').pop()!.replace('.png','')] = mods[k]
export function asset(name:string, fallback='mascot-turtle'){ return map[name] || map[fallback] || '' }
export const hasAsset = (n:string)=> !!map[n]
```
- **3D 形象落地与降级**：默认 2D PNG/Lottie（低配/移动）；高配可选 Three.js 轻量 GLTF（懒加载、面数 5k-10k、纹理 <1MB）；`prefers-reduced-motion`/能力分级见 §4.11；缺资产回退 SVG 占位。

---

## 5. 可访问性与响应式（令牌级）
- **对比度**：`--ink-900` on `--paper`=15:1✓；`--color-primary` on 白=4.6:1✓（正文用 `--ink-900/600`，主色仅用于大字/控件）。
- **焦点态**：所有交互元素 `:focus-visible{ outline:2px solid var(--color-primary); outline-offset:2px }`。
- **最小字号**：正文 ≥ `--fs-base`(14px)，按钮文字 ≥ 14px。
- **断点**：`sm/md/lg/xl`（移动具体布局交 §4.11）；瓷片/卡片用 `auto-fill minmax` 自适应列数。
- **语义化**：`nav/main/section/button`，图标按钮带 `aria-label`。

---

## 6. 验收标准 + 视觉走查清单
| # | 验收点 |
|---|---|
| U1 | 师生端视觉**明显区分**（学生 pastel+暖橙圆角大；教师浅蓝白数据密度高） |
| U2 | 5 张参考图关键区块**高保真还原**（登录 3D 电脑/学生瓷片工作台/教师预警大屏） |
| U3 | 组件**零硬编码色值**——全部走令牌；改 `tokens.css` 全站联动 |
| U4 | 教师端 `--t-*` 全部桥接到全局语义层，无第二真相源 |
| U5 | GPT 素材风格统一、透明底、≤512px；缺失自动回退占位/吉祥物，无白屏 |
| U6 | 正文对比度 ≥ WCAG AA；全部交互元素有可见焦点态 |
| U7 | 3D 形象低配回退 2D/Lottie，`prefers-reduced-motion` 生效 |

---

## 附：与上游/同级文档的衔接
- 令牌是**唯一权威源**：§4.8 `--t-*`、§4.1 编辑器主题、§4.4 登录品牌色全部 `var(--color-*)` 引用本文。
- GPT 管线复用平台 `model-provider.mjs` 的 `/v1/images`(gpt-image-2) 路由（与 §4.5 生图、`data/model-contracts.json` 一致），透明化/压缩/装载沿用 CodeAgent 已验证脚本。
- 移动端断点的**具体布局/触摸/抽屉**在 `specs/IMPL-PWA移动低配适配-实现级设计.md`（§4.11）落地。
