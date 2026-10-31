# V2 前端升级优化路线（review 稿）

> **目标产品**：`D:\VB\jiedui-code-platform\CX\web`（结对编程智能体平台，即当前 5273 端口运行、我已在浏览器打开的这个 web 应用）。
> **本轮诉求**：① 教师端拆「**教学 / 教研**」两大板块；② 学生端精简为纯 **AI 结对编程**功能；③ 全站「**少即是多**」——文字过多改为折叠 / 导航引导 / 渐进披露；④ **高级动效**升级（对标 landing.love 收录的 GSAP/WebGL 类作品、land-book 的 UI 审美）；⑤ 教师后台看学生细节数据 + **AI 分析出关键结论与画像**。
> **纪律**：本文只交付方案供 review，**不改代码**。通过后按 §7 分阶段实施，每阶段可独立验证。

---

## 0. 前提纠偏（读本文前必看）

深度研究由 4 个并行 agent 完成，其中「标杆拆解」agent 因 cwd 指向另一代码库，误引了 `D:\Code\CodeAgent\frontend` 的路径与技术栈。**以下为本项目（CX/web）真实前提，附录中的路径已批量校正为 `CX/web/src/...`**：

| 项 | 研究稿误述 | **CX/web 实际** |
|---|---|---|
| UI 库 | Element Plus | **无组件库**，手写 `components/ui/*`（BaseButton/BaseCard + F1 新增 6 原语） |
| CSS | 无 Tailwind | **有 Tailwind** + 三层设计令牌 `styles/tokens.css` |
| 设计系统 | 未建立 | **已建**：玻璃拟态 `.glass`(含 `-webkit-` + `[data-cap=low]` 降级) + 瓷片渐变令牌 + 6 原语 `GlassPanel/CeramicTile/BentoGrid/RingProgress/FloatingDecor/PixelWordmark` |
| 素材 | 无 | **20 张卡通 3D PNG**（gpt-image-2 生成、去底 512），经 `assets.ts` 同名覆盖 SVG、缺失回退 |
| 积木/编辑器 | 无 Blockly | **有** Blockly + Monaco + Pyodide + ECharts |
| 现有路由 | `/`、`/thinking`、`/tasks`、`/admin/*` | `/login`、`/student/{home,ide,thinking}`、`/teacher/dashboard` |

> 结论：**V2 是在已有玻璃设计系统之上做「信息架构重构 + 动效系统 + 功能补齐」**，不是从零搭 UI。附录中所有"新建 tokens / 新建原语"的建议，凡 CX 已有的一律**复用**，只补差集。

**API 与生图（本轮已核实并统一）**
- 新 Key `${AI_API_KEY} 已在 `server/app/ai.py`、`web/scripts/gen-assets.py`、文档同步，**旧 key 全项目无残留**。
- 端点实测：`https://api.llm-token.cn/v1` **21.2s** ✅（推荐默认）> `https://gpt-agent.cc/v1` 33.2s ✅（fallback）。生图脚本建议加 `AI_IMG_URL` 优先级列表。

---

## 1. 执行摘要（5 个核心决策）

**D1 · 教师端拆双区，用 Zone Switcher 而非堆导航**
`/teacher/teaching/*`（今日·班级·任务·课堂·学情·预警）与 `/teacher/research/*`（分析·画像·课例·量表·导出·报告）。顶部一个 **教学 ⇄ 教研** 切换器，切区即换整套二级导航与配色（教学暖 `#F5A623` / 教研冷 `#6C9CE9`，`[data-zone]` 驱动）。**新增功能不新增导航项**，进命令面板（Cmd-K）。

**D2 · 学生端收敛为「一页 + 一抽屉」**
只保留 `/studio`（+ `/studio/s/:sid` 会话）。中央是 **ChatCanvas（对话为唯一主体）**，右侧 **InsightRail 默认 0px**、按需展开 340px，内含四页签：**总结 / 错题 / 行为 / 进阶**。删除独立的 `/thinking`、`/tasks`（并入 Rail 与 Composer 胶囊）。所有状态走 query（`?rail=`、`?socratic=1`、`?editor=1`），**可分享、可回退、无布局跳变**。你要的 8 项功能全部落位（见 §3）。

**D3 · 「少即是多」= 可量化验收，不是形容词**
- 首屏**可交互元素 ≤ 12**；首屏**中文正文 ≤ 90 字**（每个路由 `meta.copyBudget` 声明预算）
- **每张瓷片只承载 1 个判断 + 1 个动作**；解释性文字进 `hint`，明细进 `drill`
- **层级 ≤ 3 跳**：区 → 列表 → Peek 抽屉；第 4 跳必须是独立路由，**禁止抽屉套抽屉**
- 可写成 `npm run build` 前的 **lint 脚本**自动卡（附录 B §3.3）

**D4 · 动效走 L0/L1/L2 三级分级，不引通用动效库**
`L0` CSS 令牌 + `<Transition>`（覆盖 ~85%，**0 KB**）→ `L1` 自写 `useMotion` 薄封装（WAAPI+rAF，~2 KB）→ `L2` **GSAP+ScrollTrigger 仅教研叙事页动态 import**（首屏 0 KB / 该路由 35 KB）。**拒绝** motion-v / @vueuse/motion / Lottie / WebGL。
理由硬核：校园网 + Monaco/ECharts 抢主线程时，CSS/WAAPI 跑在合成器线程**仍顺滑**，JS 驱动库会和 Monaco 打架；且降级只需改 `--d-*` 变量即全站生效。

**D5 · AI 分析用「结论先行 + 证据折叠」，杜绝大段文字**
教师端不展示 AI 长文，而是 **InsightCard**：一句话结论 + 置信度 + `展开看证据链`（EvidenceChain 逐条溯源到具体运行/对话/提交）。5 类洞察卡（学习画像 / 优势薄弱 / 风险预警 / 个性化建议 / 班级共性），每类有 prompt 要点与输出 JSON schema + `insight_service.audit()` 出闸审核。

---

## 2. 教师端 · 信息架构（教学 | 教研）

```
/teacher
├── teaching  教学（上课当天要用）        [暖色 · cozy 密度 · 投影可读]
│   ├── today      今日     signal 4  ≤90字   本节课要处理什么
│   ├── classes    班级     signal 6  ≤60字   drills: class/roster
│   ├── resources  资源     signal 4  ≤60字   ★新增 备课资产：题库|视频|练习集（页内 3 tab）
│   │                                          drills: exercise/video/set/pushSheet
│   ├── tasks      任务     signal 5  ≤70字   drills: task/submission（下发用资源里的题）
│   ├── live       课堂     signal 3  ≤40字   实时监看(fullbleed)
│   ├── students   学情     signal 5  ≤70字   drills: student
│   ├── alerts     预警     signal 3  ≤60字   badge=未读数
│   └── students/:id        L3 独立页(唯一)  ≤140字
└── research  教研（课后/周期性）          [冷色 · dense 密度 · 去装饰]
    ├── analysis   分析     班级/群体数据分析
    ├── profiles   画像     AI 结论 + 学生画像
    ├── cases      课例     课例与教学资源
    ├── rubrics    量表     计算思维量规
    ├── export     导出     脱敏研究数据(已实现)
    └── report     报告     滚动叙事页(L2 GSAP 唯一战场)
```

**关键机制**（附录 A/B 详述）
- **`usePeek()` 栈式抽屉**：班级→学生→提交→运行 全部同一套抽屉，URL query 驱动、后退键=收起、深度 ≤3
- **`TileSpec` 下钻契约**：所有瓷片统一 `{label,value,delta,state,spark,drill,hint}`，正面只显示判断
- **`useDensity()`**：教研 `dense` / 教学强制 `cozy`（讲台投影 + 教师视距，不给 12px）
- **数字一律等宽**：`font-variant-numeric: tabular-nums` + Mono（扫一列分数的可读性 > 任何图表美化）

### 2.1 ★ 新增：资源中心（题库 / 学习视频 / 练习集）与推送

> 需求：教师端（超管后台）要能**推送学习视频给学生 · 设置题库 · 出练习题**。
> **现状核实**：CX 后端目前 **7 张表 / 8 个路由，无任何题库·视频·练习实现** → 本模块为**全新建**（数据模型可参考同类产品 CodeAgent 的 `Exercise`/`Video` 字段设计，但技术上须用 CX 的 **stdlib sqlite3 + store.py 风格**，非 ORM）。

**D6 · 资源归「教学」区，作 1 个入口 + 页内 3 tab（不撑爆导航）**
- 落位 `/teacher/teaching/resources`，页内 tab：**题库 | 视频 | 练习集**。理由：备课属教学动作；教学区导航保持 ≤7 项；资源是可复用资产，靠 tab 而非并列路由承载。
- 每 tab 首屏只放**列表 + 筛选**（signal）；题目详情/编辑器、视频详情、练习集编排一律走 **Peek 抽屉**（noise），符合「层级 ≤3 跳」。

**D7 · 「推送」是跨页面动作，不是导航项**
教师的推送意图产生于两个场景，因此入口设在意图发生处，而非再加一个菜单：
| 入口 | 场景 | 闭环 |
|---|---|---|
| **资源页** 选中素材 → `推送给…` | 备课时批量下发 | 资源 → 班级/小组/学生 |
| **学情/预警页** 选中学生 → `推荐资源` | 发现薄弱即时补救 | **发现问题 → 即时补救**（教育闭环的关键） |
统一由 `PushSheet.vue` 承载（选目标 + 推荐理由 + 可选截止/必做），推送记录可查完成率。

**D8 · 学生端接收保持极简（不破坏"默认屏只有对话"）**
推送内容**不常驻**：Composer 上方**任务胶囊**显示未读小红点 → 点开 Peek 抽屉看列表 → 视频以 `VideoCard` 在**对话流内**可播、练习点「开始练习」落到编辑器/流内 `CodeCard`。默认屏依旧只有对话。

**D9 · 题目标注计算思维六维 → 打通画像闭环**
题库字段含**六维标注**（抽象/分解/建模/算法设计/验证优化/迁移）；学生做题产生 CT 事件 → 画像更新 → **AI 按薄弱维度推荐下一题/视频** → 教师端出现「AI 建议推送」卡（一句话理由 + 置信度 + **一键采纳**）。资源模块因此不是孤立 CRUD，而是数据闭环的一环。

> 详细数据模型（建表 SQL）、API 端点、组件 props、AI 推荐 schema 与合规要点 → **附录 E / F**。

## 3. 学生端 · AI 结对编程工作台（你要的 8 项功能落位）

| 你的需求 | 落位 | 交互 |
|---|---|---|
| 对话 | **ChatCanvas 中央主体** | 唯一主体，代码以 CodeCard 卡片形态在流内 |
| 生图 | Composer `＋` → 生图 | 结果 ImageCard 插入对话流（gpt-image-2） |
| 总结 | Rail「总结」页签 + 流内 SummaryCard | 点「总结」后**插入流内**，不跳页 |
| **可勾选强制苏格拉底** | TopBar `⟨苏格拉底 🔒⟩` 开关 + `?socratic=1` | 学生自勾；**教师可锁定**（🔒 态学生不可关） |
| 错题总结 | Rail「错题」页签 | 自动归集报错→修复对，可复练 |
| 学习行为纠正 | **BehaviorNudge 内联气泡** | 触发式浮现（如连续报错未读提示），**不常驻** |
| 行为统计分析 | Rail「行为」页签 | 原 `/thinking` 六维雷达并入此处 |
| 主动进阶提问 | **NextStepChips** | AI 回答结束后浮现 2–3 枚追问胶囊 |
| ★ 接收老师推送 | Composer 上方**任务胶囊**(未读红点) | 点开 Peek 看列表；视频流内可播、练习一键开始 |

**布局**：TopBar 48px + 左侧会话栏（56px 悬停浮出）+ 中央 ChatCanvas + 右侧 InsightRail（默认 0，展开 340px）。**默认屏上只有对话**，其余按需浮现——这就是「少即是多」的落地。

## 4. 动效系统要点

- **令牌**：`styles/motion.css` 统一 `--d-fast/base/slow` + `--e-out/spring`，`prefers-reduced-motion` / `[data-cap=low]` **只改写变量**即全站降级（复用 F1 已建的 `[data-cap]` 机制）
- **12 类动效**：页面转场 / 卡片 stagger / **KPI count-up** / 图表渐显 / hover 微交互(微抬·磁吸·光泽扫过) / 骨架屏 / 抽屉折叠 / **滚动叙事(教研报告)** / **AI 打字机与思考态** / 成功庆祝 / 空态呼吸 / 预警脉冲
- **性能红线**：只动 `transform/opacity`；`will-change` 用完即摘；**Monaco viewport 之上禁止 backdrop-filter 与常驻动画**；GSAP 独立 chunk 不进首屏

## 5. AI 学情分析链路

**采集** → `learning_events` 事件字典（对话/代码演进/运行报错修复/苏格拉底采纳/错题/行为纠正/用时/主动提问，批量上报）
**分析** → 5 类 InsightCard，统一 schema + 置信度 + 证据 id 列表 + 审核出闸
**呈现** → 结论一句话 + 展开证据链；学生画像一屏 12 格 bento（AI 一句话 + 六维雷达 + 行为路径条 + 折叠时间线）
**隐私** → 未成年人脱敏、教师可见范围限定、AI 输出审核（复用已有 `guard.py` + 研究导出脱敏）

## 6. 复用 vs 新建

**复用（不动）**：`tokens.css` 三层令牌 · `.glass` 工具类与低配降级 · 6 原语 · `assets.ts` 覆盖机制 · 20 张 3D 素材 · CT/AI/合规/教师聚合 API
**新建**：`usePeek/useCommands/useDensity/useMotion` composables · `PeekHost/CommandK/InsightCard/EvidenceChain/TileSpec 增强版 CeramicTile/ChatCanvas/InsightRail/NextStepChips/BehaviorNudge` 组件 · `motion.css` 令牌 · 教师双区 Shell 与 12 个视图 · 学生 StudioView

## 7. 分阶段实施（每阶段可独立验证）

| 阶段 | 内容 | 验证 | 你的 review 点 |
|---|---|---|---|
| **V1** 地基 | `motion.css` 令牌 + `useMotion/usePeek/useDensity` + `PeekHost` + `TileSpec` 增强 CeramicTile + 文案预算 lint | build ✓ + lint 脚本跑通 | 动效手感、抽屉交互 |
| **V2** 学生端 | `/studio` 单页（ChatCanvas + InsightRail 四页签 + 苏格拉底开关 + NextStepChips + BehaviorNudge）；下线 `/thinking`、`/tasks` | build ✓ + 浏览器走查 | ★**学生端极简度**（先发你） |
| **V3** 教师双区 | Zone Switcher + `teaching/*` **7 页**（今日/班级/**资源**/任务/课堂/学情/预警） | build ✓ + 实景 | 教学区是否"上课能用" |
| **V3.5 ★资源中心** | 题库·视频·练习集 3 tab + 题目编辑器/视频库/练习集编排(Peek) + **PushSheet 推送** + 学生端任务胶囊接收 | 后端 curl 证据 + build ✓ + 师生双端走查 | ★**能否真的备课→下发→学生收到** |
| **V4** 教研区 | `research/*` 6 页 + InsightCard/EvidenceChain + 滚动叙事报告(L2 GSAP) | build ✓ + 实景 | AI 结论可信度与证据链 |
| **V5** 后端补齐 | `learning_events` 采集 + insight 生成/审核 API + **AI 推荐端点(薄弱维度→下一题/视频)** + 生图端点接入 | pytest/curl 证据 | 数据链路 |
| **V6** 打磨 | 移动/低配/无障碍/性能（首屏预算、Lighthouse） | 指标达标 | 收尾 |

> 前端做通（V1–V4）后再进 V5 后端，符合你"前端先做通、review 后再后端"的要求。

## 8. 验收标准

① 首屏可交互 ≤12 / 中文正文 ≤90 字 / 瓷片 1 判断 1 动作 / 层级 ≤3 跳（**lint 可自动卡**）；② 教师端教学·教研两区视觉与导航明确区分；③ 学生端默认屏只有对话，其余按需浮现，8 项功能可达；④ 动效首屏成本 ≤2 KB，GSAP 不进首屏 chunk，低配/reduced-motion 全站降级；⑤ AI 结论均可展开证据链，无大段文字；⑥ `npm run build`(vue-tsc) 通过；⑦ 未成年人脱敏与 AI 输出审核在链路内。

---

> **请 review 并拍板**：① 学生端收敛为 `/studio` 单页（下线 `/thinking`、`/tasks` 独立路由）是否认可？② 教师端按 §2 划分（教学 7 页含**新增资源**、教研 6 页）是否认可？③ 动效 L0/L1/L2 分级（不引通用动效库、GSAP 仅教研报告页）是否认可？④ **资源中心**放教学区、页内 3 tab、**推送作为跨页动作**（资源页批量推 + 学情页针对性推）是否认可？⑤ 先做 **V1+V2（地基+学生端）** 还是**优先 V3.5 资源中心**（若近期就要给老师用备课下发）？
> 确认后我按 §7 开工，每阶段做通即发你实景。

---

## 附录 A · 标杆产品 UI / 信息架构拆解（Linear / Vercel / Datadog / Khan / Duolingo 等）

#### 标杆产品 UI / 信息架构拆解 —— 面向「AI小海龟·结对编程」V2

> 拆解口径：只看**能迁移的机制**，不看视觉表面。每个产品回答三件事：怎么不塞满 → 视觉语言硬参数 → 我们抄哪 1–2 个（具体到组件 / 路由 / props / 代码）。

---

#### 0. 先对齐基线（我读了仓库，避免建议落空）

当前 `CX\web` 的真实状态与 V2 目标栈存在差距，迁移建议按「现文件 → 目标组件」成对给出：

| 现有文件（绝对路径） | 现状 | V2 归属 |
|---|---|---|
| `CX\web\src\router\index.ts` | 平铺路由：`/`、`/thinking`、`/tasks`、`/admin/*`（8 个子路由并列） | 拆 `/t/*`（教学）与 `/r/*`（教研）两棵树 |
| `CX\web\src\views\admin\Dashboard.vue` | 单页塞满（问题①） | 拆成 `/t/today` + `/r/insights` |
| `CX\web\src\views\admin\AdminLayout.vue` | 单层侧栏 | 双区 Shell（Zone Switcher + 区内二级导航） |
| `CX\web\src\views\student\IDE.vue`、`Tasks.vue`、`Thinking.vue` | 三个并列页（问题②） | 收敛为 1 个工作台 + 抽屉 |
| `CX\web\src\components\AIChatPanel.vue` | AI 面板 | 学生端唯一功能中枢，内部分段 |
| `CX\web\src\components\ThinkingDashboard.vue` | 四维雷达 | 下沉为教研区 tile + 学生端抽屉 |

依赖侧：`package.json` 仍是 `element-plus + echarts + monaco`，**无 Tailwind、无 Blockly、无动效库**。V2 动效建议见 §11。

**「一屏塞满」的可量化验收标准（后面每条结论都对这套指标负责）：**
- 首屏**可交互元素 ≤ 12**（按钮/输入/可点卡片/tab 全算）
- 首屏**中文正文 ≤ 90 字**（不含数字与标签）
- **每张瓷片只承载 1 个判断 + 1 个动作**（判断=一个数或一个状态色；动作=一个 CTA 或一次下钻）
- **信息层级 ≤ 3 跳**：区（Zone）→ 列表 → Peek 抽屉。第 4 跳必须是新路由，禁止抽屉套抽屉套弹窗。

---

#### 1. Linear —— 「路由即状态，详情永不跳页」

### ① 怎么不塞满
- **三层渐进披露**：列表行（1 行 = 标题 + 3 个状态芯片）→ hover 浮出行内操作 → 点击进入右侧详情，**列表保持在原位不卸载**。用户永远不丢失上下文，因此不需要"面包屑 + 返回"这种补丁。
- **视图 = URL**：筛选、分组、排序、打开的详情全部序列化进 URL。浏览器后退键天然成为"收起详情"，链接可直接甩给同事。
- **Command-K 承接长尾**：把 80% 的低频功能从导航里删掉，只留在命令面板。侧栏因此只剩 5–7 项。
- **导航项数守恒**：新增功能不新增侧栏项，而是新增命令 / 新增视图预设。

### ② 视觉语言硬参数
- 灰阶主导：正文与图标常驻 **40–60% 不透明度**，只有状态点、优先级、可点元素给到 100% 饱和 —— 这是"密而不吵"的根本手法，不是靠留白。
- 行高 32–36px 的紧凑表格，但**图标与文字基线严格对齐**；分隔线用 4–6% 黑而非实色 border。
- 动效只有两种：120ms 的透明度/位移入场，和 spring 的抽屉推入。没有装饰动画。

### ③ 直接迁移（最高优先级）
**迁移点 A：`usePeek()` —— 全站唯一的下钻基础设施。**教师端"班级 → 学生 → 某次提交 → 某次运行"四层下钻，全部用同一个栈式抽屉，靠 URL query 驱动。

```ts
// CX/web/src/composables/usePeek.ts
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export type PeekKind = 'student' | 'submission' | 'run' | 'class' | 'task'
export type PeekTarget = `${PeekKind}:${string}`          // 'student:1024'

export function usePeek() {
  const route = useRoute()
  const router = useRouter()

  const stack = computed<PeekTarget[]>(() =>
    String(route.query.peek ?? '').split(',').filter(Boolean) as PeekTarget[]
  )
  const top = computed(() => stack.value.at(-1) ?? null)

  const open = (t: PeekTarget) =>
    router.push({ query: { ...route.query, peek: [...stack.value, t].join(',') } })

  const close = () => {
    const s = stack.value.slice(0, -1)
    router.push({ query: { ...route.query, peek: s.length ? s.join(',') : undefined } })
  }
  const reset = () => router.push({ query: { ...route.query, peek: undefined } })

  return { stack, top, depth: computed(() => stack.value.length), open, close, reset }
}
```

```vue
<!-- CX/web/src/components/peek/PeekHost.vue —— 挂在 Shell 里一次，全站生效 -->
<script setup lang="ts">
import { usePeek } from '@/composables/usePeek'
const { stack, close } = usePeek()
const registry = {                       // 每种 kind 一个懒加载详情组件
  student:    defineAsyncComponent(() => import('./panes/StudentPane.vue')),
  submission: defineAsyncComponent(() => import('./panes/SubmissionPane.vue')),
  run:        defineAsyncComponent(() => import('./panes/RunPane.vue')),
} as const
</script>

<template>
  <TransitionGroup name="peek">
    <GlassPanel
      v-for="(t, i) in stack" :key="t"
      class="fixed top-0 right-0 h-dvh"
      :style="{ width: 'min(560px, 92vw)', transform: `translateX(${(stack.length - 1 - i) * -28}px)`,
                zIndex: 40 + i, opacity: i === stack.length - 1 ? 1 : .55 }"
      @keydown.esc="close"
    >
      <component :is="registry[t.split(':')[0] as keyof typeof registry]" :id="t.split(':')[1]" />
    </GlassPanel>
  </TransitionGroup>
</template>
```

约束（写进 code review checklist）：**`depth ≤ 3`，超出改为 `router.push` 到独立路由**；抽屉是唯一允许用玻璃拟态的容器之一（见 §5）。

**迁移点 B：`AppCommandK.vue` 命令注册表。**新功能一律先进命令表，评估后再决定要不要进导航。

```ts
// CX/web/src/composables/useCommands.ts
export interface Command {
  id: string
  title: string                       // '打开 三(2)班 课堂监看'
  zone: 'teach' | 'research' | 'student' | 'global'
  keywords?: string[]                 // ['jiankan','班级','监看'] —— 必须带拼音首字母
  section: '跳转' | '创建' | '学生' | '设置'
  when?: () => boolean
  run: () => void | Promise<void>
}
```
中文场景务必在 `keywords` 里塞**拼音全拼 + 首字母**（`sanerban`/`s2b`），否则命令面板在中文产品里基本废掉 —— 这是抄 Linear 时最容易漏的一步。

---

#### 2. Vercel(Geist) —— 「用最少的设计决策换高级感」

### ① 怎么不塞满
- 极窄的决策空间：一条灰阶 + 一个墨色，几乎不用彩色分区。信息层级完全由**字重 + 灰度 + 间距**表达，而不是靠色块和卡片边框，页面因此不会被切碎成一格一格。
- 顶部导航只做"项目 → 部署 → 详情"三段，其余全在页内 tab 与右侧属性栏。

### ② 视觉语言硬参数
- 底色 `#fafafa` / 墨色 `#171717`；**真中性灰，无冷暖偏色**；每个 border / disabled 都取自同一条灰阶的确定档位。
- 间距刻度 `[4,8,12,16,24,32,40,48,64]`；交互元素圆角 **6px**，独立 CTA 用 **9999px 胶囊**。
- 大字号负字距（display 级 −2.4px 起），Sans + Mono 双家族，Mono 专用于代码 / 数字 / 技术标签。

### ③ 直接迁移
**迁移点：同一套 token，三套 zone 语义映射 —— 教研区去色。**这是解决"教师端太吵"最便宜的一招：不改组件，只改 `data-zone`。

```css
/* CX/web/src/styles/tokens.css */
:root{
  --ink:#1B1B1F; --ink-2:rgba(27,27,31,.62); --ink-3:rgba(27,27,31,.38);
  --line:rgba(27,27,31,.08);
  --radius-ui:6px; --radius-tile:16px; --radius-pill:9999px;
  --sp-1:4px;--sp-2:8px;--sp-3:12px;--sp-4:16px;--sp-6:24px;--sp-8:32px;--sp-10:40px;--sp-12:48px;--sp-16:64px;
  --mono:'Geist Mono','JetBrains Mono',ui-monospace,monospace;
}
[data-zone="teach"]   { --surface:#FFF8F0; --accent:#F5A623; --accent-weak:#FDEBD0; --deco-opacity:1 }
[data-zone="research"]{ --surface:#FBFBFC; --accent:#6C9CE9; --accent-weak:#E9EFFA; --deco-opacity:0 } /* 教研区：关掉 FloatingDecor */
[data-zone="student"] { --surface:#F7F5FF; --accent:#7C6BF0; --accent-weak:#EDEAFD; --deco-opacity:1 }
```
```ts
// AppShell.vue —— 路由前缀驱动
watchEffect(() => {
  document.documentElement.dataset.zone =
    route.path.startsWith('/r') ? 'research' : route.path.startsWith('/t') ? 'teach' : 'student'
})
```
配套硬规则：**所有数字、代码、学号、耗时一律 `font-family: var(--mono)` + `font-variant-numeric: tabular-nums`**。教师扫一列分数时，等宽数字带来的可读性提升，比任何图表美化都值钱。

---

#### 3. Datadog —— 「概览一眼看健康，点一下才看细节」

### ① 怎么不塞满
- **Widget Group 是一等公民**：官方指南要求"哪怕组里只有一个 widget 也要建组"，因为分组决定了低/高密度模式下的排布与折叠单位。
- **密度是用户可切的全局开关**（High Density Mode），不是设计师拍死的常量。
- **Context Links**：每个概览指标都携带"去哪看根因"的链接契约，从 KPI 尖峰一键跳到具体 host 面板。
- 目标是「**3 秒内不读文字就能判断健康状况**」—— 靠状态色 + 迷你趋势线，不靠标签。

### ② 视觉语言硬参数
- 深色为主，图表色板严格限制在 6–8 色并固定语义（红=错、黄=警、绿=正常），色不复用。
- 图表去装饰：无网格重线、无渐变填充、坐标轴标签比数据弱两档。
- 折叠组标题栏自带"组内异常计数"徽标，折叠后信息不丢失。

### ③ 直接迁移
**迁移点 A：`TileSpec` 下钻契约 —— 所有瓷片统一数据形状，禁止一次性画完。**

```ts
// CX/web/src/types/tile.ts
export interface TileSpec {
  id: string
  label: string                              // '本节课卡住人数'
  value: string | number
  delta?: { v: number; good: 'up' | 'down' } // 语义化涨跌，不让组件猜红绿
  state?: 'ok' | 'warn' | 'risk'
  spark?: number[]                           // ≤ 24 点的迷你趋势，不上 ECharts，用 SVG polyline
  drill?: { peek: PeekTarget } | { to: RouteLocationRaw }
  hint?: string                              // 只在 hover / 长按时出现的一句解释
}
```
```vue
<!-- CeramicTile 增强：把「下钻」变成能力而不是每个页面各写一遍 -->
<CeramicTile v-for="t in tiles" :key="t.id" :spec="t" @drill="onDrill(t)" />
```
```ts
function onDrill(t: TileSpec) {
  if (!t.drill) return
  'peek' in t.drill ? peek.open(t.drill.peek) : router.push(t.drill.to)
}
```
**关键纪律：瓷片正面只允许出现 `label + value + state + spark`。任何解释性文字进 `hint`，任何明细进 `drill`。**这一条直接砍掉现在 `Dashboard.vue` 里 60% 的文字。

**迁移点 B：`useDensity()` 全局密度开关。**教研区默认 `dense`，教学区强制 `cozy`（讲台投影 + 教师视距，不能给 12px）。

```ts
// CX/web/src/composables/useDensity.ts
export const useDensity = createGlobalState(() => {
  const density = useStorage<'cozy' | 'dense'>('tt.density', 'cozy')
  watchEffect(() => { document.documentElement.dataset.density = density.value })
  return { density }
})
```
```css
:root[data-density="cozy"] { --tile-pad:20px; --row-h:44px; --fs-body:15px; --fs-min:14px }
:root[data-density="dense"]{ --tile-pad:12px; --row-h:32px; --fs-body:13px; --fs-min:13px }
[data-zone="teach"]        { --tile-pad:20px !important; --row-h:44px !important; --fs-body:15px !important }
```

---

#### 4. Stripe Dashboard —— 「Shortcuts 让导航自己学会收缩」

### ① 怎么不塞满
- 导航里有 **Shortcuts（置顶 + 最近访问）** 区：高频路径自动上浮，长尾沉进分类。导航长度不随功能数增长。
- 统一 IA 后，列表 → 详情走**同页右侧面板 / 全页详情**双模式：小对象（一笔交易）用面板，大对象（一个客户）用路由页。
- 复杂控件（筛选器、批量操作）折叠成一行 chip，展开才是完整表单。

### ② 视觉语言硬参数
- 表格是主角：表头弱化、行分隔线极浅、金额右对齐等宽。
- 状态一律用**低饱和底 + 深色字的 pill**（succeeded / failed），不用纯色实心块，避免表格变成彩虹。
- 空状态永远给"下一步动作 + 文档链接"，不给插画独白。

### ③ 直接迁移
**迁移点：教师端侧栏顶部的 `PinnedShortcuts`。**中小学教师的真实路径极度重复（"进我今天上课的那个班"），把它自动化。

```ts
// CX/web/src/stores/nav.ts
export const useNavStore = defineStore('nav', () => {
  const pinned = useStorage<NavItem[]>('tt.pinned', [])
  const recent = useStorage<NavItem[]>('tt.recent', [])
  function track(item: NavItem) {
    recent.value = [item, ...recent.value.filter(i => i.to !== item.to)].slice(0, 4)
  }
  return { pinned, recent, track }
})
```
侧栏结构固定为：**Shortcuts(≤4) → 教学(4 项) → 教研(4 项) → 设置**，总计 ≤ 13 项且视觉上分三段。对比现在 `/admin` 下 8 个并列项 + Dashboard 大杂烩，导航一眼可读。

配套：**`Questions.vue` / `Videos.vue` 这类低频页从侧栏移除**，只留在 Command-K 与「教研 → 资源」二级页里。

---

#### 5. Apple（bento 产品页）—— 「一格一句话，滚动来编排」

### ① 怎么不塞满
- **每个 bento tile 只讲一个卖点**，标题一行、副文案至多两行，细节靠"点开原地展开"或滚动到下一屏。
- 用**滚动位置**做叙事节拍：内容分批入场，用户的注意力被强制串行化，永远只在看一件事。
- 极端克制的层级：全页只有 1 个主标题层级 + 1 个正文层级。

### ② 视觉语言硬参数
- tile 圆角大（16–28px）、内边距大（24–40px）、tile 间距 8–16px，靠"外密内疏"制造秩序感。
- 图像/3D 素材占 tile 面积 ≥ 50%，文字退到角落。
- 动效：入场 `translateY(16px) + opacity` 曲线 `cubic-bezier(.16,1,.3,1)`，时长 500–700ms，逐格 60–80ms stagger。

### ③ 直接迁移
**迁移点 A：`useScrollReveal` + 逐格 stagger（0 依赖，IntersectionObserver 即可）。**用在学生端首屏与教研报告页。

```ts
// CX/web/src/composables/useScrollReveal.ts
export function useScrollReveal(selector = '[data-reveal]', step = 70) {
  onMounted(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll<HTMLElement>(selector).forEach(el => el.dataset.revealed = '1'); return
    }
    const io = new IntersectionObserver(entries => {
      entries.filter(e => e.isIntersecting).forEach((e, i) => {
        const el = e.target as HTMLElement
        el.style.transitionDelay = `${i * step}ms`
        el.dataset.revealed = '1'
        io.unobserve(el)
      })
    }, { threshold: .18, rootMargin: '0px 0px -8% 0px' })
    document.querySelectorAll(selector).forEach(el => io.observe(el))
  })
}
```
```css
[data-reveal]{ opacity:0; transform:translateY(16px);
  transition:opacity .6s cubic-bezier(.16,1,.3,1), transform .6s cubic-bezier(.16,1,.3,1) }
[data-reveal][data-revealed="1"]{ opacity:1; transform:none }
```

**迁移点 B：瓷片"原地展开"用 View Transitions API，替代弹窗。**学生端"行为统计"从小 tile 展成全屏，不跳路由、不闪白。

```vue
<script setup lang="ts">
const focused = ref<string | null>(null)
function toggle(id: string) {
  const go = () => (focused.value = focused.value === id ? null : id)
  // @ts-expect-error 渐进增强
  document.startViewTransition ? document.startViewTransition(go) : go()
}
</script>

<template>
  <BentoGrid>
    <CeramicTile v-for="t in tiles" :key="t.id"
      :style="{ viewTransitionName: `tile-${t.id}` }"
      :class="focused === t.id ? 'col-span-full row-span-2' : ''"
      @click="toggle(t.id)" />
  </BentoGrid>
</template>
```
```css
::view-transition-old(*), ::view-transition-new(*){ animation-duration:.42s;
  animation-timing-function:cubic-bezier(.16,1,.3,1) }
```

**同时定一条硬规则（这条能救掉玻璃拟态最常见的翻车）：**
> 玻璃（`GlassPanel`）**只用于浮层**：Peek 抽屉、Command-K、顶部工具条、结对状态条。
> 瓷片（`CeramicTile`）**只用于内容**，实心底 + 1px `--line`。
> **两者永不嵌套**，玻璃层下方必须有 `backdrop-blur` 与 ≥ 12% 的遮罩，否则教室投影下正文对比度不达标。

---

#### 6. Khan Academy —— 「把大目标切成 Unit Mission」

### ① 怎么不塞满
- 新版把 **Course Mastery Goals 拆成 Unit Missions**：教师看到的是一个个小块的单元进度，而不是一条模糊的整体百分比 —— 定位薄弱点的成本从"读一屏"降到"扫一行"。
- 教师端围绕**高频任务**重排导航（班级 / 内容 / AI 工具 / 已存材料），报告页按"学习时长 / 进度 / 技能掌握 / 完成情况"四个独立视图分开，而不是一页四张图。
- 学生端 dashboard 的唯一任务：**让"下一个该练的技能"显而易见**。

### ② 视觉语言硬参数
- 掌握度用**四态离散色**（未开始 / 熟悉 / 熟练 / 掌握），永远是同一套色 + 同一套形状，跨页面复用形成"色即语义"。
- 大量使用横向进度条 + 分段格，而非饼图；一行内信息 ≤ 4 个元素。
- 教育场景的字号下限明显高于 SaaS（正文 15–16px）。

### ③ 直接迁移
**迁移点 A：`MasteryStrip.vue` —— 四态离散色，替换现在的四维雷达在班级页的位置。**雷达图适合个人画像（教研区），不适合班级扫描（教学区）。

```ts
export type MasteryLevel = 0 | 1 | 2 | 3   // 未开始 / 熟悉 / 熟练 / 掌握
export const MASTERY = {
  0: { c: 'var(--line)',      t: '未开始' },
  1: { c: '#FDE3B8',          t: '熟悉'   },
  2: { c: '#F5A623',          t: '熟练'   },
  3: { c: '#7C6BF0',          t: '掌握'   },
} as const
```
```vue
<!-- 一行 = 一个学生；一格 = 一个知识单元；点击格子 → peek.open(`submission:${id}`) -->
<div class="flex gap-[3px]">
  <button v-for="u in units" :key="u.id"
    class="h-3 flex-1 rounded-[3px] transition-transform hover:scale-y-150"
    :style="{ background: MASTERY[u.level].c }"
    :aria-label="`${u.name} · ${MASTERY[u.level].t}`"
    @click="peek.open(`submission:${u.lastSubmissionId}`)" />
</div>
```
30 人班级 = 30 行 × 12 格，一屏内即可"色块扫描"找出成片浅色的单元 —— 这就是教师最想要的"哪个知识点全班都卡住"。

**迁移点 B：把「四维计算思维」从雷达图改造成 `UnitMission` 语义。**分解/抽象/算法/调试各自绑定 3–5 个可判定行为事件，教师端只展示"本单元哪一维掉队"，详细雷达进 `/r/portraits/:id`。对应改造 `CX\web\src\components\ThinkingDashboard.vue`。

---

#### 7. Duolingo —— 「唯一路径，唯一下一步」

### ① 怎么不塞满
- 从可自由探索的"技能树"改成**单一线性 path**：删掉选择，就删掉了 90% 的界面复杂度。产品明确接受"两个人学同样时长应该到同一个地方"。
- 练习、故事、复习合并进**一个 feed**，切换成本为零；额外内容收进 Practice Hub 单独 tab。
- 首屏永远只有一个明确的圆形按钮（下一课），其余是奖励/社交，位置固定、永不抢主。

### ② 视觉语言硬参数
- 巨大点击目标（≥ 56px）、厚底边按钮（3–4px "实体感"阴影）、圆润无锐角。
- 状态反馈极其响亮：正确/错误用全屏色带 + 音效 + 弹性动画（scale 1 → 1.06 → 1，spring）。
- 文案短到极限，大量用图标 + 数字替代句子。

### ③ 直接迁移
**迁移点 A：`NextStepCard.vue` —— 教师端 `/t/today` 和学生端首屏各只放一张。**这是治"信息全塞一屏"的主刀。

