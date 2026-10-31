import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';

// Explicitly authorized N1 targets only. Never persist passwords, JWTs or cookies.
const SITE = 'https://jiedui-pilot-sg.netlify.app';
const DATABASE = 'https://slyzlplnuozzccdznuqp.supabase.co';
const PUBLIC_KEY = 'sb_publishable_RlZg7mXYRJC34P48gqs4Eg_EJsNgEmd';
const COOKIE = '__Host-jiedui_access';
const privateFile = new URL('../../../.runtime/netlify-n1-20261013/acceptance-accounts.private.json', import.meta.url);
const resultFile = new URL('../../../.runtime/netlify-n1-20261013/live-acceptance.json', import.meta.url);
const sessionFollowup = process.argv.includes('--session-followup');
const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
const report = {
  runId, site: SITE, databaseProject: 'slyzlplnuozzccdznuqp', startedAt: new Date().toISOString(),
  expectedDeployment: { id: '6acf3ee486e4b664ffcf926d', provenance: 'Parent-confirmed published deployment; this script targets only the fixed production origin.' },
  scriptSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
  evidence: 'Real HTTPS requests to the specified deployed application and its public database API; no mocks.',
  boundaries: 'Synthetic acceptance accounts and newly created prefixed projects only. No admin credentials, console, other project, or business-code changes.',
  outsideThisScript: ['Uninvited B and disabled signup were tested separately by the parent; this script does not count those as its own passes.', 'Browser cookie enforcement and visual behavior require the separate browser acceptance.'],
  throttle: { maximumRequestsPer60Seconds: 42, concurrentGroupSize: 2 },
  mode: sessionFollowup ? 'session-followup' : 'full', projects: [], checks: [], requests: [], cleanup: [],
};
try {
  const priorBytes = await readFile(resultFile);
  const prior = JSON.parse(priorBytes.toString('utf8'));
  needPriorTarget(prior);
  report.previousResultSha256 = createHash('sha256').update(priorBytes).digest('hex');
  report.priorRuns = [prior];
  report.revisionReason = 'After the targeted Auth-user error normalization deployment, all invalid and revoked cookies must return 401 SESSION_EXPIRED and clear the access cookie. Earlier FAIL and follow-up evidence is preserved unchanged in priorRuns.';
} catch (error) {
  if (error?.code !== 'ENOENT' || sessionFollowup) throw error;
}
function needPriorTarget(prior) {
  if (prior.site !== SITE || prior.databaseProject !== 'slyzlplnuozzccdznuqp') throw new Error('Prior report target mismatch');
}
const sessions = [];
let metadataRestore = null;
let dispatchQueue = Promise.resolve();
const dispatchTimes = [];
class CheckFailure extends Error {}
const need = (condition, safeMessage) => { if (!condition) throw new CheckFailure(safeMessage); };
const safeError = error => error instanceof CheckFailure ? error.message : `Unexpected ${error?.name || 'Error'} (details withheld)`;
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function reserve(count = 1) {
  const turn = dispatchQueue.then(async () => {
    for (;;) {
      const now = Date.now();
      while (dispatchTimes.length && dispatchTimes[0] <= now - 60000) dispatchTimes.shift();
      if (dispatchTimes.length + count <= 42) { for (let i = 0; i < count; i++) dispatchTimes.push(Date.now()); return; }
      await pause(Math.min(60000, dispatchTimes[0] + 60100 - now));
    }
  });
  dispatchQueue = turn.catch(() => {});
  await turn;
}

