// Actual SFC + composable + client; doubles stop only network and browser lifecycle.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const { compile } = require('@vue/compiler-dom')
const { renderToString } = require('@vue/server-renderer')
const root = path.resolve(__dirname, '../src')
const studioPath = path.join(root, 'views/student/StudioView.vue')
const source = fs.readFileSync(process.env.TRUSTED_STUDIO_SOURCE || studioPath, 'utf8')
const tick = async () => { for (let i = 0; i < 8; i++) { await vue.nextTick(); await new Promise(r => setImmediate(r)) } }
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const caps = { mode: 'trusted_required', trusted_chat_enabled: true, trusted_image_enabled: false, history_mode: 'current_question_only' }
function session(id = 'A', extra = {}) {
  return { session_id: id, student_id: 'student-1', teacher_id: 'teacher-1', class_id: 11, push_id: 21,
    exercise_id: 31, attempt_id: `attempt-${id}`, project_id: 41, language: 'python', human_role: 'driver',
    status: 'active', task_snapshot_id: `task-${id}`, task_snapshot: { title: `任务${id}`, content: '只含合成材料' },
    task_version_status: 'session_snapshot_only', role_evidence: 'teacher_assigned_not_observed',
    ai_policy: { scaffold: 1, socratic: false, policy_hash: 'synthetic-hash' },
    actions: { can_chat: true, can_open_round: false, reason_code: null },
    rounds: [{ round_id: `round-${id}`, session_id: id, round_index: 2, ended_at: null }], ...extra }
}
function response(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body } }
function reply(sid, rid, req, extra = {}) {
  return { reply: '合成回复，请说明你的第一步。', source: 'model', receipt: { status: 'released', request_id: req.request_id,
    session_id: sid, round_id: rid, project_version_id: 51, version_no: 3, requested_persona: req.persona,
    effective_role: req.persona, assigned_scaffold: 1, scaffold_applied: req.persona === 'review', socratic: false,
    policy_hash: 'synthetic-hash', prompt_version: 'ai-prompt/v2-context1', code_source: 'saved_version', ...extra } }
}
async function fixture(t, options = {}) {
  const calls = [], legacy = [], metadata = [], unmounts = [], mounts = [], navigations = []
  const route = vue.reactive({ query: { pairSession: 'A', ...(options.query || {}) } })
  const auth = vue.reactive({ token: 'synthetic-token', user: { id: 'student-1' } })
  auth.logout = () => { auth.token = ''; auth.user = null }
  const scope = vue.effectScope(), cache = new Map(), storage = new Map()
  const life = { ...vue, onMounted: f => mounts.push(f), onUnmounted: f => unmounts.push(f) }
  const browser = { setTimeout: () => 0, clearTimeout() {}, addEventListener() {}, removeEventListener() {} }
  let serial = 0
  const fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined
    const call = { url, method: init.method || 'GET', body, token: init.headers?.Authorization }
    calls.push(call)
    if (options.transport) { const result = await options.transport(call); if (result !== undefined) return result }
    if (url.endsWith('/capabilities')) return response(options.capabilities || caps)
    if (url.endsWith('/available')) return response({ sessions: options.available || [session()] })
    const chat = url.match(/\/sessions\/([^/]+)\/rounds\/([^/]+)\/chat$/)
    if (chat) return response(reply(chat[1], chat[2], body))
    if (/\/ai-requests\//.test(url)) return response({ detail: { code: 'REQUEST_NOT_FOUND' } }, 404)
    if (url.endsWith('/rounds')) return response({ round_id: 'new-round', session_id: 'A', round_index: 3, ended_at: null }, 201)
    const read = url.match(/\/sessions\/([^/]+)$/)
    if (read) return response(options.session || session(read[1]))
    throw new Error(`Unexpected synthetic request: ${url}`)
  }
  const globals = { console, fetch, AbortController, crypto: { randomUUID: () => `synthetic-${++serial}` }, window: browser,
    document: browser, setTimeout: () => 0, clearTimeout() {},
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) } }
  function load(name) {
    if (name === 'vue') return life
    if (name === 'vue-router') return { useRoute: () => route, useRouter: () => ({ replace: async target => {
      navigations.push({ target, token: auth.token })
      if (target.query) route.query = target.query
    }, push() {} }) }
    if (name === '@/stores/auth') return { useAuthStore: () => auth }
    if (name === '@/api/ai') return { aiApi: { chat: async (...args) => { legacy.push(['chat', ...args]); return options.legacyChat ? options.legacyChat() : { reply: 'legacy reply', source: 'llm' } }, image: async () => { legacy.push(['image']); return 'image' } } }
    if (name === '@/api/compliance') return { complianceApi: { consentStatus: async () => { metadata.push('consent'); return true }, requestConsent: async () => ({ granted: true }) } }
    if (name === '@/api/learner') return { learnerApi: { state: async () => { metadata.push('learner'); return { exists: true, round_index: 99 } } } }
    if (name === '@/composables/useModalA11y') return { useModalA11y() {} }
    if (name === '@/composables/useDeviceCapability') return { capability: { tier: 'low' } }
    if (name.endsWith('.vue')) return {}
    if (!name.startsWith('@/')) throw new Error(`Unexpected import: ${name}`)
    const filename = path.join(root, name.slice(2) + '.ts')
    if (cache.has(filename)) return cache.get(filename)
    const exports = {}; cache.set(filename, exports)
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
    vm.runInNewContext(js, { ...globals, require: load, exports }, { filename })
    return exports
  }
  const setup = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const names = 'route,role,pendingRole,msgs,text,busy,nexts,consent,learner,room,locked,ROUND_GOAL,liveMsg,rail,railTab,lastSummary,roleHint,starters,menu,placeholder,pending,gateHint,PAIR_PERSONAS,personaForLegacyRole,fmt,phaseText,sourceLabel,send,drawImage,summarize,onRole,pick,toggleRail,setRailTab,rememberRoom,grant,canvasEl,gatePanel'
  const expose = `\nglobalThis.page={${names},trusted:typeof trusted==='undefined'?undefined:trusted,isLegacy:typeof isLegacy==='undefined'?undefined:isLegacy,canSend:typeof canSend==='undefined'?undefined:canSend,chooseSession:typeof chooseSession==='undefined'?undefined:chooseSession,receiptLabel:typeof receiptLabel==='undefined'?undefined:receiptLabel,trustedPolicyText:typeof trustedPolicyText==='undefined'?undefined:trustedPolicyText,contextNotice:typeof contextNotice==='undefined'?undefined:contextNotice,errorEl:typeof errorEl==='undefined'?undefined:errorEl,recoverLogin:typeof recoverLogin==='undefined'?undefined:recoverLogin};`
  const js = ts.transpileModule(setup + expose, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  const sandbox = { ...globals, require: load, exports: {} }
  scope.run(() => vm.runInNewContext(js, sandbox, { filename: studioPath }))
  for (const f of mounts) await f()
  await tick()
  t.after(() => { for (const f of unmounts) f(); scope.stop() })
  const p = sandbox.page
  async function html() {
    const template = require('@vue/compiler-sfc').parse(source).descriptor.template.content
    const render = new Function('Vue', compile(template, { mode: 'function' }).code)(vue)
    const app = vue.createSSRApp({ setup: () => p, render })
    for (const name of ['PairDock','PairDuoIllustration','BaseIcon','InsightRail','TaskChip','MilestoneToast','GlassPanel']) app.component(name, { render: () => null })
    app.config.warnHandler = () => {}
    return (await renderToString(app)).replace(/<!--[\s\S]*?-->/g, '')
  }
  return { p, route, auth, calls, legacy, metadata, unmounts, navigations, html, api: () => load('@/api/pairSessions') }
}

