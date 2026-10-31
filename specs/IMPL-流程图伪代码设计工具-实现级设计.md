# IMPL-流程图 / 伪代码 / 思维导图设计工具-实现级设计

> 本文是《补充与优化升级_开发计划书与技术路线.md》**§4.7「设计阶段工具：流程图 / 思维导图 / 伪代码」的实现级展开**（差距★★★，当前平台完全缺失）。
> 上层文档给出"在程序设计阶段提供建模工具、培养建模+算法设计、产物绑定作品与 CT 证据、教师可见先设计后编码"的方向；本文落到具体的 Vue3 组件树、@antv/x6 节点注册、序列化结构、流程图→代码生成算法、伪代码模板编译、思维导图节点树、CT 埋点、`design_artifacts` Schema、FastAPI 路由与教师过程证据视图，**工程师可直接照此编码**。
>
> 版本：V1.0 ｜ 编写日期：2026-06-22 ｜ 技术栈：前端 Vue3 + TS + Vite + Pinia + @antv/x6；后端 FastAPI + Pydantic v2 + PostgreSQL（PoC 沿用 `data/mock-db.json` / SQLite 适配器，生产切 PG）

---

## 0. 设计目标与硬约束（先读）

| 约束 | 落点 |
|---|---|
| **课题目标** | 在"程序设计阶段"借助流程图 / 伪代码 / 思维导图，引导学生把模糊想法转化为清晰解决方案，培养**建模与算法设计**能力。 |
| **先设计后编码可见** | 设计动作 → `ct_event(design_create / design_update / design_to_code)` → 教师工作台可看到设计产物及其**时间线**，作为计算思维"建模/算法设计"维度证据。 |
| **上游数据契约（§6）** | 设计产物落 `design_artifacts(id, project_id, type, payload_json)`，`type ∈ {flowchart, pseudocode, mindmap}`，**不新增表名、不改列名**。 |
| **与编辑器咬合** | 流程图 / 伪代码可**生成代码骨架**，经 `useEditorStore` 注入编程区（设计→编码 handoff），并保留"设计产物 ↔ 代码版本"关联。 |
| **与 CT 评价咬合** | 埋点统一进上游 §4.6 的 `ct_events`（带 `phase='design'`、上下文），供 `specs/IMPL-计算思维六维评价-实现级设计.md`（下游，待建）消费。 |
| **图编辑库选型** | **流程图用 @antv/x6**（成熟 SVG 图编辑、自定义节点/端口/连线、内置撤销重做与对齐线，体积可控、文档完善）；伪代码用结构化模板编辑器（非自由文本，降低初中生语法负担）；思维导图**轻量自研节点树**（避免再引一个重型 mindmap 库）。 |
| **合规** | 所有写接口走上游合规子系统 `require_active_consent` 依赖（无有效同意→403）；设计文本入库前过 `InputGuard` 文本检查（防 PII/敏感词）。 |

---

## 1. 模块架构与文件树

### 1.1 组件树与职责

```
DesignStudio.vue                 # 设计工作室容器：三页签(流程图/伪代码/思维导图) + 保存 + handoff
├─ DesignToolbar.vue             # 顶部工具条：保存/撤销/重做/生成代码骨架/语言(py|cpp|c)/导入编程区
├─ FlowchartEditor.vue           # 流程图编辑器（@antv/x6 Graph 宿主）★重点
│   ├─ FlowPalette.vue           # 左侧拖拽面板：开始/结束/处理/判断/输入输出/循环
│   └─ FlowInspector.vue         # 右侧属性面板：选中节点的文本/分支标签
├─ PseudocodeEditor.vue          # 伪代码结构化模板编辑器（块树，非自由文本）
│   └─ PseudoBlock.vue           # 递归块：sequence/if-else/for/while/io/assign（自渲染）
└─ MindmapEditor.vue             # 思维导图：轻量节点树（增删改/折叠/连线）
    └─ MindNode.vue              # 递归思维导图节点
```

```
src/modules/design/
├─ DesignStudio.vue
├─ components/
│  ├─ DesignToolbar.vue
│  ├─ flow/  FlowchartEditor.vue  FlowPalette.vue  FlowInspector.vue
│  ├─ pseudo/ PseudocodeEditor.vue  PseudoBlock.vue
│  └─ mind/  MindmapEditor.vue  MindNode.vue
├─ x6/
│  ├─ registerNodes.ts            # @antv/x6 自定义节点/端口/连线注册
│  └─ graphConfig.ts              # 画布/网格/对齐/历史(撤销重做)/连线规则
├─ codegen/
│  ├─ flowToIR.ts                 # 流程图(图) → 中间表示 IR(结构化 AST)
│  ├─ irToCode.ts                 # IR → Python / C++ 代码骨架
│  ├─ pseudoToCode.ts             # 伪代码块树 → 代码骨架
│  └─ types.ts                    # IR / DesignNode / DesignEdge 等类型
├─ composables/
│  ├─ useDesignStore.ts           # Pinia：三类产物的 state + 序列化 + 脏标记
│  ├─ useDesignPersistence.ts     # 保存/加载 design_artifacts（API + 防抖）
│  ├─ useDesignToCode.ts          # handoff：把骨架注入 useEditorStore
│  └─ useCtTracker.ts             # CT 埋点封装（design_create / design_to_code ...）
└─ api/
   └─ design.ts                   # design_artifacts 客户端
```

### 1.2 与编辑器 / 作品 / CT 的关系

```
                    ┌────────────────────────────────────────────┐
                    │                作品 project                 │
                    │  project_versions ── project_blocks(编辑器) │
                    │                   └─ design_artifacts(设计) │  ← 本模块产物
                    └────────────────────────────────────────────┘
                                    ▲                 │
            保存(防抖) │ 加载       │  handoff(生成骨架→注入)
                       │            ▼
  DesignStudio ──► useDesignStore ──► useDesignToCode ──► useEditorStore(编辑器)
       │                  │                                    │
       │ 每个设计动作       ▼                                    │ 编码动作
       └────────► useCtTracker ──► POST /api/projects/{id}/ct/events ──► ct_events
                                   (phase='design', design_create/...)   │
                                                                          ▼
                                          下游：IMPL-计算思维六维评价(建模/算法设计维度)
```

**规则（对齐编辑器文档）**：组件之间**不互相直接调用**，全部通过 `useDesignStore` 通信；持久化/网络副作用只在 composable（`useDesignPersistence` / `useDesignToCode` / `useCtTracker`）里，store 仅持状态并暴露纯函数 action，便于单测。

### 1.3 数据流（设计→编码一条主线）

```
学生拖出「开始→输入→判断→循环→处理→结束」
  └─ x6 graph 变化 → FlowchartEditor 监听 → useDesignStore.setFlowGraph(json)  [脏]
       └─ useCtTracker.track('design_update', {type:'flowchart', nodeCount, hasBranch, hasLoop})
  └─ 点「保存」 → useDesignPersistence.save() → POST /api/projects/{id}/design
       └─ 首次保存 → ct_event('design_create'); 之后 → 节流后视为 design_update
  └─ 点「生成 Python 骨架并导入编程区」
       └─ flowToIR(graph) → irToCode(IR,'python') → 骨架字符串
       └─ useDesignToCode.inject(code) → useEditorStore.switchLanguage('python') + setCodeFromEditor(code)
       └─ useCtTracker.track('design_to_code', {type:'flowchart', target:'python', linesGenerated})
```

