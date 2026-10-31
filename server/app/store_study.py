"""
课题研究层的持久化（V6）：课题状态机 / 名单快照 / 测评卷与作答 / 期段六维冻结快照 / 操作留痕。

设计取舍（三份方案评审后的结论）：
- **主结局用独立客观测评卷，不用平台六维分。** 六维分是行为次数的单调函数
  （`abstract = 30 + ai_helps*5 + ...`、`verify = 28 + fixes*9 + ...`），而干预（强制苏格拉底）
  会机械地推高 ai_help / error / fix —— 从自变量到因变量存在一条不经过「计算思维」的通路，
  拿它当因变量的报告在答辩时一问就穿。六维分降级为**过程/机制指标**。
- **分组放班级级**（class_settings.group_kind）。同一个班里让一半学生的 AI 只提问、
  另一半正常写码，学生互相看屏幕，污染不可控；而 socratic 本来就是班级级开关，两者同层。
- **期段六维要冻结成快照**，不能每次现算：六维公式是启发式且被调整过，
  三月写的报告六月复算数字就变了，不可复现。

风格照 store_resources.py：executescript 建表、_conn() 开 WAL、threading.Lock()、
**级联删除全部手写**（本库未开 PRAGMA foreign_keys）。
"""
import json
import time
import sqlite3
import threading

from app.store import DB_PATH

_lock = threading.Lock()

PHASES = ("draft", "pretest", "running", "posttest", "closed")
SEGMENTS = ("baseline", "intervention", "post")
# 测评卷 kind 全集（学测评一体化·切分1）：pre/post 由课题状态机建卷；probe 为轮末探针
# （running 期子事件，不动主相位）；delayed 为延迟测（closed 后窗口，发卷通道另铺）。
# assessments.kind 列本身是无约束 TEXT —— 四值约定由应用层持有（这里是单一真源）。
ASSESSMENT_KINDS = ("pre", "post", "probe", "delayed")
# 单一真源：口径版本由 ct.py 定义，这里只转引。
# 两处各写一个字面量必然漂移 —— 改了公式却忘了改快照里记的版本，跨版本数据就悄悄混在一起了。
def _formula_version() -> str:
    from app.ct import FORMULA_VERSION as v
    return v


FORMULA_VERSION = _formula_version()


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    return c


def _now() -> int:
    return int(time.time())


def _ensure_column(c, table: str, col: str, decl: str):
    """幂等加列。本仓一律 CREATE TABLE IF NOT EXISTS，**不会** ALTER 已存在的表，
    而老师机器上的 jiedui.db 有真实数据不能删库重建。SQLite 下 ADD COLUMN 是 O(1)。"""
    cols = {r[1] for r in c.execute(f"PRAGMA table_info({table})")}
    if col not in cols:
        c.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")


