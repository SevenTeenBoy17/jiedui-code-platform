<!-- @copyBudget 60  教学·课堂：一屏看清谁卡住（15 秒轮询，卡住的排最前） -->
<template>
  <div class="lv">
    <PageHead desc="实时看清谁卡住、谁停了" />
    <div class="bar">
      <select v-model="classId" class="pickcls">
        <option :value="0">全部学生</option>
        <option v-for="c in classes" :key="c.id" :value="c.id">{{ c.name }}·{{ c.size }}人</option>
      </select>
      <span v-for="k in ORDER" :key="k" class="tally" :class="k">
        <i /> {{ LABEL[k] }} {{ data?.tally[k] ?? 0 }}
      </span>
      <label class="auto"><input type="checkbox" v-model="auto" /> 自动刷新</label>
    </div>

    <!-- 教学轮控件组（写路径断线最后一环）：learning_round 此前只有 API 无 UI，
         生产 round_index 恒 NULL 的根因。LiveView 没有房间概念，最小实现 = 房间号输入 + localStorage 记忆。 -->
    <div class="bar">
      <span class="rlab">教学轮</span>
      <input v-model.trim="room" class="room" placeholder="如 class1-pair3"
             title="与学生结对房间一致（学生结对台使用的房间号）" @change="loadRounds" />
      <!-- 徽章语义不变：任务框架 R1能跑/R2跑对/R3跑好，label 来自服务端 -->
      <span v-if="activeRound" class="chip chip--primary">{{ `第${activeRound.round_index}轮 · ${activeRound.label}` }}</span>
      <span v-else-if="room" class="chip chip--muted">{{ roundsOk ? '本房间未开轮' : '轮次状态未知' }}</span>
      <button v-if="room && !activeRound" class="mini rbtn" :disabled="roundBusy" @click="openRound">
        开第 {{ nextRoundIndex }} 轮
      </button>
      <button v-if="activeRound" class="mini rbtn" :disabled="roundBusy" @click="exitAsk = true">结束本轮</button>
    </div>
    <p v-if="roundErr" class="alert">{{ roundErr }}<button class="retry" @click="loadRounds">重试</button></p>

    <p v-if="err" class="alert">{{ err }}<button class="retry" @click="load">重试</button></p>
    <p v-else-if="stale" class="alert alert--warn">数据更新于 {{ staleSec }} 秒前，可能已不是实时的</p>

    <BentoGrid min="180px" class="stagger">
      <GlassPanel v-for="(s, i) in seats" :key="s.id" class="seat" :class="s.state" :style="{ '--i': i }">
        <div class="seat__h">
          <b class="nm">{{ s.name }}</b>
          <span class="st">{{ LABEL[s.state] }}</span>
        </div>
        <p class="num">跑 {{ s.runs }} · 错 {{ s.errors }} · 修 {{ s.fixes }}</p>
        <p class="ago">{{ ago(s) }}</p>
        <button class="mini" @click="peek.open(`student:${s.id}`)">看学情</button>
      </GlassPanel>
      <p v-if="!seats.length" class="empty">{{ err ? '数据没取到，不是真的没人' : '这节课还没有人开始编程' }}</p>
    </BentoGrid>

    <!-- 结轮三选（mask+sheet 模式，Esc/点空白可取消）：exit_task_passed 1/0/null。
         「跳过判定」是「没做出口任务」，与「未达标」是两回事，不可混填 -->
    <div v-if="exitAsk" class="rmask" data-lint="screen" @click.self="exitAsk = false">
      <GlassPanel ref="exitPanel" strong class="rsheet" role="dialog" aria-modal="true"
                  aria-label="结束本轮" tabindex="-1">
        <b class="rsheet__t">结束本轮：出口任务过了吗？</b>
        <!-- 轮换底线（拍板：底线强制+协商自由，Zhong 2017）：只提醒不阻断——阻断会让没换位的轮永远关不掉 -->
        <p class="rsheet__hint">底线：每轮至少换位 1 次，未换请先组织换位</p>
        <div class="rsheet__acts">
          <button class="rok" :disabled="roundBusy" @click="exitRound(true)">达标</button>
          <button class="rok rok--no" :disabled="roundBusy" @click="exitRound(false)">未达标</button>
          <button class="rghost" :disabled="roundBusy" @click="exitRound(null)">跳过判定</button>
          <button class="rghost" @click="exitAsk = false">取消</button>
        </div>
      </GlassPanel>
    </div>

    <p v-if="tip" class="toast">{{ tip }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { teacherApi, type TeacherLive, type LiveSeat } from '@/api/teacher'
import { ApiError } from '@/api/http'
import { resourcesApi, type Klass } from '@/api/resources'
import { learnerApi, type TeachRound } from '@/api/learner'
import { usePeek } from '@/composables/usePeek'
import { useToast } from '@/composables/useToast'
import { useModalA11y } from '@/composables/useModalA11y'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import BentoGrid from '@/components/ui/BentoGrid.vue'
import PageHead from '@/components/ui/PageHead.vue'

type State = LiveSeat['state']
const ORDER: State[] = ['stuck', 'active', 'idle', 'away']
const LABEL: Record<State, string> = { stuck: '卡住', active: '在跑', idle: '停顿', away: '未开始' }

const data = ref<TeacherLive | null>(null)
const classes = ref<Klass[]>([])
const classId = ref(0)
const auto = ref(true)
const err = ref('')
const lastOk = ref(0)
const now = ref(Date.now())
const peek = usePeek()
let timer: number | undefined
let tick: number | undefined

/** 数据可能已经陈旧 —— 轮询失败时界面不能装作还是实时的 */
const staleSec = computed(() => (lastOk.value ? Math.round((now.value - lastOk.value) / 1000) : 0))
const stale = computed(() => staleSec.value > 45)

const seats = computed(() => data.value?.seats ?? [])

/** 未开始的人不报「48280 分钟」这种无意义读数——本节没上机就直说 */
function ago(s: LiveSeat) {
  if (s.state === 'away' || s.idle_sec == null) return '本节未上机'
  const m = Math.floor(s.idle_sec / 60)
  return m < 1 ? '刚刚有动作' : `${m} 分钟没动了`
}

/**
 * 失败必须说出来。teacherApi 现在走 http.ts 会抛错，若不接住：
 * 首次失败 → data 为 null → 页面显示「这节课还没有人开始编程」（在骗老师）；
 * 轮询失败 → 保留上一次数据继续显示「在跑 12 人」，老师以为是实时的，其实已冻结。
 */
async function load() {
  try {
    data.value = await teacherApi.live(classId.value)
    err.value = ''
    lastOk.value = Date.now()
  } catch (e) {
    err.value = e instanceof ApiError ? e.message : '课堂数据读取失败'
  }
}
function start() {
  stop()
  timer = window.setInterval(load, 15_000)
  tick = window.setInterval(() => (now.value = Date.now()), 5_000)   // 只驱动"更新于 N 秒前"
}
function stop() {
  if (timer) { clearInterval(timer); timer = undefined }
  if (tick) { clearInterval(tick); tick = undefined }
}

// —— 教学轮（开轮/结轮）——
/** 房间号记忆：LiveView 无房间概念，键入一次后续课自动带出。与学生结对房间号一致才对得上埋点 */
const ROOM_KEY = 'cx-live-room'
const room = ref(localStorage.getItem(ROOM_KEY) || '')
const rounds = ref<TeachRound[]>([])
const roundsOk = ref(false)     // 区分「真没开轮」与「没取到」：源挂了不能冒充空态
const roundErr = ref('')
const roundBusy = ref(false)
const exitAsk = ref(false)
const { tip, flash } = useToast()

// 结轮弹层的焦点圈闭；Esc/点空白可取消（判定可以下次再做，不是同意门那种不可跳过层）
const exitPanel = ref<InstanceType<typeof GlassPanel>>()
useModalA11y(exitAsk, computed(() => exitPanel.value?.$el as HTMLElement | undefined), () => (exitAsk.value = false))

/** 进行中的轮（exited_at 为空的最新一条）；服务端保证一房同时至多一轮 */
const activeRound = computed(() => [...rounds.value].reverse().find((r) => !r.exited_at) ?? null)
/** 开轮轮序自动取当前+1（封顶 3；三轮走完再点视为重开 R3，服务端允许同轮多开） */
const nextRoundIndex = computed(() => {
  const max = rounds.value.reduce((m, r) => Math.max(m, r.round_index), 0)
  return Math.min(3, max + 1)
})

async function loadRounds() {
  localStorage.setItem(ROOM_KEY, room.value)
  rounds.value = []
  roundsOk.value = false
  roundErr.value = ''
  if (!room.value) return
  try {
    rounds.value = await learnerApi.rounds(room.value)
    roundsOk.value = true
  } catch (e) {
    roundErr.value = e instanceof ApiError ? e.message : '教学轮状态没取到'
  }
}

async function openRound() {
  roundBusy.value = true
  roundErr.value = ''
  try {
    const n = nextRoundIndex.value
    await learnerApi.roundOpen(room.value, n)   // label 缺省：服务端按轮序补 R1能跑/R2跑对/R3跑好
    flash(`第 ${n} 轮已开启`)
    await loadRounds()
  } catch (e) {
    roundErr.value = e instanceof ApiError ? e.message : '开轮失败'
  } finally { roundBusy.value = false }
}

/** 结轮三态：true 达标 / false 未达标 / null 跳过判定（没做出口任务，≠ 未达标） */
async function exitRound(passed: boolean | null) {
  const rid = activeRound.value?.id
  if (!rid) { exitAsk.value = false; return }
  roundBusy.value = true
  roundErr.value = ''
  try {
    await learnerApi.roundExit(rid, passed)
    exitAsk.value = false
    flash(passed === null ? '本轮已结束（未判定）' : `本轮已结束（${passed ? '达标' : '未达标'}）`)
    // 轮级快照（研究件）：结轮成功后追加拉一次冻结数量，成功则换 toast；
    // 失败/端点未活一律静默保持原 toast——快照不该打断教学操作
    try {
      const snap = await learnerApi.roundSnapshot(rid)
      if (Array.isArray(snap)) flash(`本轮已结束，已冻结 ${snap.length} 名学生的轮级画像`)
    } catch { /* 静默：研究件失败不干扰教学 */ }
    await loadRounds()
  } catch (e) {
    exitAsk.value = false
    roundErr.value = e instanceof ApiError ? e.message : '结轮失败'
  } finally { roundBusy.value = false }
}

watch(auto, (on) => (on ? start() : stop()))
watch(classId, load)
onMounted(async () => {
  loadRounds()          // 记忆过房间号就直接带出当前轮，不等教师再敲一遍
  try {
    const d = await resourcesApi.classes()
    classes.value = d.items
    if (d.items.length) classId.value = d.items[0].id   // 默认盯住第一个班，而不是全平台
  } catch { /* 无班级则看全部 */ }
  await load()
  if (auto.value) start()
})
onUnmounted(stop)
</script>

<style scoped>
.lv { display: flex; flex-direction: column; gap: var(--sp-3); }
.bar { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
.pickcls { height: 32px; border: 1px solid var(--color-border); background: var(--color-surface);
  border-radius: var(--r-md); padding: 0 var(--sp-2); outline: none; font: inherit; font-size: var(--fs-sm); color: var(--color-text); }
.tally { display: flex; align-items: center; gap: 5px; font-size: var(--fs-sm); color: var(--color-text-2);
  font-variant-numeric: tabular-nums; }
.tally i { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-200); }
.tally.stuck i { background: var(--color-danger-ontext); }
.tally.active i { background: var(--color-success); }
.tally.idle i { background: var(--color-accent); }
.auto { margin-left: auto; font-size: var(--fs-sm); color: var(--color-text-2); display: flex; align-items: center; gap: 5px; cursor: pointer; }
.seat { display: flex; flex-direction: column; gap: 5px; border-left: 3px solid transparent; }
.seat.stuck { border-left-color: var(--color-danger-ontext); background: var(--color-danger-soft); }
.seat.active { border-left-color: var(--color-success); }
.seat.idle { border-left-color: var(--color-accent); }
.seat__h { display: flex; align-items: baseline; gap: 6px; }
.nm { font-size: var(--fs-sm); font-weight: var(--fw-bold); flex: 1; }
.st { font-size: var(--fs-xs); color: var(--color-text-3); }
.seat.stuck .st { color: var(--color-danger-ontext); font-weight: var(--fw-bold); }
.num { font-size: var(--fs-xs); color: var(--color-text-2); font-variant-numeric: tabular-nums; }
.ago { font-size: var(--fs-xs); color: var(--color-text-3); }
.mini { margin-top: auto; align-self: flex-start; border: none; background: var(--ink-a06);
  color: var(--color-text-2); font-size: var(--fs-xs); padding: 4px 12px; border-radius: var(--r-pill); cursor: pointer; }
/* —— 教学轮控件组 —— */
.rlab { font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--color-text-2); }
.room { height: 32px; width: 150px; border: 1px solid var(--color-border); background: var(--color-surface);
  border-radius: var(--r-md); padding: 0 var(--sp-2); outline: none; font: inherit; font-size: var(--fs-sm); color: var(--color-text); }
