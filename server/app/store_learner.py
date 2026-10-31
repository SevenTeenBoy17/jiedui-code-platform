"""
学习者状态层持久化（文献研读第三波总审 §7 T1-6 / T1-12）：
- **learner_state**：跨会话学生画像（支架档位/教学轮/回退计数/掌握快照/卡点）。
  四个缺口（渐退无记忆、轮次无载体、降档无依据、卡点无沉淀）的共同根因是
  「所有学习者状态都活在单次会话里」，这张表就是那面承重墙。
- **learning_round**：教学轮（R1能跑 / R2跑对 / R3跑好）。主体是**学生对同一问题的第二次
  分解与调试**，与 study.py 的课题状态机（draft→pretest→running→posttest→closed，
  主体是研究者）**正交** —— 绝不复用其任何字段，两条轴各记各的（T2-19 三种「轮」的分离）。
- **chat_log**：结对聊天**只存元数据**（房间/发言人/角色/时间戳），**不存消息内容原文** ——
  不给未成年人平台新增 PII 面。它是「人际互动占比」这一对抗性指标（T1-12）的生生轮次分母：
  渐退若只是把 AI 关小而同伴互动没上升，「支架来源迁移 AI→同伴→自我」即被自己的数据证伪。

风格照 store_study.py：stdlib sqlite3 + WAL + threading.Lock()，无 ORM，级联手写。
"""
import json
import time
import sqlite3
import threading

from app.store import DB_PATH

_lock = threading.Lock()

# 教学轮固定三轮；label 缺省按此表补齐（教师可自定义覆盖）
ROUND_LABELS = {1: "R1能跑", 2: "R2跑对", 3: "R3跑好"}

# learner_state 缺省值：渐退式支架**满档起步**（ai.py 的 SCAFFOLD 3=最高），教学轮从 R1 开始。
STATE_DEFAULTS = {"scaffold_level": 3, "round_index": 1, "fallback_count": 0,
                  "mastery_snapshot": {}, "stuck_points": []}
_STATE_KEYS = tuple(STATE_DEFAULTS)


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    return c


def _now() -> int:
    return int(time.time())