---

## 2. 流程图编辑器（@antv/x6）★重点

### 2.1 节点类型集（初中信息科技够用且不超纲）

| 类型 key | 形状 | 端口规则 | 语义 |
|---|---|---|---|
| `start` | 圆角胶囊 | 仅 1 个 **out**（底） | 开始 |
| `end` | 圆角胶囊 | 仅 1 个 **in**（顶） | 结束 |
| `process` | 矩形 | in(顶) + out(底) | 处理 / 赋值语句 |
| `io` | 平行四边形 | in(顶) + out(底) | 输入 / 输出 |
| `decision` | 菱形 | in(顶) + out**Yes**(右) + out**No**(底) | 判断（二分支） |
| `loop` | 六边形 | in(顶) + out**Body**(底,进入循环体) + out**Exit**(右,退出) | 循环（条件循环） |

> 设计取舍：判断固定二分支（Yes/No）、循环用"条件循环"单一模型（覆盖 while；for 由"循环+计数处理"表达），**刻意不暴露多分支/嵌套语法糖**，把复杂度压到初中生可控范围，同时保证能 1:1 映射到代码结构（见 §2.5）。

### 2.2 自定义节点 / 端口 / 连线注册

```ts
// x6/registerNodes.ts
import { Graph, Node } from '@antv/x6'

/** 统一端口分组：上入、下出、右出、底出(No)；不同节点按需启用 */
const PORT_GROUPS = {
  in:   { position: 'top',    attrs: portAttr('#5B8FF9') },
  out:  { position: 'bottom', attrs: portAttr('#5B8FF9') },
  yes:  { position: 'right',  attrs: portAttr('#52C41A'), label: { position: 'right' } },
  no:   { position: 'bottom', attrs: portAttr('#FA8C16') },
  body: { position: 'bottom', attrs: portAttr('#52C41A') },
  exit: { position: 'right',  attrs: portAttr('#FA8C16') },
}
function portAttr(stroke: string) {
  return { circle: { r: 5, magnet: true, stroke, strokeWidth: 1, fill: '#fff' } }
}

const BASE = { width: 132, height: 56, attrs: { label: { fontSize: 14, fill: '#1F2329' } } }

export function registerFlowNodes() {
  // 开始/结束：胶囊
  Graph.registerNode('flow-terminal', {
    inherit: 'rect', ...BASE,
    attrs: { body: { rx: 28, ry: 28, fill: '#E8F3FF', stroke: '#5B8FF9' }, label: BASE.attrs.label },
    ports: { groups: PORT_GROUPS },
  }, true)

  // 处理
  Graph.registerNode('flow-process', {
    inherit: 'rect', ...BASE,
    attrs: { body: { rx: 4, fill: '#fff', stroke: '#5B8FF9' }, label: BASE.attrs.label },
    ports: { groups: PORT_GROUPS, items: [{ group: 'in', id: 'in' }, { group: 'out', id: 'out' }] },
  }, true)

  // 输入/输出：平行四边形（用 path）
  Graph.registerNode('flow-io', {
    inherit: 'polygon', ...BASE,
    attrs: {
      body: { refPoints: '20,0 100,0 80,100 0,100', fill: '#FFF7E6', stroke: '#FA8C16' },
      label: BASE.attrs.label,
    },
    ports: { groups: PORT_GROUPS, items: [{ group: 'in', id: 'in' }, { group: 'out', id: 'out' }] },
  }, true)

  // 判断：菱形（Yes/No 双出口）
  Graph.registerNode('flow-decision', {
    inherit: 'polygon', width: 140, height: 80,
    attrs: {
      body: { refPoints: '0,10 10,0 20,10 10,20', fill: '#FFF1F0', stroke: '#F5222D' },
      label: { fontSize: 13, fill: '#1F2329', textWrap: { width: -10, height: -10, ellipsis: true } },
    },
    ports: {
      groups: PORT_GROUPS,
      items: [{ group: 'in', id: 'in' }, { group: 'yes', id: 'yes' }, { group: 'no', id: 'no' }],
    },
  }, true)

  // 循环：六边形（Body 进入 / Exit 退出）
  Graph.registerNode('flow-loop', {
    inherit: 'polygon', width: 140, height: 64,
    attrs: {
      body: { refPoints: '25,0 75,0 100,50 75,100 25,100 0,50', fill: '#F6FFED', stroke: '#52C41A' },
      label: BASE.attrs.label,
    },
    ports: {
      groups: PORT_GROUPS,
      items: [{ group: 'in', id: 'in' }, { group: 'body', id: 'body' }, { group: 'exit', id: 'exit' }],
    },
  }, true)
}

/** 统一连线样式（正交折线 + 箭头 + 可带 Yes/No/循环 标签） */
export const FLOW_EDGE = {
  inherit: 'edge',
  router: { name: 'manhattan' },
  connector: { name: 'rounded' },
  attrs: {
    line: { stroke: '#A6ADB4', strokeWidth: 1.5, targetMarker: { name: 'block', size: 7 } },
  },
}
```

### 2.3 画布配置：网格 / 对齐 / 撤销重做 / 连线合法性

```ts
// x6/graphConfig.ts
import { Graph } from '@antv/x6'
import { Snapline } from '@antv/x6-plugin-snapline'
import { History } from '@antv/x6-plugin-history'
import { Keyboard } from '@antv/x6-plugin-keyboard'
import { FLOW_EDGE } from './registerNodes'

Graph.registerEdge('flow-edge', FLOW_EDGE, true)

export function createFlowGraph(container: HTMLElement): Graph {
  const graph = new Graph({
    container,
    grid: { size: 16, visible: true, type: 'dot' },           // 网格
    panning: { enabled: true, modifiers: 'space' },           // 空格拖画布
    mousewheel: { enabled: true, modifiers: 'ctrl', minScale: 0.5, maxScale: 2 },
    connecting: {
      router: 'manhattan',
      connector: 'rounded',
      snap: { radius: 24 },
      allowBlank: false,        // 不允许连到空白
      allowLoop: false,         // 不允许自环
      allowMulti: false,        // 两点之间不允许重复连线
      highlight: true,
      createEdge: () => graph.createEdge({ shape: 'flow-edge' }),
      // 连线合法性：起点必须是 magnet 端口；终点必须是 in 端口
      validateConnection({ sourceMagnet, targetMagnet, targetPort }) {
        if (!sourceMagnet || !targetMagnet) return false
        return targetPort === 'in'   // 终点只能连入"入端口"，避免学生乱连
      },
    },
    highlighting: {
      magnetAvailable: { name: 'stroke', args: { attrs: { stroke: '#52C41A', strokeWidth: 2 } } },
    },
  })

  graph.use(new Snapline({ enabled: true, sharp: true }))      // 对齐辅助线
  graph.use(new History({ enabled: true, stackSize: 80 }))     // 撤销重做
  graph.use(new Keyboard({ enabled: true }))

  graph.bindKey(['ctrl+z', 'meta+z'], () => { if (graph.canUndo()) graph.undo(); return false })
  graph.bindKey(['ctrl+shift+z', 'meta+shift+z'], () => { if (graph.canRedo()) graph.redo(); return false })
  graph.bindKey(['backspace', 'delete'], () => { graph.removeCells(graph.getSelectedCells?.() ?? []); return false })

  return graph
}
```

