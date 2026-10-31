<template>
  <div class="workspace-page fade-in" data-testid="workspace-page">
    <div class="workspace-content">
      <template v-if="activeSection === 'start'">
        <section class="welcome-card" aria-labelledby="welcome-title">
          <PairDuoIllustration class="welcome-duo" label="树小骥导航员与熊猫泡泡领航员陪伴学习" />
          <div class="welcome-copy">
            <span class="teacher-chip"><BaseIcon name="school" :size="15" />{{ pushesErr ? '教师说明同步失败' : nextPush ? '教师任务已同步' : '引导式学习工作台' }}</span>
            <h2 id="welcome-title">{{ auth.user?.name || '小创客' }}，今天想完成什么任务？</h2>
            <p>{{ nextReason }}</p>
            <div class="hero-actions">
              <button class="primary-action" type="button" title="继续当前教师任务或结对学习" :data-task-target-id="nextTask?.target_id || ''" @click="goNext">
                <BaseIcon name="play" :size="17" />{{ nextTask ? '继续当前任务' : '开始结对学习' }}
              </button>
              <button class="secondary-action" type="button" title="查看教师下发任务及原因" @click="setSection('tasks')">
                <BaseIcon name="clipboard" :size="18" />查看课堂任务
              </button>
            </div>
          </div>
          <span class="hero-orbit hero-orbit--one" aria-hidden="true">&lt;/&gt;</span>
          <span class="hero-orbit hero-orbit--two" aria-hidden="true">{ }</span>
        </section>

        <section class="status-grid" aria-label="当前学习概况">
          <article class="status-card status-card--works">
            <span class="status-icon"><BaseIcon name="folder" :size="22" /></span>
            <div><small>我的作品</small><b>{{ projectsBusy || projectsErr ? '—' : `${projects.length} 个` }}</b></div>
            <button type="button" aria-label="查看我的作品" @click="setSection('works')"><BaseIcon name="arrow-right" /></button>
          </article>
          <article class="status-card status-card--tasks">
            <span class="status-icon"><BaseIcon name="clipboard" :size="22" /></span>
            <div><small>待完成任务</small><b>{{ chainBusy || chainErr ? '—' : `${pendingTasks} 个` }}</b></div>
            <button type="button" aria-label="查看课堂任务" @click="setSection('tasks')"><BaseIcon name="arrow-right" /></button>
          </article>
          <article class="status-card status-card--next" :data-task-target-id="nextTask?.target_id || ''">
            <span class="status-icon"><BaseIcon name="compass" :size="22" /></span>
            <div><small>现在要做</small><b :title="nextTitle">{{ nextTitle }}</b></div>
            <button type="button" aria-label="继续下一步" @click="goNext"><BaseIcon name="arrow-right" /></button>
          </article>
        </section>

        <section class="path-card" aria-labelledby="path-title">
          <div class="section-heading">
            <div><h2 id="path-title">六步学习路径</h2></div>
            <button class="text-link" type="button" @click="goNext">进入任务 <BaseIcon name="arrow-right" /></button>
          </div>
          <ol class="learning-path">
            <li v-for="(step, index) in learningPath" :key="step.label">
              <span>{{ index + 1 }}</span>
              <div><b>{{ step.label }}</b><small>{{ step.help }}</small></div>
            </li>
          </ol>
        </section>

        <section class="create-section" aria-labelledby="create-title">
          <div class="section-heading compact">
            <div><h2 id="create-title">开始创作</h2></div>
          </div>
          <div class="launcher-grid">
            <button class="mode-card mode-card--feature" data-testid="create-graphical" title="拖拽积木并查看对应代码" @click="openMode('blocks')">
              <span class="mode-copy"><b>图形化编程</b><small>用积木梳理算法，再进入代码</small></span>
              <span class="block-stack" aria-hidden="true"><i>当开始</i><i>重复 4 次</i><i>前进 80 步</i></span>
              <span class="mode-entry">开始创作 <BaseIcon name="arrow-right" :size="17" /></span>
            </button>
            <button class="mode-card mode-card--language python-card" data-testid="create-python" title="Python 文本编程与真实运行" @click="openMode('python')">
              <span class="lang-badge python">Py</span><span class="mode-copy"><b>Python</b><small>文本编程 · 运行 · 测试</small></span><BaseIcon name="arrow-right" :size="19" />
            </button>
            <button class="mode-card mode-card--language cpp-card" data-testid="create-cpp" title="C++ 编译运行与测试" @click="openMode('cpp')">
              <span class="lang-badge cpp">C++</span><span class="mode-copy"><b>C++</b><small>编译运行 · 测试优化</small></span><BaseIcon name="arrow-right" :size="19" />
            </button>
          </div>
        </section>
      </template>

      <section v-else-if="activeSection === 'works'" class="list-card full-panel" data-testid="works-list" aria-labelledby="works-title">
        <div class="panel-back"><button type="button" @click="setSection('start')"><BaseIcon name="arrow-left" />返回学习首页</button></div>
        <div class="section-heading">
          <div><h2 id="works-title">我的作品</h2><p>继续已有版本，或从新的语言入口开始</p></div>
          <button class="primary-action" type="button" @click="openMode('blocks')"><BaseIcon name="plus" />新建作品</button>
        </div>
        <p v-if="projectsBusy" class="empty-state">正在读取作品</p>
        <div v-else-if="projectsErr" class="empty-state"><b>作品暂未加载</b><button type="button" @click="loadProjects">重试</button></div>
        <div v-else-if="projects.length" class="rows">
          <button v-for="project in projects" :key="project.id" class="work-row" :data-testid="`work-row-${project.id}`" @click="openProject(project)">
            <span :class="['lang-badge', project.language]">{{ languageLabel(project.language) }}</span>
            <span class="row-copy"><b>{{ project.title }}</b><small>版本 {{ project.latest_version }}</small></span>
            <span class="row-action">继续 <BaseIcon name="arrow-right" /></span>
          </button>
        </div>
        <div v-else class="empty-state"><b>暂未读取到作品</b><span>可以从图形化、Python 或 C++ 开始第一件作品</span></div>
      </section>

      <section v-else-if="activeSection === 'tasks'" class="list-card full-panel" data-testid="task-list" aria-labelledby="tasks-title">
        <div class="panel-back"><button type="button" @click="setSection('start')"><BaseIcon name="arrow-left" />返回学习首页</button></div>
        <div class="section-heading">
          <div><h2 id="tasks-title">课堂任务</h2><p>这里显示教师下发的任务、原因和完成状态</p></div>
          <button class="primary-action" type="button" @click="goNext"><BaseIcon name="arrow-right" />继续下一项</button>
        </div>
        <div v-if="pushesErr || taskNotice" class="task-notice" role="status">
          <span>{{ taskNotice || pushErrorText }}</span>
          <button v-if="pushesErr" type="button" @click="loadLearningData">重试同步</button>
        </div>
        <p v-if="chainBusy" class="empty-state">正在同步教师任务</p>
        <div v-else-if="chainErr" class="empty-state"><b>任务暂未加载</b><button type="button" @click="loadLearningData">重试</button></div>
        <div v-else-if="chain.length" class="rows">
          <button v-for="(task, index) in chain" :key="task.target_id" class="task-row" :data-task-target-id="task.target_id" @click="openTask(task)">
            <span :class="['task-index', { done: task.done }]">{{ task.done ? '完成' : index + 1 }}</span>
            <span class="row-copy"><b>{{ task.title }}</b><small>{{ pushReason(task) }}</small></span>
            <span class="row-status">{{ taskStatus(task) }}</span>
            <span class="row-action">{{ task.done ? '查看' : '继续' }} <BaseIcon name="arrow-right" /></span>
          </button>
        </div>
        <div v-else class="empty-state"><b>暂无教师下发任务</b><span>你仍可进入结对编程进行自主练习</span><button type="button" @click="goPair">开始自主练习</button></div>
      </section>

      <section v-else class="list-card full-panel" data-testid="search-results" aria-labelledby="search-title">
        <div class="panel-back"><button type="button" @click="clearSearch"><BaseIcon name="arrow-left" />返回学习首页</button></div>
        <div class="section-heading"><div><h2 id="search-title">搜索结果</h2><p>关键词“{{ searchQuery }}”</p></div></div>
        <p v-if="projectsBusy || chainBusy" class="empty-state">正在搜索作品和课堂任务</p>
        <template v-else>
          <div v-if="matchedProjects.length || matchedTasks.length" class="rows search-rows">
            <button v-for="project in matchedProjects" :key="`project-${project.id}`" class="work-row" @click="openProject(project)">
              <span :class="['lang-badge', project.language]">{{ languageLabel(project.language) }}</span><span class="row-copy"><b>{{ project.title }}</b><small>我的作品 · 版本 {{ project.latest_version }}</small></span><span class="row-action">打开 <BaseIcon name="arrow-right" /></span>
            </button>
            <button v-for="task in matchedTasks" :key="`task-${task.target_id}`" class="task-row" @click="openTask(task)">
              <span :class="['task-index', { done: task.done }]">任务</span><span class="row-copy"><b>{{ task.title }}</b><small>{{ pushReason(task) }}</small></span><span class="row-action">打开 <BaseIcon name="arrow-right" /></span>
            </button>
          </div>
          <div v-else class="empty-state"><b>没有找到匹配内容</b><span>换一个作品名或任务关键词试试</span></div>
        </template>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { projectsApi, type Project } from '@/api/projects'
