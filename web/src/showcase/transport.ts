import { studentFixture } from './studentFixtures'
import { teacherFixture } from './teacherFixtures'
import { demoZip } from './download'

export const unmatchedShowcaseRequests: string[] = []
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Product-Mode': 'showcase', 'Cache-Control': 'no-store' },
})

export function createShowcaseFetch(nativeFetch: typeof fetch, origin: string, isTeacher = () => false): typeof fetch {
  return async (input, init) => {
    const request = input instanceof Request ? input : undefined
    const url = new URL(request?.url || String(input), origin)
    const method = (init?.method || request?.method || 'GET').toUpperCase()
    if (url.origin !== origin || url.pathname.startsWith('/.netlify/')) {
      return json({ detail: '展示版不连接外部服务或真实后端。' }, 403)
    }
    if (!url.pathname.startsWith('/api/')) {
      if (!['GET', 'HEAD'].includes(method)) return json({ detail: '展示版禁止网络写入。' }, 403)
      return nativeFetch(input, { ...init, credentials: 'omit' })
    }
    const path = url.pathname + url.search
    let body: any = {}
    try { body = JSON.parse(typeof init?.body === 'string' ? init.body : request ? await request.clone().text() : '{}') } catch { /* Empty body stays local. */ }
    if (url.pathname === '/api/run') return json({ stdout: '【预设运行演示】\n此处展示运行结果区域；未在云端执行本次代码。\n可通过下方测试、反思面板继续浏览学习流程。', stderr: '', status: 'success', durationMs: 0, mock: true })
    if (url.pathname === '/api/projects/upload') return json({ detail: '展示版暂不支持导入外部作品包。请直接打开已有演示作品。' }, 422)
    const result: any = isTeacher()
      ? teacherFixture(path, method, body) ?? studentFixture(path, method, body)
      : studentFixture(path, method, body) ?? teacherFixture(path, method, body)
    if (result?.showcaseDownload) return new Response(demoZip(result.files).buffer as ArrayBuffer, { headers: { 'Content-Type': 'application/zip', 'X-Product-Mode': 'showcase' } })
    if (result !== undefined && url.pathname.includes('/export') && ['csv', 'wide'].includes(url.searchParams.get('format') || '')) {
      const rows = result.students || result.records || []
      const cell = (value: unknown) => '"' + String(typeof value === 'object' ? JSON.stringify(value) : value ?? '').replace(/"/g, '""') + '"'
      const csv = '\ufeffmode,record,content\r\n' + rows.map((row: any, index: number) => ['DEMO_ONLY', row.pseudonym || `DEMO-${index + 1}`, row].map(cell).join(',')).join('\r\n')
      return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename=DEMO_ONLY_research.csv' } })
    }
    if (result !== undefined) return json(result)
    unmatchedShowcaseRequests.push(`${method} ${path}`)
    console.warn('[showcase] 未覆盖的演示入口:', method, path)
    return json({ detail: '此操作尚无演示示例；不会访问真实服务。' }, 501)
  }
}

export function installShowcaseTransport() {
  window.fetch = createShowcaseFetch(window.fetch.bind(window), window.location.origin, () => window.location.pathname.startsWith('/teacher'))
}
