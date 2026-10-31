<!-- @copyBudget 90  严格会话增加必要的来源/保存版本说明；帮助与隐私细节折叠，旧课堂壳不变。 -->
<template>
  <div class="studio">
    <!-- 顶栏：结对台是主角 -->
    <header class="top glass">
      <PairDock :role="role" @update:role="onRole" />
      <div v-if="isLegacy" class="top__right">
        <!-- 房间号沿用现有课堂上下文；已填写时显示徽章，要修改去「＋」菜单。 -->
        <span v-if="room" class="room-badge" :title="`本机房间号：${room}（要改去「＋」菜单）`">{{ room }}</span>
        <!-- 教学轮徽章：任务框架（R1能跑/R2跑对/R3跑好），不显示支架档位——
             降档污名化效应未知（三波总审§8），档位只进教师端 -->
        <span v-if="learner?.exists" class="round-badge"
              :title="`本轮目标：把程序做到「${ROUND_GOAL[learner.round_index] || ''}」`">
          第{{ learner.round_index }}轮 · {{ ROUND_GOAL[learner.round_index] || '' }}
        </span>
        <span class="lock on" :class="{ locked }" role="img" :aria-label="locked ? '教师已锁定提问引导' : '只提问，不代写'"
          :title="locked ? '老师已锁定本节课的提问引导' : '两位伙伴均只提问，不代写答案'">
          <BaseIcon :name="locked ? 'lock' : 'check-square'" />
        </span>
      </div>
    </header>

    <div class="body">
      <!-- 读屏播报（裁决5）：AI 的思考/回复状态对视觉用户是动画点，对读屏用户在这里说 -->
      <div class="sr-only" role="status" aria-live="polite">{{ liveMsg }}</div>
      <!-- 中央：对话画布（唯一主体） -->
      <main class="canvas" ref="canvasEl">
        <section v-if="!isLegacy" class="trusted-context" aria-label="课堂会话">
          <p v-if="trusted.loading.value" role="status">读取中…</p>
          <template v-else-if="trusted.session.value">
            <h2>正在讨论：{{ trusted.session.value.task_snapshot.title || '课堂任务' }}</h2>
            <p class="trusted-context__rule">{{ trusted.round.value ? `第 ${trusted.round.value.round_index} 轮` : '本轮已结束' }} · 本会话规则：{{ trustedPolicyText }}</p>
            <p class="trusted-context__version">发送时读取已保存版本，不包含未保存草稿。</p>
            <p v-if="trusted.reason.value" class="trusted-context__reason">{{ trusted.reason.value }}</p>
            <button v-if="trusted.canOpenRound.value" class="sug-chip" @click="trusted.openRound()">开始下一轮</button>
            <details class="channel-note">
              <summary>本次参考什么？</summary>
              <p>AI 本次参考本任务和已保存版本，不自动读取先前对话；无保存版本时仅参考任务材料。页面可回看本次问题与回复，不代表学习总结。</p>
              <p>真人职责：{{ trusted.session.value.human_role === 'driver' ? '操作代码' : '协助检查' }}（教师分配，不代表实际履职）。IP 是辅导视角，不代替真人职责。</p>
              <p>切换账号、会话或轮次会清空本页对话和未发送内容。题目、保存代码和本次问题会经隐私处理后用于 AI 辅导。</p>
              <button class="sug-chip" @click="chooseSession('')">选择其他会话</button>
            </details>
          </template>
          <template v-else-if="trusted.mode.value === 'trusted_required' && !trusted.error.value">
            <h2>选择课堂会话</h2>
            <div v-if="trusted.available.value.length" class="trusted-context__choices">
              <button v-for="item in trusted.available.value" :key="item.session_id" class="sug-chip" @click="chooseSession(item.session_id)">{{ item.task_snapshot.title || '课堂任务' }} · {{ item.session_id.slice(-6) }}</button>
            </div>
            <p v-else>还没有可用的课堂会话，请老师建立并配置会话。</p>
          </template>
          <p v-if="contextNotice" class="trusted-context__notice" role="status">{{ contextNotice }}</p>
          <div v-if="trusted.error.value" ref="errorEl" class="trusted-context__error" role="alert" tabindex="-1">
            <p>{{ trusted.error.value.message }}</p>
            <button v-if="trusted.error.value.status === 401" class="sug-chip" @click="recoverLogin">重新登录</button>
            <button v-else-if="trusted.uncertain.value" class="sug-chip" :disabled="trusted.checkingStatus.value" @click="trusted.checkRequestStatus()">查询本次状态</button>
            <button v-else class="sug-chip" @click="trusted.reload()">重新读取会话</button>
          </div>
        </section>
        <div v-if="!msgs.length" class="hello">
          <PairDuoIllustration v-if="isLegacy" class="hello__img" />
          <p class="hello__t">{{ isLegacy ? '把思路变成程序' : '本次问题与回复' }}</p>
          <p class="hello__s">{{ roleHint }}</p>
          <details class="channel-note">
            <summary>伙伴怎样帮我</summary>
            <p v-if="isLegacy">两位伙伴共用 AI 通道，通过提问帮你思考；程序由你完成。</p>
            <p v-else>{{ trustedPolicyText }} 程序由你完成；AI 不操作编辑器或替你运行。</p>
          </details>
          <div class="chips">
            <button v-for="q in starters" :key="q" class="sug-chip" :disabled="!canSend" @click="send(q)">{{ q }}</button>
          </div>
        </div>

        <article v-for="(m, i) in msgs" :key="i" class="msg" :class="m.who">
          <img v-if="m.who === 'ai'" :src="personaForLegacyRole(m.mate).image" class="msg__ava" :alt="personaForLegacyRole(m.mate).name" />
          <div class="bubble" :class="{ glass: m.who === 'ai' }">
            <img v-if="m.image" :src="m.image" class="bubble__img" alt="AI 生成的图" />
            <div v-else v-html="fmt(m.text)"></div>
            <i v-if="m.phase" class="phase">{{ phaseText(m) }}</i>
            <i v-if="m.source" class="phase">{{ sourceLabel(m.source) }}</i>
            <i v-if="m.receipt" class="phase">{{ receiptLabel(m.receipt) }}</i>
          </div>
        </article>

        <article v-if="busy" class="msg ai">
          <img :src="personaForLegacyRole(pendingRole).image" class="msg__ava" alt="" />
          <div class="bubble glass thinking">
            <i class="think-dot" /><i class="think-dot" /><i class="think-dot" />
          </div>
        </article>
      </main>

      <!-- 右侧：学习面板（默认 0px，按需展开） -->
      <InsightRail v-if="isLegacy && rail" :tab="railTab" :summary="lastSummary"
                   @tab="setRailTab" @close="toggleRail" @ask="send" />
    </div>

    <!-- 老师推送（不常驻，有内容才出现） + 进阶追问 -->
    <div class="belt">
      <TaskChip v-if="isLegacy" />
      <div v-if="nexts.length && !busy" class="nexts stagger">
        <button v-for="(n, i) in nexts" :key="n" class="sug-chip sug-chip--next" :disabled="!canSend" :style="{ '--i': i }" @click="send(n)">
          {{ n }}
        </button>
      </div>
    </div>

    <!-- 输入区。生图/总结/学习面板收进「＋」菜单：常驻只留「＋ 输入框 发送」三个控件。
         这是对话类产品的通用解法（Claude/ChatGPT 的 + 号），也是本页唯一能腾出交互配额的地方。 -->
    <footer class="composer glass">
      <div class="more" @keydown.esc="menu = false">
        <button class="act" :class="{ on: menu }" title="更多" aria-label="更多操作"
                aria-haspopup="menu" :aria-expanded="menu" :disabled="busy" @click="menu = !menu">
          <BaseIcon name="plus" />
        </button>
        <div v-if="menu" class="menu glass" data-lint="overlay">
          <button :disabled="!isLegacy" @click="pick(drawImage)"><BaseIcon name="image" /> {{ isLegacy ? '画一张图' : '本会话生图未开放' }}</button>
          <button v-if="isLegacy" :disabled="!msgs.length" @click="pick(summarize)"><BaseIcon name="clipboard" /> 总结这次学习</button>
          <button v-if="isLegacy" @click="pick(toggleRail)"><BaseIcon name="panel" /> 学习面板</button>
          <!-- 房间号是**一次性设置**（一节课填一次），按 lint 口径③⑤收进浮层，不占常驻屏 -->
          <label v-if="isLegacy" class="menu__room">房间号
            <input v-model.trim="room" placeholder="老师报的号" @change="rememberRoom" />
          </label>
        </div>
      </div>
      <textarea v-model="text" rows="1" :placeholder="placeholder" aria-label="给搭档发消息"
                :disabled="!isLegacy && !canSend" :maxlength="isLegacy ? undefined : 4000"
                @keydown.enter.exact.prevent="send()" />
      <button class="send" aria-label="发送" :disabled="!canSend || !text.trim()" @click="send()"><BaseIcon name="play" /></button>
    </footer>

    <MilestoneToast />

    <!-- 监护人同意门禁：整屏覆盖的阻断层，出现时页面其余部分不可用，按浮层单独计。
         焦点圈闭走 useModalA11y（裁决8）；**不接 Esc**：同意门不可跳过 -->
    <div v-if="isLegacy && consent === false" class="gate" data-lint="screen">
      <GlassPanel ref="gatePanel" strong class="gate__card"
                  role="dialog" aria-modal="true" aria-label="监护人同意" tabindex="-1">
        <img :src="PAIR_PERSONAS.review.image" class="gate__ava" alt="" />
        <h4>使用 AI 前需监护人同意</h4>
        <p>对话会做隐私脱敏与安全过滤，遇到不适内容会自动拦截并提醒老师。</p>
        <p class="gate__hint">{{ gateHint }}</p>
        <button class="gate__ok" :disabled="pending" @click="grant">
          {{ pending ? '已通知老师，等待核验' : '申请开通' }}
        </button>
      </GlassPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { aiApi, type ChatReply } from '@/api/ai'
