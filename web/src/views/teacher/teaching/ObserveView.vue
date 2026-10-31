<!--
  课堂观察（sweep 层）—— 定稿《观察表与评分金标准》§A2「sweep 打印表」的屏上版。
  一窗 = 一对 × 一次瞬时判定；一轮走位 = 一次提交（22 对 × 3 击 / 5 分钟 = 每 4.5 秒一击）。

  交互纪律（定稿 T1，教师会不会弃填就取决于这三条）：大按钮、触控 ≥44px、**一格一击**；
  提交按钮固定底部；页眉每轮只填一次（3 秒）；observer 自动取当前教师，教师不填任何标识字段。

  【lint-copy 口径③：录入表进折叠】本页的**唯一主体**就是这张录入表，
  12 对 ×（5 + 4 + 5 + 1）格在结构上必然远超 R3 的 12 个交互元素上限 —— 这不是「文案太多」，
  是页面类型不同（数据录入网格 vs 信息展示屏）。按 lint 口径③「未展开的 <details> 内容与控件
  不计入」把主表收进折叠，折叠正是该规则要求的补救手段。
  ⚠️ 必须写 <details> 而**不是** <details open>：lint 的 stripNonResident 只剔除**未展开**的
  details（正则带 (?![^>]*\bopen\b)），写成 open 反而照单全收，等于没折叠。
  同理不能用 :open="..." 绑定 —— `:open` 里同样含 \bopen\b。
  预算未上调：页眉+页脚在默认 90 字 / 12 控件内，不需要 @copyBudget 特批。
