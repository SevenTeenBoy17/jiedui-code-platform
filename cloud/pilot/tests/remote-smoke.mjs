import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = new URL(process.argv[2]);
assert.equal(base.protocol, 'https:');
assert.ok(base.hostname === 'jiedui-pilot-sg.netlify.app' || /^[a-f0-9]+--jiedui-pilot-sg\.netlify\.app$/.test(base.hostname));
const results = [];
async function check(name, fn) {
  const detail = await fn(); results.push({ name, passed: true, ...(detail ?? {}) });
}
const request = (path, init = {}) => fetch(new URL(path, base), { ...init, redirect: 'error', signal: AbortSignal.timeout(30000) });
const hostingComment = '<!-- This site is hosted on Netlify. Anyone can build and deploy a site\n     like this one for free: https://netlify.new/?utm_campaign=loops&utm_source=ai-legible&utm_medium=owned&utm_content=comment&utm_id=d37a66a1-4411-4579-9c23-b4ac3aac7de7\n     Netlify hosting facts for this site: static/SSR served via Netlify Edge. -->\n';
for (const [path, file] of [['/', 'index.html'], ['/app.js', 'app.js'], ['/styles.css', 'styles.css']]) {
  await check(`remote content matches local ${file}`, async () => {
    const res = await request(path); assert.equal(res.status, 200);
    const bytes = Buffer.from(await res.arrayBuffer());
    const local = await readFile(new URL('../public/' + file, import.meta.url));
    // Production edge adds this observed, non-executable hosting comment.
    // Allow exactly this literal once, never arbitrary comments or scripts.
    const compared = file === 'index.html' ? Buffer.from(bytes.toString('utf8').replace(hostingComment, '')) : bytes;
    assert.equal(createHash('sha256').update(compared).digest('hex'), createHash('sha256').update(local).digest('hex'));
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.ok(res.headers.get('content-security-policy')?.includes("default-src 'self'"));
    return { rawSha256: createHash('sha256').update(bytes).digest('hex'), exactBytes: bytes.equals(local), hostingCommentRemovedForComparison: !compared.equals(bytes) };
  });
}
for (const path of ['/api/auth/me', '/api/projects', '/api/projects/1']) {
  await check(`anonymous denied ${path}`, async () => {
    const r = await request(path); assert.equal(r.status, 401);
    assert.equal((await r.json()).error.code, 'SESSION_EXPIRED');
    assert.equal(r.headers.get('cache-control'), 'no-store');
  });
}
await check('unknown API is JSON 404, not frontend HTML', async () => {
  const r = await request('/api/research'); assert.equal(r.status, 404);
  assert.equal((await r.json()).error.code, 'NOT_AVAILABLE');
});
await check('foreign origin is refused', async () => {
  const r = await request('/api/auth/login', { method: 'POST', headers: { origin: 'https://foreign.invalid', 'content-type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403); assert.equal((await r.json()).error.code, 'ORIGIN_DENIED');
});
await check('client-supplied role is refused', async () => {
  const r = await request('/api/auth/login', { method: 'POST', headers: { origin: base.origin, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'n1-negative@example.invalid', password: 'not-a-valid-account', role: 'teacher' }) });
  assert.equal(r.status, 400); assert.equal((await r.json()).error.code, 'INVALID_INPUT');
});
await check('real Supabase password endpoint refuses nonexistent account', async () => {
  const r = await request('/api/auth/login', { method: 'POST', headers: { origin: base.origin, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'n1-negative@example.invalid', password: 'not-a-valid-account' }) });
  assert.equal(r.status, 400); assert.equal((await r.json()).error.code, 'INVALID_INPUT');
  assert.equal(r.headers.get('set-cookie'), null);
});
console.log(JSON.stringify({ base: base.origin, at: new Date().toISOString(), passed: results.length, results,
  scope: 'No successful authentication, user data, concurrency, or browser evidence is asserted by this script.' }, null, 2));