async function exchange(base, path, { method = 'GET', session, json, raw, headers = {}, reserved = false } = {}) {
  need([SITE, DATABASE].includes(base), 'Target outside the authorized hosts');
  const url = new URL(path, base);
  need(url.origin === base && !url.username && !url.password, 'Request escaped the authorized origin');
  const actualHeaders = new Headers(headers);
  if (base === SITE) {
    if (session) actualHeaders.set('Cookie', session.cookie);
    if (method !== 'GET' && !actualHeaders.has('Origin')) actualHeaders.set('Origin', SITE);
  } else {
    actualHeaders.set('apikey', PUBLIC_KEY);
    if (session) actualHeaders.set('Authorization', 'Bearer ' + session.token);
  }
  let body = raw;
  if (json !== undefined) { body = JSON.stringify(json); actualHeaders.set('Content-Type', 'application/json'); }
  if (!reserved) await reserve();
  const started = Date.now();
  let response;
  try {
    response = await fetch(url, { method, headers: actualHeaders, ...(body === undefined ? {} : { body }), redirect: 'error', signal: AbortSignal.timeout(35000) });
  } catch (error) {
    report.requests.push({ host: url.hostname, path: url.pathname, method, startedAt: new Date(started).toISOString(), networkFailure: error?.name || 'Error' });
    throw new CheckFailure('Network request failed; no retry was performed');
  }
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  const trace = { host: url.hostname, path: url.pathname, method, status: response.status, startedAt: new Date(started).toISOString(), elapsedMs: Date.now() - started };
  if (base === SITE) {
    trace.setCookiePresent = response.headers.getSetCookie().length > 0;
    trace.clearsAccessCookie = response.headers.getSetCookie().some(value => value.startsWith(COOKIE + '=;') && /Max-Age=0/i.test(value));
  }
  const code = data?.error?.code ?? data?.code;
  if (typeof code === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(code)) trace.errorCode = code;
  report.requests.push(trace);
  return { status: response.status, data, headers: response.headers, trace };
}

const api = (path, init) => exchange(SITE, path, init);
const rpc = (session, operation, payload) => exchange(DATABASE, '/rest/v1/rpc/pilot_projects', { method: 'POST', session, json: { operation, payload } });
const rpcMe = session => exchange(DATABASE, '/rest/v1/rpc/pilot_me', { method: 'POST', session, json: {} });
function status(result, expected) { need(result.status === expected, `Expected HTTP ${expected}; received ${result.status}`); }
function errorCode(result, expected) { need(result.data?.error?.code === expected, `Expected public error ${expected}`); }
function equalPublic(actual, expected, message) { need(JSON.stringify(actual) === JSON.stringify(expected), message); }
function deniedWithoutData(result) {
  need(result.status === 401, `Expected authentication denial HTTP 401; received ${result.status}`);
  need(Object.keys(result.data || {}).join(',') === 'error', 'Denied request exposed a non-error body');
  need(result.data?.error?.code === 'SESSION_EXPIRED', 'Invalid cookie must return SESSION_EXPIRED');
  need(result.trace.setCookiePresent && result.trace.clearsAccessCookie, 'Invalid cookie must be cleared');
  return { status: result.status, errorCode: result.data.error.code, setCookiePresent: result.trace.setCookiePresent, clearsAccessCookie: result.trace.clearsAccessCookie, errorBodyOnly: true };
}

async function check(name, execute) {
  const startedAt = new Date().toISOString();
  try {
    const detail = await execute();
    report.checks.push({ name, passed: true, startedAt, ...(detail || {}) });
    console.log(`PASS ${name}`);
    return true;
  } catch (error) {
    report.checks.push({ name, passed: false, startedAt, failure: safeError(error) });
    console.log(`FAIL ${name}: ${safeError(error)}`);
    return false;
  }
}

function validateCookie(result) {
  const cookies = result.headers.getSetCookie();
  need(cookies.length === 1, 'Login must issue exactly one cookie');
  const parts = cookies[0].split(';').map(value => value.trim());
  const expectedPrefix = COOKIE + '=';
  need(parts[0].startsWith(expectedPrefix), 'Login cookie must use the __Host name');
  const token = parts[0].slice(expectedPrefix.length);
  need(/^[A-Za-z0-9._-]{1,8192}$/.test(token), 'Login did not return a valid cookie token');
  const attributes = parts.slice(1).map(value => value.toLowerCase());
  for (const required of ['path=/', 'httponly', 'secure', 'samesite=strict']) need(attributes.includes(required), 'Missing required secure cookie attribute');
  need(!attributes.some(value => value.startsWith('domain=')), 'Host cookie must not have a Domain attribute');
  const maxAge = Number(attributes.find(value => value.startsWith('max-age='))?.slice(8));
  need(Number.isInteger(maxAge) && maxAge > 0 && maxAge <= 1800, 'Cookie lifetime exceeds the 30 minute limit');
  need(Object.keys(result.data || {}).join(',') === 'user', 'Login JSON must contain only the public user envelope');
  need(result.headers.get('cache-control') === 'no-store', 'Login response must not be cached');
  return { cookie: parts[0], token, maxAge };
}