def init():
    with _lock, _conn() as c:
        c.executescript(
            """
            -- ① 课题主记录，同时是状态机：draft→pretest→running→posttest→closed（单向）
            CREATE TABLE IF NOT EXISTS studies(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              question TEXT DEFAULT '',
              design TEXT NOT NULL DEFAULT 'nonequiv_pre_post',
              assign_method TEXT NOT NULL DEFAULT 'intact',
              exp_class_ids TEXT NOT NULL DEFAULT '[]',
              ctrl_class_ids TEXT NOT NULL DEFAULT '[]',
              blueprint_id TEXT NOT NULL DEFAULT 'ct-v1',
              pre_assessment_id INTEGER, post_assessment_id INTEGER,
              scoring_profile TEXT NOT NULL DEFAULT 'neutral',
              formula_version TEXT NOT NULL DEFAULT 'ct-rules/v1',
              phase TEXT NOT NULL DEFAULT 'draft',
              pre_opened_at INTEGER, pre_closed_at INTEGER,
              started_at INTEGER, ended_at INTEGER,
              post_opened_at INTEGER, post_closed_at INTEGER,
              socratic_before TEXT NOT NULL DEFAULT '{}',
              forced_start INTEGER NOT NULL DEFAULT 0,
              created_by TEXT NOT NULL, created_at INTEGER, updated_at INTEGER
            );

            -- ② 名单快照：发前测那一刻冻结，此后所有分析以它为准
            CREATE TABLE IF NOT EXISTS study_members(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              study_id INTEGER NOT NULL,
              student_id TEXT NOT NULL,
              group_kind TEXT NOT NULL,
              cluster_class_id INTEGER NOT NULL,
              consent_ok INTEGER NOT NULL DEFAULT 0,
              joined_at INTEGER, withdrawn_at INTEGER
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_sm_uniq ON study_members(study_id, student_id);
            CREATE INDEX IF NOT EXISTS idx_sm_study ON study_members(study_id, group_kind);

            -- ③ 测评卷
            CREATE TABLE IF NOT EXISTS assessments(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              kind TEXT NOT NULL,
              blueprint_id TEXT NOT NULL DEFAULT 'ct-v1',
              items TEXT NOT NULL DEFAULT '[]',
              item_count INTEGER NOT NULL DEFAULT 0,
              dim_max TEXT NOT NULL DEFAULT '{}',
              locked INTEGER NOT NULL DEFAULT 0,
              source TEXT DEFAULT '',
              status TEXT NOT NULL DEFAULT 'published',
              created_by TEXT NOT NULL, created_at INTEGER, updated_at INTEGER
            );

            -- ④ 作答：分数必须在提交时算好落库，不能只存 answers 事后算
            CREATE TABLE IF NOT EXISTS assessment_responses(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              assessment_id INTEGER NOT NULL,
              student_id TEXT NOT NULL,
              answers TEXT NOT NULL DEFAULT '[]',
              total REAL DEFAULT 0,
              dim_scores TEXT NOT NULL DEFAULT '{}',
              item_scores TEXT NOT NULL DEFAULT '[]',
              duration_sec INTEGER DEFAULT 0,
              flags TEXT NOT NULL DEFAULT '[]',
              submitted_at INTEGER
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_ar_uniq ON assessment_responses(assessment_id, student_id);

            -- ⑤ 期段六维冻结快照 —— 核心产出，保证报告可复现
            CREATE TABLE IF NOT EXISTS ct_snapshots(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              study_id INTEGER NOT NULL,
              segment TEXT NOT NULL,
              student_id TEXT NOT NULL,
              group_kind TEXT NOT NULL,
              win_start INTEGER, win_end INTEGER,
              dims TEXT NOT NULL DEFAULT '{}',
              behavior TEXT NOT NULL DEFAULT '{}',
              success_rate INTEGER, engaged_minutes INTEGER,
              evidence_count INTEGER, has_real_data INTEGER,
              socratic_during INTEGER DEFAULT 0,
              sv_mixed INTEGER DEFAULT 0,
              scoring_profile TEXT, formula_version TEXT, computed_at INTEGER
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_snap_uniq ON ct_snapshots(study_id, segment, student_id);

            -- ⑥ 只追加的操作留痕 = 论文「研究实施过程」一节的原始材料
            CREATE TABLE IF NOT EXISTS study_log(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              study_id INTEGER NOT NULL, ts INTEGER, actor TEXT,
              action TEXT NOT NULL, detail TEXT DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_slog ON study_log(study_id, ts);

            -- ⑦ 外部效标（第三波总审 T0-1，不可逆项）：独立于平台六维/自编卷的外部测量
            --    （效标题块/延迟测/无支架探针），效标效度 r 的分母。错过开课日无法回溯补测。
            --    phase ∈ pre/post/delayed/probe；同一 (study,student,phase,instrument)
            --    重复录入按**覆盖**处理 —— 教师誊分改错是常态，效标以最后一次录入为准。
            CREATE TABLE IF NOT EXISTS ct_criterion(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              study_id INTEGER NOT NULL,
              student_id TEXT NOT NULL,
              phase TEXT NOT NULL,
              instrument TEXT NOT NULL,
              item_scores TEXT NOT NULL DEFAULT '[]',
              total REAL DEFAULT 0,
              created_at INTEGER
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_crit_uniq
              ON ct_criterion(study_id, student_id, phase, instrument);

            -- ⑧ 卷面下发留痕（学测评一体化·切分1，蓝图铁律10）：学生**首次** GET 卷面即落
            --    opened_at，交卷时 duration_server = 提交时刻 - opened_at 落库。
            --    前端自报时长（duration_client）可伪造，服务端时差不可；too_fast 判定改用服务端值。
            --    INSERT OR IGNORE 只记首次 —— 重复刷新不重置计时起点，
            --    否则临交卷前刷新一下就能把「作答太快」刷成正常时长。
            CREATE TABLE IF NOT EXISTS assessment_open_log(
              assessment_id INTEGER NOT NULL,
              student_id TEXT NOT NULL,
              opened_at INTEGER NOT NULL,
              PRIMARY KEY(assessment_id, student_id)
            );
            """
        )
        # 分组落在班级级设置上，与 socratic 同层
        _ensure_column(c, "class_settings", "group_kind", "TEXT DEFAULT ''")
        # —— 学测评一体化·切分1：幂等迁移（照 _ensure_column 模式；老师机器上的 jiedui.db
        # 有真实数据不能删库重建，一律 ADD COLUMN 可空列，旧行自然为 NULL）——
        # probe/delayed 卷归属课题（pre/post 卷仍由 studies.pre/post_assessment_id 引用，不回填）
        _ensure_column(c, "assessments", "study_id", "INTEGER")
        # probe 卷绑定轮序 1-3。存**轮序**而不是 learning_round.id：study 级探针一次推给全体成员、
        # 跨结对房间，而 learning_round 是房间级实体，绑单个房间的轮 id 语义就错了（room_id 只留痕）。
        _ensure_column(c, "assessments", "round_id", "INTEGER")
        # probe 关窗时刻（NULL=窗口开着；关窗后取卷/交卷一律 409）
        _ensure_column(c, "assessments", "closed_at", "INTEGER")
        # 作答归轮（轮外测评为 NULL，遵循「轮外事件不硬归轮」原则）
        _ensure_column(c, "assessment_responses", "round_id", "INTEGER")
        # 服务端时长（铁律10）：交卷时刻 - 首开时刻；无首开记录（历史行/脚本直写）为 NULL。
        # duration_sec 列保留 = 前端自报值（API 侧字段名已改为 duration_client，仅作参考）。
        _ensure_column(c, "assessment_responses", "duration_server", "INTEGER")
        # —— 终审 R+1（开课前不可逆批次）——
        # 流失分析基建（终审 #6）：19 篇文献零篇报流失，complete-case 偏倚正在被平台固化。
        # withdraw_reason=退出原因（转学/撤回同意/长期缺勤…）；withdraw_phase=退出时课题所处相位
        # ——「什么时候流失的」是差异性流失分析的必需字段，事后回忆补不准。
        _ensure_column(c, "study_members", "withdraw_reason", "TEXT")
        _ensure_column(c, "study_members", "withdraw_phase", "TEXT")
        # 分维效标（终审 #3）：criterion 行可带四要素分维小计（JSON，键名同 ct_report 的
        # report_dims 口径）。分维 r 须在**录入时**打标 —— 只有总分的誊录件事后拆不回分维。
        _ensure_column(c, "ct_criterion", "dims", "TEXT")


