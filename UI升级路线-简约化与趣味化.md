# 结对编程智能体平台 · UI 简约化与趣味化升级 技术路线（v3 · 终版）

> 项目：`D:/VB/jiedui-code-platform/CX` ·「结对编程智能体培养初中生计算思维的实践研究」
> 本版是第 3/3 轮。所有带「实测」二字的结论都附了本轮在本机跑过的命令与原始输出（附录 B）。
> 后端命令一律使用 `D:/VB/jiedui-code-platform/CX/server/.venv/Scripts/python.exe`。

---

## §0 相对 v2 撤回了什么（先认错，再往下写）

v2 有五处站不住，这里逐条撤回。撤回理由都能被一条命令证伪。

| # | v2 的说法 | 实测 | 本版处置 |
|---|---|---|---|
| 0-1 | 「P0-(-1)：pytest 起不来，先给 `requirements.txt` 加 `starlette>=0.40,<0.42`，否则下面全是空转」 | `server/.venv` 一直存在，`./.venv/Scripts/python.exe -m pytest -q` → **68 passed in 3.97s**；venv 里 fastapi 0.138.0 / starlette 1.3.1。系统 Python 3.14 的 `--user` 目录里是 fastapi 0.115.6 + starlette 1.0.0，跑错解释器才会报 `Router.__init__() got an unexpected keyword argument 'on_startup'` | **整条删除。** 且明确禁止照 v2 的药方写 `starlette<0.42`——venv 里的 fastapi 0.138.0 声明 `starlette>=0.46.0`，写了 pip 只能降级 fastapi，把唯一能跑的环境弄坏 |
| 0-2 | 「lint 可以卡住『少即是多』，验收标准写『lint 通过』即可」 | `node scripts/lint-copy.mjs` → `✓ 通过（21 个视图）`，退出码 0；但它只 walk `src/views`，**一个 `src/components` 都不看**，且正则会在第一个 `</template>` 截断 | lint 有**四个**洞不是两个（§3）。在修完之前，所有「验收：lint 通过」等于没有验收 |
| 0-3 | 「抠图白边的成因，本方案不知道」 | 成因写在 `web/scripts/post-assets.py:17` 的常量里：`thresh=40` 从 (255,255,255) 起只淹到亮度 ~215，亮度 216–254 那圈保持 alpha=255。实测 `ct_abstract.png` 边缘 352 px、均亮 222.0；`ct_verify.png` 595 px、均亮 227.2 | 成因确定，**删掉 P1 的 A/B 选优实验**（在测一个已知答案），改为确定性修复 + 可判定的验收式（§5.3） |
| 0-4 | 「奖励不与六维分挂钩，所以效度红线安全」 | `web/src/views/student/WorkbenchView.vue:14-16` 一个 88px 圆环，`:69` 的值是六维**均分**。学生每多点一次 AI、多跑一次代码，圆环就涨 | 红线**此刻已破**。P0 第一件事就是拆掉它（§4）。在拆掉之前，任何「不挂钩」的表述都是假的 |
| 0-5 | 「P2-a（`ai.py` 流式化）可选，5–10 人日」 | 它买到的唯一东西是 `phase` 可以写成进行时；而 v2 自己给了 0 成本替代（文案改完成时态）。代价是重写出口侧护栏语义——本项目从未做过的一块 | 从「可选」改为**不做**。理由与替代方案见 §7.4 |

另外 v2 §9.8 引用的 `/api/teacher/progress/matrix` **全仓不存在**：`grep -n "@router" server/app/teacher.py` 只有 `:34 /live` 和 `:69 /home`。它指出的问题（`store.py:139/141/143/147/149/167/169/171` 八处 `WHERE user_id LIKE 'stu-%'`，全校无班级过滤）是真的，但修改指令必须指向真实文件，否则执行时找不到目标（§8.5）。

---

## §1 事实基线（本轮实跑，一切判断从这里长出来）

### 1.1 环境与门禁

```
D:/VB/jiedui-code-platform/CX/server> ./.venv/Scripts/python.exe -m pytest -q
....................................................................  [100%]   68 passed

D:/VB/jiedui-code-platform/CX/web> node scripts/lint-copy.mjs ; echo $?
✓ 文案密度检查通过（21 个视图）
0
```

`web/package.json` 实况：

```json
"build": "vite build",
"typecheck": "vue-tsc --noEmit",
"lint:copy": "node scripts/lint-copy.mjs",
"check": "npm run typecheck && npm run lint:copy && npm run build"
```

**`npm run build` 只是 `vite build`**，不含 vue-tsc、不含 lint。`.github/` 目录不存在，无 CI。所以「前端门禁 = build(vue-tsc) + lint-copy」这句话在仓库里没有对应物，全靠人记得敲 `npm run check`。

### 1.2 首屏账本 —— 并修正审阅里的两处口径错误

用嵌套 `<template>` 深度匹配 + 排除未展开 `<details>` 复算（脚本见附录 B）：

```
StudioView.vue      ctrl=9   cjk=60        IdeView.vue        ctrl=10  cjk=37
AssessmentView.vue  ctrl=5   cjk=63        ThinkingView.vue   ctrl=1   cjk=78
WorkbenchView.vue   ctrl=0   cjk=30
PairDock.vue        ctrl=3   cjk=10        InsightRail.vue    ctrl=3   cjk=120
TaskChip.vue        ctrl=2   cjk=4         DesignPanel.vue    ctrl=12  cjk=49
AiTutorPanel.vue    ctrl=7   cjk=130
```

到这里为止和审阅一致。但**把这些数字当「首屏真实值」是错的**，因为现行 lint 口径只排除 `<details>`，不排除互斥的 `v-if / v-else`。逐块拆开量（附录 B 脚本 2）：

- **`StudioView.vue` 的 60 字里，47 字是 `v-if="consent === false"` 的监护人同意门禁弹层**（`:71-79`），9 字是 `v-if="!msgs.length"` 的空态（`:20-27`）。**常态下屏幕上的常驻正文只有 4 个字。**
- **`AssessmentView.vue` 的 63 字来自三个互斥分支**：`v-else-if="done"` 分支 47 字、`v-else-if="paper"` 分支 13 字、加载态 3 字。**任何一屏都没有超过 60。**

所以审阅那条「`AssessmentView` 现在就违规，必须减字到 ≤60」是**基于坏口径得出的坏结论**——照做会去删一段本来就合理的交卷说明。同时它的另一半是对的：不改口径而只修嵌套匹配，`AssessmentView` 会立刻红，而人的自然反应是抬 `@copyBudget`，那等于自废规则。**两个洞必须一起修，顺序不能反**（§3）。

修正后的真实首屏（口径见 §3.2）：

| 屏 | 常驻正文 | 预算 | 常驻控件 | 上限 | 结论 |
|---|---|---|---|---|---|
| `/student/studio` 常态（有对话） | 4 + PairDock 10 = **14** | 60 | 9 + PairDock 3 = **12** | 12 | **控件顶格**，一个都加不了 |
| `/student/studio` 有老师推送时 | 14 + TaskChip 4 = **18** | 60 | 12 + TaskChip 2 = **14** | 12 | **超标 2 个控件** |
| `/student/studio` 展开 InsightRail | 14 + 120 = **134** | 60 | 12 + 3 = **15** | 12 | **双超标**（Rail 是 `v-if="rail"`，属用户主动展开，按 §3.2 计入「二级屏」另算） |
| `/student/ide` | 37 | 90 | 10 | 12 | 余 2 控件 |

**结论比 v2 和审阅都更难看的一处**：`StudioView` 的问题不在文案（只有 14 字），在**控件**——顶格 12，来一条老师推送就 14。而 `InsightRail.vue` 的 120 字从来没被任何规则看过。所以「趣味化」的预算不是从文案里省，是**必须先从控件里省**（§6.1 给出净减账本）。

### 1.3 素材与网络

```
web/src/assets/generated  →  5.5M / 30 个 PNG，全部 512×512
最大：ct_decompose 261KB · tile_python 241KB · mate_duo 240KB · tutor_turtle 212KB
```

实际渲染尺寸（`grep` CSS）：

```
ThinkingView.vue:161   .dim__ic       26px      RubricsView.vue:71  .dim__ic  30px
PairDock.vue:75        .seat__ava     34px      StudioView.vue:283  .msg__ava 34px
WorkbenchView.vue:81   .hero__mascot  92px      StudioView.vue:273  .hello__img 168px
```

**261KB 的 512px PNG 渲染在 26px 上。** 按「图标 128px / 角色 384px」重新导出实测（Pillow，附录 B 脚本 4）：

```
现状 5.38MB  →  重导出 PNG 1666KB  →  重导出 WebP(q=88) 342KB
```

审阅说的「~300KB」只有走 **WebP** 才成立，纯 PNG 是 1.6MB。本版按 WebP 主 + PNG 兜底写（§5.2）。

Pyodide：

```ts
// web/src/editor/turtle/usePyodide.ts:5-6
const PYODIDE_VER = 'v0.26.4'
const CDN = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VER}/full/`
```

文件自己的注释写着「生产应改本地托管 Pyodide 资源；当前从 CDN 加载」。而 `web/public/sw.js:49`：

```js
if (url.origin !== self.location.origin) return   // 第三方(CDN)交给浏览器
```

**Service Worker 明确放弃缓存它。** 40 台机房机器首次进 `/student/ide` ≈ 240MB 打境外 CDN。失败路径已经写好了——`IdeView.vue:253-259` catch 住加载失败，回退后端执行，**没有绘图**，且 `output` 里不会出现任何解释性文字。也就是说：海龟绘图（这个平台对 12–15 岁最有吸引力的东西）在网络不好的机房**静默消失**。

### 1.4 效度与安全

```python
# web/src/views/student/WorkbenchView.vue:14-16
<RingProgress :value="growth" size="88px" color="var(--color-accent)" class="hero__ring">
  <span class="ring-in"><b>{{ growth }}</b><small>成长</small></span>
# :69
growth.value = Math.round((c.decompose + c.abstract + c.model + c.algorithm + c.verify + c.transfer) / 6)
```

```python
# server/app/ct.py:82-89
ai_term = 0 if profile == "neutral" else ai_helps * 5
"decompose": _clamp(35 + fixes*6 + switches*4 + designs*5)
"abstract":  _clamp(30 + ai_term + runs*2 + designs*3)
"model":     _clamp(25 + designs*12 + runs*2)
"algorithm": _clamp(40 + success*4)
"verify":    _clamp(28 + fixes*9 + (20 if errors else 0))
"transfer":  _clamp(30 + max(0, success-2)*5 + switches*3)
```

`profile="neutral"` **只去掉 `abstract` 维的 `ai_helps*5` 一项**，其余五维仍是行为次数的单调函数。**neutral ≠ 中性。**

`summary_for` 的 13 处调用中，用默认 profile 且**结果会流向学生**的有四处：`insights.py:42`（`_facts`）、`:157`（`/my/recommend` 的 has_real_data 判断）、`:178`（`_recommend_for`，返回 `weak_score` 数值）、以及 `ct.py:142`（`/summary`，`WorkbenchView` 与 `ThinkingView` 都吃它）。`research.py:55` 用默认 profile 是研究导出口径错误，独立于学生端。

安全护栏词库（`server/app/guard.py:18-24`）：

```python
DANGER = {"self_harm": ([7 个词], 4), "violence": ([5 个词], 4),
          "fraud": ([4 个词], 3), "adult": ([4 个词], 2)}