.rbtn { margin-top: 0; background: var(--on-primary-bg); color: var(--on-primary-fg); }
.rbtn:disabled { opacity: .5; cursor: not-allowed; }
.rmask { position: fixed; inset: 0; background: var(--ink-a04); display: grid; place-items: center;
  z-index: var(--z-modal); padding: var(--sp-4); }
.rsheet { width: min(380px, 94vw); display: flex; flex-direction: column; gap: var(--sp-3); }
.rsheet__t { font-size: var(--fs-md); }
.rsheet__hint { margin: 0; font-size: var(--fs-xs); color: var(--color-text-3); }
.rsheet__acts { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.rok { border: none; background: var(--on-primary-bg); color: var(--on-primary-fg);
  padding: 9px 16px; border-radius: var(--r-md); cursor: pointer; font-weight: var(--fw-medium); min-height: 40px; }
.rok--no { background: var(--color-danger-soft); color: var(--color-danger-ontext); }
.rok:disabled { opacity: .5; cursor: not-allowed; }
.rghost { border: none; background: var(--ink-a06); color: var(--color-text-2);
  padding: 9px 16px; border-radius: var(--r-md); cursor: pointer; min-height: 40px; }
.rghost:disabled { opacity: .5; cursor: not-allowed; }
.empty { color: var(--color-text-3); font-size: var(--fs-sm); padding: var(--sp-5); grid-column: 1 / -1; text-align: center; }
/* .alert / .alert--warn / .retry 已收编为 global.css 全局错误条（amber 底走 --color-warning-soft） */
</style>
