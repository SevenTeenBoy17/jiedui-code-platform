import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { randomUUID } from 'node:crypto'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const plain = value => JSON.parse(JSON.stringify(value))
const project = (version = 2, code = 'print(2)') => ({
  id: 9, title: '温度提醒器', language: 'python', latest_version: version,
  latest: version ? { code, block_state: null, version_no: version } : null,
})
class CloudApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code }
}

// Execute authored TypeScript (including the shared cloud transport), replacing
// only the network boundary and signed-in identity.
// No source-string assertions: requests, results, drafts and race outcomes are tested.
function harness({ cloud = true, respond = async () => project() } = {}) {
  const auth = { token: 'local-token', user: { id: 'owner-a' }, sessionRevision: 1,
    clearSession() { this.user = null; this.token = ''; this.sessionRevision++ },
  }
  const calls = [], storage = new Map(), modules = {}
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  }
  async function fetch(path, init = {}) {
    const call = { path, ...init, payload: init.body ? JSON.parse(init.body) : undefined }
    calls.push(call)
    try {
      const value = await respond(call, calls.length)
      return { ok: true, status: 200, json: async () => value }
    } catch (error) {
      if (!(error instanceof CloudApiError)) throw error
      return { ok: false, status: error.status, json: async () => ({ error: { code: error.code, message: error.message } }) }
    }
  }
  function load(name) {
    if (modules[name]) return modules[name]
    const text = readFileSync(fileURLToPath(new URL(`../src/api/${name}.ts`, import.meta.url)), 'utf8')
    const output = ts.transpileModule(text, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const exports = {}
    modules[name] = exports
    runInNewContext(output, {
      exports, Error, TypeError, Date, JSON, Map, Promise, Headers,
      AbortController, setTimeout, clearTimeout,
      localStorage, fetch, crypto: { randomUUID },
      require(id) {
        if (id === '@/stores/auth') return { useAuthStore: () => auth }
        if (id === '@/config/deployment') return { isCloudDeployment: cloud }
        if (id === '@/api/cloud') return load('cloud')
        if (id === '@/api/cloudProjects' || id === './cloudProjects') return load('cloudProjects')
        throw new Error(`Unexpected dependency ${id}`)
      },
    }, { timeout: 2000 })
    return exports
  }
  return { ...load('projects'), auth, calls, storage }
}

test('cloud create includes an idempotency key and primes version zero', async () => {
  const h = harness({ respond: async call => call.path.endsWith('/versions')
    ? { versionNo: 1, changed: true } : project(0) })
  await h.projectsApi.create('温度提醒器', 'python')
  const result = await h.projectsApi.saveVersion(9, 'print(1)')
  assert.match(h.calls[0].payload.requestId, /^[0-9a-f-]{36}$/)
  assert.equal(h.calls[0].credentials, 'same-origin')
  assert.equal(h.calls[0].headers.has('Authorization'), false)
  assert.deepEqual(plain(h.calls[1].payload), {
    code: 'print(1)', blockState: null, expectedVersion: 0, requestId: h.calls[1].payload.requestId,
  })
  assert.deepEqual(plain(result), { versionNo: 1, changed: true })
})

test('cloud save carries loaded baseline; list refresh cannot silently rebase an editor', async () => {
  const h = harness({ respond: async call => call.path.endsWith('/versions')
    ? { versionNo: 3, changed: true } : call.path === '/api/projects' ? [project(7)] : project(2) })
  await h.projectsApi.get(9)
  await h.projectsApi.list()
  await h.projectsApi.saveVersion(9, 'print(3)', '{"blocks":[]}')
  assert.equal(h.calls[2].payload.expectedVersion, 2)
  assert.equal(h.calls[2].payload.blockState, '{"blocks":[]}')
})

test('save without opening a project refuses to attach a fresh remote version to an old draft', async () => {
  const h = harness()
  await assert.rejects(h.projectsApi.saveVersion(9, 'old draft'), error => error.code === 'RELOAD_REQUIRED')
  assert.equal(h.calls.length, 0)
})

test('ambiguous save retry uses the same request key and original version', async () => {
  let attempts = 0
  const h = harness({ respond: async call => {
    if (!call.path.endsWith('/versions')) return project()
    if (++attempts === 1) throw new CloudApiError(503, 'SERVICE_UNAVAILABLE', 'unknown commit')
    return { versionNo: 3, changed: true }
  } })
  await h.projectsApi.get(9)
  await assert.rejects(h.projectsApi.saveVersion(9, 'draft'))
  await h.projectsApi.saveVersion(9, 'draft')
  assert.match(h.calls[1].payload.requestId, /^[0-9a-f-]{36}$/)
  assert.equal(h.calls[1].payload.expectedVersion, 2)
  assert.deepEqual(plain(h.calls[1].payload), plain(h.calls[2].payload))
})