SENSITIVE = ["傻逼", "滚蛋", "去死"]
```

纯字面 `in` 匹配。全角、空格、重复字符、拼音、拆字全部穿过。

防沉迷（`compliance.py:71-74` → `store.py:122 add_usage`）：客户端自报 `seconds`（clamp 0–120），`ON CONFLICT DO UPDATE SET total_seconds = total_seconds + excluded`。**无 session 边界、无频率限制、终身累加。** 不发心跳 = 用时 0；连发 = 任意膨胀。

密钥硬编码 5 处 + 1 个 pyc：

```
server/app/ai.py:19
web/scripts/gen-assets.py:8
Codex优化路线-生图与元素优化.md:32      ← v2 清单漏了这处
Codex优化路线-生图与元素优化.md:90
V2前端升级优化路线-review.md:25
server/app/__pycache__/ai.cpython-314.pyc（二进制命中）
```

---

## §2 设计立场：从大厂借什么、明确不借什么

参考对象：`landing.love`（动效）、`land-book.com`（版式）、以及编程教育（Scratch / Code.org / 洛谷 / 海龟编辑器 / CS50）、通用教育（Duolingo / Khan）、AI 产品（Claude / ChatGPT / Copilot / Cursor）的界面结构。

### 借（四条，每条都能落到本仓文件）

**B1 · 对话产品的「单栏 + 贴边工具」结构。** Claude / ChatGPT / Copilot Chat 的共同点：正文一栏居中定宽，功能按钮全部贴在输入框上或收进 `/` 命令，顶部几乎不放东西。我们的 `StudioView` 已经是这个骨架，但顶栏塞了两个开关（`:8 苏格拉底` `:13 ▤`）。**改法见 D2。**

**B2 · Duolingo / Khan 的「一屏一件事 + 进度是路径不是分数」。** 可以借的是**路径隐喻**（走到哪一步了），不能借的是**分数与连击**（§4、§10）。落地为 D6 的「任务链条」。

**B3 · land-book 收录页的版式共性：字阶跨度大、留白大、每屏一个视觉焦点。** 我们的 `tokens.css:44` 字阶是 `12/13/14/16/20/28/36`，`xs→base` 之间挤了三档，相邻档差 1px，视觉上等于没有层级。**改法见 D1。**

**B4 · landing.love 收录站的动效共性：动效只在「状态变化」时出现，且几乎全部是 opacity + transform 两个属性。** 我们的 `motion.css` 令牌体系（`--d-*` / `--e-*` / `.stagger` / `[data-cap=low]` 单点降级）已经是这个模型，**不需要改，只需要用起来**（现在 `.stagger` 有 10 个消费方，`useReveal` 只有 1 个）。

### 明确不借（四条，反对什么就说反对什么）

**N1 · 反对引入任何通用动效库（GSAP / Lottie / Framer）。** 理由不是「包大小」，是**主线程**：Monaco 与 ECharts 已经在抢主线程，`IdeView` 打字延迟是学生能直接感知的第一顺位体验。v2 定的 D4 分级（L0 CSS / L1 WAAPI / L2 GSAP 仅教研叙事页）保留，且 **L2 至今未采用，本版继续不采用**。

**N2 · 反对抄 Duolingo 的连击/宝石/排行榜。** 不是审美问题，是**课题作废风险**（§10.2）。任何「连续 N 天」「排名第 K」都会在初中机房这种同伴可见度极高的环境里产生刷量，而我们的六维分是行为计数函数。

**N3 · 反对「暗色显高级」。** landing.love 的暗色收录偏多是**营销落地页样本的收录偏好**，不能外推到课堂工具。本版只保留一处局部暗面板：给 `IdeView.vue:309,312` 已经硬编码的暗色补令牌（是清账，不是新增视觉决策）。

**N4 · 反对 View Transitions API。** `[data-cap=low]` 已经把 `--d-*` 压到 `.01ms`，低配机房本来就看不到；给能看到的高配机器再加一层是纯装饰，且它会和 `motion.css:24` 记录的「路由级 `<Transition mode="out-in">` 快速导航卡死」踩同一片地。**删除。**

---

## §3 P0 · 先把假绿灯换成真绿灯

**这是全表第一优先级。** 在门禁失效的情况下讨论「优化升级路线」，是在讨论一份不可验收的东西。半天工作量。

### 3.1 四个洞

| 洞 | 位置 | 现状 | 后果 |
|---|---|---|---|
| L-1 目录范围 | `web/scripts/lint-copy.mjs:15` `const VIEWS = path.join(ROOT,'src','views')` | 只 walk `src/views` | `InsightRail`(120 字) / `AiTutorPanel`(130 字) / `DesignPanel`(12 控件) 从未被检查 |
| L-2 嵌套截断 | `:35` `/<template>([\s\S]*?)<\/template>/` | 非贪婪 + 只匹配无属性 `<template>` | 含 `<template #slot>` / `<template v-if>` 的视图在第一个 `</template>` 处截断 |
| L-3 互斥分支 | `:38-45` R1、`:68` R3 | 只排除未展开 `<details>`，`v-if/v-else-if/v-else` 全量计入 | `AssessmentView` 三个互斥分支加总成 63；`StudioView` 60 字里 47 是同意书弹层 |
| L-4 常驻子组件 | 无 | 按单文件判定 | `StudioView` + `PairDock` 真实 12 控件顶格，拆开看每个都「合规」 |

**L-3 和 L-2 必须同一次提交里修。** 只修 L-2，`AssessmentView` 立刻红；只修 L-3，`ThinkingView`（真实 78 字，预算 90）会从「假通过」变成「真通过」但仍看不见组件。

### 3.2 修完之后的口径（写进脚本文件头注释，作为唯一权威）

1. **计入首屏**：模板中不被 `v-if/v-else-if/v-else` 包裹的节点；`v-show` 计入（DOM 常驻）。
2. **不计入首屏**：未展开的 `<details>`（保留现行规则）；根节点带 `data-lint="overlay"` 的块（模态/门禁/弹层——它们是**中断态**不是首屏）；互斥分支组中除**最大**分支外的其余分支（取 max 而非 sum，因为用户一次只能看到一个）。
3. **`data-lint="overlay"` 不是免检通行证**：脚本对带该标记的块**单独**判 R1/R3（预算固定 60 字 / 8 控件），超了照样红。这样「挂个 v-if 就免检」这条滥用路径被堵住。
4. **R4（新增）**：视图预算 = 视图自身（按上述口径）+ 所有在该视图模板中**无 `v-if` 挂载、且子组件自身根节点也无 `v-if`** 的子组件值之和。
   - `PairDock` 根节点是 `<div class="dock glass">`，无 `v-if` → **计入**。
   - `TaskChip` 根节点是 `<div v-if="items.length">` → **不计入常驻**，但脚本要打印一行 `ⓘ 条件常驻` 提示，并按「常驻 + 条件常驻」做**第二次**判定，超了报 R4-b（警告级，退出码仍 1）。这正是 `StudioView` 有推送时 14 控件的那个场景。

### 3.3 具体改动（可直接照做）

**改 `web/scripts/lint-copy.mjs`：**

```js
// :15 —— 目录范围
const SCAN_DIRS = [path.join(ROOT,'src','views'), path.join(ROOT,'src','components')]
;for (const d of SCAN_DIRS) walk(d)

// 新增：嵌套深度匹配（替换 :35 那一行）
function extractTemplate(src) {
  const i = src.indexOf('<template>')
  if (i < 0) return ''
  let d = 0, end = -1
  const re = /<template[\s>]|<\/template>/g; re.lastIndex = i
  let m
  while ((m = re.exec(src))) { if (m[0] === '</template>') { if (--d === 0) { end = m.index; break } } else d++ }
  return end < 0 ? '' : src.slice(i + 10, end)
}

// 新增：剥离 overlay 块并单独返回
function splitOverlay(tpl) {
  const overlays = []
  const rest = tpl.replace(/<(\w[\w-]*)([^>]*\bdata-lint="overlay"[^>]*)>[\s\S]*?<\/\1>/g,
                           (m) => { overlays.push(m); return ' ' })
  return { rest, overlays }
}

// 新增：互斥分支取 max（同一父节点下 v-if / v-else-if / v-else 视为一组）
function collapseBranches(tpl) { /* 按标签配对切块，同组取 cjk 最大的一块；实现 ~40 行 */ }

// 新增 R4：常驻子组件求和
const RESIDENT = new Map()   // 组件名 → {cjk, ctrl, conditionalRoot:boolean}
// 第一遍先算完所有 components/*.vue，第二遍算 views 时把无 v-if 引用的子组件加进来
```

**改 `web/package.json`：**

```json
"build": "npm run typecheck && npm run lint:copy && vite build"
```

（`check` 保留为别名，两条命令都能跑；这样「验收：`npm run build` 通过」这句话才有意义。）

**新增 `.github/workflows/ci.yml`**（现在没有 `.github`）：

```yaml
name: ci
on: [push, pull_request]
jobs:
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm', cache-dependency-path: web/package-lock.json }
      - run: npm ci
        working-directory: web
      - run: npm run build          # = typecheck + lint:copy + vite build
        working-directory: web
  server:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -r server/requirements.txt -r server/requirements-dev.txt
      - run: python -m pytest -q
        working-directory: server
```

### 3.4 P0 门禁验收（能被卡住的那种）

1. `cd web && node scripts/lint-copy.mjs` 输出行数 ≥ 40（现在只有 21 个视图，加上 `src/components` 后应到 40+ 个文件），且**逐个打印 `文件 cjk=x/budget ctrl=y` 明细**，不再只打一行「✓ 通过」。
2. 构造回归用例：在 `AssessmentView.vue` 的 `done` 分支里塞 20 个中文字符 → lint 必须红（证明 L-2 修好了）；把这 20 个字挪进新的第四个 `v-else-if` 分支 → lint 必须**仍然红**（证明 L-3 没有变成免检口子）。
3. 在 `StudioView.vue` 里再加一个 `<button>` → lint 必须报 R4（证明常驻子组件求和生效）。
4. `cd web && npm run build` 三段全跑，任一段失败退出码非 0。
5. **修完先不改任何 UI，跑一遍，把红出来的全部修掉，把结果写进 `progress.md` 作为账本基线。** 之后每一条「趣味化」增项都从这个基线上扣。

---

## §4 P0 · 拆掉学生端的分数（效度红线，一小时）

**这是唯一一条会让整个课题数据作废的问题，而它已经在线上。**

### 4.1 前端

**`web/src/views/student/WorkbenchView.vue`**

- 删 `:14-16` 的 `<RingProgress :value="growth" …>` 整块。
- 删 `:69` 的 `growth.value = Math.round((...)/6)` 与对应的 `const growth = ref(0)`。
- 替换为**不带分数的过程陈述**，数据源必须来自计数事实而非 `ct_scores`：

```vue
<!-- 替换 :14-16 —— 陈述做过什么，不给任何可比较的数字标度 -->
<div class="hero__done">
  <img :src="asset('mate_fox_cheer')" class="hero__done-ic" alt="" />
  <p>本周你完成了 <b>{{ weekTasks }}</b> 个任务</p>
</div>
```

`weekTasks` 取 `pushes/push_targets` 里 `done_at` 落在本周的条数（`resourcesApi` 已有推送列表接口），**不经过 `ct.py`**。

判据：这个数字**不能**随「多点一次 AI」「多跑一次代码」上涨；它只随老师推送的任务被完成而上涨，而任务完成需要老师确认或答题正确，学生刷不动。

- **`ThinkingView.vue`（六维雷达）**：不删页面，但删掉数值标签，只保留形状 + 每维的**文字档位**（弱/中/强，来自后端 `weak_dim` 文字，见 4.2），并在页头加一句：`这张图看的是「你最近在练什么」，不是分数。`（15 字，在 90 预算内）

### 4.2 后端（四处，全部一两行）

