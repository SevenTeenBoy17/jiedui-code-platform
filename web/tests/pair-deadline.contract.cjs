// Executes the real API and composable; only transport, clock and auth/lifecycle boundaries are controlled.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const root = path.resolve(__dirname, '../src')
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); await new Promise(setImmediate) }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value })
const request = { request_id: 'synthetic-request', message: '合成问题', persona: 'guide' }
function observe(promise) {
  const state = { done: false, value: undefined, error: undefined }
  promise.then(value => { state.value = value; state.done = true }, error => { state.error = error; state.done = true })
  return state
}
function clock() {
  let now = 0, serial = 0
  const jobs = new Map()
  return {
    setTimeout(fn, delay) { const id = ++serial; jobs.set(id, { at: now + delay, fn }); return id },
    clearTimeout(id) { jobs.delete(id) },
    get pending() { return jobs.size },
    async advance(ms) {
      const target = now + ms
      while (true) {
        const next = [...jobs.entries()].filter(([, job]) => job.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) break
        now = next[1].at; jobs.delete(next[0]); next[1].fn(); await flush()
      }
      now = target; await flush()
    },
  }
}
function fixture(t, transport) {
  const time = clock(), calls = [], cache = new Map(), cleanups = []
  const auth = vue.reactive({ token: 'synthetic-token', user: { id: 'synthetic-student' } })
  const life = { ...vue, onUnmounted: callback => cleanups.push(callback) }
  let serial = 0
  const fetch = async (url, init) => { const call = { url, init, body: init.body ? JSON.parse(init.body) : null }; calls.push(call); return transport(call) }
  function load(name) {
    if (name === '@/stores/auth') return { useAuthStore: () => auth }
    if (name === 'vue') return life
    if (cache.has(name)) return cache.get(name)
    const filename = path.join(root, name.slice(2) + '.ts'), exports = {}
    cache.set(name, exports)
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
    vm.runInNewContext(js, { require: load, exports, fetch, AbortController, setTimeout: time.setTimeout, clearTimeout: time.clearTimeout,
      crypto: { randomUUID: () => `synthetic-${++serial}` } }, { filename })
    return exports
  }
  const apiModule = load('@/api/pairSessions')
  function context() {
    const selected = vue.ref('A'), scope = vue.effectScope()
    const state = scope.run(() => load('@/composables/useTrustedPairContext').useTrustedPairContext({
      actor: () => auth.user.id, token: () => auth.token, sessionId: () => selected.value, onContextChange() {},
    }))
    t.after(() => { cleanups.forEach(fn => fn()); scope.stop() })
    return { state, selected }
  }
  return { api: apiModule.pairSessionsApi, ApiError: apiModule.PairApiError, errorText: apiModule.pairErrorText, time, calls, auth, context }
}
const caps = { mode: 'trusted_required', trusted_chat_enabled: true, trusted_image_enabled: false, history_mode: 'current_question_only' }
function session(id) {
  return { session_id: id, task_snapshot: { title: '合成任务' }, human_role: 'driver', status: 'active', project_id: 1,
    ai_policy: { scaffold: 1, socratic: false, policy_hash: 'synthetic-policy' }, actions: { can_chat: true, can_open_round: false, reason_code: null },
    rounds: [{ round_id: `round-${id}`, ended_at: null }] }
}
function metadata(call) {
  if (call.url.endsWith('/capabilities')) return response(caps)
  const match = call.url.match(/\/sessions\/([AB])$/)
  if (match) return response(session(match[1]))
  throw new Error(`Unexpected synthetic route ${call.url}`)
}
function success(call) {
  const match = call.url.match(/\/sessions\/([^/]+)\/rounds\/([^/]+)\/chat$/)
  return { reply: '合成结果', source: 'fallback', receipt: { status: 'released', request_id: call.body.request_id, session_id: match[1], round_id: match[2] } }
}

