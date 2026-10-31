<!-- @copyBudget 60  学生·测评：单题单屏，做完就交，不能重做 -->
<template>
  <div class="as">
    <!-- 错误横幅**不拆卷**。原来 v-if="err" 排在整条 v-else 链最前：交卷时网络一抖，
         整卷 UI 被一行红字顶掉、无重试入口，唯一出路是 F5 —— 而 F5 会丢掉全部已选答案。
         错误只该覆盖它真正阻断的东西：取卷失败给重试，交卷失败保住卷面再试。 -->
    <p v-if="err" class="alert">
      {{ err }}
      <button v-if="retriable" class="retry" @click="paper ? submit() : load()">重试</button>
    </p>

    <template v-if="done">
      <!-- 红线（蓝图第五章）：分数不下发学生 —— 交卷页只给中性完成态，无总分/对错/排名 -->
      <GlassPanel class="done">
        <img :src="asset('mascot_cat')" class="done__img" alt="" />
        <p class="done__t">已完成，谢谢你的认真作答</p>
        <p class="thin">结果会帮助老师更好地安排接下来的练习。</p>
        <RouterLink class="ok" to="/student/assess">回测评中心</RouterLink>
      </GlassPanel>

      <!-- 轮末负荷自评（仅 probe 卷）：⚠️ 这是自我感受不是成绩——文案禁出现「分数/成绩/表现」。
           点选即记录；不点选直接离开也完全可以（跳过不强制，无任何提示或拦截）。 -->
      <GlassPanel v-if="probe" class="load">
        <template v-if="!loadDone">
          <p class="load__q">刚才这轮，你觉得费脑程度是？</p>
          <div class="load__row">
            <span class="thin">1 很轻松</span>
            <button v-for="n in 9" :key="n" class="ldot" :class="{ on: n === loadPick }"
                    :disabled="loadBusy" @click="rate(n)">{{ n }}</button>
            <span class="thin">9 非常费劲</span>
          </div>
          <p v-if="loadErr" class="alert">{{ loadErr }}</p>
        </template>
        <p v-else class="load__ok">已记录，谢谢</p>
      </GlassPanel>
    </template>

    <template v-else-if="paper">
      <!-- 开卷固定声明（蓝图 3.1⑥，据实作答的前提是学生知道不计分） -->
      <p class="alert alert--warn">结果不计入成绩，请据实作答</p>

      <div class="bar">
        <span class="cnt">第 {{ idx + 1 }} / {{ paper.item_count }} 题</span>
        <div class="dots">
          <i v-for="(_, i) in paper.items" :key="i" :class="{ on: answers[i] >= 0, cur: i === idx }" />
        </div>
      </div>

      <GlassPanel class="q">
        <p class="stem">{{ cur.stem }}</p>
        <!-- 选项洗牌只发生在渲染层：answers 全程存**原始索引**，提交/草稿零转换 -->
        <label v-for="o in curOpts" :key="o.j" class="opt" :class="{ on: answers[idx] === o.j }">
          <input type="radio" :name="'q' + idx" :value="o.j" :checked="answers[idx] === o.j" @change="answers[idx] = o.j" />
          <span>{{ o.text }}</span>
        </label>
      </GlassPanel>

      <div class="acts">
        <button class="cancel" :disabled="idx === 0" @click="idx--">上一题</button>
        <button v-if="idx < paper.items.length - 1" class="ok" @click="idx++">下一题</button>
        <button v-else class="ok" :disabled="busy" @click="submit">{{ busy ? '交卷中…' : '交卷' }}</button>
        <span v-if="unanswered" class="thin">还有 {{ unanswered }} 题没选</span>
      </div>
    </template>

    <p v-else-if="!err" class="thin">读取中…</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { studyApi, type Paper } from '@/api/study'