def _j(v, default):
    if isinstance(v, str):
        try:
            return json.loads(v)
        except Exception:
            return default
    return v if v is not None else default


def _study_row(r) -> dict:
    d = dict(r)
    d["exp_class_ids"] = _j(d.get("exp_class_ids"), [])
    d["ctrl_class_ids"] = _j(d.get("ctrl_class_ids"), [])
    d["socratic_before"] = _j(d.get("socratic_before"), {})
    return d


# ============ 课题 ============
def list_studies() -> list:
    with _conn() as c:
        return [_study_row(r) for r in c.execute("SELECT * FROM studies ORDER BY updated_at DESC").fetchall()]


def get_study(sid: int):
    with _conn() as c:
        r = c.execute("SELECT * FROM studies WHERE id=?", (sid,)).fetchone()
        return _study_row(r) if r else None


def create_study(owner: str, d: dict) -> int:
    now = _now()
    with _lock:
        with _conn() as c:
            cur = c.execute(
                "INSERT INTO studies(title,question,assign_method,exp_class_ids,ctrl_class_ids,"
                "blueprint_id,scoring_profile,formula_version,created_by,created_at,updated_at)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (d.get("title") or "未命名课题", d.get("question", ""),
                 d.get("assign_method", "intact"),
                 json.dumps(d.get("exp_class_ids", [])), json.dumps(d.get("ctrl_class_ids", [])),
                 d.get("blueprint_id", "ct-v1"),
                 # 预注册：创建后没有端点能改，杜绝事后把口径调到好看为止
                 d.get("scoring_profile", "neutral"), FORMULA_VERSION,
                 owner, now, now),
            )
            return cur.lastrowid


