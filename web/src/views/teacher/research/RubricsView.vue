<!-- @copyBudget 80  教研·量表：计算思维六维表现性评价量规 -->
<template>
  <div class="rb">
    <PageHead desc="计算思维六维表现性评价量规" />
    <GlassPanel class="intro">
      <p class="intro__s">{{ RUBRIC_INTRO }}</p>
    </GlassPanel>

    <BentoGrid min="300px" class="stagger">
      <GlassPanel v-for="(r, i) in RUBRICS" :key="r.key" class="dim" :style="{ '--i': i }">
        <div class="dim__h">
          <img :src="asset('ct_' + r.key)" class="dim__ic" alt="" />
          <b>{{ r.label }}</b>
          <span v-if="classScore(r.key) !== null" class="dim__now" title="本班六维均分">
            本班 {{ classScore(r.key) }}
          </span>
        </div>

        <!-- 四水平：首屏只显示水平标题，行为描述与数据佐证折叠 -->
        <ol class="lv">
          <li v-for="l in r.levels" :key="l.lv" :class="'l' + l.lv">
            <span class="lv__n">{{ l.lv }}</span>
            <span class="lv__t">{{ l.title }}</span>
          </li>
        </ol>

        <details class="more">
          <summary>看行为描述与数据佐证</summary>
          <dl class="desc">
            <template v-for="l in r.levels" :key="l.lv">
              <dt>水平{{ l.lv }} · {{ LEVEL_LABELS[l.lv] }}</dt>
              <dd>{{ l.desc }}</dd>
            </template>
          </dl>
          <p class="sig__t">平台数据信号</p>
          <ul class="sig">
            <li v-for="(s, j) in r.signals" :key="j">{{ s }}</li>
          </ul>
          <p class="iv"><b>停在水平1–2 时：</b>{{ r.intervention }}</p>
        </details>
      </GlassPanel>
    </BentoGrid>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { asset } from '@/assets/assets'
import { RUBRICS, RUBRIC_INTRO, LEVEL_LABELS, type RubricKey } from '@/constants/rubrics'
import { useTeacherHome } from '@/composables/useTeacherHome'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import BentoGrid from '@/components/ui/BentoGrid.vue'
import PageHead from '@/components/ui/PageHead.vue'

const { classCt, load } = useTeacherHome()

/** 把本班六维均分挂到对应维度：量规不是死文档，是对着真实数据看的尺子。 */
function classScore(k: RubricKey): number | null {
  const v = (classCt.value as Record<string, number>)?.[k]
  return typeof v === 'number' ? v : null
}

onMounted(() => load())
</script>

<style scoped>
.rb { display: flex; flex-direction: column; gap: var(--sp-3); }
.intro__s { font-size: var(--fs-sm); color: var(--color-text-2); line-height: 1.8; }
.dim { display: flex; flex-direction: column; gap: 8px; }
.dim__h { display: flex; align-items: center; gap: 8px; }
.dim__ic { width: 30px; height: 30px; }
.dim__h b { font-size: var(--fs-sm); flex: 1; }
.dim__now { font-size: var(--fs-xs); background: var(--color-primary-soft); color: var(--color-primary-strong);
  padding: 2px 9px; border-radius: var(--r-pill); font-variant-numeric: tabular-nums; }
.lv { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.lv li { display: flex; align-items: center; gap: 7px; font-size: var(--fs-xs); color: var(--color-text-2);
  padding: 4px 7px; border-radius: var(--r-sm); background: var(--ink-a04); }
.lv__n { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center;
  font-size: var(--fs-xs); background: var(--color-border); color: var(--color-text); flex-shrink: 0; }
.l3 .lv__n { background: #BEEDE6; }
.l4 .lv__n { background: var(--on-success-bg); color: var(--on-success-fg); }
.more { font-size: var(--fs-xs); }
.more > summary { cursor: pointer; color: var(--color-primary-ontext); }
.desc { margin: 8px 0 0; font-size: var(--fs-xs); }
.desc dt { color: var(--color-text-3); margin-top: 6px; }
.desc dd { margin: 2px 0 0; color: var(--color-text-2); line-height: 1.7; }
.sig__t { margin: 10px 0 2px; font-size: var(--fs-xs); color: var(--color-text-3); }
.sig { margin: 0; padding-left: 18px; font-size: var(--fs-xs); color: var(--color-text-2); line-height: 1.8; }
.iv { margin-top: 10px; font-size: var(--fs-xs); color: var(--color-text-2); line-height: 1.8; }
</style>
