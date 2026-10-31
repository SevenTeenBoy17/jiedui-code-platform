const $ = (id) => document.getElementById(id);
const languageNames = { python: 'Python', cpp: 'C++', c: 'C' };
let user = null;
let projects = [];
let currentProject = null;
let baseCode = '';
let baseVersion = 0;
let pendingSave = null;
let pendingCreate = null;
// Account-bound, page-memory-only recovery. Never rendered while signed out.
let recoveryDraft = null;
let history = [];
let authEpoch = 0;
let selectionEpoch = 0;
let historyEpoch = 0;
let busy = false;
let createBusy = false;
let conflict = false;

class ApiError extends Error {
  constructor(message, status = 0, code = 'NETWORK_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function notice(id, message = '', tone = 'info') {
  const element = $(id);
  element.textContent = message;
  element.dataset.tone = tone;
  element.hidden = !message;
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; }
    catch { throw new ApiError('服务暂时没有返回有效结果，请稍后重试。', response.status >= 400 ? response.status : 503, 'INVALID_RESPONSE'); }
    if (!response.ok) {
      throw new ApiError(data?.error?.message || '请求未完成，请稍后重试。', response.status, data?.error?.code || 'API_ERROR');
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('暂时无法连接服务，请检查网络后重试。');
  } finally { clearTimeout(timeout); }
}

