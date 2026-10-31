#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""ProgSnap2 导出器（规范版本 8，2020-12-18，Beta）——把 CX 的 ct_events / project_versions
导成 CS 教育界公认的 ProgSnap2 数据集，用于（a）与 CSEDM 公开数据集比较，（b）复现性声明。

规范依据（本文件所有列名/枚举值均逐条对照过原始 PDF，核查日期 2026-08-13）：
  https://cssplice.org/progsnap2/ProgSnap2-v8-18Dec2020.pdf
  MainTable 必填列：EventType / EventID / SubjectID / ToolInstances / CodeStateID（五列，缺一不可）
  DatasetMetadata 必填：Version / IsEventOrderingConsistent / EventOrderScope /
                        EventOrderScopeColumns / CodeStateRepresentation
  README.txt 为**强制**文件（必须含联系人姓名与邮箱），本脚本自动生成骨架。

产物（--out 目录）：
  README.txt                      规范强制；含 X-* 自定义列的释义
  DatasetMetadata.csv             Property,Value 两列
  MainTable.csv                   一行一事件
  CodeStates/CodeStates.csv       Table 表示法（CodeStateID,Code）
  LinkTables/Subject.csv          被试级协变量（组别/班级/效标分）
  LinkTables/Team.csv             结对房间级信息

三条不可退让的纪律（与 research.py 同口径）：
  1) 去标识化：学生 ID / 房间号一律走 research.py 的 HMAC-SHA256 假名，绝不导出原始 ID；
  2) 同意门：默认剔除无有效监护人同意的学生（guardian_consents），剔了几人如实写进
     DatasetMetadata 的 X-ExcludedNoConsent，不许静默变小；
  3) 学生自由文本不出域：ai_help 的 detail（学生对 AI 说的话）**只导长度分箱**，
     原话一个字都不进 MainTable（外部调研 R2 的 P0-B 口径延伸到导出层）。
     源代码默认过 guard.anonymize 脱敏（--code-mode=scrubbed）。

用法：
  cd server && python scripts/export_progsnap2.py --out ../data/progsnap2 \
      --contact-name "张三" --contact-email "zhangsan@example.edu.cn"
  # 只看会导出什么、不落盘：加 --dry-run
