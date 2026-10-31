"""ProgSnap2 导出器回归测试（scripts/export_progsnap2.py）。

盯死四件事，任一破了导出的数据集就不合规或泄露：
  1) 规范必填五列（EventType/EventID/SubjectID/ToolInstances/CodeStateID）逐行非空；
  2) 同意门：无有效监护人同意的学生一行都不许出现；
  3) 学生原话不出域：ai_help 的 detail 用唯一标记串断言不出现在 MainTable 任何单元格里；
  4) EventID 唯一、CodeStateID 在 CodeStates 表里解析得到。
"""
import argparse
import importlib.util
import os
import sqlite3
import sys
import tempfile

_SERVER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SCRIPT = os.path.join(_SERVER, "scripts", "export_progsnap2.py")

_spec = importlib.util.spec_from_file_location("export_progsnap2", _SCRIPT)
ps2 = importlib.util.module_from_spec(_spec)
sys.modules["export_progsnap2"] = ps2
_spec.loader.exec_module(ps2)

MARKER = "唯一标记串_ZZQQ7788_学生原话"


def _args(**kw):
    d = dict(include_no_consent=False, code_mode="scrubbed", term_id="T1",
             tz_minutes=480, tool_instances="CX-Pair test", dry_run=True,
             contact_name="n", contact_email="e", allow_ephemeral_salt=True)
    d.update(kw)
    return argparse.Namespace(**d)


def _fixture_db() -> str:
    # 每次调用建一个独立文件：Windows 上被 sqlite 打开过的文件删除会静默失败，
    # 复用同一路径会在第二个用例里撞 "table already exists"。
    fd, path = tempfile.mkstemp(prefix="jiedui_ps2_test_", suffix=".db")
    os.close(fd)
    os.remove(path)
    c = sqlite3.connect(path)
    c.executescript("""
        CREATE TABLE ct_events(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
          type TEXT NOT NULL, detail TEXT, project_id INTEGER, ts INTEGER,
          sv INTEGER DEFAULT 1, round_index INTEGER, room_id TEXT, switch_reason TEXT);
        CREATE TABLE guardian_consents(user_id TEXT PRIMARY KEY, guardian TEXT,
          consent_at INTEGER, withdrawn_at INTEGER);
        CREATE TABLE projects(id INTEGER PRIMARY KEY, owner_id TEXT, title TEXT,
          language TEXT, latest_version INTEGER, created_at INTEGER, updated_at INTEGER);
        CREATE TABLE project_versions(id INTEGER PRIMARY KEY, project_id INTEGER,
          version_no INTEGER, code TEXT, block_state TEXT, created_at INTEGER);
    """)
    c.execute("INSERT INTO guardian_consents VALUES('stu-ok','家长',1000,NULL)")
    c.execute("INSERT INTO guardian_consents VALUES('stu-withdrawn','家长',1000,2000)")
    c.execute("INSERT INTO projects VALUES(1,'stu-ok','作品','python',1,1000,1000)")
    c.execute("INSERT INTO project_versions VALUES(1,1,1,'print(1)',NULL,1100)")
    rows = [
        ("stu-ok", "run", "运行成功", 1, 1000, 2, 1, "room-1", None),
        ("stu-ok", "run", "运行出错", 1, 1010, 2, 1, "room-1", None),
        ("stu-ok", "error", "NameError: name 'n' is not defined", 1, 1011, 2, 1, "room-1", None),
        ("stu-ok", "fix", "", 1, 1200, 2, 1, "room-1", None),
        ("stu-ok", "ai_help", f"[reviewer] {MARKER}", None, 1300, 2, 1, "room-1", None),
        ("stu-ok", "hop", "navigator追问", None, 1301, 2, 1, "room-1", None),
        ("stu-ok", "role_switch", "", None, 1400, 2, 1, "room-1", "negotiated"),
        ("stu-withdrawn", "run", "运行成功", None, 1500, 2, None, None, None),
    ]
    c.executemany("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv,round_index,"
                  "room_id,switch_reason) VALUES(?,?,?,?,?,?,?,?,?)", rows)
    c.commit()
    c.close()
    return path


