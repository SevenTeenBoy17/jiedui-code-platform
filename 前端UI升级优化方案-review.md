# 前端 UI 升级优化方案（review 稿 · 先前端 → 你 review → 再后端）

> 角色：资深 Web 全栈 + 项目经理。目标：把现有 `CX/web`（Vue3+TS+Vite+Tailwind）从「扁平柔卡」升级到参考图的**玻璃拟态(Glassmorphism) + 陶瓷瓷片(Ceramic Tile) + 卡通 3D**高保真质感，师生端明确区分。
> 纪律：**本轮只交付方案供你 review，不改代码**。通过后按分阶段实施（每阶段可验证），前端做通后再进后端。
> 生图：`gpt-image-2` 经 `https://gpt-agent.cc/v1/images/generations` **本会话实测可用**——已成功生成 2 张 AI 角色 3D 立绘（小龟 46.6s / 智伴 52.2s，返回 b64 ~1.5MB，白底易抠，见本轮附图）。此结论**取代**旧文档 `Codex优化路线` §0 的"本机图像端点不可达"（当时超时，现已恢复）；`api.llm-token.cn` 图像端点本轮仍超时，故生图固定走 gpt-agent.cc。**注**：`web/scripts/gen-assets.py` 目前**尚未落盘**（是 `Codex优化路线` §2.5 的待创建代码块），F1 需先创建再批量跑。

---

## 1. 结论先行（TL;DR）

- **不推翻重写**：现有 19 内置 SVG、`assets.ts` 覆盖机制、令牌三层、师生 `[data-app]` 主题、六大功能视图都保留，做**材质与质感层的增量升级**，风险可控、可分阶段 review。
- **三件核心事**：① 令牌层补齐**玻璃 + 瓷片 + 3D 高光**变量；② 新增 6 个**材质原语组件**（GlassPanel / CeramicTile / BentoGrid / PixelWordmark / FloatingDecor / RingProgress）；③ 用 gpt-image-2 生成**真实卡通 3D 素材**（2 个 AI 角色 + 吉祥物 + glossy 瓷片图标 + 登录漂浮元素），经 `assets.ts` 覆盖 SVG、缺失回退。
- **顺序**：F1 设计系统地基 → F2 登录+工作台（视觉冲击最大，先给你 review）→ F3 IDE+AI 面板 → F4 思维成长+教师端 → F5 打磨+响应式。

---

## 2. 现状 vs 参考图 —— 差距分析（逐屏）

| 屏 | 当前实现 | 参考图目标 | 主要差距 |
|---|---|---|---|
| 登录 `Login.vue` | 玻璃底渐变 + emoji🐢 + 角色页签 + 表单 | `登录界面.png`(Pixel Rise)：玻璃卡 + 3D 复古电脑/吉祥物 + 漂浮 3D 元素 + 像素字 wordmark + 玻璃导航胶囊 | 无真玻璃材质、无 3D 素材、无像素 wordmark、无漂浮装饰、无班级码登录 |
| 工作台 `WorkbenchView.vue` | 6 瓷片(内置 SVG 图标) + hero + 渐变 | `学生用户界面.png`+`UI瓷片区.jpg`：glossy 3D 图标瓷片 bento + 3D 吉祥物 hero + 环形进度 + 磨砂分组面板 | 图标为扁平 SVG 非 glossy 3D、缺磨砂分组面板、缺环形数据、瓷片渐变偏弱 |
| IDE `IdeView.vue` | 深色区 + 实色工具条 + emoji AI 球 | 玻璃工具条浮于深色编辑器 + 玻璃 AI 悬浮 | 工具条/保存条/AI 球非玻璃材质 |
| AI 面板 `AiTutorPanel.vue` | 紫蓝渐变头 + SVG 头像 + 角色切换 | 磨砂玻璃悬浮卡 + **卡通 3D 双角色立绘** + 气泡流 | 头像为扁平 SVG（应为 3D 立绘）、面板非玻璃磨砂 |
| 思维成长 `ThinkingView.vue` | 雷达 + 6 SVG 徽章 + 指标卡 | 玻璃卡 + glossy 3D 六维徽章 + 环形指标 | 徽章非 3D glossy、卡片非玻璃、指标无环形 |
| 教师端 `DashboardView.vue` | 白卡 KPI + 雷达/漏斗 + 预警列表 | `教师后端界面2.jpg`：浅玻璃 BI + **3D 教师角色** + KPI 瓷片 + 严重度 chip + 顶部蓝导航/身份切换 | 无玻璃磨砂、无 3D 教师角色、KPI 非瓷片、缺顶部导航/身份切换、缺数据大屏下钻 |