| 文件:行 | 现状 | 改成 |
|---|---|---|
| `server/app/insights.py:42` | `cs = summary_for(uid)` | `cs = summary_for(uid, profile="neutral")` |
| `server/app/insights.py:157` | `cs = summary_for(uid)` | `cs = summary_for(uid, profile="neutral")` |
| `server/app/insights.py:178` | `cs = summary_for(uid)` | `cs = summary_for(uid, profile="neutral")` |
| `server/app/research.py:55` | `cs = summary_for(uid)` | `cs = summary_for(uid, profile="neutral")` |

并且 `_recommend_for`（`insights.py:174-212`）的**返回体分学生/教师两版**：

```python
def _recommend_for(uid: str, limit: int = 3, for_student: bool = False):
    ...
    out = {"student_id": uid, "weak_dim": DIM_CN[weak_key], "reason": reason,
           "targeted": targeted, "exercises": [...], "videos": [...]}
    if not for_student:
        out["weak_score"] = weak_score          # 只给教师
    return out
```

`reason` 的两处 f-string 里的 `（{weak_score} 分）` 在 `for_student=True` 时必须改成不含数字的措辞：
`f'「{DIM_CN[weak_key]}」最近练得最少，建议先练{diff_cn}难度'`。
`/my/recommend`（`:150`）传 `for_student=True`；`/recommend/{uid}`（`:163`，教师权限）传 `False`。

`ct.py:142` 的 `/summary` 端点是学生端 `WorkbenchView` / `ThinkingView` 的数据源，改为：

```python
@router.get("/summary")
def summary(user: dict = Depends(current_user)):
    cs = summary_for(user.get("sub", "anon"), profile="neutral")
    if user.get("role") == "student":
        # 学生只拿到「强/中/弱」三档的**排序**，不拿分值
        dims = cs.pop("ct_scores")
        order = sorted(dims, key=dims.get)
        cs["ct_rank"] = {"weak": order[:2], "mid": order[2:4], "strong": order[4:]}
    return cs
```

**为什么这个必须在后端而不是前端隐藏**：前端隐藏的话数值仍然在响应体里，学生打开 DevTools 就能看见并互相比较——初中机房里这件事一定会发生。而且一旦有学生发现「多点 AI 涨分」，行为数据当场被污染，事后无法从日志里剔除。**这是数据源头的问题，只能在源头堵。**

### 4.3 验收

1. `pytest server/tests/ -q` 68 项仍全过；新增 `test_student_summary_has_no_scores`：以 student 令牌请求 `/api/ct/summary` 与 `/api/my/recommend`，断言响应 JSON 递归展平后**不含任何 key 匹配 `.*_score$` 或 `ct_scores`**。
2. 浏览器：登录 `stu-xiaoma` → `/student/home`，DevTools Network 面板里 `/api/ct/summary` 的响应体全文搜索 `ct_scores` 无命中。
3. 手工反证：连续点 10 次 AI 求助后刷新 `/student/home`，页面上**没有任何数字发生变化**。

**P2 的「三档掌握度」在本节做完之前不得开工**，且三档若由 `weak_score` 推出，它同样是行为计数的函数——见 §10.2 的处置。

---

## §5 P0/P1 · 机房可用性（唯一「整个机房当场用不了」的风险）

### 5.1 Pyodide 本地化

**改 `web/src/editor/turtle/usePyodide.ts:5-6`：**

```ts
const PYODIDE_VER = 'v0.26.4'
// 本地托管（web/public/pyodide/）。校内部署把该目录随构建产物一起分发；
// VITE_PYODIDE_BASE 可指向校内反代（如 http://10.x.x.x/pyodide/）。
const CDN = import.meta.env.VITE_PYODIDE_BASE || `/pyodide/${PYODIDE_VER}/full/`
```

**落盘**：新增 `web/scripts/fetch-pyodide.mjs`，从 jsdelivr 一次性下载到 `web/public/pyodide/v0.26.4/full/`，只取运行 turtle shim 必需的文件（`pyodide.js` / `pyodide.asm.js` / `pyodide.asm.wasm` / `python_stdlib.zip` / `pyodide-lock.json`，约 12MB 未压缩、gzip 后 ~6MB）。加进 `.gitignore`，并在 `package.json` 加 `"prebuild": "node scripts/fetch-pyodide.mjs"`（幂等：文件存在则跳过）。

**改 `web/public/sw.js`**，在 `:49` 的跨域 `return` **之前**插入：

```js
if (url.pathname.startsWith('/pyodide/')) {      // 同源本地托管，体积大且不可变 → CacheFirst
  e.respondWith(cacheFirst(e.request))
  return
}
```

（本地化后 `/pyodide/` 是同源，其实会被 `:57` 的扩展名规则接住走 stale-while-revalidate；显式提前到 CacheFirst 是为了避免每次都发条件请求——机房 40 台机器同时发 40 个 304 也是可观的。）

**改 `web/src/views/student/IdeView.vue:253` 的 catch 块**——现在是静默降级：

```ts
} catch {
  const r = await runCode('python', code.python, auth.token)
  output.value = ((r.stdout || '') + (r.stderr ? '\n' + r.stderr : '')).trim() || '(无输出)'
  turtleFallback.value = true          // ← 新增
  ...
}
```

模板里加一行（`data-lint="overlay"` 不适用，这是常驻提示，计入预算 12 字，IdeView 余量 53 字够）：

```vue
<p v-if="turtleFallback" class="warn">画图功能没连上，现在只能看文字结果。告诉老师这台机器要装本地 Python。</p>
```

**为什么必须给学生看见**：静默降级下，学生只会认为「我写的海龟代码是错的」，而这是环境问题。让学生看不到错误原因，比功能不可用更糟——它把系统故障归因到学生自己身上。

**验收**：
1. 断网（或 hosts 屏蔽 `cdn.jsdelivr.net`）后首次进 `/student/ide`，运行 `import turtle; t=turtle.Turtle(); t.forward(100)` **仍能画出线**。
2. Chrome DevTools → Application → Cache Storage，`jiedui-assets-v2` 中存在 `/pyodide/v0.26.4/full/pyodide.asm.wasm`。
3. 二次进入 `/student/ide`，Network 面板里 pyodide 相关请求全部 `(ServiceWorker)`，无网络字节。

### 5.2 素材瘦身（5.38MB → 342KB，实测）

**改 `web/scripts/post-assets.py`。** 现行 `:24-25` 是：

```python
im.thumbnail((512, 512), Image.LANCZOS)
im.save(p, "PNG", optimize=True)
```

**问题不止是尺寸，还有「就地覆盖」**：`im.save(p)` 写回原路径，1024px 的生图原件已经不存在了。所以任何「换个阈值重跑」都是在已经被破坏的数据上再处理一次——而且 `:12` 的 `already` 判断（透明占比 > 3% 则跳过去底）会让第二次运行跳过去底、直接再缩一次。**流水线现在不是幂等的，是累积破坏的。**

**改法：拆成两目录，读写分离。**

```python
# web/scripts/post-assets.py（重写）
RAW = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "_raw")        # 生图原件，gitignore
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "generated")   # 产物

# 角色类出 384px（最大渲染 168px 的 @2x），图标类出 128px（最大渲染 34px 的近 @4x）
CHAR_PREFIX = ("mate_", "teacher_", "tutor_", "hero_", "mascot_")
def target_size(name): return 384 if name.startswith(CHAR_PREFIX) else 128

for src_path in glob.glob(os.path.join(RAW, "*.png")):
    name = os.path.splitext(os.path.basename(src_path))[0]
    im = dewhite(Image.open(src_path).convert("RGBA"))   # ① 去底（见 5.3）
    im = defringe(im)                                    # ② 去白边（见 5.3）
    im = premul_resize(im, target_size(name))            # ③ 预乘缩放
    im.save(os.path.join(OUT, name + ".webp"), "WEBP", quality=88, method=6)
    im.save(os.path.join(OUT, name + ".png"),  "PNG",  optimize=True)   # 兜底
```

同步改 `web/scripts/gen-assets.py`：输出目录从 `src/assets/generated` 改为 `src/assets/_raw`，**不做任何后处理**。

`web/src/assets/assets.ts:7-13` 增加 WebP 优先：

```ts
const webp = import.meta.glob('./generated/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
for (const k in svg)  reg[base(k)] = svg[k]
for (const k in png)  reg[base(k)] = png[k]
for (const k in webp) reg[base(k)] = webp[k]     // WebP 最优先
```

（WebP 在 Chrome 32+/Edge/Firefox 65+ 全支持；机房若有 IE 或极老 Chrome，PNG 同名文件仍在盘上，把这一行注释掉即可回退——这是一行开关，不是重构。）

**验收**：
1. `du -sh web/src/assets/generated` ≤ 800KB（实测重导出 WebP 342KB + PNG 兜底；若只算 WebP 则 ≤400KB）。
2. `npm run build` 后首屏 chunk 仍 ≤ 132KB。
3. 浏览器 200% 缩放下看 `/student/thinking` 的 26px 六维图标与 `/student/studio` 的 168px `mate_duo`，**不出现可见马赛克**（这一条是人眼判断，写在这里是因为它没有客观替代物——见 §12）。

### 5.3 白边：成因确定，不做 A/B，不重新生图

**成因（实测确认）**：`post-assets.py:16-17` 的 `thresh=40` 从 (255,255,255) 出发只淹到亮度 ~215，抗锯齿边界上亮度 216–254 的一圈像素保持 alpha=255。

```
ct_abstract.png  edgepx=352  mean_lum=222.0   ct_verify.png    edgepx=595  mean_lum=227.2
ct_decompose.png edgepx=665  mean_lum=183.9   tile_python.png  edgepx=560  mean_lum=181.8
mate_fox.png     edgepx=597  mean_lum=192.6
```

**排除了「非预乘缩放」这个替代解释**：把现有文件做预乘缩放再反预乘，边缘带亮度从 223.6 升到 **247.7**——反预乘把它还原得更白了，说明这些像素的 RGB **本身就是白的**，不是缩放时从透明区域蹭来的。这是分割问题，不是合成问题。（顺带：现有文件里 alpha=0 区域的 RGB 已被压成 0（黑），所以**再对现有文件做一次朴素缩放会往边缘渗黑**——这是第二个不能盲目重跑流水线的理由。）

**修法（两段，都是确定性的）：**

```python
# ① 放宽分割阈值：thresh 40 → 100（覆盖 216–254 那一带）
ImageDraw.floodfill(rgb, c, (255, 0, 254), thresh=100)

# ② 收边 + 羽化：不依赖亮度判断，直接把 alpha 边界内缩再羽化
from PIL import ImageFilter
def defringe(im, erode=2, feather=1.5):
    im = im.convert("RGBA"); r, g, b, a = im.split()
    a = a.filter(ImageFilter.MinFilter(erode * 2 + 1)).filter(ImageFilter.GaussianBlur(feather))
    return Image.merge("RGBA", (r, g, b, a))
```

代价：在 1024px 原件上内缩 2px，缩到 128px 后是 0.25px，肉眼不可见。

**可判定的验收式**（这是本方案里最硬的一条素材验收，实测有效）：

```python
def bright_ring(im, lo=205):
    """alpha>=250 且自身亮度>lo 且 3x3 邻域内存在 alpha<60 的像素数 —— 硬白边像素。"""
    im = im.convert("RGBA"); w, h = im.size; p = im.load(); c = 0
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            r, g, b, a = p[x, y]
            if a < 250 or 0.299*r + 0.587*g + 0.114*b <= lo: continue
            if min(p[x+dx, y+dy][3] for dx in (-1,0,1) for dy in (-1,0,1)) < 60: c += 1
    return c
```

实测本轮：

```
ct_verify.png   bright_ring 420 → 0     ct_abstract.png bright_ring 235 → 0
tile_python.png bright_ring 115 → 0     mate_fox.png    bright_ring 222 → 0
```

**验收：`web/scripts/check-assets.py` 对 `generated/*.png` 逐个跑 `bright_ring`，任一 > 0 则退出码 1，接进 `npm run build` 的 prebuild。**