import { resourcesApi, type MyPush, type TaskNode } from '@/api/resources'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import PairDuoIllustration from '@/components/pair/PairDuoIllustration.vue'

type HomeSection = 'start' | 'works' | 'tasks' | 'search'
type WorkspaceMode = 'blocks' | 'python' | 'cpp'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const projects = ref<Project[]>([])
const projectsBusy = ref(true)
const projectsErr = ref(false)
const chain = ref<TaskNode[]>([])
const chainBusy = ref(true)
const chainErr = ref(false)
const pushes = ref<MyPush[]>([])
const pushesBusy = ref(true)
const pushesErr = ref(false)
const taskNotice = ref('')
const pushErrorText = '教师说明暂时无法同步，任务本身仍可继续。'

const learningPath = [
  { label: '任务', help: '明确目标' },
  { label: '分析', help: '输入·输出·约束' },
  { label: '建模', help: '伪代码与步骤' },
  { label: '编码', help: '实现并运行' },
  { label: '测试', help: '验证与优化' },
  { label: '反思', help: '总结与迁移' },
]
const searchQuery = computed(() => queryText(route.query.q).trim())
const activeSection = computed<HomeSection>(() => {
  if (searchQuery.value) return 'search'
  const value = queryText(route.query.section)
  return value === 'works' || value === 'tasks' ? value : 'start'
})
const pendingTasks = computed(() => chain.value.filter((item) => !item.done).length)
const nextTask = computed(() => chain.value.find((item) => !item.done) || null)
const nextPush = computed(() => nextTask.value ? pushFor(nextTask.value) || null : null)
const nextTitle = computed(() => nextTask.value?.title || '等待教师新任务')
const nextReason = computed(() => {
  if (pushesBusy.value) return '正在同步教师下发的学习说明…'
  if (pushesErr.value) return pushErrorText
  return nextPush.value?.reason || (nextTask.value ? '教师已下发任务，可按六步路径继续。' : '暂无新的教师说明，可以从六步路径开始自主创作。')
})
const matchedProjects = computed(() => {
  const q = searchQuery.value.toLocaleLowerCase()
  return projects.value.filter((item) => item.title.toLocaleLowerCase().includes(q))
})
const matchedTasks = computed(() => {
  const q = searchQuery.value.toLocaleLowerCase()
  return chain.value.filter((item) => `${item.title} ${pushReason(item)}`.toLocaleLowerCase().includes(q))
})

