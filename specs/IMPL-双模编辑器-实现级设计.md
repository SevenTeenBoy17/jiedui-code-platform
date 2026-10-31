# 双模编辑器 · 实现级设计文档（IMPL）

> 本文是《补充与优化升级_开发计划书与技术路线.md》**§4.1 双模编辑器与绘图区**的**实现级展开**。
> 上游文档回答"要建成什么"；本文回答"工程师如何照此逐文件、逐组件、逐函数地实现"。
> 配套契约基线：`specs/phase2g-model-runtime-contract.md`（模型路由）、`phase2h-sandbox-job-contract.md`（运行 job 生命周期）、`phase2i-runner-boundary-contract.md`（Runner 边界）、`phase4m-core-ui-backend-roadmap.md`（核心模块路线）。
>
> 版本：V1.0 ｜ 编写日期：2026-06-22 ｜ 目标读者：前端/全栈工程师（可直接据此编码）
> 适用范围：新 Vue 3 + TypeScript + Vite 工程中的**编辑器模块**（`src/modules/editor/`）。3D 角色、合规子系统、计算思维评价引擎不在本模块，仅在边界处对接。

---

## 0. 设计目标与约束回顾（编码前对齐）

| 约束 | 落点 |
|---|---|
| 三大区域（海龟编辑器范式） | 编程区 `BlockPanel`/`CodePanel` + 终端区 `TerminalPanel` + 绘图区 `TurtleCanvas` |
| 三语言 | Python = 积木(Blockly)↔代码双模；C++ / C = 仅 Monaco 文本 |
| 执行分层 | Python → Pyodide（浏览器内）+ turtle→Canvas；C/C++ → 后端容器 Runner（`POST /api/run/jobs`） |
| 统一结果 | `RunResult{stdout,stderr,canvasCommands,durationMs,memoryKb,errorLocator}` |
| 观察员只读 | 协作中观察员的 Monaco `readOnly: true` |
| 低配/移动 | Monaco 与 Pyodide **懒加载**，首屏轻量 |
| 设计令牌 | 教育蓝 `#4A90E2`、暖橙 `#F5A623`，圆角卡片、柔阴影 |

**关键技术取舍（贯穿全文，先声明）：**

1. **"块→码"是唯一权威正向路径**。模式从积木切到代码时，由 Blockly `pythonGenerator` 重新生成代码，覆盖 `store.code`。这是无损、确定性的。
2. **"码→块"仅对"积木创建的工程"做结构化回读**（用 Blockly 的 JSON serialization 往返），不做"任意 Python 文本→积木"的逆向解析（成本高、初中场景不必要）。手改过代码后再切回积木，触发**分级降级提示**（见 §3）。
3. **运行结果协议统一为编辑器侧 `RunResult`（camelCase）**；它是前端契约。Pyodide 路径在浏览器内直接产出该结构；C/C++ 路径调用后端 `POST /api/run/jobs`（snake/job 契约），由 `runService` 适配映射成 `RunResult`。后端字段差异被适配层吸收，组件只认 `RunResult`。
4. **turtle 不直接画 DOM**，而是产出**与语言无关的 `CanvasCommand[]` 中间协议**，再由 `TurtleCanvas.vue` 统一回放。Python turtle 与（未来）积木直驱都生成同一种指令，渲染器只有一份。

---

## 1. 模块架构与文件树

### 1.1 目录布局

```
src/
├─ modules/
│  └─ editor/
│     ├─ EditorWorkbench.vue        # 容器：三区布局 + 顶部工具栏 + 语言/模式切换
│     ├─ components/
│     │  ├─ LanguageSwitcher.vue    # Python/C++/C 切换；Python 时显示 块/码 模式开关
│     │  ├─ ModeToggle.vue          # 仅 Python 可见：block <-> code
│     │  ├─ BlockPanel.vue          # Blockly 工作区（Python 积木模式）
│     │  ├─ CodePanel.vue           # Monaco 编辑器（三语言文本模式）
│     │  ├─ TerminalPanel.vue       # 运行输出（stdout/stderr/状态/耗时）
│     │  ├─ TurtleCanvas.vue        # 绘图区：CanvasCommand[] 回放
│     │  └─ RunToolbar.vue          # 运行/停止/保存/下载 按钮组
│     ├─ composables/
│     │  ├─ useBlockly.ts           # Blockly 注入、主题、toolbox、序列化、生成代码
│     │  ├─ useMonaco.ts            # Monaco 懒加载、语言注册、主题、marker、只读
│     │  ├─ usePyodide.ts           # Pyodide 懒加载、turtle 适配、运行
│     │  ├─ useRunService.ts        # 统一运行入口：Py 走 Pyodide / C·C++ 走后端 job
│     │  └─ useTurtleRenderer.ts    # CanvasCommand[] -> Canvas2D 渲染循环
│     ├─ blockly/
│     │  ├─ blocks.python.ts        # defineBlocksWithJsonArray 自定义积木
│     │  ├─ generators.python.ts    # pythonGenerator.forBlock[...] 生成器
│     │  ├─ toolbox.python.ts       # 分类 toolbox 配置
│     │  └─ theme.education.ts      # 教育主题（配色、圆角）
│     ├─ runtime/
│     │  ├─ turtle.protocol.ts      # CanvasCommand 类型 + turtle 子集定义
│     │  ├─ turtle.shim.py          # 注入 Pyodide 的 turtle 兼容垫片（py 源串）
│     │  └─ errorLocator.ts         # stderr -> errorLocator{line,column,message}
│     └─ types.ts                   # RunResult / EditorLanguage / EditorMode 等
├─ stores/
│  └─ editor.ts                     # Pinia useEditorStore
└─ api/
   └─ run.ts                        # POST /api/run/jobs 客户端 + 轮询
```

### 1.2 组件树

```
EditorWorkbench.vue
├─ RunToolbar.vue           (run / stop / save / download)
├─ LanguageSwitcher.vue     (python | cpp | c)  ──┐
│  └─ ModeToggle.vue        (block | code, 仅 python)
├─ 编程区 (左) ────────────────────────────────────┤  由 language+mode 决定渲染哪一个
│  ├─ BlockPanel.vue        (v-if: python && block)
│  └─ CodePanel.vue         (v-else)               │
├─ 终端区 (右上) TerminalPanel.vue                  │
└─ 绘图区 (右下) TurtleCanvas.vue                   │
                                                   │
        所有组件读写 ─────────────────────────────┘
                      useEditorStore (Pinia)
```

### 1.3 组件间数据流图