```ts
// CX/web/src/components/NextStepCard.vue
defineProps<{
  kind: 'resume' | 'fix' | 'review' | 'challenge'   // 继续 / 订正 / 复盘 / 进阶
  title: string                                     // '继续：三(2)班 循环嵌套'
  reason: string                                    // 一行「为什么是它」，≤ 24 字
  cta: { label: string; to: RouteLocationRaw }
  meta?: { minutes?: number; skill?: string; peopleStuck?: number }
  secondary?: Array<{ label: string; to: RouteLocationRaw }>  // 最多 2 个，弱化样式
}>()
```
规则：**`reason` 必填**。任何 AI 推荐都必须自解释（"12 人在第 7 行卡住 ≥ 5 分钟"），否则教师不信、学生不点。

**迁移点 B：学生端"进阶提问"做成 Duolingo 式的 `ChallengeChip` 序列，而不是列表页。**小海龟在对话流末尾追加 2–3 个可点芯片（"想想如果输入是负数呢？"），点击即把问题送进对话 —— 主动进阶提问由此不需要独立页面，直接寄生在 `AIChatPanel.vue` 里。

**⚠️ 明确不抄：**连胜（streak）焦虑、红心/体力、排行榜攀比。K12 校园版是 B2B 采购，家长与学校对"成瘾式设计"极其敏感，抄错方向会直接影响过审。只取「唯一下一步 + 即时正反馈」，不取「损失厌恶」。

---

#### 8. Google Classroom —— 「四个 tab 就是全部心智模型」

### ① 怎么不塞满
- 每个班级只有 **Stream / Classwork / People / Grades** 四个 tab，十年没变。**信息按"沟通 / 内容 / 人 / 分数"四象限切分**，教师不需要学习 IA。
- Classwork 用 **Topic 分组**把作业折叠成可展开的段落，一学期 60 个作业也只显示 8 个 Topic。
- Grades 是唯一允许高密度的表格页 —— 把"密"集中到一个地方，其余页面全部轻。

### ② 视觉语言硬参数
- 卡片流 + 大留白，每张卡只有标题 + 截止时间 + 状态一行。
- 分数表格用最朴素的行列，无色块装饰，只在"未交/迟交"上给一个色点。
- 班级主题色只出现在页头 banner，正文区永远白底 —— 避免个性化色破坏可读性。

### ③ 直接迁移
**迁移点 A：班级详情固定四段式，落到 `/t/classes/:id`。**

```ts
// router：把「班级」做成有 tab 的路由，而不是 Dashboard 里的一个区块
{ path: '/t/classes/:id', component: () => import('@/views/teach/ClassShell.vue'),
  children: [
    { path: '',        name: 'ClassOverview', component: () => import('@/views/teach/ClassOverview.vue') },  // 概览：≤6 张 tile
    { path: 'tasks',   name: 'ClassTasks',    component: () => import('@/views/teach/ClassTasks.vue') },     // Topic 折叠
    { path: 'members', name: 'ClassMembers',  component: () => import('@/views/teach/ClassMembers.vue') },
    { path: 'grades',  name: 'ClassGrades',   component: () => import('@/views/teach/ClassGrades.vue') },    // 唯一 dense 页
  ] }
```
**迁移点 B：`TopicGroup.vue` 默认折叠 + 状态记忆 + 标题栏带异常计数**（Datadog 折叠组 × Classroom Topic 的合体）。

```vue
<script setup lang="ts">
const props = defineProps<{ id: string; title: string; badge?: number; defaultOpen?: boolean }>()
const open = useStorage(`tt.group.${props.id}`, props.defaultOpen ?? false)
</script>
<template>
  <section class="rounded-[--radius-tile] bg-white/70 border border-[--line]">
    <button class="flex w-full items-center gap-2 px-4" :style="{ height: 'var(--row-h)' }"
            :aria-expanded="open" @click="open = !open">
      <ChevronRight class="transition-transform" :class="open && 'rotate-90'" />
      <span class="font-medium">{{ title }}</span>
      <span v-if="badge" class="ml-auto rounded-full bg-[--accent-weak] px-2 text-[12px] tabular-nums">
        {{ badge }} 需关注
      </span>
    </button>
    <div v-show="open" class="px-4 pb-4"><slot /></div>
  </section>
</template>
```
**折叠态必须显示异常计数**，否则折叠 = 隐瞒，教师会全部展开，折叠机制失效。

**⚠️ 不抄：Stream 信息流。**在我们的场景里它会迅速退化成噪音；把"通知"做成 Peek 里的时间线，不做首屏 feed。

---

#### 9. Notion（Education）—— 「/ 唤起一切，toggle 藏起一切」

### ① 怎么不塞满
- **Toggle / 折叠标题**是内容组织的默认单位：一篇长文档的首屏永远只有目录级信息。
- **`/` 斜杠菜单**把 50+ 种块的入口压缩成一个字符，编辑器工具栏几乎为空。
- 侧栏三段（Favorites / Workspace / Private）+ 无限层级树，但默认全收起。
- 数据库的多视图（Table/Board/Calendar）共享同一份数据，**视图切换代替页面新增**。

### ② 视觉语言硬参数
- 无边框、无阴影，靠 hover 时的极浅底色（3–4% 黑）暗示可交互区。
- 文本为绝对主体，图标 16px 灰度；强调只靠加粗与背景高亮。
- 拖拽手柄、块菜单全部 hover 才出现 —— "静止时干净，动起来强大"。

### ③ 直接迁移
**迁移点 A：学生端小海龟输入框接 `/` 斜杠菜单**，把"生图 / 总结 / 错题归纳 / 讲解思路 / 出一道进阶题"这些能力从按钮排排坐里解放出来。现状 `AIChatPanel.vue` 一旦按钮超过 4 个就会开始乱。

```ts
// CX/web/src/composables/useSlashMenu.ts
export interface SlashAction {
  key: string; label: string; hint: string; icon: string
  pinyin: string[]                       // ['shengtu','st'] 中文必备
  build: (arg: string) => { intent: string; payload?: Record<string, unknown> }
}
export const SLASH: SlashAction[] = [
  { key:'img',   label:'生成配图', hint:'把你的想法画出来', icon:'🎨', pinyin:['shengtu','st'],
    build: a => ({ intent:'image', payload:{ prompt:a } }) },
  { key:'sum',   label:'总结这段', hint:'把刚才的对话收成 3 条', icon:'📝', pinyin:['zongjie','zj'],
    build: () => ({ intent:'summarize' }) },
  { key:'wrong', label:'加入错题本', hint:'记录这次报错与订正', icon:'🔖', pinyin:['cuoti','ct'],
    build: () => ({ intent:'wrongbook_add' }) },
  { key:'next',  label:'给我一道进阶题', hint:'基于当前知识点', icon:'🚀', pinyin:['jinjie','jj'],
    build: () => ({ intent:'challenge' }) },
]
```
输入框只保留 **1 个发送按钮 + 1 个苏格拉底开关**，其余全走 `/`。学生端"功能不聚焦"由此解决：**功能没被删，只是不再抢屏**。

**迁移点 B：教研区「课例与量表」直接抄 Notion 的"多视图共享数据源"。**同一份课例数据给三种视图，用 `?view=` 切换，不新增路由：
`/r/cases?view=table`（量表打分）/ `?view=board`（按环节看）/ `?view=timeline`（按课时看）。

**⚠️ 不抄：空白画布。**一线信息科技教师没时间自己搭结构。我们要的是「预制模板 + 可折叠」，不是「什么都能配」。

---

#### 10. code.org / CodeCombat / 编程猫·海龟编辑器 —— 本土少儿编程组（合并拆解）

### ① 怎么不塞满
- **code.org**：把课程拆成一小时可独立完成的关卡，教师自由组合成路径 —— 内容的原子化让任何页面都只需展示"当前这一小时"。学生端界面三栏铁律：**关卡说明 / 编辑器 / 运行舞台**，十年不变。
- **CodeCombat**：把整条学习路径包进一个 RPG 世界，导航被"地图"取代；教师后台单独成站（教学大纲、教案、知识卡、作业、错误定位、知识测评），**学生端不出现任何管理概念**。
- **海龟编辑器 / 编程猫**：积木 ⇄ 代码双模切换是核心交互；界面按"素材区 / 积木区 / 舞台区"分栏，功能靠**顶部模式切换**而非侧栏堆叠。

### ② 视觉语言硬参数
- 学生端：高饱和、粗描边、大图标，运行按钮是全页最大的绿色元素。
- 教师端：完全切换成朴素表格 + 淡色，与学生端刻意不像 —— **同一产品的两端允许两套视觉密度**。
- 中文字号偏大（学生端正文 16–17px），行高 1.7 起。

### ③ 直接迁移
**迁移点 A：学生端严格三栏 + 顶部模式切换（积木 / 代码），把 `IDE.vue`、`Tasks.vue`、`Thinking.vue` 三个路由合成一个工作台。**

```
/            结对工作台（默认且几乎唯一）
  左：任务说明（可 60px 收窄成图标条）
  中：Monaco / Blockly（顶部 SegmentedControl 切换，共用同一份 code 状态）
  右：小海龟面板（对话 / 生图 / 总结 / 进阶芯片）
  底：控制台 + 结对状态条
/?peek=stats      → 行为统计（抽屉，不是页面）
/?peek=wrongbook  → 错题本（抽屉）
/?peek=thinking   → 计算思维画像（抽屉）
```
学生端**路由数从 3 降到 1**，功能一个不少。这是"学生端功能不聚焦"的直接答案。

**迁移点 B：`SegmentedControl` 双模切换必须共享单一数据源**，否则积木↔代码来回切会丢代码（这是国产积木编辑器最常见的差评点）：

```ts
// stores/workbench.ts —— 代码是唯一真相，积木是投影
const code = ref('')                       // 唯一 source of truth
const mode = ref<'blocks' | 'code'>('blocks')
watch(mode, (m, prev) => {
  if (prev === 'blocks' && m === 'code') code.value = Blockly.Python.workspaceToCode(ws)
  if (prev === 'code' && m === 'blocks' && dirtyFromCode.value)
    confirmLossy()                         // 代码→积木不可逆，必须显式二次确认
})
```

**迁移点 C：教师端 / 学生端允许两套密度与两套装饰强度**（对应 §2 的 `data-zone`）：`student` 开 `FloatingDecor`、`teach` 半开、`research` 关闭。**同一套组件，不同 zone 不同气质** —— 既保住"卡通 3D"的品牌资产，又不会让教研报告显得不专业。

---

#### 11. 动效方案（现状：无动效库）

不要为了"高级动效"直接上 GSAP 全家桶（体积 + 授权 + 与 Vue 生命周期的耦合成本都不划算）。建议分三层：

| 层 | 技术 | 用途 | 成本 |
|---|---|---|---|
| L0 微交互 | 纯 CSS `transition` + `cubic-bezier(.16,1,.3,1)` | hover / 折叠 / 芯片 / 按钮 | 0 |
| L1 结构转场 | **View Transitions API** + `<Transition>` | 瓷片展开、路由切换、Peek 推入 | 0（渐进增强） |
| L2 编排/物理 | **`motion-v`**（Framer Motion 的 Vue 版，tree-shake 后 ~5–8KB）或 `@vueuse/motion` | 列表 stagger、spring 弹性、拖拽 | 小 |

只在**学生端首屏、成就反馈、教研报告入场**这三处用 L2。全站顶层必须有：

```ts
// main.ts
if (matchMedia('(prefers-reduced-motion: reduce)').matches)
  document.documentElement.dataset.motion = 'off'
```
```css
:root[data-motion="off"] *, :root[data-motion="off"] *::before, :root[data-motion="off"] *::after{
  animation-duration:.01ms !important; transition-duration:.01ms !important
}
```
教室投影仪 + 老旧一体机是真实运行环境，**动效必须可一键关闭并被记忆**（放进 `/t/settings`）。

---

#### 12. 对比总表

| 产品 | 反「一屏塞满」核心机制 | 视觉语言一句话 | 迁到我们哪里 | 具体组件 / 路由 |
|---|---|---|---|---|
| **Linear** | 路由即状态；列表→hover→详情三层；Command-K 承接长尾 | 灰阶 40–60% 主导，只有可交互项满饱和 | 教师端全部下钻 + 全站 | `usePeek()` / `PeekHost.vue` / `AppCommandK.vue`；`?peek=student:12` |
| **Vercel(Geist)** | 决策空间极窄，层级靠字重+灰度而非色块 | 真中性灰 + 单墨色；6px 圆角；Sans+Mono 双家族 | 教研区去色、数字等宽 | `tokens.css` + `[data-zone]` 三套语义映射 |
| **Datadog** | Widget Group 分组折叠 + 密度开关 + Context Links | 状态色语义固定，图表去装饰，3 秒读健康 | 教研数据分析 + 课堂监看 | `TileSpec.drill` 契约、`useDensity()`、`TopicGroup` 异常计数 |
| **Stripe** | Shortcuts 自动上浮高频路径；小对象侧板/大对象整页 | 表格为主角，状态用低饱和 pill | 教师端侧栏 | `PinnedShortcuts` + `useNavStore.track()`；侧栏 ≤13 项 |
| **Apple(bento)** | 一格一句话；滚动做叙事节拍；点开原地展开 | 大圆角大内边距，外密内疏，图 >50% 面积 | 学生端首屏 + 教研报告 | `useScrollReveal()`、View Transitions `viewTransitionName` |
| **Khan** | 大目标切成 Unit Mission；报告按四个独立视图分开 | 掌握度四态离散色，横向分段条不用饼图 | 班级学情扫描 | `MasteryStrip.vue`（30 行 × 12 格） |
| **Duolingo** | 单一路径；首屏唯一 CTA；额外内容进独立 hub | 巨大点击目标 + 响亮即时反馈 | 教师 `/t/today`、学生首屏 | `NextStepCard`（`reason` 必填）、`ChallengeChip` |
| **Google Classroom** | 四 tab 心智模型十年不变；Topic 折叠；密度只集中在 Grades | 卡片流大留白，主题色只在 banner | 班级详情页 | `/t/classes/:id` 四子路由 + `TopicGroup.vue` |
| **Notion Edu** | Toggle 折叠 + `/` 斜杠菜单 + 多视图共享数据源 | 无边框无阴影，hover 才现控件 | 学生端 AI 面板、教研课例 | `useSlashMenu()`（带拼音）、`/r/cases?view=` |
| **code.org / CodeCombat / 编程猫** | 内容原子化；学生三栏铁律；教师后台完全独立 | 学生高饱和大图标，教师朴素表格，两端刻意不像 | 学生端合三为一 | 单路由 `/` + `?peek=`；`SegmentedControl` 积木⇄代码 |

---

#### 13. 五条结论：我们应该抄什么

**① 抄 Linear 的「路由即状态、详情不跳页」，把 `usePeek()` 做成全站唯一下钻基础设施。**
这一条的杠杆最大：教师端「班级→学生→提交→运行」和学生端「错题本/行为统计/思维画像」全部复用同一个栈式抽屉，**教师端路由不增反减，学生端从 3 个路由压到 1 个**。附带收益：下钻链接可分享（教研组传"你看这个学生"）、后退键即收起、抽屉内容懒加载不拖首屏。硬约束 `depth ≤ 3`。

**② 抄 Duolingo + Khan 的「唯一下一步」，`/t/today` 和学生首屏各只放一张 `NextStepCard`。**
把现在 `Dashboard.vue` 的一屏信息重排成：1 张 NextStep + ≤6 张遵守 `TileSpec` 的瓷片（只有 label/value/state/spark）+ 全部明细进 Peek。`reason` 字段强制必填，让 AI 推荐自解释。这一条直接把首屏中文字数从数百压到 90 字以内。

**③ 抄 Datadog 的「分组 + 密度 + drill 契约」，但只给教研区，教学区强制 cozy。**
`useDensity()` + `data-zone` 组合拳：教研区可切 dense（13px / 32px 行高）满足数据分析；教学区锁死 cozy（15px / 44px 行高），因为讲台投影和教师视距是真实约束。折叠组标题栏**必须带异常计数**，否则老师会全部展开导致折叠失效。

**④ 抄 Vercel 的「同 token 双语义映射 + 玻璃/瓷片职责分离」，让教研区看起来专业、学生端看起来可爱。**
一套 `tokens.css`，靠 `[data-zone]` 切三套 accent 与装饰强度：教研区去饱和、关 `FloatingDecor`、数字全 Mono + `tabular-nums`。同时立死规矩：**玻璃只做浮层（Peek/CmdK/工具条），瓷片只做内容，二者永不嵌套** —— 这是玻璃拟态在数据密集页唯一不翻车的用法。

**⑤ 抄 Apple 的「滚动编排 + 原地展开」，但用 View Transitions + `motion-v` 代替 GSAP 全家桶，并强制 `prefers-reduced-motion`。**
L0 纯 CSS / L1 View Transitions / L2 `motion-v` 三层分工，总增量 < 10KB。高级感来自**曲线一致（`cubic-bezier(.16,1,.3,1)`）+ stagger 70ms + 转场不闪白**，不来自粒子和 WebGL。教室老机器必须能一键关动效并记忆。

### 明确不抄的四件事
1. **Duolingo 的连胜焦虑 / 体力 / 排行榜** —— K12 校园版采购方对成瘾式设计敏感，只取「唯一下一步 + 即时正反馈」。
2. **Google Classroom 的 Stream 信息流** —— 会退化成噪音，改做 Peek 内的时间线。
3. **Notion 的空白画布** —— 一线教师没时间配结构，给预制模板 + 折叠。
4. **Datadog 的默认密度与深色** —— 教学场景照搬会直接损失可读性与家长观感。

### 落地切分（建议 4 个 PR）
- **PR1｜地基**：`tokens.css` + `data-zone` + `useDensity` + 玻璃/瓷片职责规则 + `prefers-reduced-motion`。不动业务，可独立验收。
- **PR2｜下钻**：`usePeek` + `PeekHost` + 3 个 Pane；学生端 `Tasks/Thinking` 路由合并进 `/` 的 `?peek=`。
- **PR3｜教师端拆区**：`/t/*` 与 `/r/*` 双树 + `ClassShell` 四 tab + `TopicGroup` + `TileSpec` 改造 `Dashboard.vue`。
- **PR4｜聚焦与动效**：`NextStepCard` + `useSlashMenu` + `AppCommandK`（带拼音）+ `useScrollReveal` + View Transitions。
每个 PR 结束跑一次 §0 的四条量化验收（首屏交互元素 ≤12 / 中文 ≤90 字 / 一片一判断一动作 / 层级 ≤3 跳），并跑 `npm run build`（vue-tsc 是唯一类型闸门）。

---