function dirty() { return currentProject !== null && $('code-input').value !== baseCode; }
function hasUnsaved() { return dirty() || pendingSave !== null || recoveryDraft !== null; }
function confirmDiscard() {
  return !hasUnsaved() || window.confirm('当前草稿尚未确认保存。继续会放弃当前页面的草稿，确定继续吗？');
}
function setBusy(value) {
  busy = value;
  // A late project response must not overwrite text typed while switching projects.
  $('code-input').readOnly = value;
  for (const id of ['save-button', 'reload-project', 'history-button', 'new-project', 'refresh-list']) $(id).disabled = value;
  $('save-button').disabled = value || conflict;
  $('load-latest').disabled = value;
  $('retry-draft-recovery').disabled = value;
  $('discard-workspace-draft').disabled = value;
  for (const button of $('project-list').querySelectorAll('button')) button.disabled = value;
}
function updateDraftStatus() {
  const changed = dirty();
  const sameAttempt = pendingSave && currentProject && pendingSave.projectId === currentProject.id && pendingSave.code === $('code-input').value;
  $('draft-status').textContent = sameAttempt ? '上次保存结果未确认' : changed ? '有未保存的修改' : '与已载入版本一致';
  $('draft-status').dataset.dirty = String(changed || Boolean(sameAttempt));
  $('save-button').textContent = sameAttempt ? '重试本次保存' : '保存版本';
}
function renderRecoveryControls() {
  $('discard-login-draft').hidden = Boolean(user) || !recoveryDraft;
  $('draft-recovery').hidden = !user || !recoveryDraft || recoveryDraft.userId !== user.id;
}
function rememberUnsavedDraft() {
  if (!user || !currentProject || (!dirty() && !pendingSave)) return;
  recoveryDraft = {
    userId: user.id,
    projectId: currentProject.id,
    code: $('code-input').value,
    baseCode,
    baseVersion,
    conflict,
    pendingSave: pendingSave ? { ...pendingSave } : null,
  };
}
function resetMemory({ keepRecovery = false } = {}) {
  authEpoch += 1;
  selectionEpoch += 1;
  historyEpoch += 1;
  user = null;
  projects = [];
  currentProject = null;
  baseCode = '';
  baseVersion = 0;
  pendingSave = null;
  pendingCreate = null;
  if (!keepRecovery) recoveryDraft = null;
  history = [];
  conflict = false;
  busy = false;
  createBusy = false;
  $('code-input').value = '';
  $('history-code').value = '';
  $('project-list').replaceChildren();
  $('version-select').replaceChildren();
  $('user-name').textContent = '';
  $('user-role').textContent = '';
  $('project-title').textContent = '';
  $('history-title').textContent = '版本记录';
  $('project-name').value = '';
  $('project-language').value = 'python';
  $('project-count').textContent = '0';
  $('password').value = '';
  $('email').value = '';
  $('conflict-notice').hidden = true;
  $('editor-content').hidden = true;
  $('editor-empty').hidden = false;
  for (const id of ['create-dialog', 'history-dialog']) if ($(id).open) $(id).close();
  for (const id of ['workspace-status', 'create-status']) notice(id);
  setBusy(false);
  setCreateBusy(false);
  renderRecoveryControls();
}
function showLogin(message = '', tone = 'info', { keepRecovery = false } = {}) {
  resetMemory({ keepRecovery });
  $('workspace-view').hidden = true;
  $('login-view').hidden = false;
  document.querySelector('.skip-link').href = '#main-content';
  notice('login-status', message, tone);
  $('email').focus();
}
function handleError(error, target = 'workspace-status', fallback = '') {
  if (error.status === 401 && user) {
    rememberUnsavedDraft();
    showLogin(recoveryDraft ? '登录已失效。草稿仅暂存在本页内存，登录同一账号并核对版本后可恢复。请勿刷新或关闭页面；换账号会清除暂存。' : '登录已失效，请重新登录。', 'warning', { keepRecovery: true });
    return;
  }
  const message = error.status === 403 ? '此账号未获得当前试用空间的访问权限，请联系管理员。' : (fallback || error.message);
  notice(target, message, 'error');
}
function requireUserShape(data) {
  if (!data?.user || typeof data.user.id !== 'string' || !['student', 'teacher'].includes(data.user.role)) throw new ApiError('登录信息不完整，请联系管理员。', 503);
  return data.user;
}
function requireProjectShape(project) {
  if (!project || !Number.isSafeInteger(project.id) || project.id < 1 || !Object.hasOwn(languageNames, project.language) || typeof project.title !== 'string' || !Number.isSafeInteger(project.latest_version) || project.latest_version < 0) throw new ApiError('作品数据格式异常，请稍后重试。', 503);
  return project;
}
function renderProjects() {
  const fragment = document.createDocumentFragment();
  for (const project of projects) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'project-item';
    button.disabled = busy;
    button.setAttribute('aria-pressed', String(currentProject?.id === project.id));
    const title = document.createElement('strong');
    title.textContent = project.title;
    const meta = document.createElement('span');
    meta.className = 'project-meta';
    const language = document.createElement('span');
    language.className = 'project-lang';
    language.textContent = languageNames[project.language];
    const version = document.createElement('span');
    version.textContent = project.latest_version > 0 ? `已保存 v${project.latest_version}` : '尚未保存代码';
    meta.append(language, version);
    button.append(title, meta);
    button.addEventListener('click', () => selectProject(project.id));
    item.append(button);
    fragment.append(item);
  }
  $('project-list').replaceChildren(fragment);
  $('project-count').textContent = String(projects.length);
  $('list-empty').hidden = projects.length > 0;
}
async function refreshProjects({ quiet = false } = {}) {
  const epoch = authEpoch;
  const data = await api('/api/projects');
  if (epoch !== authEpoch || !user) return;
  if (!Array.isArray(data)) throw new ApiError('作品列表格式异常，请稍后重试。', 503);
  projects = data.map(requireProjectShape);
  renderProjects();
  if (!quiet) notice('workspace-status', '作品列表已刷新。当前编辑区的草稿未被改动。', 'success');
}
function applyProject(project) {
  requireProjectShape(project);
  if ((project.latest_version > 0 && !project.latest) || (project.latest && (typeof project.latest.code !== 'string' || !Number.isSafeInteger(project.latest.version_no) || project.latest.version_no !== project.latest_version))) throw new ApiError('作品版本格式异常，未替换当前草稿。', 503);
  currentProject = project;
  const listedProject = projects.find((item) => item.id === project.id);
  if (listedProject) listedProject.latest_version = project.latest_version;
  recoveryDraft = null;
  renderRecoveryControls();
  baseCode = project.latest?.code ?? '';
  baseVersion = project.latest_version;
  pendingSave = null;
  conflict = false;
  $('conflict-notice').hidden = true;
  $('code-input').value = baseCode;
  $('project-title').textContent = project.title;
  $('language-badge').textContent = languageNames[project.language];
  $('version-description').textContent = baseVersion > 0 ? `当前已载入 v${baseVersion} · 只保存，不运行` : '还没有代码版本 · 写下第一段想法吧';
  $('editor-empty').hidden = true;
  $('editor-content').hidden = false;
  updateDraftStatus();
  renderProjects();
}
async function restoreDraft() {
  const saved = recoveryDraft;
  if (!user || !saved || saved.userId !== user.id) return;
  const epoch = authEpoch;
  setBusy(true);
  notice('workspace-status', '正在核对云端版本，尚未提交暂存草稿…');
  try {
    const project = requireProjectShape(await api(`/api/projects/${encodeURIComponent(saved.projectId)}`));
    if (epoch !== authEpoch || !user || recoveryDraft !== saved || user.id !== saved.userId) return;
    if (project.id !== saved.projectId) throw new ApiError('作品核对结果不一致，暂存草稿未打开。', 503);
    applyProject(project);
    $('code-input').value = saved.code;
    conflict = saved.conflict || project.latest_version !== saved.baseVersion || baseCode !== saved.baseCode;
    pendingSave = !conflict && saved.pendingSave && saved.pendingSave.projectId === saved.projectId && saved.pendingSave.code === saved.code && saved.pendingSave.expectedVersion === baseVersion ? saved.pendingSave : null;
    $('conflict-notice').hidden = !conflict;
    $('version-description').textContent = `已恢复本页草稿 · 原基准 v${saved.baseVersion} · 云端 v${project.latest_version}`;
    updateDraftStatus();
    notice('workspace-status', conflict ? '本页草稿已恢复，但云端版本已变化或原冲突尚未解决。草稿未提交，请查看版本记录；载入最新版会先要求确认。' : '已核对云端版本并恢复本页草稿，尚未自动提交。请确认内容后手动保存。', conflict ? 'warning' : 'success');
    $('code-input').focus();
  } catch (error) {
    if (epoch === authEpoch) handleError(error, 'workspace-status', error.status === 401 || error.status === 403 ? '' : '暂时无法核对云端版本，草稿仍在本页内存。请重试恢复；不要刷新或关闭页面。');
  } finally {
    if (epoch === authEpoch) { setBusy(false); renderRecoveryControls(); }
  }
}
async function selectProject(id, { force = false } = {}) {
  if (busy || (!force && currentProject?.id === id)) return;
  if (!confirmDiscard()) return;
  const epoch = authEpoch;
  const selection = ++selectionEpoch;
  setBusy(true);
  notice('workspace-status', '正在读取作品…');
  try {
    const project = await api(`/api/projects/${encodeURIComponent(id)}`);
    if (epoch !== authEpoch || selection !== selectionEpoch || !user) return;
    applyProject(project);
    notice('workspace-status');
    $('code-input').focus();
  } catch (error) {
    if (epoch === authEpoch) handleError(error);
  } finally { if (epoch === authEpoch) setBusy(false); }
}
async function enterWorkspace(data) {
  const nextUser = requireUserShape(data);
  resetMemory({ keepRecovery: recoveryDraft?.userId === nextUser.id });
  user = nextUser;
  renderRecoveryControls();
  $('user-name').textContent = user.name || '试用用户';
  $('user-role').textContent = user.role === 'teacher' ? '教师试用账号' : '学生试用账号';
  $('login-view').hidden = true;
  $('workspace-view').hidden = false;
  document.querySelector('.skip-link').href = '#workspace-main';
  $('workspace-main').focus();
  setBusy(true);
  notice('workspace-status', '正在读取你的作品…');
  const epoch = authEpoch;
  try {
    await refreshProjects({ quiet: true });
    if (epoch === authEpoch && user) {
      if (recoveryDraft) await restoreDraft();
      else notice('workspace-status');
    }
  } catch (error) { if (epoch === authEpoch) handleError(error); }
  finally { if (epoch === authEpoch) setBusy(false); }
}