"""
from __future__ import annotations

import argparse
import csv
import datetime as _dt
import hashlib
import hmac
import json
import os
import re
import sqlite3
import sys
from collections import defaultdict

# ── 让脚本能 import 到 server/app（本文件在 server/scripts/ 下） ──────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
_SERVER = os.path.dirname(_HERE)
if _SERVER not in sys.path:
    sys.path.insert(0, _SERVER)

# .env 装载：假名盐来自 JIEDUI_EXPORT_SALT，必须先装载，否则静默退回进程随机盐、
# 假名与既有 /api/research/export 的产物对不上（跨批次断链）。
try:
    from app import env as _env  # noqa: F401
except Exception as _e:  # pragma: no cover - 仅在裸环境下触发
    print(f"[warn] 无法 import app.env（{_e}），将只读环境变量", file=sys.stderr)

# PII 脱敏：直接复用线上同一套规则，避免导出层自建一套必然漂移的正则
try:
    from app.guard import anonymize as _anonymize
except Exception:  # pragma: no cover
    def _anonymize(t: str):
        return t, {}

SALT = os.environ.get("JIEDUI_EXPORT_SALT") or ""
SALT_IS_EPHEMERAL = not SALT


def _pid(uid: str) -> str:
    """与 research.py::_pid 逐字符一致的假名（HMAC-SHA256 前 10 位，前缀 S）。"""
    return "S" + hmac.new(SALT.encode(), uid.encode("utf-8"), hashlib.sha256).hexdigest()[:10]


def _tid(room: str) -> str:
    """房间号假名。房间号本身会泄露班级/座位信息（如 'class1-pair3'），必须同样假名化。
    与 SubjectID 共用命名空间但前缀不同（规范：SubjectID 与 TeamID 同命名空间）。"""
    return "T" + hmac.new(SALT.encode(), ("room:" + room).encode("utf-8"),
                          hashlib.sha256).hexdigest()[:10]


def _assert_pid_matches_research() -> None:
    """漂移守卫：若能 import 到 app.research，就比对同一输入的假名是否一致。
    不一致意味着两条导出通道产出的 SubjectID 无法互相配对 —— 属静默数据事故，直接中止。

    仅在盐已固定时比对：未配置盐时 research.py 用**进程内随机盐**，两个进程本就必然不同，
    比对会永远失败（那种情形已由 main() 里的 --allow-ephemeral-salt 闸口单独处理）。"""
    if SALT_IS_EPHEMERAL:
        return
    try:
        from app.research import _pid as _rp
    except Exception:
        return
    probe = "stu-__pid_probe__"
    if _rp(probe) != _pid(probe):
        raise SystemExit(
            "[fatal] 本脚本与 app/research.py 的假名算法不一致，导出会产出无法与既有"
            " research 导出配对的 SubjectID。请检查 JIEDUI_EXPORT_SALT 与 research.py::_pid。")


# ── ProgSnap2 常量 ─────────────────────────────────────────────────────────────
SPEC_VERSION = 8                 # 本导出遵循的规范版本（v8 / 2020-12-18 / Beta）
CODE_STATE_EMPTY = "cs-empty"    # 首次保存之前的哨兵码态（Code 为空串），README 里有释义

# ct_events.type → (EventType, EventInitiator 默认值)
# 说明见 README 生成段；X-* 为规范允许的自定义事件类型。
TYPE_MAP = {
    "run":           ("Run.Program",     "UserDirectAction"),
    "error":         ("X-Run.Error",     "UserDirectAction"),
    "fix":           ("X-Run.Fix",       "UserDirectAction"),
    "ai_help":       ("Intervention",    "UserDirectAction"),
    "hop":           ("Intervention",    "ToolReaction"),
    "role_switch":   ("X-Role.Switch",   ""),
    "design_create": ("X-Design.Create", "UserDirectAction"),
    # ct 侧 save = 学生**点了保存按钮**这个动作（50a9de5 起白名单收 save，带 room/round/
    # lang/edit_mode 情境）；码态本体仍由 pv 合成行承载（File.Save）。两类必须分开映射，
    # 否则一次手动保存出两行 File.Save（双计）。
    "save":          ("X-Save.Manual",   "UserDirectAction"),
    "task_done":     ("X-Task.Done",     "UserDirectAction"),
}

MAIN_COLUMNS = [
    # —— 规范必填五列 ——
    "EventID", "SubjectID", "EventType", "ToolInstances", "CodeStateID",
    # —— 推荐可选列 ——
    "Order", "ServerTimestamp", "ServerTimezone", "CourseID", "TermID",
    "ExperimentalCondition", "TeamID",
    # —— 事件专属列 ——
    "ParentEventID", "SessionID", "ProjectID", "EventInitiator",
    "CompileMessageType", "CompileMessageData", "ExecutionResult",
    "ProgramErrorOutput", "InterventionCategory", "InterventionType", "InterventionMessage",
    # —— 自定义列（README 中逐条释义）——
    "X-CXEventType", "X-EventSchemaVersion", "X-RoundIndex", "X-RoundLabel",
    "X-Lang", "X-EditMode",
    "X-Seat", "X-SwitchReason", "X-HelpLenBucket", "X-HelpRole",
    "X-ScaffoldLevel", "X-Socratic", "X-ReplyClass", "X-ReplySource", "X-PromptVersion",
    "X-CodeStateFidelity", "X-ResultProvenance",
]

SESSION_GAP = 300   # 与 store.py::SESSION_GAP 同值：5 分钟无事件视为新会话


def _iso(ts: int, tz_minutes: int) -> str:
    """Timestamp 数据类型 = ISO 8601 本地时间、**不带时区**（时区单列 ServerTimezone）。"""
    return _dt.datetime.fromtimestamp(int(ts) + tz_minutes * 60,
                                      _dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def _tz_str(tz_minutes: int) -> str:
    sign = "+" if tz_minutes >= 0 else "-"
    m = abs(tz_minutes)
    return f"{sign}{m // 60:02d}{m % 60:02d}"


def _len_bucket(n: int) -> str:
    """与 ct.py::_safe_detail 同口径的长度分箱（short/medium/long）。原话不出域。"""
    return "short" if n <= 10 else ("medium" if n <= 25 else "long")


_ERRCLS = re.compile(r"^([A-Za-z_][A-Za-z0-9_.]*Error|[A-Za-z_][A-Za-z0-9_.]*Exception|Warning)\b")


def _err_class(digest: str) -> str:
    """从 errDigest（traceback 结论行）里取异常类名，如 'NameError'。取不到给 'Unknown'。"""
    m = _ERRCLS.match((digest or "").strip())
    return m.group(1) if m else ("Unknown" if digest else "")


# ── 数据读取 ───────────────────────────────────────────────────────────────────
def _conn(db_path: str) -> sqlite3.Connection:
    if not os.path.exists(db_path):
        raise SystemExit(f"[fatal] 找不到数据库：{db_path}")
    c = sqlite3.connect(db_path)
    c.row_factory = sqlite3.Row
    return c


def _table_exists(c: sqlite3.Connection, name: str) -> bool:
    return c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                     (name,)).fetchone() is not None


def _rows(c: sqlite3.Connection, sql: str, args=()) -> list[dict]:
    return [dict(r) for r in c.execute(sql, args).fetchall()]


def load_context(c: sqlite3.Connection) -> dict:
    """把导出要用到的所有旁表一次读进内存（数据量在万级，无需流式）。"""
    ctx: dict = {}

    # 同意状态（实时读，与 research.py::consent_ok_map 同口径）
    consent = {}
    if _table_exists(c, "guardian_consents"):
        for r in _rows(c, "SELECT user_id, consent_at, withdrawn_at FROM guardian_consents"):
            consent[r["user_id"]] = bool(r["consent_at"] and not r["withdrawn_at"])
    ctx["consent"] = consent

    # 组别：同一学生进多个课题时取最新的 study_id
    group, withdrawn = {}, {}
    if _table_exists(c, "study_members"):
        for r in _rows(c, "SELECT study_id,student_id,group_kind,withdrawn_at FROM study_members"
                          " ORDER BY study_id ASC"):
            group[r["student_id"]] = r["group_kind"] or ""
            withdrawn[r["student_id"]] = bool(r["withdrawn_at"])
    ctx["group"], ctx["withdrawn"] = group, withdrawn

    # 班级（取首个班级；学生跨班在 CX 里不是常态，跨班时如实记多值）
    klass = defaultdict(list)
    if _table_exists(c, "class_students"):
        for r in _rows(c, "SELECT class_id,student_id FROM class_students ORDER BY class_id"):
            klass[r["student_id"]].append(int(r["class_id"]))
    ctx["klass"] = klass

    # 项目 → 拥有者 / 语言
    proj = {}
    if _table_exists(c, "projects"):
        for r in _rows(c, "SELECT id,owner_id,language FROM projects"):
            proj[int(r["id"])] = {"owner": r["owner_id"], "lang": r["language"] or ""}
    ctx["proj"] = proj

    # 保存版本（唯一的真实码态来源）→ 按拥有者归组、按时间升序
    saves = defaultdict(list)
    if _table_exists(c, "project_versions"):
        for r in _rows(c, "SELECT id,project_id,version_no,code,created_at FROM project_versions"
                          " ORDER BY created_at ASC, id ASC"):
            p = proj.get(int(r["project_id"]))
            if not p:
                continue
            saves[p["owner"]].append({
                "cs_id": f"cs-{int(r['id'])}",
                "project_id": int(r["project_id"]),
                "code": r["code"] or "",
                "ts": int(r["created_at"] or 0),
                "version_no": int(r["version_no"] or 0),
                "lang": p["lang"],
            })
    ctx["saves"] = saves

    # 轮次标签：(room_id, round_index) → label
    rlabel = {}
    if _table_exists(c, "learning_round"):
        for r in _rows(c, "SELECT room_id,round_index,label FROM learning_round"):
            rlabel[(r["room_id"], int(r["round_index"]))] = r["label"] or ""
    ctx["rlabel"] = rlabel

    # 座位：(room_id, round_index, student_id) → 'L'|'R'
    seat = {}
    if _table_exists(c, "seat_map"):
        for r in _rows(c, "SELECT room_id,round_index,seat,student_id FROM seat_map"):
            seat[(r["room_id"], int(r["round_index"] or 0), r["student_id"])] = r["seat"] or ""
    ctx["seat"] = seat

    # navigator 回复元数据（**只有分类，没有原文**）：按学生分组，供 ai_help/hop 按时间就近配对
    replies = defaultdict(list)
    if _table_exists(c, "ai_reply_log"):
        for r in _rows(c, "SELECT student_id,room_id,round_index,role,socratic,scaffold_level,"
                          "source,reply_class,prompt_version,created_at FROM ai_reply_log"
                          " ORDER BY created_at ASC"):
            replies[r["student_id"]].append(r)
    ctx["replies"] = replies

    # 效标分（LinkTables/Subject.csv 用）
    crit = defaultdict(dict)
    if _table_exists(c, "ct_criterion"):
        for r in _rows(c, "SELECT student_id,phase,instrument,total FROM ct_criterion"
                          " ORDER BY created_at ASC"):
            crit[r["student_id"]][(r["phase"] or "").lower()] = {
                "total": r["total"], "instrument": r["instrument"] or ""}
    ctx["crit"] = crit
    return ctx


def _match_reply(replies: list[dict], ts: int, tol: int = 5):
    """ai_help/hop 事件与 ai_reply_log 的配对：同一学生、|Δt| ≤ tol 秒取最近的一条。
    两者由 ai.py 在同一次请求里先后写入，秒级就近配对是可靠的；配不上就留空（不猜）。"""
    best, best_d = None, tol + 1
    for r in replies:
        d = abs(int(r["created_at"] or 0) - ts)
        if d < best_d:
            best, best_d = r, d
        elif r["created_at"] and int(r["created_at"]) - ts > tol:
            break
    return best if best_d <= tol else None


# ── 主流程 ─────────────────────────────────────────────────────────────────────
def build(db_path: str, args) -> dict:
    c = _conn(db_path)
    ctx = load_context(c)

    # 1) 被试集合：只导学生（stu-*）；同意门默认开启
    subj_ids = set()
    for r in _rows(c, "SELECT DISTINCT user_id FROM ct_events WHERE user_id LIKE 'stu-%'"):
        subj_ids.add(r["user_id"])
    for uid in ctx["saves"]:
        if uid.startswith("stu-"):
            subj_ids.add(uid)

    excluded = 0
    if not args.include_no_consent:
        keep = {u for u in subj_ids if ctx["consent"].get(u)}
        excluded = len(subj_ids) - len(keep)
        subj_ids = keep

    # 2) 汇总所有事件（ct_events + 由 project_versions 合成的 File.Save）
    # 前向兼容：ct_events.code_state（逐次运行的码态哈希）与 code_state 表若已上线就直接用，
    # 未上线时退回"最近一次保存"的下界口径（X-CodeStateFidelity 会如实标注是哪一种）。
    _ct_cols = {r[1] for r in c.execute("PRAGMA table_info(ct_events)")}
    has_cs_col = "code_state" in _ct_cols
    # lang/edit_mode 是 2026-08-15 的幂等加列 —— 老库快照没有，按 code_state 同款条件选取
    has_ctx_cols = {"lang", "edit_mode"} <= _ct_cols
    exact_code: dict[str, str] = {}
    if has_cs_col and _table_exists(c, "code_state"):
        for r in _rows(c, "SELECT hash, code FROM code_state"):
            exact_code[r["hash"]] = r["code"] or ""

    raw: list[dict] = []
    cs_sel = ", code_state" if has_cs_col else ""
    ctx_sel = ", lang, edit_mode" if has_ctx_cols else ""
    for r in _rows(c, f"SELECT id,user_id,type,detail,project_id,ts,sv,round_index,room_id,"
                      f"switch_reason{ctx_sel}{cs_sel} FROM ct_events ORDER BY ts ASC, id ASC"):
        if r["user_id"] not in subj_ids:
            continue
        raw.append({"src": "ct", "id": int(r["id"]), "uid": r["user_id"], "type": r["type"],
                    "detail": r["detail"] or "", "project_id": r["project_id"],
                    "ts": int(r["ts"] or 0), "sv": int(r["sv"] or 1),
                    "round_index": r["round_index"], "room_id": r["room_id"],
                    "switch_reason": r["switch_reason"] or "",
                    "lang": (r["lang"] or "") if has_ctx_cols else "",
                    "edit_mode": (r["edit_mode"] or "") if has_ctx_cols else "",
                    "code_state": (r.get("code_state") or "") if has_cs_col else ""})
    for uid, lst in ctx["saves"].items():
        if uid not in subj_ids:
            continue
        for s in lst:
            # File.Save 由 project_versions 合成（真实时间戳、exact 码态）。
            # 50a9de5 起注意两点：① 白名单已收 'save'（ct 行→X-Save.Manual，标学生动作）；
            # ② 版本行含**运行即自动保存**产物 —— File.Save 不再等价「学生点了保存」，
            #    Initiator 置空如实示「人为/自动不可分」；手动保存另见 X-Save.Manual。
            raw.append({"src": "pv", "id": int(s["cs_id"].split("-")[1]), "uid": uid,
                        "type": "save", "detail": f"v{s['version_no']}",
                        "project_id": s["project_id"], "ts": s["ts"], "sv": 2,
                        "round_index": None, "room_id": None, "switch_reason": "",
                        "lang": "", "edit_mode": "",
                        "cs_id": s["cs_id"]})
    raw.sort(key=lambda e: (e["ts"], e["src"] != "pv", e["id"]))

    # 3) 码态指针：每个被试维护一根"到目前为止最近一次保存"的指针
    ptr = defaultdict(int)
    code_states: dict[str, str] = {CODE_STATE_EMPTY: ""}
    scrub_hits = 0

    def _emit_code(cs_id: str, code: str) -> str:
        """把一份源码放进 CodeStates 表（按 --code-mode 处理），返回其 CodeStateID。"""
        nonlocal scrub_hits
        if cs_id not in code_states:
            if args.code_mode == "none":
                code = ""
            elif args.code_mode == "hash":
                code = "sha256:" + hashlib.sha256(code.encode("utf-8")).hexdigest()
            elif args.code_mode == "scrubbed":
                code, hits = _anonymize(code)
                scrub_hits += len(hits)
            code_states[cs_id] = code
        return cs_id

    def code_state_for(uid: str, ts: int, is_save_row: dict | None, exact_hash: str = ""):
        nonlocal scrub_hits
        # 逐次运行的真实码态（上线后）优先：这是 exact，不再退回"最近一次保存"的下界
        if exact_hash and exact_hash in exact_code:
            return _emit_code("cs-h-" + exact_hash[:16], exact_code[exact_hash]), "exact"
        lst = ctx["saves"].get(uid, [])
        i = ptr[uid]
        while i < len(lst) and lst[i]["ts"] <= ts:
            i += 1
        ptr[uid] = i
        if is_save_row is not None:
            cur = next((s for s in lst if s["cs_id"] == is_save_row["cs_id"]), None)
            fidelity = "exact"
        else:
            cur = lst[i - 1] if i > 0 else None
            fidelity = "last-saved" if cur else "none"
        if cur is None:
            return CODE_STATE_EMPTY, fidelity
        return _emit_code(cur["cs_id"], cur["code"]), fidelity

    # 4) 会话切分 + run/error 配对 + 逐行生成
    last_ts, sess_no, sess_cur = {}, defaultdict(int), {}
    last_run_eid: dict[str, str] = {}
    tzm = args.tz_minutes
    tz = _tz_str(tzm)

    # run 结果补全：detail 为空时看 5 秒内是否紧跟同一学生的 error 事件
    err_after = defaultdict(list)
    for e in raw:
        if e["type"] == "error":
            err_after[e["uid"]].append(e["ts"])

    rows: list[dict] = []
    order = 0
    for e in raw:
        uid, ts = e["uid"], e["ts"]
        pid = _pid(uid)
        # —— 会话 ——
        if uid not in last_ts or ts - last_ts[uid] > SESSION_GAP:
            sess_no[uid] += 1
            sess_cur[uid] = f"sess-{pid}-{sess_no[uid]}"
        last_ts[uid] = ts

        etype, initiator = TYPE_MAP.get(e["type"], (f"X-{e['type']}", ""))
        if e["type"] == "save" and e["src"] == "pv":
            etype, initiator = "File.Save", ""      # 版本行 = 码态事件；人为/自动不可分，Initiator 留空
        cs_id, fidelity = code_state_for(uid, ts, e if e["src"] == "pv" else None,
                                         e.get("code_state") or "")
        order += 1
        eid = f"{e['src']}-{e['id']}"
        room = e["room_id"] or ""
        ri = e["round_index"]
        lang = ctx["proj"].get(int(e["project_id"]), {}).get("lang", "") if e["project_id"] else ""

        row = {k: "" for k in MAIN_COLUMNS}
        row.update({
            "EventID": eid,
            "SubjectID": pid,
            "EventType": etype,
            "ToolInstances": args.tool_instances + (f"; lang={lang}" if lang else ""),
            "CodeStateID": cs_id,
            "Order": order,
            "ServerTimestamp": _iso(ts, tzm),
            "ServerTimezone": tz,
            "CourseID": ";".join(f"class-{i}" for i in ctx["klass"].get(uid, [])),
            "TermID": args.term_id,
            "ExperimentalCondition": ctx["group"].get(uid, ""),
            "TeamID": _tid(room) if room else "",
            "SessionID": sess_cur[uid],
            "ProjectID": f"proj-{int(e['project_id'])}" if e["project_id"] else "",
            "EventInitiator": initiator,
            "X-CXEventType": e["type"],
            "X-Lang": e.get("lang", ""), "X-EditMode": e.get("edit_mode", ""),
            "X-EventSchemaVersion": e["sv"],
            "X-RoundIndex": ri if ri is not None else "",
            "X-RoundLabel": ctx["rlabel"].get((room, int(ri)), "") if (room and ri) else "",
            "X-Seat": ctx["seat"].get((room, int(ri or 0), uid), "") if room else "",
            "X-SwitchReason": e["switch_reason"],
            "X-CodeStateFidelity": fidelity,
        })

        if e["type"] == "run":
            d = e["detail"]
            paired = any(0 <= t - ts <= 5 for t in err_after.get(uid, ()))
            if d == "运行成功":
                row["ExecutionResult"] = "Success"
                # 自报"成功"却在 5 秒内跟了一条 error —— 两个信号互相打脸。不静默挑一个信，
                # 如实标 logged-contradicted，让分析方决定怎么处理（种子/仿真数据常见）。
                row["X-ResultProvenance"] = "logged-contradicted" if paired else "logged"
            elif d == "运行出错":
                row["ExecutionResult"], row["X-ResultProvenance"] = "Error", "logged"
            else:
                row["ExecutionResult"] = "Error" if paired else ""
                row["X-ResultProvenance"] = "paired-error" if paired else "unknown"
            last_run_eid[uid] = eid

        elif e["type"] == "error":
            row["ParentEventID"] = last_run_eid.get(uid, "")
            row["CompileMessageType"] = _err_class(e["detail"])
            row["CompileMessageData"] = e["detail"]
            row["ProgramErrorOutput"] = e["detail"]

        elif e["type"] == "fix":
            row["ParentEventID"] = last_run_eid.get(uid, "")

        elif e["type"] in ("ai_help", "hop"):
            row["InterventionCategory"] = "Hint"
            rep = _match_reply(ctx["replies"].get(uid, []), ts)
            if e["type"] == "ai_help":
                # detail = '[role] 学生原话前40字'。**只取角色与长度分箱**，原话不出域。
                d = e["detail"]
                role = d[1:d.index("]")] if d.startswith("[") and "]" in d else ""
                body = d[d.index("]") + 1:].strip() if "]" in d else d
                row["InterventionType"] = f"AI.Ask.{role or 'unknown'}"
                row["X-HelpRole"] = role
                row["X-HelpLenBucket"] = _len_bucket(len(body)) if body else ""
            else:
                row["InterventionType"] = "AI.Navigator.Followup"
            if rep:
                row["X-ScaffoldLevel"] = rep["scaffold_level"]
                row["X-Socratic"] = rep["socratic"]
                row["X-ReplyClass"] = rep["reply_class"]
                row["X-ReplySource"] = rep["source"]
                row["X-PromptVersion"] = rep["prompt_version"] or ""
                # InterventionMessage 规范要求"实际展示给学生的信息"；CX 不留 AI 回复原文，
                # 依规范允许的"数据集自有编码方案"给折叠码（D>RQ>EQ>CQ>O）。
                row["InterventionMessage"] = f"coded:{rep['reply_class']}"
            else:
                row["InterventionMessage"] = "coded:not-logged"

        elif e["type"] == "role_switch":
            row["EventInitiator"] = {"negotiated": "TeamMemberDirectAction",
                                     "forced": "ToolReaction"}.get(e["switch_reason"], "")

        rows.append(row)

    # 5) LinkTables
    subjects = []
    for uid in sorted(subj_ids):
        crit = ctx["crit"].get(uid, {})
        subjects.append({
            "SubjectID": _pid(uid),
            "X-Group": ctx["group"].get(uid, ""),
            "X-ClassID": ";".join(f"class-{i}" for i in ctx["klass"].get(uid, [])),
            "X-ConsentOK": 1 if ctx["consent"].get(uid) else 0,
            "X-Withdrawn": 1 if ctx["withdrawn"].get(uid) else 0,
            "X-CriterionPre": (crit.get("pre") or {}).get("total", ""),
            "X-CriterionPost": (crit.get("post") or {}).get("total", ""),
            "X-CriterionInstrument": (crit.get("pre") or crit.get("post") or {}).get("instrument", ""),
        })

    team_members = defaultdict(set)
    team_rounds = defaultdict(set)
    for e in raw:
        if e["room_id"]:
            team_members[e["room_id"]].add(e["uid"])
            if e["round_index"]:
                team_rounds[e["room_id"]].add(int(e["round_index"]))
    teams = [{"TeamID": _tid(r), "X-MemberCount": len(m),
              "X-RoundsObserved": ";".join(str(x) for x in sorted(team_rounds.get(r, ())))}
             for r, m in sorted(team_members.items())]

    c.close()   # Windows 上不关连接会锁住 db 文件（CI/测试里会连锁出一串莫名其妙的失败）
    return {"rows": rows, "code_states": code_states, "subjects": subjects, "teams": teams,
            "excluded_no_consent": excluded, "n_subjects": len(subj_ids),
            "scrub_hits": scrub_hits}


# ── 落盘 ───────────────────────────────────────────────────────────────────────
README_TMPL = """ProgSnap 2 dataset — CX 结对编程智能体平台（导出于 {gen}）