test('changed draft is not sent while an earlier save outcome is unknown', async () => {
  const h = harness({ respond: async call => {
    if (call.path.endsWith('/versions')) throw new TypeError('connection lost')
    return project()
  } })
  await h.projectsApi.get(9)
  await assert.rejects(h.projectsApi.saveVersion(9, 'first draft'))
  await assert.rejects(h.projectsApi.saveVersion(9, 'new draft'), error => error.code === 'SAVE_UNCONFIRMED')
  assert.equal(h.calls.length, 2)
})

test('409 is surfaced, repeat save stays blocked until an explicit reload', async () => {
  let saves = 0
  const h = harness({ respond: async call => {
    if (!call.path.endsWith('/versions')) return project(saves ? 4 : 2)
    if (++saves === 1) throw new CloudApiError(409, 'VERSION_CONFLICT', 'remote changed')
    return { versionNo: 5, changed: true }
  } })
  await h.projectsApi.get(9)
  await assert.rejects(h.projectsApi.saveVersion(9, 'draft'), error => error.code === 'VERSION_CONFLICT')
  await assert.rejects(h.projectsApi.saveVersion(9, 'draft 2'), error => error.code === 'VERSION_CONFLICT')
  assert.equal(saves, 1)
  await h.projectsApi.get(9)
  await h.projectsApi.saveVersion(9, 'resolved draft')
  assert.equal(h.calls.at(-1).payload.expectedVersion, 4)
})

test('duplicate in-flight save shares one mutation and changed content waits', async () => {
  const resolvers = []
  const h = harness({ respond: async call => call.path.endsWith('/versions')
    ? new Promise(resolve => { resolvers.push(resolve) }) : project() })
  await h.projectsApi.get(9)
  const first = h.projectsApi.saveVersion(9, 'draft')
  const duplicate = h.projectsApi.saveVersion(9, 'draft')
  const changed = h.projectsApi.saveVersion(9, 'changed')
  for (const resolve of resolvers) resolve({ versionNo: 3, changed: true })
  await assert.rejects(changed, error => error.code === 'SAVE_IN_PROGRESS')
  assert.equal(h.calls.length, 2)
  assert.deepEqual(plain(await first), plain(await duplicate))
})

test('account change rejects late read and cannot reuse previous owner baseline', async () => {
  let resolveRead
  const h = harness({ respond: async () => new Promise(resolve => { resolveRead = resolve }) })
  const reading = h.projectsApi.get(9)
  h.auth.user = { id: 'owner-b' }; h.auth.sessionRevision++
  resolveRead(project())
  await assert.rejects(reading, error => error.code === 'SESSION_CHANGED')
  await assert.rejects(h.projectsApi.saveVersion(9, 'owner b'), error => error.code === 'RELOAD_REQUIRED')
  assert.equal(h.calls.length, 1)
})

test('same-user re-login rejects late save result instead of marking new session saved', async () => {
  let resolveSave
  const h = harness({ respond: async call => call.path.endsWith('/versions')
    ? new Promise(resolve => { resolveSave = resolve }) : project() })
  await h.projectsApi.get(9)
  const saving = h.projectsApi.saveVersion(9, 'draft')
  h.auth.sessionRevision++
  resolveSave({ versionNo: 3, changed: true })
  await assert.rejects(saving, error => error.code === 'SESSION_CHANGED')
  await assert.rejects(h.projectsApi.saveVersion(9, 'another'), error => error.code === 'RELOAD_REQUIRED')
})

test('late old-session response cannot erase a newly loaded current-owner baseline', async () => {
  let resolveOld
  const h = harness({ respond: async (call, count) => count === 1
    ? new Promise(resolve => { resolveOld = resolve })
    : call.path.endsWith('/versions') ? { versionNo: 5, changed: true } : project(4) })
  const oldRead = h.projectsApi.get(9)
  h.auth.user = { id: 'owner-b' }; h.auth.sessionRevision++
  await h.projectsApi.get(9)
  resolveOld(project(2))
  await assert.rejects(oldRead, error => error.code === 'SESSION_CHANGED')
  await h.projectsApi.saveVersion(9, 'owner b draft')
  assert.equal(h.calls.at(-1).payload.expectedVersion, 4)
})

test('out-of-order reads cannot change the version baseline behind the displayed editor', async () => {
  const reads = []
  const h = harness({ respond: async call => call.path.endsWith('/versions')
    ? { versionNo: 3, changed: true } : new Promise(resolve => reads.push(resolve)) })
  const first = h.projectsApi.get(9)
  const second = h.projectsApi.get(9)
  reads[1](project(2, 'displayed version'))
  await second
  reads[0](project(3, 'remote update unseen by editor'))
  await assert.rejects(first, error => error.code === 'STALE_PROJECT_REQUEST')
  await h.projectsApi.saveVersion(9, 'editing displayed version')
  assert.equal(h.calls.at(-1).payload.expectedVersion, 2)
})

