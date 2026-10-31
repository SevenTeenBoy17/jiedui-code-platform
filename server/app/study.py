"""
课题研究层 API（V6）：把平台变成能产出结题报告证据的准实验工具。

对老师的心智模型只有一条线：**建课题 → 发前测 → 上课 → 结束 → 发后测 → 看结论**。
每一步服务端返回 `next_action`，前端永远只显示一个主按钮，老师不需要理解「阶段」「时间窗」。

三条不可协商的设计：
1. **主结局是独立测评卷，不是平台六维分**（六维分会被干预机械推高，见 store_study 模块注释）。
2. **结论必须带边界**：`caveats` 由服务端按规则硬生成、不可关闭 —— 平台不能只报喜。
3. **不出 p 值**（见 stats.py）。只给 mean/sd/n/gain/Cohen's d/α，推断留给导出数据与导师。
"""
import io
import csv
import json
import time

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app import store, guard, stats
from app import store_resources as R
from app import store_study as S
from app import assessment_access as A
from app import store_learner as L          # 回流钩子只落 policy_suggestion（建议+留痕），绝不直写 learner_state
from app.ct import summary_for, REPORT_FOLD, ct_report
from app.auth import current_user
from app import research                    # 按模块引用：盐的状态要在调用时读，不能 import 时定死
from app.research import _pid
from app.seed_ct_v1 import build_papers, build_probe_paper

router = APIRouter(prefix="/api/research", tags=["课题研究"])

DIMS = ["decompose", "abstract", "model", "algorithm", "verify", "transfer"]
DIM_CN = {"decompose": "分解", "abstract": "抽象", "model": "建模",
          "algorithm": "算法设计", "verify": "验证优化", "transfer": "迁移"}
PRE_DONE_GATE = 0.6          # 前测收卷率低于此值不让进干预期（可 force 但会留痕）


def _teacher(user: dict):
    if user.get("role") not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师权限")


def _cid(class_id: int) -> str:
    """班级簇号。班名（"初一(2)班"）绝不进导出——带年级带校内位置，配一份课表就能反推到人。
    但簇号必须有：整群分配下学生不独立，没有簇号分析者会当独立样本做检验。"""
    return "C" + _pid(f"class:{class_id}")[1:7]


# ============ 课题状态机 ============
class StudyIn(BaseModel):
    title: str = "结对编程智能体培养初中生计算思维的实践研究"
    question: str = ""
    assign_method: str = "intact"          # intact 整群 | random 随机
    exp_class_ids: list[int] = []
    ctrl_class_ids: list[int] = []


def _next_action(s: dict) -> dict:
    """老师看到的下一步。业务判断留在服务端，前端只渲染。

    **posttest 阶段必须走两拍**。原来直接映射成 `close`，而前端唯一的主按钮就是
    `step(next_action.key)`（StudyView.vue:30）—— 全站没有任何位置调用 `/posttest`。
    于是老师照着平台的指引一路点下去，`post_assessment_id` 永远是 NULL：
    「后测」卡片恒 0/N，报告的 between_gain_diff / cohens_d 恒 None，
    writeup 还会白纸黑字写出「后测 0.0（SD=0.0），增值 0.0」。
    **前后测差是这个准实验唯一的主结局**，而老师要到收官那一刻才发现它是空的，
    此时干预期已结束、班级设置已恢复，补不回来。
    """
    p = s["phase"]
    if p == "posttest":
        return ({"key": "close", "label": "收官并生成结论", "hint": "冻结数据，出对比报告"}
                if s.get("post_assessment_id")
                else {"key": "posttest", "label": "下发后测", "hint": "与前测同蓝图不同题，收齐后才能出结论"})
    return {
        "draft": {"key": "pretest", "label": "下发前测", "hint": "两个班一起做同一份题，作为起点"},
        "pretest": {"key": "start", "label": "开始上课（进入干预期）", "hint": "从这一刻起统计课堂数据"},
        "running": {"key": "end", "label": "结束这一轮", "hint": "干预期到此为止，之后发后测"},
        "closed": {"key": "report", "label": "看对比结论", "hint": "可直接抄进结题报告"},
    }.get(p, {"key": "report", "label": "看对比结论", "hint": ""})


def _fidelity(s: dict) -> dict:
    """实施保真度：实验班的苏格拉底引导是不是真的一直开着。

    报告写着有干预、设置里其实从没打开过，靠人是发现不了的 —— 这一节是论文
    「干预保真度」的原始材料。

    **只有干预期内才比对实时设置**。干预期结束时会把班级设置恢复原状（一轮研究
    不该永久改变老师的班级配置），此后再拿"当前设置"去比"干预期应有值"必然全部报警，
    是纯误报。结束之后改看冻结快照里的 `socratic_during`（记录的是当时的实况）。
    """
    breaks = []
    if s["phase"] == "running":
        flags = R.class_socratic_map()
        for cid in s["exp_class_ids"]:
            if not flags.get(cid, False):
                breaks.append({"class_id": cid, "expected": True, "actual": False})
        for cid in s["ctrl_class_ids"]:
            if flags.get(cid, False):
                breaks.append({"class_id": cid, "expected": False, "actual": True})
    elif s["phase"] in ("posttest", "closed"):
        for x in S.snapshots(s["id"], "intervention"):
            want = x["group_kind"] == "exp"
            if bool(x["socratic_during"]) != want:
                breaks.append({"class_id": 0, "student_id": x["student_id"],
                               "expected": want, "actual": bool(x["socratic_during"])})
    return {"breaks": breaks, "forced_start": bool(s.get("forced_start")),
            "checked": s["phase"] in ("running", "posttest", "closed")}


def _progress(aid: int | None, member_ids: set) -> dict:
    if not aid:
        return {"done": 0, "total": len(member_ids)}
    done = sum(1 for r in S.responses(aid) if r["student_id"] in member_ids)
    return {"done": done, "total": len(member_ids)}


def _detail(s: dict) -> dict:
    ms = S.members(s["id"])
    ids = {m["student_id"] for m in ms if not m["withdrawn_at"]}
    by_group = {g: [m for m in ms if m["group_kind"] == g and not m["withdrawn_at"]] for g in ("exp", "ctrl")}
    names = {c["id"]: c["name"] for c in R.list_classes()}
    return {
        **s,
        "next_action": _next_action(s),
        "exp_class_names": [names.get(c, f"#{c}") for c in s["exp_class_ids"]],
        "ctrl_class_names": [names.get(c, f"#{c}") for c in s["ctrl_class_ids"]],
        "n": {g: len(v) for g, v in by_group.items()},
        # 同意状态必须**实时**读。members.consent_ok 是下发前测那一刻的冻结值，而现实顺序
        # 恰恰是「发前测 → 告警出现 → 老师才开通」：读冻结值 = 告警永不消失、按钮永远在。
        # draft 阶段 members 还没冻结（下发前测才建）—— 那时改从班级名册实时算，
        # 否则建完课题的页面恒显示「0 人未登记」，老师在最该收同意书的备课期反而不被提醒。
        "consent_missing": [u for u, ok in store.consent_ok_map(
            R.class_student_ids(s["exp_class_ids"] + s["ctrl_class_ids"])
            if s["phase"] == "draft"
            else [m["student_id"] for m in ms if not m["withdrawn_at"]]).items() if not ok],
        "pre_progress": _progress(s["pre_assessment_id"], ids),
        "post_progress": _progress(s["post_assessment_id"], ids),
        # probe 收卷率**只报不阻断**（蓝图 2.1 闸门分级）：中测漏几个人不该卡教学进程，
        # 所以它只出现在这里与 probe 端点的响应里，任何状态转移都不读它。
        "probes": [{"assessment_id": p["id"], "round_id": p.get("round_id"),
                    "closed": bool(p.get("closed_at")),
                    "progress": _progress(p["id"], ids)} for p in S.list_study_probes(s["id"])],
        "fidelity": _fidelity(s),
    }


@router.get("/studies")
def studies(user: dict = Depends(current_user)):
    _teacher(user)
    return {"items": [_detail(s) for s in S.list_studies()]}


@router.get("/studies/{sid}")
def study_detail(sid: int, user: dict = Depends(current_user)):
    _teacher(user)
    s = S.get_study(sid)
    if not s:
        raise HTTPException(404, "课题不存在")
    return _detail(s)


@router.post("/studies")
def study_create(req: StudyIn, user: dict = Depends(current_user)):
    _teacher(user)
    if not req.exp_class_ids or not req.ctrl_class_ids:
        raise HTTPException(400, "实验组与对照组都要至少选一个班")
    # 两组名单不能有交集：socratic_locked_for() 是「任一所在班开=开」，
    # 跨组的学生必然被实验处理污染，组间比较当场失效。
    exp = set(R.class_student_ids(req.exp_class_ids))
    ctrl = set(R.class_student_ids(req.ctrl_class_ids))
    both = exp & ctrl
    if both:
        raise HTTPException(400, f"有 {len(both)} 名学生同时在两组班里（如 {sorted(both)[0]}），"
                                 f"跨组学生会被实验处理污染，请先调整名单")
    sid = S.create_study(user.get("sub", "anon"), req.model_dump())
    S.log(sid, user.get("sub", ""), "create", f"exp={req.exp_class_ids} ctrl={req.ctrl_class_ids}")
    return {"id": sid}


def _require_phase(s: dict, expect: str):
    if s["phase"] != expect:
        raise HTTPException(409, f"当前处于「{s['phase']}」阶段，这一步做不了")


def _members_from_classes(s: dict) -> list:
    rows = []
    for kind, cids in (("exp", s["exp_class_ids"]), ("ctrl", s["ctrl_class_ids"])):
        for cid in cids:
            for uid in R.class_student_ids([cid]):
                rows.append({"student_id": uid, "group_kind": kind, "cluster_class_id": cid,
                             "consent_ok": store.has_consent(uid)})
    return rows