test('strict Studio sends through trusted route only, without history, room or client code', async t => {
  const h = await fixture(t, { query: { room: 'DO_NOT_SEND' } })
  await h.p.send('  我的第一步是什么？  ')
  assert.equal(h.legacy.length, 0, 'strict page must never call legacy chat')
  const call = h.calls.find(c => c.url.endsWith('/chat'))
  assert.equal(call.url, '/api/pair/sessions/A/rounds/round-A/chat')
  assert.deepEqual(Object.keys(call.body).sort(), ['message','persona','request_id'])
  assert.equal(call.body.message, '我的第一步是什么？')
  assert.equal(call.body.persona, 'guide')
  assert.equal(h.p.msgs.value.at(-1).receipt.version_no, 3)
})
test('unknown configuration never guesses legacy and reload can recover', async t => {
  let fail = true
  const h = await fixture(t, { transport: c => c.url.endsWith('/capabilities') && fail ? response({}, 503) : undefined })
  await h.p.send('不能外呼')
  assert.equal(h.legacy.length, 0)
  assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 0)
  assert.match(await h.html(), /配置|读取/)
  fail = false; await h.p.trusted.reload(); await h.p.send('恢复后手动发送')
  assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 1)
})
test('legacy retains original Socratic, history, room and summary flow', async t => {
  const h = await fixture(t, { capabilities: { ...caps, mode: 'legacy', trusted_chat_enabled: false }, query: { room: 'old-room' } })
  await h.p.send('旧课堂问题')
  assert.equal(h.legacy[0][3].socratic, true)
  assert.equal(h.legacy[0][3].roomId, 'old-room')
  assert.ok(h.legacy[0][3].history.length)
  h.p.summarize(); await tick()
  assert.equal(h.p.lastSummary.value, 'legacy reply')
  assert.match(await h.html(), /第99轮/)
})
test('strict no-session entry loads own choices and selecting writes only locator', async t => {
  const h = await fixture(t, { query: { pairSession: undefined } })
  await h.p.send('未选不能发')
  assert.equal(h.legacy.length, 0)
  assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 0)
  assert.match(await h.html(), /任务A/)
  await h.p.chooseSession('A'); await tick()
  assert.equal(h.route.query.pairSession, 'A')
  await h.p.send('选完可以发')
  assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 1)
})
test('empty own-session list gives truthful teacher setup instruction', async t => {
  const h = await fixture(t, { query: { pairSession: undefined }, available: [] })
  assert.match(await h.html(), /还没有可用|请老师/)
  assert.doesNotMatch(await h.html(), /已通知/)
})
test('strict policy replaces old learner badges, lock titles, room and summary controls', async t => {
  const h = await fixture(t, { query: { room: 'SECRET_ROOM', socratic: '1', rail: 'summary' } })
  h.p.menu.value = true
  const html = await h.html()
  assert.doesNotMatch(html, /第99轮|两位伙伴均只提问|教师已锁定提问|SECRET_ROOM|总结这次学习|学习面板/)
  assert.match(html, /本会话规则/)
  assert.match(html, /未保存草稿/)
  assert.match(html, /不自动读取先前对话/)
  h.p.summarize(); await h.p.drawImage(); await tick()
  assert.equal(h.legacy.length, 0)
  assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 0)
})
test('session Socratic policy explicitly overrides selected IP', async t => {
  const h = await fixture(t, { session: session('A', { ai_policy: { scaffold: 1, socratic: true, policy_hash: 'h' } }) })
  assert.match(await h.html(), /只提问|提问引导/)
  assert.match(await h.html(), /本会话/)
})
test('open round is explicit, server permitted, and rereads authoritative session', async t => {
  let opened = false
  const h = await fixture(t, { transport: c => {
    if (c.url.endsWith('/rounds')) { opened = true; return response({ round_id: 'new-round', round_index: 3 }) }
    if (c.url.endsWith('/sessions/A')) return response(opened ? session('A', { rounds: [{ round_id: 'new-round', round_index: 3, ended_at: null }] }) : session('A', { rounds: [], actions: { can_chat: false, can_open_round: true, reason_code: 'ROUND_CLOSED' } }))
  } })
  await h.p.send('没有轮次不能发')
  assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 0)
  assert.match(await h.html(), /开始下一轮/)
  await h.p.trusted.openRound(); await h.p.send('新轮问题')
  assert.ok(h.calls.some(c => c.url.endsWith('/rounds/new-round/chat')))
})
for (const reason of ['SESSION_ENDED','SESSION_CLOSED','ATTEMPT_COMPLETED','CONSENT_REVOKED','SESSION_EXPIRED','POLICY_NOT_READY']) {
  test(`server action denial ${reason} prevents open and send`, async t => {
    const h = await fixture(t, { session: session('A', { actions: { can_chat: false, can_open_round: false, reason_code: reason } }) })
    await h.p.send('被禁用'); await h.p.trusted.openRound()
    assert.equal(h.calls.filter(c => c.method === 'POST').length, 0)
    assert.doesNotMatch(await h.html(), />开始下一轮</)
  })
}
for (const change of ['session', 'actor', 'aba', 'round', 'unmount']) {
  test(`late success cannot attach after ${change}`, async t => {
    const wait = deferred()
    const h = await fixture(t, { transport: c => c.url.endsWith('/chat') ? wait.promise : undefined })
    const work = h.p.send('旧请求')
    await tick()
    if (change === 'session') h.route.query.pairSession = 'B'
    if (change === 'actor') h.auth.user = { id: 'student-2' }
    if (change === 'aba') { h.route.query.pairSession = 'B'; h.route.query.pairSession = 'A' }
    if (change === 'round') h.p.trusted.session.value = session('A', { rounds: [{ round_id: 'round-new', round_index: 3, ended_at: null }] })
    if (change === 'unmount') h.unmounts.forEach(f => f())
    await tick()
    wait.resolve(response(reply('A','round-A', h.calls.find(c => c.body?.message)?.body)))
    await work
    assert.equal(h.p.msgs.value.some(m => m.who === 'ai'), false)
    assert.equal(h.p.lastSummary.value, '')
  })
}
test('old error and finally cannot clear a new pending request after A-B-A', async t => {
  const old = deferred(), current = deferred(); let n = 0
  const h = await fixture(t, { transport: c => c.url.endsWith('/chat') ? (++n === 1 ? old.promise : current.promise) : undefined })
  const first = h.p.send('旧'); await tick()
  h.route.query.pairSession = 'B'; h.route.query.pairSession = 'A'; await tick()
  h.p.text.value = '新草稿'
  const second = h.p.send('新'); await tick()
  old.reject(new Error('old network failure')); await first
  assert.equal(h.p.busy.value, true)
  assert.equal(h.p.trusted.error.value, null)
  assert.equal(h.p.msgs.value.length, 1)
  const last = h.calls.filter(c => c.url.endsWith('/chat')).at(-1)
  current.resolve(response(reply('A', 'round-A', last.body))); await second
  assert.equal(h.p.msgs.value.length, 2)
})
test('double-click sends once and keeps response persona/version frozen', async t => {
  const wait = deferred()
  const h = await fixture(t, { transport: c => c.url.endsWith('/chat') ? wait.promise : undefined })
  const one = h.p.send('原问题'); const two = h.p.send('原问题'); await tick()
  h.p.onRole('reviewer')
  const call = h.calls.find(c => c.url.endsWith('/chat'))
  wait.resolve(response(reply('A','round-A', call.body))); await Promise.all([one,two])
  assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 1)
  assert.equal(h.p.msgs.value.at(-1).mate, 'turtle')
  h.p.trusted.session.value.project_version_id = 999
  assert.match(h.p.receiptLabel(h.p.msgs.value.at(-1).receipt), /v3/)
})
for (const kind of ['capabilities','available','session']) {
  test(`late ${kind} read cannot replace newer actor or locator`, async t => {
    const old = deferred(); let held = false
    const h = await fixture(t, { query: { pairSession: kind === 'available' ? undefined : 'A' }, transport: c => {
      const match = kind === 'session' ? c.url.endsWith('/sessions/A') : c.url.endsWith('/' + kind)
      if (match && !held) { held = true; return old.promise }
    } })
    if (kind === 'session') h.route.query.pairSession = 'B'
    else h.auth.user = { id: 'student-2' }
    await tick()
    old.resolve(response(kind === 'capabilities' ? { ...caps, mode: 'legacy' } : kind === 'available' ? { sessions: [session('STALE')] } : session('STALE')))
    await tick()
    assert.equal(h.p.trusted.mode.value, 'trusted_required')
    assert.notEqual(h.p.trusted.session.value?.session_id, 'STALE')
    assert.ok(h.p.trusted.available.value.every(s => s.session_id !== 'STALE'))
  })
}
test('network ambiguity queries status once without silent resend or fake reply', async t => {
  const h = await fixture(t, { transport: c => {
    if (c.url.endsWith('/chat')) throw new Error('network')
    if (c.url.includes('/ai-requests/')) return response({ status: 'pending', request_id: c.url.split('/').at(-1), session_id: 'A', round_id: 'round-A' })
  } })
  await h.p.send('可能送达的问题'); await h.p.send('不能偷偷重试')
  assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 1)
  assert.equal(h.calls.filter(c => c.url.includes('/ai-requests/')).length, 1)
  assert.equal(h.p.msgs.value.some(m => m.who === 'ai'), false)
  assert.match(await h.html(), /未确认|处理中/)
})
for (const [status, code, expected] of [[401,'UNAUTHENTICATED',/登录/],[403,'ACCESS_DENIED',/权限|老师/],[403,'CONSENT_REQUIRED',/同意|授权/],[404,'NOT_FOUND',/不可访问|不存在/],[409,'POLICY_NOT_READY',/规则|配置/],[410,'SESSION_EXPIRED',/到期/],[423,'ASSESSMENT_ACTIVE',/测评/],[503,'UNAVAILABLE',/稍后|不可用/]]) {
  test(`HTTP ${status} ${code} gives actionable separate status, not AI answer`, async t => {
    const h = await fixture(t, { transport: c => c.url.endsWith('/chat') || (status === 503 && c.url.includes('/ai-requests/'))
      ? response({ detail: { code, message: 'DO_NOT_ECHO_PROVIDER' } }, status) : undefined })
    await h.p.send('被拒绝')
    assert.equal(h.p.msgs.value.some(m => m.who === 'ai'), false)
    const html = await h.html(); assert.match(html, expected); assert.doesNotMatch(html, /DO_NOT_ECHO_PROVIDER/)
  })
}
test('old string errors and fallback/guard sources remain identifiable', async t => {
  let step = 0
  const h = await fixture(t, { transport: c => {
    if (!c.url.endsWith('/chat')) return
    step++
    if (step === 1) return response({ detail: '学生不在本班或未收到本次任务' }, 403)
    if (step === 2) return response({ ...reply('A','round-A',c.body, { project_version_id: null, version_no: null, code_source: 'none' }), source: 'fallback' })
    return response({ reply: '固定安全提示', source: 'guard', receipt: null })
  } })
  await h.p.send('拒绝'); assert.notEqual(h.p.consent.value, false)
  await h.p.trusted.reload(); await h.p.send('回退')
  assert.match(await h.html(), /非模型回复|备用提示/)
  assert.match(await h.html(), /仅任务材料/)
  await h.p.send('安全求助'); assert.match(await h.html(), /安全规则提示/)
})
test('old legacy reply cannot enter a newly authenticated strict context', async t => {
  const old = deferred(); let strict = false
  const h = await fixture(t, { legacyChat: () => old.promise, transport: c => c.url.endsWith('/capabilities') ? response(strict ? caps : { ...caps, mode: 'legacy', trusted_chat_enabled: false }) : undefined })
  const work = h.p.send('旧课堂'); strict = true; h.auth.user = { id: 'student-2' }; await tick()
  old.resolve({ reply: 'STALE_LEGACY_REPLY', source: 'llm' }); await work
  assert.equal(h.p.msgs.value.length, 0)
})
test('malformed teaching response cannot publish body and checks uncertain receipt status', async t => {
  const h = await fixture(t, { transport: c => c.url.endsWith('/chat') ? { ok: true, status: 200, json: async () => { throw new Error('truncated network body') } } : undefined })
  await h.p.send('断线')
  assert.equal(h.calls.filter(c => c.url.includes('/ai-requests/')).length, 1)
  assert.equal(h.p.msgs.value.some(m => m.who === 'ai'), false)
})
for (const altered of [{ status: 'pending' }, { session_id: 'B' }, { round_id: 'other' }, { request_id: 'other' }]) {
  test(`mismatched/nonterminal receipt ${JSON.stringify(altered)} cannot publish teaching body`, async t => {
    const h = await fixture(t, { transport: c => c.url.endsWith('/chat') ? response(reply('A','round-A', c.body, altered)) : undefined })
    await h.p.send('问题'); assert.equal(h.p.msgs.value.some(m => m.who === 'ai'), false)
  })
}
test('network failure followed by released status never invents replayed body', async t => {
  const h = await fixture(t, { transport: c => {
    if (c.url.endsWith('/chat')) throw new Error('lost')
    if (c.url.includes('/ai-requests/')) return response({ status: 'released', request_id: c.url.split('/').at(-1), session_id: 'A', round_id: 'round-A' })
  } })
  await h.p.send('回复丢失')
  assert.match(await h.html(), /没有收到正文/)
  assert.equal(h.p.msgs.value.some(m => m.who === 'ai'), false)
  assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 1)
})
test('strict boot never reads legacy learner policy or imports URL code into its draft', async t => {
  const h = await fixture(t, { query: { ask: 'UNTRUSTED_URL_CODE' } })
  assert.deepEqual(h.metadata, [])
  assert.equal(h.p.text.value, '')
})
test('minimal available summaries render without fetching task bodies until selection', async t => {
  const h = await fixture(t, { query: { pairSession: undefined }, available: [{ session_id: 'A', task_snapshot: { title: '合成摘要' }, status: 'active', actions: { can_chat: false, can_open_round: true, reason_code: 'ROUND_CLOSED' } }] })
  assert.match(await h.html(), /合成摘要/)
  assert.equal(h.calls.some(c => c.url.endsWith('/sessions/A')), false)
})