test('a read started before saving cannot erase the pending mutation or replace its baseline', async () => {
  let resolveRead
  const saves = []
  const h = harness({ respond: async (call, count) => count === 1 ? project(2)
    : call.path.endsWith('/versions') ? new Promise(resolve => { saves.push(resolve) })
      : new Promise(resolve => { resolveRead = resolve }) })
  await h.projectsApi.get(9)
  const reading = h.projectsApi.get(9)
  const saving = h.projectsApi.saveVersion(9, 'draft')
  resolveRead(project(3))
  const readOutcome = await reading.then(value => value, error => error)
  const duplicate = h.projectsApi.saveVersion(9, 'draft')
  for (const resolve of saves) resolve({ versionNo: 3, changed: true })
  assert.deepEqual(plain(await saving), plain(await duplicate))
  assert.equal(readOutcome.code, 'STALE_PROJECT_REQUEST')
  assert.equal(h.calls.length, 3)
})

test('ambiguous creation retries one request identity, never fabricates a project', async () => {
  const h = harness({ respond: async (_call, count) => {
    if (count === 1) throw new CloudApiError(503, 'SERVICE_UNAVAILABLE', 'not confirmed')
    return project(0)
  } })
  await assert.rejects(h.projectsApi.create('温度提醒器', 'python'))
  assert.deepEqual(plain(await h.projectsApi.create('温度提醒器', 'python')), project(0))
  assert.match(h.calls[0].payload.requestId, /^[0-9a-f-]{36}$/)
  assert.deepEqual(plain(h.calls[0].payload), plain(h.calls[1].payload))
})

test('malformed save response stays unconfirmed and a retry preserves its key', async () => {
  let saves = 0
  const h = harness({ respond: async call => !call.path.endsWith('/versions') ? project(2)
    : ++saves === 1 ? { versionNo: 99, changed: true } : { versionNo: 3, changed: true } })
  await h.projectsApi.get(9)
  await assert.rejects(h.projectsApi.saveVersion(9, 'draft'), error => error.code === 'INVALID_RESPONSE')
  await h.projectsApi.saveVersion(9, 'draft')
  assert.deepEqual(plain(h.calls[1].payload), plain(h.calls[2].payload))
})

test('cloud errors are not presented as an empty list and logged-out calls send nothing', async () => {
  const h = harness({ respond: async () => { throw new CloudApiError(403, 'NOT_INVITED', 'revoked') } })
  await assert.rejects(h.projectsApi.list(), error => error.code === 'NOT_INVITED')
  h.auth.user = null; h.auth.sessionRevision++
  await assert.rejects(h.projectsApi.list(), error => error.code === 'SESSION_EXPIRED')
  assert.equal(h.calls.length, 1)
})

test('expired project request clears stale identity but retains the owner draft', async () => {
  const h = harness({ respond: async () => { throw new CloudApiError(401, 'SESSION_EXPIRED', 'expired') } })
  h.saveLocalDraft({ projectId: 9, language: 'python', code: 'keep this draft' })
  await assert.rejects(h.projectsApi.list(), error => error.code === 'SESSION_EXPIRED')
  assert.equal(h.auth.user, null)
  assert.equal(h.auth.sessionRevision, 2)
  assert.ok([...h.storage.values()].some(value => value.includes('keep this draft')))
})

test('owner-scoped local drafts never leak through logout, another owner or legacy local storage', () => {
  const h = harness()
  h.storage.set('jiedui_local_draft', JSON.stringify({ projectId: 99, language: 'c', code: 'legacy' }))
  assert.equal(h.loadLocalDraft(), null)
  h.saveLocalDraft({ projectId: 9, language: 'python', code: 'private a' })
  h.auth.user = { id: 'owner-b' }; h.auth.sessionRevision++
  assert.equal(h.loadLocalDraft(), null)
  h.auth.user = null; h.auth.sessionRevision++
  assert.equal(h.loadLocalDraft(), null)
  h.saveLocalDraft({ projectId: 9, language: 'python', code: 'signed out' })
  h.auth.user = { id: 'owner-a' }; h.auth.sessionRevision++
  assert.equal(h.loadLocalDraft().code, 'private a')
})

test('cloud unsupported operations fail explicitly, without pretending persistence succeeded', async () => {
  const h = harness()
  for (const action of [
    () => h.projectsApi.remove(9), () => h.projectsApi.download(9, 'test'),
    () => h.projectsApi.getDesign(9), () => h.projectsApi.saveDesign(9, 'flow', '{}'),
    () => h.projectsApi.upload({ name: 'test.zip' }),
  ]) await assert.rejects(action(), error => error.code === 'NOT_AVAILABLE')
  assert.equal(h.calls.length, 0)
})

test('local deployment preserves bearer transport and legacy save payload', async () => {
  const h = harness({ cloud: false, respond: async () => ({ versionNo: 3, changed: false }) })
  assert.deepEqual(plain(await h.projectsApi.saveVersion(9, 'local')), { versionNo: 3, changed: false })
  assert.deepEqual(plain(h.calls[0].payload), { code: 'local' })
  assert.equal(h.calls[0].headers.Authorization, 'Bearer local-token')
  h.saveLocalDraft({ projectId: 9, language: 'python', code: 'local' })
  assert.equal(JSON.parse(h.storage.get('jiedui_local_draft')).code, 'local')
})
