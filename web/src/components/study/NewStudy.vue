<!-- 新建课题表单（照 components/resources/NewResource.vue 的先例抽成组件）。 -->
<template>
  <GlassPanel class="form">
    <label class="f"><span>课题名称</span><input v-model="form.title" /></label>

    <div class="row">
      <div class="f"><span>实验组·用苏格拉底引导</span>
        <div class="picks">
          <label v-for="c in classes" :key="'e' + c.id" class="pick">
            <input type="checkbox" :value="c.id" v-model="form.exp_class_ids" />{{ c.name }}·{{ c.size }}人
          </label>
        </div>
      </div>
      <div class="f"><span>对照组·照常上课</span>
        <div class="picks">
          <label v-for="c in classes" :key="'c' + c.id" class="pick">
            <input type="checkbox" :value="c.id" v-model="form.ctrl_class_ids" />{{ c.name }}·{{ c.size }}人
          </label>
        </div>
      </div>
    </div>

    <details class="more">
      <summary>研究问题与分班方式（可不填）</summary>
      <label class="f"><span>研究问题（一句话）</span>
        <input v-model="form.question" placeholder="如：AI 只提问能否提升算法设计能力" />
      </label>
      <label class="f"><span>分班方式</span>
        <select v-model="form.assign_method">
          <option value="intact">用原有教学班（整群）</option>
          <option value="random">随机分配到两组</option>
        </select>
      </label>
    </details>

    <p v-if="err" class="err">{{ err }}</p>
    <div class="acts">
      <button class="ok" :disabled="busy || !ready" @click="submit">{{ busy ? '创建中…' : '创建' }}</button>
      <button class="cancel" @click="$emit('close')">取消</button>
    </div>
  </GlassPanel>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { studyApi } from '@/api/study'
import type { Klass } from '@/api/resources'
import GlassPanel from '@/components/ui/GlassPanel.vue'

defineProps<{ classes: Klass[] }>()
const emit = defineEmits<{ close: []; done: [] }>()

const busy = ref(false)
const err = ref('')
const form = reactive({
  title: '结对编程智能体培养初中生计算思维的实践研究',
  question: '', assign_method: 'intact',
  exp_class_ids: [] as number[], ctrl_class_ids: [] as number[],
})

const ready = computed(() => form.exp_class_ids.length > 0 && form.ctrl_class_ids.length > 0)

async function submit() {
  busy.value = true
  err.value = ''
  try {
    await studyApi.create(form)
    emit('done')
  } catch (e) {
    // 后端会明确告诉你哪几个学生同时在两组班里 —— 这条提示必须原样显示给老师
    err.value = e instanceof Error ? e.message : '创建失败'
  } finally { busy.value = false }
}
</script>

<style scoped>
.form { display: flex; flex-direction: column; gap: var(--sp-2); }
.f { display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-xs); color: var(--color-text-2); }
.f input, .f select { height: 38px; border: 1px solid var(--color-border); background: var(--color-surface);
  border-radius: var(--r-md); padding: 0 var(--sp-3); outline: none; font: inherit; font-size: var(--fs-sm); color: var(--color-text); }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); }
.picks { display: flex; flex-wrap: wrap; gap: 4px 10px; max-height: 110px; overflow: auto; }
.pick { display: flex; align-items: center; gap: 4px; cursor: pointer; }
.more { font-size: var(--fs-xs); }
.more > summary { cursor: pointer; color: var(--color-primary-ontext); }
.err { font-size: var(--fs-xs); color: var(--color-danger-ontext); line-height: 1.7; }
.acts { display: flex; gap: var(--sp-2); }
.ok { border: none; background: var(--on-primary-bg); color: var(--on-primary-fg); padding: 10px 20px;
  border-radius: var(--r-md); cursor: pointer; font-weight: var(--fw-medium); }
.ok:disabled { opacity: .5; cursor: not-allowed; }
.cancel { border: none; background: var(--ink-a06); color: var(--color-text-2); padding: 10px 18px;
  border-radius: var(--r-md); cursor: pointer; }
@media (max-width: 760px) { .row { grid-template-columns: 1fr; } }
</style>
