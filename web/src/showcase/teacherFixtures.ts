/**
 * Teacher showcase responses. This module is imported only by the showcase entry.
 * Every record is synthetic; mutations live only in this module and reset on reload.
 * Assessment illustrations are authored independently of activity counts. They are
 * neither calculated CT scores nor evidence of a real student's learning outcome.
 */
import type { Exercise, Video, ExSet, Klass, TeachCase, PushRec } from '../api/resources'
import type { Study, StudyReport, ProbeRoundStat, Phase } from '../api/study'
import type { TeachRound } from '../api/learner'
import type { ObsWindowRow } from '../api/obs'

const DEMO_NOTE = '演示数据：全部为虚构示例，不代表真实学生、AI分析或教学研究结果。'
const STUDENT = 'demo-student-1'
const TEACHER = 'demo-teacher-1'
const ROOM = 'demo-room-1'
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const demoText = (value: unknown, fallback: string) => {
  const text = typeof value === 'string' && value.trim() ? value.trim() : fallback
  return text.includes('演示') ? text : `${text}（演示）`
}

// Fixed rubric illustrations, never derived from runs, errors, clicks, or time.
const DIM_EXAMPLES = [
  { decompose: 76, abstract: 62, model: 67, algorithm: 74, verify: 58, transfer: 52 },
  { decompose: 68, abstract: 73, model: 70, algorithm: 64, verify: 72, transfer: 61 },
  { decompose: 71, abstract: 65, model: 63, algorithm: 70, verify: 66, transfer: 57 },
]
const FOUR_DIMS = { '问题分解': 76, '抽象建模': 65, '算法设计': 74, '调试评估': 58 }
const CLASS_DIMS = { decompose: 72, abstract: 67, model: 67, algorithm: 69, verify: 65, transfer: 57 }