test('chat expires at 90 seconds even when the transport never settles, without another POST', async t => {
  const h = fixture(t, () => new Promise(() => {})), out = observe(h.api.chat('A', 'round-A', request))
  await h.time.advance(89999); assert.equal(out.done, false)
  await h.time.advance(1)
  assert.equal(out.done, true, 'a hanging chat must stop waiting at its deadline')
  assert.equal(out.error.status, 0); assert.equal(out.error.code, 'REQUEST_TIMEOUT')
  assert.equal(h.errorText(out.error), '等待时间较长，结果暂未确认。请按页面提示查询状态或重新读取；不会自动重发。')
  assert.equal(h.calls[0].init.signal.aborted, true); assert.equal(h.calls.length, 1); assert.equal(h.time.pending, 0)
})

for (const [name, invoke] of [
  ['capabilities', api => api.getCapabilities()], ['available sessions', api => api.getAvailableSessions()],
  ['selected session', api => api.getSession('A')], ['open round', api => api.openRound('A', 'synthetic-open')],
  ['receipt query', api => api.getRequestStatus('A', 'synthetic-request')],
]) test(`${name} expires at 15 seconds without replay`, async t => {
  const h = fixture(t, () => new Promise(() => {})), out = observe(invoke(h.api))
  await h.time.advance(14999); assert.equal(out.done, false)
  await h.time.advance(1); assert.equal(out.done, true, `${name} cannot remain pending indefinitely`)
  assert.equal(out.error.status, 0); assert.equal(out.error.code, 'REQUEST_TIMEOUT')
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].init.signal.aborted, true); assert.equal(h.time.pending, 0)
})

test('chat deadline includes body reading and is not reset after late headers', async t => {
  const headers = deferred(), body = deferred(), h = fixture(t, () => headers.promise)
  const out = observe(h.api.chat('A', 'round-A', request))
  await h.time.advance(89000); headers.resolve({ ok: true, status: 200, json: () => body.promise }); await flush()
  await h.time.advance(999); assert.equal(out.done, false)
  await h.time.advance(1); assert.equal(out.done, true, 'partial bodies share the original request budget')
  assert.equal(out.error.status, 0); assert.equal(out.error.code, 'REQUEST_TIMEOUT'); assert.equal(h.time.pending, 0)
  body.resolve({ reply: 'late body must not replace timeout' }); await flush()
  assert.equal(out.value, undefined); assert.equal(h.calls.length, 1)
})

test('completed requests clean their deadline without later aborting their signal', async t => {
  const h = fixture(t, () => response({ session_id: 'A' }))
  assert.equal((await h.api.getSession('A')).session_id, 'A')
  assert.equal(h.time.pending, 0)
  await h.time.advance(100000)
  assert.equal(h.calls[0].init.signal?.aborted, false, 'successful requests must have a live, cleaned signal')
  assert.equal(h.calls.length, 1)
})

test('HTTP rejection preserves coded recovery and receipt but never exposes arbitrary detail', async t => {
  const receipt = { session_id: 'A', round_id: 'round-A', request_id: request.request_id, status: 'failed', reason_code: 'OUTPUT_CONSTRAINT_FAILED' }
  const h = fixture(t, () => response({ detail: { code: 'OUTPUT_CONSTRAINT_FAILED', message: 'SYNTHETIC_PRIVATE_PROVIDER_DETAIL', receipt } }, 422))
  await assert.rejects(h.api.chat('A', 'round-A', request), e => e instanceof h.ApiError && e.status === 422 && e.code === 'OUTPUT_CONSTRAINT_FAILED' && e.receipt.request_id === request.request_id && !h.errorText(e).includes('SYNTHETIC_PRIVATE'))
  assert.equal(h.time.pending, 0)
})

test('body decoding and network errors remain sanitized and clear their timers', async t => {
  for (const [transport, expected] of [
    [() => Promise.reject(new Error('SYNTHETIC_NETWORK_SECRET')), 'NETWORK_ERROR'],
    [() => ({ ok: true, status: 200, json: async () => { throw new Error('SYNTHETIC_BODY_SECRET') } }), 'INVALID_RESPONSE'],
  ]) {
    const h = fixture(t, transport)
    await assert.rejects(h.api.getSession('A'), e => e.status === 0 && e.code === expected && !e.message.includes('SECRET'))
    assert.equal(h.time.pending, 0)
  }
})

