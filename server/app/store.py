"""
作品/版本持久化（S2-4 §4.3）。开发用 SQLite（stdlib，无依赖）；生产迁 PostgreSQL。
小文本（源码/积木状态）入库；大二进制资源（S7）再走对象存储。
"""
import os
import sqlite3
import time
import threading

# Resolve before any import-time initialization. Tests inject an owned path before
# importing app; normal startup keeps the existing default and migrations.
DB_PATH = os.environ.get("JIEDUI_DB_PATH", os.path.join(os.path.dirname(__file__), "..", "jiedui.db"))
if not DB_PATH.strip():
    raise ValueError("JIEDUI_DB_PATH must not be empty")
_lock = threading.Lock()


class EvidenceRetentionError(RuntimeError):
    """Raised when ordinary project deletion would break an evidence pointer."""


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    # SQLite 默认关闭外键约束，而且该开关是“每个连接”独立的。证据链依赖
    # task_attempts → evidence_items → inference_evidence 的引用完整性，不能只在
    # 初始化连接上开启后就假定后续请求也会继承。
    c.execute("PRAGMA foreign_keys=ON")
    if c.execute("PRAGMA foreign_keys").fetchone()[0] != 1:
        c.close()
        raise RuntimeError("SQLite foreign key enforcement is unavailable")
    c.execute("PRAGMA journal_mode=WAL")
    return c


