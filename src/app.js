const STORAGE_KEY = "codex-ai-turtle-state-v1";

const seedCode = `# Python 海龟绘图：画一个学习徽章
speed(8)
color("#4A90E2")
circle(72)
left(90)
forward(110)
right(135)
color("#F5A623")
forward(80)
left(90)
forward(80)
print("AI小海龟：作品运行完成！")`;

const fallbackAssignment = {
  id: "assign-turtle-badge",
  title: "海龟徽章创作",
  brief: "用 Python turtle 画出代表小组学习精神的徽章，并解释分解、抽象和调试过程。",
  dueAt: "2026-06-26T09:00:00.000Z",
  ctFocus: ["分解", "抽象", "算法", "调试"],
  rubric: [
    { label: "作品能运行并生成图形", weight: 30 },
    { label: "能解释核心步骤与变量", weight: 30 },
    { label: "至少一次自检和版本保存", weight: 20 },
    { label: "同伴或 AI 建议被采纳", weight: 20 }
  ]
};

const fallbackSubmissions = [
  {
    id: "sub-local-demo",
    assignmentId: "assign-turtle-badge",
    studentName: "林一诺",
    language: "python",
    status: "reviewed",
    score: 86,
    feedback: "图形完整，下一步请补充边界测试和同伴解释记录。",
    submittedAt: "2026-06-20T09:10:00.000Z",
    reviewedAt: "2026-06-20T09:18:00.000Z",
    selfCheck: { runs: 2, savedVersion: true, explanationReady: true, aiReviewed: true }
  }
];

const initialState = {
  route: "login",
  role: "student",
  currentLanguage: "python",
  code: seedCode,
  console: ["等待运行：选择语言后点击运行"],
  versions: [
    { id: "v1", label: "初始模板", language: "python", savedAt: "08:30", code: seedCode }
  ],
  selectedVersion: "v1",
  aiTab: "turtle",
  pairMode: "ai",
  cloudStatus: "已同步",
  teacherFilter: "all",
  assignment: fallbackAssignment,
  submissions: fallbackSubmissions,
  submissionStatus: "等待提交",
  sessionToken: "",
  sessionRole: "",
  currentUser: null,
  modelContracts: null,
  modelProvider: null,
  modelRuntime: null,
  deliveryOverview: null,
  deliveryOverviewLoaded: false,
  t3Package: null,
  t3PackageLoaded: false,
  t3Evidence: null,
  t3EvidenceLoaded: false,
  deliveryDossier: null,
  deliveryDossierLoaded: false,
  deliveryArtifacts: null,
  deliveryArtifactsLoaded: false,
  agenticQaReplay: null,
  agenticQaReplayLoaded: false,
  visualStoryboard: null,
  visualStoryboardLoaded: false,
  objectiveTraceability: null,
  objectiveTraceabilityLoaded: false,
  t3ApprovalPacket: null,
  t3ApprovalPacketLoaded: false,
  t3DryRunRehearsal: null,
  t3DryRunRehearsalLoaded: false,
  t3ApprovalRequestExport: null,
  t3ApprovalRequestExportLoaded: false,
  t3ApprovalIntegrity: null,
  t3ApprovalIntegrityLoaded: false,
  t3ApprovalLock: null,
  t3ApprovalLockLoaded: false,
  t3ApprovalVerifier: null,
  t3ApprovalVerifierLoaded: false,
  t3ApprovalCandidates: null,
  t3ApprovalCandidatesLoaded: false,
  t3ApprovalExecutionGate: null,
  t3ApprovalExecutionGateLoaded: false,
  t3CertificationEvidenceClosure: null,
  t3CertificationEvidenceClosureLoaded: false,
  finalDeliveryReadiness: null,
  finalDeliveryReadinessLoaded: false,
  deliveryReleaseCandidate: null,
  deliveryReleaseCandidateLoaded: false,
  t3CertificationNextActions: null,
  t3CertificationNextActionsLoaded: false,
  t3SingleLaneRunPackets: null,
  t3SingleLaneRunPacketsLoaded: false,
  t3RunPacketVerifier: null,
  t3RunPacketVerifierLoaded: false,
  deliveryReviewerCockpit: null,
  deliveryReviewerCockpitLoaded: false,
  deliveryLaunchGuide: null,
  deliveryLaunchGuideLoaded: false,
  deliveryConsistencySentinel: null,
  deliveryConsistencySentinelLoaded: false,
  finalAcceptanceMatrix: null,
  finalAcceptanceMatrixLoaded: false,
  certificationBlockerBoard: null,
  certificationBlockerBoardLoaded: false,
  userAcceptanceRehearsal: null,
  userAcceptanceRehearsalLoaded: false,
  deliveryEvidenceNavigator: null,
  deliveryEvidenceNavigatorLoaded: false,
  localDeliverySummary: null,
  localDeliverySummaryLoaded: false,
  localDeliveryHandoffBrief: null,
  localDeliveryHandoffBriefLoaded: false,
  localDeliveryQuickstart: null,
  localDeliveryQuickstartLoaded: false,
  localDeliveryVerificationSuite: null,
  localDeliveryVerificationSuiteLoaded: false,
  finalLocalHandoffCheckpoint: null,
  finalLocalHandoffCheckpointLoaded: false,
  t3EvidenceBundleTemplates: null,
  t3EvidenceBundleTemplatesLoaded: false,
  t3OperatorChecklist: null,
  t3OperatorChecklistLoaded: false,
  t3OperatorTranscriptValidator: null,
  t3OperatorTranscriptValidatorLoaded: false,
  exportPreviewText: "等待导出...",
  lastRunJob: null,
  projects: [
    { title: "海龟徽章", language: "Python", progress: 78, ct: "分解 / 调试", status: "进行中" },
    { title: "最大公约数", language: "C++", progress: 46, ct: "算法", status: "待指导" },
    { title: "温度换算器", language: "C", progress: 92, ct: "抽象", status: "已提交" }
  ],
  aiLogs: [
    { student: "林一诺", tutor: "小龟导师", tag: "分解", message: "先把输入、处理、输出分开写出来。", risk: "low" },
    { student: "周予安", tutor: "智伴导师", tag: "验证优化", message: "建议增加边界值 0 和最大值测试。", risk: "low" },
    { student: "陈嘉树", tutor: "智伴导师", tag: "依赖预警", message: "连续请求完整答案，已提示改为局部思路。", risk: "mid" }
  ],
  collabEvents: [
    "08:41 Driver 写入 turtle.circle",
    "08:43 Navigator 标注缺少边界测试",
    "08:46 AI 提醒先解释思路再采纳建议"
  ],
  collabRoom: null,
  collabPresence: [],
  collabProtocolStatus: "房间待连接",
  collabLiveStatus: "HTTP replay fallback",
  apiOnline: false
};

let state = loadState();
let collabSocket = null;
let collabSocketRoom = "";
let collabSocketJoined = false;
const initialRoute = location.hash.replace("#", "");
if (["student", "teacher", "research"].includes(initialRoute)) {
  state.route = initialRoute;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...initialState, ...JSON.parse(raw) } : { ...initialState };
  } catch {
    return { ...initialState };
  }
}

function saveState() {
  const { exportPreviewText, ...persistableState } = state;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistableState));
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function setState(patch) {
  state = { ...state, ...patch };
  saveState();
  render();
}

async function apiRequest(path, options = {}) {
  if (location.protocol === "file:") throw new Error("API unavailable from file protocol");
  const { skipSession, headers = {}, ...fetchOptions } = options;
  const sessionHeaders = state.sessionToken && !skipSession ? { "X-CodeX-Session": state.sessionToken } : {};
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...sessionHeaders, ...headers },
    ...fetchOptions
  });
  if (!response.ok) throw new Error(`API ${path} failed: ${response.status}`);
  const payload = await response.json();
  if (!payload.ok) throw new Error(payload.data?.error || `API ${path} returned not ok`);
  return payload.data;
}

async function bootstrapFromApi() {
  try {
    const data = await apiRequest("/api/bootstrap");
    state = {
      ...state,
      apiOnline: true,
      versions: data.versions?.length ? data.versions : state.versions,
      assignment: data.assignment || state.assignment,
      submissions: data.submissions?.length ? data.submissions : state.submissions,
      collabRoom: data.collabRoom || state.collabRoom,
      collabPresence: data.collabRoom?.presence || state.collabPresence,
      collabProtocolStatus: data.collabRoom ? `房间 ${data.collabRoom.id} 已同步` : state.collabProtocolStatus,
      collabEvents: data.collabEvents?.map((event) => `${new Date(event.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} ${event.message}`) || state.collabEvents,
      projects: data.teacher?.projects || state.projects,
      cloudStatus: "API已连接"
    };
    saveState();
    render();
  } catch {
    state.apiOnline = false;
    saveState();
  }
}

async function ensureSession(role) {
  if (state.sessionToken && state.sessionRole === role) return state.sessionToken;
  const data = await apiRequest("/api/auth/login", {
    method: "POST",
    skipSession: true,
    body: JSON.stringify({ role })
  });
  state.sessionToken = data.sessionToken;
  state.sessionRole = role;
  state.currentUser = data.user;
  saveState();
  return data.sessionToken;
}

async function loadModelContractsFromApi() {
  try {
    const data = await apiRequest("/api/ai/model-contracts", { skipSession: true });
    state.modelContracts = data;
    saveState();
    render();
  } catch {
    state.modelContracts = null;
    saveState();
  }
}