test('explicit 401 recovery clears stale identity before login navigation', async t => {
  const h = await fixture(t, { transport: c => c.url.endsWith('/chat') ? response({ detail: { code: 'UNAUTHENTICATED' } }, 401) : undefined })
  await h.p.send('合成问题')
  assert.equal(h.auth.token, 'synthetic-token', 'a response alone must not silently log out an actor')
  assert.equal(typeof h.p.recoverLogin, 'function', 'the visible recovery action must clear the stale identity before navigation')
  await h.p.recoverLogin(); await tick()
  assert.equal(h.auth.token, '')
  assert.equal(h.auth.user, null)
  const navigation = h.navigations.at(-1)
  assert.equal(navigation.target.path, '/login')
  assert.equal(navigation.token, '', 'the public-route guard must not see the expired token')
})

test('late 401 and stale recovery action cannot log out a newly selected actor', async t => {
  const wait = deferred()
  const h = await fixture(t, { transport: c => c.url.endsWith('/chat') ? wait.promise : undefined })
  const work = h.p.send('旧账号问题'); await tick()
  h.auth.token = 'new-token'; h.auth.user = { id: 'student-2' }; await tick()
  wait.resolve(response({ detail: { code: 'UNAUTHENTICATED' } }, 401)); await work
  assert.equal(typeof h.p.recoverLogin, 'function')
  await h.p.recoverLogin()
  assert.equal(h.auth.token, 'new-token')
  assert.equal(h.auth.user.id, 'student-2')
  assert.equal(h.navigations.length, 0)
})