Contact
  Name : {contact_name}
  Email: {contact_email}

Specification
  ProgSnap 2, Specification Version {spec} (18 Dec 2020, Beta).
  CodeStateRepresentation = Table  (CodeStates/CodeStates.csv)

Overview
  本数据集由 CX 平台的服务端埋点表 ct_events 与代码保存表 project_versions 导出。
  CX 是面向初中（K12）的**共机结对编程**学习平台：两名学生共用一台机器，服务端权威地
  维护 driver / observer 角色；AI 以 driver（写代码）或 navigator（苏格拉底式追问、
  契约禁给完整代码）两种人设介入。事件全部由服务端写入，学生端无法伪造。

Context
  Term      : {term}
  Subjects  : {n_subjects}（假名；见"去标识化"）
  Events    : {n_events}
  CodeStates: {n_states}

去标识化 / De-identification
  * SubjectID = HMAC-SHA256(salt, 学生ID) 前 10 位，前缀 "S"；与平台 /api/research/export
    产出的假名**完全一致**，两份导出可按 SubjectID 配对。
  * TeamID = HMAC-SHA256(salt, "room:"+房间号) 前 10 位，前缀 "T"（房间号本身会泄露班级/座位）。
  * 姓名、作品标题、学生对 AI 说的原话**一律不导出**：ai_help 事件只导角色与长度分箱
    （X-HelpRole / X-HelpLenBucket）。
  * 源代码导出模式：{code_mode}。scrubbed = 已过平台同一套 PII 正则脱敏（本次命中 {scrub_hits} 处）。
    ⚠️ 自动脱敏不能替代人工核查：学生可能把姓名写进注释/字符串。**对外发布前必须人工过一遍 CodeStates.csv。**
  * 分析集口径：默认剔除无有效监护人同意的学生，本次剔除 {excluded} 人
    （DatasetMetadata: X-ExcludedNoConsent）。