def update_study(sid: int, patch: dict, only_if_phase: str | None = None) -> bool:
    """`only_if_phase`：条件更新，仅当课题仍处于该阶段时才生效（按 rowcount 判赢家）。

    状态机推进必须用它：`读 phase → 更新` 两步之间没有事务，两个标签页同时点
    「结束这一轮」时两个请求都能通过前置检查 —— 条件更新让只有一个成为赢家，
    输家拿 False 直接返回，不再执行后面的冻结/恢复副作用。
    """
    if not patch:
        return False
    cols, args = [], []
    for k, v in patch.items():
        cols.append(f"{k}=?")
        args.append(json.dumps(v) if isinstance(v, (list, dict)) else v)
    args += [_now(), sid]
    sql = f"UPDATE studies SET {','.join(cols)}, updated_at=? WHERE id=?"
    if only_if_phase:
        sql += " AND phase=?"
        args.append(only_if_phase)
    with _lock, _conn() as c:
        return c.execute(sql, args).rowcount > 0


def delete_study(sid: int) -> bool:
    """手写级联 —— 本库没开 PRAGMA foreign_keys。"""
    with _lock, _conn() as c:
        for t in ("study_members", "ct_snapshots", "study_log", "ct_criterion"):
            c.execute(f"DELETE FROM {t} WHERE study_id=?", (sid,))
        return c.execute("DELETE FROM studies WHERE id=?", (sid,)).rowcount > 0


def studies_using_class(cid: int) -> list:
    """哪些**进行中**的课题引用了这个班 —— 用于拒绝删班（一轮研究做到一半样本没了）。"""
    out = []
    for s in list_studies():
        if s["phase"] in ("pretest", "running", "posttest") and (
                cid in s["exp_class_ids"] or cid in s["ctrl_class_ids"]):
            out.append({"id": s["id"], "title": s["title"], "phase": s["phase"]})
    return out


def log(sid: int, actor: str, action: str, detail: str = ""):
    with _lock, _conn() as c:
        c.execute("INSERT INTO study_log(study_id,ts,actor,action,detail) VALUES(?,?,?,?,?)",
                  (sid, _now(), actor, action, detail))


def study_log(sid: int) -> list:
    with _conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT ts,actor,action,detail FROM study_log WHERE study_id=? ORDER BY ts", (sid,)).fetchall()]


# ============ 名单快照 ============
def snapshot_members(sid: int, rows: list) -> int:
    """rows = [{student_id, group_kind, cluster_class_id, consent_ok}]。重复调用只补新人，不覆盖已入组的。"""
    now = _now()
    with _lock, _conn() as c:
        for r in rows:
            c.execute(
                "INSERT OR IGNORE INTO study_members(study_id,student_id,group_kind,cluster_class_id,consent_ok,joined_at)"
                " VALUES(?,?,?,?,?,?)",
                (sid, r["student_id"], r["group_kind"], r["cluster_class_id"], 1 if r.get("consent_ok") else 0, now))
        return c.execute("SELECT COUNT(*) FROM study_members WHERE study_id=?", (sid,)).fetchone()[0]


def members(sid: int, group_kind: str | None = None) -> list:
    sql = "SELECT * FROM study_members WHERE study_id=?"
    args: list = [sid]
    if group_kind:
        sql += " AND group_kind=?"
        args.append(group_kind)
    with _conn() as c:
        return [dict(r) for r in c.execute(sql + " ORDER BY group_kind, student_id", args).fetchall()]


