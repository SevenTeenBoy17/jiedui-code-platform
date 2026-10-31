export type GrowthScope = 'task' | 'unit'
export type GrowthStageState = 'complete' | 'current' | 'upcoming'
export type EvidenceRelation = 'supporting' | 'conflicting'
export type ReviewState = 'verified' | 'pending' | 'tentative' | 'conflict'

export interface ScopeOption {
  key: GrowthScope
  label: string
  description: string
}

export interface GrowthStage {
  key: string
  label: string
  note: string
  state: GrowthStageState
  evidenceId?: string
  evidenceVersion?: string
}

export interface EvidenceItem {
  id: string
  version: string
  title: string
  source: string
  summary: string
  relation: EvidenceRelation
  state: ReviewState
}

export interface EvidenceOriginal {
  id: string
  version: string
  title: string
  type: string
  source: string
  capturedAt: string
  content: string[]
}

export interface AbilityClaim {
  id: string
  title: string
  summary: string
  state: ReviewState
  confidence: string
  calibration: string
  supporting: EvidenceItem[]
  conflicting: EvidenceItem[]
}

export interface ReviewStep {
  id: string
  index: string
  title: string
  description: string
  state: ReviewState
  stateLabel: string
}

export interface ReviewEvidenceItem {
  id: string
  version: string
  label: string
  state: ReviewState
}

export interface OverviewScopeData {
  taskCode: string
  pageDescription: string
  stageStatus: string
  action: { title: string; description: string; reason: string; label: string; to: string }
  claims: Array<{ label: string; value: string; state: string }>
  evidence: EvidenceItem[]
  feedback: { summary: string; reviewTiming: string; state: string; rule: string }
}

export interface ProfileScopeData {
  taskCode: string
  pageDescription: string
  claims: AbilityClaim[]
  provenanceNote: string
  scopeNotice: string
  responsePrompt: string
  updateRule: string
}

export interface ReviewScopeData {
  taskCode: string
  pageDescription: string
  activeReview: boolean
  scopeLabel: string
  scopeSummary: string
  bands: Array<{ label: string; value: string; statuses: Array<{ state: ReviewState; label: string }> }>
  steps: ReviewStep[]
  evidence: ReviewEvidenceItem[]
  scaffold: {
    level: string
    precondition: string
    explanationLabel: string
    explanationHint: string
    constraints: string[]
  }
  outcomeNote: string
  emptyTitle: string
  emptyDescription: string
}

// TODO(api): Replace these typed frontend fixtures with evidence-contract responses.
export const scopeOptions: ScopeOption[] = [
  { key: 'task', label: '本任务', description: 'A-03 校园温度提醒器 · 当前任务证据' },
  { key: 'unit', label: '本单元', description: 'U-02 传感器与条件判断 · 跨任务证据' },
]

export const growthStagesByScope: Record<GrowthScope, GrowthStage[]> = {
  task: [
    { key: 'task', label: '任务', note: '任务说明', state: 'complete', evidenceId: 'EVD-A03-TASK-v1', evidenceVersion: 'v1.0' },
    { key: 'analysis', label: '分析', note: '输入与边界', state: 'complete', evidenceId: 'EVD-A03-AN-v2', evidenceVersion: 'v2.1' },
    { key: 'model', label: '建模', note: '条件关系', state: 'complete', evidenceId: 'EVD-A03-MD-v1', evidenceVersion: 'v1.2' },
    { key: 'code', label: '编码', note: '当前版本', state: 'current', evidenceId: 'EVD-A03-CODE-v2', evidenceVersion: 'v2.0' },
    { key: 'test', label: '测试', note: '待补边界', state: 'upcoming' },
    { key: 'reflect', label: '反思', note: '待记录', state: 'upcoming' },
    { key: 'transfer', label: '迁移', note: '待复核', state: 'upcoming' },
  ],
  unit: [
    { key: 'task', label: '任务', note: '3 个任务汇总', state: 'complete', evidenceId: 'EVD-U02-TASK-v3', evidenceVersion: 'v3.0' },
    { key: 'analysis', label: '分析', note: '跨任务稳定', state: 'complete', evidenceId: 'EVD-U02-AN-v3', evidenceVersion: 'v3.1' },
    { key: 'model', label: '建模', note: '趋势待扩充', state: 'current', evidenceId: 'EVD-U02-MD-v2', evidenceVersion: 'v2.0' },
    { key: 'code', label: '编码', note: '版本可追溯', state: 'complete', evidenceId: 'EVD-U02-CODE-v4', evidenceVersion: 'v4.0' },
    { key: 'test', label: '测试', note: '跨任务边界不足', state: 'current', evidenceId: 'EVD-U02-TEST-v2', evidenceVersion: 'v2.2' },
    { key: 'reflect', label: '反思', note: '有一份复核', state: 'complete', evidenceId: 'EVD-U02-REF-v1', evidenceVersion: 'v1.0' },
    { key: 'transfer', label: '迁移', note: '尚无独立原件', state: 'upcoming' },
  ],
}