async function loadModelProviderStatusFromApi() {
  try {
    const data = await apiRequest("/api/ai/provider/status", { skipSession: true });
    state.modelProvider = data;
    saveState();
    render();
  } catch {
    state.modelProvider = null;
    saveState();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function icon(name) {
  const icons = {
    run: "M8 5v14l11-7z",
    save: "M5 5h14v14H5z M8 5v5h8V5 M8 17h8",
    upload: "M12 19V7 M7 12l5-5 5 5 M5 21h14",
    download: "M12 5v12 M7 12l5 5 5-5 M5 21h14",
    class: "M4 6h16v12H4z M8 22h8 M12 18v4",
    chat: "M4 5h16v11H8l-4 4z",
    chart: "M5 19V9 M12 19V5 M19 19v-8",
    users: "M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21c1-4 4-6 8-6 M17 11a3 3 0 1 0 0-6 M14 21c.7-2.8 2.6-4.5 6-4.5"
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.chat}"/></svg>`;
}

function render() {
  const app = document.querySelector("#app");
  app.innerHTML = `
    <div class="app-shell ${state.route === "login" ? "login-mode" : ""}">
      <div class="surface-noise" aria-hidden="true"></div>
      ${state.route === "login" ? renderLogin() : renderProduct()}
    </div>
  `;
  bindEvents();
  if (state.route !== "login") requestAnimationFrame(drawPreview);
}

function renderLogin() {
  return `
    <main class="login-screen">
      <section class="login-panel glass">
        <nav class="login-nav">
          <div class="brand">
            <img src="./assets/icon.svg" alt="" />
            <span>CodeX / AI小海龟</span>
          </div>
          <div class="role-switch" role="tablist" aria-label="选择登录角色">
            <button class="${state.role === "student" ? "active" : ""}" data-role="student">学生入口</button>
            <button class="${state.role === "teacher" ? "active" : ""}" data-role="teacher">教师入口</button>
          </div>
        </nav>
        <div class="login-grid">
          <div class="login-copy">
            <p class="login-count">[ 01 / AI PAIR ]</p>
            <h1>让每一次编程卡顿，都变成计算思维生长点</h1>
            <p>三语言 IDE、双 AI 导师、结对协作与教师研究仪表盘，为初中信息科技课堂打造可部署的人机协同学习环境。</p>
            <div class="login-actions">
              <button class="primary" data-enter="${state.role}">进入${state.role === "student" ? "学生端" : "教师端"}</button>
              <button class="secondary" data-enter="demo">查看演示课堂</button>
            </div>
          </div>
          <div class="pixel-hero" aria-label="3D AI小海龟编程终端">
            <figure class="hero-asset-shell">
              <img class="hero-asset" src="./assets/codex-glass-terminal.svg" alt="" loading="eager" />
              <figcaption>AI Pair Lab</figcaption>
            </figure>
            <div class="hero-proof-rail" data-visual-fidelity aria-label="CodeX classroom language modes">
              <span>Python</span>
              <span>C++</span>
              <span>C</span>
            </div>
            <div class="growth-card">
              <span>计算思维成长</span>
              <strong>132%</strong>
            </div>
          </div>
        </div>
      </section>
    </main>
  `;
}

function renderProduct() {
  return `
    <header class="topbar">
      <div class="brand">
        <img src="./assets/icon.svg" alt="" />
        <span>CodeX / AI小海龟</span>
      </div>
      <nav aria-label="主导航">
        <button class="${state.route === "student" ? "active" : ""}" data-route="student">学生工作台</button>
        <button class="${state.route === "teacher" ? "active" : ""}" data-route="teacher">教师后端</button>
        <button class="${state.route === "research" ? "active" : ""}" data-route="research">研究数据</button>
      </nav>
      <div class="status-pill">
        <span class="pulse"></span>${state.apiOnline ? "API已连接" : state.cloudStatus}
      </div>
    </header>
    ${state.route === "teacher" ? renderTeacher() : state.route === "research" ? renderResearch() : renderStudent()}
  `;
}

function renderStudent() {
  return `
    <main class="workspace student-workspace">
      ${renderCoreModuleDock()}
      <aside class="left-rail glass">
        <section>
          <h2>今日任务</h2>
          ${tile("Python海龟创作", "画出代表小组的学习徽章", "78%", "accent")}
          ${tile("C++算法挑战", "用欧几里得算法解决最大公约数", "46%", "blue")}
          ${tile("C基础练习", "输入输出与条件判断", "92%", "mint")}
        </section>
        <section>
          <h2>结对房间</h2>
          <div class="pair-card">
            <div>
              <strong>${state.pairMode === "ai" ? "学生 × AI" : "学生 × 学生"}</strong>
              <span>WebSocket 协作 · Driver 08:40 后轮换</span>
            </div>
            <button data-toggle-pair>${state.pairMode === "ai" ? "切换同伴" : "切换AI"}</button>
          </div>
          ${renderPairRoleBoard()}
          <div class="offline-badge">PWA 离线基础支持 · 本地缓存待同步</div>
          ${renderCollabProtocol()}
          <ol class="event-list">
            ${state.collabEvents.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ol>
        </section>
      </aside>
      <section class="ide-panel glass">
        <div class="visual-depth-grid" data-student-depth aria-hidden="true">
          <i></i><i></i><i></i><i></i>
        </div>
        <div class="ide-toolbar">
          <div class="language-tabs" role="tablist" aria-label="语言模式">
            ${["python", "cpp", "c"].map((lang) => `<button class="${state.currentLanguage === lang ? "active" : ""}" data-language="${lang}">${langLabel(lang)}</button>`).join("")}
          </div>
          <div class="toolbar-actions">
            <button data-run>${icon("run")}运行</button>
            <button data-save>${icon("save")}保存</button>
            <button data-download>${icon("download")}下载</button>
            <label class="file-button">${icon("upload")}上传<input type="file" accept=".py,.cpp,.c,.json,.txt" data-upload /></label>
          </div>
        </div>
        <div class="editor-grid">
          <div class="editor-wrap">
            <div class="editor-head"><span></span><span></span><span></span><strong>${langLabel(state.currentLanguage)} / Monaco 教育主题</strong></div>
            <textarea spellcheck="false" data-code aria-label="代码编辑器">${escapeHtml(state.code)}</textarea>
          </div>
          <div class="preview-wrap">
            <div class="preview-head">
              <strong>运行预览</strong>
              <span>Canvas + Console</span>
            </div>
            <canvas id="turtle-canvas" width="520" height="360"></canvas>
            <div class="console">
              ${state.console.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
            </div>
          </div>
        </div>
        <div class="version-row">
          <strong>云端版本历史</strong>
          ${state.versions.slice(-4).map((version) => `<button data-version="${version.id}" class="${state.selectedVersion === version.id ? "active" : ""}">${version.label} · ${version.savedAt}</button>`).join("")}
        </div>
        ${renderThinkingTracePanel()}
      </section>
      <aside class="mentor-panel glass">
        <div class="mentor-tabs">
          <button class="${state.aiTab === "turtle" ? "active" : ""}" data-ai-tab="turtle">小龟导师</button>
          <button class="${state.aiTab === "reviewer" ? "active" : ""}" data-ai-tab="reviewer">智伴导师</button>
        </div>
        ${state.aiTab === "turtle" ? renderTurtleTutor() : renderReviewerTutor()}
        ${renderAgentDialogWindow()}
      </aside>
    </main>
  `;
}

function renderCoreModuleDock() {
  const modules = [
    {
      className: "pair",
      label: "结对编程协作区",
      title: "Driver / Observer 实时切换",
      copy: "代码编辑、运行预览、同伴协议与角色轮换放在同一工作面，学生不用离开创作流。",
      meta: "当前模式 · " + (state.pairMode === "ai" ? "学生 × AI" : "学生 × 学生")
    },
    {
      className: "agent",
      label: "智能体对话窗",
      title: "小龟导师 + 智伴导师",
      copy: "围绕分解、调试、反思给出下一步提示，避免直接替学生完成答案。",
      meta: "本轮求助 · 3 次"
    },
    {
      className: "trace",
      label: "计算思维过程记录",
      title: "行为、求助、路径自动沉淀",
      copy: "把运行、保存、提问、角色轮换串成可复盘的学习证据链。",
      meta: "证据链 · 5 节点"
    },
    {
      className: "teacher",
      label: "教师管理后台",
      title: "班级、任务、学情一屏掌握",
      copy: "前端先展示班级管理、任务下发和学习数据视图，后端接口后续接入。",
      meta: "状态 · 前端预览"
    }
  ];

  return `
    <section class="core-module-dock glass" data-core-module-dock aria-label="平台核心功能界面">
      <div class="core-module-head">
        <div>
          <span>平台核心功能界面</span>
          <h1>把结对编程、AI 引导和过程证据放到同一张课堂桌面</h1>
        </div>
        <button data-route="teacher">${icon("chart")}教师视图</button>
      </div>
      <div class="core-module-grid">
        ${modules.map((item) => `
          <article class="core-module-card ${item.className}">
            <span>${item.label}</span>
            <strong>${item.title}</strong>
            <p>${item.copy}</p>
            <small>${item.meta}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderPairRoleBoard() {
  return `
    <div class="pair-role-board" data-pair-role-board aria-label="驾驶员观察员角色切换">
      <article class="role-card driver">
        <span>驾驶员 Driver</span>
        <strong>林一</strong>
        <small>正在编辑第 18 行 · 08:40 后轮换</small>
      </article>
      <article class="role-card observer">
        <span>观察员 Observer</span>
        <strong>${state.pairMode === "ai" ? "小龟导师" : "周然"}</strong>
        <small>负责提问、检查边界、记录思路</small>
      </article>
      <div class="role-flow">
        <span>编辑</span>
        <span>提问</span>
        <span>轮换</span>
      </div>
    </div>
  `;
}

function renderCollabProtocol() {
  const room = state.collabRoom;
  const turn = room?.turn;
  const presence = (state.collabPresence || room?.presence || []).slice(0, 4);
  return `
    <div class="collab-room" data-collab-room>
      <div class="collab-room-head">
        <span>协作协议</span>
        <strong>${room?.id || "pair-demo"}</strong>
      </div>
      <p>${escapeHtml(state.collabProtocolStatus)}</p>
      <div class="submission-proof">
        <span>Driver ${escapeHtml(turn?.driver || "student-linyi")}</span>
        <span>Navigator ${escapeHtml(turn?.navigator || "ai-turtle")}</span>
        <span>Replay ${room?.events?.length || state.collabEvents.length}</span>
        <span data-collab-live>${escapeHtml(state.collabLiveStatus)}</span>
      </div>
      <div class="presence-list">
        ${presence.map((item) => `<span>${escapeHtml(item.name || item.actor)} · ${escapeHtml(item.role || "member")}</span>`).join("")}
      </div>
      <div class="submission-actions">
        <button data-join-room>加入房间</button>
        <button data-rotate-role>轮换角色</button>
      </div>
    </div>
  `;
}

function renderTurtleTutor() {
  return `
    <div class="mascot-card turtle">
      <img class="mascot-art" src="./assets/ai-turtle-mascot.svg" alt="" aria-hidden="true" loading="lazy" />
      <h2>小龟导师 · Driver</h2>
      <p>我会先帮你把任务拆成输入、处理、输出，再鼓励你自己写出第一版。</p>
    </div>
    <div class="hint-card">
      <strong>当前提示</strong>
      <p>先观察代码里有哪些“动作命令”，再思考它们如何组合成图形。你能用 3 句话解释这段程序吗？</p>
      <button data-ai-suggest="decompose">生成分解提示</button>
    </div>
    <div class="ct-tags">
      <span>分解</span><span>抽象</span><span>算法</span>
    </div>
  `;
}

function renderReviewerTutor() {
  return `
    <div class="mascot-card reviewer">
      <img class="mascot-art" src="./assets/ai-reviewer-mascot.svg" alt="" aria-hidden="true" loading="lazy" />
      <h2>智伴导师 · Reviewer</h2>
      <p>我会检查边界条件、运行结果和代码清晰度，只给你下一步可操作建议。</p>
    </div>
    <div class="hint-card">
      <strong>审查清单</strong>
      <ul>
        <li>是否至少运行 2 次验证？</li>
        <li>是否能解释每个循环或转向？</li>
        <li>是否保存了当前版本？</li>
      </ul>
      <button data-ai-suggest="review">生成审查建议</button>
    </div>
    <div class="ct-tags">
      <span>调试/评估</span><span>迁移</span><span>反思</span>
    </div>
  `;
}

function renderAgentDialogWindow() {
  return `
    <section class="agent-dialog-window" data-agent-dialog-window aria-label="智能体对话窗">
      <div class="dialog-head">
        <div>
          <span>智能体对话窗</span>
          <strong>实时编程问答与引导</strong>
        </div>
        <small>LLM 后端待接入</small>
      </div>
      <div class="dialog-stack">
        <p class="dialog-bubble student">我不知道循环次数应该怎么确定。</p>
        <p class="dialog-bubble agent">先把图形拆成“边数”和“每次转角”。你能先写出一条边吗？</p>
        <p class="dialog-bubble student">那我先用 for 循环画 4 条边。</p>
      </div>
      <div class="dialog-metrics">
        <span>求助次数 <strong>3</strong></span>
        <span>提示类型 <strong>分解</strong></span>
        <span>风险 <strong>低</strong></span>
      </div>
    </section>
  `;
}

function renderThinkingTracePanel() {
  return `
    <section class="thinking-trace-panel" data-thinking-trace data-ct-process-record aria-label="计算思维过程记录">
      <div class="trace-copy">
        <span>计算思维过程记录</span>
        <strong>行为数据、求助次数、问题解决路径</strong>
        <p>前端先把学生的关键学习动作可视化，后续由事件采集服务写入真实学习记录。</p>
      </div>
      <ol class="trace-path">
        <li class="trace-step done"><span>1</span><strong>拆解任务</strong><small>输入 / 处理 / 输出</small></li>
        <li class="trace-step done"><span>2</span><strong>首轮运行</strong><small>Console 反馈</small></li>
        <li class="trace-step active"><span>3</span><strong>AI 求助</strong><small>第 3 次提示</small></li>
        <li class="trace-step"><span>4</span><strong>同伴轮换</strong><small>Driver 交接</small></li>
        <li class="trace-step"><span>5</span><strong>反思提交</strong><small>路径复盘</small></li>
      </ol>
      <div class="trace-metrics">
        <span>运行 6 次</span>
        <span>保存 4 版</span>
        <span>求助 3 次</span>
      </div>
    </section>
  `;
}

function renderTeacher() {
  const projects = state.projects.filter((item) => state.teacherFilter === "all" || item.status === state.teacherFilter);
  return `
    <main class="teacher-dashboard">
      <section class="teacher-hero glass">
        <div>
          <p>学院预警系统 / CodeX Classroom</p>
          <h1>李深老师</h1>
          <span>初二 3 班 · 信息科技 · 人机结对实验课</span>
        </div>
        <div class="teacher-avatar"></div>
        <div class="teacher-kpis">
          ${kpi("在线学生", "31/36", "+6")}
          ${kpi("AI有效提示", "128", "低风险")}
          ${kpi("待介入", "8", "中优先级")}
        </div>
      </section>
      ${renderTeacherCommandCenter()}
      <section class="dashboard-grid">
        <div class="glass chart-card">
          <h2>计算思维六维画像</h2>
          <div class="radar" aria-label="计算思维雷达图">
            <span style="--x:50%;--y:8%">抽象</span>
            <span style="--x:88%;--y:34%">分解</span>
            <span style="--x:78%;--y:82%">建模</span>
            <span style="--x:22%;--y:82%">算法</span>
            <span style="--x:12%;--y:34%">调试</span>
            <div></div>
          </div>
        </div>
        <div class="glass chart-card">
          <h2>任务完成漏斗</h2>
          <div class="funnel">
            <span style="--w:92%">进入任务 36</span>
            <span style="--w:78%">完成首轮运行 31</span>
            <span style="--w:62%">提交反思 25</span>
            <span style="--w:42%">迁移挑战 17</span>
          </div>
        </div>
        <div class="glass table-card">
          <div class="table-head">
            <h2>学生作品实时查看</h2>
            <div>
              <button class="${state.teacherFilter === "all" ? "active" : ""}" data-filter="all">全部</button>
              <button class="${state.teacherFilter === "待指导" ? "active" : ""}" data-filter="待指导">待指导</button>
              <button class="${state.teacherFilter === "已提交" ? "active" : ""}" data-filter="已提交">已提交</button>
            </div>
          </div>
          <table>
            <thead><tr><th>作品</th><th>语言</th><th>进度</th><th>标签</th><th>状态</th></tr></thead>
            <tbody>
              ${projects.map((item) => `<tr><td>${item.title}</td><td>${item.language}</td><td><span class="bar"><i style="width:${item.progress}%"></i></span>${item.progress}%</td><td>${item.ct}</td><td>${item.status}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
        <div class="glass log-card">
          <h2>AI 互动日志</h2>
          ${state.aiLogs.map((log) => `<article class="${log.risk}"><strong>${log.student} · ${log.tutor}</strong><span>${log.tag}</span><p>${log.message}</p></article>`).join("")}
        </div>
      </section>
    </main>
  `;
}

function renderTeacherCommandCenter() {
  const cards = [
    ["班级管理", "初二 3 班 · 36 人", "分组、在线状态、角色轮换记录前端已就位"],
    ["任务下发", "Python 海龟徽章", "任务卡、截止时间、提交入口后续接 API"],
    ["学情数据查看", "8 人待介入", "将聚合行为事件、AI 求助和作品进度"],
    ["后端路线", "接口待实现", "先接身份/班级，再接协作事件与 AI 会话"]
  ];

  return `
    <section class="teacher-command-center" data-teacher-command-center aria-label="教师管理后台核心功能">
      ${cards.map(([title, value, copy]) => `
        <article class="teacher-command-card">
          <span>${title}</span>
          <strong>${value}</strong>
          <p>${copy}</p>
          <small class="backend-roadmap-badge">前端预览 · 后端待接入</small>
        </article>
      `).join("")}
    </section>
  `;
}

function renderResearch() {
  return `
    <main class="research-page">
      <section class="glass research-brief" data-research-proof>
        <h1>课题研究数据中台</h1>
        <p>面向“结对编程智能体培养初中生计算思维”的过程性证据采集、清洗、编码与导出。</p>
        <div class="research-grid">
          ${kpi("行为事件", "12,480", "Yjs / Run / AI")}
          ${kpi("有效作品", "286", "版本可追溯")}
          ${kpi("可导出报告", "18", "班级/学生/课题")}
        </div>
      </section>
      ${renderDeliveryOverview()}
      ${renderT3CertificationPackage()}
      ${renderT3EvidenceIntake()}
      ${renderDeliveryHandoffDossier()}
      ${renderDeliveryArtifactIndex()}
      ${renderAgenticQaReplay()}
      ${renderVisualStoryboard()}
      ${renderObjectiveTraceability()}
      ${renderT3ApprovalPacket()}
      ${renderT3DryRunRehearsal()}
      ${renderT3ApprovalRequestExport()}
      ${renderT3ApprovalIntegrity()}
      ${renderT3ApprovalLock()}
      ${renderT3ApprovalVerifier()}
      ${renderT3ApprovalCandidates()}
      ${renderT3ApprovalExecutionGate()}
      ${renderT3CertificationEvidenceClosure()}
      ${renderFinalDeliveryReadiness()}
      ${renderDeliveryReleaseCandidate()}
      ${renderT3CertificationNextActions()}
      ${renderT3SingleLaneRunPackets()}
      ${renderT3RunPacketVerifier()}
      ${renderDeliveryReviewerCockpit()}
      ${renderDeliveryLaunchGuide()}
      ${renderDeliveryConsistencySentinel()}
      ${renderFinalAcceptanceMatrix()}
      ${renderCertificationBlockerBoard()}
      ${renderUserAcceptanceRehearsal()}
      ${renderDeliveryEvidenceNavigator()}
      ${renderLocalDeliverySummary()}
      ${renderLocalDeliveryHandoffBrief()}
      ${renderLocalDeliveryQuickstart()}
      ${renderLocalDeliveryVerificationSuite()}
      ${renderFinalLocalHandoffCheckpoint()}
      ${renderT3EvidenceBundleTemplates()}
      ${renderT3OperatorChecklist()}
      ${renderT3OperatorTranscriptValidator()}
      <section class="glass export-panel">
        <h2>导出包</h2>
        <button data-export-report>导出班级研究报告 JSON</button>
        <pre id="export-preview">${escapeHtml(state.exportPreviewText || "等待导出...")}</pre>
      </section>
    </main>
  `;
}

function tile(title, subtitle, progress, tone) {
  return `
    <article class="learning-tile ${tone}">
      <span>${progress}</span>
      <strong>${title}</strong>
      <p>${subtitle}</p>
    </article>
  `;
}

function kpi(label, value, note) {
  return `
    <article class="kpi">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </article>
  `;
}

function renderDeliveryOverview() {
  const overview = state.deliveryOverview;
  const gaps = overview?.openCertificationGaps || [];
  const surfaces = overview?.readinessSurfaces || [];
  const localLabel = overview?.localEvidencePassed ? "PASS" : overview?.status === "offline" ? "OFFLINE" : "WAIT";
  const finalComplete = overview?.finalGoalComplete === true;
  return `
    <section class="glass delivery-overview" data-delivery-overview data-final-goal-complete="${finalComplete ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Delivery certification overview</span>
          <h2>${escapeHtml(overview?.status || "loading")}</h2>
        </div>
        <strong data-delivery-status>${finalComplete ? "COMPLETE" : "NOT FINAL"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Local evidence", localLabel, `${overview?.completionAudit?.provedLocalRequirementCount || 0}/${overview?.completionAudit?.localRequirementCount || 0}`)}
        ${deliveryMetric("Open T3 gaps", String(gaps.length), "runtime / database / provider")}
        ${deliveryMetric("Readiness lanes", String(surfaces.length), "sandbox / model / DB")}
      </div>
      <div class="delivery-surfaces">
        ${surfaces.map((surface) => `
          <article>
            <span>${escapeHtml(surface.id)}</span>
            <strong>${surface.certified ? "certified" : "not-certified"}</strong>
            <small>${escapeHtml(surface.status)} / missing ${surface.missingControlCount}</small>
          </article>
        `).join("") || "<article><span>overview</span><strong>loading</strong><small>waiting for local API</small></article>"}
      </div>
      <div class="delivery-gaps" data-certification-gap-count="${gaps.length}">
        ${gaps.map((gap) => `<span>${escapeHtml(gap.id)} / ${escapeHtml(gap.riskTier || "T3")}</span>`).join("") || "<span>loading certification gaps</span>"}
      </div>
    </section>
  `;
}

function deliveryMetric(label, value, note) {
  return `
    <div class="delivery-metric">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${note}</small>
    </div>
  `;
}

function renderT3CertificationPackage() {
  const pack = state.t3Package;
  const lanes = pack?.lanePackages || [];
  const summary = pack?.packageSummary || {};
  return `
    <section class="glass delivery-package" data-t3-package data-t3-execution-allowed="${pack?.executionAllowed === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>T3 certification package</span>
          <h2>${escapeHtml(pack?.status || "loading")}</h2>
        </div>
        <strong data-t3-package-status>${pack?.executionAllowed ? "RUN ENABLED" : "PACKAGE ONLY"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Lane packages", String(summary.laneCount || lanes.length || 0), "runtime / database / provider")}
        ${deliveryMetric("Blocked lanes", String(summary.blockedLaneCount ?? lanes.length ?? 0), "approval-first")}
        ${deliveryMetric("Evidence items", String(summary.evidenceRequirementCount || 0), "runtime proof")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${lanes.map((lane) => `
          <article>
            <span>${escapeHtml(lane.id)}</span>
            <strong>${lane.allowedToRun ? "allowed" : "blocked"}</strong>
            <small>${escapeHtml(lane.targetGap || "T3")} / rollback ${lane.rollbackPlan?.length || 0}</small>
          </article>
        `).join("") || "<article><span>package</span><strong>loading</strong><small>waiting for local API</small></article>"}
      </div>
      <div class="delivery-gaps">
        ${(pack?.executionOrder || ["approval", "preflight", "rollback"]).slice(0, 3).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
      </div>
    </section>
  `;
}

function renderT3EvidenceIntake() {
  const evidence = state.t3Evidence;
  const counts = evidence?.laneCounts || {};
  return `
    <section class="glass delivery-evidence" data-t3-evidence data-t3-certification-state-changed="${evidence?.certificationStateChanged === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>T3 evidence intake</span>
          <h2>${escapeHtml(evidence?.status || "loading")}</h2>
        </div>
        <strong data-t3-evidence-status>${evidence?.certificationStateChanged ? "STATE CHANGED" : "CANDIDATE ONLY"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Candidates", String(evidence?.candidateCount || 0), "local intake")}
        ${deliveryMetric("Accepted", String(evidence?.acceptedCandidateCount || 0), "candidate evidence")}
        ${deliveryMetric("Certified", evidence?.certificationStateChanged ? "changed" : "unchanged", "guarded")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${["runtime", "database", "provider"].map((lane) => `
          <article>
            <span>${lane}</span>
            <strong>${counts[lane] || 0}</strong>
            <small>candidate evidence rows</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDeliveryHandoffDossier() {
  const dossier = state.deliveryDossier;
  return `
    <section class="glass delivery-dossier" data-delivery-dossier data-dossier-final-goal-complete="${dossier?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Delivery handoff dossier</span>
          <h2>${escapeHtml(dossier?.status || "loading")}</h2>
        </div>
        <strong data-delivery-dossier-status>${dossier?.finalGoalComplete ? "COMPLETE" : "OPEN GAPS"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Local rows", String(dossier?.localRequirementCount || 0), `${dossier?.provedLocalRequirementCount || 0} proved`)}
        ${deliveryMetric("Artifacts", String(dossier?.artifactCount || 0), "handoff bundle")}
        ${deliveryMetric("Open gaps", String(dossier?.openCertificationGapCount || 0), "T3 approval")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(dossier?.sections || ["agentic-qa", "t3-package", "open-gaps"]).slice(0, 3).map((section) => `
          <article>
            <span>${escapeHtml(section)}</span>
            <strong>${dossier?.localEvidencePassed ? "ready" : "waiting"}</strong>
            <small>handoff section</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDeliveryArtifactIndex() {
  const artifacts = state.deliveryArtifacts;
  const topArtifacts = (artifacts?.artifactInventory || []).slice(0, 3);
  return `
    <section class="glass delivery-artifacts" data-delivery-artifacts data-artifact-content-returned="${artifacts?.contentReturned === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Delivery artifact index</span>
          <h2>${escapeHtml(artifacts?.status || "loading")}</h2>
        </div>
        <strong data-delivery-artifacts-status>${artifacts?.contentReturned ? "CONTENT" : "METADATA ONLY"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Artifacts", String(artifacts?.artifactCount || 0), `${artifacts?.readyArtifactCount || 0} ready`)}
        ${deliveryMetric("Hashes", String(artifacts?.hashCount || 0), "sha-256")}
        ${deliveryMetric("Missing", String(artifacts?.missingArtifactCount || 0), "required files")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(topArtifacts.length ? topArtifacts : [
          { category: "qa-artifact", path: "waiting", sizeBytes: 0 },
          { category: "contract", path: "waiting", sizeBytes: 0 },
          { category: "runtime-helper", path: "waiting", sizeBytes: 0 }
        ]).map((artifact) => `
          <article>
            <span>${escapeHtml(artifact.category || "artifact")}</span>
            <strong>${artifact.exists === false ? "missing" : `${Number(artifact.sizeBytes || 0)}b`}</strong>
            <small>${escapeHtml(artifact.path || "artifact")}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderAgenticQaReplay() {
  const replay = state.agenticQaReplay;
  const rounds = (replay?.replayRounds || []).slice(0, 3);
  return `
    <section class="glass agentic-qa-replay" data-agentic-qa-replay data-agentic-replay-only="${replay?.replayOnly === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Agentic QA replay</span>
          <h2>${escapeHtml(replay?.status || "loading")}</h2>
        </div>
        <strong data-agentic-qa-replay-status>${replay?.replayOnly ? "REPLAY ONLY" : "WAITING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Agents", String(replay?.agentCount || 0), `${replay?.provedCheckCount || 0} proved`)}
        ${deliveryMetric("Replay rounds", String(replay?.clickRoundCount || 0), replay?.finalValueWaitsPassed ? "final values" : "waiting")}
        ${deliveryMetric("Screenshot hashes", String(replay?.screenshotHashCount || 0), (replay?.replayHash || "pending").slice(0, 10))}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(rounds.length ? rounds : [
          { round: "waiting", terminalRunJobCount: 0, reviewedCount: 0, visualFidelity: false },
          { round: "waiting", terminalRunJobCount: 0, reviewedCount: 0, visualFidelity: false },
          { round: "waiting", terminalRunJobCount: 0, reviewedCount: 0, visualFidelity: false }
        ]).map((round) => `
          <article>
            <span>round ${escapeHtml(String(round.round ?? "waiting"))}</span>
            <strong>${Number(round.terminalRunJobCount || 0)} jobs / ${Number(round.reviewedCount || 0)} reviews</strong>
            <small>${round.visualFidelity ? "visual fidelity passed" : "waiting for replay evidence"}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderVisualStoryboard() {
  const storyboard = state.visualStoryboard;
  const frames = (storyboard?.frames || []).slice(0, 5);
  return `
    <section class="glass visual-storyboard" data-visual-storyboard data-visual-storyboard-only="${storyboard?.storyboardOnly === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Visual QA storyboard</span>
          <h2>${escapeHtml(storyboard?.status || "loading")}</h2>
        </div>
        <strong data-visual-storyboard-status>${storyboard?.visualChecksPassed ? "VISUAL PASS" : "WAITING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Surfaces", String(storyboard?.surfaceCount || 0), `${storyboard?.readySurfaceCount || 0} ready`)}
        ${deliveryMetric("Replay rounds", String(storyboard?.replayRoundCount || 0), "student / teacher / research")}
        ${deliveryMetric("Screenshot hashes", String(storyboard?.screenshotHashCount || 0), (storyboard?.storyboardHash || "pending").slice(0, 10))}
      </div>
      <div class="storyboard-grid">
        ${(frames.length ? frames : [
          { id: "login", role: "entry", title: "loading", caption: "waiting", imageSrc: "", sha256: "" },
          { id: "student", role: "student", title: "loading", caption: "waiting", imageSrc: "", sha256: "" },
          { id: "teacher", role: "teacher", title: "loading", caption: "waiting", imageSrc: "", sha256: "" }
        ]).map((frame) => `
          <article class="storyboard-frame">
            ${frame.imageSrc ? `<img src="${escapeHtml(frame.imageSrc)}" alt="${escapeHtml(frame.title || frame.id)}">` : `<div class="storyboard-placeholder"></div>`}
            <div>
              <span>${escapeHtml(frame.role || "surface")}</span>
              <strong>${escapeHtml(frame.title || frame.id || "waiting")}</strong>
              <small>${escapeHtml(frame.caption || "waiting for visual evidence")}</small>
              <code>${escapeHtml((frame.sha256 || "pending").slice(0, 12))}</code>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderObjectiveTraceability() {
  const trace = state.objectiveTraceability;
  const rows = trace?.matrix || [];
  const previewRows = rows.slice(0, 3);
  return `
    <section class="glass objective-traceability" data-objective-traceability data-objective-final-goal-complete="${trace?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Objective traceability</span>
          <h2>${escapeHtml(trace?.status || "loading")}</h2>
        </div>
        <strong data-objective-traceability-status>${trace?.finalGoalComplete ? "COMPLETE" : "OPEN T3"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Requirements", String(trace?.requirementCount || 0), "mapped")}
        ${deliveryMetric("Proved", String(trace?.provedRequirementCount || 0), "local evidence")}
        ${deliveryMetric("Open", String(trace?.openRequirementCount || 0), "T3 gated")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(previewRows.length ? previewRows : [
          { id: "model-routing", status: "waiting", riskTier: "T2" },
          { id: "agentic-qa", status: "waiting", riskTier: "T2" },
          { id: "t3-certification", status: "open", riskTier: "T3" }
        ]).map((row) => `
          <article>
            <span>${escapeHtml(row.riskTier || "T2")}</span>
            <strong>${escapeHtml(row.status || "waiting")}</strong>
            <small>${escapeHtml(row.id || "objective-row")}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderT3ApprovalPacket() {
  const packet = state.t3ApprovalPacket;
  const lanes = packet?.lanes || [];
  return `
    <section class="glass t3-approval-packet" data-t3-approval-packet data-t3-approval-execution-allowed="${packet?.executionAllowed === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>T3 approval packet</span>
          <h2>${escapeHtml(packet?.status || "loading")}</h2>
        </div>
        <strong data-t3-approval-packet-status>${packet?.executionAllowed ? "EXECUTABLE" : "APPROVAL REQUIRED"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Lanes", String(packet?.laneCount || 0), "runtime / db / provider")}
        ${deliveryMetric("Approved", String(packet?.approvedLaneCount || 0), "human approval")}
        ${deliveryMetric("Evidence", String(packet?.evidenceRequirementCount || 0), "required items")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(lanes.length ? lanes : [
          { id: "runtime", approved: false, evidenceChecklist: [] },
          { id: "database", approved: false, evidenceChecklist: [] },
          { id: "provider", approved: false, evidenceChecklist: [] }
        ]).slice(0, 3).map((lane) => `
          <article>
            <span>${escapeHtml(lane.id || "lane")}</span>
            <strong>${lane.approved ? "approved" : "blocked"}</strong>
            <small>${(lane.evidenceChecklist || []).length} evidence items</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderT3DryRunRehearsal() {
  const rehearsal = state.t3DryRunRehearsal;
  const lanes = rehearsal?.lanes || [];
  return `
    <section class="glass t3-dry-run-rehearsal" data-t3-dry-run-rehearsal data-t3-dry-run-external-actions="${rehearsal?.externalActionsExecuted === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>T3 dry-run rehearsal</span>
          <h2>${escapeHtml(rehearsal?.status || "loading")}</h2>
        </div>
        <strong data-t3-dry-run-rehearsal-status>${rehearsal?.rehearsalOnly ? "LOCAL ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Ready lanes", String(rehearsal?.readyLaneCount || 0), "dry-run checks")}
        ${deliveryMetric("Failed checks", String(rehearsal?.failedDryRunCheckCount || 0), "must stay 0")}
        ${deliveryMetric("External actions", rehearsal?.externalActionsExecuted ? "yes" : "no", "blocked")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(lanes.length ? lanes : [
          { id: "runtime", dryRunReady: false, commandCandidates: [] },
          { id: "database", dryRunReady: false, commandCandidates: [] },
          { id: "provider", dryRunReady: false, commandCandidates: [] }
        ]).slice(0, 3).map((lane) => `
          <article>
            <span>${escapeHtml(lane.id || "lane")}</span>
            <strong>${lane.dryRunReady ? "ready" : "pending"}</strong>
            <small>${(lane.commandCandidates || []).length} local commands</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderT3ApprovalRequestExport() {
  const exported = state.t3ApprovalRequestExport;
  const requests = exported?.requests || [];
  return `
    <section class="glass t3-approval-request-export" data-t3-approval-request-export data-t3-approval-request-execution-allowed="${exported?.executionAllowed === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>T3 approval request export</span>
          <h2>${escapeHtml(exported?.status || "loading")}</h2>
        </div>
        <strong data-t3-approval-request-export-status>${exported?.exportOnly ? "EXPORT ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Requests", String(exported?.approvalRequestCount || 0), "single-lane")}
        ${deliveryMetric("Ready", String(exported?.requestReadyCount || 0), "reviewable")}
        ${deliveryMetric("Executed", exported?.externalActionsExecuted ? "yes" : "no", "must stay no")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(requests.length ? requests : [
          { id: "runtime", requestReady: false, localCommandCandidates: [] },
          { id: "database", requestReady: false, localCommandCandidates: [] },
          { id: "provider", requestReady: false, localCommandCandidates: [] }
        ]).slice(0, 3).map((request) => `
          <article>
            <span>${escapeHtml(request.id || "request")}</span>
            <strong>${request.requestReady ? "ready" : "pending"}</strong>
            <small>${(request.localCommandCandidates || []).length} commands</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderT3ApprovalIntegrity() {
  const integrity = state.t3ApprovalIntegrity;
  const artifacts = integrity?.artifactInventory || [];
  return `
    <section class="glass t3-approval-integrity" data-t3-approval-integrity data-t3-approval-integrity-content-returned="${integrity?.contentReturned === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>T3 approval integrity</span>
          <h2>${escapeHtml(integrity?.status || "loading")}</h2>
        </div>
        <strong data-t3-approval-integrity-status>${integrity?.hashOnly ? "HASH ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Artifacts", String(integrity?.artifactCount || 0), `${integrity?.readyArtifactCount || 0} ready`)}
        ${deliveryMetric("Hashes", String(integrity?.hashCount || 0), "sha-256")}
        ${deliveryMetric("Secrets", integrity?.secretExposure ? "found" : "none", "scan guard")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(artifacts.length ? artifacts : [
          { category: "qa-artifact", path: "waiting", exists: false, sha256: "" },
          { category: "contract", path: "waiting", exists: false, sha256: "" },
          { category: "qa-script", path: "waiting", exists: false, sha256: "" }
        ]).slice(0, 3).map((artifact) => `
          <article>
            <span>${escapeHtml(artifact.category || "artifact")}</span>
            <strong>${artifact.exists ? "ready" : "missing"}</strong>
            <small>${escapeHtml(`${artifact.path || "artifact"} ${(artifact.sha256 || "").slice(0, 10)}`.trim())}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderT3ApprovalLock() {
  const lock = state.t3ApprovalLock;
  const lanes = lock?.laneLocks || [];
  return `
    <section class="glass t3-approval-lock" data-t3-approval-lock data-t3-approval-lock-execution-allowed="${lock?.executionAllowed === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>T3 approval lock</span>
          <h2>${escapeHtml(lock?.status || "loading")}</h2>
        </div>
        <strong data-t3-approval-lock-status>${lock?.lockOnly ? "LOCK ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Lane locks", String(lock?.laneLockCount || 0), "runtime / db / provider")}
        ${deliveryMetric("Open gaps", String(lock?.openCertificationGapCount || 0), "T3 approval")}
        ${deliveryMetric("Approved", lock?.approved ? "yes" : "no", "must stay no")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(lanes.length ? lanes : [
          { id: "runtime", requestReady: false, approvalTextHash: "" },
          { id: "database", requestReady: false, approvalTextHash: "" },
          { id: "provider", requestReady: false, approvalTextHash: "" }
        ]).slice(0, 3).map((lane) => `
          <article>
            <span>${escapeHtml(lane.id || "lane")}</span>
            <strong>${lane.requestReady ? "locked" : "pending"}</strong>
            <small>${escapeHtml((lane.approvalTextHash || "").slice(0, 12) || "hash pending")}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderT3ApprovalVerifier() {
  const verifier = state.t3ApprovalVerifier;
  const lanes = verifier?.laneVerifications || [];
  return `
    <section class="glass t3-approval-verifier" data-t3-approval-verifier data-t3-approval-verifier-execution-allowed="${verifier?.executionAllowed === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>T3 approval verifier</span>
          <h2>${escapeHtml(verifier?.status || "loading")}</h2>
        </div>
        <strong data-t3-approval-verifier-status>${verifier?.verifierOnly ? "VERIFY ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Verifier lanes", String(verifier?.laneVerificationCount || 0), `${verifier?.readyLaneVerificationCount || 0} ready`)}
        ${deliveryMetric("Metadata pass", verifier?.verificationPassed ? "yes" : "waiting", "candidate gate")}
        ${deliveryMetric("Execution", verifier?.executionAllowed ? "yes" : "no", "must stay no")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(lanes.length ? lanes : [
          { id: "runtime", requestReady: false, approvalTextHash: "" },
          { id: "database", requestReady: false, approvalTextHash: "" },
          { id: "provider", requestReady: false, approvalTextHash: "" }
        ]).slice(0, 3).map((lane) => `
          <article>
            <span>${escapeHtml(lane.id || "lane")}</span>
            <strong>${lane.requestReady ? "verifiable" : "pending"}</strong>
            <small>${escapeHtml((lane.approvalTextHash || "").slice(0, 12) || "hash pending")}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderT3ApprovalCandidates() {
  const candidates = state.t3ApprovalCandidates;
  const lanes = candidates?.candidates || [];
  return `
    <section class="glass t3-approval-candidates" data-t3-approval-candidates data-t3-approval-candidates-execution-allowed="${candidates?.executionAllowed === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>T3 approval candidates</span>
          <h2>${escapeHtml(candidates?.status || "loading")}</h2>
        </div>
        <strong data-t3-approval-candidates-status>${candidates?.candidateOnly ? "CANDIDATE ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Candidates", String(candidates?.candidateCount || 0), `${candidates?.verifierPassCount || 0} verified`)}
        ${deliveryMetric("Execution", candidates?.executionAllowed ? "yes" : "no", "must stay no")}
        ${deliveryMetric("Bundle hash", (candidates?.candidateBundleHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(lanes.length ? lanes : [
          { laneId: "runtime", verificationPassed: false, approvalTextHash: "" },
          { laneId: "database", verificationPassed: false, approvalTextHash: "" },
          { laneId: "provider", verificationPassed: false, approvalTextHash: "" }
        ]).slice(0, 3).map((candidate) => `
          <article>
            <span>${escapeHtml(candidate.laneId || "lane")}</span>
            <strong>${candidate.verificationPassed ? "ready" : "pending"}</strong>
            <small>${escapeHtml((candidate.approvalTextHash || "").slice(0, 12) || "hash pending")}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderT3ApprovalExecutionGate() {
  const gate = state.t3ApprovalExecutionGate;
  const lanes = gate?.gateLanes || [];
  return `
    <section class="glass t3-approval-execution-gate" data-t3-approval-execution-gate data-t3-approval-execution-gate-execution-allowed="${gate?.executionAllowed === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>T3 approval execution gate</span>
          <h2>${escapeHtml(gate?.status || "loading")}</h2>
        </div>
        <strong data-t3-approval-execution-gate-status>${gate?.gateOnly ? "GATE ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Lane gates", String(gate?.laneGateCount || 0), `${gate?.readyLaneGateCount || 0} ready`)}
        ${deliveryMetric("Bound candidate", String(gate?.boundCandidateCount || 0), gate?.boundLaneId || "none")}
        ${deliveryMetric("Gate hash", (gate?.executionGateHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(lanes.length ? lanes : [
          { laneId: "runtime", metadataVerified: false, requiredEvidence: [], rollbackChecks: [] },
          { laneId: "database", metadataVerified: false, requiredEvidence: [], rollbackChecks: [] },
          { laneId: "provider", metadataVerified: false, requiredEvidence: [], rollbackChecks: [] }
        ]).slice(0, 3).map((lane) => `
          <article>
            <span>${escapeHtml(lane.laneId || "lane")}</span>
            <strong>${lane.metadataVerified ? "gated" : "pending"}</strong>
            <small>${Number(lane.requiredEvidence?.length || 0)} evidence / ${Number(lane.rollbackChecks?.length || 0)} rollback</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderT3CertificationEvidenceClosure() {
  const closure = state.t3CertificationEvidenceClosure;
  const lanes = closure?.laneClosures || [];
  return `
    <section class="glass t3-certification-evidence-closure" data-t3-certification-evidence-closure data-t3-certification-evidence-closure-execution-allowed="${closure?.executionAllowed === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>T3 certification evidence closure</span>
          <h2>${escapeHtml(closure?.status || "loading")}</h2>
        </div>
        <strong data-t3-certification-evidence-closure-status>${closure?.closureOnly ? "CLOSURE ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Lane closures", String(closure?.laneClosureCount || 0), `${closure?.readyLaneClosureCount || 0} ready`)}
        ${deliveryMetric("Bundles", String(closure?.submittedEvidenceBundleCount || 0), `${closure?.validatedEvidenceBundleCount || 0} valid`)}
        ${deliveryMetric("Closure hash", (closure?.closureHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(lanes.length ? lanes : [
          { laneId: "runtime", metadataVerified: false, evidenceRequirementCount: 0, rollbackRequirementCount: 0, closureReady: false },
          { laneId: "database", metadataVerified: false, evidenceRequirementCount: 0, rollbackRequirementCount: 0, closureReady: false },
          { laneId: "provider", metadataVerified: false, evidenceRequirementCount: 0, rollbackRequirementCount: 0, closureReady: false }
        ]).slice(0, 3).map((lane) => `
          <article>
            <span>${escapeHtml(lane.laneId || "lane")}</span>
            <strong>${lane.closureReady ? "closed" : lane.metadataVerified ? "ready" : "pending"}</strong>
            <small>${Number(lane.evidenceRequirementCount || 0)} evidence / ${Number(lane.rollbackRequirementCount || 0)} rollback</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderFinalDeliveryReadiness() {
  const readiness = state.finalDeliveryReadiness;
  const gaps = readiness?.openCertificationGaps || [];
  return `
    <section class="glass final-delivery-readiness" data-final-delivery-readiness data-final-delivery-readiness-final-complete="${readiness?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Final delivery readiness</span>
          <h2>${escapeHtml(readiness?.status || "loading")}</h2>
        </div>
        <strong data-final-delivery-readiness-status>${readiness?.blockedByT3 ? "T3 BLOCKED" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Local evidence", readiness?.localEvidencePassed ? "ready" : "pending", `${readiness?.completionAudit?.localRequirementCount || 0} rows`)}
        ${deliveryMetric("Open T3 gaps", String(readiness?.openT3GapCount || 0), readiness?.blockedByT3 ? "approval required" : "clear")}
        ${deliveryMetric("Readiness hash", (readiness?.readinessHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(gaps.length ? gaps : [
          { id: "container-runtime-certification", status: "open", riskTier: "T3" },
          { id: "managed-database-certification", status: "open", riskTier: "T3" },
          { id: "external-provider-certification", status: "open", riskTier: "T3" }
        ]).slice(0, 3).map((gap) => `
          <article>
            <span>${escapeHtml(gap.id || "gap")}</span>
            <strong>${escapeHtml(gap.status || "open")}</strong>
            <small>${escapeHtml(gap.riskTier || "T3")}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDeliveryReleaseCandidate() {
  const candidate = state.deliveryReleaseCandidate;
  const checks = candidate?.releaseChecks || [];
  return `
    <section class="glass delivery-release-candidate" data-delivery-release-candidate data-release-candidate-final-complete="${candidate?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Delivery release candidate</span>
          <h2>${escapeHtml(candidate?.status || "loading")}</h2>
        </div>
        <strong data-release-candidate-status>${candidate?.readyForProductionRelease ? "PRODUCTION" : candidate?.readyForHumanReview ? "REVIEW READY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Review ready", candidate?.readyForHumanReview ? "yes" : "pending", candidate?.releaseCandidateOnly ? "candidate only" : "loading")}
        ${deliveryMetric("Open T3 gaps", String(candidate?.openT3GapCount || 0), candidate?.blockedByT3 ? "blocked" : "clear")}
        ${deliveryMetric("Candidate hash", (candidate?.releaseCandidateHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(checks.length ? checks : [
          { id: "local-completion-evidence", status: "waiting", evidence: "local rows" },
          { id: "visual-storyboard", status: "waiting", evidence: "visual surfaces" },
          { id: "t3-certification-gate", status: "blocked-open", evidence: "3 open T3 gaps" }
        ]).slice(0, 3).map((check) => `
          <article>
            <span>${escapeHtml(check.id || "check")}</span>
            <strong>${escapeHtml(check.status || "waiting")}</strong>
            <small>${escapeHtml(check.evidence || "release evidence")}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderT3CertificationNextActions() {
  const actions = state.t3CertificationNextActions;
  const lanes = actions?.laneActions || [];
  return `
    <section class="glass t3-certification-next-actions" data-t3-certification-next-actions data-t3-certification-next-actions-final-complete="${actions?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>T3 certification next actions</span>
          <h2>${escapeHtml(actions?.status || "loading")}</h2>
        </div>
        <strong data-t3-certification-next-actions-status>${actions?.executionAllowed ? "EXECUTE" : actions?.readyForHumanReview ? "APPROVAL NEEDED" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Lane actions", String(actions?.laneActionCount || 0), `${actions?.readyLaneActionCount || 0} ready`)}
        ${deliveryMetric("Evidence items", String(actions?.evidenceRequirementCount || 0), `${actions?.rollbackRequirementCount || 0} rollback`)}
        ${deliveryMetric("Next hash", (actions?.nextActionsHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(lanes.length ? lanes : [
          { laneId: "runtime", targetGap: "container-runtime-certification", actionReady: false, evidenceRequirementCount: 0, rollbackRequirementCount: 0 },
          { laneId: "database", targetGap: "managed-database-certification", actionReady: false, evidenceRequirementCount: 0, rollbackRequirementCount: 0 },
          { laneId: "provider", targetGap: "external-provider-certification", actionReady: false, evidenceRequirementCount: 0, rollbackRequirementCount: 0 }
        ]).map((lane) => `
          <article>
            <span>${escapeHtml(lane.laneId || "lane")}</span>
            <strong>${lane.actionReady ? "ready / blocked" : "waiting"}</strong>
            <small>${escapeHtml(lane.targetGap || "T3 certification")} · ${lane.evidenceRequirementCount || 0}/${lane.rollbackRequirementCount || 0}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderT3SingleLaneRunPackets() {
  const packets = state.t3SingleLaneRunPackets;
  const lanes = packets?.runPackets || [];
  return `
    <section class="glass t3-single-lane-run-packets" data-t3-single-lane-run-packets data-t3-single-lane-run-packets-final-complete="${packets?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>T3 single-lane run packets</span>
          <h2>${escapeHtml(packets?.status || "loading")}</h2>
        </div>
        <strong data-t3-single-lane-run-packets-status>${packets?.executionAllowed ? "EXECUTE" : packets?.readyForHumanReview ? "PACKET READY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Packets", String(packets?.packetCount || 0), `${packets?.readyPacketCount || 0} ready`)}
        ${deliveryMetric("Evidence IDs", String(packets?.evidenceRequirementCount || 0), `${packets?.rollbackRequirementCount || 0} rollback`)}
        ${deliveryMetric("Bundle hash", (packets?.runPacketBundleHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(lanes.length ? lanes : [
          { laneId: "runtime", targetGap: "container-runtime-certification", packetReady: false, evidenceIds: [], rollbackIds: [] },
          { laneId: "database", targetGap: "managed-database-certification", packetReady: false, evidenceIds: [], rollbackIds: [] },
          { laneId: "provider", targetGap: "external-provider-certification", packetReady: false, evidenceIds: [], rollbackIds: [] }
        ]).map((lane) => `
          <article>
            <span>${escapeHtml(lane.laneId || "lane")}</span>
            <strong>${lane.packetReady ? "ready / blocked" : "waiting"}</strong>
            <small>${escapeHtml(lane.targetGap || "T3 certification")} 路 ${(lane.evidenceIds || []).length}/${(lane.rollbackIds || []).length}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderT3RunPacketVerifier() {
  const verifier = state.t3RunPacketVerifier;
  const packets = verifier?.packetVerifications || [];
  return `
    <section class="glass t3-run-packet-verifier" data-t3-run-packet-verifier data-t3-run-packet-verifier-final-complete="${verifier?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>T3 run-packet verifier</span>
          <h2>${escapeHtml(verifier?.status || "loading")}</h2>
        </div>
        <strong data-t3-run-packet-verifier-status>${verifier?.verificationPassed ? "VERIFIED" : verifier?.verifierOnly ? "VERIFIER ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Packet checks", String(verifier?.packetVerificationCount || 0), `${verifier?.readyPacketVerificationCount || 0} ready`)}
        ${deliveryMetric("Submitted", String(verifier?.submittedPacketCount || 0), `${verifier?.verifiedPacketCount || 0} verified`)}
        ${deliveryMetric("Verifier hash", (verifier?.verifierHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(packets.length ? packets : [
          { laneId: "runtime", packetReady: false, packetSupplied: false, packetValid: false, evidenceIdCount: 0, rollbackIdCount: 0 },
          { laneId: "database", packetReady: false, packetSupplied: false, packetValid: false, evidenceIdCount: 0, rollbackIdCount: 0 },
          { laneId: "provider", packetReady: false, packetSupplied: false, packetValid: false, evidenceIdCount: 0, rollbackIdCount: 0 }
        ]).map((packet) => `
          <article>
            <span>${escapeHtml(packet.laneId || "lane")}</span>
            <strong>${packet.packetValid ? "verified / blocked" : packet.packetReady ? "ready / blocked" : "waiting"}</strong>
            <small>${packet.evidenceIdCount || 0} evidence / ${packet.rollbackIdCount || 0} rollback</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDeliveryReviewerCockpit() {
  const cockpit = state.deliveryReviewerCockpit;
  const sections = cockpit?.sections || [];
  return `
    <section class="glass delivery-reviewer-cockpit" data-delivery-reviewer-cockpit data-delivery-reviewer-cockpit-final-complete="${cockpit?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Delivery reviewer cockpit</span>
          <h2>${escapeHtml(cockpit?.status || "loading")}</h2>
        </div>
        <strong data-delivery-reviewer-cockpit-status>${cockpit?.readyForHumanReview ? "REVIEW READY" : cockpit?.reviewerCockpitOnly ? "COCKPIT ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Review sections", String(cockpit?.sectionCount || 0), `${cockpit?.readySectionCount || 0} ready`)}
        ${deliveryMetric("T3 gaps", String(cockpit?.openT3GapCount || 0), `${cockpit?.blockedSectionCount || 0} blocked`) }
        ${deliveryMetric("Cockpit hash", (cockpit?.reviewerCockpitHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces reviewer-sections">
        ${(sections.length ? sections : [
          { id: "local-evidence", title: "Local evidence", status: "needs-evidence", evidence: "pending" },
          { id: "visual-storyboard", title: "Visual storyboard", status: "needs-evidence", evidence: "pending" },
          { id: "production-release-gate", title: "Production release gate", status: "blocked-open", evidence: "3 open T3 gaps" }
        ]).slice(0, 8).map((section) => `
          <article>
            <span>${escapeHtml(section.id || "section")}</span>
            <strong>${escapeHtml(section.status || "pending")}</strong>
            <small>${escapeHtml(section.evidence || section.title || "metadata-only")}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDeliveryLaunchGuide() {
  const guide = state.deliveryLaunchGuide;
  const commands = guide?.reviewCommands || [];
  const routes = guide?.reviewRoutes || [];
  return `
    <section class="glass delivery-launch-guide" data-delivery-launch-guide data-delivery-launch-guide-final-complete="${guide?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Delivery launch guide</span>
          <h2>${escapeHtml(guide?.status || "loading")}</h2>
        </div>
        <strong data-delivery-launch-guide-status>${guide?.readyForLocalReview ? "LOCAL REVIEW READY" : guide?.launchGuideOnly ? "GUIDE ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Commands", String(guide?.commandCount || 0), "local only")}
        ${deliveryMetric("Routes", String(guide?.routeCount || 0), `${guide?.evidenceFileCount || 0} evidence files`)}
        ${deliveryMetric("Guide hash", (guide?.launchGuideHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces launch-guide-grid">
        ${(commands.length ? commands : [
          { id: "local-command-1", command: "npm.cmd run qa:launch-guide", purpose: "verify guide" },
          { id: "local-command-2", command: "npm.cmd run qa:reviewer-cockpit", purpose: "verify cockpit" },
          { id: "local-command-3", command: "npm.cmd run qa:completion", purpose: "verify completion audit" }
        ]).slice(0, 4).map((entry) => `
          <article>
            <span>${escapeHtml(entry.id || "command")}</span>
            <strong>${escapeHtml(entry.command || "pending")}</strong>
            <small>${escapeHtml(entry.purpose || "local review command")}</small>
          </article>
        `).join("")}
      </div>
      <div class="delivery-surfaces launch-guide-routes">
        ${(routes.length ? routes : [
          { id: "local-route-1", route: "http://127.0.0.1:3000/#research", purpose: "research review" },
          { id: "local-route-2", route: "http://127.0.0.1:3000/api/delivery/launch-guide", purpose: "guide metadata" }
        ]).slice(0, 5).map((entry) => `
          <article>
            <span>${escapeHtml(entry.id || "route")}</span>
            <strong>${escapeHtml(entry.route || "pending")}</strong>
            <small>${escapeHtml(entry.purpose || "local review route")}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDeliveryConsistencySentinel() {
  const sentinel = state.deliveryConsistencySentinel;
  const invariants = sentinel?.invariants || [];
  const surfaces = sentinel?.surfaces || [];
  return `
    <section class="glass delivery-consistency-sentinel" data-delivery-consistency-sentinel data-delivery-consistency-sentinel-final-complete="${sentinel?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Delivery consistency sentinel</span>
          <h2>${escapeHtml(sentinel?.status || "loading")}</h2>
        </div>
        <strong data-delivery-consistency-sentinel-status>${sentinel?.consistencyPassed ? "CONSISTENT" : sentinel?.sentinelOnly ? "CHECK ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Surfaces", String(sentinel?.surfaceCount || 0), `${sentinel?.contradictionCount || 0} contradictions`)}
        ${deliveryMetric("Invariants", String(sentinel?.invariantCount || 0), `${sentinel?.openT3GapCount || 0} T3 gaps`)}
        ${deliveryMetric("Sentinel hash", (sentinel?.consistencyHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces consistency-invariants">
        ${(invariants.length ? invariants : [
          { id: "final-goal-blocked", passed: false, evidence: "pending" },
          { id: "production-release-blocked", passed: false, evidence: "pending" },
          { id: "three-open-t3-gaps", passed: false, evidence: "pending" }
        ]).slice(0, 8).map((item) => `
          <article>
            <span>${escapeHtml(item.id || "invariant")}</span>
            <strong>${item.passed ? "pass" : "pending"}</strong>
            <small>${escapeHtml(item.evidence || "metadata-only check")}</small>
          </article>
        `).join("")}
      </div>
      <div class="delivery-surfaces consistency-surfaces">
        ${(surfaces.length ? surfaces : [
          { id: "reviewer-cockpit", status: "pending", openT3GapCount: 3 },
          { id: "delivery-launch-guide", status: "pending", openT3GapCount: 3 }
        ]).slice(0, 8).map((item) => `
          <article>
            <span>${escapeHtml(item.id || "surface")}</span>
            <strong>${escapeHtml(item.status || "pending")}</strong>
            <small>${Number(item.openT3GapCount || 0)} open T3 gaps / final=${item.finalGoalComplete === true ? "true" : "false"}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderFinalAcceptanceMatrix() {
  const matrix = state.finalAcceptanceMatrix;
  const rows = matrix?.rows || [];
  return `
    <section class="glass final-acceptance-matrix" data-final-acceptance-matrix data-final-acceptance-matrix-final-complete="${matrix?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Final acceptance matrix</span>
          <h2>${escapeHtml(matrix?.status || "loading")}</h2>
        </div>
        <strong data-final-acceptance-matrix-status>${matrix?.localAcceptancePassed ? "LOCAL ACCEPTANCE" : matrix?.acceptanceMatrixOnly ? "MATRIX ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Rows", String(matrix?.acceptanceRowCount || 0), `${matrix?.provedRowCount || 0} proved`)}
        ${deliveryMetric("Blocked", String(matrix?.blockedRowCount || 0), `${matrix?.openT3GapCount || 0} T3 gaps`)}
        ${deliveryMetric("Acceptance hash", (matrix?.acceptanceHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces acceptance-rows">
        ${(rows.length ? rows : [
          { id: "student-workflow", status: "local-proved", passed: false, evidence: "pending" },
          { id: "runtime-container-certification", status: "blocked-t3", passed: false, evidence: "approval required" }
        ]).slice(0, 13).map((item) => `
          <article>
            <span>${escapeHtml(item.id || "row")}</span>
            <strong>${escapeHtml(item.status || "pending")} / ${item.passed ? "yes" : "no"}</strong>
            <small>${escapeHtml(item.evidence || item.title || "metadata-only row")}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderCertificationBlockerBoard() {
  const board = state.certificationBlockerBoard;
  const blockers = board?.blockers || [];
  return `
    <section class="glass certification-blocker-board" data-certification-blocker-board data-certification-blocker-board-final-complete="${board?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Certification blocker board</span>
          <h2>${escapeHtml(board?.status || "loading")}</h2>
        </div>
        <strong data-certification-blocker-board-status>${board?.localBoardPassed ? "OPEN T3" : board?.blockerBoardOnly ? "BOARD ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Blockers", String(board?.blockerCount || 0), `${board?.readyBlockerCount || 0} locally ready`)}
        ${deliveryMetric("Closed", String(board?.closedBlockerCount || 0), `${board?.openT3GapCount || 0} T3 open`)}
        ${deliveryMetric("Board hash", (board?.boardHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces blocker-lanes">
        ${(blockers.length ? blockers : [
          { id: "container-runtime-certification", laneId: "runtime", localReady: false, evidenceNeededCount: 5, rollbackNeededCount: 3 },
          { id: "managed-database-certification", laneId: "database", localReady: false, evidenceNeededCount: 5, rollbackNeededCount: 3 },
          { id: "external-provider-certification", laneId: "provider", localReady: false, evidenceNeededCount: 5, rollbackNeededCount: 3 }
        ]).slice(0, 3).map((item) => `
          <article>
            <span>${escapeHtml(item.laneId || "lane")} / ${escapeHtml(item.id || "blocker")}</span>
            <strong>${item.localReady ? "ready, still open" : "pending"} / ${item.executionAllowed ? "unsafe" : "blocked"}</strong>
            <small>${Number(item.evidenceNeededCount || 0)} evidence / ${Number(item.rollbackNeededCount || 0)} rollback / auto-run=${item.cannotAutoRun ? "no" : "pending"}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderUserAcceptanceRehearsal() {
  const rehearsal = state.userAcceptanceRehearsal;
  const rows = rehearsal?.rehearsals || [];
  return `
    <section class="glass user-acceptance-rehearsal" data-user-acceptance-rehearsal data-user-acceptance-rehearsal-final-complete="${rehearsal?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>User acceptance rehearsal</span>
          <h2>${escapeHtml(rehearsal?.status || "loading")}</h2>
        </div>
        <strong data-user-acceptance-rehearsal-status>${rehearsal?.localUserAcceptancePassed ? "LOCAL UAT" : rehearsal?.userAcceptanceRehearsalOnly ? "REHEARSAL ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Rehearsals", String(rehearsal?.rehearsalCount || 0), `${rehearsal?.readyRehearsalCount || 0} ready`)}
        ${deliveryMetric("Blocked", String(rehearsal?.blockedRehearsalCount || 0), `${rehearsal?.openT3GapCount || 0} T3 open`)}
        ${deliveryMetric("Rehearsal hash", (rehearsal?.rehearsalHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces acceptance-rehearsals">
        ${(rows.length ? rows : [
          { id: "student-learning-rehearsal", persona: "student", status: "pending", workflow: "student flow", localReady: false },
          { id: "teacher-management-rehearsal", persona: "teacher", status: "pending", workflow: "teacher flow", localReady: false },
          { id: "research-delivery-rehearsal", persona: "research-delivery", status: "pending", workflow: "research delivery", localReady: false }
        ]).slice(0, 3).map((item) => `
          <article>
            <span>${escapeHtml(item.persona || "persona")} / ${escapeHtml(item.id || "rehearsal")}</span>
            <strong>${escapeHtml(item.status || "pending")} / ${item.localReady ? "ready" : "pending"}</strong>
            <small>${escapeHtml(item.workflow || item.notes || "metadata-only rehearsal")}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDeliveryEvidenceNavigator() {
  const navigator = state.deliveryEvidenceNavigator;
  const sections = navigator?.sections || [];
  return `
    <section class="glass delivery-evidence-navigator" data-delivery-evidence-navigator data-delivery-evidence-navigator-final-complete="${navigator?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Delivery evidence navigator</span>
          <h2>${escapeHtml(navigator?.status || "loading")}</h2>
        </div>
        <strong data-delivery-evidence-navigator-status>${navigator?.localNavigationPassed ? "METADATA READY" : navigator?.deliveryEvidenceNavigatorOnly ? "NAVIGATOR ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Sections", String(navigator?.navigationSectionCount || 0), `${navigator?.readyNavigationSectionCount || 0} ready`)}
        ${deliveryMetric("Evidence refs", String(navigator?.evidenceFileCount || 0), `${navigator?.openT3GapCount || 0} T3 open`)}
        ${deliveryMetric("Navigator hash", (navigator?.navigatorHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces evidence-navigation">
        ${(sections.length ? sections : [
          { id: "student-evidence-navigation", title: "Student learning evidence", status: "pending", evidenceRefCount: 0, localReady: false },
          { id: "teacher-evidence-navigation", title: "Teacher management evidence", status: "pending", evidenceRefCount: 0, localReady: false },
          { id: "research-delivery-navigation", title: "Research delivery evidence", status: "pending", evidenceRefCount: 0, localReady: false },
          { id: "visual-and-agentic-qa-navigation", title: "Visual and agentic QA evidence", status: "pending", evidenceRefCount: 0, localReady: false },
          { id: "t3-certification-navigation", title: "Open T3 certification evidence", status: "pending", evidenceRefCount: 0, localReady: false }
        ]).slice(0, 5).map((item) => `
          <article>
            <span>${escapeHtml(item.title || item.id || "section")}</span>
            <strong>${escapeHtml(item.status || "pending")} / ${item.localReady ? "ready" : "pending"}</strong>
            <small>${Number(item.evidenceRefCount || 0)} refs / content=${item.contentReturned ? "returned" : "metadata only"} / auto-run=${item.executionAllowed ? "yes" : "no"}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderLocalDeliverySummary() {
  const summary = state.localDeliverySummary;
  const sections = summary?.sections || [];
  return `
    <section class="glass local-delivery-summary" data-local-delivery-summary data-local-delivery-summary-final-complete="${summary?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Local delivery summary packet</span>
          <h2>${escapeHtml(summary?.status || "loading")}</h2>
        </div>
        <strong data-local-delivery-summary-status>${summary?.localSummaryPassed ? "LOCAL READY" : summary?.summaryPacketOnly ? "SUMMARY ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Sections", String(summary?.summarySectionCount || 0), `${summary?.readySummarySectionCount || 0} ready`)}
        ${deliveryMetric("Local rows", String(summary?.localRequirementCount || 0), `${summary?.provedCheckCount || 0} checks`)}
        ${deliveryMetric("Summary hash", (summary?.summaryHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces local-summary-sections">
        ${(sections.length ? sections : [
          { id: "product-scope-summary", title: "Product scope", status: "pending", result: "product scope", localReady: false },
          { id: "student-acceptance-summary", title: "Student acceptance", status: "pending", result: "student acceptance", localReady: false },
          { id: "teacher-management-summary", title: "Teacher management", status: "pending", result: "teacher management", localReady: false },
          { id: "research-delivery-summary", title: "Research delivery", status: "pending", result: "research delivery", localReady: false },
          { id: "visual-agentic-qa-summary", title: "Visual and agentic QA", status: "pending", result: "visual and QA", localReady: false },
          { id: "open-t3-gap-summary", title: "Open T3 gaps", status: "pending", result: "T3 gaps", localReady: false }
        ]).slice(0, 6).map((item) => `
          <article>
            <span>${escapeHtml(item.title || item.id || "section")}</span>
            <strong>${escapeHtml(item.status || "pending")} / ${item.localReady ? "ready" : "pending"}</strong>
            <small>${escapeHtml(item.result || "metadata-only local delivery summary")}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderLocalDeliveryHandoffBrief() {
  const brief = state.localDeliveryHandoffBrief;
  const sections = brief?.sections || [];
  return `
    <section class="glass local-delivery-handoff-brief" data-local-delivery-handoff-brief data-local-delivery-handoff-brief-final-complete="${brief?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Local delivery handoff brief</span>
          <h2>${escapeHtml(brief?.status || "loading")}</h2>
        </div>
        <strong data-local-delivery-handoff-brief-status>${brief?.localHandoffPassed ? "HANDOFF READY" : brief?.handoffBriefOnly ? "BRIEF ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Sections", String(brief?.briefSectionCount || 0), `${brief?.readyBriefSectionCount || 0} ready`)}
        ${deliveryMetric("Commands", String(brief?.localCommandCount || 0), `${brief?.openT3GapCount || 0} T3 open`)}
        ${deliveryMetric("Brief hash", (brief?.briefHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces local-handoff-sections">
        ${(sections.length ? sections : [
          { id: "handoff-entrypoints", title: "Handoff entrypoints", status: "pending", result: "entrypoints", localReady: false },
          { id: "local-run-commands", title: "Local run commands", status: "pending", result: "commands", localReady: false },
          { id: "student-teacher-review", title: "Student and teacher review", status: "pending", result: "review", localReady: false },
          { id: "qa-evidence", title: "QA evidence", status: "pending", result: "QA evidence", localReady: false },
          { id: "delivery-artifacts", title: "Delivery artifacts", status: "pending", result: "artifacts", localReady: false },
          { id: "t3-boundary", title: "T3 boundary", status: "pending", result: "T3 boundary", localReady: false }
        ]).slice(0, 6).map((item) => `
          <article>
            <span>${escapeHtml(item.title || item.id || "section")}</span>
            <strong>${escapeHtml(item.status || "pending")} / ${item.localReady ? "ready" : "pending"}</strong>
            <small>${escapeHtml(item.result || "metadata-only local handoff brief")}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderLocalDeliveryQuickstart() {
  const quickstart = state.localDeliveryQuickstart;
  const steps = quickstart?.quickstartSteps || [];
  return `
    <section class="glass local-delivery-quickstart" data-local-delivery-quickstart data-local-delivery-quickstart-final-complete="${quickstart?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Local delivery quickstart</span>
          <h2>${escapeHtml(quickstart?.status || "loading")}</h2>
        </div>
        <strong data-local-delivery-quickstart-status>${quickstart?.localQuickstartPassed ? "QUICKSTART READY" : quickstart?.quickstartBundleOnly ? "BUNDLE ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Steps", String(quickstart?.quickstartStepCount || 0), `${quickstart?.readyQuickstartStepCount || 0} ready`)}
        ${deliveryMetric("Routes", String(quickstart?.localRouteCount || 0), `${quickstart?.localCommandCount || 0} commands`)}
        ${deliveryMetric("Quick hash", (quickstart?.quickstartHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces local-quickstart-steps">
        ${(steps.length ? steps : [
          { id: "confirm-local-only-boundary", status: "pending", purpose: "confirm local-only boundary", localReady: false },
          { id: "start-local-server", status: "pending", purpose: "start local server", localReady: false },
          { id: "inspect-student-workflow", status: "pending", purpose: "student workflow", localReady: false },
          { id: "inspect-teacher-workflow", status: "pending", purpose: "teacher workflow", localReady: false },
          { id: "inspect-research-delivery", status: "pending", purpose: "research delivery", localReady: false },
          { id: "run-local-verification", status: "pending", purpose: "local QA", localReady: false }
        ]).slice(0, 6).map((item) => `
          <article>
            <span>${escapeHtml(item.id || "step")}</span>
            <strong>${escapeHtml(item.status || "pending")} / ${item.localReady ? "ready" : "pending"}</strong>
            <small>${escapeHtml(item.purpose || "metadata-only quickstart step")} / run=${item.executed ? "yes" : "no"}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderLocalDeliveryVerificationSuite() {
  const suite = state.localDeliveryVerificationSuite;
  const checks = suite?.verificationChecks || [];
  return `
    <section class="glass local-delivery-verification-suite" data-local-delivery-verification-suite data-local-delivery-verification-suite-final-complete="${suite?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Local delivery verification suite</span>
          <h2>${escapeHtml(suite?.status || "loading")}</h2>
        </div>
        <strong data-local-delivery-verification-suite-status>${suite?.localVerificationPassed ? "SUITE READY" : suite?.verificationSuiteOnly ? "SUITE ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Checks", String(suite?.verificationCheckCount || 0), `${suite?.readyVerificationCheckCount || 0} ready`)}
        ${deliveryMetric("Commands", String(suite?.localCommandCount || 0), `${suite?.evidenceFileCount || 0} evidence`)}
        ${deliveryMetric("Suite hash", (suite?.suiteHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces local-verification-checks">
        ${(checks.length ? checks : [
          { id: "quickstart-artifact-ready", status: "pending", localReady: false },
          { id: "focused-suite-command-registered", status: "pending", localReady: false },
          { id: "api-regression-command-registered", status: "pending", localReady: false },
          { id: "agentic-audit-command-registered", status: "pending", localReady: false },
          { id: "completion-audit-command-registered", status: "pending", localReady: false },
          { id: "open-t3-gaps-preserved", status: "pending", localReady: false }
        ]).slice(0, 6).map((item) => `
          <article>
            <span>${escapeHtml(item.id || "check")}</span>
            <strong>${escapeHtml(item.status || "pending")} / ${item.localReady ? "ready" : "pending"}</strong>
            <small>run=${item.executed ? "yes" : "no"} / output=${item.outputReturned ? "yes" : "no"}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderFinalLocalHandoffCheckpoint() {
  const checkpoint = state.finalLocalHandoffCheckpoint;
  const steps = checkpoint?.checkpointSteps || [];
  return `
    <section class="glass final-local-handoff-checkpoint" data-final-local-handoff-checkpoint data-final-local-handoff-checkpoint-final-complete="${checkpoint?.finalGoalComplete === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>Final local handoff checkpoint</span>
          <h2>${escapeHtml(checkpoint?.status || "loading")}</h2>
        </div>
        <strong data-final-local-handoff-checkpoint-status>${checkpoint?.localFinalHandoffPassed ? "HANDOFF READY" : checkpoint?.checkpointOnly ? "CHECKPOINT ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Steps", String(checkpoint?.checkpointStepCount || 0), `${checkpoint?.readyCheckpointStepCount || 0} ready`)}
        ${deliveryMetric("Artifacts", String(checkpoint?.handoffArtifactCount || 0), `${checkpoint?.localCommandCount || 0} commands`)}
        ${deliveryMetric("Checkpoint hash", (checkpoint?.checkpointHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces final-handoff-steps">
        ${(steps.length ? steps : [
          { id: "phase4h-verification-suite-ready", status: "pending", localReady: false },
          { id: "final-checkpoint-command-registered", status: "pending", localReady: false },
          { id: "local-completion-audit-ready", status: "pending", localReady: false },
          { id: "agentic-audit-ready", status: "pending", localReady: false },
          { id: "handoff-artifacts-hashed", status: "pending", localReady: false },
          { id: "open-t3-gaps-preserved", status: "pending", localReady: false }
        ]).slice(0, 6).map((item) => `
          <article>
            <span>${escapeHtml(item.id || "checkpoint")}</span>
            <strong>${escapeHtml(item.status || "pending")} / ${item.localReady ? "ready" : "pending"}</strong>
            <small>run=${item.executed ? "yes" : "no"} / output=${item.outputReturned ? "yes" : "no"}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderT3EvidenceBundleTemplates() {
  const templates = state.t3EvidenceBundleTemplates;
  const lanes = templates?.laneTemplates || [];
  return `
    <section class="glass t3-evidence-bundle-templates" data-t3-evidence-bundle-templates data-t3-evidence-bundle-templates-execution-allowed="${templates?.executionAllowed === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>T3 evidence bundle templates</span>
          <h2>${escapeHtml(templates?.status || "loading")}</h2>
        </div>
        <strong data-t3-evidence-bundle-templates-status>${templates?.templateOnly ? "TEMPLATE ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Lane templates", String(templates?.laneTemplateCount || 0), `${templates?.readyLaneTemplateCount || 0} ready`)}
        ${deliveryMetric("Evidence items", String(templates?.evidenceItemCount || 0), `${templates?.rollbackResultCount || 0} rollback`)}
        ${deliveryMetric("Template hash", (templates?.templateBundleHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(lanes.length ? lanes : [
          { laneId: "runtime", templateReady: false, evidenceItems: [], rollbackResults: [] },
          { laneId: "database", templateReady: false, evidenceItems: [], rollbackResults: [] },
          { laneId: "provider", templateReady: false, evidenceItems: [], rollbackResults: [] }
        ]).slice(0, 3).map((lane) => `
          <article>
            <span>${escapeHtml(lane.laneId || "lane")}</span>
            <strong>${lane.templateReady ? "ready" : "pending"}</strong>
            <small>${Number(lane.evidenceItems?.length || 0)} evidence / ${Number(lane.rollbackResults?.length || 0)} rollback</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderT3OperatorChecklist() {
  const checklist = state.t3OperatorChecklist;
  const lanes = checklist?.laneChecklists || [];
  return `
    <section class="glass t3-operator-checklist" data-t3-operator-checklist data-t3-operator-checklist-execution-allowed="${checklist?.executionAllowed === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>T3 operator checklist</span>
          <h2>${escapeHtml(checklist?.status || "loading")}</h2>
        </div>
        <strong data-t3-operator-checklist-status>${checklist?.operatorOnly ? "OPERATOR ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Lane checklists", String(checklist?.laneChecklistCount || 0), `${checklist?.readyLaneChecklistCount || 0} ready`)}
        ${deliveryMetric("Manual steps", String(checklist?.manualStepCount || 0), `${checklist?.evidenceItemCount || 0} evidence`)}
        ${deliveryMetric("Checklist hash", (checklist?.checklistBundleHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(lanes.length ? lanes : [
          { laneId: "runtime", checklistReady: false, manualSteps: [], evidenceChecklist: [], rollbackChecklist: [] },
          { laneId: "database", checklistReady: false, manualSteps: [], evidenceChecklist: [], rollbackChecklist: [] },
          { laneId: "provider", checklistReady: false, manualSteps: [], evidenceChecklist: [], rollbackChecklist: [] }
        ]).slice(0, 3).map((lane) => `
          <article>
            <span>${escapeHtml(lane.laneId || "lane")}</span>
            <strong>${lane.checklistReady ? "ready" : "blocked"}</strong>
            <small>${Number(lane.manualSteps?.length || 0)} steps / ${Number(lane.rollbackChecklist?.length || 0)} rollback</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderT3OperatorTranscriptValidator() {
  const validator = state.t3OperatorTranscriptValidator;
  const lanes = validator?.laneValidations || [];
  return `
    <section class="glass t3-operator-transcript-validator" data-t3-operator-transcript-validator data-t3-operator-transcript-validator-execution-allowed="${validator?.executionAllowed === true ? "true" : "false"}">
      <div class="delivery-head">
        <div>
          <span>T3 operator transcript validator</span>
          <h2>${escapeHtml(validator?.status || "loading")}</h2>
        </div>
        <strong data-t3-operator-transcript-validator-status>${validator?.validatorOnly ? "VALIDATOR ONLY" : "LOADING"}</strong>
      </div>
      <div class="delivery-metrics">
        ${deliveryMetric("Lane validations", String(validator?.laneValidationCount || 0), `${validator?.readyLaneValidationCount || 0} ready`)}
        ${deliveryMetric("Transcripts", String(validator?.submittedTranscriptCount || 0), `${validator?.validatedTranscriptCount || 0} valid`)}
        ${deliveryMetric("Validator hash", (validator?.transcriptValidatorHash || "").slice(0, 8) || "pending", "sha-256")}
      </div>
      <div class="delivery-surfaces package-lanes">
        ${(lanes.length ? lanes : [
          { laneId: "runtime", checklistReady: false, transcriptSupplied: false, transcriptValid: false, manualStepCount: 0, evidenceArtifactCount: 0 },
          { laneId: "database", checklistReady: false, transcriptSupplied: false, transcriptValid: false, manualStepCount: 0, evidenceArtifactCount: 0 },
          { laneId: "provider", checklistReady: false, transcriptSupplied: false, transcriptValid: false, manualStepCount: 0, evidenceArtifactCount: 0 }
        ]).slice(0, 3).map((lane) => `
          <article>
            <span>${escapeHtml(lane.laneId || "lane")}</span>
            <strong>${lane.transcriptValid ? "valid" : lane.checklistReady ? "ready" : "blocked"}</strong>
            <small>${Number(lane.manualStepCount || 0)} steps / ${Number(lane.evidenceArtifactCount || 0)} evidence</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function langLabel(lang) {
  return { python: "Python", cpp: "C++", c: "C" }[lang] || lang;
}

function formatShortDate(value) {
  try {
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  } catch {
    return "待定";
  }
}

function latestSubmission() {
  return [...(state.submissions || [])]
    .filter((item) => item.studentName === "林一诺" || item.studentId === "student-linyi")
    .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))[0];
}

function mountClassroomWorkflow() {
  if (state.route === "student") mountStudentWorkflow();
  if (state.route === "teacher") mountTeacherWorkflow();
  if (state.route === "research") mountResearchWorkflow();
}

function mountStudentWorkflow() {
  const rail = document.querySelector(".left-rail");
  if (!rail || rail.querySelector("[data-workflow-panel]")) return;
  const firstSection = rail.querySelector("section");
  if (!firstSection) return;
  firstSection.insertAdjacentHTML("afterend", renderAssignmentWorkflow());
  const check = document.querySelector("[data-run-checklist]");
  if (check) check.addEventListener("click", runSubmissionSelfCheck);
  const submit = document.querySelector("[data-submit-work]");
  if (submit) submit.addEventListener("click", submitCurrentWork);
}

function renderAssignmentWorkflow() {
  const assignment = state.assignment || fallbackAssignment;
  const currentSubmission = latestSubmission();
  const focus = (assignment.ctFocus || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  const rubric = (assignment.rubric || []).map((item) => `<li><b>${item.weight}%</b>${escapeHtml(item.label)}</li>`).join("");
  const status = currentSubmission
    ? `${currentSubmission.status === "reviewed" ? "已批阅" : "已提交"} · ${currentSubmission.score ?? "待评分"}`
    : state.submissionStatus;
  return `
    <section class="assignment-workflow" data-workflow-panel>
      <div class="assignment-head">
        <span>课堂任务</span>
        <strong>${escapeHtml(assignment.title)}</strong>
      </div>
      <p>${escapeHtml(assignment.brief)}</p>
      <div class="assignment-meta">
        <span>截止 ${formatShortDate(assignment.dueAt)}</span>
        <span>${escapeHtml(status)}</span>
      </div>
      <div class="ct-tags mini">${focus}</div>
      <ol class="rubric-list">${rubric}</ol>
      <div class="submission-actions">
        <button data-run-checklist>AI自检</button>
        <button data-submit-work>提交作品</button>
      </div>
    </section>
  `;
}

function mountTeacherWorkflow() {
  const grid = document.querySelector(".dashboard-grid");
  if (!grid || grid.querySelector("[data-workflow-panel]")) return;
  grid.insertAdjacentHTML("beforeend", renderTeacherReviewQueue());
  document.querySelectorAll("[data-review-submission]").forEach((button) => {
    button.addEventListener("click", () => reviewSubmission(button.dataset.reviewSubmission, Number(button.dataset.reviewScore || 88)));
  });
}

function renderTeacherReviewQueue() {
  const submissions = [...(state.submissions || [])].sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
  const rows = submissions.map((item) => `
    <article class="submission-row ${item.status}">
      <div>
        <strong>${escapeHtml(item.studentName || item.studentId || "学生")}</strong>
        <span>${escapeHtml(item.language || "python")} · ${formatShortDate(item.submittedAt)} · ${escapeHtml(item.status || "submitted")}</span>
      </div>
      <p>${escapeHtml(item.feedback || "等待教师批阅")}</p>
      <div class="submission-proof">
        <span>运行 ${item.selfCheck?.runs || 0}</span>
        <span>${item.selfCheck?.savedVersion ? "已保存" : "未保存"}</span>
        <span>${item.selfCheck?.aiReviewed ? "AI已审" : "待AI审"}</span>
      </div>
      <div class="review-actions">
        <button data-review-submission="${item.id}" data-review-score="92">通过并反馈</button>
        <button data-review-submission="${item.id}" data-review-score="74">标记需辅导</button>
      </div>
    </article>
  `).join("");
  return `
    <div class="glass review-queue table-card" data-workflow-panel>
      <div class="table-head">
        <h2>提交批阅闭环</h2>
        <span>${submissions.length} 份作品 · ${submissions.filter((item) => item.status === "reviewed").length} 已批阅</span>
      </div>
      <div class="submission-list">${rows || "<p>暂无提交</p>"}</div>
    </div>
  `;
}

function mountResearchWorkflow() {
  const panel = document.querySelector(".export-panel");
  if (!panel || panel.querySelector("[data-workflow-panel]")) return;
  const reviewed = (state.submissions || []).filter((item) => item.status === "reviewed").length;
  panel.insertAdjacentHTML("afterbegin", `
    <div class="evidence-strip" data-workflow-panel>
      <span>任务闭环 ${state.assignment?.title || "课堂任务"}</span>
      <strong>${(state.submissions || []).length}</strong>
      <small>提交 / ${reviewed} 已批阅 / 可导出研究证据</small>
    </div>
    ${renderModelContractPanel()}
  `);
  if (!state.deliveryOverviewLoaded) refreshDeliveryOverview();
  if (!state.t3PackageLoaded) refreshT3Package();
  if (!state.t3EvidenceLoaded) refreshT3Evidence();
  if (!state.deliveryDossierLoaded) refreshDeliveryDossier();
  if (!state.deliveryArtifactsLoaded) refreshDeliveryArtifacts();
  if (!state.agenticQaReplayLoaded) refreshAgenticQaReplay();
  if (!state.visualStoryboardLoaded) refreshVisualStoryboard();
  if (!state.objectiveTraceabilityLoaded) refreshObjectiveTraceability();
  if (!state.t3ApprovalPacketLoaded) refreshT3ApprovalPacket();
  if (!state.t3DryRunRehearsalLoaded) refreshT3DryRunRehearsal();
  if (!state.t3ApprovalRequestExportLoaded) refreshT3ApprovalRequestExport();
  if (!state.t3ApprovalIntegrityLoaded) refreshT3ApprovalIntegrity();
  if (!state.t3ApprovalLockLoaded) refreshT3ApprovalLock();
  if (!state.t3ApprovalVerifierLoaded) refreshT3ApprovalVerifier();
  if (!state.t3ApprovalCandidatesLoaded) refreshT3ApprovalCandidates();
  if (!state.t3ApprovalExecutionGateLoaded) refreshT3ApprovalExecutionGate();
  if (!state.t3CertificationEvidenceClosureLoaded) refreshT3CertificationEvidenceClosure();
  if (!state.finalDeliveryReadinessLoaded) refreshFinalDeliveryReadiness();
  if (!state.deliveryReleaseCandidateLoaded) refreshDeliveryReleaseCandidate();
  if (!state.t3CertificationNextActionsLoaded) refreshT3CertificationNextActions();
  if (!state.t3SingleLaneRunPacketsLoaded) refreshT3SingleLaneRunPackets();
  if (!state.t3RunPacketVerifierLoaded) refreshT3RunPacketVerifier();
  if (!state.deliveryReviewerCockpitLoaded) refreshDeliveryReviewerCockpit();
  if (!state.deliveryLaunchGuideLoaded) refreshDeliveryLaunchGuide();
  if (!state.deliveryConsistencySentinelLoaded) refreshDeliveryConsistencySentinel();
  if (!state.finalAcceptanceMatrixLoaded) refreshFinalAcceptanceMatrix();
  if (!state.certificationBlockerBoardLoaded) refreshCertificationBlockerBoard();
  if (!state.userAcceptanceRehearsalLoaded) refreshUserAcceptanceRehearsal();
  if (!state.deliveryEvidenceNavigatorLoaded) refreshDeliveryEvidenceNavigator();
  if (!state.localDeliverySummaryLoaded) refreshLocalDeliverySummary();
  if (!state.localDeliveryHandoffBriefLoaded) refreshLocalDeliveryHandoffBrief();
  if (!state.localDeliveryQuickstartLoaded) refreshLocalDeliveryQuickstart();
  if (!state.localDeliveryVerificationSuiteLoaded) refreshLocalDeliveryVerificationSuite();
  if (!state.finalLocalHandoffCheckpointLoaded) refreshFinalLocalHandoffCheckpoint();
  if (!state.t3EvidenceBundleTemplatesLoaded) refreshT3EvidenceBundleTemplates();
  if (!state.t3OperatorChecklistLoaded) refreshT3OperatorChecklist();
  if (!state.t3OperatorTranscriptValidatorLoaded) refreshT3OperatorTranscriptValidator();
}

async function refreshDeliveryOverview() {
  try {
    const overview = await apiRequest("/api/delivery/certification-overview");
    setState({ deliveryOverview: overview, deliveryOverviewLoaded: true, apiOnline: true });
  } catch {
    setState({
      deliveryOverview: {
        status: "offline",
        finalGoalComplete: false,
        localEvidencePassed: false,
        completionAudit: { localRequirementCount: 0, provedLocalRequirementCount: 0 },
        readinessSurfaces: [],
        openCertificationGaps: []
      },
      deliveryOverviewLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshT3Package() {
  try {
    const pack = await apiRequest("/api/delivery/t3-certification-package");
    setState({ t3Package: pack, t3PackageLoaded: true, apiOnline: true });
  } catch {
    setState({
      t3Package: {
        status: "offline",
        executionAllowed: false,
        finalGoalComplete: false,
        packageSummary: { laneCount: 0, blockedLaneCount: 0, evidenceRequirementCount: 0 },
        lanePackages: []
      },
      t3PackageLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshT3Evidence() {
  try {
    const evidence = await apiRequest("/api/delivery/t3-evidence");
    setState({ t3Evidence: evidence, t3EvidenceLoaded: true, apiOnline: true });
  } catch {
    setState({
      t3Evidence: {
        status: "offline",
        finalGoalComplete: false,
        certificationStateChanged: false,
        candidateCount: 0,
        acceptedCandidateCount: 0,
        laneCounts: { runtime: 0, database: 0, provider: 0 }
      },
      t3EvidenceLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshDeliveryDossier() {
  try {
    const dossier = await apiRequest("/api/delivery/handoff-dossier");
    setState({ deliveryDossier: dossier, deliveryDossierLoaded: true, apiOnline: true });
  } catch {
    setState({
      deliveryDossier: {
        status: "offline",
        finalGoalComplete: false,
        localEvidencePassed: false,
        localRequirementCount: 0,
        provedLocalRequirementCount: 0,
        artifactCount: 0,
        openCertificationGapCount: 0,
        sections: []
      },
      deliveryDossierLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshDeliveryArtifacts() {
  try {
    const artifacts = await apiRequest("/api/delivery/artifacts");
    setState({ deliveryArtifacts: artifacts, deliveryArtifactsLoaded: true, apiOnline: true });
  } catch {
    setState({
      deliveryArtifacts: {
        status: "offline",
        finalGoalComplete: false,
        localEvidencePassed: false,
        artifactCount: 0,
        readyArtifactCount: 0,
        missingArtifactCount: 0,
        hashCount: 0,
        contentReturned: false,
        artifactInventory: []
      },
      deliveryArtifactsLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshAgenticQaReplay() {
  try {
    const replay = await apiRequest("/api/delivery/agentic-qa-replay");
    setState({ agenticQaReplay: replay, agenticQaReplayLoaded: true, apiOnline: true });
  } catch {
    setState({
      agenticQaReplay: {
        status: "offline",
        finalGoalComplete: false,
        replayOnly: true,
        contentReturned: false,
        artifactContentReturned: false,
        screenshotBytesReturned: false,
        agentCount: 0,
        clickRoundCount: 0,
        provedCheckCount: 0,
        openProductGapCount: 0,
        finalValueWaitsPassed: false,
        screenshotHashCount: 0,
        replayHash: "",
        replayRounds: []
      },
      agenticQaReplayLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshVisualStoryboard() {
  try {
    const storyboard = await apiRequest("/api/delivery/visual-storyboard");
    setState({ visualStoryboard: storyboard, visualStoryboardLoaded: true, apiOnline: true });
  } catch {
    setState({
      visualStoryboard: {
        status: "offline",
        finalGoalComplete: false,
        storyboardOnly: true,
        localVisualEvidence: false,
        screenshotBytesEmbedded: false,
        artifactBodyContentReturned: false,
        surfaceCount: 0,
        readySurfaceCount: 0,
        screenshotHashCount: 0,
        replayRoundCount: 0,
        visualChecksPassed: false,
        storyboardHash: "",
        frames: []
      },
      visualStoryboardLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshObjectiveTraceability() {
  try {
    const traceability = await apiRequest("/api/delivery/objective-traceability");
    setState({ objectiveTraceability: traceability, objectiveTraceabilityLoaded: true, apiOnline: true });
  } catch {
    setState({
      objectiveTraceability: {
        status: "offline",
        finalGoalComplete: false,
        localEvidencePassed: false,
        requirementCount: 0,
        provedRequirementCount: 0,
        openRequirementCount: 0,
        blockedRequirementCount: 0,
        matrix: []
      },
      objectiveTraceabilityLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshT3ApprovalPacket() {
  try {
    const packet = await apiRequest("/api/delivery/t3-approval-packet");
    setState({ t3ApprovalPacket: packet, t3ApprovalPacketLoaded: true, apiOnline: true });
  } catch {
    setState({
      t3ApprovalPacket: {
        status: "offline",
        finalGoalComplete: false,
        executionAllowed: false,
        safeToRunAutomatically: false,
        approvalRequired: true,
        laneCount: 0,
        approvedLaneCount: 0,
        blockedLaneCount: 0,
        evidenceRequirementCount: 0,
        lanes: []
      },
      t3ApprovalPacketLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshT3DryRunRehearsal() {
  try {
    const rehearsal = await apiRequest("/api/delivery/t3-dry-run-rehearsal");
    setState({ t3DryRunRehearsal: rehearsal, t3DryRunRehearsalLoaded: true, apiOnline: true });
  } catch {
    setState({
      t3DryRunRehearsal: {
        status: "offline",
        finalGoalComplete: false,
        rehearsalOnly: true,
        externalActionsExecuted: false,
        certificationStateChanged: false,
        executionAllowed: false,
        safeToRunAutomatically: false,
        laneCount: 0,
        readyLaneCount: 0,
        blockedLaneCount: 0,
        failedDryRunCheckCount: 0,
        lanes: []
      },
      t3DryRunRehearsalLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshT3ApprovalRequestExport() {
  try {
    const exported = await apiRequest("/api/delivery/t3-approval-request-export");
    setState({ t3ApprovalRequestExport: exported, t3ApprovalRequestExportLoaded: true, apiOnline: true });
  } catch {
    setState({
      t3ApprovalRequestExport: {
        status: "offline",
        finalGoalComplete: false,
        exportOnly: true,
        externalActionsExecuted: false,
        certificationStateChanged: false,
        executionAllowed: false,
        approvalRequestCount: 0,
        requestReadyCount: 0,
        requests: []
      },
      t3ApprovalRequestExportLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshT3ApprovalIntegrity() {
  try {
    const integrity = await apiRequest("/api/delivery/t3-approval-integrity");
    setState({ t3ApprovalIntegrity: integrity, t3ApprovalIntegrityLoaded: true, apiOnline: true });
  } catch {
    setState({
      t3ApprovalIntegrity: {
        status: "offline",
        finalGoalComplete: false,
        hashOnly: true,
        contentReturned: false,
        externalActionsExecuted: false,
        certificationStateChanged: false,
        executionAllowed: false,
        artifactCount: 0,
        readyArtifactCount: 0,
        missingArtifactCount: 0,
        hashCount: 0,
        secretExposure: false,
        artifactInventory: []
      },
      t3ApprovalIntegrityLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshT3ApprovalLock() {
  try {
    const lock = await apiRequest("/api/delivery/t3-approval-lock");
    setState({ t3ApprovalLock: lock, t3ApprovalLockLoaded: true, apiOnline: true });
  } catch {
    setState({
      t3ApprovalLock: {
        status: "offline",
        finalGoalComplete: false,
        lockOnly: true,
        approved: false,
        executionAllowed: false,
        externalActionsExecuted: false,
        certificationStateChanged: false,
        contentReturned: false,
        laneLockCount: 0,
        openCertificationGapCount: 0,
        laneLocks: []
      },
      t3ApprovalLockLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshT3ApprovalVerifier() {
  try {
    const verifier = await apiRequest("/api/delivery/t3-approval-verifier");
    setState({ t3ApprovalVerifier: verifier, t3ApprovalVerifierLoaded: true, apiOnline: true });
  } catch {
    setState({
      t3ApprovalVerifier: {
        status: "offline",
        finalGoalComplete: false,
        verifierOnly: true,
        verificationPassed: false,
        approvalRecorded: false,
        approved: false,
        executionAllowed: false,
        externalActionsExecuted: false,
        certificationStateChanged: false,
        contentReturned: false,
        laneVerificationCount: 0,
        readyLaneVerificationCount: 0,
        laneVerifications: []
      },
      t3ApprovalVerifierLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshT3ApprovalCandidates() {
  try {
    const candidates = await apiRequest("/api/delivery/t3-approval-candidates");
    setState({ t3ApprovalCandidates: candidates, t3ApprovalCandidatesLoaded: true, apiOnline: true });
  } catch {
    setState({
      t3ApprovalCandidates: {
        status: "offline",
        finalGoalComplete: false,
        candidateOnly: true,
        approvalRecorded: false,
        approved: false,
        executionAllowed: false,
        externalActionsExecuted: false,
        certificationStateChanged: false,
        contentReturned: false,
        candidateCount: 0,
        verifierPassCount: 0,
        candidateBundleHash: "",
        candidates: []
      },
      t3ApprovalCandidatesLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshT3ApprovalExecutionGate() {
  try {
    const gate = await apiRequest("/api/delivery/t3-approval-execution-gate");
    setState({ t3ApprovalExecutionGate: gate, t3ApprovalExecutionGateLoaded: true, apiOnline: true });
  } catch {
    setState({
      t3ApprovalExecutionGate: {
        status: "offline",
        finalGoalComplete: false,
        gateOnly: true,
        approvalRecorded: false,
        approved: false,
        executionAllowed: false,
        externalActionsExecuted: false,
        certificationStateChanged: false,
        contentReturned: false,
        laneGateCount: 0,
        readyLaneGateCount: 0,
        boundCandidateCount: 0,
        boundLaneId: "",
        executionGateHash: "",
        gateLanes: []
      },
      t3ApprovalExecutionGateLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshT3CertificationEvidenceClosure() {
  try {
    const closure = await apiRequest("/api/delivery/t3-certification-evidence-closure");
    setState({ t3CertificationEvidenceClosure: closure, t3CertificationEvidenceClosureLoaded: true, apiOnline: true });
  } catch {
    setState({
      t3CertificationEvidenceClosure: {
        status: "offline",
        finalGoalComplete: false,
        closureOnly: true,
        approvalRecorded: false,
        approved: false,
        executionAllowed: false,
        externalActionsExecuted: false,
        certificationStateChanged: false,
        contentReturned: false,
        laneClosureCount: 0,
        readyLaneClosureCount: 0,
        submittedEvidenceBundleCount: 0,
        validatedEvidenceBundleCount: 0,
        closureHash: "",
        laneClosures: []
      },
      t3CertificationEvidenceClosureLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshFinalDeliveryReadiness() {
  try {
    const readiness = await apiRequest("/api/delivery/final-readiness");
    setState({ finalDeliveryReadiness: readiness, finalDeliveryReadinessLoaded: true, apiOnline: true });
  } catch {
    setState({
      finalDeliveryReadiness: {
        status: "offline",
        finalGoalComplete: false,
        localEvidencePassed: false,
        artifactIntegrityPassed: false,
        objectiveTraceable: false,
        agenticPassed: false,
        blockedByT3: true,
        openT3GapCount: 3,
        readinessHash: "",
        completionAudit: { localRequirementCount: 0 },
        openCertificationGaps: []
      },
      finalDeliveryReadinessLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshDeliveryReleaseCandidate() {
  try {
    const candidate = await apiRequest("/api/delivery/release-candidate");
    setState({ deliveryReleaseCandidate: candidate, deliveryReleaseCandidateLoaded: true, apiOnline: true });
  } catch {
    setState({
      deliveryReleaseCandidate: {
        status: "offline",
        finalGoalComplete: false,
        releaseCandidateOnly: true,
        readyForHumanReview: false,
        readyForProductionRelease: false,
        localEvidenceReady: false,
        blockedByT3: true,
        openT3GapCount: 3,
        releaseCandidateHash: "",
        releaseChecks: []
      },
      deliveryReleaseCandidateLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshT3CertificationNextActions() {
  try {
    const actions = await apiRequest("/api/delivery/t3-certification-next-actions");
    setState({ t3CertificationNextActions: actions, t3CertificationNextActionsLoaded: true, apiOnline: true });
  } catch {
    setState({
      t3CertificationNextActions: {
        status: "offline",
        finalGoalComplete: false,
        nextActionsOnly: true,
        readyForHumanReview: false,
        readyForProductionRelease: false,
        executionAllowed: false,
        blockedByT3: true,
        openT3GapCount: 3,
        laneActionCount: 0,
        readyLaneActionCount: 0,
        evidenceRequirementCount: 0,
        rollbackRequirementCount: 0,
        nextActionsHash: "",
        laneActions: []
      },
      t3CertificationNextActionsLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshT3SingleLaneRunPackets() {
  try {
    const packets = await apiRequest("/api/delivery/t3-single-lane-run-packets");
    setState({ t3SingleLaneRunPackets: packets, t3SingleLaneRunPacketsLoaded: true, apiOnline: true });
  } catch {
    setState({
      t3SingleLaneRunPackets: {
        status: "offline",
        finalGoalComplete: false,
        runPacketsOnly: true,
        readyForHumanReview: false,
        readyForProductionRelease: false,
        executionAllowed: false,
        blockedByT3: true,
        openT3GapCount: 3,
        packetCount: 0,
        readyPacketCount: 0,
        evidenceRequirementCount: 0,
        rollbackRequirementCount: 0,
        runPacketBundleHash: "",
        runPackets: []
      },
      t3SingleLaneRunPacketsLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshT3RunPacketVerifier() {
  try {
    const verifier = await apiRequest("/api/delivery/t3-run-packet-verifier");
    setState({ t3RunPacketVerifier: verifier, t3RunPacketVerifierLoaded: true, apiOnline: true });
  } catch {
    setState({
      t3RunPacketVerifier: {
        status: "offline",
        finalGoalComplete: false,
        verifierOnly: true,
        verificationPassed: false,
        executionAllowed: false,
        runPacketBundleStatus: "offline",
        runPacketBundleHash: "",
        verifierHash: "",
        packetVerificationCount: 0,
        readyPacketVerificationCount: 0,
        submittedPacketCount: 0,
        verifiedPacketCount: 0,
        packetVerifications: []
      },
      t3RunPacketVerifierLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshDeliveryReviewerCockpit() {
  try {
    const cockpit = await apiRequest("/api/delivery/reviewer-cockpit");
    setState({ deliveryReviewerCockpit: cockpit, deliveryReviewerCockpitLoaded: true, apiOnline: true });
  } catch {
    setState({
      deliveryReviewerCockpit: {
        status: "offline",
        finalGoalComplete: false,
        reviewerCockpitOnly: true,
        readyForHumanReview: false,
        readyForProductionRelease: false,
        localEvidenceReady: false,
        blockedByT3: true,
        openT3GapCount: 3,
        contentReturned: false,
        sectionCount: 0,
        readySectionCount: 0,
        blockedSectionCount: 1,
        reviewerCockpitHash: "",
        sections: []
      },
      deliveryReviewerCockpitLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshDeliveryLaunchGuide() {
  try {
    const guide = await apiRequest("/api/delivery/launch-guide");
    setState({ deliveryLaunchGuide: guide, deliveryLaunchGuideLoaded: true, apiOnline: true });
  } catch {
    setState({
      deliveryLaunchGuide: {
        status: "offline",
        finalGoalComplete: false,
        launchGuideOnly: true,
        readyForLocalReview: false,
        readyForProductionRelease: false,
        localEvidenceReady: false,
        blockedByT3: true,
        openT3GapCount: 3,
        contentReturned: false,
        commandCount: 0,
        routeCount: 0,
        evidenceFileCount: 0,
        launchGuideHash: "",
        reviewCommands: [],
        reviewRoutes: []
      },
      deliveryLaunchGuideLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshDeliveryConsistencySentinel() {
  try {
    const sentinel = await apiRequest("/api/delivery/consistency-sentinel");
    setState({ deliveryConsistencySentinel: sentinel, deliveryConsistencySentinelLoaded: true, apiOnline: true });
  } catch {
    setState({
      deliveryConsistencySentinel: {
        status: "offline",
        finalGoalComplete: false,
        sentinelOnly: true,
        consistencyPassed: false,
        readyForProductionRelease: false,
        blockedByT3: true,
        openT3GapCount: 3,
        contentReturned: false,
        contradictionCount: 0,
        surfaceCount: 0,
        invariantCount: 0,
        evidenceFileCount: 0,
        consistencyHash: "",
        surfaces: [],
        invariants: []
      },
      deliveryConsistencySentinelLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshFinalAcceptanceMatrix() {
  try {
    const matrix = await apiRequest("/api/delivery/final-acceptance-matrix");
    setState({ finalAcceptanceMatrix: matrix, finalAcceptanceMatrixLoaded: true, apiOnline: true });
  } catch {
    setState({
      finalAcceptanceMatrix: {
        status: "offline",
        finalGoalComplete: false,
        acceptanceMatrixOnly: true,
        localAcceptancePassed: false,
        readyForProductionRelease: false,
        blockedByT3: true,
        openT3GapCount: 3,
        contentReturned: false,
        acceptanceRowCount: 0,
        provedRowCount: 0,
        blockedRowCount: 3,
        failedRowCount: 0,
        evidenceFileCount: 0,
        acceptanceHash: "",
        rows: []
      },
      finalAcceptanceMatrixLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshCertificationBlockerBoard() {
  try {
    const board = await apiRequest("/api/delivery/certification-blocker-board");
    setState({ certificationBlockerBoard: board, certificationBlockerBoardLoaded: true, apiOnline: true });
  } catch {
    setState({
      certificationBlockerBoard: {
        status: "offline",
        finalGoalComplete: false,
        blockerBoardOnly: true,
        localBoardPassed: false,
        readyForProductionRelease: false,
        blockedByT3: true,
        openT3GapCount: 3,
        contentReturned: false,
        blockerCount: 3,
        readyBlockerCount: 0,
        closedBlockerCount: 0,
        laneTrackCount: 3,
        nextActionCount: 3,
        evidenceFileCount: 0,
        boardHash: "",
        blockers: []
      },
      certificationBlockerBoardLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshUserAcceptanceRehearsal() {
  try {
    const rehearsal = await apiRequest("/api/delivery/user-acceptance-rehearsal");
    setState({ userAcceptanceRehearsal: rehearsal, userAcceptanceRehearsalLoaded: true, apiOnline: true });
  } catch {
    setState({
      userAcceptanceRehearsal: {
        status: "offline",
        finalGoalComplete: false,
        userAcceptanceRehearsalOnly: true,
        localUserAcceptancePassed: false,
        readyForHumanReview: false,
        readyForProductionRelease: false,
        blockedByT3: true,
        openT3GapCount: 3,
        contentReturned: false,
        rehearsalCount: 3,
        readyRehearsalCount: 0,
        blockedRehearsalCount: 0,
        evidenceFileCount: 0,
        rehearsalHash: "",
        rehearsals: []
      },
      userAcceptanceRehearsalLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshDeliveryEvidenceNavigator() {
  try {
    const navigator = await apiRequest("/api/delivery/evidence-navigator");
    setState({ deliveryEvidenceNavigator: navigator, deliveryEvidenceNavigatorLoaded: true, apiOnline: true });
  } catch {
    setState({
      deliveryEvidenceNavigator: {
        status: "offline",
        finalGoalComplete: false,
        deliveryEvidenceNavigatorOnly: true,
        localNavigationPassed: false,
        readyForHumanReview: false,
        readyForProductionRelease: false,
        blockedByT3: true,
        openT3GapCount: 3,
        contentReturned: false,
        navigationSectionCount: 5,
        readyNavigationSectionCount: 0,
        blockedNavigationSectionCount: 0,
        evidenceFileCount: 0,
        navigatorHash: "",
        sections: []
      },
      deliveryEvidenceNavigatorLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshLocalDeliverySummary() {
  try {
    const summary = await apiRequest("/api/delivery/local-summary-packet");
    setState({ localDeliverySummary: summary, localDeliverySummaryLoaded: true, apiOnline: true });
  } catch {
    setState({
      localDeliverySummary: {
        status: "offline",
        finalGoalComplete: false,
        summaryPacketOnly: true,
        localSummaryPassed: false,
        readyForHumanDelivery: false,
        readyForProductionRelease: false,
        blockedByT3: true,
        openT3GapCount: 3,
        contentReturned: false,
        summarySectionCount: 6,
        readySummarySectionCount: 0,
        blockedSummarySectionCount: 0,
        localRequirementCount: 0,
        provedCheckCount: 0,
        evidenceFileCount: 0,
        summaryHash: "",
        sections: []
      },
      localDeliverySummaryLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshLocalDeliveryHandoffBrief() {
  try {
    const brief = await apiRequest("/api/delivery/handoff-brief");
    setState({ localDeliveryHandoffBrief: brief, localDeliveryHandoffBriefLoaded: true, apiOnline: true });
  } catch {
    setState({
      localDeliveryHandoffBrief: {
        status: "offline",
        finalGoalComplete: false,
        handoffBriefOnly: true,
        localHandoffPassed: false,
        readyForUserReview: false,
        readyForProductionRelease: false,
        blockedByT3: true,
        openT3GapCount: 3,
        contentReturned: false,
        briefSectionCount: 6,
        readyBriefSectionCount: 0,
        blockedBriefSectionCount: 0,
        localCommandCount: 0,
        localRequirementCount: 0,
        provedCheckCount: 0,
        evidenceFileCount: 0,
        briefHash: "",
        sections: []
      },
      localDeliveryHandoffBriefLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshLocalDeliveryQuickstart() {
  try {
    const quickstart = await apiRequest("/api/delivery/quickstart-bundle");
    setState({ localDeliveryQuickstart: quickstart, localDeliveryQuickstartLoaded: true, apiOnline: true });
  } catch {
    setState({
      localDeliveryQuickstart: {
        status: "offline",
        finalGoalComplete: false,
        quickstartBundleOnly: true,
        localQuickstartPassed: false,
        readyForLocalRunbookReview: false,
        readyForProductionRelease: false,
        blockedByT3: true,
        openT3GapCount: 3,
        contentReturned: false,
        quickstartStepCount: 7,
        readyQuickstartStepCount: 0,
        blockedQuickstartStepCount: 0,
        localCommandCount: 0,
        localRouteCount: 0,
        localRequirementCount: 0,
        provedCheckCount: 0,
        evidenceFileCount: 0,
        quickstartHash: "",
        quickstartSteps: []
      },
      localDeliveryQuickstartLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshLocalDeliveryVerificationSuite() {
  try {
    const suite = await apiRequest("/api/delivery/local-verification-suite");
    setState({ localDeliveryVerificationSuite: suite, localDeliveryVerificationSuiteLoaded: true, apiOnline: true });
  } catch {
    setState({
      localDeliveryVerificationSuite: {
        status: "offline",
        finalGoalComplete: false,
        verificationSuiteOnly: true,
        localVerificationPassed: false,
        readyForLocalVerificationReview: false,
        readyForProductionRelease: false,
        blockedByT3: true,
        openT3GapCount: 3,
        contentReturned: false,
        verificationCheckCount: 10,
        readyVerificationCheckCount: 0,
        blockedVerificationCheckCount: 0,
        localCommandCount: 0,
        localRequirementCount: 0,
        provedCheckCount: 0,
        evidenceFileCount: 0,
        suiteHash: "",
        verificationChecks: []
      },
      localDeliveryVerificationSuiteLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshFinalLocalHandoffCheckpoint() {
  try {
    const checkpoint = await apiRequest("/api/delivery/final-local-handoff-checkpoint");
    setState({ finalLocalHandoffCheckpoint: checkpoint, finalLocalHandoffCheckpointLoaded: true, apiOnline: true });
  } catch {
    setState({
      finalLocalHandoffCheckpoint: {
        status: "offline",
        finalGoalComplete: false,
        checkpointOnly: true,
        localFinalHandoffPassed: false,
        readyForFinalLocalReview: false,
        readyForProductionRelease: false,
        blockedByT3: true,
        openT3GapCount: 3,
        contentReturned: false,
        checkpointStepCount: 8,
        readyCheckpointStepCount: 0,
        blockedCheckpointStepCount: 0,
        localCommandCount: 0,
        handoffArtifactCount: 0,
        localRequirementCount: 0,
        provedCheckCount: 0,
        checkpointHash: "",
        checkpointSteps: []
      },
      finalLocalHandoffCheckpointLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshT3EvidenceBundleTemplates() {
  try {
    const templates = await apiRequest("/api/delivery/t3-evidence-bundle-templates");
    setState({ t3EvidenceBundleTemplates: templates, t3EvidenceBundleTemplatesLoaded: true, apiOnline: true });
  } catch {
    setState({
      t3EvidenceBundleTemplates: {
        status: "offline",
        finalGoalComplete: false,
        templateOnly: true,
        executionAllowed: false,
        laneTemplateCount: 0,
        readyLaneTemplateCount: 0,
        evidenceItemCount: 0,
        rollbackResultCount: 0,
        templateBundleHash: "",
        laneTemplates: []
      },
      t3EvidenceBundleTemplatesLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshT3OperatorChecklist() {
  try {
    const checklist = await apiRequest("/api/delivery/t3-operator-checklist");
    setState({ t3OperatorChecklist: checklist, t3OperatorChecklistLoaded: true, apiOnline: true });
  } catch {
    setState({
      t3OperatorChecklist: {
        status: "offline",
        finalGoalComplete: false,
        operatorOnly: true,
        executionAllowed: false,
        laneChecklistCount: 0,
        readyLaneChecklistCount: 0,
        manualStepCount: 0,
        evidenceItemCount: 0,
        rollbackItemCount: 0,
        checklistBundleHash: "",
        laneChecklists: []
      },
      t3OperatorChecklistLoaded: true,
      apiOnline: false
    });
  }
}

async function refreshT3OperatorTranscriptValidator() {
  try {
    const validator = await apiRequest("/api/delivery/t3-operator-transcript-validator");
    setState({ t3OperatorTranscriptValidator: validator, t3OperatorTranscriptValidatorLoaded: true, apiOnline: true });
  } catch {
    setState({
      t3OperatorTranscriptValidator: {
        status: "offline",
        finalGoalComplete: false,
        validatorOnly: true,
        executionAllowed: false,
        laneValidationCount: 0,
        readyLaneValidationCount: 0,
        submittedTranscriptCount: 0,
        validatedTranscriptCount: 0,
        transcriptValidatorHash: "",
        laneValidations: []
      },
      t3OperatorTranscriptValidatorLoaded: true,
      apiOnline: false
    });
  }
}

function renderModelContractPanel() {
  const contract = state.modelContracts;
  if (!contract) return "";
  const runtime = state.modelRuntime;
  const provider = state.modelProvider || contract.provider;
  return `
    <div class="model-contract">
      <div>
        <span>模型路由契约</span>
        <strong>${escapeHtml(contract.coding.primaryModel)} → ${escapeHtml(contract.coding.fallbackModel)}</strong>
        <small>超过 ${contract.coding.fallbackAfterMs}ms 自动降级；密钥不落盘</small>
      </div>
      <div>
        <span>生图路径</span>
        <strong>${escapeHtml(contract.image.model)}</strong>
        <small>${escapeHtml(contract.image.separationRule)}</small>
      </div>
      <div>
        <span>学生安全</span>
        <strong>${contract.studentSafety.minorSafeMode ? "未成年人安全模式" : "普通模式"}</strong>
        <small>不展示模型原始隐性推理</small>
      </div>
      <div>
        <span>运行路由证据</span>
        <strong>${runtime ? escapeHtml(runtime.selectedModel) : "等待 AI 提示"}</strong>
        <small>${runtime ? `${runtime.path} · ${runtime.fallbackUsed ? "fallback" : "primary"} · ${runtime.observedPrimaryLatencyMs ?? "-"}ms` : "生成提示后记录 selectedModel/fallback"}</small>
      </div>
      <div data-provider-status>
        <span>Provider adapter</span>
        <strong>${escapeHtml(provider?.mode || provider?.defaultMode || "local-simulated")}</strong>
        <small>${provider?.configured ? "environment key configured" : "no key stored or returned"} 路 ${provider?.transport?.dryRunOnly !== false ? "dry-run safe" : "live enabled"}</small>
      </div>
    </div>
  `;
}

function runSubmissionSelfCheck() {
  const lines = state.code.split(/\n/).filter((line) => line.trim()).length;
  const hasPrint = /print|cout|printf/.test(state.code);
  const hasVersion = state.versions.length > 0;
  const checklist = [
    `AI自检完成：代码 ${lines} 行`,
    hasPrint ? "已检测到输出语句，可以解释运行结果" : "建议补充输出语句，方便教师批阅",
    hasVersion ? "已有云端版本，可提交" : "请先保存一个版本",
    "提交前请用 3 句话说明分解、抽象、调试证据"
  ];
  setState({
    console: [...checklist, ...state.console].slice(0, 8),
    submissionStatus: hasPrint && hasVersion ? "AI自检通过，可提交" : "AI自检有待完善"
  });
}

function replayToLines(events = []) {
  return events.slice(-8).map((event) => `${new Date(event.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} #${event.sequence || "-"} ${event.message}`);
}

function collabWsUrl(roomId) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.host}/ws/collab/${encodeURIComponent(roomId)}`;
}

function applyCollabSnapshot(data, status = "WebSocket live") {
  if (data.action === "join") collabSocketJoined = true;
  setState({
    apiOnline: true,
    collabRoom: data.room,
    collabPresence: data.presence || data.room?.presence || [],
    collabEvents: replayToLines(data.replay || data.room?.events || []),
    collabProtocolStatus: data.action === "turn" ? "WebSocket turn synced" : data.action === "event" ? "WebSocket event synced" : "WebSocket room synced",
    collabLiveStatus: status
  });
}

function ensureCollabSocket(roomId = "pair-demo") {
  if (!("WebSocket" in window) || location.protocol === "file:") return false;
  if (collabSocket && collabSocketRoom === roomId && [WebSocket.CONNECTING, WebSocket.OPEN].includes(collabSocket.readyState)) {
    return collabSocket.readyState === WebSocket.OPEN;
  }
  collabSocketRoom = roomId;
  collabSocketJoined = false;
  collabSocket = new WebSocket(collabWsUrl(roomId));
  collabSocket.addEventListener("open", () => {
    setState({ collabLiveStatus: "WebSocket live", collabProtocolStatus: "WebSocket connected" });
  });
  collabSocket.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "snapshot" || data.type === "room:update") applyCollabSnapshot(data);
      if (data.type === "pong") setState({ collabLiveStatus: "WebSocket live" });
    } catch {
      setState({ collabLiveStatus: "WebSocket parse warning" });
    }
  });
  collabSocket.addEventListener("close", () => {
    if (collabSocketRoom === roomId) setState({ collabLiveStatus: "HTTP replay fallback" });
  });
  collabSocket.addEventListener("error", () => {
    setState({ collabLiveStatus: "HTTP replay fallback" });
  });
  return false;
}

function sendCollabSocket(payload) {
  ensureCollabSocket("pair-demo");
  if (!collabSocket || collabSocket.readyState !== WebSocket.OPEN) return false;
  collabSocket.send(JSON.stringify(payload));
  return true;
}

async function joinPairRoom() {
  try {
    await ensureSession("student");
    const wsPayload = { type: "join", actor: "student-linyi", name: "林一诺", role: state.pairMode === "ai" ? "driver" : "navigator" };
    if (sendCollabSocket(wsPayload)) {
      collabSocketJoined = true;
      setState({ collabLiveStatus: "WebSocket live", collabProtocolStatus: "WebSocket join sent" });
      return;
    }
    const data = await apiRequest("/api/collab/rooms/pair-demo/join", {
      method: "POST",
      body: JSON.stringify({ actor: "student-linyi", name: "林一诺", role: state.pairMode === "ai" ? "driver" : "navigator" })
    });
    setState({
      apiOnline: true,
      collabRoom: data.room,
      collabPresence: data.presence,
      collabEvents: replayToLines(data.replay),
      collabProtocolStatus: "已加入协作房间，Replay 已同步"
    });
    return;
  } catch {
    state.apiOnline = false;
  }
  setState({ collabProtocolStatus: "离线模式：房间操作待同步" });
}

async function rotatePairRole() {
  const current = state.collabRoom?.turn || { driver: "student-linyi", navigator: "ai-turtle" };
  try {
    await ensureSession("student");
    if (!collabSocketJoined) sendCollabSocket({ type: "join", actor: "student-linyi", name: "林一诺", role: state.pairMode === "ai" ? "driver" : "navigator" });
    if (sendCollabSocket({ type: "turn", actor: "student-linyi", driver: current.navigator, navigator: current.driver })) {
      setState({ pairMode: state.pairMode === "ai" ? "student" : "ai", collabLiveStatus: "WebSocket live", collabProtocolStatus: "WebSocket turn sent" });
      return;
    }
    const data = await apiRequest("/api/collab/rooms/pair-demo/turn", {
      method: "POST",
      body: JSON.stringify({ driver: current.navigator, navigator: current.driver })
    });
    setState({
      apiOnline: true,
      pairMode: state.pairMode === "ai" ? "student" : "ai",
      collabRoom: data.room,
      collabPresence: data.presence,
      collabEvents: replayToLines(data.replay),
      collabProtocolStatus: "角色轮换完成，协作事件已编号"
    });
    return;
  } catch {
    state.apiOnline = false;
  }
  setState({ pairMode: state.pairMode === "ai" ? "student" : "ai", collabProtocolStatus: "离线轮换已缓存" });
}

async function submitCurrentWork() {
  const assignment = state.assignment || fallbackAssignment;
  const latestVersion = state.versions[state.versions.length - 1];
  const payload = {
    assignmentId: assignment.id,
    studentId: "student-linyi",
    studentName: "林一诺",
    projectId: "current",
    versionId: latestVersion?.id,
    language: state.currentLanguage,
    code: state.code,
    selfCheck: {
      runs: state.console.some((line) => String(line).includes("运行")) ? 2 : 1,
      savedVersion: Boolean(latestVersion),
      explanationReady: true,
      aiReviewed: state.submissionStatus.includes("自检")
    }
  };
  try {
    await ensureSession("student");
    const data = await apiRequest("/api/submissions", { method: "POST", body: JSON.stringify(payload) });
    setState({
      apiOnline: true,
      submissions: data.submissions,
      submissionStatus: "已提交，等待教师批阅",
      collabEvents: [`${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 提交作品进入教师批阅队列`, ...state.collabEvents].slice(0, 5)
    });
    return;
  } catch {
    state.apiOnline = false;
  }
  const localSubmission = {
    id: `local-sub-${Date.now()}`,
    ...payload,
    status: "submitted",
    score: null,
    feedback: "离线提交已缓存，联网后同步给教师。",
    submittedAt: new Date().toISOString()
  };
  setState({
    submissions: [...state.submissions, localSubmission],
    submissionStatus: "离线提交已缓存",
    collabEvents: [`${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 离线提交已缓存`, ...state.collabEvents].slice(0, 5)
  });
}

async function reviewSubmission(id, score) {
  const feedback = score >= 90
    ? "已通过：图形、解释和调试证据完整，请继续挑战迁移任务。"
    : "需要辅导：请补充一次边界测试，并说明为什么当前输出可信。";
  try {
    await ensureSession("teacher");
    const data = await apiRequest(`/api/teacher/submissions/${id}/review`, {
      method: "POST",
      body: JSON.stringify({ score, status: "reviewed", feedback })
    });
    setState({ apiOnline: true, submissions: data.submissions });
    return;
  } catch {
    state.apiOnline = false;
  }
  setState({
    submissions: state.submissions.map((item) => item.id === id
      ? { ...item, status: "reviewed", score, feedback, reviewedAt: new Date().toISOString() }
      : item)
  });
}

function bindEvents() {
  document.querySelectorAll("[data-role]").forEach((button) => {
    button.addEventListener("click", () => setState({ role: button.dataset.role }));
  });
  document.querySelectorAll("[data-enter]").forEach((button) => {
    button.addEventListener("click", () => setState({ route: button.dataset.enter === "teacher" ? "teacher" : "student" }));
  });
  document.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      location.hash = button.dataset.route;
      setState({ route: button.dataset.route });
    });
  });
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.addEventListener("click", () => switchLanguage(button.dataset.language));
  });
  const code = document.querySelector("[data-code]");
  if (code) code.addEventListener("input", (event) => {
    state.code = event.target.value;
    state.cloudStatus = "本地编辑中";
    saveState();
  });
  const run = document.querySelector("[data-run]");
  if (run) run.addEventListener("click", runCode);
  const save = document.querySelector("[data-save]");
  if (save) save.addEventListener("click", saveVersion);
  const download = document.querySelector("[data-download]");
  if (download) download.addEventListener("click", downloadProject);
  const upload = document.querySelector("[data-upload]");
  if (upload) upload.addEventListener("change", uploadProject);
  document.querySelectorAll("[data-version]").forEach((button) => {
    button.addEventListener("click", () => restoreVersion(button.dataset.version));
  });
  document.querySelectorAll("[data-ai-tab]").forEach((button) => {
    button.addEventListener("click", () => setState({ aiTab: button.dataset.aiTab }));
  });
  document.querySelectorAll("[data-ai-suggest]").forEach((button) => {
    button.addEventListener("click", () => addAiSuggestion(button.dataset.aiSuggest));
  });
  const pair = document.querySelector("[data-toggle-pair]");
  if (pair) pair.addEventListener("click", () => setState({ pairMode: state.pairMode === "ai" ? "student" : "ai" }));
  const joinRoom = document.querySelector("[data-join-room]");
  if (joinRoom) joinRoom.addEventListener("click", joinPairRoom);
  const rotateRole = document.querySelector("[data-rotate-role]");
  if (rotateRole) rotateRole.addEventListener("click", rotatePairRole);
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => setState({ teacherFilter: button.dataset.filter }));
  });
  mountClassroomWorkflow();
  if (state.route === "student") requestAnimationFrame(() => ensureCollabSocket("pair-demo"));
}

function switchLanguage(lang) {
  const snippets = {
    python: seedCode,
    cpp: `#include <iostream>
using namespace std;

int gcd(int a, int b) {
  while (b != 0) {
    int t = a % b;
    a = b;
    b = t;
  }
  return a;
}

int main() {
  cout << "gcd(24, 18)=" << gcd(24, 18) << endl;
  return 0;
}`,
    c: `#include <stdio.h>

int main() {
  int score = 92;
  if (score >= 90) {
    printf("计算思维挑战：优秀\\n");
  } else {
    printf("继续调试与优化\\n");
  }
  return 0;
}`
  };
  setState({
    currentLanguage: lang,
    code: snippets[lang],
    console: [`已切换到 ${langLabel(lang)} 模式`, "请运行并观察输出"],
    cloudStatus: "本地编辑中"
  });
}

function runCode() {
  runCodeAsync();
}

async function runCodeAsync() {
  try {
    const created = await apiRequest("/api/run/jobs", {
      method: "POST",
      body: JSON.stringify({ language: state.currentLanguage, code: state.code })
    });
    let job = created.job;
    for (let attempt = 0; attempt < 5 && job && !job.terminal; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const next = await apiRequest(`/api/run/jobs/${job.id}`);
      job = next.job;
    }
    const result = job?.result || created.result;
    const runner = job?.runner || result?.runnerDiagnostics;
    const runnerLabel = runner?.engine ? `${runner.engine}/${runner.isolation}` : "local-runner";
    setState({
      lastRunJob: job || state.lastRunJob,
      console: [`Sandbox job ${job?.id || "local"}: ${job?.status || result.status} · ${job?.progress ?? 100}% via ${runnerLabel}`, `API sandbox output: ${result.stdout || result.stderr || result.status}`, `Duration ${result.durationMs}ms`],
      cloudStatus: "运行结果已记录",
      apiOnline: true
    });
    return;
  } catch {
    state.apiOnline = false;
  }
  const output = [];
  if (state.currentLanguage === "python") {
    output.push("Python/Pyodide 模拟运行完成");
    const prints = [...state.code.matchAll(/print\((["'`])(.+?)\1\)/g)].map((match) => match[2]);
    output.push(...(prints.length ? prints : ["Canvas 已更新：海龟轨迹生成成功"]));
  } else {
    output.push(`${langLabel(state.currentLanguage)} 安全沙箱模拟运行完成`);
    output.push(state.currentLanguage === "cpp" ? "gcd(24, 18)=6" : "计算思维挑战：优秀");
  }
  setState({ console: output, cloudStatus: "运行结果已记录" });
}

function saveVersion() {
  saveVersionAsync();
}

async function saveVersionAsync() {
  try {
    const data = await apiRequest("/api/projects/current/versions", {
      method: "POST",
      body: JSON.stringify({
        label: `${langLabel(state.currentLanguage)} 云端保存`,
        language: state.currentLanguage,
        code: state.code
      })
    });
    setState({
      versions: data.versions,
      selectedVersion: data.version.id,
      cloudStatus: "API云端已同步",
      apiOnline: true
    });
    return;
  } catch {
    state.apiOnline = false;
  }
  const time = new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  const version = {
    id: `v${Date.now()}`,
    label: `${langLabel(state.currentLanguage)} 自动保存`,
    language: state.currentLanguage,
    savedAt: time,
    code: state.code
  };
  setState({
    versions: [...state.versions, version],
    selectedVersion: version.id,
    cloudStatus: "已同步"
  });
}

function restoreVersion(id) {
  const version = state.versions.find((item) => item.id === id);
  if (!version) return;
  setState({
    selectedVersion: id,
    currentLanguage: version.language,
    code: version.code,
    console: [`已恢复版本：${version.label} · ${version.savedAt}`],
    cloudStatus: "已同步"
  });
}

function downloadProject() {
  const extension = { python: "py", cpp: "cpp", c: "c" }[state.currentLanguage];
  const payload = {
    app: "CodeX / AI小海龟",
    language: state.currentLanguage,
    exportedAt: new Date().toISOString(),
    code: state.code,
    versions: state.versions
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `codex-ai-turtle-project.${extension}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  setState({ console: ["已生成本地下载包", `文件扩展：.${extension}.json`] });
}

function uploadProject(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || "");
    let code = text;
    let language = state.currentLanguage;
    try {
      const parsed = JSON.parse(text);
      code = parsed.code || text;
      language = parsed.language || language;
    } catch {
      if (file.name.endsWith(".cpp")) language = "cpp";
      if (file.name.endsWith(".c")) language = "c";
      if (file.name.endsWith(".py")) language = "python";
    }
    setState({
      code,
      currentLanguage: language,
      console: [`已上传：${file.name}`, "可以继续编辑并保存云端版本"],
      cloudStatus: "待同步"
    });
  };
  reader.readAsText(file, "utf-8");
}

function addAiSuggestion(type) {
  addAiSuggestionAsync(type);
}

async function addAiSuggestionAsync(type) {
  try {
    const reply = await apiRequest("/api/ai/tutor/message", {
      method: "POST",
      body: JSON.stringify({
        tutorRole: type === "review" ? "reviewer" : "turtle",
        code: state.code,
        message: type === "review" ? "请审查当前代码" : "请帮助我拆解任务",
        ctFocus: type === "review" ? ["验证优化"] : ["分解"]
      })
    });
    const collab = await apiRequest("/api/collab/events", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "pair-demo",
        actor: reply.role,
        type: "ai_hint",
        message: reply.message
      })
    });
      setState({
        apiOnline: true,
        modelRuntime: reply.modelRoute || state.modelRuntime,
        console: [`${reply.role}：${reply.message}`, `Model route: ${reply.modelRoute?.selectedModel || "local"} / ${reply.modelRoute?.reason || "offline"}`, reply.explanationSummary, ...state.console].slice(0, 6),
        collabEvents: collab.events.map((event) => `${new Date(event.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} ${event.message}`).slice(-5).reverse()
      });
    return;
  } catch {
    state.apiOnline = false;
  }
  const message = type === "review"
    ? "智伴导师：请先添加一个不同输入的测试，再解释为什么输出正确。"
    : "小龟导师：把任务拆成“画外圈、画指针、输出提示”三步，再逐步实现。";
  setState({
    console: [message, ...state.console].slice(0, 5),
    collabEvents: [`${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} AI 生成支架提示`, ...state.collabEvents].slice(0, 5)
  });
}

function exportReport() {
  exportReportAsync();
}

async function exportReportAsync() {
  setState({ exportPreviewText: "Exporting..." });
  let report = {
    className: "初二 3 班",
    generatedAt: new Date().toISOString(),
    dimensions: ["抽象", "分解", "建模", "算法设计", "验证优化", "迁移"],
    aiLogs: state.aiLogs,
    projects: state.projects,
    runCount: state.lastRunJob ? 1 : 0,
    reviewedSubmissionCount: (state.submissions || []).filter((item) => item.status === "reviewed").length,
    collabRoomCount: state.collabRoom ? 1 : 0,
    modelRouteCount: 0,
    providerEvidenceCount: 0,
    terminalRunJobCount: state.lastRunJob?.terminal ? 1 : 0,
    runnerBoundaryCount: state.lastRunJob?.runner ? 1 : 0,
    sandboxIsolationCount: state.lastRunJob?.runner?.engine === "sandbox-runner-v2" ? 1 : 0
  };
  try {
    report = await apiRequest("/api/reports/export", { method: "POST", body: "{}" });
    setState({ apiOnline: true, exportPreviewText: JSON.stringify(report, null, 2) });
    return;
  } catch {
    setState({ apiOnline: false, exportPreviewText: JSON.stringify(report, null, 2) });
    return;
  }
}

function drawPreview() {
  const canvas = document.querySelector("#turtle-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#f4fbff");
  bg.addColorStop(1, "#fff6e4");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#d8e7f7";
  ctx.lineWidth = 1;
  for (let x = 20; x < width; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 20; y < height; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  if (state.currentLanguage !== "python") {
    ctx.fillStyle = "#1f2a44";
    ctx.font = "700 26px Arial";
    ctx.fillText(`${langLabel(state.currentLanguage)} 控制台输出`, 140, 145);
    ctx.font = "18px Arial";
    ctx.fillText(state.currentLanguage === "cpp" ? "gcd(24, 18)=6" : "计算思维挑战：优秀", 165, 190);
    return;
  }

  let x = width / 2;
  let y = height / 2 + 40;
  let angle = -90;
  let color = "#4A90E2";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const commands = state.code.split(/\n+/);
  commands.forEach((line) => {
    const trimmed = line.trim();
    const colorMatch = trimmed.match(/color\(["'](.+?)["']\)/);
    if (colorMatch) color = colorMatch[1];
    const forward = trimmed.match(/forward\((\d+)\)/);
    if (forward) {
      const distance = Number(forward[1]);
      const nx = x + Math.cos((angle * Math.PI) / 180) * distance;
      const ny = y + Math.sin((angle * Math.PI) / 180) * distance;
      ctx.strokeStyle = color;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      x = nx;
      y = ny;
    }
    const left = trimmed.match(/left\((\d+)\)/);
    if (left) angle -= Number(left[1]);
    const right = trimmed.match(/right\((\d+)\)/);
    if (right) angle += Number(right[1]);
    const circle = trimmed.match(/circle\((\d+)\)/);
    if (circle) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(x, y, Number(circle[1]), 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  ctx.fillStyle = "#F5A623";
  ctx.beginPath();
  ctx.arc(x, y, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#17355f";
  ctx.font = "700 13px Arial";
  ctx.fillText("AI", x - 8, y + 5);
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

document.addEventListener("click", (event) => {
  const exportButton = event.target.closest?.("[data-export-report]");
  if (exportButton) exportReport();
});

render();
bootstrapFromApi();
loadModelContractsFromApi();
loadModelProviderStatusFromApi();