### 参考来源
- [Linear Design Breakdown: Why Every SaaS Team Copies This UI](https://www.925studios.co/blog/linear-design-breakdown-saas-ui-2026)
- [awesome-design-md · linear.app/DESIGN.md](https://github.com/voltagent/awesome-design-md/blob/main/design-md/linear.app/DESIGN.md)
- [7 SaaS UI Design Trends for 2026, Shown With Real Screens](https://www.saasui.design/blog/7-saas-ui-design-trends-2026)
- [What is Progressive Disclosure? — IxDF](https://ixdf.org/literature/topics/progressive-disclosure)
- [DataDog/effective-dashboards · guidelines.md](https://github.com/DataDog/effective-dashboards/blob/main/guidelines.md)
- [Data-Dense Dashboard — DESIGN.md](https://designmd.app/library/data-dense-dashboard/)
- [Vercel Design Tokens, Typography & CSS Variables — DesignMD](https://designmd.cc/benchmarks/vercel)
- [Geist Design System — DesignSystems.one](https://www.designsystems.one/design-systems/vercel-geist)
- [Meet the New Khan Academy Classroom Experience](https://blog.khanacademy.org/meet-the-new-khan-academy-classroom-experience/)
- [Khan Academy redesigns classroom platform with AI tools — ETIH](https://www.edtechinnovationhub.com/news/khan-academy-redesigns-classroom-platform-as-ai-tools-move-further-into-daily-teaching)
- [Behind the Design: Duolingo — Apple Developer](https://developer.apple.com/news/?id=jhkvppla)
- [Duolingo Design Breakdown: How Gamification & UX Drives Retention](https://www.925studios.co/blog/duolingo-design-breakdown)
- [Stripe Dashboard update: May 2024](https://support.stripe.com/questions/dashboard-update-may-2024)
- [Stripe Merchant Dashboard — Matt Ström-Awn](https://mattstromawn.com/projects/stripe-dashboard/)
- [Google Classroom — Stream, Classwork, People, and Grade tabs](https://www.iorad.com/player/1702274/Google-Classroom---Stream--Classwork--People--and-Grade-tabs)
- [Google Classroom for Educators in 2025](https://gauravtiwari.org/google-classroom-for-educators/)
- [一小时编个小游戏，你和 Code.org 能做到 — 爱范儿](https://www.ifanr.com/app/585970)
- [CodeCombat 中国官方介绍](https://blog.csdn.net/CodeCombatCN/article/details/103120621)
- [Bento Grid Dashboard Design: Complete Guide 2026](https://www.orbix.studio/blogs/bento-grid-dashboard-design-aesthetics)

---

## 附录 B · 信息架构与路由重构（教师教学|教研 + 学生精简端）

#### AI小海龟·结对编程 V2 — 师生信息架构与路由重构

> 落地基线（已核对代码）：`CX/web/src/router/index.ts` 现有 3 条学生路由 + `/admin` 8 个子路由；`views/admin/AdminLayout.vue` 为单层 el-menu；`views/admin/Dashboard.vue` 300 行把趋势图/语言分布/TOP10 排行榜塞进一屏；`views/student/IDE.vue` 1081 行 + `components/AIChatPanel.vue` 996 行是学生端全部。本方案给出的路由/组件/props 可直接替换这套结构。

---

#### 0. 三条硬规则（全站信息密度宪法）

| 规则 | 定义 | 违反即返工 |
|---|---|---|
| **R1 一屏一问题** | 每个页面首屏只回答**一个**教师问题（"现在谁卡住了？""这次作业交得怎么样？"），其余全部降级 | 首屏出现两个并列的图表区 = 违反 |
| **R2 信息四层深度** | L0 首屏信号 / L1 同页折叠 / L2 下钻抽屉 / L3 独立页。**跨层只能逐层进**，禁止 L0 直接跳 L3 | 首屏卡片点了直接 `router.push` 到新页 = 违反 |
| **R3 7±2 + 文案预算** | 首屏可交互元素 ≤ 9；首屏静态汉字（不含数据数字）教师端 ≤ 120 字、学生端 ≤ 60 字 | 见 §5 lint |

**层级语义（全站统一，写进 meta）**

```
L0 主视图  = 首屏无需滚动的 signal 层。只放"要做决定的数字/状态"，不放解释、不放 CRUD
L1 折叠区  = <DisclosureSection>，同页展开，默认收起。放"列表、明细表、次要维度、配置"
L2 下钻抽屉 = <DrillDrawer>，右侧 480/720px 玻璃抽屉，可堆叠 2 层。放"单个对象的详情/编辑/证据"
L3 独立页  = 只有 3 个：学生画像全屏、报告详情、课例详情。其余一律不给独立页
```

---

#### 1. 教师端路由树（可直接替换 `router/index.ts`）

### 1.1 完整路由

```ts
// CX/web/src/router/routes.teacher.ts
import type { RouteRecordRaw } from 'vue-router'

export const teacherRoutes: RouteRecordRaw = {
  path: '/teacher',
  component: () => import('@/layouts/TeacherShell.vue'),
  meta: { requiresAuth: true, role: 'teacher' },
  redirect: '/teacher/teaching/today',
  children: [
    // ── 板块 A：教学（上课当天要用的） ────────────────────────
    {
      path: 'teaching',
      redirect: '/teacher/teaching/today',
      meta: { section: 'teaching' },
      children: [
        { path: 'today',    name: 'TTToday',   component: () => import('@/views/teacher/teaching/TodayView.vue'),
          meta: { nav: '今日', icon: 'sun',   signal: 4, copyBudget: 90 } },
        { path: 'classes',  name: 'TTClasses', component: () => import('@/views/teacher/teaching/ClassesView.vue'),
          meta: { nav: '班级', icon: 'grid',  signal: 6, copyBudget: 60,
                  drills: ['class', 'classEdit', 'roster'] } },
        { path: 'tasks',    name: 'TTTasks',   component: () => import('@/views/teacher/teaching/TasksView.vue'),
          meta: { nav: '任务', icon: 'send',  signal: 5, copyBudget: 70,
                  drills: ['task', 'taskCompose', 'submission'] } },
        { path: 'live',     name: 'TTLive',    component: () => import('@/views/teacher/teaching/LiveView.vue'),
          meta: { nav: '课堂', icon: 'radar', signal: 3, copyBudget: 40, fullbleed: true, realtime: true,
                  drills: ['seat', 'broadcast'] } },
        { path: 'students', name: 'TTStudents',component: () => import('@/views/teacher/teaching/StudentsView.vue'),
          meta: { nav: '学情', icon: 'people',signal: 5, copyBudget: 70,
                  drills: ['student', 'studentEdit'] } },
        { path: 'alerts',   name: 'TTAlerts',  component: () => import('@/views/teacher/teaching/AlertsView.vue'),
          meta: { nav: '预警', icon: 'bell',  signal: 3, copyBudget: 60, badge: 'alerts.unread',
                  drills: ['alert', 'intervene'] } },
        // L3 独立页（仅此一个）
        { path: 'students/:id', name: 'TTStudentPage',
          component: () => import('@/views/teacher/teaching/StudentPage.vue'),
          meta: { nav: null, backTo: '/teacher/teaching/students', copyBudget: 140 } },
      ],
    },

    // ── 板块 B：教研（课后/周期性的） ─────────────────────────
    {
      path: 'research',
      redirect: '/teacher/research/analysis',
      meta: { section: 'research' },
      children: [
        { path: 'analysis', name: 'TRAnalysis', component: () => import('@/views/teacher/research/AnalysisView.vue'),
          meta: { nav: '分析', icon: 'chart',  signal: 4, copyBudget: 80,
                  drills: ['metric', 'cohort', 'querySave'] } },
        { path: 'insights', name: 'TRInsights', component: () => import('@/views/teacher/research/InsightsView.vue'),
          meta: { nav: '洞察', icon: 'spark',  signal: 3, copyBudget: 110,
                  drills: ['insight', 'evidence', 'portrait'] } },
        { path: 'cases',    name: 'TRCases',    component: () => import('@/views/teacher/research/CasesView.vue'),
          meta: { nav: '课例', icon: 'book',   signal: 6, copyBudget: 60, drills: ['case'] } },
        { path: 'cases/:id',name: 'TRCasePage', component: () => import('@/views/teacher/research/CasePage.vue'),
          meta: { nav: null, backTo: '/teacher/research/cases', copyBudget: 400 } },
        { path: 'rubrics',  name: 'TRRubrics',  component: () => import('@/views/teacher/research/RubricsView.vue'),
          meta: { nav: '量表', icon: 'ruler',  signal: 4, copyBudget: 70, drills: ['rubric', 'rubricScore'] } },
        { path: 'reports',  name: 'TRReports',  component: () => import('@/views/teacher/research/ReportsView.vue'),
          meta: { nav: '报告', icon: 'doc',    signal: 4, copyBudget: 60, drills: ['reportCompose'] } },
        { path: 'reports/:id', name: 'TRReportPage',
          component: () => import('@/views/teacher/research/ReportPage.vue'),
          meta: { nav: null, backTo: '/teacher/research/reports', copyBudget: 2000 } },
        { path: 'export',   name: 'TRExport',   component: () => import('@/views/teacher/research/ExportView.vue'),
          meta: { nav: '导出', icon: 'shield', signal: 3, copyBudget: 120, drills: ['exportJob'] } },
      ],
    },

    // 不进主导航：从头像菜单进
    { path: 'settings', name: 'TSettings', component: () => import('@/views/teacher/SettingsView.vue'),
      meta: { nav: null, chrome: 'minimal' } },
  ],
}
```

### 1.2 路由 meta 类型（新建，供 Shell / lint / 埋点共用）

```ts
// CX/web/src/types/route-meta.d.ts
import 'vue-router'
declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    role?: 'teacher' | 'student'
    section?: 'teaching' | 'research'
    nav?: string | null          // ≤2 汉字，null = 不进侧栏
    icon?: string
    signal?: number              // 首屏允许的 signal 元素数（lint 用）
    copyBudget?: number          // 首屏静态汉字上限（lint 用）
    drills?: string[]            // 本页允许的下钻抽屉 key（白名单）
    badge?: string               // pinia getter 路径，渲染角标
    fullbleed?: boolean          // 去掉 PageHeader + padding（课堂监看）
    realtime?: boolean           // 进入即建 WS，离开即断
    backTo?: string              // L3 页的返回锚点
    chrome?: 'full' | 'minimal'
  }
}
```

### 1.3 下钻抽屉 = URL query，不新增路由

抽屉必须可分享、可回退，但**不占路由树**。统一用 `?d=<key>&id=<id>`，栈用 `d=class,roster`。

```ts
// CX/web/src/composables/useDrill.ts
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export function useDrill() {
  const route = useRoute(); const router = useRouter()
  const stack = computed<{ key: string; id?: string }[]>(() =>
    String(route.query.d ?? '').split(',').filter(Boolean).map((seg, i) => ({
      key: seg, id: (String(route.query.id ?? '').split(',')[i]) || undefined,
    })))
  const top = computed(() => stack.value.at(-1) ?? null)

  function open(key: string, id?: string | number) {
    const allow = route.meta.drills ?? []
    if (!allow.includes(key)) return console.warn(`[drill] ${key} 不在 ${String(route.name)} 白名单`)
    if (stack.value.length >= 2) close()            // 硬限制：最多 2 层
    const d = [...stack.value.map(s => s.key), key].join(',')
    const ids = [...stack.value.map(s => s.id ?? ''), String(id ?? '')].join(',')
    router.push({ query: { ...route.query, d, id: ids } })
  }
  function close() {
    const s = stack.value.slice(0, -1)
    router.replace({ query: { ...route.query,
      d: s.map(x => x.key).join(',') || undefined,
      id: s.map(x => x.id ?? '').join(',') || undefined } })
  }
  return { stack, top, open, close, isOpen: computed(() => stack.value.length > 0) }
}
```

### 1.4 侧边导航结构

```
┌─ 72px 收起 / 216px 展开（悬停 240ms 后展开，鼠标离开 400ms 收起；点图钉可固定）
│
│  [PixelWordmark]  小海龟
│  ──────────────────────────
│  ⟨SectionSwitcher⟩          ← 分段控件，两态：教学 | 教研
│      · 宽度 100%，滑块用 GSAP flip，切换时下方菜单做 stagger 8ms 淡入
│      · 快捷键 ⌘1 / ⌘2；切换记忆到 localStorage('teacher.section')
│  ──────────────────────────
│  教学态：  今日 / 班级 / 任务 / 课堂 / 学情 / 预警(角标)
│  教研态：  分析 / 洞察 / 课例 / 量表 / 报告 / 导出
│  ──────────────────────────
│  底部：⌘K 全局搜索 · 头像菜单(个人/设置/退出)
└─
```

- **同一时刻侧栏最多 6 项**，两板块不同屏出现 → 直接解决"信息全塞一屏"的导航侧成因。
- **不做三级菜单。** 任何三级需求一律降为页面内 `<DisclosureSection>` 或抽屉。
- 收起态只显示 icon + 角标；`nav` 文案硬性 ≤2 字（见 §5）。

### 1.5 教学侧：每页 signal / noise 划分

#### `/teacher/teaching/today` — 今日（默认落地页，替代旧 Dashboard）

**页面要回答的唯一问题：今天这堂课，我要先处理谁？**

| 层 | 内容 | 组件 |
|---|---|---|
| **L0 首屏（4 signal）** | ① 下一节课瓷片：班级名 + 倒计时 + `进入课堂`主按钮 ② `在线 28/32` RingProgress ③ `需要关注 3 人` 红点瓷片（点击→L2 预警栈） ④ 今日任务完成率 RingProgress | `BentoGrid` 4 格 + `CeramicTile` ×2 + `RingProgress` ×2 + `SignalStat` |
| **L1 折叠** | 「今日课表」（默认收起，仅有 ≥2 节课时展开）、「昨日回顾」（3 条一句话） | `DisclosureSection` |
| **L2 抽屉** | 关注学生栈：`?d=alert&id=..` → 单人卡（近 20min 行为 + 一键干预） | `DrillDrawer` + `AlertCard` |
| **明确不放** | ❌ 学习趋势折线 ❌ 语言分布饼图 ❌ TOP10 排行榜 ❌ 任何"欢迎回来，老师👋"式问候 → 趋势/分布迁到 `/research/analysis`，排行榜迁到 `/teaching/students` 的 L1 |

#### `/teacher/teaching/classes` — 班级

| 层 | 内容 |
|---|---|
| **L0（≤6 signal）** | 班级瓷片网格：每片 = 班名 + 人数 + 本周活跃 RingProgress + 一个状态色点。**无表格、无操作列** |
| **L1** | 「已归档班级」折叠；「批量导入名册」折叠 |
| **L2** | `?d=class&id=3` 班级详情抽屉（成员、近 7 日、当前任务）；栈第二层 `?d=roster` 分配学生；`?d=classEdit` 新建/编辑表单 |
| **不放** | ❌ 现 `Classes.vue` 的 el-table + 操作列 + 两个 el-dialog → 表格降级为瓷片，dialog 全部改抽屉 |

#### `/teacher/teaching/tasks` — 任务下发

| 层 | 内容 |
|---|---|
| **L0（5）** | 顶部 1 个主行动 `下发任务`；进行中任务卡 ≤4 张：标题 + 截止倒计时 + 交付 RingProgress + `未交 5 人` chip |
| **L1** | 「已截止」折叠；「草稿箱」折叠；**「备课资源」折叠 Tab（题库 + 视频）** ← 收编现 `Questions.vue` / `Videos.vue` |
| **L2** | `?d=taskCompose` 下发向导抽屉（4 步：目标→班级→题目→截止，每步 1 屏 ≤3 个字段）；`?d=task&id=` 任务详情（提交矩阵）；栈二层 `?d=submission&id=` 单份代码 + AI 批注 |
| **不放** | ❌ 现 `Assignments.vue` 那个 600px、9 个 el-form-item 的一次性大 dialog |

#### `/teacher/teaching/live` — 课堂实时监看（`fullbleed: true`）

| 层 | 内容 |
|---|---|
| **L0（3）** | ① 座位墙 `LiveWall`（唯一主体，占满） ② 顶部悬浮胶囊：`在线 28/32` + 3 个筛选 chip（全部/卡住/求助） ③ 右下浮动 `广播`按钮 |
| **L1** | 无（本页禁用折叠区 — 实时页不做展开，会打断注意力） |
| **L2** | `?d=seat&id=` 单座抽屉：实时代码只读 + 最近报错 + 会话摘要 + `私聊/接管/推提示`三按钮；`?d=broadcast` 广播编辑器 |
| **不放** | ❌ 侧栏（本页自动收起为 72px） ❌ PageHeader ❌ 任何统计图 |
| 座位色语义 | 灰=离线 / 蓝=在写 / 绿=通过 / 琥珀=停滞>3min / 红=连续报错≥3 或点了求助。**颜色是唯一编码，不写文字标签**，hover 才出 Tooltip |

#### `/teacher/teaching/students` — 学生学情

| 层 | 内容 |
|---|---|
| **L0（5）** | 班级选择 chip 行 + 学情矩阵（学生 × 4 维计算思维的色块热力图，来自 `ThinkingDashboard` 的 decompose/abstract/pattern/debug） |
| **L1** | 「排行榜 TOP10」折叠（收编旧 Dashboard 表格）；「名册管理」折叠（收编 `Students.vue` 的 CRUD，明确降级为管理动作） |
| **L2** | `?d=student&id=` 学生速览抽屉（4 维雷达 + 近 5 次提交 + 2 条 AI 结论）；抽屉底部 `查看完整画像 →` 才进 L3 `/teaching/students/:id` |
| **不放** | ❌ 首屏放 CRUD 按钮组（"添加学生/编辑/重置密码"是低频管理动作，一律进 L1） |

#### `/teacher/teaching/alerts` — 干预与预警

| 层 | 内容 |
|---|---|
| **L0（3）** | ① 待处理队列（卡片流，按严重度排序，每卡 ≤1 行结论 + 2 个动作） ② `今日已处理 7` 小字 ③ 严重度筛选 3 chip |
| **L1** | 「预警规则」折叠（阈值配置：停滞分钟数 / 连续报错次数 / 抄袭相似度） |
| **L2** | `?d=alert&id=` 证据抽屉（触发时间线 + 代码快照 diff）；`?d=intervene` 干预面板（发提示 / 派任务 / 转人工 / 忽略并记原因） |
| **不放** | ❌ 已处理历史（进 L1）❌ 预警统计图（属教研，进 `/research/analysis`） |

### 1.6 教研侧：每页 signal / noise 划分

#### `/teacher/research/analysis` — 数据分析

| 层 | 内容 |
|---|---|
| **L0（4）** | ① 4 枚指标瓷片（活跃率 / 平均通过率 / 平均调试轮次 / AI 依赖度） ② 一张主图（默认"学习趋势"，收编旧 Dashboard 的 line chart） ③ 时间范围分段控件 ④ `+ 维度` 按钮 |
| **L1** | 「维度对比」折叠（班级/性别/入学层次）；「语言分布」折叠（收编旧饼图）；「我的查询」折叠 |
| **L2** | `?d=metric&id=passRate` 指标口径抽屉（定义 + 计算式 + 样本量 + 数据源表）；`?d=cohort` 分群构建器；`?d=querySave` 保存查询 |
| **不放** | ❌ 一屏 6 张图。**主图只有一张**，其余图必须被 L1 折叠或"切换主图"取代 |

#### `/teacher/research/insights` — AI 结论与画像

| 层 | 内容 |
|---|---|
| **L0（3）** | ① 3 条结论卡（每条：**一句话结论 ≤24 字** + 置信度点 + 影响人数） ② `重新生成` ③ 范围选择器（班级+时间） |
| **L1** | 「群体画像」折叠（4-6 个人群簇瓷片：如"高频求助型/闷头试错型/复制依赖型"） |
| **L2** | `?d=insight&id=` 结论抽屉 → 内含 `?d=evidence` 证据链（触发事件、样本学生、反例）；`?d=portrait&id=` 单簇画像 |
| **不放** | ❌ 首屏放 AI 的长段推理。推理全进 `EvidenceList` 折叠，且 **首屏必须能只看结论就做决定** |
| 规矩 | 每条结论强制携带 `evidenceCount ≥ 2`，否则不渲染（防 AI 空话） |

#### `/teacher/research/cases` — 课例库

| 层 | 内容 | 
|---|---|
| **L0（≤6）** | 课例卡片网格：封面 + 标题 ≤12 字 + 3 个标签 chip。搜索框在 PageHeader 右侧 |
| **L1** | 「我的收藏」/「本校」/「共享库」三段折叠 |
| **L2** | `?d=case&id=` 速览抽屉（目标 / 时长 / 配套任务 / `一键下发到我的班级`） |
| **L3** | `/research/cases/:id` 全文页（唯一允许长文的教研页，`copyBudget: 400` 仅指首屏） |

#### `/teacher/research/rubrics` — 量表

| 层 | 内容 |
|---|---|
| **L0（4）** | 量表卡片（名称 + 维度数 + 已评人数 RingProgress） + `新建量表` |
| **L1** | 「维度权重」折叠；「历史版本」折叠 |
| **L2** | `?d=rubric&id=` 量表矩阵编辑（`RubricMatrix`）；`?d=rubricScore` 批量打分（键盘 1-4 快速评分） |

#### `/teacher/research/reports` — 报告生成

| 层 | 内容 |
|---|---|
| **L0（4）** | 4 个模板瓷片（周报 / 学期报告 / 单班学情 / 课题材料）+ 最近生成 3 条 |
| **L2** | `?d=reportCompose` 生成向导（范围→模板→章节勾选→生成，生成态用骨架屏逐段流入） |
| **L3** | `/research/reports/:id` 报告全文 + 导出 PDF/DOCX |

#### `/teacher/research/export` — 脱敏研究导出

| 层 | 内容 |
|---|---|
| **L0（3）** | ① 大按钮 `新建导出` ② 脱敏级别分段控件（L1 去姓名 / L2 假名化 / L3 K-匿名 k≥5） ③ 任务列表（状态 + 到期自毁倒计时） |
| **L1** | 「字段白名单」折叠（默认全关，逐项勾选）；「合规说明」折叠 |
| **L2** | `?d=exportJob&id=` 任务详情（样本量、抽样方式、字段清单、下载链接有效期） |
| **文案例外** | 本页是**唯一允许 copyBudget=120** 的教学/教研页：合规提示不可省，但必须放在 L1 折叠里，L0 只留一行 ≤20 字的红色约束提示 |

---

#### 2. 学生端：AI 结对编程工作台（单页）

### 2.1 路由（只有 2 条 + 1 个兜底）

```ts
// CX/web/src/router/routes.student.ts
export const studentRoutes: RouteRecordRaw[] = [
  { path: '/studio', name: 'Studio',
    component: () => import('@/views/student/StudioView.vue'),
    meta: { requiresAuth: true, role: 'student', chrome: 'none', copyBudget: 60 } },
  { path: '/studio/s/:sid', name: 'StudioSession',
    component: () => import('@/views/student/StudioView.vue'),   // 同组件，仅换会话
    props: true, meta: { requiresAuth: true, role: 'student', chrome: 'none', copyBudget: 60 } },
  { path: '/', redirect: '/studio' },
]
// 删除：/thinking（并入右侧 Rail 的"行为"页签）、/tasks（并入 Composer 上方的任务胶囊）
```

**状态一律走 query，不新增路由**（可分享、可回退、不引入布局跳变）：

| query | 含义 | 默认 |
|---|---|---|
| `?rail=summary\|mistakes\|behavior\|next` | 右侧面板打开哪个页签 | 关闭 |
| `?socratic=1` | 强制苏格拉底式引导 | 跟随用户设置/教师锁 |
| `?editor=1` | 中央切换为代码编辑器全宽 | 0（代码以卡片形态在对话流内） |
| `?sessions=1` | 左侧会话栏固定展开 | 0（悬停浮出） |

### 2.2 单页布局

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TopBar 48px  [🐢]  会话标题(自动生成,≤12字)   ·  ⟨苏格拉底 🔒⟩  ·  [▤ 面板] │
├────┬────────────────────────────────────────────────────┬────────────────┤
│ 会 │                                                    │  InsightRail   │
│ 话 │              ChatCanvas （中央，唯一主体）           │  默认 0px 宽    │
│ 栏 │   · MessageBubble / CodeCard / ImageCard           │  展开 340px     │
│ 悬 │   · BehaviorNudge（内联，触发式，不常驻）           │  ┌───────────┐ │
│ 停 │   · SummaryCard（点"总结"后插入流内）               │  │总结│错题│  │ │
│ 浮 │                                                    │  │行为│进阶│  │ │
│ 出 │                                                    │  └───────────┘ │
│ 56 │  ── NextStepChips（AI 回答结束后浮现 2-3 枚）──      │                │
│ px │  ┌────────── ComposerBar ──────────────────────┐   │                │
│    │  │ [＋] 说点什么…            [⌥ 总结] [↑ 发送] │   │                │
│    │  └──────────────────────────────────────────────┘   │                │
└────┴────────────────────────────────────────────────────┴────────────────┘
       FloatingDecor：仅空会话态出现（3D 小海龟 + 漂浮几何），首条消息后 GSAP 淡出并销毁
```

### 2.3 八项核心功能 → 入口位置 / 触发 / 默认可见性

| 功能 | 入口（唯一） | 交互 | 默认可见？ |
|---|---|---|---|
| **对话** | 中央 ChatCanvas | 常驻主体 | ✅ 唯一常驻 |
| **生图** | Composer 的 `＋` → `画一张` / 或输入 `/画 ` 斜杠命令 | 产出 `ImageCard`（点开放大，长按保存），**不跳页、不开抽屉** | ❌ 折在 `＋` 里 |
| **总结** | Composer 右侧 `⌥ 总结` 文字按钮 + 会话闲置 10min 自动提议 | 生成 `SummaryCard` 插入流内末尾，同时沉淀到 Rail「总结」页签 | ❌ 按钮常驻但极轻（14px 文字，无底色） |
| **强制苏格拉底式引导** | TopBar 中央 `SocraticToggle` | 学生可勾；**教师在班级设置里锁定后显示 🔒 且不可关**，hover 提示"本班由老师开启"。开启时气泡左侧加一道紫色引导条，AI 拒写完整代码 | ✅ 唯一常驻开关（这是产品主张，必须可见） |
| **错题总结** | Rail「错题」页签；触发源=运行报错/测试失败自动沉淀 | **不弹窗、不打断**。仅在 Rail 页签上加数字角标，一次课最多做一次 3s 的角标脉冲 | ❌ |
| **学习行为纠正** | 对话流内联 `BehaviorNudge`（细长条，非气泡） | 规则触发：连续 3 次复制未运行 / 15min 未运行 / 连续 5 轮追问同一报错。文案 ≤20 字 + 单个动作按钮 + `×`。**同一类型 30min 内只出 1 次** | ❌ 触发式 |
| **行为统计分析** | Rail「行为」页签 | 4 维 RingProgress（分解/抽象/算法/调试）+ 本周 3 条 sparkline。**无表格、无原始事件** | ❌ |
| **主动进阶提问** | ① 每次 AI 回答结束后 `NextStepChips` 2-3 枚 ② Rail「进阶」页签存历史 ③ 闲置 90s 后 AI 主动发 1 条（每会话最多 2 次） | chip 点击=直接发送该问题 | ⚠️ chips 出现 12s 后自动淡隐（仍可在 Rail 找回） |

### 2.4 极简是怎么做到的（默认隐藏什么 / 何时浮现）

```
默认可见元素总数 = 7
  1 会话栏细条(56px, 无文字)  2 TopBar 品牌  3 会话标题  4 苏格拉底开关
  5 面板开关 ▤              6 ChatCanvas    7 ComposerBar
```

| 元素 | 默认 | 浮现条件 | 消失条件 |
|---|---|---|---|
| 会话列表 | 56px 细条 | 悬停 200ms 展开到 260px（overlay，不挤压中央） | 离开 400ms 或按 Esc |
| InsightRail | 0px | 点 ▤ / 角标出现后首次点击 / 快捷键 ⌘\ | 再点 ▤（宽度 GSAP 340→0，中央同步补位，280ms `power3.out`） |
| NextStepChips | 隐藏 | AI 流式输出结束 + 400ms | 12s 后 / 用户开始输入 |
| BehaviorNudge | 隐藏 | 规则命中 | 8s 或点 `×`（记录 dismiss，同类降频） |
| 代码编辑器 | 隐藏 | `CodeCard` 点「在编辑器打开」→ `?editor=1` 中央变编辑器，对话缩为右侧 380px | Esc / 点「回到对话」 |
| 任务信息 | 隐藏 | 有未完成任务时，Composer 上方出现 1 枚胶囊 `第3课 循环 · 剩 2 天` | 点击=展开 2 行说明，完成后消失 |
| 文件/项目管理 | 隐藏 | 只在 `?editor=1` 态的左栏出现（收编现 `IDE.vue` 的 file-panel） | 退出编辑器态 |

**删除清单（现有代码要砍掉的）**：`IDE.vue` 的顶部语言切换按钮组（改为跟随任务/首条消息自动判定，仅在编辑器态出现）、`/thinking` 独立页、`/tasks` 独立页、AIChatPanel 里的 `ai_driver / ai_navigator` 双按钮切换（合并为 `SocraticToggle` 单开关：开=navigator，关=driver）。

---

#### 3. 文案密度规则（可执行）

### 3.1 硬上限表

| 位置 | 上限 | 副标题 | 超出处理 |
|---|---|---|---|
| 侧栏 nav 项 | **≤2 汉字** | 无 | 换词，不换行 |
| 页面标题 `PageHeader.title` | **≤6 汉字** | **默认无**；仅 ①首次访问 ②空状态 ③本页有合规约束时出现，且 ≤18 字 | — |
| 瓷片/卡片标题 | **≤8 汉字** | 无 | 截断 + Tooltip 全文 |
| 指标瓷片 | 数字 + 单位 + **标签 ≤4 字** | 无解释文字 | 口径解释进 `?d=metric` 抽屉 |
| 按钮 | **2–4 字**（主行动 4 字内，如 `下发任务`） | — | 长动作名进抽屉标题 |
| 表格/矩阵列名 | **≤4 字** | — | — |
| chip / tag | **≤5 字** | — | — |
| AI 结论 | **一句话 ≤24 字**，句号结尾，禁疑问句 | 依据折叠 | `EvidenceList` |
| 预警文案 | **≤20 字**（谁+现象+多久） | — | 证据进抽屉 |
| 学生端 Nudge | **≤20 字** | — | — |
| Tooltip | **≤40 字** | — | 超出→ Popover |
| Popover | **≤120 字** | — | 超出→ 抽屉 |
| 抽屉正文 | **≤400 字**首屏 | — | 超出→ L3 页 |
| 空状态 | 主句 ≤12 字 + 副句 ≤20 字 + 1 个按钮 | — | — |

### 3.2 三条改写规则

1. **动词开头，删主语**：`您可以在这里查看学生的学习进度` → `查看学习进度` → 更狠：直接删掉，因为页面标题已经说了。
2. **数字优先于形容词**：禁止 `较多 / 大部分 / 显著`，一律 `23 人 / 68%`。
3. **禁止解释性长文出现在 L0**。判定法：一段文字如果读了不会改变教师的下一步操作，它就不该在首屏。

### 3.3 开发期 lint（拦在 `npm run build` 之前）

```ts
// CX/web/src/utils/copyBudget.ts  —— 仅 DEV 生效
export function auditCopy(root: HTMLElement, budget: number, tag: string) {
  if (!import.meta.env.DEV) return
  const SKIP = /^(SCRIPT|STYLE|CODE|PRE|TEXTAREA)$/
  let cn = 0
  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      const el = n.parentElement!
      if (SKIP.test(el.tagName)) return
      if (el.closest('[data-copy-exempt],[data-disclosure="closed"],.drill-drawer')) return
      cn += (n.textContent!.match(/[一-龥]/g) ?? []).length
    } else n.childNodes.forEach(walk)
  }
  walk(root)
  if (cn > budget) console.warn(`[copy] ${tag} 首屏 ${cn} 汉字 > 预算 ${budget}，请把解释性文字折叠或下钻`)
}
```

```ts
// TeacherShell.vue 内
watch(() => route.fullPath, async () => {
  await nextTick()
  auditCopy(mainEl.value!, route.meta.copyBudget ?? 100, String(route.name))
  const signals = mainEl.value!.querySelectorAll('[data-signal]').length
  if (signals > (route.meta.signal ?? 9)) console.warn(`[signal] ${String(route.name)} ${signals} 个 signal 超限`)
})
```

> 约定：L0 的每个 signal 元素加 `data-signal`；抽屉/折叠内的容器加 `data-copy-exempt`；`DisclosureSection` 收起时给 `data-disclosure="closed"`。

---

#### 4. 组件复用映射

### 4.1 沿用现有原语（不改 API，只加用法约束）

| 原语 | 用在哪 | 约束 |
|---|---|---|
| `GlassPanel` | TeacherShell 侧栏、DrillDrawer 外壳、InsightRail、Composer、所有抽屉 | 全站**最多同屏 3 层玻璃**，再多则改用实心以免糊 |
| `CeramicTile` | 今日 4 格、班级卡、任务卡、模板卡、课例卡、Rail 内小卡 | 一屏瓷片 ≤6；瓷片内文字 ≤2 行 |
| `BentoGrid` | `/teaching/today`(4格)、`/research/analysis`(指标行+主图)、`/research/reports`(4模板) | 只用于 L0；L1/L2 内禁止再嵌 Bento |
| `RingProgress` | 在线率、完成率、量表评分进度、学生端 4 维行为 | 环内只放数字，标签放环外 ≤4 字 |
| `FloatingDecor` | Login、学生端空会话态、各页空状态 | **有数据的页面一律不用**（教师端 L0 全面禁用） |
| `PixelWordmark` | Login、两端侧栏顶部、报告封面 | 一屏一次 |

### 4.2 新建组件清单（含 props）

#### A. 骨架 / 通用（6 个，两端共用）

```ts
// layouts/TeacherShell.vue —— 替代 views/admin/AdminLayout.vue
interface TeacherShellProps { defaultSection?: 'teaching' | 'research' }

// components/nav/SectionSwitcher.vue
interface SectionSwitcherProps {
  modelValue: 'teaching' | 'research'
  items: { key: 'teaching' | 'research'; label: string; badge?: number }[]
  collapsed?: boolean            // 侧栏收起态 → 只显 icon
}                                // emits: 'update:modelValue'

// components/nav/NavRail.vue
interface NavRailProps {
  items: { name: string; to: string; nav: string; icon: string; badge?: number }[]
  collapsed: boolean
  pinned?: boolean
}                                // emits: 'update:collapsed' | 'update:pinned'

// components/chrome/PageHeader.vue —— 强制文案纪律的组件
interface PageHeaderProps {
  title: string                  // dev 断言 ≤6 汉字
  subtitle?: string              // dev 断言 ≤18 汉字；且需 showSubtitle 才渲染
  showSubtitle?: 'first-visit' | 'empty' | 'always' | false   // 默认 false
  count?: number                 // 标题右侧的轻量计数
  primaryAction?: { label: string; icon?: string }            // ≤4 字，一页最多 1 个
}                                // slots: filters(chip 行) / actions(次要，≤2 个图标钮)

// components/chrome/DisclosureSection.vue —— L1 唯一实现
interface DisclosureProps {
  title: string                  // ≤8 汉字
  count?: number                 // 标题右侧 "(23)"
  defaultOpen?: boolean          // 默认 false
  persistKey?: string            // 记忆展开态到 localStorage
  lazy?: boolean                 // 默认 true：收起时不渲染内容（性能 + 绕开 copy lint）
  peek?: string                  // 收起时的一行摘要，≤16 字
}

// components/chrome/DrillDrawer.vue —— L2 唯一实现
interface DrillDrawerProps {
  drillKey: string               // 与 useDrill 的 key 对应
  width?: 480 | 720              // 详情 480 / 编辑或矩阵 720
  title: string                  // ≤10 汉字
  loading?: boolean
  depth?: 1 | 2                  // 第二层自动右移 40px + 降不透明度，形成层叠
}                                // slots: default / footer(动作区，≤3 个按钮)
```

#### B. 教师·教学（7 个）

```ts
// components/teacher/SignalStat.vue —— 包一层 CeramicTile 的"可决策数字"
interface SignalStatProps {
  value: number | string
  unit?: string
  label: string                  // ≤4 汉字
  tone?: 'neutral' | 'good' | 'warn' | 'danger'
  trend?: number                 // 同比，渲染为 ▲3.2 小字
  drill?: { key: string; id?: string | number }   // 点击 → useDrill.open
  countUp?: boolean              // GSAP 数字滚动，默认 true
}

// components/teacher/LiveWall.vue
interface LiveWallProps {
  roomId: string
  seats: SeatState[]
  filter?: 'all' | 'stuck' | 'help'
  columns?: number               // 默认按容器自适应 6–10
}                                // emits: 'select'(studentId)

// components/teacher/LiveSeatTile.vue
interface LiveSeatTileProps {
  name: string                   // 只显姓名，≤4 字
  status: 'offline' | 'coding' | 'passed' | 'stalled' | 'error' | 'help'
  minutesIdle?: number
  avatar?: string
  pulse?: boolean                // help/error 时呼吸动效
}

// components/teacher/AlertCard.vue
interface AlertCardProps {
  id: string
  severity: 'low' | 'mid' | 'high'
  student: { id: number; name: string }
  headline: string               // ≤20 汉字，来自规则模板而非自由文本
  at: string
  actions?: { key: 'hint' | 'assign' | 'contact' | 'ignore'; label: string }[]  // ≤2 个
}                                // emits: 'act'(key) | 'inspect'

// components/teacher/AlertQueue.vue
interface AlertQueueProps { items: AlertVM[]; grouping?: 'severity' | 'class' | 'time'; maxVisible?: number /* 默认 5，其余进 L1 */ }

// components/teacher/TaskComposer.vue —— 装在 DrillDrawer 里的 4 步向导
interface TaskComposerProps { step?: 1|2|3|4; classes: ClassVM[]; questions: QuestionVM[]; draft?: Partial<TaskDraft> }
// 纪律：每步 ≤3 个字段，步骤标题 ≤6 字，无一次性长表单

// components/teacher/ThinkingMatrix.vue —— 学生 × 4 维热力
interface ThinkingMatrixProps {
  students: { id: number; name: string; scores: Record<'decompose'|'abstract'|'pattern'|'debug', number> }[]
  sortBy?: 'name' | 'weakest' | 'progress'
  onCell?: (studentId: number, dim: string) => void
}
```

#### C. 教师·教研（6 个）

```ts
// components/research/InsightCard.vue
interface InsightCardProps {
  conclusion: string             // dev 断言 ≤24 汉字
  confidence: 0|1|2              // 低/中/高，渲染 3 个点
  affected: number               // 影响人数
  evidenceCount: number          // <2 时组件直接不渲染（防空话）
  tone?: 'risk' | 'opportunity' | 'neutral'
}                                // emits: 'open-evidence'

// components/research/EvidenceList.vue
interface EvidenceListProps { items: { type: 'event'|'code'|'metric'|'counter'; label: string; at?: string; payload?: unknown }[]; maxPreview?: number /* 默认 3 */ }

// components/research/MetricDefPopover.vue
interface MetricDefProps { metric: string; formula: string; sample: number; source: string; updatedAt: string }

// components/research/RubricMatrix.vue
interface RubricMatrixProps { dimensions: { key: string; name: string; weight: number }[]; levels: { score: number; label: string; desc: string }[]; editable?: boolean; scores?: Record<string, number> }

// components/research/ExportWizard.vue
interface ExportWizardProps {
  level: 'L1' | 'L2' | 'L3'      // 去标识 / 假名化 / K-匿名
  k?: number                     // level=L3 时，dev 断言 ≥5
  fields: { key: string; label: string; sensitive: boolean; enabled: boolean }[]  // 默认全 false
  scope: { classIds: number[]; range: [string, string] }
  ttlDays?: number               // 下载链接有效期，默认 7
}                                // emits: 'submit'

// components/research/ReportComposer.vue
interface ReportComposerProps { template: 'weekly'|'term'|'class'|'kt'; sections: { key: string; title: string; checked: boolean }[]; scope: ReportScope; streaming?: boolean }
```

#### D. 学生·工作台（10 个，全部新建，替代 IDE.vue + AIChatPanel.vue）

```ts
// views/student/StudioView.vue         —— 单页容器，3 栏 grid
// components/studio/ChatCanvas.vue
interface ChatCanvasProps { messages: Msg[]; streaming?: boolean; socratic: boolean }
                                        // slots: nudge / chips

// components/studio/MessageBubble.vue
interface BubbleProps { role: 'user'|'ai'; content: string; socratic?: boolean /* 左侧紫色引导条 */; ts: number }

// components/studio/CodeCard.vue        —— 对话流内的代码块，不是编辑器
interface CodeCardProps { code: string; lang: 'python'|'cpp'; filename?: string; runnable?: boolean; result?: { ok: boolean; output: string } }
                                        // emits: 'run' | 'open-editor' | 'copy'
                                        // 注：'copy' 事件同时喂给行为纠正规则引擎

// components/studio/ImageCard.vue
interface ImageCardProps { src: string; prompt: string; loading?: boolean; ratio?: '1:1'|'4:3'|'16:9' }

// components/studio/ComposerBar.vue
interface ComposerProps { placeholder?: string /* ≤8 字 */; busy?: boolean; slashCommands?: { key: string; label: string }[] /* 画/总结/进阶 */; taskCapsule?: { title: string; dueIn: string } | null }
                                        // emits: 'send' | 'summarize' | 'attach'

// components/studio/SocraticToggle.vue  —— 产品主张，唯一常驻开关
interface SocraticToggleProps { modelValue: boolean; locked?: boolean /* 教师锁定 */; lockedHint?: string /* ≤14 字 */ }

// components/studio/InsightRail.vue
interface InsightRailProps { tab: 'summary'|'mistakes'|'behavior'|'next' | null; badges?: Partial<Record<'summary'|'mistakes'|'behavior'|'next', number>> }
                                        // emits: 'update:tab' ；width 0↔340 由 GSAP 驱动

// components/studio/BehaviorNudge.vue
interface NudgeProps { rule: 'copy-no-run'|'idle'|'error-loop'|'ai-dependency'; text: string /* ≤20 字 */; action?: { label: string /* ≤4 字 */; key: string }; autoHide?: number /* 默认 8000 */ }

// components/studio/NextStepChips.vue
interface ChipsProps { items: { id: string; text: string /* ≤14 字 */; level: 'same'|'up' }[]; autoHide?: number /* 12000 */ }

// components/studio/SessionRail.vue
interface SessionRailProps { sessions: { id: string; title: string /* ≤12 字 */; at: string }[]; activeId: string; pinned?: boolean }
```

#### E. 动效基座（1 个 composable，供两端共用）

```ts
// composables/useReveal.ts —— 统一进场编排，避免各页各写一套
export function useReveal(scope: Ref<HTMLElement | null>, opts?: {
  stagger?: number          // 默认 0.045
  y?: number                // 默认 14
  selector?: string         // 默认 '[data-signal],[data-reveal]'
  once?: boolean            // 默认 true
}): { play(): void; kill(): void }
// 约定：尊重 prefers-reduced-motion，命中时只做 opacity 0→1，duration 0.12
```

---

#### 5. 旧代码迁移映射（逐文件，可排期）

| 现文件 | 去向 | 处理 |
|---|---|---|
| `views/admin/AdminLayout.vue` | `layouts/TeacherShell.vue` | el-menu → `NavRail` + `SectionSwitcher`；标题栏 → `PageHeader` |
| `views/admin/Dashboard.vue` | **拆 3 份** | 欢迎语 + 排行榜 **删/降级** → 排行榜进 `/teaching/students` 的 L1；学习趋势 → `/research/analysis` 主图；语言分布 → `/research/analysis` 的 L1 折叠 |
| `views/admin/Classes.vue` | `teaching/ClassesView.vue` | el-table → `CeramicTile` 网格；2 个 el-dialog → `?d=classEdit` / `?d=roster` 抽屉 |
| `views/admin/Assignments.vue` | `teaching/TasksView.vue` | 9 字段大 dialog → `TaskComposer` 4 步抽屉；列表 → 进行中卡片 + 「已截止」折叠 |
| `views/admin/Students.vue` | `teaching/StudentsView.vue` **的 L1** | 整个 CRUD 降级为「名册管理」折叠区，L0 换成 `ThinkingMatrix` |
| `views/admin/StudentReport.vue` | `teaching/StudentPage.vue`（L3） | 保留 `ThinkingDashboard`；新增 `?d=student` 速览抽屉作为 L2 前置 |
| `views/admin/Questions.vue` | `teaching/TasksView.vue` L1「备课资源 · 题库」 | 不再占导航项 |
| `views/admin/Videos.vue` | `teaching/TasksView.vue` L1「备课资源 · 视频」 | 同上 |
| `views/admin/Settings.vue` | `/teacher/settings` | 移出主导航，进头像菜单 |
| `views/student/IDE.vue` (1081) | 拆：`StudioView` + `CodeCard` + 编辑器态 | 文件/项目面板只在 `?editor=1` 出现；语言切换按钮删除 |
| `components/AIChatPanel.vue` (996) | `ChatCanvas` + `ComposerBar` + `SocraticToggle` | `switchRole('ai_driver'/'ai_navigator')` → 单开关：`socratic=true` ⇒ `ai_navigator` |
| `views/student/Thinking.vue` | InsightRail「行为」页签 | 删路由 `/thinking` |
| `views/student/Tasks.vue` | Composer 上方任务胶囊 + 展开 | 删路由 `/tasks` |
| `components/ThinkingDashboard.vue` | 两端复用 | 教师：`?d=student` 抽屉内；学生：Rail「行为」。props 保持 `{ userId, title? }` |
| `stores/pair.ts` | 保留 | 新增 `socraticLocked: boolean`（来自班级设置），驱动 `SocraticToggle.locked` |
| `router/index.ts` 的 `role: 'admin'` | 兼容 | guard 内做映射：`user.role === 'admin' → 'teacher'`，避免动后端 |

---

#### 6. 落地顺序（3 个 PR，互不阻塞）

| PR | 范围 | 验收 |
|---|---|---|
| **P1 骨架**（1–2 天） | `TeacherShell` + `NavRail` + `SectionSwitcher` + `PageHeader` + `DisclosureSection` + `DrillDrawer` + `useDrill` + 新路由表 + copy lint | 旧 8 个 admin 页原样挂到新路由下也能跑；侧栏同屏 ≤6 项；lint 在 DEV 输出超限告警 |
| **P2 教学侧**（3–4 天） | `TodayView` / `ClassesView` / `TasksView` / `LiveView` / `StudentsView` / `AlertsView` + `SignalStat` `LiveWall` `AlertCard` `TaskComposer` `ThinkingMatrix` | 每页 `data-signal` 数 ≤ meta.signal；旧 dialog 全部改抽屉；Dashboard 三块内容按映射表落位 |
| **P3 学生侧 + 教研侧**（4–5 天） | `StudioView` 全套 10 组件；`AnalysisView` / `InsightsView` / `ExportView` 优先，`cases/rubrics/reports` 可先出壳 | 学生端默认可见元素 =7；`InsightCard` 在 `evidenceCount<2` 时不渲染；导出字段默认全关 |

**每个 PR 的 Definition of Done**：`npm run build` 通过（vue-tsc）+ DEV 控制台无 `[copy]` / `[signal]` 告警 + 每页首屏截图人工过一遍 §5 文案上限表。


---

## 附录 C · 动效系统（选型 / 清单 / 令牌 / 降级 / 性能红线）

#### 「AI小海龟·结对编程」V2 动效系统设计（Vue3）

> 定位：**教育后台应用的动效系统**，不是营销落地页。landing.love 的高级感来自"节奏 + 物理 + 层次"，不是来自"多"。本方案的取舍原则：**同屏同时运动的元素 ≤ 3 组；任何动效不得延后用户可操作时间（INP）超过 1 帧；机房低配机必须能一键退回到 0 动效仍不失语义。**

---

#### 0. 落地前提核对（与当前仓库的差异，先说清）

实测 `CX\web`：

| 项 | 任务描述 | 仓库实际 | 影响 |
|---|---|---|---|
| UI 库 | Tailwind + tokens.css + Glass/Ceramic 原语 | `element-plus@2.4.4` + 单文件 `src/styles/global.css`（`:root` 里是 `--primary/--radius-*/--transition`），**无 tokens.css、无 Tailwind、无 Glass/Ceramic 组件** | 本方案的 `motion.css` 设计成**独立文件、零依赖 Tailwind**，可先落到现仓库，V2 换皮时不用改 |
| 动效现状 | 无动效库 | ✅ 属实。`global.css` 有 7 个手写 `@keyframes`（`fadeIn/slideInRight/slideInUp/pulse/borderFlash/float/gradientShift`），组件里散落 40+ 处 `transition: all 0.2s/0.3s` | 需要**收编**：`transition: all` 是本方案第一条性能红线的直接违规项 |
| Blockly | 已有 | 未见依赖 | 动效层对 Blockly 的约束与 Monaco 同级（见 §5.4） |

真实文件锚点（后文所有"落地位置"均指这些路径）：
- `CX/web/src/router/index.ts`（现为 `/`=IDE、`/thinking`、`/tasks`、`/admin/*` 8 个子路由）
- `CX/web/src/App.vue`（现仅 `<router-view />`，**转场挂载点**）
- `CX/web/src/views/admin/Dashboard.vue`（现 ECharts×2，V2 要拆「教学/教研」）
- `CX/web/src/views/admin/StudentReport.vue`（ECharts×2 → **滚动叙事页原型**）
- `CX/web/src/components/AIChatPanel.vue`（SSE 流式，**打字机 + 思考态**主战场；现状 `marked.parse()` 在 computed/模板里逐 chunk 全量重解析 + 每 chunk `scrollToBottom()`，见 §3.9 必须改）
- `CX/web/src/components/ThinkingDashboard.vue`（ECharts 雷达）
- `CX/web/src/views/student/IDE.vue`（Monaco 动态 import，**动效禁区**）
- `CX/web/src/styles/global.css`（令牌注入点）

---

#### 1. 技术选型对比与推荐

### 1.1 候选对比（体积为 min+gzip 量级，以实际 `rollup-plugin-visualizer` 为准）

| 方案 | 体积 | 能力上限 | 低配表现 | 可维护性 | 与 Vue3 契合 |
|---|---|---|---|---|---|
| **纯 CSS + `<Transition>`/`<TransitionGroup>`** | **0 KB** | 转场、stagger（`transition-delay`）、hover、骨架、呼吸、折叠 | ★★★★★ 走合成器线程，可被 `prefers-reduced-motion` 一刀切 | ★★★★☆ 令牌化后极稳；复杂编排（scrub/pin）写不了 | 原生 |
| **WAAPI（`el.animate()`）** | 0 KB | CSS 能力 + JS 可控（暂停/反向/`finished` Promise/动态终值）；`ViewTransition` 底座 | ★★★★★ 同上，且 `composite` 可控 | ★★★★☆ 需薄封装，否则散落 | 手写 composable 即可 |
| **@vueuse/motion** | ~8–10 KB | 声明式 `v-motion` + spring + `visibleOnce` | ★★★★☆ 主线程 JS 逐帧写 style，元素多时有开销 | ★★★☆☆ API 舒服，但**与 `<Transition>` 职责重叠**，团队易两套写法并行 | ★★★★★ |
| **motion-v（Motion for Vue）** | ~18–22 KB | 混合引擎（能走 WAAPI）、layout 动画、手势 | ★★★★☆ | ★★★☆☆ 生态新、教程少；layout 动画在后台表格里是"想要但会踩坑"的能力 | ★★★★☆ |
| **GSAP + ScrollTrigger** | core ~24 KB + ST ~11 KB ≈ **35 KB** | 时间轴编排、`scrub`/`pin`/`snap`、精确 stagger、`quickTo`（磁吸）、FLIP（插件） | ★★★☆☆ 主线程驱动，但 `force3D`/`will-change` 控制得当仍稳；ScrollTrigger 的 pin 在低配上是**最贵的一项** | ★★★★★ 编排复杂动效时唯一不失控的选择；文档/调试工具最强 | ★★★★☆（需手动 `onScopeDispose` 清理） |
| **WebGL / Three / Lottie** | 60 KB+ | 视觉天花板 | ★☆☆☆☆ 集显 + 投影仪 = 灾难 | ★★☆☆☆ | — |

### 1.2 推荐：**L0/L1/L2 三层分级，不引入通用动效库，只按路由懒加载 GSAP**

```
L0  CSS 令牌 + <Transition>/<TransitionGroup>      → 覆盖 ~85% 动效   0 KB   全站默认
L1  useMotion 薄封装（WAAPI + rAF）                → 覆盖 ~12%        ~2 KB  自写，纳入仓库
L2  GSAP + ScrollTrigger（仅教研叙事页动态 import）  → 覆盖 ~3%         0 KB 首屏 / 35 KB 该路由
❌  motion-v / @vueuse/motion / WebGL / Lottie      → 不引入
```

**理由（按权重）**

1. **体积**：教育客户常见 100Mbps 校园网 + 40 台机器同时刷新，首屏 JS 每省 10 KB 都是真实体感。L0+L1 首屏动效成本 ≈ **2 KB**；GSAP 只在教师点开"教研报告"时才下载，且该页本身是低频、单人、可等待的场景 —— 这是 35 KB 唯一站得住脚的地方。
2. **低配降级**：CSS/WAAPI 动画在合成器线程执行，主线程被 Monaco 语法高亮 / ECharts 重绘卡住时**动效仍然顺滑**；`@vueuse/motion`、`motion-v` 的 JS 驱动路径会和 Monaco 抢主线程，正是本产品最坏的场景（学生边打字边看侧栏 AI 流式输出）。
3. **可维护**：Vue 已经内置 `<Transition>`，再引一个声明式动效库必然出现"两种写法都对"的分裂。**一套令牌 + 两个指令 + 四个 composable**，新人 30 分钟能全学会。
4. **降级开关唯一**：L0/L1 全部读 `--d-*` 时长变量，`prefers-reduced-motion` / `[data-cap=low]` 只需**改写变量**即可全站生效（§4）；第三方库需要各自的 `reducedMotion` API，容易漏。
5. **GSAP 不可替代的两点**：`ScrollTrigger` 的 `scrub + pin`（教研报告的滚动叙事）与 `gsap.quickTo`（磁吸 hover 的 60fps 插值），自写等价物的成本远高于 35 KB。

**Vite 配置（保证 GSAP 不进首屏 chunk）**

```ts
// frontend/vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        gsap: ['gsap', 'gsap/ScrollTrigger'],   // 独立 chunk，仅叙事路由 import 时加载
        monaco: ['monaco-editor'],
        echarts: ['echarts'],
      },
    },
  },
  chunkSizeWarningLimit: 900,
}
```

---

#### 2. 动效令牌（`CX/web/src/styles/motion.css`）

新建独立文件，在 `main.ts` 里 `import '@/styles/motion.css'`（放在 `global.css` 之后）。

```css
/* ===================== 动效令牌 · motion.css ===================== */
:root {
  /* --- 时长阶梯（6 档，禁止出现档外数值） --- */
  --d-instant: 80ms;    /* 按钮按下、开关拨动、tooltip 出现 */
  --d-fast:    140ms;   /* hover 微抬、图标切换、输入框聚焦 */
  --d-base:    220ms;   /* 默认：卡片入场、折叠、tab 切换 */
  --d-slow:    320ms;   /* 抽屉、弹窗、路由转场 */
  --d-slower:  480ms;   /* 大面积渐显、图表首绘、KPI count-up 起步 */
  --d-narr:    800ms;   /* 仅滚动叙事段落 */

  /* --- 缓动 --- */
  --e-out:       cubic-bezier(0.22, 1, 0.36, 1);      /* out-quart：入场/展开，默认首选 */
  --e-in:        cubic-bezier(0.64, 0, 0.78, 0);      /* 退场（元素离开视野） */
  --e-emph:      cubic-bezier(0.2, 0, 0, 1);          /* M3 emphasized：折叠/抽屉，起步快尾巴长 */
  --e-standard:  cubic-bezier(0.4, 0, 0.2, 1);        /* 中性，位置微调 */
  --e-spring:    cubic-bezier(0.34, 1.56, 0.64, 1);   /* 轻回弹（overshoot 5~8%）：庆祝、勋章、成功态 */
  --e-linear:    linear;                              /* 仅骨架 shimmer / 进度条 / scrub */

  /* --- 位移 & 缩放（幅度也要令牌化，避免各页面自由发挥） --- */
  --m-xs: 2px;   --m-sm: 4px;   --m-md: 8px;   --m-lg: 16px;  --m-xl: 24px;
  --scale-press: 0.97;
  --scale-lift:  1.015;   /* hover 微抬最大值，超过 1.03 就"廉价" */
  --lift-y: -3px;

  /* --- stagger --- */
  --stg-tight: 28ms;   /* 列表项 */
  --stg-base:  45ms;   /* Bento 瓷片 */
  --stg-loose: 70ms;   /* 大区块 */
  --stg-max-i: 11;     /* 第 12 个及以后不再递增延迟（见 §5.5） */

  /* --- 玻璃/模糊（动效相关，低配要归零） --- */
  --glass-blur: 14px;
  --glass-bg: rgba(255, 255, 255, 0.62);

  /* --- 层级 --- */
  --z-decor: 0; --z-content: 1; --z-sticky: 10; --z-drawer: 100; --z-modal: 200; --z-celebrate: 900;
}
```

**使用规约**

- 组件里**只允许**写 `transition: opacity var(--d-base) var(--e-out), transform var(--d-base) var(--e-out);`
- **禁止** `transition: all`（现仓库 40+ 处需清理）、禁止裸写 `0.3s ease`。
- 加一条 stylelint 规则兜底：

```json
// .stylelintrc.json
{
  "rules": {
    "declaration-property-value-disallowed-list": {
      "transition": ["/^all/"],
      "/^transition-duration$/": ["/^\\d/"]
    }
  }
}
```

---

#### 3. 动效清单（12 条）

> 每条格式：**用途 → 时长/缓动 → 实现 → 落地位置 → 降级**

---

### 3.1 页面转场（Route Transition）

- **用途**：教师端「教学 ⇄ 教研」两大板块切换要有"换空间"的感知；板块内子页切换要轻，不能让老师觉得慢。
- **时长/缓动**：板块级 `--d-slow` / `--e-emph`；板块内 `--d-base` / `--e-out`。**位移只有 8px，绝不做整页横滑**（后台应用横滑 = 晕）。
- **实现**：Vue `<Transition mode="out-in">` 为底，`document.startViewTransition` 为渐进增强。

```vue
<!-- CX/web/src/App.vue -->
<template>
  <router-view v-slot="{ Component, route }">
    <transition :name="(route.meta.transition as string) || 'fade-up'" mode="out-in">
      <component :is="Component" :key="route.meta.group || route.path" />
    </transition>
  </router-view>
</template>
```

```css
/* motion.css */
.fade-up-enter-active { transition: opacity var(--d-base) var(--e-out), transform var(--d-base) var(--e-out); }
.fade-up-leave-active { transition: opacity var(--d-fast) var(--e-in); }
.fade-up-enter-from { opacity: 0; transform: translate3d(0, var(--m-md), 0); }
.fade-up-leave-to   { opacity: 0; }

/* IDE / Blockly 路由专用：只做透明度，绝不 transform（见 §5.4） */
.fade-only-enter-active { transition: opacity var(--d-fast) var(--e-out); }
.fade-only-leave-active { transition: opacity var(--d-instant) var(--e-in); }
.fade-only-enter-from, .fade-only-leave-to { opacity: 0; }
```

```ts
// CX/web/src/router/index.ts —— meta 增补
{ path: '/studio',            meta: { transition: 'fade-only', group: 'student' } },   // 学生 AI 结对（含 Monaco）
{ path: '/teach',             meta: { transition: 'fade-up',  group: 'teach'   } },
{ path: '/teach/monitor',     meta: { transition: 'fade-up',  group: 'teach'   } },
{ path: '/research',          meta: { transition: 'fade-up',  group: 'research'} },
{ path: '/research/report/:id', meta: { transition: 'fade-up', group: 'research', narrative: true } },
```

> `:key="route.meta.group || route.path"` 是关键：**同一板块内切子页不销毁重建**（教学板块的班级列表 → 任务详情不会整页闪），只有跨板块才走完整转场。

- **View Transitions 增强**（Chrome 111+，教师机常见）：

```ts
router.beforeResolve((to, from, next) => {
  const cross = to.meta.group !== from.meta.group
  // IDE 路由禁用：VT 会对整页做快照，Monaco 画布快照开销大且易出现闪白
  if (!cross || to.meta.transition === 'fade-only' || !document.startViewTransition
      || matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.dataset.cap === 'low') return next()
  document.startViewTransition(() => new Promise<void>(r => { next(); requestAnimationFrame(() => r()) }))
})
```

- **降级**：`reduced-motion` / `cap=low` → 只保留 `--d-instant` 的 opacity 交叉；VT 不支持 → 自动落回 `<Transition>`。

---

### 3.2 卡片入场 stagger（Bento 瓷片 / 列表）

- **用途**：首屏建立阅读顺序（KPI 行 → 主图 → 次级卡），这是"少即是多"的执行手段——用时间差代替视觉分割线。
- **时长/缓动**：`--d-slower` / `--e-out`，`delay = i × --stg-base`，位移 `translate3d(0, 12px, 0)` + `opacity 0→1`。**不做 scale 入场**（瓷片 scale 会让 backdrop-filter 重算，见 §5.3）。
- **实现**：一个 `v-reveal` 指令（IntersectionObserver 单例 + CSS 变量传 index），**动画本身仍是 CSS**。

```ts
// CX/web/src/directives/reveal.ts
import type { Directive } from 'vue'
let io: IntersectionObserver | null = null
const getIO = () => (io ??= new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting) { e.target.classList.add('is-in'); io!.unobserve(e.target) }
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 }))

export const vReveal: Directive<HTMLElement, number | undefined> = {
  mounted(el, binding) {
    const cap = document.documentElement.dataset.cap
    if (cap === 'low' || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.classList.add('is-in'); return }
    el.dataset.reveal = ''
    el.style.setProperty('--reveal-i', String(Math.min(binding.value ?? 0, 11)))  // stagger 封顶
    getIO().observe(el)
  },
  unmounted(el) { io?.unobserve(el) },
}
```

```css
[data-reveal]       { opacity: 0; transform: translate3d(0, 12px, 0); will-change: opacity, transform; }
[data-reveal].is-in { opacity: 1; transform: none; will-change: auto;
  transition: opacity var(--d-slower) var(--e-out), transform var(--d-slower) var(--e-out);
  transition-delay: calc(var(--reveal-i, 0) * var(--stg-base)); }
```

- **组件 API**：`<CeramicTile v-reveal="i" />`、`<BentoGrid :stagger="'base' | 'tight' | 'none'">`（Grid 内部给子节点自动派发 index）。
- **落地位置**：`views/admin/Dashboard.vue` 拆出的 `TeachOverview.vue` / `ResearchOverview.vue` 的 Bento 首屏；`Classes.vue`/`Assignments.vue` 卡片列表。
- **降级**：`cap=low` / reduced-motion → 指令直接打 `is-in`，**零动画且不闪**（关键：不能用 `animation: none`，否则元素停在 `opacity: 0`）。虚拟滚动/长表格（>50 行）**一律不挂** `v-reveal`（§5.5）。

---

### 3.3 KPI 数字滚动（count-up）

- **用途**：教学板块「今日在线 32 / 提交 118 / 求助 7」、教研板块「班级均分」。让数字"结算"出来，是后台唯一被允许的炫技点。
- **时长/缓动**：`--d-slower`（480ms）起，按数量级微调：`dur = clamp(480, 480 + log10(v)*90, 900)`；缓动 `easeOutExpo`（JS 实现，比 CSS 更贴"计数减速"手感）。
- **实现**：rAF composable，**必须配 `tabular-nums`**，否则每帧字宽变化 → 逐帧 reflow（这是 count-up 最常见的 layout thrash 源）。

```ts
// CX/web/src/composables/useCountUp.ts
import { ref, watch, onScopeDispose, type Ref } from 'vue'
const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))

export function useCountUp(target: Ref<number>, opts: { decimals?: number; duration?: number } = {}) {
  const display = ref(0); let raf = 0
  const fmt = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: opts.decimals ?? 0, maximumFractionDigits: opts.decimals ?? 0 })
  const text = ref('0')
  const run = (to: number) => {
    cancelAnimationFrame(raf)
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.dataset.cap === 'low'
    if (reduced) { display.value = to; text.value = fmt.format(to); return }
    const from = display.value, t0 = performance.now()
    const dur = opts.duration ?? Math.min(900, 480 + Math.log10(Math.max(10, Math.abs(to))) * 90)
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur)
      display.value = from + (to - from) * easeOutExpo(p)
      text.value = fmt.format(display.value)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
  }
  watch(target, run, { immediate: true })
  onScopeDispose(() => cancelAnimationFrame(raf))
  return { text, display }
}
```

```css
.kpi-value { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1; }
```

- **组件 API**：`<StatTile :value="kpi.online" :decimals="0" unit="人" />`，内部只在**首次进入视口**时启动（`v-reveal` 派发的 `is-in` 事件触发），避免折叠区外的数字白跑。
- **实时刷新场景**（教学监看每 10s 轮询）：数值变化 < 3% 时**不做滚动**，直接赋值 + 数字色闪一次 `--d-fast`；否则每次轮询都在动，噪音极大。
- **降级**：reduced-motion / low → 直接赋终值。

---

### 3.4 图表渐显（ECharts）

- **用途**：教研页图表要"长出来"，但不能每次切 tab 都重放一遍动画。
- **时长/缓动**：首绘 `animationDuration: 520` + `animationEasing: 'cubicOut'` + `animationDelay: i => i * 24`；更新 `animationDurationUpdate: 220`（**更新一定要比首绘短**，否则数据刷新像卡顿）。
- **实现**：统一 ECharts 动效预设 + IntersectionObserver 懒初始化 + ResizeObserver 节流。

```ts
// CX/web/src/composables/useChart.ts
import * as echarts from 'echarts'
import { onMounted, onScopeDispose, type Ref } from 'vue'

export function useChart(el: Ref<HTMLElement | undefined>, build: () => echarts.EChartsOption) {
  let inst: echarts.ECharts | null = null, ro: ResizeObserver | null = null, io: IntersectionObserver | null = null, raf = 0
  const low = () => document.documentElement.dataset.cap === 'low'
    || matchMedia('(prefers-reduced-motion: reduce)').matches

  const motionPreset = (): echarts.EChartsOption => low()
    ? { animation: false }
    : { animation: true, animationDuration: 520, animationEasing: 'cubicOut',
        animationDelay: (i: number) => i * 24,
        animationDurationUpdate: 220, animationEasingUpdate: 'cubicOut' }

  const init = () => {
    if (inst || !el.value) return
    inst = echarts.init(el.value, undefined, { renderer: 'canvas' })   // 恒用 canvas，不用 svg
    inst.setOption({ ...build(), ...motionPreset() })
    ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => inst?.resize()) })
    ro.observe(el.value)
  }
  onMounted(() => {
    io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { init(); io?.disconnect() } }, { rootMargin: '120px' })
    if (el.value) io.observe(el.value)
  })
  onScopeDispose(() => { io?.disconnect(); ro?.disconnect(); cancelAnimationFrame(raf); inst?.dispose() })
  const update = (o: echarts.EChartsOption) => inst?.setOption(o)   // notMerge 默认 false，保留动画连续性
  return { update, getInst: () => inst }
}
```

- **落地位置**：改造 `views/admin/Dashboard.vue:117/169`、`StudentReport.vue:107/127`、`components/ThinkingDashboard.vue:139`（当前均为 `onMounted` 里直接 `echarts.init`，无懒加载、无 dispose、无 resize 处理）。
- **雷达图（计算思维四维）特例**：首绘用 `animationDuration: 700` + 从中心展开更有仪式感，但**只在学生端首次进入 `/thinking` 播一次**，用 `sessionStorage` 标记，二次进入直接静态。
- **降级**：`cap=low` → `animation: false`；同屏图表 > 3 个时，第 4 个起自动 `animation: false`（在 `useChart` 里用模块级计数器实现）。

---

### 3.5 Hover 微交互（微抬 / 磁吸 / 光泽扫过）

三个层级，**按元素重要性分配，不可叠加**：

#### (a) 微抬 lift —— 所有可点卡片的默认
- 时长 `--d-fast` / `--e-out`；`transform: translate3d(0, var(--lift-y), 0) scale(var(--scale-lift))` + 阴影加深。
```css
.tile--interactive { transition: transform var(--d-fast) var(--e-out), box-shadow var(--d-fast) var(--e-out); }
@media (hover: hover) and (pointer: fine) {
  .tile--interactive:hover { transform: translate3d(0, var(--lift-y), 0) scale(var(--scale-lift)); box-shadow: var(--shadow-lg); }
}
.tile--interactive:active { transform: scale(var(--scale-press)); transition-duration: var(--d-instant); }
```
> `@media (hover: hover) and (pointer: fine)` 是硬要求：教室触屏一体机上 `:hover` 会**粘住**，卡片点完一直保持抬起。

#### (b) 磁吸 magnetic —— 只给主 CTA（"开始结对"、"生成教研报告"）
- 时长：跟随，无固定时长；`gsap.quickTo` 或自写 rAF lerp（`lerp = 0.18`）。位移上限 **6px**（超过就是营销页味）。
```ts
// CX/web/src/directives/magnetic.ts —— 零依赖版（不引 GSAP）
import type { Directive } from 'vue'
export const vMagnetic: Directive<HTMLElement, number | undefined> = {
  mounted(el, b) {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (document.documentElement.dataset.cap !== 'high') return          // 仅高配启用
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const max = b.value ?? 6
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, active = false
    const loop = () => {
      cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18
      el.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`
      if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1 || active) raf = requestAnimationFrame(loop)
      else { el.style.willChange = 'auto'; raf = 0 }
    }
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()                                // 只在 pointerenter 时读一次更好，见 §5.1
      tx = ((e.clientX - r.left) / r.width - 0.5) * max * 2
      ty = ((e.clientY - r.top) / r.height - 0.5) * max * 2
      if (!raf) { el.style.willChange = 'transform'; raf = requestAnimationFrame(loop) }
    }
    el.addEventListener('pointerenter', () => { active = true })
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', () => { active = false; tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(loop) })
    ;(el as any).__magCleanup = () => cancelAnimationFrame(raf)
  },
  unmounted(el) { (el as any).__magCleanup?.() },
}
```
> 全站磁吸元素**同屏 ≤ 2 个**。`getBoundingClientRect` 在 `pointermove` 里调用会强制 layout —— 若同屏元素多，改为 `pointerenter` 缓存 rect + `scroll/resize` 失效重取。

#### (c) 光泽扫过 sheen —— 只给"完成/已达标"状态的瓷片和勋章
- 时长 `640ms` / `--e-linear`，hover 触发一次，不循环。
```css
.tile--sheen { position: relative; overflow: hidden; isolation: isolate; }
.tile--sheen::after {
  content: ''; position: absolute; inset: 0; z-index: 2; pointer-events: none;
  background: linear-gradient(105deg, transparent 38%, rgba(255,255,255,.55) 50%, transparent 62%);
  transform: translate3d(-130%, 0, 0); opacity: 0;
}
@media (hover: hover) and (pointer: fine) {
  .tile--sheen:hover::after { animation: sheen 640ms var(--e-linear) 1 forwards; }
}
@keyframes sheen { 0% { transform: translate3d(-130%,0,0); opacity: 1 } 100% { transform: translate3d(130%,0,0); opacity: 0 } }
```
- **降级**：`cap=low` 关闭 (b)(c)，保留 (a)；reduced-motion 下 (a) 退化为**仅阴影+边框色变化，无位移**。

---

### 3.6 骨架屏与加载

- **用途**：教师端列表/图表接口 200–800ms，直接转圈很廉价；但**骨架屏用错比转圈更糟**（<200ms 的请求闪一下骨架 = 闪烁）。
- **时长/缓动**：shimmer 光带 `1.15s` / `--e-linear` / infinite；骨架→内容交叉 `--d-base` / `--e-out`。
- **实现三原则**（写进 `useAsyncPanel`）：
  1. **延迟出现**：请求发出后 **220ms 内返回则不显示骨架**；
  2. **最短驻留**：一旦显示，至少停 **420ms**；
  3. **形状同构**：骨架块的高度/圆角/间距必须等于真实内容，否则替换瞬间发生 reflow 跳动。

```ts
// CX/web/src/composables/useAsyncPanel.ts
import { ref } from 'vue'
export function useAsyncPanel<T>(fetcher: () => Promise<T>) {
  const data = ref<T>(), showSkeleton = ref(false), error = ref<unknown>(null)
  let t0 = 0, timer: number | undefined
  const run = async () => {
    error.value = null
    timer = window.setTimeout(() => { showSkeleton.value = true; t0 = performance.now() }, 220)
    try { const r = await fetcher()
      clearTimeout(timer)
      const rest = showSkeleton.value ? Math.max(0, 420 - (performance.now() - t0)) : 0
      if (rest) await new Promise(r2 => setTimeout(r2, rest))
      data.value = r
    } catch (e) { clearTimeout(timer); error.value = e }
    finally { showSkeleton.value = false }
  }
  return { data, showSkeleton, error, run }
}
```

```css
/* shimmer：动 transform 的伪元素光带，不动 background-position（后者每帧重绘整块） */
.sk { position: relative; overflow: hidden; background: rgba(0,0,0,.055); border-radius: var(--radius-md); }
.sk::after { content:''; position:absolute; inset:0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.75), transparent);
  transform: translate3d(-100%,0,0); animation: sk-slide 1.15s var(--e-linear) infinite; }
@keyframes sk-slide { to { transform: translate3d(100%,0,0) } }
[data-cap="low"] .sk::after, @media (prefers-reduced-motion: reduce) { .sk::after { animation: none; display: none } }
```
- **降级**：`cap=low` / reduced-motion → 静态灰块（**保留骨架布局**，只去掉光带）。全局并发上限：**同屏运动的 shimmer ≤ 8 条**，超出的骨架块不加 `::after`（BentoGrid 里按 index 判断）。

---

### 3.7 抽屉 / 折叠展开（渐进披露核心）

这是"少即是多"的主承载动效——教师端每张卡片默认只给 1 个结论 + 1 个数字，细节收在折叠里。

- **用途**：卡片内"查看明细"、教研筛选面板、学生端"行为统计分析"详情。
- **时长/缓动**：折叠 `--d-base` / `--e-emph`；抽屉 `--d-slow` / `--e-emph`；内容淡入延迟 `80ms`（先开壳，再进内容，层次感来源）。
- **实现 A · 折叠（推荐 grid-template-rows）**：
```css
.collapse { display: grid; grid-template-rows: 0fr;
  transition: grid-template-rows var(--d-base) var(--e-emph); }
.collapse[data-open="true"] { grid-template-rows: 1fr; }
.collapse > .collapse__inner { overflow: hidden; min-height: 0; contain: content; }
.collapse > .collapse__inner > * { opacity: 0; transition: opacity var(--d-fast) var(--e-out) 80ms; }
.collapse[data-open="true"] > .collapse__inner > * { opacity: 1; }
```
> **诚实提示**：`grid-template-rows` 动画**不走合成器**，逐帧触发 layout。红线：单个折叠区内容高度 ≤ 600px 且子节点 ≤ 30；**同屏同时展开的折叠区 ≤ 1**（用一个 `useAccordion` 保证互斥）；内部**不得**包含 Monaco / ECharts / 长表格。

- **实现 B · 含图表或大内容的折叠 → 改用"显示/隐藏 + 淡入"**，不做高度动画：
```ts
// 展开：先 display:block → nextTick → 加 .is-in（opacity+8px 位移）→ 动画结束后 chart.resize()
```

- **实现 C · 抽屉（右侧详情，如"某学生画像"）**：`<Transition>` + `transform: translate3d(100%,0,0) → 0`，遮罩 `opacity`，**只动 transform/opacity**。
```css
.drawer-enter-active, .drawer-leave-active { transition: transform var(--d-slow) var(--e-emph); }
.drawer-enter-from, .drawer-leave-to { transform: translate3d(100%, 0, 0); }
.mask-enter-active, .mask-leave-active { transition: opacity var(--d-base) var(--e-standard); }
.mask-enter-from, .mask-leave-to { opacity: 0; }
```
- **组件 API**：`<CollapsePanel v-model="open" :lazy="true" mode="height|fade">`、`<SideDrawer v-model="open" width="440px" :focus-trap="true">`。
- **降级**：reduced-motion / low → `--d-*` 归零，展开变为**瞬时**（但仍走同一状态机，`transitionend` 回调必须仍触发 → 用 `0.01ms` 而非 `none`，见 §4）。

---

### 3.8 滚动叙事（教研报告页，L2 · GSAP 唯一战场）

- **用途**：`/research/report/:id` 把"班级学情结论"讲成一条线：结论卡 → 证据图表 → 个体分布 → 建议。老师滚动即阅读，不需要点。
- **时长/缓动**：段落进入 `--d-narr`(800ms) / `--e-out`；scrub 段跟随滚动（无时长）；`pin` 段最多 **1 处**（首屏"核心结论"钉住，右侧图表随滚动切换）。
- **实现**：路由级懒加载 GSAP。

```ts
// CX/web/src/composables/useNarrative.ts
import { onMounted, onScopeDispose } from 'vue'
export function useNarrative(root: () => HTMLElement | undefined) {
  let ctx: any = null
  onMounted(async () => {
    const el = root(); if (!el) return
    const cap = document.documentElement.dataset.cap
    if (cap !== 'high' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.querySelectorAll('[data-narr]').forEach(n => n.classList.add('is-in'))   // 静态呈现，内容完整
      return
    }
    const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')])
    gsap.registerPlugin(ScrollTrigger)
    ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('[data-narr]').forEach((sec) => {
        gsap.fromTo(sec, { opacity: 0, y: 28 }, {
          opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', force3D: true,
          scrollTrigger: { trigger: sec, start: 'top 78%', once: true },
        })
      })
      // 唯一一处 pin：结论区钉住，进度条 scrub
      ScrollTrigger.create({
        trigger: '[data-narr-pin]', start: 'top 12%', end: '+=140%', pin: true, pinSpacing: true,
        scrub: 0.6, anticipatePin: 1,
        onUpdate: (s) => document.documentElement.style.setProperty('--narr-p', s.progress.toFixed(3)),
      })
    }, el)
  })
  onScopeDispose(() => ctx?.revert())     // gsap.context().revert() 一次性清掉所有 ScrollTrigger，必须写
}
```
- **落地位置**：新建 `views/research/ReportNarrative.vue`（由现 `views/admin/StudentReport.vue` 演进），路由 `meta.narrative = true`。
- **红线**：`pin` 段内**不得**放 ECharts（pin 会改父元素 transform，ECharts canvas 的 tooltip 定位会偏）；图表放在非 pin 的 scrub 段，用 `onEnter` 触发 `setOption` 而非动 DOM。
- **降级**：`cap != high` 或 reduced-motion → **不下载 GSAP**，全部段落静态 `is-in`。同时页面顶部提供「导出 PDF / 脱敏导出」按钮，走静态排版分支——**叙事只是增强，报告的信息完整性与动效无关**（等保/存档场景必须）。

---

### 3.9 AI 打字机与思考态

产品第一动效，也是当前代码性能债最重的地方。

- **用途**：SSE 流式输出的"正在思考 → 逐字输出 → 完成"三态；苏格拉底模式下的"提问停顿"节奏。
- **时长/缓动**：
  - 思考态 shimmer 文本 `1.4s` / `--e-linear` / infinite；三点跳动 `1.4s`（现有 `.typing-indicator`，保留）。
  - 光标呼吸 `1.06s` / `steps(2, end)`（**用 steps 不用 ease，模拟终端硬闪**）。
  - 打字节奏：**不按 token 渲染**，按 rAF 帧取字，每帧 `n = clamp(queue.length / 6, 1, 8)` 字符 → 视觉上恒定 ~120–480 字/秒且不抖。
- **实现**：

```ts
// CX/web/src/composables/useTypewriter.ts
import { ref, onScopeDispose } from 'vue'
export function useTypewriter() {
  const text = ref('')            // 已"打出"的文本
  const typing = ref(false)
  let queue = '', raf = 0, done = false
  const instant = () => matchMedia('(prefers-reduced-motion: reduce)').matches
    || document.documentElement.dataset.cap === 'low'

  const tick = () => {
    if (!queue.length) { raf = 0; if (done) typing.value = false; return }
    const n = Math.max(1, Math.min(8, Math.ceil(queue.length / 6)))
    text.value += queue.slice(0, n); queue = queue.slice(n)
    raf = requestAnimationFrame(tick)
  }
  const push = (chunk: string) => {
    typing.value = true
    if (instant()) { text.value += chunk; return }
    queue += chunk; if (!raf) raf = requestAnimationFrame(tick)
  }
  const finish = () => { done = true; if (!raf) typing.value = false }
  const reset = () => { cancelAnimationFrame(raf); raf = 0; queue = ''; text.value = ''; done = false; typing.value = false }
  onScopeDispose(() => cancelAnimationFrame(raf))
  return { text, typing, push, finish, reset }
}
```

**同时必须修的三个性能点**（`components/AIChatPanel.vue`）：

| 现状 | 问题 | 改法 |
|---|---|---|
| `marked.parse(content)`（:392）随流式内容每次变更全量重解析 | 一条 800 字回答 = 数百次 markdown 全量解析 + innerHTML 重建，主线程尖峰，Monaco 打字掉帧 | **打字期间只渲染纯文本**（`white-space: pre-wrap`），`finish()` 后一次性 `marked.parse` 替换；或解析节流 ≥ 120ms 且只对**最后一个未闭合段落**之前的内容解析 |
| 每个 chunk 调 `scrollToBottom()`（:368） | 每 chunk 读 `scrollHeight` = 强制同步 layout（典型 thrash） | 改为 rAF 合并 + "**贴底才自动滚**"：`atBottom = scrollHeight - scrollTop - clientHeight < 48`，用户上翻时**停止自动滚**并显示"↓ 回到最新"按钮 |
| 无内容高度稳定处理 | 逐字增高导致整列 reflow | 消息气泡容器加 `contain: content`；列表容器 `overflow-anchor: none` + 手动滚动控制 |

```css
/* 光标 */
.ai-caret::after { content:'▍'; margin-left: 1px; animation: caret 1.06s steps(2, end) infinite; }
@keyframes caret { 50% { opacity: 0 } }
/* 思考态：文字 shimmer（比转圈更"在想事"） */
.ai-thinking { background: linear-gradient(90deg, var(--text-secondary) 0%, var(--accent-purple) 45%, var(--text-secondary) 90%);
  background-size: 220% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: think 1.4s var(--e-linear) infinite; }
@keyframes think { to { background-position: -220% 0 } }
```
- **苏格拉底模式增强**（勾选"强制苏格拉底式引导"时）：AI 抛出问题后，输入框做一次 `--d-base` 的 `--e-spring` 边框脉冲（1 次，非循环）+ placeholder 换成"先说说你的想法…"。**这是引导，不是装饰**。
- **降级**：reduced-motion / low → `push` 直接追加（无逐字）、光标改静态 `▍`、思考态 shimmer 换成静态文字"小海龟正在思考…"+ 现有三点跳动（三点动的是 transform，成本极低，可保留）。

---

### 3.10 成功庆祝（粒子 / 纸屑）

- **用途**：学生端**仅两处**——① 任务提交且通过全部测试；② 错题本某知识点首次"从错到对"。教师端 **0 处**。
- **时长/缓动**：粒子 `1.2s` 内全部落地并自销毁；主体徽章 `--d-slow` / `--e-spring`（overshoot 到 1.06 再回 1）。
- **实现**：自写 ~1.5KB canvas（不引 `canvas-confetti`，因为要控制粒子数与自动降级）。

```ts
// CX/web/src/composables/useCelebrate.ts（要点，非全量）
export function celebrate(origin: { x: number; y: number }) {
  const cap = document.documentElement.dataset.cap
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return badgePop()      // 只弹徽章
  const COUNT = cap === 'high' ? 80 : cap === 'mid' ? 36 : 0                          // low 不放粒子
  if (!COUNT) return badgePop()
  const cvs = document.createElement('canvas')
  cvs.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:var(--z-celebrate)`
  const dpr = Math.min(devicePixelRatio, 2)                                           // DPR 封顶 2
  // ... rAF 更新 x/y/rot，1.2s 后 cvs.remove()，取消 rAF
}
```
- **频控（教育场景强要求）**：同一学生**同一会话内同类庆祝 ≤ 3 次**，之后降级为徽章弹一下 + 数字 count-up。奖励通胀会让"完成"失去意义，也会让课堂变吵。可用 `sessionStorage.celebrateCount` 计数。
- **降级**：`low` → 徽章 `--e-spring` scale 弹跳 + `RingProgress` 一圈补满；reduced-motion → 徽章**淡入**，无缩放，无粒子。

---

### 3.11 空态插画呼吸

- **用途**：学生端"还没有对话/还没有错题"、教师端"该班还没有提交"。空态是产品被看见最多的界面之一。
- **时长/缓动**：`float` `5.2s` / `ease-in-out` / infinite / `translate3d(0, -4px, 0)`；配一个 `6.8s` 的阴影缩放（**周期错开，避免机械同步**）。
- **实现**：复用现有 `@keyframes float`（`global.css` 已有，改成 `translate3d` 并把 8px 降到 4px）。
```css
.empty-art { animation: float 5.2s var(--e-standard) infinite; }
.empty-art__shadow { animation: breathe 6.8s var(--e-standard) infinite; }
@keyframes float   { 0%,100% { transform: translate3d(0,0,0) } 50% { transform: translate3d(0,-4px,0) } }
@keyframes breathe { 0%,100% { transform: scale(1); opacity:.35 } 50% { transform: scale(.92); opacity:.22 } }
```
- **红线**：同屏**只允许 1 个**呼吸元素；元素离开视口用 IntersectionObserver 暂停（`animation-play-state: paused`）—— 后台标签页里 infinite 动画仍会被浏览器节流但不为 0。
- **降级**：`low` / reduced-motion → 完全静止（`animation: none` 在这里是安全的，因为无状态依赖）。

---

### 3.12 监看告警脉冲（教学板块专有，现有代码需改造）

- **用途**：`/teach/monitor` 里某学生"连续 3 次报错 / 5 分钟无操作"时，其头像卡需要**被看见但不打断**。
- **时长/缓动**：`1.6s` / `--e-standard` / infinite，最多持续 **12s** 后自动降为静态高亮描边（长时间闪烁 = 课堂噪音 + 焦虑）。
- **改造点**：现 `global.css` 的 `@keyframes borderFlash` **动的是 `box-shadow`**，每帧触发 paint，30 个学生卡同时告警时是最坏情况。改为伪元素 + `transform/opacity`：
```css
.alert-ring { position: relative; }
.alert-ring::before {
  content:''; position:absolute; inset:-2px; border-radius: inherit; pointer-events:none;
  box-shadow: 0 0 0 3px rgba(245,34,45,.45);          /* 静态 box-shadow，只画一次 */
  opacity: 0; transform: scale(.985);
  animation: ring 1.6s var(--e-standard) infinite;
}
@keyframes ring { 0%,100% { opacity:0; transform: scale(.985) } 50% { opacity:1; transform: scale(1) } }
```
- **并发上限**：同屏 ≤ 6 个脉冲，超出的用**静态红点 + 顶部计数徽标**"另有 12 人需要关注"，点开走列表。这是设计问题不是性能问题——40 个卡同时闪，等于没有告警。

---

#### 4. 降级规范

### 4.1 三档能力探测

```ts
// CX/web/src/composables/useMotionCapability.ts —— main.ts 里最早调用
export function initMotionCapability() {
  const root = document.documentElement
  const nav = navigator as any
  const cached = localStorage.getItem('motion-cap')                       // 只缓存"降级"结果
  if (cached === 'low') { root.dataset.cap = 'low'; return }

  const hints = [
    (nav.deviceMemory ?? 8) <= 4,
    (nav.hardwareConcurrency ?? 8) <= 4,
    nav.connection?.saveData === true,
    matchMedia('(max-width: 1366px)').matches && (nav.hardwareConcurrency ?? 8) <= 4,
  ].filter(Boolean).length
  root.dataset.cap = hints >= 2 ? 'low' : hints === 1 ? 'mid' : 'high'

  // 运行时 FPS 采样（首屏后 3s 内 90 帧），只降不升
  let frames = 0, t0 = performance.now()
  const probe = () => {
    frames++
    if (frames < 90) return requestAnimationFrame(probe)
    const fps = frames / ((performance.now() - t0) / 1000)
    if (fps < 45 && root.dataset.cap !== 'low') {
      root.dataset.cap = fps < 32 ? 'low' : 'mid'
      if (fps < 32) localStorage.setItem('motion-cap', 'low')
    }
  }
  requestIdleCallback ? requestIdleCallback(() => requestAnimationFrame(probe)) : setTimeout(() => requestAnimationFrame(probe), 1200)
}
```
另外在「设置」页给老师一个显式开关：**"精简动效模式（机房推荐）"** → 写 `localStorage.motion-cap = 'low'`。学校机房是最典型的低配场景（集显 + 1366×768 + 老 Chrome + 投影镜像），**不要指望自动探测能全覆盖，必须有人工开关**。

### 4.2 令牌改写（唯一降级入口）

```css
/* 关键：用 0.01ms 而不是 animation:none / transition:none，
   保证 transitionend / animationend 回调仍然触发，状态机不卡死 */
@media (prefers-reduced-motion: reduce) {
  :root {
    --d-instant: .01ms; --d-fast: .01ms; --d-base: .01ms;
    --d-slow: .01ms; --d-slower: .01ms; --d-narr: .01ms;
    --stg-tight: 0ms; --stg-base: 0ms; --stg-loose: 0ms;
    --m-xs:0; --m-sm:0; --m-md:0; --m-lg:0; --m-xl:0;
    --scale-press: 1; --scale-lift: 1; --lift-y: 0px;
    --e-spring: var(--e-standard);      /* 去掉回弹 */
  }
  *, *::before, *::after {
    animation-duration: .01ms !important; animation-iteration-count: 1 !important;
    transition-duration: .01ms !important; scroll-behavior: auto !important;
  }
}

[data-cap="low"] {
  --d-slower: var(--d-base); --d-slow: var(--d-base); --d-narr: var(--d-base);
  --stg-tight: 0ms; --stg-base: 0ms; --stg-loose: 0ms;
  --glass-blur: 0px;                                    /* 集显上 backdrop-filter 最贵 */
  --glass-bg: rgba(255, 255, 255, 0.92);                /* 用不透明背景补偿观感 */
}
[data-cap="low"] .glass, [data-cap="low"] .tile { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }

[data-cap="mid"] { --d-narr: var(--d-slow); --stg-base: 30ms; --glass-blur: 8px; }
```

### 4.3 降级矩阵

| 动效 | high | mid | low | reduced-motion |
|---|---|---|---|---|
| 页面转场 | VT + fade-up | fade-up | fade 8ms | 瞬时 |
| 卡片 stagger | 45ms 递增 | 30ms | 无延迟同时入场 | 直接可见 |
| KPI count-up | ✅ 480–900ms | ✅ 480ms | ❌ 直接赋值 | ❌ 直接赋值 |
| 图表动画 | 520ms + delay | 320ms 无 delay | `animation:false` | `animation:false` |
| hover 微抬 | ✅ | ✅ | ✅（仅阴影） | 仅阴影/描边 |
| 磁吸 | ✅（≤2 处） | ❌ | ❌ | ❌ |
| 光泽扫过 | ✅ | ✅ | ❌ | ❌ |
| 骨架 shimmer | ✅ | ✅（≤4 条） | 静态灰块 | 静态灰块 |
| 折叠/抽屉 | ✅ | ✅ | 瞬时切换 | 瞬时切换 |
| 滚动叙事(GSAP) | ✅ 下载 | ❌ 不下载，静态 | ❌ | ❌ |
| 打字机 | ✅ rAF 逐字 | ✅ | ❌ 整段追加 | ❌ 整段追加 |
| 庆祝粒子 | 80 粒 | 36 粒 | 徽章弹跳 | 徽章淡入 |
| 空态呼吸 | ✅ | ✅ | ❌ | ❌ |
| 告警脉冲 | ✅ ≤6 | ✅ ≤6 | 静态描边 | 静态描边 |

> 无障碍补充：`prefers-reduced-motion` 下**信息不能只靠动效传达**——告警必须同时有图标 + 文案；"AI 正在思考"必须有 `aria-live="polite"` 文本；庆祝必须有可读的"任务已通过"文本节点。

---

#### 5. 性能红线（Code Review 必查项）

### 5.1 只动 transform / opacity / filter(有限)
- **允许逐帧变化**：`transform`、`opacity`。
- **有条件允许**：`box-shadow`（只允许在 `--d-fast` 的一次性 hover 上，禁止 infinite）、`filter: blur`（仅一次性，≤2 处同屏）、`clip-path`（≤1 处）。
- **禁止逐帧变化**：`width/height/top/left/right/bottom/margin/padding/font-size/border-width`、`background-position`（改用伪元素 translate）、`backdrop-filter` 数值（改用 opacity 淡入淡出整层）。
- **唯一豁免**：`grid-template-rows` 折叠（§3.7），有明确边界条件。
- **禁止在 rAF/事件回调里读 layout 后立即写**：`getBoundingClientRect / offsetTop / scrollHeight / getComputedStyle` 属于**读**，写 `style.transform` 属于**写**。读全部提前、写统一在 rAF 末尾。当前 `AIChatPanel.scrollToBottom()`（:445）与 `v-magnetic` 的 `pointermove` 是两个已知违规点。

### 5.2 will-change 用完即清
```ts
el.style.willChange = 'transform'          // 动画开始
el.addEventListener('transitionend', () => { el.style.willChange = 'auto' }, { once: true })
```
- 全站 `will-change` **常驻元素上限 6 个**。滥用会为每个元素创建合成层，低配显存直接爆（表现为整页糊 / 滚动撕裂）。
- CSS 里写死 `will-change: transform` 的地方一律改成 `.is-animating` 类切换。

### 5.3 玻璃拟态的成本控制
- **同屏 `backdrop-filter` 元素 ≤ 6 个**；滚动容器内部**禁止**（滚动时每帧重算模糊区域）。
- 滚动期间临时降级：
```ts
let st = 0
addEventListener('scroll', () => {
  document.documentElement.classList.add('is-scrolling')
  clearTimeout(st); st = window.setTimeout(() => document.documentElement.classList.remove('is-scrolling'), 140)
}, { passive: true })
```
```css
.is-scrolling .glass { backdrop-filter: none; background: var(--glass-bg); }
```
- **不要对带 `backdrop-filter` 的元素做 scale 动画**（每帧重采样背景）；入场只用 translate + opacity（§3.2 已遵守）。

### 5.4 Monaco / Blockly / ECharts 上方的硬约束

| 禁止 | 原因 |
|---|---|
| 给 Monaco / Blockly 的**任何祖先**加 `transform`、`filter`、`backdrop-filter`、`perspective`、`will-change: transform`、`contain: paint` | 会创建新 containing block，导致 Monaco 的悬浮 widget（自动补全、hover 提示、右键菜单）定位偏移或被裁剪；Blockly 的拖拽坐标同样错位。**这也是 §3.1 给 IDE 路由用 `fade-only` 转场的根本原因。** |
| 对含 Monaco 的路由使用 View Transitions | 整页快照包含编辑器画布，开销大且闪白 |
| 在 `pin` 的 ScrollTrigger 区块内放 ECharts | pin 会给容器加 transform，tooltip / `convertToPixel` 全部偏移 |
| 在 ECharts canvas 上方叠 `backdrop-filter` 面板 | canvas + 模糊层 = 每帧全区重绘 |
| Monaco `onDidChangeModelContent` 里直接触发 Vue 响应式 + 动效 | 打字每个字符触发一次；必须 debounce ≥ 200ms（协同广播已有节流的话复用） |
| 侧栏 AI 面板宽度用 `width` 过渡 | 每帧 reflow 会触发 Monaco `layout()`。改为：外层 `grid-template-columns` 只在**开始/结束**两个状态切换（无过渡），内层用 transform 滑入；动画 `transitionend` 后调一次 `editor.layout()` |

```ts
// 侧栏开合的正确姿势
await new Promise(r => panel.addEventListener('transitionend', r, { once: true }))
editor.layout()          // 只调一次，不要在过渡期间每帧调
```

### 5.5 数量与列表
- **stagger 封顶 12**：第 12 个之后 `transition-delay` 恒定，否则第 40 张卡要等 1.8s 才出现（看起来像卡死）。
- **长列表 / 表格 > 50 行**：禁用逐项入场，改为**整块**淡入。
- **`<TransitionGroup>` 的 `v-move`** 只在 ≤ 30 项时启用（排序动画的 FLIP 成本随项数线性上涨）。
- **infinite 动画同屏 ≤ 8 个**（骨架 + 告警 + 呼吸 + 打字光标合并计算）；离屏元素用 IntersectionObserver 置 `animation-play-state: paused`。

### 5.6 量化红线（CI / 验收）

| 指标 | 阈值 | 测法 |
|---|---|---|
| 动效系统首屏 JS 增量 | ≤ 8 KB gzip | `rollup-plugin-visualizer` |
| GSAP chunk | 不出现在 `/`、`/studio`、`/teach` 的 initial chunk | 构建产物检查 |
| 滚动/转场帧率（低配基线：1366×768 + 集显 + Chrome） | ≥ 50 fps，掉帧 < 5% | DevTools Performance / `PerformanceObserver('long-animation-frame')` |
| INP（学生端 IDE 打字、教师端筛选） | < 200ms（目标 < 100ms） | web-vitals 上报 |
| 单帧长任务 | < 50ms | Long Tasks API |
| CLS（骨架→内容替换） | < 0.05 | 骨架形状同构即可达成 |
| 常驻合成层 | < 20 层 | DevTools Layers 面板 |

---

#### 6. 落地清单与排期

### 6.1 新增/改造文件

```
CX/web/src/
  styles/
    motion.css                    ★新增 —— 令牌 + 全部 keyframes + 转场类 + 降级块
    global.css                    ✎改造 —— 移除 7 个旧 keyframes（迁到 motion.css），
                                          清理 40+ 处 `transition: all`
  composables/
    useMotionCapability.ts        ★新增 —— cap 探测（main.ts 首行调用）
    useCountUp.ts                 ★新增
    useTypewriter.ts              ★新增
    useAsyncPanel.ts              ★新增 —— 骨架 220/420 规则
    useChart.ts                   ★新增 —— ECharts 动效预设 + 懒初始化 + dispose
    useCelebrate.ts               ★新增 —— canvas 粒子 + 频控
    useNarrative.ts               ★新增 —— GSAP 懒加载（仅 /research/report）
    useAccordion.ts               ★新增 —— 折叠互斥
  directives/
    reveal.ts / magnetic.ts       ★新增
  components/motion/
    StatTile.vue                  ★新增 props: value, decimals, unit, trend
    CollapsePanel.vue             ★新增 props: modelValue, lazy, mode('height'|'fade')
    SideDrawer.vue                ★新增 props: modelValue, width, focusTrap
    SkeletonBlock.vue             ★新增 props: rows, ratio, shimmer
    EmptyState.vue                ★新增 props: art, title, action, breathing
  main.ts                         ✎ import motion.css / initMotionCapability() / app.directive('reveal'|'magnetic')
  App.vue                         ✎ router-view + <transition> 包裹
  router/index.ts                 ✎ 每条路由补 meta.transition / meta.group / meta.narrative
  components/AIChatPanel.vue      ✎ 接 useTypewriter + 修 marked 全量重解析 + 修 scrollToBottom thrash
  components/ThinkingDashboard.vue ✎ 接 useChart
  views/admin/Dashboard.vue       ✎ 拆分为 teach/research 两个 overview，接 useChart + v-reveal + StatTile
  views/admin/StudentReport.vue   ✎ 演进为 views/research/ReportNarrative.vue（接 useNarrative）
vite.config.ts                    ✎ manualChunks: gsap / monaco / echarts
```

### 6.2 三个迭代

| 阶段 | 内容 | 产出可验收点 |
|---|---|---|
| **M1 · 地基（1–1.5d）** | `motion.css` 令牌 + 降级块 + `useMotionCapability` + 清理 `transition: all` + 路由转场 + `v-reveal` | 全站切页/入场统一；设置页"精简动效模式"可用；stylelint 门禁生效 |
| **M2 · 主线（2–3d）** | StatTile/count-up、useChart、CollapsePanel/SideDrawer、SkeletonBlock、AIChatPanel 打字机改造（含性能修复） | 教师首屏节奏成立；AI 面板打字期间 Monaco 输入 INP < 100ms |
| **M3 · 增强（1–2d）** | GSAP 叙事页、磁吸、光泽、庆祝粒子、空态呼吸、告警脉冲改造 | GSAP 仅在 `/research/report` 加载；低配机全套降级实测通过 |

### 6.3 验收脚本（人工 10 分钟走查）

1. 系统设置开"减少动态效果" → 全站无位移、无循环动画，**所有交互仍能完成**（折叠能开、骨架能消失、庆祝有文本）。
2. `localStorage.setItem('motion-cap','low')` 刷新 → 无模糊、无 stagger、图表瞬绘、Network 里**没有 gsap chunk**。
3. 学生端 `/studio` 边打字边让 AI 流式输出 800 字 → Performance 面板无 >50ms 长任务，编辑器不掉帧。
4. 教师端 `/teach/monitor` 造 30 个告警 → 只有 6 个脉冲 + 顶部"另有 N 人"，帧率 ≥ 50。
5. `/research/report/:id` 滚到底再返回上一页 → `gsap.context().revert()` 生效，Console 无 ScrollTrigger 泄漏警告，返回后再进入不重复叠加。
6. Monaco 自动补全弹窗位置正确（验证无祖先 transform 污染）。

---

#### 7. 一句话总结

**令牌统一（6 档时长 / 5 条缓动），实现分层（CSS 85% + WAAPI 12% + GSAP 3%），降级单点（改写 CSS 变量），红线量化（只动 transform/opacity、Monaco 祖先零 transform、同屏运动上限）。** 高级感来自克制的节奏与一致的物理，不来自库的体积。

---

## 附录 D · AI 学情分析与画像链路

#### AI 学情分析与画像 · 产品与前端落地方案（V2）

> 落点：教师端「教研」板块的核心链路 —— **细节数据 → 确定性特征 → LLM 结论卡 → 结论先行的一屏画像**。
> 现状锚点（已读代码）：`backend/app/routers/thinking.py` 的四维分是硬编码启发式（`_clamp(40 + fixes * 6 + switches * 4)`），`backend/app/models/monitor.py` 只有 `LearningMonitor`（三种 activity_type）+ `ErrorRecord`，前端 `CX/web/src/composables/useThinkingTracker.ts` **每个事件发一个 POST**，`CX/web/src/views/admin/StudentReport.vue` 是「图表堆叠 + 文字列表」。本方案就是把这三处替换掉。

---

#### 0. 一句话架构 + 三条不可动摇的设计约束

```
IDE/对话埋点 ──► learning_events(追加写)
                     │
        feature_service.py（纯 Python，确定性算术：六维分/MTTR/依赖度/班级分位）
                     │  feature_pack.json（已脱敏、带 evidence_id 池）
                     ▼
        insight_service.py ──► LLM（只归因、只命名、只建议，禁止算术）
                     │  cards[] JSON（每条结论必须引用 evidence_id）
                     ▼
        审核三闸（schema / 证据存在性 / 措辞黑名单）──► insight_cards 表（缓存 + 留痕）
                     ▼
        前端 InsightDeck：L1 一句话 → L2 置信度+指标 → L3 证据链（懒加载）
```

**约束 1：LLM 不做算术。** 所有数字（成功率、MTTR、分位、六维分）由 Python 算好后作为输入给模型，模型只输出「这意味着什么 / 该怎么办」。这一条同时解决幻觉、复现性、成本三个问题。

**约束 2：无证据不成卡。** 结论卡的每个 `evidence[].ref` 必须命中 `feature_pack.evidence_pool` 里的 id，否则整卡丢弃。这让「展开看证据」在产品上永远不会空。

**约束 3：一屏文字预算 180 字。** 教师首屏只读结论句与数字，长文本一律折叠在 L3。写不进 40 字的结论，说明分析没做完，不是文字不够。

**反面清单（明确不做）**：摄像头/麦克风注意力检测、情绪识别、全量按键记录、剪贴板监听、学生公开排名榜、学业成绩预测（「预测该生中考 XX 分」类输出直接进黑名单）。

---

#### ① 数据面：采什么、怎么存、怎么不把埋点写崩

### 1.1 事件字典（`learning_events.event_type`）

现有 `ct_event` 只有 `run/error/fix/ai_help/role_switch/save/edit`，扩到 6 类 24 个：

| 类别 | event_type | 关键 payload 字段 | 支撑的分析 |
|---|---|---|---|
| 代码演进 | `edit_burst` | `lines_added/removed`、`struct_delta{def,loop,if,var}`、`burst_ms` | 分解、抽象 |
| | `code_snapshot` | `hash`、`loc`、`cyclomatic`、`ident_quality`(非 a/b/tmp 标识符占比) | 抽象、算法 |
| | `ai_code_inserted` | `lines`、`source_msg_id`、`edited_after`(bool) | **自主性（核心）** |
| | `blockly_change` | `block_type`、`group_count` | 低龄段分解 |
| 运行/报错/修复 | `run` | `lang`、`sandbox`、`duration_ms`、`status` | 算法 |
| | `error` | `error_type`、`error_line`、`msg_hash`、`is_repeat_of` | 调试 |
| | `fix` | `error_ref`、`ttr_ms`、`fix_kind`(self/ai_hint/ai_code)、`diff_lines` | **调试 MTTR（核心）** |
| | `testcase_result` | `passed/total`、`first_pass`(bool) | 算法 |
| 对话 | `ai_turn_user` | `intent`(ask_how/ask_why/ask_fix/ask_code/chitchat)、`len`、`has_code` | 元认知 |
| | `ai_turn_assistant` | `persona`(driver/navigator)、`refused_code`(bool)、`len` | 引导有效性 |
| | `socratic_hint` | `hint_id`、`hint_level`(1~3)、`topic` | 苏格拉底采纳 |
| | `socratic_adopted` | `hint_id`、`lag_ms`、`resolved_without_code`(bool) | **采纳率（核心）** |
| | `socratic_forced_on/off` | `by`(student/teacher/policy) | 策略效果对照 |
| | `proactive_question` | `depth`(1 复述/2 追问机制/3 迁移)、`topic` | **主动进阶提问** |
| | `image_gen` / `summary_gen` | `topic`、`accepted` | 使用画像 |
| 错题与纠正 | `wrongnote_created` | `error_type`、`knowledge_tag[]`、`auto`(bool) | 薄弱知识点 |
| | `wrongnote_reviewed` | `note_id`、`redo_result`(pass/fail/skip)、`gap_days` | **元认知** |
| | `behavior_nudge_shown` | `nudge_type`(copy_paste/idle/brute_force/no_test) | 行为纠正 |
| | `behavior_nudge_result` | `nudge_id`、`result`(accepted/dismissed/ignored) | 行为纠正采纳率 |
| 任务/时长 | `task_open` / `task_submit` | `task_id`、`score`、`attempts` | 学情进度 |
| | `focus_in` / `focus_out` | `reason`(blur/idle>90s) | **有效用时**（≠ 在线时长） |
| 协作 | `role_switch` | `to_role`、`by`(self/server/partner) | 结对质量 |

**关键派生量（别存原始，存不了就现算）**
- `有效用时 = Σ(focus_in→focus_out)`，剔除 >90s 静默；教师最怕的就是「在线 40 分钟 = 学了 40 分钟」的假指标。
- `MTTR = median(fix.ttr_ms where fix_kind=self)`，AI 直给代码的修复单独统计，不能算进调试能力。
- `AI 代码依赖度 = Σ ai_code_inserted.lines / Σ edit_burst.lines_added`，>0.45 触发风险卡。
- `重复错误率 = count(error.is_repeat_of ≠ null) / count(error)`。

### 1.2 存储：新建表，**不改老表**（利用「无 Alembic」这一点）

`main.py` 启动 `Base.metadata.create_all` 只建新表、不 ALTER 旧表 —— 所以新增独立表是零迁移成本的，**不要**去动 `LearningMonitor`（动了就得删 `edu_platform.db`）。

`backend/app/models/analytics.py`（新建）：

```python
from sqlalchemy import Column, Integer, String, Text, Float, Boolean, JSON, TIMESTAMP, ForeignKey, Index, text
from app.database import Base


class LearningEvent(Base):
    """细粒度学习事件（追加写，永不 UPDATE）"""
    __tablename__ = "learning_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    class_id = Column(Integer, index=True)          # 冗余，聚合查询免 join
    task_id = Column(Integer, index=True)
    session_id = Column(String(36), index=True)     # 一次上机 = 一个 session
    event_type = Column(String(32), nullable=False)
    payload = Column(JSON)                          # 见事件字典
    client_ts = Column(TIMESTAMP)                   # 客户端时间（可能不准）
    recorded_at = Column(TIMESTAMP, server_default=text("CURRENT_TIMESTAMP"))

    __table_args__ = (
        Index("idx_le_user_time", "user_id", "recorded_at"),
        Index("idx_le_class_type_time", "class_id", "event_type", "recorded_at"),
    )


class InsightCard(Base):
    """AI 结论卡（缓存 + 审核留痕）"""
    __tablename__ = "insight_cards"

    id = Column(Integer, primary_key=True, autoincrement=True)
    scope = Column(String(16), nullable=False)      # student | class
    subject_id = Column(Integer, nullable=False, index=True)
    card_type = Column(String(32), nullable=False)  # profile|strength|weakness|risk|advice|class_common
    window = Column(String(16), default="30d")
    feature_hash = Column(String(64), index=True)   # 特征包指纹 → 命中即复用，不重复烧钱
    payload = Column(JSON, nullable=False)          # 见 ② 的 schema
    confidence = Column(Float)
    audit_status = Column(String(24), default="draft")
    # draft → auto_passed | auto_blocked → teacher_adopted | teacher_rejected | teacher_edited
    audit_note = Column(Text)
    model = Column(String(64))
    generated_at = Column(TIMESTAMP, server_default=text("CURRENT_TIMESTAMP"))

    __table_args__ = (Index("idx_ic_subject", "scope", "subject_id", "card_type"),)


class InsightFeedback(Base):
    """教师对结论的反馈 → 回流做 few-shot 与准确率统计"""
    __tablename__ = "insight_feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
    card_id = Column(Integer, ForeignKey("insight_cards.id", ondelete="CASCADE"), nullable=False)
    teacher_id = Column(Integer, nullable=False)
    verdict = Column(String(16))     # adopt | reject | correct
    corrected_text = Column(Text)
    reason = Column(String(64))      # not_true | not_actionable | privacy | duplicated
    created_at = Column(TIMESTAMP, server_default=text("CURRENT_TIMESTAMP"))
```

### 1.3 前端埋点：把 `useThinkingTracker` 换成批量上报

现在的实现是「一个事件一个 HTTP 请求」，一节课 40 人 × 200 事件 = 8000 请求，必挂。替换为 `CX/web/src/composables/useLearningEvents.ts`：

```ts
import { onScopeDispose } from 'vue'
import api from '@/api/index'
import { useUserStore } from '@/stores/user'

export type EventType =
  | 'edit_burst' | 'code_snapshot' | 'ai_code_inserted' | 'blockly_change'
  | 'run' | 'error' | 'fix' | 'testcase_result'
  | 'ai_turn_user' | 'ai_turn_assistant' | 'socratic_hint' | 'socratic_adopted'
  | 'socratic_forced_on' | 'socratic_forced_off' | 'proactive_question'
  | 'image_gen' | 'summary_gen'
  | 'wrongnote_created' | 'wrongnote_reviewed'
  | 'behavior_nudge_shown' | 'behavior_nudge_result'
  | 'task_open' | 'task_submit' | 'focus_in' | 'focus_out' | 'role_switch'

interface RawEvent { event_type: EventType; payload?: Record<string, unknown>; task_id?: number; client_ts: number }

const buffer: RawEvent[] = []
const SESSION_ID = crypto.randomUUID()
let timer: number | undefined

function flush(useBeacon = false) {
  if (!buffer.length) return
  const batch = buffer.splice(0, buffer.length)
  const body = JSON.stringify({ session_id: SESSION_ID, events: batch })
  if (useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon('/api/v1/analytics/events', new Blob([body], { type: 'application/json' }))
    return
  }
  api.post('/api/v1/analytics/events', JSON.parse(body)).catch(() => {
    // 失败回灌，最多留 500 条，防内存膨胀
    buffer.unshift(...batch.slice(-500))
  })
}

export function useLearningEvents() {
  const user = useUserStore()
  if (!timer) timer = window.setInterval(() => flush(), 5000)
  window.addEventListener('pagehide', () => flush(true), { once: true })

  function track(event_type: EventType, payload: Record<string, unknown> = {}, task_id?: number) {
    if (!user.token) return
    buffer.push({ event_type, payload, task_id, client_ts: Date.now() })
    if (buffer.length >= 20) flush()
  }
  onScopeDispose(() => flush())
  return { track, sessionId: SESSION_ID }
}
```

配套后端 `POST /api/v1/analytics/events`：`{session_id, events[]}` → `bulk_save_objects`，单批上限 200 条、payload 单条 ≤4KB（超限截断并打 `truncated: true`），服务端时间为准（`client_ts` 只留作偏移诊断）。

### 1.4 六维分：把硬编码换成「班级相对分 + 置信度」

替换 `thinking.py` 的 `ct_scores`。原理：先算原始指标 → 在**同班同任务**内取分位（P0–P100）→ 映射到 0–100 → 样本不足直接不出分（返回 `null`，前端画成灰色缺口，绝不编数）。

`backend/app/services/feature_service.py`：

```python
DIMENSIONS = ("decompose", "abstract", "algorithm", "debug", "autonomy", "metacognition")

# 每维 = 若干原始指标的加权分位分；min_n 为出分所需最小样本
DIM_SPEC = {
    "decompose":     {"metrics": [("struct_def_ratio", .4), ("edit_burst_count", .3), ("plan_before_run", .3)], "min_n": 6},
    "abstract":      {"metrics": [("ident_quality", .4), ("reuse_call_ratio", .3), ("loop_refactor_cnt", .3)], "min_n": 6},
    "algorithm":     {"metrics": [("first_pass_rate", .5), ("runs_per_pass_inv", .3), ("testcase_pass_rate", .2)], "min_n": 5},
    "debug":         {"metrics": [("mttr_self_inv", .45), ("repeat_error_rate_inv", .35), ("self_fix_ratio", .2)], "min_n": 5},
    "autonomy":      {"metrics": [("ai_code_dep_inv", .5), ("socratic_solved_wo_code", .3), ("nudge_accept_rate", .2)], "min_n": 8},
    "metacognition": {"metrics": [("proactive_q_depth_avg", .4), ("wrongnote_redo_rate", .4), ("summary_edit_rate", .2)], "min_n": 4},
}

def score_dimension(raw: dict, peer: dict, spec: dict) -> dict:
    """peer = 同班同期的指标分布（已预聚合）。返回 {score, confidence, n, drivers}"""
    n = raw["_n"]
    if n < spec["min_n"]:
        return {"score": None, "confidence": 0.0, "n": n, "reason": "insufficient_data"}
    s, drivers = 0.0, []
    for key, w in spec["metrics"]:
        pct = percentile_of(raw[key], peer[key])      # 0..1
        s += w * pct * 100
        drivers.append({"metric": key, "value": raw[key], "pct": round(pct, 2), "weight": w})
    # 置信度随样本量饱和：n=min_n → 0.5，n=4*min_n → 0.9
    conf = min(0.95, 0.5 + 0.45 * (1 - 2.718 ** (-(n - spec["min_n"]) / spec["min_n"])))
    drivers.sort(key=lambda d: -d["weight"] * d["pct"])
    return {"score": round(s), "confidence": round(conf, 2), "n": n, "drivers": drivers[:3]}
```

> 产品含义：雷达图上「某维缺一角」不是 bug，是**明确告诉老师「这周他没写够代码，不敢下结论」** —— 这比给个假的 62 分有价值得多，也是教研场景可信度的地基。

---

#### ② AI 分析面：5 类结论卡 + prompt 要点 + 输出 schema

### 2.0 统一调用规范

- 复用 `ai_service.py` 的 httpx + `x-api-key` 通道，新增**非流式** `complete_json()`；`temperature=0.2`、`max_tokens=1600`。
- **强制 JSON**：`messages` 末尾追加 assistant 预填 `{"schema_version":"1.0",` ，模型只能续写 JSON；解析失败重试 1 次（把解析错误回灌），二次失败 → 走规则模板卡并标 `generated_by: "rule"`。
- **输入只给 feature_pack，不给原始代码/对话全文**。需要引用原文时，模型引用 `evidence_id`，前端展开时再由后端按权限取原文。
- 缓存键 `feature_hash = sha256(canonical_json(feature_pack))`，命中直接返回，教师手动「重新分析」限流 3 次/生/天。

**feature_pack（喂给 LLM 的全部输入，示例已脱敏）**

```json
{
  "subject": {"pseudonym": "stu_7f3a91c2", "grade": "初一", "lang": "python", "window": "2026-06-25..2026-07-25"},
  "volume": {"sessions": 9, "effective_minutes": 214, "runs": 168, "tasks_done": 11},
  "dimensions": {
    "decompose": {"score": 71, "confidence": 0.78, "n": 22, "drivers": [{"metric":"struct_def_ratio","value":0.34,"pct":0.72}]},
    "abstract": {"score": 44, "confidence": 0.71, "n": 19, "drivers": [{"metric":"ident_quality","value":0.21,"pct":0.18}]},
    "algorithm": {"score": 63, "confidence": 0.8, "n": 31},
    "debug": {"score": 38, "confidence": 0.83, "n": 27, "drivers": [{"metric":"mttr_self_inv","value":486000,"pct":0.12}]},
    "autonomy": {"score": 29, "confidence": 0.86, "n": 41, "drivers": [{"metric":"ai_code_dep_inv","value":0.58,"pct":0.09}]},
    "metacognition": {"score": null, "confidence": 0, "n": 2, "reason": "insufficient_data"}
  },
  "signals": {
    "ai_code_dependency": 0.58, "class_median_dependency": 0.21,
    "mttr_self_ms": 486000, "class_median_mttr_ms": 132000,
    "repeat_error_rate": 0.41,
    "top_error_types": [{"type":"IndentationError","cnt":14},{"type":"IndexError","cnt":9}],
    "socratic_adopt_rate": 0.22, "socratic_forced_share": 0.0,
    "wrongnote_redo_rate": 0.1, "proactive_questions": 1,
    "trend_7d_vs_prev": {"debug": -9, "autonomy": -13}
  },
  "evidence_pool": [
    {"id":"ev_1","kind":"metric","label":"AI 代码插入占新增代码 58%","value":0.58},
    {"id":"ev_2","kind":"error","label":"IndексError 连续 3 次未修复","ts":"2026-07-21T10:14:00","event_id":88412},
    {"id":"ev_3","kind":"dialog","label":"3 次要求「直接给完整代码」被领航员拒绝后停止提问","event_ids":[88510,88533,88566]},
    {"id":"ev_4","kind":"code_diff","label":"task#31 中 11 行由 AI 插入后未做任何修改","event_id":88602},
    {"id":"ev_5","kind":"wrongnote","label":"错题本 6 条，仅 1 条重做","note_ids":[12,17]}
  ]
}
```

### 2.1 卡片输出通用 schema（所有卡共用外壳）

```json
{
  "schema_version": "1.0",
  "generated_by": "llm",
  "cards": [
    {
      "id": "c_local_1",
      "type": "profile | strength | weakness | risk | advice | class_common",
      "title": "≤12 字标题",
      "one_liner": "≤40 字结论句，必须含一个具体数字或行为，禁止形容词堆砌",
      "confidence": 0.0,
      "severity": "info | notice | warn | high",
      "dimension": "autonomy",
      "evidence": [{ "ref": "ev_1", "why": "≤20 字：这条证据如何支持结论" }],
      "actions": [{ "text": "≤24 字教师可执行动作", "kind": "in_class | assign | one_on_one | policy", "target": "socratic_force | task_pack | pair_switch" }],
      "uncertainty": "≤24 字：什么情况下这个结论会不成立"
    }
  ]
}
```

**硬性字段规则写进 prompt**：`one_liner` 必须含数字或可观察行为；`evidence` ≥1 且 ref 必须来自 `evidence_pool`；`actions` 1–3 条且必须是老师明天能做的动作（禁止「加强练习」「提高兴趣」这类）；`uncertainty` 必填（这个字段是防「AI 一本正经胡说」的最有效结构约束）。

### 2.2 五类卡的 prompt 设计要点

#### A. 学习画像卡 `profile`（1 张，一句话总结 + 学习者类型）

- **要点**：给定 8 个预设类型标签让模型**选择**而非自由发挥 —— `探索型 / 依赖型 / 试错型 / 谨慎型 / 结构型 / 半途型 / 追问型 / 数据不足`；要求同时输出「像什么样的搭档」的一句人话（教师最爱转述给家长的那句）。
- **额外字段**：

```json
{ "type":"profile", "learner_type":"依赖型",
  "one_liner":"能读懂题、动手快，但 58% 的代码由 AI 直接插入，独立调试尚未起步",
  "portrait_for_parent":"≤50 字家长可读版，中性措辞，不含比较级",
  "dimension_summary":[{"dim":"decompose","verdict":"高于班级中位"},{"dim":"metacognition","verdict":"数据不足"}] }
```

- **反幻觉**：把 `dimensions.*.score = null` 的维度显式列在 prompt 里，规则写死「score 为 null 的维度只能输出『数据不足』，不得推断」。

#### B. 优势/薄弱维度卡 `strength` / `weakness`（各 1–2 张）

- **要点**：只允许从六维中选，且必须引用该维的 `drivers`（分位）作为证据；薄弱卡必须指出**行为原因**而非维度名重复（错误示范：「调试能力弱」；正确示范：「报错后平均 8 分钟才改第一行，且 41% 是同一个错误重犯」）。
- **额外字段**：`"driver_metric": "mttr_self_inv"`、`"gap_vs_class": -0.38`（分位差）。
- 薄弱卡的 `actions` 强制 `kind` 至少含一个 `assign`（挂具体题包/知识点标签），否则视为不可执行 → 审核降级。

#### C. 风险预警卡 `risk`（0–2 张，默认最高审核等级）

- 触发前置（**由 Python 判定，LLM 只写文案**，避免模型自行「诊断」）：
  - `ai_code_dependency > 0.45 且 > 2×班级中位` → 依赖风险
  - `repeat_error_rate > 0.35 且 mttr > 2×班级中位` → 卡壳风险
  - `effective_minutes 环比 ↓50% 且 tasks_done ↓` → 掉队风险
  - `socratic_adopt_rate < 0.15 且 ai_turn_user.intent=ask_code 占比 > 0.5` → 绕过引导风险
- **要点**：prompt 明确「你不是医生也不是心理咨询师」，禁止任何生理/心理/家庭/智力归因；`severity` 由触发规则决定，模型不得修改（后端覆写）。
- **额外字段**：`"trigger_rule": "ai_dep_gt_045"`、`"suggested_visibility": "teacher_only"`（风险卡**永不下发学生端**）。

#### D. 个性化建议卡 `advice`（1–2 张）

- **要点**：建议必须绑定平台可执行开关，`target` 只能取枚举：`socratic_force`（为该生开启强制苏格拉底）、`task_pack`（挂题包）、`pair_switch`（换结对搭档/角色）、`hint_level`（下调提示等级）、`wrongnote_push`（推送错题重做）、`one_on_one`（线下面谈）。
- **额外字段**：`"expected_signal": {"metric":"ai_code_dependency","direction":"down","check_after_days":7}` —— 这一条让建议变成**可验证实验**，两周后系统自动回访「上次建议是否奏效」，直接支撑「苏格拉底证据驱动迭代」的产品叙事。

#### E. 班级共性问题卡 `class_common`（教研板块，3–5 张）

- 输入换成 class_feature_pack：每个知识点/错误类型的 `affected_ratio`、`班级 MTTR 分布`、`题目通过率排序`、`分位分层（前 25% / 中 50% / 后 25%）三层的差异指标`。
- **要点**：要求输出「共性 vs 个别」的判断（`affected_ratio ≥ 0.3` 才算共性），并给**教学动作**（下节课讲什么、用哪道题当例题），而不是给学生名单。
- **额外字段**：`"affected_ratio": 0.42`、`"cohort": "bottom_25 | all | top_25"`、`"teaching_move": "≤30 字课堂动作"`、`"exemplar_task_id": 31`。
- **k-匿名硬约束**：`affected_n < 5` 的共性卡直接不生成（写进 Python 过滤，不依赖模型自觉）。

### 2.3 prompt 骨架（与现有 `ai_service.py` 的 XML 风格保持一致）

```python
INSIGHT_SYSTEM = """你是 K12 信息科技教研数据分析师，服务对象是一线信息科技教师。
<hard_rules>
1. 【禁止算术】feature_pack 中的所有数字已由系统算好。你不得计算、推算、修正任何数字，只能引用。
2. 【证据强制】每张卡的 evidence[].ref 必须是 evidence_pool 中存在的 id。找不到证据的结论直接不要输出。
3. 【数据不足即沉默】dimensions 中 score 为 null 的维度，只能表述为"数据不足"，禁止任何推断。
4. 【禁止贴标签】禁止使用：笨、差生、懒、多动、注意力缺陷、自闭、抑郁、智力、天赋、没救、放弃。
   禁止任何医学、心理疾病、家庭背景、经济状况的归因。
5. 【可执行】actions 必须是教师明天上课就能做的动作，且 target 只能取给定枚举。
   禁止输出"加强练习""培养兴趣""多加辅导"这类无法执行的建议。
6. 【字数】title ≤12 字，one_liner ≤40 字且必须含一个数字或可观察行为，uncertainty 必填。
7. 【只输出 JSON】不要 markdown 代码块，不要任何解释性文字。
</hard_rules>
<output_schema>{schema}</output_schema>"""

INSIGHT_USER = """<feature_pack>{pack}</feature_pack>
<task>生成 {card_types} 类型的结论卡，共 {n} 张，按对教师的重要性降序。</task>"""
```

**Few-shot 回流**：从 `insight_feedback` 取该教师近 20 条 `verdict='adopt'` 的卡作为正例、`verdict='reject' & reason='not_actionable'` 的 3 条作为负例，插到 user 消息前 —— 让「这位老师喜欢什么口径」随使用变准，这是留存点。

### 2.4 审核三闸（`insight_service.audit()`）

| 闸 | 检查 | 不通过 |
|---|---|---|
| G1 结构 | JSON schema、字数、枚举、`actions` 非空 | 整卡丢弃（记 `auto_blocked`） |
| G2 证据 | 每个 `ref` 命中 `evidence_pool`；`risk` 卡的 `trigger_rule` 与 Python 判定一致 | 整卡丢弃 |
| G3 措辞 | 黑名单正则（贴标签词/医学词/比较级人身评价/含真实姓名或手机号）+ 「预测分数」句式 | 降级为规则模板卡，`audit_status='auto_blocked'` 并留原文供管理员审计 |

通过 → `auto_passed`。前端对 `auto_passed` 的卡显示「AI 生成 · 待确认」角标，教师点「采纳」后变 `teacher_adopted`，此后才允许进入导出与家长可读版。**没被教师采纳的 AI 结论不进任何对外文档** —— 这是给学校的合规承诺，也是销售话术。

---

#### ③ 前端呈现：结论先行 + 证据折叠

### 3.1 路由与文件（V2「教研」板块）

```
/admin/research/insights            ClassInsights.vue     班级结论流（共性问题）
/admin/research/profile/:sid        StudentProfile.vue    学生画像一屏（本方案主屏）
/admin/research/evidence/:cardId    EvidenceFull.vue      证据全屏（deep link，教研可分享）
/admin/research/export              MaskedExport.vue      脱敏导出
/admin/report/:id  →  redirect to /admin/research/profile/:id   // 老路由保留重定向
```

新增目录 `CX/web/src/components/insight/`：
`InsightCard.vue`、`InsightDeck.vue`、`EvidenceChain.vue`、`EvidenceItem.vue`、`ConfidenceMeter.vue`、`RadarSix.vue`、`BehaviorPathStrip.vue`、`SessionTimeline.vue`、`ProfileHero.vue`、`InsufficientData.vue`。
类型集中在 `CX/web/src/types/analytics.ts`，API 在 `CX/web/src/api/analytics.ts`。

### 3.2 三层渐进披露（L1/L2/L3）

| 层 | 内容 | 触发 | 数据 |
|---|---|---|---|
| L1 | 一句话结论 + 类型色点 + 置信环 | 默认渲染 | 随 profile 一次拉回 |
| L2 | 驱动指标条（本人 vs 班级中位）+ 建议按钮 | 卡片 hover / 聚焦 | 同上（已在 payload） |
| L3 | 证据链（事件/代码 diff/对话片段/错题） | 点击「看证据 N」 | **懒加载** `GET /insight/{id}/evidence` |

L3 懒加载是隐私设计的一部分：原始对话与代码只在教师**主动展开且有权限**时才离开数据库，日志里能看到「谁在什么时候看了谁的什么」。

### 3.3 `InsightCard.vue`（可直接落库的实现）

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import type { InsightCardData, EvidenceItem } from '@/types/analytics'
import { analyticsApi } from '@/api/analytics'
import ConfidenceMeter from './ConfidenceMeter.vue'
import EvidenceChain from './EvidenceChain.vue'

const props = withDefaults(defineProps<{
  card: InsightCardData
  /** 教师可否操作（教研只读视图传 false） */
  actionable?: boolean
  /** 一屏内并排时压缩留白 */
  density?: 'comfy' | 'compact'
}>(), { actionable: true, density: 'comfy' })

const emit = defineEmits<{
  (e: 'apply', payload: { cardId: number; target: string }): void
  (e: 'verdict', payload: { cardId: number; verdict: 'adopt' | 'reject' | 'correct' }): void
  (e: 'focus-evidence', evidence: EvidenceItem): void   // 联动时间线高亮
}>()

const open = ref(false)
const evidence = ref<EvidenceItem[] | null>(null)
const loading = ref(false)

const tone = computed(() => ({
  strength: 'tone-good', weakness: 'tone-warn', risk: 'tone-risk',
  advice: 'tone-info', profile: 'tone-brand', class_common: 'tone-info',
}[props.card.type]))

async function toggle() {
  open.value = !open.value
  if (open.value && !evidence.value) {
    loading.value = true
    try { evidence.value = (await analyticsApi.getEvidence(props.card.id)).data }
    finally { loading.value = false }
  }
}
</script>

<template>
  <article :class="['insight-card', tone, density, { open }]" :aria-expanded="open">
    <header class="ic-head">
      <span class="ic-dot" aria-hidden="true" />
      <h4 class="ic-title">{{ card.title }}</h4>
      <ConfidenceMeter :value="card.confidence" :n="card.sample_n" />
      <span v-if="card.audit_status === 'auto_passed'" class="ic-badge">AI · 待确认</span>
    </header>

    <!-- L1：唯一必读的一句话 -->
    <p class="ic-oneliner">{{ card.one_liner }}</p>

    <!-- L2：驱动指标（本人 vs 班级中位） -->
    <div v-if="card.drivers?.length" class="ic-drivers">
      <div v-for="d in card.drivers" :key="d.metric" class="ic-driver">
        <span class="ic-driver-label">{{ d.label }}</span>
        <span class="ic-bar"><i :style="{ width: d.pct * 100 + '%' }" /><b :style="{ left: d.class_pct * 100 + '%' }" /></span>
        <span class="ic-driver-val">{{ d.display }}</span>
      </div>
    </div>

    <footer class="ic-foot">
      <button class="ic-link" @click="toggle">
        {{ open ? '收起证据' : `看证据 ${card.evidence_count}` }}
      </button>
      <template v-if="actionable">
        <button v-for="a in card.actions" :key="a.target" class="ic-act"
                @click="emit('apply', { cardId: card.id, target: a.target })">{{ a.text }}</button>
        <span class="ic-spacer" />
        <button class="ic-ghost" @click="emit('verdict', { cardId: card.id, verdict: 'adopt' })">采纳</button>
        <button class="ic-ghost" @click="emit('verdict', { cardId: card.id, verdict: 'reject' })">不准确</button>
      </template>
    </footer>

    <!-- L3：证据链（懒加载 + 无 JS 高度动画） -->
    <div class="ic-evi" :class="{ open }">
      <div>
        <EvidenceChain v-if="evidence" :items="evidence" @focus="e => emit('focus-evidence', e)" />
        <p v-else-if="loading" class="ic-skeleton">正在取证…</p>
      </div>
    </div>

    <p v-if="open && card.uncertainty" class="ic-uncertainty">⚠ {{ card.uncertainty }}</p>
  </article>
</template>

<style scoped>
/* 折叠动画：0fr→1fr，无需测高、无需动效库，与玻璃拟态的模糊层不冲突 */
.ic-evi { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .42s cubic-bezier(.22,1,.36,1); }
.ic-evi.open { grid-template-rows: 1fr; }
.ic-evi > div { overflow: hidden; }
@media (prefers-reduced-motion: reduce) { .ic-evi { transition: none; } }

.insight-card {
  position: relative; padding: var(--sp-5);
  background: var(--glass-bg); backdrop-filter: blur(18px) saturate(140%);
  border: 1px solid var(--glass-border); border-radius: var(--radius-tile);
  box-shadow: var(--shadow-tile);
  transition: transform .3s cubic-bezier(.22,1,.36,1), box-shadow .3s;
}
.insight-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-tile-hover); }
.insight-card.compact { padding: var(--sp-4); }
.ic-oneliner { font-size: 17px; line-height: 1.5; font-weight: 600; color: var(--text-1); margin: var(--sp-2) 0 var(--sp-3); }
.ic-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--tone); }
.tone-good { --tone: var(--c-success); } .tone-warn { --tone: var(--c-warn); }
.tone-risk { --tone: var(--c-danger); } .tone-info { --tone: var(--c-blue); } .tone-brand { --tone: var(--c-purple); }
.ic-bar { position: relative; flex: 1; height: 6px; border-radius: 3px; background: var(--fill-2); }
.ic-bar i { position: absolute; inset: 0 auto 0 0; border-radius: 3px; background: var(--tone); transition: width .6s cubic-bezier(.22,1,.36,1); }
.ic-bar b { position: absolute; top: -3px; width: 2px; height: 12px; background: var(--text-3); }  /* 班级中位刻度 */
.ic-uncertainty { margin-top: var(--sp-3); font-size: 12px; color: var(--text-3); }
</style>
```

`ConfidenceMeter.vue` 直接包 `RingProgress`：环形填充 = confidence，环心显示 `n=27`；`confidence < 0.5` 时环变虚线 + tooltip「样本较少，仅供参考」。

**「看证据 N」按钮上的数字是这条链路的产品灵魂**：教师第一次点开发现真能看到 2026-07-21 那次 `IndexError` 的原始报错和当时的代码 diff，AI 结论才从「玄学」变成「可核查」。

### 3.4 `EvidenceChain.vue` 的四种证据渲染

| kind | 渲染 | 交互 |
|---|---|---|
| `metric` | 数字 + 对比条 + 「同班中位 X」 | 点击 → 跳 L2 指标 |
| `event` / `error` | 时间戳 + 事件胶囊 + 报错首行（等宽字体，≤2 行） | 点击 → `emit('focus')` 时间线滚动并高亮 |
| `code_diff` | 折叠 diff（默认只显示 ±3 行上下文，`highlight.js` 已在依赖里） | 「查看完整代码」二次确认（记审计日志） |
| `dialog` | 对话气泡片段，最多 2 轮，学生消息**默认打码人名/联系方式** | 「查看完整对话」需 `scope=teaching` 权限 |
| `wrongnote` | 错题卡缩略 + 知识点 tag + 重做状态 | 点击 → 推送重做 |

---

#### ④ 学生画像一屏：六维雷达 + 行为路径 + 时间线 + AI 一句话

### 4.1 版式（1440×900 无滚动可读，12 列 bento）

```
┌─ ProfileHero  (col 1-12, h 104)  头像 · 姓名 · 类型徽章 · AI 一句话总结 · 风险徽章 · 窗口切换(7d/30d/学期) ┐
├─ RadarSix     (col 1-4,  h 320) │ InsightDeck (col 5-12, h 320)  横滑 3 张卡：优势 / 薄弱 / 风险或建议  │
├─ BehaviorPathStrip (col 1-12, h 96)  一条时间轴带：事件色块流 + 密度 + 卡壳段红色底纹                     │
├─ 折叠区（默认收起，点击展开推入第二屏）：SessionTimeline / 错题本 / 代码演进回放 / 全部结论卡            │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

```css
.profile-grid{
  display:grid; grid-template-columns:repeat(12,1fr);
  grid-template-rows:104px 320px 96px auto; gap:var(--sp-4);
  max-width:1440px; margin:0 auto; padding:var(--sp-5);
}
@media (max-width:1180px){ .profile-grid{grid-template-rows:auto} .radar{grid-column:1/-1} .deck{grid-column:1/-1} }
```

### 4.2 `ProfileHero`：AI 一句话总结的写法

```
[头像] 学生A · 初一(3)班 · 依赖型          [置信 0.82 ▮▮▮▮▯]   [⚠ 依赖风险]
"能读懂题、动手快，但 58% 的代码由 AI 直接插入，独立调试尚未起步。"
                                        近 30 天 · 有效用时 214 分钟 · 9 次上机 · 11 个任务
```

- 一句话来自 `profile` 卡的 `one_liner`，**字号 22px/600，是整屏唯一的大字**。
- 右侧「有效用时」用的是 focus 时长而非在线时长，hover 出 tooltip 说明口径 —— 教师对这个口径极敏感。
- 风险徽章点击 → 直接滚动并展开对应 risk 卡（`scrollIntoView` + 自动 `open=true`）。

### 4.3 `RadarSix`（ECharts，已在依赖里）

```ts
const option = {
  radar: {
    indicator: DIMS.map(d => ({ name: d.label, max: 100 })),
    splitNumber: 4, axisName: { color: 'var(--text-2)', fontSize: 12 },
    splitArea: { areaStyle: { color: ['rgba(255,255,255,.04)', 'transparent'] } },
  },
  series: [{
    type: 'radar',
    data: [
      { name: '班级中位', value: classMedian, lineStyle: { type: 'dashed', color: '#9AA' }, areaStyle: { opacity: .06 }, symbol: 'none' },
      { name: '本人',   value: mine,        areaStyle: { opacity: .28 }, symbolSize: 5 },
    ],
  }],
}
```

- **缺口即真相**：`score === null` 的维度传 `null`（ECharts 断线），并在该轴角标处渲染一个灰色 `InsufficientData` 小徽章「样本 2/4」。
- 点击某个轴 → 该维对应的 InsightCard 高亮抖动一下并自动展开 L2（`InsightDeck` 暴露 `focusDimension(dim)`）。
- 六维只在**同班同期**内比较；跨班比较入口关闭（避免变成班级排名工具）。

### 4.4 `BehaviorPathStrip`：一条带子看完一节课

- 横向 SVG，x 轴 = 时间（按 session 分段），每个事件一个 4px 色块：编辑=灰、运行=蓝、报错=红、修复=绿、AI 求助=紫、苏格拉底采纳=金、空闲=透明。
- **模式识别叠加层**（Python 侧预标注，前端只画）：
  - `卡壳段`：连续 ≥3 个红块且无绿块 → 红色半透底纹 + 「卡壳 8′」标签
  - `依赖段`：紫块后紧跟大段灰块（AI 插入后直接跑通）→ 紫色斜纹
  - `良性循环段`：红→绿→蓝密集交替 → 绿色底纹「自主调试 ✓」
- 悬停显示 tooltip，点击滚动 `SessionTimeline` 到该处。**这是老师最容易看懂的一张图** —— 不需要解释「六维分」是什么，红底纹就是「他在这儿卡住了」。

### 4.5 `SessionTimeline`（折叠区）

按 session 分组的虚拟列表（只渲染视口 ±10 条），每行：`时间 · 事件胶囊 · 一行摘要 · [代码/对话] 展开`。支持 `?focus=ev_2` deep link（从证据链跳进来自动定位高亮 1.2s 脉冲）。

### 4.6 API 契约

```ts
// CX/web/src/api/analytics.ts
export const analyticsApi = {
  batchEvents: (body: { session_id: string; events: RawEvent[] }) =>
    api.post('/api/v1/analytics/events', body),

  getProfile: (sid: number, window: '7d' | '30d' | 'term' = '30d') =>
    api.get(`/api/v1/analytics/student/${sid}/profile`, { params: { window } }),   // hero + 六维 + cards(L1/L2) + path

  getEvidence: (cardId: number) =>
    api.get(`/api/v1/analytics/insight/${cardId}/evidence`),                        // L3，懒加载 + 审计日志

  getTimeline: (sid: number, params: { cursor?: number; limit?: number }) =>
    api.get(`/api/v1/analytics/student/${sid}/timeline`, { params }),

  regenerate: (sid: number) =>
    api.post(`/api/v1/analytics/student/${sid}/insights:regenerate`),               // 限流 3/天

  feedback: (cardId: number, body: { verdict: 'adopt' | 'reject' | 'correct'; reason?: string; corrected_text?: string }) =>
    api.post(`/api/v1/analytics/insight/${cardId}/feedback`, body),

  applyAction: (cardId: number, target: string) =>
    api.post(`/api/v1/analytics/insight/${cardId}/apply`, { target }),              // 落成真实策略：开强制苏格拉底/派题包

  classInsights: (cid: number, window = '30d') =>
    api.get(`/api/v1/analytics/class/${cid}/insights`, { params: { window } }),

  exportMasked: (cid: number, fmt: 'csv' | 'xlsx' = 'csv') =>
    api.get(`/api/v1/analytics/export/class/${cid}`, { params: { fmt, masked: true } }),
}
```

`GET .../profile` 返回体（教师端一屏所需，一次拉完，目标 <400KB）：

```json
{ "code":0, "message":"ok", "data":{
  "student": {"id":12,"display_name":"李**","class_name":"初一(3)班","avatar":"..."},
  "window": {"key":"30d","from":"2026-06-25","to":"2026-07-25","effective_minutes":214,"sessions":9,"tasks_done":11},
  "hero": {"learner_type":"依赖型","one_liner":"…","confidence":0.82,"risk_badges":[{"type":"ai_dependency","severity":"warn"}]},
  "radar": {"dims":[{"key":"decompose","label":"分解","score":71,"class_median":64,"confidence":0.78,"n":22}, {"key":"metacognition","label":"元认知","score":null,"n":2,"reason":"insufficient_data"}]},
  "cards": [ /* InsightCardData[]，含 drivers、evidence_count，不含 evidence 正文 */ ],
  "path": {"segments":[{"session_id":"...","start":"...","blocks":[{"t":0,"type":"error","dur":12}],"marks":[{"kind":"stuck","from":420,"to":900,"label":"卡壳 8′"}]}]},
  "generated_at":"2026-07-25T09:12:00Z","stale":false }}
```

**降级路径**：LLM 不可用 → `cards` 由规则模板生成，`generated_by:"rule"`，前端角标显示「规则生成」且隐藏「采纳」按钮（规则结论不进档案）。确定性部分（雷达/路径/时间线）永远可用，教师端不会因为 AI 挂了而白屏 —— 这条是校园私有化部署的硬需求。

### 4.7 动效（不引依赖也能高级）

- 卡片进场：`animation-timeline: view()` 渐显上浮，不支持则 IntersectionObserver + CSS class 兜底，`stagger` 用 `--i` 变量延迟。
- 雷达数值：ECharts `animationDuration: 700, animationEasing: 'cubicOut'`，切换窗口用 `setOption(opt, { notMerge: false })` 形变而非重绘。
- 展开证据：上文 `0fr→1fr` grid 动画；若浏览器支持 `document.startViewTransition`，把「卡片 → 证据全屏」做成 View Transition（`view-transition-name: card-{id}`）。
- 全站 `@media (prefers-reduced-motion: reduce)` 关闭位移与模糊变化 —— 未成年人产品的无障碍底线。

---

#### ⑤ 隐私红线（未成年人数据，按合规优先级排序）

### 5.1 采集侧：最小必要

- **禁采**：摄像头/麦克风/屏幕截图/剪贴板内容/浏览器其他标签页/全量按键流/地理位置/设备通讯录。
- 只采「本平台 IDE 与对话内产生的学习行为」，且 `payload` 白名单字段化（不是把整个对象往里塞）。
- 学生端有可见的「学习记录说明」入口（一句话讲清采什么、给谁看、留多久），学校可在 `Settings` 里关闭「代码原文留存」（关闭后 `code_diff` 证据降级为结构摘要）。

### 5.2 出境到 LLM 前：`privacy.scrub()`

```python
import re, hashlib
from app.config import settings

PII = [
    (re.compile(r"1[3-9]\d{9}"), "[手机]"),
    (re.compile(r"[1-9]\d{5}(19|20)\d{2}[01]\d[0-3]\d\d{3}[\dXx]"), "[身份证]"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[邮箱]"),
    (re.compile(r"(QQ|qq|微信|weixin|wx)[:：]?\s*[\w-]{5,}"), "[社交账号]"),
]

def pseudonym(user_id: int) -> str:
    return "stu_" + hashlib.sha256(f"{settings.SECRET_KEY}:{user_id}".encode()).hexdigest()[:8]

def scrub(text: str, name_dict: set[str]) -> str:
    for pat, rep in PII:
        text = pat.sub(rep, text)
    for n in name_dict:            # 班级花名册 + 教师名，含代码注释与变量名里的真名
        if len(n) >= 2:
            text = text.replace(n, "[姓名]")
    return text[:2000]             # 单条证据摘要硬截断
```

- 送 LLM 的 `feature_pack` **只有 `pseudonym`**，没有姓名、学号、班级名（只有 `grade`）、没有代码原文、没有对话全文（只有 ≤40 字的 `evidence.label`）。
- 真名映射只发生在**前端渲染**（后端返回 `display_name` 已按查看者权限脱敏）。
- LLM 请求体不落盘日志；`obs.py` 的结构化日志对 `feature_pack` 只记 `feature_hash` 与 token 数。

### 5.3 可见范围矩阵（`require_scope` 依赖注入实现）

| 角色 | 学生真名 | 六维/路径 | 对话原文 | 代码原文 | 风险卡 | 跨班 | 导出 |
|---|---|---|---|---|---|---|---|
| 任课教师（本班） | ✅ | ✅ | ✅（记审计） | ✅（记审计） | ✅ | ❌ | 脱敏 |
| 教研角色 | ❌ 仅 `stu_xxxx` | ✅ 聚合 | ❌ | ❌ 仅结构摘要 | 聚合计数 | ✅ 聚合 | 脱敏 |
| 校管理员 | ❌ | ✅ 聚合 | ❌ | ❌ | 聚合计数 | ✅ | 脱敏 |
| 学生本人 | ✅ | ✅（正向版） | 自己的 | 自己的 | **不可见** | ❌ | ❌ |
| 家长（如开放） | ✅ | 仅 `portrait_for_parent` | ❌ | ❌ | ❌ | ❌ | ❌ |

- **k-匿名**：任何聚合视图（教研/班级共性）分组人数 `n < 5` 一律不展示，返回「样本不足」。
- **学生本人视图的「正向版」**：只展示 `strength` 与 `advice` 卡，`weakness` 改写为「下一步可以练什么」，`risk` 卡完全不下发。产品上这一条决定了学生端会不会被当成「监控软件」。
- **审计日志**：`GET /insight/{id}/evidence`、`查看完整代码/对话`、`导出` 三个动作写 `audit_log(actor, action, subject, ts, ip)`，管理员可查、可导出给学校。

### 5.4 AI 输出审核（除 ② 的三闸外的运营侧）

- **贴标签黑名单**（正则 + 词表，中英文）：笨/蠢/差生/懒/没救/放弃/智商/天赋/多动症/ADHD/自闭/抑郁/焦虑症/家庭原因/父母离异 + 任何「预测…分数/名次」句式 + 「最差的学生」类最高级比较。
- **风险卡默认不可分享**：`suggested_visibility: teacher_only`，导出与家长版一律剔除。
- **人在环上**：AI 卡默认 `待确认` 角标；未被 `teacher_adopted` 的结论不能出现在任何导出物、家长报告、学期档案里。
- **可反驳**：每张卡都有「不准确」按钮 + 原因枚举，反馈进 `insight_feedback`，管理员看板展示「AI 结论采纳率/驳回原因分布」—— 这是向学校证明「我们持续校准」的唯一硬证据。
- **保留期**：原始 `learning_events` 保留至学期结束 +180 天后自动归档为聚合（可在 `Settings` 配置，最短 30 天）；学生转学/毕业触发删除任务；导出文件带水印（导出人 + 时间 + 「脱敏教研用途」）。

---

#### ⑥ 落地清单（按可交付顺序，每步独立可验收）

| # | 工作项 | 文件 | 验收 |
|---|---|---|---|
| 1 | 事件表 + 批量上报 | `models/analytics.py`、`routers/analytics.py`、`composables/useLearningEvents.ts` | 一节课 40 人请求数 <500；重启后表自动建成，旧库不受影响 |
| 2 | IDE/对话埋点接入 | `views/student/IDE.vue`、`components/AIChatPanel.vue` | 24 类事件在 DB 可查；`ai_code_inserted.lines` 与实际插入行数一致 |
| 3 | 特征服务（六维 + 信号 + 证据池） | `services/feature_service.py`、`services/privacy.py` | 同一输入两次运行 `feature_hash` 相同；样本不足维度返回 `null` |
| 4 | 结论服务 + 三闸审核 | `services/insight_service.py` | 注入越权/贴标签样例 100 条，拦截率 100%；证据 id 幻觉 0 漏网 |
| 5 | InsightCard / EvidenceChain / ConfidenceMeter | `components/insight/*` | 每卡可展开 ≥2 条证据；首屏文字 ≤180 字；`prefers-reduced-motion` 生效 |
| 6 | 学生画像一屏 | `views/admin/research/StudentProfile.vue` | 1440×900 无滚动读完 L1+L2；首屏 <1.5s；LLM 故障时降级不白屏 |
| 7 | 班级共性 + 脱敏导出 | `ClassInsights.vue`、`MaskedExport.vue` | `n<5` 不出卡；导出文件无真名、无代码原文、有水印 |
| 8 | 建议闭环回访 | `insight_cards.expected_signal` 定时任务 | 采纳 7 天后自动生成「上次建议效果」卡，含前后指标对比 |

**成本控制**：每生每周 1 次批量生成（离线任务，夜间跑）+ 教师手动重算限流 3/天；`feature_hash` 命中缓存不调模型。40 人班 × 每周 1 次 ≈ 每周 40 次 profile 调用 + 1 次 class 调用，单次 ~3k in / ~1.2k out，成本可忽略，且完全可私有化模型替换（`AI_API_BASE_URL` 已是可配置的 Anthropic 兼容端点）。

**最该先做的一件事**：第 1+2 步的埋点。没有 `ai_code_inserted`、`socratic_adopted`、`fix.ttr_ms` 这三个事件，后面所有 AI 结论都只能重复现在 `thinking.py` 里那套硬编码启发式的空话。


---

## 附录 E · 资源中心（题库/视频/练习集）落地方案

#### 资源中心（题库 / 学习视频 / 练习集）落地方案

> 基线核对（已读源码）：`server/app/store.py`（stdlib sqlite3 + `executescript` + `_lock`）、`auth.py`（`current_user` / role）、`teacher.py`（`_require_teacher` 403 范式）、`ct.py`（六维 `summary_for`）、`executor.py`（**`stdin=DEVNULL`，当前不支持喂输入**）、`research.py`（脱敏导出）、`web/src/styles/tokens.css`、`components/ui/*`（6 原语）、`V2前端升级优化路线-review.md`。
> 本方案全部按 **stdlib sqlite3 / 无 ORM / 无组件库 / 复用玻璃原语** 写，不引任何新依赖。

---

#### ① 信息架构落位

### 结论：放 **教学区**，独立路由 `/teacher/teaching/resources`，页内 3 tab；同时**把「预警」移出侧栏**，教学侧栏维持 6 项

```
教学 teaching（6 项，未超上限）
  今日 today · 班级 classes · 资源 resources · 任务 tasks · 课堂 live · 学情 students
  └ 预警 alerts → 降级为「今日」项角标 + 今日页红点瓷片 + ?peek=alert 抽屉栈（独立路由保留，nav: null）
教研 research（不变，6 项）
  分析 · 洞察 · 课例 · 量表 · 报告 · 导出
```

**为什么必须做这个取舍（而不是简单加第 7 项）**
V2 文档自身有硬约束冲突：§2 的 IA 树把 `resources` 列为教学区第 3 项（共 7 项），但 §1.4 侧边导航写死「**同一时刻侧栏最多 6 项**」。直接加会破 6，且 7 项在 216px 侧栏里会逼出滚动/三级菜单——文档同时禁止三级菜单。所以只能二选一，理由链如下：

| 判据 | 资源 | 预警 |
|---|---|---|
| 是否有完整 CRUD + 编排工作区 | 是（写操作、排序、批量、导入） | 否（只有「处理 / 忽略」两个动作） |
| 有无替代入口 | **无**（备课时无处可去） | 有：今日页红点瓷片 + 课堂页座位红色 + 学情页筛选，三处重复暴露 |
| 页面 signal 密度 | 4（含推送完成率） | 3，全教学区最薄 |
| 对象生命周期 | 长（学期级可复用资产） | 短（事件流，处理完即消失） |
| 交互形态 | 列表 + 抽屉编辑 → 需要**工作区** | 队列 + 证据抽屉 → 天然是 **badge + Peek** |

预警是**事件流**不是**工作区**，事件流的正确形态是角标而不是导航项；资源恰恰相反。降级后预警的干预能力零损失（`?peek=alert` / `?peek=intervene` 抽屉栈原样保留），侧栏还腾出了一格。

**否决的两个替代方案（附代价）**

- **B：不进侧栏，收编为 `tasks` 页的 L1 折叠「备课资源」**（文档 §1.5 的旧写法）。代价：抽屉会到 **3 层**（任务页 → L1 折叠 → 资源抽屉 → 题目编辑抽屉），违反「禁止抽屉套抽屉 / 深度 ≤2」；且把「备课」矮化为「下发」的附属动作，资产复用性在信息架构上被抹掉。可作为 tasks 页的**选择器**复用，但不能是资源的**唯一家**。
- **C：放教研区**。否决：教研区定位是「课后 / 周期性 / dense / 去装饰」，而备课发生在上课前一晚，属教学节奏；且「一键推送给我的班级」依赖教学区的班级上下文。教研区只以**只读引用**出现：`research/analysis` 增加「按题目 / 知识点 / 六维的通过率」维度，`research/cases` 课例正文可引用某个练习集 id。**资产在教学区生产，在教研区被分析** —— 这条分界线也顺带说明了 `resources` 与 `cases`（课例）的区别：前者是**可下发、可判题的可执行资产**，后者是**可阅读的叙事资产**。

### 路由与 meta

```ts
// CX/web/src/router/routes.teacher.ts  → teaching.children 内，插在 classes 与 tasks 之间
{
  path: 'resources',
  name: 'TTResources',
  component: () => import('@/views/teacher/teaching/ResourcesView.vue'),
  meta: {
    nav: '资源', icon: 'tile_template',          // 复用已有素材 key（assets.ts 已含 tile_template.png）
    signal: 4, copyBudget: 60,
    drills: ['exercise', 'video', 'set', 'pushSheet'],   // Peek 白名单，usePeek 校验
    tabs: ['bank', 'video', 'set'],              // 页内 tab，走 ?tab=，默认 bank
  },
},
// 同批修改：alerts 的 meta.nav 由 '预警' 改为 null，badge 迁到 today
{ path: 'alerts', name: 'TTAlerts', component: () => import('@/views/teacher/teaching/AlertsView.vue'),
  meta: { nav: null, backTo: '/teacher/teaching/today', signal: 3, copyBudget: 60,
          drills: ['alert', 'intervene'] } },
{ path: 'today', /* … */ meta: { nav: '今日', icon: 'sun', signal: 4, copyBudget: 90,
          badge: 'alerts.unread', drills: ['alert', 'intervene'] } },
```

**URL 状态契约**（全部可分享、可后退，无布局跳变）

| 状态 | URL |
|---|---|
| 题库 tab + 筛选 | `/teacher/teaching/resources?tab=bank&q=循环&lang=python&d=2&tag=列表&dim=algorithm` |
| 打开题目编辑 | `…&peek=exercise&id=42` |
| 编辑中挑关联视频（第 2 层，到顶） | `…&peek=exercise,video&id=42&id2=7` |
| 推送面板 | `…&peek=pushSheet&rt=set&rid=9` |

层级 ≤3 跳：**区（资源）→ 列表（tab）→ Peek 抽屉**。**明确不给题目 / 视频独立页**（L3 全站只有学生画像、报告、课例三个，不新增）。

---

#### ② 数据模型（stdlib sqlite3，与现有 7 表同风格）

新增 **8 张表**，放 `server/app/store_resources.py`，`init()` 用同款 `with _lock, _conn() as c: c.executescript(...)`，模块底部直接 `init()`（与 `store.py` 末行一致）。

> 三条与现有代码强相关的注意事项：
> 1. `store._conn()` **没有** `PRAGMA foreign_keys=ON`，所以 `ON DELETE CASCADE` 只是文档性的 —— 级联删除必须手写（`store.delete_project` 已是这个写法），下面 store 层照此处理。
> 2. 不用 `json_array_length()` 等 JSON1 函数做列表查询（老 SQLite 可能没编译进来），改用**冗余列** `case_count` / `item_count`，写入时维护。
> 3. 所有用户 id 沿用 `TEXT`（`stu-*` / `tea-*`），时间沿用 `INTEGER` 秒级 —— 与 `ct_events` / `projects` 完全一致，`list_students()` 的 `LIKE 'stu-%'` 逻辑不受影响。

```sql
-- ============ 资源中心 DDL（app/store_resources.py::init）============

-- 1) 题库
CREATE TABLE IF NOT EXISTS exercises(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  summary TEXT,                                  -- 列表用一句话（≤40字）
  statement TEXT,                                -- 完整题面（Markdown）
  language TEXT NOT NULL,                        -- python | cpp | c
  difficulty INTEGER NOT NULL DEFAULT 2,         -- 1入门 2基础 3提高 4挑战
  grade TEXT,                                    -- g7 | g8 | g9，可空
  starter_code TEXT DEFAULT '',
  reference_solution TEXT DEFAULT '',            -- 仅教师可见；学生端接口一律裁掉
  test_cases TEXT NOT NULL DEFAULT '[]',         -- JSON: [{"in":"3 5","out":"8","hidden":0,"score":10}]
  case_count INTEGER NOT NULL DEFAULT 0,         -- 冗余：列表页免解 JSON
  checker TEXT NOT NULL DEFAULT 'trim',          -- exact | trim | float2 | contains
  time_limit_ms INTEGER NOT NULL DEFAULT 5000,
  hints TEXT NOT NULL DEFAULT '[]',              -- JSON 数组：苏格拉底提示阶梯（AI 只能读这个）
  related_video_id INTEGER,                      -- 关联讲解视频
  ct_dims TEXT NOT NULL DEFAULT '{}',            -- JSON: {"decompose":3,"algorithm":5,...} 权重 0-5
  ct_primary TEXT,                               -- 冗余主维，供索引/分组统计
  tags TEXT NOT NULL DEFAULT '[]',               -- JSON 数组（知识点，用于回显）
  status TEXT NOT NULL DEFAULT 'draft',          -- draft | published | archived
  visibility TEXT NOT NULL DEFAULT 'school',     -- private | school
  source_id INTEGER,                             -- 由哪题复制而来
  created_by TEXT NOT NULL,
  created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ex_filter ON exercises(status, language, difficulty);
CREATE INDEX IF NOT EXISTS idx_ex_recent ON exercises(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ex_owner  ON exercises(created_by);
CREATE INDEX IF NOT EXISTS idx_ex_dim    ON exercises(ct_primary);
CREATE INDEX IF NOT EXISTS idx_ex_video  ON exercises(related_video_id);

-- 2) 学习视频
CREATE TABLE IF NOT EXISTS videos(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  summary TEXT,
  source TEXT NOT NULL DEFAULT 'link',           -- link 外链 | upload 本地
  url TEXT NOT NULL,
  poster_url TEXT,
  duration_sec INTEGER DEFAULT 0,
  language TEXT,                                 -- python|cpp|c|none（通识课可空）
  category TEXT,                                 -- 入门|语法|算法|调试|项目|素养
  tags TEXT NOT NULL DEFAULT '[]',
  ct_dims TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft',
  review_state TEXT NOT NULL DEFAULT 'pending',  -- pending|ok|blocked（外链域名白名单审核，未成年人保护）
  created_by TEXT NOT NULL,
  created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_vd_filter ON videos(status, category, language);
CREATE INDEX IF NOT EXISTS idx_vd_recent ON videos(updated_at DESC);

-- 3) 练习集
CREATE TABLE IF NOT EXISTS exercise_sets(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  goal TEXT,                                     -- 教学目标（≤40字，学生端可见）
  language TEXT,
  est_minutes INTEGER DEFAULT 0,
  item_count INTEGER NOT NULL DEFAULT 0,         -- 冗余计数，列表免 JOIN
  ct_dims TEXT NOT NULL DEFAULT '{}',            -- 由 set_items 聚合回填（六维覆盖雷达）
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT NOT NULL,
  created_at INTEGER, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_set_owner ON exercise_sets(created_by, updated_at DESC);

-- 4) 集内条目（拖拽排序的落点）
CREATE TABLE IF NOT EXISTS set_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id INTEGER NOT NULL,
  item_type TEXT NOT NULL,                       -- exercise | video
  ref_id INTEGER NOT NULL,
  position INTEGER NOT NULL,                     -- 0 起，整体重排
  required INTEGER NOT NULL DEFAULT 1,
  note TEXT,                                     -- 教师给这一步的一句话（≤20字）
  FOREIGN KEY(set_id) REFERENCES exercise_sets(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_si_uniq  ON set_items(set_id, item_type, ref_id);
CREATE INDEX        IF NOT EXISTS idx_si_order ON set_items(set_id, position);

-- 5) 标签倒排（多标签 AND 筛选 + facet 计数；避免对 tags JSON 做 LIKE）
CREATE TABLE IF NOT EXISTS resource_tags(
  res_type TEXT NOT NULL,                        -- exercise | video | set
  res_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY(res_type, res_id, tag)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_rt_tag ON resource_tags(tag, res_type);

-- 6) 推送（展平到人：一人一行，便于完成率统计与整批撤回）
CREATE TABLE IF NOT EXISTS resource_pushes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id TEXT NOT NULL,                        -- 一次推送 = 一个 batch
  res_type TEXT NOT NULL,                        -- exercise | video | set
  res_id INTEGER NOT NULL,
  student_id TEXT NOT NULL,
  class_name TEXT,                               -- 推送时的班级快照
  reason TEXT,                                   -- ≤30字，学生端原样可见
  due_at INTEGER,
  pushed_by TEXT NOT NULL,
  created_at INTEGER,
  seen_at INTEGER, done_at INTEGER, revoked_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_push_stu   ON resource_pushes(student_id, revoked_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_batch ON resource_pushes(batch_id);
CREATE INDEX IF NOT EXISTS idx_push_res   ON resource_pushes(res_type, res_id);

-- 7) 判题记录（错题本 / 通过率 / CT 证据的唯一事实源）
CREATE TABLE IF NOT EXISTS exercise_submissions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exercise_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL DEFAULT 1,
  language TEXT NOT NULL,
  code TEXT,
  verdict TEXT NOT NULL,                         -- pass | wrong | error | timeout
  passed INTEGER DEFAULT 0, total INTEGER DEFAULT 0,
  first_fail TEXT,                               -- JSON，仅公开用例可回显
  duration_ms INTEGER DEFAULT 0,
  used_ai INTEGER DEFAULT 0,                     -- 提交前是否求助过 AI → AI 依赖度指标
  project_id INTEGER,
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sub_ex   ON exercise_submissions(exercise_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_user ON exercise_submissions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sub_pair ON exercise_submissions(exercise_id, user_id, verdict);

-- 8) 视频观看进度（推送完成判定 + 「本周被看 N 次」signal）
CREATE TABLE IF NOT EXISTS video_views(
  video_id INTEGER NOT NULL, user_id TEXT NOT NULL,
  watched_sec INTEGER DEFAULT 0, progress INTEGER DEFAULT 0,   -- 0-100
  plays INTEGER DEFAULT 0, last_at INTEGER,
  PRIMARY KEY(video_id, user_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_vv_user ON video_views(user_id, last_at DESC);
```

**视频「上传 vs 外链」的取舍**：MVP **只做外链 + 域名白名单**（校内视频服务 / 国家中小学智慧教育平台 / 自建 OSS），理由三条：CX 没有对象存储；FastAPI 单进程接大文件上传会拖垮判题与 SSE；未成年人合规要求外部内容「可审核、可撤回」，`review_state` 正是为此留的闸（`ok` 才允许推送）。`source='upload'` 与 `POST /videos/upload`（落 `data/videos/` + `StaticFiles` 挂载）留字段不留实现，R2 再开。

---

#### ③ 后端 API：`CX/server/app/resources.py`

`main.py` 加两行：`from app.resources import router as resources_router` / `app.include_router(resources_router)`。

### 端点全清单

**教师（`Depends(current_user)` + `_require_teacher` 403）**

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/resources/overview` | L0 四个 signal 一次拉齐（题库数/可用数、视频数/本周播放、练习集数/待完善、本周推送完成率） |
| GET | `/api/resources/exercises` | 分页 + `q/language/difficulty/tag(多)/dim/status/mine` |
| GET | `/api/resources/exercises/facets` | 筛选面板计数（各难度/语言条数、Top20 标签） |
| POST | `/api/resources/exercises` | 新建（`status=published` 时强制参考解自检全绿） |
| GET | `/api/resources/exercises/{eid}` | 教师完整视图（含参考解 + 隐藏用例） |
| PATCH | `/api/resources/exercises/{eid}` | 局部更新 |
| DELETE | `/api/resources/exercises/{eid}` | **软删**（`status='archived'`，进 L1 回收站） |
| POST | `/api/resources/exercises/{eid}/duplicate` | 复制为草稿（`source_id` 记祖先） |
| POST | `/api/resources/exercises/dry-run` | 不落库：用参考解跑用例 / **反向生成期望输出** |
| GET | `/api/resources/exercises/{eid}/submissions` | 该题班级作答明细（通过率、首错分布） |
| POST | `/api/resources/exercises/import` | 批量导入 JSON 题包 |
| GET/POST | `/api/resources/videos` | 列表（`q/category/language/status`）/ 新建 |
| PATCH/DELETE | `/api/resources/videos/{vid}` | 更新 / 软删 |
| GET/POST | `/api/resources/sets` | 列表 / 新建 |
| GET | `/api/resources/sets/{sid}` | 详情（`items` 已按 position 展开并 JOIN 出标题/难度） |
| PATCH/DELETE | `/api/resources/sets/{sid}` | 更新 / 软删 |
| POST | `/api/resources/sets/{sid}/items` | 追加条目 |
| DELETE | `/api/resources/sets/{sid}/items/{item_id}` | 移除条目 |
| **PUT** | `/api/resources/sets/{sid}/items/order` | **拖拽排序落库**（全量 id 数组，服务端做集合一致性校验） |
| POST | `/api/resources/push` | 统一推送入口（`resType/resId/studentIds|classNames/reason/dueAt`） |
| GET | `/api/resources/pushes` | 推送记录 + 已读率 / 完成率 |
| DELETE | `/api/resources/pushes/{batch_id}` | 整批撤回（写 `revoked_at`，不物理删） |
| GET | `/api/resources/tags` | 知识点候选（`TagInput` 补全） |

**学生（只读 + 提交，无 403 但有可见性闸）**

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/resources/my` | 我收到的推送（未完成优先，含逾期标记）→ Composer 上方任务胶囊 |
| POST | `/api/resources/my/{push_id}/seen` | 标记已读 |
| GET | `/api/resources/exercises/{eid}/brief` | **裁剪版**：无 `reference_solution`、隐藏用例只留数量 |
| POST | `/api/resources/exercises/{eid}/submit` | 判题 + 落 submission + 写 CT 事件 |
| GET | `/api/resources/exercises/{eid}/my-submissions` | 我的历次提交（Rail「错题」页签） |
| GET | `/api/resources/videos/{vid}/brief` | 视频播放信息 |
| POST | `/api/resources/videos/{vid}/progress` | 上报观看进度（≥90% 判完成） |
| GET | `/api/resources/sets/{sid}/brief` | 练习集学生视图（含我的逐项完成态） |

### 关键代码（可直接落盘）

#### store 层 —— `app/store_resources.py`

```python
"""
资源中心持久化。与 store.py 同款：stdlib sqlite3 + CREATE TABLE IF NOT EXISTS + _lock 线程锁。
未开 PRAGMA foreign_keys，级联删除一律手写（与 store.delete_project 一致）。
"""
import json
import uuid
from app.store import _conn, _lock, _now

DIMS = ("decompose", "abstract", "model", "algorithm", "verify", "transfer")
_JSON_COLS = {"test_cases": [], "tags": [], "hints": [], "ct_dims": {}, "first_fail": None}


def init():
    with _lock, _conn() as c:
        c.executescript(""" …… 上文 8 张表的 DDL 原样粘贴 …… """)


def _row(r) -> dict:
    """sqlite3.Row -> dict，顺手把 JSON 列解开（列表页也统一形状，前端不用再判断）。"""
    d = dict(r)
    for k, empty in _JSON_COLS.items():
        if k in d and isinstance(d[k], str):
            try:
                d[k] = json.loads(d[k])
            except (ValueError, TypeError):
                d[k] = empty
    return d


def list_exercises(*, q: str = "", language: str = "", difficulty: int = 0,
                   tags: list[str] | None = None, dim: str = "", status: str = "",
                   created_by: str = "", page: int = 1, size: int = 20) -> dict:
    """题库列表：关键词 + 语言 + 难度 + 多标签(AND) + 六维主维 + 状态；返回 {items,total,page,size}。"""
    where, args = [], []
    if q:
        where.append("(e.title LIKE ? OR e.summary LIKE ?)")
        kw = f"%{q.strip()}%"
        args += [kw, kw]
    if language:
        where.append("e.language=?"); args.append(language)
    if difficulty:
        where.append("e.difficulty=?"); args.append(int(difficulty))
    if dim:
        where.append("e.ct_primary=?"); args.append(dim)
    if created_by:
        where.append("e.created_by=?"); args.append(created_by)
    if status:
        where.append("e.status=?"); args.append(status)
    else:
        where.append("e.status<>'archived'")          # 默认不显示回收站
    tags = [t.strip() for t in (tags or []) if t and t.strip()][:5]
    if tags:
        ph = ",".join("?" * len(tags))                # 多标签 AND：命中标签数 = 请求标签数
        where.append(f"e.id IN (SELECT res_id FROM resource_tags WHERE res_type='exercise' "
                     f"AND tag IN ({ph}) GROUP BY res_id HAVING COUNT(DISTINCT tag)=?)")
        args += tags + [len(tags)]
    cond = " AND ".join(where) if where else "1=1"
    size = max(1, min(100, int(size)))
    offset = (max(1, int(page)) - 1) * size
    with _conn() as c:
        total = c.execute(f"SELECT COUNT(*) AS n FROM exercises e WHERE {cond}", args).fetchone()["n"]
        rows = c.execute(
            f"""SELECT e.id, e.title, e.summary, e.language, e.difficulty, e.status, e.tags,
                       e.ct_dims, e.ct_primary, e.case_count, e.related_video_id, e.updated_at,
                       (SELECT COUNT(*) FROM exercise_submissions s WHERE s.exercise_id=e.id) AS sub_n,
                       (SELECT COUNT(*) FROM exercise_submissions s
                         WHERE s.exercise_id=e.id AND s.verdict='pass') AS pass_n
                  FROM exercises e WHERE {cond}
                 ORDER BY e.updated_at DESC LIMIT ? OFFSET ?""",
            args + [size, offset],
        ).fetchall()
    items = []
    for r in rows:
        d = _row(r)
        pn = d.pop("pass_n")
        d["pass_rate"] = round(pn / d["sub_n"] * 100) if d["sub_n"] else None
        d["ready"] = d["status"] == "published" and d["case_count"] > 0     # 列表上的红点判据
        items.append(d)
    return {"items": items, "total": total, "page": page, "size": size}


def save_exercise(payload: dict, user_id: str, eid: int | None = None) -> int:
    """新建/更新题目 + 同步倒排标签 + 回填 ct_primary / case_count。返回 id（更新失败返回 0）。"""
    dims = {k: max(0, min(5, int(v))) for k, v in (payload.get("ct_dims") or {}).items() if k in DIMS}
    dims = {k: v for k, v in dims.items() if v > 0}
    primary = max(dims, key=dims.get) if dims else None
    tags = list(dict.fromkeys(t.strip() for t in (payload.get("tags") or []) if t and t.strip()))[:8]
    cases = payload.get("test_cases") or []
    cols = {
        "title": payload["title"].strip(),
        "summary": (payload.get("summary") or "")[:60],
        "statement": payload.get("statement") or "",
        "language": payload["language"],
        "difficulty": int(payload.get("difficulty") or 2),
        "grade": payload.get("grade"),
        "starter_code": payload.get("starter_code") or "",
        "reference_solution": payload.get("reference_solution") or "",
        "test_cases": json.dumps(cases, ensure_ascii=False),
        "case_count": len(cases),
        "checker": payload.get("checker") or "trim",
        "time_limit_ms": int(payload.get("time_limit_ms") or 5000),
        "hints": json.dumps(payload.get("hints") or [], ensure_ascii=False),
        "related_video_id": payload.get("related_video_id"),
        "ct_dims": json.dumps(dims, ensure_ascii=False),
        "ct_primary": primary,
        "tags": json.dumps(tags, ensure_ascii=False),
        "status": payload.get("status") or "draft",
        "visibility": payload.get("visibility") or "school",
        "updated_at": _now(),
    }
    with _lock, _conn() as c:
        if eid:
            sets = ",".join(f"{k}=?" for k in cols)
            if c.execute(f"UPDATE exercises SET {sets} WHERE id=?", [*cols.values(), eid]).rowcount == 0:
                return 0
        else:
            cols["source_id"] = payload.get("source_id")
            cols["created_by"] = user_id
            cols["created_at"] = _now()
            ks, ph = ",".join(cols), ",".join("?" * len(cols))
            eid = c.execute(f"INSERT INTO exercises({ks}) VALUES({ph})", list(cols.values())).lastrowid
        c.execute("DELETE FROM resource_tags WHERE res_type='exercise' AND res_id=?", (eid,))
        c.executemany("INSERT OR IGNORE INTO resource_tags(res_type,res_id,tag) VALUES('exercise',?,?)",
                      [(eid, t) for t in tags])
    return eid


def reorder_set_items(set_id: int, owner_id: str, ordered_ids: list[int]) -> bool:
    """拖拽排序落库：一次事务整体重排 position，避免中间态；集合不一致直接拒绝（防丢项）。"""
    with _lock, _conn() as c:
        s = c.execute("SELECT created_by FROM exercise_sets WHERE id=?", (set_id,)).fetchone()
        if not s or s["created_by"] != owner_id:
            return False
        exist = [r["id"] for r in c.execute("SELECT id FROM set_items WHERE set_id=?", (set_id,))]
        if sorted(exist) != sorted(ordered_ids):
            return False
        c.executemany("UPDATE set_items SET position=? WHERE id=? AND set_id=?",
                      [(i, iid, set_id) for i, iid in enumerate(ordered_ids)])
        c.execute("UPDATE exercise_sets SET updated_at=?, item_count=? WHERE id=?",
                  (_now(), len(ordered_ids), set_id))
    return True


def push_resource(res_type: str, res_id: int, student_ids: list[str], *, teacher_id: str,
                  reason: str = "", due_at: int | None = None, class_name: str | None = None) -> dict:
    """推送展平到人：一人一行，一次推送共享 batch_id（便于整批撤回与完成率统计）。"""
    batch, now = uuid.uuid4().hex[:12], _now()
    rows = [(batch, res_type, res_id, sid, class_name, (reason or "")[:30], due_at, teacher_id, now)
            for sid in dict.fromkeys(student_ids) if sid]
    if not rows:
        return {"batchId": batch, "count": 0}
    with _lock, _conn() as c:
        c.executemany(
            "INSERT INTO resource_pushes(batch_id,res_type,res_id,student_id,class_name,reason,"
            "due_at,pushed_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)", rows)
    return {"batchId": batch, "count": len(rows)}


def student_can_access(user_id: str, res_type: str, res_id: int) -> bool:
    """学生可见性：被直接推送 / 所在练习集被推送 / 已发布且校内可见（自主练习）。"""
    with _conn() as c:
        if c.execute("SELECT 1 FROM resource_pushes WHERE student_id=? AND res_type=? AND res_id=? "
                     "AND revoked_at IS NULL", (user_id, res_type, res_id)).fetchone():
            return True
        if res_type in ("exercise", "video") and c.execute(
            """SELECT 1 FROM resource_pushes p JOIN set_items i ON i.set_id=p.res_id
                WHERE p.student_id=? AND p.res_type='set' AND p.revoked_at IS NULL
                  AND i.item_type=? AND i.ref_id=?""", (user_id, res_type, res_id)).fetchone():
            return True
        tbl = {"exercise": "exercises", "video": "videos", "set": "exercise_sets"}[res_type]
        r = c.execute(f"SELECT status, "
                      f"{'visibility' if res_type == 'exercise' else \"'school' AS visibility\"} "
                      f"FROM {tbl} WHERE id=?", (res_id,)).fetchone()
        return bool(r and r["status"] == "published" and r["visibility"] == "school")


def add_submission(exercise_id: int, user_id: str, language: str, code: str,
                   result: dict, used_ai: int = 0, project_id: int | None = None) -> dict:
    """落判题记录；首次通过顺带把对应推送标记完成（完成率 signal 由此而来）。"""
    with _lock, _conn() as c:
        n = c.execute("SELECT COUNT(*) AS n FROM exercise_submissions WHERE exercise_id=? AND user_id=?",
                      (exercise_id, user_id)).fetchone()["n"]
        c.execute(
            """INSERT INTO exercise_submissions(exercise_id,user_id,attempt_no,language,code,verdict,
                 passed,total,first_fail,duration_ms,used_ai,project_id,created_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (exercise_id, user_id, n + 1, language, (code or "")[:100_000], result["verdict"],
             result["passed"], result["total"],
             json.dumps(result.get("firstFail"), ensure_ascii=False) if result.get("firstFail") else None,
             result.get("durationMs", 0), used_ai, project_id, _now()))
        if result["verdict"] == "pass":
            c.execute("UPDATE resource_pushes SET done_at=? WHERE student_id=? AND res_type='exercise' "
                      "AND res_id=? AND done_at IS NULL AND revoked_at IS NULL",
                      (_now(), user_id, exercise_id))
    return {"attemptNo": n + 1}


def next_hint(ex: dict, user_id: str) -> str | None:
    """按同题失败次数递进给提示；hints 是 AI 唯一能引用的提示源，参考解永不外流。"""
    hints = ex.get("hints") or []
    if not hints:
        return None
    with _conn() as c:
        fails = c.execute("SELECT COUNT(*) AS n FROM exercise_submissions "
                          "WHERE exercise_id=? AND user_id=? AND verdict<>'pass'",
                          (ex["id"], user_id)).fetchone()["n"]
    return hints[min(fails, len(hints)) - 1] if fails >= 1 else None


init()
```

#### 判题 —— `app/judge.py`

```python
"""判题：跑测试用例 + 比对。复用 executor（开发级沙箱），C/C++ 编译一次跑多例。"""
from app import executor

MAX_CASES = 20


def _cmp(got: str, expect: str, checker: str) -> bool:
    if checker == "exact":
        return got == expect
    if checker == "contains":
        return (expect or "").strip() in (got or "")
    a = [ln.rstrip() for ln in (got or "").replace("\r\n", "\n").rstrip().split("\n")]
    b = [ln.rstrip() for ln in (expect or "").replace("\r\n", "\n").rstrip().split("\n")]
    if checker == "float2":
        try:
            return len(a) == len(b) and all(abs(float(x) - float(y)) < 1e-2 for x, y in zip(a, b))
        except ValueError:
            return a == b
    return a == b                                   # trim（默认，最贴合初中生输出习惯）


def run_cases(language: str, code: str, cases: list[dict],
              time_limit_ms: int = 5000, checker: str = "trim") -> dict:
    cases = (cases or [])[:MAX_CASES]
    if not cases:
        return {"verdict": "error", "passed": 0, "total": 0, "public": [],
                "durationMs": 0, "firstFail": {"reason": "该题还没有测试用例"}}
    tl = max(1, round((time_limit_ms or 5000) / 1000))
    runs = executor.execute_cases(language, code, [c.get("in", "") for c in cases], timeout=tl)
    passed, public, first_fail, ms = 0, [], None, 0
    for i, (cse, r) in enumerate(zip(cases, runs)):
        ms += r["durationMs"]
        ok = r["status"] == "success" and _cmp(r["stdout"], cse.get("out", ""), checker)
        passed += int(ok)
        if not ok and first_fail is None:
            first_fail = {"idx": i, "status": r["status"], "stderr": r["stderr"][:400]}
        if cse.get("hidden"):                        # 隐藏用例只回显对错，不泄期望值
            public.append({"idx": i, "hidden": True, "ok": ok, "status": r["status"]})
        else:
            public.append({"idx": i, "in": cse.get("in", ""), "expect": cse.get("out", ""),
                           "got": r["stdout"][:2000], "ok": ok, "status": r["status"]})
    if passed == len(cases):
        verdict = "pass"
    elif any(r["status"] == "timeout" for r in runs):
        verdict = "timeout"
    elif any(r["status"] == "error" for r in runs):
        verdict = "error"
    else:
        verdict = "wrong"
    return {"verdict": verdict, "passed": passed, "total": len(cases),
            "public": public, "firstFail": first_fail, "durationMs": ms}
```

#### executor 补丁（**必须做**）—— 现有 `execute()` 写死 `stdin=subprocess.DEVNULL`，喂不进用例输入

```python
# app/executor.py —— 追加（判题专用：允许 stdin + C/C++ 只编译一次）
def _run_once(argv: list[str], stdin_data: str, timeout: int) -> dict:
    t0 = time.time()
    try:
        r = subprocess.run(argv, input=(stdin_data or "")[:4096], capture_output=True,
                           timeout=timeout, text=True, encoding="utf-8", errors="replace",
                           **_CREATE_NO_WINDOW)
        return _result(r.stdout, r.stderr, "success" if r.returncode == 0 else "error",
                       int((time.time() - t0) * 1000))
    except subprocess.TimeoutExpired:
        return _result(stderr=f"运行超时（{timeout}s）", status="timeout", ms=timeout * 1000)
    except Exception as e:
        return _result(stderr=f"执行错误: {e}", status="error")


def execute_cases(language: str, code: str, stdins: list[str], timeout: int = DEFAULT_TIMEOUT) -> list[dict]:
    """判题批跑。与 execute() 同样的长度/输出上限，但允许 stdin（内容来自教师侧受控用例，单条 ≤4KB）。"""
    if not code or not code.strip() or len(code) > MAX_CODE_LEN:
        return [_result(stderr="代码为空或过长", status="error") for _ in stdins]
    if language == "python":
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as f:
            f.write(code); src = f.name
        try:
            return [_run_once(["python", "-I", "-X", "utf8", "-B", src], s, timeout) for s in stdins]
        finally:
            _safe_unlink(src)
    if language in ("cpp", "c"):
        compiler, std = ("g++", "c++17") if language == "cpp" else ("gcc", "c11")
        if not shutil.which(compiler):
            return [_result(stderr=f"未找到编译器 {compiler}", status="error") for _ in stdins]
        suffix = ".cpp" if language == "cpp" else ".c"
        with tempfile.NamedTemporaryFile("w", suffix=suffix, delete=False, encoding="utf-8") as f:
            f.write(code); src = f.name
        exe = src[:-len(suffix)] + (".exe" if os.name == "nt" else ".out")
        try:
            comp = subprocess.run([compiler, src, "-o", exe, f"-std={std}", "-O1", "-w"],
                                  capture_output=True, timeout=20, text=True,
                                  encoding="utf-8", errors="replace", **_CREATE_NO_WINDOW)
            if comp.returncode != 0:
                return [_result(stderr=f"编译错误:\n{comp.stderr}", status="error") for _ in stdins]
            return [_run_once([exe], s, timeout) for s in stdins]          # 编译 1 次，跑 N 次
        finally:
            _safe_unlink(src); _safe_unlink(exe)
    return [_result(stderr=f"不支持的语言: {language}", status="error") for _ in stdins]
```

> 安全说明：开放 stdin 扩大了执行面，因此 ① 用例内容只来自教师侧、单条截 4KB；② 用例数硬上限 20、总耗时受 `timeout × N` 约束；③ 提交端点做 6 秒/人/题 限流（见下）；④ 生产仍须按 `specs/IMPL-三语言真实执行` 上容器 + seccomp。

#### 路由层 —— `app/resources.py`（节选 4 个关键处理器）

```python
"""
资源中心（题库 / 学习视频 / 练习集）。教师 CRUD + 学生只读做题。
风格对齐 app/teacher.py：APIRouter(prefix=...) + Depends(current_user) + 教师 403 校验。
"""
import json
import time
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from app import store, judge
from app import store_resources as rs
from app.auth import current_user

router = APIRouter(prefix="/api/resources", tags=["资源中心"])
LANGS = {"python", "cpp", "c"}


def _require_teacher(user: dict):
    if user.get("role") not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师权限")


def _uid(user: dict) -> str:
    return user.get("sub", "anon")


# ───────── 1. 题库列表（分页 / 搜索 / 多维筛选）─────────
@router.get("/exercises")
def list_exercises(
    q: str = "", language: str = "", difficulty: int = 0, dim: str = "", status: str = "",
    tag: list[str] = Query(default=[]),          # 可重复传实现 AND：?tag=循环&tag=列表
    mine: bool = False, page: int = 1, size: int = 20,
    user: dict = Depends(current_user),
):
    _require_teacher(user)
    if language and language not in LANGS:
        raise HTTPException(400, "语言仅支持 python/cpp/c")
    if dim and dim not in rs.DIMS:
        raise HTTPException(400, "未知的计算思维维度")
    return rs.list_exercises(q=q, language=language, difficulty=difficulty, tags=tag, dim=dim,
                             status=status, created_by=_uid(user) if mine else "",
                             page=page, size=size)


# ───────── 2. 新建题目（发布前强制"参考解自检全绿"）─────────
class TestCaseReq(BaseModel):
    input: str = ""
    output: str = ""
    hidden: bool = False
    score: int = 10


class ExerciseReq(BaseModel):
    title: str = Field(min_length=1, max_length=60)
    summary: str = ""
    statement: str = ""
    language: str
    difficulty: int = 2
    grade: str | None = None
    starterCode: str = ""
    referenceSolution: str = ""
    testCases: list[TestCaseReq] = []
    checker: str = "trim"
    timeLimitMs: int = 5000
    hints: list[str] = []
    relatedVideoId: int | None = None
    ctDims: dict[str, int] = {}
    tags: list[str] = []
    status: str = "draft"


def _payload(req: ExerciseReq) -> dict:
    return {
        "title": req.title, "summary": req.summary, "statement": req.statement,
        "language": req.language, "difficulty": req.difficulty, "grade": req.grade,
        "starter_code": req.starterCode, "reference_solution": req.referenceSolution,
        "test_cases": [{"in": t.input, "out": t.output, "hidden": int(t.hidden), "score": t.score}
                       for t in req.testCases],
        "checker": req.checker, "time_limit_ms": req.timeLimitMs, "hints": req.hints,
        "related_video_id": req.relatedVideoId, "ct_dims": req.ctDims,
        "tags": req.tags, "status": req.status,
    }


@router.post("/exercises")
def create_exercise(req: ExerciseReq, user: dict = Depends(current_user)):
    _require_teacher(user)
    if req.language not in LANGS:
        raise HTTPException(400, "语言仅支持 python/cpp/c")
    if not 1 <= req.difficulty <= 4:
        raise HTTPException(400, "难度取值 1-4")
    if any(k not in rs.DIMS for k in req.ctDims):
        raise HTTPException(400, "计算思维维度取值非法")
    data = _payload(req)
    if req.status == "published":
        # 不允许"错题库"污染学情：发布 = 参考解必须跑通全部用例
        if not data["test_cases"]:
            raise HTTPException(400, "发布前至少需要 1 个测试用例")
        if not req.referenceSolution.strip():
            raise HTTPException(400, "发布前需要填写参考解，用于自检")
        chk = judge.run_cases(req.language, req.referenceSolution, data["test_cases"],
                              req.timeLimitMs, req.checker)
        if chk["verdict"] != "pass":
            raise HTTPException(400, f"参考解未通过自检（{chk['passed']}/{chk['total']}），请先修正用例")
    return {"id": rs.save_exercise(data, _uid(user))}


# ───────── 3. 学生提交判题（写 CT 证据）─────────
class SubmitReq(BaseModel):
    code: str
    usedAi: bool = False
    projectId: int | None = None


_LAST_SUBMIT: dict[tuple[str, int], float] = {}


@router.post("/exercises/{eid}/submit")
def submit(eid: int, req: SubmitReq, user: dict = Depends(current_user)):
    uid = _uid(user)
    ex = rs.get_exercise(eid)
    if not ex or ex["status"] != "published":
        raise HTTPException(404, "题目不存在或未发布")
    if user.get("role") == "student" and not rs.student_can_access(uid, "exercise", eid):
        raise HTTPException(403, "这道题还没有发给你哦")
    now = time.time()                                  # 限流：开发级沙箱，必须收敛调用面
    if now - _LAST_SUBMIT.get((uid, eid), 0) < 6:
        raise HTTPException(429, "提交太快啦，先想一想再试 🐢")
    _LAST_SUBMIT[(uid, eid)] = now

    result = judge.run_cases(ex["language"], req.code, ex["test_cases"],
                             ex.get("time_limit_ms") or 5000, ex.get("checker") or "trim")
    rs.add_submission(eid, uid, ex["language"], req.code, result,
                      used_ai=int(req.usedAi), project_id=req.projectId)
    # CT 证据：把题目的六维标注写进事件 detail，summary_for 据此加权（见 §5）
    store.add_ct_event(uid, "exercise_pass" if result["verdict"] == "pass" else "exercise_fail",
                       json.dumps({"ex": eid, "dims": ex["ct_dims"]}, ensure_ascii=False),
                       req.projectId)
    if result["verdict"] != "pass":
        store.add_ct_event(uid, "error", f"[exercise:{eid}] {result['verdict']}", req.projectId)
    return {"verdict": result["verdict"], "passed": result["passed"], "total": result["total"],
            "cases": result["public"], "durationMs": result["durationMs"],
            "hint": rs.next_hint(ex, uid)}            # 阶梯提示，不给答案


# ───────── 4. 练习集拖拽排序落库 ─────────
class OrderReq(BaseModel):
    orderedIds: list[int]


@router.put("/sets/{sid}/items/order")
def reorder_items(sid: int, req: OrderReq, user: dict = Depends(current_user)):
    """前端必须回传该集**全部** item id；服务端做集合一致性校验，防并发丢项。"""
    _require_teacher(user)
    if not rs.reorder_set_items(sid, _uid(user), req.orderedIds):
        raise HTTPException(400, "排序失败：练习集不存在、无权限或条目不完整")
    return {"ok": True}
```

**两条设计决断值得单独点名**

1. **期望输出由参考解生成，教师不手打**：`POST /exercises/dry-run` 跑一遍参考解，把 `stdout` 回填进用例的 `out`。手写期望输出是题库质量崩坏的头号来源（空格 / 换行 / 精度）。
2. **发布闸**：`status=published` 必须参考解全绿。草稿随便存，但**只有能自洽的题才能被推送和计入学情**。

---

#### ④ 教师端 UI

### 一屏结构（`ResourcesView.vue`，`?tab=bank|video|set`）

**这一屏要回答的唯一问题：我下节课能直接拿来用的东西够不够？**

| 层 | 内容 | 组件 |
|---|---|---|
| **L0（4 signal，带 `data-signal`）** | ① `题库 128 · 可用 112` ② `视频 36 · 本周 214 次` ③ `练习集 9 · 待完善 2` ④ RingProgress `本周推送完成 68%` | `BentoGrid(min=180px)` + `CeramicTile ×3` + `RingProgress ×1` |
| **工具条** | 3 个 tab（题库/视频/练习集）+ 搜索框 + **「筛选」按钮**（语言/难度/知识点/六维/状态全部收进 popover）+ `新建` 主按钮 | `BaseButton` + 新建 `ResourceFilterBar` |
| **L1（`DisclosureSection`，默认收起）** | 「批量操作」（批量发布 / 打标签 / 归档）、「回收站」（`status=archived`）、「导入 / 导出题包 JSON」 | 已有折叠原语 |
| **L2（Peek 抽屉，≤2 层）** | `exercise` 题目编辑器 720px · `set` 练习集编排 720px · `video` 视频详情 480px · `pushSheet` 推送面板 480px | `usePeek()` + `DrillDrawer` |
| **L3** | **无**。题目/视频不给独立页 | — |
| **明确不放** | ❌ 常驻的 3 个筛选下拉 ❌ 每行操作列 ❌ 题库统计图（属教研）❌ 一次性大表单 dialog | — |

**「少即是多」硬指标核账**

- **首屏可交互元素 = 10 ≤ 12**：4 瓷片（可点，切 tab / 开抽屉）+ 3 tab + 搜索 + 筛选 + 新建。
  → 这条约束**倒逼出**「筛选必须收进 popover」：若把语言/难度/知识点做成 3 个常驻下拉，就是 13 个，直接破线。
- **首屏中文正文 ≈ 38 字 ≤ 60**：「题库 / 可用 / 视频 / 本周 / 次 / 练习集 / 待完善 / 本周推送完成 / 题库·视频·练习集(tab) / 搜索 / 筛选 / 新建」。表格行、抽屉内文案挂 `data-copy-exempt`，不计入。
- **每片 1 判断 1 动作**：`题库 128 · 可用 112` 的判断是「有多少能直接用」，动作是「点进题库 tab」。**红点规则**：`可用 < 总数` 时右上角橙点，点橙点直接跳到 `?tab=bank&status=draft`。
- **层级 ≤3 跳**：资源 → 列表 → 抽屉。抽屉最深 2 层（题目编辑器 → 选关联视频），到顶。

### 新建组件（props / emits 清单）

| 组件 | props | emits | 要点 |
|---|---|---|---|
| `ResourceFilterBar.vue` | `modelValue: ResourceQuery`、`scope: 'exercise'\|'video'\|'set'`、`facets: Facets` | `update:modelValue`、`reset` | 搜索 300ms 防抖；筛选进 popover；已选条件以可 × 的 chip 行呈现（**唯一常驻的筛选可视化**）；整体与 URL query 双向绑定 |
| `ExerciseTable.vue` | `rows: ExerciseRow[]`、`loading`、`total`、`page`、`size`、`selectable?` | `open(id)`、`push(id)`、`duplicate(id)`、`update:page`、`update:selection` | 列：标题(带状态点) / 语言 / 难度(4格条) / 主维徽标 / 用例数(0 显红) / 通过率 / 更新时间。数字列 `font-variant-numeric: tabular-nums`；**操作仅 hover 浮出，不占列** |
| `VideoGrid.vue` | `items: VideoCard[]`、`loading` | `open(id)`、`push(id)` | `BentoGrid min=220px`；封面 16:9 `loading="lazy"`，缺封面回退 `asset('tile_report')`；时长胶囊 + category chip；`review_state!=='ok'` 显灰并禁推送 |
| `SetBoard.vue` | `set: ExerciseSet`、`items: SetItem[]`、`busy` | `reorder(ids)`、`remove(itemId)`、`add(type)`、`save` | 左=可拖条目列，右=候选池（搜题库/视频，点 + 入集）；顶部实时显示「预计 25 分钟 · 六维覆盖 4/6」 |
| `SortableList.vue` | `items: T[]`、`itemKey: (t)=>string\|number`、`disabled?`、`handle?` | `reorder(orderedKeys)` | **零依赖拖拽**：原生 `draggable` + `@dragover.prevent` 计算插入位 + `<TransitionGroup>` 做 FLIP（L0 动效）；键盘可达：条目 focus 后 `Alt+↑/↓` 移动，`aria-live` 播报「第 3 项，已上移」 |
| `TestCaseEditor.vue` | `modelValue: TestCase[]`、`language`、`referenceSolution`、`checker` | `update:modelValue`、`verified(result)` | 两栏等宽 textarea（输入/期望输出）+ `hidden` 开关；**「用参考解生成期望输出」**按钮调 `dry-run` 回填；「自检」全绿才解锁发布按钮 |
| `CtDimPicker.vue` | `modelValue: Record<Dim,number>`、`max?=5`、`readonly?` | `update:modelValue` | 六个 0-5 点阵，复用已有 `ct_decompose/abstract/model/algorithm/verify/transfer` 6 张 3D 图标；实时算 `ct_primary` |
| `PushSheet.vue` | `resType`、`resId`、`resTitle` | `pushed(batchId)`、`close` | 接收对象（班级 chip / 学生多选，默认「本班全部」）+ 理由（≤30 字带计数）+ 截止（今天放学 / 明天 / 自定义 三胶囊）+ 推送主按钮。**全屏只有 1 个主按钮** |
| `ExercisePeek.vue` | `id?: number`、`preset?: Partial<Exercise>` | `saved(id)`、`close` | 抽屉 720px 两栏：左=题面 Markdown + starter + 参考解（复用 `@/editor` 的 Monaco）；右=元数据折叠 + `TestCaseEditor`。底部固定条：`保存草稿` / `自检并发布` |
| `TagInput.vue` | `modelValue: string[]`、`suggestions: string[]`、`max?=6` | `update:modelValue` | 知识点补全，来源 `GET /tags` |

**复用（不新写）**：`GlassPanel`（筛选条、抽屉容器）· `CeramicTile`（4 个 signal，`tint` 用 `blue/purple/mint`）· `BentoGrid`（视频网格）· `RingProgress`（完成率 / 通过率）· `BaseButton`（`primary/ghost/danger`）· `FloatingDecor` + `asset('mascot_turtle')`（空态）· `.glass` 工具类与 `[data-cap=low]` 降级 · V1 地基的 `usePeek() / DrillDrawer / DisclosureSection / useDensity()`。

**空态**（第一次进来最重要的一屏）：题库 0 题时，L0 只留一片 —— `从模板导入 12 道入门题` 一个按钮 + 小海龟插画。不做「欢迎使用资源中心」这类问候文案。

**投影可读**：本页强制 `useDensity('cozy')`，正文 ≥14px、表格行高 44px、难度条与状态点用颜色 + 形状双编码（色弱可辨）。

**前端 API 层**（`web/src/api/resources.ts`，沿用 `teacher.ts` 的裸 `fetch` + Bearer 风格，不引 axios）

```ts
import { useAuthStore } from '@/stores/auth'

const H = () => ({ Authorization: `Bearer ${useAuthStore().token}`, 'content-type': 'application/json' })

export const resourcesApi = {
  listExercises(p: Record<string, string | number | string[]>) {
    const qs = new URLSearchParams()
    Object.entries(p).forEach(([k, v]) =>
      Array.isArray(v) ? v.forEach(x => qs.append(k, String(x))) : v !== '' && qs.set(k, String(v)))
    return fetch(`/api/resources/exercises?${qs}`, { headers: H() }).then(r => r.json())
  },
  reorderSet(sid: number, orderedIds: number[]) {
    return fetch(`/api/resources/sets/${sid}/items/order`,
      { method: 'PUT', headers: H(), body: JSON.stringify({ orderedIds }) }).then(r => r.json())
  },
}
```

---

#### ⑤ 与既有功能的关系

### 5.1 与「任务下发」

**CX 后端目前没有 assignments / tasks 表**（`/teacher/teaching/tasks` 还在 V2 规划中）。所以先落资源中心是正确顺序 —— 任务表建起来时直接**引用**资源，而不是再造一套题目字段。

- **职责分界**：资源 = 长生命周期**资产**（写、改、复用）；任务 = 一次**投放**（班级、截止、批改、统计）。
- **未来 `tasks` 的最小契约**（与 `set_items` **同构**，可把一个练习集一键复制成任务）：

```sql
CREATE TABLE IF NOT EXISTS task_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  item_type TEXT NOT NULL,        -- exercise | video
  ref_id INTEGER NOT NULL,        -- 引用而非拷贝
  position INTEGER NOT NULL,
  snapshot TEXT                   -- 可选：下发瞬间的题面快照，防"改题改坏历史作业"
);
```
- **两条投放通道，别混**：`POST /resources/push` = 轻投放（无批改、无强截止，落到学生 Composer 上方的任务胶囊）；`tasks` = 正式作业（有提交矩阵、有批改）。教师在 `PushSheet` 里若填了截止时间，UI 提示「需要批改吗？→ 改用下发任务」。
- **复用**：`TaskComposer` 第 2 步「选内容」直接复用 `ExerciseTable(selectable)` + `VideoGrid`，不另写选择器。

### 5.2 与 CT 六维（这是整个模块的核心价值链）

```
教师标注 exercises.ct_dims（六维 0-5）
   ↓ 推送 / 下发
学生做题 → POST /exercises/{id}/submit → 判题
   ↓ 双写
exercise_submissions（客观通过率、首错类型、AI 依赖）
ct_events(type='exercise_pass', detail={"ex":42,"dims":{...}})
   ↓
ct.summary_for() 六维加权  →  /api/teacher/home 的 class_ct  →  research.build_dataset()
```

**对 `ct.py` 的加性补丁**（不改原公式，只叠加"做题证据"，老数据不受影响）：

```python
# app/ct.py 顶部
import json
KEY = {"run", "error", "fix", "ai_help", "role_switch", "design_create",
       "exercise_pass", "exercise_fail", "video_watch"}     # ← 扩充

# summary_for() 内，ct_scores 计算完之后追加：
    for e in evs:                                   # 做题证据：题目标注了哪几维，就给哪几维加分
        if e["type"] != "exercise_pass":
            continue
        try:
            dims = (json.loads(e["detail"] or "{}") or {}).get("dims") or {}
        except (ValueError, TypeError):
            continue
        for d, w in dims.items():
            if d in ct_scores:
                ct_scores[d] = _clamp(ct_scores[d] + int(w) * 2)   # 权重 0-5 → 每题最多 +10
```

**这解决了现有六维模型最大的短板**：目前分数纯靠 `run/error/fix` 计数的启发式（`ct.py` 注释自己也说是"规则启发式"），无法区分「练的是建模还是算法」。有了题目标注，六维终于有了**任务侧的先验**，而不只是行为侧的频次 —— 这是从「可审计」升级到「可解释」的关键一步。

**顺带解锁一个教研独有指标 —— 六维覆盖度**：

```sql
-- 「这个班这学期到底练没练建模维？」教研区 analysis 直接可用
SELECT e.ct_primary AS dim, COUNT(DISTINCT s.exercise_id) AS n_ex, COUNT(*) AS n_sub,
       SUM(s.verdict='pass') AS n_pass
  FROM exercise_submissions s JOIN exercises e ON e.id = s.exercise_id
 WHERE s.created_at > ? GROUP BY e.ct_primary;
```
`research.build_dataset()` 的每个学生对象加一段（脱敏无碍，全是数值）：
```python
"exercise": {"attempts": n, "passed": p, "dim_coverage": {d: k for ...}, "avg_attempts_to_pass": x}
```

### 5.3 与 AI 导师（`ai.py`）

- **注入题目上下文，但严格裁剪**：`_system()` 增加 `<当前题目>` 段，只放 `title / statement / hints[k] / ct_dims`。**`reference_solution` 与隐藏用例永远不进 prompt** —— 服务端在 `brief` 层就裁掉，AI 物理上拿不到，比"靠 prompt 约束别泄答案"可靠一个数量级。这与 `BASE_RULE` 的「绝对禁止输出完整答案代码」红线互为里外两道闸。

```python
# app/ai.py::_system() 追加
if exercise:
    parts.append(f"<当前题目>标题：{exercise['title']}\n要求：{exercise['statement'][:800]}\n"
                 f"允许引用的提示：{exercise.get('allowed_hint') or '（暂无）'}\n"
                 f"注意：你没有本题参考答案，也不得凭空写出完整解法。</当前题目>")
```

- **支架等级从「学生自选」变成「证据驱动自动升档」**：现在 `ChatReq.scaffold` 由前端随便传。改为服务端按同题失败次数取 `hints[k]`（`rs.next_hint`）：0 次不给提示 → 1 次给 `hints[0]`（方向）→ 2 次给 `hints[1]`（伪代码）→ ≥3 次才允许 `SCAFFOLD[3]` 的「≤3 行 API 示例」。这正好落地了产品叙事里的「苏格拉底证据驱动」。
- **错题本（学生 Rail「错题」页签）**：`SELECT exercise_id, MAX(created_at), COUNT(*) FROM exercise_submissions WHERE user_id=? AND verdict<>'pass' GROUP BY exercise_id` → 每条挂 `related_video_id`，动作是「看 2 分钟讲解再试一次」。**这正是 `videos.related_video_id` 存在的理由** —— 视频不是孤立的资源库，是错题的补救路径。
- **行为纠正 / 预警联动，直接复用现有 `risk_events`（教学区预警页零改动即可显示）**：
  - 同题连续失败 ≥2 且 `used_ai=0` → 学生端 `BehaviorNudge` 气泡「要不要问问小龟？」
  - 同题失败 ≥3 且 `used_ai=1` 占比高 → `store.add_risk_event(uid, 'ai_dependency', 2, f'exercise:{eid}')`
  - 提交间隔 < 10s 且代码几乎没变 → `category='blind_retry'`，教师侧提示「机械重试，需要介入」

### 5.4 落地顺序（每步可独立验证）

| 步 | 内容 | 验收 |
|---|---|---|
| R-1 | `store_resources.py` 建表 + `judge.py` + `executor.execute_cases` 补丁 | `python -c "from app import store_resources"` 建表成功；judge 对 3 道样题全绿 |
| R-2 | `resources.py` 教师 CRUD + `main.py` 注册 | `/docs` 可跑通增删改查；非教师 token 一律 403 |
| R-3 | `ResourcesView` L0 四 signal + 题库 tab + `ExercisePeek` | `npm run build`（vue-tsc）通过；DEV 无 `[copy]`/`[signal]` 告警；可交互元素 = 10 |
| R-4 | 视频 tab + `PushSheet` + 学生端 `/api/resources/my` 胶囊 | 教师推 1 个视频 → 学生 Studio 出现胶囊 → 看完回填 `done_at` |
| R-5 | 练习集 `SetBoard` + `SortableList` 拖拽 + 排序落库 | 拖动后刷新顺序保持；键盘 `Alt+↑/↓` 可用 |
| R-6 | `ct.py` 六维加权补丁 + `research` 导出扩字段 + AI 题目上下文注入 | 做完一道 `algorithm=5` 的题，该维分数上升且 `/api/teacher/home` 的 `class_ct` 同步变化 |



---

## 附录 F · 推送链路 / 学生端接收 / AI 智能推荐

#### 推送链路 · 学生端接收 · AI 智能推荐（CX 落地方案）

> 技术基线已核对真实代码：`server/app/store.py`（stdlib `sqlite3` + `_conn()` + `_lock` + `CREATE TABLE IF NOT EXISTS` + WAL）、`app/auth.py`（`current_user` 依赖，`user["sub"]` / `user["role"]`）、`app/teacher.py`（`_require_teacher` 403 模式）、`app/ai.py`（`_call_llm` urllib + Anthropic 格式 + `_fallback`）、`app/guard.py`（PII/危险话题分级）、`web/src/api/*.ts`（裸 `fetch` + `authH()`，失败返回 `null`）、`web/src/components/ui/*`（GlassPanel/CeramicTile/RingProgress，无组件库）、`styles/tokens.css`。
> **无 SQLAlchemy、无响应信封、无 WebSocket、无 Element Plus** —— 下文所有代码遵循这套现状。后端端口 `9099`（`vite.config.ts` 代理）。

---

#### ① 推送动作设计：推送是「跨页面动作」，不是导航项

### 1.1 三个真实入口（不新增顶级菜单）

| 入口 | 页面 | 触发方式 | 预填内容 | 闭环价值 |
|---|---|---|---|---|
| **A · 资源→人** | `/teacher/teaching/resources`（题库/视频板块，由同批任务落地） | 卡片 hover 出「推送」图标；或多选后底部批操作条「推给…」 | `resource_kind/resource_id/title_snap` 已定，缺**目标** | 备课时批量派发 |
| **B · 人→资源**（核心闭环） | `/teacher/teaching/situation`（学情）、`/teacher/teaching/alerts`（预警） | 选中 1..N 名学生 → 「推荐资源」 | **目标已定**，缺资源；抽屉顶部直接挂 AI 建议候选（见④） | 发现问题→即时补救 |
| **C · AI 建议采纳** | `/teacher/teaching/today`（今日）AI 建议卡 | 卡片上「采纳并推送」 | 目标 + 资源 + 理由 **全部预填**，1 次点击完成 | 零心智负担 |
| D · 课堂中（可选） | `/teacher/teaching/classroom` | 学生格子右键 | 目标已定 + 「即时」模板 | 课堂即时干预 |

> 入口 A/B 共用**同一个** `PushSheet.vue`，只是 `prefill` 不同方向。这保证「推送」是一个**动作**而非一个页面。

### 1.2 推送目标 / 附加项

- **目标粒度**：`class`（班级） / `group`（小组） / `student`（单个或多选）。
  服务端**写时扇出（fan-out on write）**：一次推送 = 1 条 `pushes` + N 条 `push_items`。理由：完成率查询变成单表 GROUP BY，学生端拉取无需 join 班级表，撤回只需软删父行。
- **推荐理由**（≤40 字，必填 or 一键用 AI 生成）：**双份文案**
  - `reason`（教师版，诊断性）："verify 维度 32 分，近 3 次报错均为循环边界"
  - `reason_stu`（学生版，鼓励性）：后端 `_soften()` 自动转写为"试试这个，循环边界会更稳 💪"
    → 学生**永远看不到**自己的低分诊断（合规 + 反焦虑，见⑤）。
- **截止时间** `due_at`：可空（默认不限）。快捷值：今天放学 / 明天 / 本周五 / 自定义。
- **必做** `required`：布尔。必做才允许在学生端「浮现一次」，选做只加红点（见③）。
- **投递时间** `deliver_at`：防沉迷夜间顺延（21:30–06:30 入库不可见），服务端自动计算。

### 1.3 交互流程（3 步封顶，符合"层级≤3跳"）

```
入口点击 → PushSheet 从右侧滑入（460px，.glass--strong）
 ├ 步骤区（单屏，不分页，全部可见）
 │   ① 推给谁     [班级 ▾][小组 ▾][学生 chips +搜索]   ← 入口B 已填则折叠成一行摘要
 │   ② 推什么     [资源卡片缩略 ×N]                    ← 入口A 已填则折叠成一行摘要
 │   ③ 理由       [输入框 40字] [✨AI 帮我写]
 │   ④ 更多 ▾（默认折叠）  截止 / 必做开关
 └ 底部 [取消] [推送给 24 人]  ← 按钮文案实时反映扇出人数
推送成功 → Sheet 关闭 + 顶部 toast「已推送给 24 人 · 撤回」（8s 内可撤回）
```

**"少即是多"校验**：首屏可交互元素 = 目标选择器 1 + 资源槽 1 + 理由框 1 + AI 生成 1 + 更多 1 + 主次按钮 2 = **7 ≤ 12** ✅

### 1.4 组件 `PushSheet.vue`（`web/src/components/teacher/PushSheet.vue`）

```ts
// props
defineProps<{
  open: boolean
  /** 预填：入口A 给 resources，入口B 给 students，入口C 两者都给 */
  prefill?: {
    resources?: { kind: 'video' | 'exercise' | 'exercise_set'; id: number; title: string }[]
    students?: { id: string; name: string }[]
    classRef?: string
    reason?: string
    /** 来源埋点 + 归因：manual | ai_suggest | alert | resource_page | classroom */
    source?: PushSource
    originRef?: string          // 'alert:123' / 'suggest:45'
  }
  /** 教师侧可选资源池（懒加载，仅入口B 需要） */
  pickerEnabled?: boolean
}>()

// emits
defineEmits<{
  'update:open': [boolean]
  sent: [{ pushId: number; count: number }]   // 父页面用于刷新记录列表 / 关闭预警项
  cancel: []
}>()
```

配套：
- `PushTargetPicker.vue` — props `{ modelValue: TargetSel; roster: Student[] }`，emits `update:modelValue`；三段式 tab（班级/小组/学生），学生态用 chips + 拼音搜索。
- `usePush.ts`（composable，**全局单例**）：任何页面 `usePush().open({ ...prefill })` 即可唤起，Sheet 挂在 `TeacherShell.vue` 根部一次，避免每页重复挂载。

```ts
// web/src/composables/usePush.ts
const state = reactive({ open: false, prefill: {} as PushPrefill })
export function usePush() {
  return {
    state,
    open(prefill: PushPrefill) { state.prefill = prefill; state.open = true },
    close() { state.open = false },
  }
}
```

---

#### ② 数据模型 + API

### 2.1 建表（追加进 `server/app/store.py` 的 `init()` 里那段 `executescript`）

> 全部 `IF NOT EXISTS`，重启即自动建表；**已存在表不会 ALTER**，改字段需删 `jiedui.db`（与现有约定一致）。

```sql
/* ===== 推送（批次） ===== */
CREATE TABLE IF NOT EXISTS pushes(
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id    TEXT NOT NULL,
  target_type   TEXT NOT NULL,              -- class | group | student
  target_ref    TEXT,                       -- 班级号/小组名；student 时为 NULL
  resource_kind TEXT NOT NULL,              -- video | exercise | exercise_set
  resource_id   INTEGER NOT NULL,
  title_snap    TEXT,                       -- 标题快照：资源删了也能正确显示历史
  reason        TEXT,                       -- 教师版理由（诊断性，学生不可见）
  reason_stu    TEXT,                       -- 学生版文案（鼓励性）
  due_at        INTEGER,                    -- 截止(unix秒)，NULL=不限
  required      INTEGER DEFAULT 0,          -- 1=必做
  source        TEXT DEFAULT 'manual',      -- manual|ai_suggest|alert|resource_page|classroom
  origin_ref    TEXT,                       -- 'alert:123' / 'suggest:45'，用于闭环归因
  deliver_at    INTEGER,                    -- 生效投递时间（夜间顺延）
  created_at    INTEGER,
  revoked_at    INTEGER                     -- 软撤回，保留审计
);
CREATE INDEX IF NOT EXISTS idx_push_teacher ON pushes(teacher_id, created_at);

/* ===== 扇出到人（读/完成态） ===== */
CREATE TABLE IF NOT EXISTS push_items(
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  push_id     INTEGER NOT NULL,
  student_id  TEXT NOT NULL,
  status      TEXT DEFAULT 'unread',        -- unread|read|doing|done|expired
  read_at     INTEGER, started_at INTEGER, done_at INTEGER,
  result_ref  TEXT,                         -- 'project:12' / 'submission:88'
  score       INTEGER,                      -- 练习得分（题库侧回写）
  UNIQUE(push_id, student_id),
  FOREIGN KEY(push_id) REFERENCES pushes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pi_stu  ON push_items(student_id, status);
CREATE INDEX IF NOT EXISTS idx_pi_push ON push_items(push_id);

/* ===== 班级/小组花名册（现状学生名册是从事件表推导的，需要这张轻表做目标解析） ===== */
CREATE TABLE IF NOT EXISTS class_members(
  student_id TEXT PRIMARY KEY,
  class_ref  TEXT, group_ref TEXT, updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_cm_class ON class_members(class_ref);

/* ===== AI 建议推送（教师待采纳队列） ===== */
CREATE TABLE IF NOT EXISTS push_suggestions(
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    TEXT NOT NULL,
  resource_kind TEXT NOT NULL, resource_id INTEGER NOT NULL, title_snap TEXT,
  reason        TEXT, reason_stu TEXT,
  confidence    REAL,                       -- 0..1
  signals       TEXT,                       -- JSON：命中的信号，供可解释性展开
  model         TEXT,                       -- 'rule' | AI_MODEL
  state         TEXT DEFAULT 'pending',     -- pending|adopted|dismissed|stale
  push_id       INTEGER, created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ps_stu ON push_suggestions(student_id, state);
```

**与题库/视频表的契约**（那两张表由并行任务建）：本模块只持有 `(resource_kind, resource_id)` + `title_snap`，**不做外键**。解析标题时用防御式查询，表不存在也不炸：

```python
def _table_exists(c, name: str) -> bool:
    return bool(c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone())

RES_TABLE = {"video": ("videos", "title"), "exercise": ("exercises", "title"),
             "exercise_set": ("exercise_sets", "title")}

def resolve_resource(kind: str, rid: int) -> dict | None:
    t = RES_TABLE.get(kind)
    if not t: return None
    with _conn() as c:
        if not _table_exists(c, t[0]): return None
        r = c.execute(f"SELECT * FROM {t[0]} WHERE id=?", (rid,)).fetchone()   # 表名来自白名单常量
        return dict(r) if r else None
```

### 2.2 store 关键函数（`store.py` 追加）

```python
PUSH_DAILY_CAP  = int(os.getenv("PUSH_DAILY_CAP", "6"))    # 每生每日推送上限
PUSH_HOURLY_CAP = int(os.getenv("PUSH_HOURLY_CAP", "2"))
QUIET_START, QUIET_END = 21.5, 6.5                          # 夜间静默 21:30–06:30

def _today_start() -> int:
    lt = time.localtime()
    return int(time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, 0, 0, 0, 0, 0, -1)))

def _deliver_at(now: int) -> int:
    """夜间静默：落在 21:30–06:30 的推送顺延到次日 06:30 可见（入库即存在，仅不可见）。"""
    lt = time.localtime(now); h = lt.tm_hour + lt.tm_min / 60
    if h >= QUIET_START or h < QUIET_END:
        base = _today_start() + (86400 if h >= QUIET_START else 0)
        return base + int(QUIET_END * 3600)
    return now

def expand_targets(target_type: str, target_ref: str | None, student_ids: list[str] | None) -> list[str]:
    if target_type == "student":
        return list(dict.fromkeys(student_ids or []))
    col = "class_ref" if target_type == "class" else "group_ref"   # 白名单二选一，非用户输入
    with _conn() as c:
        rows = c.execute(f"SELECT student_id FROM class_members WHERE {col}=?", (target_ref,)).fetchall()
    ids = [r["student_id"] for r in rows]
    return ids or [s["id"] for s in list_students()]   # 花名册未建时退化为全体在册学生

def pushed_today(student_id: str) -> int:
    with _conn() as c:
        return c.execute(
            "SELECT COUNT(*) n FROM push_items pi JOIN pushes p ON p.id=pi.push_id "
            "WHERE pi.student_id=? AND p.created_at>=? AND p.revoked_at IS NULL",
            (student_id, _today_start())).fetchone()["n"]

def create_push(teacher_id: str, p: dict, student_ids: list[str]) -> dict:
    now = _now()
    kept = [s for s in student_ids if pushed_today(s) < PUSH_DAILY_CAP]
    skipped = [s for s in student_ids if s not in kept]
    if not kept:
        return {"pushId": None, "count": 0, "skipped": skipped, "reason": "DAILY_CAP"}
    with _lock:
        with _conn() as c:                       # 退出 with 即提交（沿用现有写法）
            cur = c.execute(
                "INSERT INTO pushes(teacher_id,target_type,target_ref,resource_kind,resource_id,"
                "title_snap,reason,reason_stu,due_at,required,source,origin_ref,deliver_at,created_at) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (teacher_id, p["target_type"], p.get("target_ref"), p["resource_kind"], p["resource_id"],
                 p.get("title_snap"), p.get("reason"), p.get("reason_stu"), p.get("due_at"),
                 1 if p.get("required") else 0, p.get("source", "manual"), p.get("origin_ref"),
                 _deliver_at(now), now))
            pid = cur.lastrowid
            c.executemany("INSERT OR IGNORE INTO push_items(push_id,student_id,status) VALUES(?,?,'unread')",
                          [(pid, s) for s in kept])
    return {"pushId": pid, "count": len(kept), "skipped": skipped}

def my_pushes(student_id: str, active_only: bool = True) -> list[dict]:
    sql = """
      SELECT pi.id AS itemId, pi.status, pi.read_at, pi.done_at, pi.result_ref,
             p.id AS pushId, p.resource_kind AS kind, p.resource_id AS resourceId,
             p.title_snap AS title, p.reason_stu AS note, p.due_at AS dueAt, p.required
      FROM push_items pi JOIN pushes p ON p.id = pi.push_id
      WHERE pi.student_id=? AND p.revoked_at IS NULL
        AND (p.deliver_at IS NULL OR p.deliver_at <= ?)
        {flt}
      ORDER BY p.required DESC, (p.due_at IS NULL), p.due_at ASC, p.created_at DESC LIMIT 50
    """.format(flt="AND pi.status <> 'done'" if active_only else "")
    with _conn() as c:
        return [dict(r) for r in c.execute(sql, (student_id, _now())).fetchall()]

def mark_push(item_id: int, student_id: str, status: str, result_ref: str | None = None) -> bool:
    col = {"read": "read_at", "doing": "started_at", "done": "done_at"}.get(status)
    if not col: return False
    with _lock, _conn() as c:
        cur = c.execute(
            f"UPDATE push_items SET status=?, {col}=COALESCE({col}, ?), result_ref=COALESCE(?, result_ref) "
            "WHERE id=? AND student_id=? AND status<>'done'",
            (status, _now(), result_ref, item_id, student_id))
        return cur.rowcount > 0

def push_records(teacher_id: str, since: int, limit: int = 50) -> list[dict]:
    with _conn() as c:
        rows = c.execute("""
          SELECT p.id AS pushId, p.title_snap AS title, p.resource_kind AS kind, p.source,
                 p.created_at AS createdAt, p.due_at AS dueAt, p.required, p.reason,
                 COUNT(pi.id) AS total,
                 SUM(pi.status='done') AS done,
                 SUM(pi.status IN ('read','doing','done')) AS opened
          FROM pushes p LEFT JOIN push_items pi ON pi.push_id=p.id
          WHERE p.teacher_id=? AND p.revoked_at IS NULL AND p.created_at>=?
          GROUP BY p.id ORDER BY p.created_at DESC LIMIT ?""",
          (teacher_id, since, limit)).fetchall()
        out = []
        for r in rows:
            d = dict(r); t = d["total"] or 1
            d["doneRate"] = round((d["done"] or 0) * 100 / t)
            d["openRate"] = round((d["opened"] or 0) * 100 / t)
            out.append(d)
        return out
```

### 2.3 端点清单（新建 `server/app/push.py`，`prefix="/api"`，与 `compliance.py` 同风格）

| 方法 | 路径 | 角色 | 说明 |
|---|---|---|---|
| POST | `/api/push` | teacher | 创建推送（可批量资源 × 批量目标；返回每条 pushId 与扇出人数） |
| GET | `/api/push/records?days=7&kind=` | teacher | 推送记录 + 完成率/打开率 |
| GET | `/api/push/{push_id}` | teacher | 明细：逐生状态（未读/已读/进行中/已完成 + 用时） |
| POST | `/api/push/{push_id}/revoke` | teacher | 软撤回（学生端立即消失，记录保留） |
| POST | `/api/push/{push_id}/remind` | teacher | 催办（受 `PUSH_HOURLY_CAP` 限制，不产生新条目） |
| GET | `/api/push/suggestions?student_id=&limit=` | teacher | AI 建议推送队列 |
| POST | `/api/push/suggestions/{sid}/adopt` | teacher | 一键采纳 → 内部走 `create_push` |
| POST | `/api/push/suggestions/{sid}/dismiss` | teacher | 忽略（进入负反馈样本） |
| GET | `/api/my/pushes?active=1` | student | 我的推送列表 |
| GET | `/api/my/pushes/badge` | student | **极轻**：`{unread, required, nearestDue}`，轮询用 |
| POST | `/api/my/pushes/{item_id}/read` | student | 标记已读 |
| POST | `/api/my/pushes/{item_id}/progress` | student | `{status:'doing'\|'done', resultRef?}` |
| GET | `/api/recommend/next?student_id=&n=3` | both | 见④（学生只能查自己） |

```python
# server/app/push.py（关键片段）
import time
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app import store
from app.auth import current_user

router = APIRouter(prefix="/api", tags=["推送与接收"])
ALLOWED_KIND = {"video", "exercise", "exercise_set"}

def _require_teacher(u: dict):
    if u.get("role") not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师权限")

class PushReq(BaseModel):
    targetType: str                      # class | group | student
    targetRef: str | None = None
    studentIds: list[str] | None = None
    resources: list[dict]                # [{kind,id,title}]
    reason: str | None = None
    dueAt: int | None = None
    required: bool = False
    source: str = "manual"
    originRef: str | None = None

SOFT = [("偏低", "还能再稳一点"), ("薄弱", "可以再练练"), ("错误率高", "多试几次就顺了"),
        ("不足", "补一补就好"), ("失败", "再来一次")]

def _soften(reason: str | None, title: str) -> str:
    """学生版文案：去诊断化 + 鼓励语气。学生永远看不到自己的低分描述。"""
    if not reason:
        return f"老师推荐你看看《{title}》，做完来找我聊聊 🐢"
    s = reason
    for bad, good in SOFT:
        s = s.replace(bad, good)
    return f"老师说：{s[:36]} 💪"

@router.post("/push")
def create_push(req: PushReq, user: dict = Depends(current_user)):
    _require_teacher(user)
    if not req.resources:
        raise HTTPException(400, "请至少选择一个资源")
    targets = store.expand_targets(req.targetType, req.targetRef, req.studentIds)
    if not targets:
        raise HTTPException(400, "没有匹配到学生")
    results = []
    for r in req.resources:
        kind = r.get("kind")
        if kind not in ALLOWED_KIND:
            raise HTTPException(400, f"不支持的资源类型：{kind}")
        meta = store.resolve_resource(kind, int(r["id"]))
        if kind == "video" and meta and meta.get("review_state") != "approved":
            raise HTTPException(422, "该视频未通过安全审核，不能推送")      # ⑤ 合规硬闸
        title = (meta or {}).get("title") or r.get("title") or "学习资源"
        res = store.create_push(user["sub"], {
            "target_type": req.targetType, "target_ref": req.targetRef,
            "resource_kind": kind, "resource_id": int(r["id"]), "title_snap": title,
            "reason": req.reason, "reason_stu": _soften(req.reason, title),
            "due_at": req.dueAt, "required": req.required,
            "source": req.source, "origin_ref": req.originRef,
        }, targets)
        results.append({**res, "title": title})
    return {"ok": True, "results": results, "targetCount": len(targets)}

@router.get("/my/pushes/badge")
def my_badge(user: dict = Depends(current_user)):
    items = store.my_pushes(user["sub"], active_only=True)
    now = int(time.time())
    return {
        "unread": sum(1 for i in items if i["status"] == "unread"),
        "required": sum(1 for i in items if i["required"] and i["status"] != "done"),
        "nearestDue": min([i["dueAt"] for i in items if i.get("dueAt")], default=None),
        "top": (items[0] if items else None),     # 胶囊只需最紧要的一条，省一次请求
        "serverTime": now,
    }

@router.post("/my/pushes/{item_id}/progress")
class _Ignore: ...   # 见下方 ProgressReq
```

```python
class ProgressReq(BaseModel):
    status: str                 # doing | done
    resultRef: str | None = None

@router.post("/my/pushes/{item_id}/progress")
def progress(item_id: int, req: ProgressReq, user: dict = Depends(current_user)):
    if req.status not in ("doing", "done"):
        raise HTTPException(400, "非法状态")
    ok = store.mark_push(item_id, user["sub"], req.status, req.resultRef)
    if not ok:
        raise HTTPException(404, "推送不存在或已完成")
    store.add_ct_event(user["sub"], "run" if req.status == "doing" else "fix",
                       f"[push] {req.status} item={item_id}", None)   # 复用既有 CT 事件通道
    return {"ok": True}
```

`main.py` 追加两行：
```python
from app.push import router as push_router
from app.recommend import router as recommend_router
app.include_router(push_router); app.include_router(recommend_router)
```

---

#### ③ 学生端接收：不破坏 `/studio` 的"默认屏只有对话"

### 3.1 核心原则

> **默认屏永远只有：中央 ChatCanvas + 底部 Composer。推送不新增任何常驻区域。**
> 推送的唯一常驻痕迹 = Composer 上方的**任务胶囊**，且**没有任务时高度为 0**。

| 状态 | 胶囊表现 | 说明 |
|---|---|---|
| 无进行中推送 | `height:0`，完全不存在 | 默认屏 = 纯对话 ✅ |
| 有未读（选做） | 单行 36px，左侧 🔴 6px 红点 + 「1 个新任务」 | 静默，**不弹窗、不播音** |
| 有未读（必做） | 单行 36px + **一次**呼吸微光（1.2s，仅首次） | 必做才配得上"浮现" |
| 进行中 | 单行 36px：`▶ 循环练习 · 还差 1 题` + RingProgress 18px | 一条即可，多条折叠为「+2」 |
| 临近截止 <2h | 胶囊底色换 `--color-warning` 软色 | 不弹层，仅换色 |

**浮现时机（防打扰）**——满足**全部**条件才做那次 1.2s 呼吸微光：
1. AI 未在流式回复中；2. 代码未在运行中；3. Composer 未聚焦；4. 用户 idle ≥ 2s；5. 本次会话尚未浮现过；6. 该条为 `required=1`。
否则一律只更新红点。轮询：`60s` + `visibilitychange` 变可见时 + 每次 `run/submit` 结束后各拉一次 `badge`（**无 WebSocket，CX 后端没有**）。

### 3.2 三层展开（深度≤3，走既有 `usePeek()`）

```
/studio（深度0，纯对话）
  └ 点胶囊 → PushPeek 抽屉（深度1）：任务清单，每条 1 行 1 判断 1 动作
       ├ 视频「▶ 播放」 → 关闭抽屉，VideoCard 以一条“系统消息”插入**对话流内**播放（深度0，不跳页）
       └ 练习「开始练习」→ 两种路径：
            · 小题（单函数/单输出）→ ExerciseCard 内联在对话流，Monaco 精简高度 220px（深度0）
            · 大题（多文件/带图形）→ 跳 IDE：/studio?ide=1&push=<itemId>（深度1，返回即回对话）
  └ 详情（可选，深度2）：InsightRail「进阶」页签同步展示，不再新开层
```

> **为什么视频/练习回到对话流内**：CX 的 V2 决定"对话是唯一主体"。资源作为**一条消息卡片**出现，与小龟的话语同流，学生不需要建立"另一个地方"的心智模型。抽屉只是"选单"，不是"容器"。

### 3.3 组件清单与 props

| 组件 | 路径 | props | emits |
|---|---|---|---|
| `TaskCapsule.vue` | `components/student/TaskCapsule.vue` | `{ badge: PushBadge \| null; busy: boolean }`（`busy`= AI 流式/代码运行中，用于抑制浮现） | `open`（点击→开 Peek） |
| `PushPeek.vue` | `components/student/PushPeek.vue` | `{ items: MyPush[]; loading: boolean }` | `play:[MyPush]` / `start:[MyPush]` / `close` |
| `VideoCard.vue` | `components/student/VideoCard.vue` | `{ item: MyPush; src: string; poster?: string; maxSeconds?: number }` | `progress:[pct]` / `done` / `overtime` |
| `ExerciseCard.vue` | `components/student/ExerciseCard.vue` | `{ item: MyPush; starterCode: string; language: 'python'\|'cpp'; compact?: boolean }` | `run:[code]` / `submit:[{code,passed}]` / `expand`（转 IDE） |
| `PushNote.vue` | 同上目录 | `{ text: string }` — 只渲染 `reason_stu` | — |
| `usePushInbox.ts` | `composables/usePushInbox.ts` | — | 暴露 `badge / items / refresh() / markRead(id) / markDone(id, ref)` |

```vue
<!-- TaskCapsule.vue —— 结构极简，L0 动效（CSS 令牌 + <Transition>） -->
<template>
  <Transition name="capsule">
    <button v-if="badge && (badge.unread || badge.top)" class="cap glass" @click="$emit('open')">
      <span v-if="badge.unread" class="cap__dot" />
      <span class="cap__txt">{{ label }}</span>
      <RingProgress v-if="pct !== null" :value="pct" size="18px" />
      <span class="cap__arrow">›</span>
    </button>
  </Transition>
</template>
<style scoped>
.cap{display:flex;align-items:center;gap:var(--sp-2);height:36px;padding:0 var(--sp-3);
  border-radius:var(--r-pill);font-size:var(--fs-sm);color:var(--color-text-2);cursor:pointer;
  transition:transform var(--dur-fast) var(--ease);}
.cap:hover{transform:translateY(-1px);}
.cap__dot{width:6px;height:6px;border-radius:50%;background:var(--color-danger);}
.capsule-enter-from,.capsule-leave-to{opacity:0;transform:translateY(6px);}
.capsule-enter-active,.capsule-leave-active{transition:all var(--dur) var(--ease);}
/* 必做首次浮现：仅一次呼吸，reduced-motion 自动禁用 */
.cap--pulse{animation:breathe 1.2s var(--ease) 1;}
@keyframes breathe{50%{box-shadow:0 0 0 6px rgba(245,166,35,.18);}}
:root[data-reduced-motion="true"] .cap--pulse{animation:none;}
</style>
```

```ts
// composables/usePushInbox.ts（要点）
const badge = ref<PushBadge | null>(null)
let timer: number | undefined
export function usePushInbox() {
  async function refresh() { badge.value = await pushApi.badge() }
  onMounted(() => {
    refresh()
    timer = window.setInterval(() => { if (!document.hidden) refresh() }, 60_000)
    document.addEventListener('visibilitychange', onVis)
  })
  onUnmounted(() => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis) })
  return { badge, refresh, markRead, markDone }
}
```

```ts
// web/src/api/push.ts（沿用 CX 的 fetch + authH + 失败返回 null 约定）
import { useAuthStore } from '@/stores/auth'
function authH(json = true): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${useAuthStore().token}` }
  if (json) h['Content-Type'] = 'application/json'
  return h
}
export const pushApi = {
  async badge() { try { const r = await fetch('/api/my/pushes/badge', { headers: authH(false) }); return r.ok ? r.json() : null } catch { return null } },
  async mine()  { try { const r = await fetch('/api/my/pushes?active=1', { headers: authH(false) }); return r.ok ? r.json() : [] } catch { return [] } },
  read(id: number)  { fetch(`/api/my/pushes/${id}/read`, { method: 'POST', headers: authH() }).catch(() => {}) },
  progress(id: number, status: 'doing' | 'done', resultRef?: string) {
    return fetch(`/api/my/pushes/${id}/progress`, { method: 'POST', headers: authH(), body: JSON.stringify({ status, resultRef }) })
  },
  send(body: unknown) { return fetch('/api/push', { method: 'POST', headers: authH(), body: JSON.stringify(body) }).then(r => r.json()) },
}
```

**明确"默认隐藏什么"**：
- 隐藏：推送列表、教师理由原文（诊断版）、班级完成率对比、他人进度、通知中心、任何角标数字 >9 的堆积感（>9 显示「9+」但胶囊只说"还有几个任务"）。
- 显示：最紧要的**一条** + 一个红点。其余全部在 Peek 里。

---

#### ④ AI 智能推荐

### 4.1 推荐信号（全部来自现有数据，零新埋点）

| 信号 | 数据源（现成） | 用法 |
|---|---|---|
| **薄弱维度** | `ct.summary_for()` 的 `ct_scores` 六维 | 取最低 1–2 维（`verify` 低 → 推调试类；`model` 低 → 推流程图/伪代码类视频） |
| **错题知识点** | `ct_events` 中 `type='error'` 的 `detail` + 题库 `submissions`（若已建） | 提取报错类型 topN（`IndexError`/`语法`/`死循环`），映射到题库 `tags` |
| **难度爬升** | `push_items.status='done'` + `exercises.difficulty` | 最近 3 题全 done → 升一档；连续 2 题未完成 → 降一档；默认 easy→medium |
| **成功率/挫败度** | `summary_for().success_rate`、`errors/runs` | `success_rate < 40%` → 强制先推**视频**再推练习（先降载） |
| **冷却与去重** | `push_items` 近 14 天 | 已推过的 `resource_id` 全部剔除；同 tag 一周最多 2 次 |
| **频次闸** | `pushed_today()` | 超 `PUSH_DAILY_CAP` 直接不产生建议 |
| **同意状态** | `store.has_consent()` | **未取得监护人同意 → 不做画像推荐**，只允许教师手动推送 |

### 4.2 后端 `server/app/recommend.py`（规则召回 + LLM 排序的混合）

分工铁律：**规则负责召回与硬过滤（可审计、可解释、零成本）；LLM 只做排序 + 一句话理由 + 置信度，且只能从给定候选 id 中选**（防幻觉出不存在的题）。LLM 不可达 → 规则分排序，`model='rule'`，功能不降级（沿用 `ai.py` 的 fallback 哲学）。

```python
"""AI 智能推荐（规则召回 + LLM 重排）。复用 app.ai._call_llm 与 app.ct.summary_for。"""
import json, time
from fastapi import APIRouter, Depends, HTTPException
from app import store
from app.ai import _call_llm, AI_MODEL
from app.ct import summary_for
from app.auth import current_user

router = APIRouter(prefix="/api/recommend", tags=["智能推荐"])

DIM_TAG = {"decompose": ["拆解", "函数"], "abstract": ["变量", "抽象"], "model": ["流程图", "伪代码"],
           "algorithm": ["循环", "条件", "排序"], "verify": ["调试", "边界", "测试"], "transfer": ["综合", "项目"]}
NEXT_LEVEL = {"easy": "medium", "medium": "hard", "hard": "hard"}

def collect_signals(sid: str) -> dict:
    cs = summary_for(sid)
    weak = sorted(cs["ct_scores"].items(), key=lambda kv: kv[1])[:2]
    errs = [e["detail"] or "" for e in store.ct_events(sid, 200) if e["type"] == "error"][-10:]
    return {
        "weakDims": [{"dim": d, "score": v} for d, v in weak],
        "successRate": cs["success_rate"], "runs": cs["runs"], "errors": cs["errors"],
        "recentErrors": errs,
        "level": store.recent_difficulty(sid) or "easy",
        "cooldownIds": store.recent_pushed_ids(sid, days=14),
    }

def recall(sig: dict, n: int = 8) -> list[dict]:
    """规则召回：标签命中 + 难度带 + 冷却剔除 + 审核态过滤。返回候选（含 kind/id/title/tags/difficulty）。"""
    tags = [t for d in sig["weakDims"] for t in DIM_TAG.get(d["dim"], [])]
    want_video_first = sig["successRate"] < 40 or sig["runs"] < 3
    level = sig["level"] if not want_video_first else sig["level"]
    return store.search_resources(tags=tags, difficulty=level, exclude_ids=sig["cooldownIds"],
                                  prefer_kind="video" if want_video_first else "exercise", limit=n)

SYS = (
  "你是中小学信息科技课的学习资源推荐助手，服务对象是初中生的任课教师。"
  "你只能从给定候选资源里挑选，禁止编造不在候选中的 id 或标题。"
  "理由必须引用具体信号（薄弱维度分数 / 最近错误类型 / 已完成难度），一句话，不超过 30 字。"
  "面向教师的理由要具诊断性；面向学生的文案要鼓励、不得提及分数或“薄弱/落后”等评价词。"
  "只输出 JSON，不要任何解释文字或 markdown 代码围栏。"
)

def rank(sig: dict, cands: list[dict], n: int) -> list[dict]:
    payload = {"signals": sig, "candidates": cands, "topN": n}
    out = _call_llm(SYS, [{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}])
    try:
        data = json.loads((out or "").strip().strip("`").replace("json\n", "", 1))
        ok_ids = {(c["kind"], c["id"]) for c in cands}
        picks = [p for p in data["recommendations"] if (p["kind"], p["id"]) in ok_ids][:n]
        for p in picks: p["model"] = AI_MODEL
        return picks
    except Exception:
        return rule_rank(sig, cands, n)          # 幻觉 / 解析失败 / 网络不可达 → 规则兜底

def rule_rank(sig: dict, cands: list[dict], n: int) -> list[dict]:
    weak = sig["weakDims"][0]["dim"] if sig["weakDims"] else "algorithm"
    tags = set(DIM_TAG.get(weak, []))
    scored = sorted(cands, key=lambda c: -len(tags & set(json.loads(c.get("tags") or "[]"))))
    return [{"kind": c["kind"], "id": c["id"], "title": c["title"],
             "reasonTeacher": f"{weak} 维度偏低，该资源覆盖{'/'.join(tags) or '相关'}知识点",
             "reasonStudent": "这个练完，你会更有把握 💪", "confidence": 0.55, "model": "rule"}
            for c in scored[:n]]

@router.get("/next")
def next_for(student_id: str | None = None, n: int = 3, user: dict = Depends(current_user)):
    is_teacher = user.get("role") in ("teacher", "researcher")
    sid = student_id if (is_teacher and student_id) else user["sub"]
    if not is_teacher and student_id and student_id != user["sub"]:
        raise HTTPException(403, "越权")
    if not store.has_consent(sid):                       # ⑤ 未成年人合规闸
        return {"recommendations": [], "reason": "CONSENT_REQUIRED"}
    sig = collect_signals(sid)
    if store.pushed_today(sid) >= store.PUSH_DAILY_CAP:
        return {"recommendations": [], "reason": "DAILY_CAP"}
    cands = recall(sig, n=8)
    picks = rank(sig, cands, n) if cands else []
    for p in picks:                                       # 写入教师待采纳队列
        store.save_suggestion(sid, p, sig)
    if not is_teacher:                                    # 学生视角：只回鼓励文案，不回诊断
        picks = [{"kind": p["kind"], "id": p["id"], "title": p["title"], "note": p["reasonStudent"]} for p in picks]
    return {"studentId": sid, "recommendations": picks,
            "signals": sig if is_teacher else None, "generatedAt": int(time.time())}
```

### 4.3 LLM 输出 JSON Schema（严格）

```json
{
  "recommendations": [
    {
      "kind": "video | exercise | exercise_set",
      "id": 42,
      "title": "候选中的原标题，不得改写",
      "reasonTeacher": "verify 32 分，近 3 次均为循环越界报错",
      "reasonStudent": "试试这个，循环边界会更稳 💪",
      "confidence": 0.82,
      "signalsUsed": ["weakDim:verify", "error:IndexError", "level:easy→medium"]
    }
  ]
}
```

**Prompt 要点**（已写进 `SYS`）：① 只能从候选选，禁编造 id；② 理由必须引用具体信号，≤30 字；③ 教师版诊断 / 学生版鼓励**双份**；④ `confidence ∈ [0,1]`；⑤ 纯 JSON 无围栏。
**后置校验**（代码已做）：`(kind,id)` 必须在候选集合内，否则整条丢弃并回退规则排序——这是防幻觉的最后一道闸。

### 4.4 教师端「AI 建议推送」卡片 `AiSuggestCard.vue`

放在 `/teacher/teaching/today`（今日）与 `/teacher/teaching/alerts`（预警）行内展开处。**一瓷片 = 1 判断 + 1 动作**。

```vue
<template>
  <CeramicTile tint="lavender" :title="s.title" :sub="`推荐给 ${s.studentName}`">
    <p class="why">{{ s.reasonTeacher }}</p>
    <div class="foot">
      <span class="conf" :class="level">置信度 {{ Math.round(s.confidence * 100) }}%</span>
      <button class="lnk" @click="$emit('why', s)">依据</button>
      <span class="sp" />
      <button class="ghost" @click="$emit('dismiss', s.id)">忽略</button>
      <button class="cta" @click="$emit('adopt', s.id)">采纳并推送</button>
    </div>
  </CeramicTile>
</template>
<script setup lang="ts">
defineProps<{ s: Suggestion }>()   // Suggestion: {id,studentId,studentName,kind,resourceId,title,reasonTeacher,confidence,signals}
defineEmits<{ adopt: [number]; dismiss: [number]; why: [Suggestion] }>()
</script>
```

- 置信度视觉：≥0.75 绿(`--color-success`) / 0.5–0.75 琥珀(`--color-warning`) / <0.5 **不展示**（低置信不打扰教师）。
- 「依据」→ `usePeek()` 深度1，展示 `signals` JSON 的人话版（薄弱维度雷达 + 最近 3 条报错），**可解释性 = 教师信任的前提**。
- 「采纳并推送」→ `POST /api/push/suggestions/{id}/adopt`，内部复用 `create_push`，`source='ai_suggest'`、`origin_ref='suggest:{id}'` —— 后续可统计"AI 建议采纳率 / 采纳后完成率 vs 手动推送完成率"，这是教研板块的现成叙事素材。
- 忽略 → `state='dismissed'`，作为负反馈样本（后续调 recall 权重）。

---

#### ⑤ 未成年人合规

### 5.1 视频外链安全

| 措施 | 落点 | 实现 |
|---|---|---|
| **域名白名单** | 入库时 + 推送时双校验 | `VIDEO_ALLOWED_HOSTS` env（默认：本站对象存储、`*.eduyun.cn`、`*.people.com.cn` 等审定源）；`urlparse(url).hostname` 必须命中后缀，否则 422 |
| **人工审核态** | `videos.review_state ∈ pending\|approved\|rejected` | **`approved` 才允许被推送**（`push.py` 已硬校验）；`pending` 只能在教师侧预览 |
| **播放沙箱** | `VideoCard.vue` | 站内 `<video>` 优先；必须 iframe 时：`sandbox="allow-scripts allow-same-origin"`（**不给** `allow-popups` / `allow-top-navigation` / `allow-forms`）+ `referrerpolicy="no-referrer"` + `allow=""` |
| **无外跳/无评论区** | 前端 | 卡片不渲染任何跳转按钮；不加载第三方评论/推荐位；播放结束不自动播下一条（无 autoplay-next） |
| **失效兜底** | 前端 | 加载失败显示「资源暂时看不了，已通知老师」+ 后台记 `risk_events(category='resource_broken', level=1)` |

### 5.2 推送频次与防沉迷

- `PUSH_DAILY_CAP=6`（每生每日）、`PUSH_HOURLY_CAP=2`（含催办），超限**服务端静默跳过并回报 `skipped`**，教师端提示「3 人今日已达上限，明天自动补推」。
- **夜间静默** 21:30–06:30：`_deliver_at()` 顺延到次日 06:30 可见（入库即存在，只是不投递）。
- **单条时长建议**：视频 ≤ 8 分钟；`VideoCard` 连续播放累计 20 分钟 → 触发 `overtime`，插入小龟消息「歇 3 分钟，站起来走走 🐢」并暂停。
- **总时长联动**：复用 `usage_sessions`（`/api/usage/heartbeat` 已有）。当日累计 > 阈值时，`badge` 接口对**选做**推送返回 `unread=0`（只保留必做），从源头减少诱因。
- **零声音、零系统通知、零 App 角标**：全部提示止于页面内 6px 红点。

### 5.3 学生可见范围

- 学生只能查询 `push_items.student_id = 自己`（所有端点用 `user["sub"]` 作条件，不接受前端传 id）。
- **学生看不到**：`pushes.reason`（诊断原文）、班级完成率、他人状态、置信度、`signals`、六维分数原值。接口层已做字段裁剪（`next_for` 里对非教师只回 `note`）。
- **AI 个性化推荐受监护人同意门禁**：`store.has_consent(sid)` 为假 → 返回 `CONSENT_REQUIRED`，不生成任何画像；教师仍可手动推送（手动推送不构成自动化画像决策）。与 `ai.py` 的同意门禁一致。
- **可撤回可追溯**：撤回用 `revoked_at` 软删，学生端立即不可见但审计记录保留；`push_suggestions.signals` 留存推荐依据，满足"自动化决策可解释、可申诉"。
- **数据最小化**：`push_items` 不存任何自由文本作答内容，只存 `result_ref` 指针；理由字段进 LLM 前不含学生姓名（`collect_signals` 只传统计量与报错文本，报错文本走 `guard.anonymize()` 再送）。

---

#### 落地文件清单

**后端**（`D:\VB\jiedui-code-platform\CX\server\app\`）
- `store.py` — 追加 4 张表进 `init()` 的 `executescript`；追加 `expand_targets / create_push / my_pushes / mark_push / push_records / pushed_today / save_suggestion / recent_pushed_ids / recent_difficulty / search_resources / resolve_resource` 及常量 `PUSH_DAILY_CAP / PUSH_HOURLY_CAP / QUIET_*`
- `push.py`（新建，`prefix="/api"`）— 12 个端点
- `recommend.py`（新建，`prefix="/api/recommend"`）— `/next`
- `main.py` — `include_router` ×2
- `_smoke_push.py`（新建，对齐现有 `_smoke_*.py` 风格）— 推送扇出 / 频次上限 / 越权 / 未审核视频拒推 / 完成率统计 5 条冒烟

**前端**（`D:\VB\jiedui-code-platform\CX\web\src\`）
- `api/push.ts`、`api/recommend.ts`（新建，fetch + `authH()` + 失败返回 null）
- `components/teacher/PushSheet.vue`、`PushTargetPicker.vue`、`PushRecordsPanel.vue`、`AiSuggestCard.vue`
- `components/student/TaskCapsule.vue`、`PushPeek.vue`、`VideoCard.vue`、`ExerciseCard.vue`、`PushNote.vue`
- `composables/usePush.ts`（教师，全局单例）、`usePushInbox.ts`（学生，轮询）
- `layouts/TeacherShell.vue` — 根部挂一次 `<PushSheet v-model:open="…">`
- `views/student/StudioView.vue` — Composer 上方插 `<TaskCapsule>`，对话流 renderer 增加 `video` / `exercise` 两种消息卡类型

**动效分级**：胶囊/红点/抽屉 = **L0**（CSS 令牌 + `<Transition>`）；PushSheet 滑入与列表 stagger = **L1**（`useMotion`，≤2KB）；不引任何动效库。

