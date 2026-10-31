<template>
  <!-- IP 选择不是账号切换，也不代表真人交换键盘。 -->
  <div class="dock glass" :class="`is-${role}`">
    <button class="seat" :class="{ on: role === 'turtle' }" :aria-pressed="role === 'turtle'"
            :title="PAIR_PERSONAS.guide.description" :disabled="requestBusy"
            @click="setRole('turtle')">
      <img :src="PAIR_PERSONAS.guide.image" class="seat__ava" alt="" />
      <span class="seat__txt"><b>树小骥</b><small>导航员</small></span>
    </button>

    <button class="swap hov-lift" title="切换伙伴" aria-label="切换结对伙伴角色" :disabled="requestBusy" @click="swap">
      <span class="swap__ico" :class="{ spin }">⇄</span>
    </button>

    <button class="seat" :class="{ on: role === 'reviewer' }" :aria-pressed="role === 'reviewer'"
            :title="PAIR_PERSONAS.review.description" :disabled="requestBusy"
            @click="setRole('reviewer')">
      <img :src="PAIR_PERSONAS.review.image" class="seat__ava" alt="" />
      <span class="seat__txt"><b>熊猫泡泡</b><small>领航员</small></span>
    </button>

    <p class="hintline">{{ hint }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { PAIR_PERSONAS, usePairPersona } from '@/data/pairPersonas'

/** 旧 API 枚举保留，Studio 为两种 IP 都发送 socratic=true。 */
const props = defineProps<{ role: 'turtle' | 'reviewer' }>()
const emit = defineEmits<{ 'update:role': ['turtle' | 'reviewer'] }>()

const spin = ref(false)
const { requestBusy, selectPersona } = usePairPersona()

const hint = computed(() =>
  props.role === 'turtle'
    ? '树小骥帮你理清计划 · 由你动手实现'
    : '熊猫泡泡陪你检查 · 用问题启发验证',
)

function setRole(r: 'turtle' | 'reviewer') {
  if (requestBusy.value || r === props.role) return
  selectPersona(r === 'reviewer' ? 'review' : 'guide')
  emit('update:role', r)
}

function swap() {
  if (requestBusy.value) return
  spin.value = true
  setTimeout(() => (spin.value = false), 420)
  setRole(props.role === 'turtle' ? 'reviewer' : 'turtle')
}

defineExpose({ swap })
</script>

<style scoped>
.dock {
  display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: var(--sp-2);
  padding: 6px var(--sp-3) 4px; border-radius: var(--r-lg); position: relative;
}
.seat {
  display: flex; align-items: center; gap: 7px; border: 1.5px solid transparent; background: transparent;
  padding: 4px 10px; border-radius: var(--r-pill); cursor: pointer; font: inherit;
  transition: background var(--d-fast) var(--e-out), border-color var(--d-fast) var(--e-out), opacity var(--d-fast);
  opacity: .5;
}
.seat.on { opacity: 1; background: var(--color-surface); border-color: var(--color-accent-soft); box-shadow: var(--shadow-sm); }
.dock.is-reviewer .seat.on { border-color: var(--color-primary-soft); }
.seat__ava { width: 38px; height: 44px; flex-shrink: 0; object-fit: contain; }
.seat__txt { display: flex; flex-direction: column; line-height: 1.1; text-align: left; }
.seat__txt b { font-size: var(--fs-sm); color: var(--color-text); }
.seat__txt small { font-size: var(--fs-xs); color: var(--color-text-3); }
.swap {
  width: 30px; height: 30px; border-radius: var(--r-pill); border: 1px solid var(--color-border);
  background: var(--color-surface); cursor: pointer; display: grid; place-items: center; color: var(--color-text-2);
}
.swap__ico { display: block; transition: transform var(--d-slow) var(--e-spring); }
.swap__ico.spin { transform: rotate(180deg); }
.seat:focus-visible, .swap:focus-visible { outline: 3px solid var(--color-primary); outline-offset: 3px; }
.seat:disabled, .swap:disabled { cursor: wait; opacity: .6; }
.hintline {
  grid-column: 1 / -1; margin: 2px 0 0; text-align: center;
  font-size: 11px; color: var(--color-text-3);
}
@media (max-width: 760px) { .dock { padding: 6px; gap: 4px; } .seat { padding: 5px; gap: 4px; } .seat__ava { width: 28px; height: 34px; } .seat__txt b { font-size: 11px; } .seat__txt small { font-size: 10px; } .hintline { display: none; } }
@media (prefers-reduced-motion: reduce) { .seat, .swap__ico { transition: none; } }
</style>