> 共性缺口：**玻璃材质、卡通 3D 素材、瓷片 glossy 图标、磨砂分组面板、环形数据可视**。均可在不动业务逻辑的前提下由「令牌 + 原语组件 + 生成素材」补齐。

---

## 3. 设计系统升级（令牌层）

### 3.1 新增玻璃令牌（追加到 `tokens.css`，不改现有）
```css
/* —— 玻璃拟态 —— */
--glass-bg:rgba(255,255,255,.60);        --glass-bg-strong:rgba(255,255,255,.74);
--glass-bg-teacher:rgba(244,247,251,.66);/* 教师端偏冷 */
--glass-blur:18px;                        --glass-blur-strong:24px;
--glass-border:rgba(255,255,255,.65);     --glass-hi:inset 0 1px 0 rgba(255,255,255,.7);
--glass-shadow:0 8px 32px rgba(31,42,68,.12);
--glass-radius:24px;
/* —— 瓷片渐变（pastel，配 glossy 3D 图标）—— */
--tile-blue:linear-gradient(145deg,#EAF2FD,#D2E4FB);
--tile-orange:linear-gradient(145deg,#FFF3E0,#FFD089);
--tile-purple:linear-gradient(145deg,#F1EEFF,#DFD8FF);
--tile-teal:linear-gradient(145deg,#E4F7F4,#BEEDE6);
--tile-lavender:linear-gradient(145deg,#F3F0FF,#E7E0FF);
--tile-peach:linear-gradient(145deg,#FFF0EC,#FFD9CE);
--tile-mint:linear-gradient(145deg,#EAFBF3,#C9F3DE);
--tile-radius:22px; --tile-lift:translateY(-3px);
/* —— 3D 高光/景深背景 —— */
--decor-blob-1:radial-gradient(closest-side,rgba(245,166,35,.16),transparent);
--decor-blob-2:radial-gradient(closest-side,rgba(124,107,240,.14),transparent);
```
> 保持"组件禁硬编码色值"原则；玻璃/瓷片一律走变量。**注**：`backdrop-filter` 需在 GlassPanel 同时写 `-webkit-backdrop-filter`(Safari)；令牌**预留 dark 变量位**（本轮不做暗色，仅占位）；`tokens.css` 内定义 hex 属原始层，组件层不得硬编码（现有 Workbench/Login 硬编码将在 F2 顺带清理）。

### 3.2 新增 6 个材质原语组件（`components/ui/`）
| 组件 | 作用 | 关键 props |
|---|---|---|
| `GlassPanel.vue` | 磨砂玻璃容器（`backdrop-filter`+`-webkit-backdrop-filter` + 高光描边 + 柔影） | `variant=student\|teacher`, `strong` |
| `CeramicTile.vue` | 瓷片卡（渐变底 + glossy 3D 图标槽 + 标题/副标题/动作胶囊 + 悬浮微抬） | `tint`, `icon`, `title`, `sub`, `to` |
| `BentoGrid.vue` | 响应式 bento 网格（`auto-fill minmax`） | `min`, `gap` |
| `PixelWordmark.vue` | 像素风品牌字（CSS/图片，登录 hero 用） | `text`, `color` |
| `FloatingDecor.vue` | 漂浮 3D 装饰层（代码块/星/齿轮/信封，`prefers-reduced-motion` 停动） | `items` |
| `RingProgress.vue` | 环形进度/指标（CSS `conic-gradient`，低配友好，不额外拉 ECharts） | `value`, `size`, `color` |
> 低配降级：`useDeviceCapability` 已把档位写到根节点 `[data-cap]` 并已关 `.fade-in/.float` 动画；**本轮需新增**（现状未做）`[data-cap=low] .glass{backdrop-filter:none;background:实色}` 把玻璃退化为半透明实色，保证低端设备不卡。列 F1/F5 交付物+验收。

### 3.3 卡通 3D 素材生成（gpt-image-2 · gpt-agent.cc · 本轮已跑通）
> **命名铁律（修正审阅第 7 条）**：`assets.ts` 是**按同名文件覆盖**（`generated/X.png` 覆盖 `builtin/X.svg`，缺失回退）。因此**覆盖已有组件的素材必须沿用旧 key、不加 `_3d` 后缀**，否则覆盖链断裂、组件读不到。

