"""个人信息主体权利（PIPL 第 44–47 条）：查阅、复制、删除。

本文件最重要的不是「删得掉」，而是 test_every_table_with_a_student_id_is_declared ——
它扫 sqlite_master 强制「凡带学生标识列的表必须在 ERASURE_MAP 或 RETAIN_MAP 里登记」。
没有它，删除清单会随着新表一张张地烂掉，而症状是**沉默的**：接口照样回 200，
学生照样收到「已删除」，只是数据还在。规则要能自己发现自己过时了。
"""
import pytest

from app import store, store_erasure as E


def _login(client, role: str, name: str) -> str:
    r = client.post(f"/api/auth/{role}/login", json={"username": name, "password": "123456"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def stu_er(client):
    return {"Authorization": "Bearer " + _login(client, "student", "er1")}


# 常见的学生标识列名。**不要**只写 user_id/student_id：chat_log 用的是 from_student，
# 按常见名去找会漏掉一张存着学生行为的表（这是实际扫库扫出来的，不是假想）。
STUDENT_ID_COLUMNS = {
    "user_id", "student_id", "owner_id", "observer_id", "from_student",
    "uid", "subject_id", "author_id",
}
# 这些列存的是教师/研究员账号，不是学生 —— 出现在表里不构成「该表含学生个人信息」
NON_STUDENT_COLUMNS = {"granted_by", "teacher_id", "actor"}


def test_every_table_with_a_student_id_is_declared():
    """新表必须登记：要么删，要么显式声明保留并写明依据。

    这条测试红了不是它坏了，是你刚加的表没决定怎么处置。二选一：
      - 存学生个人信息 → 写进 ERASURE_MAP（附一句「这张表存的是什么」，删除通知要用）
      - 不是学生的（教师操作、审计） → 写进 RETAIN_MAP 并给依据
    """
    declared = set(E.ERASURE_MAP) | set(E.RETAIN_MAP) | {t for t, _sql in E.CASCADE_SQL}
    missing = []
    with store._conn() as c:
        tables = [r[0] for r in c.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        for t in tables:
            cols = {r[1] for r in c.execute(f"PRAGMA table_info({t})")}
            if (cols & STUDENT_ID_COLUMNS) - NON_STUDENT_COLUMNS and t not in declared:
                missing.append((t, sorted(cols & STUDENT_ID_COLUMNS)))
    assert not missing, (
        f"这些表带学生标识列但未在 store_erasure 登记，删除会漏掉它们：{missing}。"
        "请写进 ERASURE_MAP（删）或 RETAIN_MAP（留，附依据）。")


def test_declared_tables_and_columns_actually_exist():
    """反向：登记表里写的表/列必须真存在。写错一个列名，删除会静默少删一张表
    （SQL 报错被吞或条件永不成立），而清单看着是齐的。"""
    with store._conn() as c:
        for table, (col, _act, why) in {**E.ERASURE_MAP, **E.RETAIN_MAP}.items():
            cols = {r[1] for r in c.execute(f"PRAGMA table_info({table})")}
            assert cols, f"登记了不存在的表 {table}"
            assert col in cols, f"{table} 没有列 {col}（登记表写错了）"
            assert why.strip(), f"{table} 的处置理由为空 —— 删除通知要用它告诉学生删了什么"


def test_student_facing_copy_has_no_markdown_or_field_names():
    """这些串**直接渲染给初中生**（MyDataView 原样显示，不过 Markdown）。
    实测踩过：`**假名化**` 在页面上原样显示成星号，`原因见 why` 把字段名漏给了学生。
    技术依据该写在代码注释里，不该写进出参。"""
    from app import store_erasure as E

    faces = [why for _c, _a, why in E.RETAIN_MAP.values()]
    faces += list(E.subject_summary("stu-nobody")["notes"].values())
    faces += [i["what"] for i in E.subject_summary("stu-nobody")["items"]]
    for s in faces:
        assert "**" not in s, f"用户可见串里有 Markdown 星号，页面会原样显示：{s[:40]}"
        for name in ("observer_id", "student_id", "user_id", "owner_id", "actor", "why",
                     "ERASURE_MAP", "NULL", "sqlite"):
            assert name not in s, f"用户可见串里漏了字段名 {name}：{s[:40]}"


def test_withdraw_consent_does_not_delete_and_says_so(client, stu_er):
    """撤回 ≠ 删除。这两件事后果不同（撤回可逆、删除不可逆），
    响应必须明说，否则学生点完撤回会以为数据没了。"""
    store.add_ct_event("stu-er1", "run", "", None)
    before = E.subject_summary("stu-er1")["total_rows"]
    assert before > 0

    d = client.delete("/api/consent", headers=stu_er).json()
    assert d["granted"] is False and d["data_deleted"] is False
    assert "删除" in d["message"]                       # 明确告知另有删除通道
    assert E.subject_summary("stu-er1")["total_rows"] == before, "撤回把数据删了（不该）"


def test_subject_summary_lists_empty_categories_too(client, stu_er):
    """查阅权要回答「这一类你们有没有我的数据」，0 条也要列出来 ——
    静默省略会被读成漏报。"""
    d = client.get("/api/my/data", headers=stu_er).json()
    cats = {i["category"] for i in d["items"]}
    assert "ct_events" in cats and "assessment_responses" in cats
    assert any(i["n"] == 0 for i in d["items"]), "空类别被省略了"
    assert all(i["what"].strip() for i in d["items"]), "有类别没说明存的是什么"
    # 保留项必须一并告知，且带依据
    assert d["retained"] and all(r["why"].strip() for r in d["retained"])
    # 已导出批次追不回来这件事必须说清楚，不能让学生以为删除是全域的。
    # 断言的是**意思在不在**，不是某个术语词在不在 —— 文案要能为了让初中生读懂而改写
    #（「假名化」→「化名」就是这么改的），钉死术语等于把可读性锁死。
    exported = d["notes"]["exported"]
    assert "收回" in exported or "追回" in exported, "没说清已交出去的那份收不回来"
    assert "同意书" in exported, "没指明这件事会在同意书里写明"


def test_export_is_self_only_and_not_pseudonymized(client, stu_er):
    """可携带权给的是**本人原始数据**（对数据主体本人脱敏没有意义），
    因此端点只认登录者自己，不接受任何 user_id 参数。"""
    store.add_ct_event("stu-er1", "ai_help", "[reviewer] 这题的循环条件怎么写", None)
    d = client.get("/api/my/data/export", headers=stu_er).json()
    assert d["subject"] == "stu-er1"
    blob = str(d["data"])
    assert "循环条件怎么写" in blob, "本人副本被脱敏了（本人副本不该脱敏）"
    # 传别人的 id 不生效：路径里没有这个参数，查询串也不该被采信
    d2 = client.get("/api/my/data/export?user_id=stu-别人", headers=stu_er).json()
    assert d2["subject"] == "stu-er1"


def test_erasure_is_teacher_executed_and_student_can_only_request(client, teacher, stu_er):
    """删除照抄监护人同意的形态：学生申请、教师执行。
    学生一时赌气不该能把自己整学期的作品一键抹掉。"""
    assert client.delete("/api/teacher/data/stu-er1", headers=stu_er).status_code == 403
    r = client.post("/api/my/data/erasure", headers=stu_er).json()
    assert r["pending"] is True and r["rows_pending"] > 0


def test_erasure_actually_deletes_across_all_tables(client, teacher):
    """真删，不是标记；逐表返回条数以便核对。
    并且必须删干净 —— 剩一行就等于「已删除」是假的。"""
    uid = "stu-er2"
    store.grant_consent(uid, "家长", granted_by="tea-lishen")
    store.add_ct_event(uid, "run", "", None)
    store.add_ct_event(uid, "ai_help", "[reviewer] 我的手机号是 13800138000", None)
    store.add_risk_event(uid, "test", 1, "测试用")
    store.add_usage(uid, 60)
    pid = store.create_project(uid, "我的作品", "python")["id"]
    store.save_version(pid, uid, "print('hi')", None)

    before = E.subject_summary(uid)
    assert before["total_rows"] >= 6

    r = client.delete(f"/api/teacher/data/{uid}", headers=teacher)
    assert r.status_code == 200
    res = r.json()
    assert res["total_rows"] >= 6
    assert res["deleted"]["ct_events"] == 2 and res["deleted"]["projects"] == 1

    after = E.subject_summary(uid)
    assert after["total_rows"] == 0, f"没删干净，剩下：{[i for i in after['items'] if i['n']]}"


def test_erasure_removes_project_versions_with_foreign_keys_enforced(client, teacher):
    """每个连接都强制外键，同时主体删除仍显式核对代码版本已清理。"""
    uid = "stu-er3"
    pid = store.create_project(uid, "作品", "python")["id"]
    store.save_version(pid, uid, "SECRET_CODE_LEFTOVER = 1", None)

    with store._conn() as c:
        assert c.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert c.execute("SELECT COUNT(*) FROM project_versions WHERE project_id=?",
                         (pid,)).fetchone()[0] == 1

    client.delete(f"/api/teacher/data/{uid}", headers=teacher)
    with store._conn() as c:
        n = c.execute("SELECT COUNT(*) FROM project_versions WHERE project_id=?", (pid,)).fetchone()[0]
    assert n == 0, "作品删了，但含学生代码的历史版本作为孤儿留了下来"


def test_erasure_audit_is_not_keyed_to_the_erased_student(client, teacher):
    """审计留痕挂经办教师名下，不挂被删学生 —— 否则删完立刻又写一条关于他的记录。"""
    uid = "stu-er4"
    store.add_ct_event(uid, "run", "", None)
    client.delete(f"/api/teacher/data/{uid}", headers=teacher)
    with store._conn() as c:
        n = c.execute("SELECT COUNT(*) FROM risk_events WHERE user_id=?", (uid,)).fetchone()[0]
    assert n == 0, "删除动作又给被删学生写回了一条记录"
    assert any(r["category"] == "erasure_done" for r in store.list_risk_events(50))