事件类型映射（CX → ProgSnap2）
  run           → Run.Program      ExecutionResult 由 detail 判定；detail 为空时看 5 秒内
                                    是否紧跟 error 事件（X-ResultProvenance 标注来源）
  error         → X-Run.Error      ParentEventID 指向同一被试最近的 Run.Program；
                                    CompileMessageType = 异常类名（如 NameError）
  fix           → X-Run.Fix        "报错后跑通"的标记事件，ParentEventID 同上
  ai_help       → Intervention     Category=Hint, Initiator=UserDirectAction（学生发起提问）
  hop           → Intervention     Category=Hint, Initiator=ToolReaction（navigator 主动追问）
  role_switch   → X-Role.Switch    Initiator: negotiated→TeamMemberDirectAction, forced→ToolReaction
  design_create → X-Design.Create  两来源（ct-rules/v4）：积木模式首次拼出 ≥3 块；
                                    IDE 设计抽屉保存 ≥3 行伪代码（任意语言/模式，2026-08-18 起）
  save(ct 行)   → X-Save.Manual    学生点保存按钮的动作（50a9de5 起白名单收 save；带情境协变量）
  save(pv 合成) → File.Save        由 project_versions 合成（exact 码态）。含自动保存行，
                                    Initiator 留空=人为/自动不可分（勿当「学生保存频次」用，
                                    保存频次请数 X-Save.Manual）

  未使用 Compile / Compile.Error：CX 的 Python 主路径走浏览器 Pyodide，报错既有语法错也有
  运行时错，平台不作区分。把运行时异常记成 Compile.Error 会让 Jadud EQ 一类的编译错指标
  算在错误的语义上，因此改用 X-Run.Error 并如实说明。要复现 EQ/RED/Watwin，请把
  (Run.Program, X-Run.Error) 当作编译对，并在论文里注明这是适配而非原义。