@router.post("/studies/{sid}/pretest")
def open_pretest(sid: int, user: dict = Depends(current_user)):
    """draft → pretest：冻结名单、建前测卷、按班下发。"""
    _teacher(user)
    s = S.get_study(sid)
    if not s:
        raise HTTPException(404, "课题不存在")
    _require_phase(s, "draft")

    rows = _members_from_classes(s)
    if not rows:
        raise HTTPException(400, "两组班级里还没有学生，请先到「班级」页添加名单")
    # **先抢相位再干活**（条件更新判赢家）。读 phase 与写 phase 之间没有事务，双击会让
    # 两个请求都通过 _require_phase：原来两边都建卷、都全员推送 —— 学生收到两份前测卷。
    if not S.update_study(sid, {"phase": "pretest", "pre_opened_at": int(time.time())},
                          only_if_phase="draft"):
        cur = S.get_study(sid)
        return {"ok": True, "assessment_id": cur.get("pre_assessment_id"),
                "members": len(S.members(sid)), "note": "已由另一次操作下发"}
    try:
        n = S.snapshot_members(sid, rows)
        pre, _post = build_papers(s["blueprint_id"])
        aid = S.create_assessment(user.get("sub", "anon"),
                                  {"title": f"{s['title']}·前测", "kind": "pre",
                                   "blueprint_id": s["blueprint_id"], "items": pre,
                                   "source": "平台内置 ct-v1 题库（Bebras 式情境题，自编，未做标准化）"})
        S.lock_assessment(aid)
        # **先落卷号，再推送**。顺序反过来时：推送已全员发出、卷号回填失败 → 回滚到 draft，
        # 但推送收不回来；重试建第二份卷再推一次 —— 学生的待做列表里出现两份前测。
        # 现在失败最多留一份无推送的孤儿卷（学生不可见，不污染统计）。
        S.update_study(sid, {"pre_assessment_id": aid})
        pid = R.create_push(user.get("sub", "anon"), "assessment", aid,
                            [r["student_id"] for r in rows], "计算思维前测（起点测量）", None, 1)
    except Exception:
        # 回滚也要条件化：无条件写会把并发下已推进的状态砸回 draft
        S.update_study(sid, {"phase": "draft"}, only_if_phase="pretest")
        raise
    S.log(sid, user.get("sub", ""), "open_pretest", f"members={n} assessment={aid} push={pid}")
    return {"ok": True, "assessment_id": aid, "members": n}


class StartIn(BaseModel):
    force: bool = False


def _pretest_tertile_hook(sid: int, aid: int | None, actor: str):
    """回流钩子最小版（蓝图铁律11/13：测了必须有消费方）——前测三分位 → 支架档位建议。

    pretest→running 转移时按该 study 的前测总分排名分三段：下段建议档位 3（最高支架）、
    中/上段建议 2。**只落 policy_suggestion（建议+留痕），绝不直写 learner_state** ——
    改档仍走教师确认制（PUT /api/learner/state 采纳时带 suggestion_id）。
    分数只在服务端参与分流计算，不经任何学生可见通道（红线：分数不下发学生）。
    """
    if not aid:
        return
    ids = {m["student_id"] for m in S.members(sid) if not m["withdrawn_at"]}
    rs = sorted((r for r in S.responses(aid) if r["student_id"] in ids),
                key=lambda r: (r["total"], r["student_id"]))
    n = len(rs)
    if not n:
        return
    for i, r in enumerate(rs):
        band = i * 3 // n                      # 0=下 / 1=中 / 2=上（按排名三分位，容忍并列）
        cur = L.get_state(r["student_id"])["scaffold_level"]
        L.add_policy_suggestion(r["student_id"], cur, 3 if band == 0 else 2, False,
                                [f"前测三分位分流：{'下中上'[band]}"], "system:pretest_tertile")
    S.log(sid, actor, "pretest_tertile",
          f"n={n} 分流建议已落 policy_suggestion（教师确认制，不自动改档）")


@router.post("/studies/{sid}/start")
def start_intervention(sid: int, req: StartIn, user: dict = Depends(current_user)):
    """pretest → running：关前测、打开实验班引导、记下干预期起点。"""
    _teacher(user)
    s = S.get_study(sid)
    if not s:
        raise HTTPException(404, "课题不存在")
    _require_phase(s, "pretest")

    # 不变量：没有前测卷不得进入干预期。pretest 建卷中途（卷还没建好）被并发 force start
    # 抢进 running，会让整个课题没有起点测量 —— 主结局直接残废。
    if not s.get("pre_assessment_id"):
        raise HTTPException(409, "前测卷还没建好，稍候片刻再开始")
    ms = [m for m in S.members(sid) if not m["withdrawn_at"]]
    prog = _progress(s["pre_assessment_id"], {m["student_id"] for m in ms})
    rate = prog["done"] / prog["total"] if prog["total"] else 0
    if rate < PRE_DONE_GATE and not req.force:
        # 硬禁止老师会绕过平台自己发纸质卷，那更糟。严谨性靠留痕，不靠禁止。
        return {"blocked": True, "progress": prog,
                "message": f"还有 {prog['total'] - prog['done']} 人没做前测。"
                           f"坚持开始也可以，但报告里会注明「前测未收齐」。"}

    # 按**参与班级**逐个记原值，不能只抄 class_settings 里已有的行 ——
    # 从没配置过的班在那张表里没有记录，结束时就恢复不到，等于被研究永久改了设置。
    flags = R.class_socratic_map()
    before = {str(cid): (1 if flags.get(cid, False) else 0)
              for cid in (s["exp_class_ids"] + s["ctrl_class_ids"])}
    # **先抢相位、赢家才改设置**。双击时若输家也执行「读原值→改设置」，它读到的「原值」
    # 是赢家已经改过的（实验班=开），socratic_before 被污染 —— 研究结束恢复的就是错的原值，
    # 实验班的苏格拉底锁被永久改开。
    if not S.update_study(sid, {"phase": "running", "started_at": int(time.time()),
                                "pre_closed_at": int(time.time()), "socratic_before": before,
                                "forced_start": 1 if rate < PRE_DONE_GATE else 0},
                          only_if_phase="pretest"):
        return {"ok": True, "forced": False, "note": "已由另一次操作开始"}
    for cid in s["exp_class_ids"]:
        R.set_class_socratic(cid, True)
    for cid in s["ctrl_class_ids"]:
        R.set_class_socratic(cid, False)
    # 回流钩子（铁律11）：只在赢家分支里跑一次（输家早已 return），双击不会落两份建议。
    # 钩子失败不回滚状态转移 —— 分流建议是增益件，不能反过来卡住开课。
    try:
        _pretest_tertile_hook(sid, s.get("pre_assessment_id"), user.get("sub", ""))
    except Exception as e:                                  # noqa: BLE001
        S.log(sid, user.get("sub", ""), "pretest_tertile_error", str(e)[:200])
    S.log(sid, user.get("sub", ""), "start",
          f"pre_done={prog['done']}/{prog['total']}" + ("（强制开始）" if rate < PRE_DONE_GATE else ""))
    return {"ok": True, "forced": rate < PRE_DONE_GATE}


@router.post("/studies/{sid}/end")
def end_intervention(sid: int, user: dict = Depends(current_user)):
    """running → posttest：记下干预期终点、恢复班级原设置、冻结前两段快照。"""
    _teacher(user)
    s = S.get_study(sid)
    if not s:
        raise HTTPException(404, "课题不存在")
    _require_phase(s, "running")
    now = int(time.time())
    # 条件更新判赢家：双标签页同时点「结束」，两个请求都能过上面的 _require_phase
    # （读与写之间没有事务），输家在这里拿 False 直接返回，不再执行冻结/恢复副作用。
    if not S.update_study(sid, {"phase": "posttest", "ended_at": now}, only_if_phase="running"):
        return {"ok": True, "note": "已由另一次操作结束"}
    s = S.get_study(sid)
    # **先冻结、再恢复**：快照里的 socratic_during 要记录干预期当时的实况；
    # 顺序反了就会把"恢复后的设置"写进保真度记录，那份记录就没意义了。
    # （save_snapshot 对 socratic_during 首写即定，这里的首写就是定稿。）
    _freeze(sid, s, ("baseline", "intervention"))
    # 一轮研究不该永久改变老师的班级设置
    for cid_str, val in (s.get("socratic_before") or {}).items():
        try:
            R.set_class_socratic(int(cid_str), bool(val))
        except (ValueError, TypeError):
            continue
    S.log(sid, user.get("sub", ""), "end", "已冻结基线期与干预期快照")
    return {"ok": True}


@router.post("/studies/{sid}/posttest")
def open_posttest(sid: int, user: dict = Depends(current_user)):
    _teacher(user)
    s = S.get_study(sid)
    if not s:
        raise HTTPException(404, "课题不存在")
    _require_phase(s, "posttest")
    if s["post_assessment_id"]:
        return {"ok": True, "assessment_id": s["post_assessment_id"], "note": "后测已下发过"}
    _pre, post = build_papers(s["blueprint_id"])
    aid = S.create_assessment(user.get("sub", "anon"),
                              {"title": f"{s['title']}·后测", "kind": "post",
                               "blueprint_id": s["blueprint_id"], "items": post,
                               "source": "平台内置 ct-v1 题库·等值卷（同蓝图不同题）"})
    S.lock_assessment(aid)
    ids = [m["student_id"] for m in S.members(sid) if not m["withdrawn_at"]]
    R.create_push(user.get("sub", "anon"), "assessment", aid, ids, "计算思维后测（终点测量）", None, 1)
    S.update_study(sid, {"post_assessment_id": aid, "post_opened_at": int(time.time())})
    S.log(sid, user.get("sub", ""), "open_posttest", f"assessment={aid}")
    return {"ok": True, "assessment_id": aid}


# ============ 轮末探针 probe（学测评一体化·切分2：running 期子事件，不动主相位状态机）============
class ProbeOpenIn(BaseModel):
    round_index: int                        # 1-3（R1能跑/R2跑对/R3跑好，与教学轮同一套轮序语言）
    room_id: str | None = None              # 可选：只作留痕（study 级探针推全体成员，不绑单房间）
    item_count: int = 3                     # 2-3 道客观锚题