function initialState() {
  const now = Math.floor(Date.now() / 1000)
  const roster = [
    { id: STUDENT, name: '小禾（演示）' },
    { id: 'demo-student-2', name: '小川（演示）' },
    { id: 'demo-student-3', name: '小满（演示）' },
  ]
  const classes: Klass[] = [
    { id: 1, name: '七年级一班（演示）', grade: '七年级', note: '演示：循环与条件单元，结对提问班', student_ids: [STUDENT, 'demo-student-2'], size: 2, updated_at: now - 86400, socratic: true, group_kind: 'exp' },
    { id: 2, name: '七年级二班（演示）', grade: '七年级', note: '演示：相同单元，常规教学观察班', student_ids: ['demo-student-3'], size: 1, updated_at: now - 86400, socratic: false, group_kind: 'ctrl' },
  ]
  const exercises: Exercise[] = [
    { id: 1, title: '校园温度提醒器（演示）', summary: '演示：低于30℃建议户外活动，达到或超过30℃建议室内活动。', statement: '【演示练习】温度范围为0～45℃。先说明输入、判断规则与活动建议，再预测20、30、35℃的结果；超出范围时提示重新输入。请自行实现并留下测试依据。', language: 'python', difficulty: 2, tags: ['条件分支', '边界测试', '问题分解'], ct_dims: { decompose: 1, algorithm: 1 }, ct_primary: 'decompose', case_count: 5, hints: ['演示提示：先画出输入、判断、输出三步。', '演示提示：30℃应进入哪条分支？'], status: 'published', updated_at: now - 1800 },
    { id: 2, title: '图书借阅天数（演示）', summary: '演示：把边界检查迁移到7天借阅规则。', statement: '【演示练习】图书可以借阅7天。先预测借阅6、7、8天时的提醒，再运行核对，解释等于7天与超过7天的区别。', language: 'c', difficulty: 2, tags: ['边界测试', '验证'], ct_dims: { verify: 1 }, ct_primary: 'verify', case_count: 3, hints: ['演示提示：把预期结果写在运行之前。'], status: 'published', updated_at: now - 3600 },
    { id: 3, title: '小海龟画校园路线（演示）', summary: '演示：把一段路线抽象为可重复的动作。', statement: '【演示练习】观察校园中的重复路线，分解成前进与转向动作；解释哪些部分可以复用。', language: 'python', difficulty: 1, tags: ['图形', '抽象'], ct_dims: { abstract: 1, model: 1 }, ct_primary: 'abstract', case_count: 2, hints: ['演示提示：找出路线中重复的一小段。'], status: 'published', updated_at: now - 7200 },
    { id: 4, title: '从猜数字到查找书号（演示）', summary: '演示：说明哪些策略能迁移到新情境。', statement: '【演示练习】把缩小猜数范围的方法用于寻找有序书号。写明可迁移的步骤和需要重新判断的条件。', language: 'python', difficulty: 3, tags: ['迁移', '查找'], ct_dims: { transfer: 1, algorithm: 1 }, ct_primary: 'transfer', case_count: 4, hints: ['演示提示：新情境是否也存在顺序？'], status: 'published', updated_at: now - 10800 },
    { id: 5, title: '温度提醒器（演示）', summary: '演示：使用分支条件表达生活规则。', language: 'cpp', difficulty: 1, tags: ['条件'], ct_dims: { model: 1 }, ct_primary: 'model', case_count: 3, hints: ['演示提示：临界温度属于哪一边？'], status: 'published', updated_at: now - 14400 },
    { id: 6, title: '结对复核：说出你的修改理由（演示）', summary: '演示：驾驶员修改前，导航员先说明检查依据。', language: 'python', difficulty: 2, tags: ['结对', '反思'], ct_dims: { verify: 1, decompose: 1 }, ct_primary: 'verify', case_count: 2, hints: ['演示提示：把“改好了”换成“因为……所以改……”'], status: 'published', updated_at: now - 18000 },
  ]
  const videos: Video[] = [
    { id: 1, title: '先预测，再运行（演示）', summary: '演示资源卡：用三个输入解释边界测试；此展示版不连接外部视频。', url: '', category: '验证与调试', duration_sec: 180, review_state: 'ok', status: 'published', updated_at: now - 3600 },
    { id: 2, title: '导航员怎样提问（演示）', summary: '演示资源卡：用“依据是什么”帮助伙伴解释思路。', url: '', category: '结对方法', duration_sec: 240, review_state: 'ok', status: 'published', updated_at: now - 7200 },
    { id: 3, title: '从流程图走向循环（演示）', summary: '演示资源卡：发现重复结构和结束条件。', url: '', category: '算法设计', duration_sec: 210, review_state: 'pending', status: 'draft', updated_at: now - 10800 },
  ]
  const sets: ExSet[] = [
    { id: 1, title: '把测试说清楚（演示）', goal: '演示：整理正常、边界和异常输入，说明选择测试值的理由。', item_count: 4, updated_at: now - 86400, items: [{ item_type: 'exercise', ref_id: 1, title: exercises[0]!.title, required: 1 }, { item_type: 'video', ref_id: 1, title: videos[0]!.title, required: 0 }, { item_type: 'exercise', ref_id: 2, title: exercises[1]!.title, required: 1 }, { item_type: 'exercise', ref_id: 6, title: exercises[5]!.title, required: 1 }] },
    { id: 2, title: '图形到生活·迁移小挑战（演示）', goal: '演示：在新任务中解释相同策略的适用条件。', item_count: 2, updated_at: now - 172800, items: [{ item_type: 'exercise', ref_id: 3, title: exercises[2]!.title, required: 1 }, { item_type: 'exercise', ref_id: 4, title: exercises[3]!.title, required: 1 }] },
  ]
  const pushes: PushRec[] = [
    { id: 1, res_type: 'set', res_id: 1, title: sets[0]!.title, reason: '演示：本节先提交流程图和预测，再独立运行核对。', total: 2, read: 2, done: 1, created_at: now - 1800, due_at: now + 86400, required: 1 },
    { id: 2, res_type: 'exercise', res_id: 2, title: exercises[1]!.title, reason: '演示：根据“未说明边界依据”的示例证据，补做一次边界预测。', total: 1, read: 1, done: 0, created_at: now - 900, due_at: now + 172800, required: 1 },
    { id: 3, res_type: 'video', res_id: 2, title: videos[1]!.title, reason: '演示：结对前复习提问方式，观看为自选。', total: 3, read: 2, done: 2, created_at: now - 86400, due_at: null, required: 0 },
  ]
  const cases: TeachCase[] = [
    { id: 1, title: '校园温度：让修改有依据（演示）', grade: '七年级', language: 'python', goal: '演示：学生能用分支流程解释比较结果，并用测试原件说明修改理由。', ct_dims: { decompose: 1, verify: 1 }, set_id: 1, updated_at: now - 86400, flow: [
      { stage: '问题分解', minutes: 8, teacher: '演示：请圈出输入、比较、反馈三个子任务。', student: '演示：画流程图并向同伴解释。' },
      { stage: '结对实现', minutes: 15, teacher: '演示：只追问边界条件，保留学生决策。', student: '演示：驾驶员编写，导航员核对流程。' },
      { stage: '边界复核', minutes: 12, teacher: '演示：先收预测，再看运行结果。', student: '演示：对照预测与结果，记录一次修改理由。' },
      { stage: '迁移反思', minutes: 5, teacher: '演示：追问策略在新情境中的适用条件。', student: '演示：写出可复用步骤与限制。' },
    ], reflection: '演示反思：仅“程序能运行”不足以支撑理解判断；下一次保留学生预测、测试和解释三份原件。' },
    { id: 2, title: '校园路线：寻找重复单元（演示）', grade: '七年级', language: 'python', goal: '演示：把路线表示为可重复的动作块，并解释转向参数。', ct_dims: { abstract: 1, model: 1 }, set_id: 2, updated_at: now - 172800, flow: [
      { stage: '观察与标记', minutes: 10, teacher: '演示：给出两条校园路线图。', student: '演示：找出重复形状并描述。' },
      { stage: '抽象与表达', minutes: 20, teacher: '演示：追问哪些量发生了变化。', student: '演示：构建动作模型并用新路线验证。' },
      { stage: '互评反思', minutes: 10, teacher: '演示：引导用原图核对模型。', student: '演示：指出模型适用范围。' },
    ], reflection: '演示反思：抽象的依据来自学生对相同结构的解释，不能由积木拖动次数推断。' },
  ]
  const studies: Study[] = [{
    id: 1, title: '结对提问与边界测试的课堂观察（演示）', question: '演示研究问题：学生能否用预测、测试原件和解释支持自己的修改？', phase: 'running', assign_method: 'intact', scoring_profile: '演示量规·不可用于评价', formula_version: 'showcase-fixed-v1', exp_class_ids: [1], ctrl_class_ids: [2], exp_class_names: [classes[0]!.name], ctrl_class_names: [classes[1]!.name], started_at: now - 7 * 86400, ended_at: null, pre_assessment_id: 1, post_assessment_id: 2, forced_start: 0,
    next_action: { key: 'posttest', label: '进入后测（演示）', hint: '演示操作仅改变当前页面会话中的课题状态。' }, n: { exp: 2, ctrl: 1 }, consent_missing: [], pre_progress: { done: 3, total: 3 }, post_progress: { done: 0, total: 3 }, fidelity: { breaks: [], forced_start: false },
  }]
  const rounds: TeachRound[] = [
    { id: 1, room_id: ROOM, round_index: 1, label: 'R1 能跑（演示）', started_at: now - 2400, exited_at: now - 1500, exit_task_passed: 1 },
    { id: 2, room_id: ROOM, round_index: 2, label: 'R2 跑对（演示）', started_at: now - 1200, exited_at: null, exit_task_passed: null },
  ]
  const observations: ObsWindowRow[] = [{ id: 1, study_id: '1', room_id: ROOM, round_index: 1, layer: 'sweep', pair_id: '01', window_seq: 1, kb: 'L', src_a: 0, src_p: 1, src_s: 1, src_unclear: 0, n_code: 'none', evt_tag: null, evt_note: '演示：同伴核对测试预测', seat: 'L', student_id: STUDENT, observer_id: TEACHER, observed_from: now - 1813, observed_to: now - 1800, window_offset_sec: 587, tech_status: '正常', created_at: now - 1800 }]
  const probes: ProbeRoundStat[] = [{ round_index: 1, status: 'closed', submitted: 3, total: 3 }, { round_index: 2, status: 'open', submitted: 1, total: 3 }, { round_index: 3, status: 'idle', submitted: 0, total: 3 }]
  return { now, roster, classes, exercises, videos, sets, pushes, cases, studies, rounds, observations, probes, nextId: 100, withdrawn: [] as string[] }
}

