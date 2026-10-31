##### AI小海龟·结对编程 —— UI 生图 + Codex 全栈开发交付包

> 用途：**先在 ChatGPT 网页版按本包提示词逐屏生成高保真 UI 参考图 → 再把图 + 对应「Codex 开发规格」交给 Codex 做前后端落地。**
> 主题：**玻璃拟态(Glassmorphism) + 陶瓷瓷片(Ceramic Tile) + 卡通 3D**。AI 结对双角色 = 卡通 3D 可爱风。
> 视觉基线来自目录内 5 张参考图：`登录界面.png`(Pixel Rise 玻璃橙) / `学生用户界面.png`(pastel 瓷片 bento) / `UI瓷片区样式.jpg`(瓷片语言) / `教师后端界面.jpg`(浅色可视化大屏) / `教师后端界面2.jpg`(学院预警系统)。
> 功能基线来自课题书：计算思维六维(抽象/分解/建模/算法设计/验证优化/迁移) · 结对编程双角色(操作者/审看者·定期交换) · 三阶段引导(问题分析→程序设计→调试优化) · 支架渐撤 · 过程性评价与数字画像 · 教师监管与高危预警 · 未成年人数据安全。

---

## 0. 怎么用（两步走）

**第一步 · ChatGPT 网页版出图**（本包 §3/§4 每屏一段 `ChatGPT 生图提示词`）
1. 先发 **§2 的「风格锚定图」提示词**，生成一张统一风格样板；确认玻璃/瓷片/配色/3D 质感满意。
2. 之后**逐屏**发该屏提示词，并在每条开头附一句：「延续上一张的玻璃拟态+瓷片+卡通3D风格与配色，生成如下界面」，保证多张一致。
3. 一屏可多次重掷取优；桌面屏用 16:9，移动屏用 9:16 或三联竖图。
4. 关键：让模型**少渲染大段中文正文**（用极简标签/占位），只在需要处放中文标签，避免文字糊化。

**第二步 · Codex 全栈落地**（本包 §3 每屏一段 `Codex 开发规格`）
1. 把该屏 ChatGPT 生成图 + 该屏 `Codex 开发规格` 一起给 Codex。
2. Codex 遵循平台既有约定：前端 Vue3+TS+Vite+Pinia、`@` 别名；后端 FastAPI，`/api` 前缀 + `{code,message,data}` 信封 + JWT；设计令牌走 `web/src/styles/tokens.css`。
3. 生图产出的 3D 角色/图标 PNG 落 `web/src/assets/generated/`，经 `assets.ts` 注册表覆盖内置 SVG（见 `Codex优化路线-生图与元素优化.md`）。

---

## 1. 统一设计系统（样式圣经 · ChatGPT 与 Codex 共用）

> 两个下游工具都以此为准，保证「出图」与「代码」同源一致。

### 1.1 三大材质语言
- **玻璃(Glass)**：半透明白 `rgba(255,255,255,.55–.7)` + `backdrop-filter: blur(18–24px)` + 1px 高光内描边 `rgba(255,255,255,.6)` + 柔和投影 + 圆角 22–28。用于：顶部导航胶囊、分组面板、悬浮卡、弹窗、AI 面板。
- **瓷片(Ceramic Tile)**：圆角柔和卡片(半径 22–28) + 淡雅 pastel 渐变填充 + 左上/居中一枚 **glossy 3D 图标** + 标题 + 小字副标题 + 迷你动作胶囊；柔长阴影、悬浮微抬 3px。bento 网格排布。
- **卡通 3D**：glossy 黏土/3D 渲染、圆润可爱、柔和投影、儿童友好、无错误文字水印。

### 1.2 配色（学生端暖、教师端冷，明确区分）
| | 学生端 | 教师端 |
|---|---|---|
| 主/强调 | 暖橙 `#F5A623`(turtle) | 专业蓝 `#3B82F6` |
| 辅助 | 教育蓝 `#6C9CE9` · 紫 `#7C6BF0` · 青绿 `#2EC4B6` | 青绿 `#2EC4B6` |
| pastel | 薰衣草/蜜桃/薄荷/粉 | 浅蓝灰 |
| 背景 | 奶油 `#FFF8F0` / 浅灰玻璃 `#ECEFF4` | 浅蓝灰 `#F4F7FB` + 白卡 |
| 墨/文本 | `#1F2A44` | `#1F2A44` |

### 1.3 排版与圆角
- 字体：Inter / 系统无衬线；登录页 hero 允许**像素风 wordmark**（呼应 Pixel Rise）。
- 圆角：`sm 12` / `md 16` / `lg 22` / `pill 999`。字号：hero 28–40 / 标题 18–22 / 正文 14–16 / 辅助 12。

### 1.4 组件语法
- 导航=玻璃胶囊；筛选=pill 组；按钮=实心橙(主)/玻璃灰(次)；输入=44px 高圆角描边；徽章/severity=小 pill(高危红/中危黄/提示灰)；进度=环形/条形；图表=ECharts(雷达/漏斗/柱/环/折线)。

### 1.5 吉祥物与 AI 双角色
- **吉祥物**：🐢 小海龟（绿身 + 橙卫衣 + 圆眼镜 + 抱笔记本）。
- **AI 双角色（卡通 3D 可爱风）**：
  - **小龟(turtle)** = 操作者/驾驶员引导，活泼鼓励；绿身橙卫衣圆眼镜 + 耳机，竖大拇指。
  - **智伴(reviewer)** = 审看者/领航员，沉稳审查；白蓝小机器人/书本精灵，戴小眼镜 + 放大镜 + 清单。
  - 红线：**智伴禁代写**——只给思路/伪代码/≤3 行示例，不给完整可运行答案。

---

## 2. 生成顺序与一致性锚

**先生成这张「风格锚定图」**（ChatGPT 网页版）：

```
Create a high-fidelity UI style board (16:9) for a children's AI programming-learning web app "AI Turtle · Pair Programming".
Theme: glassmorphism + ceramic soft-tile + cute 3D-clay. Show on one board: a frosted-glass nav pill, three ceramic bento tiles each with a glossy 3D icon (a blue python snake, a "C++" glowing block, a turtle mascot), a set of 6 pastel gradient badge tiles, two cute 3D cartoon characters (a green turtle programmer in an orange hoodie with round glasses giving a thumbs-up; a friendly white-blue little robot holding a magnifier and a checklist), color chips (#F5A623 orange, #6C9CE9 edu-blue, #7C6BF0 purple, #2EC4B6 teal, cream/light-glass background). Soft long shadows, rounded 22-28px, backdrop blur, dribbble-quality, clean, child-friendly. UI labels in Simplified Chinese, minimal text.
中文校对：一张风格样板图——玻璃导航胶囊、3枚 glossy 3D 图标瓷片、6枚 pastel 六维徽章、两个卡通3D角色(小海龟程序员+小机器人)、配色色卡；玻璃拟态+瓷片+卡通3D，圆角柔阴影，界面文字简体中文、极简。
```

确认满意后，逐屏生成（每屏见 §3；每条前加「延续上一张风格与配色」）。**建议顺序**：登录(学生→教师) → 学生工作台 → IDE → AI 面板 → 设计工具 → 思维成长 → 作品管理 → 教师工作台 → 班级任务 → 数据大屏 → 移动端 → §4 双角色立绘。

---

## 3. 逐屏交付（ChatGPT 生图提示词 + Codex 开发规格）

### S1 · 学生登录/落地页

#### 🎨 ChatGPT 生图提示词

> 用途：把下面【英文段】完整粘进 ChatGPT 网页版（GPT-4o / DALL·E 图像），生成 **1 张 16:9 桌面高保真 UI 参考图**。中文段仅供你逐区核对文案，**不要**一起贴给出图模型。

---

##### ENGLISH PROMPT (paste this to generate the image)

A single, complete, high-fidelity **web UI mockup** of a **login / landing page** for a K-12 AI programming-learning platform, **16:9 desktop screenshot**, Dribbble / Behance award-winning quality, ultra-clean, pixel-crisp, soft studio lighting, no photo, no watermark, no gibberish text. Full-bleed browser canvas (no browser chrome).

**Overall style — "Pixel Rise":** warm-and-friendly **glassmorphism + ceramic-tile + cartoon 3D** design language. Background is a soft, airy off-white / light-grey gradient (`#ECEFF4` → `#F6F8FB`) with a very faint warm peach glow in the upper area, subtle blurred pastel color blobs (lavender, mint, peach) floating far behind glass, gentle grain. Everything sits on frosted glass. Rounded corners everywhere (radius 22–28px). Warm orange `#F5A623` is the single dominant accent; secondary tints education-blue `#6C9CE9`, purple `#7C6BF0`, teal `#2EC4B6`, used sparingly.

**Layout (top → bottom):**

1. **Top center — floating glass navigation pill:** a frosted-glass rounded capsule (rgba white .6, backdrop-blur, 1px inner top highlight, soft drop shadow), horizontally centered near the top. Left of the pill: a tiny glossy 3D turtle logo mark. Center: three text nav items **"首页 / 关于 / 帮助"**, the active one "首页" as a small filled orange pill. This nav floats above the content.

2. **Hero — one large centered frosted-glass login card** (the visual anchor, ~440px wide, rounded 26px, translucent white .62, 24px backdrop-blur, crisp 1px inner highlight, big soft ambient shadow, faint colored rim-light). Inside the card, top to bottom:
   - A cute **glossy clay-render 3D cartoon turtle mascot** — green rounded body, tiny orange hoodie, round glasses, hugging a small laptop — sitting/peeking at the top of the card, casting a soft contact shadow. Cheerful, kawaii, kid-friendly.
   - Around the turtle, a few **floating 3D glossy objects**: a small pastel **code block `</>`**, a **twinkling star**, a **gear**, and a **letter/envelope** icon, arranged in a loose orbit, each with soft shadows — playful but not cluttered.
   - A **pixel-art retro wordmark "AI小海龟"** (chunky 8-bit pixel letters in orange + a lighter tint), rendered crisp, as the product logotype. Small clean subtitle line under it: **"结对编程 · 一起学编程"**.
   - A **segmented role toggle** (two tabs inside a small glass track): **"学生"** (active, filled orange pill) and **"教师"** (inactive). Clearly the selected tab is 学生.
   - Below it, a tiny secondary segmented switch: **"账号登录 / 班级码登录"**.
   - **Two rounded input fields** (glass, radius 16, 1px inner stroke, subtle inner shadow, small glossy left icon per field): first field placeholder **"账号 / 班级码"** with a person icon, second field placeholder **"密码"** with a lock icon and a small eye toggle on the right.
   - A tiny right-aligned link **"忘记密码?"** in muted grey.
   - A **full-width primary button "开始编程"** in glossy warm-orange gradient (`#F5A623` → `#FF8C00`), rounded 16, soft orange glow shadow, white bold label, slight 3D sheen.
   - A tiny footer line inside the card bottom, muted grey, small: **"内容由 AI 支持 · 未成年人保护已启用"** with a tiny shield icon.

3. **Behind / around the card:** more far-back floating 3D cartoon elements — a **retro CRT computer** with a smiley pixel face, a couple of drifting **pixel clouds**, a **rocket** or **paper plane**, tiny **sparkles** — all soft, blurred by depth, low-opacity, adding a whimsical "learning adventure" mood without stealing focus.

**Materials & finish:** frosted glass panels with real backdrop blur and specular top edges; ceramic-tile softness on all cards; clay/3D glossy plastic on mascot and floating icons; soft long ambient shadows; cohesive warm-friendly children's-education atmosphere. Balanced negative space, strong central focus on the login card. All UI text in **Simplified Chinese**, short labels only, perfectly legible, no lorem, no distorted glyphs.

**Color palette:** dominant warm orange `#F5A623`; supports education-blue `#6C9CE9`, purple `#7C6BF0`, teal `#2EC4B6`; pastel lavender/peach/mint accents; cream / light-grey glass base `#ECEFF4`. High contrast for readability, cheerful, premium, kid-safe.

Render as a clean flat 2D screenshot of the interface (not a perspective mockup, not a device frame), everything sharp and front-facing.

---

##### 中文逐区校对（仅供核对，勿贴给出图模型）

- **整体基调**：Pixel Rise —— 浅灰/奶油玻璃底 `#ECEFF4`，暖橙 `#F5A623` 单点强调，磨砂玻璃 + 陶瓷瓷片 + 卡通 3D；背景漂浮薰衣草/蜜桃/薄荷的模糊色块与颗粒感。16:9 桌面整屏 UI 图。
- **顶部**：居中悬浮的**玻璃导航胶囊**，左端一枚 glossy 3D 小海龟 logo，中间三项 **首页 / 关于 / 帮助**，「首页」为橙色实心激活态。
- **中央主体（登录玻璃卡，视觉主角，约 440px 宽，圆角 26）**，自上而下：
  1. **3D 卡通小海龟**吉祥物（绿身+橙卫衣+圆眼镜+抱笔记本），在卡片顶部探出，柔和接触阴影。
  2. 海龟周围**漂浮 3D 元素**：代码块 `</>`、星星、齿轮、信封，松散环绕，各带柔影。
  3. **像素风 wordmark「AI小海龟」**（8-bit 橙色像素字），下方副标题 **「结对编程 · 一起学编程」**。
  4. **角色页签**（玻璃分段控件）：**学生**（橙色激活）/ **教师**（未选）。
  5. **登录方式小切换**：**账号登录 / 班级码登录**。
  6. **两个玻璃输入框**：① 占位符 **「账号 / 班级码」**（左侧人像图标）；② 占位符 **「密码」**（左锁图标 + 右眼睛切换）。
  7. 右对齐灰色小链接 **「忘记密码?」**。
  8. **主按钮「开始编程」**，暖橙渐变（`#F5A623`→`#FF8C00`），圆角 16，橙色柔光投影。
  9. 卡片底部小字（灰）：**「内容由 AI 支持 · 未成年人保护已启用」**，前置盾牌小图标。
- **卡片周围远景**：带笑脸的复古 CRT 电脑、像素云、火箭/纸飞机、星光点缀，低透明度、被景深虚化，营造「学习冒险」氛围但不抢焦点。
- **文案红线**：所有界面文字为**简体中文短标签**，清晰无乱码；避免大段中文正文。

> 备注：若需**移动端三联图**，可追加一句英文："Also produce a mobile portrait variant: three stacked phone screens (9:19.5) — (1) role toggle + turtle hero, (2) login inputs + 开始编程 button, (3) class-code login mode — same glass + pixel + cartoon-3D style, single warm-orange accent."

#### 🛠️ Codex 开发规格

##### 学生登录 / 落地页 — Codex 开发规格（screen_id: `login_student`）

> 目标：替换/升级现有 `frontend/src/views/Login.vue`，落地「Pixel Rise 玻璃 + 瓷片 + 卡通 3D」学生登录页，并新增**班级码登录**与**学生/教师角色切换**。严格遵守项目约定：`/api/v1` 前缀、`{code,message,data}` 信封、JWT Bearer、axios 拦截器已 unwrap。所有新文案为简体中文。

### 1. 路由
- 路径：`/login`（沿用现有 `router/index.ts` 中的登录路由；`meta: { public: true }`，`beforeEach` 对已登录 token 直接放行到目标页）。
- 登录成功后跳转：`user.role === 'admin' ? '/admin' : '/'`（与现有 `Login.vue` 行为一致）。
- 已带有效 token 访问 `/login` 时，`onMounted` 检测 `userStore.isLoggedIn`，直接 `router.replace(role==='admin'?'/admin':'/')`。

### 2. 页面结构与组件树
```
LoginView.vue (student login/landing)
├─ <BgDecor/>                     背景层：浅灰玻璃渐变 + 模糊 pastel 色块 + 漂浮 emoji/3D 装饰（pointer-events:none）
├─ <GlassNavPill/>                顶部悬浮玻璃导航胶囊：logo + [首页(active)/关于/帮助]
└─ <LoginGlassCard/>             中央玻璃主卡（视觉主角）
   ├─ <MascotHero/>               3D 小海龟 hero + 漂浮 3D 元素（代码块/星/齿轮/信封）
   ├─ PixelWordmark  "AI小海龟"   像素风 wordmark（图片或纯 CSS 像素字），副标题「结对编程 · 一起学编程」
   ├─ <RoleTabs/>                 分段控件：学生(默认) / 教师
   ├─ <LoginModeSwitch/>          分段控件：账号登录 / 班级码登录
   ├─ <el-form>                   动态表单（随登录方式切换字段与校验）
   │   ├─ 输入①  账号 或 班级码   （prefix 人像图标，clearable）
   │   ├─ 输入②  密码             （type=password, show-password）
   │   └─ 右对齐链接「忘记密码?」
   ├─ <PrimaryButton/>  「开始编程」 橙色渐变主按钮，:loading
   └─ FooterNote  「内容由 AI 支持 · 未成年人保护已启用」（盾牌图标）
```
- 复用现有依赖：Element Plus（`el-form`/`el-input`/`el-button`/`ElMessage`）、`@element-plus/icons-vue`（`User`/`Lock`）、`useUserStore`、`genAsset('mascot_turtle')`。
- 教师端配色区分：当 `RoleTabs` 选中「教师」，主强调色从暖橙切到专业蓝 `#3B82F6`（仅激活态/按钮色变化，不改布局），并把「开始编程」按钮文案改为「进入课堂」，登录成功仍走同一 `/api/v1/auth/login`（后端按账号角色返回真实 role）。

### 3. 关键交互
1. **角色切换 RoleTabs**：`role: 'student' | 'teacher'`（`ref`，默认 `student`）。切换只影响强调色 / 主按钮文案 / 班级码是否可用（教师端隐藏「班级码登录」子切换）。**不**改变真正的鉴权分支——role 以后端返回为准。
2. **登录方式 LoginModeSwitch**：`mode: 'account' | 'classcode'`（默认 `account`，仅学生端出现）。切到 `classcode` 时，输入①占位符变「班级码」、校验规则切换、图标可换为班级图标。
3. **提交**：按钮 `@click` 或表单 `@keyup.enter` 触发 `handleLogin()`：
   - `await formRef.validate()`；不通过则 return。
   - `loading=true`；调用登录（见 §4）；成功 `ElMessage.success('欢迎回来，'+name+'！')` 后 `router.push`；失败 `ElMessage.error(e.message)`；`finally loading=false`。
4. **忘记密码**：`忘记密码?` 点击弹 `ElMessageBox`/轻提示「请联系老师重置密码」（学生端不做自助改密，符合未成年人保护）。
5. **无障碍/键盘**：输入框可 Tab 顺序到按钮；回车提交；按钮 `aria-label`；RoleTabs/ModeSwitch 用 `role="tablist"`。

### 4. 数据与 API 契约（`/api/v1` 前缀 + `{code,message,data}` 信封 + JWT）
- **账号登录（沿用现有）**：`POST /api/v1/auth/login`
  - Req: `{ "username": string, "password": string }`
  - Res: `{ code:200, message, data:{ token: string, user:{ id, username, role:'student'|'admin', real_name?, avatar_url? } } }`
  - 前端：`userStore.login(username, password)` 已封装（写入 `localStorage.token`，返回 `user`）。**优先直接复用**。
- **班级码登录（新增，需后端支持；若后端未就绪则前端灰置该 tab 并提示"即将开放"）**：`POST /api/v1/auth/login-by-class`
  - Req: `{ "class_code": string, "password": string }`（`class_code` 6–8 位字母数字；`password` 为学生个人密码或班级统一密码，按后端约定）。
  - Res: 与账号登录同结构（返回 `token` + `user`）。
  - 后端建议：在 `auth.py` 加此路由，校验班级码存在→定位学生账号→签发 JWT（`sub`=user id），失败返回 `error_response(400,'班级码或密码错误')`。
- **鉴权**：所有后续请求由 `api/index.ts` 请求拦截器自动附 `Authorization: Bearer <token>`；401 时拦截器已重定向 `/login`。
- **前端调用点**：新增班级码方法建议放 `frontend/src/api/auth.ts`（如 `loginByClass(class_code, password)`），与 `authApi.login` 并列；`userStore` 增加对应 action，成功后同样写 token+user。

### 5. 状态设计（加载 / 空态 / 错误 / 无数据）
- **初始/空态**：字段为空 → 主按钮可点但校验拦截，`el-form` 显示「请输入账号/班级码」「请输入密码」。
- **加载态**：`loading=true` → 主按钮 `:loading` 转圈、文案「登录中…」、禁用输入与页签，避免重复提交。
- **错误态**：
  - 校验失败：字段下红字提示（Element Plus 内建）。
  - 网络/401/400：`ElMessage.error(message||'登录失败')`；连续失败 ≥3 次时在卡片底部追加灰色提示「多次失败？请联系老师」。
  - 班级码后端未就绪：捕获 404/501 → 提示「班级码登录即将开放，请用账号登录」并自动切回 `account`。
- **降级/无数据**：吉祥物图片 `genAsset('mascot_turtle')` 加载失败 → `@error` 回退到 emoji 🐢 占位，页面不塌。
- **未成年人保护常驻**：footer「内容由 AI 支持 · 未成年人保护已启用」始终展示，不随状态消失。

### 6. 视觉 / 设计系统落地要点（严格一致）
- **玻璃**：主卡 `background: rgba(255,255,255,.62); backdrop-filter: blur(22px); border:1px solid rgba(255,255,255,.5); border-radius:26px; box-shadow: var(--shadow-lg)` + 1px 顶部高光内描边（`inset 0 1px 0 rgba(255,255,255,.8)`）。导航胶囊同材质、`border-radius:999px`。
- **瓷片/圆角**：统一圆角令牌 `--radius-sm:12 / md:16 / lg:22 / xl:26 / pill:999`（复用现有 `--radius-*`，缺失则补）。
- **配色（学生端）**：暖橙 `#F5A623`（主）+ 教育蓝 `#6C9CE9` + 紫 `#7C6BF0` + 青绿 `#2EC4B6` + pastel + 玻璃底 `#ECEFF4`；主按钮渐变 `linear-gradient(135deg,#F5A623,#FF8C00)`，hover 上抬 2px + 橙色柔光。教师端激活色替换为 `#3B82F6`。
- **卡通 3D**：吉祥物与漂浮元素用现有 `src/assets/generated/` 资源或 emoji 占位（`💻 ⭐ ⚙️ ✉️ 🐢`）+ `filter: drop-shadow` + `float` 关键帧（复用 Login.vue 现有 `@keyframes float`）。
- **像素 wordmark**：优先用生成的像素字图片；无则用 `font-family` 像素字体 + `image-rendering:pixelated` 兜底。
- **背景**：沿用现有渐变动画（`gradientShift`），但整体调更浅、暖橙点缀（Pixel Rise 基调），非高饱和。

### 7. 响应式 / 移动端要点
- **断点**：≥1024 桌面（居中单卡，卡宽 ~440px，背景元素全展示）；768–1023 平板（卡宽 92vw max 440，减少漂浮元素数量）；<768 手机竖屏。
- **移动端**：登录卡撑满 `width: 92vw; max-width:440px; margin:auto`；导航胶囊收窄或折叠为 logo + 汉堡；漂浮 3D 元素降到 2–3 个、透明度更低，禁用重投影以保性能；输入框 `font-size≥16px` 防 iOS 缩放；主按钮 `height:48px` 触控友好。
- **横向溢出**：`overflow-x:hidden` 于页面根；装饰层 `position:absolute; inset:0; pointer-events:none`。
- **减少动效**：`@media (prefers-reduced-motion: reduce)` 关闭 float/gradient 动画。

### 8. 逐条验收点（Definition of Done）
1. 访问 `/login` 渲染 Pixel Rise 玻璃卡：3D 小海龟 hero + 漂浮 3D 元素 + 像素「AI小海龟」wordmark + 玻璃导航胶囊（首页/关于/帮助）。
2. RoleTabs「学生/教师」可切换，激活态强调色正确（学生橙 / 教师蓝），主按钮文案随之变（开始编程 / 进入课堂）。
3. LoginModeSwitch「账号登录/班级码登录」可切换，输入①占位符与校验规则随之更新（教师端隐藏班级码）。
4. 账号登录：合法凭据 → 调 `POST /api/v1/auth/login` → 写入 `localStorage.token` → 按 role 跳 `/admin` 或 `/`，并弹欢迎 toast。
5. 班级码登录：若后端已实现 `POST /api/v1/auth/login-by-class` 则同样成功登录；未实现则优雅降级提示并回退账号登录，无报错崩溃。
6. 校验：空字段提交被拦截并显示中文错误；密码可显隐；回车可提交。
7. 加载态：提交中按钮转圈+禁用，防重复提交；失败弹中文 `ElMessage.error`，连续 3 次失败显示「联系老师」提示。
8. footer「内容由 AI 支持 · 未成年人保护已启用」常驻可见；忘记密码走「联系老师重置」提示，不提供学生自助改密。
9. 吉祥物图加载失败回退 emoji，页面不塌；`prefers-reduced-motion` 下动画关闭。
10. 响应式：桌面/平板/手机三档下布局不横向溢出、卡片自适应、输入与按钮触控友好。
11. 所有网络交互经 axios 实例（自动 Bearer + `{code,message,data}` unwrap）；401 由拦截器统一处理。
12. `npm run build`（vue-tsc 类型检查）通过——作为唯一类型/构建门禁；无 TS 报错方可交付。
13. 所有用户可见字符串为简体中文；配色/圆角/玻璃材质与本规格 §6 令牌一致，全屏视觉与设计系统统一。

---

### S2 · 教师独立登录页(独立入口 /teacher/login)

#### 🎨 ChatGPT 生图提示词

##### ChatGPT 出图提示词（可直接粘贴 · 中英双语）

> 用途：在 ChatGPT 网页版生成 **一张 16:9 桌面高保真 UI 参考图**（教师独立登录页）。先英文稳定出图，再中文校对。关键中文标签已标注；正文用占位/极简标签，避免模型渲染大段中文。

---

### PART 1 — English prompt (for stable rendering)

**A single, complete desktop web-app UI mockup — a professional TEACHER-ONLY sign-in page**, 16:9 landscape, 1920×1080, Dribbble / Behance top-shelf fidelity, crisp pixel-perfect, front-flat view (no perspective tilt), soft studio lighting, generous negative space.

**Overall aesthetic:** Glassmorphism + ceramic-tile cards + cute cartoon 3D (glossy clay render). Calm, cool, professional — this is the **teacher / staff** entrance, deliberately distinct from the warm playful student side. **No warm orange, no game-y badges, no confetti.** Cool, trustworthy, enterprise-education feel.

**Color palette (teacher theme, strictly):** professional blue `#3B82F6` as the primary accent, teal-green `#2EC4B6` as the secondary accent, clean white glass cards, on a light blue-grey background `#F4F7FB` with a very soft cool blue-to-white gradient and faint cyan glow. Text in slate/ink `#1E293B` and muted grey `#64748B`. Keep everything cool-toned; only tiny hints of pastel lavender/mint are allowed.

**Layout — a centered two-column split screen** inside one big frosted-glass card floating on the blue-grey background:

- **LEFT panel (≈52% width) — brand / hero zone:**
  - A frosted-glass panel with a subtle cool-blue gradient wash and a faint dot/grid texture.
  - A cute **cartoon 3D "teacher turtle" mascot** as the hero: a rounded glossy clay green turtle wearing round glasses **and a small professional look — a slate-blue cardigan / tidy collar / a lanyard ID badge**, holding a laptop or a pointer/clipboard, standing on a small glossy 3D podium. Friendly but composed (not jumping/celebrating). Soft long drop shadow beneath.
  - Floating around it: small glossy 3D cartoon elements in cool tones — a shield/lock icon (data isolation), a bar-chart/dashboard tile, a graduation-cap, a key — all clay-rendered, cool blue/teal, gently floating with soft shadows.
  - A pixel-style wordmark logo top-left: **"AI 小海龟"** in a retro pixel typeface (blue), with a tiny turtle glyph.
  - A short headline label (large): **「教师工作台」** and a thin sub-label **「Teacher Console」**.
  - Three tiny glass "trust chips" in a row (pill glass tags) reading: **「数据域隔离」「独立入口」「教师专用」** (small, minimal — do not render long sentences).

- **RIGHT panel (≈48% width) — the sign-in form card:**
  - A clean white frosted-glass ceramic card, rounded corners 24px, 1px inner top highlight stroke, soft shadow, gentle floating lift.
  - Top of the card: a small glossy 3D blue **shield-with-check** icon (teacher / secured), then a title **「教师登录」** and a thin subtitle **「请使用教师工号登录」**.
  - Form fields (glass inputs, rounded 16px, cool-grey borders, blue focus ring):
    - Field 1 — label **「工号 / 教师账号」**, with a small ID-card glyph, placeholder text shown as faint dots/underscore (do NOT render real Chinese sentences inside inputs).
    - Field 2 — label **「密码」**, with a lock glyph and a show/hide eye icon on the right.
  - A row: a small square checkbox with label **「记住工号」** on the left, and a text link **「忘记密码?」** on the right (blue link).
  - A big primary button, full width, solid professional-blue `#3B82F6` → teal gradient, rounded 16px, glossy, label **「进入教师工作台」** (white text). Subtle blue glow shadow under it.
  - Below the button, a thin divider, then a faint one-line note: **「本入口仅限教师 · 学生请前往学生端」** with a small text link **「学生入口 →」** (muted).
  - Bottom-left corner of the card: a tiny footer label **「© AI小海龟 · 结对编程学习平台」** (very small, muted).

**Materials & finish:** frosted translucent white glass (rgba white ~0.6) with 20px backdrop blur, 1px bright inner top-edge highlight, soft diffuse shadows, rounded corners 22–28px everywhere; ceramic-tile softness; the 3D mascot & icons are glossy clay with rounded edges and gentle rim light. Consistent cool professional lighting, no harsh contrast.

**Atmosphere:** trustworthy, calm, focused, "staff portal" — like a premium ed-tech admin sign-in. Clean, airy, high-end.

**Typography:** Inter / clean sans-serif for UI; retro pixel typeface ONLY for the "AI 小海龟" wordmark. All interface text is **Simplified Chinese** (labels only, short). No lorem ipsum, no gibberish, **no misspelled or garbled text**, no watermark.

**Strict don'ts:** no orange/warm colors, no cartoon celebration/game elements, no dark mode, no photo-realistic humans, no busy background, no more than the elements listed, no long paragraphs of text, no broken glyphs.

*(If a portrait / mobile companion is wanted, also render a second narrow phone frame beside it showing the same form stacked vertically — mascot on top, form below.)*

---

### PART 2 — 中文校对说明（逐区中文文案，方便核对）

**整体基调**：冷静专业的**教师端**登录页。玻璃拟态 + 陶瓷瓷片卡片 + 卡通3D。**明显区别于学生端**——不用暖橙、不用游戏化装饰。主色 = 专业蓝 `#3B82F6`，辅色 = 青绿 `#2EC4B6`，白色玻璃卡，浅蓝灰底 `#F4F7FB`。

**布局**：居中「左右分栏」大玻璃卡，漂浮在浅蓝灰渐变背景上。

**左侧（品牌 / hero 区，约 52%）**
- 磨砂玻璃面板 + 冷蓝渐变 + 淡网点纹理。
- 主视觉：**卡通3D「教师版小海龟」**——圆润 glossy 绿龟、圆眼镜，加**教师感元素**（板蓝色开衫 / 整齐衣领 / 挂牌工牌），抱笔记本或拿教鞭/夹板，站在小圆台上，沉稳友好（非蹦跳庆祝），下方柔和长投影。
- 周围漂浮冷色调3D小元素：盾牌/锁（数据隔离）、柱状图/看板瓷片、学位帽、钥匙。
- 左上角像素风 wordmark：**「AI 小海龟」**（蓝色像素字 + 小龟）。
- 大标题标签：**「教师工作台」**，细副标：**「Teacher Console」**。
- 一排三枚玻璃 trust chip（胶囊玻璃标签）：**「数据域隔离」「独立入口」「教师专用」**（小而克制，勿写长句）。

**右侧（登录表单卡，约 48%）**
- 白色磨砂玻璃瓷片卡，圆角 24、顶部 1px 高光内描边、柔和投影、悬浮微抬。
- 卡片顶部：小 glossy 3D 蓝色**盾牌+对勾**图标；标题 **「教师登录」**，副标 **「请使用教师工号登录」**。
- 输入项（玻璃输入框，圆角 16，冷灰描边，蓝色聚焦环）：
  - 字段1 标签 **「工号 / 教师账号」**（工牌图标；占位符用虚点/下划线示意，勿在框内渲染整句中文）。
  - 字段2 标签 **「密码」**（锁图标 + 右侧显隐眼睛）。
