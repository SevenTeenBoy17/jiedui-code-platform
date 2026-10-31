import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/showcase/teacherFixtures.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  reportDiagnostics: true,
})
assert.equal(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0)
const { teacherFixture: fixture, resetTeacherFixtures: reset } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`)
const get = path => fixture(path, 'GET', {})
const mutate = (path, method, body = {}) => fixture(path, method, body)

test('all fifteen teacher page data groups provide complete synthetic responses', () => {
  reset()
  const paths = [
    '/api/teacher/home', '/api/teacher/live?class_id=1&window=900',
    '/api/resources/classes', '/api/resources/exercises?q=&language=&difficulty=0',
    '/api/resources/videos', '/api/resources/sets', '/api/resources/pushes', '/api/resources/cases',
    '/api/insights/class', '/api/insights/student/demo-student-1', '/api/insights/recommend/demo-student-1',
    '/api/ct/summary?user_id=demo-student-1', '/api/ct/report?user_id=demo-student-1',
    '/api/research/studies', '/api/research/studies/1', '/api/research/studies/1/probe',
    '/api/research/studies/1/report', '/api/research/studies/1/export?format=json', '/api/research/export?format=json',
    '/api/learner/state/demo-student-1', '/api/learner/interaction?student_id=demo-student-1',
    '/api/learner/rounds?room_id=demo-room-1', '/api/learner/cogload?student_id=demo-student-1',
    '/api/obs/windows?study_id=1&room_id=demo-room-1&round_index=1',
  ]
  for (const path of paths) {
    const response = get(path)
    assert.ok(response && typeof response === 'object', path)
    assert.doesNotThrow(() => JSON.stringify(response), path)
  }
  const home = get('/api/teacher/home')
  assert.equal(home.students.length, 3)
  assert.equal(home.kpis.students, 3)
  assert.equal(home.students[0].id, 'demo-student-1')
  assert.equal(home.students[0].name, '小禾（演示）')
  assert.equal(home.class_ct_n, 3)
  assert.equal(Object.keys(home.class_ct).length, 6)
  assert.ok(home.alerts[0].detail.includes('演示'))
  const classes = get('/api/resources/classes')
  for (const c of classes.items) {
    assert.equal(c.size, c.student_ids.length)
    for (const id of c.student_ids) assert.ok(classes.roster.some(s => s.id === id))
  }
  const study = get('/api/research/studies/1')
  assert.equal(study.n.exp + study.n.ctrl, classes.roster.length)
  assert.equal(study.pre_assessment_id, 1)
  assert.equal(study.fidelity.breaks.length, 0)
})

test('resource filtering and local writes match the existing page contracts', () => {
  reset()
  assert.equal(get('/api/resources/exercises?q=不存在的题目').items.length, 0)
  assert.equal(get('/api/resources/exercises?language=cpp').items.length, 1)
  assert.ok(get('/api/resources/exercises/1').statement.includes('演示'))
  assert.match(get('/api/resources/exercises/1').title, /校园温度提醒器/)
  assert.equal(get('/api/resources/exercises/1').cases.find(c => c.input === '30').expected, '室内活动')
  assert.match(get('/api/resources/exercises/2').title, /图书借阅天数/)
  assert.ok(get('/api/resources/sets/1').items.length)
  const { id } = mutate('/api/resources/classes', 'POST', JSON.stringify({ name: '临时班级' }))
  assert.equal(mutate(`/api/resources/classes/${id}/students`, 'PUT', { student_ids: ['demo-student-1', 'not-in-demo'] }).size, 1)
  mutate(`/api/resources/classes/${id}/group`, 'PUT', { group_kind: 'exp' })
  mutate(`/api/resources/classes/${id}/socratic`, 'PUT', { socratic: true })
  const created = get('/api/resources/classes').items.find(c => c.id === id)
  assert.ok(created.name.includes('演示'))
  assert.equal(created.group_kind, 'exp')
  assert.equal(created.socratic, true)
  mutate(`/api/resources/classes/${id}`, 'DELETE')
  assert.equal(get('/api/resources/classes').items.length, 2)
  const pushed = mutate('/api/resources/push', 'POST', { res_type: 'exercise', res_id: 2, class_ids: [1], student_ids: ['demo-student-1'], reason: '先预测' })
  assert.equal(pushed.targets, 2, 'recipient deduplication')
  const rec = get('/api/resources/pushes').items[0]
  assert.equal(rec.id, pushed.id)
  assert.equal(rec.done, 0)
  assert.match(rec.reason, /演示/)
  const exercise = mutate('/api/resources/exercises', 'POST', { title: '新题', summary: '说明', language: 'python' })
  assert.ok(get(`/api/resources/exercises/${exercise.id}`).title.includes('演示'))
  mutate(`/api/resources/exercises/${exercise.id}`, 'DELETE')
  assert.equal(get('/api/resources/exercises').items.length, 6)
  const video = mutate('/api/resources/videos', 'POST', { title: '新视频', url: 'https://example.invalid/private' })
  assert.equal(get('/api/resources/videos').items.find(v => v.id === video.id).url, '')
  const set = mutate('/api/resources/sets', 'POST', { title: '练习集' })
  assert.equal(mutate(`/api/resources/sets/${set.id}/items`, 'PUT', { items: [{ item_type: 'exercise', ref_id: 1, title: '演示练习', required: 1 }] }).count, 1)
  assert.equal(get(`/api/resources/sets/${set.id}`).item_count, 1)
  const item = mutate('/api/resources/cases', 'POST', { title: '课堂反思' })
  assert.deepEqual(get('/api/resources/cases').items.find(c => c.id === item.id).flow, [])
  mutate(`/api/resources/cases/${item.id}`, 'DELETE')
})

test('class filtering, live counts and returned values remain isolated', () => {
  reset()
  const home = get('/api/teacher/home?class_id=1')
  assert.equal(home.students.length, 2)
  const live = get('/api/teacher/live?class_id=1')
  assert.equal(live.seats.length, 2)
  assert.equal(Object.values(live.tally).reduce((a, b) => a + b, 0), live.seats.length)
  home.students[0].name = 'changed by caller'
  get('/api/resources/classes').items[0].student_ids.length = 0
  assert.equal(get('/api/teacher/home').students[0].name, '小禾（演示）')
  assert.equal(get('/api/resources/classes').items[0].size, 2)
  assert.equal(get('/api/resources/classes').items[0].student_ids.length, 2)
  assert.ok(live.now < 100000000000, 'timestamps must be seconds')
})

test('live responses retain the session clock until fixtures are reset', () => {
  const realNow = Date.now
  let clock = 1_800_000_000_000
  Date.now = () => clock
  try {
    reset()
    const first = get('/api/teacher/live')
    assert.equal(first.now, clock / 1000)
    clock += 3_600_000
    const later = get('/api/teacher/live')
    assert.deepEqual(later, first, 'polling must not move now away from fixed seat timestamps')
    for (const seat of later.seats) assert.equal(later.now - seat.last_at, seat.idle_sec)
    reset()
    assert.equal(get('/api/teacher/live').now, clock / 1000, 'reset creates a new shared time baseline')
  } finally {
    Date.now = realNow
    reset()
  }
})

test('profiles preserve actual evidence text and label all teaching judgments as demonstrations', () => {
  reset()
  const insight = get('/api/insights/student/demo-student-1')
  assert.match(insight.card.headline, /演示/)
  for (const text of [...insight.card.strengths, ...insight.card.weaknesses, ...insight.card.suggestions]) assert.match(text, /演示/)
  assert.ok(Object.keys(insight.evidence).length >= 4)
  assert.ok(Object.values(insight.evidence).some(value => value.includes('流程图')))
  assert.ok(Object.values(insight.evidence).some(value => value.includes('不能')))
  assert.ok(insight.timeline.every(item => item.detail.includes('演示')))
  assert.equal(get('/api/ct/report?user_id=demo-student-1').has_real_data, false)
  assert.equal(get('/api/ct/summary?user_id=demo-student-1').has_real_data, false)
  const report = get('/api/research/studies/1/report')
  assert.match(report.plain.headline, /没有真实样本/)
  assert.equal(report.assess.cohens_d, null)
  assert.equal(report.assess.between_gain_diff, null)
  assert.equal(report.validity.pre.overall.r, null)
  assert.ok(report.caveats.every(c => c.includes('演示')))
  assert.ok(report.writeup.every(c => c.includes('演示')))
  assert.ok(report.process.exp.intervention.verify > 0)
  assert.equal(get('/api/learner/interaction?student_id=demo-student-1').chat_channel_available, false)
})

test('round, probe, study and observation interactions are local and resettable', () => {
  reset()
  const before = get('/api/learner/rounds?room_id=demo-room-1').items
  assert.equal(before[1].exited_at, null)
  mutate('/api/learner/rounds/2/exit', 'POST', { exit_task_passed: null })
  assert.equal(get('/api/learner/rounds?room_id=demo-room-1').items[1].exit_task_passed, null)
  const opened = mutate('/api/learner/rounds/open', 'POST', { room_id: 'demo-room-1', round_index: 3 })
  assert.equal(opened.round.round_index, 3)
  assert.equal(get(`/api/learner/rounds/${opened.id}/snapshot`).items.length, 3)
  mutate('/api/research/studies/1/probe/open', 'POST', { round_index: 3 })
  assert.equal(get('/api/research/studies/1/probe').items[2].status, 'open')
  mutate('/api/research/studies/1/posttest', 'POST')
  assert.equal(get('/api/research/studies/1').phase, 'posttest')
  mutate('/api/research/studies/1/close', 'POST')
  assert.equal(get('/api/research/studies/1').phase, 'closed')
  const observed = mutate('/api/obs/window', 'POST', {
    study_id: '1', room_id: 'demo-room-1', round_index: 2, layer: 'focus', tech_status: '正常',
    items: [{ pair_id: '02', window_seq: 1, kb: 'unclear', src_a: 1, src_p: 1, src_s: 0, src_unclear: 1, n_code: 'none', evt_note: '' }],
  })
  assert.equal(observed.count, 1)
  const row = get('/api/obs/windows?study_id=1&room_id=demo-room-1&round_index=2').items[0]
  assert.equal(row.observed_to - row.observed_from, 480)
  assert.equal(row.observer_id, 'demo-teacher-1')
  assert.equal(row.src_a, null)
  assert.equal(row.src_p, null)
  assert.equal(row.src_s, null)
  reset()
  assert.equal(get('/api/research/studies/1').phase, 'running')
  assert.equal(get('/api/obs/windows').items.length, 1)
  assert.equal(get('/api/learner/rounds').items.length, 2)
})

test('unknown and student-owned routes fall through without network or storage access', () => {
  reset()
  for (const path of ['/api/unknown', '/api/resources/my/pushes', '/api/research/my/assessments', '/api/insights/my/recommend', '/api/ct/summary', '/api/auth/me']) assert.equal(get(path), undefined, path)
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|document\./)
  mutate('/api/teacher/data/demo-student-1', 'DELETE')
  assert.equal(get('/api/teacher/home').students.length, 2)
  reset()
  assert.equal(get('/api/teacher/home').students.length, 3)
})
