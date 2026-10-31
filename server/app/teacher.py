"""教师预警工作台聚合端点（S6 §4.8）。"""
import time
from fastapi import APIRouter, Depends, HTTPException
from app import store, store_resources
from app.ct import evidence_profile_for, resolve_profile_scope, summary_for
from app.auth import current_user

router = APIRouter(prefix="/api/teacher", tags=["教师工作台"])

DIMS = ["decompose", "abstract", "model", "algorithm", "verify", "transfer"]


def _require_teacher(user: dict):
    if user.get("role") not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师权限")


def _roster(class_id: int) -> list:
    """班级视图以**名册**为准，不是以「产生过数据的人」为准。

    store.list_students() 是从事件/作品/心跳三张表 UNION 出来的，只收录动过手的学生。
    按班过滤时若拿它当分母，从没上过机的学生就凭空消失了 —— 而「谁一次都没动」
    恰恰是老师上课最需要看见的人，也是结题报告里参与率的分母。
    """
    active = {s["id"]: s for s in store.list_students()}
    if not class_id:
        return list(active.values())
    return [
        active.get(sid, {"id": sid, "name": sid.replace("stu-", ""), "last_at": None})
        for sid in store_resources.class_student_ids([class_id])
    ]


@router.get("/live")
def live(window: int = 900, class_id: int = 0, user: dict = Depends(current_user)):
    """课堂实时监看（V5）：谁在跑、谁卡住、谁没动。前端轮询即可，无需 WebSocket。

    卡住判定（可解释、无黑盒）：窗口内有报错且**没有后续修复**，或连续报错 ≥2 次。
    `class_id` 收敛到一个班——不传会把全平台账号都铺出来，上课时没法看。
    """
    _require_teacher(user)
    now = int(time.time())
    seats = []
    for s in _roster(class_id):
        evs = [e for e in store.ct_events(s["id"], 300) if now - e["ts"] <= window]
        runs = sum(1 for e in evs if e["type"] == "run")
        errs = sum(1 for e in evs if e["type"] == "error")
        fixes = sum(1 for e in evs if e["type"] == "fix")
        helps = sum(1 for e in evs if e["type"] == "ai_help")
        last = evs[-1]["ts"] if evs else (s["last_at"] or 0)
        idle = now - last if last else None
        stuck = (errs > 0 and fixes == 0) or errs >= 2
        state = ("stuck" if stuck else
                 "active" if idle is not None and idle < 120 else
                 "idle" if idle is not None and idle < window else "away")
        seats.append({
            "id": s["id"], "name": s["name"], "state": state,
            "runs": runs, "errors": errs, "fixes": fixes, "helps": helps,
            "idle_sec": idle, "last_at": last,
        })
    order = {"stuck": 0, "active": 1, "idle": 2, "away": 3}
    seats.sort(key=lambda x: (order[x["state"]], -(x["errors"])))
    return {
        "now": now, "window": window, "seats": seats,
        "tally": {k: sum(1 for s in seats if s["state"] == k) for k in ("stuck", "active", "idle", "away")},
    }