let state = initialState()
export function resetTeacherFixtures(): void { state = initialState() }

function timeline() {
  return [
    { type: 'design_create', detail: '演示原件 E02：写下温度、活动建议和输入范围。', ts: state.now - 1800 },
    { type: 'role_switch', detail: '演示观察 T01：小川复述“低于30℃”规则，再交换驾驶员角色。', ts: state.now - 1500 },
    { type: 'run', detail: '演示原件 E01：输入20℃，结果为户外活动，与预测一致。', ts: state.now - 1200 },
    { type: 'error', detail: '演示观察 T02：发现说明未覆盖温度恰好等于30℃。', ts: state.now - 900 },
    { type: 'fix', detail: '演示观察 T03：作品v2补入相等分支，独立解释仍待补充。', ts: state.now - 600 },
    { type: 'save', detail: '演示观察 T04：保存流程图、测试预测和反思；边界依据仍需复核。', ts: state.now - 300 },
  ]
}

function studentIndex(id: string) { return Math.max(0, state.roster.findIndex(s => s.id === id)) }
function studentInsight(id: string) {
  const name = state.roster.find(s => s.id === id)?.name ?? '示例学生（演示）'
  return {
    student_id: id, name, demo: true, note: DEMO_NOTE,
    card: { headline: `${name}能解释问题分解，边界测试依据仍需复核（演示）`, confidence: 0.55, source: 'rule', audited: false, blocked_words: [],
      strengths: ['演示：流程图标出了输入、判断与输出三个子任务。', '演示：E02说明已考虑低于阈值的情况。'],
      weaknesses: ['演示：E01已有20℃记录，但30℃的预测与解释尚待补充。'],
      suggestions: ['演示建议：请学生先预测边界输入，再与实际运行对照。', '演示建议：用学生解释和作品原件复核判断，活动次数只作背景。'],
      next_step: '演示：补充一份边界测试预测，并解释为何选择这个输入。' },
    evidence: {
      '演示原件 E01 · 我的测试预期': '20℃预期户外活动；30℃的预期和解释待补，项目1。',
      '演示原件 E02 · 我第一次写的说明': '“我先考虑了低于阈值的情况，还没说明相等时怎么办。”',
      '演示观察 T01 · 问题分解': '流程图：输入温度 → 检查范围 → 比较30℃ → 输出活动建议。',
      '演示冲突证据 T03': '作品v2已有相等分支，但学生未解释30℃为什么走这条分支，不能据此确认独立掌握。',
      '演示量规说明': '图表示意值为预设样例；不使用点击数、错误次数或时长换算能力。',
    }, ct_scores: DIM_EXAMPLES[studentIndex(id) % DIM_EXAMPLES.length], path: timeline(), timeline: timeline(),
  }
}