**我反对 v2 的「边缘亮度均值 ≤ 200」这条验收线，理由是它不是有效判据**：`mate_fox` 有浅色腹毛、`ct_abstract` 是浅蓝徽章，它们边缘本来就亮。用亮度均值当阈值，等于强迫所有素材变深。`bright_ring == 0` 才是对的——它判的是「有没有硬切边」，与配色无关。

**关于要不要重新生图**：现有 30 张的 1024px 原件已被覆盖，`defringe` 只能在 512px 产物上做部分修复（能把 `bright_ring` 打到 0，但内缩的 2px 是在已经压缩过的图上损失的）。**结论是折中的**：先修流水线 + 对现有 30 张跑一次修复（成本 10 分钟，`bright_ring` 归零，5.38MB → 342KB），**不重新生图**；只有当 P1-Gate（§11）判定形象方案需要调整时，才在**已修好的流水线**上重跑生图。**先修流水线再生图，顺序不能反**，否则就是给同一个 bug 生产新副本。

---

## §6 UI 简约化改造清单

以下每条都给出文件、行、函数，以及它对 §3.2 账本的净额影响。老 D 编号（D1–D18）全部作废，本版重新编号。

### D1 · 字阶重排（`web/src/styles/tokens.css:44`）

```css
/* 现状：12/13/14/16/20/28/36 —— xs→base 三档挤在 2px 内，等于没层级 */
--fs-xs:12px; --fs-sm:13px; --fs-base:14px; --fs-md:16px; --fs-lg:20px; --fs-xl:28px; --fs-2xl:36px;

/* 改为：删掉 sm（并入 xs），拉开正文与标题 */
--fs-xs:12px; --fs-sm:12px; --fs-base:15px; --fs-md:17px; --fs-lg:22px; --fs-xl:30px; --fs-2xl:40px;
```

`--fs-sm` 保留为 `--fs-xs` 的别名而不删，是为了不动 30+ 处调用点；后续可以慢慢清。相邻档比值从 1.08 拉到 1.13–1.36，标题/正文比从 2.57 到 2.67。

**净额**：0 字 / 0 控件。**验收**：`npm run build` 通过；`grep -rn "fs-sm" web/src/ | wc -l` 不增加。

### D2 · `StudioView` 顶栏清空（这是控件净减的主力）

现状顶栏两个按钮：`:8-12` 苏格拉底开关、`:13` 学习面板开关（`▤`）。

- **苏格拉底开关移进输入区的左侧动作组**，和 `:63 🎨` `:64 📋` 并列，改成图标 + tooltip，不带文字。理由：它是「本次提问怎么问」的修饰，属于输入行为，放输入框旁边符合 B1。**控件数不变**（挪位不是删除），但顶栏从 2 个降到 1 个，视觉焦点回到对话。
- **`▤` 学习面板改成快捷键 + 空态入口**：删掉常驻按钮，改为 (a) 快捷键 `Alt+I`，(b) 只在 `msgs.length >= 6` 时才出现一枚贴边小把手。**净减 1 控件（常态）。**

### D3 · 删 `AiTutorPanel.vue`（净减最大的一刀）

`components/editor/AiTutorPanel.vue` 是 7 控件 / 130 字，且和 `StudioView` 的对话功能重复。`IdeView.vue` 里有它的挂载点与一个 deep-link 入口。

- 删组件文件、删 `IdeView.vue` 中的 `<AiTutorPanel>` 与 `showAi` 状态、删 deep-link 分支。
- **补偿**：在 Monaco 的 gutter 上加「问小枭」行内入口（D7），跳回 `/student/studio?q=<选中代码>`。
- **净减**：`IdeView` −1 控件（面板开关），`src/components` 少 130 字（修完 lint 之后这 130 字才第一次进账本）。

**我反对 v2 里「删掉之后学生就没有主动提问入口」这个担忧被当作不删的理由**：现在的 `AiTutorPanel` 本身也不是好入口（要先开面板），而 gutter 入口比它更近。真正的风险是学生频繁跨路由跳转——这条列入 §12 需要课堂验证。

### D4 · `InsightRail` 的 120 字治理（`components/studio/InsightRail.vue`）

四个页签（总结/错题/行为/进阶）全部把说明文字写在正面。改法：
- 每个页签正面只留**一行结论**（≤14 字，套用 R2 的瓷片规则）。
- 解释文字进 `<details>`（lint 不计入）或 `title` tooltip。
- 目标：120 → **≤40 字**。

### D5 · `DesignPanel.vue` 砍掉，不搬家

`components/editor/DesignPanel.vue` 12 控件 / 49 字。v2 讨论的是「搬进 Peek 还是独立路由」。**我反对搬家**：无论搬到哪，宿主页的 R4 求和都会顶爆（`CasesView` 控件余量已是 0）。而它的功能（流程图/伪代码设计）与 `BlockEditor` 的积木模式高度重叠。

**处置**：删除 `DesignPanel.vue` 与其在 `IdeView` 的挂载；`design_create` 埋点改由**积木模式首次拼出 ≥3 块**时触发（这个信号比「打开过设计面板」更接近「学生真的做了分解」）。

⚠️ **这会改变 `ct.py:86` `model = 25 + designs*12 + runs*2` 的输入分布**，属于口径变更，必须同时把 `ct.py:58` 的 `FORMULA_VERSION` 从 `"ct-rules/v1"` 升到 `"ct-rules/v2"`，并在 `研究导出` 里带上版本号，否则跨版本数据不可比。**若当前有 `running` 状态的课题，本条推迟到该课题 `closed` 之后。**

### D6 · 「任务链条」替代「分数环」（承接 §4.1 与 B2）

`WorkbenchView` 拆掉圆环后，用一条 3–5 节的横向链条表示老师推送的任务序列：已完成节点实心 + 打勾，当前节点脉冲一次（`motion.css` 的 `--d-base` + `--e-spring`，0 KB），未来节点空心。

- 数据源：`GET /api/student/tasks/chain`（§8.1，新端点）。
- **不显示任何百分比、分数、排名。**
- **净额**：+0 控件（整条链条是一个 `@click` 容器）、+6 字（`本周任务`+节点标题走 `{{ }}` 插值，不计入 R1）。

### D7 · Monaco gutter 行内提问（补 D3 删掉的入口）

在 `components/editor/CodeEditor.vue` 注册 `monaco.editor.registerCodeLensProvider`（或更轻的 glyph margin 装饰），在**有报错的行**旁显示一个 🦉，点击 → `router.push('/student/studio?ask=' + encodeURIComponent(lineText))`。

**净额**：+0（Monaco 内部装饰不进 Vue 模板，lint 看不到，也确实不占「首屏交互元素」的认知预算——它只在出错时出现）。

### D8 · `usePeek.close/reset` 用 `go(-1)`（`composables/usePeek.ts:39-46`）

现状两个函数都用 `router.push`，导致「关闭抽屉」也压一条历史，浏览器后退键会把抽屉重新打开——和文件头注释宣称的「后退键天然 = 收起一层」相反。

```ts
let pushedByUs = 0
function open(t: PeekTarget) { ...; router.push({...}); pushedByUs++ }
function close() {
  if (pushedByUs > 0) { pushedByUs--; router.go(-1); return }
  router.replace({ query: { ...route.query, peek: stack.value.slice(0,-1).join(',') || undefined } })
}
function reset() {
  if (pushedByUs > 0) { const n = pushedByUs; pushedByUs = 0; router.go(-n); return }
  router.replace({ query: { ...route.query, peek: undefined } })
}
```

**验收**：`/teacher/teaching/students` → 开两层 Peek → 按两次浏览器后退 → 回到无 `?peek` 的列表页，且**不再前进出抽屉**。

### D9 · 教研区去卡通化（假设，非事实）

教研区 8 页（`views/teacher/research/*`）改用冷色 `#6C9CE9` 主导、去掉 `mate_*` 形象、图表容器用局部暗面板（给 `IdeView.vue:309,312` 已硬编码的暗色补令牌 `--surface-dark:#1E2433` / `--on-surface-dark:#E6EAF2`，并在 `tokens.css` 注册）。

**这条基于「教师会截图进评审材料」这个假设，没向真实教师核实过。** P1-Gate 进校时顺便问 2 位老师，成本为零（§11）。如果老师说无所谓，这条**删掉**，不做。

### D10 · `.stagger` 全站接入（0 KB，已有令牌）

`motion.css:33-36` 的 `.stagger` 现有 10 个消费方，`useReveal` 只有 1 个。把 `BentoGrid` / `CeramicTile` 列表 / `InsightRail` 页签内容统一接上 `.stagger` + `style="--i:n"`。

⚠️ **两步顺序不能反**：先给元素接上 `.is-in` 类，再改 CSS 的 `animation-play-state`。反了 = 10 个页面白屏。（这是 v2 记录的踩坑，本版保留。）

---

## §7 趣味化改造清单

原则：趣味化只加在**状态变化的瞬间**和**空态**，不加在常驻界面上。四条，全部有明确的账本代价。

### D11 · 换位仪式（结对机制的核心，值得花预算）

`components/studio/PairDock.vue:18-20` 的 `swap` 现在只是转一下 `⇄`。改为一段 600ms 的换位动画：两个座位卡水平交换位置（`transform: translateX` + `--e-spring`），交换完成后新角色的 hint 文字淡入。

- 实现：`composables/useMotion.ts`（已存在，WAAPI ~2KB），**不引库**。
- `[data-cap=low]` / `prefers-reduced-motion` 下 `--d-*` 已被压到 `.01ms`，自动退化为瞬间切换，无需额外分支。
- 同时修 `Alt+R` 快捷键（现在只在 `PairDock` 聚焦时生效，改到 `StudioView` 的 `onMounted` 里挂全局监听并在 `onUnmounted` 卸载）。

**净额**：+0 字 / +0 控件（复用已有的 `swap` 按钮）。

### D12 · 空态里的搭档（唯一允许的拟人化常驻位）

`StudioView.vue:20-27` 的空态已经有 `mate_duo` 168px。保留，并把 `starters` 的 4 枚 chip 改成**按当前角色变化**：
- 驾驶员（小狐写码）：`帮我写一个…` / `这段代码怎么改`
- 领航员（小枭审查）：`我卡住了` / `帮我看看这段`

**净额**：+0（chip 文案走 `{{ }}` 插值，且 chip 数量不变）。

### D13 · 里程碑（一次性，不累积，不排名）

首次完成这四件事时，弹一枚 2 秒后自动消失的 toast + `mate_fox_cheer`：
1. 第一次成功运行代码
2. 第一次自己修好一个报错
3. 第一次换位
4. 第一次用积木拼出 3 块以上

**硬约束**：
- 每个里程碑**一生只弹一次**（后端记录，见 §8.2），不是「每天一次」也不是「每次都弹」。
- **没有计数、没有徽章墙、没有「还差 N 个」**——这四条是防止它退化成收集游戏的关键。
- toast 挂 `data-lint="overlay"`，按 §3.2 的 overlay 口径单独判 60 字 / 8 控件（实际 ~12 字 / 1 控件）。

**为什么只有四个、为什么是这四个**：这四件事都是**能力事件**而不是**行为次数**——「第一次修好报错」和「修了 20 次报错」在动机效果上不是一回事，前者是能力感（competence）的确认，后者是刷量。Deci/Koestner/Ryan (1999) 的元分析区分的正是这两类反馈。（引进课题报告前请核对原文，不要转引本文档。）

### D14 · 幽灵提问（领航员模式的可感知化）

领航员（小枭）模式下，学生停止输入 20 秒且代码有未处理报错时，在输入框 placeholder 里淡入一条问题（不是消息、不占对话流、不发请求）：`要不要先看看第 {{n}} 行？`