for (const code of ['RECEIPT_UNCONFIRMED', 'RESPONSE_PREPARATION_FAILED']) {
  test(`${code} queries status and keeps pending requests blocked without resending`, async t => {
    const h = await fixture(t, { transport: c => {
      if (c.url.endsWith('/chat')) return response({ detail: { code } }, 503)
      if (c.url.includes('/ai-requests/')) return response({ status: 'pending', request_id: c.url.split('/').at(-1), session_id: 'A', round_id: 'round-A' })
    } })
    await h.p.send('结果待核实'); await h.p.send('不能重复提交')
    assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 1)
    assert.equal(h.calls.filter(c => c.url.includes('/ai-requests/')).length, 1)
    assert.equal(h.p.trusted.canSend.value, false)
    assert.match(await h.html(), /查询本次状态/)
    assert.equal(h.p.msgs.value.some(m => m.who === 'ai'), false)
  })
}

test('receipt query failure preserves uncertainty until a terminal receipt is confirmed', async t => {
  let queryFails = true
  const h = await fixture(t, { transport: c => {
    if (c.url.endsWith('/chat')) return response({ detail: { code: 'RECEIPT_UNCONFIRMED' } }, 503)
    if (c.url.includes('/ai-requests/')) return queryFails ? response({}, 503)
      : response({ status: 'failed', request_id: c.url.split('/').at(-1), session_id: 'A', round_id: 'round-A' })
  } })
  await h.p.send('结果待核实')
  assert.equal(h.p.trusted.canSend.value, false)
  assert.ok(h.p.trusted.uncertain.value)
  queryFails = false; await h.p.trusted.checkRequestStatus()
  assert.equal(h.p.trusted.uncertain.value, null)
  assert.equal(h.p.trusted.canSend.value, true)
  assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 1)
})