**A｜覆盖现有 key（零改调用点，直接升级为 3D）**——文件名必须与现有 SVG 同名：
- `mascot_turtle.png`（覆盖吉祥物 SVG，登录/品牌用）
- `tutor_turtle.png` / `tutor_robot.png`（覆盖 AI 双角色，`AiTutorPanel` 直接生效；样张已生成）
- **glossy 瓷片图标**（以 `WorkbenchView.vue` **真实在用的 6 个 key** 为准，修正审阅第 6 条）：`tile_python` / `tile_cpp` / `tile_c` / `tile_ai` / `tile_report` / `tile_template`（`tile_task` 工作台未引用，暂不生成）
- **六维徽章**：`ct_decompose/abstract/model/algorithm/verify/transfer`（覆盖 `ThinkingView` 徽章）

**B｜新增 key（需同步在组件里新增 `asset('…')` 调用点）**：
- `teacher_turtle`（教师端欢迎区 3D 角色，`DashboardView` 新增引用）
- `hero_computer` + `decor_code/star/gear/envelope`（登录漂浮元素，`FloatingDecor` 引用）

**流水线**：`gen-assets.py`(F1 先创建，base url 固定 gpt-agent.cc，带重试) 生成 → `post-assets.py` 抠图去底(Pillow 四角洪水)+512px/透明 PNG → 落 `assets/generated/` → `assets.ts` 覆盖/新增 → **SVG 始终兜底，PNG 缺失不白屏**。提示词沿用 `Codex优化路线` §2.3/§2.4 规范。

---

## 4. 逐屏前端升级方案

> 每屏：改动文件 + 关键改动 + 是否需要新素材。**均不动业务逻辑/接口**，纯表现层。

### F2-a 登录 `Login.vue`（视觉冲击最大，优先 review）
- 玻璃主卡(`GlassPanel strong`) + `PixelWordmark "AI小海龟"` + `FloatingDecor`(hero_computer/code/star/gear) + 3D `mascot_turtle`(覆盖同名 SVG)。
- 角色页签(学生橙/教师蓝联动强调色) + **新增"账号/班级码"登录子切换**(仅学生) + 玻璃导航胶囊。
- 底部"未成年人保护"提示保留。素材：`mascot_turtle`(覆盖)、`hero_computer`(新增)、`decor_*`×4(新增)。

### F2-b 工作台 `WorkbenchView.vue`
- `BentoGrid` + `CeramicTile`(渐变 tint + glossy 3D 图标)；hero 换 `mascot_turtle` + `RingProgress` 环形"成长指数"。
- 顶部玻璃导航 + 用时/成长 chip。素材：glossy 瓷片图标 ×6(`tile_python/cpp/c/ai/report/template` 覆盖)、`mascot_turtle`(覆盖)。

### F3-a IDE `IdeView.vue`
- 工具条/作品条/保存条改 `GlassPanel`(浮于深色编辑器)；AI 悬浮球玻璃化 + 3D 小图标。纯样式，编辑器/运行逻辑不动。

### F3-b AI 面板 `AiTutorPanel.vue`
- 面板改磨砂 `GlassPanel`；头像换**3D 立绘** `tutor_turtle`/`tutor_robot`(覆盖同名 SVG，含表情态)；角色切换/气泡/同意门禁保留。素材：2 角色 3D（样张已生成）。

### F4-a 思维成长 `ThinkingView.vue`
- 卡片玻璃化；六维徽章换 glossy 3D(`ct_decompose/abstract/model/algorithm/verify/transfer` 覆盖)；指标卡加 `RingProgress` 环形；雷达置于 `GlassPanel`。

### F4-b 教师端 `DashboardView.vue`（对齐 `教师后端界面2.jpg`）
- 顶部蓝玻璃导航 + 身份切换胶囊；KPI 换 `CeramicTile`(冷色 + 3D 等距图标)；欢迎区加 `teacher_turtle`(新增 key，`DashboardView` 加 `asset()` 调用)；雷达/漏斗置玻璃面板；预警列表严重度 chip 强化(高危红/中危黄)；学情表下钻。素材：`teacher_turtle`(新增)、KPI 3D 图标(新增)。

---

## 5. 实施阶段与可验证增量