function queryText(value: unknown) {
  if (Array.isArray(value)) return String(value[0] || '')
  return value == null ? '' : String(value)
}
function setSection(section: Exclude<HomeSection, 'search'>) {
  if (section !== 'tasks') taskNotice.value = ''
  const query: Record<string, string> = {}
  if (section !== 'start') query.section = section
  router.replace({ path: '/student/home', query })
}
function clearSearch() { router.replace('/student/home') }
function languageLabel(language: Project['language']) { return language === 'python' ? 'Python' : language === 'cpp' ? 'C++' : 'C' }
function openMode(mode: WorkspaceMode) { router.push({ path: '/student/ide', query: { mode } }) }
function openProject(project: Project) { router.push({ path: '/student/ide', query: { project: String(project.id) } }) }
function pushFor(task: TaskNode) { return pushes.value.find((item) => item.target_id === task.target_id || (item.res_id === task.res_id && item.res_type === task.kind)) }
function pushReason(task: TaskNode) {
  if (pushesErr.value) return pushErrorText
  return pushFor(task)?.reason || (task.done ? '教师任务已完成' : '教师下发任务，等待继续')
}
function taskStatus(task: TaskNode) {
  if (task.done) return '已完成'
  if (task.kind === 'assessment') return '测评'
  if (task.kind === 'video') return '视频'
  return task.required ? '必做' : '选做'
}
function acknowledgePush(task: TaskNode) {
  const push = pushFor(task)
  if (!push || push.read_at) return
  resourcesApi.markRead(push.target_id).then(() => {
    push.read_at = Date.now()
    window.dispatchEvent(new CustomEvent('student-push-read'))
  }).catch(() => undefined)
}
function openTask(task: TaskNode) {
  acknowledgePush(task)
  taskNotice.value = ''
  if (task.kind === 'assessment') {
    router.push({ path: `/student/assess/${task.res_id}`, query: { t: String(task.target_id) } })
    return
  }
  if (task.kind === 'video') {
    taskNotice.value = '教师视频已保留在任务列表中；学生播放器尚未接入。'
    setSection('tasks')
    return
  }
  if (task.kind !== 'exercise' && task.kind !== 'set') {
    taskNotice.value = '这类教师资源尚未接入对应学习区。'
    setSection('tasks')
    return
  }
  router.push({ path: '/student/ide', query: { mode: 'blocks', taskId: String(task.target_id), resourceId: String(task.res_id), taskTitle: task.title } })
}
function goNext() { if (nextTask.value) openTask(nextTask.value); else goPair() }
function goPair() { router.push('/student/studio') }