test('status-query 401 offers login recovery before the uncertainty query action', async t => {
  const h = await fixture(t, { transport: c => {
    if (c.url.endsWith('/chat')) return response({ detail: { code: 'RECEIPT_UNCONFIRMED' } }, 503)
    if (c.url.includes('/ai-requests/')) return response({ detail: { code: 'UNAUTHENTICATED' } }, 401)
  } })
  await h.p.send('合成待确认问题')
  assert.ok(h.p.trusted.uncertain.value)
  assert.equal(h.p.trusted.error.value.status, 401)
  const html = await h.html()
  assert.match(html, />重新登录</)
  assert.doesNotMatch(html, />查询本次状态</)
  await h.p.recoverLogin(); await tick()
  assert.equal(h.auth.token, '')
  assert.equal(h.navigations.at(-1).target.path, '/login')
})

for (const failure of ['unknown-500', 'unknown-502', 'unknown-503', 'mismatched-200', 'null-200']) {
  test(`uncertain ${failure} response queries status before any new question`, async t => {
    const h = await fixture(t, { transport: c => {
      if (c.url.endsWith('/chat')) {
        if (failure.startsWith('unknown-')) return response({ detail: { code: 'UNKNOWN_FAILURE' } }, Number(failure.split('-')[1]))
        if (failure === 'null-200') return response(null)
        return response(reply('wrong-session', 'wrong-round', c.body))
      }
      if (c.url.includes('/ai-requests/')) return response({ status: 'pending', request_id: c.url.split('/').at(-1), session_id: 'A', round_id: 'round-A' })
    } })
    await h.p.send('确认前不能重发'); await h.p.send('不应发送')
    assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 1)
    assert.equal(h.calls.filter(c => c.url.includes('/ai-requests/')).length, 1)
    assert.equal(h.p.trusted.canSend.value, false)
    assert.ok(h.p.trusted.uncertain.value)
    assert.equal(h.p.msgs.value.some(m => m.who === 'ai'), false)
  })
}

