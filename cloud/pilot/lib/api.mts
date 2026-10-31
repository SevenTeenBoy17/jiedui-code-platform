type Settings = { url?: string; key?: string };
type Dependencies = { fetch?: typeof fetch };
const COOKIE = '__Host-jiedui_access';
const CLEAR = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
const MAX_BODY = 80000;
class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message); this.status = status; this.code = code;
  }
}
const failure = (status: number, code: string, message: string): never => { throw new ApiError(status, code, message); };
const messages: Record<number, [string, string]> = {
  400: ['INVALID_INPUT', '请检查填写内容。'],
  401: ['SESSION_EXPIRED', '登录已失效，请重新登录。未保存内容请先保留。'],
  403: ['NOT_INVITED', '该账号尚未获得试用权限，或权限已被收回。'],
  404: ['NOT_FOUND', '找不到这份作品，或你没有访问权限。'],
  409: ['VERSION_CONFLICT', '版本已变化或重复请求内容不一致。你的编辑稿仍保留，请查看最新版本。'],
  413: ['TOO_LARGE', '内容超过试用版大小限制。'],
  429: ['LIMIT_REACHED', '请求过于频繁或已达到试用限额，请稍后再试。'],
};
function response(body: unknown, status = 200, cookie?: string) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow', 'Vary': 'Cookie',
  });
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}
function cookieToken(req: Request) {
  const matches = (req.headers.get('cookie') ?? '').split(';').map(x => x.trim())
    .filter(x => x.startsWith(COOKIE + '='));
  if (matches.length !== 1) return '';
  const value = matches[0].slice(COOKIE.length + 1);
  return /^[A-Za-z0-9._-]{1,8192}$/.test(value) ? value : '';
}
async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    return failure(400, 'INVALID_INPUT', '请求必须使用 JSON。');
  const reader = req.body?.getReader();
  if (!reader) return failure(400, 'INVALID_INPUT', '请求内容为空。');
  let size = 0; const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); return failure(413, 'TOO_LARGE', '请求内容过大。'); }
    chunks.push(value);
  }
  try {
    const all = new Uint8Array(size); let offset = 0;
    for (const c of chunks) { all.set(c, offset); offset += c.byteLength; }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { return failure(400, 'INVALID_INPUT', '无法识别请求内容。'); }
}
function exactKeys(body: Record<string, unknown>, keys: string[]) {
  if (Object.keys(body).some(k => !keys.includes(k))) failure(400, 'INVALID_INPUT', '包含不支持的参数。');
}
export function createHandler(settings: Settings, deps: Dependencies = {}) {
  const request = deps.fetch ?? fetch;
  return async (req: Request): Promise<Response> => {
    let logout = false;
    try {
      const url = new URL(req.url);
      const path = url.pathname.replace(/\/$/, '');
      const route = path.match(/^\/api\/projects\/(\d+)(\/versions)?$/);
      const login = path === '/api/auth/login' && req.method === 'POST';
      logout = path === '/api/auth/logout' && req.method === 'POST';
      const me = path === '/api/auth/me' && req.method === 'GET';
      const rootProjects = path === '/api/projects' && ['GET', 'POST'].includes(req.method);
      if (!(login || logout || me || rootProjects || (route && ['GET', 'POST'].includes(req.method))))
        return failure(404, 'NOT_AVAILABLE', '这个功能尚未迁移到云端试用版。');
      if (route && req.method === 'POST' && !route[2]) return failure(405, 'METHOD_NOT_ALLOWED', '不支持此操作。');
      if (req.method === 'POST' && req.headers.get('origin') !== url.origin)
        return failure(403, 'ORIGIN_DENIED', '请求来源不匹配，请从本站页面操作。');
      const body = req.method === 'POST' ? await jsonBody(req) : {};
      if (!settings.url || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(settings.url) || !settings.key)
        return failure(503, 'SERVICE_UNAVAILABLE', '试用服务尚未配置完成。');
      const deadline = AbortSignal.timeout(20000);
      async function upstream(path: string, method: string, token?: string, payload?: unknown, noBody = false) {
        let r: Response;
        try {
          r = await request(settings.url + path, { method, redirect: 'error', signal: deadline,
            headers: { apikey: settings.key!, ...(token ? { Authorization: 'Bearer ' + token } : {}),
              ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}) },
            ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
          });
        } catch { return failure(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用；保存结果可能尚未确认，请保留编辑稿。'); }
        if (!r.ok) {
          const [code, text] = messages[r.status] ?? ['SERVICE_UNAVAILABLE', '服务暂时不可用；请保留编辑稿，稍后核对保存状态。'];
          return failure(messages[r.status] ? r.status : 503, code, text);
        }
        if (r.status === 204 || noBody) return null;
        try { return await r.json(); }
        catch { return failure(503, 'SERVICE_UNAVAILABLE', '服务返回结果不完整，请稍后核对。'); }
      }
      async function verified(token: string) {
        if (!token) return failure(401, ...messages[401]);
        let identity;
        try { identity = await upstream('/auth/v1/user', 'GET', token); }
        catch (error) {
          // Auth can return 403 for an invalid JWT or revoked session. This is
          // not the member-list 403 from the subsequent application RPC.
          if (error instanceof ApiError && [401, 403].includes(error.status))
            return failure(401, ...messages[401]);
          throw error;
        }
        if (!identity?.id || identity.is_anonymous) return failure(401, ...messages[401]);
        return identity;
      }
      if (login) {
        exactKeys(body, ['email', 'password']);
        if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.length > 254 ||
            typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 1024)
          return failure(400, 'INVALID_INPUT', '请填写有效邮箱和密码。');
        const session = await upstream('/auth/v1/token?grant_type=password', 'POST', undefined, body);
        if (typeof session?.access_token !== 'string' || !/^[A-Za-z0-9._-]{1,8192}$/.test(session.access_token) ||
            typeof session.expires_in !== 'number' || !Number.isFinite(session.expires_in) || session.expires_in <= 0)
          return failure(503, 'SERVICE_UNAVAILABLE', '登录返回不完整，请稍后再试。');
        const identity = await verified(session.access_token);
        const user = await upstream('/rest/v1/rpc/pilot_me', 'POST', session.access_token, {});
        if (user?.id !== identity.id || !['student', 'teacher'].includes(user?.role)) return failure(403, ...messages[403]);
        const seconds = Math.floor(Math.min(1800, session.expires_in,
          typeof session.expires_at === 'number' ? session.expires_at - Date.now() / 1000 : 1800));
        if (seconds <= 0) return failure(401, ...messages[401]);
        return response({ user }, 200, `${COOKIE}=${session.access_token}; Path=/; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Strict`);
      }
      const token = cookieToken(req);
      if (logout) {
        if (token) await upstream('/auth/v1/logout?scope=local', 'POST', token, undefined, true);
        return response({ ok: true, remoteRevoked: token ? true : null, alreadySignedOut: !token }, 200, CLEAR);
      }
      const identity = await verified(token);
      if (me) {
        const user = await upstream('/rest/v1/rpc/pilot_me', 'POST', token, {});
        if (user?.id !== identity.id) return failure(403, ...messages[403]);
        return response({ user });
      }
      let operation: string;
      let payload: Record<string, unknown> = body;
      if (rootProjects) {
        operation = req.method === 'GET' ? 'list' : 'create';
        if (operation === 'create') exactKeys(body, ['title', 'language', 'requestId']);
      } else {
        const id = Number(route![1]);
        if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) return failure(404, ...messages[404]);
        operation = route![2] ? (req.method === 'POST' ? 'save' : 'versions') : 'get';
        if (operation === 'save') exactKeys(body, ['code', 'blockState', 'expectedVersion', 'requestId']);
        payload = { ...body, id };
      }
      const result = await upstream('/rest/v1/rpc/pilot_projects', 'POST', token, { operation, payload });
      return response(result, operation === 'create' ? 201 : 200);
    } catch (error) {
      const err = error instanceof ApiError ? error : new ApiError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用，请保留编辑稿。');
      if (logout && err.code !== 'ORIGIN_DENIED' && err.code !== 'INVALID_INPUT')
        return response({ error: { code: 'LOGOUT_UNCONFIRMED', message: '本机已退出，但远端会话撤销未确认。请联系管理员核对。' } }, 503, CLEAR);
      return response({ error: { code: err.code, message: err.message } }, err.status, err.status === 401 ? CLEAR : undefined);
    }
  };
}