| 阶段 | 内容 | 验证方式 | 你 review 点 |
|---|---|---|---|
| **F1** 地基 | 令牌(玻璃/瓷片) + 5 原语组件 + 生图脚本产素材 | typecheck+build 绿；素材画廊(棋盘格验透明) | 素材质量 + 玻璃/瓷片观感 |
| **F2** 登录+工作台 | Login + Workbench 高保真化 | build + 浏览器实景 + 截图 | ★首个视觉里程碑（先发你） |
| **F3** IDE+AI 面板 | 工具条玻璃化 + 3D 双角色 | build + 实景 | 角色立绘 + 玻璃层次 |
| **F4** 思维成长+教师端 | 六维 glossy + 教师 BI 玻璃化 | build + 实景 | 教师端与参考图吻合度 |
| **F5** 打磨 | 移动响应/低配降级/动效/可访问性 | build + 移动模拟 + Lighthouse | 整体收尾 |

**每阶段交付证据**：`npm run build`(vue-tsc) 通过 + **人工 `npm run dev` 起服后浏览器实景截图/录屏**。注：本机 Preview MCP 目录受限、且 `show_widget` 无法渲染依赖 Vite/Pinia/router 的真实视图，故真实视图验证走 `Start-Process` 打开 + 手动截图（或你在浏览器 review）；`show_widget` 仅用于独立素材/HTML 片段预览。

> **粗估工作量（PM 视角）**：F1 ~1 天(令牌+6 原语+生图脚本+首批素材) · F2 ~1.5 天 · F3 ~1 天 · F4 ~1.5 天 · F5 ~1 天，合计 **~6 人天**；**F2 首个视觉里程碑约 2.5 天可先给你看**。

---

## 6. 风险与对策
- **玻璃性能**：`backdrop-filter` 多层叠加在低端设备掉帧 → 低配 `[data-cap=low]` 降级实色；限制同屏玻璃层数。
- **生图稳定性**：gpt-agent.cc 偶发波动 → 脚本带重试；**SVG 始终作为兜底**，PNG 缺失不白屏。
- **风格漂移**：多张 3D 素材光照/配色不一 → 统一提示词前缀 + 一次性批量生成 + 人工挑选。
- **中文渲染**：生图不渲染大段中文（只出图形元素），界面文字由前端渲染。
- **不动后端**：本轮纯前端表现层，接口契约零改动，降低回归面。

## 7. 后端（本轮不做，review 后再评）
前端升级为**纯表现层**，不依赖新后端。**安全澄清**：生图是**构建期离线** python 脚本一次性产 PNG 入库，密钥**不进浏览器**、素材为静态 bundle，**无运行时暴露面**。后续 review 通过后，后端候选项（另开评审）：① 可选 `/api/assets/gen` 生图代理（仅当未来要"运行时按需生图"时，把 key 收服务端）；② 作品缩略图/分享；③ 教师数据大屏聚合增强。**均待你 review 前端后再定。**

## 8. 验收标准（前端）
① 玻璃+瓷片+卡通3D 三材质到位、与参考图观感一致；② 学生暖/教师冷双色系清晰区分；③ **新增材质组件零硬编码色（走令牌）**，且顺带把 Workbench/Login 现有硬编码 tint→令牌（`tokens.css` 内定义 hex 属原始层、允许）；④ 3D 素材经 `assets.ts` **同名覆盖**、缺失回退 SVG 不白屏；⑤ `npm run build`(vue-tsc) 通过；⑥ 移动/低配可用不卡（`[data-cap=low]` 玻璃降级实色）；⑦ **无障碍：玻璃卡文字对比度≥4.5:1、`prefers-reduced-motion` 停浮动、装饰图 `aria-hidden`/语义图 `alt`**；⑧ 未成年人保护(同意/用时)在 UI 有体现。

---

## 9. 审阅修订记录（已吸收资深前端 reviewer 12 条 · 对照真实代码核实）

