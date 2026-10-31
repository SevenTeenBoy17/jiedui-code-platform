// Contract/unit checks only: these do not establish browser layout or visual fidelity.
// Run this file without a name filter for the complete source + asset contract.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const vm = require('node:vm')
const zlib = require('node:zlib')
const ts = require('typescript')
const vue = require('vue')
const root = path.resolve(__dirname, '..')
const read = p => fs.readFileSync(path.join(root, p), 'utf8')
const personaSource = read('src/data/pairPersonas.ts')
const popupSource = read('src/components/pair/RoleCompanion.vue')
const normalize = s => s.replace(/\r\n/g, '\n')

function transpile(source, sandbox = {}) {
  const context = { exports: {}, require, ...sandbox }
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(js, context)
  return context.exports
}
const loadPersonas = () => transpile(personaSource)

// Exercise the actual script-setup logic with reactive route/context, not a browser.
// Lifecycle registration is disabled; DOM bounds and dispatch are explicit fixtures.
function companionHarness(routeFixture = {}, role = 'student') {
  const script = popupSource.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
  const route = vue.reactive({ path: '/student/home', fullPath: '/student/home', query: {}, ...routeFixture })
  const auth = vue.reactive({ isLoggedIn: true, role, user: { id: 'unit-student' } })
  const personas = loadPersonas()
  const navigations = [], events = []
  const viewport = { offsetTop: 0 }
  const exports = transpile(`${script}\nexport { actions, temperatureCoachAvailable, thought, thoughtReady, workbenchContext, confirmAdopt, saveReject, rejectReason, open, panelMaxHeight, triggerButton, updatePanelBounds, togglePanel, closePanel, selectedAction, temperatureExampleOpen };`, {
    require: name => {
      if (name === 'vue') return { ...vue, onMounted: () => {}, onUnmounted: () => {}, watch: () => {} }
      if (name === 'vue-router') return { useRoute: () => route, useRouter: () => ({ push: p => navigations.push(p) }) }
      if (name === '@/stores/auth') return { useAuthStore: () => auth }
      if (name === '@/data/pairPersonas') return personas
      if (name.endsWith('.vue')) return {}
      throw new Error(`Unexpected dependency in local-coaching harness: ${name}`)
    },
    window: { visualViewport: viewport, dispatchEvent: event => { events.push(event); return true } },
    document: { activeElement: null },
    getComputedStyle: () => ({ getPropertyValue: () => '10' }),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail } },
  })
  return { ...exports, route, auth, personas, navigations, events, viewport }
}

function readRgbaPng(relativePath) {
  const b = fs.readFileSync(path.join(root, relativePath))
  assert.deepEqual(b.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const width = b.readUInt32BE(16), height = b.readUInt32BE(20)
  assert.ok(width >= 1000 && height >= 1000, `${relativePath}: both dimensions must be >= 1000`)
  assert.equal(b[24], 8, `${relativePath}: expected 8-bit export`)
  assert.equal(b[25], 6, `${relativePath}: must be RGBA, not RGB with a baked checkerboard`)
  assert.equal(b[28], 0, `${relativePath}: expected non-interlaced PNG`)
  const chunks = []
  for (let offset = 8; offset < b.length;) {
    const length = b.readUInt32BE(offset)
    const name = b.toString('ascii', offset + 4, offset + 8)
    if (name === 'IDAT') chunks.push(b.subarray(offset + 8, offset + 8 + length))
    offset += 12 + length
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks))
  const stride = width * 4
  assert.equal(raw.length, height * (stride + 1))
  let previous = Buffer.alloc(stride), transparent = 0, visibleCoverage = 0, transparentEdges = 0
  function paeth(a, b, c) {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1), filter = raw[start], row = Buffer.alloc(stride)
    assert.ok(filter >= 0 && filter <= 4)
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? row[x - 4] : 0, above = previous[x], c = x >= 4 ? previous[x - 4] : 0
      const delta = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? above : filter === 3 ? Math.floor((a + above) / 2) : paeth(a, above, c)
      row[x] = (raw[start + 1 + x] + delta) & 255
    }
    for (let x = 0; x < width; x++) {
      const alpha = row[x * 4 + 3]
      if (alpha === 0) transparent++
      // Foreground may legitimately be alpha=253 after extraction. Integrating
      // alpha tests visible coverage instead of incorrectly requiring only 255.
      visibleCoverage += alpha / 255
      if ((x === 0 || x === width - 1 || y === 0 || y === height - 1) && alpha === 0) transparentEdges++
    }
    previous = row
  }
  assert.ok(transparent / (width * height) >= .05, `${relativePath}: requires actual transparent background pixels`)
  assert.ok(visibleCoverage / (width * height) >= .05, `${relativePath}: cannot be an empty transparent image`)
  assert.ok(transparentEdges / (2 * width + 2 * height - 4) >= .9, `${relativePath}: most border pixels should be transparent`)
}

