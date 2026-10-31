"""
资源中心持久化（V3.5）：题库 / 学习视频 / 练习集 / 推送记录。
风格与 store.py 一致：stdlib sqlite3 + WAL + _lock，无 ORM。
注意：本库未开 PRAGMA foreign_keys，级联删除一律手写（与 store.delete_project 同）。
"""
import json
import sqlite3
import threading
import time

from app.store import DB_PATH

_lock = threading.Lock()


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
            CREATE TABLE IF NOT EXISTS exercises(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              summary TEXT DEFAULT '',
              statement TEXT DEFAULT '',
              language TEXT NOT NULL DEFAULT 'python',   -- python|cpp|c
              difficulty INTEGER NOT NULL DEFAULT 2,     -- 1入门 2基础 3提高 4挑战
              starter_code TEXT DEFAULT '',
              reference_solution TEXT DEFAULT '',        -- 仅教师可见，学生接口裁掉
              test_cases TEXT NOT NULL DEFAULT '[]',     -- [{"in":"","out":"","hidden":0}]
              case_count INTEGER NOT NULL DEFAULT 0,
              hints TEXT NOT NULL DEFAULT '[]',          -- 苏格拉底提示阶梯
              ct_dims TEXT NOT NULL DEFAULT '{}',        -- {"algorithm":5,...} 六维权重
              ct_primary TEXT,
              tags TEXT NOT NULL DEFAULT '[]',
              related_video_id INTEGER,
              status TEXT NOT NULL DEFAULT 'published',  -- draft|published|archived
              created_by TEXT NOT NULL,
              created_at INTEGER, updated_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_ex_filter ON exercises(status, language, difficulty);
            CREATE INDEX IF NOT EXISTS idx_ex_recent ON exercises(updated_at DESC);

            CREATE TABLE IF NOT EXISTS videos(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              summary TEXT DEFAULT '',
              url TEXT NOT NULL,
              poster_url TEXT,
              duration_sec INTEGER DEFAULT 0,
              language TEXT,
              category TEXT,                             -- 入门|语法|算法|调试|项目
              tags TEXT NOT NULL DEFAULT '[]',
              ct_dims TEXT NOT NULL DEFAULT '{}',
              status TEXT NOT NULL DEFAULT 'published',
              review_state TEXT NOT NULL DEFAULT 'ok',   -- ok|pending|blocked（外链白名单）
              created_by TEXT NOT NULL,
              created_at INTEGER, updated_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_vd_filter ON videos(status, category);

            CREATE TABLE IF NOT EXISTS exercise_sets(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              goal TEXT DEFAULT '',
              language TEXT,
              item_count INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'published',
              created_by TEXT NOT NULL,
              created_at INTEGER, updated_at INTEGER
            );

            CREATE TABLE IF NOT EXISTS set_items(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              set_id INTEGER NOT NULL,
              item_type TEXT NOT NULL,                   -- exercise|video
              ref_id INTEGER NOT NULL,
              position INTEGER NOT NULL DEFAULT 0,
              required INTEGER NOT NULL DEFAULT 1,
              note TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_si_set ON set_items(set_id, position);

            -- 班级（V5 教学·任务下发与学情统计的单位）
            CREATE TABLE IF NOT EXISTS classes(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              grade TEXT,
              note TEXT DEFAULT '',
              created_by TEXT NOT NULL,
              created_at INTEGER, updated_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS class_students(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              class_id INTEGER NOT NULL,
              student_id TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_cs_uniq ON class_students(class_id, student_id);
            CREATE INDEX IF NOT EXISTS idx_cs_stu ON class_students(student_id);
            -- 班级级教学设置。socratic=1 → 本班强制苏格拉底式引导：
            -- 服务端每次 AI 对话都读它并覆盖请求体，学生删掉 URL 参数也解不开。
            CREATE TABLE IF NOT EXISTS class_settings(
              class_id INTEGER PRIMARY KEY,
              socratic INTEGER DEFAULT 0,
              updated_at INTEGER
            );

            -- 课例库（V4 教研·操作性成果沉淀）
            CREATE TABLE IF NOT EXISTS cases(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              title TEXT NOT NULL,
              grade TEXT,                                -- 七年级|八年级|九年级
              language TEXT,
              goal TEXT DEFAULT '',                      -- 教学目标（一句话）
              ct_dims TEXT NOT NULL DEFAULT '{}',        -- 主要培养的六维
              flow TEXT NOT NULL DEFAULT '[]',           -- 教学流程 [{stage,minutes,teacher,student}]
              reflection TEXT DEFAULT '',                -- 教学反思
              set_id INTEGER,                            -- 关联练习集
              status TEXT NOT NULL DEFAULT 'published',
              created_by TEXT NOT NULL,
              created_at INTEGER, updated_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_case_recent ON cases(updated_at DESC);

            CREATE TABLE IF NOT EXISTS pushes(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              res_type TEXT NOT NULL,                    -- exercise|video|set
              res_id INTEGER NOT NULL,
              reason TEXT DEFAULT '',                    -- 推荐理由（学生可见）
              due_at INTEGER,
              required INTEGER NOT NULL DEFAULT 0,
              created_by TEXT NOT NULL,
              created_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_push_recent ON pushes(created_at DESC);

            CREATE TABLE IF NOT EXISTS push_targets(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              push_id INTEGER NOT NULL,
              student_id TEXT NOT NULL,
              read_at INTEGER,
              done_at INTEGER
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_pt_uniq ON push_targets(push_id, student_id);
            CREATE INDEX IF NOT EXISTS idx_pt_stu ON push_targets(student_id);
            """
        )


# ============ 题库 ============
_EX_PUBLIC = "id,title,summary,statement,language,difficulty,starter_code,test_cases,case_count,hints,ct_dims,ct_primary,tags,related_video_id,status,created_at,updated_at"


def list_exercises(q: str = "", language: str = "", difficulty: int = 0, limit: int = 100):
    sql = f"SELECT {_EX_PUBLIC} FROM exercises WHERE status!='archived'"
    args: list = []
    if q:
        sql += " AND (title LIKE ? OR summary LIKE ? OR tags LIKE ?)"
        args += [f"%{q}%"] * 3
    if language:
        sql += " AND language=?"
        args.append(language)
    if difficulty:
        sql += " AND difficulty=?"
        args.append(difficulty)
    sql += " ORDER BY updated_at DESC LIMIT ?"
    args.append(limit)
    with _conn() as c:
        return [_ex_row(r) for r in c.execute(sql, args).fetchall()]


def _ex_row(r) -> dict:
    d = dict(r)
    for k in ("test_cases", "hints", "ct_dims", "tags"):
        if k in d and isinstance(d[k], str):
            try:
                d[k] = json.loads(d[k])
            except Exception:
                d[k] = [] if k != "ct_dims" else {}
    return d


def get_exercise(eid: int, with_solution: bool = False):
    cols = "*" if with_solution else _EX_PUBLIC
    with _conn() as c:
        r = c.execute(f"SELECT {cols} FROM exercises WHERE id=?", (eid,)).fetchone()
        return _ex_row(r) if r else None


def create_exercise(owner: str, d: dict) -> int:
    now = _now()
    cases = d.get("test_cases") or []
    dims = d.get("ct_dims") or {}
    primary = max(dims, key=dims.get) if dims else None
    with _lock:
        with _conn() as c:
            cur = c.execute(
                "INSERT INTO exercises(title,summary,statement,language,difficulty,starter_code,"
                "reference_solution,test_cases,case_count,hints,ct_dims,ct_primary,tags,related_video_id,"
                "status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (d.get("title", "未命名题目"), d.get("summary", ""), d.get("statement", ""),
                 d.get("language", "python"), int(d.get("difficulty", 2)), d.get("starter_code", ""),
                 d.get("reference_solution", ""), json.dumps(cases, ensure_ascii=False), len(cases),
                 json.dumps(d.get("hints") or [], ensure_ascii=False), json.dumps(dims, ensure_ascii=False),
                 primary, json.dumps(d.get("tags") or [], ensure_ascii=False), d.get("related_video_id"),
                 d.get("status", "published"), owner, now, now),
            )
            return cur.lastrowid


def update_exercise(eid: int, d: dict) -> bool:
    sets, args = [], []
    for k in ("title", "summary", "statement", "language", "difficulty", "starter_code",
              "reference_solution", "status", "related_video_id"):
        if k in d:
            sets.append(f"{k}=?")
            args.append(d[k])
    if "test_cases" in d:
        cases = d["test_cases"] or []
        sets += ["test_cases=?", "case_count=?"]
        args += [json.dumps(cases, ensure_ascii=False), len(cases)]
    for k in ("hints", "tags"):
        if k in d:
            sets.append(f"{k}=?")
            args.append(json.dumps(d[k] or [], ensure_ascii=False))
    if "ct_dims" in d:
        dims = d["ct_dims"] or {}
        sets += ["ct_dims=?", "ct_primary=?"]
        args += [json.dumps(dims, ensure_ascii=False), max(dims, key=dims.get) if dims else None]
    if not sets:
        return False
    sets.append("updated_at=?")
    args += [_now(), eid]
    with _lock, _conn() as c:
        return c.execute(f"UPDATE exercises SET {','.join(sets)} WHERE id=?", args).rowcount > 0


def delete_exercise(eid: int) -> bool:
    with _lock, _conn() as c:
        c.execute("DELETE FROM set_items WHERE item_type='exercise' AND ref_id=?", (eid,))
        return c.execute("DELETE FROM exercises WHERE id=?", (eid,)).rowcount > 0


# ============ 视频 ============
def list_videos(q: str = "", category: str = "", limit: int = 100):
    sql = "SELECT * FROM videos WHERE status!='archived'"
    args: list = []
    if q:
        sql += " AND (title LIKE ? OR summary LIKE ?)"
        args += [f"%{q}%"] * 2
    if category:
        sql += " AND category=?"
        args.append(category)
    sql += " ORDER BY updated_at DESC LIMIT ?"
    args.append(limit)
    with _conn() as c:
        return [_vd_row(r) for r in c.execute(sql, args).fetchall()]


def _vd_row(r) -> dict:
    d = dict(r)
    for k in ("tags", "ct_dims"):
        if isinstance(d.get(k), str):
            try:
                d[k] = json.loads(d[k])
            except Exception:
                d[k] = [] if k == "tags" else {}
    return d


def get_video(vid: int):
    with _conn() as c:
        r = c.execute("SELECT * FROM videos WHERE id=?", (vid,)).fetchone()
        return _vd_row(r) if r else None


def create_video(owner: str, d: dict, review_state: str = "ok") -> int:
    now = _now()
    with _lock:
        with _conn() as c:
            cur = c.execute(
                "INSERT INTO videos(title,summary,url,poster_url,duration_sec,language,category,tags,"
                "ct_dims,status,review_state,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (d.get("title", "未命名视频"), d.get("summary", ""), d.get("url", ""), d.get("poster_url"),
                 int(d.get("duration_sec") or 0), d.get("language"), d.get("category"),
                 json.dumps(d.get("tags") or [], ensure_ascii=False),
                 json.dumps(d.get("ct_dims") or {}, ensure_ascii=False),
                 d.get("status", "published"), review_state, owner, now, now),
            )
            return cur.lastrowid


def delete_video(vid: int) -> bool:
    with _lock, _conn() as c:
        c.execute("DELETE FROM set_items WHERE item_type='video' AND ref_id=?", (vid,))
        return c.execute("DELETE FROM videos WHERE id=?", (vid,)).rowcount > 0


# ============ 练习集 ============
def list_sets(limit: int = 100):
    with _conn() as c:
        return [dict(r) for r in c.execute(
            "SELECT * FROM exercise_sets WHERE status!='archived' ORDER BY updated_at DESC LIMIT ?", (limit,)
        ).fetchall()]


def get_set(sid: int):
    with _conn() as c:
        s = c.execute("SELECT * FROM exercise_sets WHERE id=?", (sid,)).fetchone()
        if not s:
            return None
        items = [dict(r) for r in c.execute(
            "SELECT * FROM set_items WHERE set_id=? ORDER BY position", (sid,)).fetchall()]
    d = dict(s)
    # 补每条目的标题，避免前端 N 次请求
    for it in items:
        ref = get_exercise(it["ref_id"]) if it["item_type"] == "exercise" else get_video(it["ref_id"])
        it["title"] = (ref or {}).get("title", "(已删除)")
    d["items"] = items
    return d


def create_set(owner: str, d: dict) -> int:
    now = _now()
    with _lock:
        with _conn() as c:
            cur = c.execute(
                "INSERT INTO exercise_sets(title,goal,language,item_count,status,created_by,created_at,updated_at)"
                " VALUES(?,?,?,0,?,?,?,?)",
                (d.get("title", "未命名练习集"), d.get("goal", ""), d.get("language"),
                 d.get("status", "published"), owner, now, now),
            )
            return cur.lastrowid


def set_items_replace(sid: int, items: list) -> int:
    """整表替换集内条目（拖拽排序后一次落库）。"""
    with _lock, _conn() as c:
        c.execute("DELETE FROM set_items WHERE set_id=?", (sid,))
        for i, it in enumerate(items):
            c.execute(
                "INSERT INTO set_items(set_id,item_type,ref_id,position,required,note) VALUES(?,?,?,?,?,?)",
                (sid, it.get("item_type", "exercise"), int(it["ref_id"]), i,
                 int(it.get("required", 1)), it.get("note")),
            )
        c.execute("UPDATE exercise_sets SET item_count=?, updated_at=? WHERE id=?", (len(items), _now(), sid))
        return len(items)


def delete_set(sid: int) -> bool:
    with _lock, _conn() as c:
        c.execute("DELETE FROM set_items WHERE set_id=?", (sid,))
        return c.execute("DELETE FROM exercise_sets WHERE id=?", (sid,)).rowcount > 0


# ============ 班级 ============
def list_classes():
    with _conn() as c:
        rows = c.execute("SELECT * FROM classes ORDER BY updated_at DESC").fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["student_ids"] = [x[0] for x in c.execute(
                "SELECT student_id FROM class_students WHERE class_id=?", (d["id"],)).fetchall()]
            d["size"] = len(d["student_ids"])
            out.append(d)
        return out


def create_class(owner: str, d: dict) -> int:
    now = _now()
    with _lock:
        with _conn() as c:
            cur = c.execute(
                "INSERT INTO classes(name,grade,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                (d.get("name", "未命名班级"), d.get("grade"), d.get("note", ""), owner, now, now))
            return cur.lastrowid


def normalize_student_id(raw: str) -> str:
    """把老师粘进来的一行归一成合法学生 id。

    账号 id 的派生规则是 `stu-{用户名}`（auth.py:49）。此前这里**不做任何校验**，
    传什么存什么：名册里塞进一个 `sim-e01`，老师会看到「名单 20 人」、课堂监看 20 个座位，
    而这些人**永远登录不了、永远显示「未开始」**，且会进课题名单快照，把参与率分母算错。
    前端的「批量粘贴」已经补前缀，但 API 不能指望调用方守规矩。
    """
    s = (raw or "").strip()
    if not s:
        return ""
    return s if s.startswith("stu-") else f"stu-{s}"


def set_class_students(cid: int, student_ids: list) -> int:
    """整表替换班级成员（前端多选后一次落库）。id 一律归一到 `stu-` 形状。"""
    ids = {n for n in (normalize_student_id(x) for x in student_ids) if n and n != "stu-"}
    with _lock, _conn() as c:
        c.execute("DELETE FROM class_students WHERE class_id=?", (cid,))
        for sid in ids:
            c.execute("INSERT OR IGNORE INTO class_students(class_id,student_id) VALUES(?,?)", (cid, sid))
        c.execute("UPDATE classes SET updated_at=? WHERE id=?", (_now(), cid))
        return len(ids)


def class_student_ids(class_ids: list) -> list:
    if not class_ids:
        return []
    q = ",".join("?" * len(class_ids))
    with _conn() as c:
        return [x[0] for x in c.execute(
            f"SELECT DISTINCT student_id FROM class_students WHERE class_id IN ({q})", class_ids).fetchall()]


def delete_class(cid: int) -> bool:
    """删班级。没开 PRAGMA foreign_keys，关联行必须手工清，否则留孤儿。"""
    with _lock, _conn() as c:
        c.execute("DELETE FROM class_students WHERE class_id=?", (cid,))
        c.execute("DELETE FROM class_settings WHERE class_id=?", (cid,))
        return c.execute("DELETE FROM classes WHERE id=?", (cid,)).rowcount > 0


def set_class_socratic(cid: int, on: bool) -> bool:
    with _lock, _conn() as c:
        if not c.execute("SELECT 1 FROM classes WHERE id=?", (cid,)).fetchone():
            return False
        c.execute(
            "INSERT INTO class_settings(class_id,socratic,updated_at) VALUES(?,?,?) "
            "ON CONFLICT(class_id) DO UPDATE SET socratic=excluded.socratic, updated_at=excluded.updated_at",
            (cid, 1 if on else 0, _now()),
        )
        return True


def class_socratic_map() -> dict:
    with _conn() as c:
        return {r[0]: bool(r[1]) for r in
                c.execute("SELECT class_id,socratic FROM class_settings").fetchall()}


def set_class_group(cid: int, kind: str) -> bool:
    with _lock, _conn() as c:
        if not c.execute("SELECT 1 FROM classes WHERE id=?", (cid,)).fetchone():
            return False
        c.execute(
            "INSERT INTO class_settings(class_id,socratic,group_kind,updated_at) VALUES(?,0,?,?) "
            "ON CONFLICT(class_id) DO UPDATE SET group_kind=excluded.group_kind, updated_at=excluded.updated_at",
            (cid, kind, _now()))
        return True


def class_group_map() -> dict:
    with _conn() as c:
        try:
            return {r[0]: (r[1] or "") for r in
                    c.execute("SELECT class_id,group_kind FROM class_settings").fetchall()}
        except sqlite3.OperationalError:
            return {}          # store_study 尚未建列时按"未分组"处理


def socratic_locked_for(student_id: str) -> bool:
    """该学生是否被任一所在班级锁定为苏格拉底式引导。

    锁在服务端判定 —— 前端的 `?socratic=1` 只是显示用，学生删掉它不解锁。
    """
    with _conn() as c:
        r = c.execute(
            "SELECT 1 FROM class_students cs JOIN class_settings st ON st.class_id=cs.class_id "
            "WHERE cs.student_id=? AND st.socratic=1 LIMIT 1", (student_id,)).fetchone()
        return bool(r)


# ============ 课例 ============
def _case_row(r) -> dict:
    d = dict(r)
    for k in ("ct_dims", "flow"):
        if isinstance(d.get(k), str):
            try:
                d[k] = json.loads(d[k])
            except Exception:
                d[k] = {} if k == "ct_dims" else []
    return d


def list_cases(q: str = "", limit: int = 100):
    sql = "SELECT * FROM cases WHERE status!='archived'"
    args: list = []
    if q:
        sql += " AND (title LIKE ? OR goal LIKE ?)"
        args += [f"%{q}%"] * 2
    sql += " ORDER BY updated_at DESC LIMIT ?"
    args.append(limit)
    with _conn() as c:
        return [_case_row(r) for r in c.execute(sql, args).fetchall()]


def get_case(cid: int):
    with _conn() as c:
        r = c.execute("SELECT * FROM cases WHERE id=?", (cid,)).fetchone()
        return _case_row(r) if r else None


def create_case(owner: str, d: dict) -> int:
    now = _now()
    with _lock:
        with _conn() as c:
            cur = c.execute(
                "INSERT INTO cases(title,grade,language,goal,ct_dims,flow,reflection,set_id,status,"
                "created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (d.get("title", "未命名课例"), d.get("grade"), d.get("language"), d.get("goal", ""),
                 json.dumps(d.get("ct_dims") or {}, ensure_ascii=False),
                 json.dumps(d.get("flow") or [], ensure_ascii=False),
                 d.get("reflection", ""), d.get("set_id"), d.get("status", "published"), owner, now, now),
            )
            return cur.lastrowid


def update_case(cid: int, d: dict) -> bool:
    sets, args = [], []
    for k in ("title", "grade", "language", "goal", "reflection", "set_id", "status"):
        if k in d:
            sets.append(f"{k}=?"); args.append(d[k])
    for k in ("ct_dims", "flow"):
        if k in d:
            sets.append(f"{k}=?"); args.append(json.dumps(d[k] or ({} if k == "ct_dims" else []), ensure_ascii=False))
    if not sets:
        return False
    sets.append("updated_at=?"); args += [_now(), cid]
    with _lock, _conn() as c:
        return c.execute(f"UPDATE cases SET {','.join(sets)} WHERE id=?", args).rowcount > 0


def delete_case(cid: int) -> bool:
    with _lock, _conn() as c:
        return c.execute("DELETE FROM cases WHERE id=?", (cid,)).rowcount > 0


# ============ 推送 ============
def create_push(owner: str, res_type: str, res_id: int, student_ids: list,
                reason: str = "", due_at: int | None = None, required: int = 0) -> int:
    now = _now()
    with _lock:
        with _conn() as c:
            cur = c.execute(
                "INSERT INTO pushes(res_type,res_id,reason,due_at,required,created_by,created_at)"
                " VALUES(?,?,?,?,?,?,?)",
                (res_type, res_id, reason, due_at, int(required), owner, now),
            )
            pid = cur.lastrowid
            for sid in set(student_ids):
                c.execute("INSERT OR IGNORE INTO push_targets(push_id,student_id) VALUES(?,?)", (pid, sid))
            return pid


def _res_title(res_type: str, res_id: int) -> str:
    if res_type == "assessment":
        # 测评卷表在 store_study 里（同一个库文件），直接查表比反向导入干净
        with _conn() as c:
            try:
                r = c.execute("SELECT title FROM assessments WHERE id=?", (res_id,)).fetchone()
            except sqlite3.OperationalError:
                return "(测评)"
        return dict(r)["title"] if r else "(已删除)"
    ref = (get_exercise(res_id) if res_type == "exercise"
           else get_video(res_id) if res_type == "video" else get_set(res_id))
    return (ref or {}).get("title", "(已删除)")


def list_pushes(limit: int = 50):
    """教师视角：推送记录 + 已读/完成率。"""
    with _conn() as c:
        rows = c.execute("SELECT * FROM pushes ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            t = c.execute(
                "SELECT COUNT(*) n, SUM(read_at IS NOT NULL) r, SUM(done_at IS NOT NULL) f"
                " FROM push_targets WHERE push_id=?", (d["id"],)).fetchone()
            d["total"], d["read"], d["done"] = t["n"] or 0, t["r"] or 0, t["f"] or 0
            d["title"] = _res_title(d["res_type"], d["res_id"])
            out.append(d)
        return out


def my_pushes(student_id: str, limit: int = 30):
    """学生视角：我收到的推送（含资源标题）。"""
    with _conn() as c:
        rows = c.execute(
            "SELECT p.*, t.id AS target_id, t.read_at, t.done_at FROM push_targets t"
            " JOIN pushes p ON p.id=t.push_id WHERE t.student_id=?"
            " ORDER BY p.created_at DESC LIMIT ?", (student_id, limit)).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["title"] = _res_title(d["res_type"], d["res_id"])
        out.append(d)
    return out


def was_pushed_to(res_type: str, res_id: int, student_id: str) -> bool:
    """这份资源是不是真的推送给了这个学生。

    不要用 `my_pushes(uid, limit)` 代替：它带 LIMIT，一个学期下来推送条数超过上限后，
    早先推送的卷子会从结果里消失，校验就变成了「最近 N 条里有没有」。
    """
    with _conn() as c:
        r = c.execute(
            "SELECT 1 FROM push_targets t JOIN pushes p ON p.id=t.push_id"
            " WHERE t.student_id=? AND p.res_type=? AND p.res_id=? LIMIT 1",
            (student_id, res_type, res_id)).fetchone()
    return bool(r)


def mark_push(target_id: int, student_id: str, field: str) -> bool:
    if field not in ("read_at", "done_at"):
        return False
    with _lock, _conn() as c:
        return c.execute(
            f"UPDATE push_targets SET {field}=? WHERE id=? AND student_id=? AND {field} IS NULL",
            (_now(), target_id, student_id)).rowcount > 0


init()
