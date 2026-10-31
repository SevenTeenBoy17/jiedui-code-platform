import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

// Contract-level DOM simulation only: this is not a browser or visual acceptance test.
const html = readFileSync(fileURLToPath(new URL('../public/index.html', import.meta.url)), 'utf8');
const source = readFileSync(fileURLToPath(new URL('../public/app.js', import.meta.url)), 'utf8').replace(/boot\(\);\s*$/, '');

class Element {
  constructor(id = '', tag = '') {
    Object.assign(this, { id, tag, value: '', hidden: false, disabled: false, readOnly: false, dataset: {}, attributes: {}, children: [], listeners: {}, open: false, textContent: '' });
  }
  addEventListener(type, callback) { (this.listeners[type] ??= []).push(callback); }
  async dispatch(type, event = { preventDefault() {} }) { for (const callback of this.listeners[type] ?? []) await callback(event); }
  append(...items) {
    this.children.push(...items);
    if (this.tag === 'select' && !this.value && items[0]) this.value = items[0].value;
  }
  replaceChildren(...items) { this.children = items; if (this.tag === 'select') this.value = ''; }
  querySelectorAll(tag) {
    return this.children.flatMap((child) => [...(child.tag === tag ? [child] : []), ...child.querySelectorAll(tag)]);
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  focus() {}
  showModal() { this.open = true; }
  close() { this.open = false; for (const callback of this.listeners.close ?? []) callback(); }
}

function harness() {
  const elements = Object.fromEntries([...html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/g)].map((match) => {
    const element = new Element(match[2], match[1]);
    element.hidden = /\shidden(?:\s|>)/.test(match[0]);
    return [match[2], element];
  }));
  const queue = [], requests = [], windowListeners = {}, unexpected = [];
  let uuid = 0;
  const sandbox = {
    console, AbortController, setTimeout, clearTimeout,
    crypto: { randomUUID: () => `test-request-${++uuid}` },
    window: { confirm: () => true, addEventListener(type, callback) { windowListeners[type] = callback; } },
    document: {
      getElementById: (id) => { assert.ok(elements[id], `Missing DOM binding: ${id}`); return elements[id]; },
      querySelector: () => new Element(),
      createDocumentFragment: () => new Element(),
      createElement: (tag) => new Element('', tag),
    },
    fetch: async (path, options) => {
      requests.push({ path, ...options, payload: options.body ? JSON.parse(options.body) : undefined });
      const reply = queue.shift();
      if (!reply || reply.path !== path) { unexpected.push({ expected: reply?.path, actual: path }); throw new Error('Unexpected request'); }
      return { ok: reply.status < 400, status: reply.status, text: async () => JSON.stringify(reply.body) };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const reply = (path, body, status = 200) => queue.push({ path, body, status });
  const settle = () => new Promise(setImmediate);
  const emit = async (id, type = 'click') => { await elements[id].dispatch(type); await settle(); };
  const project = (version = 1, code = 'print("saved")') => ({ id: 1, title: '试用作品', language: 'python', latest_version: version, latest: { code, version_no: version, block_state: null } });
  const login = async (userId = 'member-a', recoveryProject = undefined) => {
    elements.email.value = `${userId}@example.test`;
    elements.password.value = 'test-password-only';
    reply('/api/auth/login', { user: { id: userId, name: userId, role: 'student' } });
    reply('/api/projects', [project()]);
    if (recoveryProject) reply('/api/projects/1', recoveryProject);
    await emit('login-form', 'submit');
  };
  const openProject = async () => {
    reply('/api/projects/1', project());
    await elements['project-list'].querySelectorAll('button')[0].dispatch('click');
    await settle();
  };
  const edit = async (code) => { elements['code-input'].value = code; await emit('code-input', 'input'); };
  const expire = async () => { reply('/api/projects/1/versions', { error: { code: 'UNAUTHORIZED', message: 'expired' } }, 401); await emit('save-button'); };
  const cleanRequests = () => { assert.deepEqual(unexpected, []); assert.equal(queue.length, 0, 'Every expected request was used'); };
  return { elements, reply, requests, sandbox, windowListeners, emit, project, login, openProject, edit, expire, cleanRequests };
}

test('401 keeps draft private, then same verified account restores it after a fresh server read without POST', async () => {
  const h = harness();
  await h.login(); await h.openProject(); await h.edit('print("private draft")'); await h.expire();
  assert.equal(h.elements['login-view'].hidden, false);
  assert.equal(h.elements['workspace-view'].hidden, true);
  assert.equal(h.elements['code-input'].value, '');
  assert.equal(h.elements['history-code'].value, '');
  const before = h.requests.length;
  await h.login('member-a', h.project());
  assert.equal(h.elements['code-input'].value, 'print("private draft")');
  assert.deepEqual(h.requests.slice(before).map((request) => [request.path, request.method ?? 'GET']), [['/api/auth/login', 'POST'], ['/api/projects', 'GET'], ['/api/projects/1', 'GET']]);
  assert.equal(h.elements['conflict-notice'].hidden, true);
  assert.match(h.elements['workspace-status'].textContent, /恢复/);
  h.cleanRequests();
});

test('changed server version restores draft as a conflict, never silently replaces or submits it', async () => {
  const h = harness();
  await h.login(); await h.openProject(); await h.edit('print("my draft")'); await h.expire();
  await h.login('member-a', h.project(2, 'print("other tab")'));
  assert.equal(h.elements['code-input'].value, 'print("my draft")');
  assert.equal(h.elements['conflict-notice'].hidden, false);
  assert.equal(h.elements['save-button'].disabled, true);
  const before = h.requests.length;
  await h.emit('save-button');
  assert.equal(h.requests.length, before);
  h.sandbox.window.confirm = () => false;
  await h.emit('load-latest');
  assert.equal(h.elements['code-input'].value, 'print("my draft")');
  assert.equal(h.requests.length, before);
  h.cleanRequests();
});

test('successful login to a different account clears the old account draft permanently', async () => {
  const h = harness();
  await h.login(); await h.openProject(); await h.edit('secret-of-a'); await h.expire();
  await h.login('member-b');
  assert.equal(h.elements['code-input'].value, '');
  assert.equal(h.elements['draft-recovery'].hidden, true);
  h.reply('/api/auth/logout', {}); await h.emit('logout-button');
  await h.login('member-a');
  assert.equal(h.elements['code-input'].value, '');
  h.cleanRequests();
});

test('active logout clears an unsaved draft and does not recover it on next login', async () => {
  const h = harness();
  await h.login(); await h.openProject(); await h.edit('discard-on-logout');
  h.reply('/api/auth/logout', {}); await h.emit('logout-button'); await h.login();
  assert.equal(h.elements['code-input'].value, '');
  h.cleanRequests();
});

test('recovery read failure keeps a private in-memory draft available for explicit retry or discard', async () => {
  const h = harness();
  await h.login(); await h.openProject(); await h.edit('recover-after-read-error'); await h.expire();
  h.elements.email.value = 'member-a@example.test'; h.elements.password.value = 'test-password-only';
  h.reply('/api/auth/login', { user: { id: 'member-a', name: 'member-a', role: 'student' } });
  h.reply('/api/projects', [h.project()]); h.reply('/api/projects/1', { error: { message: 'not ready' } }, 503);
  await h.emit('login-form', 'submit');
  assert.equal(h.elements['code-input'].value, '');
  assert.equal(h.elements['draft-recovery'].hidden, false);
  let prevented = false;
  h.windowListeners.beforeunload({ preventDefault() { prevented = true; }, returnValue: '' });
  assert.equal(prevented, true);
  h.reply('/api/projects/1', h.project()); await h.emit('retry-draft-recovery');
  assert.equal(h.elements['code-input'].value, 'recover-after-read-error');
  h.cleanRequests();
});

test('explicitly discarding a retained draft clears it and the reload warning', async () => {
  const h = harness();
  await h.login(); await h.openProject(); await h.edit('discard-me'); await h.expire();
  await h.emit('discard-login-draft');
  let prevented = false;
  h.windowListeners.beforeunload({ preventDefault() { prevented = true; }, returnValue: '' });
  assert.equal(prevented, false);
  await h.login(); assert.equal(h.elements['code-input'].value, '');
  h.cleanRequests();
});

test('same-account recovery keeps the unconfirmed save request id for explicit retry', async () => {
  const h = harness();
  await h.login(); await h.openProject(); await h.edit('print("same-key")'); await h.expire();
  const original = h.requests.at(-1).payload;
  await h.login('member-a', h.project());
  h.reply('/api/projects/1/versions', { versionNo: 2, changed: true }); await h.emit('save-button');
  assert.equal(h.requests.at(-1).payload.requestId, original.requestId);
  assert.equal(h.requests.at(-1).payload.expectedVersion, 1);
  h.cleanRequests();
});

test('a second expiry while checking recovery keeps the same private draft for the next valid login', async () => {
  const h = harness();
  await h.login(); await h.openProject(); await h.edit('survives-a-second-expiry'); await h.expire();
  h.elements.email.value = 'member-a@example.test'; h.elements.password.value = 'test-password-only';
  h.reply('/api/auth/login', { user: { id: 'member-a', name: 'member-a', role: 'student' } });
  h.reply('/api/projects', [h.project()]); h.reply('/api/projects/1', { error: { message: 'expired again' } }, 401);
  await h.emit('login-form', 'submit');
  assert.equal(h.elements['login-view'].hidden, false);
  assert.equal(h.elements['code-input'].value, '');
  await h.login('member-a', h.project());
  assert.equal(h.elements['code-input'].value, 'survives-a-second-expiry');
  h.cleanRequests();
});

test('a mismatching project response does not expose or discard the retained draft', async () => {
  const h = harness();
  await h.login(); await h.openProject(); await h.edit('bound-to-project-1'); await h.expire();
  await h.login('member-a', { ...h.project(), id: 2 });
  assert.equal(h.elements['code-input'].value, '');
  assert.equal(h.elements['draft-recovery'].hidden, false);
  h.reply('/api/projects/1', h.project()); await h.emit('retry-draft-recovery');
  assert.equal(h.elements['code-input'].value, 'bound-to-project-1');
  h.cleanRequests();
});

test('changed content under an unchanged version number is also treated as a conflict', async () => {
  const h = harness();
  await h.login(); await h.openProject(); await h.edit('retain-my-draft'); await h.expire();
  await h.login('member-a', h.project(1, 'unexpected-content-change'));
  assert.equal(h.elements['code-input'].value, 'retain-my-draft');
  assert.equal(h.elements['save-button'].disabled, true);
  assert.equal(h.elements['conflict-notice'].hidden, false);
  h.cleanRequests();
});

test('a late recovery response after active logout cannot repopulate the page', async () => {
  const h = harness();
  await h.login(); await h.openProject(); await h.edit('no-late-leak'); await h.expire();
  h.elements.email.value = 'member-a@example.test'; h.elements.password.value = 'test-password-only';
  h.reply('/api/auth/login', { user: { id: 'member-a', name: 'member-a', role: 'student' } });
  h.reply('/api/projects', [h.project()]);
  const normalFetch = h.sandbox.fetch;
  let resolveRecovery;
  h.sandbox.fetch = (path, options) => path === '/api/projects/1'
    ? new Promise((resolve) => { resolveRecovery = resolve; })
    : normalFetch(path, options);
  const recovering = h.emit('login-form', 'submit');
  await new Promise(setImmediate);
  assert.equal(typeof resolveRecovery, 'function');
  h.reply('/api/auth/logout', {}); await h.emit('logout-button');
  resolveRecovery({ ok: true, status: 200, text: async () => JSON.stringify(h.project()) });
  await recovering;
  assert.equal(h.elements['workspace-view'].hidden, true);
  assert.equal(h.elements['code-input'].value, '');
  assert.equal(h.elements['draft-recovery'].hidden, true);
  h.cleanRequests();
});

test('recovery code uses no persistent browser storage or HTML injection surface', () => {
  assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|indexedDB|innerHTML)\b/);
  assert.match(html, /刷新或关闭页面会丢失/);
});