test('contract: protected student avatar bytes, sidebar markup and navigation are unchanged', () => {
  const bytes = fs.readFileSync(path.join(root, 'public/generated/student-canvas/student-cat-avatar-v2.png'))
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), '8a14bbe17b518d48450ca5bd12673e02058c9072fe22a7fbc886db7128357ef1')
  const shell = read('src/layouts/StudentShell.vue')
  assert.match(shell, /const studentAvatar = '\/generated\/student-canvas\/student-cat-avatar-v2\.png'/)
  assert.match(shell, /:src="studentAvatar"/)
  assert.doesNotMatch(shell, /content:\s*url\([^\n]*student-cat/)
  const baseline = fs.readFileSync(path.join(root, '../.agent-supervisor/pair-ip-20260908/checkpoint/web/src/layouts/StudentShell.vue'), 'utf8')
  for (const region of [/<aside class="shell__sidebar"[\s\S]*?<\/aside>/, /const navigation:[\s\S]*?\n\]/]) {
    assert.equal(normalize(shell.match(region)[0]), normalize(baseline.match(region)[0]))
  }
})

test('contract: two IP identities retain distinct roles and three concrete coaching actions', () => {
  const { PAIR_PERSONAS: p, personaForLegacyRole } = loadPersonas()
  assert.equal(p.guide.name, '树小骥')
  assert.equal(p.guide.roleLabel, '导航员')
  assert.equal(p.review.name, '熊猫泡泡')
  assert.equal(p.review.roleLabel, '领航员')
  assert.equal(p.guide.image, '/generated/pair-ip-v1/horse-guide.png')
  assert.equal(p.review.image, '/generated/pair-ip-v2/panda-wave.png')
  assert.equal(personaForLegacyRole('turtle'), p.guide)
  assert.equal(personaForLegacyRole('reviewer'), p.review)
  assert.notEqual(p.guide.image, p.review.image)
  const guideIds = new Set(p.guide.actions.map(a => a.id))
  for (const action of p.review.actions) assert.ok(!guideIds.has(action.id))
  for (const persona of [p.guide, p.review]) {
    assert.equal(persona.actions.length, 3)
    for (const action of persona.actions) assert.ok(action.label.length > 0 && action.steps.length >= 2)
  }
})