import { type PairReceipt } from '@/api/pairSessions'
import { useTrustedPairContext } from '@/composables/useTrustedPairContext'
import { PAIR_PERSONAS, personaForLegacyRole, usePairPersona, type LegacyPairRole } from '@/data/pairPersonas'
import { learnerApi, type LearnerState } from '@/api/learner'
import { useAuthStore } from '@/stores/auth'
import { complianceApi } from '@/api/compliance'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import PairDock from '@/components/studio/PairDock.vue'
import PairDuoIllustration from '@/components/pair/PairDuoIllustration.vue'
import InsightRail from '@/components/studio/InsightRail.vue'
import TaskChip from '@/components/studio/TaskChip.vue'
import MilestoneToast from '@/components/studio/MilestoneToast.vue'
import { useModalA11y } from '@/composables/useModalA11y'
import { capability } from '@/composables/useDeviceCapability'

type Who = 'me' | 'ai'
interface Msg {
  who: Who; text: string; mate?: 'turtle' | 'reviewer'; image?: string
  phase?: 'written' | 'asked' | 'blocked'; asks?: number
  source?: ChatReply['source'] | 'model'
  receipt?: PairReceipt | null
}

const route = useRoute()
const router = useRouter()

const { persona, personaId, selectPersona, setRequestBusy } = usePairPersona()
const role = computed<LegacyPairRole>(() => persona.value.backendRole)
const pendingRole = ref<LegacyPairRole>(role.value)
const socratic = ref(true)
const locked = ref(false)          // 教师锁定（V3 教师端下发；此处读 query 占位）
const msgs = ref<Msg[]>([])
const text = ref('')
const busy = ref(false)
const nexts = ref<string[]>([])
const consent = ref<boolean | null>(null)
const canvasEl = ref<HTMLElement>()
const learner = ref<LearnerState | null>(null)  // 教学轮徽章（exists=false 时不渲染，缺省值不当真实状态）
/**
 * 房间号沿用课堂上下文并传给现有 AI 请求，不把 IP 选择记录为真人换位。
 * 保留服务端基于 roomId 的课堂目标与支架上下文。
 * URL ?room= 优先（老师可发带参链接/二维码），否则用本机记忆。
 */
