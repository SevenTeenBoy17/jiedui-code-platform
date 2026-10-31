<!-- @copyBudget 90  教研·导出：脱敏研究数据（§4.9 §6.4） -->
<template>
  <div class="ex">
    <PageHead desc="下载脱敏后的研究数据" />
    <GlassPanel class="exp">
    <p class="s">已去标识化，可直接用于课题分析。</p>

    <!-- 细节折叠：首屏只留结论（少即是多） -->
    <details class="more">
      <summary>脱敏方式与字段</summary>
      <ul class="what">
        <li>学生 ID 哈希假名；剔除姓名与自由文本；时间转相对秒；风险仅留类别等级</li>
        <li>六维得分 + 行为计数（运行/报错/修复/求助/换位/设计）</li>
        <li>事件序列（type + 相对秒），可直接做滞后序列分析</li>
        <li>用时、作品语言与版本数</li>
      </ul>
    </details>

    <div class="acts">
      <button class="btn" :disabled="busy" @click="run('json')"><BaseIcon name="download" :size="14" /> JSON（含事件序列）</button>
      <button class="btn ghost" :disabled="busy" @click="run('csv')"><BaseIcon name="download" :size="14" /> CSV（每生一行）</button>
      <span v-if="tip" class="tip" :class="`tip--${tip.kind}`">{{ tip.t }}</span>
    </div>
    </GlassPanel>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { researchApi } from '@/api/research'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import BaseIcon from '@/components/ui/BaseIcon.vue'
import PageHead from '@/components/ui/PageHead.vue'

const busy = ref(false)
/** 结果驻留分叉：ok 3 秒自动清；err 常驻到下次导出覆盖 —— 失败不许悄悄溜走 */
const tip = ref<{ t: string; kind: 'run' | 'ok' | 'err' } | null>(null)
let tipTimer: number | undefined

async function run(fmt: 'json' | 'csv') {
  busy.value = true
  window.clearTimeout(tipTimer)
  tip.value = { t: '导出中…', kind: 'run' }
  const ok = await researchApi.export(fmt)
  tip.value = ok
    ? { t: '✓ 已下载（去标识化）', kind: 'ok' }
    : { t: '导出失败，请重试；反复失败请检查网络', kind: 'err' }
  busy.value = false
  if (ok) tipTimer = window.setTimeout(() => (tip.value = null), 3000)
}
</script>

<style scoped>
.exp { max-width: 620px; }
.s { font-size: var(--fs-sm); color: var(--color-text-2); line-height: 1.7; }
.more { margin-top: var(--sp-3); font-size: var(--fs-sm); color: var(--color-text-2); }
.more > summary { cursor: pointer; color: var(--color-primary); }
.what { margin: var(--sp-2) 0 0; padding-left: 20px; color: var(--color-text-2); font-size: var(--fs-sm); line-height: 1.9; }
.acts { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-4); flex-wrap: wrap; }
.btn { border: none; background: var(--on-primary-bg); color: var(--on-primary-fg); padding: 9px 16px;
  border-radius: var(--r-md); cursor: pointer; font-weight: var(--fw-medium); font-size: var(--fs-sm); }
.btn.ghost { background: var(--color-primary-soft); color: var(--color-primary-strong); }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.tip { font-size: var(--fs-sm); color: var(--color-text-3); }
/* 失败驻留态：达标对比度（ontext on soft），不是灰字一闪而过 */
.tip--err { color: var(--color-danger-ontext); background: var(--color-danger-soft);
  padding: 4px 10px; border-radius: var(--r-md); font-weight: var(--fw-medium); }
</style>
