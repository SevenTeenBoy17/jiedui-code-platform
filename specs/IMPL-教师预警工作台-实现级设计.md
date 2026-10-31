# IMPL · 教师预警工作台（教学研究 + 预警仪表盘）— 实现级设计

> 本文是《补充与优化升级_开发计划书与技术路线.md》**§4.8 教师预警工作台**的实现级展开。上层文档给出方向（从"后台管理"升级为"教学研究 + 监管工作台"，按 `教师后端界面2.jpg` 预警系统 + `教师后端界面.jpg` 浅色数据大屏还原，含学生统计/教师身份/获奖/班级分布/学生关怀 + 三栏预警 + 六维雷达 + 完成漏斗）。本文落到具体的 **Vue3 布局组件树、首页栅格还原、预警中心分级与处置、学情画像 ECharts option、班级/任务管理、脱敏导出、聚合层 API 请求/响应 Schema、关键组件 `<script setup>` 代码、设计令牌、逐条验收**，工程师可直接照此编码。

---

## 0. 范围、定位与硬约束

### 0.1 定位（课题驱动，不可偏离）

| 课题原则 | 在本工作台的落地 |
|---|---|
| 教师端不是后台管理，而是**教学研究 + 监管工作台** | 首页以"谁卡住 / 卡在哪 / 需介入"为核心信息架构，而非 CRUD 列表 |
| 从"后期批改"→"**实时指导**" | 预警中心轮询/WS 实时刷新；课堂实时面板（在线/报错热力/AI 求助频次）；高危预警秒级出现 |
| 保证**学生主体地位**、防**过度依赖** | 学情画像把"AI 依赖指数"作为一等指标；教师看到的是"过程证据 + 介入建议"而非代答入口 |
| 数据**伦理护栏** | 全程**假名展示**；真实身份仅在"介入"按权限解析且单独审计；研究导出强制经脱敏 |

### 0.2 技术栈与硬约束

- 前端：**Vue3 + TS + Vite + ECharts**（`echarts` 按需引入）；状态用 **Pinia**；路由 **Vue Router**；HTTP 用 `axios` 封装。
- 后端：**FastAPI + PostgreSQL**（沿用 `learning.` / `research.` 分库 schema）。
- 鉴权：教师 token，统一会话头 **`X-CodeX-Session`**（Phase 2J 约定），接口经 **`require_teacher`** + **班级数据域隔离**（教师仅见本班）。
- 教师端与学生端**完全分离**：独立布局 `TeacherShell.vue`、独立路由前缀 `/teacher/*`、独立登录入口（`/teacher` 登录页，JWT `role=teacher`）、独立 Pinia 模块、独立设计令牌。**学生端 pastel + 吉祥物；教师端浅色数据大屏 + 蓝绿点缀 + 高数据密度。**

### 0.3 数据来源（与上游对齐，禁止自造）

| 工作台板块 | 数据来源 | 上游契约 |
|---|---|---|
| 三栏预警流 / 高危锁定通知 | `learning.risk_events` + `GET /api/teacher/alerts` | `IMPL-数据安全合规-实现级设计.md` §8.4/§8.5 |
| 介入回执 | `POST /api/teacher/alerts/{id}/handle` | 同上 §8.5 |
| 六维雷达 / 班级分布 / 任务漏斗 / 关注名单 | `GET /api/teacher/classes/{id}/ct-overview` | `IMPL-计算思维六维评价-实现级设计.md` §8.3 |
| 在线状态 / AI 求助频次 / 作品提交 / 报错热力 | `ai_messages`、`submissions`、`learning.code_runs` | `IMPL-三语言真实执行-实现级设计.md` §7（`code_runs`） |
| 设计过程证据（先设计后编码时间线） | `design_artifacts` | `IMPL-流程图伪代码设计工具-实现级设计.md` |
| 个体下钻画像 | `GET /api/student/{id}/ct-profile` | `IMPL-计算思维六维评价-实现级设计.md` §8.2 |

> **聚合原则**：上游已有的"原子契约"不重复实现；本文新增的是**教师端聚合层**（`GET /api/teacher/home`、`/realtime`、`POST /api/teacher/assignments`），把多个原子源在服务端拼成首页/课堂一次性视图，降低前端请求扇出。

---

## 1. 模块架构与文件树

### 1.1 教师端在前端工程中的位置（与学生端物理分离）

```
src/
├── main.ts                       # createApp + router + pinia + echarts 注册
├── router/
│   ├── index.ts                  # 顶层路由：/login、/teacher/login、/teacher/*、/student/*
│   ├── guards.ts                 # requireTeacher / requireStudent 守卫（角色 + aud 校验）
│   └── teacher.routes.ts         # 教师端子路由（懒加载）
├── shared/
│   ├── http.ts                   # axios 实例：注入 X-CodeX-Session、401→登录、错误规范化
│   ├── echarts.ts                # echarts 按需注册（radar/bar/funnel/pie/heatmap + 主题）
│   └── format.ts                 # 时间/百分比/假名展示工具
└── teacher/                      # ★ 教师端独立子应用，学生端不 import 此目录
    ├── TeacherShell.vue          # 独立布局：顶部蓝色导航 + 内容区（≠ 学生端 Shell）
    ├── theme/
    │   └── teacher-tokens.css    # 教师端设计令牌（浅色数据大屏，§9）
    ├── api/
    │   ├── home.ts               # GET /api/teacher/home
    │   ├── alerts.ts             # GET /api/teacher/alerts、POST .../{id}/handle
    │   ├── ctOverview.ts         # GET /api/teacher/classes/{id}/ct-overview
    │   ├── realtime.ts           # GET /api/teacher/classes/{id}/realtime（轮询/WS）
    │   ├── assignments.ts        # POST /api/teacher/assignments、GET 列表
    │   └── exports.ts            # POST /api/research/export、班级报告/成长档案
    ├── stores/
    │   ├── teacherSession.ts     # 当前教师身份、所带班级、身份切换（辅导员/学科）
    │   ├── alerts.ts             # 预警列表 + 轮询/WS 合并 + 处置乐观更新
    │   ├── home.ts               # 首页聚合缓存
    │   └── realtime.ts           # 课堂实时（在线/热力/求助频次）
    ├── composables/
    │   ├── usePolling.ts         # 可见性感知轮询（页面隐藏暂停）
    │   ├── useAlertStream.ts     # WS 优先、轮询兜底的预警流
    │   └── useEchart.ts          # ECharts 生命周期（init/resize/dispose）封装
    ├── views/
    │   ├── HomeDashboard.vue     # 首页（还原 教师后端界面2.jpg 栅格）
    │   ├── AlertCenter.vue       # 预警中心（分级/类型/处置）
    │   ├── ClassPortrait.vue     # 学情画像（六维雷达/漏斗/分布/下钻）
    │   ├── ClassTasks.vue        # 班级与任务管理 + 实时课堂
    │   └── DataExport.vue        # 数据导出（报告/成长档案/研究数据）
    └── components/
        ├── nav/TopNavBar.vue            # 顶部蓝色导航 + 身份切换 + 课堂状态
        ├── home/StudentStatsCard.vue    # 左上：学生统计（性别环形 52%/48%）
        ├── home/TeacherIdentityCard.vue # 中央：3D 教师形象 + 工号/职称/学院 + 身份切换
        ├── home/HonorCard.vue           # 右上：获奖荣誉
        ├── home/ClassDistributionCard.vue # 左中：班级分布（横向条形）
        ├── home/CareCard.vue            # 右中：学生关怀（数字卡）
        ├── alert/AlertPanel.vue         # 底部三栏预警 + 列表 + 处置入口
        ├── alert/AlertItem.vue          # 单条预警（分级徽标 + 假名 + 处置按钮）
        ├── alert/HandleDialog.vue       # 介入回执弹窗
        ├── portrait/CtRadarCard.vue     # 六维雷达
        ├── portrait/TaskFunnelCard.vue  # 任务完成漏斗
        ├── portrait/CtDistributionCard.vue # 班级 CT 分布（堆叠条）
        ├── portrait/AttentionList.vue   # 关注名单（谁卡住）→ 下钻
        ├── realtime/OnlineGrid.vue      # 在线状态网格
        ├── realtime/ErrorHeatmap.vue    # 报错热力
        └── common/StatNumber.vue        # 大数字 KPI 卡（数据大屏字形）
```