test('one receipt timeout does not abort a simultaneous chat', async t => {
  const chat = deferred(), h = fixture(t, call => call.url.endsWith('/chat') ? chat.promise : new Promise(() => {}))
  const chatOut = observe(h.api.chat('A', 'round-A', request)), queryOut = observe(h.api.getRequestStatus('A', 'other-request'))
  await h.time.advance(15000)
  assert.equal(queryOut.done, true); assert.equal(queryOut.error.status, 0); assert.equal(chatOut.done, false)
  assert.equal(h.calls[0].init.signal.aborted, false); assert.equal(h.calls[1].init.signal.aborted, true)
  chat.resolve(response(success(h.calls[0]))); await flush()
  assert.equal(chatOut.value.receipt.status, 'released'); assert.equal(h.time.pending, 0)
})

test('chat timeout enters the real composable pending query path and permits only a fresh explicit question after failure', async t => {
  let terminal = false
  const h = fixture(t, call => {
    if (call.url.endsWith('/chat')) return new Promise(() => {})
    if (call.url.includes('/ai-requests/')) return response({ session_id: 'A', round_id: 'round-A', request_id: 'synthetic-1',
      status: terminal ? 'failed' : 'pending', ...(terminal ? { reason_code: 'OUTPUT_CONSTRAINT_FAILED' } : {}) })
    return metadata(call)
  })
  const { state } = h.context(); await flush(); assert.equal(state.canSend.value, true)
  const out = observe(state.send('合成问题', 'guide')); await flush(); await h.time.advance(90000)
  assert.equal(out.done, true); assert.equal(state.error.value.code, 'REQUEST_PENDING'); assert.equal(state.canSend.value, false)
  assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 1); assert.equal(h.calls.filter(c => c.url.includes('/ai-requests/')).length, 1)
  await state.send('不得重复发送', 'guide'); assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 1)
  terminal = true; await state.checkRequestStatus()
  assert.equal(state.error.value.code, 'OUTPUT_CONSTRAINT_FAILED'); assert.equal(state.uncertain.value, null); assert.equal(state.canSend.value, true)
  assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 1); assert.equal(h.time.pending, 0)
})

test('a timed-out status lookup clears busy state but keeps uncertainty and never reposts', async t => {
  const h = fixture(t, call => call.url.endsWith('/chat') || call.url.includes('/ai-requests/') ? new Promise(() => {}) : metadata(call))
  const { state } = h.context(); await flush()
  const out = observe(state.send('合成问题', 'guide')); await h.time.advance(90000)
  assert.equal(state.checkingStatus.value, true)
  await h.time.advance(15000)
  assert.equal(out.done, true); assert.equal(state.busy.value, false); assert.equal(state.checkingStatus.value, false)
  assert.equal(state.uncertain.value.requestId, 'synthetic-1'); assert.equal(state.canSend.value, false); assert.equal(state.error.value.status, 0)
  assert.equal(h.calls.filter(c => c.url.endsWith('/chat')).length, 1); assert.equal(h.time.pending, 0)
})

test('an old-session deadline cannot query its receipt or clear a newer pending chat', async t => {
  const b = deferred(), h = fixture(t, call => call.url.endsWith('/chat') ? (call.url.includes('/sessions/A/') ? new Promise(() => {}) : b.promise) : metadata(call))
  const { state, selected } = h.context(); await flush()
  const old = observe(state.send('旧A问题', 'guide')); await h.time.advance(45000)
  selected.value = 'B'; await flush(); const current = observe(state.send('新B问题', 'review')); await flush()
  await h.time.advance(45000)
  assert.equal(old.done, true); assert.equal(current.done, false); assert.equal(state.busy.value, true); assert.equal(state.error.value, null)
  assert.equal(h.calls.filter(c => c.url.includes('/ai-requests/')).length, 0)
  const bCall = h.calls.find(c => c.url.includes('/sessions/B/') && c.url.endsWith('/chat'))
  b.resolve(response(success(bCall))); await flush()
  assert.equal(current.value.receipt.session_id, 'B'); assert.equal(state.busy.value, false); assert.equal(h.time.pending, 0)
})
