/**
 * Synthetic data for the original student pages. No network, storage or model calls.
 * State lasts only for this module instance and may be reset by the showcase shell.
 * Assessment-center and growth evidence originals remain in their existing demo data.
 */
const STUDENT = 'demo-student-1'
const TEACHER = 'demo-teacher-1'
const NOW = Date.parse('2026-10-14T08:30:00Z') / 1000
const demo = { isDemo: true, source: 'authored_showcase', realModelCalled: false }
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

interface DemoVersion { id: number; version_no: number; code: string; block_state: string | null; created_at: number }
interface DemoProject {
  id: number; title: string; language: 'python' | 'cpp' | 'c'; latest_version: number
  user_id: string; created_at: number; updated_at: number; latest: DemoVersion
  versions: DemoVersion[]; design: { type: string; payload: string }[]
}

const pythonCode = '# 校园温度提醒器 · 演示作品\n# 先预测 20、30、35 ℃的结果，再实际运行核对。\ntemperature = 30\nif temperature < 0 or temperature > 45:\n    print("提示输入不在范围内")\nelif temperature < 30:\n    print("户外活动")\nelse:\n    print("室内活动")\n'
const cppCode = '#include <iostream>\nusing namespace std;\n\n// 校园步数统计 · 演示作品\nint main() {\n    int steps[] = {3200, 4500, 3800, 5000, 4100};\n    int total = 0;\n    for (int step : steps) total += step;\n    cout << "五天总步数：" << total << endl;\n    return 0;\n}\n'
const cCode = '#include <stdio.h>\n\n/* 图书角借阅提醒 · 演示作品 */\nint main(void) {\n    int borrowed_days = 8;\n    int limit = 7;\n    if (borrowed_days > limit)\n        printf("请归还图书，已超期 %d 天\\n", borrowed_days - limit);\n    else\n        printf("还可以借阅 %d 天\\n", limit - borrowed_days);\n    return 0;\n}\n'
const blockState = JSON.stringify({ blocks: { languageVersion: 0, blocks: [
  { type: 'text_print', id: 'demo-block-greeting', x: 42, y: 40, inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: '欢迎来到校园小花园！' } } } },
    next: { block: { type: 'controls_repeat_ext', id: 'demo-block-repeat', inputs: {
      TIMES: { shadow: { type: 'math_number', fields: { NUM: 3 } } },
      DO: { block: { type: 'text_print', inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: '给小花浇水' } } } } } },
    } } } },
] } })
const blockCode = 'print("欢迎来到校园小花园！")\nfor count in range(3):\n    print("给小花浇水")\n'
const designText = '输入：温度，范围为 0～45 ℃\n输出：活动建议\n如果温度不在范围内，提示重新输入\n否则，如果低于 30 ℃，建议户外活动\n否则，建议室内活动\n测试：20、30、35 ℃，以及范围外的 -1 ℃和 46 ℃'