@router.post("/studies/{sid}/probe/open")
def probe_open(sid: int, req: ProbeOpenIn, user: dict = Depends(current_user)):
    """开一轮课堂探针（silent probe）：从 ct_v1 题池抽 2-3 题，kind=probe、绑轮序，推全体成员。

    - **不动主相位**：只允许在 running 期开（探针嵌在轮末，轮在干预期内），开/关都不改 phase。
    - 学生作答走既有 GET/submit 通道 —— 五层门禁（404 防枚举、剥 answer/dim/why、
      dim_max 不下发、锁卷、INSERT OR IGNORE）与同意门全部复用、一条不豁免。
    - 收卷率只在响应与课题详情里报，不阻断任何状态转移（闸门分级：probe 只警告）。
    """
    _teacher(user)
    s = S.get_study(sid)
    if not s:
        raise HTTPException(404, "课题不存在")
    if s["phase"] != "running":
        raise HTTPException(409, f"当前处于「{s['phase']}」阶段：课堂探针只能在干预期（running）内下发")
    if req.round_index not in (1, 2, 3):
        raise HTTPException(400, "round_index 必须在 1-3 之间")
    # 排除本课题 pre/post 卷已用题面（ct-v1 现状下 pre 变体全用于前测 → 回退为跨波锚题，
    # 见 build_probe_paper 注释；probe_pool 独立扩题留待题库建设）
    used = set()
    for key in ("pre_assessment_id", "post_assessment_id"):
        if s.get(key):
            a = S.get_assessment(s[key], with_answers=True)
            used |= {it["stem"] for it in (a or {}).get("items", [])}
    items = build_probe_paper(s["blueprint_id"], used, req.item_count, req.round_index)
    aid = S.create_assessment(user.get("sub", "anon"), {
        "title": f"{s['title']}·第{req.round_index}轮课堂探针", "kind": "probe",
        "blueprint_id": s["blueprint_id"], "items": items,
        "study_id": sid, "round_id": req.round_index,
        "source": "ct-v1 轮末锚题（复用 pre 变体作跨波锚；probe_pool 独立扩题留待题库建设）"})
    S.lock_assessment(aid)                  # 下发即锁，与 pre/post 同纪律
    ids = [m["student_id"] for m in S.members(sid) if not m["withdrawn_at"]]
    R.create_push(user.get("sub", "anon"), "assessment", aid, ids,
                  f"第{req.round_index}轮课堂小探针（不计成绩，据实作答）", None, 1)
    S.log(sid, user.get("sub", ""), "probe_open",
          f"round={req.round_index} assessment={aid} room={(req.room_id or '').strip()[:64] or '-'}")
    return {"ok": True, "assessment_id": aid, "round_index": req.round_index,
            "progress": {"done": 0, "total": len(ids)}}


# ── probe 面板契约适配（前端 StudyView「轮次小测」卡片的先行契约）────────────
# ⚠️ 路由顺序：/probe 与 /probe/close 是字面路由，必须注册在 /probe/{aid}/close 之前，
# 否则 "close" 会被当作 aid 解析直接 422（FastAPI 不做类型不匹配回退）。

@router.get("/studies/{sid}/probe")
def probe_rounds(sid: int, user: dict = Depends(current_user)):
    """按轮聚合的探针面板：{items:[{round_index, status, submitted, total, assessment_id}]}。
    status: idle=未发放 / open=收卷中 / closed=已关窗。同轮多卷取最新一张（旧卷入历史不上面板）。"""
    _teacher(user)
    s = S.get_study(sid)
    if not s:
        raise HTTPException(404, "课题不存在")
    ids = {m["student_id"] for m in S.members(sid)}
    by_round: dict = {}
    for p in S.list_study_probes(sid):
        by_round[p.get("round_id") or 0] = p          # 后写覆盖 = 取最新
    items = []
    for ri in (1, 2, 3):
        p = by_round.get(ri)
        if not p:
            items.append({"round_index": ri, "status": "idle", "submitted": 0,
                          "total": len(ids), "assessment_id": None})
        else:
            pg = _progress(p["id"], ids)
            items.append({"round_index": ri, "status": "closed" if p.get("closed_at") else "open",
                          "submitted": pg["done"], "total": pg["total"], "assessment_id": p["id"]})
    return {"items": items}


class ProbeCloseIn(BaseModel):
    round_index: int


@router.post("/studies/{sid}/probe/close")
def probe_close_by_round(sid: int, req: ProbeCloseIn, user: dict = Depends(current_user)):
    """按轮关窗（面板契约）：找到该轮收卷中的探针卷并关窗；无可关卷 404。"""
    _teacher(user)
    s = S.get_study(sid)
    if not s:
        raise HTTPException(404, "课题不存在")
    for p in S.list_study_probes(sid):
        if p.get("round_id") == req.round_index and not p.get("closed_at"):
            return probe_close(sid, p["id"], user)
    raise HTTPException(404, "该轮没有收卷中的探针")


@router.post("/studies/{sid}/probe/{aid}/close")
def probe_close(sid: int, aid: int, user: dict = Depends(current_user)):
    """探针关窗：此后取卷/交卷一律 409（迟交的探针分不可与同轮混算）。

    收卷率只在响应里报 —— 关窗**不**触发也**不**阻断任何课题状态转移。
    """
    _teacher(user)
    s = S.get_study(sid)
    if not s:
        raise HTTPException(404, "课题不存在")
    a = S.get_assessment(aid)
    if not a or a.get("study_id") != sid or a.get("kind") != "probe":
        raise HTTPException(404, "探针不存在")            # 404 防枚举：不确认他课题的卷 id 存在
    A.close_owned(aid, user)                              # 新旧关卷入口共用创建者许可
    ids = {m["student_id"] for m in S.members(sid) if not m["withdrawn_at"]}
    prog = _progress(aid, ids)
    S.log(sid, user.get("sub", ""), "probe_close",
          f"assessment={aid} done={prog['done']}/{prog['total']}")
    return {"ok": True, "progress": prog}


@router.post("/studies/{sid}/close")
def close_study(sid: int, req: StartIn = StartIn(), user: dict = Depends(current_user)):
    _teacher(user)
    s = S.get_study(sid)
    if not s:
        raise HTTPException(404, "课题不存在")
    _require_phase(s, "posttest")
    # 没发过后测就收官 = 主结局（前后测差）永久为空，且收官后干预期已结束、班级设置已恢复，
    # 补不回来。所以这里拦一道；老师确实要空着收官（比如整轮作废）也可以，但会留痕。
    if not s.get("post_assessment_id") and not req.force:
        return {"ok": False, "blocked": "no_posttest",
                "message": "后测还没有下发，现在收官的话「前后测对比」会是空的。确定要收官吗？"}
    now = int(time.time())
    if not S.update_study(sid, {"phase": "closed", "post_closed_at": now}, only_if_phase="posttest"):
        return {"ok": True, "note": "已由另一次操作收官"}
    if not s.get("post_assessment_id"):
        S.log(sid, user.get("sub", ""), "close_without_posttest", "老师确认无后测收官，本课题无主结局")
    _freeze(sid, S.get_study(sid), ("post",))
    S.log(sid, user.get("sub", ""), "close", "已冻结后测期快照，数据封存")
    return {"ok": True}


@router.post("/studies/{sid}/recompute")
def recompute(sid: int, user: dict = Depends(current_user)):
    """补救用：漏加人、时间点点错时重算快照。会留痕并报告有效样本数变化。

    阶段守卫：干预期还没开始时没有任何窗口可算 —— 原来照样跑，会给 baseline 段
    写下一份 win_end=当时 now 的快照，之后再也分不清那行 dims 是按哪个窗口算的。
    保真度记录（socratic_during）由 save_snapshot 的首写即定保护，这里重算不动它。
    """
    _teacher(user)
    s = S.get_study(sid)
    if not s:
        raise HTTPException(404, "课题不存在")
    if not s.get("started_at"):
        raise HTTPException(400, "课题还没进入干预期，没有可重算的期段")
    # 只重算**窗口已闭合**的期段。running 期重算 intervention 会抢先首写快照 ——
    # socratic_during 首写即定，被锁在重算那一刻，end 时的真实实况反而写不进去。
    segs = ["baseline"]
    if s.get("ended_at"):
        segs.append("intervention")
    if s.get("phase") == "closed":
        segs.append("post")
    before = len([x for x in S.snapshots(sid) if x["has_real_data"]])
    _freeze(sid, s, tuple(segs))
    after = len([x for x in S.snapshots(sid) if x["has_real_data"]])
    # 口径版本要留痕：升过版的平台上重算，dims 会换算法 —— 什么版本算的必须可查
    S.log(sid, user.get("sub", ""), "recompute",
          f"有效样本 {before} → {after}，formula={S.FORMULA_VERSION}")
    return {"ok": True, "valid_before": before, "valid_after": after}


def _windows(s: dict) -> dict:
    """三个期段的时间窗。基线期 = 干预开始前（无下界，取该生全部历史）。

    post 段收官后必须**封上界**：原来是 (ended_at, None)，收官之后学生继续在平台上
    写码，closed 课题再 recompute 时收官后的行为会被算进「后测期」快照 ——
    冻结数据长出了新数字。
    """
    return {
        "baseline": (None, s["started_at"]),
        "intervention": (s["started_at"], s["ended_at"]),
        "post": (s["ended_at"], s.get("post_closed_at")),
    }