```
                          ┌──────────────────────────────┐
                          │       useEditorStore          │
                          │  language, mode, code,        │
                          │  blocklyJson, running,        │
                          │  runResult, readOnly          │
                          └──────────────────────────────┘
        (块编辑)               ▲        ▲         ▲          (文本编辑)
   BlockPanel ── onChange ─────┘        │        └────── onChange ── CodePanel
        │  syncBlockToCode()            │                                │
        │  (block→code 权威)            │ run()                          │
        ▼                               │                                ▼
   blocklyJson + generated code ───►  useRunService  ◄──── code(C/C++) ──┘
                                        │
                  python │              │ cpp / c
                         ▼              ▼
                   usePyodide     api/run.ts (POST /api/run/jobs + poll)
                         │              │
                         └──── RunResult ┘
                                  │
                ┌─────────────────┼───────────────────┐
                ▼                                      ▼
        TerminalPanel (stdout/stderr/err)      TurtleCanvas (canvasCommands)
```

**规则**：组件之间**不互相直接调用**，全部通过 `useEditorStore` 的 state/actions 通信；运行链路通过 `useRunService` 收口。这样观察员只读、语言切换、模式切换都在 store 一处生效。

---

## 2. Blockly 集成（Python 块模式）

依赖：`blockly`（含 `blockly/python` 生成器）。按需引入，避免污染 C/C++ 路径。

### 2.1 自定义积木定义 `blockly/blocks.python.ts`

```ts
import * as Blockly from 'blockly/core'

// 海龟与基础积木（教育子集）。颜色用 HSV 色相，贴合教育主题。
export const PYTHON_BLOCKS = [
  // —— 海龟：前进 ——
  {
    type: 'turtle_forward',
    message0: '前进 %1 像素',
    args0: [{ type: 'input_value', name: 'DISTANCE', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: 200,                 // 教育蓝色相
    tooltip: '小海龟向前移动指定像素',
    helpUrl: '',
  },
  // —— 海龟：转向 ——
  {
    type: 'turtle_turn',
    message0: '%1 转 %2 度',
    args0: [
      { type: 'field_dropdown', name: 'DIR', options: [['右', 'RIGHT'], ['左', 'LEFT']] },
      { type: 'input_value', name: 'ANGLE', check: 'Number' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 200,
    tooltip: '小海龟向左/右转动',
  },
  // —— 海龟：画圆 ——
  {
    type: 'turtle_circle',
    message0: '画圆 半径 %1',
    args0: [{ type: 'input_value', name: 'RADIUS', check: 'Number' }],
    previousStatement: null,
    nextStatement: null,
    colour: 200,
    tooltip: '以当前位置为起点画一个圆',
  },
  // —— 海龟：抬笔/落笔 ——
  {
    type: 'turtle_pen',
    message0: '%1',
    args0: [{ type: 'field_dropdown', name: 'PEN', options: [['落笔', 'DOWN'], ['抬笔', 'UP']] }],
    previousStatement: null,
    nextStatement: null,
    colour: 200,
  },
  // —— 海龟：设置画笔颜色 ——
  {
    type: 'turtle_pencolor',
    message0: '画笔颜色 %1',
    args0: [{ type: 'field_colour', name: 'COLOUR', colour: '#4A90E2' }],
    previousStatement: null,
    nextStatement: null,
    colour: 200,
  },
  // —— 控制：重复 N 次 ——
  {
    type: 'controls_repeat_n',
    message0: '重复 %1 次',
    args0: [{ type: 'input_value', name: 'TIMES', check: 'Number' }],
    message1: '执行 %1',
    args1: [{ type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    nextStatement: null,
    colour: 30,                  // 暖橙色相（控制结构）
    tooltip: '把里面的积木重复执行 N 次',
  },
  // —— 变量：设置变量 ——
  {
    type: 'variables_set_simple',
    message0: '设 %1 为 %2',
    args0: [
      { type: 'field_input', name: 'VAR', text: '变量' },
      { type: 'input_value', name: 'VALUE' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 330,
  },
  // —— 输入 / 输出 ——
  {
    type: 'text_print',
    message0: '打印 %1',
    args0: [{ type: 'input_value', name: 'TEXT' }],
    previousStatement: null,
    nextStatement: null,
    colour: 160,
  },
  {
    type: 'text_input',
    message0: '输入 提示 %1',
    args0: [{ type: 'input_value', name: 'PROMPT', check: 'String' }],
    output: 'String',
    colour: 160,
    tooltip: '从终端读取一行输入',
  },
] as const

export function registerPythonBlocks(): void {
  Blockly.defineBlocksWithJsonArray(PYTHON_BLOCKS as unknown as object[])
}
```

### 2.2 代码生成器 `blockly/generators.python.ts`

```ts
import { pythonGenerator, Order } from 'blockly/python'

/** 在生成代码头部注入 turtle 初始化（只注入一次） */
function ensureTurtleHeader(): void {
  // pythonGenerator.definitions_ 在 init 时被清空；用它去重
  pythonGenerator.provideFunction_(
    'turtle_setup',
    [
      'import turtle',
      't = turtle.Turtle()',
    ],
  )
}

pythonGenerator.forBlock['turtle_forward'] = (block) => {
  ensureTurtleHeader()
  const dist = pythonGenerator.valueToCode(block, 'DISTANCE', Order.NONE) || '0'
  return `t.forward(${dist})\n`
}

pythonGenerator.forBlock['turtle_turn'] = (block) => {
  ensureTurtleHeader()
  const dir = block.getFieldValue('DIR')           // 'RIGHT' | 'LEFT'
  const angle = pythonGenerator.valueToCode(block, 'ANGLE', Order.NONE) || '0'
  const fn = dir === 'RIGHT' ? 'right' : 'left'
  return `t.${fn}(${angle})\n`
}

pythonGenerator.forBlock['turtle_circle'] = (block) => {
  ensureTurtleHeader()
  const r = pythonGenerator.valueToCode(block, 'RADIUS', Order.NONE) || '0'
  return `t.circle(${r})\n`
}

pythonGenerator.forBlock['turtle_pen'] = (block) => {
  ensureTurtleHeader()
  return block.getFieldValue('PEN') === 'UP' ? 't.penup()\n' : 't.pendown()\n'
}

pythonGenerator.forBlock['turtle_pencolor'] = (block) => {
  ensureTurtleHeader()
  const colour = block.getFieldValue('COLOUR')     // '#rrggbb'
  return `t.pencolor(${pythonGenerator.quote_(colour)})\n`
}

pythonGenerator.forBlock['controls_repeat_n'] = (block) => {
  const times = pythonGenerator.valueToCode(block, 'TIMES', Order.NONE) || '0'
  const body = pythonGenerator.statementToCode(block, 'DO') || pythonGenerator.PASS
  // statementToCode 已带缩进
  return `for _ in range(${times}):\n${body}`
}

pythonGenerator.forBlock['variables_set_simple'] = (block) => {
  const name = pythonGenerator.nameDB_.getName(
    block.getFieldValue('VAR'),
    Blockly.Names.NameType.VARIABLE,
  )
  const value = pythonGenerator.valueToCode(block, 'VALUE', Order.NONE) || '0'
  return `${name} = ${value}\n`
}

pythonGenerator.forBlock['text_print'] = (block) => {
  const text = pythonGenerator.valueToCode(block, 'TEXT', Order.NONE) || "''"
  return `print(${text})\n`
}

pythonGenerator.forBlock['text_input'] = (block) => {
  const prompt = pythonGenerator.valueToCode(block, 'PROMPT', Order.NONE) || "''"
  return [`input(${prompt})`, Order.FUNCTION_CALL]
}
```

