// Executes the real SFC setup and Vue watchers; only I/O/lifecycle are replaced.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const filename = path.resolve(__dirname, '../src/views/student/IdeView.vue')
const source = fs.readFileSync(process.env.IDE_TRUTH_SOURCE || filename, 'utf8')
const setup = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '')
const exposed = `\n;globalThis.page = { runTests, runProgram, run, code, lang, pyMode, currentId, projects, analysis, stageItems, evidenceItems, testCases, testsRun, lastRunOk, lastMock, output, turtleCmds, savedTip, executionDraftFingerprint, emitWorkbenchContext, setModeState,
  save, openProject, loadProjects, createProjectFor, savedCloudFingerprint, currentCloudFingerprint, confirmCloudLeave, beforeCloudLogout, saving, projBusy, blockState,
  cloudLogoutPending: typeof cloudLogoutPending === 'undefined' ? undefined : cloudLogoutPending,
  cloudLogoutFailed: typeof cloudLogoutFailed === 'undefined' ? undefined : cloudLogoutFailed };`
const compiled = ts.transpileModule(setup + exposed, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const cloudDraftFile = path.resolve(__dirname, '../src/api/cloudDraft.ts')
const cloudDraftModule = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync(cloudDraftFile, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, cloudDraftModule, { filename: cloudDraftFile })
function deferred() { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
async function fixture(t, options = {}) {
  const events = [], tracks = [], calls = [], unmount = [], mounted = [], milestones = [], leaveGuards = [], confirms = []
  const listeners = new Map()
  const route = vue.reactive({ query: { taskId: 'A-03', taskTitle: '校园温度提醒器' } })
  const storage = new Map()
  const scope = vue.effectScope()
  const result = options.result || { stdout: '42', stderr: '', status: 'success', durationMs: 2, mock: false }
  const sandbox = {
    ...vue, ...cloudDraftModule.exports, isCloudDeployment: !!options.cloud, Event,
    console, queueMicrotask, setTimeout: () => 0, clearTimeout() {},
    onMounted(fn) { mounted.push(fn) }, onUnmounted(fn) { unmount.push(fn) },
    onBeforeRouteLeave(fn) { leaveGuards.push(fn) },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    window: { innerWidth: 1440, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      confirm: text => { confirms.push(text); return options.confirm === undefined ? true : options.confirm },
      dispatchEvent(e) { events.push(e.detail); listeners.get(e.type)?.(e); return !e.defaultPrevented },
      addEventListener(type, fn) { listeners.set(type, fn) }, removeEventListener(type) { listeners.delete(type) } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail } },
    useRoute: () => route, useRouter: () => ({ replace() {}, push() {} }),
    useAuthStore: () => ({ token: 'synthetic-only', user: { id: 'synthetic-owner' }, sessionRevision: 1 }), useMilestone: () => ({ claim: (...args) => milestones.push(args) }),
    projectsApi: { saveVersion: options.save || (async () => ({ versionNo: 2, changed: true })),
      get: options.get || (async id => ({ id, language: 'cpp', title: 'Synthetic fetched', latest_version: 2, latest: { code: 'SAVED_REMOTE_CODE', version_no: 2 } })),
      list: options.list || (async () => []), create: options.create || (async () => ({ id: 902, language: 'python', title: 'New synthetic', latest_version: 0 })), getDesign: async () => [],
    },
    saveLocalDraft() {}, loadLocalDraft: () => options.localDraft || null,
    ctApi: { track: (...args) => tracks.push(args) },
    runCode: async (language, code) => { calls.push({ language, code }); return options.run ? await options.run() : result },
    runPythonTurtle: options.python || (async () => { throw new Error('synthetic environment unavailable') }), pyodideReady: () => true,
  }
  scope.run(() => vm.runInNewContext(compiled, sandbox, { filename }))
  t.after(() => scope.stop())
  const p = sandbox.page
  p.projects.value = [{ id: 901, language: 'cpp', title: 'Synthetic', latest_version: 1, latest: { code: '', version_no: 1 } }]
  p.currentId.value = 901; p.setModeState('cpp')
  p.code.cpp = '// if x > 0; 异常输入\nint main(){return 0;}'
  Object.assign(p.analysis, { input: 'number', output: 'advice', constraints: 'boundary' })
  await vue.nextTick()
  return { p, route, events, tracks, calls, unmount, milestones, leaveGuards, confirms, mounted, listeners }
}
test('comment-only hints cannot become case passes or test-stage completion', async t => {
  const { p, events } = await fixture(t)
  await p.runTests()
  assert.equal(p.stageItems.value.find(s => s.id === 5).done, false)
  assert.ok(p.testCases.value.every(c => !['passed', 'failed'].includes(c.status)))
  assert.doesNotMatch(JSON.stringify(p.evidenceItems.value), /所有课堂用例已通过|测试 4\/4/)
  p.emitWorkbenchContext()
  assert.equal(events.at(-1).testVerification, 'unverified')
  assert.equal(events.at(-1).failedTests, 0)
})
for (const change of ['code', 'project', 'task', 'language', 'edit-and-undo']) {
  test(`late execution cannot attach to changed ${change}`, async t => {
    const pending = deferred()
    const { p, route, tracks } = await fixture(t, { run: () => pending.promise })
    const work = p.runTests()
    await vue.nextTick(); await new Promise(r => setImmediate(r))
    if (change === 'code') p.code.cpp += '\n// changed'
    if (change === 'project') p.currentId.value = 902
    if (change === 'task') route.query.taskId = 'B-02'
    if (change === 'language') p.lang.value = 'c'
    if (change === 'edit-and-undo') { const old = p.code.cpp; p.code.cpp += '\n// edit'; p.code.cpp = old }
    await vue.nextTick()
    pending.resolve({ stdout: 'OLD_RESULT', stderr: '', status: 'success', durationMs: 2, mock: false })
    await work
    assert.equal(p.lastRunOk.value, null)
    assert.equal(p.testsRun.value, false)
    assert.doesNotMatch(p.output.value, /OLD_RESULT/)
    assert.equal(tracks.length, 0)
  })
}
test('normal execution retains actual output but never asserts input/expected/actual comparison', async t => {
  const { p, tracks } = await fixture(t)
  await p.runTests()
  assert.equal(p.lastRunOk.value, true)
  assert.match(p.output.value, /42/)
  assert.match(p.output.value, /服务端执行/)
  assert.equal(p.stageItems.value.find(s => s.id === 5).done, false)
  assert.equal(tracks.filter(e => e[0] === 'run').length, 1)
})
test('mock output is demonstration, not evidence or a completed test stage', async t => {
  const { p, tracks } = await fixture(t, { result: { stdout: 'DEMO', status: 'success', mock: true } })
  await p.runTests()
  assert.equal(p.lastRunOk.value, null)
  assert.match(p.output.value, /离线演示/)
  assert.equal(tracks.length, 0)
  assert.equal(p.stageItems.value.find(s => s.id === 5).done, false)
})
test('save failure permits draft execution without claiming confirmed cloud version', async t => {
  const { p } = await fixture(t, { save: async () => { throw new Error('offline') } })
  await p.runProgram()
  assert.equal(p.lastRunOk.value, true)
  assert.match(p.output.value, /云端版本未确认/)
  assert.doesNotMatch(p.savedTip.value, /已保存|已自动保存/)
})
test('changed draft during pending autosave never gets executed', async t => {
  const pending = deferred()
  const { p, calls } = await fixture(t, { save: () => pending.promise })
  const work = p.runProgram()
  p.code.cpp = 'int main(){return 7;}'
  await vue.nextTick()
  pending.resolve({ versionNo: 2, changed: true })
  await work
  assert.equal(calls.length, 0)
  assert.equal(p.lastRunOk.value, null)
  assert.notEqual(p.projects.value[0].latest.code, p.code.cpp)
})
test('template distinguishes local records, unverified cases, and task examples', () => {
  assert.doesNotMatch(source, /所有课堂用例已通过|反思原件已形成，可供教师回看|教师端同一证据锚点|savedTip \|\| '已保存'/)
  assert.match(source, /用例尚未验证/)
  assert.match(source, /尚未发送给老师/)
})
test('error → code edit → successful run preserves the existing repair event', async t => {
  let failed = true
  const { p, tracks, milestones } = await fixture(t, { run: async () => failed
    ? { stdout: '', stderr: 'compile error', status: 'error', mock: false }
    : { stdout: 'fixed', stderr: '', status: 'success', mock: false } })
  await p.runProgram()
  p.code.cpp += '\n// repair'
  await vue.nextTick()
  failed = false
  await p.runProgram()
  assert.deepEqual(tracks.map(e => e[0]), ['run', 'error', 'run', 'fix'])
  assert.deepEqual(milestones.map(e => e[0]), ['first_run', 'first_fix'])
  assert.ok(milestones.every(e => e[1] === '这次未报错，继续核对输出'))
})
test('local draft edit invalidates results even without a cloud project', async t => {
  const { p } = await fixture(t)
  p.currentId.value = null
  await vue.nextTick()
  await p.runTests()
  assert.equal(p.lastRunOk.value, true)
  p.code.cpp += '\n// changed'
  await vue.nextTick()
  assert.equal(p.lastRunOk.value, null)
  assert.equal(p.testsRun.value, false)
})
test('error from a different task cannot count as this task repair', async t => {
  let failed = true
  const { p, route, tracks } = await fixture(t, { run: async () => ({ stdout: '', stderr: failed ? 'error' : '', status: failed ? 'error' : 'success', mock: false }) })
  await p.runProgram()
  route.query.taskId = 'B-04'
  await vue.nextTick()
  failed = false
  await p.runProgram()
  assert.equal(tracks.filter(e => e[0] === 'fix').length, 0)
})
test('new run clears previous checks and graphics, including demonstration fallback', async t => {
  let mock = false
  const { p } = await fixture(t, { run: async () => ({ stdout: 'text', stderr: '', status: 'success', mock }) })
  await p.runTests()
  p.turtleCmds.value = [{ cmd: 'old' }]
  mock = true
  await p.runProgram()
  assert.equal(p.testsRun.value, false)
  assert.equal(p.lastRunOk.value, null)
  assert.equal(p.turtleCmds.value.length, 0)
})
test('browser Python execution is distinctly sourced', async t => {
  const { p } = await fixture(t, { python: async () => ({ stdout: 'PY_OUTPUT', error: '', turtle: [] }) })
  p.projects.value[0].language = 'python'; p.setModeState('python')
  await vue.nextTick()
  await p.runTests()
  assert.match(p.output.value, /浏览器 Python 执行/)
  assert.match(p.output.value, /PY_OUTPUT/)
  assert.equal(p.stageItems.value.find(s => s.id === 5).done, false)
})
test('disposing the page refuses delayed execution and tracking', async t => {
  const pending = deferred()
  const { p, tracks, unmount, events } = await fixture(t, { run: () => pending.promise })
  const work = p.runTests()
  await new Promise(r => setImmediate(r))
  unmount.forEach(fn => fn())
  const eventsBeforeResponse = events.length
  pending.resolve({ stdout: 'DISPOSED_RESULT', stderr: '', status: 'success', mock: false })
  await work
  assert.equal(p.lastRunOk.value, null)
  assert.equal(tracks.length, 0)
  assert.doesNotMatch(p.output.value, /DISPOSED_RESULT/)
  assert.equal(events.length, eventsBeforeResponse, 'disposed page must not broadcast a late context')
})

test('milestone presentation override preserves claim identity and other consumers defaults', async () => {
  const milestoneFile = path.resolve(__dirname, '../src/composables/useMilestone.ts')
  const actualSource = fs.readFileSync(milestoneFile, 'utf8').replace(/^import .*$/gm, '')
  const script = ts.transpileModule(actualSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const requests = [], timers = []
  let first = true
  const context = { exports: {}, ref: vue.ref, window: { setTimeout: fn => timers.push(fn) },
    request: async (url, options) => { requests.push({ url, ...options }); return { first } } }
  vm.runInNewContext(script, context, { filename: milestoneFile })
  const { claim, current } = context.exports.useMilestone()
  await claim('first_fix', '这次未报错，继续核对输出')
  assert.equal(current.value.text, '这次未报错，继续核对输出')
  assert.equal(current.value.kind, 'first_fix')
  assert.deepEqual(JSON.parse(requests[0].body), { kind: 'first_fix' })
  assert.equal(requests[0].url, '/api/student/milestone')
  timers.shift()()
  await claim('first_swap')
  assert.equal(current.value.text, '第一次换位成功')
  timers.shift()()
  first = false
  await claim('first_fix', '不应展示')
  assert.equal(current.value, null)
  assert.equal(timers.length, 0)
})
test('transport failure is not treated as execution failure or a test result', async t => {
  const { p, tracks } = await fixture(t, { run: async () => { throw new Error('unavailable') } })
  await p.runTests()
  assert.equal(p.testsRun.value, false)
  assert.equal(p.lastRunOk.value, null)
  assert.equal(tracks.length, 0)
  assert.match(p.output.value, /执行未完成/)
})
for (const status of ['error', 'timeout']) {
  test(`actual ${status} remains an execution issue, not a fabricated failed case`, async t => {
    const { p, tracks } = await fixture(t, { result: { stdout: '', stderr: 'synthetic failure', status, mock: false } })
    await p.runTests()
    assert.equal(p.lastRunOk.value, false)
    assert.match(p.stageItems.value.find(s => s.id === 4).state, /报错|超时/)
    const record = p.evidenceItems.value.find(e => e.id === 'version')
    assert.equal(record.ready, false)
    assert.match(record.detail, /报错|超时/)
    assert.equal(p.stageItems.value.find(s => s.id === 5).done, false)
    assert.deepEqual(tracks.map(e => e[0]), ['run', 'error'])
  })
}

test('cloud save acknowledges the submitted draft without overwriting text typed while saving', async t => {
  const pending = deferred()
  const { p } = await fixture(t, { cloud: true, save: () => pending.promise })
  p.savedCloudFingerprint.value = p.currentCloudFingerprint()
  const submitted = p.code.cpp
  const saving = p.save()
  p.code.cpp = 'int main(){return 19;} // typed during save'
  await vue.nextTick()
  pending.resolve({ versionNo: 2, changed: true })
  await saving
  assert.equal(p.code.cpp, 'int main(){return 19;} // typed during save')
  assert.equal(p.projects.value[0].latest.code, submitted)
  assert.notEqual(p.savedCloudFingerprint.value, p.currentCloudFingerprint())
  assert.match(p.savedTip.value, /新修改仍待保存/)
})

test('cloud pending save blocks route departure and cancels logout before clearing identity', async t => {
  const pending = deferred()
  const { p, leaveGuards, confirms } = await fixture(t, { cloud: true, save: () => pending.promise })
  p.savedCloudFingerprint.value = p.currentCloudFingerprint()
  const saving = p.save()
  const allowed = leaveGuards[0]()
  const logout = new Event('jiedui:before-cloud-logout', { cancelable: true })
  p.beforeCloudLogout(logout)
  pending.resolve({ versionNo: 2, changed: true })
  await saving
  assert.equal(allowed, false)
  assert.equal(logout.defaultPrevented, true)
  assert.equal(confirms.length, 0)
})

test('cloud dirty draft cancel keeps the original editor and prevents route departure', async t => {
  const { p, leaveGuards, confirms } = await fixture(t, { cloud: true, confirm: false })
  p.savedCloudFingerprint.value = p.currentCloudFingerprint()
  p.code.cpp += '\n// not saved'
  assert.equal(leaveGuards[0](), false)
  assert.match(p.code.cpp, /not saved/)
  assert.equal(p.currentId.value, 901)
  assert.equal(confirms.length, 1)
})

test('cloud late project-open response cannot overwrite a draft edited during loading', async t => {
  const pending = deferred()
  const { p } = await fixture(t, { cloud: true, get: () => pending.promise })
  p.savedCloudFingerprint.value = p.currentCloudFingerprint()
  const opening = p.openProject(902)
  p.code.cpp = 'int main(){return 27;} // NEWER_LOCAL_DRAFT'
  await vue.nextTick()
  pending.resolve({ id: 902, language: 'cpp', title: 'Remote original', latest_version: 8,
    latest: { code: 'REMOTE_OLDER_RESPONSE', version_no: 8 } })
  await opening
  assert.equal(p.code.cpp, 'int main(){return 27;} // NEWER_LOCAL_DRAFT')
  assert.equal(p.projects.value[0].latest_version, 1)
})

test('cloud reselecting the currently open project cannot fetch and silently replace its save baseline', async t => {
  let reads = 0
  const { p } = await fixture(t, { cloud: true, get: async id => {
    reads++
    return { id, language: 'cpp', title: 'Newer remote', latest_version: 8, latest: { code: 'REMOTE_V8', version_no: 8 } }
  } })
  p.savedCloudFingerprint.value = p.currentCloudFingerprint()
  const original = p.code.cpp
  await p.openProject(901)
  assert.equal(reads, 0)
  assert.equal(p.currentId.value, 901)
  assert.equal(p.code.cpp, original)
  assert.equal(p.projects.value[0].latest_version, 1)
})

test('cloud returning to the current project cancels an older pending switch without another fetch', async t => {
  const pending = deferred(), reads = []
  const { p } = await fixture(t, { cloud: true, get: id => { reads.push(id); return pending.promise } })
  p.savedCloudFingerprint.value = p.currentCloudFingerprint()
  const original = p.code.cpp
  const switching = p.openProject(902)
  await p.openProject(901)
  pending.resolve({ id: 902, language: 'cpp', title: 'Remote B', latest_version: 8,
    latest: { code: 'OLDER_PENDING_B', version_no: 8 } })
  await switching
  assert.deepEqual(reads, [902])
  assert.equal(p.currentId.value, 901)
  assert.equal(p.code.cpp, original)
  assert.equal(p.projects.value[0].latest_version, 1)
})

test('cloud initial late project response retains an untracked draft and requires confirmation to leave', async t => {
  const pending = deferred()
  const { p, leaveGuards, confirms } = await fixture(t, { cloud: true, confirm: false, get: () => pending.promise })
  p.currentId.value = null
  p.savedCloudFingerprint.value = null
  const opening = p.openProject(902)
  p.code.cpp = 'int main(){return 41;} // INITIAL_UNTRACKED_DRAFT'
  await vue.nextTick()
  pending.resolve({ id: 902, language: 'cpp', title: 'Remote initial', latest_version: 1,
    latest: { code: 'REMOTE_INITIAL', version_no: 1 } })
  await opening
  assert.equal(p.currentId.value, null)
  assert.equal(p.code.cpp, 'int main(){return 41;} // INITIAL_UNTRACKED_DRAFT')
  assert.equal(leaveGuards[0](), false)
  assert.equal(confirms.length, 1)
})

test('cloud initial list response cannot open a project over a draft typed while listing', async t => {
  const pending = deferred(), reads = []
  const { p, leaveGuards } = await fixture(t, { cloud: true, confirm: false,
    list: () => pending.promise,
    get: async id => { reads.push(id); return { id, language: 'cpp', title: 'Remote listed', latest_version: 1,
      latest: { code: 'REMOTE_LISTED', version_no: 1 } } },
  })
  p.currentId.value = null
  p.savedCloudFingerprint.value = p.currentCloudFingerprint()
  const listing = p.loadProjects(undefined, 'cpp')
  p.code.cpp = 'int main(){return 43;} // TYPED_DURING_LIST'
  await vue.nextTick()
  pending.resolve([{ id: 902, language: 'cpp', title: 'Remote listed', latest_version: 1 }])
  const needsCreate = await listing
  assert.equal(needsCreate, false)
  assert.equal(reads.length, 0)
  assert.equal(p.currentId.value, null)
  assert.equal(p.code.cpp, 'int main(){return 43;} // TYPED_DURING_LIST')
  assert.equal(leaveGuards[0](), false)
})

test('cloud failed new-language creation preserves the previous editor during and after the request', async t => {
  const pending = deferred()
  const { p } = await fixture(t, { cloud: true, create: async () => { await pending.promise; throw new Error('offline creation') } })
  const original = p.code.cpp
  const creating = p.createProjectFor('python', 'python')
  const during = { language: p.lang.value, code: p.code.cpp, id: p.currentId.value }
  const rejected = assert.rejects(creating, /offline creation/)
  pending.resolve()
  await rejected
  assert.deepEqual(during, { language: 'cpp', code: original, id: 901 })
  assert.equal(p.lang.value, 'cpp')
  assert.equal(p.code.cpp, original)
  assert.equal(p.currentId.value, 901)
})

test('cloud restored offline draft remains visibly unsaved and cannot silently leave', async t => {
  const { p, mounted, leaveGuards, confirms } = await fixture(t, {
    cloud: true, confirm: false, list: async () => { throw new Error('offline list') },
    localDraft: { language: 'python', code: 'print("OFFLINE_DRAFT")' },
  })
  await Promise.all(mounted.map(fn => fn()))
  assert.equal(p.code.python, 'print("OFFLINE_DRAFT")')
  assert.equal(leaveGuards[0](), false)
  assert.equal(confirms.length, 1)
  assert.doesNotMatch(p.savedTip.value, /^已保存到云端/)
})

test('cloud uncertain logout unfreezes the editor and restores dirty-draft leave protection', async t => {
  const { p, confirms } = await fixture(t, { cloud: true, confirm: false })
  p.savedCloudFingerprint.value = p.currentCloudFingerprint()
  const logout = new Event('jiedui:before-cloud-logout', { cancelable: true })
  p.beforeCloudLogout(logout)
  assert.equal(logout.defaultPrevented, false)
  assert.equal(p.cloudLogoutPending.value, true)
  p.cloudLogoutFailed()
  assert.equal(p.cloudLogoutPending.value, false)
  p.code.cpp += '\n// edit after unconfirmed logout'
  assert.equal(p.confirmCloudLeave(), false)
  assert.equal(confirms.length, 1)
})
