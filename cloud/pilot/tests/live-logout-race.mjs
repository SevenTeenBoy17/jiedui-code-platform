import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createHash, randomUUID } from 'node:crypto';

const SITE = process.env.HANDOFF_TEST_SITE;
const DB = process.env.HANDOFF_TEST_DATABASE_URL;
const KEY = process.env.HANDOFF_TEST_DATABASE_PUBLIC_KEY;
const COOKIE = '__Host-jiedui_access';

// Handoff safety gate: only isolated, explicitly authorised synthetic projects.
if (process.env.HANDOFF_ALLOW_LIVE_TESTS !== '1' || !SITE || !DB || !KEY || !process.env.HANDOFF_TEST_USER_ID) {
  throw new Error('Live tests disabled. Configure an isolated test project and explicitly opt in; never use real student data.');
}

const actor = process.env.HANDOFF_TEST_USER_ID;
const accountsFile = new URL('../../../.runtime/netlify-n1-20261013/acceptance-accounts.private.json', import.meta.url);
const output = new URL('../../../.runtime/netlify-n1-20261013/logout-race.json', import.meta.url);
const report = {
  startedAt: new Date().toISOString(), site: SITE, databaseProject: 'slyzlplnuozzccdznuqp',
  expectedDeployment: '6acf3ee486e4b664ffcf926d',
  scriptSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
  scope: 'One synthetic project, independent A sessions, real concurrent HTTPS save/logout, read-only database lock observations, at most one 15 second actor lock attempt.',
  requests: [], proofs: [], checks: [], cleanup: [],
};
const sessions = [];
let race, observer, projectId, savePromise, logoutPromise, saveDone = false, logoutDone = false;
let finalized = false;
let inputTimer;
class Failure extends Error {}
const need = (yes, text) => { if (!yes) throw new Failure(text); };
const safeError = error => error instanceof Failure ? error.message : `Unexpected ${error?.name || 'Error'}; detail withheld`;
const emit = data => console.log(JSON.stringify(data));
const body = code => ({ code, blockState: null, expectedVersion: 0, requestId: randomUUID() });

async function call(base, path, { method = 'GET', session, json } = {}) {
  need([SITE, DB].includes(base), 'Unauthorized request target');
  const url = new URL(path, base); need(url.origin === base, 'Origin escape refused');
  const headers = {};
  if (base === SITE) { if (session) headers.Cookie = session.cookie; if (method !== 'GET') headers.Origin = SITE; }
  else { headers.apikey = KEY; if (session) headers.Authorization = 'Bearer ' + session.token; }
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  const startedAt = new Date().toISOString();
  let response;
  try { response = await fetch(url, { method, headers, ...(json === undefined ? {} : { body: JSON.stringify(json) }), redirect: 'error', signal: AbortSignal.timeout(35000) }); }
  catch { throw new Failure('HTTPS request failed; no retry was attempted'); }
  let data;
  try { data = await response.json(); } catch { data = null; }
  const trace = { host: url.hostname, path: url.pathname, method, startedAt, completedAt: new Date().toISOString(), status: response.status };
  if (base === SITE) trace.clearsCookie = response.headers.getSetCookie().some(value => value.startsWith(COOKIE + '=;') && /Max-Age=0/i.test(value));
  const code = data?.error?.code ?? data?.code;
  if (typeof code === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(code)) trace.errorCode = code;
  report.requests.push(trace);
  return { status: response.status, data, headers: response.headers, trace };
}
const api = (path, options) => call(SITE, path, options);
const rpc = (session, operation, payload) => call(DB, '/rest/v1/rpc/pilot_projects', { method: 'POST', session, json: { operation, payload } });
function expectStatus(result, expected) { need(result.status === expected, `Expected HTTP ${expected}; received ${result.status}`); }
async function check(name, run) {
  try { const evidence = await run(); report.checks.push({ name, passed: true, ...evidence }); emit({ check: name, passed: true }); }
  catch (error) { report.checks.push({ name, passed: false, failure: safeError(error) }); emit({ check: name, passed: false, failure: safeError(error) }); }
}
async function login(label, credentials) {
  const r = await api('/api/auth/login', { method: 'POST', json: credentials }); expectStatus(r, 200);
  const cookie = r.headers.getSetCookie().find(value => value.startsWith(COOKIE + '='))?.split(';')[0];
  need(!!cookie, 'Login cookie absent');
  const session = { label, cookie, token: cookie.slice(COOKIE.length + 1), revoked: false };
  sessions.push(session);
  need(r.data?.user?.id === actor, 'Credential identity does not match authorized synthetic A');
  return session;
}
async function snapshot() {
  const p = await api(`/api/projects/${projectId}`, { session: observer }); expectStatus(p, 200);
  const h = await api(`/api/projects/${projectId}/versions`, { session: observer }); expectStatus(h, 200);
  need(Array.isArray(h.data), 'Invalid history response');
  return { version: p.data.latest_version, historyRows: h.data.length, code: p.data.latest?.code };
}
function cookieDenied(r) {
  expectStatus(r, 401); need(r.data?.error?.code === 'SESSION_EXPIRED' && r.trace.clearsCookie, 'Revoked cookie must expire and be cleared');
  need(Object.keys(r.data || {}).join(',') === 'error', 'Denied request leaked non-error data');
}