const taskOverviewEvidence: EvidenceItem[] = [
  {
    id: 'EVD-A03-AN-v2', version: 'v2.1', title: '分析表：输入与边界', source: '任务 A-03 · 分析阶段',
    summary: '已写出大于 30 的分支，但等于 30 的预期未明确。', relation: 'supporting', state: 'verified',
  },
  {
    id: 'EVD-A03-TEST-v1', version: 'v1.0', title: '测试记录：边界样例', source: '任务 A-03 · 测试阶段',
    summary: '当前样例没有覆盖临界值，暂不能确认迁移。', relation: 'conflicting', state: 'conflict',
  },
]

const unitOverviewEvidence: EvidenceItem[] = [
  {
    id: 'EVD-U02-AN-v3', version: 'v3.1', title: '单元分析证据汇总', source: '单元 U-02 · 3 个任务',
    summary: '三个任务都能区分输入与输出，边界表达在两个任务中出现。', relation: 'supporting', state: 'verified',
  },
  {
    id: 'EVD-U02-TEST-v2', version: 'v2.2', title: '单元测试证据汇总', source: '单元 U-02 · 跨任务复核',
    summary: '临界值测试只在一个任务出现，暂不能作为稳定趋势。', relation: 'conflicting', state: 'conflict',
  },
]

export const overviewByScope: Record<GrowthScope, OverviewScopeData> = {
  task: {
    taskCode: 'A-03', pageDescription: '看见当前任务依据，决定下一步；所有判断都可回到原件。', stageStatus: '当前在编码阶段',
    action: {
      title: '补充边界测试', description: '先写出温度等于 30 时的预期，再运行当前版本。',
      reason: '分析原件与测试原件出现冲突', label: '继续任务', to: '/student/ide',
    },
    claims: [
      { label: '能力判断', value: '分解任务较清楚', state: '暂定' },
      { label: '支持证据', value: '分析原件、代码版本', state: '2 份原件' },
      { label: '冲突证据', value: '边界测试仍缺失', state: '需补充' },
    ],
    evidence: taskOverviewEvidence,
    feedback: { summary: '先解释边界条件，再完成一次低支架重做。', reviewTiming: '完成 A-03 重做后复核', state: '待学生回应', rule: '以 A-03 前后原件为准' },
  },
  unit: {
    taskCode: 'U-02', pageDescription: '比较本单元跨任务证据；单个任务判断不会被改写成单元结论。', stageStatus: '建模与测试趋势待扩充',
    action: {
      title: '补充跨任务建模证据', description: '完成下一项传感器任务后，对照三份模型原件。',
      reason: '当前只有两个任务支持相同建模策略', label: '查看单元画像', to: '/student/thinking/profile?scope=unit',
    },
    claims: [
      { label: '单元趋势', value: '分析表达较稳定', state: '暂定' },
      { label: '支持证据', value: '3 份分析汇总', state: '跨任务' },
      { label: '冲突证据', value: '测试边界不稳定', state: '需新任务' },
    ],
    evidence: unitOverviewEvidence,
    feedback: { summary: '保持任务判断分开，再观察下一项任务是否独立写出边界样例。', reviewTiming: '新增一份独立任务原件后', state: '单元观察中', rule: '至少两项独立任务原件相互印证' },
  },
}

const taskAnalysisEvidence: EvidenceItem[] = [
  {
    id: 'EVD-A03-AN-v2', version: 'v2.1', title: '分析表', source: '任务 A-03 · 分析阶段',
    summary: '输入、输出和约束已分栏表达。', relation: 'supporting', state: 'verified',
  },
  {
    id: 'EVD-A03-CODE-v2', version: 'v2.0', title: '代码版本', source: '任务 A-03 · 编码阶段',
    summary: '条件分支与分析表可对应。', relation: 'supporting', state: 'verified',
  },
]