test('contract: persona state synchronizes consumers without changing accounts or recording evidence', () => {
  const { usePairPersona } = loadPersonas()
  const popup = usePairPersona(), dock = usePairPersona()
  assert.equal(popup.personaId.value, 'guide')
  popup.selectPersona('review')
  assert.equal(dock.persona.value.name, '熊猫泡泡')
  dock.setRequestBusy(true)
  popup.selectPersona('guide')
  assert.equal(popup.personaId.value, 'review')
  dock.setRequestBusy(false)
  popup.selectPersona('guide')
  assert.equal(dock.persona.value.roleLabel, '导航员')
  assert.doesNotMatch(personaSource, /useAuthStore|localStorage|ctApi|fetch\(|dispatchEvent/)
})

test('contract: role popup opens on this page and restores keyboard focus on close', async () => {
  const h = companionHarness()
  let focused = 0
  h.triggerButton.value = { getBoundingClientRect: () => ({ top: 760 }), focus: () => focused++ }
  h.togglePanel()
  await vue.nextTick()
  assert.equal(h.open.value, true)
  assert.equal(h.navigations.length, 0)
  assert.equal(h.events.length, 0)
  h.closePanel(true)
  await vue.nextTick()
  assert.equal(h.open.value, false)
  assert.equal(focused, 1)
  for (const pattern of [/role="dialog"/, /:aria-pressed="personaId === option.id"/, /@click="togglePanel"/, /event.key !== 'Escape'/, /prefers-reduced-motion: reduce/, /本地引导/]) assert.match(popupSource, pattern)
  assert.doesNotMatch(popupSource, /aiApi|window\.open\(/)
})

test('contract: panel height derives from launcher bounds including short and shifted viewports', () => {
  const h = companionHarness()
  h.open.value = true
  for (const [top, offsetTop, expected] of [[760, 0, 690], [280, 0, 258], [280, 100, 158], [15, 0, 0]]) {
    h.triggerButton.value = { getBoundingClientRect: () => ({ top }) }
    h.viewport.offsetTop = offsetTop
    h.updatePanelBounds()
    assert.equal(h.panelMaxHeight.value, expected)
  }
  assert.match(popupSource, /:style="\{ maxHeight: `\$\{panelMaxHeight\}px` \}"/)
  assert.match(popupSource, /@media \(max-height: 520px\)/)
  assert.match(popupSource, /box-sizing: border-box/)
  assert.match(popupSource, /overflow: auto/)
  assert.match(popupSource, /visualViewport\?\.addEventListener\('resize', updatePanelBounds\)/)
})

test('contract: local actions are selected by student, teacher or assessment context', () => {
  for (const role of ['student', 'teacher']) {
    const h = companionHarness({}, role)
    for (const personaId of ['guide', 'review']) {
      h.personas.usePairPersona().selectPersona(personaId)
      assert.equal(h.actions.value.length, 3)
      const expected = role === 'teacher' ? /^teacher-/ : personaId === 'guide' ? /^(goal|io|steps)$/ : /^(edge|evidence|reflect)$/
      for (const action of h.actions.value) assert.match(action.id, expected)
    }
  }
  const research = companionHarness({ path: '/student/assess', query: { tab: 'research' } })
  for (const id of ['guide', 'review']) {
    research.personas.usePairPersona().selectPersona(id)
    assert.equal(research.actions.value.length, 3)
    for (const action of research.actions.value) assert.match(action.id, /^assessment-/)
    assert.equal(research.temperatureCoachAvailable.value, false)
  }
  assert.match(popupSource, /不读取试题、答案或未发布结果/)
})

test('contract: temperature example requires matching route, task, title, project and guide persona', () => {
  const h = companionHarness({ path: '/student/ide', query: { taskId: 'A-03' } })
  h.workbenchContext.value = { ...h.workbenchContext.value, taskId: 'A-03', taskTitle: '校园温度提醒器', projectId: 1 }
  assert.equal(h.temperatureCoachAvailable.value, true)
  h.route.query.taskId = 'OTHER'
  assert.equal(h.temperatureCoachAvailable.value, false)
  h.route.query.taskId = 'A-03'
  h.workbenchContext.value.taskTitle = '循环绘图'
  assert.equal(h.temperatureCoachAvailable.value, false)
  h.workbenchContext.value.taskTitle = '校园温度提醒器'
  h.workbenchContext.value.projectId = null
  assert.equal(h.temperatureCoachAvailable.value, false)
  h.workbenchContext.value.projectId = 1
  h.personas.usePairPersona().selectPersona('review')
  assert.equal(h.temperatureCoachAvailable.value, false)
  assert.equal(h.temperatureExampleOpen.value, false)
  const details = popupSource.match(/<details[^>]*class="temperature-example"[^>]*>/)[0]
  assert.doesNotMatch(details, /\s(?:open|:open)=|\sopen(?:\s|>)/)
})

test('contract: local example requires own explanation and emits bounded local draft decisions only', () => {
  const h = companionHarness({ path: '/student/ide', query: { taskId: 'A-03' } })
  h.workbenchContext.value = { ...h.workbenchContext.value, taskId: 'A-03', taskTitle: '校园温度提醒器', projectId: 1 }
  h.thought.value = '少于二十字'
  h.confirmAdopt()
  assert.equal(h.events.length, 0)
  h.thought.value = '我准备先检查输入类型，再检查边界条件，并用不同温度重新测试。'
  assert.equal(h.thoughtReady.value, true)
  h.confirmAdopt()
  assert.equal(h.events.length, 2)
  assert.equal(h.events[0].type, 'cx:pair-suggestion-adopt')
  assert.equal(h.events[0].detail.projectId, 1)
  assert.equal(h.events[0].detail.taskId, 'A-03')
  assert.equal(h.events[1].detail.type, 'adopted')
  h.rejectReason.value = ''
  h.saveReject()
  assert.equal(h.events.length, 2)
  h.rejectReason.value = '我已经在输入时检查了有效数字。'
  h.saveReject()
  assert.equal(h.events[2].detail.type, 'rejected')
  assert.doesNotMatch(popupSource, /ctApi|fetch\(/)
  assert.match(popupSource, /不代表已上传或学习效果/)
})

test('contract: Studio fixes reply persona, Socratic request and consent boundaries', () => {
  const studio = read('src/views/student/StudioView.vue')
  for (const pattern of [/const requestRole = role.value/, /aiApi.chat\(msg, requestRole/, /socratic: true, history/, /mate: requestRole/, /source: r.source/, /if \(r.socraticLocked\)/, /complianceApi.consentStatus\(\)/, /complianceApi.requestConsent\(\)/, /if \(r.granted\)/, /setRequestBusy\(false\)/]) assert.match(studio, pattern)
  assert.doesNotMatch(studio, /ctApi\.track\(['"]role_switch|ct_rank|小狐握键盘/)
  assert.match(studio, /透明青紫色科技护目镜、绿色竹叶领巾/)
  const dock = read('src/components/studio/PairDock.vue')
  assert.match(dock, /:disabled="requestBusy"/)
  assert.match(dock, /if \(requestBusy.value/)
})

test('contract: scene mappings retain separate transparent assets and eliminate obsolete public duo', () => {
  const duo = read('src/components/pair/PairDuoIllustration.vue')
  for (const key of ['ip_horse', 'ip_horse_plan', 'ip_horse_celebrate', 'ip_panda', 'ip_panda_check', 'ip_panda_thinking']) assert.ok(duo.includes(`'${key}'`))
  assert.match(duo, /object-fit: contain/)
  assert.match(duo, /role="img" :aria-label="label"/)
  for (const file of ['src/views/Login.vue', 'src/views/student/WorkbenchView.vue', 'src/views/student/StudioView.vue']) {
    assert.match(read(file), /<PairDuoIllustration/)
    assert.doesNotMatch(read(file), /duo-workspace\.png/)
  }
  const assets = read('src/assets/assets.ts')
  assert.match(assets, /pair-ip-v2\/panda-wave\.png/)
  assert.doesNotMatch(assets, /pair-ip-v1\/panda-review\.png/)
  assert.match(read('src/data/assessmentDemo.ts'), /pair-ip-v2\/panda-check\.png/)
})

test('contract: celebration concept stays out of runtime and uses the verified transparent welcome fallback', () => {
  const assets = read('src/assets/assets.ts')
  assert.match(assets, /const ipHorseCelebrate = '\/generated\/pair-ip-v2\/horse-welcome\.png'/)
  assert.match(assets, /ip_horse_celebrate: ipHorseCelebrate/)
  assert.doesNotMatch(assets, /horse-celebrate-concept/)
  function inspect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) inspect(target)
      else if (/\.(?:vue|ts|js|css)$/.test(entry.name)) {
        assert.doesNotMatch(fs.readFileSync(target, 'utf8'), /horse-celebrate-concept\.png/, `${target}: opaque concept must not render in the product`)
      }
    }
  }
  inspect(path.join(root, 'src'))
})

test('contract: process counts do not render ability ranks in the changed insight rail', () => {
  const rail = read('src/components/studio/InsightRail.vue')
  assert.doesNotMatch(rail, /ct\.ct_rank|ct\.dimensions|ct_rank|v-for=".*ct\.(?:score|rank)/)
  assert.match(rail, /次数只描述过程，不能当作计算思维分数/)
  assert.match(rail, /加载失败/)
})

test('asset: shipped horse and five version-two poses are high-resolution, genuinely transparent PNGs', () => {
  // The opaque celebration concept is not a runtime asset. Its scene deliberately
  // uses horse-welcome; the same alpha and resolution thresholds apply unchanged.
  for (const asset of ['pair-ip-v1/horse-guide', 'pair-ip-v2/panda-wave', 'pair-ip-v2/panda-check', 'pair-ip-v2/panda-thinking', 'pair-ip-v2/horse-plan', 'pair-ip-v2/horse-welcome']) {
    readRgbaPng(`public/generated/${asset}.png`)
  }
})
