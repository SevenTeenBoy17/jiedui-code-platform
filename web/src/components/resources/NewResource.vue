<!-- @lintOverlay 新建资源弹窗：遮罩浮层，不占资源页的常驻屏。 -->
<template>
  <div class="mask" @click.self="$emit('close')">
    <GlassPanel ref="sheetEl" strong class="sheet" role="dialog" aria-modal="true" :aria-label="TITLE[kind]" tabindex="-1">
      <h3 class="t">{{ TITLE[kind] }}</h3>

      <label class="f"><span>标题</span><input v-model="title" :placeholder="PH[kind]" /></label>
      <label class="f"><span>一句话说明</span><input v-model="summary" placeholder="选填，≤40 字" /></label>

      <template v-if="kind === 'bank'">
        <div class="row">
          <label class="f"><span>语言</span>
            <select v-model="language"><option>python</option><option>cpp</option><option>c</option></select>
          </label>
          <label class="f"><span>难度</span>
            <select v-model.number="difficulty">
              <option :value="1">入门</option><option :value="2">基础</option>
              <option :value="3">提高</option><option :value="4">挑战</option>
            </select>
          </label>
        </div>
        <label class="f"><span>主要锻炼</span>
          <select v-model="dim">
            <option value="">不指定</option>
            <option v-for="(l, k) in DIM" :key="k" :value="k">{{ l }}</option>
          </select>
        </label>
      </template>

      <template v-else-if="kind === 'video'">
        <label class="f"><span>视频链接</span><input v-model="url" placeholder="https://www.bilibili.com/..." /></label>
        <p class="note">非白名单域名会标记「待审核」，学生端暂不可见。</p>
      </template>

      <template v-else>
        <label class="f"><span>教学目标</span><input v-model="goal" placeholder="选填，如：掌握循环" /></label>
      </template>

      <div class="acts">
        <button class="ok" :disabled="busy || !title.trim()" @click="submit">{{ busy ? '提交中…' : '创建' }}</button>
        <button class="cancel" @click="$emit('close')">取消</button>
      </div>
      <p v-if="err" class="err">{{ err }}</p>
    </GlassPanel>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
import { resourcesApi } from '@/api/resources'
import GlassPanel from '@/components/ui/GlassPanel.vue'
import { useModalA11y } from '@/composables/useModalA11y'

const props = defineProps<{ kind: string }>()
const emit = defineEmits<{ close: []; done: [] }>()

const TITLE: Record<string, string> = { bank: '新建题目', video: '添加学习视频', set: '新建练习集' }
const PH: Record<string, string> = { bank: '如：猜数字游戏', video: '如：Python 循环入门', set: '如：第一周练习' }
const DIM: Record<string, string> = {
  decompose: '分解', abstract: '抽象', model: '建模', algorithm: '算法设计', verify: '验证优化', transfer: '迁移',
}

// 弹层焦点圈闭（R3 裁决8）：组件挂载即打开；卸载前置 false 触发焦点还位
const modalOpen = ref(true)
const sheetEl = ref<InstanceType<typeof GlassPanel>>()
useModalA11y(modalOpen, computed(() => sheetEl.value?.$el as HTMLElement | undefined), () => emit('close'))
onBeforeUnmount(() => (modalOpen.value = false))

const title = ref('')
const summary = ref('')
const language = ref('python')
const difficulty = ref(2)
const dim = ref('')
const url = ref('')
const goal = ref('')
const busy = ref(false)
const err = ref('')

async function submit() {
  busy.value = true
  err.value = ''
  try {
    if (props.kind === 'bank') {
      await resourcesApi.createExercise({
        title: title.value, summary: summary.value, language: language.value,
        difficulty: difficulty.value, ct_dims: dim.value ? { [dim.value]: 5 } : {},
      })
    } else if (props.kind === 'video') {
      await resourcesApi.createVideo({ title: title.value, summary: summary.value, url: url.value })
    } else {
      await resourcesApi.createSet({ title: title.value, goal: goal.value })
    }
    emit('done')
  } catch (e: any) {
    err.value = e?.message || '创建失败'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.mask { position: fixed; inset: 0; background: var(--ink-a04); display: grid; place-items: center;
  z-index: var(--z-modal); padding: var(--sp-4); }
.sheet { width: min(440px, 94vw); display: flex; flex-direction: column; gap: var(--sp-3); }
.t { font-size: var(--fs-md); font-weight: var(--fw-bold); }
.f { display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-xs); color: var(--color-text-2); }
.f input, .f select { height: 38px; border: 1px solid var(--color-border); background: var(--color-surface);
  border-radius: var(--r-md); padding: 0 var(--sp-3); outline: none; font: inherit; font-size: var(--fs-sm); color: var(--color-text); }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); }
.note { font-size: var(--fs-xs); color: var(--color-text-3); }
.acts { display: flex; gap: var(--sp-2); margin-top: var(--sp-2); }
.ok { flex: 1; border: none; background: var(--color-primary); color: #fff; padding: 10px; border-radius: var(--r-md);
  cursor: pointer; font-weight: var(--fw-medium); }
.ok:disabled { opacity: .5; cursor: not-allowed; }
.cancel { border: none; background: var(--ink-a06); color: var(--color-text-2); padding: 10px 18px;
  border-radius: var(--r-md); cursor: pointer; }
.err { color: var(--color-danger); font-size: var(--fs-sm); }
</style>
