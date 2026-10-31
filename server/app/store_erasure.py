"""个人信息主体权利的执行层（PIPL 第 44–47 条：查阅、复制、删除）。

**为什么需要这个模块**：此前平台只有「撤回同意」，而撤回只把 guardian_consents.withdrawn_at
写上时间戳 —— 它让该学生退出**分析集**（consent_ok_map 过滤），但**一行数据都不删**。
PIPL 第 47 条要求撤回同意后应当主动删除个人信息。标记退出 ≠ 删除，这是实打实的缺口。

**本模块的核心不是删除代码，是那张表**。删除跨 24 张表，手工维护的清单一定会烂：
今天补齐，下个月加一张 `foo(student_id)` 就又漏了，而漏一张，「已删除」就是个谎。
所以 ERASURE_MAP 把每张表的处置**写成数据**，并由 tests 扫 sqlite_master 强制：
凡是带学生标识列的表，要么在此登记为删除，要么显式登记为保留**并写明法律依据**。
新表没登记 → 测试直接红。规则要能自己发现自己过时了。

已知的两个坑（都不是靠读代码能看出来的，是扫库扫出来的）：
 ① `chat_log` 的学生标识列叫 `from_student`，不叫 user_id/student_id —— 按常见列名去找会漏。
 ② SQLite 原生默认关闭外键；现在 `store._conn()` 已要求每个连接都开启，但主体删除仍显式
    按 project_id 清理版本，以便逐表核对删除数量，并防止未来导入脚本或表结构漂移造成漏删。
"""
from app.store import _conn, _lock, _now

# —— 处置动作 ——
DELETE = "delete"        # 删除该学生的行
RETAIN = "retain"        # 保留，必须给法律/研究依据

# table -> (标识列, 动作, 理由)
# 理由字段对 DELETE 也要写：说清这张表里存的是什么个人信息，删除通知里要如实告诉学生。
ERASURE_MAP: dict[str, tuple[str, str, str]] = {
    # —— 行为与过程数据 ——
    "ct_events":            ("user_id",      DELETE, "学习行为事件（运行/报错/修复/求助等），含求助话语前 40 字"),
    "ct_snapshots":         ("student_id",   DELETE, "历史过程诊断快照（不代表能力）"),
    "round_snapshot":       ("student_id",   DELETE, "轮级过程与原件指针快照"),
    "usage_sessions":       ("user_id",      DELETE, "在线时长与会话边界"),
    "milestones":           ("user_id",      DELETE, "里程碑达成记录"),
    "design_artifacts":     ("owner_id",     DELETE, "流程图/伪代码等设计稿"),
    "projects":             ("owner_id",     DELETE, "作品（标题与代码）"),
    "chat_log":             ("from_student", DELETE, "结对聊天的元数据（无正文，仅房间/角色/时间）"),

    # —— AI 交互 ——
    "ai_reply_log":         ("student_id",   DELETE, "AI 回复的分类与元数据（不含回复原文）"),
    "pair_ai_requests":     ("student_id",   DELETE, "可信 AI 请求的来源、规则和放行回执（不含对话正文）"),

    # —— 测评 ——
    "assessment_responses": ("student_id",   DELETE, "前/中/后测的作答与得分"),
    "assessment_open_log":  ("student_id",   DELETE, "答卷首次打开时刻（用于服务端时长判定）"),
    "ct_criterion":         ("student_id",   DELETE, "外部效标分数"),
    "cog_load":             ("student_id",   DELETE, "认知负荷自评"),

    # —— 画像与干预 ——
    "learner_state":        ("student_id",   DELETE, "支架档位、卡点、掌握度画像"),
    "policy_suggestion":    ("student_id",   DELETE, "档位建议留痕"),
    "scaffold_log":         ("student_id",   DELETE, "档位变更留痕"),
    "pair_sessions":        ("student_id",   DELETE, "课堂结对会话、任务快照与授权状态（不含聊天正文）"),
    "task_attempts":        ("student_id",   DELETE, "任务尝试的阶段、语言、AI 支持条件与起止时间"),
    "inferences":           ("student_id",   DELETE, "基于学习原件形成的暂定判断、置信程度与修订状态"),

    # —— 课堂组织 ——
    "class_students":       ("student_id",   DELETE, "班级成员关系"),
    "study_members":        ("student_id",   DELETE, "课题分组关系"),
    "seat_map":             ("student_id",   DELETE, "座位表"),
    "push_targets":         ("student_id",   DELETE, "推送任务的接收记录"),

    # —— 观察与风险 ——
    "obs_window":           ("student_id",   DELETE, "教师课堂观察记录（被观察者维度）"),
    "risk_events":          ("user_id",      DELETE, "护栏命中与高危告警记录"),

    # —— 同意本身 ——
    # 放在最后删：前面任一步失败时，同意记录还在，学生的状态是可解释的
    #（「删了一半」总比「同意没了但数据还在」好排查）。
    "guardian_consents":    ("user_id",      DELETE, "监护人同意与撤回记录"),
}

