/**
 * Blockly 积木 Python 双模（§4.1）。海龟绘图 + 控制 + 数学 + 文本 + 变量。
 * 仅 Python 用积木；C/C++ 用 Monaco 文本。
 */
import * as Blockly from 'blockly/core'
import 'blockly/blocks' // 内置积木（controls_if/repeat/math/text/variables…）含其 Python 生成器
import { pythonGenerator, Order } from 'blockly/python'
import * as Zh from 'blockly/msg/zh-hans'

Blockly.setLocale(Zh as any)

// —— 自定义海龟积木 ——
Blockly.common.defineBlocksWithJsonArray([
  {
    type: 'turtle_forward',
    message0: '前进 %1 步',
    args0: [{ type: 'input_value', name: 'DIST', check: 'Number' }],
    previousStatement: null, nextStatement: null, colour: 200, tooltip: '海龟向前移动',
  },
  {
    type: 'turtle_turn',
    message0: '%1 转 %2 度',
    args0: [
      { type: 'field_dropdown', name: 'DIR', options: [['右', 'right'], ['左', 'left']] },
      { type: 'input_value', name: 'ANGLE', check: 'Number' },
    ],
    previousStatement: null, nextStatement: null, colour: 200,
  },
  {
    type: 'turtle_circle',
    message0: '画圆 半径 %1',
    args0: [{ type: 'input_value', name: 'R', check: 'Number' }],
    previousStatement: null, nextStatement: null, colour: 200,
  },
  {
    type: 'turtle_pen',
    message0: '抬笔/落笔 %1',
    args0: [{ type: 'field_dropdown', name: 'PEN', options: [['落笔', 'down'], ['抬笔', 'up']] }],
    previousStatement: null, nextStatement: null, colour: 200,
  },
])

// —— 海龟积木的 Python 生成器 ——
function ensureTurtle(gen: any) {
  gen.definitions_['turtle_setup'] = 'import turtle\nt = turtle.Turtle()'
}
pythonGenerator.forBlock['turtle_forward'] = (block, gen) => {
  ensureTurtle(gen)
  const d = gen.valueToCode(block, 'DIST', Order.NONE) || '0'
  return `t.forward(${d})\n`
}
pythonGenerator.forBlock['turtle_turn'] = (block, gen) => {
  ensureTurtle(gen)
  const a = gen.valueToCode(block, 'ANGLE', Order.NONE) || '0'
  const fn = block.getFieldValue('DIR') === 'left' ? 'left' : 'right'
  return `t.${fn}(${a})\n`
}
pythonGenerator.forBlock['turtle_circle'] = (block, gen) => {
  ensureTurtle(gen)
  const r = gen.valueToCode(block, 'R', Order.NONE) || '0'
  return `t.circle(${r})\n`
}
pythonGenerator.forBlock['turtle_pen'] = (block, gen) => {
  ensureTurtle(gen)
  return block.getFieldValue('PEN') === 'up' ? 't.penup()\n' : 't.pendown()\n'
}

// —— 教育主题 ——
export const eduTheme = Blockly.Theme.defineTheme('jiedui-edu', {
  name: 'jiedui-edu',
  base: Blockly.Themes.Classic,
  componentStyles: {
    workspaceBackgroundColour: '#F7FAFF',
    toolboxBackgroundColour: '#FFFFFF',
    flyoutBackgroundColour: '#EEF3FB',
  },
})

// —— 工具箱 ——
export const PYTHON_TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category', name: '🐾 海龟', colour: '200',
      contents: [
        { kind: 'block', type: 'turtle_forward', inputs: { DIST: { shadow: { type: 'math_number', fields: { NUM: 100 } } } } },
        { kind: 'block', type: 'turtle_turn', inputs: { ANGLE: { shadow: { type: 'math_number', fields: { NUM: 90 } } } } },
        { kind: 'block', type: 'turtle_circle', inputs: { R: { shadow: { type: 'math_number', fields: { NUM: 50 } } } } },
        { kind: 'block', type: 'turtle_pen' },
      ],
    },
    {
      kind: 'category', name: '🔁 控制', colour: '120',
      contents: [
        { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 4 } } } } },
        { kind: 'block', type: 'controls_if' },
        { kind: 'block', type: 'logic_compare' },
        { kind: 'block', type: 'logic_boolean' },
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
      kind: 'category', name: '💬 文本', colour: '160',
      contents: [
        { kind: 'block', type: 'text' },
        { kind: 'block', type: 'text_print' },
      ],
    },
    { kind: 'category', name: '📦 变量', colour: '330', custom: 'VARIABLE' },
  ],
}

export { Blockly, pythonGenerator }