@router.get("/home")
def home(class_id: int = 0, include_no_consent: int = 0,
         scope: str | None = None, task_id: str | None = None,
         unit_id: str | None = None, user: dict = Depends(current_user)):
    """首页聚合：一次拉齐 KPI / 学生学情 / 班级六维 / 预警 / 漏斗。

    `class_id` 收敛到一个班。**「班级六维均值」这个名字要求它必须能按班算** ——
    否则同一实例上多个班混在一起，研究报告的雷达图其实是全平台基线。

    班级六维均值是**研究口径**的聚合（neutral），必须与 T0-2 分析集同口径：
    默认剔除无有效监护人同意的学生，剔了几人在 excluded_no_consent 里如实报告；
    include_no_consent=1 保留全量（核对视图）。学生学情列表 / KPI / 漏斗是**教学视图**，
    老师必须看得见每一个学生 —— 不剔。
    """
    _require_teacher(user)
    profile_scope, scope_ref = resolve_profile_scope(scope, task_id, unit_id)
    now = int(time.time())
    roster = _roster(class_id)
    consent_ok = store.consent_ok_map([s["id"] for s in roster])
    all_alerts = store.list_risk_events(200)
    if class_id:
        ids = {s["id"] for s in roster}
        all_alerts = [a for a in all_alerts if a["user_id"] in ids]
    risk_by_user: dict[str, int] = {}
    for r in all_alerts:
        risk_by_user[r["user_id"]] = risk_by_user.get(r["user_id"], 0) + 1

    students = []
    level_counts: dict[str, dict[str, int]] = {}
    profile_n = 0
    excluded_no_consent = 0
    funnel = {"entered": 0, "ran": 0, "fixed": 0, "transferred": 0}
    for s in roster:
        # 行为聚合仅供课堂诊断；公开能力只读取同一 scope 下已确认/已修正的证据推断。
        cs = summary_for(s["id"], profile="neutral")
        profile = evidence_profile_for(s["id"], profile_scope, scope_ref)
        levels = profile["levels"] if profile["status"] == "evidence_backed" else {}
        online = bool(s["last_at"] and now - s["last_at"] < 600)
        risk = risk_by_user.get(s["id"], 0)
        students.append({
            "id": s["id"], "name": s["name"], "online": online,
            "runs": cs["runs"], "errors": cs["errors"], "fixes": cs["fixes"],
            "success_rate": cs["success_rate"], "ct": levels, "profile": profile,
            "diagnostic": {"diagnostic_only": True, "runs": cs["runs"],
                           "errors": cs["errors"], "fixes": cs["fixes"],
                           "success_rate": cs["success_rate"], "minutes": cs["minutes"]},
            "risk": risk,
            "last_at": s["last_at"],
        })
        if levels:
            if include_no_consent or consent_ok.get(s["id"]):
                profile_n += 1
                for d, value in levels.items():
                    label = str(value)
                    bucket = level_counts.setdefault(d, {})
                    bucket[label] = bucket.get(label, 0) + 1
            else:
                excluded_no_consent += 1
        funnel["entered"] += 1
        if cs["runs"] > 0:
            funnel["ran"] += 1
        if cs["fixes"] > 0:
            funnel["fixed"] += 1
        # 迁移漏斗只认已确认的迁移证据，不再用成功次数/换位次数生成的过程指数。
        if "transfer" in levels and str(levels["transfer"]).strip().lower() not in {
                "0", "none", "not_demonstrated", "未表现", "未观察到"}:
            funnel["transferred"] += 1

    # 等级是量规标签而非等距分数，班级层只给分布，禁止再算一个伪精确均值。
    class_ct = level_counts
    alerts = all_alerts[:50]
    for a in alerts:
        a["studentName"] = a["user_id"].replace("stu-", "")

    return {
        "kpis": {
            "students": len(roster),
            "online": sum(1 for s in students if s["online"]),
            # 按班看时只统计班内学生的提交，否则「班里 2 人却报 3 次提交」
            "submissions": store.submissions_count([s["id"] for s in roster] if class_id else None),
            "alerts": sum(1 for a in alerts if (a.get("level") or 0) >= 3),
        },
        "students": students,
        "class_ct": class_ct,
        # 均值是几个人算出来的 —— 前端必须能说明白「基于 N 名有效样本」，
        # 否则 3 个学生的均值和 40 个学生的均值在图上长得一模一样。
        "class_ct_n": profile_n,
        # T0-2 分析集口径：有数据但无同意、被剔出班级六维均值的人数（如实报告）
        "excluded_no_consent": excluded_no_consent,
        "analysis_set": not include_no_consent,
        "class_id": class_id,
        "profile_scope": profile_scope,
        "scope_ref": scope_ref,
        "alerts": alerts,
        "funnel": funnel,
    }
