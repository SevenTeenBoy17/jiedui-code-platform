import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const origin = process.argv[2];
if (!/^https:\/\/[a-f0-9]{24}--jiedui-pilot-sg\.netlify\.app$/.test(origin || '')) throw new Error('Candidate origin required');
const root = new URL('../../', import.meta.url);
const build = JSON.parse(await readFile(new URL('.runtime/full-product-f1-20261014/latest-build.json', root)));
const accountFile = JSON.parse(await readFile(new URL('.runtime/netlify-n1-20261013/acceptance-accounts.private.json', root)));
const accounts = Array.isArray(accountFile) ? accountFile : (accountFile.accounts || Object.values(accountFile));
const account = accounts.find(a => a.email === 'n1-acceptance-a@jiedui.invalid');
if (!account?.password) throw new Error('Existing synthetic student credential not found');
const checks = []; let cookie = ''; let projectId;
function check(name, passed, details = {}) { checks.push({ name, passed, ...details }); if (!passed) throw new Error(`Check failed: ${name}`); }
async function request(path, body) {
  const response = await fetch(origin + path, { redirect: 'error', headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json', origin } : {}) },
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  const value = await response.json().catch(() => null);
  return { response, value };
}
try {
  const release = await request('/release.json');
  check('same-build release hash', release.value?.contentSha256 === build.contentSha256);
  for (const path of ['/login', '/student/home', '/student/ide', '/student/my-data', '/teacher/teaching/observe', '/teacher/research/profiles']) {
    const response = await fetch(origin + path); const html = await response.text();
    check(`original SPA ${path}`, response.status === 200 && html.includes('结对编程智能体') && html.includes('type="module"'));
  }
  for (const path of ['/assets/does-not-exist.js', '/pyodide/does-not-exist.wasm']) {
    const response = await fetch(origin + path); check(`missing asset stays 404 ${path}`, response.status === 404);
  }
  for (const path of ['/pyodide/pyodide.js', '/pyodide/pyodide.asm.js', '/pyodide/pyodide.asm.wasm', '/pyodide/python_stdlib.zip', '/pyodide/pyodide-lock.json', '/generated/student-canvas/student-cat-avatar-v2.png']) {
    const response = await fetch(origin + path, { method: 'HEAD' });
    check(`asset ${path}`, response.status === 200 && !response.headers.get('content-type')?.includes('text/html'), { contentType: response.headers.get('content-type') });
  }
  check('anonymous protected API denied', (await request('/api/projects')).response.status === 401);
  const login = await request('/api/auth/login', { email: account.email, password: account.password });
  check('existing student real authentication', login.response.status === 200 && login.value?.user?.role === 'student');
  const setCookie = login.response.headers.get('set-cookie') || '';
  check('session cookie protections', /HttpOnly/.test(setCookie) && /Secure/.test(setCookie) && /SameSite=Strict/.test(setCookie));
  cookie = setCookie.split(';')[0];
  check('cookie verified identity', (await request('/api/auth/me')).value?.user?.id === login.value.user.id);
  const list = await request('/api/projects');
  check('existing demos retained', list.response.status === 200 && list.value.some(p => p.title.includes('【演示】校园温度提醒器')));
  const created = await request('/api/projects', { title: '【验收】F1 原产品云端保存', language: 'python', requestId: randomUUID() });
  check('create owned synthetic project', created.response.ok && created.value.id > 0);
  projectId = created.value.id;
  const payload = { code: '# F1 browser acceptance project\nprint("F1 云端保存验收")\n', blockState: null, expectedVersion: 0, requestId: randomUUID() };
  const save = await request(`/api/projects/${projectId}/versions`, payload);
  check('version persisted', save.response.ok && save.value.versionNo === 1 && save.value.changed);
  check('idempotent same request receipt', (await request(`/api/projects/${projectId}/versions`, payload)).value?.versionNo === 1);
  const detail = await request(`/api/projects/${projectId}`);
  check('readback matches original', detail.value?.latest?.code === payload.code && detail.value.latest_version === 1);
  const conflict = await request(`/api/projects/${projectId}/versions`, { ...payload, code: '# stale must not overwrite', requestId: randomUUID() });
  check('stale version rejected', conflict.response.status === 409);
  check('unmigrated feature is not fake success', (await request('/api/pair-sessions')).response.status === 404);
} finally {
  if (cookie) {
    const logout = await request('/api/auth/logout', {});
    check('remote logout confirmed', logout.response.ok && logout.value.remoteRevoked === true);
    check('revoked session denied', (await request('/api/projects')).response.status === 401);
  }
  const result = { origin, contentSha256: build.contentSha256, timestamp: new Date().toISOString(), projectId, checks,
    scope: 'HTTP/API smoke only; browser and full-product gates separate' };
  await writeFile(new URL('.runtime/full-product-f1-20261014/live-smoke.json', root), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ origin, projectId, passed: checks.filter(c => c.passed).length, total: checks.length }));
}