const ROOM_KEY = 'cx-studio-room'
const room = ref(String(route.query.room || localStorage.getItem(ROOM_KEY) || ''))
function rememberRoom() {
  if (room.value) localStorage.setItem(ROOM_KEY, room.value)
  else localStorage.removeItem(ROOM_KEY)
}
/** 空串不传：服务端把 room 缺失记为 NULL 真值，不要用空字符串污染 */
const roomOpt = () => (room.value ? { roomId: room.value } : {})
const ROUND_GOAL: Record<number, string> = { 1: '能跑', 2: '跑对', 3: '跑好' }
const lastSummary = ref('')                 // 最近一次 AI 总结，回显进面板（原来只留在对话流里）
const menu = ref(false)                     // 「＋」菜单开合
const pending = ref(false)                  // 已提交开通申请、等教师核验
const gateHint = ref('')
const liveMsg = ref('')                     // 读屏播报文案（裁决5：aria-live 区域）
let awaitingSummary = false

// 同意门的焦点圈闭（裁决8）：只接圈闭与还焦点，不传 onClose —— Esc 不放行
const gatePanel = ref<InstanceType<typeof GlassPanel>>()
const gateEl = computed(() => (gatePanel.value?.$el as HTMLElement | undefined) ?? undefined)

/** 菜单项点完就收起 —— 菜单是浮层，不该停在屏幕上占位 */
function pick(fn: () => void) {
  menu.value = false
  fn()
}

/** 点菜单外任意处收起。不用透明背板：菜单的祖先带 backdrop-filter（.glass），
    滤镜会创建包含块 —— 背板的 position:fixed 被困在祖先盒内盖不到视口，
    stacking context 还会把菜单压到背板之下（三项全点不动）。文档级监听没有这些坑。 */
function onDocClick(e: MouseEvent) {
  if (!menu.value) return
  const t = e.target as HTMLElement | null
  // 用外层容器 more 判定（同时罩住 ＋ 按钮与菜单）；不能在脚本里写「点 menu 类」的
  // 选择器字符串 —— lint 用朴素正则在全文件里找浮层的 CSS 规则，会被脚本字符串抢先匹配
  if (t && !t.closest('.more')) menu.value = false
}

