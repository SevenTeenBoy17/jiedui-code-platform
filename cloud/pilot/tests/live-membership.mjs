import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

// Only the specifically authorized synthetic B account/project. Never log secrets.
const SITE = process.env.HANDOFF_TEST_SITE;
const DB = process.env.HANDOFF_TEST_DATABASE_URL;
const KEY = process.env.HANDOFF_TEST_DATABASE_PUBLIC_KEY;
const USER = process.env.HANDOFF_TEST_USER_ID;
const EMAIL = 'n1-acceptance-b@jiedui.invalid';
const PROJECT = 7;
const COOKIE = '__Host-jiedui_access';

// Handoff safety gate: only isolated, explicitly authorised synthetic projects.
if (process.env.HANDOFF_ALLOW_LIVE_TESTS !== '1' || !SITE || !DB || !KEY || !process.env.HANDOFF_TEST_USER_ID) {
  throw new Error('Live tests disabled. Configure an isolated test project and explicitly opt in; never use real student data.');
}

const accountFile = new URL('../../../.runtime/netlify-n1-20261013/acceptance-accounts.private.json', import.meta.url);
const reportFile = new URL('../../../.runtime/netlify-n1-20261013/membership-acceptance.json', import.meta.url);
const terminal = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
const report = {
  scope: 'Real Auth and HTTPS membership revocation on the sole authorized N1 project',
  site: SITE, supabaseProject: 'slyzlplnuozzccdznuqp', userId: USER, projectId: PROJECT,
  startedAt: new Date().toISOString(), checks: [], requests: [], stateChanges: [],
  limitations: [
    'No UI or browser operation; no other account/project modified.',
    'A forbidden password login can create a new Supabase Auth session before membership rejection. Its token is not returned to this caller; this test does not delete unrelated sessions. B remains inactive.',
    'This test revokes only its successful login session with scope=local.',
  ],
};
let cookie; let jwt; let activeCheck;
const need = (ok, message) => { if (!ok) throw new Error(message); };
async function exchange(base, path, { method = 'GET', data, auth = true } = {}) {
  const headers = new Headers();
  if (base === SITE) {
    if (auth && cookie) headers.set('Cookie', cookie);
    if (method !== 'GET') headers.set('Origin', SITE);
  } else {
    headers.set('apikey', KEY);
    if (auth && jwt) headers.set('Authorization', 'Bearer ' + jwt);
  }
  if (data !== undefined) headers.set('Content-Type', 'application/json');
  const began = Date.now();
  const response = await fetch(base + path, { method, headers, redirect: 'error',
    ...(data === undefined ? {} : { body: JSON.stringify(data) }), signal: AbortSignal.timeout(30000) });
  const result = await response.json().catch(() => null);
  const code = result?.error?.code || result?.code;
  report.requests.push({ host: new URL(base).hostname, path, method, status: response.status,
    elapsedMs: Date.now() - began, ...(typeof code === 'string' && /^[a-zA-Z0-9_]+$/.test(code) ? { errorCode: code } : {}),
    ...(base === SITE ? { setCookiePresent: response.headers.getSetCookie().length > 0,
      clearsAccessCookie: response.headers.getSetCookie().some(x => x.startsWith(COOKIE + '=;') && /Max-Age=0/.test(x)) } : {}) });
  return { response, result };
}
async function check(name, fn) {
  activeCheck = { name, beganAt: new Date().toISOString(), passed: false };
  report.checks.push(activeCheck);
  const details = await fn();
  Object.assign(activeCheck, { ...(details || {}), name, passed: true });
  console.log('PASS ' + name);
  activeCheck = null;
}
const save = () => ({ code: 'membership revocation must prevent this write', blockState: null,
  expectedVersion: 0, requestId: randomUUID() });