- 一行：左侧方框勾选 **「记住工号」**，右侧文字链接 **「忘记密码?」**（蓝色链接）。
- 主按钮（整宽、专业蓝→青绿渐变、圆角16、glossy）：**「进入教师工作台」**（白字），下方淡蓝辉光。
- 按钮下细分割线 + 一行浅色说明：**「本入口仅限教师 · 学生请前往学生端」** + 小链接 **「学生入口 →」**（灰）。
- 卡片左下角极小页脚：**「© AI小海龟 · 结对编程学习平台」**。

**材质**：磨砂半透明白玻璃（白 ~0.6）+ 20px 背景模糊 + 1px 顶部高光 + 柔和投影；圆角 22–28；3D 元素 glossy 黏土质感 + 柔和边缘光。

**氛围**：可信、冷静、专注的「员工/教师门户」，高端 ed-tech 后台登录感。

**字体**：UI 用 Inter/无衬线；仅 wordmark 用像素字。界面文字均为简体中文短标签，**无错字乱码、无水印**。

**红线**：禁暖橙/游戏化/庆祝元素、禁暗色、禁写实真人、禁杂乱背景、禁大段正文、禁乱码字形。

*（可选移动端）另加一张竖屏手机框，同一表单纵向堆叠：上方海龟形象 + 下方表单，冷蓝玻璃风一致。*

#### 🛠️ Codex 开发规格

##### Codex 开发规格 — 教师独立登录页 `/teacher/login`

> 目标：在既有 Vue3 + TS + Vite + Element Plus 前端与 FastAPI 后端上，新增一个**教师专用独立登录入口**，与学生/通用登录页明显区分（冷静专业浅蓝玻璃风）。严格复用现有登录契约（`/api/v1/auth/login`、`{code,message,data}` 信封、JWT 存 localStorage、角色路由守卫）。**关键差异：本页登录成功后仅允许教师/管理员进入，学生账号必须被拒绝。**

---

### 1. 路由

在 `frontend/src/router/index.ts` 的 `routes` 顶层新增（与 `/login` 平级，公开路由）：

```ts
{
  path: '/teacher/login',
  name: 'TeacherLogin',
  component: () => import('@/views/TeacherLogin.vue'),
  meta: { requiresAuth: false, portal: 'teacher' },
},
```

- `beforeEach` 守卫已有逻辑无需改；但**新增一条**：当已登录且访问 `/teacher/login` 时，教师/admin 跳 `/admin`，学生跳 `/`（避免教师入口把学生弹回学生端时体验割裂）。示例：
  ```ts
  else if (to.path === '/teacher/login' && userStore.token) {
    next(userStore.user?.role === 'admin' ? '/admin' : '/')
  }
  ```
- 不改动现有 `/login`（通用登录保留）。`/teacher/login` 是**并列的第二入口**。

---

### 2. 页面结构与组件树（`frontend/src/views/TeacherLogin.vue`，`<script setup lang="ts">`）

```
TeacherLogin.vue (login-page.teacher —— 冷蓝玻璃底)
├── .bg-decoration            背景冷蓝渐变 + 漂浮3D装饰(海龟/盾/看板/学位帽 emoji 或 genAsset)
├── .login-shell (两栏大玻璃卡, flex)
│   ├── .brand-pane (左, ≈52%)          —— hero 品牌区
│   │   ├── .wordmark  「AI 小海龟」像素风 + 小龟
│   │   ├── img.mascot  教师版海龟 3D (genAsset, 缺失则 fallback emoji 🐢)
│   │   ├── h2 「教师工作台」 / .sub 「Teacher Console」
│   │   └── .trust-chips  三枚玻璃胶囊「数据域隔离」「独立入口」「教师专用」
│   └── .form-pane (右, ≈48%)           —— 登录表单卡
│       ├── .form-head (盾牌✓图标 + h1「教师登录」 + p「请使用教师工号登录」)
│       ├── el-form (ref=formRef, :model=form, :rules, @keyup.enter=handleLogin)
│       │   ├── el-form-item[prop=username]  el-input 「工号 / 教师账号」 :prefix-icon=Postcard clearable
│       │   ├── el-form-item[prop=password]  el-input type=password show-password :prefix-icon=Lock
│       │   └── .form-row (el-checkbox「记住工号」 + a.link「忘记密码?」)
│       ├── el-button.primary(full, loading) 「进入教师工作台」
│       ├── el-alert / .role-error (角色不符时展示，见状态)
│       └── .switch-note 「本入口仅限教师 · 学生请前往学生端」 + router-link /login 或 / 「学生入口 →」
└── .footer 「© AI小海龟 · 结对编程学习平台」
```

- **复用**：`useUserStore`、`ElMessage`、`@element-plus/icons-vue`（`Postcard`/`Lock`/`View`）、`genAsset('mascot_turtle')`（作为教师海龟占位，可后续替换独立教师版素材 key `mascot_turtle_teacher`）。
- 表单字段名保持 `username`/`password`（后端 `LoginRequest` 即 `username`+`password`，「工号」只是 UI 文案，值仍进 `username`）。

---

### 3. 关键交互

1. **提交登录** `handleLogin()`：
   - `formRef.validate()`；`loading=true`。
   - 调 `userStore.login(form.username, form.password)`（现成方法，命中 `POST /api/v1/auth/login`）。
   - **角色闸门（本页核心差异）**：拿到 `user` 后判断 `user.role`：
     - `admin`（或未来的 `teacher`）→ `ElMessage.success('欢迎回来，教师！')`，`router.push('/admin')`。
     - 其它（`student`）→ **立即 `userStore.logout()` 清 token**，展示行内错误「该账号非教师账号，请从学生入口登录」，并给「学生入口 →」链接。**不得放行进入教师工作台。**
   - `catch` 走 `e.message`（用户名/密码错误、账号禁用等由后端 `error_response` 提供）。
   - `finally` `loading=false`。
2. **记住工号**：勾选后把 `username` 存 `localStorage['teacher_last_username']`，页面挂载时回填；不存密码。
3. **回车提交**：`@keyup.enter="handleLogin"`。
4. **忘记密码**：`忘记密码?` 暂为 `ElMessage.info('请联系管理员重置密码')`（无独立接口时的占位；有接口后接 `/api/v1/auth/...`）。
5. **学生入口链接**：`router-link` 到 `/login`（通用登录）或直接 `/`。

---

### 4. 状态设计（加载 / 空态 / 错误 / 无数据）

- **加载态**：按钮 `:loading="loading"`，文案切「登录中...」，表单禁用输入（`:disabled="loading"`）。
- **空态 / 校验**：`rules` 要求 `username`、`password` 必填；未填 blur 触发 Element Plus 行内校验提示（「请输入工号」「请输入密码」）。
- **错误态**：
  - 网络/凭证错误：`ElMessage.error(e.message)`（401→「用户名或密码错误」，403→「账号已禁用」，均由后端返回）。
  - **角色不符错误**（学生登教师入口）：页面内 `.role-error` 红框常驻提示 + 引导到学生入口，且已 `logout()`。这是本页专属状态，不可复用通用 toast 一闪而过。
  - 401 全局拦截：`api/index.ts` 拦截器在 401 时会跳 `/login`；本页登录接口本身 401 已被 `authApi.login` 以 `{code:401}` 形式返回（非 axios reject），故不会误触发全局跳转——保持现状即可。
- **无数据**：登录页无列表数据，无需空数据插画。

---

### 5. 数据与 API 契约（遵循 `/api` 前缀 + `{code,message,data}` 信封 + JWT）

**复用现有接口，无需新增后端即可上线：**

- `POST /api/v1/auth/login`
  - 请求：`{ "username": string, "password": string }`
  - 成功：`{ code:200, message, data:{ token:string, user:{ id, username, role, real_name, avatar_url } } }`
  - 失败：`{ code:401, message:"用户名或密码错误" }` / `{ code:403, message:"账号已禁用" }`
  - 前端经 axios 响应拦截器解包为 `res.data`（即 `{code,message,data}`），`userStore.login` 读 `res.code===200`。
- JWT：`data.token` 存 `localStorage['token']`；后续请求由请求拦截器加 `Authorization: Bearer <token>`。
- `GET /api/v1/auth/current`（可选，用于刷新态回显教师名）。

**建议的后端加固（可选，本迭代非必须；若做需遵循三约定：`/api/v1` 前缀 + 信封 + auth 依赖）：**

- 方案A（推荐，最小改动）：新增 `POST /api/v1/auth/teacher-login`，服务端在校验密码后**强制校验 `user.role in ('admin','teacher')`**，非教师直接 `error_response('该账号非教师账号', 403)`。前端本页改调此接口，避免「先登录再前端登出」的空窗。
- 方案B：沿用通用 `/login`，仅前端做角色闸门（如第 3 节）。**MVP 用方案B 即可**，方案A 作为安全增强项列入 backlog。
- 说明「数据域隔离」：教师登录后所有管理接口（`/api/v1/admin/*`、`/classes`、`/assignments`、`/monitor`）已由 `require_admin` 依赖保护，本页只是入口区分，真正的数据隔离由后端 RBAC 依赖保证——文案「数据域隔离」对应此机制，不是本页新增逻辑。

---

### 6. 响应式 / 移动端要点

- **断点**：`≥1024px` 左右两栏；`768–1023px` 左品牌区收窄或转为顶部横幅；`<768px` **改竖屏单列**——隐藏左侧 hero 大图（或仅保留顶部小海龟 + wordmark），表单卡撑满 `min(92vw, 400px)` 居中。
- 大玻璃卡 `max-width: 960px; width: 92vw;` 居中；小屏 `flex-direction: column`。
- 输入 `size="large"`，触控目标 ≥44px；按钮整宽 48px 高。
- `100dvh` 而非 `100vh`（移动端地址栏抖动）；`overflow: hidden` 防装饰溢出滚动。
- 尊重 `prefers-reduced-motion`：关闭漂浮动画。

---

### 7. 设计系统落地（与全屏一致，教师冷色变体）

- 底色 `#F4F7FB`，主强调 `#3B82F6`，辅 `#2EC4B6`；**禁用**学生端暖橙 `#F5A623` 及游戏化元素。
- 玻璃卡：`background: rgba(255,255,255,.62); backdrop-filter: blur(20px); border:1px solid rgba(255,255,255,.5); border-radius: 24px; box-shadow: var(--shadow-lg);` + 顶部 1px 高光内描边（`inset 0 1px 0 rgba(255,255,255,.7)`）。
- 主按钮渐变：`linear-gradient(135deg,#3B82F6 0%,#2EC4B6 100%)`，圆角 16，hover `translateY(-2px)` + 蓝辉光 `0 6px 20px rgba(59,130,246,.4)`。
- 圆角令牌沿用 `var(--radius-md/lg/xl)`；若无教师专用 CSS 变量，可在本组件 `scoped` 内定义局部 `--tc-primary:#3B82F6` 等，勿污染全局学生端 token。
- wordmark 用像素字（可 `font-family` 内联 or SVG 文本），仅限「AI 小海龟」。
- 所有文案简体中文；`lang="zh-CN"`。

---

### 8. 逐条验收点（Acceptance Checklist）

1. [ ] 访问 `/teacher/login` 渲染教师登录页，**整体冷蓝专业风**，无任何暖橙/游戏化元素，与 `/login`（学生/通用）视觉明显不同。
2. [ ] 左侧 hero 显示教师版海龟 3D + wordmark「AI 小海龟」+ 标题「教师工作台」+ 三枚 trust chip「数据域隔离/独立入口/教师专用」。
3. [ ] 右侧表单含：工号/教师账号、密码（可显隐）、记住工号、忘记密码、主按钮「进入教师工作台」、学生入口链接。
4. [ ] 未填字段点击登录 → Element Plus 行内必填校验提示，且不发请求。
5. [ ] 输入错误密码 → toast「用户名或密码错误」；按钮 loading 结束后可重试。
6. [ ] 用 **管理员账号**（如 `admin/admin123`）登录 → 成功 toast，跳转 `/admin`，token 已存 localStorage。
7. [ ] 用 **学生账号**（如 `xiaoma/123456`）登录 → **被拒绝**：清除 token、页面内红框「该账号非教师账号，请从学生入口登录」、提供「学生入口 →」链接，**绝不进入教师工作台**。
8. [ ] 勾选「记住工号」再刷新 → 工号自动回填；密码不回填。
9. [ ] 已登录（有 token）状态下再访问 `/teacher/login` → 按角色重定向（admin→`/admin`，student→`/`），不停留。
10. [ ] 移动端 `<768px`：转竖屏单列，表单可用、按钮整宽、无横向滚动；`prefers-reduced-motion` 下无漂浮动画。
11. [ ] 回车键可提交登录。
12. [ ] 所有请求走 `/api/v1/auth/login`，返回信封 `{code,message,data}` 被正确解包；`Authorization: Bearer` 头随后续请求带上。
13. [ ] `npm run build`（vue-tsc）**零类型错误**（项目唯一类型检查门禁）。
14. [ ] 页面文案全为简体中文，无乱码；Console 无报错。

---

### S3 · 学生工作台首页(瓷片区 bento)

#### 🎨 ChatGPT 生图提示词

##### ChatGPT 出图提示词 —— 学生工作台首页(瓷片区 bento)

> 用法：整段复制到 ChatGPT 网页版（GPT-4o / DALL·E-3 出图）。先跑英文段稳定构图，中文段用于逐区核对界面文案。一次只生成 **一张 16:9 桌面高保真 UI 参考图**。

---

### ① English generation prompt (paste first)

**A single full-screen, 16:9 desktop web UI mockup — a high-fidelity student dashboard / home workspace** for a K-12 AI programming-learning platform called "AI 小海龟 · 结对编程" (AI Little-Turtle · Pair Programming). Dribbble / Behance award-winning quality, crisp, pixel-perfect, realistic soft studio lighting, not a photo — a rendered product UI.

**Overall style — MUST stay consistent across the whole screen:** Glassmorphism + ceramic-tile bento cards + cute cartoon 3D (glossy clay / soft-body render). Frosted-glass panels: translucent white `rgba(255,255,255,0.6)`, backdrop blur 18–24px, 1px inner top highlight stroke, soft long shadows, rounded corners 22–28px. Ceramic tiles: soft rounded cards with pastel gradient fills, one glossy 3D icon top-left or centered, gentle long drop shadow, subtle hover lift. Kid-friendly, rounded, warm, no gibberish text watermarks, no broken letters.

**Background:** a soft cream / light-gray glass base `#ECEFF4` with faint floating pastel blobs (lavender, peach, mint, pink) and a few tiny out-of-focus bokeh dots. Airy, plenty of breathing space, generous whitespace, calm and premium.

**Color palette (student side, warm & playful):** warm orange `#F5A623` (primary accent), education blue `#6C9CE9`, purple `#7C6BF0`, teal-green `#2EC4B6`, plus pastel tints (lavender / peach / mint / pink). Cream & light-gray glass base `#ECEFF4`. Inter / rounded sans-serif typography.

**Layout — regions from top to bottom:**

1. **Top glass navigation capsule (full width):** a floating frosted-glass pill bar. Left: 🐢 turtle logo mark + wordmark "小海龟". Center: 3 nav items — an active pill "工作台" (highlighted with orange), then "编程", "思维成长". Right side of the bar: two small glass stat chips — "今日用时 42分钟" and "成长指数 780", plus a round cartoon-3D student avatar. Rounded 999 pill, 1px highlight stroke, soft shadow.

2. **Hero welcome card (wide glass panel, spanning the left ~65%, below nav):** a large frosted-glass card. On the LEFT: greeting text "你好，小码同学 👋" as a big rounded heading, a smaller subtitle line, and 3 inline mini stat blocks — "今日用时 42分钟", "运行次数 18次", and a small label "成长指数". On the RIGHT of the same card: a **cute cartoon 3D little turtle mascot** — green body, wearing an orange hoodie, round glasses, hugging a laptop, glossy clay render, waving hello, soft shadow, sitting slightly raised. Next to the mascot, a **circular ring progress indicator (环形进度)** showing "780 / 成长指数" with an orange-to-purple gradient stroke, ~72% filled.

3. **Bento tile grid (below hero, fills the rest of the screen):** a responsive bento grid of soft ceramic pastel tiles, each = pastel gradient fill + one glossy 3D icon + a bold Chinese title + a small subtitle + a tiny action pill. Tiles:
   - **Python** — mint-green gradient tile, glossy 3D Python-snake / cube icon, title "Python", subtitle "开始编程", small pill "进入 →".
   - **C++** — blue gradient tile, glossy 3D "C++" cube / plus-plus block icon, title "C++", subtitle "开始编程".
   - **C** — lavender gradient tile, glossy 3D "C" letter block icon, title "C 语言", subtitle "开始编程".
   - **AI 双导师 (AI dual mentors)** — a WIDER peach/orange gradient tile featuring TWO cute cartoon-3D characters side by side: a little turtle (driver, cheerful) and a small blue-white robot / book-sprite (navigator, calm reviewer). Title "AI 双导师", subtitle "小龟 + 智伴 陪你写代码".
   - **思维成长 (thinking growth)** — purple gradient tile, glossy 3D brain / radar icon, title "思维成长", subtitle "6 维能力雷达", a tiny radar-chart glyph.
   - **我的作品 (my works)** — pink gradient tile, glossy 3D folder / gallery icon, title "我的作品", subtitle "12 个项目".
   - **我的任务 (my tasks)** — orange gradient tile, glossy 3D checklist / clipboard icon, title "我的任务", subtitle "3 个待完成", a small red notification dot.
   - **模板 (templates)** — teal gradient tile, glossy 3D grid / template icon, title "模板", subtitle "从模板开始".

**Materials & finish:** every card has that frosted-glass or glossy-ceramic quality, 1px inner highlight, soft realistic long shadow, subtle inner glow, gentle color bleed between pastel tiles. The 3D icons and mascots read as soft glossy clay toys. Cohesive, cheerful, premium ed-tech dashboard.

**Text rendering rule:** render UI text as clean, short, correctly-spelled Simplified Chinese labels ONLY (the exact labels listed above). Do NOT invent paragraphs of body text; keep everything as short tags, numbers, and titles. No lorem ipsum, no garbled characters, no English filler in the UI.

**Composition:** balanced bento grid, aligned to a soft 12-column feel, clear visual hierarchy (nav → hero → tiles), consistent corner radii and shadow language everywhere. 16:9, desktop resolution, centered, no browser chrome, no cursor.

---

### ② 中文校对（逐区文案核对，用于比对出图）

- **顶部玻璃导航胶囊**：左 🐢 + 「小海龟」；中「工作台(选中·橙)｜编程｜思维成长」；右侧玻璃小胶囊「今日用时 42分钟」「成长指数 780」+ 圆形卡通头像。
- **Hero 欢迎卡（磨砂玻璃大卡，占左约 2/3）**：左侧「你好，小码同学 👋」大标题 + 副标题一行；三枚迷你数据「今日用时 42分钟 / 运行次数 18次 / 成长指数」。右侧：卡通 3D 小海龟（绿身+橙卫衣+圆眼镜+抱笔记本+挥手），旁边一个**环形进度**「780 · 成长指数」橙紫渐变、约 72%。
- **瓷片 bento 网格**（每片 = pastel 渐变 + glossy 3D 图标 + 标题 + 副标题 + 迷你动作胶囊）：
  - Python（薄荷绿）「Python · 开始编程 · 进入→」
  - C++（蓝）「C++ · 开始编程」
  - C（薰衣草）「C 语言 · 开始编程」
  - AI 双导师（蜜桃橙，加宽，含两只 3D 角色：小龟驾驶员 + 蓝白小机器人/书本精灵领航员）「AI 双导师 · 小龟+智伴 陪你写代码」
  - 思维成长（紫）「思维成长 · 6 维能力雷达」+ 迷你雷达图
  - 我的作品（粉）「我的作品 · 12 个项目」
  - 我的任务（橙）「我的任务 · 3 个待完成」+ 红点角标
  - 模板（青绿）「模板 · 从模板开始」
- **背景**：奶油/浅灰玻璃底 `#ECEFF4` + 漂浮 pastel 光斑（薰衣草/蜜桃/薄荷/粉）。整体留白充足、圆角与阴影语言全屏统一。

> 移动端可选：如需竖屏，改为「一张 9:16 竖屏移动端 UI」或「三联竖屏图（首屏 hero / 瓷片滚动 / 任务详情）」，导航折叠为底部玻璃 TabBar（工作台/编程/思维/我的），瓷片改为 1–2 列。

#### 🛠️ Codex 开发规格

##### Codex 开发规格 —— 学生工作台首页(瓷片区 bento) `StudentHome.vue`

### 0. 技术栈与约定（必须遵守）
- Vue 3 `<script setup>` + TypeScript + Vite + Element Plus。
- 所有请求走 `/api` 前缀，经 axios 拦截器解包为 `{ code, message, data }`（见 `frontend/src/api/index.ts`，用 `UnwrappedApi`，直接读 `res.code` / `res.data`）。
- JWT Bearer 由请求拦截器自动附加（`localStorage.token`）；401 自动跳 `/login`。
- 数据访问统一走 `frontend/src/services/mock.ts`（真实后端优先 + localStorage 回退），首页新增取数方法也放这里，视图对数据来源无感知。
- 界面文案全部简体中文；设计 token 严格套用设计系统（玻璃/瓷片/卡通3D，圆角 sm12/md16/lg22/pill999，色板：橙`#F5A623`/蓝`#6C9CE9`/紫`#7C6BF0`/青绿`#2EC4B6`/底`#ECEFF4`）。

### 1. 路由
- 复用现有学生首页路由 `path: '/'`（`router/index.ts`，`meta: { role: 'student' }`，`beforeEach` 已按 `userStore.token` 守卫）。
- 组件文件：`frontend/src/views/student/StudentHome.vue`（若已存在 IDE 为首页，则新增此工作台为 `/` 首页，`/ide` 迁移原 IDE，或按现有结构挂为 `name: 'student-home'`）。
- 瓷片点击导航目标：
  - Python/C++/C → `/ide?lang=python|cpp|c`（编程页 Monaco 预置语言）。
  - AI 双导师 → `/ide?ai=1`（打开小龟/智伴面板）。
  - 思维成长 → `/thinking`。
  - 我的作品 → `/works`（若未建则占位路由 + 空态）。
  - 我的任务 → `/tasks`。
  - 模板 → `/templates`（若未建则占位）。

### 2. 页面结构与组件树
```
StudentHome.vue
├─ <GlassNavBar>                      顶部玻璃导航胶囊（fixed / sticky）
│   ├─ Logo(🐢 + 小海龟)
│   ├─ NavItems [工作台*|编程|思维成长]   * = active，router-link，active 橙高亮
│   └─ NavStats
│       ├─ StatChip 今日用时 {todayMinutes}分钟
│       ├─ StatChip 成长指数 {growthIndex}
│       └─ UserAvatar（下拉：个人/退出登录）
├─ <HeroWelcomeCard>                  磨砂玻璃大卡
│   ├─ HeroText 你好，{nickname} 👋 + 副标题
│   ├─ HeroMiniStats [今日用时 / 运行次数 / 成长指数]
│   └─ HeroMascot（3D 小海龟图 assets/generated/）+ <RingProgress :value="growthIndex" :max="1000"/>
└─ <BentoGrid>                        瓷片网格
    └─ v-for <BentoTile
          :icon :title :subtitle :gradient :badge?
          @click="go(tile.to)"/>
       瓷片配置数组 tiles[]（见 §4 数据）
```
- 复用/新建可复用子组件：`GlassNavBar.vue`、`BentoTile.vue`、`RingProgress.vue`（SVG 环形，橙→紫渐变 stroke，`stroke-dasharray` 动画）、`StatChip.vue`。
- 3D 素材：小海龟 hero、双导师角色、各语言 glossy 图标放 `src/assets/generated/`（可用 `.imggen/batch_gen.py` 生成占位 PNG，先用 emoji/纯色占位不阻塞开发）。

### 3. 关键交互
- 瓷片：hover 微抬（`transform: translateY(-4px)` + 阴影加深，`transition .2s`）、focus-visible 键盘可达、点击 `router.push`。
- 导航 active 态由当前路由计算；stat chip hover 显示 tooltip（如「今日运行 18 次，成功率 89%」）。
- RingProgress 进入视口后 0→value 缓动动画（`requestAnimationFrame` 或 CSS）。
- 「我的任务」瓷片 badge 显示待办数 `pendingTasks`，>0 时红点角标。
- 响应式：瓷片网格 CSS Grid `repeat(auto-fill, minmax(220px, 1fr))`，AI 双导师瓷片 `grid-column: span 2`（窄屏降为 span 1）。

### 4. 数据与 API 契约（`/api` 前缀 + `{code,message,data}` 信封 + JWT）
首页聚合数据，优先复用现有端点，缺失的以 mock 回退：

- **成长/用时/运行/成功率** → `GET /api/v1/thinking/summary?user_id={me}`
  已存在（见 `mock.ts` 的 `getThinkingSummary`）。返回 `data`: `{ runs, errors, fixes, success_rate, minutes, ct_scores{decompose,abstract,pattern,debug}, ... }`。
  映射：`todayMinutes = data.minutes`；`runCount = data.runs`；`growthIndex` = 由前端按公式合成（如 `Math.round(success_rate*10 + runs*2 + Σct_scores)`，上限 1000）或后端新增字段。
- **待办任务数** → `GET /api/v1/my/assignments`（已存在，见 `api/student.ts`）。
  返回 `data: Assignment[]`；`pendingTasks = data.filter(a => a.status !== 'done').length`；「我的任务」副标题「{n} 个待完成」。
- **我的作品数（可选）** → `GET /api/v1/my/works`（若后端未实现则 mock 回退返回 `{ count: 0, items: [] }`，副标题显示「暂无作品，去创作 →」）。
- **用户昵称/头像** → `userStore`（现有 `stores/user.ts`），`nickname = userStore.user?.nickname ?? '小码同学'`。
- 新增聚合建议：可在 `mock.ts` 增 `getHomeSummary(user_id)`，内部并发 `Promise.allSettled` 上述三个请求，任一失败走各自回退，返回统一 `{ todayMinutes, runCount, growthIndex, pendingTasks, worksCount, ctScores }`，视图只调这一个方法。

响应信封示例：
```json
{ "code": 0, "message": "ok",
  "data": { "runs": 18, "minutes": 42, "success_rate": 89,
            "ct_scores": { "decompose": 72, "abstract": 65, "pattern": 70, "debug": 80 } } }
```

### 5. 状态设计（加载 / 空态 / 错误 / 无数据）
- **加载**：hero 数字与瓷片 badge 用玻璃质感 skeleton（Element Plus `el-skeleton` 或自绘 shimmer），RingProgress 显灰环。首屏骨架 ≤ 首个请求返回。
- **无数据**：`growthIndex=0` → 环显 0% + 文案「开始你的第一次编程 →」；`pendingTasks=0` → 「太棒了，任务都完成啦 🎉」；`worksCount=0` → 「暂无作品，去创作 →」。
- **错误/断网**：`mock.ts` 回退到 localStorage 或默认零值，页面正常渲染 + 顶部一次性轻提示「离线演示数据」；不得白屏。
- **未登录**：路由守卫已拦截跳 `/login`（无需页面内处理）。

### 6. 响应式 / 移动端要点
- 断点：`≥1200px` 桌面（hero 左文右图，瓷片 3–4 列）；`768–1199px` 平板（瓷片 2 列，AI 瓷片 span 2）；`<768px` 移动（导航折叠为底部玻璃 TabBar「工作台/编程/思维/我的」，hero 竖向堆叠：文案在上、小海龟+环形在下，瓷片 1–2 列，stat chips 移入 hero）。
- 触摸目标 ≥ 44px；瓷片 hover 效果在触屏降级为点击态。
- 玻璃 `backdrop-filter` 加 `-webkit-` 前缀；低端设备可用 `@supports not (backdrop-filter: blur())` 回退为半透明纯色。

### 7. 验收点（逐条）
1. `/` 登录后渲染工作台，未登录跳 `/login`。
2. 顶部玻璃导航含 工作台(active·橙)/编程/思维成长 三项 + 右侧「今日用时/成长指数」两枚玻璃 chip + 头像下拉（含退出登录）。
3. Hero 卡显示真实昵称问候、今日用时/运行次数/成长指数三项，且数值来自 `/api/v1/thinking/summary`（可断网验证走回退零值不白屏）。
4. RingProgress 数值 = 成长指数，进入视口有 0→value 动画，`max=1000`。
5. 瓷片齐全（Python/C++/C/AI双导师/思维成长/我的作品/我的任务/模板），每片含 3D 图标 + 标题 + 副标题；AI 双导师瓷片加宽含双角色。
6. 「我的任务」副标题待办数来自 `/api/v1/my/assignments`，>0 显红点。
7. 各瓷片点击跳转到对应路由（Python→`/ide?lang=python` 等），键盘可聚焦+回车触发。
8. 加载有 skeleton；`growthIndex/pendingTasks/worksCount` 为 0 时显对应空态文案。
9. 全部请求带 `Authorization: Bearer`，读取 `res.data`（信封已解包），无直接读 `res.body`。
10. 三个断点布局正确：桌面/平板/移动（移动端底部 TabBar + hero 竖向堆叠 + 瓷片 1–2 列）。
11. 视觉一致性：全屏统一圆角(22–28)、玻璃 1px 高光内描边、柔和长阴影、pastel 渐变瓷片、hover 微抬；配色符合学生端色板。
12. `npm run build`（vue-tsc）通过，无类型错误（提交前必须跑）。

---

### S4 · 学生 IDE 编程页(双模+三语言+海龟绘图)

#### 🎨 ChatGPT 生图提示词

##### ChatGPT 出图提示词（复制到 ChatGPT 网页版，选 16:9 / 1920×1080）

---

### PART 1 — English prompt (for stable, high-fidelity generation)

A single, complete **16:9 desktop web app UI mockup** — a **kids' AI pair-programming coding IDE** for middle-school students, named "AI 小海龟 · 结对编程". Dribbble / Behance top-shelf quality, ultra-clean, pixel-crisp, soft realistic shadows, no browser chrome, no window frame, full-bleed app screen.

**Overall visual language:** fuse three styles consistently across the whole screen — (1) **Glassmorphism**: frosted translucent white panels rgba(255,255,255,0.6), backdrop-blur, 1px inner top highlight stroke, soft long drop shadows, rounded corners 22–28px; (2) **Ceramic tile cards**: rounded soft pastel-gradient tiles with a glossy 3D clay icon top-left; (3) **Cartoon 3D**: glossy clay-rendered rounded cute mascots, child-friendly, soft studio shadows, NO text watermark on the 3D objects. Warm education palette: orange **#F5A623**, education blue **#6C9CE9**, purple **#7C6BF0**, teal **#2EC4B6**, pastel lavender/peach/mint, on a cream + light-grey glass background **#ECEFF4**. Font: Inter / clean geometric sans. UI microtext is **Simplified Chinese**.

**Layout — top to bottom, left to right:**

1. **Top project bar (frosted glass strip, full width, ~64px):** left side a rounded pill dropdown labeled "🐢 我的作品 ▾" (project selector), then a "＋ 新建" ghost button. Center: a **cloud-status chip** "☁ 已保存到云端 · 刚刚" in soft teal with a tiny glossy 3D cloud icon (default state = cloud). Right side: three small glass icon-buttons "⬇ 下载 · ⬆ 上传 · 💾 保存", then a round student avatar. Everything glassy, rounded pill shapes.