def withdraw_member(sid: int, student_id: str, reason: str = "", phase: str = "") -> bool:
    """退出写时间戳而不删行 —— 转学/撤回同意是必须写进报告的失访，删掉就查不到了。

    终审 #6：一并落 reason（原因）与 phase（退出时的课题相位）。**已退出者幂等**：
    WHERE withdrawn_at IS NULL 使重复登记不覆盖首笔的时间戳/原因/相位 ——
    首次退出记录是流失审计凭证，被第二次点击改写等于把失访时点挪后。
    返回 False = 这次没写（不在名单，或早已退出），由调用侧区分两种情况。"""
    with _lock, _conn() as c:
        return c.execute(
            "UPDATE study_members SET withdrawn_at=?, withdraw_reason=?, withdraw_phase=?"
            " WHERE study_id=? AND student_id=? AND withdrawn_at IS NULL",
            (_now(), reason, phase, sid, student_id)).rowcount > 0


# ============ 测评卷 ============
def _asmt_row(r) -> dict:
    d = dict(r)
    d["items"] = _j(d.get("items"), [])
    d["dim_max"] = _j(d.get("dim_max"), {})
    return d


def list_assessments(kind: str = "") -> list:
    sql = "SELECT * FROM assessments WHERE status!='archived'"
    args: list = []
    if kind:
        sql += " AND kind=?"
        args.append(kind)
    with _conn() as c:
        return [_asmt_row(r) for r in c.execute(sql + " ORDER BY updated_at DESC", args).fetchall()]


def get_assessment(aid: int, with_answers: bool = False):
    with _conn() as c:
        r = c.execute("SELECT * FROM assessments WHERE id=?", (aid,)).fetchone()
    if not r:
        return None
    d = _asmt_row(r)
    if not with_answers:
        # 学生拿到的题目不能带标答与维度标签（维度标签也会泄题：知道考"验证"就会往测试用例上想）
        d["items"] = [{k: v for k, v in it.items() if k not in ("answer", "dim", "why")} for it in d["items"]]
    return d


def create_assessment(owner: str, d: dict) -> int:
    items = d.get("items") or []
    dim_max: dict = {}
    for it in items:
        dim_max[it.get("dim", "other")] = dim_max.get(it.get("dim", "other"), 0) + float(it.get("score", 1))
    now = _now()
    with _lock:
        with _conn() as c:
            cur = c.execute(
                "INSERT INTO assessments(title,kind,blueprint_id,items,item_count,dim_max,source,"
                "study_id,round_id,created_by,created_at,updated_at)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (d.get("title") or "计算思维测评", d.get("kind", "pre"), d.get("blueprint_id", "ct-v1"),
                 json.dumps(items, ensure_ascii=False), len(items), json.dumps(dim_max),
                 d.get("source", ""), d.get("study_id"), d.get("round_id"), owner, now, now))
            return cur.lastrowid


def lock_assessment(aid: int) -> bool:
    """下发即锁：卷子发出去之后再改题，前后测就不是同一份工具了。"""
    with _lock, _conn() as c:
        return c.execute("UPDATE assessments SET locked=1, updated_at=? WHERE id=?", (_now(), aid)).rowcount > 0


def close_assessment(aid: int) -> bool:
    """probe 关窗（学测评一体化·切分2）。首关即定：重复点关闭不改写首次关窗时刻 ——
    关窗时刻是「迟交是否有效」的裁决线，被第二次点击改写等于把裁决线挪后。"""
    now = _now()
    with _lock, _conn() as c:
        return c.execute("UPDATE assessments SET closed_at=?, updated_at=? WHERE id=? AND closed_at IS NULL",
                         (now, now, aid)).rowcount > 0


def list_study_probes(sid: int) -> list:
    """某课题名下的全部 probe 卷（教师面板/收卷率速览用；收卷率只报不阻断任何状态转移）。"""
    with _conn() as c:
        return [_asmt_row(r) for r in c.execute(
            "SELECT * FROM assessments WHERE study_id=? AND kind='probe' ORDER BY id", (sid,)).fetchall()]