async function finish(reason) {
  if (finalized) return;
  finalized = true; clearTimeout(inputTimer);
  if (reason) report.fatal = reason;
  if (savePromise) await savePromise;
  if (logoutPromise) await logoutPromise;
  await check('Database observations prove save held session access while waiting on actor lock', async () => {
    const proof = report.proofs.find(p => p.kind === 'save_wait');
    need(proof && Array.isArray(proof.rows), 'Save waiting proof was not supplied');
    const held = proof.rows.find(row => row.granted === true);
    const save = proof.rows.find(row => row.granted === false && row.query_class === 'pilot_projects' && row.session_relation_lock === true);
    need(held && save && save.blockers.includes(held.pid), 'Expected actor-lock save waiting chain was not observed');
    return { holderPid: held.pid, savePid: save.pid, waitEvent: save.wait_event, observedAt: save.observed_at };
  });
  await check('Database observations prove logout waited for the in-flight save transaction', async () => {
    const first = report.proofs.find(p => p.kind === 'save_wait');
    const savePid = first?.rows.find(row => row.granted === false && row.query_class === 'pilot_projects')?.pid;
    const proof = report.proofs.find(p => p.kind === 'logout_wait');
    const logout = proof?.rows?.find(row => row.pid !== savePid && row.blockers.includes(savePid) && row.session_relation_lock === true && row.wait_event_type === 'Lock');
    need(logout, 'No logout-to-save database blocking edge was observed');
    return { savePid, logoutPid: logout.pid, waitEvent: logout.wait_event, observedAt: logout.observed_at, meaning: 'Logout was blocked by the save transaction, rather than merely racing two sequential HTTP calls.' };
  });
  await check('Actor lock transaction released with no held or waiting target lock remaining', async () => {
    const proof = report.proofs.find(p => p.kind === 'released');
    need(proof?.rows?.[0]?.actor_locks === 0, 'Actor lock release was not observed');
    return { actorLocksAfter: 0, observedAt: proof.rows[0].observed_at };
  });
  await check('Real concurrent save and logout completed successfully', async () => {
    need(report.save && report.logout, 'Both concurrent HTTP operations are required');
    need(report.save.status === 200 && report.logout.status === 200, 'Concurrent save or logout failed');
    need(report.save.versionNo === 1 && report.logout.remoteRevoked === true, 'Save receipt or logout confirmation is incomplete');
    need(Date.parse(report.logout.startedAt) < Date.parse(report.save.completedAt), 'Requests did not overlap in time');
    return { save: report.save, logout: report.logout, responseOrderingIsNotUsedAsDatabaseCommitProof: true };
  });
  if (observer && projectId) {
    await check('Only the queued save produced one persisted version', async () => {
      const state = await snapshot(); need(state.version === 1 && state.historyRows === 1 && state.code === report.fixtureCode, 'The expected single race save was not persisted');
      return { latestVersion: state.version, historyRows: state.historyRows };
    });
    if (report.logout?.status === 200 && report.logout.remoteRevoked === true) await check('Revoked cookie and JWT writes cannot add a version after logout', async () => {
      const before = await snapshot();
      const cookie = await api(`/api/projects/${projectId}/versions`, { method: 'POST', session: race, json: { ...body('revoked cookie must not save'), expectedVersion: before.version } }); cookieDenied(cookie);
      const jwt = await rpc(race, 'save', { id: projectId, ...body('revoked JWT must not save'), expectedVersion: before.version }); expectStatus(jwt, 401);
      const after = await snapshot(); need(after.version === before.version && after.historyRows === before.historyRows, 'Revoked session changed persisted version state');
      return { cookieStatus: cookie.status, cookieCode: cookie.data.error.code, cookieCleared: cookie.trace.clearsCookie, jwtStatus: jwt.status, versionBefore: before.version, versionAfter: after.version, historyAdded: 0 };
    });
    else report.checks.push({ name: 'Revoked cookie and JWT writes cannot add a version after logout', passed: false, notRun: true, failure: 'No confirmed logout exists; post-revocation writes must not be attempted' });
  }
  for (const session of sessions) {
    try {
      if (!session.revoked) {
        const r = await api('/api/auth/logout', { method: 'POST', session, json: {} }); expectStatus(r, 200); need(r.data?.remoteRevoked === true, 'Session cleanup was not acknowledged');
      }
      const r = await call(DB, '/rest/v1/rpc/pilot_me', { method: 'POST', session, json: {} }); expectStatus(r, 401);
      report.cleanup.push({ session: session.label, scope: 'local', passed: true });
    } catch (error) { report.cleanup.push({ session: session.label, scope: 'local', passed: false, failure: safeError(error) }); }
  }
  delete report.fixtureCode;
  report.finishedAt = new Date().toISOString();
  report.passed = report.checks.filter(row => row.passed).length;
  report.failed = report.checks.filter(row => !row.passed).length;
  report.requestCount = report.requests.length;
  report.verdict = !report.fatal && report.failed === 0 && report.cleanup.every(row => row.passed) ? 'PASS' : 'NOT_PROVEN';
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  emit({ verdict: report.verdict, passed: report.passed, failed: report.failed, requestCount: report.requestCount, cleanupPassed: report.cleanup.every(row => row.passed) });
  process.exitCode = report.verdict === 'PASS' ? 0 : 1;
  process.stdin.pause();
}