> 说明：`Blockly` 命名空间在 generator 文件里通过 `import * as Blockly from 'blockly/core'` 取得（`Names.NameType`）。`provideFunction_`/`nameDB_`/`quote_` 是 Blockly 生成器的稳定内部 API，海龟编辑器与官方 demo 均如此使用。

### 2.3 toolbox 分类配置 `blockly/toolbox.python.ts`

```ts
import type * as Blockly from 'blockly/core'

export const PYTHON_TOOLBOX: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category', name: '🐢 海龟', colour: '200',
      contents: [
        { kind: 'block', type: 'turtle_forward',
          inputs: { DISTANCE: { shadow: { type: 'math_number', fields: { NUM: 100 } } } } },
        { kind: 'block', type: 'turtle_turn',
          inputs: { ANGLE: { shadow: { type: 'math_number', fields: { NUM: 90 } } } } },
        { kind: 'block', type: 'turtle_circle',
          inputs: { RADIUS: { shadow: { type: 'math_number', fields: { NUM: 50 } } } } },
        { kind: 'block', type: 'turtle_pen' },
        { kind: 'block', type: 'turtle_pencolor' },
      ],
    },
    {
      kind: 'category', name: '🔁 控制', colour: '30',
      contents: [
        { kind: 'block', type: 'controls_repeat_n',
          inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 4 } } } } },
        { kind: 'block', type: 'controls_if' },        // Blockly 内置
      ],
    },
    {
      kind: 'category', name: '🔢 数学', colour: '230',
      contents: [
        { kind: 'block', type: 'math_number' },
        { kind: 'block', type: 'math_arithmetic' },
      ],
    },
    {
      kind: 'category', name: '📦 变量', colour: '330',
      contents: [{ kind: 'block', type: 'variables_set_simple' }],
    },
    {
      kind: 'category', name: '💬 输入输出', colour: '160',
      contents: [
        { kind: 'block', type: 'text_print',
          inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: '你好' } } } } },
        { kind: 'block', type: 'text_input' },
        { kind: 'block', type: 'text' },               // Blockly 内置字符串
      ],
    },
  ],
}
```

### 2.4 教育主题 `blockly/theme.education.ts`

```ts
import * as Blockly from 'blockly/core'

export const educationTheme = Blockly.Theme.defineTheme('jiedui-edu', {
  name: 'jiedui-edu',
  base: Blockly.Themes.Zelos,        // Zelos = 圆角、童趣，贴近海龟编辑器
  componentStyles: {
    workspaceBackgroundColour: '#F7FAFF',
    toolboxBackgroundColour: '#FFFFFF',
    flyoutBackgroundColour: '#EEF4FF',
    scrollbarColour: '#C7D8F0',
    insertionMarkerColour: '#4A90E2',
    insertionMarkerOpacity: 0.4,
  },
  fontStyle: { family: '"PingFang SC", "Microsoft YaHei", sans-serif', size: 13 },
})
```

### 2.5 Blockly composable `composables/useBlockly.ts`（注入/初始化/持久化）

```ts
import * as Blockly from 'blockly/core'
import 'blockly/blocks'                 // 内置积木（math/text/controls_if 等）
import { pythonGenerator } from 'blockly/python'
import { registerPythonBlocks } from '../blockly/blocks.python'
import '../blockly/generators.python'   // 副作用：注册 forBlock
import { PYTHON_TOOLBOX } from '../blockly/toolbox.python'
import { educationTheme } from '../blockly/theme.education'

let registered = false

export function useBlockly(host: HTMLElement) {
  if (!registered) { registerPythonBlocks(); registered = true }

  const workspace = Blockly.inject(host, {
    toolbox: PYTHON_TOOLBOX,
    theme: educationTheme,
    renderer: 'zelos',
    grid: { spacing: 24, length: 2, colour: '#E3ECFA', snap: true },
    zoom: { controls: true, wheel: true, startScale: 0.9, minScale: 0.5, maxScale: 1.5 },
    move: { scrollbars: true, drag: true, wheel: true },
    trashcan: true,
  })

  /** 块 → Python 代码（权威正向路径） */
  function generateCode(): string {
    return pythonGenerator.workspaceToCode(workspace)
  }

  /** 序列化为 JSON（持久化首选；比 XML 更紧凑、官方推荐） */
  function serializeJson(): object {
    return Blockly.serialization.workspaces.save(workspace)
  }

  /** 序列化为 XML（数据库 project_blocks.blockly_xml 列要求 XML 时用） */
  function serializeXml(): string {
    const dom = Blockly.Xml.workspaceToDom(workspace)
    return Blockly.Xml.domToText(dom)
  }

  /** 从 JSON 回读（码→块的可行路径，仅积木工程） */
  function loadJson(state: object): void {
    Blockly.serialization.workspaces.load(state, workspace)
  }

  /** 从 XML 回读（兼容旧数据 / project_blocks.blockly_xml） */
  function loadXml(xml: string): void {
    const dom = Blockly.utils.xml.textToDom(xml)
    Blockly.Xml.domToWorkspace(dom, workspace)
  }

  function onChange(cb: () => void): void {
    workspace.addChangeListener((e) => {
      if (e.isUiEvent) return            // 忽略纯 UI 事件（点击/滚动）
      cb()
    })
  }

  function dispose(): void { workspace.dispose() }

  return { workspace, generateCode, serializeJson, serializeXml, loadJson, loadXml, onChange, dispose }
}
```

### 2.6 块→代码生成流程

```
学生拖拽/编辑积木
   │  workspace change (非 UI 事件)
   ▼
BlockPanel.onChange ──► store.blocklyJson = serializeJson()
                        store.code        = generateCode()   // 实时同步
   │
   ▼
（切到 code 模式 / 点击运行）使用 store.code 作为 Python 源
```

> **要点**：每次有效变更同时更新 `blocklyJson`（持久化用）与 `code`（运行/展示用）。`code` 永远由积木重新生成，从不手工拼接——保证块与码强一致。

---

## 3. 块↔码双向同步策略

### 3.1 权威方向：块 → 码（正向，无损）

`syncBlockToCode()` 是唯一权威同步动作：调用 `pythonGenerator.workspaceToCode()` 全量重生成，覆盖 `store.code`。在以下时机触发：
- 积木工作区任意有效变更（防抖 150ms）；
- 模式从 `block` 切到 `code` 之前（确保代码区是最新积木结果）。

### 3.2 可行边界：码 → 块（逆向，受限）

