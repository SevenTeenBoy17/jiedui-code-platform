"""ai_reply_log 落库（定稿 §B2-x 的第 0 步）。

定稿前置发现：CX 此前**没有任何 navigator 输出落库** —— ai.py 里 reply 生成后直接进
return 字典，连算好的 phase / asks 都不落。所以 B-2 的第一步不是标注，是加这张表。

【铁律：只存分类与元数据，不存回复原文】与 chat_log「无 content 列是设计不是省事」同纪律。
本表虽然存的是**机器自己生成的文本**（不触碰学生语义采集红线），但一旦开了 content 列，
它就会顺理成章地被拿去存别的东西；而分类 + 元数据已足够支撑 manipulation check 的全部结论。
`evidence` 存的是闭合词表里的**锚点名**（如 "RQ:为什么"），不是回复切片 —— 见 reply_class.py。

`student_id` 只作抽样分层与剔除未同意者用；统计端点默认按 T0-2 分析集口径剔除无监护人同意者。

风格照 store_learner.py：复用 store.DB_PATH（同一个库，测试夹具打的补丁自动生效）、
stdlib sqlite3 + WAL + threading.Lock()、CREATE TABLE IF NOT EXISTS + 幂等加列。
"""
import time
import sqlite3
import threading

from app.store import DB_PATH

_lock = threading.Lock()

# 折叠码全集（reply_class.py 的 _ORDER + 兜底 O）。统计端点用它保证每类都出现在结果里，
# 计数为 0 的类也要显式报 0 —— 缺键会让前端把「这类一条都没有」渲染成「没取到」。
CLASSES = ("CQ", "EQ", "RQ", "D", "O")


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
            CREATE TABLE IF NOT EXISTS ai_reply_log(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              student_id  TEXT NOT NULL,
              room_id     TEXT,               -- 无房间的个人对话为 NULL（真值，不是缺数据）
              round_index INTEGER,            -- 该房间无进行中的轮时为 NULL，同上
              role        TEXT NOT NULL,      -- 'turtle'|'reviewer'（请求角色原样）
              socratic    INTEGER NOT NULL,   -- 0/1：本轮是否强制苏格拉底
              scaffold_level INTEGER NOT NULL,-- 0-3，服务端权威档位
              source      TEXT NOT NULL,      -- 'llm'|'fallback'
              -- 多标二值（定稿主口径，占比结论只能用这四列）
              cq INTEGER NOT NULL, eq INTEGER NOT NULL,
              rq INTEGER NOT NULL, d  INTEGER NOT NULL,
              violation   INTEGER NOT NULL,   -- = d，D override；红线违规率的分子
              reply_class TEXT NOT NULL,      -- 折叠码，仅供单值展示/分层，**不进占比结论**
              evidence    TEXT,               -- 命中锚点名（闭合词表常量，非回复片段）
              reply_len   INTEGER NOT NULL,
              asks        INTEGER NOT NULL,
              has_code_block INTEGER NOT NULL,
              prompt_version TEXT,            -- 提示词一改历史标注即不可比（定稿 §B7）
              created_at  INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_arl_room ON ai_reply_log(room_id, round_index);
            CREATE INDEX IF NOT EXISTS idx_arl_stu ON ai_reply_log(student_id, created_at);
            """
        )


# 存原文是本表唯一不可越的线，因此把「不许出现的列名」写成常量并由测试直接断言，
# 而不是只写在注释里 —— 注释拦不住下一次 ALTER。
FORBIDDEN_COLUMNS = ("reply", "content", "text", "message", "raw")


def columns() -> list[str]:
    with _conn() as c:
        return [r[1] for r in c.execute("PRAGMA table_info(ai_reply_log)")]


def add(student_id: str, role: str, source: str, scaffold_level: int, socratic: bool,
        detail: dict, room_id: str | None = None, round_index: int | None = None,
        prompt_version: str = "") -> int:
    """写一条。`detail` 来自 reply_class.classify_detail()，调用方不得自行拼分类结果。"""
    with _lock, _conn() as c:
        cur = c.execute(
            "INSERT INTO ai_reply_log(student_id,room_id,round_index,role,socratic,scaffold_level,"
            "source,cq,eq,rq,d,violation,reply_class,evidence,reply_len,asks,has_code_block,"
            "prompt_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (student_id, room_id or None, round_index, role, 1 if socratic else 0, int(scaffold_level),
             source, detail["cq"], detail["eq"], detail["rq"], detail["d"], detail["violation"],
             detail["reply_class"], detail["evidence"], detail["reply_len"], detail["asks"],
             detail["has_code_block"], prompt_version or None, _now()),
        )
        return int(cur.lastrowid or 0)


def rows(room_id: str = "", student_ids: list[str] | None = None,
         source: str = "", limit: int = 5000, with_truncated: bool = False):
    """取原始行（供统计聚合）。student_ids 为空列表时返回空 —— 「名单里一个人都没有」
    与「不按名单过滤」是两回事，前者绝不能退化成后者（那会把全平台数据算进某个课题）。

    with_truncated=True 时返回 (rows, truncated)：回复行是 uptake 全部锚点与供给侧分母的
    **唯一来源**，5000 条上限一旦触顶而无标记，n_anchors 会静默变小（U4/U5 复核 P2-3）。
    哨兵式 +1 取数，与 uptake.load_events 同款。默认签名不变，既有调用方零改动。"""
    if student_ids is not None and not student_ids:
        return ([], False) if with_truncated else []
    sql = "SELECT * FROM ai_reply_log WHERE 1=1"
    args: list = []
    if room_id:
        sql += " AND room_id=?"
        args.append(room_id)
    if source:
        sql += " AND source=?"
        args.append(source)
    if student_ids:
        sql += f" AND student_id IN ({','.join('?' * len(student_ids))})"
        args += student_ids
    sql += " ORDER BY id DESC LIMIT ?"
    args.append(int(limit) + 1)                  # 多取一条只为判断是否触顶
    try:
        with _conn() as c:
            got = [dict(r) for r in c.execute(sql, args).fetchall()]
            truncated = len(got) > int(limit)
            got = got[:int(limit)]
            return (got, truncated) if with_truncated else got
    except sqlite3.OperationalError:
        return ([], False) if with_truncated else []      # 老库还没建表：空集，不是 500


init()
