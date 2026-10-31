<template>
  <component
    :is="clickable ? 'button' : 'div'"
    class="tile hov-lift hov-sheen"
    :class="[{ 'tile--btn': clickable }, spec?.state ? `is-${spec.state}` : '']"
    :style="{ background: `var(--tile-${tintName})` }"
    :title="spec?.hint || undefined"
    @click="onClick"
  >
    <img v-if="iconSrc" :src="iconSrc" class="tile__ic" alt="" />

    <!-- Spec 模式：1 判断（大数字）+ 1 动作（整片可点下钻） -->
    <template v-if="spec">
      <span class="tile__label">{{ spec.label }}</span>
      <span class="tile__value">
        {{ shownValue }}
        <em v-if="spec.delta" class="tile__delta" :class="deltaGood ? 'up' : 'down'">
          {{ spec.delta.v > 0 ? '↑' : '↓' }}{{ Math.abs(spec.delta.v) }}
        </em>
      </span>
      <svg v-if="spec.spark?.length" class="tile__spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
        <polyline :points="sparkPoints" fill="none" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </template>

    <!-- 兼容模式：原有 title/sub 用法（工作台瓷片） -->
    <template v-else>
      <span class="tile__title">{{ title }}</span>
      <span v-if="sub" class="tile__sub">{{ sub }}</span>
    </template>

    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { asset } from '@/assets/assets'
import { usePeek } from '@/composables/usePeek'
import { useCountUp } from '@/composables/useMotion'
import type { TileSpec } from '@/types/tile'

/**
 * 瓷片（V1 增强）。两种用法：
 *  A) 传 spec（TileSpec）→ 数据瓷片：label + value(+delta/spark) + 整片下钻，解释走 hint。
 *  B) 传 title/sub/icon/to → 导航瓷片（工作台原用法，向后兼容）。
 */
const props = withDefaults(
  defineProps<{
    spec?: TileSpec
    tint?: string; icon?: string; title?: string; sub?: string; to?: boolean
  }>(),
  { tint: 'blue', title: '' },
)
const emit = defineEmits<{ go: [] }>()

const router = useRouter()
const peek = usePeek()

const tintName = computed(() => props.spec?.tint || props.tint)
const iconSrc = computed(() => {
  const k = props.spec?.icon || props.icon
  return k ? asset(k) : ''
})
const clickable = computed(() => !!props.to || !!props.spec?.drill)
const deltaGood = computed(() => {
  const d = props.spec?.delta
  return !d ? false : d.good === 'up' ? d.v > 0 : d.v < 0
})

// KPI 数字滚动（低配自动跳过，见 useMotion）
const numeric = computed(() => (typeof props.spec?.value === 'number' ? props.spec.value : NaN))
const { shown, run } = useCountUp(() => (Number.isNaN(numeric.value) ? 0 : numeric.value))
const shownValue = computed(() =>
  Number.isNaN(numeric.value) ? props.spec?.value ?? '' : shown.value,
)
onMounted(() => { if (!Number.isNaN(numeric.value)) run() })
watch(numeric, (v) => { if (!Number.isNaN(v)) run() })

const sparkPoints = computed(() => {
  const s = props.spec?.spark ?? []
  if (s.length < 2) return ''
  const max = Math.max(...s), min = Math.min(...s), span = max - min || 1
  return s.map((v, i) => `${(i / (s.length - 1)) * 100},${22 - ((v - min) / span) * 20}`).join(' ')
})

function onClick() {
  const d = props.spec?.drill
  if (d) return 'peek' in d ? peek.open(d.peek) : router.push(d.to)
  if (props.to) emit('go')
}
</script>

<style scoped>
.tile {
  display: flex; flex-direction: column; align-items: flex-start; gap: 4px; text-align: left;
  padding: var(--sp-4); border-radius: var(--tile-radius); border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm); position: relative; overflow: hidden; width: 100%;
}
.tile--btn { cursor: pointer; font: inherit; }
.tile__ic { width: 52px; height: 52px; margin-bottom: 2px; filter: drop-shadow(0 4px 8px var(--ink-a12)); }
/* —— Spec 模式 —— */
.tile__label { font-size: var(--fs-xs); color: var(--color-text-2); }
.tile__value {
  font-size: var(--fs-xl); font-weight: var(--fw-bold); color: var(--color-text); line-height: 1.1;
  font-variant-numeric: tabular-nums; display: flex; align-items: baseline; gap: 6px;
}
.tile__delta { font-size: var(--fs-xs); font-style: normal; font-weight: var(--fw-medium); }
.tile__delta.up { color: var(--color-success); }
.tile__delta.down { color: var(--color-danger); }
.tile__spark { width: 100%; height: 24px; margin-top: 4px; color: var(--color-primary); opacity: .7; }
.is-warn .tile__value { color: var(--color-warning); }
.is-risk .tile__value { color: var(--color-danger); }
/* —— 兼容模式 —— */
.tile__title { font-size: var(--fs-md); font-weight: var(--fw-bold); color: var(--color-text); }
.tile__sub { font-size: var(--fs-xs); color: var(--color-text-2); }
</style>