### 1.2 与学生端的隔离边界（验收必检）

- **路由隔离**：`/teacher/*` 全部经 `requireTeacher` 守卫；学生 token 进入 `/teacher/*` → 重定向 `/teacher/login`，前端不渲染任何教师组件。
- **代码隔离**：`src/teacher/` 不 import `src/student/` 任何模块；ESLint `no-restricted-imports` 规则强制（构建期断言）。
- **视觉隔离**：`TeacherShell.vue` 根节点挂 `data-app="teacher"`，仅加载 `teacher-tokens.css`，与学生端 pastel 令牌不共享变量名空间。
- **数据隔离**：所有教师 API 后端经 `require_teacher` + 班级域过滤；越权查他班 `403`。

---

## 2. 页面信息架构（按参考图还原）

### 2.1 顶部导航（`TopNavBar.vue`，对齐 教师后端界面2.jpg 顶栏）

- 左：系统名「结对编程教学预警台」+ logo。
- 中：主导航五项 **首页 / 预警中心 / 学情画像 / 班级任务 / 数据导出**（参考图为"首页/预警中心/数字育人/数据管理"，本平台按课题语义映射为上述五项）。
- 右：消息铃铛（未处置高危角标）、**身份切换**（辅导员 ↔ 学科教师，影响数据域）、当前教师名、课堂状态徽标（上课中/课间）。

### 2.2 首页栅格（`HomeDashboard.vue`，12 列网格还原 教师后端界面2.jpg）

```
┌────────────────────────────────────────────────────────────────────────────┐
│  TopNavBar（贯通）                                                            │
├──────────────┬───────────────────────────────────┬──────────────────────────┤
│ 学生统计      │            教师身份卡               │   获奖荣誉                │
│ StudentStats │   TeacherIdentityCard（3D 形象）    │   HonorCard              │
│ 性别环形      │   工号/职称/学院 + 身份切换按钮      │   获奖人数/班级 + 柱状     │
│ 52% / 48%    │                                    │                          │
│ (col 1-3)    │            (col 4-9)               │   (col 10-12)            │
├──────────────┤                                    ├──────────────────────────┤
│ 班级分布      │                                    │   学生关怀                │
│ ClassDistrib │                                    │   CareCard（数字卡）      │
│ 横向条形      │                                    │   班级数 51 / 关怀 3      │
│ (col 1-3)    │                                    │   (col 10-12)            │
├──────────────┴───────────────────────────────────┴──────────────────────────┤
│  预警信息（AlertPanel，三栏）                                                  │
│  ┌──────────────┬──────────────────┬──────────────────────────────────────┐  │
│  │ 今日行为记录   │ 不在校预警 (13)   │ 学业预警态势 (8，高/中优先级)          │  │
│  │ 出码/求助/提交 │ 离线/分心列表     │ 计算思维卡顿学生列表（带分级 + 处置）  │  │
│  └──────────────┴──────────────────┴──────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

栅格用 CSS Grid：`grid-template-columns: repeat(12, 1fr); gap: 16px;`。各卡片 `grid-column` 跨度如上注。首页**一次性**调 `GET /api/teacher/home` 拿全部聚合数据（避免 6 个卡片各发请求）。

### 2.3 三栏预警语义（对齐课题，参考图数字落位）

| 栏目 | 来源 | 课题语义 |
|---|---|---|
| **今日行为记录** | `home.today_activity`（聚合 `code_runs`/`ai_messages`/`submissions`） | 班级今日总出码/求助/提交计数 → 课堂活跃度 |
| **不在校预警 (13)** | `home.offline_alerts`（在线状态 + 分心信号） | 离线/长时间无操作/疑似分心（非学业，行为监管维度） |
| **学业预警态势 (8)** | `home.academic_alerts`（来自 ct-overview `attention_list` + `risk_events` 中 L1/L2 学业类） | 计算思维卡顿、AI 依赖偏高 → 高/中优先级，**带处置入口** |

> 高危对话（L3/L4，self_harm/violence 等）**不混入**学业态势栏，而是顶部铃铛 + 预警中心置顶红条，强制"已介入"回执（§3.4）。

---

## 3. 预警中心（`AlertCenter.vue`）

### 3.1 预警分级与类型（双维度）

**分级（level，0-4，对齐 `risk_events.level`）**：

| 级别 | 语义 | 工作台呈现 | 处置要求 |
|---|---|---|---|
| **高 / L4** | 锁定会话（自伤/暴力） | 红色置顶 + 铃铛角标 + 强提醒 | **必须**"已介入"回执 |
| **高 / L3** | 阻断 + 通知教师（成人/诈骗/隐私泄露） | 红色 | 需回执 |
| **中 / L2** | 阻断该消息 + 学业卡顿/AI 依赖偏高 | 橙色 | 建议处置 |
| **低 / L1** | 记录不拦（轻度行为/学业信号） | 蓝色 | 可忽略，纳入态势统计 |

**类型（category）**，工作台分四大类（前两类来自 `risk_events`，后两类为本工作台扩展的"学业/行为"软预警，由聚合层从 CT/行为数据派生）：

| 类型 | 来源 | 默认级 |
|---|---|---|
| **高危对话** `self_harm/violence/adult/fraud/privacy_leak` | `risk_events`（L3/L4） | 高 |
| **AI 依赖** `ai_dependency` | `ct-overview.ai_dependency` + `ai_dependency_index` | 中 |
| **学业-计算思维卡顿** `ct_stuck` | `ct-overview.attention_list`（`weakest_dim`） + `code_runs` 反复报错 | 中/低 |
| **不在校/分心** `offline` | `realtime` 在线状态（无操作时长阈值） | 低 |

### 3.2 列表与筛选

- 筛选条：`status`（open/handled）× `level`（多选 3,4 / 1,2）× `category` × `class_id`。
- 直接复用 `GET /api/teacher/alerts?status=open&level=3,4&class_id=c1&page=1`（高危对话流）；学业/行为软预警由 `GET /api/teacher/home` 的 `academic_alerts`/`offline_alerts` 提供，前端在中心页**合并展示**并用 `source` 字段区分。
- 列表项：分级徽标 + **假名**（`student_pseudonym`，禁止显示真实姓名）+ 类型图标 + 摘要 + `created_at` 相对时间 + 处置按钮。

### 3.3 实时刷新（轮询优先 + WS 增强）

```
useAlertStream(classId)
  ├── 首选 WS：wss://…/ws/teacher/alerts?class_id=c1（后端推 risk_event 新事件）
  ├── WS 不可用 → usePolling(GET /api/teacher/alerts, 10s)
  ├── 页面隐藏（visibilitychange）→ 暂停轮询/降频
  └── 新高危事件到达 → 顶部红条 + 浏览器通知（教师授权后）+ 铃铛角标 +1
