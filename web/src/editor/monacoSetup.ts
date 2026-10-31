/**
 * Monaco 编辑器初始化（Vite worker 设置）。
 * 入口用 editor.api（核心编辑器）替代全量 monaco-editor 包，语法高亮按需只引
 * Python 与 C/C++ 两个 basic-languages contribution（cpp.contribution 同时注册
 * c 和 cpp 两个语言 id），甩掉几十种无关语言与 html/css/json/ts 语言服务。
 * 仅需基础 editor.worker，导出面不变。
 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/basic-languages/python/python.contribution'
import 'monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

;(self as any).MonacoEnvironment = {
  getWorker() {
    return new EditorWorker()
  },
}

/** 教育主题（柔和深色，对应 §4.1 教育主题 token） */
monaco.editor.defineTheme('jiedui-edu', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': '#1E1E2E',
    'editor.lineHighlightBackground': '#2A2A3C',
    'editorLineNumber.foreground': '#6B7394',
  },
})

export { monaco }

export function toMonacoLang(lang: 'python' | 'cpp' | 'c'): string {
  return lang
}