# 显式保留（每条都要有依据；测试会要求新表必须落在这两个集合之一）。
#
# 注意第三个元素是**直接显示给学生看的**，所以写学生的话，不写字段名、不写 Markdown。
# 技术依据写在这里的注释里：
#   obs_window.observer_id —— 观察员（教师）维度。被观察者维度已在 ERASURE_MAP 里按
#       student_id 删除；再按 observer_id 删会把**其他**学生的观察记录一并抹掉。
#   study_log.actor —— 课题状态机的操作审计（谁在何时把课题推进到哪个状态），记的是
#       教师/研究员账号，不含学生个人信息；审计留痕是研究可复核性的前提。
RETAIN_MAP: dict[str, tuple[str, str, str]] = {
    "obs_window": ("observer_id", RETAIN,
                   "老师做课堂观察时留下的记录（记的是老师看了什么，不是你的信息）。"
                   "关于你的那部分观察记录会被删掉。"),
    "study_log": ("actor", RETAIN,
                  "老师操作课题的日志（谁在什么时候把课题推进到哪一步），里面没有你的信息。"),
}

# 靠子查询关联、没有自己的学生标识列的表：显式删除，保留可核对的逐表删除记录（见文件头 ②）
CASCADE_SQL: list[tuple[str, str]] = [
    ("pair_ai_requests", "DELETE FROM pair_ai_requests WHERE student_id=?"),
    ("pair_rounds", "DELETE FROM pair_rounds WHERE session_id IN"
     " (SELECT session_id FROM pair_sessions WHERE student_id=?)"),
    # 一条关联可能从学生自己的推断或学生自己的证据进入；?1 复用同一参数，
    # 保持 CASCADE_SQL 的单参数执行约定，同时避免留下跨表孤儿。
    ("inference_evidence",
     "DELETE FROM inference_evidence WHERE inference_id IN"
     " (SELECT inference_id FROM inferences WHERE student_id=?1) OR evidence_id IN"
     " (SELECT e.evidence_id FROM evidence_items e JOIN task_attempts a"
     " ON a.attempt_id=e.attempt_id WHERE a.student_id=?1)"),
    ("evidence_items",
     "DELETE FROM evidence_items WHERE attempt_id IN"
     " (SELECT attempt_id FROM task_attempts WHERE student_id=?)"),
    ("project_versions",
     "DELETE FROM project_versions WHERE project_id IN (SELECT id FROM projects WHERE owner_id=?)"),
]


def _count(c, table: str, col: str, uid: str) -> int:
    if table == "pair_ai_requests" and not _has_receipts(c):
        return 0
    return c.execute(f"SELECT COUNT(*) FROM {table} WHERE {col}=?", (uid,)).fetchone()[0]


def _has_receipts(c):
    return c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pair_ai_requests'").fetchone() is not None


def subject_summary(uid: str) -> dict:
    """查阅权（PIPL 第 45 条）：这个人身上到底存了些什么，各多少条。

    只给**类别与条数**，不给别人的数据，也不在这里吐明细 —— 明细走 subject_export()。
    条数为 0 的类别照样列出：「这一类我们没有你的数据」本身就是查阅权要回答的问题，
    静默省略会让人以为是漏报。
    """
    from app.store_pair_sessions import purge_expired
    purge_expired()
    items = []
    with _conn() as c:
        n_rounds = c.execute("SELECT COUNT(*) FROM pair_rounds WHERE session_id IN"
                             " (SELECT session_id FROM pair_sessions WHERE student_id=?)", (uid,)).fetchone()[0]
        items.append({"category": "pair_rounds", "what": "课堂结对轮次的唯一编号与起止时间", "n": n_rounds})
        for table, (col, _act, why) in ERASURE_MAP.items():
            items.append({"category": table, "what": why, "n": _count(c, table, col, uid)})
        n_ver = c.execute(
            "SELECT COUNT(*) FROM project_versions WHERE project_id IN"
            " (SELECT id FROM projects WHERE owner_id=?)", (uid,)).fetchone()[0]
        items.append({"category": "project_versions", "what": "作品的历史版本（含代码正文）", "n": n_ver})
        n_ev = c.execute(
            "SELECT COUNT(*) FROM evidence_items WHERE attempt_id IN"
            " (SELECT attempt_id FROM task_attempts WHERE student_id=?)", (uid,)
        ).fetchone()[0]
        items.append({"category": "evidence_items", "what": "学习原件的稳定编号、版本和质量状态", "n": n_ev})
        n_links = c.execute(
            "SELECT COUNT(*) FROM inference_evidence WHERE inference_id IN"
            " (SELECT inference_id FROM inferences WHERE student_id=?1) OR evidence_id IN"
            " (SELECT e.evidence_id FROM evidence_items e JOIN task_attempts a"
            " ON a.attempt_id=e.attempt_id WHERE a.student_id=?1)", (uid,)
        ).fetchone()[0]
        items.append({"category": "inference_evidence", "what": "暂定判断与支持或冲突原件之间的关联", "n": n_links})
    total = sum(i["n"] for i in items)
    return {
        "schema": "jiedui-subject-data/v1",
        "total_rows": total,
        "items": items,
        "retained": [{"category": t, "column": col, "why": why}
                     for t, (col, _a, why) in RETAIN_MAP.items()],
        "notes": {
            # 这几条是**直接显示给初中生**的，不是注释：不能写 Markdown 星号（页面上原样显示成 **），
            # 也不能出现 why / student_id 这类字段名。实测发现的，别再写回去。
            "retained": "下面这些记录不会随删除一起清掉，因为它们记的是老师的操作，不是你的个人信息：",
            "exported": "已经交给研究老师的那份数据用的是化名（一串算出来的编号，不是你的名字）。"
                        "删掉平台上的记录，不能把已经交出去的那份收回来。"
                        "能不能收回，要看研究老师那边是怎么约定的 —— 这一点会写在同意书里告诉你和家长。",
        },
    }