- **支持**：对"由积木创建、且代码区未被手工修改"的工程，切回积木模式时直接复用内存中的 `blocklyJson` 回读工作区（往返无损）。这是海龟编辑器实际采用的策略。
- **不支持**：把"任意 Python 文本"解析重建为积木。原因：需要完整 Python AST→块映射器，覆盖面无穷、初中教学不需要、维护成本极高。

### 3.3 分级方案与降级提示

| 级别 | 场景 | 行为 |
|---|---|---|
| L0 无损往返 | 积木工程，代码区 `dirtyCode=false` | 直接 `loadJson(blocklyJson)`，静默切换 |
| L1 提示丢弃 | 积木工程，但代码区被手改 `dirtyCode=true` | 弹确认："切回积木将丢弃你对代码的手动修改，恢复到积木对应的代码。是否继续？" |
| L2 不可逆 | 纯文本工程（从未有积木 / 导入的 .py） | 禁用"积木"切换或提示："此作品是代码作品，暂不支持转换为积木。" |

`dirtyCode` 标志：在 `block` 模式下由 `syncBlockToCode` 写入的代码，置 `dirtyCode=false`；用户在 `code` 模式手动编辑 Monaco 后置 `dirtyCode=true`。

### 3.4 模式切换状态机（TS 实现）

```ts
// composables/useModeSwitch.ts
import { useEditorStore } from '@/stores/editor'

type SwitchResult = { ok: boolean; reason?: 'discard-confirmed' | 'discard-cancelled' | 'text-only' }

export function useModeSwitch() {
  const store = useEditorStore()

  /** 仅 Python 允许切换；返回是否成功 */
  async function toCode(): Promise<SwitchResult> {
    if (store.language !== 'python') return { ok: false, reason: 'text-only' }
    // block -> code：先用积木重生成权威代码
    store.syncBlockToCode()          // 覆盖 code，dirtyCode = false
    store.mode = 'code'
    return { ok: true }
  }

  async function toBlock(confirm: (msg: string) => Promise<boolean>): Promise<SwitchResult> {
    if (store.language !== 'python') return { ok: false, reason: 'text-only' }

    // L2：纯文本工程，没有积木来源
    if (!store.hasBlockOrigin) return { ok: false, reason: 'text-only' }

    // L1：代码被手改，回块会丢弃手改
    if (store.dirtyCode) {
      const yes = await confirm('切回积木将丢弃你对代码的手动修改，恢复到积木对应的代码。是否继续？')
      if (!yes) return { ok: false, reason: 'discard-cancelled' }
      // 用户确认丢弃：用内存中 blocklyJson 回读，dirtyCode 复位
    }

    // L0/确认后：用快照回读工作区（BlockPanel 监听 mode 变更后执行 loadJson）
    store.mode = 'block'
    store.dirtyCode = false
    return { ok: store.dirtyCode ? false : true, reason: store.dirtyCode ? undefined : 'discard-confirmed' }
  }

  return { toCode, toBlock }
}
```

伪代码层面的不变式（invariant）：
```
INVARIANT: mode==='block'  =>  code === generate(blocklyJson)  且  dirtyCode===false
INVARIANT: 切到 'code' 那一刻 code 必为最新积木生成结果
INVARIANT: dirtyCode===true  仅可能在 mode==='code' 时出现
```

---

## 4. Monaco 集成

依赖：`monaco-editor`。通过动态 `import()` 懒加载，首屏不打包。

### 4.1 懒加载封装 `composables/useMonaco.ts`

```ts
import type * as MonacoNS from 'monaco-editor'
import type { EditorLanguage } from '../types'

let monacoPromise: Promise<typeof MonacoNS> | null = null

/** 仅在首次需要文本编辑时才加载 Monaco，移动/低配首屏零成本 */
function loadMonaco(): Promise<typeof MonacoNS> {
  if (!monacoPromise) {
    monacoPromise = import('monaco-editor').then((m) => {
      defineEducationTheme(m)
      return m
    })
  }
  return monacoPromise
}

function defineEducationTheme(monaco: typeof MonacoNS): void {
  monaco.editor.defineTheme('jiedui-edu', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '4A90E2', fontStyle: 'bold' }, // 教育蓝
      { token: 'number', foreground: 'F5A623' },                     // 暖橙
      { token: 'string', foreground: '2E9E5B' },
      { token: 'comment', foreground: '9AA7B4', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#FFFFFF',
      'editor.lineHighlightBackground': '#EEF4FF',
      'editorLineNumber.foreground': '#B6C4D6',
      'editorCursor.foreground': '#4A90E2',
    },
  })
}

const LANG_MAP: Record<EditorLanguage, string> = { python: 'python', cpp: 'cpp', c: 'c' }

export async function createMonaco(
  host: HTMLElement,
  opts: { language: EditorLanguage; value: string; readOnly: boolean },
) {
  const monaco = await loadMonaco()
  const editor = monaco.editor.create(host, {
    value: opts.value,
    language: LANG_MAP[opts.language],
    theme: 'jiedui-edu',
    readOnly: opts.readOnly,
    fontSize: 14,
    lineHeight: 22,
    minimap: { enabled: false },        // 初中场景关闭小地图，降噪
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 4,
    fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
    roundedSelection: true,
  })

  /** 切换语言（语言不重建 editor，只换 model 语言） */
  function setLanguage(lang: EditorLanguage): void {
    const model = editor.getModel()
    if (model) monaco.editor.setModelLanguage(model, LANG_MAP[lang])
  }

  /** 观察员只读模式：协作中切换 */
  function setReadOnly(ro: boolean): void {
    editor.updateOptions({ readOnly: ro })
  }

  /** 错误标记：把 RunResult.errorLocator 映射成 Monaco marker */
  function setErrorMarkers(errs: { line: number; column?: number; message: string }[]): void {
    const model = editor.getModel()
    if (!model) return
    monaco.editor.setModelMarkers(model, 'run', errs.map((e) => ({
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: e.line,
      startColumn: e.column ?? 1,
      endLineNumber: e.line,
      endColumn: e.column ? e.column + 1 : model.getLineMaxColumn(e.line),
      message: e.message,
    })))
  }

  function clearMarkers(): void {
    const model = editor.getModel()
    if (model) monaco.editor.setModelMarkers(model, 'run', [])
  }

  return { editor, setLanguage, setReadOnly, setErrorMarkers, clearMarkers }
}
```

### 4.2 `CodePanel.vue` 要点

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { createMonaco } from '../composables/useMonaco'
import { useEditorStore } from '@/stores/editor'

const host = ref<HTMLElement | null>(null)
const store = useEditorStore()
const { language, code, readOnly, runResult } = storeToRefs(store)
let api: Awaited<ReturnType<typeof createMonaco>> | null = null

onMounted(async () => {
  api = await createMonaco(host.value!, {
    language: language.value, value: code.value, readOnly: readOnly.value,
  })
  api.editor.onDidChangeModelContent(() => {
    if (readOnly.value) return
    store.setCodeFromEditor(api!.editor.getValue())   // 标记 dirtyCode=true（见 store）
  })
})