test('an explicit HTTP 422 rejection does not become an uncertain sent request', async t => {
  const h = await fixture(t, { transport: c => c.url.endsWith('/chat') ? response({ detail: { code: 'INVALID_MESSAGE' } }, 422) : undefined })
  await h.p.send('合成被拒问题')
  assert.equal(h.p.trusted.uncertain.value, null)
  assert.equal(h.calls.filter(c => c.url.includes('/ai-requests/')).length, 0)
  assert.equal(h.p.trusted.canSend.value, true)
})

test('a strict chat error keeps its focused alert visible instead of scrolling back to the conversation bottom', async t => {
  const h = await fixture(t, { transport: c => c.url.endsWith('/chat') ? response({ detail: { code: 'ROUND_ENDED' } }, 409) : undefined })
  const canvas = { scrollTop: 700, scrollHeight: 1200 }
  let focused = 0, revealed = 0
  h.p.canvasEl.value = canvas
  h.p.errorEl.value = {
    focus(options) { focused++; if (!options?.preventScroll) canvas.scrollTop = 0 },
    scrollIntoView() { revealed++; canvas.scrollTop = 0 },
  }
  await h.p.send('合成长对话中的新问题'); await tick()
  assert.ok(focused > 0, 'the actionable error must receive keyboard focus')
  assert.equal(h.p.canvasEl.value.scrollTop, 0, 'the send finalizer must not scroll the focused alert away again')
  assert.ok(revealed > 0, 'the error must be explicitly revealed in the scrollable canvas')
})

test('a successful strict reply still scrolls to the new message', async t => {
  const h = await fixture(t)
  h.p.canvasEl.value = { scrollTop: 0, scrollHeight: 1200 }
  await h.p.send('合成正常问题'); await tick()
  assert.equal(h.p.canvasEl.value.scrollTop, 1200)
  assert.equal(h.p.msgs.value.at(-1).who, 'ai')
})

