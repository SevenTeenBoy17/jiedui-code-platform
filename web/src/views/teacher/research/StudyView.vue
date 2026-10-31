<!-- @copyBudget 80  教研·课题：一条线走完准实验（永远只显示一个主按钮） -->
<template>
  <div class="st">
    <PageHead desc="两班对照，一条线走完准实验">
      <!-- classes 源没确认成功前不开新建：挂了的源不能当「有 0 个班」用 -->
      <button v-if="!study" class="ok" :disabled="!classesOk || classes.length < 2" @click="creating = true">新建课题</button>
    </PageHead>
    <p v-if="err" class="alert">{{ err }}</p>

    <!-- 还没有课题：只在 study 源确认成功后才这么说，源挂了不冒充空态 -->
    <GlassPanel v-if="studyOk && !study && !creating" class="intro">
      <h3 class="intro__t">开始一项课题研究</h3>
      <p class="intro__s">选两个班，平台替你收前后测、算对比。点右上「新建课题」开始。</p>
      <p v-if="classesOk && classes.length < 2" class="thin">先去「班级」建两个班</p>
      <!-- 说明性长文一律进折叠，首屏只留一句 -->
    </GlassPanel>

    <!-- 建课题 -->
    <NewStudy v-if="creating" :classes="classes" @close="creating = false" @done="onCreated" />

    <!-- 课题状态 + 唯一主按钮 -->
    <template v-if="study">
      <GlassPanel class="head">
        <div class="head__t">
          <b>{{ study.title }}</b>
          <span class="chip chip--primary">{{ PHASE_CN[study.phase] }}</span>
        </div>
        <p class="thin">{{ groupLine }}</p>

        <!-- 同意缺失的告警带**动作**。此前教师界面只能看到「N 人未登记」却无处开通 ——
             开通端点在前端零调用，40 人的班等于要老师去敲 API。批量的只是点击，不是审查：
             confirm 里仍要求确认已逐一核验纸质件。 -->
        <p v-if="study.consent_missing.length" class="warn">
          {{ study.consent_missing.length }} 人未登记监护人同意，不能作答测评
          <!-- busy 文案（R5 裁决4）：批量开通有网络往返，按住时要说「开通中…」 -->
          <button class="mini warn__act" :disabled="busy" @click="grantAll">{{ busy ? '开通中…' : '已核验纸质件，批量开通' }}</button>
        </p>
        <p v-for="(w, i) in warns" :key="i" class="warn">{{ w }}</p>

        <div class="acts">
          <button class="ok" :disabled="busy" @click="step(study.next_action.key)">
            {{ busy ? '处理中…' : study.next_action.label }}
          </button>
          <span class="thin">{{ study.next_action.hint }}</span>
        </div>
      </GlassPanel>

      <BentoGrid min="220px" class="stagger">
        <GlassPanel v-for="(c, i) in cards" :key="c.k" class="card" :style="{ '--i': i }">
          <b class="card__t">{{ c.k }}</b>
          <RingProgress v-if="c.pct !== null" :value="c.pct" size="52px">{{ c.pct }}%</RingProgress>
          <p v-else class="big">{{ c.big }}</p>
          <p class="thin">{{ c.sub }}</p>
        </GlassPanel>
      </BentoGrid>

      <!-- 轮次小测（蓝图 2.1/3.2）：干预期轮末 probe，按轮发放/关窗。
           红线：这里只看已交人数，不显示任何学生分数。状态源挂了给重试，不装作没发过。 -->
      <GlassPanel v-if="study.phase === 'running'" class="pr">
        <div class="pr__t"><b>轮次小测</b><span class="thin">轮末 5 分钟，只在干预期发放</span></div>
        <p v-if="probeErr" class="alert">
          {{ probeErr }}
          <button class="retry" @click="loadProbe">重试</button>
        </p>
        <div v-for="r in probeRows" :key="r.i" class="pr__row">
          <span class="pr__no">第 {{ r.i }} 轮</span>
          <span class="thin">{{ r.label }}</span>
          <span class="chip" :class="r.open ? 'chip--primary' : 'chip--muted'">{{ r.stateCn }}</span>
          <span class="thin pr__n">已交 {{ r.submitted ?? '—' }}{{ r.total != null ? ' / ' + r.total : '' }}</span>
          <button v-if="r.open" class="mini pr__act" :disabled="probeBusy" @click="closeProbe(r.i)">关窗</button>
          <button v-else class="mini pr__act" :disabled="probeBusy" @click="openProbe(r.i)">发放</button>
        </div>
      </GlassPanel>

      <!-- 成员名单 + 退出登记（伦理红线：随时可退）。名单从班级名册推得（课题按整班分组），
           收进折叠：这是低频动作面，不该常驻占屏。已退出者由本次会话标记；人数以刷新后的 n 为准。 -->
      <details class="more">
        <summary>成员名单（退出登记）</summary>
        <div class="ros">
          <div v-for="m in members" :key="m.id" class="ros__row">
            <span class="ros__nm">{{ m.name }}</span>
            <span class="chip" :class="m.group === 'exp' ? 'chip--primary' : 'chip--muted'">
              {{ m.group === 'exp' ? '实验' : '对照' }}
            </span>
            <span v-if="withdrawn.has(m.id)" class="chip chip--muted">已退出</span>
            <button v-else class="mini ros__x" @click="quitTarget = m">
              <BaseIcon name="x" :size="13" /> 退出
            </button>
          </div>
          <p v-if="!members.length" class="thin">班级里还没配学生，名单为空</p>
        </div>
      </details>

      <!-- 退出登记弹层（mask+sheet + useModalA11y，原因必填）——prompt() 不够格：无校验、无焦点圈闭 -->
      <WithdrawSheet v-if="quitTarget" :sid="study.id" :student="quitTarget"
                     @close="quitTarget = null" @done="onWithdrawn" />

      <div class="foot">
        <RouterLink v-if="study.phase === 'closed'" class="link" :to="`/teacher/research/study/${study.id}/report`">
          看对比结论 →
        </RouterLink>
        <details class="more">
          <summary>这项研究是怎么设计的</summary>
          <ul class="notes">
            <li>主要看的是<b>独立测评卷</b>的前后测得分，不是平台六维分——六维分会随着「用得多」上升，
              而实验组本来就会更多地问 AI、更多地改错，拿它当结论会把工具的副作用当成能力提升。</li>
            <li>六维分作为<b>过程指标</b>保留，用来解释「为什么会有差异」。</li>
            <li>分组按班级整体走：同一个班里一半学生的 AI 只提问、另一半照常写码，学生互相看屏幕，控制不住。</li>
            <li>口径（{{ study.scoring_profile }} / {{ study.formula_version }}）在建课题时就写死，事后改不了。</li>
          </ul>
        </details>
        <button class="mini ghost" @click="remove">删除课题</button>
      </div>
    </template>

    <p v-if="tip" class="toast">{{ tip }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { studyApi, type Study, type ProbeRoundStat } from '@/api/study'
import { teacherApi } from '@/api/teacher'
import { resourcesApi, type Klass } from '@/api/resources'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import BentoGrid from '@/components/ui/BentoGrid.vue'
import RingProgress from '@/components/ui/RingProgress.vue'
import PageHead from '@/components/ui/PageHead.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import NewStudy from '@/components/study/NewStudy.vue'
import WithdrawSheet from '@/components/study/WithdrawSheet.vue'
import { useToast } from '@/composables/useToast'

const PHASE_CN: Record<string, string> = {
  draft: '准备中', pretest: '前测中', running: '干预期', posttest: '后测中', closed: '已收官',
}

const study = ref<Study | null>(null)
const classes = ref<Klass[]>([])
/** 逐源确认位（照 TasksView 定稿模式）：区分「真没有」与「没取到」 */
const studyOk = ref(false)
const classesOk = ref(false)
const creating = ref(false)
const busy = ref(false)
const err = ref('')
const { tip, flash } = useToast()

// —— 成员名单 + 退出登记 ——
type Member = { id: string; name: string; group: 'exp' | 'ctrl' }
const rosterNames = ref<Record<string, string>>({})     // 全站名册：学号 → 姓名
const withdrawn = ref(new Set<string>())                // 本次会话登记过退出的人（服务端为准，见 n）
const quitTarget = ref<Member | null>(null)

/** 名单从班级名册推得（课题按整班分组，无独立成员端点）。跨班重复学号只记一次（先实验组） */
const members = computed<Member[]>(() => {
  const s = study.value
  if (!s) return []
  const out: Member[] = []
  const seen = new Set<string>()
  for (const [group, ids] of [['exp', s.exp_class_ids], ['ctrl', s.ctrl_class_ids]] as const) {
    for (const c of classes.value.filter((k) => ids.includes(k.id))) {
      for (const uid of c.student_ids) {
        if (seen.has(uid)) continue
        seen.add(uid)
        out.push({ id: uid, name: rosterNames.value[uid] || uid, group })
      }
    }
  }
  return out
})

/** 退出登记成功：行内标「已退出」，并刷新课题（n / 进度分母都会变） */
async function onWithdrawn() {
  if (quitTarget.value) withdrawn.value = new Set(withdrawn.value).add(quitTarget.value.id)
  quitTarget.value = null
  flash('已登记退出，数据不再计入对比')
  await load()
}

const pct = (p: { done: number; total: number }) => (p.total ? Math.round(p.done / p.total * 100) : 0)
const day = (ts: number) => new Date(ts * 1000).toLocaleDateString('zh-CN')
const days = computed(() => {
  const s = study.value
  if (!s?.started_at) return '—'
  const end = s.ended_at || Math.floor(Date.now() / 1000)
  return `${Math.max(1, Math.round((end - s.started_at) / 86400))} 天`
})

const groupLine = computed(() => {
  const s = study.value!
  return `实验组 ${s.exp_class_names.join('、')}（${s.n.exp} 人）· 对照组 ${s.ctrl_class_names.join('、')}（${s.n.ctrl} 人）`
})

/** 告警文案本来就依赖数据（哪个班设置对不上），生成在脚本里比写死在模板里准确。
    同意缺失的告警不在这里 —— 它带动作按钮，单独渲染在模板里。 */
const warns = computed(() => {
  const s = study.value
  if (!s) return []
  const out: string[] = []
  for (const b of s.fidelity.breaks) {
    out.push(`有班级的引导设置与分组不符（应${b.expected ? '开' : '关'}、实际${b.actual ? '开' : '关'}），影响干预保真度`)
  }
  return out
})

/** 批量开通监护人同意。合规上与逐个开通完全等价（服务端逐条记录经办人）；
    confirm 是审查动作的确认，不是可省略的仪式 —— 这里登记的是未成年人的监护人授权。 */
async function grantAll() {
  const ids = study.value!.consent_missing
  if (!confirm(`确认已逐一核验这 ${ids.length} 名学生的纸质监护人同意书？\n开通后他们即可作答测评并使用 AI。`)) return
  busy.value = true
  try {
    const r = await teacherApi.grantConsentBatch(ids)
    await load()
    // skipped 必须说出来：后端会拒掉形状不合法的 id、并在超 200 人时截断 ——
    // 只报「已开通 N 人」的话，被跳过的学生做不了测评还查不出原因
    flash(r.skipped ? `已开通 ${r.granted} 人，${r.skipped} 人被跳过（名单里有无效学号）` : `已开通 ${r.granted} 人`)
  } catch (e) {
    flash(e instanceof Error ? e.message : '开通失败')
  } finally { busy.value = false }
}

// —— 轮次小测（probe）——
/** 轮结构是全站常量（R1能跑/R2跑对/R3跑好，learner.py 同源），行骨架本地生成；
    状态/已交人数来自服务端，没取到显示 —（不冒充 0）。 */
const ROUND_LABELS = ['R1 · 能跑', 'R2 · 跑对', 'R3 · 跑好']
const probe = ref<Record<number, ProbeRoundStat>>({})
const probeErr = ref('')
const probeBusy = ref(false)
const PROBE_STATE_CN: Record<string, string> = { open: '进行中', closed: '已关窗' }
const probeRows = computed(() => [1, 2, 3].map((i) => {
  const s = probe.value[i]
  return {
    i, label: ROUND_LABELS[i - 1],
    open: s?.status === 'open',
    stateCn: PROBE_STATE_CN[s?.status ?? ''] || '未发放',
    submitted: s ? s.submitted : null,
    total: s ? s.total : null,
  }
}))

async function loadProbe() {
  if (study.value?.phase !== 'running') return
  probeErr.value = ''
  try {
    const items = await studyApi.probeRounds(study.value.id)
    const map: Record<number, ProbeRoundStat> = {}
    for (const it of items) map[it.round_index] = it
    probe.value = map
  } catch {
    probeErr.value = '小测状态没取到，已交人数暂不可见'
  }
}

async function openProbe(i: number) {
  probeBusy.value = true
  try {
    await studyApi.probeOpen(study.value!.id, i)
    flash('已发放，学生端测评中心可见')
    await loadProbe()
  } catch (e) {
    flash(e instanceof Error ? e.message : '发放失败')
  } finally { probeBusy.value = false }
}

async function closeProbe(i: number) {
  probeBusy.value = true
  try {
    await studyApi.probeClose(study.value!.id, i)
    flash('已关窗')
    await loadProbe()
  } catch (e) {
    flash(e instanceof Error ? e.message : '关窗失败')
  } finally { probeBusy.value = false }
}

/** 三张卡的文案放进数据，模板里只剩插值 —— 常驻正文压到预算内，也少了三段重复标签 */
const cards = computed(() => {
  const s = study.value!
  return [
    { k: '前测', pct: pct(s.pre_progress), big: '', sub: `${s.pre_progress.done}/${s.pre_progress.total} 已交` },
    { k: '后测', pct: pct(s.post_progress), big: '', sub: `${s.post_progress.done}/${s.post_progress.total} 已交` },
    { k: '干预期', pct: null, big: days.value, sub: s.started_at ? `${day(s.started_at)} 起` : '还没开始' },
  ]
})

/**
 * 两源 allSettled 逐源降级（照 TasksView 定稿模式）：
 * 曾经 Promise.all 一荣俱荣 —— classes 一挂连课题也渲染成「还没有课题」的假空态。
 * study 挂 → 明说不代表没有课题（更重，优先报）；classes 挂 → 新建入口禁用并说明原因。
 * grantAll / step / onCreated 都复用本函数，自动受益。
 */
async function load() {
  const [list, cs] = await Promise.allSettled([studyApi.list(), resourcesApi.classes()])
  if (list.status === 'fulfilled') { study.value = list.value[0] || null; studyOk.value = true }
  if (cs.status === 'fulfilled') {
    classes.value = cs.value.items
    classesOk.value = true
    // 名册顺手存成映射：成员名单显示姓名而不是裸学号
    rosterNames.value = Object.fromEntries((cs.value.roster || []).map((r) => [r.id, r.name]))
  }
  err.value = list.status === 'rejected'
    ? '课题信息没取到，不代表没有课题'
    : cs.status === 'rejected'
      ? '班级列表读取失败，暂不能新建课题'
      : ''
  loadProbe()   // 自带 running 相位守卫；grantAll/step/onCreated 复用 load() 时同步刷新
}

async function onCreated() {
  creating.value = false
  await load()
  flash('课题已创建')
}

/** 状态机推进。前测没收齐时后端会返回 blocked —— 由老师决定是否坚持开始，并留痕。 */
async function step(key: string) {
  if (key === 'report') return
  busy.value = true
  try {
    const r = await studyApi.step(study.value!.id, key)
    if (r?.blocked) {
      if (!confirm(`${r.message}\n\n仍要继续吗？`)) return
      await studyApi.step(study.value!.id, key, { force: true })
    }
    await load()
    flash('已完成这一步')
  } catch (e) {
    flash(e instanceof Error ? e.message : '操作失败')
  } finally { busy.value = false }
}

async function remove() {
  if (!confirm('删除这项课题？已收集的测评作答不会被删除，但分组与快照会一并清掉。')) return
  try {
    await studyApi.remove(study.value!.id)
    await load()
    flash('已删除')
  } catch (e) { flash(e instanceof Error ? e.message : '删除失败') }
}

onMounted(load)
</script>

<style scoped>
.st { display: flex; flex-direction: column; gap: var(--sp-3); }
.intro, .form, .head { display: flex; flex-direction: column; gap: var(--sp-2); }
.intro__t { font-size: var(--fs-md); font-weight: var(--fw-bold); }
.intro__s { font-size: var(--fs-sm); color: var(--color-text-2); line-height: 1.8; }
.thin { font-size: var(--fs-xs); color: var(--color-text-3); line-height: 1.7; }
.warn { font-size: var(--fs-xs); color: var(--color-accent-ontext); background: var(--color-warning-soft);
  padding: 6px 10px; border-radius: var(--r-md); line-height: 1.6; }
/* .alert 已收编为 global.css 全局错误条 */
.head__t { display: flex; align-items: center; gap: 8px; font-size: var(--fs-md); }
.f { display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-xs); color: var(--color-text-2); }
.f input, .f select { height: 38px; border: 1px solid var(--color-border); background: var(--color-surface);
  border-radius: var(--r-md); padding: 0 var(--sp-3); outline: none; font: inherit; font-size: var(--fs-sm); color: var(--color-text); }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); }
