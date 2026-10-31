import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = readFileSync(new URL('../src/showcase/studentFixtures.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true })
assert.equal(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0)
const exports = {}
// Deliberately no fetch, localStorage, DOM, or persistence APIs in the execution context.
runInNewContext(compiled.outputText, { exports, URL }, { timeout: 2000 })
const { studentFixture: fixture, resetStudentFixtures: reset } = exports
const read = path => fixture(path, 'GET', {})
const post = (path, body = {}) => fixture(path, 'POST', body)

test.beforeEach(reset)

test('all four original creative modes open with compatible project and design records', () => {
  const projects = read('/api/projects?demo=1')
  assert.equal(projects.length, 4)
  assert.deepEqual(Array.from(new Set(projects.map(p => p.language))), ['python', 'cpp', 'c'])
  for (const project of projects) {
    const detail = read(`/api/projects/${project.id}`)
    assert.equal(detail.user_id, 'demo-student-1')
    assert.ok(detail.latest.code.length > 20)
    assert.equal(detail.latest.version_no, detail.latest_version)
    assert.ok(read(`/api/projects/${project.id}/design`)[0].payload)
  }
  assert.equal(JSON.parse(projects[3].latest.block_state).blocks.blocks[0].type, 'text_print')
  projects[0].title = 'mutation outside the adapter'
  assert.notEqual(read('/api/projects/1').title, projects[0].title)
})

test('create, save, design, delete and reset stay consistent in module memory', () => {
  const project = post('/api/projects', JSON.stringify({ title: '临时演示', language: 'cpp' }))
  assert.equal(project.id, 5)
  assert.equal(post('/api/projects/5/versions', { code: 'cout << 1;', blockState: null }).versionNo, 2)
  assert.equal(post('/api/projects/5/versions', { code: 'cout << 1;', blockState: null }).changed, false)
  post('/api/projects/5/design', { type: 'pseudocode', payload: '输出一个数' })
  assert.equal(read('/api/projects/5/design')[0].payload, '输出一个数')
  assert.equal(read('/api/projects/5/versions').items.length, 2)
  fixture('/api/projects/5', 'DELETE')
  assert.equal(read('/api/projects/5'), undefined)
  reset()
  assert.equal(read('/api/projects').length, 4)
})

test('the saved block project restores in Blockly and generates Python', () => {
  const Blockly = require('blockly')
  const { pythonGenerator } = require('blockly/python')
  const workspace = new Blockly.Workspace()
  try {
    Blockly.serialization.workspaces.load(JSON.parse(read('/api/projects/4').latest.block_state), workspace)
    const generated = pythonGenerator.workspaceToCode(workspace)
    assert.match(generated, /range\(3\)/)
    assert.match(generated, /给小花浇水/)
    assert.ok(workspace.getAllBlocks(false).length >= 5)
  } finally { workspace.dispose() }
})

test('download exposes source files for the adapter, not a fake zip blob', () => {
  const download = read('/api/projects/1/download')
  assert.equal(download.showcaseDownload, true)
  assert.match(download.files['main.py'], /temperature = 30/)
  assert.match(download.files['project.json'], /合成展示作品/)
})

test('task links resolve and assessment submission updates only a receipt', () => {
  const tasks = read('/api/resources/my/tasks/chain').items
  const push = read('/api/resources/my/pushes').items.find(p => p.res_type === 'assessment')
  assert.ok(tasks.some(t => t.target_id === push.target_id && t.res_id === 1))
  const paper = read(`/api/research/my/assessments/${push.res_id}`)
  assert.equal(paper.items.length, paper.item_count)
  assert.ok(paper.items.every(i => i.options.length === 4 && !Object.hasOwn(i, 'answer')))
  post(`/api/resources/my/pushes/${push.target_id}/done`)
  assert.equal(read('/api/research/my/assessments').items[0].done, false)
  const response = post('/api/research/my/assessments/1/submit', { answers: [1, 1, 2] })
  assert.equal(response.ok, true)
  assert.equal(Object.hasOwn(response, 'score'), false)
  assert.equal(read('/api/research/my/assessments').items[0].done, true)
  assert.equal(read('/api/resources/my/tasks/chain').items.find(t => t.target_id === push.target_id).done, true)
  assert.equal(read('/api/research/my/assessments/1/result').released, false)
})

test('student process records do not claim live data or emit CT scores', () => {
  const summary = read('/api/ct/summary')
  assert.equal(summary.has_real_data, false)
  assert.equal(Object.hasOwn(summary, 'ct_scores'), false)
  assert.ok(summary.evidence.every(e => e.href.includes('demo=1') && e.version))
  assert.match(read('/api/insights/my/recommend').reason, /E01/)
  const report = read('/api/ct/report?user_id=demo-student-1')
  assert.equal(Object.keys(report.report_dims).length, 0)
})

test('consent and erasure clearly distinguish synthetic requests from real actions', () => {
  const summary = read('/api/my/data')
  assert.equal(summary.total_rows, summary.items.reduce((sum, item) => sum + item.n, 0))
  assert.equal(fixture('/api/consent', 'DELETE').data_deleted, false)
  assert.equal(read('/api/consent').granted, false)
  assert.equal(post('/api/consent').pending, true)
  assert.equal(read('/api/consent').granted, false)
  assert.match(post('/api/my/data/erasure').message, /没有删除/)
  assert.equal(read('/api/my/data/export').student.name, '小禾（演示）')
})

test('both conversation contracts use labelled preset replies and matching receipts', () => {
  const legacy = post('/api/ai/chat', { message: '帮我把任务拆成几步', role: 'turtle' })
  assert.equal(legacy.source, 'fallback')
  assert.match(legacy.reply, /演示预设回复 · 未调用真实 AI/)
  assert.doesNotMatch(legacy.reply, /```/)
  const pair = post('/api/pair/sessions/demo-session-1/rounds/demo-round-1/chat', { request_id: 'request-7', message: '怎么测试？', persona: 'review' })
  assert.equal(pair.receipt.request_id, 'request-7')
  assert.equal(pair.receipt.session_id, 'demo-session-1')
  assert.equal(pair.receipt.round_id, 'demo-round-1')
  assert.equal(read('/api/pair/sessions/demo-session-1/ai-requests/request-7').status, 'released')
  assert.equal(pair.realModelCalled, false)
  assert.match(post('/api/ai/image', { prompt: '花园' }).image, /^data:image\/svg\+xml/)
})

test('unknown and teacher routes remain available to their own dispatchers', () => {
  assert.equal(read('/api/teacher/home'), undefined)
  assert.equal(read('/api/unknown'), undefined)
  assert.equal(read('/api/projects/999'), undefined)
  assert.equal(post('/api/projects/upload'), undefined)
  assert.equal(fixture('/api/projects/1', 'TRACE'), undefined)
})