watch(language, (l) => api?.setLanguage(l))
watch(readOnly, (ro) => api?.setReadOnly(ro))         // 观察员只读联动
watch(runResult, (r) => {
  api?.clearMarkers()
  if (r?.errorLocator) api?.setErrorMarkers([r.errorLocator])
})

onBeforeUnmount(() => api?.editor.dispose())
</script>

<template><div ref="host" class="code-panel" /></template>

<style scoped>
.code-panel { height: 100%; border-radius: 12px; overflow: hidden;
  box-shadow: 0 2px 12px rgba(74,144,226,.08); }   /* 圆角卡片 + 柔阴影 */
</style>
```

---

## 5. 绘图区 turtle 引擎

### 5.1 CanvasCommand 协议 `runtime/turtle.protocol.ts`

```ts
/** 语言无关的绘图指令：Python turtle 与积木直驱都产出它 */
export type CanvasCommand =
  | { cmd: 'reset' }
  | { cmd: 'penup' }
  | { cmd: 'pendown' }
  | { cmd: 'pencolor'; color: string }              // '#rrggbb'
  | { cmd: 'pensize'; size: number }
  | { cmd: 'goto'; x: number; y: number }           // turtle 坐标（中心原点，y 向上）
  | { cmd: 'forward'; distance: number }
  | { cmd: 'left'; angle: number }
  | { cmd: 'right'; angle: number }
  | { cmd: 'circle'; radius: number; extent?: number }
  | { cmd: 'setheading'; angle: number }
  | { cmd: 'dot'; size: number; color?: string }

/** Pyodide turtle 垫片产出的原始 JSON 即 CanvasCommand[] */
export type CanvasProgram = CanvasCommand[]
```

### 5.2 Pyodide turtle 捕获：`runtime/turtle.shim.py`

Pyodide 默认无 GUI turtle。注入一个**纯 Python 垫片**，把 turtle API 调用记录成 `CanvasCommand` 列表，运行结束后用 `js` 桥取走。

```python
# turtle.shim.py —— 作为字符串注入 Pyodide，覆盖 import turtle
import math, json

_commands = []

class Turtle:
    def __init__(self):
        self._x, self._y, self._heading = 0.0, 0.0, 0.0
        _commands.append({"cmd": "reset"})
    def forward(self, d):
        self._x += d * math.cos(math.radians(self._heading))
        self._y += d * math.sin(math.radians(self._heading))
        _commands.append({"cmd": "forward", "distance": d})
    def backward(self, d): self.forward(-d)
    def right(self, a):
        self._heading -= a; _commands.append({"cmd": "right", "angle": a})
    def left(self, a):
        self._heading += a; _commands.append({"cmd": "left", "angle": a})
    def circle(self, r, extent=360):
        _commands.append({"cmd": "circle", "radius": r, "extent": extent})
    def penup(self):   _commands.append({"cmd": "penup"})
    def pendown(self): _commands.append({"cmd": "pendown"})
    def pencolor(self, c): _commands.append({"cmd": "pencolor", "color": c})
    def pensize(self, s):  _commands.append({"cmd": "pensize", "size": s})
    def goto(self, x, y):
        self._x, self._y = x, y
        _commands.append({"cmd": "goto", "x": x, "y": y})
    def setheading(self, a):
        self._heading = a; _commands.append({"cmd": "setheading", "angle": a})
    def dot(self, size=5, color=None):
        _commands.append({"cmd": "dot", "size": size, "color": color})

def _dump_commands():
    return json.dumps(_commands)
```

### 5.3 Pyodide 运行 `composables/usePyodide.ts`

```ts
import type { RunResult } from '../types'
import type { CanvasProgram } from '../runtime/turtle.protocol'
import turtleShimSrc from '../runtime/turtle.shim.py?raw'

let pyodidePromise: Promise<any> | null = null

/** 懒加载 Pyodide（约数 MB，仅首次运行 Python 时拉取） */
function loadPyodide(): Promise<any> {
  if (!pyodidePromise) {
    pyodidePromise = import('pyodide').then(({ loadPyodide }) =>
      loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/' }),
    )
  }
  return pyodidePromise
}

export async function runPython(code: string, stdinLines: string[] = []): Promise<RunResult> {
  const py = await loadPyodide()
  const t0 = performance.now()
  let stdout = '', stderr = '', canvasCommands: CanvasProgram = []

  py.setStdout({ batched: (s: string) => { stdout += s + '\n' } })
  py.setStderr({ batched: (s: string) => { stderr += s + '\n' } })
  let stdinIdx = 0
  py.setStdin({ stdin: () => stdinLines[stdinIdx++] ?? '' })

  try {
    // 1) 用垫片伪造 turtle 模块（覆盖 sys.modules['turtle']）
    await py.runPythonAsync(
      `import sys, types\n` +
      `_m = types.ModuleType("turtle")\n` +
      `exec(${JSON.stringify(turtleShimSrc)}, _m.__dict__)\n` +
      `sys.modules["turtle"] = _m\n`,
    )
    // 2) 跑学生代码
    await py.runPythonAsync(code)
    // 3) 取走绘图指令
    const dump = await py.runPythonAsync(
      `import sys, json; json.dumps(getattr(sys.modules.get("turtle"), "_commands", []))`,
    )
    canvasCommands = JSON.parse(dump) as CanvasProgram
  } catch (e: any) {
    stderr += String(e?.message ?? e)
  }

  const durationMs = Math.round(performance.now() - t0)
  return {
    stdout, stderr, canvasCommands, durationMs,
    memoryKb: 0,                                  // 浏览器内不精确统计
    errorLocator: stderr ? parsePyTraceback(stderr) : null,
  }
}

/** 从 Python traceback 提取行号（最后一个 File "<exec>", line N） */
function parsePyTraceback(stderr: string): RunResult['errorLocator'] {
  const m = [...stderr.matchAll(/line (\d+)/g)].pop()
  if (!m) return null
  return { line: Number(m[1]), message: stderr.trim().split('\n').pop() ?? '运行出错' }
}
```

### 5.4 渲染循环 `TurtleCanvas.vue` + `useTurtleRenderer.ts`

```ts
// composables/useTurtleRenderer.ts
import type { CanvasProgram } from '../runtime/turtle.protocol'