### 2.4 拖拽 Palette + 编辑器宿主组件

```vue
<!-- components/flow/FlowchartEditor.vue -->
<template>
  <div class="flow-editor">
    <FlowPalette @drop-node="onPaletteDrop" />
    <div ref="host" class="flow-canvas" />
    <FlowInspector :node="selected" @change="onInspectorChange" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Graph, Node } from '@antv/x6'
import { createFlowGraph } from '../../x6/graphConfig'
import { registerFlowNodes } from '../../x6/registerNodes'
import { useDesignStore } from '../../composables/useDesignStore'
import { useCtTracker } from '../../composables/useCtTracker'
import FlowPalette from './FlowPalette.vue'
import FlowInspector from './FlowInspector.vue'

registerFlowNodes()
const store = useDesignStore()
const { track } = useCtTracker()
const host = ref<HTMLElement | null>(null)
const selected = ref<Node | null>(null)
let graph: Graph | null = null

const SHAPE_MAP: Record<string, { shape: string; label: string }> = {
  start:    { shape: 'flow-terminal', label: '开始' },
  end:      { shape: 'flow-terminal', label: '结束' },
  process:  { shape: 'flow-process',  label: '处理' },
  io:       { shape: 'flow-io',       label: '输入/输出' },
  decision: { shape: 'flow-decision', label: '条件?' },
  loop:     { shape: 'flow-loop',     label: '循环条件?' },
}

onMounted(() => {
  graph = createFlowGraph(host.value!)
  // 还原已存图
  if (store.flow.graph) graph.fromJSON(store.flow.graph)
  else seedStartEnd(graph)

  graph.on('selection:changed', () => { selected.value = (graph!.getSelectedCells?.()[0] as Node) ?? null })
  // 任何结构变化 → 回写 store（脏）+ 节流埋点
  graph.on('cell:added cell:removed cell:changed edge:connected', () => {
    const json = graph!.toJSON()
    store.setFlowGraph(json)
    track('design_update', store.flowEvidence())   // {type:'flowchart', nodeCount, hasBranch, hasLoop}
  })
})

function onPaletteDrop(kind: string, pos: { x: number; y: number }) {
  const def = SHAPE_MAP[kind]
  const local = graph!.clientToLocal(pos)
  const data: Record<string, unknown> = { kind }              // 业务种类存 node.data.kind
  graph!.addNode({ shape: def.shape, x: local.x, y: local.y, label: def.label, data })
}

function onInspectorChange(node: Node, patch: { label?: string }) {
  if (patch.label !== undefined) node.setAttrByPath('label/text', patch.label)
}

function seedStartEnd(g: Graph) {  // 新图预置开始/结束，降低空白焦虑
  g.addNode({ shape: 'flow-terminal', x: 320, y: 40,  label: '开始', data: { kind: 'start' } })
  g.addNode({ shape: 'flow-terminal', x: 320, y: 360, label: '结束', data: { kind: 'end' } })
}

onBeforeUnmount(() => graph?.dispose())
defineExpose({ getGraphJSON: () => graph?.toJSON() ?? null })
</script>
```

```vue
<!-- components/flow/FlowPalette.vue（HTML5 拖拽，松手时回报种类+坐标） -->
<template>
  <ul class="palette">
    <li v-for="it in items" :key="it.kind" draggable="true"
        @dragend="(e) => emit('drop-node', it.kind, { x: e.clientX, y: e.clientY })">
      <span class="dot" :data-kind="it.kind" /> {{ it.text }}
    </li>
  </ul>
</template>
<script setup lang="ts">
const emit = defineEmits<{ (e: 'drop-node', kind: string, pos: { x: number; y: number }): void }>()
const items = [
  { kind: 'start', text: '开始' }, { kind: 'io', text: '输入/输出' },
  { kind: 'process', text: '处理' }, { kind: 'decision', text: '判断' },
  { kind: 'loop', text: '循环' }, { kind: 'end', text: '结束' },
]
</script>
```

### 2.5 序列化结构（落 `design_artifacts.payload_json`，type=`flowchart`）

x6 原生 `graph.toJSON()` 体积大且耦合渲染细节，**不直接落库**。落库用**精简归一化结构**（渲染态 `x6Json` 仍保留以便像素级还原，但代码生成只依赖 `nodes/edges`）：

```json
{
  "schemaVersion": 1,
  "kind": "flowchart",
  "nodes": [
    { "id": "n_start", "kind": "start",    "text": "开始" },
    { "id": "n_in",    "kind": "io",       "text": "输入 n" },
    { "id": "n_dec",   "kind": "decision", "text": "n 是偶数?" },
    { "id": "n_p1",    "kind": "process",  "text": "打印 '偶数'" },
    { "id": "n_p2",    "kind": "process",  "text": "打印 '奇数'" },
    { "id": "n_end",   "kind": "end",      "text": "结束" }
  ],
  "edges": [
    { "from": "n_start", "to": "n_in",  "port": "out" },
    { "from": "n_in",    "to": "n_dec", "port": "out" },
    { "from": "n_dec",   "to": "n_p1",  "port": "yes", "label": "是" },
    { "from": "n_dec",   "to": "n_p2",  "port": "no",  "label": "否" },
    { "from": "n_p1",    "to": "n_end", "port": "out" },
    { "from": "n_p2",    "to": "n_end", "port": "out" }
  ],
  "x6Json": { "...": "x6 原生 toJSON，仅用于像素级回显，可被服务端忽略" }
}
```

序列化 / 反序列化：

```ts
// codegen/types.ts
export type FlowKind = 'start' | 'end' | 'process' | 'io' | 'decision' | 'loop'
export interface FlowNode { id: string; kind: FlowKind; text: string }
export interface FlowEdge { from: string; to: string; port: 'out' | 'yes' | 'no' | 'body' | 'exit'; label?: string }
export interface FlowPayload {
  schemaVersion: 1; kind: 'flowchart'
  nodes: FlowNode[]; edges: FlowEdge[]; x6Json?: unknown
}
```