def init():
    with _lock, _conn() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS projects(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              owner_id TEXT NOT NULL,
              title TEXT NOT NULL,
              language TEXT NOT NULL,
              latest_version INTEGER DEFAULT 0,
              created_at INTEGER, updated_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS project_versions(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              project_id INTEGER NOT NULL,
              version_no INTEGER NOT NULL,
              code TEXT, block_state TEXT, created_at INTEGER,
              FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_proj_owner ON projects(owner_id);
            CREATE INDEX IF NOT EXISTS idx_ver_proj ON project_versions(project_id);
            CREATE TABLE IF NOT EXISTS ct_events(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id TEXT NOT NULL,
              type TEXT NOT NULL,          -- run/error/fix/ai_help/role_switch/save/edit/design_create
              detail TEXT, project_id INTEGER, ts INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_ct_user ON ct_events(user_id, ts);
            CREATE TABLE IF NOT EXISTS design_artifacts(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              project_id INTEGER NOT NULL, owner_id TEXT NOT NULL,
              type TEXT NOT NULL,          -- flow | pseudocode
              payload TEXT, created_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_design_proj ON design_artifacts(project_id);
            CREATE TABLE IF NOT EXISTS guardian_consents(
              user_id TEXT PRIMARY KEY, guardian TEXT, consent_at INTEGER, withdrawn_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS risk_events(
              id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, category TEXT,
              level INTEGER, detail TEXT, handled INTEGER DEFAULT 0, created_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS usage_sessions(
              user_id TEXT PRIMARY KEY, total_seconds INTEGER DEFAULT 0, last_at INTEGER
            );
            -- 里程碑：一生只弹一次。放服务端而不是 localStorage —— 放本地的话，
            -- 学生换台机器或清一次缓存就能重刷动画；一旦可重刷，它就从「能力确认」
            -- 退化成「可反复触发的奖励」，那正是效度红线要避免的东西。
            -- 本表**不参与任何 ct_* 计算**。
            CREATE TABLE IF NOT EXISTS milestones(
              user_id TEXT NOT NULL,
              kind TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              PRIMARY KEY(user_id, kind)
            );
            """
        )
        # 本仓一律 CREATE TABLE IF NOT EXISTS，**不会** ALTER 已存在的表，
        # 而老师机器上的 jiedui.db 有真实数据不能删库重建 → 加列走幂等迁移。
        # 已有行默认 sv=1（旧埋点语义），新插入的由 add_ct_event 写 2。
        _add_column(c, "ct_events", "sv", "INTEGER DEFAULT 1")
        # 教学轮标注（T1-6）：事件发生时该 room 若有进行中的 learning_round 就带上其轮号，
        # 可空 —— 轮外/无房间的事件本来就不属于任何一轮，NULL 是真值不是缺数据。
        _add_column(c, "ct_events", "round_index", "INTEGER")
        # 结对房间号（终审 #3）：round_index 只记「第几轮」，不记「哪个房间」——
        # 同一学生跨房间的行为流没法按房间切分（hop 渐退度量、互动占比都需要房间维度）。
        # 可空：无房间的事件（个人练习）room_id 为 NULL，同样是真值不是缺数据。
        _add_column(c, "ct_events", "room_id", "TEXT")
        # role_switch 语义（终审 R+3 批次④，第四波 Zhong2017 修正的无争议部分）：
        # forced=强制轮换 / negotiated=协商轮换。**独立列**而不是 detail 前缀 ——
        # detail 是自由文本，往里塞结构化语义等于把将来要按值分组的字段埋进字符串。
        # 六维公式**不消费**本列（消费=动公式=升 FORMULA_VERSION，红线）；
        # 它是轮换机制分析的数据源（Zhong et al. 2017：半自由协商的轮换效果最优）。
        _add_column(c, "ct_events", "switch_reason", "TEXT")
        # 创作情境协变量（lang / edit_mode）—— 补的是一个**构念效度**的窟窿，不是新功能：
        # `design_create` 只在「Python 且积木模式」下才可能触发（web IdeView.vue 的
        # v-if="lang==='python' && pyMode==='block'"），而它扛着 model 维 70%、decompose 25%、
        # abstract（研究口径）30%。于是写文本 Python 或写 C++ 的学生 model 被钉死在
        # 0.3·sat(runs,40)（典型 16，上限 30）—— 该维有相当部分在测「你选了哪个编辑器」。
        # 若模式选择与组别或先前经验相关（很可能：有基础者更倾向直接敲代码），
        # 组间比较就被选择偏差系统性污染，而事后**无法区分**「没建模」与「在代码模式下做了但测不到」。
        # 落独立列而不是塞 detail：同 switch_reason 的既定纪律。六维公式**不消费**这两列
        # （公式按事件类型名取数，加列是惰性的，不动 FORMULA_VERSION）；它们只作分析期协变量。
        # 不适用的事件（如教师端、无 IDE 情境）为 NULL —— NULL 是真值，不是缺数据。
        _add_column(c, "ct_events", "lang", "TEXT")        # python | cpp | c
        _add_column(c, "ct_events", "edit_mode", "TEXT")   # block | code
        # 会话边界（防沉迷）：原来只有累计值，客户端不发就是 0、连发就任意膨胀
        _add_column(c, "usage_sessions", "session_start", "INTEGER DEFAULT 0")
        _add_column(c, "usage_sessions", "session_seconds", "INTEGER DEFAULT 0")
        _add_column(c, "usage_sessions", "beat_count", "INTEGER DEFAULT 0")
        # 房间维索引（《观察表与评分金标准_定稿》§A14 P0-5 / §A15「上线前先补 idx_ct_room」）：
        # 原来只有 idx_ct_user(user_id, ts)，按 room 聚合要全表扫 —— T1 席位对齐要对**每个
        # 观察窗**做一次 (room_id, ts∈窗) 查询，22 对 × 3 轮 × 6 课次就是几百次全表扫。
        # 纯加索引：不动列、不动六维公式。必须放在 room_id 加列之后。
        c.execute("CREATE INDEX IF NOT EXISTS idx_ct_room ON ct_events(room_id, ts)")


def _add_column(c, table: str, col: str, decl: str):
    cols = {r[1] for r in c.execute(f"PRAGMA table_info({table})")}
    if col not in cols:
        c.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")   # SQLite 下是 O(1) 元数据操作


# —— 监护人同意 ——
def has_consent(user_id: str) -> bool:
    with _conn() as c:
        r = c.execute("SELECT consent_at, withdrawn_at FROM guardian_consents WHERE user_id=?", (user_id,)).fetchone()
        return bool(r and r["consent_at"] and not r["withdrawn_at"])


def consent_ok_map(user_ids) -> dict:
    """一批学生的**实时**同意状态。给课题详情/流失表/导出用 ——
    它们曾读 study_members.consent_ok（下发前测那一刻的冻结值），而现实顺序恰恰是
    「先发前测 → 告警出现 → 老师才去开通」：冻结值永不刷新，告警永不消失，
    流失表把 consent_ok 记成 0。同意状态是**权限事实**，必须实时读。"""
    ids = [u for u in dict.fromkeys(user_ids) if u]
    if not ids:
        return {}
    q = ",".join("?" * len(ids))
    with _conn() as c:
        rows = c.execute(f"SELECT user_id, consent_at, withdrawn_at FROM guardian_consents"
                         f" WHERE user_id IN ({q})", ids).fetchall()
    ok = {r["user_id"]: bool(r["consent_at"] and not r["withdrawn_at"]) for r in rows}
    return {u: ok.get(u, False) for u in ids}


def grant_consent(user_id: str, guardian: str, granted_by: str = ""):
    """登记监护人同意。`granted_by` 记下是谁确认的（应为教师账号），便于审计追责。

    `consent_at` 是**首次核验**的时间戳，重复开通（老师批量点两次是常态）不许覆盖 ——
    它是审计凭证：「这名学生的监护人授权是什么时候核验的」。
    只有**撤回后重新授权**才更新（那是一次新的核验事件）。
    """
    with _lock, _conn() as c:
        c.execute(
            "INSERT INTO guardian_consents(user_id,guardian,consent_at,withdrawn_at) VALUES(?,?,?,NULL) "
            "ON CONFLICT(user_id) DO UPDATE SET"
            " guardian=CASE WHEN guardian_consents.withdrawn_at IS NULL"
            "   THEN guardian_consents.guardian ELSE excluded.guardian END,"
            " consent_at=CASE WHEN guardian_consents.withdrawn_at IS NULL"
            "   THEN guardian_consents.consent_at ELSE excluded.consent_at END,"
            " withdrawn_at=NULL",
            (user_id, f"{guardian}｜经办:{granted_by}" if granted_by else guardian, _now()),
        )


def consent_rows():
    with _conn() as c:
        rows = c.execute("SELECT * FROM guardian_consents ORDER BY consent_at DESC").fetchall()
        return [dict(r) for r in rows]


def withdraw_consent(user_id: str):
    with _lock, _conn() as c:
        now = _now()
        c.execute("UPDATE guardian_consents SET withdrawn_at=? WHERE user_id=?", (now, user_id))
        # Same transaction: even immediate re-consent must not revive old sessions.
        # The table guard keeps base-store-only imports/older installations additive.
        if c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pair_sessions'").fetchone():
            c.execute("UPDATE pair_rounds SET ended_at=? WHERE ended_at IS NULL AND session_id IN"
                      " (SELECT session_id FROM pair_sessions WHERE student_id=?)", (now, user_id))
            c.execute("UPDATE pair_sessions SET status='revoked',revoked_at=COALESCE(revoked_at,?),"
                      " ended_at=COALESCE(ended_at,?) WHERE student_id=?", (now, now, user_id))


# —— 高危事件 ——
def add_risk_event(user_id: str, category: str, level: int, detail: str):
    with _lock, _conn() as c:
        c.execute("INSERT INTO risk_events(user_id,category,level,detail,created_at) VALUES(?,?,?,?,?)",
                  (user_id, category, level, detail, _now()))


def list_risk_events(limit: int = 100):
    with _conn() as c:
        rows = c.execute("SELECT * FROM risk_events ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]


# —— 使用时长 ——
SESSION_GAP = 300        # 5 分钟无心跳 = 新会话
MIN_BEAT = 20            # 两次心跳的最小间隔（按**服务端**时钟），更密的直接丢


def add_usage(user_id: str, seconds: int) -> dict:
    """记学习时长，并维护会话边界。

    原来是 `total_seconds += 客户端自报值`，没有 session 概念、不限频次：
    不发心跳 = 用时 0，连发 = 任意膨胀。这不是完美防伪（学生仍可少发把时长做低），
    但**膨胀方向**才是研究报告里会被质疑的方向，必须堵掉。
    做法：以服务端时钟算的间隔为准，客户端自报值只当上限。
    """
    now = _now()
    with _lock, _conn() as c:
        r = c.execute("SELECT total_seconds,last_at,session_start,session_seconds "
                      "FROM usage_sessions WHERE user_id=?", (user_id,)).fetchone()
        if not r:
            c.execute("INSERT INTO usage_sessions(user_id,total_seconds,last_at,"
                      "session_start,session_seconds,beat_count) VALUES(?,?,?,?,?,1)",
                      (user_id, seconds, now, now, seconds))
            return {"session_seconds": seconds, "total": seconds}

        gap = now - (r["last_at"] or 0)
        if gap < MIN_BEAT:                      # 刷心跳：不计
            return {"session_seconds": r["session_seconds"] or 0, "total": r["total_seconds"]}
        delta = max(0, min(seconds, gap))       # 客户端自报值只作上限
        if gap > SESSION_GAP:                   # 隔太久 → 新会话
            c.execute("UPDATE usage_sessions SET total_seconds=total_seconds+?, last_at=?, "
                      "session_start=?, session_seconds=?, beat_count=1 WHERE user_id=?",
                      (delta, now, now, delta, user_id))
            return {"session_seconds": delta, "total": r["total_seconds"] + delta}
        c.execute("UPDATE usage_sessions SET total_seconds=total_seconds+?, last_at=?, "
                  "session_seconds=session_seconds+?, beat_count=beat_count+1 WHERE user_id=?",
                  (delta, now, delta, user_id))
        return {"session_seconds": (r["session_seconds"] or 0) + delta,
                "total": r["total_seconds"] + delta}


# —— 里程碑（一生一次；不参与任何 ct_* 计算）——
MILESTONE_KINDS = ("first_run", "first_fix", "first_swap", "first_blocks3")


def claim_milestone(user_id: str, kind: str) -> bool:
    """首次达成返回 True 并落库；重复调用返回 False（主键天然去重）。"""
    if kind not in MILESTONE_KINDS:
        return False
    with _lock, _conn() as c:
        cur = c.execute("INSERT OR IGNORE INTO milestones(user_id,kind,created_at) VALUES(?,?,?)",
                        (user_id, kind, _now()))
        return cur.rowcount == 1


def list_milestones(user_id: str) -> list:
    with _conn() as c:
        return [r["kind"] for r in c.execute(
            "SELECT kind FROM milestones WHERE user_id=? ORDER BY created_at", (user_id,)).fetchall()]


def get_usage(user_id: str) -> int:
    with _conn() as c:
        r = c.execute("SELECT total_seconds FROM usage_sessions WHERE user_id=?", (user_id,)).fetchone()
        return r["total_seconds"] if r else 0


_ROSTER_SQL_FULL = """
            SELECT uid, MAX(t) AS last_at FROM (
              SELECT user_id AS uid, MAX(ts) AS t FROM ct_events WHERE user_id LIKE 'stu-%' GROUP BY user_id
              UNION ALL
              SELECT owner_id AS uid, MAX(updated_at) AS t FROM projects WHERE owner_id LIKE 'stu-%' GROUP BY owner_id
              UNION ALL
              SELECT user_id AS uid, MAX(last_at) AS t FROM usage_sessions WHERE user_id LIKE 'stu-%' GROUP BY user_id
              UNION ALL
              -- 进过班级名单或收过推送但零行为的学生也要在册：
              -- 「一次都没动的人」正是老师最该看见的，也是参与率的分母。
              SELECT student_id AS uid, NULL AS t FROM class_students WHERE student_id LIKE 'stu-%'
              UNION ALL
              SELECT student_id AS uid, NULL AS t FROM push_targets WHERE student_id LIKE 'stu-%'
            ) GROUP BY uid ORDER BY last_at DESC
"""


def list_students():
    """枚举学生（stu-*）及最近活跃时间（用于教师工作台）。

    名单来源含「班级名册」与「推送对象」，所以零行为的学生也在册。
    class_students / push_targets 属 store_resources 的表：若它还没建表（极早期调用），
    退回只看行为的旧查询，不让整个工作台 500。
    """
    with _conn() as c:
        try:
            rows = c.execute(_ROSTER_SQL_FULL).fetchall()
        except sqlite3.OperationalError:
            rows = c.execute("""
                SELECT uid, MAX(t) AS last_at FROM (
                  SELECT user_id AS uid, MAX(ts) AS t FROM ct_events WHERE user_id LIKE 'stu-%' GROUP BY user_id
                  UNION ALL
                  SELECT owner_id AS uid, MAX(updated_at) AS t FROM projects WHERE owner_id LIKE 'stu-%' GROUP BY owner_id
                  UNION ALL
                  SELECT user_id AS uid, MAX(last_at) AS t FROM usage_sessions WHERE user_id LIKE 'stu-%' GROUP BY user_id
                ) GROUP BY uid ORDER BY last_at DESC
            """).fetchall()
        return [{"id": r["uid"], "name": r["uid"].replace("stu-", ""), "last_at": r["last_at"]} for r in rows]


def submissions_count(owner_ids: list | None = None):
    """提交数。传 owner_ids 时只统计这些学生（按班看时不能报全平台的数）。"""
    with _conn() as c:
        if owner_ids is None:
            return c.execute("SELECT COUNT(*) AS n FROM project_versions").fetchone()["n"]
        if not owner_ids:
            return 0
        q = ",".join("?" * len(owner_ids))
        return c.execute(
            f"SELECT COUNT(*) AS n FROM project_versions v JOIN projects p ON p.id=v.project_id"
            f" WHERE p.owner_id IN ({q})", owner_ids).fetchone()["n"]


def save_design(project_id: int, owner_id: str, dtype: str, payload: str):
    with _lock, _conn() as c:
        cur = c.execute(
            "INSERT INTO design_artifacts(project_id,owner_id,type,payload,created_at) VALUES(?,?,?,?,?)",
            (project_id, owner_id, dtype, payload, _now()),
        )
        # 设计稿行是不可变原件；自增 id 就是稳定原件键，版本固定为 1。
        return {"id": cur.lastrowid, "source_id": f"design_artifact:{cur.lastrowid}",
                "source_version": "1"}


def get_designs(project_id: int, owner_id: str):
    with _conn() as c:
        rows = c.execute(
            "SELECT id,project_id,type,payload,created_at FROM design_artifacts"
            " WHERE project_id=? AND owner_id=? ORDER BY created_at DESC,id DESC",
            (project_id, owner_id),
        ).fetchall()
        return [
            {**dict(r), "source_id": f"design_artifact:{r['id']}", "source_version": "1"}
            for r in rows
        ]


# 埋点语义版本。1 = 旧语义（成功且此前报过错 → 只记 fix 不记 run）；
# 2 = 现语义（每次运行都记 run，失败补 error，报错后跑通再补 fix）。
# 两套数据混在一张表里算 success 会把结论算歪，所以每条事件都记下自己是哪套语义。
EVENT_SCHEMA_VERSION = 2


def add_ct_event(user_id: str, etype: str, detail: str | None, project_id: int | None,
                 round_index: int | None = None, room_id: str | None = None,
                 switch_reason: str | None = None,
                 lang: str | None = None, edit_mode: str | None = None):
    """switch_reason 仅对 role_switch 事件有意义（forced/negotiated，白名单校验在 ct.py 入口）；
    其余事件一律 NULL。六维公式不读本列。

    lang / edit_mode 是**创作情境协变量**（分析期用来统计控制「design_create 只在
    python+block 下才可能触发」这个构念污染，见 init() 里的加列注释）。同样白名单校验在
    ct.py 入口，同样不进六维公式。不在 IDE 情境下产生的事件为 NULL（真值，不是缺数据）。"""
    with _lock, _conn() as c:
        c.execute(
            "INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv,round_index,room_id,"
            "switch_reason,lang,edit_mode)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            (user_id, etype, detail, project_id, _now(), EVENT_SCHEMA_VERSION, round_index, room_id,
             switch_reason, lang, edit_mode),
        )


def ct_events(user_id: str, limit: int = 500):
    """取**最近** limit 条，再按时间正序返回。

    曾经写成 `ORDER BY ts ASC LIMIT ?`：事件超过上限后取到的永远是最老那批，
    学生上几节课后六维分/成功率/课堂监看会全部冻结在第一节课。
    """
    with _conn() as c:
        rows = c.execute(
            "SELECT id,type,detail,project_id,ts,COALESCE(sv,1) AS sv,round_index,room_id,"
            "switch_reason,lang,edit_mode FROM ct_events"
            " WHERE user_id=? ORDER BY ts DESC, id DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
        return [
            {**dict(r), "source_id": f"ct_event:{r['id']}",
             "source_version": str(r["sv"] or 1)}
            for r in reversed(rows)
        ]


def ct_counts(user_id: str, since: int | None = None, until: int | None = None) -> dict:
    """按 (语义版本, 事件类型) 统计条数，**不截断**。

    不能拿 ct_events 数：那是「最近 500 条」，一学期轻松超过；先截断再统计会把早段
    整段丢掉，而丢失量与活跃度正相关 —— 越活跃的学生被低估越多，足以把组间结论算反。
    """
    sql = "SELECT COALESCE(sv,1) AS sv, type, COUNT(*) n FROM ct_events WHERE user_id=?"
    args: list = [user_id]
    if since is not None:
        sql += " AND ts >= ?"
        args.append(since)
    if until is not None:
        sql += " AND ts < ?"
        args.append(until)
    sql += " GROUP BY sv, type"
    with _conn() as c:
        out: dict = {}
        for r in c.execute(sql, args).fetchall():
            out.setdefault(int(r["sv"]), {})[r["type"]] = r["n"]
        return out


# 参与者口径的事件类型。**新增埋点类型默认不进这个集合** —— 否则每加一个类型，
# 「谁算参与」就跟着悄悄变一次（save 落库那次差点如此：只保存过一回的学生会被冻结出
# 一行全 0 的六维快照，正是该口径要排除的情形）。要纳入必须在这里显式加并说明理由。
PARTICIPATION_TYPES = ("run", "error", "fix", "ai_help", "role_switch", "design_create")


def ct_room_participants(room_id: str, since: int | None = None, until: int | None = None) -> list:
    """时间窗 [since, until)（左闭右开，与 ct_counts 同口径）内在该房间有过行为事件的学生。

    轮级快照（round_snapshot）的**参与者口径**：参与 = 窗口内在该房产生过行为事件，
    不是「进过房间」—— 挂机旁观没有事件就不该被冻结出一行全 0 的六维快照。
    """
    ph = ",".join("?" * len(PARTICIPATION_TYPES))
    sql = f"SELECT DISTINCT user_id FROM ct_events WHERE room_id=? AND type IN ({ph})"
    args: list = [room_id, *PARTICIPATION_TYPES]
    if since is not None:
        sql += " AND ts >= ?"
        args.append(since)
    if until is not None:
        sql += " AND ts < ?"
        args.append(until)
    with _conn() as c:
        return [r[0] for r in c.execute(sql + " ORDER BY user_id", args).fetchall()]


def ct_event_rows(user_id: str, since: int | None = None, until: int | None = None) -> list:
    """某学生在窗口 [since, until) 内的**全部**事件行（含 sv / switch_reason / room_id），时间正序。

    与 ct_events() 的区别是三点：不截断、带 switch_reason、按窗口过滤。
    SRC-proxy/v0（定稿 §A15）三个分量都要按事件序列扫（error→fix 三元组、role_switch 后
    首个有效动作的延迟），拿「最近 500 条」算等于对活跃学生系统性截断，
    而截断量与活跃度正相关 —— 那正是 ct_counts 注释里已经踩过一次的坑。
    """
    sql = ("SELECT id,type,detail,project_id,ts,COALESCE(sv,1) AS sv,switch_reason,room_id,"
           "round_index,lang,edit_mode FROM ct_events WHERE user_id=?")
    args: list = [user_id]
    if since is not None:
        sql += " AND ts >= ?"
        args.append(since)
    if until is not None:
        sql += " AND ts < ?"
        args.append(until)
    with _conn() as c:
        return [
            {**dict(r), "source_id": f"ct_event:{r['id']}",
             "source_version": str(r["sv"] or 1)}
            for r in c.execute(sql + " ORDER BY ts ASC, id ASC", args).fetchall()
        ]


def ct_sv_mixed(user_id: str, since: int | None = None, until: int | None = None) -> bool:
    """该窗口内是否混有旧语义（sv=1）事件。混了就说明这段的成功率与算法/迁移维不可与别段直接比。"""
    return 1 in store_sv_set(user_id, since, until)


def store_sv_set(user_id: str, since: int | None = None, until: int | None = None) -> set:
    sql = "SELECT DISTINCT COALESCE(sv,1) FROM ct_events WHERE user_id=?"
    args: list = [user_id]
    if since is not None:
        sql += " AND ts >= ?"
        args.append(since)
    if until is not None:
        sql += " AND ts < ?"
        args.append(until)
    with _conn() as c:
        return {int(r[0]) for r in c.execute(sql, args).fetchall()}


def ct_gap_minutes(user_id: str, since: int | None = None, until: int | None = None,
                   gap_cap: int = 600) -> int:
    """投入时长：相邻事件间隔累加，单段超过 gap_cap 秒不计。走 SQL 取全部时间戳，不受 500 条上限影响。"""
    sql = "SELECT ts FROM ct_events WHERE user_id=?"
    args: list = [user_id]
    if since is not None:
        sql += " AND ts >= ?"
        args.append(since)
    if until is not None:
        sql += " AND ts < ?"
        args.append(until)
    sql += " ORDER BY ts ASC"
    with _conn() as c:
        ts = [r[0] for r in c.execute(sql, args).fetchall()]
    if len(ts) < 2:
        return 1 if ts else 0
    total = sum(b - a for a, b in zip(ts, ts[1:]) if 0 < b - a <= gap_cap)
    return max(1, round(total / 60))


def _now():
    return int(time.time())


def list_projects(owner_id: str):
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM projects WHERE owner_id=? ORDER BY updated_at DESC", (owner_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def create_project(owner_id: str, title: str, language: str):
    now = _now()
    with _lock:
        with _conn() as c:  # 退出该 with 即提交，再单独读，避免读未提交
            cur = c.execute(
                "INSERT INTO projects(owner_id,title,language,latest_version,created_at,updated_at) VALUES(?,?,?,0,?,?)",
                (owner_id, title, language, now, now),
            )
            pid = cur.lastrowid
    return get_project(pid, owner_id)


def get_project(pid: int, owner_id: str):
    with _conn() as c:
        p = c.execute("SELECT * FROM projects WHERE id=? AND owner_id=?", (pid, owner_id)).fetchone()
        if not p:
            return None
        v = c.execute(
            "SELECT * FROM project_versions WHERE project_id=? ORDER BY version_no DESC LIMIT 1", (pid,)
        ).fetchone()
        d = dict(p)
        d["latest"] = (
            {**dict(v), "source_id": f"project_version:{v['id']}",
             "source_version": str(v["version_no"])}
            if v else None
        )
        return d


def save_version(pid: int, owner_id: str, code: str, block_state: str | None):
    """存一版代码。**内容去重**：与最新版完全一致就不落新行，幂等返回既有版本号。

    去重不是省磁盘，是两件事的前置：
    ① 运行时自动保存（UI调研二期落地）——不去重的话每次点「运行」都长一版，
       版本列表会被同一份代码刷满，学生翻历史时找不到真正的变更点；
    ② uptake U4/U5 的前置条件（research 出参 not_computed.U4 曾登记「不可做」，
       前置补上后已作为**探索量**实现，落在 by_delta.<Δ>.exploratory 下）：
       「Δ 内出现新版本」原来是「学生是否恰好点了保存」的函数，去重 + 自动保存之后
       才变成「代码是否变了」的函数 —— 代码承接的行为信号从此可信。
    返回 {"ver", "changed"}；作品不存在返回 None。"""
    with _lock, _conn() as c:
        p = c.execute("SELECT * FROM projects WHERE id=? AND owner_id=?", (pid, owner_id)).fetchone()
        if not p:
            return None
        last = c.execute(
            "SELECT code, block_state FROM project_versions WHERE project_id=? ORDER BY version_no DESC LIMIT 1",
            (pid,),
        ).fetchone()
        if last and last["code"] == code and last["block_state"] == block_state:
            return {"ver": p["latest_version"] or 0, "changed": False}
        ver = (p["latest_version"] or 0) + 1
        c.execute(
            "INSERT INTO project_versions(project_id,version_no,code,block_state,created_at) VALUES(?,?,?,?,?)",
            (pid, ver, code, block_state, _now()),
        )
        c.execute("UPDATE projects SET latest_version=?, updated_at=? WHERE id=?", (ver, _now(), pid))
        return {"ver": ver, "changed": True}


def list_versions(pid: int, owner_id: str):
    with _conn() as c:
        if not c.execute("SELECT 1 FROM projects WHERE id=? AND owner_id=?", (pid, owner_id)).fetchone():
            return None
        rows = c.execute(
            "SELECT id,version_no,created_at FROM project_versions WHERE project_id=? ORDER BY version_no DESC", (pid,)
        ).fetchall()
        return [
            {**dict(r), "source_id": f"project_version:{r['id']}",
             "source_version": str(r["version_no"])}
            for r in rows
        ]


def delete_project(pid: int, owner_id: str) -> bool:
    """删作品。版本表的清理**必须等归属校验通过**再做——

    否则删别人的作品虽然返回 404，对方的版本历史却已经被真删掉了。
    已登记为学习证据的版本或设计原件不能走普通删除；数据主体删除仍由
    store_erasure 按“关联→证据→推断→作品”的受控顺序完成。
    """
    with _lock, _conn() as c:
        # 先拿写锁，避免另一个进程在“检查没有证据”和真正删除之间登记新指针。
        c.execute("BEGIN IMMEDIATE")
        project = c.execute(
            "SELECT 1 FROM projects WHERE id=? AND owner_id=?", (pid, owner_id)
        ).fetchone()
        if not project:
            return False
        evidence_table = c.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='evidence_items'"
        ).fetchone()
        if evidence_table:
            cited = c.execute(
                "SELECT 1 FROM evidence_items e WHERE "
                "(e.source_type='project_version' AND EXISTS("
                " SELECT 1 FROM project_versions v WHERE v.id=e.source_id AND v.project_id=?))"
                " OR (e.source_type='design_artifact' AND EXISTS("
                " SELECT 1 FROM design_artifacts d WHERE d.id=e.source_id AND d.project_id=?))"
                " LIMIT 1",
                (pid, pid),
            ).fetchone()
            if cited:
                raise EvidenceRetentionError(
                    "该作品已成为可回溯学习证据，不能直接删除；如需行使数据删除权，请联系教师"
                )
        c.execute("DELETE FROM projects WHERE id=? AND owner_id=?", (pid, owner_id))
        c.execute("DELETE FROM project_versions WHERE project_id=?", (pid,))
        c.execute("DELETE FROM design_artifacts WHERE project_id=? AND owner_id=?", (pid, owner_id))
        return True


init()