/** 面板开合与页签走 query：可分享、可后退、无布局跳变 */
const rail = computed(() => !!route.query.rail)
const railTab = computed(() => String(route.query.rail || 'summary'))
function toggleRail() {
  if (!isLegacy.value) return
  router.replace({ query: { ...route.query, rail: rail.value ? undefined : 'summary' } })
}
function setRailTab(t: string) {
  if (!isLegacy.value) return
  router.replace({ query: { ...route.query, rail: t } })
}

const roleHint = computed(() =>
  persona.value.description,
)
/**
 * 幽灵提问（领航员模式）：学生停手 20 秒后，把一条问题淡进**输入框的 placeholder**。
 * 它不是消息、不进对话流、不发请求、不埋点 —— 领航员的"在旁边看着"应该被感知到，
 * 但不能变成又一条打断学习的通知。
 * 上限：一次会话最多 2 次；学生一开始打字就撤掉。
 */
const ghost = ref('')
const GHOST_MAX = 2
let ghostShown = 0
let ghostTimer: number | undefined

const GHOSTS = [
  '要不要先说说，你觉得问题出在哪一步？',
  '这段代码你自己读一遍，最可疑的是哪行？',
]

function armGhost() {
  window.clearTimeout(ghostTimer)
  ghost.value = ''
  if (role.value !== 'reviewer' || ghostShown >= GHOST_MAX || !msgs.value.length) return
  ghostTimer = window.setTimeout(() => {
    if (text.value.trim()) return                 // 已经在打字了就别插嘴
    ghost.value = GHOSTS[ghostShown % GHOSTS.length]
    ghostShown++
  }, 20_000)
}

const placeholder = computed(() => {
  if (ghost.value) return ghost.value
  return role.value === 'turtle' ? '和树小骥说说你的目标与思路…' : '和熊猫泡泡一起检查代码或测试…'
})

watch(text, (v) => { if (v) { ghost.value = ''; window.clearTimeout(ghostTimer) } })
watch(role, armGhost)
const starters = computed(() =>
  role.value === 'turtle'
    ? ['帮我把任务拆成几步', '我想做一个猜数字游戏', '这段该怎么开始？']
    : ['帮我看看哪里可能有问题', '这个报错什么意思？', '怎么测试才全面？'],
)

/** 只说终态，不说进行时。响应是一次性返回的，「正在写…」在界面上是假的。 */
function phaseText(m: Msg): string {
  if (m.phase === 'written') return '回复含代码内容，仍需你独立判断'
  if (m.phase === 'blocked') return '这个我不能写，我们一起想'
  return m.asks ? `有 ${m.asks} 个问题要问你` : '换你想想看'
}
function sourceLabel(source: Msg['source']) {
  return source === 'model' ? '模型回复 · 仍需你核对' : source === 'llm' ? '现有 AI 通道回复' : source === 'fallback' ? '服务备用提示 · 非模型回复' : '安全规则提示'
}
function receiptLabel(receipt: PairReceipt) {
  const material = receipt.code_source === 'none' || !receipt.project_version_id ? '仅任务材料' : `本次参考 v${receipt.version_no ?? '（版本号未知）'}`
  return `${material} · ${receipt.socratic ? '本会话要求只提问' : '本会话辅导规则'} · 服务端已放行，不代表已理解`
}

function fmt(s: string) {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br/>')
}
function scroll() {
  nextTick(() => canvasEl.value && (canvasEl.value.scrollTop = canvasEl.value.scrollHeight))
}

/** Local follow-up prompts use this conversation's topic and chosen persona, never CT ranks. */
const TOPIC: { hit: RegExp; asks: string[] }[] = [
  { hit: /循环|for|while|遍历/i, asks: ['循环条件到边界时会怎样？', '能不能少循环一次就做完？'] },
  { hit: /if|条件|判断|分支/i, asks: ['哪些情况会同时满足两个条件？', '有没有漏掉的情况？'] },
  { hit: /函数|def|方法|参数/i, asks: ['这个函数换个输入还成立吗？', '能不能拆成两个更小的函数？'] },
  { hit: /列表|数组|list|字典|dict/i, asks: ['空列表时会发生什么？', '换成更大的数据还跑得动吗？'] },
  { hit: /输入|input|读取/i, asks: ['如果用户输入的不是数字呢？', '要不要先检查输入？'] },
  { hit: /报错|错误|error|异常|traceback/i, asks: ['这个报错指向第几行？', '你怎么验证它真的修好了？'] },
  { hit: /随机|random|猜数/i, asks: ['怎么保证每次结果都不一样？', '范围取错会怎样？'] },
]
function nextSteps(question: string, reply: string): string[] {
  const blob = `${question}\n${reply}`
  const hits = TOPIC.filter((t) => t.hit.test(blob)).flatMap((t) => t.asks).slice(0, 2)
  const followUp = role.value === 'turtle' ? '我的计划中，哪一步还需要说清楚？' : '我该用什么新结果来验证这个想法？'
  const out = [...hits, followUp]
  return [...new Set(out)].slice(0, 3)
}