def study_by_pre_assessment(aid: int):
    """由前测卷 id 反查其所属课题（时点混染防呆用：posttest 及之后拒收 pretest 补交）。"""
    with _conn() as c:
        r = c.execute("SELECT * FROM studies WHERE pre_assessment_id=?", (aid,)).fetchone()
        return _study_row(r) if r else None


def log_open(aid: int, student_id: str):
    """学生首次取卷留痕（铁律10）。INSERT OR IGNORE 只记首次 ——
    重复刷新不重置计时起点，防止临交卷前刷新一下把服务端时长刷短。"""
    with _lock, _conn() as c:
        c.execute("INSERT OR IGNORE INTO assessment_open_log(assessment_id,student_id,opened_at)"
                  " VALUES(?,?,?)", (aid, student_id, _now()))


def opened_at_of(aid: int, student_id: str) -> int | None:
    with _conn() as c:
        r = c.execute("SELECT opened_at FROM assessment_open_log WHERE assessment_id=? AND student_id=?",
                      (aid, student_id)).fetchone()
    return r[0] if r else None


def save_response(aid: int, student_id: str, d: dict) -> bool:
    """首次提交为准。重做会污染前后测差，所以用 INSERT OR IGNORE，已交返回 False。

    duration_sec = 前端自报时长（API 侧 duration_client，仅参考）；
    duration_server = 服务端「下发→提交」时差（too_fast 判定依据，铁律10）；
    round_id = 作答归轮（probe 卷从卷面带入，pre/post 为 NULL）。
    """
    with _lock, _conn() as c:
        return insert_response(c, aid, student_id, d)


def insert_response(c, aid: int, student_id: str, d: dict) -> bool:
    """Caller owns transaction, allowing API authorization and write to be atomic."""
    cur = c.execute(
        "INSERT OR IGNORE INTO assessment_responses"
        "(assessment_id,student_id,answers,total,dim_scores,item_scores,duration_sec,"
        "duration_server,round_id,flags,submitted_at)"
        " VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (aid, student_id, json.dumps(d.get("answers", [])), d.get("total", 0),
         json.dumps(d.get("dim_scores", {})), json.dumps(d.get("item_scores", [])),
         d.get("duration_sec", 0), d.get("duration_server"), d.get("round_id"),
         json.dumps(d.get("flags", []), ensure_ascii=False), _now()))
    return cur.rowcount > 0


def responses(aid: int) -> list:
    with _conn() as c:
        out = []
        for r in c.execute("SELECT * FROM assessment_responses WHERE assessment_id=?", (aid,)).fetchall():
            d = dict(r)
            d["dim_scores"] = _j(d.get("dim_scores"), {})
            d["item_scores"] = _j(d.get("item_scores"), [])
            d["flags"] = _j(d.get("flags"), [])
            out.append(d)
        return out


def response_of(aid: int, student_id: str):
    with _conn() as c:
        r = c.execute("SELECT * FROM assessment_responses WHERE assessment_id=? AND student_id=?",
                      (aid, student_id)).fetchone()
    if not r:
        return None
    d = dict(r)
    d["dim_scores"] = _j(d.get("dim_scores"), {})
    d["flags"] = _j(d.get("flags"), [])
    return d


