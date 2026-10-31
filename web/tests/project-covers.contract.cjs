const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const folder = path.join(root, 'src/components/student/my-data')
const source = fs.readFileSync(path.join(folder, 'covers.ts'), 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const sandbox = { exports: {}, Math }
vm.runInNewContext(output, sandbox)
const { normalizeCoverLanguage, projectCoverFor } = sandbox.exports

test('language aliases map to the right artwork, never guess unknown language', () => {
  for (const input of ['python', 'Python', ' PY ', 'py']) assert.equal(normalizeCoverLanguage(input), 'python')
  for (const input of ['cpp', 'C++', ' CPP ']) assert.equal(normalizeCoverLanguage(input), 'cpp')
  assert.equal(normalizeCoverLanguage(' C '), 'c')
  for (const input of ['blocks', 'scratch', 'javascript', '', 'unknown']) {
    assert.equal(normalizeCoverLanguage(input), null)
    assert.equal(projectCoverFor({ id: 1, language: input }), null)
  }
})

test('C artwork varies by stable identity, not gallery ordering or version', () => {
  const projects = [{ id: 2, language: 'c' }, { id: 3, language: 'c' }]
  const covers = projects.map(projectCoverFor)
  assert.notEqual(covers[0], covers[1])
  assert.deepEqual([...projects].reverse().map(projectCoverFor).reverse(), covers)
  assert.equal(projectCoverFor({ id: '2', language: 'C' }), covers[0])
  assert.equal(projectCoverFor({ ...projects[0], version: 20, title: 'renamed' }), covers[0])
  // Actual gallery regression: IDs 2 and 4 previously collided on parity.
  assert.notEqual(projectCoverFor({ id: 2, language: 'c' }), projectCoverFor({ id: 4, language: 'c' }))
})

test('all four generated local PNGs exist and preserve a landscape aspect', () => {
  const names = ['python', 'cpp', 'c-build', 'c-flow']
  for (const name of names) {
    const bytes = fs.readFileSync(path.join(root, 'public/generated/project-covers-v1', name + '.png'))
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG')
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
    assert.ok(width >= 1280 && height >= 720, `${name} ${width}x${height}`)
    assert.ok(Math.abs(width / height - 16 / 9) < 0.01)
  }
})

test('cover reserves ratio and has image failure recovery, no cropped artwork', () => {
  const component = fs.readFileSync(path.join(folder, 'ProjectCover.vue'), 'utf8')
  assert.match(component, /aspect-ratio:16\/9/)
  assert.match(component, /object-fit:contain/)
  assert.match(component, /loading="lazy"/)
  assert.match(component, /decoding="async"/)
  assert.match(component, /@error="failed = true"/)
  assert.match(component, /watch\(source/)
  assert.match(component, /语言主题插画/)
})

test('overview retains selecting and opening originals, cover does not change outcomes', () => {
  const overview = fs.readFileSync(path.join(folder, 'DataOverview.vue'), 'utf8')
  assert.match(overview, /<ProjectCover :project="p"/)
  assert.match(overview, /@click="emit\('select',p\)"/)
  assert.match(overview, /@click="show\(p\)"/)
  assert.match(overview, /提交与测试状态未提供/)
  assert.match(overview, /封面为语言主题插画/)
  assert.doesNotMatch(overview, /project-gallery--live/)
  assert.doesNotMatch(source, /fetch\(|localStorage|Math\.random|submission_state\s*=/)
})
