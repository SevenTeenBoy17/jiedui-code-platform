const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const pinia = require('pinia')

const user = { id: 'synthetic-student', name: '试用学生', role: 'student' }
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function fixture(transport, cloud = true, saved = {}, browser, clock = { setTimeout, clearTimeout }) {
  pinia.setActivePinia(pinia.createPinia())
  const cache = new Map(), calls = [], storage = new Map(Object.entries(saved))
  const localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) }
  function load(name) {
    if (name === 'vue') return vue
    if (name === 'pinia') return pinia
    if (name === 'vue-router') return { createWebHistory: () => ({}), createRouter: () => ({ beforeEach(fn) { this.guard = fn } }) }
    if (name === '@/config/deployment') return { isCloudDeployment: cloud }
    if (cache.has(name)) return cache.get(name)
    const filename = path.join(__dirname, '../src', name.slice(2) + '.ts'), exports = {}
    cache.set(name, exports)
    const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
    vm.runInNewContext(js, { exports, require: load, localStorage, Headers, Response, TypeError, Error, Promise, Event, AbortController,
      setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
      window: browser,
      document: { title: '' },
      fetch: async (url, init) => { calls.push({ url, init }); return transport(url, init) },
      btoa: value => Buffer.from(value, 'binary').toString('base64'), unescape, encodeURIComponent,
      location: { pathname: '/student/home', search: '', replace: value => calls.push({ redirect: value }) },
    }, { filename })
    return exports
  }
  return { load, calls, storage, auth: () => load('@/stores/auth').useAuthStore() }
}

test('cloud login sends only email/password to cookie endpoint and trusts server role', async () => {
  const f = fixture(async () => response({ user: { ...user, role: 'teacher' } }))
  const result = await f.load('@/api/auth').authApi.login(' demo@example.invalid ', 'secret', 'student')
  assert.equal(f.calls[0].url, '/api/auth/login')
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { email: 'demo@example.invalid', password: 'secret' })
  assert.equal(f.calls[0].init.credentials, 'same-origin')
  assert.equal(result.user.role, 'teacher')
  assert.equal(result.token, '')
})

test('cloud transport failure never produces a local demonstration account', async () => {
  const f = fixture(async () => { throw new TypeError('network down') })
  await assert.rejects(f.load('@/api/auth').authApi.login('xiaoma', '123456', 'student'), /连接|网络|服务器/)
  assert.equal(f.calls.length, 1)
})

test('cloud session ignores forged legacy localStorage credentials', () => {
  const f = fixture(async () => response({ user }), true, { jiedui_token: 'forged', jiedui_user: JSON.stringify({ ...user, role: 'teacher' }) })
  const auth = f.auth()
  assert.equal(auth.isLoggedIn, false)
  assert.equal(auth.token, '')
  assert.equal(auth.user, null)
})

test('local login preserves existing backend endpoint and token storage', async () => {
  const f = fixture(async () => response({ user, token: 'local-token' }), false)
  const auth = f.auth()
  await auth.login('xiaoma', 'password', 'student')
  assert.equal(f.calls[0].url, '/api/auth/student/login')
  assert.equal(auth.isLoggedIn, true)
  assert.equal(f.storage.get('jiedui_token'), 'local-token')
})

test('cloud initialization waits for verified identity and shares one pending check', async () => {
  let release
  const f = fixture(() => new Promise(resolve => { release = resolve }))
  const auth = f.auth()
  assert.equal(typeof auth.initializeSession, 'function')
  const first = auth.initializeSession(), second = auth.initializeSession()
  assert.equal(auth.isLoggedIn, false)
  assert.equal(f.calls.length, 1)
  release(response({ user }))
  await Promise.all([first, second])
  assert.equal(auth.isLoggedIn, true)
  assert.equal(auth.user.id, 'synthetic-student')
  assert.equal(auth.token, '')
  assert.equal(f.storage.size, 0)
})

test('a failed identity check stays signed out with a useful retry message', async () => {
  const f = fixture(async () => response({ error: { code: 'SERVICE_UNAVAILABLE', message: '身份服务暂不可用' } }, 503))
  const auth = f.auth()
  assert.equal(typeof auth.initializeSession, 'function')
  await auth.initializeSession()
  assert.equal(auth.isLoggedIn, false)
  assert.match(auth.sessionError, /身份服务暂不可用/)
})