def _freeze(sid: int, s: dict, segments):
    """把期段六维算成**冻结快照**。

    不能每次现算：六维公式是启发式且被调整过（地板分、has_real_data 门槛都改过一次），
    三月写的报告六月复算数字就变了，结论不可复现。
    """
    wins = _windows(s)
    socratic_now = R.class_socratic_map()
    for seg in segments:
        t0, t1 = wins[seg]
        if seg != "baseline" and t0 is None:
            continue
        for m in S.members(sid):
            uid = m["student_id"]
            cs = summary_for(uid, since=t0, until=t1, profile=s.get("scoring_profile", "neutral"))
            S.save_snapshot(sid, seg, {
                "student_id": uid, "group_kind": m["group_kind"],
                "win_start": t0 or 0, "win_end": t1 or int(time.time()),
                # 兼容既有存储列名 dims；内容是过程诊断指数，不是能力或效果分。
                "dims": cs["process_indices"],
                # peer_turns（终审 R+1，为 R+2 的期段互动对比提前）：照 ai_helps 的冻结模式
                # 按同一期段窗口 [t0, t1) 计数入快照 —— 收官后聊天还在涨，报告数字不能跟着涨。
                "behavior": {**{k: cs[k] for k in ("runs", "errors", "fixes", "ai_helps",
                                                   "role_switches", "designs", "attempts", "successes")},
                             "peer_turns": L.peer_turns(student_id=uid, since=t0, until=t1)},
                "success_rate": cs["success_rate"], "engaged_minutes": cs["minutes"],
                "evidence_count": cs["evidence_count"], "has_real_data": cs["has_real_data"],
                "socratic_during": socratic_now.get(m["cluster_class_id"], False) if seg == "intervention" else False,
                "sv_mixed": store.ct_sv_mixed(uid, t0, t1),
                "scoring_profile": s.get("scoring_profile", "neutral"),
            })


# ============ 测评（学生端）============
class SubmitIn(BaseModel):
    answers: list[int] = []
    # 前端自报时长改名 duration_client（学测评一体化·切分1）：它可伪造，只作参考落库；
    # too_fast 判定改用服务端「下发→提交」时差（铁律10）。duration_sec 保留为旧字段名兼容
    # 未升级的前端，duration_client 优先。
    duration_client: int = 0
    duration_sec: int = 0
    target_id: int | None = None


@router.get("/my/assessments")
def my_assessments(user: dict = Depends(current_user)):
    """我收到的测评（切分5 对账）：含 kind/round_id/due 与完成状态（待做/已交/已关窗）。

    只见自己的推送；**不含题目、不含标答、不含任何分数**（红线：分数不下发学生）——
    完成态只由交卷端点写回，这里只读。
    """
    uid = user.get("sub", "anon")
    out = []
    for p in R.my_pushes(uid, 50):
        if p["res_type"] != "assessment":
            continue
        a = S.get_assessment(p["res_id"])
        if not a:
            continue
        done = S.response_of(p["res_id"], uid) is not None
        closed = bool(a.get("closed_at"))
        out.append({"assessment_id": p["res_id"], "title": a["title"], "kind": a["kind"],
                    "round_id": a.get("round_id"), "item_count": a["item_count"],
                    "target_id": p["target_id"], "due_at": p.get("due_at"),
                    "done": done, "closed": closed,
                    "status": "已交" if done else ("已关窗" if closed else "待做")})
    return {"items": out}


def _my_paper(aid: int, uid: str, with_answers: bool):
    """取一份「确实推送给了我」的卷子。取不到一律 404。

    原来只查 has_consent，任何登录学生都能 `GET /my/assessments/1,2,3…` 逐个试，
    把 18 道题的完整题干拖走发到班群 —— 包括**尚未下发的后测卷**。
    这直接废掉前后测「同蓝图不同题」的等值设计（学生见过原题），
    而且他还能对任意 aid 交卷，那几份乱填的作答会进 `_alpha`，
    把要写进论文「测量工具」一节的 Cronbach's α 算歪。

    用 404 而不是 403：403 等于告诉对方「这个 id 是存在的」，卷子 id 是连号的。
    """
    if not R.was_pushed_to("assessment", aid, uid):
        raise HTTPException(404, "测评不存在")
    a = S.get_assessment(aid, with_answers=with_answers)
    if not a:
        raise HTTPException(404, "测评不存在")
    return a


@router.get("/my/assessments/{aid}")
def my_assessment(aid: int, user: dict = Depends(current_user)):
    uid = user.get("sub", "anon")
    # 测评同样是在收集未成年人数据，门禁不能只设在 /api/ai/chat 上
    # （probe/delayed 等新 kind 走同一条路：同意门对新通道不豁免）
    if not store.has_consent(uid):
        raise HTTPException(403, "CONSENT_REQUIRED")
    a = _my_paper(aid, uid, with_answers=False)        # 学生拿不到标答与维度标签
    # 服务端时长起点（铁律10）：首次取卷即落 opened_at，INSERT OR IGNORE 只记首次 ——
    # 重复刷新不重置计时起点。交卷时 duration_server = now - opened_at。
    A.begin(aid, uid)
    # 显式白名单。`dim_max` 的**键序**就是第 1~6 题的维度序列（题库是交错组卷、
    # 首现建键），把它下发出去，等于把上面刚裁掉的 `dim` 标签又还了回去。
    return {k: a[k] for k in ("id", "title", "item_count", "items") if k in a}


def _probe_submit_hook(a: dict, uid: str, total: float, item_scores: list):
    """probe 交卷钩子（切分2/4）：自动落效标 + 低分回流建议。

    - ct_criterion(phase='probe', instrument='ct-v1-probe') **覆盖式**录入（复用其
      (study,student,phase,instrument) 唯一键）：新一轮覆盖旧轮的效标总分，
      轮级明细仍在 assessment_responses.round_id 里可查。落的是独立效标表 ——
      不写 ct_event、不进六维公式输入（红线：六维不受测评污染、不挂激励）。
    - 该轮得分率 < 0.5 → 落一条 policy_suggestion（建议升一档）。**只建议 + 留痕**，
      绝不直写 learner_state —— 改档仍走教师确认制（PUT /api/learner/state）。
    - dims（终审 #3）：按题的维度标签聚合出**四要素小计**一并落库 —— 分维 r 须在录入时打标，
      只有总分的效标行事后拆不回分维。六维→四要素映射用 ct.REPORT_FOLD（与 ct_report
      折叠同一真源）；transfer 题不进四要素（口径同 ct_report），其得分仍在 total/item_scores。
    """
    sid = a["study_id"]
    dims: dict = {}
    for it, sc in zip(a["items"], item_scores):
        name = REPORT_FOLD.get(it.get("dim", ""))
        if name:
            dims[name] = round(dims.get(name, 0.0) + sc, 2)   # 0 是真值（考了没得分）≠ 缺维（没考）
    S.save_criterion(sid, uid, "probe", "ct-v1-probe", item_scores, round(total, 2), dims)
    S.log(sid, uid, "probe_submit",
          f"assessment={a['id']} round={a.get('round_id')} total={round(total, 2)}")
    mx = sum(float(it.get("score", 1)) for it in a["items"])
    if mx and total / mx < 0.5:
        cur = L.get_state(uid)["scaffold_level"]
        L.add_policy_suggestion(uid, cur, min(3, cur + 1), False,
                                ["轮末probe得分率低于50%"], "system:probe")


@router.post("/my/assessments/{aid}/submit")
def submit_assessment(aid: int, req: SubmitIn, user: dict = Depends(current_user)):
    uid = user.get("sub", "anon")
    if not store.has_consent(uid):
        raise HTTPException(403, "CONSENT_REQUIRED")
    a = _my_paper(aid, uid, with_answers=True)
    A.ensure_answerable(aid, uid)

    items = a["items"]
    total = 0.0
    dim_hit: dict = {}
    item_scores = []
    for i, it in enumerate(items):
        pick = req.answers[i] if i < len(req.answers) else -1
        sc = float(it.get("score", 1)) if pick == it.get("answer") else 0.0
        total += sc
        item_scores.append(sc)
        d = it.get("dim", "other")
        dim_hit[d] = dim_hit.get(d, 0.0) + sc
    dim_max = a["dim_max"] or {}
    dim_scores = {d: round(v / dim_max[d] * 100) if dim_max.get(d) else 0 for d, v in dim_hit.items()}

    # 服务端时长（铁律10）：下发（首次取卷）→ 提交的时差，前端伪造不了。
    dur_client = req.duration_client or req.duration_sec       # 旧字段名兼容，新名优先
    opened = S.opened_at_of(aid, uid)
    duration_server = (int(time.time()) - opened) if opened is not None else None

    # 数据清洗标记：老师不需要懂，系统替他打好，报告里报告剔除人数。
    # too_fast 判定用**服务端时长**（0 秒也是太快）；只有历史数据/脚本直交没有首开记录时
    # 才回退前端自报值（回退口径与旧行为一致：0 视为未报、不判）。
    flags = []
    if duration_server is not None:
        if duration_server < len(items) * 5:
            flags.append("too_fast")
    elif dur_client and dur_client < len(items) * 5:
        flags.append("too_fast")
    if len(set(req.answers)) == 1 and len(req.answers) >= 5:
        flags.append("straightline")

    with A.answer_transaction(aid, uid) as c:
        if not S.insert_response(c, aid, uid, {"answers": req.answers, "total": round(total, 2),
                                             "dim_scores": dim_scores, "item_scores": item_scores,
                                             "duration_sec": dur_client, "duration_server": duration_server,
                                             "round_id": a.get("round_id"), "flags": flags}):
            raise HTTPException(409, "你已经交过这份卷子了")
    if req.target_id:
        R.mark_push(req.target_id, uid, "read_at")
        R.mark_push(req.target_id, uid, "done_at")
    # probe 卷：自动落 ct_criterion + 低分回流建议（独立效标表；不写 ct_event）
    if a.get("kind") == "probe" and a.get("study_id"):
        _probe_submit_hook(a, uid, round(total, 2), item_scores)
    # 刻意**不写 ct_event**：写了会被算进"学习用时"和六维证据量，污染研究数据
    # 蓝图红线：**分数不下发学生** —— 交卷响应只有中性完成态（总分/维度分/逐题对错一律不回）。
    # 分照旧在上面落库，教师端与报告照看；学生端由前端渲染「已完成，谢谢你的认真作答 🐢」。
    return {"ok": True, "done": True, "kind": a.get("kind")}