def subject_export(uid: str) -> dict:
    """可携带权（PIPL 第 45 条第 3 款）：给一份机器可读的完整副本。

    与 research 导出的关键区别：那边是**给研究者的假名化数据**，这边是**给本人的原始数据**，
    所以不脱敏、不假名 —— 对本人脱敏是没有意义的（他就是数据主体）。
    正因如此，本函数的调用方必须确保 uid 就是登录者本人或其监护人授权的教师。
    """
    from app.store_pair_sessions import purge_expired
    purge_expired()
    out: dict[str, list] = {}
    with _conn() as c:
        out["pair_rounds"] = [dict(r) for r in c.execute("SELECT * FROM pair_rounds WHERE session_id IN"
                            " (SELECT session_id FROM pair_sessions WHERE student_id=?)", (uid,))]
        for table, (col, _act, _why) in ERASURE_MAP.items():
            if table == "pair_ai_requests" and not _has_receipts(c):
                out[table] = []
                continue
            rows = c.execute(f"SELECT * FROM {table} WHERE {col}=?", (uid,)).fetchall()
            out[table] = [dict(r) for r in rows]
        rows = c.execute(
            "SELECT * FROM project_versions WHERE project_id IN"
            " (SELECT id FROM projects WHERE owner_id=?)", (uid,)).fetchall()
        out["project_versions"] = [dict(r) for r in rows]
        rows = c.execute(
            "SELECT * FROM evidence_items WHERE attempt_id IN"
            " (SELECT attempt_id FROM task_attempts WHERE student_id=?)", (uid,)
        ).fetchall()
        out["evidence_items"] = [dict(r) for r in rows]
        rows = c.execute(
            "SELECT * FROM inference_evidence WHERE inference_id IN"
            " (SELECT inference_id FROM inferences WHERE student_id=?1) OR evidence_id IN"
            " (SELECT e.evidence_id FROM evidence_items e JOIN task_attempts a"
            " ON a.attempt_id=e.attempt_id WHERE a.student_id=?1)", (uid,)
        ).fetchall()
        out["inference_evidence"] = [dict(r) for r in rows]
    return {"schema": "jiedui-subject-export/v1", "subject": uid,
            "generated_at": _now(), "data": out}


def erase_subject(uid: str) -> dict:
    """删除权（PIPL 第 47 条）：真删，不是标记。

    返回逐表删除条数 —— 「删了」必须能被核对。全部在一个事务里：
    删一半失败还留一半，比没删更糟（学生以为删干净了）。
    """
    deleted: dict[str, int] = {}
    with _lock, _conn() as c:
        # 先删靠子查询关联的（依赖 projects 还在）
        for table, sql in CASCADE_SQL:
            if table == "pair_ai_requests" and not _has_receipts(c):
                deleted[table] = 0
                continue
            deleted[table] = c.execute(sql, (uid,)).rowcount
        for table, (col, act, _why) in ERASURE_MAP.items():
            if act != DELETE or table in deleted:
                continue
            deleted[table] = c.execute(f"DELETE FROM {table} WHERE {col}=?", (uid,)).rowcount
    return {"subject": uid, "deleted": deleted,
            "total_rows": sum(deleted.values()), "erased_at": _now()}