test('logout clears visible identity immediately but settles only after remote revocation', async () => {
  let release
  const f = fixture(async url => url.endsWith('/logout') ? new Promise(resolve => { release = resolve }) : response({ user }))
  const auth = f.auth()
  await auth.login('demo@example.invalid', 'password', 'student')
  const before = auth.sessionRevision
  let done = false
  const pending = auth.logout().then(() => { done = true })
  await Promise.resolve()
  assert.equal(auth.isLoggedIn, false)
  assert.ok(auth.sessionRevision > before)
  assert.equal(done, false)
  release(response({ ok: true, remoteRevoked: true }))
  await pending
  assert.equal(f.calls.at(-1).url, '/api/auth/logout')
})

test('uncertain remote logout stays signed out and does not report confirmed success', async () => {
  const f = fixture(async url => url.endsWith('/logout') ? response({ error: { code: 'LOGOUT_UNCONFIRMED', message: '退出未获服务端确认' } }, 503) : response({ user }))
  const auth = f.auth()
  await auth.login('demo@example.invalid', 'password', 'student')
  await assert.rejects(auth.logout(), /退出未获服务端确认/)
  assert.equal(auth.isLoggedIn, false)
  assert.match(auth.sessionError, /退出未获服务端确认/)
})

test('late session discovery cannot restore identity after logout', async () => {
  let release
  const f = fixture(async url => url.endsWith('/me') ? new Promise(resolve => { release = resolve }) : response({ ok: true, remoteRevoked: true }))
  const auth = f.auth()
  assert.equal(typeof auth.initializeSession, 'function')
  const checking = auth.initializeSession()
  await auth.logout()
  release(response({ user }))
  await checking
  assert.equal(auth.user, null)
})

test('cloud request rejects unsupported API and strips old bearer credentials', async () => {
  const f = fixture(async () => response({ error: { code: 'NOT_AVAILABLE', message: '功能尚未迁移' } }, 404))
  const { cloudRequest, CloudApiError } = f.load('@/api/cloud')
  await assert.rejects(cloudRequest('/api/classes', { headers: { Authorization: 'Bearer legacy-secret' } }), error => error instanceof CloudApiError && error.code === 'NOT_AVAILABLE' && error.status === 404)
  assert.equal(f.calls[0].init.headers.has('Authorization'), false)
  assert.equal(f.calls[0].init.cache, 'no-store')
})

test('cloud requests refuse external paths without sending anything', async () => {
  const f = fixture(async () => response({}))
  await assert.rejects(f.load('@/api/cloud').cloudRequest('https://elsewhere.invalid/api/me'), /本站/)
  assert.equal(f.calls.length, 0)
})

test('cancelled unsaved-work logout preserves identity and never contacts revocation', async () => {
  const browser = new EventTarget()
  browser.addEventListener('jiedui:before-cloud-logout', event => event.preventDefault())
  const f = fixture(async () => response({ user }), true, {}, browser)
  const auth = f.auth()
  await auth.login('demo@example.invalid', 'password', 'student')
  assert.equal(await auth.logout(), false)
  assert.equal(auth.isLoggedIn, true)
  assert.equal(f.calls.length, 1)
})

test('logout waits for a pending login cookie response before revoking that session', async () => {
  let release
  const f = fixture(async url => url.endsWith('/login') ? new Promise(resolve => { release = resolve }) : response({ ok: true, remoteRevoked: true }))
  const auth = f.auth()
  const login = auth.login('demo@example.invalid', 'password', 'student')
  const loginRejected = assert.rejects(login, /登录状态已变化/)
  const logout = auth.logout()
  assert.equal(auth.isLoggedIn, false)
  assert.equal(f.calls.length, 1)
  release(response({ user }))
  await Promise.all([loginRejected, logout])
  assert.equal(f.calls.at(-1).url, '/api/auth/logout')
  assert.equal(auth.user, null)
})