for (const reason of ['SESSION_ENDED', 'SESSION_CLOSED']) {
  test(`${reason} explains a teacher-arranged new session rather than a temporary service outage`, async t => {
    const h = await fixture(t, { session: session('A', { actions: { can_chat: false, can_open_round: false, reason_code: reason } }) })
    const html = await h.html()
    assert.match(html, /本会话已结束/)
    assert.match(html, /老师.*新会话/)
    assert.doesNotMatch(html, /辅导服务暂时不可用/)
    assert.equal(h.p.trusted.canSend.value, false)
  })
}

test('material review refusal directs teacher verification and a new saved version without displaying provider detail', async t => {
  const h = await fixture(t, { transport: c => c.url.endsWith('/chat')
    ? response({ detail: { code: 'CONTEXT_REVIEW_REQUIRED', message: 'PRIVATE_PROVIDER_DETAIL' } }, 409) : undefined })
  await h.p.send('合成材料问题')
  const html = await h.html()
  assert.match(html, /老师.*核实|老师.*检查/)
  assert.match(html, /保存新版本/)
  assert.doesNotMatch(html, /PRIVATE_PROVIDER_DETAIL|会话状态或请求发生冲突/)
  assert.equal(h.p.msgs.value.some(m => m.who === 'ai'), false)
  assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 1)
})

test('output constraint refusal withholds the answer and permits only a fresh explicit question', async t => {
  let sends = 0
  const h = await fixture(t, { transport: c => {
    if (!c.url.endsWith('/chat')) return
    if (++sends !== 1) return response(reply('A', 'round-A', c.body))
    return response({ detail: { code: 'OUTPUT_CONSTRAINT_FAILED', message: 'PRIVATE_PROVIDER_DETAIL',
      receipt: { status: 'failed', reason_code: 'OUTPUT_CONSTRAINT_FAILED', request_id: c.body.request_id, session_id: 'A', round_id: 'round-A' } } }, 422)
  } })
  await h.p.send('需要核验的合成问题'); await tick()
  assert.equal(h.p.trusted.error.value.code, 'OUTPUT_CONSTRAINT_FAILED')
  const html = await h.html()
  assert.match(html, /回复.*未展示|回复.*未显示/)
  assert.match(html, /手动.*提问/)
  assert.match(html, /老师.*帮助/)
  assert.doesNotMatch(h.p.trusted.error.value.message, /4000/)
  assert.doesNotMatch(html, /PRIVATE_PROVIDER_DETAIL/)
  assert.equal(h.p.msgs.value.some(m => m.who === 'ai'), false)
  assert.equal(h.p.trusted.canSend.value, true)
  assert.equal(sends, 1, 'output rejection must not trigger an automatic retry')
  await h.p.send('学生明确再问')
  assert.equal(sends, 2)
  assert.equal(h.p.msgs.value.filter(m => m.who === 'ai').length, 1)
})

test('uncertain delivery preserves the safe output-refusal reason from a matching failed receipt', async t => {
  const h = await fixture(t, { transport: c => {
    if (c.url.endsWith('/chat')) throw new Error('synthetic lost response')
    if (c.url.includes('/ai-requests/')) return response({ status: 'failed', reason_code: 'OUTPUT_CONSTRAINT_FAILED',
      request_id: c.url.split('/').at(-1), session_id: 'A', round_id: 'round-A', message: 'PRIVATE_PROVIDER_DETAIL' })
  } })
  await h.p.send('收到回执前先查询')
  assert.equal(h.p.trusted.error.value.code, 'OUTPUT_CONSTRAINT_FAILED')
  assert.equal(h.p.trusted.uncertain.value, null)
  assert.equal(h.p.trusted.canSend.value, true)
  const html = await h.html()
  assert.match(html, /回复.*未展示|回复.*未显示/)
  assert.doesNotMatch(h.p.trusted.error.value.message, /4000/)
  assert.doesNotMatch(html, /PRIVATE_PROVIDER_DETAIL/)
  assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 1)
  assert.equal(h.p.msgs.value.some(m => m.who === 'ai'), false)
})