const taskClaims: AbilityClaim[] = [
  {
    id: 'CLAIM-A03-DECOMPOSE-v2', title: '分解问题', summary: '能把输入、输出和边界分开说明。',
    state: 'verified', confidence: '暂定 · 较有把握', calibration: '教师已复核 A-03 任务证据', supporting: taskAnalysisEvidence, conflicting: [],
  },
  {
    id: 'CLAIM-A03-MODEL-v1', title: '抽象建模', summary: '能画出条件关系，本任务边界仍待测试。',
    state: 'tentative', confidence: '暂定 · 中等把握', calibration: '待教师确认边界表达',
    supporting: [{ id: 'EVD-A03-MD-v1', version: 'v1.2', title: '条件关系图', source: '任务 A-03 · 建模阶段', summary: '模型覆盖高温与正常两个分支。', relation: 'supporting', state: 'verified' }],
    conflicting: [taskOverviewEvidence[1]],
  },
  {
    id: 'CLAIM-A03-ALGORITHM-v2', title: '算法设计', summary: '步骤顺序清楚，边界分支仍需补证。',
    state: 'tentative', confidence: '暂定 · 中等把握', calibration: '教师校准进行中', supporting: [taskAnalysisEvidence[1]], conflicting: [taskOverviewEvidence[1]],
  },
  {
    id: 'CLAIM-A03-TEST-v1', title: '测试优化', summary: '能写常规样例，临界值样例不足。',
    state: 'conflict', confidence: '暂定 · 证据不足', calibration: '待低支架重做后复核',
    supporting: [{ id: 'EVD-A03-TEST-v0', version: 'v0.9', title: '常规测试记录', source: '任务 A-03 · 测试阶段', summary: '普通输入的预期与结果一致。', relation: 'supporting', state: 'verified' }],
    conflicting: [taskOverviewEvidence[1]],
  },
]

const unitClaims: AbilityClaim[] = [
  {
    id: 'CLAIM-U02-ANALYSIS-v3', title: '跨任务分析', summary: '三项任务都能分开记录输入与输出。',
    state: 'verified', confidence: '暂定 · 较有把握', calibration: '教师已复核单元汇总 v3.1', supporting: [unitOverviewEvidence[0]], conflicting: [],
  },
  {
    id: 'CLAIM-U02-MODEL-v2', title: '建模趋势', summary: '两个任务能独立画出条件关系，第三项仍需新原件。',
    state: 'tentative', confidence: '暂定 · 中等把握', calibration: '等待下一项任务原件',
    supporting: [{ id: 'EVD-U02-MD-v2', version: 'v2.0', title: '单元模型对照表', source: '单元 U-02 · 模型汇总', summary: 'A-02 与 A-03 的模型结构可以对照。', relation: 'supporting', state: 'verified' }], conflicting: [],
  },
  {
    id: 'CLAIM-U02-TEST-v2', title: '测试趋势', summary: '常规样例较稳定，临界值样例只出现一次。',
    state: 'conflict', confidence: '暂定 · 证据不足', calibration: '单元趋势暂不成立',
    supporting: [{ id: 'EVD-U02-CODE-v4', version: 'v4.0', title: '单元版本索引', source: '单元 U-02 · 代码汇总', summary: '三项任务版本均可回溯。', relation: 'supporting', state: 'verified' }], conflicting: [unitOverviewEvidence[1]],
  },
  {
    id: 'CLAIM-U02-TRANSFER-v1', title: '迁移趋势', summary: '尚无新情境下独立完成的迁移原件。',
    state: 'pending', confidence: '待证据', calibration: '不形成单元判断', supporting: [], conflicting: [],
  },
]

export const profileByScope: Record<GrowthScope, ProfileScopeData> = {
  task: {
    taskCode: 'A-03', pageDescription: '核对 A-03 能力主张、支持与冲突原件，并补充解释。', claims: taskClaims,
    provenanceNote: '本页只使用 A-03 任务原件与教师量规，不使用点击、报错或用时。',
    scopeNotice: '任务判断只描述 A-03，不自动外推到本单元。', responsePrompt: '说明 A-03 原件应如何解释，并写出稳定证据编号。', updateRule: '补齐 A-03 原件并完成教师复核',
  },
  unit: {
    taskCode: 'U-02', pageDescription: '核对 U-02 跨任务主张；任务原件保持原身份，不被重命名。', claims: unitClaims,
    provenanceNote: '单元画像只使用跨任务汇总原件，且保留每份原任务来源。',
    scopeNotice: '单元趋势不与任务判断合并，也不形成总分。', responsePrompt: '说明哪些跨任务原件可以支持单元趋势，哪些仍需新增任务。', updateRule: '新增独立任务原件并完成单元校准',
  },
}