**净额**：+0（placeholder 是属性，不进 R1 正文计数）。
**上限**：同一次会话最多出现 2 次，且学生开始输入即消失。

### D15 · 「写完了，等你看」—— phase 用完成时态，不做流式化

**这是本版对 v2 P2-a 的替代方案，也是最终方案，不是备选。**

`ai.py:141` `/chat` 保持普通 JSON 返回。响应体加一个 `phase` 字段，取值只有三个终态：

```python
# ai.py /chat 返回体新增
"phase": "written" | "asked" | "blocked"
```

前端 `StudioView` 在 AI 气泡下方渲染一行 ≤8 字的状态：
- `written` → `写完了，等你看`
- `asked` → `有 {n} 个问题要问你`
- `blocked` → `这个我不能写，我们一起想`

**明令禁止写成进行时**（`在写第 3 步…`）——非流式下那是在界面上撒谎。

**为什么不做流式化**：它买到的唯一东西是时态措辞；代价是 (1) `_call_llm`（`ai.py:84-96`）从 `urllib` 换成流式 client（新依赖）；(2) `test_safety.py` 里所有断言 `r.json()["reply"]` 的用例重写；(3) **出口侧增量护栏**——现在护栏是进 LLM 前一次性做（`ai.py:154` `guard.check_bundle`），流式后模型可能在第 200 个 token 才吐出不当内容，需要一套本项目从未做过的增量过滤；(4) `_clean` 的 `<think>` 剥离（`ai.py:101-108`）要改成增量状态机，而 `_OPEN_THINK`（`:104`）那条「截断未闭合」规则在增量场景下会把正文开头当思维链吞掉。**用风险最高的一块换一个措辞差别，投入产出比是全表最差。删除。**

---

## §8 后端：端点、表结构、以及「为什么非后端不可」

**本仓约束**：标准库 `sqlite3`，建表走 `executescript` + `CREATE TABLE IF NOT EXISTS`；**`CREATE TABLE IF NOT EXISTS` 不会 ALTER 已存在的表**，给老表加列必须走 `store_study.py:43` 的 `_ensure_column(c, table, col, decl)`（`store.py:74` 有同名的 `_add_column`，两者实现相同）；级联删除全部手写（未开 `PRAGMA foreign_keys`）。

### 8.1 任务链条（D6）

```
GET /api/student/tasks/chain      权限：current_user（学生本人）
→ {"items":[{"id":..,"title":"..","kind":"exercise|video|assessment","done":true|false,"at":ts}]}
```

**实现**：`server/app/resources.py` 新增，读 `push_targets` + `pushes` 表（`store_resources.py:135,147`，已存在），按 `pushes.created_at` 排序取最近 5 条，`student_id = user["sub"]`。

**为什么非后端不可**：任务序列由老师推送产生，学生本地无从得知；且「已完成」的判定（答题正确/视频看完）必须服务端裁定，否则学生改 localStorage 就能把链条点满——那正是我们在 §4 花力气堵掉的那类漏洞。

**新表**：无。

### 8.2 里程碑（D13）

**为什么非后端不可**：「一生只弹一次」必须跨设备、跨清缓存生效。放 localStorage 的话，学生换台机器或清一次缓存就能重刷动画——一旦可重刷，它就从「能力确认」退化成「可以反复触发的奖励」，正是 §10.2 要避免的东西。

```sql
-- server/app/store.py init() 的 executescript 里追加
CREATE TABLE IF NOT EXISTS milestones(
  user_id TEXT NOT NULL,
  kind    TEXT NOT NULL,          -- first_run | first_fix | first_swap | first_blocks3
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, kind)      -- 天然去重：一生一次
);
```

```python
# server/app/store.py 新增
MILESTONE_KINDS = ("first_run", "first_fix", "first_swap", "first_blocks3")

def claim_milestone(user_id: str, kind: str) -> bool:
    """首次达成返回 True 并落库；重复调用返回 False。"""
    if kind not in MILESTONE_KINDS:
        return False
    with _lock, _conn() as c:
        cur = c.execute("INSERT OR IGNORE INTO milestones(user_id,kind,created_at) VALUES(?,?,?)",
                        (user_id, kind, _now()))
        return cur.rowcount == 1

def list_milestones(user_id: str) -> list[str]:
    with _conn() as c:
        return [r["kind"] for r in c.execute(
            "SELECT kind FROM milestones WHERE user_id=? ORDER BY created_at", (user_id,))]
```

```
POST /api/student/milestone      权限：current_user   body: {"kind": "first_run"}
→ {"first": true|false}          first=true 时前端才播动画
GET  /api/student/milestones     权限：current_user
→ {"kinds": ["first_run", ...]}
```

放在 `server/app/compliance.py`（它已经是「学生个人状态」的归属地）或新建 `server/app/gamify.py` 并在 `main.py:41` 注册。**注意本表不参与任何 `ct_*` 计算，`ct.py` 一个字都不改。**

### 8.3 会话边界（修 §1.4 的防沉迷洞）

**为什么非后端不可**：客户端自报累计值本身就是可伪造的；服务端至少要有「同一 session 内的心跳按服务端时钟计时，且相邻心跳间隔 > 5 分钟视为新 session」这个裁定。这不是完美防伪（学生仍可少发心跳把时长做低），但它把「任意膨胀」堵死了——而膨胀方向才是研究报告里会被质疑的方向。

```python
# server/app/store.py —— 老表加列，必须走幂等迁移
def init():
    ...
    _add_column(c, "usage_sessions", "session_start", "INTEGER DEFAULT 0")
    _add_column(c, "usage_sessions", "session_seconds", "INTEGER DEFAULT 0")
    _add_column(c, "usage_sessions", "beat_count", "INTEGER DEFAULT 0")
```

```python
GAP = 300        # 5 分钟无心跳 = 新会话
MIN_BEAT = 20    # 两次心跳最小间隔（服务端时钟），更密的丢弃

def add_usage(user_id: str, seconds: int) -> dict:
    now = _now()
    with _lock, _conn() as c:
        r = c.execute("SELECT total_seconds,last_at,session_start,session_seconds "
                      "FROM usage_sessions WHERE user_id=?", (user_id,)).fetchone()
        if not r:
            c.execute("INSERT INTO usage_sessions(user_id,total_seconds,last_at,"
                      "session_start,session_seconds,beat_count) VALUES(?,?,?,?,?,1)",
                      (user_id, seconds, now, now, seconds))
            return {"session_seconds": seconds, "total": seconds}
        gap = now - (r["last_at"] or 0)
        if gap < MIN_BEAT:                       # 刷心跳：直接丢
            return {"session_seconds": r["session_seconds"], "total": r["total_seconds"]}
        # 以**服务端时钟**为准，客户端自报值只作上限
        delta = min(seconds, gap)
        if gap > GAP:                            # 新会话
            c.execute("UPDATE usage_sessions SET total_seconds=total_seconds+?, last_at=?, "
                      "session_start=?, session_seconds=?, beat_count=1 WHERE user_id=?",
                      (delta, now, now, delta, user_id))
            return {"session_seconds": delta, "total": r["total_seconds"] + delta}
        c.execute("UPDATE usage_sessions SET total_seconds=total_seconds+?, last_at=?, "
                  "session_seconds=session_seconds+?, beat_count=beat_count+1 WHERE user_id=?",
                  (delta, now, delta, user_id))
        return {"session_seconds": r["session_seconds"] + delta, "total": r["total_seconds"] + delta}
```

`compliance.py:71-74` 的 `usage_heartbeat` 返回体改为带 `session_seconds`，前端据此在**连续会话 40 分钟**时弹一次休息提醒（`mate_owl_think`，`data-lint="overlay"`，一节课一次）。

**40 分钟是按一节课时长取的，不是医学阈值。**

### 8.4 安全护栏归一化（修 §1.4 的纸墙）

**为什么非后端不可**：护栏在客户端等于没有护栏。这条只是把已有的服务端护栏做厚。

```python
# server/app/guard.py —— 在 classify_danger / check_input 匹配前插入
import unicodedata

def normalize(text: str) -> str:
    """归一化：全角→半角、去空白与常见分隔符、压缩重复字符、繁→简（可选）。
    目的不是挡住有意绕开，是挡住「傻  逼」「傻傻逼」「ｓ傻逼」这类零成本变形。"""
    t = unicodedata.normalize("NFKC", text)
    t = re.sub(r"[\s\-_·.。，,、*~^]+", "", t)
    t = re.sub(r"(.)\1{2,}", r"\1", t)          # 三连以上压成一个
    return t.lower()
```

`classify_danger` / `check_input` 中所有 `w in text` 改为 `w in normalize(text)`（**同时保留对原文的匹配**，两者取或——归一化可能把正常句子里的词粘出误报，两路并联再由 `FRAUD_OK_CONTEXT` 那套语境豁免收口）。

词库外置到 `server/app/wordlists/danger.json` + `sensitive.json`，`guard.py` 启动时读；文件不存在则回退现有硬编码（保证测试与离线可跑）。

**表结构**：无变更。
**验收**：`server/tests/test_safety.py` 新增 `test_guard_normalized_variants`，对 `["傻 逼", "傻傻逼", "自　杀", "ＳＢ去死"]` 断言全部被拦。

### 8.5 教师班级归属（修 §1.4 的全校数据泄露）

`store.py` 的八处 `WHERE user_id LIKE 'stu-%'`（`:139 :141 :143 :147 :149 :167 :169 :171`）对任意教师账号开放全校数据。

```python
# server/app/store.py —— 两个聚合函数加可选班级过滤
def list_students(class_ids: list[str] | None = None):
    if not class_ids:
        ...  # 保持现状（单校单老师/管理员路径）
    ph = ",".join("?" * len(class_ids))
    # 把每处 `WHERE user_id LIKE 'stu-%'` 改为
    #   WHERE user_id IN (SELECT student_id FROM class_students WHERE class_id IN (<ph>))
```

调用点：`teacher.py:34 /live`、`teacher.py:69 /home`、`teacher.py:92`（`summary_for` 循环）传 `class_ids = [c["id"] for c in store_resources.classes_of_teacher(user["sub"])]`。

`classes_of_teacher` 若不存在则新增（`store_resources.py`，读 `classes` 表的 `owner_id`，该表在 `:95`）。

**为什么非后端不可**：这是授权边界，前端过滤等于没过滤。
**为什么现在做而不是推迟**：它是**规模放大型**的洞——单校单老师看不出来，一旦第二个老师入驻就是事故，而入驻是随时可能发生的。

### 8.6 密钥（P0-0，供应商侧先做）

顺序不能反：**先在供应商侧吊销 `${AI_API_KEY}

```python
AI_KEY = os.environ["AI_API_KEY"]     # ai.py:19、gen-assets.py:8：缺失就崩，不静默用旧 key
```

文档三处（`Codex优化路线-生图与元素优化.md:32` 与 `:90`、`V2前端升级优化路线-review.md:25`）改成 `sk-***`；删 `server/app/__pycache__/ai.cpython-314.pyc`；`.gitignore` 补 `__pycache__/`。

### 8.7 明确不做的后端

**`integrity_flags` 表 + `scan_integrity()` + `GET /api/research/integrity/flags` 三项整体删除。** v2 自己写着「阈值全是拍的、校准前不得用于剔除数据」。一个建好但不许用的表 + 端点 + 扫描器，是三份要维护的代码换零个决策。**等第一个 `closed` 状态的课题产出真实数据后再决定是否需要，届时用 `_ensure_column` 幂等加列即可，不预建。**

---

## §9 生图链路与可直接粘贴的提示词

链路不变：`web/scripts/gen-assets.py`，模型 `gpt-image-2`，`size=1024x1024`，端点优先 `https://api.llm-token.cn/v1/images/generations`，失败回落 `https://gpt-agent.cc/v1/images/generations`。**新素材必须走这条链路，不引外部图库。**