function onRole(r: 'turtle' | 'reviewer') {
  if (busy.value) return
  selectPersona(r === 'reviewer' ? 'review' : 'guide')
  socratic.value = true
}
// Choosing an IP is not evidence that two students exchanged their keyboard seats.
watch(personaId, () => {
  socratic.value = true
  nexts.value = []
  liveMsg.value = `已选择${persona.value.name}${persona.value.roleLabel}`
})
watch(busy, value => setRequestBusy(value), { flush: 'sync' })
let disposed = false
const auth = useAuthStore()
const contextNotice = ref('')
const errorEl = ref<HTMLElement>()
const trusted = useTrustedPairContext({
  actor: () => String(auth.user?.id || ''), token: () => auth.token,
  sessionId: () => typeof route.query.pairSession === 'string' ? route.query.pairSession : '',
  onContextChange: () => {
    if (text.value || msgs.value.length) contextNotice.value = '上下文已切换，本页对话和未发送内容已清空。'
    msgs.value = []; text.value = ''; nexts.value = []; lastSummary.value = ''; awaitingSummary = false
    pendingRole.value = role.value; busy.value = false; liveMsg.value = ''; menu.value = false
    ghost.value = ''; ghostShown = 0; window.clearTimeout(ghostTimer)
  },
})
const isLegacy = computed(() => trusted.mode.value === 'legacy')
useModalA11y(computed(() => isLegacy.value && consent.value === false), gateEl)
const canSend = computed(() => !busy.value && (isLegacy.value ? consent.value === true : trusted.canSend.value))
const trustedPolicyText = computed(() => !trusted.session.value?.ai_policy ? '等老师配置本会话规则'
  : trusted.session.value.ai_policy.socratic ? '本会话要求只提问，覆盖所选 IP 的辅导视角。'
    : role.value === 'turtle' ? '导航员帮你梳理思路、解释局部方法，不代写整题。' : '领航员帮你检查依据与边界，不代写整题。')
watch(trusted.busy, value => { if (!isLegacy.value) busy.value = value }, { flush: 'sync' })
watch(trusted.error, value => {
  if (value) nextTick(() => {
    if (trusted.error.value !== value) return
    errorEl.value?.focus({ preventScroll: true })
    errorEl.value?.scrollIntoView({ block: 'nearest' })
  })
})
async function chooseSession(id: string) {
  await router.replace({ query: { ...route.query, pairSession: id || undefined } })
}
async function recoverLogin() {
  // Clear only after a current-context, explicit action; a late 401 must not log out a new actor.
  if (trusted.error.value?.status !== 401) return
  try {
    if (await auth.logout() === false) return
  } catch {
    // Login screen displays the store's unconfirmed-revocation message.
  }
  await router.replace({ path: '/login' })
}

async function send(preset?: string) {
  const msg = (preset ?? text.value).trim()
  if (!msg || !canSend.value) return
  const requestRole = role.value
  if (!isLegacy.value) {
    const generation = trusted.epoch.value
    pendingRole.value = requestRole
    const requestPersona = personaId.value
    msgs.value.push({ who: 'me', text: msg }); text.value = ''; nexts.value = []; liveMsg.value = '正在思考'
    scroll()
    const result = await trusted.send(msg, requestPersona)
    if (disposed || generation !== trusted.epoch.value) return
    if (result) {
      msgs.value.push({ who: 'ai', text: result.reply, mate: requestRole, source: result.source, receipt: result.receipt })
      liveMsg.value = `${personaForLegacyRole(requestRole).name}回复了`
      if (result.source !== 'guard') nexts.value = nextSteps(msg, result.reply)
    } else liveMsg.value = trusted.error.value?.message || ''
    if (result) scroll()
    armGhost()
    return
  }
  const generation = trusted.epoch.value
  pendingRole.value = requestRole
  msgs.value.push({ who: 'me', text: msg })
  text.value = ''
  nexts.value = []
  busy.value = true
  liveMsg.value = '正在思考'
  scroll()
  try {
    const history = msgs.value.slice(-6).map((m) => ({ role: m.who === 'me' ? 'user' : 'assistant', content: m.text }))
    // socratic 整个标志送服务端裁决：由服务端顶掉驾驶员的写码授权，并叠加教师给班级下的锁。
    // 档位不再前端硬编码（终审 #2）：缺省交服务端按 learner_state 读权威档位——三档渐退从库表事实变学生体验事实
    const r = await aiApi.chat(msg, requestRole, {
      socratic: true, history, ...roomOpt(),
    })
    if (disposed || generation !== trusted.epoch.value) return
    msgs.value.push({ who: 'ai', text: r.reply, mate: requestRole, phase: r.phase, asks: r.asks, source: r.source })
    liveMsg.value = `${personaForLegacyRole(requestRole).name}回复了`
    if (r.socraticLocked) { socratic.value = true; locked.value = true }   // 服务端说锁了就是锁了
    if (awaitingSummary) { lastSummary.value = r.reply; awaitingSummary = false }
    nexts.value = nextSteps(msg, r.reply)
  } catch (e: any) {
    if (disposed || generation !== trusted.epoch.value) return
    // 总结标志必须在失败时复位：留着的话，下一条**普通回答**会被当成「学习总结」
    // 写进学习面板 —— 面板在说假话。
    awaitingSummary = false
    liveMsg.value = ''            // 播报同理：失败了不能停在「正在思考」
    if (e?.message === 'CONSENT_REQUIRED') { consent.value = false; msgs.value.pop() }
    else msgs.value.push({ who: 'ai', text: '我暂时没法回答，稍后再试～', mate: requestRole })
  } finally {
    if (!disposed && generation === trusted.epoch.value) {
      busy.value = false
      scroll()
      armGhost()
    }
  }
}