function recommendation(id: string) {
  return { student_id: id, weak_dim: 'verify', weak_score: 58, demo: true, reason: '演示：依据测试预测原件中的边界缺口，建议补充验证；此为预设教学示例。', exercises: state.exercises.filter(e => [2, 6].includes(e.id)).map(e => ({ id: e.id, title: e.title, difficulty: e.difficulty, language: e.language, why: '演示：先写预期，再解释实际结果与修改理由。' })), videos: state.videos.slice(0, 1).map(v => ({ id: v.id, title: v.title })) }
}

function studyReport(study: Study): StudyReport {
  const group = (n: number, mean: number, post: number) => ({ n, mean, sd: 0, dims: CLASS_DIMS, post_n: n, post_mean: post, post_sd: 0, post_dims: CLASS_DIMS, n_paired: n, gain_mean: post - mean, gain_sd: 0 })
  const attrition = (n: number) => ({ assigned: n, withdrawn: 0, consent_ok: n, pre_done: n, post_done: n, both: n })
  return {
    study, plain: { headline: '演示报告：展示前后测与过程证据如何并列呈现；没有真实样本，不能作教学效果结论。' },
    assess: { exp: group(study.n.exp, 6, 8), ctrl: group(study.n.ctrl, 6, 7), between_gain_diff: null, cohens_d: null, alpha_reference: { pre: null, post: null }, item_stats: { pre: { difficulty: [0.67, 0.67, 0.33], discrimination: [null, null, null] }, post: { difficulty: [1, 0.67, 0.67], discrimination: [null, null, null] } } },
    process: { exp: { intervention: CLASS_DIMS }, ctrl: { intervention: DIM_EXAMPLES[2]! } }, attrition: { exp: attrition(study.n.exp), ctrl: attrition(study.n.ctrl) }, fidelity: study.fidelity,
    caveats: ['演示：人物、作答、统计和观察均为合成数据，没有真实研究样本。', '演示：图表数值仅用于界面展示，不是计算思维测量或干预效果。', '演示：活动频次与时长不能直接换算能力；判断应回到作品、预测、解释与复核证据。', '演示：两组前后测示意表不能用于论文、排名、显著性或因果结论。'],
    writeup: ['演示写法：围绕“学生如何为修改提供依据”整理流程图、预测、测试结果和解释原件。', '演示写法：把能运行与能说明依据分别记录，并保留支持证据、冲突证据和下一步复核任务。', '演示说明：当前卡片用预设数字展示报告版式，所有教学判断均待真实数据与教师复核。'],
    validity: { note: '演示：未进行效度或信度检验，无真实数据，不提供相关系数或显著性结论。', pre: { overall: { r: null, ci: null, n: 0 }, by_dim: {} }, post: { overall: { r: null, ci: null, n: 0 }, by_dim: {} } },
  }
}

function filtered<T extends { title: string }>(items: T[], query: URLSearchParams) {
  const q = (query.get('q') ?? '').trim().toLowerCase()
  return items.filter(item => !q || JSON.stringify(item).toLowerCase().includes(q))
}

