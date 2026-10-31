import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../lib/api.mts';

const origin = 'https://pilot.example';
const token = 'valid-synthetic-token';
const user = { id: 'a', name: '验收学生', role: 'student' };
function setup(responses = []) {
  const calls = [];
  const handler = createHandler({ url: 'https://project.supabase.co', key: 'sb_publishable_test' }, {
    fetch: async (url, init) => {
      calls.push({ url, init });
      const item = responses.shift();
      if (item instanceof Error) throw item;
      assert.ok(item, 'unexpected upstream request');
      if (item instanceof Response) return item;
      return Response.json(item.body, { status: item.status ?? 200 });
    },
  });
  return { handler, calls };
}
function req(path, method = 'GET', body, headers = {}) {
  return new Request(origin + path, { method, headers: {
    origin, cookie: '__Host-jiedui_access=' + token,
    ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers,
  }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

test('unknown API fails honestly, never SPA HTML', async () => {
  const { handler, calls } = setup();
  const r = await handler(req('/api/research'));
  assert.equal(r.status, 404); assert.equal(calls.length, 0);
  assert.equal((await r.json()).error.code, 'NOT_AVAILABLE');
});
test('missing auth is 401 and never calls database', async () => {
  const { handler, calls } = setup();
  const r = await handler(req('/api/projects', 'GET', undefined, { cookie: '' }));
  assert.equal(r.status, 401); assert.equal(calls.length, 0);
});
for (const badOrigin of ['null', 'https://sibling.pilot.example', '']) {
  test('write rejects nonmatching Origin ' + badOrigin, async () => {
    const { handler, calls } = setup();
    const r = await handler(req('/api/auth/login', 'POST', { email: 'a@example.invalid', password: 'x' }, { origin: badOrigin }));
    assert.equal(r.status, 403); assert.equal(calls.length, 0);
  });
}
test('login verifies membership and sets secure cookie without returning tokens', async () => {
  const { handler, calls } = setup([
    { body: { access_token: token, refresh_token: 'must-not-leak', expires_in: 3600 } },
    { body: { id: 'a' } }, { body: user },
  ]);
  const r = await handler(req('/api/auth/login', 'POST', { email: 'a@example.invalid', password: 'a password' }));
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { user });
  const cookie = r.headers.get('set-cookie');
  for (const value of ['__Host-jiedui_access=', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=1800']) assert.ok(cookie.includes(value));
  assert.equal(calls.length, 3); assert.equal(calls[2].url, 'https://project.supabase.co/rest/v1/rpc/pilot_me');
});
test('uninvited account fails closed without authenticated cookie', async () => {
  const { handler } = setup([
    { body: { access_token: token, expires_in: 300 } }, { body: { id: 'a' } },
    { status: 403, body: { code: 'PT403', message: 'not member' } },
  ]);
  const r = await handler(req('/api/auth/login', 'POST', { email: 'a@example.invalid', password: 'a password' }));
  assert.equal(r.status, 403); assert.ok(!r.headers.get('set-cookie')?.includes(token));
});
test('expired token clears cookie and does not call data RPC', async () => {
  const { handler, calls } = setup([{ status: 401, body: { message: 'expired' } }]);
  const r = await handler(req('/api/projects'));
  assert.equal(r.status, 401); assert.ok(r.headers.get('set-cookie').includes('Max-Age=0'));
  assert.equal(calls.length, 1);
});
test('Auth user rejection 403 is expired identity, not an invitation failure', async () => {
  const { handler, calls } = setup([{ status: 403, body: { error_code: 'session_not_found' } }]);
  const r = await handler(req('/api/projects'));
  assert.equal(r.status, 401);
  assert.equal((await r.json()).error.code, 'SESSION_EXPIRED');
  assert.ok(r.headers.get('set-cookie').includes('Max-Age=0'));
  assert.equal(calls.length, 1);
});
test('verified identity with revoked membership remains 403', async () => {
  const { handler } = setup([{ body: { id: 'a' } }, { status: 403, body: { code: 'PT403' } }]);
  const r = await handler(req('/api/projects'));
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error.code, 'NOT_INVITED');
});
test('network failure is 503, never mock login', async () => {
  const { handler } = setup([new TypeError('network offline')]);
  const r = await handler(req('/api/auth/login', 'POST', { email: 'a@example.invalid', password: 'a password' }));
  assert.equal(r.status, 503); assert.ok(!r.headers.get('set-cookie'));
});
test('list errors are not converted to an empty list', async () => {
  const { handler } = setup([{ body: { id: 'a' } }, { status: 500, body: { message: 'sensitive internal database message' } }]);
  const r = await handler(req('/api/projects'));
  assert.equal(r.status, 503); assert.ok(!(await r.text()).includes('sensitive'));
});
test('conflict is 409, and requestId/expectedVersion reach transaction boundary', async () => {
  const payload = { code: 'print(1)', blockState: null, expectedVersion: 2, requestId: '14ade5ed-a9ce-44e2-aa3f-20a350f581db' };
  const { handler, calls } = setup([{ body: { id: 'a' } }, { status: 409, body: { code: 'PT409' } }]);
  const r = await handler(req('/api/projects/5/versions', 'POST', payload));
  assert.equal(r.status, 409);
  assert.deepEqual(JSON.parse(calls[1].init.body), { operation: 'save', payload: { ...payload, id: 5 } });
});
test('logout revokes current session, then clears local cookie', async () => {
  const { handler, calls } = setup([{ body: {} }]);
  const r = await handler(req('/api/auth/logout', 'POST', {}));
  assert.equal(r.status, 200); assert.ok(r.headers.get('set-cookie').includes('Max-Age=0'));
  assert.equal(calls[0].url, 'https://project.supabase.co/auth/v1/logout?scope=local');
});
test('logout remote failure reports unconfirmed revocation, while clearing local cookie', async () => {
  const { handler } = setup([new TypeError('offline')]);
  const r = await handler(req('/api/auth/logout', 'POST', {}));
  assert.equal(r.status, 503); assert.ok(r.headers.get('set-cookie').includes('Max-Age=0'));
  assert.equal((await r.json()).error.code, 'LOGOUT_UNCONFIRMED');
});
test('logout accepts a successful empty upstream body', async () => {
  const { handler } = setup([new Response(null, { status: 200 })]);
  const r = await handler(req('/api/auth/logout', 'POST', {}));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).remoteRevoked, true);
});
test('logout with no session does not claim a remote revocation', async () => {
  const { handler, calls } = setup();
  const r = await handler(req('/api/auth/logout', 'POST', {}, { cookie: '' }));
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true, remoteRevoked: null, alreadySignedOut: true });
  assert.equal(calls.length, 0);
});
test('oversized body rejected before upstream calls', async () => {
  const { handler, calls } = setup();
  const r = await handler(req('/api/auth/login', 'POST', { email: 'a@example.invalid', password: 'x'.repeat(100000) }));
  assert.equal(r.status, 413); assert.equal(calls.length, 0);
});
test('application roles are never accepted from login input', async () => {
  const { handler, calls } = setup();
  const r = await handler(req('/api/auth/login', 'POST', { email: 'a@example.invalid', password: 'x', role: 'teacher' }));
  assert.equal(r.status, 400); assert.equal(calls.length, 0);
});
test('responses are not cached or permissively CORS-enabled', async () => {
  const { handler } = setup();
  const r = await handler(req('/api/projects', 'GET', undefined, { cookie: '' }));
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});
