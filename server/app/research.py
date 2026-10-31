"""
脱敏研究导出（§4.9 §6.4）：教师/研究员导出**去标识化**的过程数据，供计算思维研究与论文。
去标识化策略（面向未成年人保护）：
 - 学生 ID → 加盐哈希假名（不可逆、跨导出稳定，便于纵向追踪同一被试而不暴露身份）；
 - 剔除姓名、作品标题、所有自由文本（detail）；
 - 时间改为「相对首个事件的秒数」，不导出绝对时间戳；
 - 风险仅保留类别/等级，不含原文。
事件序列保留 type+相对时间，利于滞后序列分析（LSA）/路径分析。
"""
import os
import io
import csv
import json
import time
import hmac
import hashlib
import secrets
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from app import env as _env    # noqa: F401  盐值来自 .env：必须先装载，否则经测试/脚本直接
                                #             import 本模块时会静默退回进程随机盐，假名跨批次断链
from app import store, store_ai_reply, store_study, uptake
from app.ct import summary_for, FORMULA_VERSION
from app.auth import current_user

router = APIRouter(prefix="/api/research", tags=["研究导出"])
DIMS = ["decompose", "abstract", "model", "algorithm", "verify", "transfer"]

# 假名盐 **不能硬编码兜底**：源码是公开的，拿到导出文件的人只要有一份班级名单，
# 把几十个候选用户名逐个算一遍比对即可把假名全部还原成真人 —— "不可逆"是假的。
# 未配置 JIEDUI_EXPORT_SALT 时按进程随机生成：当次导出内自洽，跨批次不可比，
# 但绝不会给出一份"看着匿名、实则可还原"的数据。需要纵向追踪就显式配置环境变量。
SALT = os.environ.get("JIEDUI_EXPORT_SALT") or secrets.token_hex(16)
SALT_IS_EPHEMERAL = not os.environ.get("JIEDUI_EXPORT_SALT")
SEQ_MAX = 300              # 每名被试导出的事件序列上限（用于 LSA/路径分析）


def _pid(uid: str) -> str:
    """HMAC-SHA256 取 10 位（HMAC 不受长度扩展影响，优于 sha1(盐+uid) 直接拼接）。"""
    return "S" + hmac.new(SALT.encode(), uid.encode("utf-8"), hashlib.sha256).hexdigest()[:10]


def _require(user: dict):
    if user.get("role") not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师/研究员权限")