const taskReviewSteps: ReviewStep[] = [
  { id: 'feedback', index: '1', title: '教师反馈与目标', description: '解释边界条件，并补全异常输入。', state: 'verified', stateLabel: '反馈已确认' },
  { id: 'redo', index: '2', title: '低支架重做', description: '支架等级 1：只保留目标与检查表。', state: 'pending', stateLabel: '等待前置说明' },
  { id: 'review', index: '3', title: '结果复核', description: '对照前后原件，再决定任务判断是否更新。', state: 'pending', stateLabel: '待验证' },
]

const taskReviewEvidence: ReviewEvidenceItem[] = [
  { id: 'EVD-A03-CODE-v1', version: 'v1.0', label: '干预前版本', state: 'verified' },
  { id: 'FB-A03-TEACHER-v1', version: 'v1.1', label: '教师反馈', state: 'verified' },
  { id: 'EVD-A03-REDO-v1', version: '待生成', label: '重做版本', state: 'pending' },
  { id: 'REV-A03-v1', version: '待生成', label: '复核记录', state: 'pending' },
]

export const reviewByScope: Record<GrowthScope, ReviewScopeData> = {
  task: {
    taskCode: 'A-03', pageDescription: '完成教师反馈、支架等级 1 重做和前后原件复核。', activeReview: true,
    scopeLabel: 'A-03 任务级重做', scopeSummary: '当前暂定判断等待低支架重做',
    bands: [
      { label: '任务级成长', value: 'A-03 当前暂定判断', statuses: [{ state: 'verified', label: '支持证据 2' }, { state: 'conflict', label: '冲突证据 1' }, { state: 'pending', label: '待复核' }] },
      { label: '单元参考', value: 'U-02 趋势不随本次重做自动更新', statuses: [{ state: 'tentative', label: '保持分离' }] },
    ],
    steps: taskReviewSteps, evidence: taskReviewEvidence,
    scaffold: {
      level: '支架等级 1', precondition: '先用自己的话说明等于 30 时应发生什么，并确认只使用目标与检查表。',
      explanationLabel: '我的边界条件说明', explanationHint: '写出温度等于 30 时的预期，以及它属于哪个分支。',
      constraints: ['只提供任务目标和检查表', '不提供完整代码或可直接复制的答案', '保留干预前版本，重做后生成新版本'],
    },
    outcomeNote: '复核完成前不更新 A-03 判断，也不宣称重做有效。', emptyTitle: '', emptyDescription: '',
  },
  unit: {
    taskCode: 'U-02', pageDescription: '查看本单元复核状态；任务级重做仍在各自任务范围完成。', activeReview: false,
    scopeLabel: 'U-02 单元复核', scopeSummary: '当前没有进行中的单元级重做',
    bands: [{ label: '单元级成长', value: '跨任务趋势等待新任务原件', statuses: [{ state: 'pending', label: '无活动复核' }, { state: 'tentative', label: '趋势暂定' }] }],
    steps: [], evidence: [],
    scaffold: { level: '无活动支架', precondition: '', explanationLabel: '', explanationHint: '', constraints: [] },
    outcomeNote: '单元趋势只在新增独立任务原件并完成校准后更新。',
    emptyTitle: '本单元没有进行中的任务级重做', emptyDescription: '切回本任务，完成 A-03 的边界说明与支架等级 1 重做；单元范围只汇总已复核结果。',
  },
}

export const studentGrowthNav = [
  { label: '成长地图', to: '/student/thinking' },
  { label: '证据画像', to: '/student/thinking/profile' },
  { label: '重做复核', to: '/student/thinking/review' },
]

function originalKey(id: string, version: string) { return `${id}@${version}` }

