export class CloudApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message)
    this.name = 'CloudApiError'
  }
}

/** Same-origin cookie API. Never reuse local demonstration bearer tokens. */
export async function cloudRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith('/api/') || path.startsWith('//') || path.includes('\\')) {
    throw new CloudApiError(0, 'INVALID_PATH', '仅允许请求本站应用接口')
  }
  const headers = new Headers(init.headers)
  headers.delete('Authorization')
  if (init.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort()
  if (init.signal?.aborted) controller.abort()
  else init.signal?.addEventListener('abort', abortFromCaller, { once: true })
  let timer: ReturnType<typeof setTimeout>
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new CloudApiError(0, 'NETWORK_TIMEOUT', '服务器响应超时，请保留当前内容后重试'))
      controller.abort()
    }, 25000)
  })
  const read = async (): Promise<T> => {
    let response: Response
    try {
      response = await fetch(path, { ...init, headers, signal: controller.signal, credentials: 'same-origin', cache: 'no-store' })
    } catch {
      throw new CloudApiError(0, 'NETWORK_UNAVAILABLE', '连接服务器失败，请检查网络后重试')
    }
    if (response.status === 204) return null as T
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new CloudApiError(response.status, body?.error?.code || 'REQUEST_FAILED',
        body?.error?.message || (response.status === 401 ? '登录已过期，请重新登录' : `请求失败（${response.status}）`))
    }
    if (body === null) throw new CloudApiError(502, 'INVALID_RESPONSE', '服务器返回不完整，请稍后重试')
    return body as T
  }
  try {
    return await Promise.race([read(), deadline])
  } finally {
    clearTimeout(timer!)
    init.signal?.removeEventListener('abort', abortFromCaller)
  }
}