# ============ 期段快照 ============
def save_snapshot(sid: int, segment: str, row: dict):
    """快照 upsert。两条不变量：

    ① `socratic_during` **首写即定，重算不覆盖**。end 端点是「先冻结、再恢复班级设置」，
       所以第一笔写入的必然是干预期实况；而 recompute（以及并发双击 end 时晚到的那次冻结）
       都发生在设置恢复之后 —— 它们现取的实时值是**恢复后**的，一旦允许覆盖，
       实验组会被冲成 0、逐生刷出保真度告警，「干预保真度受影响」被写进结题报告，
       污蔑一次做得很规范的干预。干预段快照只可能由 end 首写（started_at 为空时
       _freeze 直接跳过该段），所以首写即定恰好总是对的。
    ② 自述字段（win_start / win_end / scoring_profile / formula_version）**跟着 dims 一起更新**。
       原来 DO UPDATE 漏了它们：平台升口径后 recompute，dims 按新公式重写、
       标签还挂着旧版本 —— 快照对自己的描述是假的，比没有快照更危险。
    """
    with _lock, _conn() as c:
        c.execute(
            "INSERT INTO ct_snapshots(study_id,segment,student_id,group_kind,win_start,win_end,dims,behavior,"
            "success_rate,engaged_minutes,evidence_count,has_real_data,socratic_during,sv_mixed,"
            "scoring_profile,formula_version,computed_at)"
            " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
            " ON CONFLICT(study_id,segment,student_id) DO UPDATE SET"
            " dims=excluded.dims, behavior=excluded.behavior, success_rate=excluded.success_rate,"
            " engaged_minutes=excluded.engaged_minutes, evidence_count=excluded.evidence_count,"
            " has_real_data=excluded.has_real_data,"
            " win_start=excluded.win_start, win_end=excluded.win_end,"
            " scoring_profile=excluded.scoring_profile, formula_version=excluded.formula_version,"
            " sv_mixed=excluded.sv_mixed, computed_at=excluded.computed_at",
            (sid, segment, row["student_id"], row["group_kind"], row["win_start"], row["win_end"],
             json.dumps(row["dims"]), json.dumps(row["behavior"]),
             row["success_rate"], row["engaged_minutes"], row["evidence_count"],
             1 if row["has_real_data"] else 0, 1 if row.get("socratic_during") else 0,
             1 if row.get("sv_mixed") else 0,
             row.get("scoring_profile", "neutral"), FORMULA_VERSION, _now()))


def snapshots(sid: int, segment: str | None = None) -> list:
    sql = "SELECT * FROM ct_snapshots WHERE study_id=?"
    args: list = [sid]
    if segment:
        sql += " AND segment=?"
        args.append(segment)
    with _conn() as c:
        out = []
        for r in c.execute(sql, args).fetchall():
            d = dict(r)
            d["dims"] = _j(d.get("dims"), {})
            d["behavior"] = _j(d.get("behavior"), {})
            out.append(d)
        return out


# ============ 外部效标（T0-1）============
CRITERION_PHASES = ("pre", "post", "delayed", "probe")


def save_criterion(sid: int, student_id: str, phase: str, instrument: str,
                   item_scores: list, total: float, dims: dict | None = None):
    """录入/覆盖一条效标。同一 (study,student,phase,instrument) 唯一，重复录入即覆盖
    （教师誊分改错是常态；效标是誊录件不是过程数据，不需要留旧值）。

    dims（终审 #3）：四要素分维小计（键名同 ct_report 的 report_dims），可空。
    覆盖时用 COALESCE：新录入**带** dims 就覆盖，**不带**则保留旧值 ——
    分维标记只能在录入时打、事后补不回，绝不许一次只改总分的誊分把它抹成 NULL。"""
    with _lock, _conn() as c:
        c.execute(
            "INSERT INTO ct_criterion(study_id,student_id,phase,instrument,item_scores,total,dims,created_at)"
            " VALUES(?,?,?,?,?,?,?,?)"
            " ON CONFLICT(study_id,student_id,phase,instrument) DO UPDATE SET"
            " item_scores=excluded.item_scores, total=excluded.total,"
            " dims=COALESCE(excluded.dims, ct_criterion.dims), created_at=excluded.created_at",
            (sid, student_id, phase, instrument, json.dumps(item_scores), total,
             json.dumps(dims, ensure_ascii=False) if dims is not None else None, _now()))


def list_criterion(sid: int, phase: str | None = None, student_id: str | None = None) -> list:
    sql = "SELECT * FROM ct_criterion WHERE study_id=?"
    args: list = [sid]
    if phase:
        sql += " AND phase=?"
        args.append(phase)
    if student_id:
        sql += " AND student_id=?"
        args.append(student_id)
    with _conn() as c:
        out = []
        for r in c.execute(sql + " ORDER BY phase, student_id", args).fetchall():
            d = dict(r)
            d["item_scores"] = _j(d.get("item_scores"), [])
            # dims 原样返回：没打过标是 None（真值：录入时未标分维），不硬造空 dict
            d["dims"] = _j(d.get("dims"), None)
            out.append(d)
        return out


init()