/** 把 turtle 坐标(中心原点,y上) 映射到 Canvas 像素(左上原点,y下) */
export function renderTurtle(canvas: HTMLCanvasElement, program: CanvasProgram, animate = true) {
  const ctx = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height
  const ox = W / 2, oy = H / 2
  const toPx = (x: number, y: number): [number, number] => [ox + x, oy - y]

  let x = 0, y = 0, heading = 0, pen = true, color = '#4A90E2', size = 2
  ctx.clearRect(0, 0, W, H)
  ctx.lineCap = 'round'

  let i = 0
  function step() {
    const slice = animate ? 1 : program.length    // animate: 每帧一条；否则一次画完
    for (let k = 0; k < slice && i < program.length; k++, i++) {
      const c = program[i]
      switch (c.cmd) {
        case 'reset': x = y = heading = 0; pen = true; break
        case 'penup': pen = false; break
        case 'pendown': pen = true; break
        case 'pencolor': color = c.color; break
        case 'pensize': size = c.size; break
        case 'goto': drawTo(c.x, c.y); break
        case 'forward': {
          const nx = x + c.distance * Math.cos(heading * Math.PI / 180)
          const ny = y + c.distance * Math.sin(heading * Math.PI / 180)
          drawTo(nx, ny); break
        }
        case 'left': heading += c.angle; break
        case 'right': heading -= c.angle; break
        case 'setheading': heading = c.angle; break
        case 'circle': drawCircle(c.radius, c.extent ?? 360); break
        case 'dot': drawDot(c.size, c.color ?? color); break
      }
    }
    if (i < program.length && animate) requestAnimationFrame(step)
  }

  function drawTo(nx: number, ny: number) {
    if (pen) {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = size
      const [px0, py0] = toPx(x, y), [px1, py1] = toPx(nx, ny)
      ctx.moveTo(px0, py0); ctx.lineTo(px1, py1); ctx.stroke()
    }
    x = nx; y = ny
  }
  function drawCircle(r: number, extent: number) {
    // turtle 圆：圆心在当前朝向左侧 r 处；简化为按 extent 离散成线段复用 forward 逻辑
    const steps = Math.max(8, Math.round(Math.abs(extent) / 10))
    const seg = (2 * Math.PI * r) * (extent / 360) / steps
    const dTheta = extent / steps
    for (let s = 0; s < steps; s++) {
      const nx = x + seg * Math.cos(heading * Math.PI / 180)
      const ny = y + seg * Math.sin(heading * Math.PI / 180)
      drawTo(nx, ny); heading += dTheta
    }
  }
  function drawDot(s: number, col: string) {
    const [px, py] = toPx(x, y)
    ctx.beginPath(); ctx.fillStyle = col; ctx.arc(px, py, s / 2, 0, Math.PI * 2); ctx.fill()
  }

  step()
}
```

```vue
<!-- TurtleCanvas.vue -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { renderTurtle } from '../composables/useTurtleRenderer'
import { useEditorStore } from '@/stores/editor'

const canvas = ref<HTMLCanvasElement | null>(null)
const { runResult } = storeToRefs(useEditorStore())

watch(runResult, (r) => {
  if (canvas.value && r?.canvasCommands?.length) renderTurtle(canvas.value, r.canvasCommands, true)
})
</script>

<template>
  <div class="turtle-card">
    <canvas ref="canvas" width="480" height="360" />
  </div>
</template>

<style scoped>
.turtle-card { background: #FFFFFF; border-radius: 16px; padding: 12px;
  box-shadow: 0 4px 16px rgba(74,144,226,.10); }
canvas { background: #F7FAFF; border-radius: 12px; width: 100%; height: auto; }
</style>
```

---

## 6. 运行流水线

### 6.1 统一入口 `composables/useRunService.ts`

```ts
import type { RunResult, EditorLanguage } from '../types'
import { runPython } from './usePyodide'
import { runOnBackend } from '@/api/run'
import { useEditorStore } from '@/stores/editor'

export function useRunService() {
  const store = useEditorStore()

  async function run(): Promise<RunResult> {
    store.running = true
    store.runResult = null
    try {
      const lang: EditorLanguage = store.language
      // Python 模式：若在 block，先确保 code 是最新积木结果
      if (lang === 'python') {
        if (store.mode === 'block') store.syncBlockToCode()
        return await tryPython(store.code)
      }
      // C / C++：后端容器 Runner
      return await runOnBackend(lang, store.code)
    } finally {
      store.running = false
    }
  }

  /** Python：优先 Pyodide；不可用（低配/加载失败）回退后端兜底 */
  async function tryPython(code: string): Promise<RunResult> {
    try {
      return await runPython(code)
    } catch {
      return await runOnBackend('python', code)   // 降级：后端执行
    }
  }

  return { run }
}
```

### 6.2 后端客户端 + 轮询 `api/run.ts`（对接 phase2h/2i job 契约）

```ts
import type { RunResult, EditorLanguage } from '@/modules/editor/types'
import { parseStderr } from '@/modules/editor/runtime/errorLocator'

const TERMINAL = new Set(['completed', 'rejected', 'timeout', 'canceled'])

/** 调 POST /api/run/jobs，轮询到 terminal，再映射成编辑器 RunResult */
export async function runOnBackend(language: EditorLanguage, code: string): Promise<RunResult> {
  const created = await fetch('/api/run/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language, code, runnerTimeoutMs: 5000, startMode: 'auto' }),
  }).then((r) => r.json())

  let job = created.job
  while (!TERMINAL.has(job.status)) {
    await new Promise((res) => setTimeout(res, 250))
    job = (await fetch(`/api/run/jobs/${job.id}`).then((r) => r.json())).job
  }
  return mapJobToRunResult(job)
}

/** 后端 job(snake/job 形态) -> 编辑器 RunResult(camelCase 权威) */
function mapJobToRunResult(job: any): RunResult {
  const res = job.result ?? {}
  const stderr = res.stderr ?? ''
  return {
    stdout: res.stdout ?? '',
    stderr,
    canvasCommands: res.canvas ?? res.canvasCommands ?? [],   // C/C++ 通常为空
    durationMs: res.durationMs ?? res.duration_ms ?? 0,
    memoryKb: res.memoryKb ?? res.memory_kb ?? 0,
    errorLocator:
      job.status === 'timeout' ? { line: 1, message: '运行超时，请检查是否有死循环' }
      : job.status === 'rejected' ? { line: 1, message: '代码被安全策略拦截' }
      : stderr ? parseStderr(language(job), stderr) : null,
  }
}
function language(job: any): EditorLanguage { return (job.language ?? 'cpp') as EditorLanguage }
```

### 6.3 运行时序

```
学生点击「运行」
  │
EditorWorkbench → useRunService.run()
  │  store.running = true（按钮转圈、终端显示"运行中…"）
  ├─ python ─► (block? syncBlockToCode) ─► usePyodide.runPython ──► RunResult
  │                                              └ (失败) ─► runOnBackend('python')
  └─ cpp/c ─► api/run.ts.runOnBackend
                POST /api/run/jobs  → { job.id, status }
                while !terminal: GET /api/run/jobs/:id (250ms)
                terminal → mapJobToRunResult → RunResult
  │
store.runResult = RunResult; store.running = false
  │
  ├─ TerminalPanel  ◄ 渲染 stdout / stderr / durationMs / 状态徽章
  ├─ TurtleCanvas   ◄ canvasCommands.length>0 时回放绘图
  └─ CodePanel      ◄ errorLocator 存在时 setModelMarkers 高亮报错行