function makeProject(id: number, title: string, language: DemoProject['language'], code: string, blocks: string | null = null, version = 1): DemoProject {
  const versions = Array.from({ length: version }, (_, index) => ({
    id: id * 100 + index + 1, version_no: index + 1, code, block_state: blocks,
    created_at: NOW - (version - index) * 1800,
  }))
  return { id, title, language, user_id: STUDENT, created_at: NOW - 86400, updated_at: NOW - 1800,
    latest_version: version, latest: versions[versions.length - 1], versions,
    design: [{ type: 'pseudocode', payload: id === 1 ? designText : '先说清输入与输出\n写出处理步骤\n选择一个正常用例和一个边界用例\n对照预期检查结果' }] }
}
const seedProjects = () => [
  makeProject(1, '校园温度提醒器 · Python', 'python', pythonCode, null, 2),
  makeProject(2, '校园步数统计 · C++', 'cpp', cppCode),
  makeProject(3, '图书角借阅提醒 · C', 'c', cCode),
  makeProject(4, '校园小花园 · 积木', 'python', blockCode, blockState),
]
const seedPushes = () => [
  { target_id: 1, res_type: 'exercise', res_id: 1, title: '校园温度提醒器', reason: '林老师（演示）：先写出 30℃ 时的预期结果，再进入工坊检查边界。', required: 1, read_at: null as number | null, done_at: null as number | null, created_at: NOW - 1800 },
  { target_id: 2, res_type: 'assessment', res_id: 1, title: '条件判断 · 课堂小测（演示）', reason: '独立完成三道短题，提交后查看回执。演示作答仅在当前页面会话内保留。', required: 1, read_at: null as number | null, done_at: null as number | null, created_at: NOW - 1600 },
  { target_id: 3, res_type: 'set', res_id: 1, title: '把测试说清楚', reason: '整理正常、边界和异常输入，说明选择测试值的理由。', required: 0, read_at: NOW - 900 as number | null, done_at: NOW - 600 as number | null, created_at: NOW - 3600 },
]
const seedAssessments = () => [
  { assessment_id: 1, title: '条件判断 · 课堂小测（演示）', kind: 'probe', item_count: 3, target_id: 2, done: false, round_id: 2, due: NOW + 86400, done_at: null as number | null },
  { assessment_id: 2, title: '学习前小测（演示回执）', kind: 'pre', item_count: 3, target_id: 4, done: true, round_id: null, due: null, done_at: NOW - 86400 },
]
const paperItems = [
  { id: 1, stem: '校园活动规则：低于 30℃ 可以户外活动；达到或超过 30℃ 改为室内活动。输入 30℃ 时，应该得到哪一种建议？', options: ['户外活动', '室内活动', '两种建议都输出', '不输出任何建议'], level: 1 },
  { id: 2, stem: '为检查温度判断的边界，下面哪组输入最有帮助？', options: ['10、15、20', '29、30、31', '35、40、45', '只测 25'], level: 2 },
  { id: 3, stem: '允许的温度范围是 0～45℃。输入 -1℃ 时，哪一步最应该先做？', options: ['直接建议户外活动', '直接建议室内活动', '提示输入超出允许范围', '把 -1 改成 1 后继续'], level: 2 },
]
const evidence = [
  { id: 'E01', version: 'v1', title: '我的测试预期', kind: 'test_plan', project_id: 1,
    detail: '20℃ 预期户外活动；30℃ 的预期和解释待补。', href: '/student/assess?demo=1', source: 'authored_demo_original' },
  { id: 'E02', version: 'v1', title: '我第一次写的说明', kind: 'explanation', project_id: 1,
    detail: '我先考虑了低于阈值的情况，还没说明相等时怎么办。', href: '/student/thinking/profile?demo=1', source: 'authored_demo_original' },
]
const timeline = [
  { type: 'design_create', detail: '演示：写下温度、活动建议与输入范围', ts: NOW - 3600, evidence_id: 'E02' },
  { type: 'save', detail: '演示：保存校园温度提醒器 v1', ts: NOW - 3000, project_id: 1 },
  { type: 'run', detail: '演示测试记录：20℃ 得到户外活动', ts: NOW - 2400, evidence_id: 'E01' },
  { type: 'reflection', detail: '演示：准备补充 30℃ 的预期与解释', ts: NOW - 1800, evidence_id: 'E01' },
]
let projects = seedProjects()
let pushes = seedPushes()
let assessments = seedAssessments()
let consent = true
let consentPending = false
let erasurePending = false
let nextProjectId = 5
let rounds = [{ round_id: 'demo-round-1', session_id: 'demo-session-1', round_index: 1, ended_at: null as string | null }]
let receipts: Record<string, Record<string, unknown>> = {}
let submittedAnswers: Record<number, unknown> = {}
let eventCount = 0

export function resetStudentFixtures(): void {
  projects = seedProjects(); pushes = seedPushes(); assessments = seedAssessments()
  consent = true; consentPending = false; erasurePending = false; nextProjectId = 5
  rounds = [{ round_id: 'demo-round-1', session_id: 'demo-session-1', round_index: 1, ended_at: null }]
  receipts = {}; submittedAnswers = {}; eventCount = 0
}