async function drawImage() {
  if (!isLegacy.value || busy.value) return
  const generation = trusted.epoch.value
  const requestRole = role.value
  pendingRole.value = requestRole
  const p = text.value.trim() || (requestRole === 'turtle'
    ? '白色小马树小骥，红色卷翘鬃毛、红白上衣、深蓝鞋，在白板上规划编程步骤，卡通插画'
    : '黑白熊猫泡泡，透明青紫色科技护目镜、绿色竹叶领巾，拿着测试检查清单，卡通插画')
  msgs.value.push({ who: 'me', text: `🎨 画：${p}` })
  text.value = ''
  busy.value = true
  scroll()
  try {
    const img = await aiApi.image(p)
    if (disposed || generation !== trusted.epoch.value) return
    msgs.value.push({ who: 'ai', text: '', image: img, mate: requestRole })
  } catch (e: any) {
    if (disposed || generation !== trusted.epoch.value) return
    if (e?.message === 'CONSENT_REQUIRED') { consent.value = false }
    else msgs.value.push({ who: 'ai', text: e?.message || '画图暂时忙，稍后再试～', mate: requestRole })
  } finally {
    if (!disposed && generation === trusted.epoch.value) { busy.value = false; scroll() }
  }
}

function summarize() {
  if (!isLegacy.value || busy.value || !msgs.value.length) return   // send 会静默早退，标志不能先立起来
  awaitingSummary = true          // 回包时把总结留一份给面板，而不是只飘在对话流里
  send('请用 3 句话总结我刚才学到了什么，并指出一个我下次要注意的点。')
  setRailTab('summary')
}

/**
 * 学生只能**申请**开通，真正的授权由教师核验纸质监护人同意书后登记。
 * 早先这里是 `if (await grantConsent()) consent.value = true` —— 学生一点就当成已开通，
 * 但后端根本没开通，他会一直被 403 挡住却不知道原因。
 */
async function grant() {
  const generation = trusted.epoch.value
  const r = await complianceApi.requestConsent()
  if (disposed || generation !== trusted.epoch.value) return
  if (r.granted) { consent.value = true; return }
  pending.value = r.pending
  gateHint.value = r.message || '请把监护人签好的同意书交给老师'
}

watch(() => [isLegacy.value, auth.user?.id, auth.token], async () => {
  if (!isLegacy.value) return
  const generation = trusted.epoch.value
  const current = () => !disposed && generation === trusted.epoch.value && isLegacy.value
  consent.value = null; learner.value = null
  try {
    const granted = await complianceApi.consentStatus()
    if (!current()) return
    consent.value = granted
    const uid = auth.user?.id
    if (uid) {
      const state = await learnerApi.state(uid)
      if (!current()) return
      learner.value = state
    }
  } catch { if (current()) liveMsg.value = '课堂信息读取失败，请刷新后再试'; return }
  // `?socratic=1` 只是显示用；真正的锁在服务端（教师给班级下发），
  // 学生删掉这个参数也解不开 —— 首次对话回包里的 socraticLocked 会把它重新点亮。
  if (route.query.socratic === '1') { socratic.value = true; locked.value = true }
  // IDE 的伙伴按钮把当前代码经 `?ask=` 带过来。这里只预填，绝不自动发送。
  // 曾经只有发送方在传、没有任何人在读：学生从 IDE 点过来，代码悄悄丢在 URL 里，
  // 输入框空空如也，那个按钮等于坏的。预填不发送：问什么仍由学生自己决定。
  const ask = String(route.query.ask || '')
  if (ask) {
    text.value = `这段代码帮我看看：
${ask}`
    router.replace({ query: { ...route.query, ask: undefined } })   // 防刷新重复预填
  }
}, { immediate: true })
onMounted(() => {
  // 空闲预取 Monaco：学生从对话转进 IDE 时命中缓存，进编辑器 <1s（低配机不预取）
  if (capability.tier !== 'low') {
    const ric = (window as any).requestIdleCallback ?? ((fn: any) => setTimeout(fn, 3000))
    ric(() => { import('@/editor/monacoSetup').catch(() => {}) }, { timeout: 5000 })
  }
})
watch(() => route.query.socratic, (v) => { if (isLegacy.value && v === '1') { socratic.value = true; locked.value = true } })
onMounted(() => document.addEventListener('click', onDocClick, true))
onUnmounted(() => {
  disposed = true
  window.clearTimeout(ghostTimer)
  setRequestBusy(false)
  document.removeEventListener('click', onDocClick, true)
})
</script>