```ts
// 从 x6 graph.toJSON() 归一化为 FlowPayload（落库前）
import type { FlowPayload, FlowNode, FlowEdge, FlowKind } from '../codegen/types'

export function normalizeFlow(x6: any): FlowPayload {
  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []
  for (const cell of x6.cells ?? []) {
    if (cell.shape === 'flow-edge') {
      edges.push({
        from: cell.source.cell, to: cell.target.cell,
        port: (cell.source.port ?? 'out') as FlowEdge['port'],
        label: cell.labels?.[0]?.attrs?.label?.text,
      })
    } else {
      nodes.push({
        id: cell.id,
        kind: (cell.data?.kind ?? 'process') as FlowKind,
        text: cell.attrs?.label?.text ?? cell.label ?? '',
      })
    }
  }
  return { schemaVersion: 1, kind: 'flowchart', nodes, edges, x6Json: x6 }
}

// 反序列化：优先用 x6Json 像素级还原；缺失时由 nodes/edges 重建（容灾）
export function restoreFlow(p: FlowPayload, graph: import('@antv/x6').Graph) {
  if (p.x6Json) { graph.fromJSON(p.x6Json as any); return }
  rebuildFromIR(p, graph)   // 简化布局重建，省略
}
```

### 2.6 流程图 → 伪代码 / 代码骨架生成算法

**两阶段**：① 图遍历 → **结构化中间表示 IR**（识别顺序 / 选择 / 循环）；② IR → Python/C++ 骨架。这样生成器与目标语言解耦，新增语言只写一个 `irToCode` 后端。

```ts
// codegen/types.ts（IR）
export type IRNode =
  | { t: 'seq'; body: IRNode[] }
  | { t: 'stmt'; text: string }                       // 处理/赋值
  | { t: 'io'; text: string }                         // 输入/输出
  | { t: 'if'; cond: string; then: IRNode; else?: IRNode }
  | { t: 'while'; cond: string; body: IRNode }
```

**图 → IR（结构化遍历）**：从 `start` 出发，沿 `out` 链顺序推进；遇 `decision` 递归 Yes/No 两分支并在**汇合点**收束为 `if`；遇 `loop` 把 `body` 出口回到 loop 自身的边识别为循环体、`exit` 出口为后继。汇合点用"两分支路径首个公共后继节点"判定。

```ts
// codegen/flowToIR.ts
import type { FlowPayload, FlowNode, FlowEdge, IRNode } from './types'

export function flowToIR(p: FlowPayload): IRNode {
  const byId = new Map(p.nodes.map(n => [n.id, n]))
  const out = (id: string, port: FlowEdge['port']) =>
    p.edges.find(e => e.from === id && e.port === port)?.to ?? null

  const start = p.nodes.find(n => n.kind === 'start')
  if (!start) throw new CodegenError('缺少「开始」节点')

  // 走顺序链直到 stop（用于在 if/loop 汇合时停下）
  function walk(id: string | null, stop: Set<string>): IRNode {
    const seq: IRNode[] = []
    let cur = id
    const guard = new Set<string>()                   // 防环（非法回边保护）
    while (cur && !stop.has(cur)) {
      if (guard.has(cur)) throw new CodegenError('检测到非法环路，请用「循环」节点表达重复')
      guard.add(cur)
      const node = byId.get(cur)!
      if (node.kind === 'start') { cur = out(cur, 'out'); continue }
      if (node.kind === 'end')   { break }
      if (node.kind === 'process') { seq.push({ t: 'stmt', text: node.text }); cur = out(cur, 'out'); continue }
      if (node.kind === 'io')      { seq.push({ t: 'io',   text: node.text }); cur = out(cur, 'out'); continue }

      if (node.kind === 'decision') {
        const yes = out(cur, 'yes'), no = out(cur, 'no')
        const merge = findMerge(cur, yes, no, p)       // 公共汇合点
        const stopSet = new Set([...stop, ...(merge ? [merge] : [])])
        seq.push({
          t: 'if', cond: node.text || 'condition',
          then: walk(yes, stopSet),
          else: no && no !== merge ? walk(no, stopSet) : undefined,
        })
        cur = merge
        continue
      }

      if (node.kind === 'loop') {
        const body = out(cur, 'body'), exit = out(cur, 'exit')
        // 循环体走到回到 loop 自身即闭合
        seq.push({ t: 'while', cond: node.text || 'condition', body: walk(body, new Set([cur])) })
        cur = exit
        continue
      }
      cur = out(cur, 'out')
    }
    return { t: 'seq', body: seq }
  }
  return walk(out(start.id, 'out'), new Set())
}

/** 找 decision 两分支的最近公共后继（BFS 求两条路径首个交点） */
function findMerge(dec: string, yes: string | null, no: string | null, p: FlowPayload): string | null {
  const succ = (id: string) => p.edges.filter(e => e.from === id).map(e => e.to)
  const reach = (s: string | null) => {
    const seen = new Set<string>(); const q = s ? [s] : []
    while (q.length) { const x = q.shift()!; if (seen.has(x)) continue; seen.add(x); succ(x).forEach(n => q.push(n)) }
    return seen
  }
  const ry = reach(yes), rn = reach(no)
  for (const id of ry) if (rn.has(id)) return id      // 第一个共同可达点≈汇合点
  return null
}

export class CodegenError extends Error {}
```

**IR → 代码骨架（Python / C++）**：保留学生写的中文意图为注释/`TODO`，关键结构（`if/while/缩进/大括号`）由生成器保证正确，**学生只需在 TODO 处补具体表达式**——这正是"骨架"而非"成品"，符合禁代写铁律。

```ts
// codegen/irToCode.ts
import type { IRNode } from './types'
export type Target = 'python' | 'cpp' | 'c'

export function irToCode(ir: IRNode, target: Target): string {
  const lines = target === 'python' ? emitPy(ir, 0) : emitC(ir, 1)
  if (target === 'python') return ['# 由流程图生成的代码骨架（请在 TODO 处补全表达式）', ...lines].join('\n')
  const head = target === 'cpp' ? '#include <iostream>\nusing namespace std;\n' : '#include <stdio.h>\n'
  return `${head}\nint main() {\n${lines.join('\n')}\n    return 0;\n}\n`
}

const pad = (n: number) => '    '.repeat(n)

function emitPy(ir: IRNode, d: number): string[] {
  switch (ir.t) {
    case 'seq':   return ir.body.flatMap(c => emitPy(c, d))
    case 'stmt':  return [`${pad(d)}# ${ir.text}`, `${pad(d)}pass  # TODO: 实现「${ir.text}」`]
    case 'io':    return [`${pad(d)}# 输入/输出：${ir.text}`, `${pad(d)}pass  # TODO`]
    case 'while': return [`${pad(d)}while True:  # TODO: 把条件「${ir.cond}」写成表达式`, ...emitPy(ir.body, d + 1)]
    case 'if': {
      const out = [`${pad(d)}if True:  # TODO: 条件「${ir.cond}」`, ...emitPy(ir.then, d + 1)]
      if (ir.else) out.push(`${pad(d)}else:`, ...emitPy(ir.else, d + 1))
      return out
    }
  }
}

