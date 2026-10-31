/** Demo builds never execute visitor code or load a Python-to-JavaScript bridge. */
export function pyodideReady() { return true }
export async function runPythonTurtle(_code: string): Promise<{ stdout: string; error: string; turtle: any[] }> {
  // The original IDE then uses the explicitly labelled mock /api/run result.
  throw new Error('展示版只提供预设运行结果，不执行访客代码。')
}