def build_dataset(include_no_consent: bool = False) -> dict:
    roster = store.list_students()
    # T0-2 分析集口径：无有效监护人同意的学生**默认不进研究数据**（实时读，与
    # study.py 的 criterion 查询同口径）。include_no_consent=True 是誊录核对视图，
    # 保留全量并逐行带 consent_ok 标记 —— 那是数据核对，不是分析集。
    ok = store.consent_ok_map([s["id"] for s in roster])
    if include_no_consent:
        excluded = 0
    else:
        kept = [s for s in roster if ok.get(s["id"])]
        excluded = len(roster) - len(kept)
        roster = kept
    risk_by: dict[str, list] = {}
    for r in store.list_risk_events(500):
        risk_by.setdefault(r["user_id"], []).append({"category": r["category"], "level": r["level"]})

    students = []
    for s in roster:
        uid = s["id"]
        # 研究导出统一用 neutral：抽象维含 ai_helps，实验组天然偏高，会把干预效果算进因变量
        cs = summary_for(uid, profile="neutral")
        # 取**最近** SEQ_MAX 条。ct_events 现在返回「最近 500 条的正序」，
        # 若再 [:300] 就是取这批里最老的 300 条 —— 活跃学生最近的行为被静默丢弃，
        # 而同一份 JSON 里的 behavior 计数（SQL 全量聚合）包含它们，序列与计数对不上。
        evs = store.ct_events(uid, 2000)[-SEQ_MAX:]
        t0 = evs[0]["ts"] if evs else 0
        # 事件序列带上创作情境协变量（分类值，非自由文本，不违反导出的脱敏纪律）。
        # 不带出去等于白采：design_create 只在 python+block 下才可能触发，分析者拿不到情境
        # 就没法把「没建模」与「在代码模式下做了但测不到」分开 —— 落库却不出参，
        # 与本项目反复出现的「写路径断线」是同一个毛病，只是断在读的那一端。
        # 不适用的事件为 None（真值），键始终存在，免得消费方靠 in 判断而把缺键当成 code。
        seq = [{"type": e["type"], "t": e["ts"] - t0,
                "lang": e["lang"], "edit_mode": e["edit_mode"]} for e in evs]
        projs = [{"lang": p["language"], "versions": p["latest_version"]} for p in store.list_projects(uid)]
        students.append({
            "pid": _pid(uid),
            # 实时同意状态。分析集里恒为 True（无同意的行根本不在）；
            # 誊录视图里用于标出哪些行不属于分析集。
            "consent_ok": bool(ok.get(uid)),
            # 行为事件公式只生成过程诊断指数，不是计算思维能力分或干预效果。
            "diagnostic_process_indices": cs["process_indices"],
            "behavior": {k: cs[k] for k in ("runs", "errors", "fixes", "ai_helps", "role_switches",
                                            "designs", "attempts", "successes", "success_rate")},
            # 两套口径必须分开命名：engaged 是操作间隔累加（投入），tab_open 是心跳
            # （只要标签页开着就累加，含挂机）。同名叫"用时"会让报告里出现 11 vs 501 的自相矛盾。
            "engaged_minutes": cs["minutes"],
            "tab_open_minutes": round(store.get_usage(uid) / 60, 1),
            "legacy_events": cs["legacy_events"],
            "projects": projs,
            "risk": risk_by.get(uid, []),
            "events": seq,
            "events_truncated": len(seq) >= SEQ_MAX,
        })

    return {
        "schema": "jiedui-research-export/v2",
        "generated_at": int(time.time()),
        # 六维口径版本必须随导出带出去（单一真源在 ct.py）。盐配了正式值之后假名跨批稳定，
        # 研究者会按 pid 把两批数据配对 —— v2→v3 升级使分布整体下移 30~60 分，
        # 没有这个字段，「全班六维普跌」会被当成真实回落写进报告。
        "diagnostic_formula_version": FORMULA_VERSION,
        "diagnostic_only": True,
        "anonymized": True,
        "deidentification": "学生ID → HMAC-SHA256 假名；剔除姓名/作品标题/自由文本；时间改为相对**本序列**首事件秒；风险仅类别等级",
        "field_notes": {
            "engaged_minutes": "操作间隔累加（单段>10分钟不计）的活动时长上下文，不代表投入、能力或效果",
            "tab_open_minutes": "浏览器心跳累加，含挂机时间，**不可**作为投入度指标",
            "legacy_events": ">0 表示该被试的数据跨了两套埋点语义（已分别还原后相加），需在报告中说明",
            "events_truncated": f"true 表示事件序列被截到最近 {SEQ_MAX} 条，序列不完整（behavior 计数仍为全量）",
            "events[].lang / events[].edit_mode":
                "创作情境协变量（python|cpp|c / block|code），null = 该事件不在 IDE 情境下产生。"
                "**必须作为协变量进入分析**：design_create 只在 python+block 下才可能触发，"
                "而它占 model 维 70%、decompose 25%、abstract（研究口径）30%。不控制它，"
                "「切到代码模式」与「没做建模」在数据上不可分，且模式选择很可能与先前经验相关"
                "（有基础者更倾向直接敲代码），组间比较会被选择偏差污染。"
                "另注：2026-08-15 之前的历史事件两列均为 null（无法回填），分析时须按时间分段处理",
            "diagnostic_process_indices": "由行为事件生成的过程诊断指数，只能描述过程模式，不能作为计算思维能力、画像等级或干预效果。",
            "diagnostic_formula_version": "过程诊断指数的算法口径；跨版本不可直接比较。",
            "excluded_no_consent": "按 T0-2 分析集口径默认剔除的无有效监护人同意学生数（实时读）；"
                                   "include_no_consent=1 为誊录核对视图（analysis_set=false，非分析集）",
        },
        # T0-2：分析集默认剔除无同意学生，剔了几人如实报告，不许静默变小
        "analysis_set": not include_no_consent,
        "excluded_no_consent": excluded,
        # 明确告知本批数据能不能和上一批对齐 —— 研究者需要知道假名是否跨批稳定
        "pseudonym_stable_across_exports": not SALT_IS_EPHEMERAL,
        "salt_note": ("本次使用进程内随机盐，假名不跨批次可比；需纵向追踪请配置 JIEDUI_EXPORT_SALT 环境变量并妥善保管"
                      if SALT_IS_EPHEMERAL else "使用已配置的固定盐，假名跨批次稳定"),
        "diagnostic_dimensions": DIMS,
        "n_students": len(students),
        "students": students,
    }