function emitC(ir: IRNode, d: number): string[] {
  switch (ir.t) {
    case 'seq':   return ir.body.flatMap(c => emitC(c, d))
    case 'stmt':  return [`${pad(d)}// TODO: 实现「${ir.text}」`]
    case 'io':    return [`${pad(d)}// 输入/输出：${ir.text}  // TODO`]
    case 'while': return [`${pad(d)}while (1) {  // TODO: 条件「${ir.cond}」`, ...emitC(ir.body, d + 1), `${pad(d)}}`]
    case 'if': {
      const out = [`${pad(d)}if (1) {  // TODO: 条件「${ir.cond}」`, ...emitC(ir.then, d + 1), `${pad(d)}}`]
      if (ir.else) out.push(`${pad(d)}else {`, ...emitC(ir.else, d + 1), `${pad(d)}}`)
      return out
    }
  }
}
```

> 示例：§2.5 的"判断 n 偶数"流程图 → `flowToIR` → `irToCode(_, 'python')` 产出：
> ```python
> # 由流程图生成的代码骨架（请在 TODO 处补全表达式）
> # 输入/输出：输入 n
> pass  # TODO
> if True:  # TODO: 条件「n 是偶数?」
>     # 打印 '偶数'
>     pass  # TODO: 实现「打印 '偶数'」
> else:
>     # 打印 '奇数'
>     pass  # TODO: 实现「打印 '奇数'」
> ```

---

## 3. 伪代码编辑器（结构化模板）

### 3.1 设计：块树而非自由文本

初中生写自由伪代码极易语法发散、难以转码。改为**结构化块树**：每个块是固定模板（顺序 / 选择 / 循环 / 输入输出 / 赋值），学生只填"条件 / 变量 / 值"等空槽，结构由 UI 保证合法 → **天然可编译为代码骨架**，与流程图共用 §2.6 的 IR。

```ts
// 伪代码块树（落 design_artifacts.payload_json，type=pseudocode）
export type PseudoBlock =
  | { t: 'assign'; id: string; varName: string; expr: string }            // 令 x ← expr
  | { t: 'io'; id: string; mode: 'input' | 'output'; target: string }     // 输入/输出
  | { t: 'if'; id: string; cond: string; then: PseudoBlock[]; else?: PseudoBlock[] }
  | { t: 'for'; id: string; varName: string; from: string; to: string; body: PseudoBlock[] }
  | { t: 'while'; id: string; cond: string; body: PseudoBlock[] }
export interface PseudoPayload { schemaVersion: 1; kind: 'pseudocode'; blocks: PseudoBlock[] }
```

### 3.2 语法约定（面向学生的可读表达）

| 块 | 学生看到的伪代码（中文模板） |
|---|---|
| assign | `令 sum ← sum + i` |
| io(input) | `输入 n` |
| io(output) | `输出 sum` |
| if | `如果 (n 能被 2 整除) 那么 … 否则 …` |
| for | `对 i 从 1 到 n 重复：…` |
| while | `当 (sum < 100) 时重复：…` |

校验规则（`validatePseudo`，保存前与生成前各跑一次）：非空槽不得为空；`for` 的 from/to 必填；`if/while` 的 cond 必填；嵌套深度 ≤ 5（防失控）。返回与合规子系统一致的 `{ ok, reason_code, evidence }` 结构。

```ts
// codegen/pseudoToCode.ts —— 校验 + 编译为代码骨架
import type { PseudoBlock, PseudoPayload } from './types'
import { irToCode, type Target } from './irToCode'
import type { IRNode } from './types'

export interface ValidIssue { reason_code: string; evidence: string; blockId: string }
export function validatePseudo(p: PseudoPayload): ValidIssue[] {
  const issues: ValidIssue[] = []
  const walk = (bs: PseudoBlock[], depth: number) => {
    if (depth > 5) issues.push({ reason_code: 'too_deep', evidence: '嵌套层数 > 5', blockId: '*' })
    for (const b of bs) {
      if (b.t === 'assign' && (!b.varName || !b.expr)) issues.push(iss('empty_slot', '赋值变量或表达式为空', b.id))
      if (b.t === 'io' && !b.target)                   issues.push(iss('empty_slot', '输入/输出目标为空', b.id))
      if (b.t === 'if')   { if (!b.cond) issues.push(iss('empty_cond', '条件为空', b.id)); walk(b.then, depth+1); b.else && walk(b.else, depth+1) }
      if (b.t === 'for')  { if (!b.from || !b.to) issues.push(iss('empty_slot','循环范围为空', b.id)); walk(b.body, depth+1) }
      if (b.t === 'while'){ if (!b.cond) issues.push(iss('empty_cond','条件为空', b.id)); walk(b.body, depth+1) }
    }
  }
  walk(p.blocks, 1)
  return issues
}
const iss = (c: string, e: string, id: string): ValidIssue => ({ reason_code: c, evidence: e, blockId: id })

/** 伪代码块树 → IR（复用 §2.6 后端）→ 目标语言骨架 */
export function pseudoToCode(p: PseudoPayload, target: Target): string {
  return irToCode({ t: 'seq', body: p.blocks.map(toIR) }, target)
}
function toIR(b: PseudoBlock): IRNode {
  switch (b.t) {
    case 'assign': return { t: 'stmt', text: `${b.varName} ← ${b.expr}` }
    case 'io':     return { t: 'io',   text: b.mode === 'input' ? `输入 ${b.target}` : `输出 ${b.target}` }
    case 'if':     return { t: 'if', cond: b.cond, then: { t: 'seq', body: b.then.map(toIR) },
                            else: b.else ? { t: 'seq', body: b.else.map(toIR) } : undefined }
    case 'while':  return { t: 'while', cond: b.cond, body: { t: 'seq', body: b.body.map(toIR) } }
    case 'for':    return { t: 'while', cond: `${b.varName} 从 ${b.from} 到 ${b.to}`,
                            body: { t: 'seq', body: b.body.map(toIR) } }   // for 降级为 while 注释，骨架可读
  }
}
```

> `for` 在 Python 后端可进一步特化为 `for i in range(...)`（在 `emitPy` 增 `forRange` IR 节点即可）；为保持文档紧凑此处统一降级为带注释的 `while` 骨架，结构仍正确。

### 3.3 递归渲染要点（`PseudoBlock.vue`）

- 每个块用 `v-for` 渲染，`if/for/while` 的 `then/else/body` 递归挂 `<PseudoBlock>`；
- 块右侧悬浮"＋在下方插入 / 删除 / 上移下移"；插入用模板选择器（顺序/选择/循环/IO/赋值）；
- 空槽用 `contenteditable` 或受控 `<input>`，`@blur` 时写回 `useDesignStore.setPseudo()` 并触发 `design_update` 埋点（节流）。

---

## 4. 思维导图（轻量节点树）

### 4.1 数据结构（落 `design_artifacts.payload_json`，type=mindmap）

```ts
export interface MindNode {
  id: string
  text: string
  collapsed?: boolean
  children: MindNode[]
}
export interface MindPayload { schemaVersion: 1; kind: 'mindmap'; root: MindNode }
```

### 4.2 编辑能力与渲染

- **增**：选中节点 `Tab` 加子节点、`Enter` 加兄弟节点；
- **删**：`Delete` 删子树（根不可删）；
- **改**：双击节点进入 `contenteditable`，`blur` 写回；
- **折叠**：节点前折叠角标，`collapsed` 切换；折叠时不渲染子树；
- **连线**：父子用 SVG 贝塞尔曲线绘制（轻量自绘，不引图库）。

布局用简单"右展开树"：递归测量子树高度→累加分配 y，父节点居中。核心连线渲染：

```ts
// 父(px,py) → 子(cx,cy) 的水平贝塞尔
function edgePath(px: number, py: number, cx: number, cy: number): string {
  const mx = (px + cx) / 2
  return `M ${px},${py} C ${mx},${py} ${mx},${cy} ${cx},${cy}`
}
```

```vue
<!-- components/mind/MindNode.vue（递归） -->
<template>
  <g>
    <rect :x="node._x" :y="node._y" rx="8" class="mind-card"
          @dblclick="edit" />
    <text :x="node._x + 10" :y="node._y + 20">{{ node.text }}</text>
    <text v-if="node.children.length" :x="node._x - 8" :y="node._y + 20"
          class="toggle" @click="toggle">{{ node.collapsed ? '+' : '−' }}</text>
    <template v-if="!node.collapsed">
      <path v-for="c in node.children" :key="c.id" :d="edge(node, c)" class="mind-edge" />
      <MindNode v-for="c in node.children" :key="c.id" :node="c" @change="$emit('change')" />
    </template>
  </g>
