/**
 * 代码运行。优先真实后端 `/api/run`（FastAPI 真实执行 Python/C++/C，§4.2）；
 * 后端不可用时回退前端 mock（仅 Python 正则回显）。
 * 统一 RunResult，字段对齐 specs/IMPL-三语言真实执行 §6。
 */
export interface RunResult {
  stdout: string
  stderr: string
  status: 'success' | 'error' | 'timeout'
  durationMs: number
  mock: boolean
}

function runMock(language: 'python' | 'cpp' | 'c', code: string): RunResult {
  let stdout = ''
  if (language === 'python') {
    const prints = [...code.matchAll(/print\(\s*(["'])([\s\S]*?)\1\s*\)/g)].map((m) => m[2])
    stdout = prints.length ? prints.join('\n') : '(无 print 输出)'
  } else {
    stdout = `[离线模拟] ${language.toUpperCase()} 真实编译需后端在线（:9099）。`
  }
  return { stdout, stderr: '', status: 'success', durationMs: 0, mock: true }
}

export async function runCode(
  language: 'python' | 'cpp' | 'c',
  code: string,
  token: string,
): Promise<RunResult> {
  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ language, code }),
    })
    if (res.ok) return (await res.json()) as RunResult
    return runMock(language, code)
  } catch {
    return runMock(language, code)
  }
}