<style scoped>
.studio { height: 100%; display: flex; flex-direction: column; position: relative;
  background: var(--decor-blob-1) -8% -12% / 46% 46% no-repeat, var(--color-bg); }
.top { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap;
  margin: var(--sp-3) var(--sp-4) 0; padding: 4px var(--sp-3); flex-shrink: 0; }
.top__right { display: flex; align-items: center; gap: var(--sp-2); }
.trusted-context { margin-bottom: var(--sp-4); padding: 12px 14px; border: 1px solid var(--color-border);
  border-radius: var(--r-lg); background: var(--color-surface); font-size: var(--fs-sm); line-height: 1.65; overflow-wrap: anywhere; }
.trusted-context h2 { margin: 0 0 6px; font-size: var(--fs-md); }
.trusted-context p { margin: 6px 0; }
.trusted-context__rule, .trusted-context__version { color: var(--color-text-2); }
.trusted-context__choices { display: flex; flex-wrap: wrap; gap: 8px; }
.trusted-context__choices button { white-space: normal; text-align: left; }
.trusted-context__error { margin-top: 8px; padding: 8px 10px; border-left: 3px solid var(--color-primary-strong); background: var(--color-primary-soft); }
.trusted-context__error:focus { outline: 2px solid var(--color-primary-strong); outline-offset: 2px; }
.trusted-context__notice, .trusted-context__reason { color: var(--color-text-2); }
.sug-chip:disabled { opacity: .5; cursor: not-allowed; }
.lock, .railbtn { border: 1px solid var(--color-border); background: var(--color-surface);
  border-radius: var(--r-pill); padding: 5px 12px; cursor: pointer; font-size: var(--fs-xs); color: var(--color-text-2);
  display: inline-flex; align-items: center; gap: 5px; }
.lock.on { color: var(--color-primary-strong); border-color: var(--color-primary-soft); }
.room-badge { font-size: var(--fs-xs); color: var(--color-text-3); background: var(--color-fill-2);
  padding: 4px 10px; border-radius: var(--r-pill); white-space: nowrap; }
.menu__room { display: flex; align-items: center; gap: 6px; padding: 8px 10px; font-size: var(--fs-xs);
  color: var(--color-text-2); white-space: nowrap; }
.menu__room input { width: 92px; height: 30px; border: 1px solid var(--color-border);
  background: var(--color-surface); border-radius: var(--r-sm); padding: 0 8px; outline: none;
  font: inherit; font-size: var(--fs-xs); color: var(--color-text); }
.menu__room input:focus-visible { border-color: var(--color-primary); }
.round-badge { background: var(--color-primary-soft); color: var(--color-primary-ontext);
  font-size: var(--fs-xs); font-weight: var(--fw-medium); padding: 5px 12px; border-radius: var(--r-pill); white-space: nowrap; }
.lock.locked { cursor: not-allowed; opacity: .8; }
.railbtn.on { background: var(--color-primary-soft); color: var(--color-primary-strong); }

.body { flex: 1; min-height: 0; display: flex; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4) 0; }
.canvas { flex: 1; min-width: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--sp-3); padding-bottom: var(--sp-3); }

.hello { margin: auto; text-align: center; max-width: 460px; }
.hello__img { width: min(260px, 100%); height: 168px; margin-inline: auto; }
.hello__t { font-size: var(--fs-lg); font-weight: var(--fw-bold); }
.hello__s { color: var(--color-text-3); font-size: var(--fs-sm); margin-top: 4px; }
.channel-note summary { cursor: pointer; }
.channel-note summary:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
.channel-note { color: var(--color-text-3); font-size: 11px; margin-top: 8px; line-height: 1.5; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: var(--sp-4); }
/* 建议 chip 由 .chip 改名 .sug-chip（R5 裁决6）：global .chip 回归纯状态药丸，可点建议不再蹭它的名。
   原先蹭到的 global 基线（inline-flex/gap/字重/nowrap）就地补齐，视觉不变 */
.sug-chip { border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-2);
  font-size: var(--fs-xs); padding: 6px 12px; border-radius: var(--r-pill); cursor: pointer;
  display: inline-flex; align-items: center; gap: 4px; font-weight: var(--fw-medium); line-height: 1.7; white-space: nowrap; }