function projectView(project: DemoProject) {
  const { versions: _versions, design: _design, ...result } = project
  return { ...result, ...demo, evidence_ids: project.id === 1 ? ['E01', 'E02'] : [] }
}
function myData() {
  const items = [
    { category: 'projects', what: '演示作品', n: projects.length },
    { category: 'project_versions', what: '演示作品版本', n: projects.reduce((sum, p) => sum + p.versions.length, 0) },
    { category: 'design_artifacts', what: '演示伪代码与流程', n: projects.reduce((sum, p) => sum + p.design.length, 0) },
    { category: 'ct_events', what: '演示过程记录，不代表能力分数', n: timeline.length + eventCount },
    { category: 'evidence_items', what: '演示证据原件', n: evidence.length },
    { category: 'inference_evidence', what: '演示主张与原件的关联', n: 2 },
    { category: 'push_targets', what: '演示任务接收记录', n: pushes.length },
    { category: 'class_students', what: '演示班级成员', n: 1 },
    { category: 'study_members', what: '演示课题分组', n: 1 },
    { category: 'assess_results', what: '演示小测回执', n: assessments.filter(a => a.done).length },
    { category: 'learner_state', what: '演示学习支持安排', n: 1 },
    { category: 'consents', what: '演示授权状态', n: 1 },
    { category: 'usage_sessions', what: '演示使用时段', n: 1 },
  ]
  return { ...demo, total_rows: items.reduce((sum, i) => sum + i.n, 0), items, retained: [],
    notes: { retained: '全部为合成演示数据，没有真实学生资料。', exported: '导出仅包含本次展示的样例；不连接真实数据服务。' } }
}
function session(id: string) {
  return { ...demo, session_id: id, student_id: STUDENT, teacher_id: TEACHER, class_id: 1, study_id: 1,
    task_snapshot: { title: '校园温度提醒器 · 预设演示', description: designText },
    human_role: 'driver', status: consent ? 'active' : 'closed', project_id: 1,
    ai_policy: { scaffold: 2, socratic: true, policy_hash: 'showcase-preset-only' },
    actions: { can_chat: consent, can_open_round: false, reason_code: consent ? null : 'CONSENT_REVOKED' }, rounds }
}
function presetReply(message: string, reviewer: boolean) {
  const label = '【演示预设回复 · 未调用真实 AI】\n'
  if (/总结|回顾|学到了/.test(message)) return label + '这段示例展示了“明确输入输出 → 写判断步骤 → 对照预期测试”的过程。当前原件里 30℃ 的预期解释仍待补充。你准备怎样说明等于阈值时的处理？'
  if (/报错|错误|error|bug|检查/.test(message) || reviewer) return label + '先把预期与实际结果并排写下来：输入是什么，你原本希望看到什么，实际出现了什么？\n检查 29、30、31 这三个值时，哪一个最能帮助你发现边界遗漏？'
  if (/猜数字/.test(message)) return label + '可以先明确三个部分：输入一个猜测、比较大小、给出提示。\n如果猜测刚好等于目标数字，你希望程序输出什么？先用自己的话写下这条规则。'
  return label + '我们先把任务拆成“输入、规则、输出、测试”四步。\n校园温度提醒器在 30℃ 时应该进入哪一条分支？你能先写出预期，并说明选择的理由吗？'
}

