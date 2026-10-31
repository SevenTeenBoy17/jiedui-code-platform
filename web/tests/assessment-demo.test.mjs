/**
 * Assessment regression tests. Run: node --test web/tests/assessment-demo.test.mjs
 * DATA tests execute the actual TypeScript fixture.
 * SCRIPT tests execute the actual SFC script-setup with Vue reactivity, mocked
 * lifecycle/transport/DOM adapters. They are NOT browser/accessibility evidence.
 * SOURCE GUARD tests inspect imports/template wiring; they do not exercise UI.
 * No business API, persistent storage write, fixture file, or dependency install.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const vue = require('vue')
const { parse } = require('@vue/compiler-sfc')
const componentRoot = '../src/components/student/assessment/'
const source = relative => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
const plain = value => JSON.parse(JSON.stringify(value))

function execute(text, modules = {}, globals = {}) {
  const result = ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  })
  assert.equal(result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0)
  const exports = {}
  runInNewContext(result.outputText, {
    exports, Error,
    require(id) {
      assert.ok(Object.hasOwn(modules, id), `Unexpected dependency: ${id}`)
      return modules[id]
    },
    ...globals,
  }, { timeout: 2000 })
  return exports
}

function sfc(relative) {
  const text = source(relative)
  const parsed = parse(text, { filename: relative })
  assert.deepEqual(parsed.errors, [])
  assert.ok(parsed.descriptor.scriptSetup, `${relative} needs script-setup`)
  return { text, script: parsed.descriptor.scriptSetup.content, template: parsed.descriptor.template.content }
}

const { demoAssessment } = execute(source('../src/data/assessmentDemo.ts'))

function scriptHarness(t, relative, exposed, { props = {}, modules = {}, globals = {} } = {}) {
  const lifecycle = { mounted: [], beforeUnmount: [] }, emitted = []
  const scope = vue.effectScope()
  const reactiveProps = vue.reactive(props)
  const api = scope.run(() => execute(`${sfc(relative).script}\nexport { ${exposed.join(', ')} };`, {
    vue: {
      ...vue,
      getCurrentInstance: () => ({ uid: 701 }),
      onMounted: callback => lifecycle.mounted.push(callback),
      onBeforeUnmount: callback => lifecycle.beforeUnmount.push(callback),
    },
    ...modules,
  }, {
    defineProps: () => reactiveProps,
    withDefaults: value => value,
    defineEmits: () => (...args) => emitted.push(args),
    ...globals,
  }))
  t.after(() => scope.stop())
  return { api, props: reactiveProps, lifecycle, emitted }
}

function drawer(t, kind = 'submission') {
  const globals = {
    window: { matchMedia: () => ({ matches: true }) },
    document: { activeElement: null, body: { style: { overflow: '' } } },
    HTMLElement: class {}, HTMLDetailsElement: class {},
  }
  return scriptHarness(t, `${componentRoot}AssessmentDetailDrawer.vue`, [
    'activeKind', 'entryKind', 'navigationStack', 'context', 'isResearch',
    'draft', 'savedDraft', 'draftHasChanges', 'draftError', 'saveDraft', 'restoreSavedDraft',
    'showKind', 'goBack', 'dialog', 'requestClose', 'onNativeClose', 'aiDecision', 'aiResponse',
  ], {
    props: { open: false, kind }, globals,
    modules: {
      '@/data/assessmentDemo': { demoAssessment },
      gsap: { gsap: { set() {}, fromTo() { throw new Error('Unexpected motion in reduced-motion unit adapter') }, to() { throw new Error('Unexpected motion in reduced-motion unit adapter') } } },
    },
  })
}

function liveList(t, mine, storage = { getItem: () => null }, userId = 41) {
  const calls = [], auth = vue.reactive({ user: { id: userId } })
  const harness = scriptHarness(t, `${componentRoot}AssessmentLiveList.vue`, [
    'items', 'drafts', 'loading', 'error', 'draftWarning', 'load', 'start', 'stateLabel',
  ], {
    modules: {
      'vue-router': { useRouter: () => ({ push: path => calls.push(path) }) },
      '@/stores/auth': { useAuthStore: () => auth },
      '@/api/study': { studyApi: { mine } },
    },
    globals: { localStorage: storage },
  })
  return { ...harness, calls, auth }
}

test('DATA: originals are deeply frozen, with original wording and real empty cells', () => {
  const visit = value => {
    if (value === null || typeof value !== 'object') return
    assert.ok(Object.isFrozen(value))
    Object.values(value).forEach(visit)
  }
  visit(demoAssessment)
  assert.deepEqual(plain(demoAssessment.E01.rows), [
    { temperature: 20, expected: '户外活动', reason: '低于阈值' },
    { temperature: 30, expected: null, reason: null },
  ])
  assert.equal(demoAssessment.E02.text, '我先考虑了低于阈值的情况，还没说明相等时怎么办。')
  assert.throws(() => { demoAssessment.E01.rows[1].expected = '填好的答案' }, TypeError)
  assert.equal(demoAssessment.task.nextVersion, null)
  assert.equal(demoAssessment.task.reviewState, 'not_started')
})

test('DATA: feedback versions are distinct from input versions and AI is not teacher judgement', () => {
  for (const id of ['E01', 'E02', 'R1', 'FB01', 'AI01']) {
    assert.equal(demoAssessment[id].id, id)
    assert.equal(demoAssessment[id].scope, 'task')
    assert.ok(demoAssessment[id].version)
  }
  for (const id of ['FB01', 'AI01']) {
    assert.equal(demoAssessment[id].version, 'demo-1')
    assert.equal(demoAssessment[id].evidenceVersion, 'v1')
    assert.deepEqual(plain(demoAssessment[id].evidenceIds), ['E01', 'E02'])
  }
  assert.equal(demoAssessment.FB01.sourceType, 'authored_demo_teacher_feedback')
  assert.equal(demoAssessment.AI01.status, 'tentative')
  assert.equal(demoAssessment.AI01.teacherReview, 'not_reviewed')
  assert.equal(demoAssessment.AI01.realModelCalled, false)
  assert.equal(demoAssessment.AI01.independentStudentEvidence, false)
  assert.equal(demoAssessment.AI01.rubricId, 'R1')
})

test('DATA: unreleased research has only a demo receipt, no invented score/date/answer payload', () => {
  const receipt = demoAssessment.receipt
  assert.match(receipt.id, /^DEMO-/)
  assert.equal(receipt.sourceType, 'authored_demo_receipt')
  assert.equal(receipt.status, 'submitted')
  assert.equal(receipt.releaseStatus, 'not_released')
  assert.equal(receipt.responseDetailsAvailable, false)
  for (const field of ['submittedAt', 'releaseAt', 'score', 'feedback']) assert.equal(receipt[field], null)
  for (const field of ['paper', 'items', 'answers', 'answerKey', 'evidenceIds']) assert.equal(Object.hasOwn(receipt, field), false)
})

test('SCRIPT: saved supplement is an independent snapshot; edits and restore never mutate originals', t => {
  const { api: a } = drawer(t)
  const originals = JSON.stringify(demoAssessment)
  assert.equal(a.aiDecision.value, null)
  a.draft.expected = '   '; a.draft.reason = '原因'
  a.saveDraft()
  assert.equal(a.savedDraft.value, null)
  assert.match(a.draftError.value, /请先写下/)
  a.aiDecision.value = 'decline'
  a.draft.expected = '室内活动'; a.draft.reason = '30等于阈值，按任务规则判断。'
  a.saveDraft()
  const first = a.savedDraft.value
  assert.ok(Object.isFrozen(first))
  assert.notEqual(first, a.draft)
  assert.equal(a.draftHasChanges.value, false)
  a.draft.reason = '还没有暂存的新解释'
  assert.equal(a.draftHasChanges.value, true)
  assert.equal(first.reason, '30等于阈值，按任务规则判断。')
  a.restoreSavedDraft()
  assert.equal(a.draft.reason, first.reason)
  assert.equal(a.draftHasChanges.value, false)
  a.draft.reason = '第二次解释'; a.saveDraft()
  assert.notEqual(a.savedDraft.value, first)
  assert.equal(first.reason, '30等于阈值，按任务规则判断。')
  assert.equal(JSON.stringify(demoAssessment), originals)
})

test('SCRIPT: drawer close/reopen retains only this instance draft; a fresh instance starts empty', async t => {
  const h = drawer(t), a = h.api
  // Deliberately a DOM adapter, not a native-dialog/browser test.
  a.dialog.value = { open: false, showModal() { this.open = true }, close() { this.open = false; a.onNativeClose() } }
  h.lifecycle.mounted.forEach(callback => callback())
  h.props.open = true; await vue.nextTick()
  a.showKind('supplement')
  a.draft.expected = '我的预期'; a.draft.reason = '我的解释'; a.saveDraft()
  a.draft.reason = '尚未暂存的编辑'
  a.requestClose(); h.props.open = false; await vue.nextTick()
  assert.equal(a.dialog.value.open, false)
  h.props.open = true; await vue.nextTick()
  assert.equal(a.activeKind.value, 'submission')
  assert.equal(a.navigationStack.value.length, 0)
  assert.equal(a.draft.reason, '尚未暂存的编辑')
  assert.equal(a.savedDraft.value.reason, '我的解释')
  assert.equal(a.draftHasChanges.value, true)
  assert.deepEqual(plain(h.emitted), [['close']])
  const fresh = drawer(t).api
  assert.equal(fresh.draft.reason, '')
  assert.equal(fresh.savedDraft.value, null)
})

test('SCRIPT: research receipt → privacy → contact returns stepwise with unchanged context', t => {
  const { api: a } = drawer(t, 'receipt')
  a.showKind('privacy'); a.showKind('contact')
  assert.deepEqual(plain(a.navigationStack.value), ['receipt', 'privacy'])
  assert.equal(a.isResearch.value, true)
  assert.match(a.context.value, /小测/)
  a.goBack(); assert.equal(a.activeKind.value, 'privacy')
  a.goBack(); assert.equal(a.activeKind.value, 'receipt')
  assert.equal(a.navigationStack.value.length, 0)
})

test('SCRIPT: task contact keeps its own task; revisiting a prior view does not make a back loop', t => {
  for (const [kind, expected] of [['loop', '循环绘图'], ['requirements', '信息来源']]) {
    const { api: a } = drawer(t, kind)
    a.showKind('contact')
    assert.match(a.context.value, new RegExp(expected))
    assert.equal(a.isResearch.value, false)
    a.goBack(); assert.equal(a.activeKind.value, kind)
  }
  const { api: a } = drawer(t)
  a.showKind('supplement'); a.showKind('submission')
  assert.deepEqual(plain(a.navigationStack.value), [])
  a.showKind('submission'); assert.deepEqual(plain(a.navigationStack.value), [])
})

test('SCRIPT: real list calls only injected mine and reads drafts using this account key', async t => {
  let reads = 0
  const keys = [], item = { assessment_id: 7, target_id: 70, title: '真实安排', kind: 'probe', done: false }
  const h = liveList(t, async () => { reads++; return [item] }, {
    getItem(key) { keys.push(key); return key === 'assess-draft-7-41' ? '{}' : null },
  })
  await h.api.load()
  assert.equal(reads, 1)
  assert.deepEqual(keys, ['assess-draft-7-41'])
  assert.equal(h.api.drafts.value.has(7), true)
  assert.match(h.api.stateLabel(item), /草稿还在/)
  h.api.start(item)
  assert.deepEqual(h.calls, ['/student/assess/7?t=70'])
  for (const state of [{ done: true }, { closed: true }, { done: true, closed: true }]) h.api.start({ ...item, ...state })
  assert.equal(h.calls.length, 1)
  assert.match(h.api.stateLabel({ ...item, done: true }), /不用重复提交/)
  assert.match(h.api.stateLabel({ ...item, closed: true }), /已经结束/)
})

test('SCRIPT: load failure is explicit; retry recovers and unavailable storage is separately explained', async t => {
  let fail = true
  const h = liveList(t, async () => { if (fail) throw new Error('network-test'); return [] })
  await h.api.load()
  assert.equal(h.api.error.value, 'network-test')
  assert.equal(h.api.loading.value, false)
  fail = false; await h.api.load()
  assert.equal(h.api.error.value, '')
  assert.equal(h.api.items.value.length, 0)
  const storage = liveList(t, async () => [{ assessment_id: 1 }], { getItem() { throw new Error('storage-test') } })
  await storage.api.load()
  assert.equal(storage.api.error.value, '')
  assert.match(storage.api.draftWarning.value, /不能读取本机草稿/)
})

test('SCRIPT: unmount or a newer request invalidates late real-list responses', async t => {
  const resolve = []
  const h = liveList(t, () => new Promise(done => resolve.push(done)))
  const first = h.api.load(), second = h.api.load()
  resolve[1]([{ assessment_id: 2 }]); await second
  resolve[0]([{ assessment_id: 1 }]); await first
  assert.equal(h.api.items.value[0].assessment_id, 2)
  const third = h.api.load()
  h.lifecycle.beforeUnmount.forEach(callback => callback())
  resolve[2]([{ assessment_id: 3 }]); await third
  assert.equal(h.api.items.value[0].assessment_id, 2)
})

test('SOURCE GUARD: live/demo branches and user keys isolate both list and memory drawer', () => {
  const { template } = sfc('../src/views/student/AssessTasksView.vue')
  assert.match(template, /<AssessmentResearchPanel\s+v-else-if="tab === 'research' && isDemo"/)
  for (const tag of ['AssessmentLiveList', 'AssessmentDetailDrawer']) {
    const element = template.match(new RegExp(`<${tag}\\b[^>]+>`))?.[0]
    assert.ok(element, tag)
    assert.match(element, /:key="String\(auth\.user\?\.id \|\| 'anon'\)"/)
  }
  assert.match(template, /<AssessmentDetailDrawer\s+v-if="isDemo"/)
  const live = sfc(`${componentRoot}AssessmentLiveList.vue`)
  assert.ok(live.template.indexOf('v-else-if="error"') < live.template.indexOf('v-else-if="!items.length"'))
  assert.match(live.template, /v-if="!item.done && !item.closed"/)
  assert.deepEqual([...live.script.matchAll(/studyApi\.(\w+)\s*\(/g)].map(match => match[1]), ['mine'])
})

test('SOURCE GUARD: demo components import no API and have no persistent/transport writes', () => {
  for (const name of ['AssessmentDetailDrawer', 'AssessmentLearningPanel', 'AssessmentRecordsPanel', 'AssessmentResearchPanel']) {
    const { script, template } = sfc(`${componentRoot}${name}.vue`)
    assert.doesNotMatch(script, /from\s*['"][^'"]*\/api\//, name)
    assert.doesNotMatch(script, /\b(fetch|XMLHttpRequest|WebSocket)\b|sendBeacon|(?:localStorage|sessionStorage)\s*\./, name)
    assert.doesNotMatch(template, /v-html\s*=/, name)
  }
})

test('SOURCE GUARD: original placeholders stay separate from system text; provenance remains readable', () => {
  const { template } = sfc(`${componentRoot}AssessmentDetailDrawer.vue`)
  const table = template.match(/<table\b[\s\S]*?<\/table>/)?.[0]
  assert.ok(table)
  assert.match(table, /row\.expected \?\? '—'/)
  assert.match(table, /row\.reason \?\? '—'/)
  assert.doesNotMatch(table, /系统提示|未填写/)
  assert.ok(template.indexOf('系统提示：30℃') > template.indexOf('</table>'))
  for (const id of ['FB01', 'AI01']) {
    assert.match(template, new RegExp(`demoAssessment\\.${id}\\.version`))
    assert.match(template, new RegExp(`demoAssessment\\.${id}\\.evidenceVersion`))
  }
  assert.match(template, /不会自动更新成长画像/)
  assert.match(template, /不代表老师已核对下方 AI 建议/)
  const returnButton = template.match(/<button\b[^>]*data-testid="return-assessment-page"[^>]*>[\s\S]*?<\/button>/)?.[0]
  assert.ok(returnButton, 'Submission detail needs its own explicit close/return action')
  assert.match(returnButton, /@click="requestClose"/)
  assert.match(returnButton, />返回刚才页面<\/button>/)
})

test('SOURCE GUARD: research receipt and missing-task views cannot borrow E01/E02 or a question paper', () => {
  const { template } = sfc(`${componentRoot}AssessmentDetailDrawer.vue`)
  for (const kind of ['receipt', 'loop', 'requirements', 'privacy', 'flow']) {
    const branch = template.match(new RegExp(`<template v-else-if="activeKind === '${kind}'">([\\s\\S]*?)<\\/template>`))?.[1]
    assert.ok(branch, kind)
    assert.doesNotMatch(branch, /demoAssessment\.(E01|E02)|answerKey|\/api\/|studyApi|v-html/, kind)
  }
  assert.match(template, /发布后只讲老师允许的反馈，不提供题目答案/)
  assert.match(template, /不会替你勾选同意/)
  assert.match(template, /不想参加，或后来想退出/)
})
