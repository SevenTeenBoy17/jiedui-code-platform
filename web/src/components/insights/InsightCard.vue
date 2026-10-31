<template>
  <!-- 结论先行 + 证据折叠（V5 · D5）：教师首屏只读一句话，要追问才展开证据。 -->
  <GlassPanel class="ic">
    <div class="ic__h">
      <b class="ic__head">{{ card.headline }}</b>
      <span class="conf" :class="level" :title="`置信度 ${(card.confidence * 100).toFixed(0)}%`">
        {{ LEVEL[level] }}
      </span>
      <span class="src" :title="card.source === 'llm' ? '由大模型分析' : 'LLM 不可达，按规则给出'">
        {{ card.source === 'llm' ? 'AI' : '规则' }}
      </span>
    </div>

    <ul v-if="card.suggestions?.length" class="sug">
      <li v-for="(s, i) in card.suggestions" :key="i">{{ s }}</li>
    </ul>
    <p v-if="card.next_step" class="next">建议下一步：<b>{{ card.next_step }}</b></p>

    <details class="ev">
      <summary>看证据（{{ evidenceCount }} 项指标）</summary>
      <div class="ev__body">
        <div v-if="card.strengths?.length" class="grp">
          <span class="grp__t up">优势</span>
          <span v-for="(s, i) in card.strengths" :key="i" class="item">{{ s }}</span>
        </div>
        <div v-if="card.weaknesses?.length" class="grp">
          <span class="grp__t down">薄弱</span>
          <span v-for="(s, i) in card.weaknesses" :key="i" class="item">{{ s }}</span>
        </div>
        <div v-for="(v, k) in evidence" :key="k" class="grp">
          <span class="grp__t">{{ k }}</span>
          <template v-if="typeof v === 'object'">
            <span v-for="(vv, kk) in v" :key="kk" class="item">{{ kk }} {{ vv }}</span>
          </template>
          <span v-else class="item">{{ v }}</span>
        </div>
      </div>
    </details>

    <p v-if="card.blocked_words?.length" class="blocked">
      <BaseIcon name="alert-triangle" :size="13" /> 原始结论含不当措辞已被审核拦截
    </p>
  </GlassPanel>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import type { InsightCard } from '@/api/insights'

const props = defineProps<{ card: InsightCard; evidence?: Record<string, any> }>()

const LEVEL: Record<string, string> = { high: '较可信', mid: '参考', low: '数据不足' }
const level = computed(() => (props.card.confidence >= 0.7 ? 'high' : props.card.confidence >= 0.4 ? 'mid' : 'low'))
const evidenceCount = computed(() => {
  let n = (props.card.strengths?.length || 0) + (props.card.weaknesses?.length || 0)
  for (const v of Object.values(props.evidence || {})) n += typeof v === 'object' ? Object.keys(v).length : 1
  return n
})
</script>

<style scoped>
.ic { display: flex; flex-direction: column; gap: 8px; }
.ic__h { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ic__head { font-size: var(--fs-md); font-weight: var(--fw-bold); flex: 1; min-width: 180px; }
.conf { font-size: var(--fs-xs); padding: 2px 9px; border-radius: var(--r-pill); }
.conf.high { background: #dff5ee; color: #0f7a5f; }
.conf.mid { background: #fff0d6; color: #a35c00; }
.conf.low { background: var(--color-border-weak); color: var(--color-text-3); }
.src { font-size: var(--fs-xs); color: var(--color-text-3); border: 1px solid var(--glass-border); padding: 1px 7px; border-radius: var(--r-pill); }
.sug { margin: 0; padding-left: 18px; font-size: var(--fs-sm); color: var(--color-text-2); line-height: 1.9; }
.next { font-size: var(--fs-sm); color: var(--color-text-2); }
.next b { color: var(--color-primary-strong); }
.ev { font-size: var(--fs-sm); }
.ev > summary { cursor: pointer; color: var(--color-primary); font-size: var(--fs-xs); }
.ev__body { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.grp { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.grp__t { font-size: var(--fs-xs); color: var(--color-text-3); min-width: 40px; }
.grp__t.up { color: var(--color-success); }
.grp__t.down { color: var(--color-warning); }
.item { font-size: var(--fs-xs); background: var(--ink-a06); color: var(--color-text-2); padding: 2px 8px; border-radius: var(--r-pill); }
.blocked { font-size: var(--fs-xs); color: var(--color-danger); }
</style>