try {
  const credentials = JSON.parse(await readFile(accountsFile, 'utf8')).a;
  race = await login('race-A', credentials); observer = await login('observer-A', credentials);
  const title = `N1 HTTP 验收 logout race ${new Date().toISOString()} ${randomUUID().slice(0, 6)}`;
  const created = await api('/api/projects', { method: 'POST', session: race, json: { title, language: 'python', requestId: randomUUID() } });
  expectStatus(created, 201); projectId = created.data.id;
  need(Number.isInteger(projectId) && created.data.latest_version === 0, 'Race project must start empty');
  report.project = { id: projectId, title }; report.fixtureCode = `print('N1 logout race ${projectId}')`;
  emit({ ready: true, actorId: actor, projectId });
  const lines = createInterface({ input: process.stdin, terminal: false });
  let commandQueue = Promise.resolve();
  inputTimer = setTimeout(() => { lines.close(); void finish('Controller did not complete the bounded race'); }, 120000);
  lines.on('line', line => {
    commandQueue = commandQueue.then(async () => {
      const command = JSON.parse(line);
      if (command.action === 'save') {
        need(!savePromise, 'Only one controlled save attempt is permitted');
        report.saveStartedAt = new Date().toISOString();
        savePromise = api(`/api/projects/${projectId}/versions`, { method: 'POST', session: race, json: body(report.fixtureCode) }).then(r => {
          report.save = { ...r.trace, versionNo: r.data?.versionNo, changed: r.data?.changed }; saveDone = true;
          emit({ event: 'save_completed', status: r.status });
        }).catch(error => { report.saveFailure = safeError(error); saveDone = true; });
        emit({ event: 'save_started' });
      } else if (command.action === 'proof') {
        need(['save_wait', 'logout_wait', 'released'].includes(command.kind) && Array.isArray(command.rows), 'Unsupported lock observation');
        report.proofs.push({ kind: command.kind, rows: command.rows, receivedAt: new Date().toISOString(), savePendingAtReceipt: !saveDone, logoutPendingAtReceipt: !!logoutPromise && !logoutDone });
        emit({ event: 'proof_recorded', kind: command.kind });
      } else if (command.action === 'logout') {
        need(savePromise && !saveDone && !logoutPromise && report.proofs.some(row => row.kind === 'save_wait'), 'Logout requires an observed pending save');
        logoutPromise = api('/api/auth/logout', { method: 'POST', session: race, json: {} }).then(r => {
          report.logout = { ...r.trace, remoteRevoked: r.data?.remoteRevoked }; logoutDone = true;
          if (r.status === 200 && r.data?.remoteRevoked === true) race.revoked = true;
          emit({ event: 'logout_completed', status: r.status });
        }).catch(error => { report.logoutFailure = safeError(error); logoutDone = true; });
        emit({ event: 'logout_started' });
      } else if (command.action === 'finish') { lines.close(); await finish(); }
      else if (command.action === 'abort') { lines.close(); await finish('Controller could not prove the requested lock state'); }
      else throw new Failure('Unknown controller command');
    }).catch(async error => { lines.close(); await finish(safeError(error)); });
  });
} catch (error) { await finish(safeError(error)); }