@router.get("/ai_reply_stats")
def ai_reply_stats(study_id: int = 0, room_id: str = "", source: str = "",
                   include_no_consent: int = 0, user: dict = Depends(current_user)):
    """navigator 四分类统计（定稿 §B2-x，自变量保真度 / manipulation check）。

    **红线归属声明**：本项评的是 AI 的行为，不是学生评分 —— 不下发学生、不进 ct 六维、
    不动 FORMULA_VERSION、不写回 ct_events。

    两套占比同时给，命名上就区分开，防止读表的人混用（定稿 §B2-x 口径分层）：
      - `occurrence`（**主口径**）：含 CQ / 含 EQ / 含 RQ / 含 D 的回复占比。多标二值，
        一条回复可同时计进多类，四者之和**不等于 1**，这是对的。
      - `class_share`（次口径）：优先级折叠码 D>RQ>EQ>CQ>O 的占比，四者之和=1。
        只供「一条回复一个标签」的面板展示与抽样分层，**不得写进论文的占比结论**。
    `violation_rate` = D 类红线违规率（navigator 契约禁给完整代码）。

    `source` 默认不过滤但**分层报**：fallback 是模板化确定性文本，两人标注必然一致，
    定稿要求它单独分层、不进主一致性统计。抽样时请显式传 source=llm。
    """
    _require(user)
    ids = None
    if study_id:
        ids = [m["student_id"] for m in store_study.members(study_id) if m.get("student_id")]
    rows = store_ai_reply.rows(room_id=room_id.strip(), student_ids=ids, source=source.strip())

    # T0-2 分析集口径：无有效监护人同意的学生默认不进研究数据（实时读，与 build_dataset 同口径）。
    excluded = 0
    if not include_no_consent:
        ok = store.consent_ok_map([r["student_id"] for r in rows])
        kept = [r for r in rows if ok.get(r["student_id"])]
        excluded = len(rows) - len(kept)
        rows = kept

    n = len(rows)
    by_class = {k: 0 for k in store_ai_reply.CLASSES}
    occ = {k: 0 for k in ("cq", "eq", "rq", "d")}
    by_source: dict[str, int] = {}
    for r in rows:
        by_class[r["reply_class"]] = by_class.get(r["reply_class"], 0) + 1
        for k in occ:
            occ[k] += 1 if r[k] else 0
        by_source[r["source"]] = by_source.get(r["source"], 0) + 1
    rate = (lambda x: round(x / n, 4)) if n else (lambda x: None)

    return {
        "schema": "jiedui-ai-reply-stats/v1",
        "scope": {"study_id": study_id or None, "room_id": room_id or None, "source": source or None},
        # n=0 时占比一律 None 而不是 0.0：「一条样本都没有」与「占比确实是 0」是两件事，
        # 用 0.0 冒充会让教师面板把空库读成「navigator 一次提问都没做」。
        "n": n,
        "by_class": by_class,
        "class_share": {k: rate(v) for k, v in by_class.items()},
        "occurrence": {k: rate(v) for k, v in occ.items()},
        "occurrence_n": occ,
        "violation_n": occ["d"],
        "violation_rate": rate(occ["d"]),
        "by_source": by_source,
        "analysis_set": not include_no_consent,
        "excluded_no_consent": excluded,
        # 前置闸（定稿）：≥400 条 source='llm' 的 navigator 回复才允许开始人工抽样标注。
        "sampling_gate_ready": by_source.get("llm", 0) >= 400,
        "field_notes": {
            "occurrence": "主口径：含该码的回复占比（多标二值，四者之和≠1）。报告写「含 RQ 的回复占比」",
            "class_share": "次口径：优先级折叠码 D>RQ>EQ>CQ>O 占比（和=1）。仅供展示/分层，不得进占比结论",
            "violation_rate": "D 类红线违规率：navigator 契约禁给完整代码，出现即违规",
            "by_source": "fallback 是模板化确定性文本，须单独分层，不进主一致性统计",
            "sampling_gate_ready": "定稿前置闸：≥400 条 source='llm' 的 navigator 回复才可开始抽样标注",
        },
    }


