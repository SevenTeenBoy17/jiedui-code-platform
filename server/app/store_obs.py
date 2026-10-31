"""
教师结构化观察表（交付物 A 包）的持久化 ——《观察表与评分金标准_定稿》§A1 建表建议。

四条定稿红线，逐条落在表结构与本层函数上：
- **observer_id NOT NULL**（§A1 原文「绝不可空」）：没有它就永远算不出观察者间一致性。
  取值由 obs.py 从令牌 sub 写入，**不信客户端** —— 观察者身份是信度分析的分组键，
  可伪造即不可用；一旦某一批的 observer 记成了别人，κ 是算不回来的。
- **observed_from / observed_to 服务端写**（§A1「表单自动写，禁人工填」）：
  §A9.2 的 MTS 无偏性只依赖一个条件——观察时刻与行为相位独立。人工填时刻等于把
  「教师什么时候想记」引进估计量，整套驾驶时间占比作废。
- **SRC 三码多选并存**（§A5）：src_a/src_p/src_s 三列各自 0/1，同一窗可同时点亮。
  定稿在此处**主动拒绝**了 15 孙贞岳 p.45-46「保护稀有类」的优先级仲裁：
  孙的场景里被保护的类不是他的因变量，保护无害；CX 的 P 就是因变量本身，
  「同窗同时出现 P 与 A 时判 P」= 用编码规则伪造研究结论。**本层不做任何 SRC 仲裁**。
- **X（没看清）不设独立格**（§A2 T1-5）：每个判定格自带 unclear 选项，
  X 率由后端从各格自动汇总（obs.py 的 /quality）—— 教师不会主动勾「我判不出」，
  设独立格的话 X 率恒接近 0，穷尽性检验永远触发不了。

风格照 store_learner.py / store_study.py：stdlib sqlite3 + WAL + threading.Lock()、无 ORM、
建表一律 CREATE TABLE IF NOT EXISTS、加列走 _ensure_column 幂等迁移
（老师机器上的 jiedui.db 有真实数据，不能删库重建）。
"""
import time
import sqlite3
import threading

from app.store import DB_PATH

_lock = threading.Lock()

# ============ 判定格的取值全集（单一真源；obs.py 的入口校验只引用这里）============
LAYERS = ("sweep", "focus")
# 键鼠归属（§A2 KB）：'none'=都没碰，'both'=两人同抢，'unclear'=没看清。
# 后三者**不是脏值也不是缺数据**，是定稿明文要求如实点的真值（§A0：「都没碰」和「两人同抢」
# 都要如实点，不要凑成 L 或 R —— 两人同抢率 >10% 比占比本身更重要）。
KB_CODES = ("L", "R", "none", "both", "unclear")
SEATS = ("L", "R")
# N 维（§A2）：n1 卡住 / n2 离题 / n3 争执。定稿允许对 N 做仲裁（N1>N3>N2），
# 但那是分析层的事，落库层一律原样存教师点的那一个。
N_CODES = ("none", "n1", "n2", "n3", "unclear")
# 6 预置事件标签（§A2 主表最后一列，一击）。唯一的自由字段是 evt_note（≤20 字）——
# 自由文本进不了统计管线，且在 chat_log 纯元数据的铁律下会凭空开一个语义采集面。
EVT_TAGS = ("争执升级", "一方退出", "求助无人应", "设备故障", "AI给整段码", "其他")
EVT_NOTE_MAX = 20
TECH_STATUS = ("正常", "卡顿", "掉线")

# —— focus 层（§A3）的枚举 ——
# F1 触发源四选一（§A3）：①未换 ②教师口头提醒 ③系统弹层提醒 ④学生自行提出。
# ④ 是「联防规则」的一格（§A5：N3 × F1触发源④ × F5 三格并读），换位次数不得单独解读。
F1_TRIGGERS = ("none", "teacher", "system", "student")
F2_SHARED = ("driver_only", "both", "both_discussed", "no_ai")   # AI 回复共看四选一
F3_AFTER_HINT = ("direct", "discussed")                          # 提示后处置二值
F5_DIRECTIONS = ("peer_gt_ai", "ai_gt_peer", "equal")            # 交流去向三选一

# 窗长（服务端回推 observed_from 用）。§A1：sweep 一窗 ≈13 秒（瞬时状态判定）；
# focus 一窗 = 整轮连续 ≈8 分钟（§A3 定稿把草案的 2 对×5 分钟改成 1 对×整轮）。
WINDOW_SEC = {"sweep": 13, "focus": 8 * 60}


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    return c