</template>
```

序列化即 `JSON.stringify(payload)`；反序列化即 `JSON.parse`，布局字段 `_x/_y` 不入库（运行时计算）。

---

## 5. 设计 → 编码 handoff（注入编程区）

### 5.1 与 `useEditorStore` 对接

```ts
// composables/useDesignToCode.ts
import { useEditorStore, type EditorLanguage } from '@/stores/editor'
import { useDesignStore } from './useDesignStore'
import { flowToIR } from '../codegen/flowToIR'
import { irToCode } from '../codegen/irToCode'
import { pseudoToCode, validatePseudo } from '../codegen/pseudoToCode'
import { normalizeFlow } from '../codegen/flowToIR'  // normalize 见 §2.5
import { useCtTracker } from './useCtTracker'

export function useDesignToCode() {
  const design = useDesignStore()
  const editor = useEditorStore()
  const { track } = useCtTracker()

  /** 生成骨架并注入编程区。返回 {ok, code, issues} 供 UI 提示 */
  function injectFromFlow(target: EditorLanguage) {
    const payload = normalizeFlow(design.flow.graph)
    const code = irToCode(flowToIR(payload), target)
    apply(target, code)
    track('design_to_code', { type: 'flowchart', target, linesGenerated: code.split('\n').length,
                              artifactId: design.flow.artifactId })
    return { ok: true, code, issues: [] }
  }

  function injectFromPseudo(target: EditorLanguage) {
    const issues = validatePseudo(design.pseudo.payload)
    if (issues.length) return { ok: false, code: '', issues }   // 有空槽先让学生补全
    const code = pseudoToCode(design.pseudo.payload, target)
    apply(target, code)
    track('design_to_code', { type: 'pseudocode', target, linesGenerated: code.split('\n').length,
                              artifactId: design.pseudo.artifactId })
    return { ok: true, code, issues: [] }
  }

  function apply(target: EditorLanguage, code: string) {
    // 非 python 强制 code 模式（编辑器文档约定）；python 注入文本不破坏积木来源→切 code 模式
    editor.switchLanguage(target)
    editor.setCodeFromEditor(code)              // 置脏，进入"码"模式编辑
    editor.designLink = {                       // 见 §5.2：保留设计↔代码关联
      artifactId: target === 'python' ? design.pseudo.artifactId ?? design.flow.artifactId : design.flow.artifactId,
      sourceType: design.activeTab,             // 'flowchart' | 'pseudocode'
    }
  }
  return { injectFromFlow, injectFromPseudo }
}
```

### 5.2 保留"设计与代码的关联"

在 `useEditorStore` 增一个轻量字段（不破坏既有 state）：

```ts
// 对 stores/editor.ts 的增量（仅新增，不改已有）
interface EditorState {
  // ...既有字段...
  designLink: { artifactId: string | null; sourceType: 'flowchart' | 'pseudocode' } | null
}
// 初值 designLink: null
```

保存代码版本时一并带上 `design_link`，使 `project_versions` ↔ `design_artifacts` 双向可溯（教师可点开"这版代码由哪张流程图生成"）：

```ts
// 扩展编辑器文档 §8.2 saveVersion 的 payload
const payload = {
  language: store.language,
  code: store.code,
  blocks: /* ...既有... */,
  design_link: store.designLink,              // { artifactId, sourceType } | null
}
```

---

## 6. CT 证据埋点（建模 / 算法设计）

### 6.1 何时发、发什么

埋点统一进上游 §4.6 `ct_events`（带时间戳、阶段、上下文）。本模块产生的事件 `phase` 恒为 `'design'`：

| 事件 `action` | 触发时机 | 关键 payload 字段 | 体现的 CT 维度 |
|---|---|---|---|
| `design_create` | 某 type 的 artifact **首次**保存成功 | `type`, `artifactId` | 建模（启动建模） |
| `design_update` | 结构发生变化（节流 ≥ 3s 合并一次） | `type`, `nodeCount`, `hasBranch`, `hasLoop`, `depth` | 算法设计（引入分支/循环=控制结构思维） |
| `design_to_code` | 生成骨架并注入编程区 | `type`, `target`, `linesGenerated`, `artifactId` | 建模→实现的迁移（"先设计后编码"实锤） |
| `design_open` | 打开设计工作室 | `tab` | 过程路径（进入设计阶段） |

> "先设计后编码"的证据 = 同一 `project_id` 下，`design_create/design_to_code`(phase=design) 的时间戳 **早于** 首个 `code_edit/run`(phase=coding) 的时间戳。下游 CT 评价据此判定"建模优先"行为序列。

### 6.2 埋点封装

```ts
// composables/useCtTracker.ts
import { useDesignStore } from './useDesignStore'

type CtAction = 'design_open' | 'design_create' | 'design_update' | 'design_to_code'
let lastUpdate = 0