**改动（配合 §5.2）**：`OUT` 从 `src/assets/generated` 改为 `src/assets/_raw`；生成后不做任何处理；由 `post-assets.py` 从 `_raw` 读、写 `generated`。

**本版只新增 3 张**（v2 的 9 张里，6 张服务于已被砍掉的功能）：

```python
# —— 追加到 gen-assets.py 的 ASSETS 字典 ——

# D13 里程碑 toast（第一次修好报错时）
"mate_owl_ok":    CHAR + "an adorable round blue-and-white owl character wearing big round glasses, "
                         "giving a small approving nod with one wing raised in an OK gesture, "
                         "a tiny green check mark floating beside it, calm and warm, not exaggerated",

# §8.3 休息提醒（连续 40 分钟）
"mate_fox_rest":  CHAR + "an adorable round orange fox character wearing a hoodie, "
                         "stretching both arms upward with eyes closed in a relaxed yawn, "
                         "a small mug of warm drink beside it, cozy and low-key, gentle expression",

# §5.1 机房网络降级提示（画图不可用时）
"decor_offline":  ICON + "a small glossy pastel rounded cloud icon with a soft diagonal slash across it, "
                         "muted grey-blue, calm and neutral, not alarming, no red, no exclamation mark",
```

**提示词里三条刻意的约束，都有理由**：
- `not exaggerated` / `low-key` / `gentle` —— 12–15 岁对「被当小孩哄」的敏感度是所有学段峰值（§12 把这条列为假设）。庆祝素材过火会直接触发排斥。
- `no red, no exclamation mark` —— 降级提示是环境问题不是学生的错，视觉上不能读成「你做错了」。
- 全部沿用现有 `CHAR` / `ICON` 前缀（含 `plain clean white background`）—— 因为 `post-assets.py` 的去底依赖纯白底，换背景描述会让去底失效。

**生图后必须跑**：

```bash
cd D:/VB/jiedui-code-platform/CX
./server/.venv/Scripts/python.exe web/scripts/post-assets.py     # 从 _raw 读，写 generated
./server/.venv/Scripts/python.exe web/scripts/check-assets.py    # bright_ring 全 0 才算过
```

---

## §10 「趣味化」如何不破三条硬规则

### 10.1 不破「少即是多」

**规则是数学的，不是态度的**：§3 修完 lint 之后，`StudioView` 常态 12 控件顶格。所以趣味化增项必须先从 §6 拿到净额。

**账本（修完 lint 后逐项核对）：**

| 项 | 控件 Δ | 常驻正文 Δ | 说明 |
|---|---|---|---|
| D2 `▤` 改快捷键 + 条件把手 | **−1** | 0 | 常态减一 |
| D3 删 `AiTutorPanel` | **−1**（IdeView） | −130（components 侧） | 删组件 |
| D5 删 `DesignPanel` | **−1**（IdeView） | −49 | 删组件 |
| D4 `InsightRail` 减字 | 0 | **−80** | 120 → 40 |
| D11 换位仪式 | 0 | 0 | 复用已有按钮 |
| D12 空态搭档 chip 随角色变 | 0 | 0 | 插值 |
| D13 里程碑 toast | 0（overlay 单独计） | 0 | `data-lint="overlay"` |
| D14 幽灵提问 | 0 | 0 | placeholder 属性 |
| D6 任务链条 | 0 | +6 | 一个容器 |
| D7 gutter 提问 | 0 | 0 | Monaco 装饰 |
| **合计** | **−3** | **−253** | |

**结论**：趣味化四项（D11–D14）的净增是 **0 控件 / 0 常驻字**，全部靠「在状态变化的瞬间出现、在空态出现、或者根本不进 DOM 常驻层」实现。而简约化四项（D2/D3/D4/D5）腾出的 3 个控件余量，是给 `TaskChip` 那 2 个控件用的——修完之后 `/student/studio` 有推送时是 **11 控件 / 20 字**，第一次真正合规。

**这不是巧合，是设计约束反推的结果**：正因为账本没有余量，所以「趣味化」只能选那些不占常驻位的形式。如果账本有余量，我大概会写出一堆占位的东西。

### 10.2 不破课题效度

**核心命题**：平台六维分是行为次数的单调函数（`ct.py:82-89`），所以**任何激励都不能与六维分挂钩**，否则学生刷行为 = 刷分，研究数据当场作废。

四项趣味化逐条对照：

| 项 | 是否触碰 `ct_*` | 是否可刷 | 处置 |
|---|---|---|---|
| D11 换位仪式 | **是** —— `switches` 进 `decompose`(×4) 与 `transfer`(×3) | 换位按钮可以连点 | **必须加节流**：`ai.py` 的 `role_switch` 埋点加「同一 uid 60 秒内只记一次」，且动画本身不代表记分。见下方补丁 |
| D12 空态 chip | 否 | — | 无风险 |
| D13 里程碑 | 否（`milestones` 表独立，不进 `ct_events`） | 否（PK 天然去重） | 无风险 |
| D14 幽灵提问 | 否（不发请求、不埋点） | 否 | 无风险 |
| D6 任务链条 | 否（读 `push_targets`） | 否（完成需服务端裁定） | 无风险 |

**D11 的节流补丁**（这是唯一一条趣味化触碰埋点的地方，必须堵）：

```python
# server/app/store.py
def add_ct_event(user_id, type_, detail="", ...):
    if type_ == "role_switch":
        with _conn() as c:
            last = c.execute("SELECT MAX(ts) t FROM ct_events WHERE user_id=? AND type='role_switch'",
                             (user_id,)).fetchone()
        if last and last["t"] and _now() - last["t"] < 60:
            return          # 60 秒内的重复换位不记分；动画照播，数据不动
    ...
```

**「动画照播、数据不动」是本节的通用原则**：视觉反馈和记分解耦。学生连点换位按钮，动画会响应（因为界面不该假装没听见），但埋点不响应。

**三档掌握度（v2 的 P2 项）的处置**：v2 打算由 `weak_score`（`insights.py:178-180`，`min(ct_scores)`）推出三档 40/70 阈值。**那样它同样是行为计数的函数，直接违反本条红线。删除。**
替代：三档改由**答题正确率**推出（`assessment_responses` 表，`store_study.py:105`，已存在），只在**做过前测或后测**的学生身上显示，没做过则不显示。这样它的输入是测评而不是行为，且学生无法通过多用平台把它推高。

**主结局仍然必须是独立测评卷。六维分只作过程指标。**

### 10.3 不破未成年人红线

| 红线 | 本方案的触碰点 | 处置 |
|---|---|---|
| 监护人同意由教师核验后登记，学生不能自签 | `StudioView.vue:75` 的门禁按钮文案是「我已获得监护人同意」，点了走 `complianceApi.grantConsent()` → `POST /api/consent`。后端（`compliance.py:24-37`）**已经改对了**：学生只能发起申请，返回 `{granted:false, pending:true, message}`。但**前端 `api/compliance.ts:20-23` 的 `grantConsent` 只返回 `r.ok`，把 `pending` 丢了**，所以学生点完之后 `consent` 仍是 `false`，门禁不消失，也**看不到「已通知老师」那句话** | 修 `api/compliance.ts` 返回完整响应体；`StudioView.vue` 按 `pending` 渲染「已通知老师，把同意书交给老师核验」并把按钮文案从「我已获得监护人同意」改为「申请开通（需老师核验）」。**这是一处会让平台在某个班完全不可用的现役 bug**（学生以为点了就行，老师不知道要去点） |
| 危险话题进 LLM **之前**拦截 | D15 明确不做流式化，所以护栏仍是「进 LLM 前一次性做」，语义不变 | §8.4 只是把词库做厚，不动时序 |
| PII 匿名 | 无触碰（`guard.anonymize` 不变） | — |
| 研究导出去标识化 | §4.2 改 `research.py:55` 的 profile，不动去标识逻辑 | — |
| 视频外链域名白名单 | 无触碰 | — |
| 禁代写 | D15 的 `phase="blocked"` 文案（`这个我不能写，我们一起想`）是把已有的拒绝**说清楚**，不是放松 | `ai.py:24-28` 的 `BASE_RULE` 一字不改 |
| 防沉迷 | §8.3 修会话边界 | 休息提醒是 overlay，一节课一次 |

**并且**：D13 的四个里程碑、D6 的任务链条、D14 的幽灵提问**都不产生排名、不产生跨学生比较**。机房里同伴可见度极高，任何横向比较都会放大社交压力——这是拒绝 Duolingo 式排行榜（N2）的实质理由。

---

## §11 分期落地与验收

**每一期上线前先查 `GET /api/research/studies` 有无活跃 `running` 状态的 intervention 窗口。窗口内不上任何改变埋点口径的改动（D5、D11 节流均属此类）。**

### P0 · 门禁 + 红线 + 机房（1 周，全部是必须做的）

内容：§3 全部 · §4 全部 · §5.1 · §5.2 · §5.3 · §8.4 · §8.5 · §8.6 · §10.3 的同意书前端修复

验收（缺一不可）：
1. `cd web && npm run build` 三段全过；lint 输出 ≥40 个文件的逐行明细。
2. lint 三个回归用例（§3.4 的 2/3 条）行为符合预期。
3. `cd server && ./.venv/Scripts/python.exe -m pytest -q` ≥ 68 passed，新增 `test_student_summary_has_no_scores`、`test_guard_normalized_variants` 通过。
4. `/api/ct/summary` 学生响应体全文无 `ct_scores` / `_score`。
5. 断网后 `/student/ide` 海龟绘图仍工作。
6. `du -sh web/src/assets/generated` ≤ 800KB；`check-assets.py` 退出码 0。
7. `grep -rn "${AI_API_KEY} . --exclude-dir=node_modules --exclude-dir=.venv --exclude-dir=.git` 零命中。
8. 学生点「申请开通」后屏幕上出现「已通知老师」，教师端 `/teacher/teaching/today` 能看到待核验条目。

### P1-Gate · 10 分钟纸质问卷（成本为零，不是生图闸门）

2 个班，匿名，**不入库**（不写任何表，纸质回收）。四题：

1. 「小狐（驾驶员）/ 小枭（领航员）这两个搭档形象，你觉得：① 挺好 ② 无所谓 ③ 有点幼稚」
2. 「你更希望 AI 是：① 帮我写代码 ② 只提问让我自己写 ③ 看情况换」
3. 「看到这六个图标（出示 26px 打印件），你能说出它们分别代表什么吗？」（正确率统计）
4. 顺带问 2 位老师：「你会把教研页面截图放进评审材料吗？」（决定 D9 做不做）

**这个闸门管的是「要不要在 P2 继续加拟人化元素」，不管生图**——生图这件事本身就该推迟到流水线修好之后（§5.3）。

判据：题 1 选 ③ 的比例 > 40% → **D12/D13 的形象元素降级为纯文字 + 图标，不用角色立绘**；题 3 正确率 ≥ 70% → 保留六维图标并把 `CtIcon.vue` 建起来，< 70% → 六维图标改为「图标 + 二字标签」。

### P2 · 简约化 + 趣味化（2 周）

内容：§6 全部（D1–D10）· §7 全部（D11–D15）· §8.1 · §8.2 · §8.3