# ============ 对比报告 ============
def _no_consent_ids(sid: int) -> set:
    """课题名单里（未退出）**当前无有效监护人同意**的学生集合（实时读，T0-2）。

    分析集口径：这批学生的作答与过程快照默认不进任何统计；
    include_no_consent=1 时保留（誊录核对视图），但仍要报告集合大小。
    """
    ids = [m["student_id"] for m in S.members(sid) if not m["withdrawn_at"]]
    return {u for u, ok in store.consent_ok_map(ids).items() if not ok}


def _valid_responses(sid: int, aid: int | None, group: str | None = None,
                     include_flagged: bool = False, drop: set | None = None):
    """一份卷子里**能用来下结论**的作答：名单内、未退出、且没被标记为乱答。

    交卷时已经打好了 too_fast / straightline 标记，但此前报告一侧从没读过 `flags` ——
    标完就扔。初中生集体测评里直线作答是常态，一个班 10 来人的小样本上，
    三四份全 A 卷就足以造出一个假的组间差；而 `writeup` 是做成「可直接抄进结题报告」的
    成品，错的会原样进论文。

    `drop`：分析集要剔除的学生集合（T0-2 无同意者；见 _no_consent_ids）。
    """
    if not aid:
        return []
    ids = {m["student_id"] for m in S.members(sid, group) if not m["withdrawn_at"]}
    if drop:
        ids -= drop
    rs = [r for r in S.responses(aid) if r["student_id"] in ids]
    return rs if include_flagged else [r for r in rs if not r.get("flags")]


def _group_scores(sid: int, aid: int | None, group: str, drop: set | None = None) -> dict:
    if not aid:
        return {"n": 0, "mean": 0, "sd": 0, "dims": {}, "by_student": {}, "excluded": 0}
    rs = _valid_responses(sid, aid, group, drop=drop)
    # excluded 只数「被判乱答」的份数，不含无同意剔除 —— 两类剔除在报告里必须分开交代
    dropped = len(_valid_responses(sid, aid, group, include_flagged=True, drop=drop)) - len(rs)
    by = {r["student_id"]: r for r in rs}
    dims = {d: stats.mean([r["dim_scores"].get(d) for r in rs if d in r["dim_scores"]]) for d in DIMS}
    return {**stats.describe([r["total"] for r in rs]), "dims": dims, "by_student": by,
            "excluded": dropped}


def _caveats(s: dict, rep: dict) -> list:
    """结论的边界。**服务端硬生成、不可关闭** —— 平台不能只报喜。"""
    out = [
        "平台六维分由行为次数推算，会随使用量上升，属过程性行为指标，"
        "不是标准化计算思维测评，不能单独作为能力提升证据。",
        "前后测为同蓝图不同题的自编卷，难度等值性无统计保证；"
        "请只解读两组增值之差，不解读单组增值的绝对值。",
    ]
    n_class = len(s["exp_class_ids"]) + len(s["ctrl_class_ids"])
    if n_class < 4:
        out.append(f"参与班级仅 {n_class} 个，组别与班级共线，班级层面不做统计推断，"
                   f"本研究应写作准实验设计。")
    paired = min(rep["assess"]["exp"].get("n_paired", 0), rep["assess"]["ctrl"].get("n_paired", 0))
    if paired < 20:
        out.append(f"两组中较小的配对样本仅 {paired} 人，不足 20，只能作个案描述。")
    if s.get("assign_method") == "intact":
        out.append("采用原有教学班整群分配，非随机化，存在选择偏倚。")
    span = _days(s.get("started_at"), s.get("ended_at"))
    if s.get("started_at") and s.get("ended_at") and span < 14:
        out.append(f"干预期仅 {span} 天，短于两周，不足以支撑「能力发展」类结论，"
                   f"宜表述为短期教学效果的初步观察。")
    if s.get("forced_start"):
        out.append("前测未收齐即进入干预期，前测样本代表性受限。")
    # 差异性流失（终审 #6）：两组流失率差 >10 个百分点即硬写告警、不可关闭。
    # 出处：汤倩雯（扬州大学，2024）实验班保留 63.5% vs 对照班 75.0%（多流失 11.5 个百分点）
    # 且全文零交代 —— 所研读的 19 篇文献零篇报告流失分析，本平台不许把这个偏倚固化成默认行为。
    att = rep.get("attrition") or {}
    rates = {g: att[g]["withdrawn"] / att[g]["assigned"]
             for g in ("exp", "ctrl") if att.get(g, {}).get("assigned")}
    if len(rates) == 2 and abs(rates["exp"] - rates["ctrl"]) > 0.10:
        gap = round(abs(rates["exp"] - rates["ctrl"]) * 100, 1)
        out.append(f"两组流失率相差 {gap} 个百分点（超过 10 个百分点），存在差异性流失：留下来的两组"
                   f"样本可能已不可比，增值与效应量须结合 attrition.pretest_comparison"
                   f"（流失者 vs 完成者前测均分）作敏感性解读，并在报告中逐组交代流失原因"
                   f"（差异性流失零交代的教训见汤倩雯（扬州大学，2024）：实验班多流失 11.5 个百分点"
                   f"而全文未作任何交代）。")
    n_drop = rep["assess"]["exp"].get("excluded", 0) + rep["assess"]["ctrl"].get("excluded", 0)
    if n_drop:
        out.append(f"已剔除 {n_drop} 份异常作答（作答过快或全部选同一个选项），"
                   f"上述均分、增值与效应量均基于剔除后的样本。")
    # T0-2 分析集口径：无同意剔除与乱答剔除是两类不同的剔除，各自单独交代
    if rep.get("excluded_no_consent"):
        out.append(f"已按分析集口径（T0-2）剔除 {rep['excluded_no_consent']} 名"
                   f"无有效监护人同意的学生，其测评作答与过程数据不进入上述任何统计；"
                   f"誊录核对请使用 include_no_consent=1 视图。")
    # 六维分是行为累计次数的线性函数且封顶 100（如 verify = 28+fixes*9+20，修 6 次就到顶）。
    # 一轮 6 周的干预下来，多数维度会在**全体学生**身上撞顶变成常数：组间差恒为 0，
    # 却仍以"过程指标"的名义出现在报告里。不说明的话，读者会把"两组机制相同"当成发现。
    if rep["process"].get("ceiling"):
        out.append(f"过程指标中的 {'、'.join(rep['process']['ceiling'])} 维在干预期已达上限 100 分，"
                   f"该维在本轮数据中不具区分度，两组差异恒为 0，不可用于解释机制；"
                   f"请改看同一区块的行为计数（运行/修复/求助次数）。")
    if rep["fidelity"]["breaks"]:
        out.append(f"干预期内有 {len(rep['fidelity']['breaks'])} 名学生所在班的引导设置与分组不符，"
                   f"干预保真度受影响。")
    if any(x["sv_mixed"] for x in S.snapshots(s["id"])):
        out.append("部分期段含旧口径埋点数据，该期段的成功率与算法/迁移维不可与其他期段直接比较。")
    # 课题立项时记下的公式版本 ≠ 当前版本 → 中途改过口径，必须在报告里说
    from app.ct import FORMULA_VERSION as CUR
    if s.get("formula_version") and s["formula_version"] != CUR:
        out.append(f"本课题立项时的旧过程诊断口径为 {s['formula_version']}，平台当前为 {CUR}，"
                   f"期间口径发生过变更；跨版本的诊断指数不可直接比较，"
                   f"且不能作为能力或效果结论，请以量规证据与测评卷成绩为准。")
    # α 范畴修正（终审 #5，升级方案 L47）：能力卷六维异质是设计而非缺陷，α 偏低不再表述为
    # 「可靠性有限」—— 那是把同质性系数误用作信度主张。低 α 仍要如实交代（中性表述），
    # 并把读者指向真正承担工具质量主张的逐题统计（item_stats）。
    a_pre = rep["assess"]["alpha_reference"].get("pre")
    if a_pre is not None and a_pre < 0.6:
        out.append(f"前测 α 参考值为 {a_pre}（<0.6）。本卷按六个异质维度交错组卷，"
                   f"α 的同质性前提在设计上即不成立，该值仅作同质性参考、不构成对工具信度的"
                   f"判断；工具质量请查看逐题难度与区分度（item_stats），并在报告中说明"
                   f"工具为自编、未经标准化施测。")
    return out


def _writeup(s: dict, rep: dict) -> list:
    e, c = rep["assess"]["exp"], rep["assess"]["ctrl"]
    d = rep["assess"]["between_gain_diff"]
    # 「实验组 N 人」必须写清 N 是**哪一个** N。前测交卷、后测交卷、前后都交（配对）
    # 是三个不同的数，而增值只能由配对样本算出。原来一句话里混用 `n`（前测人数）和
    # 由 `n_paired` 算出的增值：读者会以为 8 个人产出了那个 1.86，实际只有 7 个。
    # 这段文字是明着标了「可直接抄进结题报告」的，写歪了会原样进论文。
    lines = [
        f"本研究采用不等组前后测准实验设计，实验组 {e['n']} 人、对照组 {c['n']} 人完成前测，"
        f"其中前后测均完成、可计算增值的分别为 {e['n_paired']} 人与 {c['n_paired']} 人；"
        f"干预周期自 {_day(s['started_at'])} 至 {_day(s['ended_at'])}。",
        f"实验组前测均分 {e['mean']}（SD={e['sd']}），后测 {e.get('post_mean', 0)}（SD={e.get('post_sd', 0)}），"
        f"配对增值 {e.get('gain_mean', 0)}（n={e['n_paired']}）；对照组前测 {c['mean']}（SD={c['sd']}），"
        f"后测 {c.get('post_mean', 0)}（SD={c.get('post_sd', 0)}），配对增值 {c.get('gain_mean', 0)}"
        f"（n={c['n_paired']}）。",
    ]
    if d is not None:
        cd = rep["assess"]["cohens_d"]
        line = f"两组增值之差为 {d}" + (f"，Cohen's d={cd}。" if cd is not None else "。")
        # 教育干预的效应量常见区间是 0.2~0.8，d>2 几乎一定是样本太小或数据有问题，
        # 不是"效果特别好"。直接抄进论文会在答辩上被问住 —— 平台自己先说破。
        if cd is not None and abs(cd) > 2:
            line += (f"需注意：d={cd} 远超教育干预常见范围（0.2~0.8），"
                     f"在本例的小样本下更可能反映样本量不足或数据异常，不宜作为效果强度的证据。")
        lines.append(line)
    lines.append("过程性数据显示：" + "；".join(
        f"{'实验组' if g == 'exp' else '对照组'}干预期内人均运行 "
        f"{rep['process'][g].get('intervention', {}).get('runs', 0)} 次、"
        f"修复 {rep['process'][g].get('intervention', {}).get('fixes', 0)} 次"
        for g in ("exp", "ctrl")) + "。")
    return lines