export function useCtTracker() {
  const design = useDesignStore()

  function track(action: CtAction, ctx: Record<string, unknown> = {}) {
    if (action === 'design_update') {           // 节流：避免每次拖动都打点
      const now = Date.now()
      if (now - lastUpdate < 3000) return
      lastUpdate = now
    }
    const body = {
      phase: 'design',                          // ★ 阶段固定为设计
      action,
      project_id: design.projectId,
      ts: new Date().toISOString(),
      context: ctx,                             // {type, nodeCount, hasBranch, hasLoop, target, ...}
    }
    // 失败不阻塞 UI（埋点最终一致即可）
    navigator.sendBeacon?.(`/api/projects/${design.projectId}/ct/events`, JSON.stringify(body))
      || fetch(`/api/projects/${design.projectId}/ct/events`, {
           method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
         }).catch(() => {})
  }
  return { track }
}
```

`design.flowEvidence()` 在 store 内由当前 FlowPayload 计算证据特征：

```ts
// useDesignStore 内
flowEvidence() {
  const nodes = this.flow.payload?.nodes ?? []
  return {
    type: 'flowchart',
    nodeCount: nodes.length,
    hasBranch: nodes.some(n => n.kind === 'decision'),
    hasLoop:   nodes.some(n => n.kind === 'loop'),
  }
}
```

---

## 7. 数据模型对接

### 7.1 `design_artifacts`（对齐上游 §6，不改表名/列名）

```sql
-- 上游 §6 既定：design_artifacts(id, project_id, type, payload_json)
-- 本文细化：补充版本/审计列（增列，不破坏既有 4 列契约）
CREATE TABLE IF NOT EXISTS design_artifacts (
    id           VARCHAR(36) PRIMARY KEY,
    project_id   VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type         VARCHAR(16) NOT NULL CHECK (type IN ('flowchart','pseudocode','mindmap')),
    payload_json JSONB       NOT NULL,            -- 按 type 分形态，见 §7.2
    version      INT         NOT NULL DEFAULT 1,  -- 每次保存自增（设计也有版本演化）
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, type)                     -- 一个作品每类设计 1 份当前态（历史可另存 design_artifact_revisions）
);
CREATE INDEX IF NOT EXISTS ix_design_project_type ON design_artifacts (project_id, type);
```

> PoC 期：沿用 `data/mock-db.json` / SQLite 适配器，`payload_json` 存字符串化 JSON；生产切 PG 用 JSONB。仓储接口与编辑器/合规文档一致（`IJsonRepository` 风格）。

### 7.2 `payload_json` 按 type 分形态（Pydantic v2 判别联合）

```python
# app/design/schemas.py
from typing import Literal, Union, Optional
from pydantic import BaseModel, Field

# ---- flowchart ----
class FlowNode(BaseModel):
    id: str; kind: Literal['start','end','process','io','decision','loop']; text: str = ''
class FlowEdge(BaseModel):
    from_: str = Field(alias='from'); to: str
    port: Literal['out','yes','no','body','exit']; label: Optional[str] = None
class FlowPayload(BaseModel):
    schemaVersion: Literal[1] = 1; kind: Literal['flowchart']
    nodes: list[FlowNode]; edges: list[FlowEdge]; x6Json: Optional[dict] = None

# ---- pseudocode ----（块树，递归用 dict 简化，深校验在前端做）
class PseudoPayload(BaseModel):
    schemaVersion: Literal[1] = 1; kind: Literal['pseudocode']; blocks: list[dict]

# ---- mindmap ----
class MindPayload(BaseModel):
    schemaVersion: Literal[1] = 1; kind: Literal['mindmap']; root: dict

DesignPayload = Union[FlowPayload, PseudoPayload, MindPayload]

class DesignUpsertReq(BaseModel):
    type: Literal['flowchart','pseudocode','mindmap']
    payload: DesignPayload
class DesignArtifactOut(BaseModel):
    id: str; project_id: str; type: str; payload: dict
    version: int; created_at: str; updated_at: str
```

### 7.3 与作品/版本关联

- `design_artifacts.project_id` → 作品级（一个作品维护 flowchart/pseudocode/mindmap 各一份当前态）；
- 设计→代码 handoff 写入 `project_versions.design_link = {artifactId, sourceType}`（§5.2），实现"代码版本反查设计来源"；
- 教师过程证据视图（§9）即按 `project_id` 聚合 `design_artifacts.updated_at` + `ct_events(phase=design)` 时间线。

---

## 8. API 契约（FastAPI）

所有写接口挂上游合规依赖 `require_active_consent`（无有效同意→403），写入前过 `InputGuard` 文本检查（设计文本可能含敏感词/PII）。

```python
# app/design/router.py
from fastapi import APIRouter, Depends, HTTPException
from app.compliance.consent.deps import require_active_consent
from app.compliance.input_guard.service import InputGuard
from .schemas import DesignUpsertReq, DesignArtifactOut
from .service import DesignService

router = APIRouter(prefix='/api', tags=['design'])

# 学生：保存（upsert，按 project_id+type 唯一）
@router.post('/projects/{project_id}/design', response_model=DesignArtifactOut)
def upsert_design(project_id: str, body: DesignUpsertReq,
                  actor=Depends(require_active_consent),
                  svc: DesignService = Depends()):
    InputGuard().scan_payload(body.payload)        # 命中→抛 422 {reason_code, evidence}
    art, created = svc.upsert(project_id, body.type, body.payload, actor)
    # 首次创建 → 由 service 内部记 ct_event('design_create')；更新走前端节流 design_update
    return art

# 学生/教师：读取某作品全部设计产物
@router.get('/projects/{project_id}/design')
def list_design(project_id: str, actor=Depends(require_active_consent),
                svc: DesignService = Depends()) -> list[DesignArtifactOut]:
    return svc.list_by_project(project_id, actor)

# 教师：查看某学生作品的"先设计后编码"过程证据（设计产物 + 时间线）
@router.get('/teacher/students/{student_id}/projects/{project_id}/design-evidence')
def design_evidence(student_id: str, project_id: str,
                    actor=Depends(require_teacher),     # RBAC：仅教师，且需任教该班
                    svc: DesignService = Depends()):
    return svc.evidence_timeline(student_id, project_id, actor)
```

请求 / 响应示例：

```jsonc
// POST /api/projects/p_123/design
{ "type": "flowchart",
  "payload": { "schemaVersion":1, "kind":"flowchart",
    "nodes":[{"id":"n_start","kind":"start","text":"开始"}],
    "edges":[] } }
// 200
{ "id":"da_88","project_id":"p_123","type":"flowchart","version":2,
  "payload":{ "...":"同上" }, "created_at":"2026-06-22T09:00:00Z", "updated_at":"2026-06-22T09:12:00Z" }

// 命中敏感词时（InputGuard）
// 422 { "reason_code":"sensitive_term","evidence":{"term":"***","node":"n_p1"} }
```

```jsonc
// GET /teacher/students/s_1/projects/p_123/design-evidence  → 教师过程证据
{ "project_id":"p_123",
  "artifacts":[
    {"type":"flowchart","version":3,"updated_at":"2026-06-22T09:12:00Z"},
    {"type":"pseudocode","version":1,"updated_at":"2026-06-22T09:20:00Z"} ],
  "timeline":[
    {"ts":"2026-06-22T09:00:00Z","action":"design_create","type":"flowchart"},
    {"ts":"2026-06-22T09:12:00Z","action":"design_update","type":"flowchart","hasBranch":true,"hasLoop":true},
    {"ts":"2026-06-22T09:25:00Z","action":"design_to_code","type":"flowchart","target":"python"},
    {"ts":"2026-06-22T09:26:10Z","action":"code_edit","phase":"coding"} ],   // 来自编辑器埋点
  "designFirst": true }   // 设计动作时间 < 首个编码动作时间 → 判定"先设计后编码"成立