2. **Toolbar row (frosted glass, sits under project bar):** LEFT = a **three-way language segmented pill** with three segments "Python · C++ · C", the "Python" segment ACTIVE (filled warm-orange #F5A623 glossy). Immediately right of it, a **second smaller segmented pill "🧩 积木 / ⟨⟩ 代码"** (Blockly-blocks vs code toggle), "代码" active. RIGHT of the toolbar = a big glossy **orange "▶ 运行" pill button** (primary CTA, #F5A623, 3D soft), and next to it a secondary glass button **"📐 设计"** (turtle-graphics designer). Small glass icon buttons for undo/redo/format on the far left.

3. **Main work area — split into TWO big regions side by side:**
   - **LEFT ~62% = dark code editor panel** (deep slate #1E2233 rounded 24px card, subtle inner glow, faint line numbers): a **Monaco-style code editor** showing a few lines of colorful syntax-highlighted Python (`import turtle`, a `for` loop, `t.forward(100)`, `t.right(90)`) — keep it SHORT, realistic, colorful tokens (orange/teal/purple keywords). A soft floating tab "main.py" glass chip on top-left of the editor. (This region is where a Blockly blocks canvas would appear in blocks-mode — but show CODE mode here.)
   - **RIGHT ~38% = two stacked frosted-glass panels:**
     - **TOP-right = 🐢 Turtle-graphics canvas** (white rounded canvas card, label "🐢 海龟画布"): show a cute glossy **cartoon-3D turtle** (green body, orange hoodie, round glasses, holding a tiny notebook) that has drawn a colorful geometric spiral / star pattern with a pen trail, mid-canvas.
     - **BOTTOM-right = console panel** (dark rounded card, label "▸ 控制台 / 输出"), a couple of monospace output lines and a green "✓ 运行成功 0.4s" success chip.

4. **Bottom status strip (thin frosted glass):** small pill chips — a role chip "🧑‍✈️ 驾驶员：小马" (orange) + "👀 观察员：小华 · 在线" (green dot), a room-code badge "房间 #A7F3", a mini computational-thinking chip "🧠 思维记录中", and a timer "⏱ 12:30".

5. **Floating bottom-right = AI dual-mentor bubble:** a round glossy floating action button showing **two cute cartoon-3D characters** overlapping — a small green **turtle mascot** (小龟, the driver-coach, lively) and a **white-and-blue little robot / book-sprite** (智伴, the reviewer-navigator, calm) — with a subtle "AI 双导师" glass label and a tiny purple notification dot. Soft glow halo behind it.

**Mood:** friendly, playful yet focused, premium ed-tech, airy whitespace, glossy candy-like 3D accents floating with soft shadows, cohesive glass-and-ceramic system. Cinematic soft lighting. Absolutely no gibberish text, no fake logos, no distorted glyphs — keep all labels short and legible.

**Chinese UI labels to render (short, crisp):** 我的作品 · 新建 · 已保存到云端 · 下载 · 上传 · 保存 · 运行 · 设计 · 积木 · 代码 · 海龟画布 · 控制台/输出 · 运行成功 · 驾驶员 · 观察员 · 房间 · 思维记录中 · AI 双导师.

---

### PART 2 — 中文校对（逐区核对，确认后再让 ChatGPT 出图）

一张 **16:9 桌面网页高保真 UI**，产品「AI 小海龟 · 结对编程」（面向初中生的 AI 编程学习平台）。整体统一风格：**玻璃拟态（磨砂半透明白 + 内高光描边 + 柔长阴影 + 圆角 22–28）＋ 陶瓷瓷片（pastel 渐变卡 + 左上 glossy 3D 图标）＋ 卡通 3D（黏土质感、圆润可爱、儿童友好、无文字水印）**。配色：暖橙 #F5A623 / 教育蓝 #6C9CE9 / 紫 #7C6BF0 / 青绿 #2EC4B6 + pastel（薰衣草/蜜桃/薄荷）+ 奶油浅灰玻璃底 #ECEFF4。字体 Inter，界面文字为**简体中文**。

- **① 顶部作品条（玻璃条，通栏）：** 左「🐢 我的作品 ▾」项目下拉胶囊 + 「＋ 新建」；中间「☁ 已保存到云端 · 刚刚」青绿云状态芯片（默认=云端）；右「⬇下载 ⬆上传 💾保存」小玻璃图标钮 + 圆形学生头像。
- **② 工具条（玻璃条）：** 左＝**三语言分段胶囊「Python · C++ · C」**，Python 高亮（橙填充）；紧邻**「🧩积木 / ⟨⟩代码」双模胶囊**，「代码」高亮；右＝大号 glossy 橙色**「▶ 运行」**主按钮 + 玻璃**「📐 设计」**（海龟绘图设计器）+ 撤销/重做/格式化小图标。
- **③ 主区左 62% ＝ 深色 Monaco 代码编辑器**（深板岩 #1E2233 圆角卡、行号、彩色高亮的短段 Python turtle 代码，左上「main.py」玻璃标签）。**积木模式时此区换成 Blockly 积木画布**（本图展示代码模式）。
- **③ 主区右 38% ＝ 上下两块玻璃面板：** 上「🐢 海龟画布」白卡（卡通 3D 小海龟 + 已画出的彩色几何螺旋/星形轨迹）；下「▸ 控制台 / 输出」深色卡（几行等宽输出 + 绿色「✓ 运行成功 0.4s」）。
- **④ 底部状态条（细玻璃条）：** 「🧑‍✈️ 驾驶员：小马」橙 chip + 「👀 观察员：小华 · 在线」绿点 + 「房间 #A7F3」徽章 + 「🧠 思维记录中」+ 「⏱ 12:30」计时。
- **⑤ 右下悬浮 AI 双导师球：** 圆形 glossy 悬浮球，内含两个卡通 3D 角色（活泼**小龟**驾驶员引导 + 沉稳**白蓝小机器人/书本精灵**智伴领航），「AI 双导师」玻璃标签 + 紫色小红点 + 柔光光晕。

> 出图要点：**不要渲染大段中文正文**（编辑器里的代码用英文/符号即可），关键中文标签保持短、清晰、无变形乱码；3D 元素无错误文字水印。

> 可选补充：若要**移动端三联图**，追加一句 “Also provide a 9:16 mobile version, vertical stack: 顶部作品条 → 语言/双模胶囊 → 代码编辑器 → 折叠的海龟画布+控制台标签页 → 悬浮 AI 球”。

#### 🛠️ Codex 开发规格

##### Codex 开发规格 — 学生 IDE 编程页（双模 + 三语言 + 海龟绘图）

> 落地栈：Vue 3 `<script setup>` + TS + Vite + Element Plus + Monaco + Blockly。既有文件 `frontend/src/views/student/IDE.vue` 为改造基线（当前仅 Python/C++、无 Blockly、无海龟画布）。新增：**C 语言、Python 积木/代码双模（Blockly）、海龟绘图 Canvas、作品条云端保存/下载/上传、AI 双导师悬浮球统一入口**。严格沿用设计系统（玻璃拟态 + 瓷片 + 卡通 3D；橙 #F5A623 / 蓝 #6C9CE9 / 紫 #7C6BF0 / 青绿 #2EC4B6 / 奶油玻璃底 #ECEFF4；圆角 sm12/md16/lg22/pill999）。

### 1. 路由
- 复用现有学生路由 `/`（`router/index.ts` 中 IDE 页），`meta.role='student'`，`beforeEach` 依赖 `userStore.token`；未登录跳 `/login`。
- 保存/加载项目态用 query 记忆：`/?project={id}&file={id}`（刷新可恢复当前作品）。移动端不额外分路由，用响应式折叠。

### 2. 页面结构 / 组件树
```
IDE.vue (student)
├─ ProjectBar.vue                 # ① 顶部作品条（玻璃）
│   ├─ 项目下拉（el-select，「我的作品 ▾」）
│   ├─ 新建项目按钮（弹 NewProjectDialog）
│   ├─ CloudStatusChip            # ☁ 已保存到云端/保存中/离线（默认云端）
│   └─ 下载 / 上传 / 保存 三图标钮 + 用户头像下拉
├─ EditorToolbar.vue              # ② 工具条（玻璃）
│   ├─ LangSegmented（Python|C++|C 三段胶囊）
│   ├─ ModeSegmented（🧩积木|⟨⟩代码，仅 Python 显示，非 Python 禁用并锁「代码」）
│   ├─ RunButton（▶ 运行，橙主按钮）
│   ├─ DesignButton（📐 设计 → 打开海龟绘图设计器/示例插入）
│   └─ 撤销/重做/格式化 图标钮
├─ PairProgrammingBar.vue         # 既有：驾驶员/观察员/换位/房间/计时（保留）
├─ WorkSplit.vue                  # ③ 主区左右分栏（可拖拽 splitter，默认 62/38）
│   ├─ CodePane（左）
│   │   ├─ MonacoEditor           # 代码模式（Python/C++/C）
│   │   └─ BlocklyWorkspace       # 积木模式（仅 Python；积木⇄代码实时生成）
│   └─ RightStack（右，上下分栏）
│       ├─ TurtleCanvas.vue       # 🐢 海龟画布（Canvas 2D 执行绘图指令）
│       └─ ConsolePane.vue        # ▸ 控制台/输出（stdout/stderr + 成功/失败 chip）
├─ StatusStrip.vue                # ④ 底部状态条（角色/房间/思维记录中/计时）
├─ AIMentorFab.vue                # ⑤ 右下 AI 双导师悬浮球 → 展开 AIChatPanel.vue（既有）
├─ NewProjectDialog.vue / UploadDialog.vue（玻璃弹窗）
└─ 依赖：composables/useCollab.ts（既有 WS 单例）、stores/pair.ts、useThinkingTracker.ts
```

### 3. 关键交互
1. **三语言切换**：`LangSegmented` 改 `currentLang`（`python|cpp|c`）。切到非 Python 时，强制 `mode='code'` 并禁用积木段（Blockly 仅支持 Python）。切语言时若代码非空且未保存 → 二次确认「切换语言会新建入口文件」。语言影响 Monaco `language`（cpp/c 都用 `cpp` 高亮）与运行请求的 `language` 字段（`c` 需后端支持，见 §4 契约与降级）。
2. **积木/代码双模**：`ModeSegmented` 切 `mode`。`积木→代码`：Blockly `pythonGenerator.workspaceToCode()` 实时生成 Python 写回 Monaco 缓冲（只读预览或可编辑，取产品定）。`代码→积木`：不做反向解析（Blockly 不可靠），切回积木时提示「已保留上次积木；代码改动不会回灌积木」。积木 XML 与代码分别持久化在 file 内容/`meta`。
3. **▶ 运行**：置 loading，POST 代码执行（§4.1）。**海龟程序识别**：Python 代码含 `import turtle` / `t.forward` 等 → 运行时把绘图指令渲染到 `TurtleCanvas`（前端解析海龟 API 序列或后端返回绘图指令 JSON，二选一，见 §4.1 扩展）；普通程序结果进 `ConsolePane`。运行完写思维事件（`useThinkingTracker` 双写 `/api/v1/monitor/activity`：run/success/error）。结对模式下驾驶员运行结果经 `useCollab` `console` 消息同屏广播给观察员。
4. **📐 设计**：打开海龟绘图设计器（可视化选图案 → 生成 turtle 代码片段插入编辑器），或最简版=插入示例海龟代码模板。
5. **作品条（默认云端）**：
   - 载入=`GET /projects` 填下拉；选中=`GET /projects/{id}/files` 取文件，首文件进编辑器。
   - 保存=`PUT /files/{id}`（防抖自动保存 + 手动 💾），`CloudStatusChip` 走「保存中→已保存到云端 · 刚刚」；失败转「⚠ 未同步（本地已存）」。
   - 下载=前端把当前文件/项目打包为 `.py/.cpp/.c`（或 zip）触发浏览器下载，无需后端。
   - 上传=选本地文件 → 读文本 → `POST /projects/{id}/files` 新建文件（校验后缀→语言）。
6. **AI 双导师悬浮球**：点开 `AIChatPanel`（既有，SSE 流式）。角色真相源与 `stores/pair.ts` 统一：`ai_driver`(小龟/操作者) vs `ai_navigator`(智伴/领航员，禁代写)。传 `code_context`(当前编辑器内容)+`console_output`。

### 4. 数据与 API 契约（全部 `/api/v1` 前缀 + `{code,message,data}` 信封 + JWT Bearer；前端 `UnwrappedApi` 直接读 `res.code`/`res.data`）
**4.1 运行代码** `POST /api/v1/code/execute`
- 请求：`{ language: "python"|"cpp"|"c", code: string, file_id?: number }`
- 响应 `data`：`{ execution_result: string, execution_status: "success"|"error"|"timeout", error_message?: string, execution_time: number, submission_id: number, sandbox: "docker"|"process" }`
- **C 语言注意**：当前后端 `code_executor` 已支持 `python`/`cpp`；`c` 需后端扩展（gcc 编译）。前端契约先按 `c` 传值；**降级策略**：后端未支持时返回 error，前端 `ConsolePane` 展示「暂不支持 C，敬请期待」，且 `LangSegmented` 的 C 段读一个 feature flag 决定是否置灰。
- **海龟绘图扩展（可选）**：约定后端在海龟程序时于 `data` 附 `turtle_commands: Array<{op:"forward"|"right"|"left"|"penup"|"pendown"|"goto"|"color"|"circle", args:number[]|string[]}>`；若后端不产出，前端用轻量 turtle 解释器（解析 `t.forward/right/...` 顺序）在 Canvas 复现。二者取一，`TurtleCanvas` 消费统一指令数组。
**4.2 项目/文件**
- `GET /api/v1/projects` → `data: [{id,name,language,description,created_at,updated_at}]`
- `POST /api/v1/projects` `{name,language,description?}` → 自动建 `main.py/main.cpp` 初始文件（后端已实现，扩展 `c` 生成 `main.c`）
- `GET /api/v1/projects/{id}/files` → `data:[{id,filename,content,language,updated_at}]`
- `POST /api/v1/projects/{id}/files` `{filename,content?}`（后缀推断语言，需补 `.c/.h`）
- `PUT /api/v1/files/{id}` `{content}`（保存）；`DELETE /api/v1/projects/{id}`
**4.3 结对协同（既有 WS，无前缀）** `/ws/pair/{room_id}?token=&name=`；消息 `joined|presence|edit|cursor|role_switch|console|lang|chat`。运行结果用 `console`、语言切换用 `lang` 广播；观察员 Monaco `readOnly`。
**4.4 计算思维双写** `POST /api/v1/monitor/activity` `{type,payload}`（run/success/error/help 等），经 `useThinkingTracker`。
**4.5 AI** `POST /api/v1/ai/chat`（SSE 流）`{message,language,pair_mode:"ai_driver"|"ai_navigator",code_context,console_output,session_id?}`。

### 5. 状态（加载 / 空态 / 错误 / 无数据）
- **加载**：运行=按钮 loading + 控制台「▸ 运行中…」；项目/文件拉取=编辑器骨架屏；保存=云芯片「保存中」。
- **空态**：无项目→编辑器区放 `empty_console`/引导卡「＋ 新建你的第一个作品」；海龟画布未运行→占位「运行含 turtle 的代码即可作画 🐢」；控制台空→「点 ▶ 运行 查看输出」。
- **错误**：运行 error→控制台红字 + 定位行高亮 + AI 智伴气泡「要我帮你看看这个报错吗？」；保存失败→云芯片「⚠ 未同步」并本地缓存；WS 断开→状态条「协同已断开，重连中…」。
- **无网络/后端**：`services/mock.ts` 已有 localStorage 回退（保持「真实优先，本地兜底」，UI 不崩）。
- **权限（观察员）**：`pair.role==='observer'` 时 Monaco/Blockly `readOnly`，运行/保存钮置灰并显「观察员只读」气泡。

### 6. 响应式 / 移动端要点
- **≥1200px**：左右分栏 62/38，工具条单行。**992–1200px**：右栏（海龟画布/控制台）改为 Tab 折叠，编辑器占满。**<768px**：竖向堆叠——作品条（收成图标菜单）→ 语言/双模胶囊（可横向滑动）→ 编辑器（≥40vh）→「画布|控制台」Tab 切换 → 底部状态条精简为角色+计时 → AI 悬浮球缩小。Monaco 移动端启用 `wordWrap`、隐藏行号；Blockly 移动端缩放/触控。玻璃面板在低端机降级为纯色卡（`backdrop-filter` 探测）。

### 7. 验收点（逐条）
1. 三语言胶囊可切，Python/C++/C 均影响 Monaco 高亮与运行 `language` 字段；C 未支持时优雅降级不报未捕获错误。
2. 仅 Python 出现「积木/代码」双模；切非 Python 自动锁「代码」并禁用积木段。
3. 积木模式 Blockly 可拖拽积木并实时生成 Python 写回编辑器；切模式有明确提示不丢数据。
4. ▶ 运行：普通程序结果进控制台并显「✓ 运行成功 0.Xs」/失败红字+行高亮；含 turtle 的程序在海龟画布正确复现图形。
5. 作品条默认云端：新建/选择/保存/下载/上传全链路可用；保存走「保存中→已保存到云端」，失败转「未同步」并本地兜底。
6. 结对模式：观察员编辑器只读、实时收到驾驶员代码/光标/运行结果/语言切换；换位后编辑权正确翻转。
7. AI 双导师悬浮球打开对话，角色与 pair store 一致；智伴（navigator）不产出完整可运行代码（仅思路/伪代码）。
8. 每次运行/报错/求助写入 `/api/v1/monitor/activity`，「思维记录中」chip 常亮。
9. 所有面板遵循玻璃 + 瓷片 + 卡通 3D 设计系统与配色/圆角；深色代码区与玻璃工具条对比协调。
10. 响应式三档（桌面/平板/手机）布局正确，无横向溢出；`npm run build`（vue-tsc）通过。
11. 全部新接口遵循 `/api/v1` 前缀 + `{code,message,data}` 信封 + JWT，401 走既有拦截器跳 `/login`。
12. 空态/加载/错误/无后端四态均有对应 UI，且断网时 localStorage 回退可演示。

---

### S5 · AI 结对双导师悬浮面板(玻璃)

#### 🎨 ChatGPT 生图提示词

##### ChatGPT 出图提示词（16:9 桌面高保真 UI 参考图）

> 用法：把下面 **English block** + **中文校对 block** 一起整段粘贴到 ChatGPT（GPT-4o / DALL·E 出图）。要「桌面主图 + 移动端竖屏三联」的话，把最后【Optional 移动端】那段一起带上；只要主图就删掉它。关键中文标签已在括号里标注，正文用极简占位，避免模型渲染大段中文乱码。

---

### 1) English prompt (drives the render — keep verbatim)

A complete, high-fidelity desktop **web UI mockup / product dashboard design**, 16:9, Dribbble / Behance award-winning quality, crisp and pixel-clean, NOT a photo, NOT a 3D room — a flat screen-design presentation shot. Style: **glassmorphism + ceramic-tile cards + cute cartoon 3D (glossy clay render)**, warm and playful, made for a K-12 kids' AI programming-learning product ("AI Turtle · Pair Programming"). Soft studio lighting, gentle long shadows, generous rounded corners (22–28px), frosted translucent white panels rgba(255,255,255,0.6) with 18–24px backdrop blur, 1px inner top highlight stroke, soft ambient drop shadows.

**Scene composition:** the background is a blurred, dimmed **student code IDE** (a Monaco-style dark-ish editor with faint colored syntax, a left file tree, a bottom console strip) — kept low-contrast and out of focus so it reads as "behind glass". Anchored to the **bottom-right corner** floats ONE tall frosted-glass chat panel (roughly 400×640, portrait card), casting a soft purple shadow onto the IDE. This floating glass panel is the hero — everything else is context.

**Inside the floating glass panel, top to bottom:**
- **Header row:** a small glossy 3D turtle mascot (green body, orange hoodie, round glasses, hugging a laptop) on the left; title placeholder chip (label: "AI 小海龟·结对编程"); a tiny "×" close bead and a history-clock bead on the right.
- **Dual-role segmented toggle (pill, two segments):** left segment active/highlighted = a cute glossy 3D turtle avatar + label "🐢 小龟·我来引导"; right segment = a friendly white-and-blue cartoon 3D robot / book-sprite avatar + label "🤖 智伴·帮你审查". The active segment glows with a purple gradient fill; the inactive one is quiet frosted glass. Under the pill, a tiny role caption chip (label: "驾驶员·陪你写" / "领航员·只给思路").
- **Message bubble stream (the main body):** 3–4 chat bubbles. Assistant bubbles are white glass, left-aligned, each led by a small 3D character avatar; they show short Socratic-style question placeholders (label examples: "你觉得循环该从哪里开始？", "先别急着写，先想想边界情况"). One student bubble is right-aligned in a soft lavender gradient. Deliberately show NO full code block in assistant bubbles — a small pseudo-code / hint card instead (a mint-tinted mini tile labeled "思路提示 · 伪代码"). One bubble streaming with a three-dot typing indicator.
- **Quick-ask chips row:** 3–4 small frosted pill chips (labels: "给个小提示", "这个报错什么意思", "帮我理思路", "换个例子").
- **Input bar:** a rounded frosted input field (placeholder label: "问问你的双导师…"), a glossy orange-gradient circular send button with a paper-plane / ▶ glyph, and a small "+添加代码" ghost chip.
- **Footer strip:** a tiny shield/lock icon + a muted caption (label: "内容受教学规则约束 · 不直接给答案"), and a small pill on the right (label: "离线导师", with a soft grey dot = degraded/offline state).

**Overlay state to depict (very important — show it as a second smaller inset OR a semi-covering scrim on the SAME panel):** a **guardian-consent gate scrim** — a frosted, slightly darker glass overlay covering the message area, centered a glossy 3D lock + a gentle 3D turtle peeking, a title placeholder (label: "需要监护人同意"), one line of tiny placeholder text, and two buttons — a filled orange primary (label: "家长/教师同意") and a ghost secondary (label: "稍后再说"). This communicates a parental-gate / age-gate before the AI tutor unlocks.

**Cartoon 3D elements & placement:** the glossy 3D turtle mascot sits in the header and again small inside assistant avatars; the blue-white robot / book-sprite sits in the right toggle segment and as the "reviewer" avatar; the 3D lock floats on the consent scrim. A couple of tiny floating pastel shapes (a mint sphere, a peach rounded cube, a lavender star) drift softly behind the glass panel for depth. All 3D is rounded, cute, child-friendly, clay-like, no text watermark, no gibberish letters on the models.

**Material & palette:** frosted translucent whites over a cream / light-grey glass base (#ECEFF4 / #FFF8F0), student-side warm accents — orange #F5A623, education blue #6C9CE9, purple #7C6BF0, teal-green #2EC4B6, plus pastel lavender / peach / mint / pink. Purple is the primary accent for the AI panel; orange only for the send button and the primary consent CTA. Typography: clean Inter / rounded sans, large friendly weights. Cohesive, calm, premium, cohesive glass depth — like Apple visionOS meets a friendly kids' EdTech brand.

**UI text language: Simplified Chinese** for the labels called out above; keep body text as short crisp placeholders (do NOT render long Chinese paragraphs — use 2–6 character labels / chips only). Ultra-clean, no UI clutter, balanced whitespace, one clear focal point (the floating glass panel).

Negative: no realistic room/desk photo, no messy gradients, no neon cyberpunk, no dark mode, no garbled text, no watermark, no stock-photo people, no overly busy background.

---

### 2) 中文校对（逐区核对用，方便你确认布局与文案，不必翻译成图）

一张 **16:9 桌面网页 UI 参考图**，玻璃拟态 + 陶瓷瓷片 + 卡通3D（黏土glossy）风格，面向初中生的「AI 小海龟·结对编程」学习平台。

- **背景**：一台被虚化压暗的学生代码 IDE（深色 Monaco 编辑器 + 左侧文件树 + 底部控制台），低对比、失焦，衬托出"隔着玻璃"的层次。
- **主体（右下角悬浮）**：一张竖向磨砂玻璃悬浮卡（约 400×640），半透明白 + 18–24px 高斯模糊 + 1px 顶部高光内描边 + 柔和紫色投影，是全图焦点。
- **卡内自上而下**：
  1. **头部**：左边小海龟3D吉祥物（绿身/橙卫衣/圆眼镜/抱笔记本）+ 标题占位「AI 小海龟·结对编程」+ 右侧历史钟形与关闭 × 小珠。
  2. **双角色切换胶囊（两段）**：左段高亮=小龟3D头像 +「🐢 小龟·我来引导」；右段=蓝白卡通小机器人/书本精灵 +「🤖 智伴·帮你审查」；激活段紫色渐变发光，未激活段安静玻璃；下方小字身份 chip「驾驶员·陪你写 / 领航员·只给思路」。
  3. **消息气泡流（主体）**：3–4 条气泡。AI气泡=白玻璃靠左、带小角色头像、苏格拉底式提问占位（「你觉得循环该从哪里开始？」「先别急着写，先想想边界情况」）；学生气泡=右侧薰衣草渐变。**刻意不出现完整代码块**，改用薄荷色迷你瓷片「思路提示 · 伪代码」体现"禁代写"。一条气泡带三点输入中动效。
  4. **快捷提问 chips**：「给个小提示」「这个报错什么意思」「帮我理思路」「换个例子」。
  5. **输入区**：磨砂圆角输入框（占位「问问你的双导师…」）+ 橙色渐变圆形发送按钮（▶/纸飞机）+「+添加代码」幽灵 chip。
  6. **底部条**：盾/锁小图标 +「内容受教学规则约束 · 不直接给答案」灰字 +「离线导师」小胶囊（灰点=降级/离线态）。
- **监护人同意门禁遮罩态（重点，务必画出）**：在同一张卡的消息区盖一层更暗的磨砂玻璃 scrim，居中一枚 3D 锁 + 探头的小海龟、标题「需要监护人同意」、一行小字占位、两枚按钮——橙色实心主按钮「家长/教师同意」+ 幽灵次按钮「稍后再说」。
- **卡通3D与位置**：海龟吉祥物在头部与AI头像；蓝白机器人/书本精灵在右段切换与"审查者"头像；3D 锁在同意遮罩；玻璃卡后方漂浮薄荷球/蜜桃方块/薰衣草星点缀景深。
- **配色**：奶油/浅灰玻璃底（#ECEFF4 / #FFF8F0）+ 学生端暖色（橙 #F5A623 / 蓝 #6C9CE9 / 紫 #7C6BF0 / 青绿 #2EC4B6）+ pastel；紫为面板主强调，橙只用于发送键与同意主按钮。字体 Inter 圆润无衬线。**界面文字为简体中文**，只用短标签/chip，避免大段中文正文。

---

### 3) Optional 移动端（要三联图时把这段接在 English prompt 之后）

Also render a **mobile portrait triptych** (three 9:16 phone frames side by side, same design system): **Frame A** — the AI dual-tutor panel as a full-screen bottom sheet with the segmented role toggle at top and the bubble stream; **Frame B** — the same sheet showing the **guardian-consent gate** full-screen scrim (3D lock + turtle, "需要监护人同意" title, orange "家长/教师同意" + ghost "稍后再说" buttons); **Frame C** — the **offline / degraded** state (grey "离线导师" banner, disabled input, a calm 3D turtle with a "z z z" sleep bubble, retry chip labeled "重新连接"). Keep frosted glass, pastel palette, cute cartoon 3D, Simplified-Chinese short labels only.

#### 🛠️ Codex 开发规格

##### Codex 开发规格 —— AI 结对双导师悬浮面板(玻璃) `ai_pair_panel`

> 目标：在现有 `frontend/src/components/AIChatPanel.vue` 基础上升级为「玻璃拟态双导师悬浮面板」，新增**监护人同意门禁**与**离线导师降级态**，并把双角色语义、SSE 流式、`{code,message,data}` 信封、JWT 全部对齐现有后端。**不改后端已有契约**（`/api/v1/ai/chat` 等），仅新增两个轻量端点用于同意门禁与健康探测。

---

### 0. 现状锚点（已存在，必须复用，勿重造）
- 组件：`frontend/src/components/AIChatPanel.vue`（悬浮卡，`position:fixed; right:16px; bottom:60px; 420×640`）。
- API 封装：`frontend/src/api/ai.ts` → `aiApi.chat/getSessions/getMessages/deleteSession/analyzeCode`。
- SSE 端点：`POST /api/v1/ai/chat`，用原生 `fetch`（非 axios），返回 `text/event-stream`；事件帧 `data: {type:'start', session_id}` → 多个 `data:{type:'chunk', content}` → `data:{type:'done', message_id}`。
- 角色真相源：`stores/pair.ts`，`pairMode = pair.myRole==='observer' ? 'ai_driver' : 'ai_navigator'`。请求体已含 `pair_mode`（`ai_driver|ai_navigator`，见 `schemas.AIChatRequest`）。
- 后端人格：`ai_service.build_system_prompt(language, pair_mode, code_context, console_output)` 组装 `ai_driver`（AI 当驾驶员写代码）/ `ai_navigator`（AI 当领航员·苏格拉底·**禁代写**）。前端 UI 文案必须与这两个人格语义一致。
- 埋点：`composables/useThinkingTracker.ts` 的 `track(...)` 双写 `/api/v1/monitor/activity`。
- 信封：所有 REST 走 `api/index.ts`（axios 拦截器解包 `{code,message,data}`，401→`/login`）；**SSE 例外**，用 fetch 手挂 `Authorization: Bearer`。

---

### 1. 路由 / 挂载
- 无独立路由。面板作为悬浮层挂在学生 IDE 视图（`/` 首页 `views/IDE.vue`）内，由一个悬浮触发按钮（🐢 FAB，右下角）`v-show` 控制显隐。
- 组件树：
  ```
  IDE.vue
  └─ AIPairPanel.vue                （悬浮玻璃卡·本屏主体，升级自 AIChatPanel.vue）
     ├─ PanelHeader                 （吉祥物 + 标题 + 历史/关闭珠）
     ├─ RoleToggle                  （双角色分段胶囊：小龟 / 智伴）
     ├─ RoleCaption                 （身份小字 chip：驾驶员·陪你写 / 领航员·只给思路）
     ├─ MessageStream               （气泡流：AiBubble / UserBubble / TypingDots / PseudoCodeTile / TransitionSystemBubble）
     ├─ QuickChips                  （快捷提问 chips，随角色变化）
     ├─ AttachedFileCard            （+添加代码 附件预览，已存在逻辑）
     ├─ InputBar                    （磨砂输入框 + 橙色发送键）
     ├─ FooterStrip                 （盾图标 + 「内容受教学规则约束·不直接给答案」+ 「离线导师」状态胶囊）
     ├─ ConsentGate (overlay)       （监护人同意门禁遮罩，条件渲染）
     └─ OfflineScrim (overlay)      （离线/降级遮罩，条件渲染）
  ```

---

### 2. 关键交互
1. **双角色切换（RoleToggle）**：点击「🐢小龟·我来引导」= 学生当观察员→`pair_mode=ai_driver`（AI 写代码）；点击「🤖智伴·帮你审查」= 学生当驾驶员→`pair_mode=ai_navigator`（AI 只给思路/伪代码）。切换统一委托 `pair.swapRole()`（保持与协作条同一真相源），`watch(pairMode)` 注入过渡系统气泡并 `track('role_switch', …)`。切换时更新头像、welcome、快捷 chips、输入框 placeholder。
2. **发送 / 流式**：沿用 `handleSend → sendMessage`；用 fetch reader 逐帧解析 SSE，`type:start` 存 `session_id`，`type:chunk` 累加渲染，`type:done` 落 `message_id`。发送中 `isStreaming=true`：禁用发送键、显示 TypingDots。回车发送（`@keydown.enter.exact`），Shift+Enter 换行。
3. **禁代写红线（UI 层强约束）**：当 `pair_mode==='ai_navigator'` 时，隐藏「一键覆盖至编辑器」按钮，助手气泡里的代码块降级为「思路提示·伪代码」瓷片样式（薄荷底、`不可插入`）；仅 `ai_driver` 才出现橙色「⌨️ 一键覆盖至编辑器」并 `emit('insert-code', code)`。
4. **快捷提问 chips**：点击填充输入框并聚焦；chips 内容随 `pairMode` 切换（navigator：「给个小提示 / 这个报错什么意思 / 帮我理思路 / 换个例子」；driver：「帮我写冒泡排序 / 把逻辑翻译成代码 / 加输入校验 / 解释语法」）。
5. **添加代码上下文**：沿用 `addCodeContext`，把当前活动文件内容作为 `code_context` 附带；无活动文件时 `ElMessage.warning` 且按钮 disabled。
6. **监护人同意门禁**：面板首次打开或未同意时，`ConsentGate` scrim 覆盖消息区+输入区（下层 `inert`/`pointer-events:none`）。点「家长/教师同意」→ 调 `POST /api/v1/ai/consent` 记录同意→关闭遮罩、解锁；点「稍后再说」→ 关闭整个面板并保持未同意。同意状态本地缓存（`localStorage: ai_guardian_consent_<userId>`）+ 服务端为准（打开时先 `GET /api/v1/ai/consent`）。
7. **离线 / 降级态**：`GET /api/v1/ai/health` 或 chat fetch 抛错/超时 → 进入 offline，`OfflineScrim` 显示「离线导师」+ 禁用输入 + 「重新连接」重试 chip；重试成功恢复。FooterStrip 的状态胶囊同步（在线=青绿点「在线」，降级=灰点「离线导师」）。
8. **历史会话**：沿用 `getSessions/getMessages/deleteSession`；`showHistory` 抽屉列表，空态「暂无历史会话」。

---

### 3. 状态（加载 / 空 / 错误 / 无数据 / 门禁 / 离线）
| 状态 | 触发 | UI 表现 |
|---|---|---|
| 门禁未同意 `consent=pending` | 打开面板 & 服务端/本地无同意 | ConsentGate 遮罩覆盖，下层锁定；主按钮「家长/教师同意」、次按钮「稍后再说」 |
| 加载（拉取会话/历史） | 挂载 / 打开历史 | 骨架条或轻 spinner，禁用交互 |
| 空态（无历史会话） | `sessions.length===0` | 「暂无历史会话」占位 |
| 空态（新会话无消息） | `messages.length===0` | welcome 气泡（随角色变化）+ 快捷 chips |
| 流式中 | `isStreaming` | TypingDots，发送键禁用 |
| 错误（chat 失败） | fetch reject / 非 2xx | 助手气泡「抱歉，AI 服务暂时不可用，请稍后重试」+ 触发 offline 探测 |
| 离线/降级 | health 失败 / 连续错误 | OfflineScrim + 禁用输入 + 「重新连接」；胶囊灰点 |
| 401 | token 失效 | axios 拦截器跳 `/login`（SSE 分支需手动判断 401→跳登录） |

---

### 4. 数据与 API 契约（`/api/v1` 前缀 + `{code,message,data}` 信封 + JWT Bearer）

**已存在（复用，勿改）**
- `POST /api/v1/ai/chat` — SSE。请求体 `{ session_id?, message, language, pair_mode, code_context?, console_output? }`；响应 `text/event-stream`，帧 `{type:'start',session_id}` / `{type:'chunk',content}` / `{type:'done',message_id}`。**注意**：这是流，非信封，用 fetch。
- `GET /api/v1/ai/sessions` → `{code,message,data:[{id,title,created_at,updated_at}]}`
- `GET /api/v1/ai/sessions/{id}/messages` → `data:[{id,role,content,created_at}]`
- `DELETE /api/v1/ai/sessions/{id}` → `{code:200,message:'删除成功'}`

**新增（本屏需要，按现有约定实现：`APIRouter(prefix="/api/v1/ai")` + `success_response/error_response` + `Depends(get_current_user)`）**
- `GET /api/v1/ai/consent` → `{code,message,data:{consented: bool, consented_at: str|null, method: 'guardian'|'teacher'|null}}`
  （查当前用户是否已过监护人门禁；建议新增 `AIConsent` 模型或复用 user 扩展字段。）
- `POST /api/v1/ai/consent` 请求体 `{ method: 'guardian'|'teacher' }` → `{code,message,data:{consented:true, consented_at}}`
  （记录同意，返回落库时间；写 `useThinkingTracker` 无关，仅审计。）
- `GET /api/v1/ai/health` → `{code,message,data:{online: bool, model: str, degraded: bool}}`
  （探测上游 AI 代理可用性，供前端判定在线/离线；实现为对 `AI_API_BASE_URL` 的轻量 ping 或缓存标志，勿阻塞。）

**前端封装（追加到 `api/ai.ts`）**
```ts
getConsent: () => api.get('/api/v1/ai/consent'),
postConsent: (method: 'guardian' | 'teacher') =>
  api.post('/api/v1/ai/consent', { method }),
getHealth: () => api.get('/api/v1/ai/health'),
```

---

### 5. 设计系统落地（严格对齐，保证全屏一致）
- **玻璃面板**：`background: rgba(255,255,255,.62); backdrop-filter: blur(20px); border:1px solid rgba(255,255,255,.6); border-radius:24px; box-shadow:0 12px 40px rgba(124,107,240,.28);` 顶部 1px 高光内描边（`::before` inset）。
- **强调色**：AI 面板主色 = 紫 `#7C6BF0`；发送键 & 同意主按钮 = 橙渐变 `#F5A623→#FF8C00`；青绿 `#2EC4B6` 用于「在线」点与伪代码瓷片；pastel 薰衣草/薄荷用于气泡与遮罩。学生端不得用教师端冷蓝 `#3B82F6`。
- **瓷片（PseudoCodeTile）**：圆角 22–28、薄荷 pastel 渐变、左上 glossy 3D 图标、标题「思路提示 · 伪代码」+ 小字，柔长阴影，悬浮微抬。
- **卡通3D**：小龟头像（`genAsset('mascot_turtle')` / 思考态 `turtle_think`）+ 智伴（蓝白机器人/书本精灵，需在 `src/assets/generated/` 补图，缺图时 emoji `🤖` 兜底）+ 3D 锁（同意遮罩）。
- **圆角**：sm12 / md16 / lg22 / pill999；输入胶囊 16，chips 999，遮罩卡 24。
- **字体**：Inter / 系统无衬线。
- **动效**：`slide-in-right` 入场；气泡 `fadeIn`；TypingDots `pulse`；遮罩淡入 + 轻微缩放。尊重 `prefers-reduced-motion`。

---

### 6. 响应式 / 移动端要点
- 桌面（≥1024）：`right:16px; bottom:60px; width:420px; height:640px` 悬浮卡。
- 平板（768–1023）：宽度收至 `min(420px, 92vw)`，高度 `min(640px, 82vh)`。
- 移动（<768）：转为**底部整屏 bottom-sheet**——`left:0;right:0;bottom:0;width:100%;height:88vh;border-radius:24px 24px 0 0`；RoleToggle 顶部吸附，MessageStream 占满，InputBar 底部吸附并避让键盘（`env(safe-area-inset-bottom)`）。ConsentGate / OfflineScrim 全屏覆盖。
- 触摸目标 ≥44px；chips 横向可滚动不换行溢出。

---

### 7. 逐条验收点（Definition of Done）
1. 面板以磨砂玻璃悬浮卡呈现，右下角，符合上述玻璃参数（模糊/描边/圆角/投影）目视一致。
2. 双角色分段胶囊可切换；切换后 **头像 / welcome / 快捷 chips / 输入 placeholder / pair_mode** 五者同步更新，且与 `pair.myRole` 真相源一致（协作条切换也会反映到本面板）。
3. `ai_navigator` 模式下：**无「一键覆盖至编辑器」按钮**，助手代码降级为「思路提示·伪代码」薄荷瓷片；`ai_driver` 模式下该橙色按钮出现且能 `insert-code` 到 Monaco。
4. 发送走 SSE：能看到逐字流式渲染，`start/chunk/done` 三阶段正确，会话 `session_id` 持久、可在历史列表点回。
5. **监护人同意门禁**：未同意时遮罩锁死下层交互；点「家长/教师同意」调 `POST /api/v1/ai/consent` 成功后解锁并本地缓存；点「稍后再说」关闭面板；重开面板会先 `GET /api/v1/ai/consent` 校验服务端状态。
6. **离线/降级态**：断开上游或 chat 连续失败时进入 offline，OfflineScrim 显示、输入禁用、「重新连接」可恢复；FooterStrip 胶囊在线=青绿点、离线=灰点，文案「离线导师」。
7. 底部始终显示「内容受教学规则约束 · 不直接给答案」合规标识（禁代写红线可见）。
8. 空态（无历史 / 新会话）、加载态、错误气泡、401 跳登录均按第 3 节表现。
9. 角色切换与门禁同意均产生埋点（`track('role_switch',…)` / consent 审计），不阻塞 UI。
10. 响应式：桌面悬浮卡、移动 bottom-sheet 两套布局均无横向滚动、无溢出，键盘不遮挡输入。
11. `npm run build`（vue-tsc）零类型错误；新增 `api/ai.ts` 方法与后端新端点契约一致（`{code,message,data}`）。
12. 全部用户可见字符串为简体中文，配色为学生端暖色系（紫主 + 橙点缀），未串用教师端冷蓝。

---

### S6 · 程序设计工具(流程图/伪代码)

#### 🎨 ChatGPT 生图提示词

##### 🎨 ChatGPT 出图提示词 —— 程序设计工具(流程图/伪代码)

> 用法：把下面 **English Prompt** 整段粘贴到 ChatGPT 网页版（GPT-4o / DALL·E 或图像模型），生成一张 16:9 桌面高保真 UI 参考图。第二段中文仅用于你自己核对分区与文案，不必发给模型（发了也可，但避免让模型渲染大段中文正文）。

---

### ① English Prompt (paste this to generate the image)

A single, complete, high-fidelity desktop web UI mockup, 16:9 aspect ratio, Dribbble / Behance award-winning quality, presented as a **floating glassmorphism modal / workspace panel** overlaying a soft blurred coding-IDE backdrop. This is the **"Program Design Tool" (Flowchart / Pseudocode)** screen of a children's AI programming-learning platform for middle-school students. Design language: **Glassmorphism + Ceramic-Tile cards + cute Cartoon-3D (glossy clay render)**. All UI text is **Simplified Chinese**, crisp and legible; use short labels only, NO long paragraphs of body text.

**Overall layout (top → bottom, left → right):**

- **Top bar of the modal (frosted-glass, rounded 26px, 1px inner highlight stroke, soft shadow):** left side a small glossy 3D turtle mascot (green body, orange hoodie, round glasses, holding a laptop) next to the Chinese title "程序设计工具". Center: a **pill-shaped segmented toggle** with two options "流程图 / 伪代码", the "流程图" tab active (filled warm-orange #F5A623 glass, white text; inactive tab translucent). Right side: a translucent secondary button "清空" and a prominent primary CTA button "应用到编辑器" (glossy purple-to-blue gradient #7C6BF0→#6C9CE9, rounded pill, tiny arrow-into-editor icon). Top-right corner a subtle round glass close "×".

- **Left rail — Ceramic-Tile node toolbox (frosted glass column, ~220px wide):** a small heading "节点工具箱" and a vertical **bento stack of 5 pastel ceramic tiles**, each rounded 22px with a soft long shadow, a glossy 3D icon top-left and a Chinese label, draggable feel:
  1. "开始/结束" — mint-green tile, rounded-stadium glossy 3D terminator icon.
  2. "输入" — peach tile, glossy 3D keyboard / arrow-in icon.
  3. "处理" — lavender tile, glossy 3D gear / rectangle icon.
  4. "判断" — sky-blue tile, glossy 3D diamond / branching icon.
  5. "输出" — pink tile, glossy 3D screen / arrow-out icon.
  A faint "拖拽到画布 →" hint at the bottom.

- **Center — Flowchart canvas (largest area, a lightly-tinted glass surface with a faint dotted grid):** a clean top-to-bottom flowchart built from glossy cartoon-3D nodes connected by smooth rounded arrows:
  - green **stadium "开始"** node at top →
  - peach **parallelogram "输入 n"** →
  - lavender **rectangle "sum ← 0"** →
  - blue **diamond "n > 0 ?"** decision with two labeled branches: a "是/Yes" arrow looping to a process node "sum ← sum + n" and back, and a "否/No" arrow going down →
  - pink **parallelogram "输出 sum"** →
  - green **stadium "结束"** node.
  One node is shown **selected** (glowing focus ring + small round drag handles at corners), and a faint semi-transparent "ghost" node is mid-drag from the toolbox to suggest drag-and-drop. Tiny floating "+" connectors between nodes.

- **Right — Synchronized Pseudocode panel (frosted-glass column, ~320px, rounded 24px):** header "伪代码 (同步)" with a small glossy 3D book-sprite mascot (the "智伴" navigator — a friendly blue-white book/robot companion). Below it a code-like block on a slightly darker translucent card showing simple indented **Chinese pseudocode** with syntax-color accents (keywords orange, values blue), e.g. lines like `输入 n`, `sum ← 0`, `当 n > 0 时:` (indented) `sum ← sum + n`, `输出 sum`. Line-by-line rows subtly highlight to mirror the flowchart. A tiny caption chip "跟随流程图自动生成".

- **Bottom guidance strip (thin frosted-glass bar spanning under canvas + code):** the turtle mascot bubble with a short encouraging Chinese tip like "先想清楚步骤，再让代码上场！", plus two mini glass chips "建模" and "算法设计" (computational-thinking dimensions) glowing softly.

**Material & color:** translucent white glass panels rgba(255,255,255,0.6) with 20px backdrop blur, 1px top inner-highlight, soft diffuse shadows, rounded corners 22–28px. Palette: warm orange #F5A623, education blue #6C9CE9, purple #7C6BF0, teal #2EC4B6, pastel lavender / peach / mint / pink tiles, cream & light-grey glass base #ECEFF4. A few tiny floating cartoon-3D decorations (a little rocket, a star, a gear) drifting in the blurred background for a warm, playful, kid-friendly mood. Inter / rounded sans-serif typography. Bright, airy, soft studio lighting, no text watermark, no gibberish text — all Chinese labels correct and clean.

**Style keywords:** glassmorphism, ceramic tile bento, cartoon 3D clay render, glossy, soft shadows, pastel, kawaii mascot, flowchart builder UI, code editor companion, high-fidelity product design, 16:9, ultra-clean.

---

### ② 中文校对（逐区说明与界面文案，供自己核对，不必发给模型）

**整体**：一张 16:9 桌面网页 UI，主体是一块漂浮的**磨砂玻璃工作面板/弹窗**，背景是虚化的编程 IDE。风格 = 玻璃拟态 + 陶瓷瓷片卡 + 卡通3D黏土渲染。界面文字全部简体中文、只用短标签。

- **顶部条**：左「🐢 小海龟 + 标题：程序设计工具」；中间**胶囊分段切换**「流程图 / 伪代码」（流程图橙色高亮激活）；右侧「清空」次级按钮 + 主按钮「应用到编辑器」（紫→蓝渐变胶囊）；右上角玻璃「×」。
- **左侧 节点工具箱（瓷片）**：标题「节点工具箱」，竖排 5 枚 pastel 瓷片，每枚左上一枚 glossy 3D 图标 + 中文标签：①开始/结束(薄荷)②输入(蜜桃)③处理(薰衣草)④判断(天蓝)⑤输出(粉)；底部提示「拖拽到画布 →」。
- **中间 流程图画布**（最大，点状网格玻璃底）：自上而下节点——开始(圆角椭圆/绿)→输入 n(平行四边形/桃)→sum ← 0(矩形/薰衣草)→n > 0 ?(菱形/蓝, 分支「是」回到 sum ← sum + n 再循环、「否」向下)→输出 sum(平行四边形/粉)→结束(绿)。其中一个节点**选中态**（发光描边+四角拖拽手柄）；有一个半透明「幽灵节点」正从工具箱拖入，表现拖拽建流程；节点间有小「+」连接点。
- **右侧 伪代码面板（同步）**：标题「伪代码 (同步)」+ 智伴（蓝白书本精灵/小机器人，领航员）；下方深色半透明代码卡，展示缩进的中文伪代码（关键字橙、值蓝）：`输入 n` / `sum ← 0` / `当 n > 0 时:` /（缩进）`sum ← sum + n` / `输出 sum`；行高亮与左侧流程图对应；底部小胶囊「跟随流程图自动生成」。
- **底部引导条**：小海龟气泡「先想清楚步骤，再让代码上场！」+ 两枚发光小胶囊「建模」「算法设计」（计算思维维度）。
- **配色**：橙#F5A623 / 蓝#6C9CE9 / 紫#7C6BF0 / 青绿#2EC4B6 + pastel 瓷片 + 奶油浅灰玻璃底#ECEFF4；背景漂浮几枚卡通3D小装饰（火箭/星星/齿轮）。禁止错误文字水印。

---

### ③ 移动端补充（可选，另出一张竖屏三联图）

若需移动端参考图，追加 prompt：*Three vertical mobile screens side by side (portrait, 9:16 each) of the same tool: Screen 1 = flowchart canvas with the node toolbox as a bottom sheet of pastel ceramic tiles; Screen 2 = the "伪代码" toggle view showing synchronized Chinese pseudocode full-screen; Screen 3 = a confirm sheet "应用到编辑器？" with the turtle mascot. Same glassmorphism + cartoon-3D style, Simplified Chinese labels, warm orange / purple / blue palette.* 移动端要点：工具箱收进底部抽屉、流程图/伪代码用顶部切换整屏展示、「应用到编辑器」为底部固定主按钮。

#### 🛠️ Codex 开发规格

##### 🛠 Codex 开发规格 —— 程序设计工具(流程图/伪代码)

> 目标：在现有 Vue3 + TS + Vite + Element Plus 前端 / FastAPI 后端中，落地一个「程序设计工具」面板，供学生用**拖拽流程图**建模、**同步生成伪代码**，并可**一键应用到编辑器**。严格沿用设计系统（玻璃拟态 + 瓷片 + 卡通3D）与项目约定（`/api/v1` 前缀 + `{code,message,data}` 信封 + JWT）。

---

### 1. 定位与路由

- **形态**：以**弹窗/侧抽屉面板**形式嵌入学生 IDE（`frontend/src/views/student/IDE.vue`），而非独立整页路由。由 IDE 工具栏一个入口按钮「设计工具」触发。
- **组件路径**：新增 `frontend/src/components/design/DesignToolModal.vue`（容器）及子组件：
  - `FlowchartCanvas.vue`（画布）
  - `NodeToolbox.vue`（左侧瓷片工具箱）
  - `PseudocodePanel.vue`（右侧同步伪代码）
  - `DesignToolTopbar.vue`（顶部切换+操作）
- **状态管理**：新增 `frontend/src/stores/design.ts`（Pinia），持有 `nodes / edges / selectedId / viewMode('flow'|'code') / pseudocode`。
- **可选持久化**：草稿存 `localStorage`（key `design_draft_<userId>`），遵循 `services/mock.ts` 的「真实后端优先 + localStorage 兜底」模式；后端接口见 §5，未接通时纯本地可用。

### 2. 页面结构与组件树

```
DesignToolModal (glass 弹窗, 圆角26, backdrop-blur20)
├─ DesignToolTopbar
│   ├─ Mascot(🐢) + 标题「程序设计工具」
│   ├─ SegmentedToggle「流程图 | 伪代码」(viewMode)
│   └─ Actions: [清空(次级)] [应用到编辑器(主CTA)] [×关闭]
├─ Body (flex, viewMode==='flow' 时三栏; ==='code' 时伪代码整屏)
│   ├─ NodeToolbox (左, 瓷片竖列: 开始/结束 输入 处理 判断 输出)
│   ├─ FlowchartCanvas (中, 点状网格, 可拖拽节点+连线+选中)
│   └─ PseudocodePanel (右, 智伴头像 + 语法高亮伪代码 + 行高亮联动)
└─ GuidanceStrip (底, 海龟气泡 tip + 胶囊「建模」「算法设计」)
```

### 3. 关键交互

1. **顶部切换**「流程图 / 伪代码」：切换 `viewMode`；流程图=三栏；伪代码=右面板整屏展示（便于复制阅读）。切换有 200ms 淡入过渡。
2. **拖拽建节点**：从 `NodeToolbox` 瓷片拖到画布落点生成对应类型节点（`start/end/input/process/decision/output`）。使用 HTML5 DnD 或 pointer 事件；落点吸附到网格。
3. **节点操作**：点击选中（发光描边 + 四角手柄）；拖动移动；双击编辑节点文案（内联输入）；Delete 键删除；`decision` 判断节点必须支持「是/否」两个出口标签。
4. **连线**：从节点底部/侧边连接点拖出到目标节点生成 `edge`；判断节点的两条边可标注「是」「否」。删除边支持右键/hover 上的小「×」。
5. **伪代码同步**：`nodes+edges` 变化 → 纯前端 `generatePseudocode()` 派生中文伪代码（关键字：`输入 / 输出 / 若…则 / 当…时 / 循环`，赋值用 `←`）。选中流程图节点时，右侧对应伪代码行高亮（双向 hover 联动）。
6. **应用到编辑器**：点「应用到编辑器」→ 将伪代码作为**注释块 + 骨架代码**插入当前 Monaco 编辑器（按当前语言：Python 用 `#`，C++ 用 `//`），插入前弹二次确认「将设计插入编辑器？」。通过 emit 事件或调用 IDE 暴露的方法写入，不直接改后端。
7. **清空**：二次确认后重置画布与伪代码。
8. **引导（计算思维）**：底部胶囊「建模」「算法设计」点击弹小 tip；关键动作（新增判断节点、完成连线、应用到编辑器）通过 `composables/useThinkingTracker.ts` 上报 `/api/v1/monitor/activity`（维度：建模 modeling / 算法设计 algorithm）。

### 4. 状态（加载 / 空态 / 错误 / 无数据）

- **空态**：画布无节点时，居中显示海龟 + 提示「从左侧拖入「开始」节点，画出你的第一步 →」；伪代码面板显示占位「流程图为空，先搭一搭吧」。
- **加载**：拉取草稿/模板时画布骨架屏（玻璃卡 shimmer）；`应用到编辑器` 期间按钮 loading。
- **错误**：草稿保存/加载失败 → 顶部 `ElMessage.error`（读 `{code,message}` 的 message）；不阻塞纯本地编辑。
- **无数据**：模板列表为空则隐藏「示例」入口，仅保留空画布。
- **校验**：应用到编辑器前校验图合法性（必须有唯一 `start`；判断节点须有两条出边；不允许悬空节点），不合法则高亮问题节点 + 提示，不插入。

### 5. 数据与 API 契约（`/api/v1` + `{code,message,data}` + JWT Bearer）

> 后端可作为**增量**能力（学生端读写自己的设计草稿），未实现时前端 localStorage 兜底。建议后端路由归入 `my`（`/api/v1/my`）或新增 `design` 路由；沿用 `success_response/created_response/error_response`、`get_current_user` 依赖。

- **GET `/api/v1/my/designs`** — 列出当前用户草稿。
  `data: [{ id, title, updated_at }]`
- **GET `/api/v1/my/designs/{id}`** — 取某草稿。
  `data: { id, title, graph: { nodes:[{id,type,text,x,y}], edges:[{id,source,target,label}] }, pseudocode }`
- **POST `/api/v1/my/designs`** — 新建/保存草稿（body: `{ title, graph }`；伪代码可后端或前端派生）。
  返回 `created_response`，`data: { id }`
- **PUT `/api/v1/my/designs/{id}`** — 更新草稿。`data: { id }`
- **DELETE `/api/v1/my/designs/{id}`** — 删除。
- **(可选) GET `/api/v1/practice/design-templates`** — 内置示例流程图（斐波那契/求和/判断闰年等），供「示例」入口。

节点数据模型（前端 TS，建议）：
```ts
type NodeType = 'start'|'end'|'input'|'process'|'decision'|'output'
interface FlowNode { id:string; type:NodeType; text:string; x:number; y:number }
interface FlowEdge { id:string; source:string; target:string; label?:'是'|'否'|'' }
interface DesignGraph { nodes:FlowNode[]; edges:FlowEdge[] }
```
所有请求经 `api/index.ts` axios 实例（自动附 Bearer、自动 unwrap 到 `{code,message,data}`）。

### 6. 响应式 / 移动端要点

- **≥1024px（桌面）**：三栏布局（工具箱 220 / 画布 flex / 伪代码 320），弹窗最大宽 1200，居中。
- **768–1024px**：工具箱收成横向可滚动瓷片条置于画布顶部；伪代码折叠为可展开抽屉。
- **<768px（移动）**：单栏；工具箱变**底部抽屉（bottom sheet）**、瓷片横滑；流程图/伪代码用顶部切换整屏；「应用到编辑器」为底部固定主按钮；触控用 pointer 事件支持拖拽，节点最小触控区 44×44。
- 画布支持双指/滚轮缩放与平移（移动端 pinch），坐标基于逻辑网格便于响应式重排。

### 7. 视觉规范落地（与设计系统一致）

- **玻璃面板**：`background: rgba(255,255,255,.6)`；`backdrop-filter: blur(20px)`；`border:1px solid rgba(255,255,255,.7)`（内高光）；`box-shadow` 柔和长阴影；圆角 22–28。
- **瓷片工具箱**：每枚 pastel 渐变（薄荷/蜜桃/薰衣草/天蓝/粉），左上 glossy 3D 图标，标题+副标题，`hover` 微抬 `translateY(-2px)` + 阴影加深。
- **配色变量**：橙 `#F5A623`、蓝 `#6C9CE9`、紫 `#7C6BF0`、青绿 `#2EC4B6`、玻璃底 `#ECEFF4`；主 CTA「应用到编辑器」用紫→蓝渐变胶囊。
- **节点形状**：start/end 圆角椭圆(stadium)、input/output 平行四边形、process 矩形、decision 菱形；均 glossy、柔和投影；选中态发光 focus ring。
- **字体**：Inter / 系统无衬线；圆角 sm12 / md16 / lg22 / pill999。
- **吉祥物**：顶部小海龟(操作引导·活泼)、伪代码面板智伴(领航员·沉稳)；素材优先复用 `src/assets/generated/`。
- **AI 红线**：智伴仅给思路/伪代码结构提示，不生成完整可运行代码（与 `ai_navigator` 角色一致）。

### 8. 逐条验收点（Checklist）

- [ ] 从 IDE 工具栏「设计工具」可打开玻璃弹窗，`×`/遮罩可关闭，关闭不丢失草稿（localStorage）。
- [ ] 顶部「流程图 / 伪代码」切换正常，橙色高亮激活态，过渡平滑。
- [ ] 5 类瓷片节点均可从工具箱拖到画布生成对应形状节点，落点吸附网格。
- [ ] 节点可选中（发光描边+手柄）、拖动、双击改文案、Delete 删除。
- [ ] 可在节点间连线；判断节点支持「是/否」两条带标签出边；可删边。
- [ ] 伪代码随流程图实时同步生成（中文关键字、`←` 赋值、正确缩进）；选中节点时对应行高亮。
- [ ] 「应用到编辑器」二次确认后，按当前语言把伪代码注释+骨架插入 Monaco，插入成功提示。
- [ ] 图非法（无 start / 判断缺出边 / 悬空节点）时阻止应用并高亮问题节点。
- [ ] 空态、加载骨架、错误 message、无模板数据均有对应 UI，不白屏。
- [ ] 关键动作（加判断节点、完成连线、应用到编辑器）经 `useThinkingTracker` 上报计算思维（建模/算法设计）。
- [ ] 桌面三栏、平板折叠、移动底部抽屉三档响应式均可用，移动触控拖拽正常，触控区 ≥44px。
- [ ] 所有接口走 `/api/v1` + `{code,message,data}` 信封 + JWT；未登录 401 由 axios 拦截跳登录。
- [ ] `npm run build`（vue-tsc）零类型错误；界面文案均为简体中文；玻璃/瓷片/卡通3D视觉与其余界面一致。

---

### S7 · 思维成长·计算思维六维数字画像

#### 🎨 ChatGPT 生图提示词

##### ChatGPT 出图提示词（16:9 桌面高保真 UI 参考图）

> 直接整段粘贴到 ChatGPT 网页版（配 4o / DALL·E 图像生成）。先英文稳定出图，再中文校对。

---

### PART 1 — English prompt (paste this to generate the image)

A single, complete, ultra high-fidelity **web UI mockup / analytics dashboard** for a K-12 AI programming-learning platform, **16:9 desktop screen, 1920×1080, full-bleed edge-to-edge**, Dribbble / Behance award-winning quality, crisp product-shot render, soft studio lighting, no browser chrome, no device frame.

**Overall visual language — Glassmorphism + Ceramic Tile + Cartoon 3D (clay render):**
- Frosted translucent glass panels: semi-transparent white `rgba(255,255,255,0.6)`, heavy `backdrop-blur 20px`, 1px inner top highlight stroke, soft long drop shadow, large corner radius 24px.
- Ceramic tile cards: rounded 24px, gentle pastel gradient fills (lavender / peach / mint / pink / sky), a single glossy 3D clay icon top-left or centered, title + tiny subtitle + mini pill button, long soft shadow, subtle floating lift.
- Cartoon 3D clay elements: glossy, rounded, cute, child-friendly, soft shadows, **absolutely no gibberish text baked into 3D objects, no watermark**.
- Background: warm cream-to-light-grey glass gradient `#FFF8F0 → #ECEFF4`, faint floating pastel blobs and a few soft bokeh dots.

**Color palette (student side, warm & playful):** warm orange `#F5A623`, education blue `#6C9CE9`, purple `#7C6BF0`, teal `#2EC4B6`, pastel lavender / peach / mint / pink accents, cream / light-grey glass base. Font: Inter / clean sans-serif, rounded.

**Layout — 3 zones on one screen:**

**(A) Top glass nav capsule (full width, floating):** left = 🐢 green cartoon turtle mascot wearing an orange hoodie and round glasses hugging a laptop, next to a bold wordmark placeholder "计算思维成长档案"; center = 3 pill filter tabs "近7天 / 近30天 / 全部"; right = a small round student avatar + a glossy level badge "Lv.6". Frosted glass, blur, soft shadow.

**(B) Hero row — split into a big radar panel (left ~40%) and a 2×3 tile badge grid (right ~60%):**
- **Left, large frosted glass card** titled "六维雷达图": a clean **ECharts-style hexagonal radar chart** with 6 axes labelled (short Chinese labels, crisp, not blurry): 抽象 / 分解 / 建模 / 算法设计 / 验证优化 / 迁移. Two overlapping translucent filled polygons (purple `#7C6BF0` = 本周, teal `#2EC4B6` = 上周) with glowing vertices, a soft radial grid. A tiny 3D turtle peeking at the chart corner. Big number "总分 82" glossy chip.
- **Right, a 2×3 bento grid of 6 ceramic tile "维度徽章" cards**, each: pastel gradient tile, one glossy 3D clay icon (磁贴依次：抽象=水晶棱镜, 分解=拼图块, 建模=齿轮蓝图, 算法设计=流程分叉箭头, 验证优化=放大镜+勾, 迁移=火箭), a short Chinese dimension label, a big score number (e.g. "85 / 100"), a thin mini progress bar, and a tiny up-arrow trend pill "+6".

**(C) Bottom row — three panels:**
- **Left, glass card "问题解决路径流":** a horizontal **node flow** of 5 rounded glossy nodes connected by arrows, each node a small 3D clay icon + short Chinese label: 设计 → 编写 → 报错 → 求助 → 修复. The "报错" node red-tinted, "求助" node shows a tiny AI companion sprite (white-blue robot), "修复" node teal with a check. Dotted animated-looking connector line.
- **Center, glass card "行为时间线":** a vertical timeline with 4-5 colored dots + time stamps (占位: 09:12 / 09:20 / 09:34) and one-line Chinese activity labels (运行代码 / 出现报错 / 向小海龟求助 / 修复成功), colored chips per event type.
- **Right, a vertical stack of small ceramic "指标磁贴":** at top a **glossy ring / donut progress** labelled "今日用时" with center "48min"; below it 4 tiny stat tiles in a 2×2 grid — 运行 128 / 报错 34 / 修复 29 / 成功率 78% — each with a mini glossy icon and pastel background.

**Mood:** friendly, encouraging, educational, premium, clean bento composition, generous whitespace, everything on glass, soft floating cartoon-3D accents. All interface text in **Simplified Chinese**, short crisp labels only (no long paragraphs). Consistent rounded 24px radii, unified soft shadows, cohesive pastel palette. Award-winning EdTech dashboard design.

**Negative:** no gibberish text, no watermark, no logo of real brands, no dark mode, no cluttered UI, no photorealistic humans, no misspelled labels, avoid rendering long Chinese sentences.

---

### PART 2 — 中文逐区校对（核对界面文案与分区，不必渲染成正文）

- **顶部玻璃导航胶囊**：左侧 🐢 小海龟吉祥物（绿身+橙卫衣+圆眼镜+抱笔记本）+ wordmark「计算思维成长档案」；中间三枚胶囊筛选「近7天 / 近30天 / 全部」；右侧学生头像 + 等级徽章「Lv.6」。磨砂玻璃、模糊、柔投影。
- **英雄区左·六维雷达图卡**：标题「六维雷达图」；六轴中文标签＝抽象 / 分解 / 建模 / 算法设计 / 验证优化 / 迁移；两层半透明多边形（紫＝本周、青绿＝上周）；角落小海龟；玻璃芯片「总分 82」。
- **英雄区右·六维瓷片徽章（2×3 bento）**：六张 pastel 瓷片，各配一枚 glossy 3D 图标（抽象=棱镜 / 分解=拼图 / 建模=齿轮蓝图 / 算法设计=分叉箭头 / 验证优化=放大镜带勾 / 迁移=火箭）＋维度名＋大分值「85 / 100」＋迷你进度条＋趋势胶囊「+6」。
- **底部左·问题解决路径流**：五节点横向流程「设计 → 编写 → 报错 → 求助 → 修复」；报错节点偏红、求助节点带智伴精灵、修复节点青绿带勾。
- **底部中·行为时间线**：竖向时间轴＋时间戳（09:12 / 09:20 / 09:34…）＋一行中文事件「运行代码 / 出现报错 / 向小海龟求助 / 修复成功」，按事件类型着色 chip。
- **底部右·指标磁贴**：顶部环形进度「今日用时 48min」；下方 2×2 迷你磁贴「运行 128 / 报错 34 / 修复 29 / 成功率 78%」。
- 全屏统一：24px 圆角、柔和长阴影、玻璃拟态、pastel 配色、Inter 字体、卡通 3D 点缀，界面文字全部简体中文、短标签。

---

### PART 3 — 移动端竖屏（可选，追加生成三联图）

> Optional: also generate a **portrait mobile version, 3 phone screens side by side (triptych)**, same glassmorphism + ceramic tile + cartoon-3D style, Simplified Chinese labels.
> - **屏1**：顶部小海龟 + 「计算思维成长档案」+ 筛选胶囊；六维雷达图占满一屏。
> - **屏2**：六维瓷片徽章纵向单列滚动（每卡 3D 图标 + 分值 + 进度条）。
> - **屏3**：问题解决路径流（纵向节点）+ 行为时间线 + 今日用时环形 + 2×2 指标磁贴。
> 单列堆叠、指尖友好、大圆角、pastel 玻璃底。避免渲染长段中文，仅短标签。

#### 🛠️ Codex 开发规格

##### Codex 开发规格 — 思维成长·计算思维六维数字画像（screen_id: `thinking_growth`）

面向 Codex：照参考图落地。前端 Vue3 `<script setup>` + TS + Vite + Element Plus + ECharts；后端 FastAPI。严格遵守既有约定：`/api/v1` 前缀、`{code,message,data}` 信封、JWT Bearer、学生端暖色设计系统。**本屏把现有 4 维（decompose/abstract/pattern/debug）升级为 6 维**，需新增后端聚合与前端六维组件，且保持与 `useThinkingTracker` 现有埋点兼容。

---

### 1. 路由与入口
- 复用学生路由 `/thinking`（`router/index.ts`，`meta.role='student'`，`beforeEach` 已守 `userStore.token`）。
- 页面组件：新建 `frontend/src/views/student/ThinkingGrowth.vue`，替换/升级现有 `Thinking.vue` 的挂载内容（保留返回按钮跳 `/`）。
- 入口：IDE 顶栏「成长档案」按钮已存在 → 指向 `/thinking`，无需改动。

---

### 2. 页面结构与组件树
```
ThinkingGrowth.vue (view, 三区栅格)
├─ <GlassNavCapsule/>            顶部玻璃导航胶囊：🐢+wordmark｜时间范围胶囊(近7天/近30天/全部)｜头像+Lv徽章
├─ 英雄区 (grid: 40% / 60%)
│   ├─ <RadarSixDim/>           六维雷达图玻璃卡 (ECharts radar，本周/上周双多边形+总分芯片)
│   └─ <DimBadgeGrid/>          2×3 六维瓷片徽章 (v-for 6 张 <DimBadgeTile/>)
│         └─ <DimBadgeTile/>    3D图标+维度名+分值+迷你进度条+趋势胶囊
└─ 底部区 (grid: 3 列)
    ├─ <SolvePathFlow/>         问题解决路径流：设计→编写→报错→求助→修复 节点流
    ├─ <BehaviorTimeline/>      行为时间线：竖向时间轴+事件chip
    └─ <MetricTiles/>           指标磁贴：今日用时环形(ECharts gauge/donut)+2×2 运行/报错/修复/成功率
```
- 六维顺序固定：`抽象 abstraction / 分解 decomposition / 建模 modeling / 算法设计 algorithm / 验证优化 evaluation / 迁移 transfer`（雷达轴与徽章一致）。
- ECharts 按需引入（radar + gauge/pie）；组件卸载时 `dispose()`，`ResizeObserver` 重绘。

---

### 3. 关键交互
- **时间范围切换**（近7天/近30天/全部）：切胶囊 → 重新拉数据 → 雷达、徽章、时间线、指标全联动刷新（`range` = `7d|30d|all`，默认 `7d`）。
- **雷达双多边形**：本周 `#7C6BF0`、上周 `#2EC4B6`，图例可点击开关上周对比。
- **徽章 hover**：微抬 + 阴影加深；点击某维徽章 → 高亮雷达对应轴 + 弹玻璃 tooltip（该维近期代表性行为示例）。
- **路径流节点 hover**：显示该阶段发生次数与最近一次时间。
- **时间线**：按事件类型着色（run蓝/error红/fix青绿/ai_help紫/role_switch橙），最多展示最近 20 条，可「查看更多」。
- **今日用时环形**：中心数字 + 与昨日对比 delta。

---

### 4. 状态（加载/空态/错误/无数据）
- **加载**：各卡骨架屏（玻璃底 + shimmer），雷达/环形显 loading spinner。
- **无数据**（`has_real_data=false`，新生或零埋点）：雷达显示保底基线（各维 base 值）+ 空态插画（3D 小海龟 + 文案「开始你的第一次编程，点亮六维吧！」）+ CTA「去写代码」跳 `/`。
- **错误**：接口失败 → 走 localStorage 本地聚合回退（沿用 `services/mock.ts` 的 real-backend-first + fallback 模式），顶部非阻塞提示「当前为离线估算数据」。
- **空时间线/空路径**：占位「暂无记录」，不塌陷布局。

---

### 5. 数据与 API 契约（`/api` 前缀 + `{code,message,data}` 信封 + JWT）
**新增后端端点**（`backend/app/routers/thinking.py`，`APIRouter(prefix="/api/v1/thinking")`，依赖 `get_current_user`）：

`GET /api/v1/thinking/portrait?user_id={id}&range=7d|30d|all`
- 学生仅可查自己（`user_id` 缺省=当前用户）；教师可传任意 `user_id`（`require_admin` 分支或角色校验）。
- 聚合源：`monitor/activity` 已落库的 `ct_event`（run/error/fix/ai_help/role_switch/edit/save）。
- 六维打分沿用「保底基线 + 行为加权、clamp(8,100)」思路，从现 4 维扩到 6 维（新增 modeling / algorithm / evaluation / transfer 的权重公式，示例：modeling=f(抽象类求助+建模型题占比)、transfer=f(跨题型复用/迁移次数)）。

**响应 `data` 形状**（前端 TS 接口，扩展现有 `ThinkingSummary`）：
```ts
interface ThinkingPortrait {
  range: '7d' | '30d' | 'all'
  total_score: number                    // 六维总分/均分，用于「总分82」芯片
  dimensions: {                          // 固定 6 项、固定顺序
    key: 'abstraction'|'decomposition'|'modeling'|'algorithm'|'evaluation'|'transfer'
    label: string                        // '抽象'|'分解'|'建模'|'算法设计'|'验证优化'|'迁移'
    score: number                        // 0-100 本周
    prev: number                         // 0-100 上周(对比多边形)
    delta: number                        // score-prev，趋势胶囊 +6/-3
  }[]
  metrics: { runs: number; errors: number; fixes: number; success_rate: number; minutes_today: number; minutes_prev_today: number }
  path: { stage: 'design'|'code'|'error'|'help'|'fix'; label: string; count: number; last_ts: number }[]  // 5 节点
  timeline: { type: string; label: string; detail?: string; ts: number }[]  // 最近≤20
  has_real_data: boolean
}
```
- 前端在 `services/mock.ts` 新增 `thinkingApi.portrait(user_id, range)`：**先请求真实后端 → 失败回退本地 `localPortrait()`**（把现 `localSummary` 的 4 维映射/补足到 6 维，`transfer/modeling/evaluation/algorithm` 用可复现的启发式，保证离线可演示）。
- 埋点不变：继续用 `useThinkingTracker().track()` 双写 `/api/v1/monitor/activity`；本屏只读聚合，不新增写路径。
- 鉴权：axios 请求拦截器已自动附 `Bearer`；401 → 拦截器跳 `/login`。

---

### 6. 响应式 / 移动端要点
- 断点：`≥1200px` 三区完整（英雄区 40/60 分栏，底部 3 列）；`768–1199px` 英雄区上下堆叠、底部 2 列（指标磁贴换行）；`<768px` 全部单列纵向堆叠（对应参考图三联竖屏）。
- 雷达/环形用容器宽度自适应（`width:100%`, `aspect-ratio` 或 ResizeObserver 触发 `chart.resize()`）。
- 磁贴 bento 用 CSS grid `repeat(auto-fit, minmax(...))`，移动端单列；玻璃卡 `backdrop-filter` 移动端加 `@supports` 回退纯色半透明。
- 触摸目标 ≥44px；胶囊筛选移动端可横向滚动。

---

### 7. 设计系统落地（与全屏一致）
- 变量：暖橙 `#F5A623` / 教育蓝 `#6C9CE9` / 紫 `#7C6BF0` / 青绿 `#2EC4B6` / 玻璃底 `#ECEFF4`、奶油 `#FFF8F0`；圆角 sm12/md16/lg22/pill999，卡片 22–28。
- 玻璃卡：`background: rgba(255,255,255,.6); backdrop-filter: blur(20px); border:1px solid rgba(255,255,255,.7); box-shadow: 0 12px 32px rgba(80,80,120,.12); border-radius:24px`。
- 瓷片：pastel 渐变填充 + 左上/居中 glossy 3D 图标 + 标题+副标题+迷你胶囊 + 柔长阴影 + hover 微抬 `translateY(-4px)`。
- 3D 图标资产放 `src/assets/generated/`（可用现有生成流水线补图）；缺图时用 emoji/占位。
- 全部文案简体中文；字体 Inter/系统无衬线。

---

### 8. 逐条验收点（Acceptance）
1. `/thinking` 打开渲染三区：导航胶囊 + 六维雷达 + 六维徽章 + 路径流 + 时间线 + 指标磁贴，视觉符合玻璃拟态+瓷片+卡通3D。
2. ECharts 雷达含 6 轴且顺序为 抽象/分解/建模/算法设计/验证优化/迁移，本周/上周双多边形，图例可切换。
3. 六维徽章 2×3，每张含 3D 图标+维度名+分值(0-100)+进度条+趋势胶囊，与雷达同一数据源、数值一致。
4. 时间范围切换（近7天/近30天/全部）触发一次接口，六大区块联动刷新，`range` 正确传参。
5. `GET /api/v1/thinking/portrait` 返回 `{code:0,message,data}` 信封，`data` 符合 `ThinkingPortrait`；未登录 401 跳登录；学生越权查他人被拒（403）。
6. 无数据学生看到空态插画 + CTA，雷达显保底基线不报错；有埋点后 `has_real_data=true` 显真实聚合。
7. 后端不可用时前端自动本地聚合回退且顶部提示离线，页面不白屏。
8. 路径流 5 节点（设计→编写→报错→求助→修复）显示各阶段计数；报错红/求助带智伴/修复青绿勾。
9. 行为时间线按事件类型正确着色，最多 20 条，空态占位不塌陷。
10. 今日用时环形显 `minutes_today` 且有昨日对比 delta；2×2 指标磁贴显 运行/报错/修复/成功率，数值与 `metrics` 一致。
11. 响应式：≥1200/768–1199/<768 三档布局正确，ECharts 随容器 resize；触摸目标≥44px。
12. `npm run build`（vue-tsc）零类型错误；`cd backend && python -m pytest` 通过（新增 portrait 端点的鉴权/信封/聚合冒烟测试）。

---

### S8 · 云/本地作品管理

#### 🎨 ChatGPT 生图提示词

##### 🅰️ English prompt (paste first — for stable generation)

**A complete, high-fidelity desktop web UI mockup / dashboard design, 16:9 landscape, ~1440×810, Dribbble/Behance quality.** This is the **"Cloud / Local Works Manager"** screen of a friendly K-12 AI programming-learning platform for middle-school students ("AI Turtle · Pair Programming"). Overall aesthetic = **Glassmorphism + Ceramic-tile bento cards + cute cartoon 3D (glossy clay render)**. NOT flat, NOT dark-mode, NOT corporate; warm, playful, child-friendly, ultra-clean.

**Global canvas & atmosphere**
- Soft creamy / light-gray glass background (#ECEFF4 → #FFF8F0 gentle diagonal gradient), faint floating pastel blobs (lavender, peach, mint) blurred far behind everything, subtle grain.
- One frosted-glass **top navigation capsule** floating across the top: translucent white rgba(255,255,255,0.62), backdrop-blur ~22px, 1px inner top highlight stroke, soft long shadow, radius 26.
- Depth via layered soft shadows; all panels have 1px light inner stroke to read as real glass.

**Layout — three horizontal bands over the glass background:**

1. **Top nav capsule (full width, ~72px tall):** left = 🐢 glossy 3D turtle mascot (green body, orange hoodie, round glasses, hugging a laptop) + pixel-style wordmark logo "小海龟". Center = frosted segmented tab pill with tabs "IDE / 我的作品(active) / 任务 / 思维". Right = a small glass search field, a round notification bell, and a circular student avatar. Active tab highlighted in warm orange #F5A623.

2. **Toolbar row (below nav):** left side a **glass segmented toolbar** holding 4 glossy 3D action buttons with tiny icons + Chinese labels: **"新建"** (orange plus, glossy), **"上传"** (blue up-arrow cloud), **"下载 .zip"** (purple down-tray), and a pill toggle **"默认云端"** (mint/teal toggle switch, ON state, small cloud icon). Right side = view switch (grid / list icons) + a filter capsule dropdown "全部语言 ▾" and a sort capsule "最近更新 ▾". Everything frosted glass, radius 22.

3. **Main content = a bento grid of ceramic-tile WORK CARDS (the hero, ~2 rows × 4 columns of tiles):** Each tile is a soft rounded ceramic card (radius 24), pastel gradient fill (alternate lavender / peach / mint / sky-blue / pink), soft long drop shadow, a subtle hover-lift on one card. **Each work tile shows, top-to-bottom:**
   - top-left a **glossy 3D language icon** (a cute 3D Python snake for Python tiles, a cute 3D "C++" cube for C++ tiles),
   - a small **language chip** ("Python" mint chip / "C++" blue chip),
   - a bold work **title** (short Chinese: "画彩虹", "猜数字", "海龟迷宫", "计算器" — keep short, ~3-4 chars),
   - a tiny mono **version badge "v3"** and small gray **update time** "2天前",
   - a small green **"云端已保存" cloud-check badge** (glossy cloud + checkmark) in the corner,
   - a mini action capsule row appearing on the featured card ("打开 / 历史 / ⋯").
   Make one tile clearly **hover-lifted / selected** with a brighter glow.

4. **Right side = a frosted-glass "版本历史" (Version History) drawer sliding in from the right edge**, ~360px wide, translucent white glass, radius 28 on the left corners, with a header "版本历史 · 画彩虹" and a small close ✕. Inside = a vertical **timeline list of version rows**: each row a small glass sub-card with a colored dot, "v3 · 当前" highlighted chip, timestamp "今天 14:20", tiny author avatar, and small ghost buttons "预览 / 恢复". Show 4–5 version rows descending v3→v1, the top one marked current in orange. A faint vertical timeline line connects the dots.

5. **A small floating glass toast near bottom-center = offline fallback notice:** amber-tinted frosted pill with a little 3D cloud-with-slash icon and text "离线中 · 已留本地草稿", plus a tiny "重试同步" ghost link. Gentle warm glow.

**Cartoon-3D elements & placement:** the 🐢 turtle mascot top-left in the nav; a tiny floating 3D cloud + a small 3D floppy-disk / save icon drifting in the background near the top-right; glossy clay 3D language icons on each tile. All 3D is rounded, glossy, soft-shadowed, adorable, no text watermark, no gibberish text on the 3D objects.

**Color palette (student side):** warm orange #F5A623 (primary/accent, active states, "新建"), education blue #6C9CE9, purple #7C6BF0, teal-green #2EC4B6 (cloud-saved / online), pastel lavender-peach-mint-pink tile gradients, cream / light-gray glass base #ECEFF4. Font: Inter / rounded sans-serif. Corner radii: pills 999, cards 24, panels 28.

**Rendering:** crisp, bright, high-detail, realistic soft glass blur and highlights, gentle ambient occlusion, cohesive design-system look. **All interface text is Simplified Chinese.** Keep body text minimal — use short real Chinese labels only where noted (do NOT render long paragraphs of Chinese; use the short labels given). No lorem ipsus, no broken glyphs, no watermark.

---

##### 🅱️ 中文校对说明（逐区核对用，界面文案已给全）

整体：一张 16:9 桌面网页高保真 UI 参考图，主题「玻璃拟态 + 陶瓷瓷片 bento 卡 + 卡通 3D」，学生端暖色调，奶油/浅灰玻璃底，界面文字全部简体中文。避免让模型渲染大段中文，只用下面这些短标签。

- **顶部导航胶囊（磨砂玻璃，圆角26）**：左 🐢 小海龟 3D 吉祥物 + 像素风 wordmark「小海龟」；中间分段标签胶囊「IDE / 我的作品(选中·橙) / 任务 / 思维」；右侧玻璃搜索框 + 通知铃 + 圆形学生头像。
- **工具条行**：左侧玻璃分段工具条含 4 个 glossy 3D 按钮 ——「新建」(橙+)、「上传」(蓝云上箭头)、「下载 .zip」(紫下载盘)、以及开关胶囊「默认云端」(青绿，ON 态，小云图标)。右侧：网格/列表视图切换 + 筛选胶囊「全部语言 ▾」 + 排序胶囊「最近更新 ▾」。
- **主区 = 作品瓷片 bento 网格（≈2 行 × 4 列，本屏主角）**：每张瓷片 pastel 渐变(薰衣草/蜜桃/薄荷/天蓝/粉 轮换)，圆角24，柔长阴影。瓷片内容自上而下：左上 glossy 3D 语言图标(Python 用可爱 3D 小蛇 / C++ 用 3D 方块)、语言 chip「Python」(薄荷)或「C++」(蓝)、作品标题(短：画彩虹 / 猜数字 / 海龟迷宫 / 计算器)、版本徽标「v3」+ 更新时间「2天前」、角落绿色「云端已保存」云勾徽标；被选中/悬浮那张有迷你动作胶囊「打开 / 历史 / ⋯」并微微抬起发光。
- **右侧「版本历史」抽屉（从右滑入，磨砂玻璃，宽≈360）**：头部「版本历史 · 画彩虹」+ 关闭✕；竖向时间线版本行 v3→v1，每行小玻璃卡：彩点、版本 chip(「v3 · 当前」橙色高亮)、时间戳「今天 14:20」、小头像、幽灵按钮「预览 / 恢复」；一条淡竖线串联时间点。
- **底部居中浮动玻璃 toast = 离线回退提示**：琥珀色磨砂胶囊，小 3D 断线云图标 + 文案「离线中 · 已留本地草稿」+ 幽灵链接「重试同步」。
- **卡通 3D 元素位置**：🐢 在导航左；背景右上角漂浮小 3D 云 + 小 3D 软盘/保存图标；各瓷片左上 glossy 3D 语言图标。全部圆润可爱、柔和投影、无错误文字水印。
- **配色**：暖橙 #F5A623 主强调、教育蓝 #6C9CE9、紫 #7C6BF0、青绿 #2EC4B6(云端/在线)、pastel 瓷片渐变、奶油/浅灰玻璃底 #ECEFF4；字体 Inter/圆润无衬线；圆角 胶囊999 / 卡片24 / 面板28。

> 备用（可选）：若需移动端，另出一张竖屏三联图 —— 左「作品列表(单列瓷片+云端徽标)」、中「版本历史抽屉全屏化」、右「离线草稿回退提示卡」，同一玻璃+瓷片+卡通3D设计系统，竖屏 9:16。

---

**⚙️ 出图小贴士**：一次生成一张；若中文标签出现乱码，回复「keep the exact Chinese labels: 新建 / 上传 / 下载.zip / 默认云端 / 我的作品 / 版本历史 / 云端已保存 / 离线中·已留本地草稿 / 预览 / 恢复, render them crisply」再重绘。要更「玻璃」就加 "stronger frosted glass blur, visible 1px inner highlight stroke, softer shadows"；要更「可爱」就加 "cuter glossy clay 3D icons, rounder, bigger highlights"。

#### 🛠️ Codex 开发规格

##### 云/本地作品管理 —— Codex 开发规格 (screen_id: `works_manage`)

### 0. 技术栈 & 约定（沿用现有工程）
- 前端：Vue 3 `<script setup>` + TS + Vite + Element Plus + Pinia。`@` → `frontend/src`。
- 后端：FastAPI + SQLAlchemy，**所有接口 `/api/v1` 前缀 + `{code,message,data}` 信封 + JWT Bearer**（`get_current_user` 依赖）。前端 axios 拦截器已解包为 `{code,message,data}`，调用处直接读 `res.code / res.data`。
- 数据层走 `frontend/src/services/mock.ts` 的「真后端优先 + localStorage 兜底」模式：视图只调 service，切换数据源改 service 方法体即可。
- 用户可见文案全部**简体中文**；配色/圆角/玻璃/瓷片严格遵循学生端设计系统（暖橙 #F5A623 / 蓝 #6C9CE9 / 紫 #7C6BF0 / 青绿 #2EC4B6 / 玻璃底 #ECEFF4）。

---

### 1. 路由
- 新增学生路由 `path: '/works'`, `name: 'WorksManage'`, `meta: { role: 'student', title: '我的作品' }`，页面组件 `views/WorksManageView.vue`。
- `router/index.ts` 的 `beforeEach` 已按 `userStore.token` + `meta.role` 守卫，无需额外逻辑。
- 版本历史抽屉、离线提示均为页面内状态，不占独立路由；但支持 query 深链 `?work=<id>&drawer=history` 打开时直接展开某作品的版本抽屉（用于「打开作品右侧版本历史」跳转）。

---

### 2. 页面结构 & 组件树
```
WorksManageView.vue
├─ AppTopNav（复用现有玻璃导航胶囊；active=我的作品）
├─ WorksToolbar.vue                 // 工具条
│   ├─ 左：ActionButton×3「新建」「上传」「下载 .zip」+ TogglePill「默认云端」
│   └─ 右：ViewSwitch(grid|list)、FilterDropdown「全部语言」、SortDropdown「最近更新」
├─ WorksGrid.vue                     // bento 瓷片网格（grid 视图）/ WorksList（list 视图）
│   └─ WorkTile.vue  (v-for)         // 单个作品瓷片
│        ├─ Lang3DIcon + LangChip(Python|C++)
│        ├─ 标题 / 版本徽标 v{n} / 更新时间(相对)
│        ├─ CloudSavedBadge「云端已保存」/「仅本地」
│        └─ hover 动作胶囊「打开 / 历史 / ⋯(重命名·下载·删除)」
├─ VersionHistoryDrawer.vue         // 右侧 el-drawer，玻璃风
│   └─ VersionRow.vue (v-for)        // v3·当前 / 时间戳 / 作者 / 「预览」「恢复」
├─ OfflineDraftToast.vue            // 离线回退浮动 toast
└─ 空态 / 加载骨架 / 错误重试（见 §4）
```
- 新建/上传/删除/重命名走 Element Plus `ElDialog` + `ElMessageBox` 二次确认（删除/恢复必须二次确认）。
- 瓷片网格 `display:grid; grid-template-columns: repeat(auto-fill,minmax(240px,1fr)); gap:20px`；瓷片圆角 24、pastel 渐变按 index 轮换、`transition: transform/box-shadow`，hover `translateY(-4px)`。

---

### 3. 关键交互
1. **新建**：弹 Dialog（作品名 + 语言 Python/C++ + 模板可选）→ 调 `POST /works` → 成功后新瓷片以 flash 高亮插入网格首位；`ElMessage.success('已创建')`。
2. **默认云端 Toggle**：ON = 保存优先云端；OFF = 仅本地。状态持久化到 `localStorage('works.defaultCloud')` 并 `PUT /my/settings`（失败仅本地生效并提示）。切换即时改变新建/保存目标。
3. **下载 .zip**：选中一个或多个作品 → `GET /works/{id}/export?format=zip`（返回 presigned URL 或 blob）→ 浏览器触发下载；多选时后端打包，前端用 `<a download>`。
4. **上传**：`ElUpload` 接受 `.py/.cpp/.zip`（≤5MB，前端校验后缀+大小）→ `POST /works/import`（multipart）→ 解析成功后加入网格；失败给出明确原因（格式/大小/解析）。
5. **打开作品**：瓷片「打开」→ 跳 `/`(IDE) 并带 `?work=<id>&version=latest`，由 IDE 载入代码。
6. **版本历史抽屉**：瓷片「历史」或点标题 → 右侧 `el-drawer` 滑入，`GET /works/{id}/versions`；行内「预览」= 只读弹窗 diff/内容，「恢复」= `POST /works/{id}/versions/{vid}/restore`（二次确认，恢复会生成新版本 v{n+1} 而非覆盖，提示「已恢复为新版本 v4」）。
7. **版本徽标 v3**：显示 `latest_version`；抽屉内当前版本用橙色「v3 · 当前」chip。
8. **离线回退**：监听 `navigator.onLine` + 请求失败。离线时：① 顶部/底部弹 `OfflineDraftToast`「离线中 · 已留本地草稿」；② 所有编辑写入 `localStorage('works.draft.<id>')`；③ 云端徽标降级为灰色「仅本地」；④「重试同步」按钮触发 `syncDrafts()`，成功后 toast 转「已同步 N 项」并清草稿。恢复在线自动尝试一次同步。

---

### 4. 状态设计（加载 / 空态 / 错误 / 无数据）
- **加载**：网格显示 6–8 个瓷片骨架屏（`el-skeleton`，玻璃底占位）；抽屉显示 4 行时间线骨架。
- **空态**：无任何作品 → 居中 🐢 卡通 3D 插画 + 「还没有作品哦，点『新建』开始创作吧」+ 主按钮「新建作品」。
- **筛选无结果**：`全部语言/关键词` 过滤后为空 → 「没有匹配的作品」+「清除筛选」ghost 按钮（区别于真·空态）。
- **错误**：接口 `code!==0` 或网络错 → 网格区块级错误卡「加载失败」+「重试」；不整页崩。抽屉错误同理局部重试。
- **离线**：见 §3.7，草稿态；徽标灰化，动作按钮中「下载/上传」禁用并 tooltip「离线不可用」。
- **版本恢复中 / 导出中**：按钮 loading 态，防重复点击。

---

### 5. 数据 & API 契约（`/api/v1` 前缀，`{code,message,data}` 信封，JWT）
> 后端目前无 works/version 模型，需新增 `models/work.py`（`Work`、`WorkVersion`）+ `routers/works.py`（`APIRouter(prefix="/api/v1/works")`），随 `Base.metadata.create_all` 自动建表；`owner_id` 关联当前用户，接口按 `get_current_user` 过滤，仅能访问本人作品。

**实体（data 内字段）**
```jsonc
Work = {
  "id": "w_123", "title": "画彩虹", "language": "python|cpp",
  "latest_version": 3, "updated_at": "2026-07-01T14:20:00Z",
  "cloud_saved": true,          // true=云端已保存, false=仅本地
  "size_bytes": 2048, "thumbnail": null
}
WorkVersion = {
  "id": "v_9", "work_id": "w_123", "version": 3, "is_current": true,
  "created_at": "2026-07-02T14:20:00Z", "author": "小马",
  "message": "加了彩虹渐变", "size_bytes": 2048
}
```

**接口清单**
| 方法 & 路径 | 说明 | 返回 data |
|---|---|---|
| `GET /api/v1/works?lang=&sort=&q=&page=` | 作品列表(分页/筛选/排序) | `{items:[Work], total, page, page_size}` |
| `POST /api/v1/works` | 新建 `{title,language,template?}` | `Work`（201 `created_response`）|
| `GET /api/v1/works/{id}` | 作品详情(含 latest 代码) | `{...Work, content}` |
| `PATCH /api/v1/works/{id}` | 重命名/元数据 `{title?}` | `Work` |
| `DELETE /api/v1/works/{id}` | 删除（软删）| `null` |
| `POST /api/v1/works/{id}/save` | 保存新版本 `{content, message?}` → version+1 | `WorkVersion` |
| `GET /api/v1/works/{id}/versions?page=` | 版本历史(降序) | `{items:[WorkVersion], total}` |
| `GET /api/v1/works/{id}/versions/{vid}` | 单版本内容(预览) | `{...WorkVersion, content}` |
| `POST /api/v1/works/{id}/versions/{vid}/restore` | 恢复为新版本 | `WorkVersion`(新 v{n+1}) |
| `GET /api/v1/works/{id}/export?format=zip` | 导出 zip | `{download_url}` 或 `application/zip` blob |
| `POST /api/v1/works/import` | 上传导入(multipart) | `Work` |
| `PUT /api/v1/my/settings` | 默认云端等偏好 `{default_cloud}` | `{default_cloud}` |

- 错误信封：`code=1001` 无权限 / `1002` 作品不存在 / `1003` 版本冲突 / `2001` 导入格式不支持；前端据 `message` 直接展示。
- 排序 `sort ∈ {updated_desc(默认), name_asc, lang}`；筛选 `lang ∈ {python,cpp,all}`。

---

### 6. 响应式 / 移动端
- **≥1200px**：瓷片 4 列 + 版本抽屉从右滑入(360px)覆盖，不挤压网格。
- **768–1199px**：瓷片 2–3 列；工具条右侧筛选/排序收进「⚙ 筛选」下拉。
- **<768px（移动竖屏）**：瓷片单列（保留云端徽标 + 版本徽标）；工具条 4 按钮变底部吸底浮动条或「＋」FAB 展开；**版本历史抽屉改为全屏 `el-drawer direction=bottom` 或全屏页**；离线 toast 顶部吸附。
- 所有玻璃面板在移动端降低 blur 到 12–16px 保性能；触控目标 ≥44px。

---

### 7. 逐条验收点（Acceptance）
1. `/works` 需登录访问；未登录跳 `/login`（复用现有守卫）。
2. 首屏拉 `GET /works`，加载有骨架、成功渲染瓷片、失败有区块级「重试」，无作品有 🐢 空态。
3. 每张瓷片正确显示：标题、语言 chip(Python/C++)、版本徽标 `v{latest_version}`、相对更新时间、云端徽标（云端已保存/仅本地两态）。
4. 工具条 4 项功能可用：新建(弹窗+乐观插入)、上传(格式/大小校验+失败原因)、下载 .zip(单/多选)、默认云端 toggle(持久化+影响保存目标)。
5. 点作品「历史」或标题 → 右侧版本抽屉滑入，`GET /versions` 降序展示；「v{latest}·当前」橙色高亮；深链 `?work=&drawer=history` 可直接展开。
6. 版本「预览」只读、「恢复」二次确认且**恢复生成新版本**（版本号+1，不覆盖），成功提示新版本号。
7. 删除/恢复均二次确认；操作按钮有 loading 态防重复提交。
8. **离线**：断网时出现「离线中 · 已留本地草稿」toast，编辑写入本地草稿，云端徽标灰化，下载/上传禁用；「重试同步」可手动同步，恢复在线自动同步一次并清草稿。
9. 所有接口走 `/api/v1` + `{code,message,data}` + JWT；前端读 `res.code/res.data`；仅能访问本人作品(越权返 1001)。
10. 视觉：玻璃(半透白 rgba(255,255,255,.55–.7)+blur 18–24+1px 高光内描边)、瓷片(圆角24+pastel 渐变+柔长阴影+hover 微抬)、卡通 3D 图标齐全；配色/圆角符合学生端设计系统；文案全简体中文。
11. `npm run build`（vue-tsc）零类型错误后方可交付。
12. 移动端(<768px)瓷片单列、抽屉全屏、工具条吸底/FAB，交互与桌面等价。

---

### S9 · 教师预警工作台首页

#### 🎨 ChatGPT 生图提示词

##### ChatGPT 出图提示词 · 教师预警工作台首页（16:9 桌面高保真 UI 参考图）

> 用法：把下面「英文段」整段粘贴进 ChatGPT（网页版）生成图片；「中文校对段」用于逐区核对文案与布局，不必让模型渲染大段中文正文，只保留关键中文标签。

---

##### ① English prompt (paste this to generate the image)

Create **one single 16:9 desktop web UI mockup** (1920×1080, full-bleed dashboard, no browser chrome, no device frame) — a **high-fidelity SaaS dashboard design** at Dribbble / Behance quality, pixel-crisp, sharp, professional.

**Product context:** teacher-facing **"Student Early-Warning Workbench / home dashboard"** for a K-12 AI programming-learning platform (AI turtle mascot, pair-programming). This is the **teacher / admin side** — it must feel calmer, cooler and more professional than the student side.

**Overall style — strictly combine three languages:**
- **Glassmorphism**: frosted translucent white panels `rgba(255,255,255,0.6)`, backdrop blur 18–24px, 1px inner top highlight stroke, soft diffused shadows, rounded corners 22–28px. Use for the top nav pill, grouped panels, floating cards.
- **Ceramic tile**: softly rounded cards (radius 22–28) with pale pastel gradient fills, one glossy 3D icon top-left or centered, title + tiny subtitle + mini action pill, long soft shadows, gentle hover lift; arranged in a **bento grid**.
- **Cartoon 3D / glossy clay**: rounded, cute, child-friendly 3D-rendered icons and mascots, soft shadows, no error text or watermark.

**Teacher-side color palette (cool & professional):** professional blue `#3B82F6`, teal-green `#2EC4B6`, clean white cards, on a light blue-grey background `#F4F7FB`. Accent severity colors: warning red `#EF4444` (high risk) and amber `#F59E0B` (medium risk). Small pastel touches (lavender / mint) only as subtle fills. Font: Inter / clean sans-serif. This palette must look clearly distinct from (cooler than) a warm-orange student side.

**Layout (fixed regions, left-to-right, top-to-bottom):**

1. **Top navigation bar (full width, glass pill on white):** left = small glossy 3D turtle-with-graduation-cap logo + wordmark "海龟学院". Center = horizontal nav tabs: **首页 · 预警中心 · 班级任务 · 学情详情** (first tab "首页" active, blue underline/pill). Right = a **glass identity-switch pill toggle "教师 / 管理员"** (segmented), a bell notification icon with a small red badge, and a round teacher avatar + name label "李老师".

2. **Left welcome hero band (spanning ~40% width, under nav):** a **glass card** with a **cute cartoon 3D teacher turtle** (green body, orange hoodie, round glasses, holding a tablet / pointer) waving on the left; to its right a greeting line (placeholder "早上好，李老师 👋") and one short subtitle line, plus a small blue pill button "查看今日预警".

3. **KPI row — 4 ceramic-tile stat cards** (top-right area, equal width bento tiles), each = glossy isometric 3D icon top-left + a **big bold number** + tiny Chinese label + a small up/down trend chip:
   - Tile 1 (blue): 3D group-of-students icon — 学生总数 · big number "1,248"
   - Tile 2 (teal): 3D green online-dot / signal icon — 在线学生 · "326" · green ↑ chip
   - Tile 3 (lavender): 3D paper/checkmark icon — 今日提交 · "892"
   - Tile 4 (red-accent): 3D warning-triangle icon — 待介入 · "17" · red pulse chip
   Give Tile 4 a subtle red glow to signal urgency.

4. **Middle-left data card — "班级计算思维雷达":** a glass/white card titled "班级计算思维六维" containing a **6-axis radar / spider chart** (blue-teal translucent filled polygon) with 6 axes labeled: 抽象 · 分解 · 建模 · 算法设计 · 验证优化 · 迁移. One filled series, soft gradient fill.

5. **Middle-right data card — "学习任务漏斗":** a glass/white card titled "学习任务完成漏斗" with a clean **4-stage funnel chart** (blue→teal gradient stages), stage labels 已发布 · 已开始 · 已提交 · 已达标, each stage showing a small percentage.

6. **Bottom-left — "预警中心" alert list card (glass panel, taller):** title "预警中心" + a small "查看全部" link. A vertical list of **5–6 alert rows**, each row = small round student avatar + student name placeholder + short reason label + a **severity chip on the right**: red pill "高危" for 2 rows, amber pill "中危" for the rest, plus a tiny category tag (e.g. 连续报错 / 长时间未提交 / 求助过多) and a small "介入" action link. Newest/high-risk rows at top with a faint red left border.

7. **Bottom-right — "学生学情" table card (white card):** title "学生学情" with columns: 学生 / 班级 / 进度 / 计算思维 / 状态 / 操作. Show 5–6 rows: avatar+name, class tag, a thin progress bar, a mini score, a colored status dot, and a small blue **"学情"** drill-down button on the far right of each row.

**Mood:** clean, trustworthy, data-driven education command-center; airy spacing, consistent 22–28px rounded corners everywhere, soft long shadows, glossy 3D accents floating slightly above the glass. Everything crisp and aligned to a bento grid. **All visible UI text is in Simplified Chinese**, short labels only (use the Chinese labels named above); render numbers as real digits; do NOT render long paragraphs — keep body text as short pill labels or thin placeholder bars.

Negative: no dark mode, no orange-dominant student theme, no gibberish/garbled text, no watermark, no photographic realism, no 3D perspective distortion of the page, no mobile frame.

---

##### ② 中文校对段（逐区核对，不必让模型渲染大段正文）

- **整体**：一张 16:9 桌面网页高保真 UI 大屏，玻璃拟态 + 陶瓷瓷片 + 卡通3D 三语言融合；**教师端冷静专业配色** = 专业蓝 `#3B82F6` + 青绿 `#2EC4B6` + 白卡 + 浅蓝灰底 `#F4F7FB`，严重度用红 `#EF4444`（高危）/ 琥珀 `#F59E0B`（中危）。圆角 22–28，Inter 字体。**界面文字全部简体中文、短标签**。
- **① 顶部蓝导航条（玻璃胶囊）**：左=戴学士帽的 3D 小海龟 logo + 文字「海龟学院」；中=导航「**首页 / 预警中心 / 班级任务 / 学情详情**」，「首页」高亮；右=**身份切换胶囊「教师 / 管理员」** + 消息铃铛(红点) + 教师头像与名字「李老师」。
- **② 左侧欢迎区（玻璃卡）**：卡通3D 教师海龟（绿身+橙卫衣+圆眼镜+抱平板）挥手；文案「早上好，李老师」+ 一行副标题 + 蓝色胶囊按钮「查看今日预警」。
- **③ KPI 四瓷片**（等距 3D 图标 + 大数字 + 中文小标签 + 涨跌 chip）：**学生总数 1,248 / 在线学生 326↑ / 今日提交 892 / 待介入 17**（第 4 张带红色告警微光）。
- **④ 班级计算思维雷达**：标题「班级计算思维六维」，六轴雷达 = **抽象 / 分解 / 建模 / 算法设计 / 验证优化 / 迁移**，蓝青半透明填充。
- **⑤ 学习任务漏斗**：标题「学习任务完成漏斗」，四段漏斗 **已发布 / 已开始 / 已提交 / 已达标**，蓝→青渐变，每段带百分比。
- **⑥ 预警中心列表（玻璃面板）**：标题「预警中心」+「查看全部」。每行=学生头像+姓名+简短原因+右侧**严重度 chip**（红「高危」/ 黄「中危」）+ 类别标签（连续报错 / 长时间未提交 / 求助过多）+「介入」小按钮；高危行置顶、左侧淡红边。
- **⑦ 学生学情表（白卡）**：列 **学生 / 班级 / 进度 / 计算思维 / 状态 / 操作**；每行头像+姓名+班级标签+细进度条+分数+状态点+蓝色「**学情**」下钻按钮。
- **氛围**：教育指挥中心，通透留白、统一圆角、柔长阴影、3D 元素轻浮于玻璃之上。禁止：深色模式、橙色学生主题、乱码文字、水印、手机边框。

> 若需移动端：另出三联竖屏图（375×812），分别为「KPI 概览 / 预警中心列表 / 学情表折叠卡」三屏，沿用同一玻璃+瓷片+冷色系。

#### 🛠️ Codex 开发规格

##### Codex 开发规格 · 教师预警工作台首页（teacher_dashboard）

> 目标：照参考图落地 **教师端预警工作台首页**，改造现有 `frontend/src/views/admin/Dashboard.vue`（保留其为默认 `/admin` 首页），并补齐后端聚合 API。严格遵循本仓库约定：**`/api/v1/...` 前缀 + `{code,message,data}` 信封 + JWT Bearer + `require_admin`**。前端 Vue3 `<script setup>` + TS + Element Plus + ECharts；数据经 `services/mock.ts`「真实后端优先 + localStorage 回退」层。

---

##### 1. 路由

- **复用** `frontend/src/router/index.ts` 现有 `/admin`（`AdminLayout` 的默认子路由 `Dashboard`）。本屏即 `/admin`（首页）。
- `meta: { role: 'admin' }`，`beforeEach` 已按 `userStore.token` + `meta.role` 守卫，无需新增守卫逻辑。
- 顶部导航四个 Tab 对应现有/邻接路由：
  - **首页** → `/admin`（本屏，active）
  - **预警中心** → `/admin/alerts`（新增，可先占位路由指向本屏的「预警中心」全量列表页；本次至少把「查看全部」链接指过去）
  - **班级任务** → `/admin/assignments`（已存在 `Assignments.vue`）
  - **学情详情** → `/admin/report/:id`（已存在 `StudentReport.vue`，下钻入口）
- **身份切换胶囊**「教师 / 管理员」为 UI 段控；当前用户 role 从 `stores/user.ts` 读取，切换仅影响可见模块/文案（本期可做纯前端视图切换，不改后端角色）。

##### 2. 页面结构与组件树

```
AdminLayout (已存在，含顶部蓝导航 + 身份切换胶囊 + 教师名/头像)
└─ Dashboard.vue  ← 本屏（改造）
   ├─ <TeacherWelcomeHero>        欢迎区：3D 教师海龟 + 问候 + 「查看今日预警」按钮
   ├─ <KpiTiles>                  KPI 瓷片×4（学生总数/在线/今日提交/待介入）
   │   └─ <KpiTile> ×4            props: icon, label, value, trend, variant('blue'|'teal'|'lavender'|'danger')
   ├─ <div class="bento-charts">
   │   ├─ <ThinkingRadarCard>     班级计算思维六维雷达（ECharts radar）
   │   └─ <TaskFunnelCard>        学习任务完成漏斗（ECharts funnel）
   └─ <div class="bento-lists">
       ├─ <AlertCenterCard>       预警中心列表（severity chip + 类别 + 介入）
       │   └─ <AlertRow> ×N
       └─ <StudentStatusTable>    学生学情表（Element Plus el-table，「学情」下钻）
```

- 新增组件放 `frontend/src/components/teacher/`（或就近于 `components/`）。图表统一用 ECharts（项目已用于 ThinkingDashboard）。
- **计算思维六维**轴固定：`抽象 / 分解 / 建模 / 算法设计 / 验证优化 / 迁移`（与设计系统一致；注意：现有 `ThinkingDashboard.vue` 是 4 维“分解/抽象/算法/调试”，本卡为**班级级 6 维**，独立组件，不复用其数据结构）。

##### 3. 关键交互

1. KPI「待介入」瓷片点击 → 跳 `/admin/alerts`（或滚动定位到「预警中心」卡）。
2. 预警行「介入」按钮 → 打开介入抽屉/弹窗（Element Plus `el-drawer`）或直接跳该生 `/admin/report/:id`；「查看全部」→ `/admin/alerts`。
3. 学情表每行「学情」按钮 → `router.push('/admin/report/' + studentId)`（复用 `StudentReport.vue`）。
4. 身份切换胶囊「教师/管理员」→ 切换本地视图态（`ref`），管理员视图可多显示「班级管理」等入口。
5. 雷达/漏斗支持班级筛选胶囊（可选，二期）：切换 `classId` 重新请求。
6. 悬浮微抬：瓷片/卡片 `:hover` 轻微 translateY(-4px) + 阴影加深（设计系统要求）。

##### 4. 状态（加载 / 空态 / 错误 / 无数据）

每个数据卡独立管理 `loading / error / empty`：
- **加载**：卡片内 Element Plus `v-loading` 骨架（KPI 数字用骨架条，图表用占位）。
- **错误**：卡片内联错误态 + 「重试」按钮（不弹全局 message 打断），保留卡片外框。
- **空态 / 无数据**：
  - KPI 无数据显示 `--`。
  - 雷达/漏斗无数据显示居中插画 + 「暂无数据」小字。
  - 预警列表为空 → 友好空态「🎉 当前无预警，全班状态良好」。
  - 学情表为空 → Element Plus `el-empty`。
- **401** 由 `api/index.ts` 响应拦截器统一跳 `/login`，本屏不重复处理。

##### 5. 数据与 API 契约

> 全部 `GET`，需要 `Authorization: Bearer <token>`，后端 `require_admin`。响应统一 `{code:0, message:"ok", data:{...}}`；前端经 `UnwrappedApi` 读 `res.data`。前端封装写入 `services/mock.ts`（真实后端优先，失败回退 localStorage mock，保证无后端也能渲染）。

### 5.1 KPI 概览 — 复用/扩展 `GET /api/v1/admin/overview`
（若已存在于 `admin.py` 则扩展字段；否则新增）
```json
{ "code":0, "message":"ok", "data":{
  "totalStudents":1248, "onlineStudents":326, "onlineTrend":+12,
  "todaySubmissions":892, "pendingInterventions":17
}}
```

### 5.2 班级计算思维六维 — 扩展 `GET /api/v1/thinking/summary?scope=class&classId=<id?>`
（现有 `thinking.py` 已有 `/thinking/summary`，本期加班级级 6 维聚合；classId 缺省=全校）
```json
{ "code":0,"message":"ok","data":{
  "dimensions":["抽象","分解","建模","算法设计","验证优化","迁移"],
  "scores":[78,84,66,71,59,63], "max":100
}}
```

### 5.3 学习任务漏斗 — 扩展 `GET /api/v1/admin/assignments/funnel?classId=<id?>`
（基于 `assignments.py` 的真实完成进度聚合）
```json
{ "code":0,"message":"ok","data":{ "stages":[
  {"key":"published","label":"已发布","count":1248,"pct":100},
  {"key":"started","label":"已开始","count":1010,"pct":81},
  {"key":"submitted","label":"已提交","count":892,"pct":71},
  {"key":"passed","label":"已达标","count":706,"pct":57}
]}}
```

### 5.4 预警中心列表 — 新增 `GET /api/v1/monitor/alerts?limit=8&severity=<high|medium?>`
（基于 `monitor.py` 的 activity 数据派生规则：连续报错 / 长时间未提交 / 求助过多）
```json
{ "code":0,"message":"ok","data":{ "items":[
  {"id":"a1","studentId":12,"studentName":"小明","avatar":null,
   "severity":"high","category":"连续报错","reason":"近30分钟报错9次未通过",
   "className":"初一(2)班","createdAt":"2026-07-02T09:12:00Z"},
  {"id":"a2","studentId":34,"studentName":"小华","avatar":null,
   "severity":"medium","category":"长时间未提交","reason":"作业逾期未提交",
   "className":"初一(3)班","createdAt":"2026-07-02T08:40:00Z"}
]}}
```
- `severity` 枚举：`high`（红「高危」）/ `medium`（黄「中危」）。前端映射 chip 颜色 `#EF4444` / `#F59E0B`。

### 5.5 学生学情表 — 新增/扩展 `GET /api/v1/admin/students/status?page=1&size=8&classId=<id?>`
```json
{ "code":0,"message":"ok","data":{
  "total":126,
  "items":[
    {"id":12,"name":"小明","avatar":null,"className":"初一(2)班",
     "progress":0.72,"thinkingScore":81,"status":"warning"}
  ]
}}
```
- `status` 枚举：`good | normal | warning | risk` → 状态点绿/蓝/黄/红。
- 分页参数 `page/size`；前端 Element Plus `el-pagination`。

> **后端落地位置**：`overview`/`students/status` → `admin.py`；`alerts` → `monitor.py`；`summary(scope=class)` → `thinking.py`；`assignments/funnel` → `assignments.py`。所有新 handler 用 `success_response(...)`（`app/utils/response.py`）+ `Depends(require_admin)`。预警派生规则可先用简单阈值（报错次数/无活动时长/求助次数），后续再精细化。

##### 6. 响应式 / 移动端要点

- 断点：`>=1280px` 桌面 bento（KPI 一行 4 列，雷达/漏斗两列，预警/学情两列）；`768–1279px` KPI 2×2、图表堆叠为单列、列表纵向堆叠；`<768px` 全部单列，KPI 横向可滑动，学情表转为**卡片列表**（隐藏部分列，仅留姓名/进度/状态/「学情」）。
- 顶部导航在窄屏收为汉堡菜单，身份切换胶囊保留。
- 玻璃/瓷片圆角、blur、阴影在移动端保持一致；`backdrop-filter` 加 `-webkit-` 前缀并对不支持浏览器回退为半透明纯色。
- 触摸目标 ≥44px；表格横向溢出用 `overflow-x:auto` 容器，不撑破页面。

##### 7. 设计还原要点（对齐设计系统）

- 背景 `#F4F7FB`；玻璃面板 `background:rgba(255,255,255,.6); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,.7); border-radius:24px; box-shadow:0 12px 32px rgba(59,130,246,.10)`。
- 主色蓝 `#3B82F6`、青绿 `#2EC4B6`；严重度红 `#EF4444`、琥珀 `#F59E0B`；圆角令牌 sm12/md16/lg22/pill999；字体 Inter/系统无衬线。
- 3D 图标/海龟用 `src/assets/generated/`（若缺失走 `assets.ts` 回退占位，勿硬编码路径）。
- 与学生端**明显区分**：整体更冷、更专业，禁用橙色为主色。

##### 8. 逐条验收点（Definition of Done）

1. 访问 `/admin` 渲染本屏，未登录/非 admin 被 `beforeEach` 拦截跳 `/login`。
2. 顶部蓝导航含四 Tab（首页高亮）+ 身份切换胶囊 + 铃铛红点 + 教师名/头像；四 Tab 均可点击并正确跳转（预警中心可先占位）。
3. 欢迎区显示 3D 教师海龟 + 问候 + 「查看今日预警」按钮，按钮点击跳预警中心。
4. KPI 四瓷片显示真实/回退数字（学生总数/在线/今日提交/待介入），含涨跌 chip；「待介入」瓷片带红色告警样式且可点击。
5. 计算思维雷达为 6 轴（抽象/分解/建模/算法设计/验证优化/迁移），数据来自 `/thinking/summary?scope=class`，无数据显示空态。
6. 任务漏斗 4 段（已发布/已开始/已提交/已达标）带百分比，数据来自 `assignments/funnel`。
7. 预警列表每行含头像+姓名+原因+严重度 chip（红「高危」/黄「中危」）+ 类别标签 + 「介入」；高危置顶；空态显示「无预警」友好文案；「查看全部」跳 `/admin/alerts`。
8. 学情表列齐（学生/班级/进度/计算思维/状态/操作），进度条+状态点渲染正确；每行「学情」跳 `/admin/report/:id`；分页可用。
9. 每个数据卡独立 loading/error/empty，断网时走 `mock.ts` localStorage 回退仍可渲染（不白屏）。
10. 所有新接口遵循 `/api/v1` 前缀 + `{code,message,data}` 信封 + `require_admin`；前端请求带 Bearer；401 统一跳登录。
11. 响应式：1280 桌面 bento、平板 2×2/堆叠、手机单列+学情卡片化，均无横向溢出。
12. `cd frontend && npm run build`（vue-tsc 类型检查）**通过**；`cd backend && python -m pytest` 现有 smoke 测试不回归（新增 admin 接口补最小鉴权/200 用例）。
13. 视觉：全屏统一玻璃+瓷片+冷色系，圆角 22–28、柔长阴影、3D 元素轻浮，界面文字全简体中文，与学生端暖橙风明显区分。

---

### S10 · 教师班级/任务管理

#### 🎨 ChatGPT 生图提示词

##### 🎨 ChatGPT 出图提示词（复制粘贴到 ChatGPT 网页版 · GPT-4o / DALL·E 生图）

> 用途：生成一张 **16:9 桌面高保真 UI 参考图**（Teacher · Class & Assignment Management）。先英文稳定出图，再中文校对。

---

### PART 1 — English prompt (paste this to generate the image)

**A complete, pixel-perfect desktop web app UI mockup — 16:9 landscape, 1600×900, Dribbble / Behance top-shot quality, high-fidelity SaaS dashboard, NOT a photo, NOT a device frame.** This is the **Teacher "Class & Assignment Management"** screen of an AI coding-education platform for middle-school students ("AI Little Turtle · Pair Programming").

**Overall style — Glassmorphism + Ceramic Tile + Cartoon 3D, professional/cool teacher variant:**
- Background: a calm cool light gradient, blue-grey `#F4F7FB` fading to soft white, with two very soft out-of-focus color blobs (professional blue `#3B82F6` and teal `#2EC4B6`) glowing faintly behind the glass. Clean, airy, plenty of breathing room.
- **Frosted-glass panels** everywhere: semi-transparent white `rgba(255,255,255,0.62)`, heavy `backdrop-blur` (~20px), a crisp 1px inner top highlight stroke, soft long ambient shadow, large corner radius 24px. Used for the nav pill, grouped panels, floating cards and the modal.
- **Ceramic tiles**: rounded soft cards (radius 24px), pastel-tint fills, a glossy 3D icon top-left of each, title + tiny grey subtitle + a mini pill button; long soft drop shadow; slight lift on the focused one.
- **Cartoon 3D elements**: glossy clay-render, rounded, cute, child-friendly, soft shadows, NO garbled text on them.

**Layout (three horizontal zones):**

1. **Top bar (full-width frosted-glass pill), height ~64px:** left = a small glossy 3D green turtle mascot wearing an orange hoodie and round glasses, next to a compact wordmark "小海龟" + subtitle "教师工作台". Center = a segmented glass tab bar with 4 pills, the active one filled professional-blue `#3B82F6`: 概览 · **班级管理(active)** · 任务下发 · 学情预警. Right = a search field, a bell icon with a small teal dot, and a **role-switch capsule** showing a teacher avatar "王老师" with a caret and a tiny "教师" chip. Everything blue-cool, professional, uncluttered.

2. **Left column — Class list panel (frosted glass, width ~34%):** header "班级列表" with a blue rounded **"+ 新建班级"** button top-right. Below it a vertical list of **4 ceramic class cards**, each: a glossy 3D pastel icon (graduation cap / classroom), a bold class name label ("七年级(1)班", "七年级(2)班", "八年级(3)班", "创客社团"), a small grey line "grade · 32 人", a tiny stacked-avatar cluster (3 round student avatars + "+29"), and on the right a small teal circular **completion-rate ring** showing a big % number (e.g. 78%). One card is in a selected/highlighted state (blue 1px glow ring). Row hover shows tiny edit ✏️ / delete 🗑 glass icon buttons.

3. **Right column — two stacked glass panels (width ~62%):**
   - **Top-right = "任务下发" form panel (frosted glass, bento inner grid):** title "下发新任务" with a small glossy 3D paper-plane icon. Form fields laid out in a tidy 2-column grid with soft inset glass inputs and floating labels: **任务标题** (text input), **编程语言** (segmented pill: Python / C++, Python active orange), **关联题库** (multi-select chips: "两数之和 ×", "循环打印 ×", "+ 添加"), **下发班级** (multi-select class chips), **截止时间** (date-time picker input with calendar icon). On the far right of this panel a **large completion-rate donut ring** (teal→blue gradient stroke, ~72%) with center big number "72%" and caption "真实提交完成率", plus a small legend "已完成 23 / 32". Bottom of form: a ghost "存草稿" button + a filled blue **"发布任务"** button.
   - **Bottom-right = "学生名册穿梭选择" transfer panel (frosted glass):** two side-by-side glass list boxes with a middle column of two round arrow buttons ( → and ← ). Left box header "未分配学生 (18)" with a search field and checkbox rows of student names + avatars ("张伟", "李娜", "王芳"…). Right box header "本班学生 (14)" with the selected students. A small footer count line and a blue "保存分配" button. Cartoon-clean checkboxes, pastel row hovers.

**A small floating cartoon-3D detail (bottom-right corner, outside panels):** the glossy turtle mascot peeking with a checklist clipboard, or a tiny blue-white robot "智伴" navigator sprite — cute, encouraging, professional.

**Materials & palette (strict):** professional blue `#3B82F6`, teal `#2EC4B6`, white glass cards, blue-grey base `#F4F7FB`; accent orange `#F5A623` ONLY on the Python pill and one status chip. Inter font, rounded corners sm12 / md16 / lg22 / pill999. Status chips: "进行中"(blue), "已截止"(grey), "草稿"(amber). 

**All interface text is Simplified Chinese**, but keep body text minimal — use short crisp labels/placeholders only, do NOT render long Chinese paragraphs; big numbers and % are fine. Sharp, clean, no watermark, no lorem gibberish, no misspelled Latin. Cohesive, premium, calm, teacher-professional. 16:9.

---

### PART 2 — 中文分区校对（核对界面文案，勿让模型渲染大段正文）

- **顶部导航胶囊（磨砂玻璃）**：左「🐢小海龟 · 教师工作台」；中间 4 个分段 Tab —「概览 / **班级管理(选中·蓝底)** / 任务下发 / 学情预警」；右侧搜索框 + 铃铛(青绿小红点) + 身份切换胶囊「王老师 ▾ · 教师」。整体冷静专业蓝，与学生端暖橙明显区分。
- **左栏「班级列表」面板**：标题栏右上「+ 新建班级」蓝色按钮；下方 4 张瓷片班级卡，每张含：3D 玻璃图标 + 班级名（七年级(1)班 / (2)班 / 八年级(3)班 / 创客社团）+ 小灰字「年级 · 32 人」+ 头像堆叠（+29）+ 右侧青绿**完成率环**（大号 %）。选中卡有蓝色 1px 高光描边；悬浮出现✏️编辑 / 🗑删除玻璃小按钮。
- **右上「下发新任务」表单面板**（bento 内格）：字段「任务标题」输入框、「编程语言」分段胶囊(Python 橙选中 / C++)、「关联题库」多选 chip（两数之和 ×、循环打印 ×、+ 添加）、「下发班级」班级多选 chip、「截止时间」日期时间选择器；右侧**大号完成率甜甜圈环**（青→蓝渐变，中心「72%」，副标「真实提交完成率」，图例「已完成 23 / 32」）；底部「存草稿」幽灵按钮 +「发布任务」蓝色实心按钮。
- **右下「学生名册穿梭选择」面板**：左右两个玻璃列表框 + 中间两个圆形箭头（→ / ←）。左框头「未分配学生 (18)」+ 搜索 + 勾选行（张伟 / 李娜 / 王芳…）；右框头「本班学生 (14)」；底部计数 +「保存分配」蓝色按钮。
- **右下角浮动卡通 3D 元素**：小海龟抱清单夹 / 蓝白小机器人「智伴」领航员，可爱鼓励、专业。
- **状态 chip**：进行中(蓝) / 已截止(灰) / 草稿(琥珀)。字体 Inter，圆角 sm12/md16/lg22/pill999。

> 📱 **移动端三联图（可选，另出一张）**：竖屏 375×812 三联 —（1）班级列表卡片流 + 底部「+ 新建班级」悬浮按钮；（2）任务下发表单为单列纵向 + 顶部完成率环；（3）学生名册穿梭改为上下两段 + 中间「移入/移出」按钮。同一玻璃+瓷片+专业蓝设计语言。

#### 🛠️ Codex 开发规格

##### 🛠 Codex 开发规格 — 教师「班级 / 任务管理」屏（screen_id: `teacher_classes`）

> 目标：照参考图，用 **Vue3 `<script setup>` + TS + Element Plus + ECharts** 落地本屏，接真实 FastAPI 后端。后端 CRUD/进度接口**已存在**（见下文契约），本屏以**前端为主**、辅以少量后端校验。所有约定严格遵循仓库规范：`/api/v1/...` 前缀、`{code,message,data}` 信封、JWT Bearer(`require_admin`)、`services/mock.ts` 真后端优先 + localStorage 兜底。

---

### 1. 路由与页面归属
- 路由：`/admin/classes`（`router/index.ts` 的 admin 嵌套路由，`meta:{ role:'admin' }`，经 `beforeEach` 守卫 `userStore.token`）。
- 顶部导航 Tab 与其它 admin 页共用蓝色专业导航；本 Tab 高亮「班级管理」。
- 页面组件建议：`views/admin/ClassManageView.vue`（容器），拆分子组件：
  - `components/admin/ClassListPanel.vue`（左栏 CRUD）
  - `components/admin/AssignmentForm.vue`（右上任务下发表单 + 完成率环）
  - `components/admin/StudentTransfer.vue`（右下穿梭选择）
  - `components/admin/CompletionRing.vue`（复用完成率环，ECharts gauge/doughnut 或纯 SVG）
  - `components/admin/ClassEditDialog.vue`（新建/编辑班级玻璃弹窗）

### 2. 组件树（结构）
```
ClassManageView
├─ AdminTopNav (共用, active="classes")
├─ .layout (flex, 左34% / 右62%)
│  ├─ ClassListPanel
│  │  ├─ header: 标题 + [+ 新建班级]
│  │  ├─ v-for ClassCard(选中态/悬浮 编辑·删除)
│  │  │   └─ CompletionRing(mini, class 维度可选)
│  │  └─ 空态 / 加载骨架 / 错误重试
│  └─ .right-col (纵向堆叠)
│     ├─ AssignmentForm
│     │  ├─ 字段: 标题 / 语言分段 / 关联题库多选 / 下发班级多选 / 截止时间
│     │  ├─ CompletionRing(large, 由 progress 接口驱动)
│     │  └─ footer: [存草稿] [发布任务]
│     └─ StudentTransfer (el-transfer 或自绘双列表 + 箭头)
├─ ClassEditDialog (玻璃 modal)
└─ 全局: loading / empty / error toast
```

### 3. 关键交互
1. **班级 CRUD**：新建/编辑走 `ClassEditDialog`（字段 name 必填、grade、description）；删除二次确认（`el-messagebox`，文案「删除后该班级的学生分配将解除，确认删除？」）。列表按 `id desc`。
2. **选中班级**：点击班级卡 → 高亮 + 联动右下「学生名册穿梭」加载该班 `student_ids`；也作为「下发班级」多选的默认预选。
3. **学生穿梭分配**：左「未分配」= 全体学生 − 本班；右「本班」= `class.student_ids`；→/← 移动只改本地状态，点「保存分配」才提交。保存策略二选一（与后端一致）：
   - 增量加人：`POST /classes/{id}/students {student_ids}`（只增不减）；
   - 全量覆盖：`PUT /classes/{id} {student_ids}`（整表替换，**支持移除**）。**推荐用 PUT 全量覆盖**，因为穿梭框需支持「移出学生」，后端 update 已实现整表替换语义。
4. **任务下发**：填表 → 「发布任务」`POST /assignments`（status:`published`）；「存草稿」同接口 status:`draft`。语言分段(python/cpp)驱动「关联题库」选项按语言过滤。
5. **完成率环**：任务发布/选中后调用 `GET /assignments/{id}/progress` → `{total,done,rate}`，环用 `rate` 百分比，中心大数字，副标「真实提交完成率」，图例「已完成 done / total」。**这是真实提交驱动**（后端按班级学生中有 `execution_status='success'` 提交的占比计算），非本地估算。

### 4. 状态设计（加载 / 空 / 错误 / 无数据）
- **加载**：列表 3–5 张骨架瓷片卡；表单禁用 + 按钮 loading；环显示灰色占位 dash。
- **空态**：班级为空 → 居中卡通小海龟插画 + 「还没有班级，点击右上『新建班级』开始」；穿梭「未分配」为空 → 「所有学生都已分配」；题库为空 → 「该语言暂无关联题目」。
- **错误**：接口失败 toast「加载失败，请重试」+ 面板内「重试」按钮；`mock.ts` 已 try/catch 回落 localStorage，UI 层再叠一层 toast 即可。
- **无数据完成率**：`total=0` 时 `rate=0`，环显示 0% + 副标「暂无学生」。

### 5. 数据 & API 契约（真实后端，全部 `{code,message,data}` 信封 + JWT `require_admin`）

**学生名册**
- `GET /api/v1/admin/students` → `data: [{id, username, real_name, class_name, student_id, is_active}]`

**班级 CRUD + 分配**（前端经 `mock.ts` 的 `classesApi`）
- `GET  /api/v1/admin/classes` → `data: ClassInfo[]`
- `POST /api/v1/admin/classes` body `{name, grade?, description?}` → `data: ClassInfo`（201）
- `PUT  /api/v1/admin/classes/{id}` body `{name?, grade?, description?, student_ids?}` →（`student_ids` **整表替换**，可增可删）`data: ClassInfo`
- `DELETE /api/v1/admin/classes/{id}` → `message:'删除成功'`
- `POST /api/v1/admin/classes/{id}/students` body `{student_ids:number[]}` →（**只增不减**）`data: ClassInfo`
- `ClassInfo = { id, name, grade, description, student_ids:number[], created_at }`

**任务下发 + 进度**（前端经 `assignmentsApi`）
- `GET  /api/v1/admin/assignments` → `data: Assignment[]`
- `POST /api/v1/admin/assignments` body `{title, description?, language, exercise_ids?:number[], class_ids?:number[], due_at?:ISO, status:'published'|'draft'}` → `data: Assignment`（201）
- `PUT  /api/v1/admin/assignments/{id}` （部分字段可选）
- `DELETE /api/v1/admin/assignments/{id}`
- `GET  /api/v1/admin/assignments/{id}/progress` → `data:{ total:number, done:number, rate:number }`（**真实提交驱动**）
- `Assignment = { id, title, description, language, exercise_ids:number[], class_ids:number[], due_at:string|null, status, created_at }`
- ⚠️ `due_at` 前端传 ISO 字符串（后端 `_parse_iso` 会解析；带 `Z` 也可）。

**题库（关联题库下拉/多选源）**
- `GET /api/v1/practice/recommend?language=python|cpp` → `data:[{id,title,description,difficulty,tags}]`（按语言过滤，用于「关联题库」多选 chip 的候选）。
- 单题详情（可选预览）：`GET /api/v1/practice/{exercise_id}`。

> 落地要点：新增/改后端接触点时改 `services/mock.ts` 对应方法体即可，视图调用方 source-agnostic。axios 实例已在请求拦截器附 `Bearer`，响应拦截器已解包为 `{code,data}`，401 自动跳 `/login`。

### 6. 响应式 / 移动端要点
- 断点：`≥1280px` 左右双列（34% / 62%）；`768–1279px` 上下堆叠（班级列表在上，表单+穿梭在下）；`<768px` 单列全宽。
- 移动端「学生名册穿梭」退化为**上下两段 + 中间『移入/移出』按钮**（`el-transfer` 在窄屏体验差，自绘或换 Tab 切换「未分配/本班」）。
- 「关联题库/下发班级」多选 chip 在窄屏可横向滚动；完成率环缩小并移到表单顶部。
- 玻璃面板在移动端降低 `backdrop-blur`（性能）；触控目标 ≥44px。
- 表单在窄屏由 2 列 grid → 单列纵向。

### 7. 逐条验收点（Checklist）
1. ☐ `/admin/classes` 未登录/非 admin 被 `beforeEach` 拦截跳 `/login`；顶部 Tab「班级管理」高亮蓝色。
2. ☐ 班级列表从 `GET /classes` 渲染，按 `id desc`；后端不可用时回落 localStorage 且弹「离线」提示。
3. ☐ 「+ 新建班级」→ 弹窗 → `POST` 成功后列表头部插入新卡（乐观或 refetch），弹窗关闭，name 空校验生效。
4. ☐ 编辑班级 `PUT` 生效；删除有二次确认，成功后卡片移除。
5. ☐ 点击班级卡 → 选中高亮 + 右下穿梭加载该班 `student_ids`，且「下发班级」预选该班。
6. ☐ 穿梭框 →/← 移动仅改本地；「保存分配」调用 `PUT /classes/{id} {student_ids}`（**可移除学生**），保存后 `student_ids` 与右框一致。
7. ☐ 未分配框 = 全体学生 − 本班；两框搜索过滤可用；全部分配后未分配框显示空态。
8. ☐ 任务表单：标题必填、语言分段切换会过滤「关联题库」候选（调 `practice/recommend?language=`）。
9. ☐ 「发布任务」`POST /assignments status=published`；「存草稿」`status=draft`；`due_at` 以 ISO 提交且回显正确。
10. ☐ 完成率环由 `GET /assignments/{id}/progress` 的真实 `rate` 驱动，中心显示 `rate%`、图例 `done/total`；`total=0` 显示 0% + 「暂无学生」。
11. ☐ 加载态有骨架/禁用/loading；错误态有 toast + 重试；空态文案齐全（班级空 / 未分配空 / 题库空）。
12. ☐ 全站信封解包正确（读 `res.code`/`res.data`），JWT 自动附带，401 跳登录。
13. ☐ 设计一致性：玻璃面板(rgba .62 + blur 20 + 1px 高光 + 圆角24)、瓷片卡、专业蓝 `#3B82F6` / 青绿 `#2EC4B6`、蓝灰底 `#F4F7FB`，与学生端暖橙明显区分；状态 chip 颜色（进行中蓝/已截止灰/草稿琥珀）。
14. ☐ 三档响应式布局切换正确；移动端穿梭退化为上下两段可用。
15. ☐ `npm run build`（vue-tsc）零类型错误——这是唯一类型/lint 门禁，交付前必过。

---

### S11 · 教师学情可视化大屏(下钻)

#### 🎨 ChatGPT 生图提示词

##### ChatGPT 出图提示词（复制以下全部到 ChatGPT 网页版，附「教师后端界面.jpg」作为风格参考更佳）

---

### PART 1 — English prompt (for stable, high-fidelity generation)

**A single 16:9 desktop web UI mockup — a light-themed teacher learning-analytics big-screen dashboard (data cockpit / control-room style) for a K-12 AI programming-learning platform.** Dribbble / Behance level, ultra high-fidelity, crisp, professional, pixel-perfect, realistic UI rendering (NOT a poster, NOT an illustration). Full-bleed dashboard filling the entire 1920×1080 frame. Design language = **glassmorphism + ceramic-tile cards + cute cartoon 3D accents**, but in a **cool, professional "teacher-console" palette** clearly distinct from the playful student side.

**Global style & materials**
- Background: soft cool light gradient, pale blue-grey `#F4F7FB` washing into white, with two very faint blurred color blobs (professional blue `#3B82F6` and teal `#2EC4B6`) glowing behind the glass — subtle, desaturated, calm.
- Frosted-glass panels: translucent white `rgba(255,255,255,0.62)`, `backdrop-blur 20px`, 1px inner top highlight stroke, soft long drop shadow, corner radius 24px. Used for the top nav pill, KPI hero strip, and each chart panel.
- Ceramic-tile cards: rounded 24px, faint pastel gradient fills, a glossy 3D icon top-left, thin title + tiny subtitle, soft long shadow, slight hover-lift feel.
- Cartoon 3D: glossy clay / 3D-rendered, rounded, cute, child-friendly, soft shadows — used sparsely as accents only (a big screen is data-dense, so keep 3D to ~10% of the canvas, never covering charts).
- Typography: Inter / clean geometric sans. Large bold KPI numbers, small muted labels. All UI copy is **Simplified Chinese** — render short crisp Chinese labels only, NO long paragraphs, no lorem, no gibberish, no misspelled text.

**Layout (top → bottom, describe every zone)**

1. **Top title bar (full-width frosted-glass pill), height ~72px.** Left: a small 🐢 cartoon-3D turtle mascot (green body, orange hoodie, round glasses) + product wordmark "AI小海龟" and a screen title tab "**学情可视化大屏**". Center: segmented pill filter — three glass segments labeled "**全部年级**" / "**初一(3)班**" / "**本周**" with one active in blue. Right: a live "**更新于 14:32**" timestamp with a small pulsing green dot, a refresh circle-arrow icon, a fullscreen icon, and a round teacher avatar with an identity-switch chevron.

2. **KPI hero strip — a row of 4 frosted-glass stat tiles just under the nav.** Each tile: a glossy 3D icon top-left, one HUGE bold number, a tiny Chinese label under it, and a small up/down trend chip with a mini sparkline. The four tiles read: "**总提交 12,480**" (blue), "**活跃学生 326**" (teal), "**达标率 78%**" with a small ring gauge (orange `#F5A623`), "**平均用时 26min**" (purple `#7C6BF0`). Each has a subtle colored glow matching its metric.

3. **Main chart grid — a bento grid of frosted-glass chart panels filling the middle & bottom (this is the dense, professional heart of the screen).** Every panel has a small title top-left, a tiny "?"/more-dots icon top-right, and a real, believable ECharts-style visualization rendered crisply:
   - **(large, left)** "**班级计算思维六维分布**" — a horizontal **stacked bar chart**, 6 rows for the six dimensions (抽象 / 分解 / 建模 / 算法设计 / 验证优化 / 迁移), each bar split into pastel segments (优秀/良好/待提升) with a clean legend.
   - **(top-center)** "**能力雷达**" — a 6-axis **radar chart** comparing two classes (blue filled area vs teal outline), axis labels = the six dimensions in Chinese.
   - **(top-right)** "**学习漏斗**" — a 4-stage **funnel chart** (登录 → 编写 → 运行 → 达标) in a blue→teal gradient with percentages.
   - **(bottom-left/center wide)** "**近30天学习趋势**" — a smooth **multi-line / area line chart** with two series (提交数 blue, 求助数 teal), soft gradient fill under the lines, subtle grid.
   - **(bottom-center)** "**班级对比**" — a grouped **vertical bar chart**, 4–5 classes on the x-axis,达标率 bars in blue with a teal average line overlay.
   - **(bottom-right)** "**能力短板 TOP**" or "**预警学生**" — a compact **ranked list / heat strip** card with 3–4 rows, each row a name-placeholder + a small severity chip (red "高危" / amber "关注" / green "良好").
   - Optional tiny **donut / ring** in a corner tile: "**语言分布 Python / C++**".

4. **A single cartoon-3D character accent** floating tastefully in one corner or the center-right seam of the grid (do NOT cover charts): a glossy 3D **teacher-turtle** holding a clipboard, OR a small blue-and-white cute robot "智伴" (book-sprite / friendly AI reviewer) peeking from behind a panel, casting a soft shadow — reinforcing the AI teaching-assistant brand. Keep it small and premium, ~8-12% of canvas.

**Interaction affordance hints to render visually:** one chart panel shows a subtle "**下钻 →**" (drill-down) hover chip / a highlighted bar with a tooltip callout, to imply the panels are clickable to drill into a class → student. Cursor optional.

**Mood:** calm, authoritative, data-rich mission-control, yet warm and approachable because of the soft glass and one cute 3D accent — "a friendly command center for teachers." Cinematic soft studio lighting, gentle ambient occlusion, premium SaaS analytics aesthetic. Cool professional blues/teals dominate; orange/purple only as small metric accents. Balanced negative space, everything on a clean invisible grid, nothing cramped. No dark mode. No photographic realism of people — only the cartoon-3D mascot. Absolutely no watermark, no distorted text.

**Negative:** no dark background, no neon cyberpunk, no messy overlapping charts, no fake broken English text, no giant 3D character blocking data, no student-side candy overload, no 3D floor/room scene.

---

### PART 2 — 中文逐区校对（对照上面英文，核对每个区块与界面文案）

- **整体基调**：浅色玻璃数据大屏 / 指挥中心风；冷静专业蓝 `#3B82F6` + 青绿 `#2EC4B6` 为主，浅蓝灰底 `#F4F7FB`；暖橙/紫仅作 KPI 点缀，与学生端明显区分。玻璃磨砂面板（半透白 0.62 + 模糊 20px + 高光内描边 + 长柔投影 + 圆角 24）。卡通3D 只占约 10%，不遮挡图表。全部界面文字为**简体中文短标签**，禁止长段正文与乱码。
- **① 顶部标题条（整条玻璃胶囊，约 72px 高）**：左「🐢 AI小海龟 + 学情可视化大屏」；中「分段筛选胶囊：全部年级 / 初一(3)班 / 本周（一个高亮蓝）」；右「更新于 14:32（绿点脉动）＋刷新图标＋全屏图标＋教师头像＋身份切换箭头」。
- **② KPI 大数字条（4 张玻璃统计瓷片）**：`总提交 12,480`（蓝）｜`活跃学生 326`（青绿）｜`达标率 78%`（橙，带环形小仪表）｜`平均用时 26min`（紫）。每张：左上 glossy 3D 图标＋超大粗数字＋小灰标签＋涨跌小胶囊＋迷你 sparkline。
- **③ 图表 bento 网格（大屏密集主体，ECharts 专业风）**：
  - 左大：**班级计算思维六维分布**（水平堆叠柱，6 行＝抽象/分解/建模/算法设计/验证优化/迁移，分「优秀/良好/待提升」pastel 段＋图例）。
  - 上中：**能力雷达**（6 轴雷达，两班对比：蓝填充 vs 青绿描边）。
  - 上右：**学习漏斗**（4 层：登录→编写→运行→达标，蓝到青绿渐变＋百分比）。
  - 下宽：**近30天学习趋势**（双线面积图：提交数蓝 / 求助数青绿，线下柔和渐变）。
  - 下中：**班级对比**（分组竖柱，4–5 个班的达标率＋青绿均值线）。
  - 下右：**预警学生 / 能力短板 TOP**（紧凑排行列表，3–4 行：姓名占位＋严重度 chip：高危红 / 关注橙 / 良好绿）。
  - 角落小环图：**语言分布 Python / C++**。
- **④ 卡通3D 点缀（一处，不遮图）**：右侧接缝或角落一只 glossy 3D 教师小海龟抱写字板，或蓝白小机器人「智伴」从面板后探出，柔和投影，强化 AI 助教品牌，约占画面 8–12%。
- **⑤ 下钻交互暗示**：某个图表面板显示「下钻 →」悬浮胶囊或某根高亮柱带 tooltip 气泡，暗示点击可下钻到「班级 → 学生」。
- **氛围**：专业、权威、数据丰富，又因玻璃质感与一处萌系3D而温暖亲和；柔和影棚打光；留白均衡；不用暗色模式；除卡通吉祥物外不出现真人。

> 若需移动端版本：另出一张**竖屏三联图**（375×812），从上到下：①顶部玻璃标题条＋日期＋筛选下拉；②KPI 2×2 玻璃瓷片；③纵向堆叠的图表卡片（雷达 / 漏斗 / 趋势折线各一屏，可上下滑动），底部一处小卡通3D 海龟。同一冷静专业配色，标签同上。

#### 🛠️ Codex 开发规格

##### Codex 开发规格 —— 教师学情可视化大屏（下钻）`teacher_bigscreen`

> 目标：照 ChatGPT 参考图落地一个浅色玻璃数据大屏，嵌入现有教师端（Vue3 `<script setup>` + TS + Vite + Element Plus + ECharts）。严格遵守项目约定：`/api/v1` 前缀、`{code,message,data}` 信封、JWT Bearer、`require_admin`。前端数据经 `services/mock.ts`「真后端优先 + localStorage 兜底」，视图层数据源无感知。

### 1. 路由 & 文件
- 前端路由（`router/index.ts`，纳入 `/admin/*` 嵌套、`meta:{ role:'teacher' }`、`beforeEach` 复用现有 token 守卫）：
  - `path: '/admin/bigscreen'` → `views/admin/BigScreen.vue`，`meta:{ title:'学情大屏', requiresFullscreen:false }`。
  - 下钻用**同页状态 + query**，不新增路由：`/admin/bigscreen?classId=xx`（班级级）→ 点单个学生跳现有 `/admin/report/:id`（复用 `StudentReport.vue`）。返回上一层用面包屑/返回按钮改写 query。
- 新增文件：
  - `views/admin/BigScreen.vue`（主页面）
  - `components/bigscreen/KpiTile.vue`、`GlassPanel.vue`（磨砂玻璃容器）、`ChartPanel.vue`（标题＋?＋ECharts 挂载＋加载/空/错状态插槽）
  - `composables/useEcharts.ts`（`init/setOption/resize`，`ResizeObserver` + `onBeforeUnmount` dispose，避免泄漏；复用 `Dashboard.vue` 现有 echarts 用法风格）
  - `services/mock.ts` 内新增 `bigscreen` 分组方法（见 §6）。
- 侧栏（`AdminLayout.vue`）新增入口菜单项「📊 学情大屏」，icon 沿用现有风格。

### 2. 页面结构 & 组件树
```
BigScreen.vue
├─ <TopBar>                     顶部玻璃胶囊（GlassPanel 变体）
│   ├─ 品牌: 🐢 + "学情可视化大屏"
│   ├─ <FilterSegment>          年级/班级/时间窗 分段胶囊(el-segmented 或自绘 pill)
│   └─ 右侧: 更新时间(绿点脉动) · 刷新 · 全屏 · 身份切换
├─ <KpiStrip>                   4× KpiTile（总提交/活跃/达标率(环)/平均用时)
├─ <BentoGrid> (CSS grid)
│   ├─ ChartPanel "班级计算思维六维分布"   → 水平堆叠柱
│   ├─ ChartPanel "能力雷达"               → radar (两班对比)
│   ├─ ChartPanel "学习漏斗"               → funnel
│   ├─ ChartPanel "近30天学习趋势"         → line/area 双系列
│   ├─ ChartPanel "班级对比"               → grouped bar + 均值 markLine
│   ├─ ChartPanel "预警学生 TOP"           → 列表 + 严重度 chip（可点→下钻学生）
│   └─ ChartPanel "语言分布"               → donut (小)
└─ <MascotAccent>              角落卡通3D 海龟/智伴（genAsset('teacher_turtle')，纯装饰 aria-hidden）
```
- 六维口径统一用项目既有维度：**抽象 / 分解 / 建模 / 算法设计 / 验证优化 / 迁移**（与 `ThinkingDashboard.vue` 保持一致，勿改名）。

### 3. 视觉/设计系统落地（教师端冷静专业变体）
- CSS 变量（放 `BigScreen.vue` scoped 或全局 token）：
  - `--bg:#F4F7FB; --brand:#3B82F6; --teal:#2EC4B6; --accent-orange:#F5A623; --accent-purple:#7C6BF0;`
  - 玻璃：`background:rgba(255,255,255,.62); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,.7); box-shadow:0 18px 40px rgba(31,45,74,.10); border-radius:24px;`
- 圆角 token：`sm12/md16/lg22/pill999`；字体 Inter/系统无衬线；KPI 数字 `font-weight:800`、字号≥40，标签 `#7B8794` 小字。
- 背景两团 desaturated 蓝/青绿模糊光晕（伪元素 radial-gradient + blur）。
- 卡通3D 仅一处点缀，不遮图，`~10%` 画面；student pastel 糖果风禁止出现在此屏。
- ECharts 主题：统一色板 `[#3B82F6,#2EC4B6,#7C6BF0,#F5A623]`，`grid` 留白足、`axisLine`/`splitLine` 淡灰、`tooltip` 玻璃卡片风、字体继承。

### 4. 关键交互
1. **筛选联动**：切换 年级/班级/时间窗 → 触发 `loadAll(filters)`，所有 KPI+图表并发刷新（`Promise.all`），过程走 loading 态。
2. **下钻（核心）**：
   - 全局态（无 classId）：图表展示各班对比；点「班级对比」某柱 / 「预警学生」某行的班级 → `router.replace({query:{classId}})`，进入**班级级**：六维分布/雷达/漏斗切到该班明细，顶部出现面包屑「全部 › 初一(3)班」。
   - 班级级点某学生行 → `router.push('/admin/report/'+studentId)`（复用现有学生学情页）。
   - 面包屑/返回按钮回退层级（清 query）。
   - ECharts 用 `chart.on('click', params=>…)` 绑定下钻；柱/漏斗/列表均可点，鼠标 `cursor:pointer` + hover 高亮 + 「下钻 →」气泡。
3. **刷新**：手动刷新按钮 + 可选轮询（默认关闭，`setInterval` 60s 拉 KPI，组件卸载清理）。更新时间戳绿点脉动。
4. **全屏**：`requestFullscreen()` 于根容器，图表 `resize`。
5. **响应式 resize**：`ResizeObserver` + `window.resize` 防抖调用各 `chart.resize()`。

### 5. 状态（加载 / 空态 / 错误 / 无数据）
- `ChartPanel` 统一四态插槽：
  - **loading**：骨架屏（玻璃卡内灰色脉动块）+ Element `v-loading`。
  - **empty（有接口无数据）**：居中占位插画（`genAsset` 空态图）+ 文案「当前筛选下暂无数据，换个班级或时间窗试试～」。
  - **error**：错误图标 + 「加载失败，点击重试」按钮（重调该 panel 的 fetch）。
  - **no-real-data（兜底演示）**：右上角 `el-tag`「演示数据」；有真数据时显示「实时记录」（沿用 `ThinkingDashboard.vue` 的 `has_real_data` 约定）。
- 全页级：任一必需接口失败不阻塞其它 panel（各 panel 独立 loading/error）。KPI 失败显示「—」占位不崩。
- 空班级 / 无学生 / 时间窗无提交 → 各图 empty 态，KPI 显 0。

### 6. 数据 & API 契约（`/api/v1` + `{code,message,data}` + JWT + require_admin）
所有请求经 `api/index.ts` axios（自动带 Bearer、拦截器解包为 `res.data`）。`services/mock.ts` 真后端优先、失败/无后端回退 localStorage 假数据（保证 UI 可跑）。

- **GET `/api/v1/admin/bigscreen/overview`** `?grade=&classId=&range=week|month|term`
  → `data:{ updatedAt, hasRealData, kpi:{ totalSubmits:number, activeStudents:number, passRate:number/*0-1*/, avgMinutes:number, trends:{ submits:number[7], help:number[7] } } }`
- **GET `/api/v1/admin/bigscreen/dimensions`** `?classId=&range=`
  → `data:{ hasRealData, dims:[{ key:'abstraction'|'decomposition'|'modeling'|'algorithm'|'validation'|'transfer', name:string, excellent:number, good:number, weak:number, avg:number/*0-100*/ }] }`（六维堆叠柱 + 雷达共用）
- **GET `/api/v1/admin/bigscreen/radar`** `?classId=&compareClassId=`
  → `data:{ series:[{ classId, className, values:number[6] }], indicators:[{name,max:100}] }`
- **GET `/api/v1/admin/bigscreen/funnel`** `?classId=&range=`
  → `data:{ stages:[{name:'登录',value},{name:'编写',value},{name:'运行',value},{name:'达标',value}] }`
- **GET `/api/v1/admin/bigscreen/trend`** `?classId=&range=`
  → `data:{ dates:string[], submits:number[], help:number[] }`
- **GET `/api/v1/admin/bigscreen/class-compare`** `?grade=&range=`
  → `data:{ classes:[{classId,className,passRate:number/*0-1*/,activeRate:number}], avgPassRate:number }`
- **GET `/api/v1/admin/bigscreen/alerts`** `?classId=&limit=`
  → `data:{ items:[{studentId,realName,className,severity:'high'|'mid'|'ok',weakDim:string,lastActive:string}] }`（severity→chip：high 红/mid 橙/ok 绿；行点击 → 下钻学生）
- **GET `/api/v1/admin/bigscreen/lang-dist`** `?classId=&range=`
  → `data:{ items:[{name:'Python',value},{name:'C++',value}] }`
- 复用现有：`/api/v1/monitor/*`（活跃度事件源）、`/api/v1/admin/report/:id` 由 `StudentReport.vue` 承接下钻。
- **后端（FastAPI）**：新增 `app/routers/bigscreen.py`，`APIRouter(prefix="/api/v1/admin/bigscreen")`，全部依赖 `require_admin`，聚合查询 submissions/monitor/thinking 表，返回 `success_response(data)`。真数据不足时 `hasRealData=false` + 合理演示值（对齐 demo 模式）。
- 契约要点：数字统一后端算好返回；比率用 0–1（前端 `*100` 显示 `%`）；日期 ISO 字符串；空结果返回空数组而非 null。

### 7. 响应式 / 移动端要点
- 断点：`≥1440` 完整 bento（大屏原设计，六维柱占大格）；`1024–1440` 图表两列自适应缩小；`<1024`（平板/手机）单列纵向堆叠，顶部筛选收进下拉，KPI 变 2×2，卡通3D 缩小或隐藏。
- Grid 用 `grid-template-columns: repeat(12, 1fr)` + `minmax`，各 panel 跨列数按断点变；`aspect-ratio` 保图表比例。
- 每个 ECharts 容器 `width:100%; min-height` 随断点；`resize` 必接。
- 触控：下钻改为「点击」而非 hover tooltip 依赖；移动端隐藏「全屏」按钮。
- 表格/长列表（预警学生）在窄屏 `overflow-x:auto`，页面 body 不横向滚动。

### 8. 逐条验收点
1. 路由 `/admin/bigscreen` 受 `beforeEach` + `require_admin` 保护；未登录跳 `/login`；学生角色无法进入。
2. 顶部玻璃胶囊：品牌 + 分段筛选 + 「更新于 HH:mm」绿点脉动 + 刷新/全屏/身份切换，齐全且玻璃质感（blur+高光+长投影+圆角24）。
3. 4 张 KPI 瓷片数字来自 `overview`，达标率带环形仪表，含涨跌小胶囊 + sparkline；接口失败显「—」不崩。
4. 六图全部为真 ECharts 且色板统一 `[#3B82F6,#2EC4B6,#7C6BF0,#F5A623]`：堆叠柱/雷达/漏斗/双线趋势/分组柱+均值线/预警列表(+语言 donut)。
5. 六维口径严格为 抽象/分解/建模/算法设计/验证优化/迁移，与 `ThinkingDashboard.vue` 一致。
6. 下钻链路可用：全局→点班级柱/预警行→班级级(query classId, 面包屑出现)→点学生行→跳 `/admin/report/:id`；面包屑可逐级返回并清 query。
7. 筛选（年级/班级/时间窗）切换后所有图表并发刷新，走 loading 态，数据随之变化。
8. 四态覆盖：loading 骨架、empty 占位插画+文案、error 重试按钮、演示/实时 tag；单 panel 失败不影响其它。
9. 响应式：`<1024` 单列堆叠、KPI 2×2、筛选收下拉、卡通3D 缩隐；无横向滚动；各图 `resize` 正常。
10. 所有接口走 `/api/v1` + `{code,message,data}` 解包 + Bearer；无后端时 `mock.ts` 兜底仍完整渲染。
11. 界面文案全为简体中文；无控制台报错；`npm run build`（vue-tsc）类型检查通过（视为完成门槛）。
12. ECharts 实例在组件卸载时 `dispose`，无内存泄漏 / 无重复 init 警告。

---

### S12 · 移动端关键页(工作台/IDE/AI 面板)

#### 🎨 ChatGPT 生图提示词

##### ChatGPT 出图提示词（16:9 桌面高保真参考图 · 三联手机屏 · 中英双语）

> 用法：整段粘贴到 ChatGPT 网页版（GPT-4o / DALL·E 或图像模型）。这是**一张 16:9 横版画布**，里面并排放**三块 375px 竖屏手机 mockup**（工作台 / IDE / AI 双导师抽屉）。要求 Dribbble / Behance 级高保真。关键中文标签必须准确，正文用占位/极简标签，避免让模型渲染大段中文。

---

### PART 1 — English prompt (for stable generation)

A single high-fidelity **16:9 desktop presentation canvas** showcasing **three (3) mobile app screens side by side**, each rendered as a **375px-wide portrait phone mockup** with soft rounded device frame, gentle floating drop-shadow, on a **cream-to-light-lavender pastel gradient background (#FFF8F0 → #ECEFF4)** with a few blurred pastel glow blobs (peach, mint, lavender) and tiny floating 3D shapes (a cube, a star, a rounded bracket "{ }" symbol) scattered in the negative space. Overall aesthetic: **Glassmorphism + Ceramic-tile bento cards + cartoon 3D clay characters**, warm, friendly, child-safe, Dribbble/Behance quality, crisp UI, no watermark, no gibberish text.

Shared design system across all three phones: frosted-glass panels — semi-transparent white `rgba(255,255,255,.6)`, backdrop-blur 20px, 1px inner top highlight stroke, soft shadow, corner radius 22–28px. Ceramic tiles = rounded soft cards with pastel gradient fills (lavender / peach / mint / pink), each with a **glossy 3D icon** top-left, a bold title + tiny subtitle, and a mini pill button. Accent palette: warm orange **#F5A623**, education blue **#6C9CE9**, purple **#7C6BF0**, teal **#2EC4B6**. Font: Inter / rounded sans-serif. Mascot: a **cute cartoon 3D green turtle wearing an orange hoodie and round glasses, hugging a laptop (🐢 "小海龟")**. Touch-friendly, large tap targets (≥44px), clean.

**PHONE 1 — "Workbench / Home" (瓷片单列 + 玻璃底部导航):**
Top: a floating frosted-glass header pill with a greeting and a small circular avatar of the turtle mascot. Below it a large **hero ceramic tile** with a 3D turtle mascot character waving, a bold Chinese title label "继续学习", a slim horizontal progress bar, and an orange pill CTA. Under the hero, a **single-column stack of ceramic bento tiles** (4–5 cards), each pastel-gradient with a glossy 3D icon (a book, a lightning bolt, a growth-chart ring, a medal): tiles labeled "今日任务", "我的编程", "成长报告", "计算思维". One tile shows a small **circular ring progress** gauge in teal. At the very bottom, a **frosted-glass floating bottom navigation bar** with 4 tab icons + tiny Chinese labels: "工作台 / 编程 / 成长 / 我的", the active tab ("工作台") highlighted in orange with a glowing pill background. Clean airy spacing.

**PHONE 2 — "Mobile IDE" (三区 Tab + 悬浮运行按钮):**
Top: a compact frosted-glass toolbar with a back chevron, a file/lesson name label, and a small language selector pill ("Python"). Directly below, a **segmented Tab control (glass pill)** with 3 tabs: "编辑 / 控制台 / 绘图", the "编辑" tab active. Main area = a **dark code-editor panel** (Monaco-style, deep navy `#1e2233` rounded card) showing a few lines of colorful syntax-highlighted Python code (short, generic, correct-looking, e.g. `print`, `for i in range`), with line numbers. A soft glass strip at the bottom hints at the console. A large **circular floating "Run" action button** in orange (▶ play icon, glossy 3D) sits bottom-right, casting a soft shadow. Optional tiny turtle mascot peeking at the corner. Everything touch-sized.

**PHONE 3 — "AI Dual-Mentor Drawer" (近全屏玻璃抽屉 · 双角色):**
A **near-fullscreen frosted-glass bottom-sheet drawer** sliding up over a dimmed IDE background, with a rounded top handle bar and heavy backdrop-blur. Top of the drawer: a **role toggle segmented control (glass pill)** with two options: "小龟·操作者" (a cute 3D turtle character chip) and "智伴·领航员" (a friendly white-and-blue little robot / book-sprite character chip), the turtle side active/highlighted. Below: a **chat conversation** — alternating message bubbles: AI bubbles are soft glass/pastel with a small round mascot avatar, user bubbles are orange-tinted aligned right. Bubbles contain short generic Chinese-label placeholders (keep text minimal). One AI bubble shows a small code-snippet card with a copy icon. At the bottom: a **frosted-glass input bar** with a rounded text field placeholder, a mic icon, and a round orange send button. Warm, encouraging, cozy tutoring vibe.

Layout: the three phones are evenly spaced left-to-right on the 16:9 canvas, each slightly tilted or floating, with a thin caption label under each phone: "工作台", "编程 IDE", "AI 双导师". Cohesive lighting, consistent glassmorphism + ceramic + cartoon-3D language across all three. Ultra-clean, premium, Dribbble hero shot. Do NOT render long paragraphs of Chinese — use short labels and placeholder bars only; keep all visible Chinese labels spelled exactly as given.

---

### PART 2 — 中文校对说明（逐屏核对 · 界面文案）

整张图 = **16:9 横版**，并排三块 **375px 竖屏手机**，背景奶油→薰衣草 pastel 渐变(#FFF8F0→#ECEFF4)，飘几枚模糊光斑与迷你 3D 小物件（立方体 / 星星 / `{ }` 括号）。全屏统一风格：**磨砂玻璃 + 陶瓷瓷片 bento + 卡通 3D 黏土角色**，暖橙 #F5A623 / 教育蓝 #6C9CE9 / 紫 #7C6BF0 / 青绿 #2EC4B6，Inter 圆体，🐢 小海龟（绿身+橙卫衣+圆眼镜+抱笔记本）。触控友好，触控区 ≥44px。

- **屏①「工作台」**：顶部玻璃胶囊 header（问候语 + 小海龟头像）；下方一块 hero 大瓷片（3D 小海龟招手 + 标题「继续学习」+ 细进度条 + 橙色胶囊按钮）；再往下**单列瓷片堆叠**（淡雅渐变 + 左上 glossy 3D 图标），依次标签「今日任务 / 我的编程 / 成长报告 / 计算思维」，其中一块含青绿**环形进度**；最底部**玻璃悬浮底部导航**四个 Tab：「工作台 / 编程 / 成长 / 我的」，当前「工作台」橙色高亮胶囊。
- **屏②「编程 IDE」**：顶部紧凑玻璃工具栏（返回箭头 + 课程名 + 语言选择胶囊「Python」）；下方**玻璃分段 Tab**三选一「编辑 / 控制台 / 绘图」，当前「编辑」；主区一块**深色代码编辑面板**（深藏青 #1e2233 圆角卡，短段彩色高亮 Python 代码 + 行号）；右下角一枚**橙色圆形悬浮「运行」按钮**（▶ glossy 3D）。
- **屏③「AI 双导师抽屉」**：**近全屏玻璃底部抽屉**上滑覆盖变暗的 IDE，顶部有圆角把手；顶部**角色切换分段控件**「小龟·操作者」(3D 小海龟 chip) / 「智伴·领航员」(白蓝小机器人/书本精灵 chip)，当前「小龟」高亮；下方**对话气泡**（AI 气泡=玻璃/pastel + 圆头像，用户气泡=橙调右对齐），一条 AI 气泡内含小代码卡 + 复制图标；底部**玻璃输入栏**（圆角输入框 + 麦克风图标 + 橙色圆形发送按钮）。
- 每块手机下方细标题：「工作台」「编程 IDE」「AI 双导师」。
- 提示模型：**中文只出短标签，正文用占位色块/短横条**，可见中文务必与上面完全一致，勿出现乱码或错别水印字。

> 备注：需要三张独立竖屏图时，可在 PART 1 末尾追加 “Output as three separate 9:16 portrait images instead of one canvas.”，其余描述不变。

#### 🛠️ Codex 开发规格

##### Codex 开发规格 —— 移动端关键页（工作台 / IDE / AI 面板）

> 目标：在既有 Vue3 + TS + Vite + Element Plus + Monaco 前端里，落地/适配三块窄屏(375px)移动端关键页。遵循仓库约定：`/api/v1/...` 前缀、`{code,message,data}` 信封（axios 拦截器已解包，`UnwrappedApi` 直接读 `res.code`/`res.data`）、JWT Bearer（localStorage）、`services/mock.ts` 真后端优先 + localStorage 兜底。桌面端复用现有布局，移动端在同一路由下走响应式分支，不新增独立路由树。

---

### 0. 断点与全局约定
- 断点：`--bp-mobile: 768px`。`@media (max-width: 768px)` 走移动端布局；≥768px 保持现有桌面布局。
- 触控区 ≥44×44px；主按钮 48px 高。字号最小 14px，正文 15–16px。
- 设计 token（新增 `src/styles/tokens.css`，全屏引用）：
  - 玻璃：`--glass-bg: rgba(255,255,255,.6)`；`--glass-blur: 20px`；`--glass-stroke: rgba(255,255,255,.7)`；`--glass-shadow: 0 8px 32px rgba(31,38,135,.12)`。
  - 圆角：`--r-sm:12px --r-md:16px --r-lg:22px --r-pill:999px`。
  - 色：`--c-orange:#F5A623 --c-blue:#6C9CE9 --c-purple:#7C6BF0 --c-teal:#2EC4B6 --c-cream:#FFF8F0 --c-glassbg:#ECEFF4`。
  - 玻璃面板 mixin 类 `.glass { background:var(--glass-bg); backdrop-filter:blur(var(--glass-blur)); border:1px solid var(--glass-stroke); box-shadow:var(--glass-shadow); border-radius:var(--r-lg); }`（含 `@supports not (backdrop-filter)` 降级为实心 `rgba(255,255,255,.9)`，兼容低配设备）。
- 低配/触控友好：`backdrop-filter` 提供降级；避免大范围动画，`prefers-reduced-motion` 时关闭微抬/位移过渡。

---

### 1. 路由（复用现有，不新增树）
沿用 `src/router/index.ts`：
- `/`   → `views/student/IDE.vue`（承载 **IDE 屏**；移动端在其内部渲染三区 Tab）。
- `/tasks` → `views/student/Tasks.vue`。
- **工作台屏** 落在 `/`：移动端 IDE.vue 若判定为窄屏首次进入，或新增 `/home` 前，优先做法——新增 `views/student/Home.vue` + 路由 `{ path:'/home', name:'Home', component:()=>import('@/views/student/Home.vue'), meta:{requiresAuth:true, role:'student'} }`，并把底部导航「工作台」指向 `/home`；桌面端仍以 `/` 为 IDE 主入口。
- 底部导航 4 Tab 映射：工作台→`/home`，编程→`/`，成长→`/thinking`，我的→`/my`（若无 `/my` 则先指向 `/thinking` 并留 TODO）。
- `router.beforeEach` 已有 token + `meta.role` 守卫，保持不变。

---

### 2. 组件树

**新增/改造组件（`src/components/mobile/`）：**
```
MobileTabBar.vue          玻璃底部导航（4 Tab，active 高亮，figure ≥44px）
CeramicTile.vue           通用瓷片卡（props: icon/title/subtitle/gradient/progress?/to?）
GlassSegmented.vue        玻璃分段控件（v-model + options[]，用于 IDE 三区 & AI 角色切换）
RunFab.vue                悬浮运行按钮（fixed 右下，loading 态转圈）
AiMentorDrawer.vue        近全屏玻璃底部抽屉（AI 双导师）
ChatBubble.vue            对话气泡（role: ai|user，slot 支持代码卡+复制）
```

**① 工作台 `Home.vue`**
```
<Home>
 ├ GlassHeader (问候「你好，{昵称}」+ 小海龟头像 + 连续天数徽标)
 ├ HeroTile (3D海龟 + 「继续学习」+ 进度条 + 橙色CTA→跳最近任务/IDE)
 ├ TileGrid (单列 v-for)
 │   ├ CeramicTile 今日任务  (badge 未完成数, to=/tasks)
 │   ├ CeramicTile 我的编程  (to=/)
 │   ├ CeramicTile 成长报告  (环形进度, to=/thinking)
 │   └ CeramicTile 计算思维  (六维迷你雷达缩略, to=/thinking)
 └ MobileTabBar (active=工作台)
```

**② IDE `IDE.vue`（移动端分支）**
```
<IDE mobile>
 ├ GlassToolbar (返回 + 课程/文件名 + 语言选择胶囊 Python|C++)
 ├ GlassSegmented v-model="activeTab" :options="['编辑','控制台','绘图']"
 ├ <section v-show 编辑>   MonacoEditor (readOnly 依结对角色)
 ├ <section v-show 控制台> ConsoleOutput (stdout/stderr/退出码)
 ├ <section v-show 绘图>   TurtleCanvas / 图像输出
 ├ RunFab (@run 调执行接口, loading)
 └ AiEntryFab / 底部「呼叫 AI」条 → 打开 AiMentorDrawer
```
- 移动端三区互斥切换（不并排），Monaco 用 `automaticLayout:true`，容器 `height: calc(100dvh - 顶栏 - Tab - 安全区)`。
- 结对编程：观察者角色时编辑器 `readOnly`，与 `stores/pair.ts` 一致。

**③ AI 双导师 `AiMentorDrawer.vue`**
```
<AiMentorDrawer v-model:open>
 ├ Handle (下拉把手, 支持下滑关闭)
 ├ GlassSegmented v-model="persona" :options=[
 │     {key:'ai_driver', label:'小龟·操作者', avatar:turtle},
 │     {key:'ai_navigator', label:'智伴·领航员', avatar:robot}]
 ├ MessageList (v-for ChatBubble; AI流式追加)
 │   └ 代码气泡: <CodeCard> + 复制按钮
 ├ QuickChips (常用追问: 「给点提示」「帮我看报错」「换个思路」)
 └ InputBar (glass, textarea自增高 + 麦克风 + 橙色发送)
```
- 抽屉高度约 `88dvh`，`position:fixed; bottom:0`，背后 IDE 加 `backdrop` 遮罩(点击关闭)。
- **禁代写红线**：`persona='ai_navigator'`（智伴/领航员）时，UI 文案提示「只给思路与伪代码」，且发送前 system prompt 走后端 `ai_navigator` 装配，不请求完整代码；代码卡在领航员模式下隐藏「一键运行/复制整段」，仅展示伪代码。`ai_driver`（小龟/操作者）可给可运行代码。

---

### 3. 关键交互
- 底部导航切换：`router.push`，active 态由当前 `route.name` 派生；切换有 120ms 淡入，`prefers-reduced-motion` 关闭。
- IDE 三区 Tab：本地 `activeTab` 状态；切到「绘图」若无图输出显示空态插画。
- 运行按钮：点击→loading 转圈→结果写入「控制台」并自动切到控制台 Tab；有绘图输出则切「绘图」。
- AI 抽屉：底部「呼叫 AI」上滑打开；SSE 流式逐字追加到最后一条 AI 气泡；发送时携带当前 `code_context` + `console_output` + `language` + `pair_mode(persona)`。
- 角色切换：切 persona 时清空/新建会话上下文提示，头像与气泡配色同步（小龟=橙暖，智伴=蓝冷）。
- 复制代码：仅操作者模式可用，复制成功 toast「已复制」。

---

### 4. 状态：加载 / 空态 / 错误 / 无数据
| 场景 | 加载 | 空态 | 错误 | 无数据 |
|---|---|---|---|---|
| 工作台瓷片数据 | 瓷片骨架屏(skeleton, 3块灰渐变) | — | 顶部玻璃 toast + 「重试」按钮 | 任务=0 显示「今天还没有任务，去逛逛」插画 |
| IDE 运行 | RunFab 转圈 + 控制台「运行中…」 | 控制台空:「点击运行查看输出」 | 控制台红字 stderr + 退出码;网络失败 toast | 绘图无输出:海龟插画占位 |
| AI 对话 | AI 气泡「小海龟思考中…」打字点动画 | 首次:欢迎语 + QuickChips | 流中断:气泡内「连接中断，点此重试」 | 无历史:仅欢迎语 |
- 全局 401：axios 拦截器已跳 `/login`，移动端沿用。
- 弱网：请求 12s 超时→toast「网络较慢，请重试」。

---

### 5. 数据与 API 契约（`/api/v1/...` + `{code,message,data}` + JWT）
> 前端统一经 `api/index.ts`（拦截器解包）与 `services/mock.ts`（真后端优先+localStorage 兜底）。callers 只读 `res.code`/`res.data`。

- **工作台聚合**（可先用 mock.ts 组装，后端就绪再换 body）：
  `GET /api/v1/my/dashboard` → `data:{ nickname, streakDays, hero:{progress,resumeTaskId}, tiles:[{key,title,subtitle,badge,progress}] }`
- **任务**：`GET /api/v1/practice/tasks?status=todo` → `data:[{id,title,difficulty,done}]`
- **代码执行**：`POST /api/v1/execute` body `{language:'python'|'cpp', code, stdin?}` → `data:{stdout, stderr, exit_code, duration_ms, sandbox:'docker'|'process', images?:[dataURL]}`（对齐 `code_executor.py` 返回）。
- **AI 流式**：`POST /api/v1/ai/chat`（SSE）body `{language, pair_mode:'ai_driver'|'ai_navigator', code_context, console_output, messages:[{role,content}]}` → SSE `content_block_delta` 逐段；前端解析追加。头 `Authorization: Bearer <token>`。
- **计算思维/成长**：`GET /api/v1/thinking/summary` → `data:{dims:[{key:'抽象'|'分解'|'建模'|'算法设计'|'验证优化'|'迁移', score}]}`；活动双写 `POST /api/v1/monitor/activity`。
- **结对角色**（如启用）：WS `/ws/pair/{room_id}?token=`，消息 `join|edit|cursor|role_switch|chat|console|lang`；观察者 `readOnly`。
- 所有写操作失败按 `{code!==0}` 走错误分支；`res.message` 直接用于 toast 文案。

---

### 6. 响应式 / 移动端要点
- 视口：`<meta viewport>` 已含；用 `100dvh` 规避移动端地址栏高度跳变；底部导航加 `padding-bottom: env(safe-area-inset-bottom)`。
- 瓷片单列：`grid-template-columns:1fr; gap:14px; padding:16px`。
- Monaco：移动端隐藏 minimap、`fontSize:14`、`lineNumbers:'on'`、`wordWrap:'on'`、`scrollBeyondLastLine:false`；避免与页面滚动冲突（编辑区独立滚动容器）。
- 抽屉滚动锁：打开时 `body { overflow:hidden }`。
- 玻璃降级：低端机若 `backdrop-filter` 不支持→实心半透明白，保证可读。
- 图标/头像用现有 `src/assets/generated/`（小海龟、机器人）；缺失则占位 emoji 🐢/🤖 并留 TODO。
- 桌面端行为不回归：`@media (min-width:769px)` 下移动组件 `display:none`，桌面原布局不变。

---

### 7. 验收点（逐条）
1. 375px 宽下三屏无横向滚动；所有可点元素 ≥44px。
2. 工作台：单列瓷片 + 玻璃底部导航 4 Tab，active「工作台」橙色高亮；点各 Tab 正确路由跳转。
3. 瓷片含 glossy 图标 + 标题 + 副标题 + 迷你动作胶囊；至少一块含环形进度且数值来自接口/mock。
4. 骨架屏在数据到达前出现；任务为 0 显示空态插画；接口失败显示 toast+重试。
5. IDE：玻璃分段 Tab「编辑/控制台/绘图」互斥切换正确；Monaco 正常渲染且随视口自适应（`automaticLayout`）。
6. 悬浮运行按钮固定右下、loading 态转圈；运行后结果进控制台并自动切 Tab；有图切绘图。
7. 观察者角色时编辑器 `readOnly`（结对启用时）。
8. AI 抽屉近全屏(约88dvh)、上滑打开/下滑关闭、背景遮罩点击关闭、`body` 滚动锁定。
9. 角色分段「小龟·操作者 / 智伴·领航员」切换：头像+配色随之切换；领航员模式**不输出整段可运行代码**、隐藏复制整段，仅思路/伪代码（红线验证）。
10. AI 回复走 SSE 流式逐字追加；中断显示「重试」；发送携带 code_context/console_output/language/persona。
11. 所有接口走 `/api/v1` + `{code,message,data}`，请求带 JWT；401 跳登录。
12. `prefers-reduced-motion` 下动画关闭；`backdrop-filter` 不支持时玻璃降级仍可读。
13. 所有可见中文文案为简体中文，与设计一致（工作台/编程/成长/我的、编辑/控制台/绘图、继续学习、小龟·操作者、智伴·领航员 等）。
14. `npm run build`（vue-tsc）通过——类型检查零错误（唯一类型/lint 门禁）。

---

## 4. AI 双角色 3D 形象设定（立绘 · 抠图复用）

#### 🎨 ChatGPT 生图提示词

##### ChatGPT 出图提示词 · AI 双角色 3D 形象设定表 (Character Sheet)

> 用途：粘贴到 ChatGPT 网页版（GPT-4o / DALL·E 图像生成），生成一张 **16:9 桌面高保真角色设定表参考图**。生成后逐个姿态抠图，放入学生端 AI 面板与登录页。若一次出图姿态太挤，可拆成「小龟三联图 + 智伴三联图」两张分别生成。

---

### PART A — English prompt (paste this first, for stable rendering)

```
A single 16:9 high-fidelity CHARACTER SHEET / model sheet illustration, Dribbble & Behance award level, for the two AI mascots of a kids' coding-learning platform "AI Little Turtle · Pair Programming". Studio character-lineup layout on a CLEAN, FLAT, EVENLY-LIT pale-cream background (#FFF8F0 to #ECEFF4 soft gradient), NO scene, NO furniture — a neutral backdrop optimized for later background removal / cutout. Consistent single soft top-left key light, gentle contact shadows, unified color grading across every pose. Cute cartoon 3D / glossy soft-clay (Pixar-meets-claymation) render style, rounded friendly forms, chunky proportions, big expressive eyes, child-friendly, absolutely NO text, NO letters, NO watermark, NO code characters baked into the artwork.

The sheet is split into TWO clearly separated horizontal rows, each row a labeled character with a 3-to-5 pose lineup:

ROW 1 — "Little Turtle" (小龟), the DRIVER / operator persona, lively and encouraging:
A small friendly turtle programmer. Green rounded body and head, wearing an ORANGE (#F5A623) hoodie, round black-rimmed glasses, small over-ear headphones, tiny four-fingered hands. Warm, upbeat, energetic personality. Render this same turtle in 5 distinct full-body poses, evenly spaced left to right, all facing mostly toward the viewer (front / three-quarter front):
  1. Thumbs-up encouragement — one hand giving a big thumbs up, wide happy smile, sparkly eyes.
  2. Thinking / chin-rest — one hand on chin, eyes glancing up, a small floating question mark or lightbulb above (as a 3D icon prop, not text).
  3. Celebration / cheering — both arms raised up, jumping joyfully, tiny confetti sparkles around.
  4. Waving hello — one hand raised waving, friendly welcoming smile (this is the hero/greeting pose).
  5. Pointing / guiding — one arm extended pointing to the side as if guiding to code, attentive helpful expression.

ROW 2 — "AI Buddy" (智伴), the REVIEWER / navigator persona, calm and rigorous:
A cute white-and-blue small robot companion (rounded pill body, soft blue #6C9CE9 accents and a purple #7C6BF0 glowing visor edge), wearing tiny glasses, holding a magnifying glass in one hand and a checklist clipboard in the other. Calm, thoughtful, trustworthy, mentor-like personality (NOT playful — steadier than the turtle). Render this same robot in 4 distinct poses, evenly spaced, facing mostly the viewer:
  1. Reviewing / inspecting — holding the magnifying glass up to inspect, focused eyes.
  2. Nodding approval — gentle nod, one hand giving a calm OK gesture, reassuring soft smile.
  3. Asking a question (Socratic) — one hand slightly raised, tilted head, a small floating "?" 3D prop above, curious guiding expression.
  4. Presenting the checklist — holding up the clipboard/checklist, calm explanatory pose (checklist shows abstract tick marks, NO real text).

Composition: two horizontal bands with generous spacing so each pose is fully separated for easy cropping; each character's pose lineup shares identical scale, lighting and turnaround consistency (same character, same outfit, only the pose changes). Ultra clean, poster-quality, professional character-design turnaround sheet. Cohesive warm pastel palette: orange #F5A623, education blue #6C9CE9, purple #7C6BF0, teal #2EC4B6, with lavender / peach / mint / pink pastels; cream & light-grey glass backdrop. 4k, crisp, glossy soft shadows.
```

**关键出图约束（务必保留在英文里）**：`CHARACTER SHEET / model sheet`、`flat evenly-lit pale-cream background for easy cutout`、`same character across poses (turnaround consistency)`、`cute cartoon 3D glossy soft-clay`、`NO text / NO letters / NO watermark`、`facing viewer, front / three-quarter`。

---

### PART B — 中文校对（逐区核对，避免让模型渲染大段中文，仅关键标签）

一张 **16:9 角色设定表（立绘 turnaround）**，纯净浅奶油/浅灰玻璃底（#FFF8F0→#ECEFF4），统一左上柔光、统一配色，卡通 3D glossy 黏土质感，圆润可爱、儿童友好，**画面内不要出现任何文字/字母/水印/代码**（中文标签仅供你我核对，不要画进图里）。整张分上下两条角色带：

- **上排 · 小龟（驾驶员/操作者，活泼鼓励）**：绿身小海龟程序员，穿**橙色 #F5A623 卫衣**、圆黑框眼镜、小耳机、圆润四指小手；同一只龟做 5 个正面/三四分正面全身姿态，从左到右均匀排开、彼此留白便于抠图：
  1. **竖大拇指鼓励**（灿烂笑、眼睛发亮）
  2. **思考托腮**（手托下巴、上方漂浮一枚 3D 问号/灯泡道具）
  3. **庆祝欢呼**（双臂高举、跳跃、周围小彩屑）
  4. **挥手打招呼**（招手、欢迎微笑，作登录页/问候 hero 姿）
  5. **指点引导**（伸手指向一侧，像在指引代码，专注助人表情）
- **下排 · 智伴（领航员/审看者，沉稳审查）**：白蓝小机器人（圆润胶囊身、蓝 #6C9CE9 描边、紫 #7C6BF0 面罩微光），戴小眼镜，一手放大镜、一手清单板；沉稳可信、导师感（比小龟更稳，不俏皮）；同一机器人做 4 个正面姿态：
  1. **审查/放大镜检视**（举放大镜、专注）
  2. **点头认可**（轻点头、OK 手势、温和微笑）
  3. **提问（苏格拉底式）**（微举手、歪头、上方漂浮 3D「?」道具、好奇引导）
  4. **竖清单讲解**（举清单板，板上只有抽象勾选符号、无真实文字）

- **配色**：暖橙 #F5A623 + 教育蓝 #6C9CE9 + 紫 #7C6BF0 + 青绿 #2EC4B6 + pastel（薰衣草/蜜桃/薄荷/粉），奶油/浅灰玻璃底。两排姿态**同尺寸、同光照、同角色一致性**，海报级、专业角色设定表质感。

---

### 可选变体（按需追加一句给 ChatGPT）

- **移动端竖屏三联图**：`Instead of a wide sheet, render a vertical 9:16 triptych: three stacked poses of the Little Turtle (thumbs-up / waving / cheering), same style and cutout-friendly background.`
- **单独智伴设定表**：只保留 ROW 2，改为 4:3，姿态放大以便抠图。
- **透明底版本**：`Render each pose isolated on a pure transparent / solid white background for direct alpha cutout.`（DALL·E 不产真 alpha 时，用纯白底再抠图。）

#### 🛠️ Codex 接入规格

##### Codex 开发规格 · AI 双角色 3D 形象设定表 → 资源落地 + 前端使用

> 这不是一个「页面路由」，而是一份**美术资源 → 前端集成**规格：把 ChatGPT 生成并抠好的立绘接入现有代码库，供 AI 面板（`AIChatPanel.vue`）、结对编程条（`PairProgrammingBar.vue`）、登录页与空态复用。同时给出一个内部「角色资源预览页」以便设计走查。严格遵守项目约定：`/api/v1` 前缀 + `{code,message,data}` 信封 + JWT。

---

### 1. 资源产出与命名（对齐现有 `frontend/src/assets/generated/`）

现有资源已有：`mascot_turtle.png`、`turtle_cheer.png`、`turtle_think.png`、`partner_driver.png`、`partner_observer.png`。本设定表补齐**小龟 5 姿 + 智伴 4 姿**，命名规范（kebab / snake，PNG 透明底，导出 1x/2x）：

- 小龟（driver 人格）：
  - `turtle_thumbsup.png`（竖大拇指鼓励）
  - `turtle_think.png`（复用/覆盖思考托腮）
  - `turtle_cheer.png`（复用/覆盖庆祝欢呼）
  - `turtle_wave.png`（挥手 · 登录页/问候 hero）
  - `turtle_point.png`（指点引导）
- 智伴（navigator 人格）：
  - `buddy_review.png`（放大镜审查）
  - `buddy_nod.png`（点头认可）
  - `buddy_ask.png`（提问 · 苏格拉底）
  - `buddy_checklist.png`（竖清单讲解）

导出要求：透明背景 PNG；主体统一画布内边距；用现有 `.imggen/optimize.py` 压缩；每图 ≤ 150KB（2x ≤ 300KB）。落盘目录：`frontend/src/assets/generated/`。

### 2. 角色资源清单模块（前端单一数据源）

新增 `frontend/src/config/aiCharacters.ts`，集中声明双角色与姿态，供各处按 key 引用（避免散落的 import）：

```ts
// 伪代码结构
export type TurtlePose = 'thumbsup' | 'think' | 'cheer' | 'wave' | 'point'
export type BuddyPose  = 'review' | 'nod' | 'ask' | 'checklist'
export interface CharacterPose { key: string; label: string; src: string; alt: string }
export const TURTLE_POSES: Record<TurtlePose, CharacterPose>
export const BUDDY_POSES:  Record<BuddyPose,  CharacterPose>
// label 为简体中文（竖大拇指鼓励 / 放大镜审查 …），src 用 `import` 静态引入以走 Vite 资源哈希
```

姿态语义映射（供 AI 面板按状态切换表情）：
- 小龟：`idle→wave`、`success/通过→cheer`、`encourage/正确提示→thumbsup`、`loading/思考中→think`、`guide/指向代码→point`。
- 智伴：`idle→review`、`approve→nod`、`socratic 提问→ask`、`给检查清单→checklist`。

### 3. 页面 / 组件集成点

- **登录页**：hero 区放 `turtle_wave`（问候）+ 角落 `buddy_review` 小尺寸，玻璃导航胶囊风格不变。
- **`AIChatPanel.vue`**：顶部人格头像随 `pair_mode` 切换 —— `ai_driver` 显示小龟（默认 `wave`，流式回答时 `think`，答毕命中鼓励语时 `thumbsup/cheer`）；`ai_navigator` 显示智伴（默认 `review`，提出反问时 `ask`，给出思路清单时 `checklist`）。仅换 `src`，加 120ms 淡入淡出过渡。
- **`PairProgrammingBar.vue`**：driver/observer 徽标可复用 `turtle_thumbsup` / `buddy_review` 强化「操作者 vs 审看者」心智。
- **空态**：AI 面板无消息时用 `turtle_wave` + 一句引导文案。

### 4. 内部「角色资源预览页」（设计走查用，非学生功能）

- 路由：`/admin/design/characters`（挂在既有 admin 嵌套路由下，`meta:{ role:'admin' }`，`beforeEach` 复用 `userStore.token` 守卫）。
- 页面结构（组件树）：
  - `CharacterGalleryView.vue`
    - `<GlassPanel>` 页头（标题「AI 双角色形象设定表」+ 说明）
    - 两个分组瓷片区：`<PoseGrid title="小龟 · 驾驶员">` / `<PoseGrid title="智伴 · 领航员">`
      - `<PoseTile>` × N（圆角 22–28 瓷片、pastel 渐变、图 + 中文 label + `key` 代码 + 「复制路径」迷你胶囊按钮）
    - 顶部工具条：底色切换（透明棋盘 / 白 / 奶油 / 深灰，用于验证抠图边缘）
- 交互：点瓷片放大预览（玻璃弹窗，backdrop-blur 18–24px）；点「复制路径」→ 复制 `@/assets/generated/xxx.png` 到剪贴板 + Element Plus `ElMessage` 成功提示。

### 5. 数据与 API 契约

- 资源本身是**静态前端资产**，默认零后端。仅当需要后台可换肤/CMS 化时，提供只读端点（可后置，先按静态实现）：
  - `GET /api/v1/admin/design/characters`
  - 鉴权：JWT Bearer；依赖 `get_current_user` + `require_admin`。
  - 响应信封：`{ code, message, data }`，`data` 形如：
    ```json
    { "characters": [
      { "role": "turtle", "persona": "ai_driver", "poses": [
        { "key": "wave", "label": "挥手打招呼", "url": "/static/generated/turtle_wave.png" } ] },
      { "role": "buddy", "persona": "ai_navigator", "poses": [
        { "key": "review", "label": "放大镜审查", "url": "/static/generated/buddy_review.png" } ] }
    ] }
    ```
  - 前端经 `UnwrappedApi` 直接读 `res.data.characters`；失败走 axios 拦截器统一处理（401→/login）。
  - **实现顺序建议**：先纯静态 `aiCharacters.ts` 上线，端点标记为 R+ 可选增强。

### 6. 状态设计（加载 / 空态 / 错误 / 无数据）

- **加载**：图片 `loading="lazy"` + 骨架灰块占位（瓷片尺寸不跳动）。
- **无数据/缺图**：某姿态 `src` 缺失时显示 `mascot_turtle` 兜底图 + 角标「待补图」chip，不报错。
- **错误**：`onerror` 回退到兜底图并 `console.warn`；预览页顶部给一条非阻塞提示。
- **空态**（走后端且返回空）：整页展示 `turtle_think` + 文案「暂无角色资源」。

### 7. 响应式 / 移动端要点

- 预览页瓷片网格：`repeat(auto-fill, minmax(200px,1fr))`；`>1200px` 每行 4–5、`768–1200px` 3、`<768px` 2、超窄 1 列。
- 图片 `max-width:100%`、等比；玻璃弹窗移动端转为近全屏底部抽屉。
- AI 面板头像在窄屏缩为 40–48px，不挤压消息区。
- 触控命中区 ≥ 44px；`prefers-reduced-motion` 时关闭悬浮微抬与淡入。

### 8. 验收点（逐条勾核）

1. `frontend/src/assets/generated/` 下 9 张新姿态图齐备、透明底、命名符合规范、经 optimize 压缩且各 ≤ 尺寸上限。
2. `aiCharacters.ts` 导出 `TURTLE_POSES`（5）+ `BUDDY_POSES`（4），label 均为简体中文，`src` 走 Vite `import`（构建后带哈希、可正常加载）。
3. `AIChatPanel.vue`：`ai_driver` 显小龟、`ai_navigator` 显智伴；流式中→`think`/`review`，答毕鼓励→`thumbsup`/`cheer`、反问→`ask`，切换有过渡、无闪烁。
4. 登录页 hero 显示 `turtle_wave`；`PairProgrammingBar` driver/observer 徽标更新且区分清晰。
5. `/admin/design/characters` 仅 admin 可进（非管理员被 `beforeEach` 拦到 /login 或 403）；两分组瓷片按角色分区、样式符合玻璃+瓷片设计系统（半径 22–28、backdrop-blur 18–24、1px 高光描边）。
6. 底色切换能验证抠图边缘（透明/白/奶油/深灰均无白边/杂边）。
7. 「复制路径」复制正确的 `@/assets/generated/*.png` 并弹成功提示。
8. 缺图兜底、`onerror` 回退、空态文案均按第 6 节表现，无红色报错。
9. 响应式断点列数正确；移动端弹窗转底部抽屉；`prefers-reduced-motion` 生效。
10. `npm run build`（vue-tsc）零类型错误、零 lint 阻断——这是前端交付的唯一门禁。
11. （若实现后端端点）`GET /api/v1/admin/design/characters` 返回 `{code,message,data}` 信封、JWT+admin 鉴权生效、前端 `UnwrappedApi` 正确解包；未实现时该项标注为 R+ 跳过。
12. 全程无 emoji 混入代码字符串外的 UI 文案（🐢 仅作既有品牌吉祥物用途保留）。


---

## 5. 验收标准

**每张生图（§3/§4）**：① 玻璃+瓷片+卡通3D 三材质齐备、与锚定图一致；② 学生端暖/教师端冷配色正确；③ 布局分区与组件与规格一致、界面文字简体中文无糊；④ 3D 角色/图标可抠图复用（立绘透明底）。
**每屏 Codex 落地**：① 路由/组件树/交互/空态按规格实现；② 遵循 `/api` + `{code,message,data}` + JWT；③ `npm run build`(vue-tsc) 通过；④ 响应式达标、移动端可用；⑤ 生图 PNG 经 `assets.ts` 覆盖内置 SVG、缺失回退不白屏。
**整体**：师生端视觉与入口明确区分（教师独立登录 URL）；三语言(Python/C++/C)可切换；云/本地保存+下载+上传(默认云端)；AI 双角色禁代写红线；未成年人安全(同意/护栏/用时)在 UI 有体现。