$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if ($('login-button').disabled) return;
  $('login-button').disabled = true;
  notice('login-status', '正在验证试用账号…');
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: $('email').value.trim(), password: $('password').value }) });
    $('password').value = '';
    await enterWorkspace(data);
  } catch (error) {
    $('password').value = '';
    handleError(error, 'login-status', error.status === 401 ? '邮箱或密码不正确，请检查后重试。' : '');
  } finally { $('login-button').disabled = false; }
});
$('logout-button').addEventListener('click', async () => {
  if (!confirmDiscard()) return;
  const logoutButton = $('logout-button');
  logoutButton.disabled = true;
  // Clear all account-scoped content immediately; server confirmation remains separate.
  showLogin('正在退出登录…');
  $('login-button').disabled = true;
  try {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    notice('login-status', '已退出登录。当前页面的账号与作品内容已清空。', 'success');
  } catch {
    notice('login-status', '当前页面已清空，但服务尚未确认退出。请关闭此页面，不要在共享设备上继续使用。', 'warning');
  } finally { logoutButton.disabled = false; $('login-button').disabled = false; }
});
$('retry-draft-recovery').addEventListener('click', () => { if (!busy) return restoreDraft(); });
for (const id of ['discard-login-draft', 'discard-workspace-draft']) $(id).addEventListener('click', () => {
  if (!recoveryDraft || !window.confirm('确定放弃本页暂存草稿吗？尚未保存的内容将无法恢复。')) return;
  recoveryDraft = null;
  renderRecoveryControls();
  notice(user ? 'workspace-status' : 'login-status', '本页暂存草稿已放弃，未向云端提交任何内容。');
});
$('refresh-list').addEventListener('click', async () => {
  if (busy) return;
  const epoch = authEpoch;
  setBusy(true);
  try { await refreshProjects(); }
  catch (error) { if (epoch === authEpoch) handleError(error); }
  finally { if (epoch === authEpoch) setBusy(false); }
});
$('code-input').addEventListener('input', () => {
  if (pendingSave && pendingSave.code !== $('code-input').value) pendingSave = null;
  updateDraftStatus();
});
$('reload-project').addEventListener('click', () => { if (currentProject) selectProject(currentProject.id, { force: true }); });
$('load-latest').addEventListener('click', () => { if (currentProject) selectProject(currentProject.id, { force: true }); });
$('save-button').addEventListener('click', async () => {
  if (busy || !currentProject || conflict) return;
  const code = $('code-input').value;
  const epoch = authEpoch;
  if (!pendingSave || pendingSave.projectId !== currentProject.id || pendingSave.code !== code || pendingSave.expectedVersion !== baseVersion) {
    pendingSave = { projectId: currentProject.id, code, blockState: null, expectedVersion: baseVersion, requestId: crypto.randomUUID() };
  }
  const attempt = pendingSave;
  setBusy(true);
  $('save-button').textContent = '正在保存…';
  notice('workspace-status', '正在保存。请暂时不要关闭页面。');
  try {
    const { projectId, ...payload } = attempt;
    const result = await api(`/api/projects/${encodeURIComponent(projectId)}/versions`, { method: 'POST', body: JSON.stringify(payload) });
    if (epoch !== authEpoch || !user || currentProject?.id !== projectId) return;
    if (!Number.isSafeInteger(result.versionNo) || result.versionNo < 1 || typeof result.changed !== 'boolean') throw new ApiError('保存结果格式异常。', 503);
    baseCode = attempt.code;
    baseVersion = result.versionNo;
    currentProject.latest_version = result.versionNo;
    const listProject = projects.find((project) => project.id === projectId);
    if (listProject) listProject.latest_version = result.versionNo;
    if (pendingSave === attempt) pendingSave = null;
    $('version-description').textContent = `当前已保存 v${baseVersion} · 只保存，不运行`;
    renderProjects();
    notice('workspace-status', result.changed ? `已保存 v${result.versionNo}。${dirty() ? '保存期间的新修改仍保留在编辑区，尚未保存。' : '下次登录后可以继续查看。'}` : `内容没有变化，仍为 v${result.versionNo}，未重复创建版本。`, 'success');
  } catch (error) {
    if (epoch !== authEpoch) return;
    if (error.status === 409) {
      conflict = true;
      pendingSave = null;
      $('conflict-notice').hidden = false;
      notice('workspace-status', '保存发生版本冲突。草稿没有丢失，请先查看版本记录，或确认后载入最新版本。', 'warning');
    } else if ([400, 413, 422].includes(error.status)) {
      pendingSave = null;
      handleError(error);
    } else {
      handleError(error, 'workspace-status', error.status === 401 || error.status === 403 ? '' : '尚未确认保存结果，草稿仍在。网络恢复后可点“重试本次保存”；系统会核对同一次请求，避免重复版本。');
    }
  } finally {
    if (epoch === authEpoch) { setBusy(false); updateDraftStatus(); }
  }
});