def init():
    with _lock, _conn() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS learner_state(
              student_id TEXT PRIMARY KEY,
              scaffold_level INTEGER NOT NULL DEFAULT 3,
              round_index INTEGER NOT NULL DEFAULT 1,
              fallback_count INTEGER NOT NULL DEFAULT 0,
              mastery_snapshot TEXT NOT NULL DEFAULT '{}',   -- JSON：{知识点: 掌握度}
              stuck_points TEXT NOT NULL DEFAULT '[]',       -- JSON：卡点列表（教师/策略层写）
              updated_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS learning_round(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              room_id TEXT NOT NULL,
              round_index INTEGER NOT NULL,                  -- 1-3（R1能跑/R2跑对/R3跑好）
              label TEXT NOT NULL DEFAULT '',
              started_at INTEGER,
              exited_at INTEGER,
              exit_task_passed INTEGER                       -- 0/1/NULL（NULL=未做出口任务）
            );
            CREATE INDEX IF NOT EXISTS idx_lr_room ON learning_round(room_id, started_at);

            -- 轮级过程快照。dims/report_dims 是旧版兼容列，新写入只使用 diagnostic：
            -- 行为次数可帮助教师回放过程，但不能生成计算思维能力或干预效果。
            -- 与 ct_snapshots（课题期段快照）正交：那边以 study 期段为窗，这边以教学轮为窗，
            -- 两条轴各冻各的（T2-19 三种「轮」分离的延续）。
            CREATE TABLE IF NOT EXISTS round_snapshot(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              round_id INTEGER NOT NULL,
              student_id TEXT NOT NULL,
              dims TEXT NOT NULL DEFAULT '{}',               -- JSON：六维分（neutral 口径）
              report_dims TEXT NOT NULL DEFAULT '{}',        -- JSON：四要素折叠（REPORT_FOLD 口径）
              diagnostic TEXT NOT NULL DEFAULT '{}',         -- JSON：过程事实 + 稳定原件指针
              evidence_count INTEGER NOT NULL DEFAULT 0,
              frozen_at INTEGER
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_rs_uniq ON round_snapshot(round_id, student_id);

            -- 结对聊天元数据。**没有 content 列是设计而不是省事**：
            -- 互动占比只需要轮次计数，存原文是给未成年人平台凭空多开一个 PII 面。
            CREATE TABLE IF NOT EXISTS chat_log(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              room_id TEXT NOT NULL,
              from_student TEXT NOT NULL,
              role TEXT DEFAULT '',                          -- driver | observer | ''
              ts INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_log(room_id, ts);
            CREATE INDEX IF NOT EXISTS idx_chat_stu ON chat_log(from_student, ts);

            -- 目标锚点（T1-11 goal_anchor 最小闭环）：教师为某房间的题目预设的**关键决策点描述**
            -- （如「需要一个循环直到猜对」），不是完整代码。同 room 允许多条 ——
            -- 一题多解时各解的决策点并存，只许一条会压制多解。
            -- 它是 navigator（ai.py reviewer persona）的内部参照，学生不可见（learner.py 仅教师可读）。
            CREATE TABLE IF NOT EXISTS goal_anchor(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              room_id TEXT NOT NULL,
              anchor TEXT NOT NULL,
              created_by TEXT NOT NULL,
              created_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_anchor_room ON goal_anchor(room_id, created_at);

            -- 策略建议留痕（终审 #4）：GET /policy 每次现算完落一行 —— 建议本身仍**不写
            -- learner_state**（「只建议不写库」的红线只约束档位，不约束审计痕迹）。
            -- 有了这张表，「教师采纳了哪条建议」才能经 scaffold_log.suggestion_id 回溯。
            CREATE TABLE IF NOT EXISTS policy_suggestion(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              student_id TEXT NOT NULL,
              ts INTEGER,
              current_level INTEGER NOT NULL,
              suggested_level INTEGER NOT NULL,
              attention INTEGER NOT NULL DEFAULT 0,
              reasons TEXT NOT NULL DEFAULT '[]',            -- JSON：逐条规则理由（可审计）
              requested_by TEXT NOT NULL DEFAULT ''          -- 谁触发的现算（教师/学生本人）
            );
            CREATE INDEX IF NOT EXISTS idx_ps_stu ON policy_suggestion(student_id, ts);

            -- 改档流水（终审 #4）：每次 scaffold_level 真实变化追写一行；dismiss 也落行
            -- （level 不变，source='dismissed'）—— 渐退干预的每一步都要能回答
            -- 「谁、何时、依据哪条建议、在哪个房间/哪一轮把档位从几改到几」。
            -- source：teacher=教师手动改档 | teacher_accept=教师采纳策略建议 | dismissed=教师驳回建议
            CREATE TABLE IF NOT EXISTS scaffold_log(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              student_id TEXT NOT NULL,
              level_from INTEGER NOT NULL,
              level_to INTEGER NOT NULL,
              source TEXT NOT NULL,
              suggestion_id INTEGER,                         -- 可空：手动改档没有对应建议
              round_index INTEGER,                           -- 可空：改档时该房间无进行中的轮
              room_id TEXT,                                  -- 可空：改档不发生在结对房间里
              ts INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_sl_stu ON scaffold_log(student_id, ts);

            -- 认知负荷自评（终审 #7 / T1-15）：Paas 式单题 1-9，学生**自报**。
            -- 「支架递减而表现不塌」有两个机制：真内化 vs 高负荷硬扛 —— 不测负荷就无法排除
            -- 最强竞争解释。**不复用 ct_criterion 是设计而不是省事**：那张表的唯一键每 phase
            -- 只容一行、且写入方相反（criterion=教师誊录件，负荷=学生自报件），
            -- 硬塞进去会让「谁写的」这个来源事实在表结构上不可辨。
            -- room_id / round_index 可空：轮外自评也收（NULL 是真值，不是缺数据）。
            CREATE TABLE IF NOT EXISTS cog_load(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              student_id TEXT NOT NULL,
              room_id TEXT,
              round_index INTEGER,
              score INTEGER NOT NULL,
              ts INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_cog_stu ON cog_load(student_id, ts);
            """
        )
        # 老师机器上的既有库不能删表重建；新列走幂等迁移。
        cols = {r[1] for r in c.execute("PRAGMA table_info(round_snapshot)")}
        if "diagnostic" not in cols:
            c.execute("ALTER TABLE round_snapshot ADD COLUMN diagnostic TEXT NOT NULL DEFAULT '{}'")


def _j(v, default):
    if isinstance(v, str):
        try:
            return json.loads(v)
        except Exception:
            return default
    return v if v is not None else default


# ============ learner_state ============
def get_state(student_id: str) -> dict:
    """取画像；没有行时返回缺省画像（满档起步）而不是 None ——
    「从未被写过」对策略层就是「按缺省对待」，调用侧不必各自兜底。"""
    with _conn() as c:
        r = c.execute("SELECT * FROM learner_state WHERE student_id=?", (student_id,)).fetchone()
    if not r:
        return {"student_id": student_id, **STATE_DEFAULTS, "updated_at": None, "exists": False}
    d = dict(r)
    d["mastery_snapshot"] = _j(d.get("mastery_snapshot"), {})
    d["stuck_points"] = _j(d.get("stuck_points"), [])
    d["exists"] = True
    return d


def upsert_state(student_id: str, patch: dict) -> dict:
    """部分更新：只动 patch 里给出的字段，其余保留（没有行则从缺省起建）。"""
    cur = get_state(student_id)
    merged = {k: patch[k] if k in patch else cur[k] for k in _STATE_KEYS}
    with _lock, _conn() as c:
        c.execute(
            "INSERT OR REPLACE INTO learner_state"
            "(student_id,scaffold_level,round_index,fallback_count,mastery_snapshot,stuck_points,updated_at)"
            " VALUES(?,?,?,?,?,?,?)",
            (student_id, merged["scaffold_level"], merged["round_index"], merged["fallback_count"],
             json.dumps(merged["mastery_snapshot"], ensure_ascii=False),
             json.dumps(merged["stuck_points"], ensure_ascii=False), _now()))
    return get_state(student_id)


# ============ learning_round ============
def active_round(room_id: str):
    """该 room 进行中的教学轮（未结束的最新一条），无则 None。"""
    with _conn() as c:
        r = c.execute(
            "SELECT * FROM learning_round WHERE room_id=? AND exited_at IS NULL"
            " ORDER BY started_at DESC, id DESC LIMIT 1", (room_id,)).fetchone()
        return dict(r) if r else None


def active_round_index(room_id: str) -> int | None:
    r = active_round(room_id)
    return r["round_index"] if r else None


def open_round(room_id: str, round_index: int, label: str = "") -> int | None:
    """开轮。已有进行中的轮返回 None（调用侧转 409）—— 一个 room 同时只能有一轮，
    否则埋点该打哪个 round_index 就成了两可。"""
    with _lock, _conn() as c:
        r = c.execute("SELECT id FROM learning_round WHERE room_id=? AND exited_at IS NULL",
                      (room_id,)).fetchone()
        if r:
            return None
        cur = c.execute(
            "INSERT INTO learning_round(room_id,round_index,label,started_at) VALUES(?,?,?,?)",
            (room_id, round_index, label or ROUND_LABELS.get(round_index, f"R{round_index}"), _now()))
        return cur.lastrowid


def exit_round(rid: int, passed: bool | None) -> bool:
    """结轮，记出口任务结果（None=没做出口任务，与 0=没通过是两回事，不可混填）。
    只结「进行中」的轮：重复点结束不许把 exit_task_passed 改写掉。"""
    with _lock, _conn() as c:
        return c.execute(
            "UPDATE learning_round SET exited_at=?, exit_task_passed=? WHERE id=? AND exited_at IS NULL",
            (_now(), None if passed is None else (1 if passed else 0), rid)).rowcount > 0


def get_round(rid: int) -> dict | None:
    with _conn() as c:
        r = c.execute("SELECT * FROM learning_round WHERE id=?", (rid,)).fetchone()
        return dict(r) if r else None


def list_rounds(room_id: str | None = None) -> list:
    sql, args = "SELECT * FROM learning_round", []
    if room_id:
        sql += " WHERE room_id=?"
        args.append(room_id)
    with _conn() as c:
        return [dict(r) for r in c.execute(sql + " ORDER BY started_at, id", args).fetchall()]


# ============ round_snapshot 轮级证据快照（终审 R+3 批次②）============
def save_round_snapshot(round_id: int, student_id: str, dims: dict, report_dims: dict,
                        evidence_count: int) -> bool:
    """冻结一行轮级快照。**首写即定**（INSERT OR IGNORE）：结轮那一刻按当时公式算出的
    窗口分就是定稿 —— 公式升版后的任何重放都不许改写历史轮的数字（快照存在的意义
    就是可复现，与 ct_snapshots 的冻结纪律同源）。已有行返回 False。"""
    with _lock, _conn() as c:
        cur = c.execute(
            "INSERT OR IGNORE INTO round_snapshot"
            "(round_id,student_id,dims,report_dims,evidence_count,frozen_at)"
            " VALUES(?,?,?,?,?,?)",
            (round_id, student_id, json.dumps(dims), json.dumps(report_dims, ensure_ascii=False),
             evidence_count, _now()))
        return cur.rowcount > 0


def save_round_diagnostic(round_id: int, student_id: str, diagnostic: dict,
                          evidence_count: int) -> bool:
    """冻结过程事实与稳定原件指针；旧能力化列保持空对象。"""
    with _lock, _conn() as c:
        cur = c.execute(
            "INSERT OR IGNORE INTO round_snapshot"
            "(round_id,student_id,dims,report_dims,diagnostic,evidence_count,frozen_at)"
            " VALUES(?,?,'{}','{}',?,?,?)",
            (round_id, student_id, json.dumps(diagnostic, ensure_ascii=False),
             evidence_count, _now()))
        return cur.rowcount > 0


def round_snapshots(round_id: int) -> list:
    with _conn() as c:
        out = []
        for r in c.execute("SELECT * FROM round_snapshot WHERE round_id=? ORDER BY student_id",
                           (round_id,)).fetchall():
            d = dict(r)
            d["dims"] = _j(d.get("dims"), {})
            d["report_dims"] = _j(d.get("report_dims"), {})
            d["diagnostic"] = _j(d.get("diagnostic"), {})
            out.append(d)
        return out


# ============ chat_log（结对聊天元数据）============
def add_chat_turn(room_id: str, from_student: str, role: str = ""):
    with _lock, _conn() as c:
        c.execute("INSERT INTO chat_log(room_id,from_student,role,ts) VALUES(?,?,?,?)",
                  (room_id, from_student, role, _now()))


def peer_turns(student_id: str | None = None, room_id: str | None = None,
               since: int | None = None, until: int | None = None) -> int:
    """生生轮次计数。since/until（epoch 秒）按**左闭右开** [since, until) 过滤 ——
    与 store.ct_counts 的窗口口径一致：互动占比的分子分母必须同窗，期段冻结也复用同一约定。"""
    sql, args = "SELECT COUNT(*) FROM chat_log WHERE 1=1", []
    if student_id:
        sql += " AND from_student=?"
        args.append(student_id)
    if room_id:
        sql += " AND room_id=?"
        args.append(room_id)
    if since is not None:
        sql += " AND ts >= ?"
        args.append(since)
    if until is not None:
        sql += " AND ts < ?"
        args.append(until)
    with _conn() as c:
        return c.execute(sql, args).fetchone()[0]


def room_participants(room_id: str) -> list:
    with _conn() as c:
        return [r[0] for r in c.execute(
            "SELECT DISTINCT from_student FROM chat_log WHERE room_id=?", (room_id,)).fetchall()]


# ============ cog_load 认知负荷自评（终审 #7 / T1-15）============
def save_cog_load(student_id: str, score: int, room_id: str | None = None,
                  round_index: int | None = None) -> int:
    """覆盖式落一条自评：**同一学生同一轮**（round_index，含 NULL=轮外）只留最新一行 ——
    轮末自评点错了再点是常态，负荷以最后一次自报为准，不许长出第二行把轮均值悄悄拉偏。
    `IS ?` 做 NULL 安全比较（SQLite 的 IS 对 NULL 参数按相等匹配），轮外自评同样覆盖式。"""
    with _lock, _conn() as c:
        r = c.execute("SELECT id FROM cog_load WHERE student_id=? AND round_index IS ?",
                      (student_id, round_index)).fetchone()
        if r:
            c.execute("UPDATE cog_load SET score=?, room_id=?, ts=? WHERE id=?",
                      (score, room_id, _now(), r["id"]))
            return r["id"]
        cur = c.execute(
            "INSERT INTO cog_load(student_id,room_id,round_index,score,ts) VALUES(?,?,?,?,?)",
            (student_id, room_id, round_index, score, _now()))
        return cur.lastrowid


def list_cog_load(student_id: str) -> list:
    with _conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT * FROM cog_load WHERE student_id=? ORDER BY ts, id", (student_id,)).fetchall()]


# ============ goal_anchor 目标锚点（T1-11）============
def add_anchor(room_id: str, anchor: str, created_by: str) -> int:
    with _lock, _conn() as c:
        cur = c.execute(
            "INSERT INTO goal_anchor(room_id,anchor,created_by,created_at) VALUES(?,?,?,?)",
            (room_id, anchor, created_by, _now()))
        return cur.lastrowid


def list_anchors(room_id: str) -> list:
    with _conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT * FROM goal_anchor WHERE room_id=? ORDER BY created_at, id",
            (room_id,)).fetchall()]


def active_anchors(room_id: str) -> list[str]:
    """该房间当前生效的锚点文本（供 ai.py 注入 navigator 的 system prompt）。
    当前「生效」=「未删除」；将来若加启停位，只改这里，ai.py 侧口径不变。"""
    return [r["anchor"] for r in list_anchors(room_id)]


def delete_anchor(anchor_id: int) -> bool:
    with _lock, _conn() as c:
        return c.execute("DELETE FROM goal_anchor WHERE id=?", (anchor_id,)).rowcount > 0


# ============ 建议留痕与改档流水（终审 #4）============
def add_policy_suggestion(student_id: str, current_level: int, suggested_level: int,
                          attention: bool, reasons: list, requested_by: str) -> int:
    """留一行策略建议痕迹（现算改「算完留痕」）。返回 suggestion_id 供采纳/驳回链回溯。"""
    with _lock, _conn() as c:
        cur = c.execute(
            "INSERT INTO policy_suggestion"
            "(student_id,ts,current_level,suggested_level,attention,reasons,requested_by)"
            " VALUES(?,?,?,?,?,?,?)",
            (student_id, _now(), current_level, suggested_level, 1 if attention else 0,
             json.dumps(reasons, ensure_ascii=False), requested_by))
        return cur.lastrowid


def get_policy_suggestion(suggestion_id: int) -> dict | None:
    with _conn() as c:
        r = c.execute("SELECT * FROM policy_suggestion WHERE id=?", (suggestion_id,)).fetchone()
    if not r:
        return None
    d = dict(r)
    d["reasons"] = _j(d.get("reasons"), [])
    return d


def add_scaffold_log(student_id: str, level_from: int, level_to: int, source: str,
                     suggestion_id: int | None = None, round_index: int | None = None,
                     room_id: str | None = None) -> int:
    """追写一行改档流水。dismiss 语义也走这里：level_from==level_to、source='dismissed'。"""
    with _lock, _conn() as c:
        cur = c.execute(
            "INSERT INTO scaffold_log"
            "(student_id,level_from,level_to,source,suggestion_id,round_index,room_id,ts)"
            " VALUES(?,?,?,?,?,?,?,?)",
            (student_id, level_from, level_to, source, suggestion_id, round_index, room_id, _now()))
        return cur.lastrowid


def list_scaffold_log(student_id: str | None = None) -> list:
    sql, args = "SELECT * FROM scaffold_log", []
    if student_id:
        sql += " WHERE student_id=?"
        args.append(student_id)
    with _conn() as c:
        return [dict(r) for r in c.execute(sql + " ORDER BY ts, id", args).fetchall()]


init()