@router.get("/uptake")
def uptake_stats(study_id: int = 0, room_id: str = "", source: str = "",
                 include_no_consent: int = 0, user: dict = Depends(current_user)):
    """uptake 需求侧度量块 + 自变量保真度块 + 两块的 Spearman ρ（外部调研 R2 §2.1）。

    **红线归属声明**：本项是**研究量**，不是学生评分 —— 不下发学生端（学生看到 = 被标签化）、
    不进 ct 六维、不动 FORMULA_VERSION、不写回 ct_events；**不存学生回复原文，
    学生原话也不经本端点出参**（40 字前缀只在 uptake.index_events 内部参与词表判定）。

    响应约定照抄 ai_reply_stats（同一套纪律，别再发明第二套）：schema 版本串、scope 回显、
    n=0 时占比一律 None 而不是 0.0、analysis_set/excluded_no_consent 的同意口径过滤、
    field_notes 逐字段口径、_require(user) 教师/研究员门禁。

    额外的三条本端点特有的约定：
      - `by_delta` 同时给 60/180/600 三值（R2 要求预注册敏感性分析），主值 180 在
        scope.delta_sec_main 里回显；**U2 与 Δ 无关**故不在 by_delta 内重复。
      - `baselines` 只放数字不放判定：0.30/0.36 的解释规则是论文里的事，
        端点吐一个「达标/未达标」出来等于让代码替答辩下结论。
      - U4/U5（探索量，前置：提交 50a9de5）落在 by_delta.<Δ>.exploratory 下，与主报量
        **物理分层**；登记处已更名 `metric_registry`（拍板 Q3，schema v2）。
        **学生代码原文同样不经本端点出参** —— project_versions.code 只在
        uptake.index_versions 内做 difflib 行数统计，出参只含行数派生量。
    """
    _require(user)
    ids = None
    if study_id:
        ids = [m["student_id"] for m in store_study.members(study_id) if m.get("student_id")]
    rows, replies_truncated = store_ai_reply.rows(
        room_id=room_id.strip(), student_ids=ids, source=source.strip(), with_truncated=True)
    # 事件侧不按 source 过滤：source 是**回复**的属性（llm/fallback），ct_events 上没有这一列。
    # 传了 source=llm 时供给侧分母变小而需求侧事件不变，这一点写进 field_notes 由读表人知情。
    events, ev_truncated = uptake.load_events(student_ids=ids)

    # T0-2 分析集口径：无有效监护人同意的学生默认不进研究数据（实时读，与 build_dataset 同口径）。
    # 两个来源都要过一遍 —— 只过滤回复行会让某个未同意学生的 ai_help 仍然进 U2 的分母。
    ex_replies = ex_events = 0
    if not include_no_consent:
        ok = store.consent_ok_map([r["student_id"] for r in rows] + [e["user_id"] for e in events])
        kept_r = [r for r in rows if ok.get(r["student_id"])]
        kept_e = [e for e in events if ok.get(e["user_id"])]
        ex_replies, ex_events = len(rows) - len(kept_r), len(events) - len(kept_e)
        rows, events = kept_r, kept_e

    scope_room = room_id.strip()
    idx = uptake.index_events(events)
    student_ids = sorted({r["student_id"] for r in rows} | {e["user_id"] for e in events})

    # U4/U5（探索量）的版本行：按**已过同意口径的回复学生名单**取数 —— 版本的同意过滤
    # 在取数名单上就完成了（未同意学生的版本根本不落地），excluded 计数因此无需第三个来源；
    # U4/U5 的锚点都是回复行，无回复的学生不需要版本。
    version_rows, ver_truncated = uptake.load_versions(
        student_ids=sorted({r["student_id"] for r in rows}))
    vidx = uptake.index_versions(version_rows)
    n_versions = len(version_rows)
    del version_rows      # 含 code 原文的行就地丢弃：本行以下任何代码都拿不到代码文本（红线②）

    return {
        "schema": "jiedui-uptake/v2",
        "scope": {
            "study_id": study_id or None, "room_id": scope_room or None, "source": source or None,
            # Δ 必须回显：三值敏感性分析的表读起来一模一样，不写清是哪个 Δ 算的就没法引用
            "delta_sec_main": uptake.DELTA_MAIN,
            "delta_sec_sensitivity": list(uptake.DELTA_SENSITIVITY),
        },
        "n_students": len(student_ids),
        "n_navigator_replies": len(rows),
        "n_ct_events": len(events),
        "events_truncated": ev_truncated,
        # 回复行是全部锚点（U1/U3/U4/U5）与供给侧分母的唯一来源 —— 它的截断必须可见（P2-3）
        "replies_truncated": replies_truncated,
        "n_project_versions": n_versions,
        "versions_truncated": ver_truncated,
        "supply_side": uptake.compute_supply(rows, idx, room_id=scope_room),
        "u2": uptake.compute_u2(idx, room_id=scope_room),
        "by_delta": {str(d): uptake.compute_delta_block(rows, idx, d, versions_idx=vidx)
                     for d in uptake.DELTA_SENSITIVITY},
        "u6_criterion": uptake.compute_u6(
            uptake.load_f3_after_hint(room_id=scope_room, student_ids=ids)),
        # 拍板 Q3：not_computed → metric_registry（内容早已是「计算出处」，键名跟上），
        # schema 同步 v1→v2 —— 平台尚无外部消费方，这是把形状改对的最便宜时刻。
        "metric_registry": uptake.METRIC_REGISTRY,
        "baselines": uptake.BASELINES,
        # T0-2：剔了几条如实报告，不许静默变小。两个来源分开报，
        # 因为「回复行被剔」与「事件行被剔」影响的是不同的分母。
        "analysis_set": not include_no_consent,
        "excluded_no_consent": ex_replies + ex_events,
        "excluded_no_consent_detail": {"replies": ex_replies, "ct_events": ex_events},
        "field_notes": {
            **uptake.FIELD_NOTES,
            "source": "source 只过滤 ai_reply_log（回复的属性），ct_events 上没有这一列；"
                      "传 source=llm 时供给侧分母变小而需求侧事件不变，两块占比不再同分母。",
            "replies_truncated": "true 表示 navigator 回复行触到取数上限（5000）——"
                                 "全部锚点集不完整，n_anchors 偏小，各率的分母随之失真",
            "events_truncated": f"true 表示 ct_events 取数触到 {uptake.MAX_EVENTS} 条上限"
                                "（取的是**最近**一批），此时 U2 分母不完整，"
                                "U5 的 run/error 判据也可能不完整。",
            "versions_truncated": f"true 表示 project_versions 取数触到 {uptake.MAX_VERSIONS} "
                                  "条上限（取最近一批）。被截断版本链的头版本按 no_baseline "
                                  "单列，不会伪装成可判定的 diff。",
        },
    }