自定义列 X-*
  X-CXEventType        原始 ct_events.type（可逆回溯）
  X-Lang / X-EditMode  创作情境协变量（python|cpp|c / block|code；2026-08-15 前的历史行为空）——
                       design_create 的可触发面依赖情境（v4 前仅 python+block），分析必须控制
  X-EventSchemaVersion 埋点语义版本 sv。1=旧语义（成功且此前报过错只记 fix 不记 run），
                       2=现语义（每次运行都记 run，失败补 error）。**跨 sv 的成功率不可直接比较。**
  X-RoundIndex/Label   教学轮次 1-3（R1能跑 / R2跑对 / R3跑好）
  X-Seat               结对座位 L/R（来自服务端冻结的 seat_map）
  X-SwitchReason       角色轮换原因 forced / negotiated
  X-HelpRole           学生向哪个 AI 人设求助（turtle=driver / reviewer=navigator）
  X-HelpLenBucket      学生提问长度分箱 short(≤10字) / medium(≤25) / long
  X-ScaffoldLevel      该次 AI 回复时的支架档位 0-3（服务端权威值）
  X-Socratic           是否被强制苏格拉底模式（0/1）
  X-ReplyClass         navigator 回复的折叠分类码 D>RQ>EQ>CQ>O（D=给了完整代码=契约违规）
  X-ReplySource        llm / fallback（fallback 是模板化确定性文本，须单独分层）
  X-PromptVersion      提示词版本（跨版本的 AI 行为不可比）
  X-CodeStateFidelity  exact=该事件本身就是保存点；last-saved=取该事件之前最近一次保存；
                       none=该被试此前没有任何保存 → CodeStateID = "{cs_empty}"（空码态哨兵）
  X-ResultProvenance   logged / logged-contradicted / paired-error / unknown。
                       logged-contradicted = detail 自报"运行成功"但 5 秒内跟了一条 error 事件，
                       两个信号互相矛盾（仿真/种子数据里高发），**分析前必须先看这一列的占比**。
  X-Group              exp / ctrl（LinkTables/Subject.csv）