async function deniedBff(path, method = 'GET', data, auth = true) {
  const { response, result } = await exchange(SITE, path, { method, data, auth });
  need(response.status === 403, 'Member-denied BFF status must be 403');
  need(result?.error?.code === 'NOT_INVITED', 'Member-denied BFF code must stay NOT_INVITED');
  need(Object.keys(result || {}).join(',') === 'error', 'Denied response must not disclose business data');
  need(response.headers.getSetCookie().length === 0, 'Membership 403 must not clear or issue a cookie');
}
try {
  const accounts = JSON.parse(await readFile(accountFile, 'utf8'));
  need(accounts.site === SITE && accounts.b?.email === EMAIL && typeof accounts.b.password === 'string', 'Private account file target mismatch');
  await check('Real B login before revocation', async () => {
    const { response, result } = await exchange(SITE, '/api/auth/login', { method: 'POST', data: accounts.b, auth: false });
    // Capture session before further assertions so finally can revoke it.
    cookie = response.headers.getSetCookie().find(x => x.startsWith(COOKIE + '='))?.split(';')[0];
    if (cookie) jwt = cookie.slice(COOKIE.length + 1);
    need(response.status === 200 && cookie && result?.user?.id === USER, 'Expected authorized synthetic B login');
    need(Object.keys(result).join(',') === 'user', 'Login must not return tokens in JSON');
    return { status: 200, userId: USER };
  });
  await check('B project 7 baseline is version zero', async () => {
    const { response, result } = await exchange(SITE, '/api/projects/' + PROJECT);
    need(response.status === 200 && result?.id === PROJECT && result.latest_version === 0 && result.latest === null, 'Baseline project state mismatch');
    return { version: 0, latest: null };
  });
  console.log('READY_FOR_TARGETED_MEMBER_DEACTIVATION');
  const checkpoint = JSON.parse(await terminal.question('Provide DEACTIVATED checkpoint JSON after targeted SQL update: '));
  need(checkpoint.userId === USER && checkpoint.active === false && checkpoint.name === '验收学生 B', 'Deactivation checkpoint does not match B');
  report.stateChanges.push({ action: 'targeted membership deactivation by coordinating agent', ...checkpoint });
  await check('Old cookie me returns member 403 without clearing cookie', () => deniedBff('/api/auth/me'));
  await check('Old cookie list returns member 403 without clearing cookie', () => deniedBff('/api/projects'));
  await check('Old cookie save returns member 403 without clearing cookie', () => deniedBff('/api/projects/7/versions', 'POST', save()));
  await check('Direct JWT identity RPC rejects inactive member', async () => {
    const { response, result } = await exchange(DB, '/rest/v1/rpc/pilot_me', { method: 'POST', data: {} });
    need(response.status === 403 && result?.code === 'PT403', 'Inactive direct identity RPC must reject with PT403');
  });
  await check('Direct JWT save RPC rejects inactive member', async () => {
    const { response, result } = await exchange(DB, '/rest/v1/rpc/pilot_projects', { method: 'POST',
      data: { operation: 'save', payload: { id: PROJECT, ...save() } } });
    need(response.status === 403 && result?.code === 'PT403', 'Inactive direct save RPC must reject with PT403');
  });
  await check('Fresh password login cannot bypass inactive membership', () => deniedBff('/api/auth/login', 'POST', accounts.b, false));
  console.log('READY_FOR_SQL_UNCHANGED_VERIFICATION');
  const finalState = JSON.parse(await terminal.question('Provide SQL verification JSON: '));
  await check('Independent SQL confirms denied writes changed no project versions', async () => {
    need(finalState.userId === USER && finalState.active === false && finalState.projectId === PROJECT &&
      finalState.ownerId === USER && finalState.latestVersion === 0 && finalState.versionRows === 0, 'Independent final SQL state mismatch');
    return finalState;
  });
} catch (error) {
  // Deliberately do not print error objects, request bodies, credentials or tokens.
  if (activeCheck) activeCheck.failure = 'Assertion or request failed; see non-sensitive request trace';
  report.failure = { name: error?.name || 'Error', details: 'Sensitive exception details withheld' };
  console.log('FAIL membership acceptance; no sensitive exception details printed');
  process.exitCode = 1;
} finally {
  if (cookie) {
    try {
      await check('Only this script successful login session is revoked with scope=local', async () => {
        const { response, result } = await exchange(SITE, '/api/auth/logout', { method: 'POST', data: {} });
        need(response.status === 200 && result?.remoteRevoked === true, 'Cleanup logout was not confirmed');
        need(response.headers.getSetCookie().some(x => x.startsWith(COOKIE + '=;') && /Max-Age=0/.test(x)), 'Cleanup must clear local cookie');
        return { remoteRevoked: true, localCookieCleared: true };
      });
    } catch {
      if (activeCheck) activeCheck.failure = 'Cleanup logout not confirmed';
      report.cleanupFailure = true; process.exitCode = 1;
    }
  }
  cookie = undefined; jwt = undefined;
  terminal.close();
  report.finishedAt = new Date().toISOString();
  report.passed = report.checks.filter(x => x.passed).length;
  report.total = report.checks.length;
  report.status = !report.failure && !report.cleanupFailure && report.passed === 10 ? 'PASS' : 'NOT_ACCEPTED';
  report.score = { dimension: 'Specified-account membership revocation only', passed: report.passed, total: 10,
    percent: report.status === 'PASS' ? 100 : null, notAPlatformScore: true };
  await writeFile(reportFile, JSON.stringify(report, null, 2));
  console.log(`${report.status}: ${report.passed}/${report.total}; report persisted without credentials or tokens.`);
}