def _day(ts) -> str:
    return time.strftime("%Y年%m月%d日", time.localtime(ts)) if ts else "—"


def _process_block(sid: int, group: str, drop: set | None = None) -> dict:
    drop = drop or set()
    out = {}
    for seg in S.SEGMENTS:
        rows = [x for x in S.snapshots(sid, seg) if x["group_kind"] == group and x["has_real_data"]
                and x["student_id"] not in drop]
        if not rows:
            out[seg] = {}
            continue
        out[seg] = {
            "n": len(rows),
            "diagnostic_only": True,
            "diagnostic_process_indices": {
                d: stats.mean([r["dims"].get(d) for r in rows]) for d in DIMS
            },
            **{k: stats.mean([r["behavior"].get(k) for r in rows])
               for k in ("runs", "errors", "fixes", "ai_helps", "attempts", "successes")},
            "success_rate": stats.mean([r["success_rate"] for r in rows]),
            "engaged_minutes": stats.mean([r["engaged_minutes"] for r in rows]),
        }
    return out


def _process(sid: int, drop: set | None = None) -> dict:
    """两组的过程指标，外加一份**到顶维度清单**（保险丝）。

    v2 时代六维是行为累计的线性函数再 clamp 到 100，一轮 6 周干预 4/6 维在全体学生身上
    撞成常数 —— 组间差恒 0，却长得和真实测量结果一模一样。v3（质量率×证据权重+饱和量）
    在数学上不可能到 100，这份检测降级为保险丝：再出现全员同值的维度，报告必须承认。

    `drop`：分析集剔除（T0-2 无同意者），到顶检测也按分析集算 —— 保险丝守的是进报告的数据。
    """
    drop = drop or set()
    out = {g: _process_block(sid, g, drop) for g in ("exp", "ctrl")}
    out["diagnostic_only"] = True
    out["note"] = "行为过程指数只用于诊断上下文，不是计算思维能力或干预效果。"
    ceiling = []
    for d in DIMS:
        vals = [x["dims"].get(d) for x in S.snapshots(sid, "intervention")
                if x["has_real_data"] and x["dims"].get(d) is not None
                and x["student_id"] not in drop]
        if vals and min(vals) >= 100:
            ceiling.append(DIM_CN.get(d, d))
    out["ceiling"] = ceiling
    return out


@router.get("/studies/{sid}/report")
def report(sid: int, include_no_consent: int = 0, user: dict = Depends(current_user)):
    """对比报告。默认为**分析集口径**（T0-2）：无有效监护人同意的学生不进任何统计
    （均分/增值/效应量/α/过程指标），剔了几人在 excluded_no_consent 里如实报告并写进 caveats。
    include_no_consent=1 保留全量（誊录核对视图，analysis_set=false），不可当结论用。
    流失表（attrition）保持全名单口径 —— 它本来就是交代「样本怎么少下去」的账目。"""
    _teacher(user)
    s = S.get_study(sid)
    if not s:
        raise HTTPException(404, "课题不存在")

    no_consent = _no_consent_ids(sid)
    drop = set() if include_no_consent else no_consent
    assess = {}
    for g in ("exp", "ctrl"):
        pre = _group_scores(sid, s["pre_assessment_id"], g, drop)
        post = _group_scores(sid, s["post_assessment_id"], g, drop)
        paired = [(pre["by_student"][u]["total"], post["by_student"][u]["total"])
                  for u in pre["by_student"] if u in post["by_student"]]
        gains = [b - a for a, b in paired]
        assess[g] = {
            "n": pre["n"], "mean": pre["mean"], "sd": pre["sd"], "dims": pre["dims"],
            "post_n": post["n"], "post_mean": post["mean"], "post_sd": post["sd"], "post_dims": post["dims"],
            "n_paired": len(paired), "gain_mean": stats.mean(gains), "gain_sd": stats.sd(gains),
            # 被剔除的乱答份数要报出来，否则「n 变小了」在报告里没有解释
            "excluded": pre["excluded"] + post["excluded"],
            "_gains": gains,
        }
    d_exp, d_ctrl = assess["exp"]["_gains"], assess["ctrl"]["_gains"]
    between = round(assess["exp"]["gain_mean"] - assess["ctrl"]["gain_mean"], 2) if (d_exp and d_ctrl) else None
    # α 范畴修正（终审 #5，升级方案 L47）：能力卷不再以 α 作信度主张。
    # - alpha_reference：同质性参考值，非信度主张 —— 能力卷六维异质是设计而非缺陷，
    #   α 偏低是预期而不是工具不可靠的证据（字段名即口径，防止下游当信度引用）。
    # - item_stats：真正承担工具质量主张的逐题证据 —— difficulty=逐题通过率 p，
    #   discrimination=点二列区分度（与 α 同口径：只吃分析集内的有效作答）。
    alpha_reference = {k: _alpha(sid, s.get(f"{k}_assessment_id"), drop) for k in ("pre", "post")}
    item_stats = {k: _item_stats(sid, s.get(f"{k}_assessment_id"), drop) for k in ("pre", "post")}
    for g in ("exp", "ctrl"):
        assess[g].pop("_gains")

    rep = {
        "study": {**{k: s[k] for k in ("id", "title", "question", "phase", "assign_method",
                                        "started_at", "ended_at")},
                  "diagnostic_profile": s["scoring_profile"],
                  "diagnostic_formula_version": s["formula_version"]},
        "assess": {**assess, "between_gain_diff": between,
                   "cohens_d": stats.cohens_d(d_exp, d_ctrl),
                   "alpha_reference": alpha_reference, "item_stats": item_stats},
        "process": _process(sid, drop),
        # 仅描述行为过程指数与外部效标的统计关联，不再称为能力效度。
        "legacy_diagnostic_association": _validity(sid, drop),
        "attrition": _attrition(sid, s),
        "fidelity": _fidelity(s),
        # T0-2 分析集口径：剔除数必须如实出现在响应里，不许让 n 静默变小
        "analysis_set": not include_no_consent,
        "excluded_no_consent": 0 if include_no_consent else len(no_consent),
    }
    rep["caveats"] = _caveats(s, rep)
    rep["writeup"] = _writeup(s, rep)
    rep["plain"] = {
        "headline": (f"实验班测评均分从 {assess['exp']['mean']} 到 {assess['exp']['post_mean']}，"
                     f"对照班从 {assess['ctrl']['mean']} 到 {assess['ctrl']['post_mean']}。")
        if assess["exp"]["post_n"] else "后测还没有收上来，先看前测起点。",
    }
    return rep


def _alpha(sid: int, aid, drop: set | None = None):
    """α 参考值只能基于**下结论用的那批作答**算。

    原来取 `S.responses(aid)` 全量：既包含非名单学生（配合"任意 aid 可交卷"那个洞，
    外人乱填几份就能改写 α），也包含被判为乱答的样本。于是同一份报告里
    α 和均分基于两个不同的样本集。分析集剔除（drop，T0-2 无同意者）同理必须与均分同口径。
    范畴口径（终审 #5，升级方案 L47）：返回值以 alpha_reference 呈现 ——
    同质性参考值，非信度主张（能力卷维度异质是设计而非缺陷）。
    """
    rs = _valid_responses(sid, aid, None, drop=drop)
    return stats.cronbach_alpha([r["item_scores"] for r in rs if r["item_scores"]])


def _item_stats(sid: int, aid, drop: set | None = None) -> dict:
    """逐题难度与区分度（终审 #5，升级方案 L47）：能力卷的工具质量主张由它承担。

    与 _alpha 严格同口径（分析集内的有效作答），否则「难度说这批人、α 说那批人」。
    difficulty[j]=第 j 题通过率 p；discrimination[j]=第 j 题的点二列区分度
    （该题得分与卷面总分的相关；全对/全错的题返回 None —— 无区分信息不硬凑）。
    """
    rs = _valid_responses(sid, aid, None, drop=drop)
    mat = [r["item_scores"] for r in rs if r["item_scores"]]
    diff = stats.item_difficulty(mat)
    if not diff:
        return {"difficulty": [], "discrimination": []}
    totals = [sum(m) for m in mat]
    disc = [stats.point_biserial([m[i] for m in mat], totals) for i in range(len(diff))]
    return {"difficulty": diff, "discrimination": disc}


# 效标 phase → 快照期段的时间窗对齐（终审 R+3 批次①）：pre 效标对基线期、probe 对干预期、
# post/delayed 对后测期 —— 两侧测的必须是**同一段时间里的同一个人**，错窗的 r 是假相关。
VALIDITY_SEG = {"pre": "baseline", "probe": "intervention", "post": "post", "delayed": "post"}
# 定位纪律（终审 §8-1）：固定说明字段，随 validity 块一起下发、不可关闭。
VALIDITY_NOTE = ("旧行为过程指数与效标的诊断性关联，不是能力效度或干预效果；"
                 "单班规模下这是估计不是检验：报点估计+CI，禁止只报显著性")


def _latest_criterion(sid: int, phase: str) -> dict:
    """该 phase 每个学生的最新一条效标。多工具并存（教师誊录 criterion-v1 与 probe 钩子的
    ct-v1-probe 可能同 phase 共存）时取 created_at 最大的 —— 与「誊分以最后一次录入为准」
    的覆盖语义同源。返回 {student_id: criterion_row}。"""
    best: dict = {}
    for r in S.list_criterion(sid, phase):
        cur = best.get(r["student_id"])
        if cur is None or (r.get("created_at") or 0) >= (cur.get("created_at") or 0):
            best[r["student_id"]] = r
    return best