验收：
1. lint 账本达到 §10.1 表格的目标值：`/student/studio` 有推送时 ≤11 控件 / ≤20 常驻字；`InsightRail` ≤40 字；`AiTutorPanel.vue` 与 `DesignPanel.vue` **文件不存在**。
2. `pytest` 全过 + 新增 `test_milestone_claim_once`（同一 uid 同一 kind 调两次，第二次 `first=false`）、`test_usage_session_boundary`（模拟 10 秒内连发 5 次心跳，`total_seconds` 增量 ≤ 服务端实测间隔）、`test_role_switch_throttled`（60 秒内两次 `role_switch`，`ct_counts` 只加 1）。
3. 浏览器：`Alt+R` 换位动画在 `[data-cap=low]` 下**不播放**（DevTools 里给 `<html>` 加 `data-cap="low"` 验证）。
4. 里程碑：清空浏览器全部存储后重新登录同一账号，`first_run` toast **不再出现**（证明它在后端不在 localStorage）。
5. 首屏 chunk ≤ 132KB；`vite build --report` 确认 Blockly 与 Monaco 不在同一 initial chunk。

### P3 · IDE 三段同屏（先量真机，可能整体不做）

内容：`IdeView` 三段栅格（代码 / 绘图 / 控制台）· 积木→代码单向只读镜像

**开工前置（硬性）**：**在 1366×768 的机房老屏上先量一次**。本方案的配额按 1440px 设计。如果三段在 1366 上任一段宽度 < 380px（Monaco 的可用下限）或绘图区 < 240px，**P3 整体不做**，保持现有的双段切换。

验收（若做）：
1. `IdeView` 首屏控件 ≤ 12（§3.2 口径，含 R4 求和）。
2. 打字延迟：500 行 Python 文件里连续输入 200 字符，**p95 按键到渲染 ≤ 50ms**（低配基线机型）。
3. 代码模式下「切回积木」开关置灰且有人话提示，不静默失败。
4. `server/app/run.py` 无改动。

### P4 · 数据校准（拿到第一轮真实课堂数据之后）

内容：`ai.py:159/226` 两处错误的 `ai_help` 埋点修正（连同 `FORMULA_VERSION` 升版）· D5 引发的 `design_create` 口径变更落地 · 三档掌握度接测评数据

**开工前置**：`studies` 表已有至少一个 `closed` 状态的完整课题。

**P4 不含**：30 张素材全量重制（§5.3 已给出更便宜的修复）、gaming 阈值校准与 `integrity_flags`（§8.7 已删）、View Transitions（§2 N4 已删）、`ai.py` 流式化（§7 D15 已删）。

---

## §12 诚实边界

### 这套方案做不到什么

1. **不能证明界面改动提升了计算思维。** 本方案全部验收标准都是工程性的（lint / pytest / 性能 / DOM 断言 / 像素统计）。「学生因为界面更好而学得更好」这个命题本方案**不提供任何证据**，也不应写进课题报告。界面升级的正当性是「减少干扰、让核心机制（换位、领航拒绝）可被感知」，不是「提分」。

2. **不能替代主结局测评。** §4 把六维分从学生端拆掉、§10.2 把激励与六维分解耦，解决的是「污染」；**没有解决六维分本身的构念效度问题**——`FORMULA_VERSION = "ct-rules/v1"` 的公式仍是行为次数的启发式，`profile="neutral"` 只去掉了 `abstract` 维的一项。**neutral ≠ 中性。** 主结局必须是独立测评卷。

3. **不能消除「对话与写码分两个路由」的架构代价。** D7 的 gutter 入口解决的是「想问的时候够得着」，不是「不用切换」。学生仍要在 `/student/studio` 和 `/student/ide` 之间跳。真正的解法是合并成一个路由，那是架构级重写，不在本方案范围内。

4. **`bright_ring == 0` 只保证没有硬白边，不保证图好看。** 它是个必要条件，不是充分条件。§5.2 的「200% 缩放下无可见马赛克」那条验收**是人眼判断，没有客观替代物**，我把它照实写出来而不是伪装成阈值。

5. **§8.3 的会话边界只堵住了「膨胀」方向，没堵住「做低」方向。** 学生少发或不发心跳，用时就是低的。研究报告若引用 usage 数据，这一点必须写进局限。

6. **§8.4 的归一化挡得住无意撞上和零成本变形，挡不住有意绕开。** 拼音、拆字（「木木林」）、谐音、火星文全部仍然穿过。这是一层，不是一堵墙。真正的防线是老师在场 + `risk_events` 事后可审计。

7. **P1-Gate 的四道题不是量表。** 它是 10 分钟的现场问询，样本 2 个班，无信效度检验。它能做的只是「把一个我拍脑袋的判断推翻或暂时不推翻」，不能进研究报告。

### 哪些是审美判断而非事实

- **字阶新值（12/15/17/22/30/40）** —— 相邻比 1.13–1.36 是参考站的常见区间，不是阈值。换成 1.2 等比也不会有可观测差别。
- **「教研区去卡通化」** —— 基于「教师会截图进评审材料」这个**未经核实的假设**。P1-Gate 顺带问，问不到就不做。
- **「小狐/小枭这套形象适合 12–15 岁」** —— 这是**假设不是判断**。我的先验是风险偏高：初二初三对「被当小孩哄」的敏感度是所有学段峰值，而机房这种同伴可见度极高的环境会放大排斥表达。P1-Gate 题 1 用来证伪。
- **「六维图标在 26px 认不出」** —— 推理（抽象概念 + 抽象图形 + 学生尚未建立概念），P1-Gate 题 3 给实测。**如果正确率 ≥70%，我这条判断就是错的。**
- **「里程碑只设四个」** —— 四个是我定的，没有依据说四比三或五好。有依据的部分是「一生一次」而非数量。
- **「连续 40 分钟触发休息提醒」** —— 按一节课时长取，不是医学阈值。
- **「D11 换位节流 60 秒」** —— 拍的。它的作用是堵住连点，不是度量一次有效换位。若课堂观察显示学生真的会在 60 秒内做两次有意义的换位，可以调低，但不能取消。
- **「WebP quality=88」** —— 目测挡位。76 和 92 我没有做过对比。

### 哪些需要真实课堂验证

1. **Pyodide 本地化后的首次加载时长。** 12MB 从校内服务器拉，机房内网如果是百兆共享，40 台同时首次进入仍可能几十秒。**这条要在第一次进校当天现场掐表**，如果超过 60 秒，下一步是预装（把 `web/public/pyodide/` 随机房镜像分发），不是继续优化前端。
2. **同意书流程的实际使用率。** §10.3 修完之后，学生能看到「已通知老师」、老师能看到待核验列表。但**老师会不会去点**是另一回事。如果老师不点，学生就永远开不了 AI，平台在那个班就是废的。**这是唯一一条「平台可能完全不可用」的流程风险，第一次进校当天必须现场看。**
3. **删掉 `AiTutorPanel` 之后，学生在 IDE 里想问 AI 时会怎么做。** D7 的 gutter 入口只在**有报错的行**出现。学生没报错但想问的时候，入口只剩「跳回 studio」。如果观察到频繁跳转，说明 D3 砍过头了，需要在 IDE 里补一个轻量入口（不是完整聊天室）。
4. **里程碑 toast 会不会被当成打扰。** 一生四次，理论上不该。但「第一次成功运行」很可能发生在学生正在专心调下一个 bug 的时候。若观察到学生下意识去点关闭，改为「不弹 toast，只在链条节点上留个记号」。
5. **`mate_fox_rest` 的休息提醒会不会被当成管束。** 只有在 §8.3 落地、判据换成连续会话之后这个验证才有意义——用终身累计去测，得到的一定是「学生想关掉它」。
6. **IDE 三段同屏在 1366×768 上装不装得下。** 见 P3 前置。

### 引用来源的可靠性分级

- **一手可核验（本轮实跑，命令与输出见附录 B）**：pytest 68 passed 与 venv 版本、lint 假通过与四个洞、控件/字数复算与分支拆解、素材尺寸与重导出体积、白边像素统计与 `bright_ring` 修复前后、渲染尺寸 grep、`${AI_API_KEY} 五处 + pyc、`teacher.py` 只有两个端点、`store.py` 八处 `LIKE 'stu-%'`、`summary_for` 13 处调用、`guard.py` 词库规模、`add_usage` 无边界、`usePeek.close/reset` 用 push、`sw.js` 跨域 return、`usePyodide.ts` CDN 常量、`WorkbenchView` 的 growth 公式、`package.json` 的 build 脚本、`.github` 不存在。
- **一手可核验（未在本轮复跑）**：landing.love 与 land-book 的分类计数、MDN/Chrome 的 CSS 特性支持度、教育部等八部门 2019《意见》与国家网信办 2024《移动互联网未成年人模式建设指南》原文条款。
- **二手转述**：Scratch / Code.org / 洛谷 / 海龟编辑器 / CS50 / Copilot / Claude / Cursor 的界面结构，取自各自官方文档与教程描述。
- **未联网核验，建议复核**：Duolingo 与 Khan Academy 的界面特征描述。
- **学术文献**：Deci/Koestner/Ryan (1999)、Sailer & Homner (2020)、Hanus & Fox (2015)、Baker 等 gaming-the-system 系列、Rey (2012)。**引进课题报告前请核对原文效应量与样本，不要转引本文档。**

---

## 附录 A · 落地顺序速查（打印贴墙）

```
【环境】后端一律用 D:/VB/jiedui-code-platform/CX/server/.venv/Scripts/python.exe
        系统 Python 3.14 的 --user 目录里是 fastapi 0.115.6 + starlette 1.0.0，不兼容，别管它。
        永远不要往 server/requirements.txt 写 starlette 上限 —— venv 里 fastapi 0.138.0
        要求 starlette>=0.46.0，写了会触发 fastapi 降级，把 68 passed 的环境弄坏。

P0-a 门禁  lint-copy.mjs 四个洞（:15 目录 / :35 嵌套 / v-if 互斥取max+overlay标记 / R4 组件求和）
           → package.json build 串上 typecheck+lint:copy → 新建 .github/workflows/ci.yml
           → 先不改 UI，跑一次，把红出来的全修掉，账本写进 progress.md
P0-b 红线  WorkbenchView.vue:14-16,69 删圆环 → insights.py:42/157/178 + research.py:55 传 neutral
           → _recommend_for 分学生/教师返回体 → ct.py:142 学生只给 ct_rank 不给分值
P0-c 机房  usePyodide.ts:6 本地托管 + fetch-pyodide.mjs → sw.js 放行 /pyodide/ CacheFirst
           → IdeView.vue:253 catch 里加可见降级提示
P0-d 素材  gen-assets.py OUT→_raw（只生图不处理）→ post-assets.py 读_raw写generated：
           thresh 40→100 + defringe(erode2+feather1.5) + 预乘缩放 + 图标128/角色384 + WebP
           → assets.ts 加 webp 优先 → 新建 check-assets.py（bright_ring 全 0）
P0-e 安全  guard.py 加 normalize() + 词库外置 → store.py 八处 LIKE 'stu-%' 加班级过滤
           → teacher.py:34/:69/:92 传 class_ids
P0-f 密钥  供应商侧先吊销 → ai.py:19 / gen-assets.py:8 改 os.environ[] 无默认值
           → 三处文档改 sk-*** → 删 __pycache__/ai.cpython-314.pyc → .gitignore 补 __pycache__/
P0-g 同意  api/compliance.ts grantConsent 返回完整体（现在丢了 pending）
           → StudioView.vue:75 按 pending 渲染「已通知老师」+ 按钮文案改「申请开通」
───────  P1-Gate：2 个班 10 分钟纸质问卷（匿名不入库）+ 问 2 位老师 D9 那题  ───────
P2-a 简约  tokens.css:44 字阶 → StudioView 顶栏清空 → 删 AiTutorPanel（含 IdeView deep-link）
           → 删 DesignPanel（design_create 埋点改积木3块，要升 FORMULA_VERSION）
           → InsightRail 120→40 字 → usePeek close/reset 改 go(-1) → .stagger 全站接入
             ⚠ .stagger 两步顺序：先接 .is-in，再改 animation-play-state。反了 = 10 页白屏
