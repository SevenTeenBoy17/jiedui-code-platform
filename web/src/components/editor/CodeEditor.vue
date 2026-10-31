<template>
  <div ref="host" class="code-editor"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = withDefaults(
  defineProps<{ modelValue: string; language: 'python' | 'cpp' | 'c'; readOnly?: boolean }>(),
  { readOnly: false },
)
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const host = ref<HTMLElement>()
let editor: any = null
let monacoRef: any = null
let applyingExternal = false

onMounted(async () => {
  // 懒加载 Monaco（§4.11 按需加载）
  const { monaco, toMonacoLang } = await import('@/editor/monacoSetup')
  monacoRef = monaco
  if (!host.value) return
  editor = monaco.editor.create(host.value, {
    value: props.modelValue,
    language: toMonacoLang(props.language),
    theme: 'jiedui-edu',
    fontSize: 15,
    fontFamily: "'JetBrains Mono','Cascadia Code',Consolas,monospace",
    minimap: { enabled: false },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    tabSize: 4,
    readOnly: props.readOnly,
    /* 读屏可及性（R4）：只读态（观察者）要在名称里说清，否则读屏用户不知道为何打不了字 */
    ariaLabel: props.readOnly ? '代码编辑器，当前为观察者模式，只读' : '代码编辑器',
    padding: { top: 14 },
  })
  editor.onDidChangeModelContent(() => {
    if (applyingExternal) return
    emit('update:modelValue', editor.getValue())
  })
})

watch(
  () => props.modelValue,
  (v) => {
    if (editor && v !== editor.getValue()) {
      applyingExternal = true
      editor.setValue(v)
      applyingExternal = false
    }
  },
)
watch(
  () => props.language,
  (lang) => {
    if (editor && monacoRef) monacoRef.editor.setModelLanguage(editor.getModel(), lang)
  },
)
watch(
  () => props.readOnly,
  // 角色互换时 ariaLabel 同步更新：驾驶员⇄观察者的只读切换要让读屏用户听得到
  (ro) =>
    editor &&
    editor.updateOptions({
      readOnly: ro,
      ariaLabel: ro ? '代码编辑器，当前为观察者模式，只读' : '代码编辑器',
    }),
)

onBeforeUnmount(() => editor && editor.dispose())
</script>

<style scoped>
.code-editor { width: 100%; height: 100%; min-height: 200px; }
</style>