已知缺陷（如实声明，勿在分析中假装不存在）
  1. **无逐次运行的码态**：CX 只在学生点"保存"时写 project_versions。因此绝大多数事件的
     CodeStateID 是"该事件之前最近一次保存"，是真实码态的**下界**，X-CodeStateFidelity=last-saved。
     【50a9de5 起已缓解】白名单已收 'save'（→X-Save.Manual），且前端「运行即自动保存」+
     服务端内容去重使版本节奏与行为流对齐 —— last-saved 的滞后大幅缩小，但仍非逐击键码态。
  2. **无 Submit / Score / Run.Test**：CX 的练习判题未与 ct_events 打通，因此没有 Submit 事件、
     没有 Score 列、没有测试用例级事件。与 CSEDM 数据集比较时这是最大的口径差。
  3. **AssignmentID / ProblemID 缺失**：ct_events 不带题目 ID，只带 project_id。已用 ProjectID 列
     承载，未伪造 AssignmentID。
  4. **ai_help 与 ai_reply_log 靠 ±5 秒就近配对**：同一请求内先后写入，秒级配对可靠；配不上的
     行 X-ReplyClass 等列留空（不猜）。
  5. Session.Start / Session.End 事件**未生成**（平台无显式会话边界）；SessionID 由
     {gap} 秒无事件切分推导，与 store.py 的会话定义同值，属**派生值**。