async function loadProjects() {
  projectsBusy.value = true; projectsErr.value = false
  try { projects.value = await projectsApi.list() } catch { projectsErr.value = true } finally { projectsBusy.value = false }
}
async function loadLearningData() {
  chainBusy.value = true; chainErr.value = false; pushesBusy.value = true; pushesErr.value = false
  const [tasksResult, pushesResult] = await Promise.allSettled([resourcesApi.taskChain(), resourcesApi.myPushes()])
  if (tasksResult.status === 'fulfilled') chain.value = tasksResult.value
  else chainErr.value = true
  if (pushesResult.status === 'fulfilled') pushes.value = pushesResult.value.items
  else pushesErr.value = true
  chainBusy.value = false; pushesBusy.value = false
}
onMounted(() => Promise.allSettled([loadProjects(), loadLearningData()]))
</script>

<style scoped>
.workspace-page { min-height: 100%; padding: 10px 42px 26px 28px; box-sizing: border-box; }
.workspace-content { width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
.welcome-card, .path-card, .create-section, .list-card { border: 1px solid #e8eaf1; border-radius: 22px; background: #fff; box-shadow: 0 7px 20px rgba(57,65,104,.06); }
.welcome-card { position: relative; height: 248px; box-sizing: border-box; padding: 28px 42px 28px clamp(340px, 27vw, 410px); display: flex; align-items: center; overflow: hidden; background: radial-gradient(circle at 86% 23%, rgba(255,255,255,.9), transparent 24%), linear-gradient(112deg, #ececff 0%, #f2edff 58%, #f8f4ff 100%); }
.welcome-duo { position: absolute; left: 10px; top: 18px; bottom: 18px; width: clamp(280px, 27vw, 350px); height: calc(100% - 36px); filter: drop-shadow(0 18px 22px rgba(77,70,143,.14)); pointer-events: none; }
.welcome-copy { position: relative; z-index: 2; max-width: 640px; }
.teacher-chip { width: fit-content; min-height: 28px; padding: 0 10px; border: 1px solid rgba(127,130,222,.22); border-radius: 999px; display: inline-flex; align-items: center; gap: 6px; color: #6265b7; background: rgba(255,255,255,.72); font-size: 11px; font-weight: 700; }
.welcome-card h2 { max-width: 580px; margin: 10px 0 8px; font-size: clamp(28px, 2.6vw, 39px); line-height: 1.16; letter-spacing: -.025em; }
.welcome-card p { max-width: 650px; margin: 0; overflow: hidden; color: #676d7e; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.hero-actions { margin-top: 19px; display: flex; flex-wrap: wrap; gap: 10px; }
.primary-action, .secondary-action { min-height: 43px; padding: 0 17px; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font: inherit; font-size: 13px; font-weight: 750; cursor: pointer; }
.primary-action { border: 1px solid #ee7617; color: #fff; background: #fc801c; box-shadow: 0 8px 18px rgba(243,119,24,.22); }
.secondary-action { border: 1px solid #cbcdef; color: #5b60bd; background: rgba(255,255,255,.78); }
.primary-action:hover, .secondary-action:hover { transform: translateY(-1px); box-shadow: var(--shadow-md); }
.hero-orbit { position: absolute; z-index: 1; display: grid; place-items: center; color: rgba(255,255,255,.88); background: rgba(116,122,220,.56); box-shadow: 0 9px 22px rgba(84,81,165,.16); font-family: var(--font-code); font-weight: 800; transform: rotate(8deg); }
.hero-orbit--one { right: 38px; top: 26px; width: 54px; height: 54px; border-radius: 18px; }
.hero-orbit--two { right: 114px; bottom: 24px; width: 38px; height: 38px; border-radius: 13px; font-size: 12px; transform: rotate(-8deg); }
.status-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.status-card { min-height: 118px; box-sizing: border-box; padding: 15px 16px; border: 1px solid #e7e8ef; border-radius: 20px; display: grid; grid-template-columns: 48px minmax(0, 1fr) 34px; align-items: center; gap: 12px; }
.status-card--works { background: #f1edff; }.status-card--tasks { background: #fff2e8; }.status-card--next { background: #eaf3ff; }
.status-icon { width: 48px; height: 48px; border-radius: 15px; display: grid; place-items: center; color: #6266c7; background: rgba(255,255,255,.86); box-shadow: 0 7px 15px rgba(70,77,130,.08); }
.status-card > div { min-width: 0; display: grid; gap: 2px; }
.status-card small { color: #74798a; font-size: 11px; }.status-card b { overflow: hidden; font-size: 18px; text-overflow: ellipsis; white-space: nowrap; }.status-card em { overflow: hidden; color: #8b90a0; font-size: 10px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
.status-card > button { width: 34px; height: 34px; border: 1px solid rgba(112,118,181,.18); border-radius: 50%; display: grid; place-items: center; color: #6266c7; background: rgba(255,255,255,.78); cursor: pointer; }
.path-card { height: 138px; box-sizing: border-box; padding: 17px 20px 18px; }
.create-section, .list-card { padding: 18px 20px; }
.create-section { min-height: 222px; margin-right: 122px; box-sizing: border-box; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 13px; }
.section-heading.compact { margin-bottom: 10px; }.section-heading h1, .section-heading h2 { margin: 0; font-size: 18px; }.section-heading p { margin: 3px 0 0; color: #8a8f9f; font-size: 10px; }
.task-notice { min-height: 42px; margin: -2px 0 13px; padding: 8px 12px; border: 1px solid #f1c99e; border-radius: 13px; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #8a571e; background: #fff8ec; font-size: 11px; }
.task-notice button { min-height: 30px; padding: 0 10px; border: 1px solid #e7b97f; border-radius: 9px; color: #80501c; background: #fff; font: inherit; cursor: pointer; }
.text-link { border: 0; background: none; color: #6266c7; font: inherit; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; }
.learning-path { list-style: none; margin: 0; padding: 3px 0 0; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); }
.learning-path li { min-width: 0; position: relative; display: flex; align-items: center; gap: 8px; }
.learning-path li:not(:last-child)::after { content: ''; height: 2px; margin-right: 8px; flex: 1; background: #e4e5ef; }
.learning-path li > span { flex: 0 0 31px; width: 31px; height: 31px; border-radius: 50%; display: grid; place-items: center; color: #6266c7; background: #ececff; font-size: 11px; font-weight: 800; }
.learning-path li:first-child > span { color: #fff; background: #8387df; box-shadow: 0 0 0 5px #eeeeff; }
.learning-path li > div { min-width: 0; display: grid; gap: 2px; white-space: nowrap; }.learning-path b { font-size: 12px; }.learning-path small { color: #969baa; font-size: 9px; }
.launcher-grid { display: grid; grid-template-columns: minmax(0, 1.28fr) minmax(210px, .86fr) minmax(210px, .86fr); gap: 12px; }
.mode-card { min-height: 150px; box-sizing: border-box; border: 1px solid #e5e7ef; border-radius: 19px; color: var(--color-text); font: inherit; text-align: left; cursor: pointer; transition: transform var(--dur-fast) var(--ease), box-shadow var(--dur-fast) var(--ease), border-color var(--dur-fast) var(--ease); }
.mode-card:hover { transform: translateY(-2px); border-color: #bfc2ea; box-shadow: 0 10px 24px rgba(65,72,120,.11); }
.mode-card--feature { padding: 16px 17px; display: grid; grid-template-columns: minmax(125px,.8fr) minmax(145px,1.2fr); grid-template-rows: 1fr auto; gap: 8px 14px; background: linear-gradient(135deg, #eeeaff, #f4f1ff); }
.mode-copy { min-width: 0; display: grid; align-content: center; gap: 5px; }.mode-copy b { font-size: 17px; }.mode-copy small { color: #777d8d; font-size: 10px; line-height: 1.45; }
.block-stack { min-height: 82px; padding: 10px 12px; border-radius: 14px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; background: rgba(255,255,255,.66); }
.block-stack i { padding: 5px 9px; border-radius: 6px; color: #fff; background: #5879eb; box-shadow: inset 0 -2px rgba(0,0,0,.08); font-size: 9px; font-style: normal; }.block-stack i:nth-child(2) { margin-left: 13px; background: #8869df; }.block-stack i:nth-child(3) { margin-left: 26px; background: #ee9a3b; }
.mode-entry { grid-column: 1 / -1; display: inline-flex; align-items: center; gap: 5px; color: #5c61bb; font-size: 11px; font-weight: 750; }
.mode-card--language { padding: 18px; display: grid; grid-template-columns: 54px minmax(0, 1fr) 20px; align-items: center; gap: 12px; }.python-card { background: #fff6df; }.cpp-card { background: #eaf4ff; }.mode-card--language > svg { color: #6266c7; }
.lang-badge { flex: 0 0 46px; width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; color: #2f62d9; background: #e8f0ff; font-size: 10px; font-weight: 800; }.lang-badge.python { color: #74550b; background: #ffe9a6; }.lang-badge.cpp { color: #6651cf; background: #e6e2ff; }.lang-badge.c { color: #188267; background: #e6f8f3; }
.full-panel { min-height: 560px; box-sizing: border-box; }.panel-back { margin-bottom: 18px; }.panel-back button { min-height: 36px; padding: 0; border: 0; display: inline-flex; align-items: center; gap: 6px; color: #707587; background: transparent; font: inherit; font-size: 12px; cursor: pointer; }
.rows { display: grid; gap: 9px; }.work-row, .task-row { min-height: 68px; width: 100%; padding: 9px 12px; border: 1px solid #e5e7ee; border-radius: 15px; background: #fff; display: flex; align-items: center; gap: 12px; color: var(--color-text); font: inherit; text-align: left; cursor: pointer; }.work-row:hover, .task-row:hover { border-color: #bfc2ea; background: #f7f6ff; }
.row-copy { min-width: 0; flex: 1; display: grid; gap: 3px; }.row-copy b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }.row-copy small { overflow: hidden; color: #858a99; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }.row-action { display: inline-flex; align-items: center; gap: 3px; color: #5d62bb; font-size: 11px; white-space: nowrap; }.row-status { min-width: 46px; padding: 5px 8px; border-radius: 999px; color: #6b70c5; background: #eeeefe; font-size: 9px; text-align: center; }
.task-index { flex: 0 0 44px; min-width: 44px; height: 32px; padding: 0 7px; border: 1px solid #e1e3eb; border-radius: 999px; display: grid; place-items: center; color: #858a99; font-size: 9px; }.task-index.done { color: #287e64; background: #e9f8f2; border-color: transparent; }
.empty-state { min-height: 180px; padding: 24px; margin: 0; border: 1px dashed #dfe1ea; border-radius: 18px; background: #fafbfc; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; color: #8b90a0; text-align: center; font-size: 11px; }.empty-state b { color: #5d6373; font-size: 14px; }.empty-state button { min-height: 36px; margin-top: 5px; padding: 0 14px; border: 0; border-radius: 12px; color: #fff; background: #7f83dd; font: inherit; cursor: pointer; }
button:focus-visible { outline: 3px solid rgba(107,111,208,.25); outline-offset: 3px; }
@media (max-width: 1220px) {
  .workspace-page { padding-inline: 18px; }.welcome-card { padding-left: 315px; }.welcome-duo { left: 0; width: 300px; }.create-section { margin-right: 0; }.launcher-grid { grid-template-columns: 1.1fr .9fr .9fr; }.mode-card--feature { grid-template-columns: 1fr; }.block-stack { display: none; }
}
@media (max-width: 900px) {
  .workspace-page { padding: 12px; }.welcome-card { height: auto; min-height: 340px; padding: 190px 22px 24px; align-items: flex-end; }.welcome-duo { top: 8px; bottom: auto; left: 50%; width: min(330px, calc(100% - 32px)); height: 174px; transform: translateX(-50%); }.welcome-copy { text-align: center; margin: 0 auto; }.teacher-chip, .hero-actions { margin-inline: auto; }.welcome-card p { white-space: normal; }.hero-orbit { display: none; }.status-grid, .launcher-grid { grid-template-columns: 1fr; }.path-card { height: auto; }.learning-path { grid-template-columns: repeat(6, 116px); padding-bottom: 10px; overflow-x: auto; }.mode-card { min-height: 118px; }.mode-card--feature { grid-template-columns: minmax(140px,.8fr) minmax(180px,1.2fr); }.block-stack { display: flex; }
}
@media (max-width: 560px) {
  .workspace-page { padding: 9px; }.welcome-card { padding-inline: 16px; }.welcome-card h2 { font-size: 25px; }.primary-action, .secondary-action { flex: 1; }.mode-card--feature { grid-template-columns: 1fr; }.block-stack { display: none; }.mode-card--language { grid-template-columns: 48px minmax(0, 1fr) 20px; }.row-status { display: none; }.row-action { font-size: 0; }
}
@media (prefers-reduced-motion: reduce) { .mode-card, .primary-action, .secondary-action { transition: none; } }
</style>
