/**
 * Authored assessment demo, never an API payload or a real assessment result.
 * Keep originals immutable; the drawer owns a separate in-memory supplement.
 */
export type DrawerKind = 'submission' | 'receipt' | 'loop' | 'requirements' | 'privacy' | 'contact' | 'flow' | 'supplement'
export type DrawerSection = 'ai' | 'rules'

function freezeDemo<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(freezeDemo)
  }
  return value
}

export const demoAssessment = freezeDemo({
  isDemo: true,
  scope: 'task',
  task: {
    id: 'DEMO-ASMT-TEMP-01',
    title: '校园温度提醒器',
    unit: '条件判断',
    currentVersion: 'v1',
    nextVersion: null,
    reviewState: 'not_started',
  },
  resources: {
    temperature: '/generated/assessment-center-v1/school-temperature.png',
    calendar: '/generated/assessment-center-v1/calendar-clock.png',
    notebook: '/generated/assessment-center-v1/checked-notebook.png',
    avatar: '/generated/pair-ip-v2/panda-check.png',
    feedback: '/generated/student-growth/teacher-feedback.png',
    growth: '/generated/student-growth/thinking-growth.png',
  },
  E01: {
    id: 'E01',
    version: 'v1',
    scope: 'task',
    sourceType: 'authored_demo_original',
    title: '我的测试预期',
    rows: [
      { temperature: 20, expected: '户外活动', reason: '低于阈值' },
      { temperature: 30, expected: null, reason: null },
    ],
  },
  E02: {
    id: 'E02',
    version: 'v1',
    scope: 'task',
    sourceType: 'authored_demo_original',
    title: '我第一次写的说明',
    text: '我先考虑了低于阈值的情况，还没说明相等时怎么办。',
  },
  FB01: {
    id: 'FB01',
    version: 'demo-1',
    scope: 'task',
    author: '林老师',
    sourceType: 'authored_demo_teacher_feedback',
    evidenceIds: ['E01', 'E02'],
    evidenceVersion: 'v1',
    quote: '请补充30℃的预期结果，并说明理由。',
  },
  R1: {
    id: 'R1',
    version: 'demo-1',
    scope: 'task',
    title: '这次任务的要求',
    rules: {
      minimum: 0,
      maximum: 45,
      threshold: 30,
      below: '户外活动',
      atOrAbove: '室内活动',
      outsideRange: '提示输入不在范围内',
    },
    criteria: [
      { title: '说清楚题目', detail: '写明输入的温度、输出的活动建议，以及允许的温度范围。' },
      { title: '解释怎样判断', detail: '说明低于、等于和高于30℃时，分别会走哪一条判断。' },
      { title: '用测试检查', detail: '先写预期，再与实际结果比较；检查边界情况，说明修改的理由。' },
    ],
    sourceType: 'authored_demo_rubric',
  },
  AI01: {
    id: 'AI01',
    version: 'demo-1',
    scope: 'task',
    sourceType: 'authored_demo_ai_feedback',
    realModelCalled: false,
    status: 'tentative',
    teacherReview: 'not_reviewed',
    evidenceIds: ['E01', 'E02'],
    evidenceVersion: 'v1',
    rubricId: 'R1',
    observation: '30℃这一行还缺预期和解释。',
    uncertainty: '暂时不能判断你是否理解。',
    nextStep: '先看原任务规则，再用自己的话补上这一行。',
    independentStudentEvidence: false,
  },
  receipt: {
    id: 'DEMO-RC01',
    title: '学习前小测',
    subtitle: '单元前测',
    unit: '条件判断',
    sourceType: 'authored_demo_receipt',
    status: 'submitted',
    submittedAt: null,
    releaseStatus: 'not_released',
    releaseAt: null,
    score: null,
    feedback: null,
    responseDetailsAvailable: false,
  },
} as const)
