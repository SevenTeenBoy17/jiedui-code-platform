import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { profileByScope, growthStagesByScope, findEvidenceOriginal } from '../src/data/studentGrowth.ts'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const vue = require('vue')
function loadSource(relative: string, modules: Record<string, unknown>) {
  const file = fileURLToPath(new URL(relative, import.meta.url))
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  runInNewContext(code, { exports, require: (id: string) => { assert.ok(id in modules, `Unexpected import ${id}`); return modules[id] } })
  return exports as any
}

test('task claims never use another task and every referenced original resolves', () => {
  for (const [scope, profile] of Object.entries(profileByScope)) {
    for (const claim of profile.claims) for (const evidence of [...claim.supporting, ...claim.conflicting]) {
      assert.ok(findEvidenceOriginal(evidence.id, evidence.version), evidence.id)
      if (scope === 'task') assert.match(evidence.id, /^EVD-A03-/)
    }
    assert.equal(growthStagesByScope[scope as 'task' | 'unit'].length, 7)
  }
})

test('A/B share scope, claim and per-claim drafts without sending data', () => {
  const route = vue.reactive({ path: '/student/thinking/profile', query: { scope: 'task', claim: 'CLAIM-A03-MODEL-v1' } as Record<string, string | undefined> })
  let writes = 0
  const router = {
    replace: (next: any) => { route.path = next.path; route.query = next.query; writes++; return Promise.resolve() },
    resolve: (path: string) => { const url = new URL(path, 'http://localhost'); return { path: url.pathname, query: Object.fromEntries(url.searchParams) } },
  }
  const { useGrowthDisplay } = loadSource('../src/composables/useGrowthDisplay.ts', {
    vue, 'vue-router': { useRoute: () => route, useRouter: () => router },
    '@/data/studentGrowth': { profileByScope }, '@/stores/auth': { useAuthStore: () => ({ user: { id: 'qa-student' } }) },
  })
  const detail = useGrowthDisplay()
  assert.equal(detail.selectedClaim.value.id, 'CLAIM-A03-MODEL-v1') // Enter by a deep link, not a previous selection.
  detail.studentResponse.value = '本任务边界解释草稿'
  detail.recordResponse('correction')
  assert.match(detail.responseState.value, /尚未发送教师/)
  const simpleLink = detail.linkTo('/student/thinking')
  route.path = simpleLink.path; route.query = simpleLink.query
  const simple = useGrowthDisplay()
  assert.equal(simple.selectedClaim.value, detail.selectedClaim.value)
  assert.equal(simple.studentResponse.value, '本任务边界解释草稿')
  simple.scope.value = 'unit'
  assert.equal(simple.studentResponse.value, '')
  assert.equal(simple.linkTo('/student/thinking/profile').query.scope, 'unit')
  simple.scope.value = 'task'
  assert.equal(simple.selectedClaim.value.id, 'CLAIM-A03-MODEL-v1')
  assert.equal(simple.studentResponse.value, '本任务边界解释草稿')
  simple.selectClaim('CLAIM-A03-TEST-v1')
  assert.equal(simple.studentResponse.value, '')
  assert.equal(writes, 3) // Local router transitions only, no transport module.
})

test('GSAP normal preference runs; reduced preference stays static; disposal cleans up', async () => {
  for (const reduceMotion of [false, true]) {
    let enter: (() => void) | undefined, dispose: (() => void) | undefined
    let tweens = 0, reverts = 0
    const gsap = {
      matchMedia: () => ({
        revert: () => { reverts++ },
        add: (conditions: Record<string, string>, callback: any) => {
          // Match GSAP core's requirement: at least one condition must match.
          if (Object.values(conditions).includes('all') || reduceMotion) callback({ conditions: { reduceMotion } })
        },
      }),
      set: () => {},
      fromTo: (_element: unknown, _from: unknown, options: any) => {
        tweens++; assert.equal(options.duration, 0.2); assert.equal(options.clearProps, 'transform,opacity')
        return { kill: () => {} }
      },
    }
    const { useGrowthMotion } = loadSource('../src/composables/useGrowthMotion.ts', {
      vue: { nextTick: (fn: () => void) => Promise.resolve().then(fn), onMounted: (fn: () => void) => { enter = fn }, onScopeDispose: (fn: () => void) => { dispose = fn } },
      gsap: { gsap },
    })
    const motion = useGrowthMotion({ value: {} })
    assert.ok(enter); enter(); await Promise.resolve()
    assert.equal(tweens, reduceMotion ? 0 : 1)
    assert.ok(dispose); dispose()
    motion.transition(); await Promise.resolve()
    assert.equal(tweens, reduceMotion ? 0 : 1)
    assert.ok(reverts >= 2)
  }
})