def _validity(sid: int, drop: set) -> dict:
    """过程诊断指数与外部效标的关联；不能据此形成能力等级或干预有效结论。

    join ct_snapshots 的六维（经 ct.REPORT_FOLD 折叠成四要素，与 ct_report 同一真源）
    × ct_criterion 各 phase 的 total 与分维小计，输出
    {phase: {overall: {r, ci, n}, by_dim: {四要素: {r, ci, n}}}}。

    - 平台侧总量 = 四要素折叠的均值（六维公式与 FORMULA_VERSION 一个字不动，这里只做呈现层组合）；
    - 快照侧只取 has_real_data 的行（<3 条行为的六维分不是测量，进 r 只会灌噪声）；
    - n 逐项如实报；r 算不出（n<3 / 零方差）就写 null，不硬造；
    - drop = 分析集剔除（T0-2 无同意者），与报告其余统计同口径。
    """
    by_seg: dict = {}
    for x in S.snapshots(sid):
        if x["has_real_data"] and x["student_id"] not in drop:
            by_seg.setdefault(x["segment"], {})[x["student_id"]] = x

    def block(pairs: list) -> dict:
        xs = [a for a, _ in pairs]
        ys = [b for _, b in pairs]
        r = stats.pearson_r(xs, ys)
        return {"r": r, "ci": stats.fisher_ci(r, len(pairs)), "n": len(pairs)}

    dim_names = list(dict.fromkeys(REPORT_FOLD.values()))
    phases: dict = {}
    for phase in S.CRITERION_PHASES:
        crit = {u: r for u, r in _latest_criterion(sid, phase).items() if u not in drop}
        if not crit:
            continue                                   # 没录过效标的 phase 不出空块
        seg_snaps = by_seg.get(VALIDITY_SEG[phase], {})
        overall_pairs: list = []
        dim_pairs: dict = {name: [] for name in dim_names}
        for uid, row in crit.items():
            x = seg_snaps.get(uid)
            if not x:
                continue                               # 该期段无有效快照：整对不进，不硬配
            fold = ct_report(x["dims"])["report_dims"]
            overall_pairs.append((round(sum(fold.values()) / len(fold), 2), row["total"]))
            cdims = row.get("dims") or {}              # 分维只吃录入时打了标的行（None≠{}）
            for name in dim_names:
                if name in cdims:
                    dim_pairs[name].append((fold.get(name, 0), cdims[name]))
        phases[phase] = {"overall": block(overall_pairs),
                         "by_dim": {name: block(p) for name, p in dim_pairs.items()}}
    return {"note": VALIDITY_NOTE, "phases": phases}


def _attrition(sid: int, s: dict) -> dict:
    """CONSORT 式流失说明 —— 结题报告必须交代样本是怎么少下去的。"""
    out = {}
    for g in ("exp", "ctrl"):
        ms = S.members(sid, g)
        alive = [m for m in ms if not m["withdrawn_at"]]
        ids = {m["student_id"] for m in alive}
        pre = {r["student_id"] for r in S.responses(s["pre_assessment_id"])} if s["pre_assessment_id"] else set()
        post = {r["student_id"] for r in S.responses(s["post_assessment_id"])} if s["post_assessment_id"] else set()
        live_ok = store.consent_ok_map([m["student_id"] for m in alive])
        out[g] = {"assigned": len(ms), "withdrawn": len(ms) - len(alive),
                  # 实时同意数 —— 冻结列会把「发前测之后才开通」的全体记成 0
                  "consent_ok": sum(1 for ok in live_ok.values() if ok),
                  "pre_done": len(ids & pre), "post_done": len(ids & post),
                  "both": len(ids & pre & post)}
    # 流失者 vs 完成者的**前测均分对比**（终审 #6：最低限度敏感性检验）。
    # study 层自动算的 gain/d 默认是 complete-case —— 若流失者的前测起点系统性更低/更高，
    # 留下来的样本已被偏倚筛过，增值结论必须对着这两个数解读。只描述不检验（本平台不出 p 值）。
    # 无前测分的一侧记 None（缺测不填 0 —— 0 分和缺测在统计上完全是两回事）。
    pre_r = ({r["student_id"]: r["total"] for r in S.responses(s["pre_assessment_id"])}
             if s["pre_assessment_id"] else {})
    ms_all = S.members(sid)
    gone = [pre_r[m["student_id"]] for m in ms_all if m["withdrawn_at"] and m["student_id"] in pre_r]
    stay = [pre_r[m["student_id"]] for m in ms_all if not m["withdrawn_at"] and m["student_id"] in pre_r]
    out["pretest_comparison"] = {
        "withdrawn": {"n": len(gone), "mean": stats.mean(gone) if gone else None},
        "completed": {"n": len(stay), "mean": stats.mean(stay) if stay else None},
    }
    return out


# ============ 研究导出 ============
@router.get("/studies/{sid}/export")
def export_study(sid: int, format: str = "wide", include_no_consent: int = 0,
                 user: dict = Depends(current_user)):
    """课题宽表导出。默认为**分析集口径**（T0-2）：无有效监护人同意的学生整行不导出，
    剔除人数写进 meta.excluded_no_consent 与响应头 X-Excluded-No-Consent。
    include_no_consent=1 保留全量（誊录核对，行级 consent_ok 列标出非分析集行）。"""
    _teacher(user)
    if research.SALT_IS_EPHEMERAL:
        # 研究导出必然分多批（前测后一批、后测后一批）。盐不固定 → 假名不跨批稳定
        # → 前后测配不上 → 数据当场作废。这里必须 fail-closed，不能只写一行提示躺着。
        raise HTTPException(400, "未配置 JIEDUI_EXPORT_SALT 环境变量：假名不跨批次稳定，"
                                 "导出的数据无法与其他批次配对。请先配置固定盐并妥善保管。")
    s = S.get_study(sid)
    if not s:
        raise HTTPException(404, "课题不存在")

    snaps = {(x["segment"], x["student_id"]): x for x in S.snapshots(sid)}
    pre_r = {r["student_id"]: r for r in (S.responses(s["pre_assessment_id"]) if s["pre_assessment_id"] else [])}
    post_r = {r["student_id"]: r for r in (S.responses(s["post_assessment_id"]) if s["post_assessment_id"] else [])}
    # 效标总分并进宽表（终审 R+3 批次①）：脱敏导出与效标此前是互斥的两个子系统 ——
    # 高校导师拿到的宽表里没有效标列，分维 r 只能在平台内看、没法复算。
    # 多工具并存时取最新录入（与 _latest_criterion / 誊分覆盖语义同源）。
    crit_map: dict = {}
    for ph in S.CRITERION_PHASES:
        for uid, r in _latest_criterion(sid, ph).items():
            crit_map[(ph, uid)] = r

    rows = []
    members = S.members(sid)
    all_ok = store.consent_ok_map([m["student_id"] for m in members])
    if not include_no_consent:
        kept = [m for m in members if all_ok.get(m["student_id"])]
        excluded_no_consent = len(members) - len(kept)
        members = kept
    else:
        excluded_no_consent = 0
    for m in members:
        uid = m["student_id"]
        pre, post = pre_r.get(uid), post_r.get(uid)
        row = {
            "pid": _pid(uid), "cluster": _cid(m["cluster_class_id"]), "group": m["group_kind"],
            # 导出的是**实时**同意状态（研究伦理章节要报真实授权覆盖率，不是冻结时点的）
            "consent_ok": 1 if all_ok.get(uid) else 0, "withdrawn": 1 if m["withdrawn_at"] else 0,
            # 缺测一侧留空，**绝不填 0** —— 0 分和缺测在统计上完全是两回事，
            # 填 0 是最常见的伪结论来源。
            "pre_total": pre["total"] if pre else "",
            "post_total": post["total"] if post else "",
            "gain_total": round(post["total"] - pre["total"], 2) if (pre and post) else "",
            "pre_flags": "|".join(pre["flags"]) if pre else "",
            "post_flags": "|".join(post["flags"]) if post else "",
            # 时长双列（切分1）：client=前端自报（仅参考，可伪造）；server=服务端下发→提交时差
            # （too_fast 的判定依据）。缺测/无首开记录留空，绝不填 0。
            "pre_duration_client": pre["duration_sec"] if pre else "",
            "post_duration_client": post["duration_sec"] if post else "",
            "pre_duration_server": pre["duration_server"] if (pre and pre.get("duration_server") is not None) else "",
            "post_duration_server": post["duration_server"] if (post and post.get("duration_server") is not None) else "",
        }
        # 效标总分列（crit_pre/post/delayed/probe_total）：没录过的留空，绝不填 0 ——
        # 0 分和缺测在统计上完全是两回事（与 pre/post_total 的缺测纪律同一条）。
        for ph in S.CRITERION_PHASES:
            cr = crit_map.get((ph, uid))
            row[f"crit_{ph}_total"] = cr["total"] if cr else ""
        for d in DIMS:
            row[f"pre_{d}"] = pre["dim_scores"].get(d, "") if pre else ""
            row[f"post_{d}"] = post["dim_scores"].get(d, "") if post else ""
        for seg, pfx in (("baseline", "bl"), ("intervention", "iv"), ("post", "po")):
            x = snaps.get((seg, uid))
            for k in ("runs", "errors", "fixes", "ai_helps", "attempts", "successes"):
                row[f"{pfx}_{k}"] = (x["behavior"].get(k, "") if x else "")
            row[f"{pfx}_success_rate"] = x["success_rate"] if x else ""
            row[f"{pfx}_engaged_minutes"] = x["engaged_minutes"] if x else ""
            row[f"{pfx}_evidence"] = x["evidence_count"] if x else ""
            row[f"{pfx}_valid"] = x["has_real_data"] if x else ""
            row[f"{pfx}_sv_mixed"] = x["sv_mixed"] if x else ""
            if seg == "intervention":
                row["iv_socratic"] = x["socratic_during"] if x else ""
            for d in DIMS:
                row[f"diagnostic_{pfx}_{d}"] = (x["dims"].get(d, "") if x else "")
        row["diagnostic_profile"] = s["scoring_profile"]
        # 行级口径版本读**快照自带**的：recompute 会用当前公式重写 dims，课题注册值只代表
        # 立项时点 —— v2 立项、v3 重算后照抄注册值，等于给 v3 的数字贴 v2 的标签。
        # 各段版本可能不一致（end 于 v2、close 于 v3），如实并列，分析者自己决定能不能合并。
        vers = sorted({x["formula_version"] for x in
                       (snaps.get((seg, uid)) for seg in ("baseline", "intervention", "post"))
                       if x and x.get("formula_version")})
        row["diagnostic_formula_version"] = "|".join(vers) if vers else s["formula_version"]
        row["diagnostic_only"] = 1
        rows.append(row)

    meta = {
        "schema": "jiedui-study-export/v2",
        "study": {"title": s["title"], "assign_method": s["assign_method"],
                  "intervention_days": _days(s["started_at"], s["ended_at"]),
                  "diagnostic_profile": s["scoring_profile"],
                  "diagnostic_formula_version": s["formula_version"]},
        "diagnostic_only": True,
        "process_note": "diagnostic_* 字段仅用于过程诊断，不是能力等级或干预效果。",
        "anonymized": True,
        "deidentification": "学生ID与班级ID均 HMAC 假名化；不导出姓名、班名、测评作答原文与任何自由文本；"
                            "干预期转为相对天数；缺测留空不填 0",
        # T0-2 分析集口径：默认剔除无同意学生的整行，剔了几人如实报告
        "analysis_set": not include_no_consent,
        "excluded_no_consent": excluded_no_consent,
        "n": len(rows),
        "audit": S.study_log(sid),
    }
    ts = int(time.time())
    ex_headers = {"X-Excluded-No-Consent": str(excluded_no_consent)}
    if format == "json":
        return Response(content=json.dumps({**meta, "rows": rows}, ensure_ascii=False, indent=2),
                        media_type="application/json; charset=utf-8",
                        headers={"Content-Disposition": f"attachment; filename=study_{sid}_{ts}.json",
                                 **ex_headers})
    buf = io.StringIO()
    if rows:
        w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    return Response(content=buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f"attachment; filename=study_{sid}_{ts}.csv",
                             **ex_headers})