async function login(label, account) {
  const result = await api('/api/auth/login', { method: 'POST', json: { email: account.email, password: account.password } });
  status(result, 200);
  // Register the issued session before later assertions, so cleanup also runs on assertion failures.
  const cookie = result.headers.getSetCookie().find(value => value.startsWith(COOKIE + '='))?.split(';')[0];
  need(!!cookie, 'Successful login is missing a session cookie');
  const session = { label, cookie, token: cookie.slice(COOKIE.length + 1), user: result.data?.user, revoked: false };
  sessions.push(session);
  const validated = validateCookie(result);
  need(['student', 'teacher'].includes(session.user?.role), 'Login role must come from a supported membership');
  session.cookieMaxAge = validated.maxAge;
  return session;
}

async function snapshot(session, id) {
  const project = await api(`/api/projects/${id}`, { session }); status(project, 200);
  const history = await api(`/api/projects/${id}/versions`, { session }); status(history, 200);
  need(Array.isArray(history.data), 'Version history must be an array');
  return { version: project.data.latest_version, history: history.data, project: project.data };
}
const save = (session, id, body, reserved = false) => api(`/api/projects/${id}/versions`, { method: 'POST', session, json: body, reserved });
const saveBody = (version, code, requestId = randomUUID()) => ({ code, blockState: null, expectedVersion: version, requestId });

async function concurrency(session, id, kind) {
  const before = await snapshot(session, id);
  const first = saveBody(before.version, `print('${kind} first')`);
  const second = kind === 'same-key-same-body' ? { ...first }
    : kind === 'same-key-different-body' ? { ...first, code: `print('${kind} second')` }
    : saveBody(before.version, `print('${kind} second')`);
  // Reserve both slots together so a rate-window boundary never serializes the pair.
  await reserve(2);
  const answers = await Promise.all([save(session, id, first, true), save(session, id, second, true)]);
  const actual = answers.map(answer => answer.status).sort();
  equalPublic(actual, kind === 'same-key-same-body' ? [200, 200] : [200, 409], 'Concurrent response statuses violate the atomic save contract');
  if (kind === 'same-key-same-body') equalPublic(answers[0].data, answers[1].data, 'Identical idempotent calls returned different receipts');
  const after = await snapshot(session, id);
  need(after.version === before.version + 1, 'Concurrent group did not increment latest version exactly once');
  need(after.history.length === before.history.length + 1, 'Concurrent group did not create exactly one history row');
  const winner = answers.findIndex(answer => answer.status === 200);
  need(after.project.latest?.code === [first, second][winner].code, 'Persisted code does not match the successful concurrent save');
  return { statuses: answers.map(answer => answer.status), versionBefore: before.version, versionAfter: after.version, historyAdded: 1,
    dispatchSkewMs: Math.abs(Date.parse(answers[0].trace.startedAt) - Date.parse(answers[1].trace.startedAt)) };
}