P2-b 趣味  换位仪式（useMotion，非GSAP）+ role_switch 60s 节流（store.add_ct_event）
           → 空态 chip 随角色变 → 里程碑 4 个（新表 milestones，PK 去重）
           → 幽灵提问（placeholder，不埋点）→ 任务链条（GET /api/student/tasks/chain）
           → phase 三终态文案（写完了/有N个问题/这个我不能写）—— 禁止进行时
P2-c 后端  usage_sessions 加三列（走 _add_column 幂等）+ 服务端时钟裁定 + 5min 会话边界
           → 40 分钟休息提醒（overlay，一节课一次）
P3   同屏  先量 1366×768。任一段 <380px 或绘图 <240px → 整体不做
P4   校准  第一个 closed 课题之后：ai.py:159/226 埋点修正 + FORMULA_VERSION 升版
           + 三档掌握度接 assessment_responses（不接 weak_score）

【已删除，不要再提】P2-a 流式化 · 白边 A/B 实验 · 30 张全量重制 · View Transitions
                    · integrity_flags 表/scan_integrity/研究完整性端点 · DesignPanel 搬家二选一
                    · 三档掌握度由 weak_score 推出 · Duolingo 式连击/宝石/排行榜

【三条最容易改错的地方】
1. lint 的 L-2（嵌套匹配）和 L-3（v-if 互斥取 max）必须同一次提交，只修 L-2 会让
   AssessmentView 假红，人的自然反应是抬 @copyBudget，等于自废规则。
2. .stagger 的两步顺序（见上）。
3. 新增 AI 端点不要照抄 ai.py:187 那行 add_ct_event(uid, "ai_help", ...) —— 它会直接
   往六维分里灌数。
```

---

## 附录 B · 本版实测证据索引

全部在 `D:/VB/jiedui-code-platform/CX` 下执行。

| # | 结论 | 命令 |
|---|---|---|
| 1 | venv 存在且 68 passed；fastapi 0.138.0 / starlette 1.3.1 | `cd server && ./.venv/Scripts/python.exe -m pytest -q` + `./.venv/Scripts/python.exe -c "import fastapi,starlette;print(fastapi.__version__,starlette.__version__)"` |
| 2 | lint 假通过、只走 views、嵌套截断 | `cd web && node scripts/lint-copy.mjs; echo $?` + `sed -n '15p;35p' scripts/lint-copy.mjs` |
| 3 | build 不含 typecheck/lint；无 CI | `cat web/package.json` + `ls -d .github` |
| 4 | 控件/字数复算 | 脚本 1（下） |
| 5 | StudioView 60 字里 47 是同意书弹层；AssessmentView 三分支 47/13/3 | 脚本 2（下） |
| 6 | 素材 5.5M/30 张全 512px；重导出 PNG 1666KB / WebP 342KB | `du -sh web/src/assets/generated` + 脚本 3（下） |
| 7 | 渲染尺寸 26/30/34/92/168px | `grep -rn "dim__ic\|seat__ava\|msg__ava\|hero__mascot\|hello__img" web/src --include=*.vue \| grep px` |
| 8 | 白边像素统计与 bright_ring 修复前后 | 脚本 4（下） |
| 9 | 预乘缩放反而更白（排除合成假说） | 脚本 5（下） |
| 10 | `teacher.py` 只有 `/live` `/home` | `grep -n "@router" server/app/teacher.py` |
| 11 | `store.py` 八处 `LIKE 'stu-%'` | `grep -n "stu-%" server/app/store.py` |
| 12 | `summary_for` 13 处调用 | `grep -rn "summary_for" server/app/` |
| 13 | `WorkbenchView` growth = 六维均分 | `sed -n '14,16p;69p' web/src/views/student/WorkbenchView.vue` |
| 14 | `guard.py` 词库 3+20 个字面词 | `sed -n '16,24p' server/app/guard.py` |
| 15 | `add_usage` 无边界无限流 | `sed -n '121,130p' server/app/store.py` |
| 16 | `usePeek.close/reset` 用 push | `sed -n '40,47p' web/src/composables/usePeek.ts` |
| 17 | `sw.js` 跨域 return；`usePyodide` 走 jsdelivr | `sed -n '49p' web/public/sw.js` + `sed -n '5,6p' web/src/editor/turtle/usePyodide.ts` |
| 18 | 密钥 5 处 + pyc | `grep -rn "${AI_API_KEY} . --exclude-dir=node_modules --exclude-dir=.venv --exclude-dir=.git` |
| 19 | `_ensure_column` / `_add_column` 幂等加列 | `sed -n '43,49p' server/app/store_study.py` + `sed -n '74,78p' server/app/store.py` |
| 20 | 前端 `grantConsent` 丢掉了 pending | `sed -n '20,23p' web/src/api/compliance.ts` vs `sed -n '24,37p' server/app/compliance.py` |

**脚本 1 —— 控件/字数复算（§1.2 基线的唯一口径来源，账本有争议先跑它）**

```bash
cd web && node -e "
const fs=require('fs');
const TAG=/^(button|input|select|textarea|routerlink|router-link|a)\$/i;
for(const f of process.argv.slice(1)){const src=fs.readFileSync(f,'utf8');
 const i=src.indexOf('<template>'); if(i<0){console.log(f,'no tpl');continue}
 let d=0,end=-1; const re=/<template[\s>]|<\/template>/g; re.lastIndex=i; let m;
 while((m=re.exec(src))){ if(m[0]==='</template>'){ if(--d===0){end=m.index;break} } else d++; }
 const tpl=src.slice(i+10,end);
 const vis=tpl.replace(/<details(?![^>]*\bopen\b)[\s\S]*?<\/details>/g,' ');
 let n=0; for(const mm of vis.matchAll(/<([A-Za-z][\w-]*)\b([^>]*)>/g)){const[,tag,attrs]=mm;
   if(attrs.startsWith('/'))continue; if(TAG.test(tag)||/@click(?:\.\w+)*=/.test(attrs))n++;}
 const cjk=(vis.replace(/<!--[\s\S]*?-->/g,'').replace(/\{\{[\s\S]*?\}\}/g,'')
            .replace(/<[^>]+>/g,' ').match(/[一-龥]/g)||[]).length;
 console.log(f.padEnd(50),'ctrl='+n,'cjk='+cjk);
}" src/views/student/StudioView.vue src/views/student/IdeView.vue \
   src/views/student/AssessmentView.vue src/views/student/ThinkingView.vue \
   src/views/student/WorkbenchView.vue src/components/studio/PairDock.vue \
   src/components/studio/InsightRail.vue src/components/studio/TaskChip.vue \
   src/components/editor/DesignPanel.vue src/components/editor/AiTutorPanel.vue
```

本轮输出：

```
StudioView.vue      ctrl=9  cjk=60      IdeView.vue        ctrl=10 cjk=37
AssessmentView.vue  ctrl=5  cjk=63      ThinkingView.vue   ctrl=1  cjk=78
WorkbenchView.vue   ctrl=0  cjk=30      PairDock.vue       ctrl=3  cjk=10
InsightRail.vue     ctrl=3  cjk=120     TaskChip.vue       ctrl=2  cjk=4
DesignPanel.vue     ctrl=12 cjk=49      AiTutorPanel.vue   ctrl=7  cjk=130
```

**脚本 2 —— 互斥分支拆解（证明 60/63 不是首屏真值）**

```bash
cd web && node -e "
const fs=require('fs');const cj=s=>(s.replace(/<!--[\s\S]*?-->/g,'').replace(/\{\{[\s\S]*?\}\}/g,'')
  .replace(/<[^>]+>/g,' ').match(/[一-龥]/g)||[]).length;
const a=fs.readFileSync('src/views/student/StudioView.vue','utf8');
console.log('Studio gate块',cj((a.match(/<div v-if=\"consent === false\"[\s\S]*?<\/div>\s*<\/div>/)||[''])[0]),
            '| hello块',cj((a.match(/<div v-if=\"!msgs.length\"[\s\S]*?<\/div>\s*<\/div>/)||[''])[0]));
const b=fs.readFileSync('src/views/student/AssessmentView.vue','utf8');
console.log('Assess done分支',cj(b.slice(b.indexOf('v-else-if=\"done\"'),b.indexOf('v-else-if=\"paper\"'))),
            '| paper分支',cj(b.slice(b.indexOf('v-else-if=\"paper\"'),b.indexOf('v-else class=\"thin\"'))));
"
# → Studio gate块 47 | hello块 9        Assess done分支 47 | paper分支 13
```

**脚本 3 —— 重导出体积**

```bash
./server/.venv/Scripts/python.exe -c "
import glob,os,io
from PIL import Image
D='web/src/assets/generated'; tot=p1=w1=0
for p in glob.glob(D+'/*.png'):
    n=os.path.basename(p); im=Image.open(p).convert('RGBA')
    size=384 if n.startswith(('mate_','teacher_','tutor_','hero_','mascot_')) else 128
    im.thumbnail((size,size),Image.LANCZOS)
    b=io.BytesIO(); im.save(b,'PNG',optimize=True); p1+=b.tell()
    w=io.BytesIO(); im.save(w,'WEBP',quality=88,method=6); w1+=w.tell()
    tot+=os.path.getsize(p)
print('now %.2fMB | png %.0fKB | webp %.0fKB'%(tot/1048576,p1/1024,w1/1024))"
# → now 5.38MB | png 1666KB | webp 342KB
```

**脚本 4 —— 白边统计与修复验证（P0-d 的验收即此脚本，落地为 check-assets.py）**

```bash
./server/.venv/Scripts/python.exe -c "
from PIL import Image, ImageFilter
def bright_ring(im, lo=205):
    im=im.convert('RGBA'); w,h=im.size; p=im.load(); c=0
    for y in range(1,h-1):
        for x in range(1,w-1):
            r,g,b,a=p[x,y]
            if a<250 or 0.299*r+0.587*g+0.114*b<=lo: continue
            if min(p[x+dx,y+dy][3] for dx in(-1,0,1) for dy in(-1,0,1))<60: c+=1
    return c
def defringe(im, erode=2, feather=1.5):
    im=im.convert('RGBA'); r,g,b,a=im.split()
    a=a.filter(ImageFilter.MinFilter(erode*2+1)).filter(ImageFilter.GaussianBlur(feather))
    return Image.merge('RGBA',(r,g,b,a))
for n in ['ct_verify.png','ct_abstract.png','tile_python.png','mate_fox.png']:
    im=Image.open('web/src/assets/generated/'+n)
    print(n,'bright_ring',bright_ring(im),'->',bright_ring(defringe(im)))"
# → ct_verify 420→0 · ct_abstract 235→0 · tile_python 115→0 · mate_fox 222→0
```

边缘亮度（成因证据）：

```
ct_abstract  edgepx=352 mean_lum=222.0   ct_verify   edgepx=595 mean_lum=227.2
ct_decompose edgepx=665 mean_lum=183.9   tile_python edgepx=560 mean_lum=181.8
mate_fox     edgepx=597 mean_lum=192.6
（口径：alpha>=250 且四邻域内存在 alpha<128 的像素）
```

**脚本 5 —— 排除「非预乘缩放」假说**

对 `ct_verify.png` 缩到 128px，测 alpha∈[60,250) 过渡带的平均亮度：

```
512 原图      : 1129 px, 224.2
128 朴素缩放  :  316 px, 223.6
128 预乘缩放  :  316 px, 247.7   ← 反预乘还原得更白 → 白是 RGB 里本来就有的，不是缩放蹭的
```

补充：现有文件里 alpha=0 区域的 RGB 亮度均值为 **0.0**（已被压成黑），所以**对现有文件再做一次朴素缩放会往边缘渗黑**——这是「不能盲目重跑现有流水线」的第二个理由，也是 §5.2 必须做读写分离的原因。