test('cloud generic requests expose unavailable features rather than a false empty fallback', async () => {
  const f = fixture(async () => response({ error: { code: 'NOT_AVAILABLE', message: '功能尚未迁移' } }, 404))
  await assert.rejects(f.load('@/api/http').requestOr('/api/classes', []), /尚未迁移/)
})

test('cloud expiry clears identity but preserves the current editor document without hard navigation', async () => {
  const f = fixture(async url => url.endsWith('/login') ? response({ user }) : response({ error: { code: 'UNAUTHORIZED', message: '登录过期' } }, 401))
  const auth = f.auth()
  await auth.login('demo@example.invalid', 'password', 'student')
  await assert.rejects(f.load('@/api/http').request('/api/classes'), /登录过期/)
  assert.equal(auth.user, null)
  assert.equal(f.calls.some(call => call.redirect), false)
  assert.equal(f.calls.length, 2)
})

test('route authorization waits for the cookie identity before entering the original teacher page', async () => {
  let release
  const f = fixture(() => new Promise(resolve => { release = resolve }))
  const router = f.load('@/router/index').default
  let settled = false
  const decision = Promise.resolve(router.guard({ meta: { role: 'teacher', title: '今日' } })).then(value => { settled = true; return value })
  await Promise.resolve()
  assert.equal(settled, false)
  release(response({ user: { ...user, role: 'teacher' } }))
  assert.equal(await decision, true)
})

test('student cannot enter a teacher route even after selecting teacher on the login form', async () => {
  const f = fixture(async () => response({ user }))
  await f.auth().login('demo@example.invalid', 'password', 'teacher')
  const result = await f.load('@/router/index').default.guard({ meta: { role: 'teacher' } })
  assert.equal(result, '/student')
})

test('an old unauthorized response cannot sign out a newly authenticated session', async () => {
  let release
  const f = fixture(async url => url.endsWith('/login') ? response({ user }) : new Promise(resolve => { release = resolve }))
  const auth = f.auth()
  await auth.login('demo@example.invalid', 'password', 'student')
  const pending = f.load('@/api/http').request('/api/classes')
  const rejected = assert.rejects(pending, /旧会话已失效/)
  auth.clearSession()
  await auth.login('demo@example.invalid', 'password', 'student')
  release(response({ error: { code: 'UNAUTHORIZED', message: '旧会话已失效' } }, 401))
  await rejected
  assert.equal(auth.isLoggedIn, true)
})

test('hanging identity request has a bounded deadline and does not leave navigation waiting forever', async () => {
  let fire, cancelled = 0
  const clock = { setTimeout(fn, delay) { assert.equal(delay, 25000); fire = fn; return 1 }, clearTimeout() { cancelled++ } }
  const f = fixture(() => new Promise(() => {}), true, {}, undefined, clock)
  const auth = f.auth()
  const check = auth.initializeSession()
  assert.equal(typeof fire, 'function')
  fire()
  await check
  assert.equal(auth.isLoggedIn, false)
  assert.match(auth.sessionError, /超时/)
  assert.equal(f.calls[0].init.signal.aborted, true)
  assert.ok(cancelled > 0)
})

test('the cloud deadline includes a stalled response body, not just HTTP headers', async () => {
  let fire
  const clock = { setTimeout(fn) { fire = fn; return 1 }, clearTimeout() {} }
  const f = fixture(async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }), true, {}, undefined, clock)
  const pending = f.load('@/api/cloud').cloudRequest('/api/auth/me')
  const rejected = assert.rejects(pending, error => error.code === 'NETWORK_TIMEOUT' && error.status === 0)
  assert.equal(typeof fire, 'function')
  fire()
  await rejected
})

test('unconfirmed logout notifies the editor to release its temporary interaction lock', async () => {
  const browser = new EventTarget()
  let notified = 0
  browser.addEventListener('jiedui:cloud-logout-failed', () => notified++)
  const f = fixture(async () => response({ error: { code: 'LOGOUT_UNCONFIRMED', message: '退出未确认' } }, 503), true, {}, browser)
  await assert.rejects(f.auth().logout(), /退出未确认/)
  assert.equal(notified, 1)
})