```

- 轮询间隔 10s（高危场景）/ 30s（普通）；WS 到达时立即 `alertsStore.upsert(event)`，与轮询结果按 `id` 去重合并。
- **乐观更新**：处置成功前先把该项标 `handling`，失败回滚。

### 3.4 处置（介入回执）

- 点击"介入"→ `HandleDialog.vue`：要求填写处置说明（L4 必填，前端校验非空）。
- 提交 → `POST /api/teacher/alerts/{id}/handle`，body `{ "note": "已联系班主任与家长，学生情绪稳定" }`；成功后该项移入"已处置"，后端写审计 `risk.handled`。
- **真实身份解析**：仅在打开 L3/L4 处置弹窗时，前端额外请求受权限控制的 `GET /api/teacher/alerts/{id}/identity`（心理教师/课题组角色才返回，且该解析单独审计）；普通学科教师只看假名 + 处置入口。

---

## 4. 学情画像（`ClassPortrait.vue`）

数据全部来自 `GET /api/teacher/classes/{id}/ct-overview`（一次取齐六维分布/漏斗/AI 依赖/关注名单），个体下钻链到 `GET /api/student/{id}/ct-profile`。

### 4.1 六维雷达（`CtRadarCard.vue`，ECharts radar）

把 `dimension_distribution` 各维按水平加权折算成 0-4 的班级均分（`score = Σ(Lk × k) / N`），雷达展示班级当前六维画像；可叠加上一时段虚线对比。

```ts
// CtRadarCard.vue 内 buildRadarOption
const DIMS = [
  { key: 'abstraction', name: '抽象' },
  { key: 'decomposition', name: '分解' },
  { key: 'modeling', name: '建模' },
  { key: 'algorithm_design', name: '算法设计' },
  { key: 'verification_optimization', name: '验证优化' },
  { key: 'transfer', name: '迁移' },
]
function levelMean(d: Record<'L1'|'L2'|'L3'|'L4', number>): number {
  const n = d.L1 + d.L2 + d.L3 + d.L4 || 1
  return (d.L1 * 1 + d.L2 * 2 + d.L3 * 3 + d.L4 * 4) / n
}
export function buildRadarOption(dist: Record<string, any>, prev?: Record<string, any>) {
  const cur = DIMS.map(d => +levelMean(dist[d.key]).toFixed(2))
  const series = [{ value: cur, name: '本周班级', areaStyle: { opacity: 0.25 } }]
  if (prev) series.push({ value: DIMS.map(d => +levelMean(prev[d.key]).toFixed(2)),
                          name: '上周', lineStyle: { type: 'dashed' } })
  return {
    color: ['#2F6BFF', '#13C2C2'],
    tooltip: {},
    legend: { bottom: 0, textStyle: { color: '#5A6B87' } },
    radar: {
      indicator: DIMS.map(d => ({ name: d.name, max: 4 })),
      radius: '66%',
      splitNumber: 4,
      axisName: { color: '#33415C', fontSize: 12 },
      splitLine: { lineStyle: { color: 'rgba(47,107,255,0.12)' } },
      splitArea: { areaStyle: { color: ['rgba(47,107,255,0.03)', 'rgba(19,194,194,0.03)'] } },
      axisLine: { lineStyle: { color: 'rgba(47,107,255,0.2)' } },
    },
    series: [{ type: 'radar', symbolSize: 4, data: series }],
  }
}
```

### 4.2 任务完成漏斗（`TaskFunnelCard.vue`，ECharts funnel）

来自 `task_funnel[]` 的 `opened→designed→ran→submitted→passed` 五阶段。注意：`designed` 阶段直接体现课题"先设计后编码"（来源 `design_artifacts`）。

```ts
// TaskFunnelCard.vue buildFunnelOption
export function buildFunnelOption(funnel: {
  opened: number; designed: number; ran: number; submitted: number; passed: number
}) {
  const stages = [
    { name: '打开任务', value: funnel.opened },
    { name: '完成设计', value: funnel.designed },   // design_artifacts → 先设计后编码
    { name: '运行代码', value: funnel.ran },
    { name: '提交作品', value: funnel.submitted },
    { name: '判题通过', value: funnel.passed },
  ]
  return {
    color: ['#2F6BFF', '#3D8BFF', '#13C2C2', '#36CFC9', '#52C41A'],
    tooltip: { trigger: 'item', formatter: '{b}: {c} 人 ({d}%)' },
    series: [{
      type: 'funnel', left: '8%', right: '8%', top: 16, bottom: 16,
      minSize: '20%', maxSize: '100%', sort: 'descending', gap: 2,
      label: { position: 'inside', color: '#fff', formatter: '{b}\n{c}' },
      labelLine: { show: false },
      itemStyle: { borderColor: '#fff', borderWidth: 1 },
      data: stages,
    }],
  }
}
```

### 4.3 班级 CT 分布（`CtDistributionCard.vue`，堆叠横向条形）

`dimension_distribution` 六维 × L1-L4 堆叠条，一眼看出"哪一维 L1/L2 学生最多"（如参考图中"建模 modeling"明显偏弱）。

```ts
export function buildDistOption(dist: Record<string, Record<string, number>>) {
  const dims = ['抽象','分解','建模','算法设计','验证优化','迁移']
  const keys = ['abstraction','decomposition','modeling','algorithm_design','verification_optimization','transfer']
  const levels = ['L1','L2','L3','L4']
  const colors = ['#FF7875','#FFC53D','#69C0FF','#52C41A']  // 弱→强
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: levels, top: 0, textStyle: { color: '#5A6B87' } },
    grid: { left: 70, right: 16, top: 32, bottom: 8 },
    xAxis: { type: 'value', axisLabel: { color: '#8895AD' }, splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } } },
    yAxis: { type: 'category', data: dims, axisLabel: { color: '#33415C' } },
    series: levels.map((lv, i) => ({
      name: lv, type: 'bar', stack: 'total', barWidth: 16,
      itemStyle: { color: colors[i] },
      emphasis: { focus: 'series' },
      data: keys.map(k => dist[k][lv as 'L1'] ?? 0),
    })),
  }
}
```

### 4.4 个体下钻（`AttentionList.vue` → 数字画像）

- `attention_list[]` 渲染为"需关注"列表：假名 + `weakest_dim`（最弱维）+ `reason`（如 `modeling_low+high_ai_dependency`）+ `ai_dependency_index` 进度条。
- 点击某项 → 路由 `/teacher/student/:pseudonym/portrait`，调 `GET /api/student/{id}/ct-profile?include=trend`，渲染该生**六维雷达 + 成长曲线 + 版本-CT 时间线 + AI 依赖指数**（复用学生数字画像组件，只读）。越权他班 `403`。

---

## 5. 班级与任务管理（`ClassTasks.vue`）

### 5.1 班级 / 学生

- 班级切换器（教师所带多班）；学生以**假名卡片网格**展示，卡片含：在线点、今日出码/求助/提交计数、最弱维徽标。
- 数据来自 `home.classes[]` + `realtime`。

### 5.2 任务布置（关联题目 / 语言 / 截止 / 量规）

表单字段 → `POST /api/teacher/assignments`：

| 字段 | 类型 | 说明 |
|---|---|---|
| `class_id` | string | 目标班级（限本人所带班） |
| `problem_id` | string | 关联题库题目 |
| `language` | `'python'｜'cpp'｜'c'` | 限定语言（对齐三语言执行） |
| `require_design` | boolean | 是否强制"先设计后编码"（漏斗 designed 阶段把关） |
| `due_at` | ISO8601 | 截止时间 |
| `rubric_dims` | string[] | 本任务重点考察的 CT 维度（驱动画像加权） |

### 5.3 实时课堂（在线 / 报错热力 / AI 求助频次）

数据来自 `GET /api/teacher/classes/{id}/realtime`（聚合 `code_runs`/`ai_messages`/在线心跳），轮询 15s：

- **OnlineGrid.vue**：学生在线状态网格（绿=活跃、灰=离线、黄=分心/长时间无操作）。
- **ErrorHeatmap.vue**：ECharts heatmap，X=学生（假名）、Y=任务步骤/时间桶，色深=报错次数（来源 `code_runs` `status in failed,timeout`），一眼定位"谁卡在哪一步"。
- **AI 求助频次条**：每生近 N 分钟 `ai_help` 计数，超阈值高亮（防过度依赖信号）。

```ts
// ErrorHeatmap.vue buildHeatmapOption
export function buildHeatmapOption(students: string[], steps: string[], cells: [number,number,number][]) {
  return {
    tooltip: { position: 'top', formatter: (p: any) =>
      `${students[p.value[1]]} · ${steps[p.value[0]]}：报错 ${p.value[2]} 次` },
    grid: { left: 64, right: 16, top: 24, bottom: 48 },
    xAxis: { type: 'category', data: steps, axisLabel: { color: '#8895AD', rotate: 30 } },
    yAxis: { type: 'category', data: students, axisLabel: { color: '#33415C' } },
    visualMap: { min: 0, max: 8, calculable: true, orient: 'horizontal', left: 'center', bottom: 8,
      inRange: { color: ['#E6F4FF', '#69C0FF', '#FF7875'] }, textStyle: { color: '#5A6B87' } },
    series: [{ type: 'heatmap', data: cells, label: { show: true, color: '#33415C' },
      emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.3)' } } }],
  }
}
```

---

## 6. 数据导出（`DataExport.vue`）

| 导出物 | 端点 | 内容 | 脱敏 |
|---|---|---|---|
| **班级报告** | `POST /api/research/export`（`scope=class_report`） | 六维分布 + 漏斗 + 预警汇总 + 活跃度，PDF/JSON | 假名 |
| **学生成长档案** | `POST /api/research/export`（`scope=growth_archive`） | 单生过程路径 + 六维成长曲线 + 作品版本 + AI 依赖趋势 | 假名 |
| **研究数据** | `POST /api/research/export`（`scope=lsa` 等，转发上游 `/api/research/lsa-export`） | LSA 转换矩阵 + Z 矩阵 + 序列 | **强制脱敏**（k-匿名 + PII 自检，命中 `422`） |

- 所有导出**经合规 DeidentExporter**：去直接标识、假名化；导出前跑 PII 自检（命中 `422 EXPORT_PII_DETECTED` → 前端提示"导出含敏感信息已拦截"）。
- 导出动作写审计 `data.export`（actor=teacher/researcher）；前端展示导出历史（来自审计只读视图）。
- 权限：研究数据导出需 `require_courseteam`（课题组）角色；普通教师仅能导班级报告/成长档案。

---

## 7. API 契约（聚合层）

> 统一鉴权头 `X-CodeX-Session`；统一错误体 `{ "detail": { "code", "message", ... } }`。以下为本文**新增的教师聚合端点**；`alerts`/`ct-overview` 直接复用上游契约（§0.3）。

### 7.1 `GET /api/teacher/home`（首页一次性聚合）

`require_teacher`。查询：`?class_id=c1`（缺省取教师默认班）。响应 `200`：

```json
{
  "teacher": {
    "name": "李深", "staff_id": "20230034", "title": "讲师",
    "college": "机电工程学院", "avatar3d": "/assets/teacher/avatar_li.png",
    "identities": ["counselor", "subject"], "current_identity": "counselor"
  },
  "student_stats": { "total": 318, "female": 165, "male": 153, "female_pct": 52, "male_pct": 48 },
  "honors": { "awarded_students": 39, "award_classes": 22,
    "by_level": [ { "name": "国家级", "count": 5 }, { "name": "省级", "count": 12 }, { "name": "校级", "count": 22 } ] },
  "class_distribution": {
    "major_count": 4, "class_count": 10,
    "bars": [ { "class": "工设22-1", "students": 26 }, { "class": "智能22-1", "students": 22 } ]
  },
  "care": { "class_advisor_of": 51, "care_focus": 3 },
  "today_activity": { "runs": 342, "ai_help": 66, "submissions": 13 },
  "offline_alerts": {
    "count": 13,
    "items": [ { "student_pseudonym": "S-7c1a", "class": "智设22-1", "reason": "offline", "since_min": 18 } ]
  },
  "academic_alerts": {
    "count": 8, "high": 2, "medium": 6,
    "items": [
      { "student_pseudonym": "S-3a9f", "class": "工设22-1", "source": "ct_overview",
        "category": "ct_stuck", "level": 2, "weakest_dim": "modeling", "ai_dependency_index": 0.71 }
    ]
  },
  "open_critical": 1
}
```

> 数字落位与参考图一致（学生 318、女 52%/男 48%、不在校 13、学业态势 8 含高 2/中 6）。`open_critical` 驱动铃铛角标。后端聚合自 `student_stats`(花名册) / `risk_events` / `ct-overview` / `code_runs` 等，**已假名化**。

### 7.2 `GET /api/teacher/alerts`（复用上游，预警流）

`require_teacher` + 班级域隔离。`?status=open&level=3,4&category=self_harm&class_id=c1&page=1`。响应见 `IMPL-数据安全合规-实现级设计.md` §8.4：

```json
{ "items": [ { "id": "r_01", "student_pseudonym": "S-3a9f...", "category": "self_harm",
  "level": 4, "action": "locked", "created_at": "2026-06-22T10:05:00+08:00", "handled": false } ],
  "total": 1, "page": 1 }
```

### 7.3 `POST /api/teacher/alerts/{id}/handle`（复用上游，介入回执）

请求 `{ "note": "已联系班主任与家长，学生情绪稳定" }`；响应 `{ "id": "r_01", "handled": true, "handled_at": "2026-06-22T10:12:00+08:00" }`；写审计 `risk.handled`。

### 7.4 `GET /api/teacher/classes/{id}/ct-overview`（复用上游，学情画像）

`require_teacher` + 班级域隔离，学生假名。响应见 `IMPL-计算思维六维评价-实现级设计.md` §8.3：`dimension_distribution` / `task_funnel[]` / `ai_dependency` / `attention_list[]`。

### 7.5 `GET /api/teacher/classes/{id}/realtime`（课堂实时，新增）

`require_teacher` + 班级域隔离。`?window_min=15`。响应 `200`：

```json
{
  "class_id": "c1", "captured_at": "2026-06-22T10:20:00+08:00", "window_min": 15,
  "online": { "active": 28, "distracted": 4, "offline": 8 },
  "students": [
    { "student_pseudonym": "S-3a9f", "status": "active", "last_active_sec": 12,
      "runs": 9, "errors": 3, "ai_help": 2, "weakest_dim": "modeling" }
  ],
  "error_heatmap": {
    "steps": ["读题","设计","写循环","调试","提交"],
    "cells": [ [2, 0, 3], [3, 0, 5] ]
  },
  "ai_help_top": [ { "student_pseudonym": "S-9b21", "count": 11, "over_threshold": true } ]
}
```

> `error_heatmap.cells` 为 `[stepIndex, studentIndex, errorCount]`，前端按 `students` 顺序对齐 Y 轴；`runs/errors` 取自 `code_runs`，`ai_help` 取自 `ai_messages`（经合规放行的 `ai_help` 事件）。

### 7.6 `POST /api/teacher/assignments`（任务布置，新增）

`require_teacher`，仅限本人所带班。请求：

```json
{
  "class_id": "c1", "problem_id": "p_loop_square", "language": "python",
  "require_design": true, "due_at": "2026-06-29T23:59:00+08:00",
  "rubric_dims": ["modeling", "algorithm_design"]
}
```

响应 `201`：

```json
{ "assignment_id": "a_2026_001", "class_id": "c1", "problem_id": "p_loop_square",
  "language": "python", "require_design": true, "due_at": "2026-06-29T23:59:00+08:00",
  "rubric_dims": ["modeling","algorithm_design"], "created_at": "2026-06-22T10:25:00+08:00" }
```

错误：`problem_id` 不存在 `404 PROBLEM_NOT_FOUND`；`class_id` 非本人班 `403 CLASS_FORBIDDEN`。

### 7.7 `POST /api/research/export`（脱敏导出，新增/转发）

`require_teacher`（班级报告/成长档案）或 `require_courseteam`（研究数据）。请求：

```json
{ "scope": "class_report", "class_id": "c1", "format": "pdf", "k": 5 }
```

响应 `200`：`{ "export_id": "exp_2026...", "download_url": "/api/research/exports/exp_2026.../file", "format": "pdf", "deidentified": true }`；命中 PII → `422 EXPORT_PII_DETECTED`。

---

## 8. 组件级实现（关键组件 `<script setup>`）

### 8.1 `TeacherShell.vue`（独立布局，与学生端分离）

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useTeacherSessionStore } from '@/teacher/stores/teacherSession'
import { useAlertsStore } from '@/teacher/stores/alerts'
import TopNavBar from '@/teacher/components/nav/TopNavBar.vue'

const session = useTeacherSessionStore()
const alerts = useAlertsStore()

onMounted(async () => {
  await session.bootstrap()                 // 拉教师身份 + 所带班级
  alerts.startStream(session.currentClassId) // 启动 WS/轮询预警流（全局，跨页面常驻）
})
</script>

<template>
  <div class="teacher-shell" data-app="teacher">
    <TopNavBar :critical-count="alerts.openCriticalCount" />
    <main class="teacher-content"><RouterView /></main>
  </div>
</template>

<style scoped>
.teacher-shell { min-height: 100vh; background: var(--t-bg); color: var(--t-text); }
.teacher-content { max-width: 1440px; margin: 0 auto; padding: 16px 24px; }
</style>
```

### 8.2 `AlertPanel.vue`（底部三栏预警 + 处置）

```vue
<script setup lang="ts">
import { computed } from 'vue'
import AlertItem from './AlertItem.vue'
import StatNumber from '@/teacher/components/common/StatNumber.vue'

const props = defineProps<{
  todayActivity: { runs: number; aiHelp: number; submissions: number }
  offline: { count: number; items: any[] }
  academic: { count: number; high: number; medium: number; items: any[] }
}>()
const emit = defineEmits<{ (e: 'handle', id: string): void }>()

const academicSorted = computed(() =>
  [...props.academic.items].sort((a, b) => b.level - a.level))  // 高优先级置顶
</script>

<template>
  <section class="alert-panel">
    <!-- 今日行为记录 -->
    <div class="alert-col">
      <h3>今日行为记录</h3>
      <div class="metrics">
        <StatNumber :value="todayActivity.runs" label="出码次数" />
        <StatNumber :value="todayActivity.aiHelp" label="AI 求助" />
        <StatNumber :value="todayActivity.submissions" label="提交数" />
      </div>
    </div>

    <!-- 不在校预警 -->
    <div class="alert-col">
      <h3>不在校预警 <span class="count">{{ offline.count }}</span></h3>
      <ul class="alert-list">
        <li v-for="it in offline.items" :key="it.student_pseudonym">
          <span class="name">{{ it.student_pseudonym }}</span>
          <span class="cls">{{ it.class }}</span>
          <span class="tag tag-offline">离线 {{ it.since_min }} 分钟</span>
        </li>
      </ul>
    </div>

    <!-- 学业预警态势 -->
    <div class="alert-col wide">
      <h3>学业预警态势 <span class="count">{{ academic.count }}</span>
        <small>高 {{ academic.high }} · 中 {{ academic.medium }}</small></h3>
      <AlertItem v-for="it in academicSorted" :key="it.student_pseudonym"
        :item="it" @handle="emit('handle', it.id ?? it.student_pseudonym)" />
    </div>
  </section>
</template>

<style scoped>
.alert-panel { display: grid; grid-template-columns: 1fr 1fr 2fr; gap: 16px; }
.alert-col { background: var(--t-card); border-radius: var(--t-radius); padding: 16px;
  box-shadow: var(--t-shadow); }
.alert-col h3 { font-size: 15px; color: var(--t-text); display: flex; gap: 8px; align-items: baseline; }
.count { color: var(--t-danger); font-weight: 700; font-size: 20px; }
.metrics { display: flex; gap: 20px; margin-top: 12px; }
.tag-offline { color: var(--t-warning); }
</style>
```

### 8.3 `CtRadarCard.vue`（六维雷达，含 ECharts 生命周期封装）

```vue
<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useEchart } from '@/teacher/composables/useEchart'
import { buildRadarOption } from './ctRadarOption'   // §4.1 的 buildRadarOption

const props = defineProps<{
  distribution: Record<string, any>
  prev?: Record<string, any>
}>()

const el = ref<HTMLDivElement>()
const { setOption, dispose } = useEchart(el)

watch(() => props.distribution, (d) => {
  if (d) setOption(buildRadarOption(d, props.prev))
}, { immediate: true, deep: true })

onBeforeUnmount(dispose)
</script>

<template>
  <div class="card">
    <h3>班级计算思维六维画像</h3>
    <div ref="el" class="chart" role="img" aria-label="班级计算思维六维雷达图"></div>
  </div>
</template>

<style scoped>
.card { background: var(--t-card); border-radius: var(--t-radius); padding: 16px; box-shadow: var(--t-shadow); }
.chart { width: 100%; height: 320px; }
</style>
```

```ts
// composables/useEchart.ts — ECharts 生命周期 + ResizeObserver
import { onMounted, type Ref } from 'vue'
import * as echarts from 'echarts/core'

export function useEchart(el: Ref<HTMLElement | undefined>) {
  let chart: echarts.ECharts | null = null
  let ro: ResizeObserver | null = null
  let pending: any = null

  onMounted(() => {
    if (!el.value) return
    chart = echarts.init(el.value, undefined, { renderer: 'canvas' })
    if (pending) chart.setOption(pending)
    ro = new ResizeObserver(() => chart?.resize())
    ro.observe(el.value)
  })

  function setOption(opt: any) { pending = opt; chart?.setOption(opt, true) }
  function dispose() { ro?.disconnect(); chart?.dispose(); chart = null }
  return { setOption, dispose }
}
```

### 8.4 `ClassDistributionCard.vue`（班级分布横向条形）

```vue
<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useEchart } from '@/teacher/composables/useEchart'

const props = defineProps<{
  majorCount: number; classCount: number
  bars: { class: string; students: number }[]
}>()

const el = ref<HTMLDivElement>()
const { setOption, dispose } = useEchart(el)

watch(() => props.bars, (bars) => {
  if (!bars) return
  setOption({
    grid: { left: 78, right: 24, top: 8, bottom: 8 },
    xAxis: { type: 'value', axisLabel: { color: '#8895AD' },
      splitLine: { lineStyle: { color: 'rgba(0,0,0,0.05)' } } },
    yAxis: { type: 'category', data: bars.map(b => b.class), inverse: true,
      axisLabel: { color: '#33415C' }, axisTick: { show: false } },
    series: [{
      type: 'bar', barWidth: 12, data: bars.map(b => b.students),
      itemStyle: { color: '#2F6BFF', borderRadius: [0, 6, 6, 0] },
      label: { show: true, position: 'right', color: '#33415C' },
    }],
  })
}, { immediate: true, deep: true })

onBeforeUnmount(dispose)
</script>

<template>
  <div class="card">
    <h3>班级分布</h3>
    <div class="summary">
      <div><b>{{ majorCount }}</b><span>专业/个</span></div>
      <div><b>{{ classCount }}</b><span>班级/个</span></div>
    </div>
    <div ref="el" class="chart" role="img" aria-label="班级人数分布条形图"></div>
  </div>
</template>

<style scoped>
.card { background: var(--t-card); border-radius: var(--t-radius); padding: 16px; box-shadow: var(--t-shadow); }
.summary { display: flex; gap: 24px; margin: 8px 0; }
.summary b { font-size: 24px; color: var(--t-primary); } .summary span { color: var(--t-text-muted); margin-left: 4px; }
.chart { width: 100%; height: 240px; }
</style>
```

### 8.5 `TeacherIdentityCard.vue`（3D 教师形象位 + 身份切换）

```vue
<script setup lang="ts">
import { useTeacherSessionStore } from '@/teacher/stores/teacherSession'
const props = defineProps<{
  teacher: { name: string; staff_id: string; title: string; college: string;
    avatar3d: string; identities: string[]; current_identity: string }
}>()
const session = useTeacherSessionStore()

const IDENTITY_LABEL: Record<string, string> = { counselor: '辅导员', subject: '学科教师' }
function switchTo(id: string) { session.switchIdentity(id) } // 切换数据域 + 重拉首页聚合
</script>

<template>
  <div class="identity-card">
    <!-- 3D 教师形象位：GPT 生图产出的 2.5D 立绘 / 预渲染 3D 精灵（低配 PNG，桌面可选 Live2D） -->
    <div class="avatar-3d">
      <img :src="teacher.avatar3d" :alt="`${teacher.name} 3D 形象`" loading="lazy" />
    </div>
    <div class="info">
      <h2 class="name">{{ teacher.name }} <small>老师</small></h2>
      <ul class="meta">
        <li>工号：{{ teacher.staff_id }}</li>
        <li>职称：{{ teacher.title }}</li>
        <li>学院：{{ teacher.college }}</li>
      </ul>
      <div class="identity-switch">
        <span class="label">身份切换</span>
        <button v-for="id in teacher.identities" :key="id"
          :class="{ active: id === teacher.current_identity }" @click="switchTo(id)">
          {{ IDENTITY_LABEL[id] ?? id }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.identity-card { display: grid; grid-template-columns: 280px 1fr; align-items: center; gap: 24px;
  background: var(--t-card); border-radius: var(--t-radius); padding: 24px; box-shadow: var(--t-shadow);
  background-image: radial-gradient(circle at 30% 20%, rgba(47,107,255,0.06), transparent 60%); }
.avatar-3d img { width: 100%; max-width: 260px; }
.name { font-size: 28px; color: var(--t-primary); } .name small { color: var(--t-text); font-size: 16px; }
.meta { color: var(--t-text-muted); line-height: 1.9; margin: 8px 0 16px; }
.identity-switch { display: flex; gap: 8px; align-items: center; }
.identity-switch button { border: 1px solid var(--t-primary); color: var(--t-primary);
  background: #fff; border-radius: 999px; padding: 6px 16px; cursor: pointer; }
.identity-switch button.active { background: var(--t-primary); color: #fff; }
</style>
```

### 8.6 `stores/alerts.ts`（预警流 + 处置乐观更新）

```ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchAlerts, handleAlert } from '@/teacher/api/alerts'
import { useAlertStream } from '@/teacher/composables/useAlertStream'

export const useAlertsStore = defineStore('teacherAlerts', () => {
  const items = ref<any[]>([])
  const openCriticalCount = computed(() =>
    items.value.filter(a => !a.handled && a.level >= 3).length)

  let stream: ReturnType<typeof useAlertStream> | null = null

  async function refresh(classId: string) {
    const res = await fetchAlerts({ status: 'open', class_id: classId, level: '3,4' })
    upsertMany(res.items)
  }
  function upsertMany(incoming: any[]) {
    const map = new Map(items.value.map(a => [a.id, a]))
    for (const ev of incoming) map.set(ev.id, { ...map.get(ev.id), ...ev })
    items.value = [...map.values()].sort((a, b) => b.level - a.level ||
      +new Date(b.created_at) - +new Date(a.created_at))
  }
  function startStream(classId: string) {
    refresh(classId)
    stream = useAlertStream(classId, (ev) => upsertMany([ev]))  // WS 优先，轮询兜底
  }
  async function handle(id: string, note: string) {
    const target = items.value.find(a => a.id === id)
    if (target) target.handling = true                          // 乐观
    try {
      const res = await handleAlert(id, note)
      upsertMany([{ ...res, handling: false }])
    } catch (e) { if (target) target.handling = false; throw e } // 回滚
  }
  return { items, openCriticalCount, startStream, refresh, handle }
})
```

---

## 9. 设计令牌（教师端浅色数据大屏，与学生端区分）

`teacher/theme/teacher-tokens.css`（变量前缀 `--t-`，作用域 `[data-app="teacher"]`，**不与学生端 pastel 令牌共名**）：

```css
[data-app="teacher"] {
  /* 主色：数据大屏蓝 + 蓝绿点缀（区别学生端 #4A90E2 教育蓝 + #F5A623 暖橙） */
  --t-primary:      #2F6BFF;   /* 主蓝（导航/主条形/雷达主面） */
  --t-primary-2:    #3D8BFF;   /* 浅蓝渐变 */
  --t-accent:       #13C2C2;   /* 蓝绿点缀（对比维度/次系列） */
  --t-success:      #52C41A;
  --t-warning:      #FAAD14;   /* 不在校/中预警 */
  --t-danger:       #FF4D4F;   /* 高危/高预警 */

  /* 背景与卡片：浅色大屏，高数据密度 */
  --t-bg:           #F4F7FE;   /* 页面浅蓝灰底 */
  --t-card:         #FFFFFF;
  --t-radius:       12px;      /* 卡片化、圆角小于学生端的 pastel 大圆角 */
  --t-shadow:       0 4px 16px rgba(31, 71, 161, 0.08);

  /* 文本（深蓝灰，信息密度高、对比达标 WCAG AA） */
  --t-text:         #1F2D4D;
  --t-text-muted:   #8895AD;

  /* 数据大屏数字字形（大号、等宽感、科技蓝） */
  --t-num-font:     'DIN Alternate', 'Roboto Mono', ui-monospace, monospace;
  --t-num-color:    #2F6BFF;

  /* 网格间距：密（16px），承载多卡 */
  --t-gap:          16px;
}

[data-app="teacher"] .stat-number {
  font-family: var(--t-num-font); font-size: 32px; font-weight: 700; color: var(--t-num-color);
  letter-spacing: 1px;
}
```

**与学生端的可视差异（验收点）**：教师端浅蓝灰底 + 白卡 + 12px 圆角 + 高数据密度 + 大号科技蓝数字 + 蓝绿点缀；学生端 pastel 暖色 + 大圆角 + 吉祥物 + 暖橙强调。两端并排截图应"一眼可分"。

---

## 10. 验收标准 + 测试点（逐条可勾验）

> 落为 `tests/teacher/` 下组件测试（Vitest + @vue/test-utils）+ 端到端（Playwright）+ 对聚合 API 的 httpx 集成测试，保留 curl/JSON 与截图证据（沿用现有"证据门"约定）。

| # | 验收项 | 触发 | 断言点 |
|---|---|---|---|
| **T1** | 首页 30 秒掌握"谁卡住" | 打开 `/teacher`（`GET /api/teacher/home`） | 三栏预警渲染；学业态势按 level 降序；关注名单含 `weakest_dim`+`reason`；首屏仅 1 个聚合请求 |
| **T2** | 高危预警实时出现 | WS/轮询推入 L4 `risk_event` | 顶部红条 + 铃铛角标 +1 + 浏览器通知；列表置顶；≤ 轮询间隔内可见 |
| **T3** | 高危可处置（回执） | 点"介入"→填说明→提交 | `POST /api/teacher/alerts/{id}/handle` 200；项移入已处置；L4 说明必填校验；后端审计 `risk.handled` |
| **T4** | 假名展示 | 任意预警/名单 | 仅显示 `student_pseudonym`，无真实姓名；真实身份解析仅 L3/L4 处置且权限受限 + 单独审计 |
| **T5** | 六维雷达正确渲染 | `ct-overview` 喂入 | radar 6 轴，max=4；`levelMean` 折算正确（手算核对一例）；上周虚线对比可叠加 |
| **T6** | 任务漏斗正确渲染 | `task_funnel` 喂入 | funnel 五阶段降序；`designed` 阶段独立呈现（先设计后编码）；百分比 `{d}%` 正确 |
| **T7** | 班级 CT 分布正确 | `dimension_distribution` 喂入 | 六维堆叠条 L1-L4，弱→强配色；最弱维（如 modeling）可视突出 |
| **T8** | 个体下钻到数字画像 | 点关注名单某项 | 路由到 `/teacher/student/:pseudonym/portrait`；`GET /api/student/{id}/ct-profile?include=trend` 渲染六维+成长曲线+AI 依赖 |
| **T9** | 越权数据域隔离 | 教师查他班 `ct-overview`/`alerts` | `403`；前端提示"无权查看该班级" |
| **T10** | 师生端权限分离 | 学生 token 访问 `/teacher/*` | 守卫重定向 `/teacher/login`；学生 token 调教师 API → `401/403` |
| **T11** | 师生端视觉分离 | 并排截图 | 教师端浅色数据大屏（蓝绿/高密度/卡片化）vs 学生端 pastel+吉祥物，可一眼区分 |
| **T12** | 实时课堂 | `GET /api/teacher/classes/{id}/realtime`（15s 轮询） | 在线网格三态；报错热力 X×Y 对齐；AI 求助超阈值高亮；页面隐藏暂停轮询 |
| **T13** | 任务布置 | `POST /api/teacher/assignments` | `201` 返回 assignment；非本班 `403 CLASS_FORBIDDEN`；题目不存在 `404` |
| **T14** | 脱敏导出 | `POST /api/research/export`（注入含 PII 样本） | 正常导出 `deidentified:true`；命中 PII `422 EXPORT_PII_DETECTED`；写审计 `data.export` |
| **T15** | 还原度（首页栅格） | 视觉对比 教师后端界面2.jpg | 12 列网格落位一致：学生统计(性别环 52/48) / 中央 3D 教师 / 获奖 / 班级分布 / 学生关怀 / 底部三栏预警 |
| **T16** | ECharts 资源释放 | 反复切换页面 | `onBeforeUnmount` 调 `dispose`；无内存泄漏；ResizeObserver 断开 |

**总体验收门**：
1. 教师首页 **30 秒内**掌握"谁卡住 / 卡在哪 / 需介入"（T1）。
2. **高危预警实时出现并可处置**（T2/T3），全程假名（T4）。
3. **六维雷达 / 漏斗 / 班级分布正确渲染**（T5/T6/T7）。
4. **个体可下钻到数字画像**（T8），数据域隔离（T9）。
5. **师生端视觉与权限分离**（T10/T11）。

---

## 附：与上游契约 / 既有资产的衔接点

- **预警源**：`learning.risk_events`（`category/level/action/handled_*`）+ `GET /api/teacher/alerts` / `POST .../handle` —— 直接消费，不重定义；高危锁定通知由合规子系统 `RiskService.raise_event` 产生（站内信必达本工作台预警流）。见 `IMPL-数据安全合规-实现级设计.md` §6/§8。
- **画像源**：`GET /api/teacher/classes/{id}/ct-overview`（六维分布/漏斗/AI 依赖/关注名单）+ `GET /api/student/{id}/ct-profile`（个体雷达+trend）。见 `IMPL-计算思维六维评价-实现级设计.md` §8。
- **实时源**：`learning.code_runs`（运行/报错，`ix_code_runs_failed` 支撑"反复报错卡在哪"下钻）+ `ai_messages`（AI 求助频次）+ `submissions`（提交）+ `design_artifacts`（漏斗 `designed` 阶段，先设计后编码证据）。
- **鉴权**：`X-CodeX-Session`（Phase 2J）+ `require_teacher` + `role/aud=teacher` + 班级数据域隔离；研究导出 `require_courseteam`。
- **CodeAgent 可复用资产**：已落地"班级/任务/学情/概览 + 教师下钻"——本文将其**按预警中心式数据大屏升级**（首页栅格还原 + 三栏预警 + 实时课堂 + 六维雷达/漏斗），并把数据来源全部切到上游持久化契约（`risk_events`/`ct-overview`/`code_runs`），从"后台管理"转为"教学研究 + 实时监管工作台"。
```