@router.get("/export")
def export(format: str = "json", include_no_consent: int = 0, user: dict = Depends(current_user)):
    """研究导出。默认为**分析集口径**（T0-2）：无有效监护人同意的学生不导出，
    剔除人数在 JSON 的 excluded_no_consent 与响应头 X-Excluded-No-Consent 里如实报告。
    include_no_consent=1 是誊录核对视图（每行带 consent_ok），不可当分析集用。"""
    _require(user)
    data = build_dataset(include_no_consent=bool(include_no_consent))
    ts = data["generated_at"]
    ex_headers = {"X-Excluded-No-Consent": str(data["excluded_no_consent"])}
    if format == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["pid", *[f"diagnostic_{d}" for d in DIMS], "attempts", "successes", "runs", "errors", "fixes",
                    "ai_helps", "role_switches", "designs", "success_rate",
                    "engaged_minutes", "tab_open_minutes", "legacy_events", "projects", "risk_count",
                    "consent_ok", "diagnostic_formula_version", "diagnostic_only"])
        for s in data["students"]:
            b = s["behavior"]
            w.writerow([s["pid"], *[s["diagnostic_process_indices"][d] for d in DIMS],
                        b["attempts"], b["successes"], b["runs"], b["errors"], b["fixes"],
                        b["ai_helps"], b["role_switches"], b["designs"], b["success_rate"],
                        s["engaged_minutes"], s["tab_open_minutes"], s["legacy_events"],
                        len(s["projects"]), len(s["risk"]), 1 if s["consent_ok"] else 0,
                        data["diagnostic_formula_version"], 1])
        return Response(content=buf.getvalue(), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": f"attachment; filename=jiedui_research_{ts}.csv",
                                 **ex_headers})
    return Response(content=json.dumps(data, ensure_ascii=False, indent=2),
                    media_type="application/json; charset=utf-8",
                    headers={"Content-Disposition": f"attachment; filename=jiedui_research_{ts}.json",
                             **ex_headers})