def _now() -> int:
    return int(time.time())


def _ensure_column(c, table: str, col: str, decl: str):
    """幂等加列（照 store_study._ensure_column）。SQLite 下 ADD COLUMN 是 O(1) 元数据操作。"""
    cols = {r[1] for r in c.execute(f"PRAGMA table_info({table})")}
    if col not in cols:
        c.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")


def init():
    with _lock, _conn() as c:
        c.executescript(
            """
            -- ① 观察窗：分析单位 = 一个 pair × 一个观察窗（§A1）。
            --    sweep 与 focus 共表不共列：focus 专用列在 sweep 行上一律 NULL（§A1 明文），
            --    NULL 在本仓是真值不是缺数据 —— 「这一层结构上没有这一格」。
            --    ⚠️ 量程不同不得合并：sweep 的 SRC 三码是**时点占有率**（MTS），
            --    focus 的是**事件式**（本段内是否出现），focus 作 sweep 的地面真值（§A1）。
            CREATE TABLE IF NOT EXISTS obs_window(
              id            INTEGER PRIMARY KEY AUTOINCREMENT,
              study_id      TEXT    NOT NULL,
              room_id       TEXT    NOT NULL,          -- 与 ct_events / learning_round 同键
              round_index   INTEGER NOT NULL,          -- 1-3
              pair_id       TEXT    NOT NULL,
              seat          TEXT,                      -- 'L'|'R'|NULL(pair 级行)
              student_id    TEXT,                      -- 对上 round_snapshot；pair 级行为 NULL
              window_seq    INTEGER NOT NULL,
              layer         TEXT    NOT NULL,          -- 'sweep'|'focus'
              observer_id   TEXT    NOT NULL,          -- 【绝不可空】没有它算不出观察者间一致性
              observed_from INTEGER NOT NULL,          -- 服务端写，禁人工填
              observed_to   INTEGER NOT NULL,
              window_offset_sec INTEGER,               -- 窗起点 − 轮起点；A7 敏感性协变量
              tech_status   TEXT,                      -- 页眉级：'正常'|'卡顿'|'掉线'
              created_at    INTEGER NOT NULL,
              -- 判定格（sweep 五格）
              kb            TEXT,                      -- 'L'|'R'|'none'|'both'|'unclear'
              src_a         INTEGER,                   -- 0/1；**多选并存**，不互斥（§A5）
              src_p         INTEGER,
              src_s         INTEGER,
              src_unclear   INTEGER DEFAULT 0,         -- 1 时三码一律 NULL（§A1）
              n_code        TEXT,                      -- 'none'|'n1'|'n2'|'n3'|'unclear'
              evt_tag       TEXT,                      -- 6 预置标签之一或 NULL
              evt_note      TEXT,                      -- ≤20 字，唯一自由字段
              -- focus 专用：换手锚定分段（§A3；sweep 一律 NULL）
              segment_seq         INTEGER,
              segment_driver_seat TEXT,                -- 'L'|'R'
              segment_from        INTEGER,
              segment_to          INTEGER,
              f1_switches   INTEGER,                   -- F1 本段实际易手次数
              f1_trigger    TEXT,                      -- F1 触发源四选一
              f2_shared     TEXT,                      -- F2 AI 回复共看四选一
              f3_after_hint TEXT,                      -- F3 提示后处置二值
              f4_l_turns    INTEGER,                   -- F4 话轮归属：L 发起（只留「谁发起」，T1-6）
              f4_r_turns    INTEGER,                   -- F4 话轮归属：R 发起
              r0_count      INTEGER,                   -- R0 应答兜底，**不计入任何支架来源**
              f5_direction  TEXT                       -- F5 交流去向三选一
            );
            CREATE INDEX IF NOT EXISTS idx_obs_room ON obs_window(room_id, round_index);
            CREATE INDEX IF NOT EXISTS idx_obs_observer ON obs_window(observer_id);
            CREATE INDEX IF NOT EXISTS idx_obs_study ON obs_window(study_id, layer);

            -- ② seat→student 的唯一权威来源（§A1 明文补的草案缺口：写了 seat 却没定谁产生它）。
            --    **首写即冻结**（frozen_at + INSERT OR IGNORE）：席位归属是事后 join 的锚，
            --    允许改写等于允许事后调整「谁坐左边」，T1 席位对齐就没有可辩护的基准了。
            CREATE TABLE IF NOT EXISTS seat_map(
              room_id TEXT, round_index INTEGER, seat TEXT, student_id TEXT,
              frozen_at INTEGER, PRIMARY KEY(room_id, round_index, seat)
            );
            """
        )
        # 幂等迁移位（本表首版即全列；后续新增编码格照此加，绝不删库重建）
        _ensure_column(c, "obs_window", "evt_note", "TEXT")


