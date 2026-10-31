/*
 * My Data V3 contracts. The filename retains the implementation slice's v2 name.
 * Run: node --test tests/my-data-v2.contract.cjs (cwd: web)
 * PURE_MODEL tests execute compiled model functions with fixed data.
 * STATIC_SOURCE tests inspect TypeScript ASTs; they are NOT browser/network tests.
 * No API, database, live account, rights operation, or dependency install is used.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const ts = require('typescript')

const webRoot = path.resolve(__dirname, '..')
const componentRoot = path.join(webRoot, 'src/components/student/my-data')
const modelPath = path.join(componentRoot, 'model.ts')
const fixturePath = path.join(componentRoot, 'demo-data.json')
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
const modelSource = fs.readFileSync(modelPath, 'utf8')
const compilation = ts.transpileModule(modelSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  reportDiagnostics: true,
  fileName: modelPath,
})
assert.equal((compilation.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0)
const modelModule = { exports: {} }
vm.runInNewContext(compilation.outputText, {
  module: modelModule,
  exports: modelModule.exports,
  require(specifier) {
    assert.equal(specifier, './demo-data.json', 'Pure model must not load network or application modules')
    return fixture
  },
}, { filename: modelPath, timeout: 1000 })
const model = modelModule.exports
const native = value => JSON.parse(JSON.stringify(value))
const allItems = fixture.groups.flatMap(group => group.items)
const sum = values => values.reduce((total, value) => total + value, 0)
const summaryOf = items => ({ total_rows: sum(items.map(item => item.n)), items, retained: [], notes: { retained: '', exported: '' } })

function parseVue(relativePath) {
  const filename = path.join(webRoot, relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const script = source.match(/<script\s+setup\s+lang="ts">([\s\S]*?)<\/script>/)
  assert.ok(script, `${relativePath}: expected TypeScript setup script`)
  const tree = ts.createSourceFile(filename, script[1], ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  return { filename, source, tree }
}
function nodes(root, predicate) {
  const result = []
  const visit = node => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit) }
  visit(root)
  return result
}
function isInside(node, ancestor) {
  for (let current = node; current; current = current.parent) if (current === ancestor) return true
  return false
}
function namedFunction(tree, name) {
  const match = nodes(tree, node => ts.isFunctionDeclaration(node) && node.name?.text === name)
  assert.equal(match.length, 1, `Expected one ${name} function`)
  assert.ok(match[0].body)
  return match[0]
}
function callName(node) { return ts.isCallExpression(node) ? node.expression.getText().replace(/\s+/g, '') : '' }
function propertyText(node) { return node.getText().replace(/\s+/g, '') }

test('PURE_MODEL: approved V3 has 112 stored rows, 28 unique categories, 9 zero categories, 6 groups', () => {
  assert.equal(fixture.schema, 'my-data-blueprint/v3')
  assert.equal(fixture.source, 'synthetic-design-only')
  assert.equal(fixture.total_rows, 112)
  assert.equal(fixture.category_count, 28)
  assert.equal(fixture.zero_categories, 9)
  assert.equal(fixture.groups.length, 6)
  assert.equal(allItems.length, 28)
  assert.equal(new Set(allItems.map(item => item.category)).size, 28)
  assert.equal(allItems.filter(item => item.n === 0).length, 9)
  assert.deepEqual(fixture.groups.map(group => group.count), [75, 14, 13, 6, 2, 2])
  for (const group of fixture.groups) assert.equal(sum(group.items.map(item => item.n)), group.count, group.id)
  assert.equal(sum(allItems.map(item => item.n)), 112)
  assert.equal(sum(fixture.groups.map(group => group.count)), 112)
})

test('PURE_MODEL: four works have two submitted receipts and two drafts; submission is independent of tests', () => {
  assert.equal(model.demoProjects.length, 4)
  assert.equal(new Set(model.demoProjects.map(project => project.id)).size, 4)
  const submitted = model.demoProjects.filter(project => project.submission_state === 'submitted')
  const drafts = model.demoProjects.filter(project => project.submission_state === 'draft')
  assert.equal(submitted.length, 2)
  assert.equal(drafts.length, 2)
  assert.deepEqual(submitted.map(project => project.submission_id), ['S01', 'S02'])
  assert.ok(drafts.every(project => project.submission_id === null))
  assert.ok(submitted.every(project => project.teacher_feedback === 'unpublished'))
  assert.ok(submitted.some(project => project.tests.passed < project.tests.total), 'Submitted must not imply all tests passed')
  assert.equal(fixture.ai.live, false)
})

test('PURE_MODEL: three original test rows and conflicting result stay verbatim', () => {
  const project = model.demoProjects.find(project => project.id === 'DEMO-P02')
  assert.equal(project.tests.record_id, 'DEMO-T02')
  assert.equal(project.tests.record_version, 1)
  assert.equal(project.tests.passed, 2)
  assert.equal(project.tests.total, 3)
  assert.deepEqual(project.tests.cases, [
    { input: '3', expected: '再大一点', actual: '再大一点', result: 'pass' },
    { input: '7', expected: '猜对了', actual: '猜对了', result: 'pass' },
    { input: '11', expected: '超出范围', actual: '再小一点', result: 'needs_work' },
  ])
})

test('PURE_MODEL: demo counts remain synthetic even when an unrelated live summary is supplied', () => {
  const live = summaryOf([{ category: 'ct_events', what: '不能被当成演示来源', n: 999 }])
  const actual = native(model.makeGroups(live, true))
  assert.equal(actual.length, 6)
  assert.equal(sum(actual.map(group => group.count)), 112)
  for (let index = 0; index < actual.length; index++) {
    assert.equal(actual[index].count, fixture.groups[index].count)
    assert.deepEqual(actual[index].items.map(item => [item.category, item.n]), fixture.groups[index].items.map(item => [item.category, item.n]))
  }
})

test('PURE_MODEL: unavailable live summary keeps all counts unknown, never zero', () => {
  const groups = model.makeGroups(null, false)
  assert.equal(groups.length, 6)
  assert.ok(groups.every(group => group.count === null))
  assert.ok(groups.flatMap(group => group.items).every(item => item.n === null))
})

test('PURE_MODEL: an actual zero is preserved, missing categories remain unknown, raw source wording survives', () => {
  const sourceText = '学习行为事件（运行/报错/修复/求助等），含求助话语前 40 字'
  const live = summaryOf([{ category: 'ct_events', what: sourceText, n: 0 }])
  const before = JSON.stringify(live)
  const groups = model.makeGroups(live, false)
  const process = groups.find(group => group.id === 'process')
  const event = process.items.find(item => item.category === 'ct_events')
  assert.equal(event.n, 0)
  assert.equal(event.description, sourceText)
  assert.equal(process.count, null, 'Partial group total must not silently sum only available categories')
  assert.equal(process.items.find(item => item.category === 'usage_sessions').n, null)
  assert.equal(JSON.stringify(live), before, 'Mapping must not mutate source data')
})

test('PURE_MODEL: newly returned categories are retained with their original name and count', () => {
  const live = summaryOf([{ category: 'future_original_type', what: '新类别的原始说明（保留）', n: 7 }])
  const groups = model.makeGroups(live, false)
  const unknown = groups.find(group => group.id === 'unknown')
  assert.ok(unknown)
  assert.equal(unknown.count, 7)
  assert.equal(unknown.items[0].category, 'future_original_type')
  assert.equal(unknown.items[0].title, '新类别的原始说明（保留）')
  assert.equal(unknown.items[0].n, 7)
})

test('PURE_MODEL: complete live categories sum accurately without changing original counts', () => {
  const live = summaryOf(allItems.map(item => ({ category: item.category, what: `原始说明：${item.title}`, n: item.n })))
  const groups = native(model.makeGroups(live, false))
  assert.deepEqual(groups.map(group => group.count), [75, 14, 13, 6, 2, 2])
  assert.equal(groups.flatMap(group => group.items).filter(item => item.n === 0).length, 9)
  assert.equal(sum(groups.map(group => group.count)), live.total_rows)
})

test('PURE_MODEL: generated previews are limited to named demo works; language labels do not mix edit mode', () => {
  assert.equal(model.previewFor({ id: 1 }), null)
  assert.equal(model.previewFor({ id: 'DEMO-P03' }), null)
  assert.ok(model.previewFor({ id: 'DEMO-P01' }).endsWith('/garden.png'))
  assert.ok(model.previewFor({ id: 'DEMO-P02' }).endsWith('/guess.png'))
  assert.equal(model.languageLabel('python'), 'Python')
  assert.equal(model.languageLabel('cpp'), 'C++')
  assert.equal(model.languageLabel('c'), 'C')
  assert.equal(model.languageLabel('future-language'), 'future-language')
  assert.equal(model.demoProjects.find(project => project.edit_mode === 'blocks').language, 'python')
})

test('STATIC_SOURCE only: MyDataView demo early return structurally precedes summary and project API calls', () => {
  const { tree } = parseVue('src/views/student/MyDataView.vue')
  const load = namedFunction(tree, 'load')
  const branch = load.body.statements.find(node => ts.isIfStatement(node) && propertyText(node.expression) === 'demo.value')
  assert.ok(branch, 'Expected an explicit if (demo.value) branch in load()')
  assert.ok(ts.isBlock(branch.thenStatement))
  assert.ok(ts.isReturnStatement(branch.thenStatement.statements.at(-1)), 'Demo branch must end with return')
  const apiCalls = nodes(tree, node => ['complianceApi.myData', 'request'].includes(callName(node)))
  assert.equal(apiCalls.length, 2, 'Expected exactly summary and projects requests in this view')
  for (const call of apiCalls) {
    assert.ok(isInside(call, load), 'API call must stay inside guarded load function')
    assert.ok(call.pos >= branch.end, 'No summary/project request may occur before the demo early return')
  }
  assert.equal(apiCalls.find(call => callName(call) === 'request').arguments[0].text, '/api/projects')
  assert.equal(nodes(branch.thenStatement, node => ts.isCallExpression(node)).length, 0, 'Demo branch must not invoke request helpers')
})

test('STATIC_SOURCE only: DataManagement rights and download calls are confined to the non-demo branch', () => {
  const { tree } = parseVue('src/components/student/my-data/DataManagement.vue')
  const execute = namedFunction(tree, 'executeAction')
  const branch = nodes(execute, node => ts.isIfStatement(node) && propertyText(node.expression) === 'props.demo')[0]
  assert.ok(branch?.elseStatement, 'Expected explicit demo/real action split')
  const rightsCalls = nodes(tree, node => callName(node).startsWith('complianceApi.'))
  assert.deepEqual(rightsCalls.map(callName).sort(), ['complianceApi.exportMyData', 'complianceApi.requestErasure', 'complianceApi.withdrawConsent'])
  for (const call of rightsCalls) assert.ok(isInside(call, branch.elseStatement), 'All rights API calls must be in the non-demo branch')
  assert.equal(nodes(branch.thenStatement, node => ts.isCallExpression(node)).length, 0, 'Demo action branch must only update local explanatory state')
  const downloads = nodes(tree, node => callName(node) === 'downloadJson')
  assert.equal(downloads.length, 1)
  assert.ok(isInside(downloads[0], branch.elseStatement), 'Real JSON download must not occur in demo')
  const headGuard = execute.body.statements.find(node => ts.isIfStatement(node) && /acknowledged\.value/.test(node.expression.getText()))
  assert.ok(headGuard && headGuard.pos < branch.pos, 'Erasure acknowledgement guard must precede either action branch')
})

test('REPORT: record exact tested source hashes and explicit coverage limitations', context => {
  for (const filename of [modelPath, fixturePath, path.join(webRoot, 'src/views/student/MyDataView.vue'), path.join(componentRoot, 'DataManagement.vue')]) {
    context.diagnostic(`SHA256 ${path.relative(webRoot, filename)} ${crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex')}`)
  }
  context.diagnostic('Coverage: executed pure model/fixture assertions plus static AST branch contracts only.')
  context.diagnostic('Not covered: rendered pixels, DOM focus, responsive layout, actual browser requests, server authorization, account deletion, or real AI.')
})