/** Returns undefined for unowned routes so the teacher/shared fixture dispatcher may handle them. */
export function studentFixture(path: string, method = 'GET', body: any = {}): unknown | undefined {
  const url = new URL(path, 'https://showcase.invalid')
  const route = url.pathname.replace(/\/$/, '')
  const verb = method.toUpperCase()
  let input: any = body ?? {}
  if (typeof input === 'string') { try { input = JSON.parse(input) } catch { input = {} } }
  const respond = (value: unknown) => clone(value)

  if (route === '/api/projects' && verb === 'GET') return respond(projects.map(projectView))
  if (route === '/api/projects' && verb === 'POST') {
    const language = ['python', 'cpp', 'c'].includes(input.language) ? input.language : 'python'
    const project = makeProject(nextProjectId++, String(input.title || '新建演示作品'), language, '')
    projects.push(project)
    return respond(projectView(project))
  }
  const projectRoute = route.match(/^\/api\/projects\/(\d+)(?:\/(versions|design|download)(?:\/(\d+))?)?$/)
  if (projectRoute) {
    const project = projects.find(p => p.id === Number(projectRoute[1]))
    if (!project) return undefined
    const operation = projectRoute[2]
    if (!operation && verb === 'GET') return respond(projectView(project))
    if (!operation && verb === 'DELETE') { projects = projects.filter(p => p.id !== project.id); return { ok: true, ...demo } }
    if (!operation && (verb === 'PATCH' || verb === 'PUT')) { if (input.title) project.title = String(input.title); return respond(projectView(project)) }
    if (operation === 'versions' && verb === 'GET') return respond(projectRoute[3] ? project.versions.find(v => v.version_no === Number(projectRoute[3])) ?? null : { items: project.versions })
    if (operation === 'versions' && verb === 'POST') {
      const code = String(input.code ?? '')
      const blocks = typeof input.blockState === 'string' ? input.blockState : null
      const changed = code !== project.latest.code || blocks !== project.latest.block_state
      if (changed) {
        project.latest_version++
        project.latest = { id: project.id * 100 + project.latest_version, version_no: project.latest_version, code, block_state: blocks, created_at: NOW }
        project.versions.push(project.latest); project.updated_at = NOW
      }
      return { versionNo: project.latest_version, changed, ...demo }
    }
    if (operation === 'design' && verb === 'GET') return respond(project.design)
    if (operation === 'design' && verb === 'POST') {
      const type = input.type === 'flow' ? 'flow' : 'pseudocode'
      project.design = project.design.filter(d => d.type !== type)
      project.design.push({ type, payload: String(input.payload ?? '') })
      return { ok: true, ...demo }
    }
    if (operation === 'download' && verb === 'GET') return respond({ showcaseDownload: true, filename: `${project.title}.zip`, ...demo,
      files: { [`main.${project.language === 'python' ? 'py' : project.language}`]: project.latest.code,
        'project.json': JSON.stringify({ ...projectView(project), note: '合成展示作品，仅供界面体验。' }, null, 2),
        'design.txt': project.design.map(d => d.payload).join('\n\n') } })
  }

  if (route === '/api/resources/my/tasks/chain' && verb === 'GET') return respond({ items: pushes.map(p => ({ target_id: p.target_id, title: p.title, kind: p.res_type, res_id: p.res_id, done: !!p.done_at, required: p.required, due_at: NOW + 86400 })) })
  if (route === '/api/resources/my/pushes' && verb === 'GET') return respond({ items: pushes, unread: pushes.filter(p => !p.read_at).length })
  const pushRoute = route.match(/^\/api\/resources\/my\/pushes\/(\d+)\/(read|done)$/)
  if (pushRoute && verb === 'POST') {
    const push = pushes.find(p => p.target_id === Number(pushRoute[1]))
    if (!push) return undefined
    if (pushRoute[2] === 'read') push.read_at = NOW
    else if (push.res_type !== 'assessment') { push.read_at ??= NOW; push.done_at = NOW }
    return { ok: true, ...demo }
  }
  if (route === '/api/research/my/assessments' && verb === 'GET') return respond({ items: assessments })
  const assessmentRoute = route.match(/^\/api\/research\/my\/assessments\/(\d+)(?:\/(submit|result))?$/)
  if (assessmentRoute) {
    const assessment = assessments.find(a => a.assessment_id === Number(assessmentRoute[1]))
    if (!assessment) return undefined
    if (assessmentRoute[2] === 'submit' && verb === 'POST') {
      assessment.done = true; assessment.done_at = NOW
      submittedAnswers[assessment.assessment_id] = clone(Array.isArray(input.answers) ? input.answers : [])
      const push = pushes.find(p => p.res_type === 'assessment' && p.res_id === assessment.assessment_id)
      if (push) { push.done_at = NOW; push.read_at = NOW }
      return { ok: true, ...demo, message: '演示作答已在本次会话中记录，未上传。' }
    }
    if (assessmentRoute[2] === 'result' && verb === 'GET') return respond({ ...demo, assessment_id: assessment.assessment_id, submitted: assessment.done, submitted_at: assessment.done_at, released: false, message: '演示回执，不下发能力分数。' })
    if (!assessmentRoute[2] && verb === 'GET') return respond({ ...demo, id: assessment.assessment_id, title: assessment.title, kind: assessment.kind, item_count: paperItems.length, items: paperItems })
  }

  if (route === '/api/consent') {
    if (verb === 'GET') return { granted: consent, pending: consentPending, ...demo }
    if (verb === 'POST') { consentPending = true; return { granted: consent, pending: true, ...demo, message: '演示申请已记录；没有通知真实教师。' } }
    if (verb === 'DELETE') { consent = false; consentPending = false; return { data_deleted: false, ...demo, message: '本次展示已模拟撤回；未删除真实数据。刷新演示可恢复。' } }
  }
  if (route === '/api/my/data' && verb === 'GET') return respond(myData())
  if (route === '/api/my/data/export' && verb === 'GET') return respond({ ...demo, student: { id: STUDENT, name: '小禾（演示）', class_id: 1 }, inventory: myData(), projects: projects.map(projectView), evidence, submissions: submittedAnswers, erasure_pending: erasurePending })
  if (route === '/api/my/data/erasure' && verb === 'POST') { erasurePending = true; return { pending: true, rows_pending: myData().total_rows, ...demo, message: '演示删除申请已记录；没有通知教师，也没有删除任何资料。' } }
  if (route === '/api/student/usage' && verb === 'GET') return { minutes: 18, ...demo }
  if (route === '/api/usage/heartbeat' && verb === 'POST') return { ok: true, ...demo }
  if (route === '/api/student/milestone' && verb === 'POST') return { first: false, ...demo }
  if (route === '/api/ct/events' && verb === 'POST') { eventCount++; return { ok: true, ...demo } }
  if (route === '/api/ct/summary' && verb === 'GET') return respond({ ...demo, runs: 4, errors: 1, fixes: 1, ai_helps: 2, role_switches: 1, designs: 1, success_rate: 75, minutes: 18, has_real_data: false, evidence_count: evidence.length,
    ct_rank: [{ dim: 'decompose', band: 1, label: '演示：有原件待复核' }, { dim: 'verify', band: 2, label: '演示：补充边界测试' }], path: timeline, timeline, evidence })
  if (route === '/api/ct/mistakes' && verb === 'GET') return respond({ ...demo, items: [{ text: '演示记录：NameError: name \'temperature\' is not defined', count: 1, first_at: NOW - 3000, last_at: NOW - 3000 }], total: 1 })
  if (route === '/api/ct/report' && verb === 'GET') return respond({ ...demo, report_version: 'showcase-rubric-1', formula_version: 'authored-not-computed', scoring_profile: 'synthetic', student_id: url.searchParams.get('user_id') || STUDENT, has_real_data: false, evidence_count: evidence.length, internal_dims: {}, report_dims: {}, evidence, note: '无真实能力分数；请从成长画像查看演示原件与暂定主张。' })
  if (route === '/api/insights/my/recommend' && verb === 'GET') return respond({ ...demo, student_id: STUDENT, weak_dim: 'verify', weak_score: null, reason: '演示建议：E01 中 30℃ 的预期仍待补充，可以从边界测试继续。', exercises: [{ id: 1, title: '校园温度提醒器', difficulty: 2, language: 'python', why: '比较 29、30、31℃ 的预期与输出' }, { id: 2, title: '图书借阅天数', difficulty: 2, language: 'c', why: '把同样的边界检查迁移到 7 天借阅规则' }], videos: [], evidence_ids: ['E01'] })
  if (/^\/api\/learner\/state\//.test(route) && verb === 'GET') return respond({ ...demo, student_id: decodeURIComponent(route.split('/').pop() || STUDENT), scaffold_level: 2, round_index: 2, fallback_count: 0, mastery_snapshot: {}, stuck_points: ['演示：补充等于阈值时的说明'], updated_at: NOW, exists: true })
  if (route === '/api/learner/cogload' && verb === 'POST') return { ok: true, ...demo }

  if (route === '/api/pair/sessions/capabilities' && verb === 'GET') return { mode: 'legacy', trusted_chat_enabled: true, trusted_image_enabled: false, history_mode: 'current_question_only', ...demo }
  if (route === '/api/pair/sessions/available' && verb === 'GET') return respond({ sessions: [session('demo-session-1')] })
  const pairRoute = route.match(/^\/api\/pair\/sessions\/([^/]+)(?:\/(rounds|ai-requests)(?:\/([^/]+)(?:\/(chat))?)?)?$/)
  if (pairRoute) {
    const sid = decodeURIComponent(pairRoute[1])
    if (!pairRoute[2] && verb === 'GET') return respond(session(sid))
    if (pairRoute[2] === 'rounds' && !pairRoute[3] && verb === 'POST') return respond(rounds[0])
    if (pairRoute[2] === 'rounds' && pairRoute[4] === 'chat' && verb === 'POST') {
      const receipt = { ...demo, status: 'released', reason_code: null, request_id: String(input.request_id || 'demo-request'), session_id: sid, round_id: decodeURIComponent(pairRoute[3]), project_version_id: projects.find(p => p.id === 1)?.latest.id ?? null, version_no: projects.find(p => p.id === 1)?.latest_version ?? null, requested_persona: input.persona || 'guide', effective_role: 'navigator', assigned_scaffold: 2, scaffold_applied: true, socratic: true, policy_hash: 'showcase-preset-only', prompt_version: 'showcase-preset-1', code_source: 'synthetic_project' }
      receipts[receipt.request_id] = receipt
      return respond({ ...demo, reply: presetReply(String(input.message || ''), input.persona === 'review'), source: 'fallback', receipt })
    }
    if (pairRoute[2] === 'ai-requests' && verb === 'GET') return respond(receipts[decodeURIComponent(pairRoute[3])] || { status: 'failed', request_id: pairRoute[3], session_id: sid, round_id: rounds[0].round_id, reason_code: 'REQUEST_NOT_FOUND', ...demo })
  }
  if (route === '/api/ai/chat' && verb === 'POST') return { ...demo, reply: presetReply(String(input.message || ''), input.role === 'reviewer'), role: input.role || 'turtle', source: 'fallback', socratic: true, socraticLocked: false, phase: 'asked', asks: 1 }
  if (route === '/api/ai/image' && verb === 'POST') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" rx="28" fill="#eff7ed"/><circle cx="510" cy="76" r="37" fill="#f9cc70"/><path d="M0 300 Q160 210 320 290 T640 260 V400 H0Z" fill="#abd8a2"/><path d="M180 290V160M310 290V140M440 290V180" stroke="#578755" stroke-width="12"/><circle cx="180" cy="150" r="35" fill="#e5a5b6"/><circle cx="310" cy="130" r="35" fill="#b6a5df"/><circle cx="440" cy="170" r="35" fill="#facb80"/><text x="320" y="345" text-anchor="middle" font-size="25" fill="#36513d">校园小花园 · 预设演示图</text><text x="320" y="375" text-anchor="middle" font-size="16" fill="#36513d">未调用真实图像生成服务</text></svg>'
    return { ...demo, image: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` }
  }
  return undefined
}