.picks { display: flex; flex-wrap: wrap; gap: 4px 10px; max-height: 110px; overflow: auto; }
.pick { display: flex; align-items: center; gap: 4px; cursor: pointer; }
.acts { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.ok { border: none; background: var(--on-primary-bg); color: var(--on-primary-fg); padding: 10px 20px;
  border-radius: var(--r-md); cursor: pointer; font-weight: var(--fw-medium); }
.ok:disabled { opacity: .5; cursor: not-allowed; }
.cancel { border: none; background: var(--ink-a06); color: var(--color-text-2); padding: 10px 18px;
  border-radius: var(--r-md); cursor: pointer; }
.card { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.card__t { font-size: var(--fs-sm); font-weight: var(--fw-bold); }
.big { font-size: var(--fs-lg); font-weight: var(--fw-bold); font-variant-numeric: tabular-nums; }
.foot { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.link { color: var(--color-primary-ontext); text-decoration: none; font-weight: var(--fw-medium); font-size: var(--fs-sm); }
.more { font-size: var(--fs-xs); }
.more > summary { cursor: pointer; color: var(--color-primary-ontext); }
.notes { margin: 8px 0 0; padding-left: 18px; color: var(--color-text-2); font-size: var(--fs-xs); }
.notes li { margin-bottom: 6px; line-height: 1.8; }
.mini { border: none; font-size: var(--fs-xs); padding: 4px 12px; border-radius: var(--r-pill); cursor: pointer; }
.pr { display: flex; flex-direction: column; gap: var(--sp-2); }
.pr__t { display: flex; align-items: baseline; gap: var(--sp-2); font-size: var(--fs-sm); }
.pr__row { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap;
  padding: 6px 0; border-bottom: 1px solid var(--color-border-weak); }
.pr__row:last-child { border-bottom: none; padding-bottom: 0; }
.pr__no { font-size: var(--fs-sm); font-weight: var(--fw-medium); font-variant-numeric: tabular-nums; }
.pr__n { margin-left: auto; font-variant-numeric: tabular-nums; }
.pr__act { background: var(--on-primary-bg); color: var(--on-primary-fg); }
.pr__act:disabled { opacity: .5; cursor: not-allowed; }
.warn__act { background: var(--on-primary-bg); color: var(--on-primary-fg); margin-left: 10px; }
.warn__act:disabled { opacity: .5; cursor: not-allowed; }
.mini.ghost { background: var(--ink-a06); color: var(--color-text-3); margin-left: auto; }
/* —— 成员名单（折叠内）—— */
.ros { margin-top: var(--sp-2); display: flex; flex-direction: column; }
.ros__row { display: flex; align-items: center; gap: var(--sp-2);
  padding: 5px 0; border-bottom: 1px solid var(--color-border-weak); }
.ros__row:last-of-type { border-bottom: none; }
.ros__nm { font-size: var(--fs-sm); min-width: 72px; }
.ros__x { display: inline-flex; align-items: center; gap: 4px; margin-left: auto;
  background: var(--ink-a06); color: var(--color-text-2); }

</style>
