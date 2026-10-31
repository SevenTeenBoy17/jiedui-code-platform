import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('@/views/Login.vue'), meta: { public: true } },
  {
    path: '/student',
    component: () => import('@/layouts/StudentShell.vue'),
    meta: { role: 'student' },
    children: [
      { path: '', redirect: '/student/home' },
      // V2：AI 结对编程工作台 —— 学生端主入口（对话为唯一主体）
      { path: 'studio', name: 'student-studio',
        meta: { title: '结对编程', description: '按教师任务阶段分析问题，并由结对伙伴提供分层提示', studentNav: 'pair' },
        component: () => import('@/views/student/StudioView.vue') },
      { path: 'home', name: 'student-home',
        meta: { title: '我的学习工作台', description: '同步教师任务、学习说明与当前下一步', studentNav: 'home' },
        component: () => import('@/views/student/WorkbenchView.vue') },
      { path: 'ide', name: 'student-ide',
        meta: { title: '编程工坊', description: '完成分析、建模、编码、运行、测试和反思', studentNav: 'workshop' },
        component: () => import('@/views/student/IdeView.vue') },
      { path: 'thinking', name: 'student-thinking',
        meta: { title: '思维成长', description: '按任务或单元查看暂定判断、证据原件与下一步', studentNav: 'growth' },
        component: () => import('@/views/student/ThinkingView.vue') },
      { path: 'thinking/profile', name: 'student-growth-profile',
        meta: { title: '证据画像', description: '查看能力主张、支持与冲突证据，并补充解释', studentNav: 'growth' },
        component: () => import('@/views/student/GrowthProfileView.vue') },
      { path: 'thinking/review', name: 'student-growth-review',
        meta: { title: '重做复核', description: '查看教师反馈、低支架重做与前后原件', studentNav: 'growth' },
        component: () => import('@/views/student/GrowthReviewView.vue') },
      // 测评中心（蓝图 3.1）：待做/进行中/已完成聚合页，接 mine() 端到端
      { path: 'assess', name: 'student-assess-center',
        meta: { title: '测评中心', description: '接收教师测评并查看待完成、进行中和已完成状态', studentNav: 'assessment' },
        component: () => import('@/views/student/AssessTasksView.vue') },
      // 课题前后测答题页（老师下发后从任务胶囊/测评中心进入）
      { path: 'assess/:aid', name: 'student-assess',
        meta: { title: '完成测评', description: '按题目要求独立作答并提交', studentNav: 'assessment' },
        component: () => import('@/views/student/AssessmentView.vue') },
      // 个人信息主体权利（PIPL 第 44–47 条）：查阅、复制、删除。
      // 有端点没入口 = 权利不可行使，与没做等价。
      { path: 'my-data', name: 'student-my-data',
        meta: { title: '我的数据', description: '查看、下载或删除与自己相关的数据', studentNav: 'data' },
        component: () => import('@/views/student/MyDataView.vue') },
    ],
  },
  {
    path: '/teacher',
    component: () => import('@/layouts/TeacherShell.vue'),
    meta: { role: 'teacher' },
    children: [
      { path: '', redirect: '/teacher/teaching/today' },
      // 兼容旧链接
      { path: 'dashboard', redirect: '/teacher/teaching/today' },

      // —— 板块 A：教学（上课当天要用）——
      { path: 'teaching', redirect: '/teacher/teaching/today' },
      { path: 'teaching/today', name: 'tt-today', meta: { title: '今日' },
        component: () => import('@/views/teacher/teaching/TodayView.vue') },
      { path: 'teaching/students', name: 'tt-students', meta: { title: '学情' },
        component: () => import('@/views/teacher/teaching/StudentsView.vue') },
      { path: 'teaching/classes', name: 'tt-classes', meta: { title: '班级' },
        component: () => import('@/views/teacher/teaching/ClassesView.vue') },
      { path: 'teaching/resources', name: 'tt-resources', meta: { title: '资源' },
        component: () => import('@/views/teacher/teaching/ResourcesView.vue') },
      { path: 'teaching/tasks', name: 'tt-tasks', meta: { title: '任务' },
        component: () => import('@/views/teacher/teaching/TasksView.vue') },
      { path: 'teaching/live', name: 'tt-live', meta: { title: '课堂实况' },
        component: () => import('@/views/teacher/teaching/LiveView.vue') },
      // 教师结构化观察表 sweep 层（定稿 §A2）：一对三击、走位一遍即一窗
      { path: 'teaching/observe', name: 'tt-observe', meta: { title: '课堂观察' },
        component: () => import('@/views/teacher/teaching/ObserveView.vue') },

      // —— 板块 B：教研（课后/周期性）——
      { path: 'research', redirect: '/teacher/research/study' },
      { path: 'research/study', name: 'tr-study', meta: { title: '课题' },
        component: () => import('@/views/teacher/research/StudyView.vue') },
      { path: 'research/study/:sid/report', name: 'tr-study-report', meta: { title: '课题结论' },
        component: () => import('@/views/teacher/research/StudyReportView.vue') },
      { path: 'research/analysis', name: 'tr-analysis', meta: { title: '班级分析' },
        component: () => import('@/views/teacher/research/AnalysisView.vue') },
      { path: 'research/export', name: 'tr-export', meta: { title: '数据导出' },
        component: () => import('@/views/teacher/research/ExportView.vue') },
      { path: 'research/profiles', name: 'tr-profiles', meta: { title: '学生画像' },
        component: () => import('@/views/teacher/research/ProfilesView.vue') },
      { path: 'research/cases', name: 'tr-cases', meta: { title: '教学案例' },
        component: () => import('@/views/teacher/research/CasesView.vue') },
      { path: 'research/rubrics', name: 'tr-rubrics', meta: { title: '量规' },
        component: () => import('@/views/teacher/research/RubricsView.vue') },
      { path: 'research/report', name: 'tr-report', meta: { title: '研究报告' },
        component: () => import('@/views/teacher/research/ReportView.vue') },
    ],
  },
  { path: '/', redirect: '/login' },
  { path: '/:pathMatch(.*)*', redirect: '/login' },
]

const router = createRouter({ history: createWebHistory(), routes })

// 师生分离守卫（§4.4 前端部分）：role 不符则导向各自首页或登录
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.initializeSession()
  if (to.meta.public) {
    if (auth.isLoggedIn) return auth.role === 'teacher' ? '/teacher' : '/student'
  } else {
    if (!auth.isLoggedIn) return '/login'
    if (to.meta.role && to.meta.role !== auth.role) {
      return auth.role === 'teacher' ? '/teacher' : '/student'
    }
  }
  // 标签页标题：路由中文短名 · 产品名（重定向分支会再进一次守卫，由最终落地页设置）
  document.title = (typeof to.meta.title === 'string' ? to.meta.title + ' · ' : '') + '结对编程智能体'
  return true
})

export default router