def test_progsnap2_export_is_spec_valid_and_leak_free():
    db = _fixture_db()
    data = ps2.build(db, _args())
    rows = data["rows"]
    assert rows, "导出为空"

    # 1) 规范必填五列逐行非空
    for r in rows:
        for col in ("EventType", "EventID", "SubjectID", "ToolInstances", "CodeStateID"):
            assert (r[col] or "").strip(), f"{col} 为空：{r}"

    # 2) 同意门：撤回同意的学生一行都不许在
    pids = {r["SubjectID"] for r in rows}
    assert ps2._pid("stu-withdrawn") not in pids
    assert ps2._pid("stu-ok") in pids
    assert data["excluded_no_consent"] == 1

    # 3) 学生原话不出域（任何单元格都不许命中）
    for r in rows:
        for v in r.values():
            assert MARKER not in str(v), f"学生原话泄漏到 {r['EventID']}"
    ai = [r for r in rows if r["X-CXEventType"] == "ai_help"][0]
    # 19 字 → medium（与 ct.py::_safe_detail 的分箱口径一致：≤10 短 / ≤25 中 / 其余 长）
    assert ai["X-HelpRole"] == "reviewer" and ai["X-HelpLenBucket"] == "medium"
    assert ai["EventType"] == "Intervention" and ai["InterventionCategory"] == "Hint"

    # 4) ID 唯一 + 码态可解析 + 语义映射
    assert len({r["EventID"] for r in rows}) == len(rows)
    assert {r["CodeStateID"] for r in rows} <= set(data["code_states"])
    by_type = {r["X-CXEventType"]: r for r in rows}
    assert by_type["run"]["EventType"] == "Run.Program"
    assert by_type["error"]["EventType"] == "X-Run.Error"
    assert by_type["error"]["CompileMessageType"] == "NameError"
    assert by_type["error"]["ParentEventID"], "error 必须挂到最近的 Run.Program 上"
    assert by_type["hop"]["EventInitiator"] == "ToolReaction"
    assert by_type["role_switch"]["EventInitiator"] == "TeamMemberDirectAction"
    # save 由 project_versions 合成，且该行码态保真度为 exact
    save = by_type["save"]
    assert save["EventType"] == "File.Save" and save["X-CodeStateFidelity"] == "exact"
    # 保存之前的事件只能拿到空码态哨兵
    assert by_type["run"]["CodeStateID"] == ps2.CODE_STATE_EMPTY
    assert by_type["run"]["X-CodeStateFidelity"] == "none"
    # 保存之后的事件取"最近一次保存"
    assert by_type["fix"]["X-CodeStateFidelity"] == "last-saved"


def test_progsnap2_uses_per_run_code_state_when_available():
    """前向兼容：等 ct_events.code_state + code_state 表上线后，导出必须自动改用逐次运行的
    真实码态（fidelity=exact），而不是继续退回"最近一次保存"的下界。本用例先把那张表造出来，
    保证补丁落地当天导出器不用改。"""
    db = _fixture_db()
    c = sqlite3.connect(db)
    c.execute("ALTER TABLE ct_events ADD COLUMN code_state TEXT")
    c.execute("CREATE TABLE code_state(hash TEXT PRIMARY KEY, lang TEXT, code TEXT,"
              " first_seen INTEGER)")
    c.execute("INSERT INTO code_state VALUES('deadbeef','python','print(42)',900)")
    c.execute("UPDATE ct_events SET code_state='deadbeef' WHERE type='run' AND ts=1000")
    c.commit()
    c.close()

    data = ps2.build(db, _args(code_mode="full"))
    run = [r for r in data["rows"] if r["X-CXEventType"] == "run"][0]
    assert run["X-CodeStateFidelity"] == "exact"
    assert data["code_states"][run["CodeStateID"]] == "print(42)"


def test_progsnap2_code_mode_hash_never_emits_source():
    db = _fixture_db()
    data = ps2.build(db, _args(code_mode="hash"))
    codes = [v for v in data["code_states"].values() if v]
    assert codes and all(v.startswith("sha256:") for v in codes)
    assert all("print(1)" not in v for v in data["code_states"].values())


def test_manual_save_does_not_double_count_file_save():
    """save 双计回归（50a9de5 白名单收 save 之后）：一次手动保存 = ct_events 一行 save
    + project_versions 一行版本。导出必须是**恰一行 File.Save**（pv 合成，exact 码态、
    Initiator 空=人为/自动不可分）+ **恰一行 X-Save.Manual**（学生动作，UserDirectAction）。
    映射错了会出两行 File.Save —— 保存频次直接翻倍。"""
    db = _fixture_db()
    c = sqlite3.connect(db)
    # 给 stu-ok 的版本 v1（ts=1000 已在夹具？夹具建了 project_versions 吗——没有则补）
    c.execute("INSERT INTO project_versions(project_id,version_no,code,block_state,created_at)"
              " VALUES(1, 7, 'print(7)', NULL, 2000)")
    c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv,round_index,room_id,switch_reason)"
              " VALUES('stu-ok','save','保存 v7',1,2000,2,1,'room-1',NULL)")
    c.commit(); c.close()

    data = ps2.build(db, _args())
    rows = data["rows"]
    fs = [r for r in rows if r["EventType"] == "File.Save"]
    manual = [r for r in rows if r["EventType"] == "X-Save.Manual"]
    assert len(manual) == 1 and manual[0]["EventInitiator"] == "UserDirectAction"
    assert len([r for r in fs if r["EventID"].startswith("ct-")]) == 0, "ct 侧 save 被映成了 File.Save（双计）"
    assert len(fs) == 2, f"File.Save 应恰为版本行数（v1+v7=2），实为 {len(fs)}"
    assert all(r["EventInitiator"] == "" for r in fs), "File.Save 的 Initiator 应为空（人为/自动不可分）"
