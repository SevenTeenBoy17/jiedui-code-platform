/**
 * 里程碑：**一生只弹一次**的能力确认。
 *
 * 只有四个，且只在「第一次做到」时出现：
 *   first_run 第一次跑通 · first_fix 第一次自己修好报错
 *   first_swap 第一次换位 · first_blocks3 第一次用积木拼出 3 块以上
 *
 * 刻意**没有**的东西（这几条不是遗漏，是设计）：
 *   没有计数、没有徽章墙、没有「还差 N 个」、没有排行榜、没有连击。
 *   一旦可累积可比较，它就从「我做到了」变成「我要凑够」，而凑数的行为
 *   正是课题要采集的过程数据 —— 学生刷行为就等于刷研究数据。
 *
 * 「一次」由**服务端**裁定（milestones 表主键去重）。放 localStorage 的话，
 * 换台机器或清一次缓存就能重刷，那它就成了可反复触发的奖励。
 */
import { ref } from 'vue'
import { request } from '@/api/http'

export type MilestoneKind = 'first_run' | 'first_fix' | 'first_swap' | 'first_blocks3'

const TEXT: Record<MilestoneKind, string> = {
  first_run: '第一次跑通了！',
  first_fix: '你自己把错误改对了',
  first_swap: '第一次换位成功',
  first_blocks3: '搭出了第一段积木',
}

/** 当前展示的里程碑（全局单例：同一时刻只展示一枚） */
export const current = ref<{ kind: MilestoneKind; text: string } | null>(null)

/**
 * 待展示队列。「报错→改好→跑通」会同步连发 first_run + first_fix：
 * 原来后到的直接覆盖 `current` 并 clearTimeout 掉前一枚 —— 而服务端两枚都已记为
 * 已认领（INSERT OR IGNORE 消耗掉了「首次」），被覆盖那枚**永远不会再弹**。
 * 排队展示而不是串行发请求：推迟 claim 会推迟服务端记账，队列只推迟展示。
 */
const pending: { kind: MilestoneKind; text: string }[] = []

function showNext() {
  const next = pending.shift()
  current.value = next || null
  if (next) window.setTimeout(showNext, 2600)
}

export function useMilestone() {
  /** 认领；服务端说是首次才展示。任何失败都静默 —— 它是锦上添花，不能打断学习。 */
  async function claim(kind: MilestoneKind, displayText = TEXT[kind]) {
    try {
      const r = await request<{ first: boolean }>('/api/student/milestone', {
        method: 'POST', body: JSON.stringify({ kind }),
      })
      if (!r.first) return
      // Presentation can describe only what this caller actually verified; event identity stays unchanged.
      pending.push({ kind, text: displayText })
      if (!current.value) showNext()          // 空闲才立刻放，否则等当前那枚播完
    } catch { /* 静默 */ }
  }

  return { claim, current }
}