try {
  const accounts = JSON.parse(await readFile(privateFile, 'utf8'));
  const declaredSite = accounts.site?.startsWith('https://') ? new URL(accounts.site).origin : 'https://' + accounts.site;
  need(declaredSite === SITE, 'Credentials file belongs to another site');
  for (const key of ['a', 'b']) need(typeof accounts[key]?.email === 'string' && typeof accounts[key]?.password === 'string', 'Acceptance credentials are incomplete');
  if (sessionFollowup) {
    let primary, other, projectId;
    await check('Follow-up creates two independent A sessions', async () => {
      primary = await login('A4-followup', accounts.a); other = await login('A5-followup', accounts.a);
      need(primary.token !== other.token, 'Follow-up sessions must be independent');
      const created = await api('/api/projects', { method: 'POST', session: primary, json: { title: `N1 HTTP 验收 ${runId} session-boundary`, language: 'python', requestId: randomUUID() } });
      status(created, 201); projectId = created.data.id; need(Number.isInteger(projectId), 'Synthetic follow-up project ID is missing');
      report.projects.push({ label: 'session-boundary', id: projectId, title: created.data.title });
    });
    need(primary && other && projectId, 'Follow-up prerequisites failed');
    for (const [label, cookie] of [['duplicate', `${primary.cookie}; ${primary.cookie}`], ['tampered', COOKIE + '=tampered.invalid.token']]) {
      await check(`${label} cookie cannot read identity or save synthetic source`, async () => {
        const identity = await api('/api/auth/me', { headers: { Cookie: cookie } });
        const read = deniedWithoutData(identity);
        const written = await api(`/api/projects/${projectId}/versions`, { method: 'POST', headers: { Cookie: cookie }, json: saveBody(0, `${label} must not write`) });
        const write = deniedWithoutData(written);
        const current = await snapshot(other, projectId);
        need(current.version === 0 && current.history.length === 0, 'Rejected cookie changed synthetic version state');
        return { read, write, latestVersionAfter: current.version, historyRowsAfter: current.history.length };
      });
    }
    await check('Follow-up local logout confirms revocation and clears only its host cookie', async () => {
      const r = await api('/api/auth/logout', { method: 'POST', session: primary, json: {} }); status(r, 200);
      need(r.data?.remoteRevoked === true && r.trace.clearsAccessCookie, 'Local logout did not confirm revocation and cookie clearing');
      primary.revoked = true;
      return { status: r.status, remoteRevoked: true, clearsAccessCookie: true };
    });
    await check('Old cookie cannot read identity or save after local logout', async () => {
      const identity = await api('/api/auth/me', { session: primary }); const read = deniedWithoutData(identity);
      const written = await save(primary, projectId, saveBody(0, 'old cookie must not write')); const write = deniedWithoutData(written);
      const current = await snapshot(other, projectId);
      need(current.version === 0 && current.history.length === 0, 'Old cookie modified synthetic version state');
      return { read, write, latestVersionAfter: current.version, historyRowsAfter: current.history.length };
    });
    await check('Old JWT is denied by direct identity and save RPCs', async () => {
      const identity = await rpcMe(primary); status(identity, 401);
      const write = await rpc(primary, 'save', { id: projectId, ...saveBody(0, 'old JWT must not write') }); status(write, 401);
      const current = await snapshot(other, projectId);
      need(current.version === 0 && current.history.length === 0, 'Revoked JWT modified synthetic version state');
      return { identityStatus: identity.status, writeStatus: write.status, latestVersionAfter: current.version, historyRowsAfter: current.history.length };
    });
    await check('scope=local preserves the other A session through Netlify and direct RPC', async () => {
      const site = await api('/api/auth/me', { session: other }); status(site, 200);
      const direct = await rpcMe(other); status(direct, 200);
      need(site.data?.user?.id === other.user.id && direct.data?.id === other.user.id, 'The surviving session changed identity');
      return { netlifyStatus: site.status, directRpcStatus: direct.status };
    });
  } else {
  let a1, a2, b1, aProject, bProject, firstSave, firstReceipt;
  await check('A real login and restricted cookie', async () => { a1 = await login('A1', accounts.a); return { maxAgeSeconds: a1.cookieMaxAge, role: a1.user.role }; });
  await check('A second independent real session', async () => { a2 = await login('A2', accounts.a); need(a1 && a2.token !== a1.token, 'The second login must issue an independent session'); });
  await check('B real login and restricted cookie', async () => { b1 = await login('B1', accounts.b); return { maxAgeSeconds: b1.cookieMaxAge, role: b1.user.role }; });
  need(a1 && a2 && b1, 'Successful independent A and B sessions are required');
  need(a1.user.id !== b1.user.id, 'A and B must be different identities');

  await check('Bearer header alone cannot authenticate the cookie API', async () => {
    const r = await api('/api/auth/me', { headers: { Authorization: 'Bearer ' + a1.token } }); status(r, 401); errorCode(r, 'SESSION_EXPIRED');
  });
  await check('Duplicate and tampered cookies are rejected', async () => {
    const observations = [];
    for (const cookie of [`${a1.cookie}; ${a1.cookie}`, COOKIE + '=tampered.invalid.token']) {
      const r = await api('/api/auth/me', { headers: { Cookie: cookie } }); observations.push(deniedWithoutData(r));
    }
    return { observations };
  });
  await check('A and B create only prefixed synthetic projects', async () => {
    for (const [session, suffix] of [[a1, 'A'], [b1, 'B']]) {
      const r = await api('/api/projects', { method: 'POST', session, json: { title: `N1 HTTP 验收 ${runId} ${suffix}`, language: 'python', requestId: randomUUID() } });
      status(r, 201); need(Number.isInteger(r.data?.id), 'Create response requires a project ID');
      need(r.data.latest_version === 0, 'New project must begin with version zero');
      report.projects.push({ label: suffix, id: r.data.id, title: r.data.title });
      if (suffix === 'A') aProject = r.data.id; else bProject = r.data.id;
    }
  });
  need(aProject && bProject, 'Synthetic project creation is required for dependent checks');
  await check('Initial real save and re-read restore identical source', async () => {
    firstSave = saveBody(0, `print('N1 HTTP 验收 ${runId}')`);
    const r = await save(a1, aProject, firstSave); status(r, 200); firstReceipt = r.data;
    const current = await snapshot(a1, aProject); need(current.version === 1 && current.project.latest?.code === firstSave.code, 'Saved version was not restored exactly');
  });
  await check('Invalid cookies cannot save source or alter history', async () => {
    const before = await snapshot(a2, aProject);
    const observations = [];
    for (const [label, cookie] of [['duplicate', `${a1.cookie}; ${a1.cookie}`], ['tampered', COOKIE + '=tampered.invalid.token']]) {
      const r = await api(`/api/projects/${aProject}/versions`, { method: 'POST', headers: { Cookie: cookie }, json: saveBody(before.version, `${label} cookie must not save`) });
      observations.push({ label, ...deniedWithoutData(r) });
    }
    const after = await snapshot(a2, aProject);
    need(after.version === before.version && after.history.length === before.history.length, 'Invalid cookie changed source version or history');
    return { observations, versionBefore: before.version, versionAfter: after.version, historyAdded: 0 };
  });
  await check('Bidirectional account isolation through Netlify get history and save', async () => {
    const statuses = [];
    for (const [session, id] of [[b1, aProject], [a1, bProject]]) {
      for (const path of [`/api/projects/${id}`, `/api/projects/${id}/versions`]) { const r = await api(path, { session }); statuses.push(r.status); status(r, 404); }
      const r = await save(session, id, saveBody(0, 'print("cross-account must not save")')); statuses.push(r.status); status(r, 404);
    }
    return { statuses };
  });
  await check('Bidirectional account isolation through direct public RPC', async () => {
    const statuses = [];
    for (const [session, id] of [[b1, aProject], [a1, bProject]]) {
      for (const operation of ['get', 'versions', 'save']) {
        const r = await rpc(session, operation, operation === 'save' ? { id, ...saveBody(0, 'print("direct cross-account must not save")') } : { id });
        statuses.push(r.status); status(r, 404);
      }
    }
    return { statuses };
  });
  await check('Each account list excludes the other synthetic project', async () => {
    for (const [session, own, other] of [[a1, aProject, bProject], [b1, bProject, aProject]]) {
      const r = await api('/api/projects', { session }); status(r, 200);
      need(Array.isArray(r.data) && r.data.some(p => p.id === own) && !r.data.some(p => p.id === other), 'Account list does not preserve ownership isolation');
    }
  });
  await check('Private schema cannot be read through the public REST endpoint', async () => {
    for (const session of [a1, b1]) {
      const r = await exchange(DATABASE, '/rest/v1/members?select=role', { session, headers: { 'Accept-Profile': 'pilot_private' } });
      status(r, 406); need(r.data?.code === 'PGRST106', 'Private schema rejection must be explicit');
    }
  });
  await check('Direct RPC cannot accept caller supplied actor or role', async () => {
    const r = await rpc(a1, 'list', { actor_id: b1.user.id, role: 'teacher' }); status(r, 400);
  });
  await check('Editable Auth metadata cannot change application membership role', async () => {
    const current = await exchange(DATABASE, '/auth/v1/user', { session: a2 }); status(current, 200);
    const priorRole = current.data?.user_metadata?.role;
    metadataRestore = { session: a2, role: priorRole === undefined ? null : priorRole };
    const requestedRole = a2.user.role === 'student' ? 'teacher' : 'student';
    const updated = await exchange(DATABASE, '/auth/v1/user', { method: 'PUT', session: a2, json: { data: { role: requestedRole } } }); status(updated, 200);
    need(updated.data?.user_metadata?.role === requestedRole, 'Metadata attack setup did not update the editable role field');
    const fresh = await login('A3-metadata', accounts.a);
    const claims = JSON.parse(Buffer.from(fresh.token.split('.')[1], 'base64url').toString('utf8'));
    need(claims.user_metadata?.role === requestedRole, 'Fresh JWT did not include the modified metadata fixture');
    const netlify = await api('/api/auth/me', { session: fresh }); status(netlify, 200);
    const direct = await rpcMe(fresh); status(direct, 200);
    need(netlify.data?.user?.role === a2.user.role && direct.data?.role === a2.user.role, 'Editable metadata changed the membership role');
    return { membershipRoleBefore: a2.user.role, attemptedMetadataRole: requestedRole, membershipRoleAfter: direct.data.role };
  });
  for (const kind of ['different-keys-same-base', 'same-key-same-body', 'same-key-different-body']) {
    await check(`Real Promise.all concurrency: ${kind}`, () => concurrency(a1, aProject, kind));
  }
  await check('Old idempotency receipt stays stable after newer saves', async () => {
    const before = await snapshot(a1, aProject); need(firstReceipt && before.version > 1, 'Old receipt test requires newer versions');
    const r = await save(a1, aProject, firstSave); status(r, 200); equalPublic(r.data, firstReceipt, 'Old idempotent request returned a changed receipt');
    const after = await snapshot(a1, aProject); need(after.version === before.version && after.history.length === before.history.length, 'Old replay added a version');
    return { oldReceiptVersion: r.data.versionNo, latestVersion: after.version, historyAdded: 0 };
  });
  await check('Foreign null and absent origins reject writes', async () => {
    for (const origin of ['https://foreign.invalid', 'null', '']) {
      const r = await api('/api/projects', { method: 'POST', session: a1, headers: { Origin: origin }, json: {} }); status(r, 403); errorCode(r, 'ORIGIN_DENIED');
    }
  });
  await check('Invalid JSON content type and extra identity fields return public errors', async () => {
    const badJson = await api('/api/projects', { method: 'POST', session: a1, headers: { 'Content-Type': 'application/json' }, raw: '{' }); status(badJson, 400);
    const badType = await api('/api/projects', { method: 'POST', session: a1, headers: { 'Content-Type': 'text/plain' }, raw: '{}' }); status(badType, 400);
    const role = await api('/api/auth/login', { method: 'POST', json: { email: accounts.a.email, password: accounts.a.password, role: 'teacher' } }); status(role, 400); errorCode(role, 'INVALID_INPUT');
  });
  await check('UTF-8 combined source boundary accepts 65536 and rejects 65537 bytes', async () => {
    const before = await snapshot(a1, aProject);
    const code = '汉'.repeat(21845) + 'a'; need(Buffer.byteLength(code) === 65536, 'Invalid test fixture byte count');
    const accepted = await save(a1, aProject, saveBody(before.version, code)); status(accepted, 200);
    const tooMuch = await save(a1, aProject, saveBody(before.version + 1, code + 'b')); status(tooMuch, 413); errorCode(tooMuch, 'TOO_LARGE');
    const combined = await save(a1, aProject, { ...saveBody(before.version + 1, 'a'.repeat(32768)), blockState: 'b'.repeat(32769) }); status(combined, 413);
    const after = await snapshot(a1, aProject); need(after.version === before.version + 1 && after.history.length === before.history.length + 1, 'Rejected oversized source changed the version count');
    need(after.project.latest?.code === code, 'Boundary source did not restore byte-for-byte');
    return { acceptedSourceBytes: 65536, rejectedSourceBytes: 65537, versionAdded: 1 };
  });
  await check('HTTP body boundary accepts 80000 and rejects 80001 bytes', async () => {
    const before = await snapshot(a1, aProject);
    const fixture = JSON.stringify(saveBody(before.version, 'print("body boundary")'));
    const raw = fixture + ' '.repeat(80000 - Buffer.byteLength(fixture));
    const accepted = await api(`/api/projects/${aProject}/versions`, { method: 'POST', session: a1, headers: { 'Content-Type': 'application/json' }, raw }); status(accepted, 200);
    const rejected = await api(`/api/projects/${aProject}/versions`, { method: 'POST', session: a1, headers: { 'Content-Type': 'application/json' }, raw: raw + ' ' }); status(rejected, 413); errorCode(rejected, 'TOO_LARGE');
    const after = await snapshot(a1, aProject); need(after.version === before.version + 1, 'HTTP body rejection changed the saved version');
    return { acceptedBodyBytes: 80000, rejectedBodyBytes: 80001, versionAdded: 1 };
  });
  await check('Local logout revokes old cookie and direct JWT while preserving A2', async () => {
    const before = await snapshot(a2, aProject);
    const result = await api('/api/auth/logout', { method: 'POST', session: a1, json: {} }); status(result, 200);
    need(result.data?.remoteRevoked === true, 'Logout did not confirm remote revocation');
    need(result.headers.getSetCookie().some(value => value.startsWith(COOKIE + '=;') && /Max-Age=0/i.test(value)), 'Logout did not clear its host cookie');
    a1.revoked = true;
    const cookie = await api('/api/auth/me', { session: a1 }); const oldCookie = deniedWithoutData(cookie);
    const invalidSave = await save(a1, aProject, saveBody(before.version, 'revoked cookie must not write'));
    const oldCookieWrite = deniedWithoutData(invalidSave);
    const jwt = await rpcMe(a1); status(jwt, 401);
    const directSave = await rpc(a1, 'save', { id: aProject, ...saveBody(0, 'revoked session must not write') }); status(directSave, 401);
    const otherCookie = await api('/api/auth/me', { session: a2 }); status(otherCookie, 200);
    const otherJwt = await rpcMe(a2); status(otherJwt, 200);
    const after = await snapshot(a2, aProject);
    need(after.version === before.version && after.history.length === before.history.length, 'Revoked session changed source version or history');
    return { oldCookie, oldCookieWrite, oldJwtStatus: jwt.status, revokedWriteStatus: directSave.status, otherSessionStatus: otherCookie.status, otherRpcStatus: otherJwt.status, versionBefore: before.version, versionAfter: after.version, historyAdded: 0 };
  });
  }
} catch (error) {
  report.fatal = safeError(error);
  console.log('FATAL ' + report.fatal);
} finally {
  if (metadataRestore) {
    try {
      const r = await exchange(DATABASE, '/auth/v1/user', { method: 'PUT', session: metadataRestore.session, json: { data: { role: metadataRestore.role } } }); status(r, 200);
      report.cleanup.push({ action: 'Restore synthetic A metadata role', passed: true });
    } catch (error) { report.cleanup.push({ action: 'Restore synthetic A metadata role', passed: false, failure: safeError(error) }); }
  }
  for (const session of sessions) {
    if (session.revoked) { report.cleanup.push({ session: session.label, action: 'scope=local logout previously acknowledged', passed: true }); continue; }
    try {
      const r = await api('/api/auth/logout', { method: 'POST', session, json: {} }); status(r, 200); need(r.data?.remoteRevoked === true, 'Cleanup logout did not confirm revocation');
      const verify = await rpcMe(session); status(verify, 401);
      report.cleanup.push({ session: session.label, action: 'scope=local logout and direct RPC rejection', passed: true });
    } catch (error) { report.cleanup.push({ session: session.label, action: 'scope=local session cleanup', passed: false, failure: safeError(error) }); }
  }
  report.retainedSyntheticData = 'Prefixed projects and version history retained as evidence; no delete endpoint or administrative credentials are used.';
  report.finishedAt = new Date().toISOString();
  report.passed = report.checks.filter(check => check.passed).length;
  report.failed = report.checks.filter(check => !check.passed).length;
  report.requestCount = report.requests.length;
  report.verdict = !report.fatal && report.failed === 0 && report.cleanup.every(item => item.passed) ? 'PASS' : 'FAIL';
  await writeFile(resultFile, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ verdict: report.verdict, passed: report.passed, failed: report.failed, requestCount: report.requestCount, cleanupPassed: report.cleanup.every(item => item.passed), result: '.runtime/netlify-n1-20261013/live-acceptance.json' }));
  process.exitCode = report.verdict === 'PASS' ? 0 : 1;
}