def _days(a, b) -> int:
    return round((b - a) / 86400) if (a and b) else 0


# ============ 测评卷管理（教师）============
@router.post("/assessments/{aid}/close")
def assessment_close(aid: int, user: dict = Depends(current_user)):
    """Explicit, irreversible whole-paper closure; creator only, not a student cancel."""
    return A.close_owned(aid, user)


class AssessmentIn(BaseModel):
    title: str = "计算思维测评"
    kind: str = "pre"
    blueprint_id: str = "ct-v1"
    items: list = []
    source: str = ""


@router.get("/assessments")
def assessments(user: dict = Depends(current_user)):
    _teacher(user)
    return {"items": [{k: v for k, v in a.items() if k != "items"} for a in S.list_assessments()]}


@router.post("/assessments")
def assessment_create(req: AssessmentIn, user: dict = Depends(current_user)):
    _teacher(user)
    # kind 四值约定（切分1）：pre/post/probe/delayed，单一真源在 store_study.ASSESSMENT_KINDS
    if req.kind not in S.ASSESSMENT_KINDS:
        raise HTTPException(400, f"kind 必须是 {'/'.join(S.ASSESSMENT_KINDS)} 之一")
    # 防止把"你最近有没有想不开"这类题写进给未成年人的问卷
    blob = "\n".join(str(it.get("stem", "")) + " " + " ".join(map(str, it.get("options", [])))
                     for it in req.items)
    g = guard.check_input(blob)
    if not g["allowed"]:
        raise HTTPException(400, f"题目内容未通过未成年人内容审核（{g['category']}），请修改后再保存")
    return {"id": S.create_assessment(user.get("sub", "anon"), req.model_dump())}


@router.delete("/studies/{sid}")
def study_delete(sid: int, user: dict = Depends(current_user)):
    _teacher(user)
    if not S.delete_study(sid):
        raise HTTPException(404, "课题不存在")
    return {"ok": True}


# ============ 外部效标（T0-1 不可逆项）============
class CriterionIn(BaseModel):
    student_id: str
    phase: str                              # pre | post | delayed | probe
    instrument: str = "criterion-v1"        # 效标工具名（效标题块/延迟测/无支架探针…）
    item_scores: list[float] = []
    total: float | None = None              # 不传则按 item_scores 求和
    # 可选：四要素分维小计（终审 #3）。键名与 ct_report 的 report_dims 一致
    # （问题分解/抽象建模/算法设计/调试评估）—— 分维 r 须录入时打标，事后补不回。
    dims: dict[str, float] | None = None


@router.post("/studies/{sid}/criterion")
def criterion_save(sid: int, req: CriterionIn, user: dict = Depends(current_user)):
    """教师录入外部效标分。重复录入同一 (student,phase,instrument) 按覆盖处理（誊分改错是常态）；
    dims 只在带值时覆盖 —— 只改总分的誊分不许把录入时打的分维标抹掉（store 层 COALESCE）。"""
    _teacher(user)
    if not S.get_study(sid):
        raise HTTPException(404, "课题不存在")
    if req.phase not in S.CRITERION_PHASES:
        raise HTTPException(400, f"phase 必须是 {'/'.join(S.CRITERION_PHASES)} 之一")
    uid = req.student_id.strip()
    if not uid:
        raise HTTPException(400, "student_id 不能为空")
    if req.dims:
        # 键名白名单 = REPORT_FOLD 的值域（四要素单一真源）。脏键一旦落库，
        # 分维 r 的归维就成了两可 —— 挡在入口，不让「问题分觧」这类笔误静默进库。
        allowed = set(REPORT_FOLD.values())
        bad = sorted(set(req.dims) - allowed)
        if bad:
            raise HTTPException(400, f"dims 的键必须是四要素口径（{'/'.join(dict.fromkeys(REPORT_FOLD.values()))}），"
                                     f"发现未知键：{'、'.join(bad)}")
    total = req.total if req.total is not None else round(sum(req.item_scores), 2)
    # 空 dict 视同「未带」：{} 走 None，不许把已打的分维标覆盖成空
    S.save_criterion(sid, uid, req.phase, req.instrument.strip() or "criterion-v1",
                     req.item_scores, total, req.dims or None)
    # 效标是主结局的一部分，录入/覆盖都要留痕 —— 报告要能回答「这个分是什么时候录的」
    S.log(sid, user.get("sub", ""), "criterion",
          f"{uid} {req.phase}/{req.instrument} total={total}" + ("（含分维）" if req.dims else ""))
    return {"ok": True, "total": total}


@router.get("/studies/{sid}/criterion")
def criterion_list(sid: int, phase: str = "", student_id: str = "",
                   include_no_consent: int = 0, user: dict = Depends(current_user)):
    """查询效标。**默认只返回有有效监护人同意的学生**（T0-2：无同意者不进研究分析集）——
    同意状态实时读；教师核对誊录时可传 include_no_consent=1 看全量（每行带 consent_ok 标记），
    但那是数据录入视图，不是分析集。"""
    _teacher(user)
    if not S.get_study(sid):
        raise HTTPException(404, "课题不存在")
    rows = S.list_criterion(sid, phase or None, student_id or None)
    ok = store.consent_ok_map([r["student_id"] for r in rows])
    for r in rows:
        r["consent_ok"] = bool(ok.get(r["student_id"]))
    if include_no_consent:
        return {"items": rows, "excluded_no_consent": 0, "analysis_set": False}
    kept = [r for r in rows if r["consent_ok"]]
    return {"items": kept, "excluded_no_consent": len(rows) - len(kept), "analysis_set": True}


# ============ 流失登记（终审 #6：流失分析基建）============
class WithdrawIn(BaseModel):
    student_id: str
    reason: str = ""                        # 转学 / 撤回同意 / 长期缺勤 / 其他（自由文本）


@router.post("/studies/{sid}/withdraw")
def study_withdraw(sid: int, req: WithdrawIn, user: dict = Depends(current_user)):
    """教师登记一名学生退出研究。19 篇文献零篇报流失分析，而 study 层自动算的 gain/d
    默认就是 complete-case —— 不记「谁、何时、为何流失」，平台等于把偏倚固化成默认行为。

    - **phase 自动记当前课题相位**：「什么时候流失的」是差异性流失分析的必需字段，事后回忆补不准；
    - **已退出者幂等**：不覆盖首笔的时间戳/原因（那是流失审计凭证），重复登记返回 already=true；
    - 只标记不删行（CONSORT 式交代样本怎么少下去），退出者此前的作答仍留在库里，
      报告/导出按既有口径处理（withdrawn 行不进统计但进流失表）。
    """
    _teacher(user)
    s = S.get_study(sid)
    if not s:
        raise HTTPException(404, "课题不存在")
    uid = req.student_id.strip()
    if not uid:
        raise HTTPException(400, "student_id 不能为空")
    if not any(m["student_id"] == uid for m in S.members(sid)):
        # draft 期名单尚未冻结（下发前测才建）：那时的「退出」应该直接改班级名册，不在这里记
        raise HTTPException(404, "该学生不在课题名单里（名单在下发前测时冻结）")
    reason = req.reason.strip()[:200]
    if S.withdraw_member(sid, uid, reason, s["phase"]):
        # 流失是必须写进报告的研究事件，落课题日志（论文「研究实施过程」的原始材料）
        S.log(sid, user.get("sub", ""), "withdraw",
              f"{uid} phase={s['phase']} reason={reason or '-'}")
        return {"ok": True, "already": False, "phase": s["phase"]}
    return {"ok": True, "already": True}