import { learnerApi } from '@/api/learner'
import { ApiError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { asset } from '@/assets/assets'
import GlassPanel from '@/components/ui/GlassPanel.vue'

const route = useRoute()
const auth = useAuthStore()
const aid = Number(route.params.aid)
const targetId = route.query.t ? Number(route.query.t) : null
/** 草稿键（蓝图 3.1②）：初中生误触刷新是常态，答到一半的卷面必须能原样回来。
    带学生 id 后缀：机房电脑多人共用，不带的话 A 的半卷会被 B 恢复、B 交卷会清掉 A 的草稿
    ——跨账号的答案串写正是研究数据最怕的污染（本机实测踩中后加的）。 */
const draftKey = `assess-draft-${aid}-${auth.user?.id || 'anon'}`

const paper = ref<Paper | null>(null)
const answers = ref<number[]>([])
const idx = ref(0)
const busy = ref(false)
const err = ref('')
/** 同意门禁不给重试按钮：重试解决不了，要去找老师登记 */
const retriable = ref(false)
/** 红线：交卷成功只记布尔，不接收也不展示任何得分字段 */
const done = ref(false)
const t0 = Date.now()

// —— 轮末负荷自评（仅 probe 卷；R+1 配套）——
/** 非 null = 这是 probe 卷，值为其轮序（1-3；旧数据缺轮序时 0 = 有卷无轮，提交时不带 round_index） */
const probe = ref<number | null>(null)
const loadPick = ref(0)
const loadDone = ref(false)
const loadBusy = ref(false)
const loadErr = ref('')

/** 取本卷元数据（kind/round_id 不在取卷响应里，只在测评中心列表里）。
    取不到就不出自评条 —— 自评本来就可跳过，元数据失败不值得打断完成页。 */
async function loadMeta() {
  try {
    const it = (await studyApi.mine()).find((x) => x.assessment_id === aid)
    if (it?.kind === 'probe') probe.value = it.round_id ?? 0
  } catch { /* 静默：完成页不因可选功能报错 */ }
}

/** 点选即记录（1=很轻松 9=非常费劲）。失败走全局 .alert，可换档重点 */
async function rate(n: number) {
  loadPick.value = n
  loadBusy.value = true
  loadErr.value = ''
  try {
    await learnerApi.cogload(n, probe.value ? { round_index: probe.value } : {})
    loadDone.value = true
  } catch (e) {
    loadErr.value = e instanceof Error ? e.message : '没记上，可以再点一次'
  } finally { loadBusy.value = false }
}

const cur = computed(() => paper.value!.items[idx.value])
const unanswered = computed(() => answers.value.filter((a) => a < 0).length)

/**
 * 选项确定性洗牌（蓝图 3.1④，李昊东）：seed = 学生 id + 卷 id + 题号。
 * 同一学生刷新顺序稳定（草稿恢复后不错位），不同学生看到不同序（抄同桌选「B」失效）。
 * xorshift32 + FNV-1a 种子，纯前端呈现层，服务端题序与标答不动。
 */
function seededPerm(n: number, seedStr: string): number[] {
  let h = 2166136261
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619) }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296 }
  const p = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]] }
  return p
}
const perms = computed(() =>
  (paper.value?.items || []).map((it, i) => seededPerm(it.options.length, `${auth.user?.id || 'anon'}:${aid}:${i}`)))
/** 当前题的展示序：j = 原始索引（answers/提交用），text = 选项文本 */
const curOpts = computed(() => perms.value[idx.value].map((j) => ({ j, text: cur.value.options[j] })))

/** 只在真有进展时落草稿：全空卷不算「进行中」，测评中心据此分栏 */
watch([answers, idx], () => {
  if (!paper.value || done.value) return
  if (answers.value.some((a) => a >= 0) || idx.value > 0) {
    localStorage.setItem(draftKey, JSON.stringify({ answers: answers.value, idx: idx.value }))
  }
}, { deep: true })

function restoreDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey) || 'null')
    if (d && Array.isArray(d.answers) && d.answers.length === paper.value!.items.length) {
      answers.value = d.answers.map((a: unknown) => (typeof a === 'number' && a >= -1 ? a : -1))
      idx.value = Math.min(Math.max(0, Number(d.idx) || 0), paper.value!.items.length - 1)
    }
  } catch { /* 草稿坏了就当没有，从头答 */ }
}