.sug-chip--next { border-color: var(--color-accent-soft); color: var(--color-accent-ontext); background: #fff; }

.msg { display: flex; gap: 8px; align-items: flex-start; }
.msg.me { flex-direction: row-reverse; }
.msg__ava { width: 34px; height: 40px; flex-shrink: 0; object-fit: contain; }
.bubble { max-width: min(620px, 78%); padding: 10px 14px; border-radius: var(--r-lg);
  font-size: var(--fs-base); line-height: 1.7; word-break: break-word; }
/* 我方气泡：#3370FF 压白字仅 4.29:1，改用深一档的 --on-primary 安全组合 */
.msg.me .bubble { background: var(--on-primary-bg); color: var(--on-primary-fg); }
.phase { display: block; margin-top: 6px; font-style: normal; font-size: var(--fs-xs); color: var(--color-text-3); }
.bubble__img { max-width: 320px; border-radius: var(--r-md); display: block; }
.thinking { display: flex; gap: 5px; align-items: center; }
.think-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--color-text-3); display: block; }

.belt { display: flex; align-items: center; gap: 8px; padding: 0 var(--sp-4); margin-top: var(--sp-2); flex-wrap: wrap; }
.swap-ask { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-xs); color: var(--color-text-3); }
.nexts { display: flex; flex-wrap: wrap; gap: 6px; }

.composer { display: flex; align-items: flex-end; gap: 8px; margin: var(--sp-3) var(--sp-4); padding: 8px 10px; flex-shrink: 0; }
.act { border: none; background: transparent; font-size: 18px; cursor: pointer; padding: 4px 6px;
  border-radius: var(--r-md); min-width: 34px; min-height: 34px;
  display: inline-flex; align-items: center; justify-content: center; }
.act.on { background: var(--color-primary-soft); color: var(--color-primary-strong); }
.more { position: relative; }
.menu { position: absolute; bottom: 42px; left: 0; display: flex; flex-direction: column;
  padding: 6px; border-radius: var(--r-md); z-index: var(--z-panel); min-width: 150px; }
.menu button { border: none; background: transparent; text-align: left; font: inherit;
  font-size: var(--fs-sm); color: var(--color-text-2); padding: 9px 10px; border-radius: var(--r-sm);
  cursor: pointer; min-height: 44px; white-space: nowrap;
  display: flex; align-items: center; gap: 8px; }
.menu button:hover:not(:disabled) { background: var(--ink-a06); }
.menu button:disabled { opacity: .45; cursor: not-allowed; }
.act:hover:not(:disabled) { background: var(--ink-a06); }
.act:disabled { opacity: .4; cursor: not-allowed; }
.composer textarea { flex: 1; border: none; background: transparent; outline: none; resize: none;
  font: inherit; font-size: var(--fs-base); min-width: 0; max-height: 96px; padding: 8px 4px; color: var(--color-text); }
.composer textarea:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.send { width: 38px; height: 38px; border: none; border-radius: var(--r-pill); background: var(--on-accent-bg);
  color: var(--on-accent-fg); cursor: pointer; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center; }
.send:disabled { opacity: .45; cursor: not-allowed; }

.gate { position: absolute; inset: 0; background: rgba(247,250,255,.86); display: grid; place-items: center; z-index: var(--z-modal); padding: var(--sp-5); }
.gate__card { max-width: 400px; text-align: center; }
.gate__ava { width: 96px; height: 112px; object-fit: contain; }
.gate__card h4 { font-size: var(--fs-md); margin: var(--sp-2) 0; }
.gate__card p { font-size: var(--fs-sm); color: var(--color-text-2); line-height: 1.7; }
.gate__hint { margin-top: var(--sp-2); font-size: var(--fs-xs); color: var(--color-accent-ontext); line-height: 1.7; }
.gate__ok:disabled { opacity: .6; cursor: default; }
.gate__ok { margin-top: var(--sp-4); border: none; background: var(--on-primary-bg); color: var(--on-primary-fg);
  padding: 10px 18px; border-radius: var(--r-md); cursor: pointer; font-weight: var(--fw-medium); }

@media (max-width: 760px) {
  .top, .composer { margin-left: var(--sp-2); margin-right: var(--sp-2); }
  .composer textarea { line-height: 1.6; min-height: calc(3.2em + 16px); }
  .body { padding-left: var(--sp-2); padding-right: var(--sp-2); }
  .bubble { max-width: 86%; }
}
/* UI调研'26-08 落地（Emil tips 2/4/5）：浮层入场从 scale(.97) 起（绝不从 0）、ease-out、
   origin 锚在触发器（＋按钮在菜单左下角）。@starting-style 零 JS：不支持的引擎无动画直接显示。 */
.menu { transform-origin: bottom left;
  transition: opacity var(--d-fast) var(--e-out), transform var(--d-fast) var(--e-out); }
@starting-style { .menu { opacity: 0; transform: translateY(4px) scale(.97); } }
</style>