# ============ obs_window ============
_COLS = ("study_id", "room_id", "round_index", "pair_id", "seat", "student_id", "window_seq",
         "layer", "observer_id", "observed_from", "observed_to", "window_offset_sec",
         "tech_status", "created_at", "kb", "src_a", "src_p", "src_s", "src_unclear",
         "n_code", "evt_tag", "evt_note", "segment_seq", "segment_driver_seat",
         "segment_from", "segment_to", "f1_switches", "f1_trigger", "f2_shared",
         "f3_after_hint", "f4_l_turns", "f4_r_turns", "r0_count", "f5_direction")


def add_windows(rows: list[dict]) -> list[int]:
    """批量落一轮的多对（§A2：sweep 一轮 22 对，教师一次交一张表）。

    同一批共用一个事务：半批落库会让 X 率的分母变成「教师交了一半」，
    而 X 率是效度闸门（§A2 T1-5），分母不完整时它给出的判断是假的。
    """
    q = ",".join("?" * len(_COLS))
    sql = f"INSERT INTO obs_window({','.join(_COLS)}) VALUES({q})"
    ids: list[int] = []
    with _lock, _conn() as c:
        for r in rows:
            ids.append(c.execute(sql, tuple(r.get(k) for k in _COLS)).lastrowid)
    return ids


def list_windows(study_id: str, room_id: str | None = None, round_index: int | None = None,
                 layer: str | None = None, pair_id: str | None = None) -> list:
    sql = "SELECT * FROM obs_window WHERE study_id=?"
    args: list = [study_id]
    for col, val in (("room_id", room_id), ("round_index", round_index),
                     ("layer", layer), ("pair_id", pair_id)):
        if val is not None and val != "":
            sql += f" AND {col}=?"
            args.append(val)
    sql += " ORDER BY round_index, window_seq, pair_id, id"
    with _conn() as c:
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def count_windows(student_id: str, tech_status: str | None = None) -> int:
    """某学生名下的观察窗条数（SRC-proxy 的**锚定样本量**，§A15：anchor_n<30 不得单独作结论）。
    tech_status 传值时只数该状态的轮 —— 定稿规定锚定子集只能取 tech_status='正常' 的轮。"""
    sql, args = "SELECT COUNT(*) FROM obs_window WHERE student_id=?", [student_id]
    if tech_status:
        sql += " AND tech_status=?"
        args.append(tech_status)
    with _conn() as c:
        return c.execute(sql, args).fetchone()[0]


# ============ seat_map（seat→student 的唯一权威来源）============
def freeze_seat(room_id: str, round_index: int, seat: str, student_id: str) -> bool:
    """首写即冻结，已有行返回 False（不覆盖）。"""
    with _lock, _conn() as c:
        return c.execute(
            "INSERT OR IGNORE INTO seat_map(room_id,round_index,seat,student_id,frozen_at)"
            " VALUES(?,?,?,?,?)", (room_id, round_index, seat, student_id, _now())).rowcount > 0


def seat_students(room_id: str, round_index: int) -> dict:
    """(room, round) 的席位→学生映射。seat_map 是权威来源；它尚未冻结时**回退**读
    obs_window 里自带 seat+student_id 的席位行（次优真源，取最早的一条）。
    两处都没有 → 返回空 dict，调用侧据此把该窗计为「席位不可解析」并如实报出，
    绝不猜 —— 猜错的席位会直接把 T1 不一致率算反。"""
    out: dict = {}
    with _conn() as c:
        for r in c.execute("SELECT seat, student_id FROM seat_map"
                           " WHERE room_id=? AND round_index=?", (room_id, round_index)).fetchall():
            if r["seat"] in SEATS and r["student_id"]:
                out[r["seat"]] = r["student_id"]
        for r in c.execute("SELECT seat, student_id FROM obs_window"
                           " WHERE room_id=? AND round_index=? AND seat IN ('L','R')"
                           " AND student_id IS NOT NULL ORDER BY id",
                           (room_id, round_index)).fetchall():
            out.setdefault(r["seat"], r["student_id"])
    return out


init()