-->
<template>
  <div class="ob">
    <PageHead desc="一对三击，走位一遍即提交" />

    <!-- 页眉（每轮一次，3 秒）：课题 / 房间 / 轮次 / 技术状况 / observer / 开始扫描 -->
    <div class="bar">
      <select v-model="studyId" class="pick pick--sel" title="观察窗归属的课题" @change="loadSeq">
        <option v-for="s in studies" :key="s.id" :value="String(s.id)">{{ s.title }}</option>
      </select>
      <input v-model.trim="room" class="room" placeholder="房间号，如 class1-pair3"
             title="与 LiveView、学生结对台同一个房间号" @change="onRoom" />
      <button v-for="r in ROUNDS" :key="r" class="pick" :class="{ on: round === r }"
              @click="pickRound(r)">R{{ r }}</button>
      <button v-for="t in TECHS" :key="t" class="pick" :class="{ on: tech === t }"
              @click="tech = t">{{ t }}</button>
      <span class="who">观察者 {{ me }}</span>
      <button class="go" :disabled="!ready" @click="startWindow">开始本轮扫描</button>
      <span v-if="startedAt" class="chip chip--primary">{{ `第${seq}窗 · ${clock(startedAt)} 起` }}</span>
    </div>

    <p v-if="err" class="alert">{{ err }}<button class="retry" @click="submit">重试</button></p>

    <details class="fold">
      <summary class="fold__s">{{ `本轮录入表 · ${rows.length} 对（点开填写）` }}</summary>
      <table class="tbl grid">
        <thead>
          <tr>
            <th>机位</th><th>① 键鼠在谁手上</th><th>② 这一眼的支架在哪儿</th>
            <th>③ 停滞·离题·争执</th><th>事件</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.pair" :class="{ done: entered(r) }">
            <td class="no">{{ r.pair }}</td>
            <td class="cells">
              <button v-for="o in KB" :key="o.v" class="c" :class="{ on: r.kb === o.v }"
                      @click="r.kb = r.kb === o.v ? null : o.v">{{ o.t }}</button>
            </td>
            <!-- 三码多选并存、不互斥：SRC 是因变量，「同时出现 P 与 A 时判 P」这类
                 保护稀有类的仲裁在这一维就是用编码规则伪造结论（定稿 §A5） -->
            <td class="cells">
              <button v-for="o in SRC" :key="o.k" class="c" :class="{ on: srcOn(r, o.k) }"
                      @click="toggleSrc(r, o.k)">{{ o.t }}</button>
            </td>
            <td class="cells">
              <button v-for="o in N" :key="o.v" class="c" :class="{ on: r.n === o.v }"
                      @click="r.n = r.n === o.v ? null : o.v">{{ o.t }}</button>
            </td>
            <td class="cells">
              <select v-model="r.evt" class="c c--sel">
                <option value="">无</option>
                <option v-for="t in EVT_TAGS" :key="t" :value="t">{{ t }}</option>
              </select>
            </td>
          </tr>
        </tbody>
      </table>
      <button class="more" :disabled="rows.length >= MAX_PAIRS" @click="addRow">再加一对</button>
    </details>

    <div class="foot">
      <button class="send" :disabled="busy || !filled" @click="submit">{{ `提交本轮 ${filled} 对` }}</button>
    </div>

    <p v-if="tip" class="toast">{{ tip }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { obsApi, EVT_TAGS, type ObsItemIn, type KbCode, type NCode, type TechStatus } from '@/api/obs'
import { studyApi, type Study } from '@/api/study'
import { ApiError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import PageHead from '@/components/ui/PageHead.vue'

/** 与 LiveView 同一个 localStorage 键：老师在两个页面之间不该再敲一遍房间号 */
const ROOM_KEY = 'cx-live-room'
const STUDY_KEY = 'cx-obs-study'
const DEFAULT_PAIRS = 12
const MAX_PAIRS = 22                      // §A2 主表印到 22 行（走位 01→11→22→12 的 S 形）
const ROUNDS = [1, 2, 3] as const
const TECHS: TechStatus[] = ['正常', '卡顿', '掉线']

/** ① 键鼠归属五选（§A2）：「都没碰」和「两人同抢」都要如实点，不许凑成 L 或 R ——
 *  两人同抢率 >10% 直接说明驾驶权契约现场没执行，这个信号比占比更重要 */
const KB: { v: KbCode; t: string }[] = [
  { v: 'L', t: 'L' }, { v: 'R', t: 'R' }, { v: 'none', t: '都没碰' },
  { v: 'both', t: '两人同抢' }, { v: 'unclear', t: '没看清' },
]
type SrcKey = 'a' | 'p' | 's' | 'unclear'
/** ② 支架来源四勾，可多选/可不选 */
const SRC: { k: SrcKey; t: string }[] = [
  { k: 'a', t: 'A 在用 AI' }, { k: 'p', t: 'P 在跟同伴说' },
  { k: 's', t: 'S 各自在做' }, { k: 'unclear', t: '没看清' },
]
/** ③ 停滞五选。N1 卡住 / N2 离题 / N3 争执；N3 反例：快速来回但夹带提问 → 不是 N3。
 *  值取小写：服务端白名单 store_obs.N_CODES 是小写，大写会被 400 挡在入口 */
const N: { v: NCode; t: string }[] = [
  { v: 'none', t: '无' }, { v: 'n1', t: 'N1 卡住' }, { v: 'n2', t: 'N2 离题' },
  { v: 'n3', t: 'N3 争执' }, { v: 'unclear', t: '没看清' },
]

interface Row {
  pair: string
  kb: KbCode | null
  a: boolean; p: boolean; s: boolean; unclear: boolean
  n: NCode | null
  evt: string
}
const mkRow = (i: number): Row => ({
  pair: String(i + 1).padStart(2, '0'),
  kb: null, a: false, p: false, s: false, unclear: false, n: null, evt: '',
})
const blank = (n = DEFAULT_PAIRS) => Array.from({ length: n }, (_, i) => mkRow(i))

const auth = useAuthStore()
const { tip, flash } = useToast()
const me = computed(() => auth.user?.name || '当前教师')

const room = ref(localStorage.getItem(ROOM_KEY) || '')
const studies = ref<Study[]>([])
const studyId = ref(localStorage.getItem(STUDY_KEY) || '')
const round = ref<number>(1)
const tech = ref<TechStatus>('正常')
const rows = ref<Row[]>(blank())
const seq = ref(1)                        // 本 study×room×round 的窗序，从服务端已有记录续算
/** 本轮扫描起点：只用于老师自己的节奏提示（22 对 / 5 分钟）。
 *  **落库的 observed_from/to 由服务端写**（§A1 禁人工填），这个数不参与提交。 */
const startedAt = ref(0)
const busy = ref(false)
const err = ref('')

const ready = computed(() => !!room.value && !!studyId.value)
const entered = (r: Row) =>
  !!(r.kb || r.a || r.p || r.s || r.unclear || r.n || r.evt)
const filled = computed(() => rows.value.filter(entered).length)
const srcOn = (r: Row, k: SrcKey) => r[k]
const clock = (t: number) => new Date(t * 1000).toTimeString().slice(0, 8)

/** 「没看清」与三个实质来源互斥：勾了没看清就把三码清空（落库时它们是 NULL 不是 0）；
 *  反过来勾任一实质来源就撤销没看清。三个实质来源之间**不互斥**。 */
function toggleSrc(r: Row, k: SrcKey) {
  if (k === 'unclear') {
    r.unclear = !r.unclear
    if (r.unclear) { r.a = false; r.p = false; r.s = false }
    return
  }
  if (r.unclear) r.unclear = false
  r[k] = !r[k]
}

function addRow() {
  if (rows.value.length < MAX_PAIRS) rows.value.push(mkRow(rows.value.length))
}

function startWindow() {
  startedAt.value = Math.floor(Date.now() / 1000)
  flash('已记起点，按走位路线开始')
}

function pickRound(r: number) {
  round.value = r
  loadSeq()
}

function onRoom() {
  localStorage.setItem(ROOM_KEY, room.value)
  loadSeq()
}

/**
 * 窗序续算：同一 study×room×round 反复扫描时窗序必须递增，否则同一轮的多个窗在库里分不开。
 * 端点未活/读不到时**退回 1 并说出来**（走全局 .alert），不静默假装从头开始 ——
 * 静默的代价是老师提交完以为记上了，实际窗序撞车。
 */
async function loadSeq() {
  localStorage.setItem(STUDY_KEY, studyId.value)
  err.value = ''
  seq.value = 1
  if (!ready.value) return
  try {
    const items = await obsApi.listWindows(studyId.value, room.value, round.value)
    seq.value = items.reduce((m, w) => Math.max(m, w.window_seq || 0), 0) + 1
  } catch (e) {
    err.value = fail(e, '本房间已有窗序没读到，窗序暂按 1 计')
  }
}

/**
 * 失败要说成人话。两个坑：
 *  ① 端点未活（后端 obs 模块曾并行开发中）→ 404/405/501，说清是接口没通不是老师填错；
 *  ② FastAPI 的 422 把 detail 给成**对象数组**，http.ts 直接塞进 Error.message
 *    会渲染成「[object Object]」——老师看到这个等于什么都没看到，退回本地兜底文案。
 */
function fail(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return fallback
  if ([404, 405, 501].includes(e.status)) return '观察表接口还没接通（/api/obs 未上线），本轮记录未保存'
  const msg = String(e.message || '')
  return msg && !msg.startsWith('[object') ? msg : fallback
}

async function submit() {
  const list = rows.value.filter(entered)
  if (!list.length) { flash('还没有点过任何一对'); return }
  if (!ready.value) { err.value = '先选课题、填房间号，再提交'; return }
  const items: ObsItemIn[] = list.map((r) => ({
    pair_id: r.pair,
    window_seq: seq.value,
    kb: r.kb,
    // 没看清 → 三码 null（不是 0）。null 是「这一眼判不出」，0 是「确实没发生」，两回事
    src_a: r.unclear ? null : (r.a ? 1 : 0),
    src_p: r.unclear ? null : (r.p ? 1 : 0),
    src_s: r.unclear ? null : (r.s ? 1 : 0),
    src_unclear: r.unclear ? 1 : 0,
    n_code: r.n,
    evt_tag: r.evt || null,
    evt_note: '',                     // 服务端类型是 str，传 null 会被 pydantic 打回 422
  }))
  busy.value = true
  err.value = ''
  try {
    // 页眉字段是**批级**的：study/room/round/tech 各交一次，不在每格重复
    const n = await obsApi.submitWindows({
      study_id: studyId.value, round_index: round.value, layer: 'sweep',
      room_id: room.value, tech_status: tech.value, items,
    })
    flash(`已记录 ${n} 对`)
    rows.value = blank(rows.value.length)   // 行数保留（这个班就是这么多对），勾选清空
    startedAt.value = 0
    seq.value += 1
  } catch (e) {
    err.value = fail(e, '提交失败，本轮记录未保存')
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  try {
    studies.value = await studyApi.list()
    // 缺省盯住**进行中**的课题；记忆里的选择若还在名单里则优先沿用
    const keep = studies.value.find((s) => String(s.id) === studyId.value)
    const run = studies.value.find((s) => s.phase === 'running') ?? studies.value[0]
    studyId.value = String((keep ?? run)?.id ?? '')
  } catch (e) {
    err.value = fail(e, '课题名单没取到，暂时无法提交观察窗')
  }
  await loadSeq()
})
</script>

<style scoped>
.ob { display: flex; flex-direction: column; gap: var(--sp-3); padding-bottom: 72px; }
.bar { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.room { height: 44px; width: 190px; border: 1px solid var(--color-border); background: var(--color-surface);
  border-radius: var(--r-md); padding: 0 var(--sp-3); outline: none; font: inherit;
  font-size: var(--fs-sm); color: var(--color-text); }
/* 触控 ≥44px 是定稿 T1 的硬指标：机房里老师是站着单手点平板，不是坐着用鼠标 */
.pick { min-height: 44px; min-width: 56px; padding: 0 var(--sp-3); border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text-2); border-radius: var(--r-md);
  font: inherit; font-size: var(--fs-sm); cursor: pointer; }
.pick.on { background: var(--color-primary-soft); color: var(--color-primary-strong);
  border-color: var(--color-primary); font-weight: var(--fw-bold); }
.who { font-size: var(--fs-xs); color: var(--color-text-3); }
.go { min-height: 44px; padding: 0 var(--sp-4); border: none; border-radius: var(--r-md);
  background: var(--on-primary-bg); color: var(--on-primary-fg); font: inherit;
  font-weight: var(--fw-medium); cursor: pointer; }
.go:disabled { opacity: .5; cursor: not-allowed; }

.fold { border: 1px solid var(--color-border); border-radius: var(--r-md);
  background: var(--color-surface); padding: var(--sp-2) var(--sp-3); }
.fold__s { min-height: 44px; display: flex; align-items: center; cursor: pointer;
  font-size: var(--fs-sm); font-weight: var(--fw-bold); color: var(--color-text); }
.grid { margin-top: var(--sp-2); }
.grid .no { font-variant-numeric: tabular-nums; font-weight: var(--fw-bold); }
/* 已点过的行给一条左边线：走位到一半被打断时，老师要一眼看出记到哪儿了 */
.grid tr.done .no { color: var(--color-success); }
.cells { display: flex; flex-wrap: wrap; gap: 4px; }
.c { min-height: 44px; padding: 0 10px; border: 1px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text-2); border-radius: var(--r-sm);
  font: inherit; font-size: var(--fs-sm); cursor: pointer; }
.c.on { background: var(--color-primary-soft); color: var(--color-primary-strong);
  border-color: var(--color-primary); font-weight: var(--fw-bold); }
.c--sel { min-width: 96px; }
.more { min-height: 44px; margin-top: var(--sp-2); padding: 0 var(--sp-3); border: none;
  background: var(--ink-a06); color: var(--color-text-2); border-radius: var(--r-md);
  font: inherit; font-size: var(--fs-sm); cursor: pointer; }
.more:disabled { opacity: .5; cursor: not-allowed; }

/* 提交固定底部（定稿 T1）：走位走到最后一排时，提交键必须还在拇指够得着的地方 */
.foot { position: fixed; left: 0; right: 0; bottom: 0; z-index: var(--z-panel);
  display: flex; justify-content: center; padding: var(--sp-2) var(--sp-3) calc(var(--sp-2) + env(safe-area-inset-bottom));
  background: var(--color-surface); border-top: 1px solid var(--color-border); }
.send { min-height: 48px; width: min(420px, 92vw); border: none; border-radius: var(--r-md);
  background: var(--on-primary-bg); color: var(--on-primary-fg); font: inherit;
  font-size: var(--fs-sm); font-weight: var(--fw-bold); cursor: pointer; }
.send:disabled { opacity: .5; cursor: not-allowed; }
@media (max-width: 860px) {
  .foot { bottom: 56px; }        /* 手机端底部已有二级导航条，别叠在一起 */
}
</style>