const originalList: EvidenceOriginal[] = [
  { id: 'EVD-A03-TASK-v1', version: 'v1.0', title: 'A-03 任务说明', type: '任务原件', source: '教师下发任务', capturedAt: '第 2 轮 · 09:10', content: ['输入：校园温度', '输出：高温提醒或正常状态', '约束：边界值必须有明确归属'] },
  { id: 'EVD-A03-AN-v2', version: 'v2.1', title: 'A-03 输入与边界分析表', type: '分析原件', source: '学生分析表', capturedAt: '第 2 轮 · 09:24', content: ['输入：temperature', '大于 30：高温提醒', '等于 30：尚未写明', '小于 30：正常状态'] },
  { id: 'EVD-A03-MD-v1', version: 'v1.2', title: 'A-03 条件关系图', type: '建模原件', source: '学生模型板', capturedAt: '第 2 轮 · 09:31', content: ['温度输入后进入条件判断', '当前只有高温与正常两个出口', '边界值标注等待补充'] },
  { id: 'EVD-A03-CODE-v2', version: 'v2.0', title: 'A-03 当前代码版本', type: '代码原件', source: '编程工坊版本记录', capturedAt: '第 2 轮 · 09:46', content: ['if temperature > 30:', '    status = "高温"', 'else:', '    status = "正常"'] },
  { id: 'EVD-A03-CODE-v1', version: 'v1.0', title: 'A-03 干预前版本', type: '代码原件', source: '重做前自动留存', capturedAt: '第 2 轮 · 09:40', content: ['边界值与异常输入尚未单列', '此版本只读留存，不会被重做覆盖'] },
  { id: 'EVD-A03-TEST-v1', version: 'v1.0', title: 'A-03 边界测试记录', type: '测试原件', source: '学生测试表', capturedAt: '第 2 轮 · 09:51', content: ['样例 29：正常', '样例 31：高温', '样例 30：未记录'] },
  { id: 'EVD-A03-TEST-v0', version: 'v0.9', title: 'A-03 常规测试记录', type: '测试原件', source: '学生测试表', capturedAt: '第 2 轮 · 09:47', content: ['普通输入的预期与实际一致', '记录不包含临界值与异常输入'] },
  { id: 'EVD-A02-MD-v1', version: 'v1.0', title: 'A-02 旧任务模型', type: '对照原件', source: '任务 A-02', capturedAt: '第 1 轮 · 10:02', content: ['分类框架来自教师模板', '学生补充了变量名称', '不能作为独立建模的充分证据'] },
  { id: 'FB-A03-TEACHER-v1', version: 'v1.1', title: 'A-03 教师反馈', type: '反馈原件', source: '教师复核记录', capturedAt: '第 2 轮 · 10:05', content: ['先解释等于 30 时的边界归属', '再完成一次支架等级 1 重做', '重做后对照前后原件'] },
  { id: 'EVD-U02-TASK-v3', version: 'v3.0', title: 'U-02 任务来源索引', type: '单元汇总原件', source: '单元证据索引', capturedAt: '单元 U-02 · 汇总 3', content: ['A-01 光线提醒', 'A-02 湿度分类', 'A-03 校园温度提醒器'] },
  { id: 'EVD-U02-AN-v3', version: 'v3.1', title: 'U-02 分析证据汇总', type: '单元汇总原件', source: '跨任务分析汇总', capturedAt: '单元 U-02 · 汇总 3', content: ['3/3 任务区分输入与输出', '2/3 任务独立写出边界', '保留每份原任务编号'] },
  { id: 'EVD-U02-MD-v2', version: 'v2.0', title: 'U-02 模型对照表', type: '单元汇总原件', source: '跨任务模型汇总', capturedAt: '单元 U-02 · 汇总 2', content: ['A-02 与 A-03 使用条件关系模型', 'A-01 原件类型不同，不并入同一判断'] },
  { id: 'EVD-U02-CODE-v4', version: 'v4.0', title: 'U-02 版本索引', type: '单元版本原件', source: '跨任务版本索引', capturedAt: '单元 U-02 · 汇总 4', content: ['每项任务保留独立版本号', '汇总只建立引用，不改写原件'] },
  { id: 'EVD-U02-TEST-v2', version: 'v2.2', title: 'U-02 测试证据汇总', type: '单元汇总原件', source: '跨任务测试汇总', capturedAt: '单元 U-02 · 汇总 2', content: ['3/3 任务包含常规样例', '1/3 任务包含临界值样例', '边界测试趋势证据不足'] },
  { id: 'EVD-U02-REF-v1', version: 'v1.0', title: 'U-02 反思复核摘录', type: '单元复核原件', source: '教师单元校准', capturedAt: '单元 U-02 · 复核 1', content: ['已复核一份任务反思', '仍需另一份独立任务原件'] },
]

export const evidenceOriginals: Record<string, EvidenceOriginal> = Object.fromEntries(
  originalList.map((original) => [originalKey(original.id, original.version), original]),
)

export function findEvidenceOriginal(id: string, version: string) {
  return evidenceOriginals[originalKey(id, version)]
}