```

`evidence_timeline` 服务逻辑：聚合 `design_artifacts`（按 project_id）+ `ct_events`（phase∈{design,coding}，按 ts 升序），计算 `designFirst = min(ts where phase=design) < min(ts where phase=coding)`。

---

## 9. 教师视角：先设计后编码的时间线证据

与教师工作台（上游 §4.8）衔接，学生作品详情页新增「设计过程」分区：

- **设计产物缩略**：流程图缩略图（x6 `graph.toPNG()` 服务端可选预渲染或前端懒渲染）、伪代码块树只读视图、思维导图只读树；
- **时间线带（横向）**：`design_create → design_update(标注引入分支/循环) → design_to_code → code_edit/run`，用颜色区分 design / coding 阶段；
- **"先设计后编码"徽标**：`designFirst=true` 时显示绿色徽标，作为建模/算法设计维度的过程证据；为 `false`（边写边补图或无设计）时灰色提示，供教师介入；
- **下钻**：点 `design_to_code` 事件可跳到由该设计生成的代码版本（经 `project_versions.design_link`）。

数据全部来自 §8 的 `design-evidence` 端点，教师端无需新表。

---

## 10. 验收标准 + 测试点（逐条可勾验）

### 10.1 流程图

- [ ] **AC-F1** 从 Palette 拖出「开始 → 输入 → 判断 → 循环 → 处理 → 结束」，节点可连线，连线只能连到 `in` 端口（非法连线被 `validateConnection` 拒绝）。
- [ ] **AC-F2** 撤销/重做（Ctrl+Z / Ctrl+Shift+Z）生效；删除键删除选中；对齐辅助线出现。
- [ ] **AC-F3** 点「保存」后 `GET /api/projects/{id}/design` 返回 `type=flowchart` 的 payload，`nodes/edges` 与画布一致；刷新页面后画布像素级还原（x6Json）。
- [ ] **AC-F4** 含「判断 + 循环」的流程图，点「生成 Python 骨架并导入编程区」→ 编辑器进入 code 模式、`store.code` 含正确缩进的 `if/else`、`while`，且每个处理块有 `# TODO`。
- [ ] **AC-F5** 同图生成 C++ 骨架时含 `#include`、`int main(){...}`、大括号配对正确。
- [ ] **AC-F6** 存在非法回边（未用 loop 节点而手连成环）时，生成报 `CodegenError('检测到非法环路…')`，UI 友好提示，不崩溃。

### 10.2 伪代码

- [ ] **AC-P1** 能用模板搭出「输入 n / for i 从 1 到 n / if 偶数 then 输出 / 否则输出」块树，空槽可编辑。
- [ ] **AC-P2** 有空槽时点生成 → `validatePseudo` 返回 `reason_code=empty_*`，阻止注入并高亮该块。
- [ ] **AC-P3** 校验通过后生成 Python/C++ 骨架并注入编程区，结构正确。
- [ ] **AC-P4** 嵌套深度 > 5 时报 `too_deep`。

### 10.3 思维导图

- [ ] **AC-M1** Tab 加子节点、Enter 加兄弟、Delete 删子树（根不可删）、双击改名、折叠角标生效。
- [ ] **AC-M2** 保存后 `payload_json(type=mindmap).root` 结构正确，刷新还原；`_x/_y` 不入库。

### 10.4 CT 埋点

- [ ] **AC-C1** 首次保存某 type → `ct_events` 出现 `phase=design, action=design_create`，含 `type/artifactId`。
- [ ] **AC-C2** 引入判断/循环后的结构变化 → `design_update` 的 context `hasBranch=true / hasLoop=true`（且 3s 内多次变化只合并一条）。
- [ ] **AC-C3** 生成骨架并导入 → `design_to_code` 含 `target` 与 `linesGenerated`。
- [ ] **AC-C4** 同作品先设计后编码场景：`design-evidence.designFirst === true`。

### 10.5 教师视角 & 数据契约

- [ ] **AC-T1** 教师打开学生作品「设计过程」分区，看到设计产物缩略 + 时间线 + 「先设计后编码」徽标。
- [ ] **AC-T2** 点 `design_to_code` 事件可跳到由该设计生成的代码版本（`design_link` 溯源成立）。
- [ ] **AC-T3** 无有效同意的学生调用 `POST /api/projects/{id}/design` 返回 403（`require_active_consent`）。
- [ ] **AC-T4** 设计文本含敏感词时保存返回 422 `{reason_code, evidence}`，未落库。
- [ ] **AC-T5** `design_artifacts` 仅用既有 `(id, project_id, type, payload_json)` 4 列契约 + 增列（version/时间戳），未改表名/列名。

### 10.6 单元测试要点（codegen 纯函数，无需浏览器）

```ts
// flowToIR / irToCode / pseudoToCode 是纯函数，覆盖：
// 1) 顺序链 → seq；2) decision 两分支 → if/else 且正确收束到 merge；
// 3) loop → while 且 body 闭合；4) 非法环抛 CodegenError；
// 5) Python 缩进正确 / C++ 大括号配对；6) pseudo 空槽校验。
```

---

## 11. 关键取舍小结

1. **图编辑库 = @antv/x6**：相对 mermaid（只读渲染、难交互编辑）与重型 BPMN 库，x6 提供成熟的自定义节点/端口/连线、内置 history（撤销重做）、snapline（对齐），交互式拖拽建模体验最佳，体积/学习成本可控，契合上游 §4.7 的技术建议。
2. **流程图→代码 = 两阶段（图→IR→代码）**：先把图归约为结构化 IR（识别顺序/选择/循环），再由语言后端出码。好处：① 生成器与目标语言解耦，新增语言只写一个后端；② 伪代码与流程图**共用同一 IR**，逻辑只写一遍；③ 产出是带 `TODO` 的**骨架**而非成品，符合"禁整题代写"铁律，把"补具体表达式"的思考留给学生。
3. **伪代码 = 结构化块树而非自由文本**：用固定模板+受控空槽，从源头杜绝语法发散，天然可编译，降低初中生认知负担。
4. **与编辑器衔接 = 经 `useEditorStore` 注入 + `designLink` 溯源**：handoff 走 `switchLanguage + setCodeFromEditor`（复用既有 action，不侵入编辑器内部），并用 `project_versions.design_link` 保留"代码版本 ↔ 设计产物"双向关联。
5. **与 CT 评价衔接 = 统一进 `ct_events(phase='design')`**：以 `design_create/design_update/design_to_code` 三事件 + `hasBranch/hasLoop` 上下文，作为"建模/算法设计"维度证据；以"设计动作时间 < 编码动作时间"判定**先设计后编码**，供下游 `IMPL-计算思维六维评价` 直接消费，无需额外表。
6. **数据契约零破坏**：严格沿用上游 §6 `design_artifacts` 4 列，仅以判别联合细化 `payload_json` 形态并增审计列，PoC/生产仓储与编辑器、合规子系统保持同一风格。