"""


def write_dataset(out: str, data: dict, args) -> None:
    os.makedirs(out, exist_ok=True)
    os.makedirs(os.path.join(out, "CodeStates"), exist_ok=True)
    os.makedirs(os.path.join(out, "LinkTables"), exist_ok=True)

    def _csv(path: str, header: list[str], records):
        # RFC 4180 + UTF-8 + 表头（规范强制）。newline='' 交给 csv 模块统一写 CRLF。
        with open(path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=header, extrasaction="ignore")
            w.writeheader()
            for r in records:
                w.writerow(r)

    _csv(os.path.join(out, "MainTable.csv"), MAIN_COLUMNS, data["rows"])
    _csv(os.path.join(out, "CodeStates", "CodeStates.csv"), ["CodeStateID", "Code"],
         ({"CodeStateID": k, "Code": v} for k, v in data["code_states"].items()))
    if data["subjects"]:
        _csv(os.path.join(out, "LinkTables", "Subject.csv"), list(data["subjects"][0].keys()),
             data["subjects"])
    if data["teams"]:
        _csv(os.path.join(out, "LinkTables", "Team.csv"), list(data["teams"][0].keys()),
             data["teams"])

    meta = [
        ("Version", SPEC_VERSION),
        # 所有事件时间戳均由服务端单一时钟写入 → 顺序全局可比
        ("IsEventOrderingConsistent", "true"),
        ("EventOrderScope", "Global"),
        ("EventOrderScopeColumns", ""),
        ("CodeStateRepresentation", "Table"),
        ("X-Producer", "CX export_progsnap2.py"),
        ("X-GeneratedAt", _iso(int(_dt.datetime.now().timestamp()), args.tz_minutes)),
        ("X-AnalysisSet", "false" if args.include_no_consent else "true"),
        ("X-ExcludedNoConsent", data["excluded_no_consent"]),
        ("X-PseudonymStableAcrossExports", "false" if SALT_IS_EPHEMERAL else "true"),
        ("X-CodeMode", args.code_mode),
        ("X-SessionGapSeconds", SESSION_GAP),
    ]
    _csv(os.path.join(out, "DatasetMetadata.csv"), ["Property", "Value"],
         ({"Property": k, "Value": v} for k, v in meta))

    with open(os.path.join(out, "README.txt"), "w", encoding="utf-8") as f:
        f.write(README_TMPL.format(
            gen=_iso(int(_dt.datetime.now().timestamp()), args.tz_minutes),
            contact_name=args.contact_name, contact_email=args.contact_email,
            spec=SPEC_VERSION, term=args.term_id or "(未填写)",
            n_subjects=data["n_subjects"], n_events=len(data["rows"]),
            n_states=len(data["code_states"]), code_mode=args.code_mode,
            scrub_hits=data["scrub_hits"], excluded=data["excluded_no_consent"],
            cs_empty=CODE_STATE_EMPTY, gap=SESSION_GAP))


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="把 CX 的过程数据导出为 ProgSnap2 数据集")
    p.add_argument("--db", default=os.path.join(_SERVER, "jiedui.db"))
    p.add_argument("--out", default=os.path.join(_SERVER, "..", "data", "progsnap2"))
    p.add_argument("--include-no-consent", action="store_true",
                   help="誊录核对视图：保留无监护人同意的学生（**不是分析集**，不得用于发表）")
    p.add_argument("--allow-ephemeral-salt", action="store_true",
                   help="允许在未配置 JIEDUI_EXPORT_SALT 时导出（假名跨批次不可比）")
    p.add_argument("--code-mode", choices=["scrubbed", "full", "hash", "none"], default="scrubbed")
    p.add_argument("--term-id", default="")
    p.add_argument("--tz-minutes", type=int, default=480, help="服务端时区偏移分钟数，默认 +08:00")
    p.add_argument("--tool-instances",
                   default="CX-Pair 0.1.0; Pyodide v0.26.4; Monaco Editor")
    p.add_argument("--contact-name", default="(TODO 填写联系人姓名)")
    p.add_argument("--contact-email", default="(TODO 填写联系人邮箱)")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args(argv)

    _assert_pid_matches_research()
    if SALT_IS_EPHEMERAL and not args.allow_ephemeral_salt:
        raise SystemExit(
            "[fatal] 未配置 JIEDUI_EXPORT_SALT：假名跨批次不可比，且与 /api/research/export 的\n"
            "        产物无法配对。请先在 server/.env 配置固定盐并妥善保管；\n"
            "        确实只想看一眼请加 --allow-ephemeral-salt。")

    data = build(args.db, args)
    print(f"subjects={data['n_subjects']}  events={len(data['rows'])}  "
          f"codestates={len(data['code_states'])}  excluded_no_consent={data['excluded_no_consent']}"
          f"  scrub_hits={data['scrub_hits']}", file=sys.stderr)
    if data["n_subjects"] == 0:
        print("[warn] 分析集为空：多半是没有任何学生有有效监护人同意（guardian_consents）。",
              file=sys.stderr)
    if args.dry_run:
        print(json.dumps({"sample_rows": data["rows"][:3]}, ensure_ascii=False, indent=2))
        return 0
    out = os.path.abspath(args.out)
    write_dataset(out, data, args)
    print(f"[ok] 已写出 ProgSnap2 数据集：{out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