function setCreateBusy(value) {
  createBusy = value;
  for (const id of ['create-button', 'close-create', 'cancel-create', 'project-name', 'project-language']) $(id).disabled = value;
  $('create-button').textContent = value ? '正在创建…' : pendingCreate ? '重试创建' : '创建作品';
}
$('new-project').addEventListener('click', () => {
  if (busy || !confirmDiscard()) return;
  $('create-dialog').showModal();
  $('project-name').focus();
});
for (const id of ['close-create', 'cancel-create']) $(id).addEventListener('click', () => { if (!createBusy) $('create-dialog').close(); });
$('create-dialog').addEventListener('cancel', (event) => { if (createBusy) event.preventDefault(); });
$('create-dialog').addEventListener('close', () => { if (user) $('new-project').focus(); });
for (const id of ['project-name', 'project-language']) $(id).addEventListener('input', () => {
  pendingCreate = null;
  $('create-button').textContent = '创建作品';
});
$('create-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (createBusy || !user) return;
  const title = $('project-name').value.trim();
  const language = $('project-language').value;
  if (!title) { notice('create-status', '请给作品取一个名字。', 'error'); $('project-name').focus(); return; }
  if (!pendingCreate || pendingCreate.title !== title || pendingCreate.language !== language) pendingCreate = { title, language, requestId: crypto.randomUUID() };
  const attempt = pendingCreate;
  const epoch = authEpoch;
  setCreateBusy(true);
  notice('create-status', '正在创建你的作品…');
  try {
    const project = requireProjectShape(await api('/api/projects', { method: 'POST', body: JSON.stringify(attempt) }));
    if (epoch !== authEpoch || !user) return;
    pendingCreate = null;
    projects = [project, ...projects.filter((item) => item.id !== project.id)];
    applyProject(project);
    $('project-name').value = '';
    $('project-language').value = 'python';
    notice('create-status');
    $('create-dialog').close();
    $('code-input').focus();
    notice('workspace-status', '作品已创建。现在可以写代码，并保存第一个版本。', 'success');
  } catch (error) {
    if (epoch !== authEpoch) return;
    if ([400, 409, 413, 422].includes(error.status)) pendingCreate = null;
    handleError(error, 'create-status', [0, 502, 503, 504].includes(error.status) ? '创建结果尚未确认。请保持名称与语言不变，再点“重试创建”，避免重复创建。' : '');
  } finally { if (epoch === authEpoch) setCreateBusy(false); }
});