| # | 审阅发现 | 修订 |
|---|---|---|
| 1·2 阻断 | "复用已写好脚本"/"已实测可用" 与旧文档"本机不可达"矛盾 | 已改：**本会话实测生成 2 张角色**（取代旧结论）；`gen-assets.py` 标注为 F1 **待创建**（§TL;DR、§3.3） |
| 7 阻断 | `_3d` 后缀会绕过 `assets.ts` 同名覆盖 | 已改：覆盖素材**沿用旧 key 不加后缀**；新增 key 明确"需加 `asset()` 调用点"（§3.3 A/B） |
| 6 重要 | 瓷片 key 清单与组件不符（`tile_task` 未用） | 已改：以 `WorkbenchView` 真实 6 key 为准（§3.3） |
| 3 重要 | `[data-cap=low]` 现仅关动画，**未**降级 backdrop-filter | **需新增**（非既有）：F1/F5 写 `[data-cap=low] .glass{backdrop-filter:none;background:实色}`，列为 F5 交付物+验收 |
| 4 重要 | backdrop-filter 叠 Monaco 性能风险 + 缺 Safari 前缀 | 令牌/组件补 `-webkit-backdrop-filter`；**IDE 编辑区之上同屏玻璃≤2 层、不覆盖滚动的 Monaco viewport**；F5 加"IDE 实机滚动帧率"指标 |
| 5 重要 | "组件零硬编码色"与现状冲突（Workbench tint/Login bg 硬编码） | 验收⑧改为"**新增材质组件不得硬编码；F2 顺带把 Workbench/Login 现有硬编码 tint→令牌**"；`tokens.css` 内定义 hex 属原始层、允许 |
| 8 重要 | 漏 `StudentShell/TeacherShell`、空状态、`BlockEditor/DesignPanel` | 补入逐屏范围（见下 §4 增补） |
| 9 建议 | 玻璃上可访问性/对比度未定 | F5 验收补：玻璃卡文字对比度≥4.5:1；`FloatingDecor` 在 `prefers-reduced-motion` 停动；装饰图 `aria-hidden`、语义图 `alt` |
| 10 建议 | 无暗色/i18n 立场 | **本轮不做暗色/i18n**（K12 单语场景）；玻璃令牌**预留 dark 变量位**，后续再评 |
| 11 建议 | "环形进度"实现未定、恐与 ECharts 重复 | F1 原语补 `RingProgress.vue`（CSS `conic-gradient`，低配友好，不再拉 ECharts 实例） |
| 12 建议 | `show_widget` 无法渲染依赖 Vite/Pinia/router 的真实 Vue 视图 | 验证方式改为：**人工 `npm run dev` + 手动截图 / 你在浏览器 review**；`show_widget` 仅用于独立 HTML 片段/素材预览，不当作真实视图验证手段 |

**§4 逐屏增补**（补审阅第 8 条）：
- `StudentShell.vue` / `TeacherShell.vue`：品牌区换 3D 吉祥物、顶部导航改**玻璃胶囊**（学生暖/教师冷）。
- 空状态：`empty_projects/empty_tasks` 插画玻璃卡（作品/任务空态）。
- `BlockEditor.vue`(Blockly) / `DesignPanel.vue`：与玻璃工具条视觉协同（Blockly 工具箱配色贴齐令牌，DesignPanel 磨砂化）。

**F1 交付物据此更新为**：玻璃/瓷片令牌(含 `-webkit-` 前缀 + dark 预留位) + 6 原语(`GlassPanel/CeramicTile/BentoGrid/PixelWordmark/FloatingDecor/RingProgress`) + `[data-cap=low]` 玻璃降级规则 + `gen-assets.py/post-assets.py` 落盘并跑通首批素材。

---

## 附：本轮已生成的 AI 双角色 3D 样张（放 scratchpad，未入项目）
- **小龟(驾驶员/操作者引导)**：绿身橙卫衣圆眼镜橙耳机、竖大拇指、白底。→ 覆盖 `tutor_turtle.png`。
- **智伴(领航员/审看者)**：白蓝书本精灵机器人、圆眼镜、放大镜+带勾清单、小披风、白底。→ 覆盖 `tutor_robot.png`。
> 二者暖/冷区分鲜明、卡通 3D 可爱、白底易抠——证明生图流水线可产出生产级素材。落地时经 `post-assets.py` 去底 512px 后入 `generated/`。

---

> **请你 review 本方案**（尤其：① F2 登录+工作台作为首个视觉里程碑先做？② 上面 2 张 3D 角色样张风格是否 OK、是否照此批量生成全套素材？③ 教师端是否严格对齐 `教师后端界面2.jpg`？④ 暗色/i18n 本轮不做是否认可？）。确认后我按修订版 F1→F2 开始实施，**做通即发你看**，再继续后续阶段与后端。