async function submit() {
  if (unanswered.value && !confirm(`还有 ${unanswered.value} 题没选，没选的算错。确定交卷吗？`)) return
  if (!confirm('交卷后不能修改，也不能重做。确定吗？')) return
  busy.value = true
  err.value = ''
  try {
    await studyApi.submit(aid, {
      answers: answers.value.map((a) => (a < 0 ? -1 : a)),
      duration_sec: Math.round((Date.now() - t0) / 1000),
      target_id: targetId,
    })
    localStorage.removeItem(draftKey)
    done.value = true
    loadMeta()          // probe 卷交卷后追加负荷自评条；fire-and-forget，不阻塞完成页
  } catch (e) {
    err.value = e instanceof Error ? e.message : '交卷失败，请重试'
    // 409 = 服务端已收到卷（多半是响应在路上丢了）—— 重试只会再撞 409，
    // 学生会陷在「重试→两次确认→又失败」的死循环里。这种情况告诉他找老师核实即可。
    const dup = e instanceof ApiError && e.status === 409
    if (dup) {
      err.value = '卷子已经交上去了（刚才网络卡了一下）。找老师确认一下就好。'
      localStorage.removeItem(draftKey)
    }
    retriable.value = !dup
  } finally { busy.value = false }
}

async function load() {
  err.value = ''
  try {
    paper.value = await studyApi.paper(aid)
    answers.value = paper.value.items.map(() => -1)
    restoreDraft()
  } catch (e) {
    // 未成年人保护：没登记监护人同意就不能作答，要说清楚怎么办，而不是白屏
    const consent = e instanceof ApiError && e.message.includes('CONSENT')
    err.value = consent
      ? '请先把监护人签好的同意书交给老师，老师登记后就能作答了。'
      : (e instanceof Error ? e.message : '题目读取失败')
    // 已交过（409）：陈年草稿一并清掉，测评中心不再显示「进行中」
    if (e instanceof ApiError && e.status === 409) localStorage.removeItem(draftKey)
    retriable.value = !consent
  }
}

onMounted(load)
</script>

<style scoped>
.as { display: flex; flex-direction: column; gap: var(--sp-3); max-width: 720px; margin: 0 auto;
  padding: var(--sp-4); }
.bar { display: flex; align-items: center; gap: var(--sp-3); }
.cnt { font-size: var(--fs-sm); color: var(--color-text-2); font-variant-numeric: tabular-nums; }
/* .retry 已收编为 global.css 的 .alert .retry */
.dots { display: flex; gap: 4px; flex-wrap: wrap; margin-left: auto; }
.dots i { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-a12); }
.dots i.on { background: var(--color-success); }
.dots i.cur { outline: 2px solid var(--color-primary); outline-offset: 1px; }
.q { display: flex; flex-direction: column; gap: var(--sp-2); }
.stem { font-size: var(--fs-md); line-height: 2; }
.opt { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: var(--r-md);
  background: var(--color-fill-1); cursor: pointer; font-size: var(--fs-sm); line-height: 1.7;
  border: 1.5px solid transparent; min-height: 44px; }
.opt.on { border-color: var(--color-primary); background: var(--color-primary-soft); }
.opt input { margin-top: 4px; width: 18px; height: 18px; }
.acts { display: flex; align-items: center; gap: var(--sp-2); }
.ok { border: none; background: var(--on-primary-bg); color: var(--on-primary-fg); padding: 11px 22px;
  border-radius: var(--r-md); cursor: pointer; font-weight: var(--fw-medium); text-decoration: none;
  min-height: 44px; display: inline-flex; align-items: center; }
.ok:disabled { opacity: .5; cursor: not-allowed; }
.cancel { border: none; background: var(--ink-a06); color: var(--color-text-2); padding: 11px 20px;
  border-radius: var(--r-md); cursor: pointer; min-height: 44px; }
.cancel:disabled { opacity: .4; cursor: not-allowed; }
.thin { font-size: var(--fs-xs); color: var(--color-text-3); line-height: 1.8; }
/* .alert 已收编为 global.css 全局错误条 */
.done { display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-2); }
.done__img { width: 72px; height: 72px; }
.done__t { font-size: var(--fs-lg); font-weight: var(--fw-bold); }
/* —— 轮末负荷自评：触控目标 ≥44px（初中生平板机房），样式全走令牌 —— */
.load { display: flex; flex-direction: column; gap: var(--sp-2); }
.load__q { font-size: var(--fs-sm); color: var(--color-text-2); }
.load__row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ldot { min-width: 44px; min-height: 44px; border: 1.5px solid var(--color-border);
  background: var(--color-surface); color: var(--color-text-2); border-radius: var(--r-pill);
  cursor: pointer; font: inherit; font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
.ldot.on { border-color: var(--color-primary); background: var(--color-primary-soft); color: var(--color-primary-ontext); }
.ldot:disabled { opacity: .6; cursor: not-allowed; }
.load__ok { font-size: var(--fs-sm); color: var(--color-success-ontext); }
</style>