function renderHistoryCode() {
  const version = history.find((item) => String(item.version_no) === $('version-select').value);
  $('history-code').value = version?.code ?? '';
}
$('history-button').addEventListener('click', async () => {
  if (busy || !currentProject) return;
  const epoch = authEpoch;
  const projectId = currentProject.id;
  const requestEpoch = ++historyEpoch;
  history = [];
  $('version-select').replaceChildren();
  $('history-code').value = '';
  $('history-content').hidden = true;
  $('history-title').textContent = `${currentProject.title} · 版本记录`;
  notice('history-status', '正在读取版本…');
  $('history-dialog').showModal();
  $('close-history').focus();
  try {
    const data = await api(`/api/projects/${encodeURIComponent(projectId)}/versions`);
    if (epoch !== authEpoch || requestEpoch !== historyEpoch || !user || !$('history-dialog').open || currentProject?.id !== projectId) return;
    if (!Array.isArray(data) || data.some((item) => !Number.isSafeInteger(item.version_no) || typeof item.code !== 'string')) throw new ApiError('历史版本格式异常，请稍后再试。', 503);
    history = [...data].sort((a, b) => b.version_no - a.version_no);
    if (!history.length) { notice('history-status', '还没有保存过代码。回到作品，保存你的第一个版本。'); return; }
    for (const item of history) {
      const option = document.createElement('option');
      option.value = String(item.version_no);
      const date = item.created_at ? new Date(item.created_at) : null;
      option.textContent = `v${item.version_no}${date && !Number.isNaN(date.getTime()) ? ` · ${date.toLocaleString('zh-CN', { hour12: false })}` : ''}`;
      $('version-select').append(option);
    }
    renderHistoryCode();
    $('history-content').hidden = false;
    notice('history-status');
  } catch (error) { if (epoch === authEpoch && requestEpoch === historyEpoch) handleError(error, 'history-status'); }
});
$('version-select').addEventListener('change', renderHistoryCode);
$('close-history').addEventListener('click', () => $('history-dialog').close());
$('history-dialog').addEventListener('close', () => {
  historyEpoch += 1;
  history = [];
  $('version-select').replaceChildren();
  $('history-code').value = '';
  if (user) $('history-button').focus();
});
window.addEventListener('beforeunload', (event) => { if (hasUnsaved() || createBusy) { event.preventDefault(); event.returnValue = ''; } });

async function boot() {
  $('login-button').disabled = true;
  try { await enterWorkspace(await api('/api/auth/me')); }
  catch (error) {
    if (error.status === 401) notice('login-status');
    else handleError(error, 'login-status');
  } finally { $('login-button').disabled = false; }
}
boot();