```

### 6.4 `TerminalPanel.vue`（输出渲染要点）

```vue
<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useEditorStore } from '@/stores/editor'
const { running, runResult } = storeToRefs(useEditorStore())
</script>

<template>
  <div class="terminal">
    <div class="bar">
      <span>终端</span>
      <span v-if="running" class="badge running">运行中…</span>
      <span v-else-if="runResult" class="badge ok">完成 · {{ runResult.durationMs }}ms</span>
    </div>
    <pre v-if="runResult?.stdout" class="out">{{ runResult.stdout }}</pre>
    <pre v-if="runResult?.stderr" class="err">{{ runResult.stderr }}</pre>
  </div>
</template>

<style scoped>
.terminal { background: #0E1726; color: #E6EDF7; border-radius: 12px; padding: 12px;
  font-family: "JetBrains Mono", monospace; font-size: 13px; }
.bar { display:flex; gap:8px; align-items:center; color:#9AB0CC; margin-bottom:8px; }
.badge.running { color:#F5A623; } .badge.ok { color:#4A90E2; }
.err { color:#FF8A8A; } .out { white-space: pre-wrap; }
</style>
```

---

## 7. Pinia `useEditorStore`

```ts
// stores/editor.ts
import { defineStore } from 'pinia'
import * as Blockly from 'blockly/core'
import { pythonGenerator } from 'blockly/python'
import type { RunResult, EditorLanguage, EditorMode } from '@/modules/editor/types'

interface EditorState {
  language: EditorLanguage          // 'python' | 'cpp' | 'c'
  mode: EditorMode                  // 'block' | 'code'（仅 python 用 block）
  code: string                      // 当前文本源（运行/展示权威）
  blocklyJson: object | null        // 积木工程序列化快照（持久化 + 码→块回读）
  hasBlockOrigin: boolean           // 是否由积木创建（决定能否切回积木）
  dirtyCode: boolean                // code 模式下是否被手改（块↔码同步用）
  running: boolean
  runResult: RunResult | null
  readOnly: boolean                 // 观察员只读
  projectId: string | null
  versionId: string | null
}

export const useEditorStore = defineStore('editor', {
  state: (): EditorState => ({
    language: 'python', mode: 'block', code: '', blocklyJson: null,
    hasBlockOrigin: true, dirtyCode: false,
    running: false, runResult: null, readOnly: false,
    projectId: null, versionId: null,
  }),

  actions: {
    /** 切换语言：C/C++ 强制 code 模式且无积木来源 */
    switchLanguage(lang: EditorLanguage) {
      this.language = lang
      if (lang !== 'python') { this.mode = 'code'; this.hasBlockOrigin = false }
    },

    /** 模式开关（仅 python；复杂分支见 useModeSwitch） */
    toggleMode() {
      if (this.language !== 'python') return
      this.mode = this.mode === 'block' ? 'code' : 'block'
    },

    /** 块 → 码：唯一权威正向同步。需 BlockPanel 提供 workspace 句柄 */
    syncBlockToCode(workspace?: Blockly.WorkspaceSvg) {
      if (workspace) {
        this.blocklyJson = Blockly.serialization.workspaces.save(workspace)
        this.code = pythonGenerator.workspaceToCode(workspace)
      }
      this.dirtyCode = false
    },

    /** Monaco 手动编辑入口：置脏 */
    setCodeFromEditor(text: string) {
      this.code = text
      if (this.mode === 'code') this.dirtyCode = true
    },

    /** 运行（委托 useRunService，store 仅持状态；此处便于 action 复用） */
    setRunResult(r: RunResult) { this.runResult = r },

    /** 序列化为持久化载荷（数据模型见 §8） */
    toPersistedBlocks() {
      return {
        blockly_xml: this.blocklyJson ? jsonToXml(this.blocklyJson) : null,
        generated_code: this.code,
      }
    },

    /** 从作品包/版本恢复 */
    loadProject(p: {
      language: EditorLanguage; code: string; blocklyJson: object | null; hasBlockOrigin: boolean
    }) {
      this.language = p.language
      this.code = p.code
      this.blocklyJson = p.blocklyJson
      this.hasBlockOrigin = p.hasBlockOrigin
      this.mode = (p.language === 'python' && p.hasBlockOrigin) ? 'block' : 'code'
      this.dirtyCode = false
    },

    setReadOnly(ro: boolean) { this.readOnly = ro },
  },
})

function jsonToXml(_json: object): string { /* Blockly.Xml 往返，见 useBlockly.serializeXml */ return '' }
```

> 说明：`save/run` 的网络副作用放在 composable（`useRunService`、`api/run.ts`、作品包模块）里，store 仅保存状态并暴露纯函数 action，便于单测。`syncBlockToCode` 接受可选 `workspace` 句柄，因为 Blockly workspace 是 SVG 实例，不宜进 store；由 `BlockPanel` 在变更回调里把句柄传入。

---

## 8. 数据模型对接

### 8.1 表与编辑器字段映射（对齐上游 §6 增量 Schema）

| 表/列 | 编辑器侧来源 | 说明 |
|---|---|---|
| `project_blocks.blockly_xml` | `useBlockly.serializeXml()` | 积木工程 XML（也可存 JSON，列名兼容） |
| `project_blocks.generated_code` | `store.code` | 块→码生成结果，C/C++ 即源码本身 |
| `project_versions(...)` | 每次保存写一版 | 携带 `language` / `hasBlockOrigin` 元信息 |

### 8.2 保存（编辑器 → 后端）

```ts
// 保存当前编辑器状态为一个版本
async function saveVersion(projectId: string) {
  const store = useEditorStore()
  const payload = {
    language: store.language,
    code: store.code,
    blocks: store.language === 'python' && store.hasBlockOrigin
      ? store.toPersistedBlocks()        // { blockly_xml, generated_code }
      : null,
  }
  await fetch(`/api/projects/${projectId}/blocks`, {   // 上游 §6 增量 API
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
```

### 8.3 作品包 `.zip` 序列化 / 反序列化

作品包结构（对齐上游 §4.3）：
```
work.zip
├─ source/main.(py|cpp|c)          # generated_code / 源码
├─ blocks/workspace.xml            # 仅 python 积木工程
├─ assets/                         # 绘图快照等（可选 turtle.png）
└─ metadata.json
```

```ts
// 下载：编辑器状态 -> zip（用 fflate，轻量）
import { zipSync, strToU8 } from 'fflate'

export function exportWorkZip(): Uint8Array {
  const store = useEditorStore()
  const ext = store.language === 'python' ? 'py' : store.language
  const files: Record<string, Uint8Array> = {
    [`source/main.${ext}`]: strToU8(store.code),
    'metadata.json': strToU8(JSON.stringify({
      version: 1,
      language: store.language,
      hasBlockOrigin: store.hasBlockOrigin,
      ctTags: [],                       // 计算思维标签由评价模块回填
      exportedAt: new Date().toISOString(),
    }, null, 2)),
  }
  if (store.language === 'python' && store.hasBlockOrigin && store.blocklyJson) {
    files['blocks/workspace.xml'] = strToU8(jsonToXml(store.blocklyJson))
  }
  return zipSync(files)
}

// 上传/导入：zip -> 编辑器状态
import { unzipSync, strFromU8 } from 'fflate'

export function importWorkZip(buf: Uint8Array) {
  const store = useEditorStore()
  const entries = unzipSync(buf)
  const meta = JSON.parse(strFromU8(entries['metadata.json']))
  const ext = meta.language === 'python' ? 'py' : meta.language
  const code = strFromU8(entries[`source/main.${ext}`])
  const xml = entries['blocks/workspace.xml'] ? strFromU8(entries['blocks/workspace.xml']) : null

  store.loadProject({
    language: meta.language,
    code,
    blocklyJson: xml ? xmlToJson(xml) : null,
    hasBlockOrigin: !!meta.hasBlockOrigin && !!xml,
  })
}
function jsonToXml(j: object): string { /* useBlockly.serializeXml 同源实现 */ return '' }
function xmlToJson(_x: string): object { /* Blockly.Xml.domToWorkspace 后再 serialization.save */ return {} }
```

> **往返保证**：导入含 `blocks/workspace.xml` 的包后，`hasBlockOrigin=true`，可在另一账号上无损打开积木工程（满足上游验收"下载包另一账号上传原样打开含积木工程"）。

---

## 9. 性能与降级

### 9.1 懒加载策略

| 资源 | 时机 | 手段 |
|---|---|---|
| Monaco | 首次进入 code 模式 / 选 C·C++ | `import('monaco-editor')`，模块级 Promise 缓存 |
| Pyodide | 首次运行 Python | `import('pyodide')` + CDN `indexURL`，模块级缓存 |
| Blockly | 进入 Python block 模式 | 路由级 `defineAsyncComponent(() => import('./BlockPanel.vue'))` |

`EditorWorkbench` 用 `defineAsyncComponent` 包裹三种重面板，首屏只渲染外壳 + 工具栏：

```ts
import { defineAsyncComponent } from 'vue'
const BlockPanel = defineAsyncComponent(() => import('./components/BlockPanel.vue'))
const CodePanel  = defineAsyncComponent(() => import('./components/CodePanel.vue'))
```

### 9.2 首屏预算

| 项 | 目标 |
|---|---|
| 编辑器外壳（壳+工具栏+store） | < 150KB gzip |
| 首屏不含 Monaco/Pyodide/Blockly | 三者全部异步 chunk |
| 整体首屏（含全站壳） | 对齐上游 §4.11：< 2–3MB |

### 9.3 低配回退

1. **无 Pyodide / 加载失败**：`useRunService.tryPython` 自动 `runOnBackend('python')`，用后端兜底执行（见 §6.1），用户无感。
2. **WASM 不可用（老旧浏览器）**：探测 `typeof WebAssembly === 'undefined'`，启动即强制 Python 走后端。
3. **绘图动画**：`renderTurtle(canvas, program, animate)` 的 `animate` 在低配/`prefers-reduced-motion` 时传 `false`，一次性绘制不逐帧。
4. **移动端**：三区由横向三栏改为纵向 Tab（编程/终端/绘图），Monaco `minimap` 已默认关闭。

```ts
const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
                && !isLowEndDevice()
```

---

## 10. 验收标准与测试点（逐条可勾验）

### 10.1 双模与互转
- [ ] **AC-1 积木拼正方形→转码→运行→出图**：海龟分类拖出 `重复4次{前进100；右转90}`，切到代码模式得到等价 `for _ in range(4): t.forward(100); t.right(90)`；点运行，Pyodide 执行，绘图区出现正方形。
- [ ] **AC-2 块→码权威**：在积木上改"前进 100→150"，代码区对应数字实时变 150（防抖内）。
- [ ] **AC-3 码→块 L0 无损**：未手改代码时切回积木，工作区与切走前完全一致。
- [ ] **AC-4 码→块 L1 提示**：在 code 模式手改一行后点"积木"，弹"将丢弃手动修改"确认框；取消则停留 code 模式，确认则回到积木对应代码。
- [ ] **AC-5 码→块 L2 拦截**：导入的纯 `.py` 作品，"积木"开关禁用或提示"代码作品不支持转积木"。

### 10.2 三语言执行
- [ ] **AC-6 Python(Pyodide)**：`print('hello')` 在终端区输出 `hello`，`durationMs>0`。
- [ ] **AC-7 C++ 后端循环**：C++ 写 `for` 求和，切语言为 cpp（编辑器变 code 模式、无积木开关），运行经 `POST /api/run/jobs` 轮询至 `completed`，终端显示正确输出。
- [ ] **AC-8 C 语言**：C 写 Hello/数组，后端运行返回 stdout。
- [ ] **AC-9 错误定位**：含语法错误的代码运行后，`CodePanel` 在出错行显示红色 marker（`setModelMarkers`），消息来自 `errorLocator`。
- [ ] **AC-10 超时拦截**：死循环代码后端返回 `timeout`，终端提示"运行超时，请检查是否有死循环"，不卡死前端。

### 10.3 只读 / 协作
- [ ] **AC-11 观察员只读**：`store.setReadOnly(true)` 后，`CodePanel` 的 Monaco 不可输入（`readOnly`），积木面板禁拖拽；切回 `false` 恢复。

### 10.4 持久化 / 作品包
- [ ] **AC-12 保存版本**：保存写入 `project_blocks(blockly_xml, generated_code)`，再次进入恢复积木与代码。
- [ ] **AC-13 包往返**：下载 `.zip`（含 `blocks/workspace.xml`），换账号上传导入后积木工程原样打开、可继续编辑与运行。

### 10.5 性能 / 降级
- [ ] **AC-14 懒加载**：首屏网络面板中无 `monaco`/`pyodide`/`blockly` chunk；进入对应模式才加载。
- [ ] **AC-15 后端兜底**：模拟 Pyodide 加载失败，Python 运行自动走后端并正确出结果。
- [ ] **AC-16 移动布局**：窄屏下三区为 Tab 切换，绘图动画在 `prefers-reduced-motion` 下不逐帧。

### 10.6 视觉令牌
- [ ] **AC-17 设计令牌**：积木主题/Monaco 主题/卡片均使用 `#4A90E2` 与 `#F5A623`，卡片为圆角 + 柔阴影，与学生端风格一致。

---

## 附：关键类型 `types.ts`

```ts
export type EditorLanguage = 'python' | 'cpp' | 'c'
export type EditorMode = 'block' | 'code'

export interface ErrorLocator {
  line: number
  column?: number
  message: string
}

export interface RunResult {
  stdout: string
  stderr: string
  canvasCommands: import('./runtime/turtle.protocol').CanvasProgram
  durationMs: number
  memoryKb: number
  errorLocator: ErrorLocator | null
}
```