test('a pending conflict followed by output refusal permits only a fresh explicit question', async t => {
  const wait = deferred()
  let sends = 0
  const h = await fixture(t, { transport: c => {
    if (c.url.endsWith('/chat')) {
      if (++sends !== 1) return response(reply('A', 'round-A', c.body))
      return response({ detail: { code: 'REQUEST_PENDING', receipt: { status: 'pending',
        request_id: c.body.request_id, session_id: 'A', round_id: 'round-A' } } }, 409)
    }
    if (c.url.includes('/ai-requests/')) return wait.promise
  } })
  const work = h.p.send('结果还在核验'); await tick()
  assert.equal(h.p.trusted.canSend.value, false)
  assert.ok(h.p.trusted.uncertain.value)
  await h.p.send('等待期间不能重复提交')
  assert.equal(sends, 1)
  const statusCall = h.calls.find(c => c.url.includes('/ai-requests/'))
  wait.resolve(response({ status: 'failed', reason_code: 'OUTPUT_CONSTRAINT_FAILED',
    request_id: statusCall.url.split('/').at(-1), session_id: 'A', round_id: 'round-A' }))
  await work; await tick()
  assert.equal(h.p.trusted.error.value.code, 'OUTPUT_CONSTRAINT_FAILED')
  assert.equal(h.p.trusted.uncertain.value, null)
  assert.equal(h.p.trusted.canSend.value, true, 'a confirmed output refusal must not retain an authorization block from pending')
  assert.equal(sends, 1, 'status resolution must not automatically send another question')
  assert.equal(h.p.msgs.value.some(m => m.who === 'ai'), false)
  assert.match(await h.html(), /手动.*提问/)
  await h.p.send('学生明确重新提问')
  assert.equal(sends, 2)
  assert.equal(h.p.msgs.value.filter(m => m.who === 'ai').length, 1)
})

test('a pending conflict followed by invalidation remains blocked even with an output-refusal reason', async t => {
  const h = await fixture(t, { transport: c => {
    if (c.url.endsWith('/chat')) return response({ detail: { code: 'REQUEST_PENDING', receipt: { status: 'pending',
      request_id: c.body.request_id, session_id: 'A', round_id: 'round-A' } } }, 409)
    if (c.url.includes('/ai-requests/')) return response({ status: 'invalidated', reason_code: 'OUTPUT_CONSTRAINT_FAILED',
      request_id: c.url.split('/').at(-1), session_id: 'A', round_id: 'round-A' })
  } })
  await h.p.send('核验期间会话失效')
  assert.equal(h.p.trusted.uncertain.value, null)
  assert.equal(h.p.trusted.canSend.value, false)
  assert.equal(h.p.trusted.error.value.code, 'REQUEST_FAILED')
  await h.p.send('失效后不应发送')
  assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 1)
  assert.equal(h.p.msgs.value.some(m => m.who === 'ai'), false)
})

for (const status of [401, 403]) {
  test(`a pending conflict followed by status-query ${status} cannot unlock sending`, async t => {
    const h = await fixture(t, { transport: c => {
      if (c.url.endsWith('/chat')) return response({ detail: { code: 'REQUEST_PENDING', receipt: { status: 'pending',
        request_id: c.body.request_id, session_id: 'A', round_id: 'round-A' } } }, 409)
      if (c.url.includes('/ai-requests/')) return response({ detail: { code: status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN' } }, status)
    } })
    await h.p.send('查询权限已变化')
    assert.equal(h.p.trusted.error.value.status, status)
    assert.ok(h.p.trusted.uncertain.value)
    assert.equal(h.p.trusted.canSend.value, false)
    await h.p.send('拒绝后不应发送')
    assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 1)
    assert.equal(h.p.msgs.value.some(m => m.who === 'ai'), false)
  })
}

test('unknown failed-receipt reasons are not interpolated into student-facing text', async t => {
  const h = await fixture(t, { transport: c => {
    if (c.url.endsWith('/chat')) throw new Error('synthetic lost response')
    if (c.url.includes('/ai-requests/')) return response({ status: 'failed', reason_code: 'PRIVATE_RAW_PROVIDER_REASON',
      request_id: c.url.split('/').at(-1), session_id: 'A', round_id: 'round-A', message: 'PRIVATE_PROVIDER_DETAIL' })
  } })
  await h.p.send('未知失败原因')
  assert.equal(h.p.trusted.error.value.code, 'REQUEST_FAILED')
  assert.doesNotMatch(await h.html(), /PRIVATE_RAW_PROVIDER_REASON|PRIVATE_PROVIDER_DETAIL/)
})

test('a late output-refusal status cannot appear after an actor switch', async t => {
  const wait = deferred()
  const h = await fixture(t, { transport: c => {
    if (c.url.endsWith('/chat')) throw new Error('synthetic lost response')
    if (c.url.includes('/ai-requests/')) return wait.promise
  } })
  const work = h.p.send('旧身份待确认问题'); await tick()
  const statusCall = h.calls.find(c => c.url.includes('/ai-requests/'))
  h.auth.token = 'second-token'; h.auth.user = { id: 'student-2' }; await tick()
  wait.resolve(response({ status: 'failed', reason_code: 'OUTPUT_CONSTRAINT_FAILED',
    request_id: statusCall.url.split('/').at(-1), session_id: 'A', round_id: 'round-A' }))
  await work
  assert.equal(h.p.trusted.error.value, null)
  assert.equal(h.p.msgs.value.length, 0)
  assert.equal(h.auth.token, 'second-token')
})