/** A miss is undefined, allowing the isolated router to try its other fixture groups. */
export function teacherFixture(path: string, method = 'GET', body: any = {}): unknown | undefined {
  const url = new URL(path, 'https://showcase.invalid')
  const p = url.pathname.replace(/\/$/, '')
  const q = url.searchParams
  const verb = method.toUpperCase()
  let data: Record<string, any> = body && typeof body === 'object' ? body : {}
  if (typeof body === 'string') { try { data = JSON.parse(body) ?? {} } catch { data = {} } }
  const send = <T>(value: T) => copy(value)
  const ok = () => ({ ok: true, demo: true, note: DEMO_NOTE })
  const newId = () => state.nextId++

  if (p === '/api/teacher/home' && verb === 'GET') {
    const classId = Number(q.get('class_id') || 0)
    const ids = classId ? state.classes.find(c => c.id === classId)?.student_ids ?? [] : state.roster.map(s => s.id)
    const students = state.roster.filter(s => ids.includes(s.id)).map(s => {
      const i = studentIndex(s.id)
      return { ...s, online: i !== 2, runs: [4, 3, 2][i] ?? 1, errors: [1, 1, 0][i] ?? 0, fixes: [1, 1, 0][i] ?? 0, success_rate: [75, 67, 100][i] ?? 100, ct: DIM_EXAMPLES[i % 3], risk: i === 0 ? 3 : 0, last_at: state.now - 60 * (i + 1) }
    })
    const alerts = students.filter(s => s.id === STUDENT).map(s => ({ id: 1, user_id: s.id, studentName: s.name, category: '课堂引导（演示）', level: 3, detail: '演示：学生想跳过预测直接求解，建议请其说明已有尝试与下一步计划；这是预设课堂情境。', created_at: state.now - 600 }))
    return send({ demo: true, note: DEMO_NOTE, class_id: classId, class_ct_n: students.length, kpis: { students: students.length, online: students.filter(s => s.online).length, submissions: 3, alerts: alerts.length }, students, class_ct: CLASS_DIMS, alerts, funnel: { entered: students.length, ran: students.length, fixed: Math.min(students.length, 2), transferred: Math.min(students.length, 1) } })
  }
  if (p === '/api/teacher/live' && verb === 'GET') {
    const classId = Number(q.get('class_id') || 0)
    const ids = classId ? state.classes.find(c => c.id === classId)?.student_ids ?? [] : state.roster.map(s => s.id)
    const seats = state.roster.filter(s => ids.includes(s.id)).map(s => { const i = studentIndex(s.id); return { ...s, state: ['stuck', 'active', 'idle'][i % 3], runs: [4, 3, 2][i] ?? 1, errors: i === 0 ? 1 : 0, fixes: i === 1 ? 1 : 0, helps: i === 0 ? 1 : 0, idle_sec: i === 2 ? 180 : 20, last_at: state.now - (i === 2 ? 180 : 20) } })
    return send({ now: state.now, window: Number(q.get('window') || 900), seats, tally: Object.fromEntries(['stuck', 'active', 'idle', 'away'].map(s => [s, seats.filter(seat => seat.state === s).length])), demo: true, note: DEMO_NOTE })
  }
  if (p === '/api/teacher/consent/batch' && verb === 'POST') {
    const ids = Array.isArray(data.student_ids) ? data.student_ids : []
    state.studies.forEach(s => { s.consent_missing = s.consent_missing.filter(id => !ids.includes(id)) })
    return { granted: ids.length, skipped: 0, skipped_ids: [], demo: true }
  }
  if (/^\/api\/teacher\/data\/[^/]+$/.test(p) && verb === 'DELETE') {
    const id = decodeURIComponent(p.split('/').pop()!)
    const existed = state.roster.some(s => s.id === id)
    state.roster = state.roster.filter(s => s.id !== id)
    state.classes.forEach(c => { c.student_ids = c.student_ids.filter(s => s !== id); c.size = c.student_ids.length })
    return { total_rows: existed ? 1 : 0, deleted: { showcase_student: existed ? 1 : 0 }, demo: true }
  }

  if (p === '/api/resources/classes') {
    if (verb === 'GET') return send({ items: state.classes, roster: state.roster })
    if (verb === 'POST') { const id = newId(); state.classes.push({ id, name: demoText(data.name, '新班级'), grade: data.grade || '七年级', note: demoText(data.note, '本地临时班级'), student_ids: [], size: 0, updated_at: state.now, socratic: false, group_kind: '' }); return { id } }
  }
  const classMatch = p.match(/^\/api\/resources\/classes\/(\d+)(?:\/(students|group|socratic))?$/)
  if (classMatch) {
    const id = Number(classMatch[1]); const klass = state.classes.find(c => c.id === id)
    if (!klass) return undefined
    if (verb === 'DELETE' && !classMatch[2]) { state.classes = state.classes.filter(c => c.id !== id); return ok() }
    if (verb === 'PUT' && classMatch[2] === 'students') { klass.student_ids = (data.student_ids ?? []).filter((uid: string) => state.roster.some(s => s.id === uid)); klass.size = klass.student_ids.length; return { size: klass.size } }
    if (verb === 'PUT' && classMatch[2] === 'group') { klass.group_kind = String(data.group_kind ?? ''); return { ok: true, socratic_hint: klass.group_kind === 'exp' } }
    if (verb === 'PUT' && classMatch[2] === 'socratic') { klass.socratic = Boolean(data.socratic); return ok() }
  }
  if (p === '/api/resources/exercises') {
    if (verb === 'GET') return send({ items: filtered(state.exercises, q).filter(e => (!q.get('language') || e.language === q.get('language')) && (!Number(q.get('difficulty')) || e.difficulty === Number(q.get('difficulty')))) })
    if (verb === 'POST') { const id = newId(); state.exercises.push({ id, title: demoText(data.title, '新练习'), summary: demoText(data.summary, '课堂练习'), statement: demoText(data.statement, '请描述你的解题思路。'), language: data.language || 'python', difficulty: Number(data.difficulty) || 1, tags: data.tags ?? [], ct_dims: data.ct_dims ?? {}, ct_primary: Object.keys(data.ct_dims ?? {})[0], hints: data.hints ?? [], case_count: data.cases?.length ?? 0, status: 'published', updated_at: state.now }); return { id } }
  }
  const exerciseMatch = p.match(/^\/api\/resources\/exercises\/(\d+)$/)
  if (exerciseMatch) {
    const id = Number(exerciseMatch[1]); const exercise = state.exercises.find(e => e.id === id)
    if (verb === 'GET' && exercise) {
      const samples = id === 1
        ? [['20', '户外活动'], ['30', '室内活动'], ['35', '室内活动'], ['-1', '提示输入不在范围内'], ['46', '提示输入不在范围内']]
        : id === 2 ? [['6', '还可以借阅1天'], ['7', '还可以借阅0天'], ['8', '请归还图书，已超期1天']]
          : [['示例输入', '根据自己写下的预测核对结果']]
      return send({ ...exercise, statement: exercise.statement || exercise.summary, cases: samples.map(([input, output]) => ({ input, expected: output, output, is_sample: true })), demo: true })
    }
    if (verb === 'DELETE') { state.exercises = state.exercises.filter(e => e.id !== id); return ok() }
  }
  if (p === '/api/resources/videos') {
    if (verb === 'GET') return send({ items: filtered(state.videos, q).filter(v => !q.get('category') || v.category === q.get('category')) })
    if (verb === 'POST') { const id = newId(); state.videos.push({ id, title: demoText(data.title, '新视频'), summary: demoText(data.summary, '仅显示资源信息，不加载外部内容'), url: '', category: data.category || '课堂资源', duration_sec: Number(data.duration_sec) || 0, review_state: 'pending', status: 'draft', updated_at: state.now }); return { id, review_state: 'pending', note: '演示：已存入当前会话，未连接外部地址。' } }
  }
  const videoMatch = p.match(/^\/api\/resources\/videos\/(\d+)$/)
  if (videoMatch && verb === 'DELETE') { state.videos = state.videos.filter(v => v.id !== Number(videoMatch[1])); return ok() }
  if (p === '/api/resources/sets') {
    if (verb === 'GET') return send({ items: state.sets })
    if (verb === 'POST') { const id = newId(); state.sets.push({ id, title: demoText(data.title, '新练习集'), goal: demoText(data.goal, '练习与复核'), item_count: 0, items: [], updated_at: state.now }); return { id } }
  }
  const setMatch = p.match(/^\/api\/resources\/sets\/(\d+)(?:\/(items))?$/)
  if (setMatch) {
    const set = state.sets.find(s => s.id === Number(setMatch[1]))
    if (set && verb === 'GET' && !setMatch[2]) return send(set)
    if (set && verb === 'PUT' && setMatch[2] === 'items') { set.items = data.items ?? []; set.item_count = set.items!.length; return { count: set.item_count } }
  }
  if (p === '/api/resources/cases') {
    if (verb === 'GET') return send({ items: filtered(state.cases, q) })
    if (verb === 'POST') { const id = newId(); state.cases.push({ id, title: demoText(data.title, '新课例'), grade: data.grade || '七年级', language: data.language || 'python', goal: demoText(data.goal, '课堂观察与证据复核'), ct_dims: data.ct_dims ?? {}, flow: data.flow ?? [], reflection: demoText(data.reflection, '待补充课后反思'), updated_at: state.now }); return { id } }
  }
  const caseMatch = p.match(/^\/api\/resources\/cases\/(\d+)$/)
  if (caseMatch && verb === 'DELETE') { state.cases = state.cases.filter(c => c.id !== Number(caseMatch[1])); return ok() }
  if (p === '/api/resources/pushes' && verb === 'GET') return send({ items: state.pushes })
  if (p === '/api/resources/push' && verb === 'POST') {
    const ids = new Set<string>((data.student_ids ?? []).filter((id: string) => state.roster.some(s => s.id === id)))
    state.classes.filter(c => (data.class_ids ?? []).includes(c.id)).forEach(c => c.student_ids.forEach(id => ids.add(id)))
    const pool = data.res_type === 'set' ? state.sets : data.res_type === 'video' ? state.videos : state.exercises
    const id = newId(); const title = pool.find(r => r.id === Number(data.res_id))?.title ?? '课堂任务（演示）'
    state.pushes.unshift({ id, title, res_type: data.res_type || 'exercise', res_id: Number(data.res_id) || 1, reason: demoText(data.reason, '请完成任务并留下解释依据'), total: ids.size, read: 0, done: 0, due_at: data.due_at ?? null, required: Number(data.required) || 0, created_at: state.now })
    return { id, targets: ids.size, demo: true }
  }

  if (p === '/api/insights/class' && verb === 'GET') return send({ n: state.roster.length, headline: '演示：已能分解任务，下一步聚焦“边界输入为什么这样选”。', common_weak: [{ dim: '边界测试依据（演示）', count: 2 }, { dim: '策略迁移说明（演示）', count: 1 }], students: state.roster.map((s, i) => ({ ...s, weakest: '验证（演示）', score: DIM_EXAMPLES[i % 3]!.verify })), demo: true })
  const insightMatch = p.match(/^\/api\/insights\/(student|recommend)\/([^/]+)$/)
  if (insightMatch && verb === 'GET') { const id = decodeURIComponent(insightMatch[2]!); return send(insightMatch[1] === 'student' ? studentInsight(id) : recommendation(id)) }
  if (p === '/api/ct/report' && verb === 'GET') return send({ report_version: '演示报告 v1', formula_version: 'showcase-fixed-v1', scoring_profile: '演示量规（不可评价）', student_id: q.get('user_id') || STUDENT, has_real_data: false, evidence_count: 6, internal_dims: DIM_EXAMPLES[0], report_dims: FOUR_DIMS, demo: true, note: DEMO_NOTE })
  if (p === '/api/ct/summary' && verb === 'GET' && q.has('user_id')) return send({ runs: 4, errors: 1, fixes: 1, ai_helps: 1, role_switches: 1, designs: 1, success_rate: 75, minutes: 25, ct_scores: DIM_EXAMPLES[studentIndex(q.get('user_id') || STUDENT) % 3], path: timeline(), timeline: timeline(), has_real_data: false, evidence_count: 6, demo: true, note: DEMO_NOTE })

  if (p === '/api/research/studies') {
    if (verb === 'GET') return send({ items: state.studies })
    if (verb === 'POST') { const id = newId(); const seed = initialState().studies[0]!; state.studies.unshift({ ...seed, id, title: demoText(data.title, '新课题'), question: demoText(data.question, '课堂证据如何支持判断'), assign_method: data.assign_method || 'intact', exp_class_ids: data.exp_class_ids ?? [1], ctrl_class_ids: data.ctrl_class_ids ?? [2], phase: 'draft', started_at: null, pre_progress: { done: 0, total: state.roster.length }, next_action: { key: 'pretest', label: '发放前测（演示）', hint: '仅改变本地演示状态。' } }); return { id } }
  }
  const studyMatch = p.match(/^\/api\/research\/studies\/(\d+)(?:\/(.*))?$/)
  if (studyMatch) {
    const id = Number(studyMatch[1]); const action = studyMatch[2] || ''; const study = state.studies.find(s => s.id === id)
    if (!study) return undefined
    if (!action && verb === 'GET') return send(study)
    if (!action && verb === 'DELETE') { state.studies = state.studies.filter(s => s.id !== id); return ok() }
    if (action === 'report' && verb === 'GET') return send(studyReport(study))
    if (action === 'export' && verb === 'GET') return send({ demo: true, note: DEMO_NOTE, study: studyReport(study), records: state.observations })
    if (action === 'probe' && verb === 'GET') return send({ items: state.probes })
    if (/^probe\/(open|close)$/.test(action) && verb === 'POST') { const probe = state.probes.find(r => r.round_index === Number(data.round_index)); if (probe) probe.status = action.endsWith('open') ? 'open' : 'closed'; return ok() }
    if (action === 'withdraw' && verb === 'POST') {
      if (!state.withdrawn.includes(data.student_id)) { state.withdrawn.push(data.student_id); const group = state.classes.some(c => study.exp_class_ids.includes(c.id) && c.student_ids.includes(data.student_id)) ? 'exp' : 'ctrl'; study.n[group] = Math.max(0, study.n[group] - 1); study.pre_progress.total = study.n.exp + study.n.ctrl; study.pre_progress.done = Math.min(study.pre_progress.done, study.pre_progress.total); study.post_progress.total = study.pre_progress.total }
      return ok()
    }
    if (verb === 'POST' && ['pretest', 'start', 'posttest', 'close'].includes(action)) {
      const phases: Record<string, Phase> = { pretest: 'pretest', start: 'running', posttest: 'posttest', close: 'closed' }
      study.phase = phases[action]!
      if (action === 'start') { study.started_at = state.now; study.pre_progress.done = study.pre_progress.total }
      if (action === 'close') { study.ended_at = state.now; study.post_progress.done = study.post_progress.total }
      const next = { pretest: ['start', '开始干预'], start: ['posttest', '进入后测'], posttest: ['close', '结束课题'], close: ['report', '查看结论'] }[action]!
      study.next_action = { key: next[0]!, label: `${next[1]}（演示）`, hint: DEMO_NOTE }
      return ok()
    }
  }
  if (p === '/api/research/export' && verb === 'GET') return send({ demo: true, note: DEMO_NOTE, students: state.roster.map((s, i) => ({ pseudonym: `DEMO-P${i + 1}`, evidence: studentInsight(s.id).evidence })), observations: state.observations.map(o => ({ ...o, student_id: 'DEMO-P1', observer_id: 'DEMO-T1' })) })

  const learnerState = p.match(/^\/api\/learner\/state\/([^/]+)$/)
  if (learnerState && verb === 'GET') return send({ student_id: decodeURIComponent(learnerState[1]!), scaffold_level: 2, round_index: 2, fallback_count: 0, mastery_snapshot: {}, stuck_points: ['演示：边界测试的预期结果需要补充解释'], updated_at: state.now - 300, exists: true, demo: true })
  if (p === '/api/learner/interaction' && verb === 'GET') return { peer_turns: 4, ai_turns: 2, ratio: 2 / 3, chat_channel_available: false, note: '演示：对话片段为预设示例，当前未连接真实聊天通道。', demo: true }
  if (p === '/api/learner/rounds' && verb === 'GET') return send({ items: state.rounds.filter(r => !q.get('room_id') || r.room_id === q.get('room_id')) })
  if (p === '/api/learner/rounds/open' && verb === 'POST') { const room = String(data.room_id || ROOM); const active = state.rounds.find(r => r.room_id === room && r.exited_at === null); if (active) return send({ id: active.id, round: active }); const round: TeachRound = { id: newId(), room_id: room, round_index: Number(data.round_index) || 1, label: demoText(data.label, `R${data.round_index || 1} 教学轮`), started_at: state.now, exited_at: null, exit_task_passed: null }; state.rounds.push(round); return send({ id: round.id, round }) }
  const roundMatch = p.match(/^\/api\/learner\/rounds\/(\d+)\/(exit|snapshot)$/)
  if (roundMatch) {
    const round = state.rounds.find(r => r.id === Number(roundMatch[1]))
    if (round && roundMatch[2] === 'exit' && verb === 'POST') { round.exited_at = state.now; round.exit_task_passed = data.exit_task_passed == null ? null : Number(Boolean(data.exit_task_passed)); return ok() }
    if (round && roundMatch[2] === 'snapshot' && verb === 'GET') return send({ items: state.roster.map(s => ({ student_id: s.id, report_dims: FOUR_DIMS, created_at: state.now, demo: true })) })
  }
  if (p === '/api/learner/cogload' && verb === 'GET') return { items: [{ score: 4, round_index: 1, room_id: ROOM, created_at: state.now - 1500 }], demo: true, note: '演示：学生主观费力感，不是成绩。' }
  if (p === '/api/obs/windows' && verb === 'GET') return send({ items: state.observations.filter(o => (!q.get('study_id') || o.study_id === q.get('study_id')) && (!q.get('room_id') || o.room_id === q.get('room_id')) && (!q.get('round_index') || o.round_index === Number(q.get('round_index')))) })
  if (p === '/api/obs/window' && verb === 'POST') {
    const rows: ObsWindowRow[] = (Array.isArray(data.items) ? data.items : []).map((item: any) => ({ ...item, id: newId(), study_id: String(data.study_id || '1'), room_id: String(data.room_id || ROOM), round_index: Number(data.round_index) || 1, layer: data.layer === 'focus' ? 'focus' : 'sweep', seat: null, student_id: null, observer_id: TEACHER, observed_from: state.now - (data.layer === 'focus' ? 480 : 13), observed_to: state.now, window_offset_sec: null, tech_status: data.tech_status ?? null, created_at: state.now, evt_note: demoText(item.evt_note, '本地观察示例'), ...(item.src_unclear ? { src_a: null, src_p: null, src_s: null } : {}) }))
    state.observations.push(...rows); return { count: rows.length, ids: rows.map(r => r.id), demo: true }
  }
  return undefined
}
