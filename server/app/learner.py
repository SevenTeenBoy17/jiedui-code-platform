"""
学习者状态 API（第三波总审 T1-6 / T1-12）：跨会话画像、教学轮、结对互动占比。

三条边界：
1. **learner_state 是策略层的输入，不是评价**：教师可读写，学生只读自己的（不给学生看别人的
   档位/卡点 —— 那是给同学贴标签）。
2. **教学轮与课题状态机正交**（见 store_learner 模块注释）：开轮/结轮只由教师操作。
3. **互动占比是对抗性指标**：分子分母都只来自轮次计数（chat_log 元数据 + ai_help 事件数），
   不引入任何六维分 —— 它存在的意义就是能证伪「支架来源迁移」，不能又被待验证测量污染。
"""
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import store
from app import store_learner as L
from app.auth import current_user
from app.ct import summary_for

router = APIRouter(prefix="/api/learner", tags=["学习者状态"])


def _teacher(user: dict):
    if user.get("role") not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师权限")


# ============ learner_state ============
class StatePatch(BaseModel):
    scaffold_level: int | None = None      # 0-3（对应 ai.py 的 SCAFFOLD 档位）
    round_index: int | None = None         # 1-3（教学轮）
    fallback_count: int | None = None
    mastery_snapshot: dict | None = None
    stuck_points: list | None = None
    # ↓ 两个**留痕元字段**（终审 #4），不写进 learner_state 本体：
    # suggestion_id：本次改档若是采纳某条策略建议，带上其 id → scaffold_log.source='teacher_accept'，
    # 采纳链可经 suggestion_id join 回 policy_suggestion；不带则视为教师手动改档（source='teacher'）。
    # room_id：改档发生的结对房间（可空）；有进行中的教学轮时流水一并盖轮号。
    suggestion_id: int | None = None
    room_id: str | None = None


# StatePatch 里不属于 learner_state 本体的留痕元字段（写 scaffold_log 用，绝不进画像表）
_STATE_META_KEYS = ("suggestion_id", "room_id")


@router.get("/state/{student_id}")
def state_get(student_id: str, user: dict = Depends(current_user)):
    """教师可看任一学生；学生只能看自己（别人的档位/卡点对同学就是标签）。"""
    if user.get("role") not in ("teacher", "researcher") and user.get("sub") != student_id:
        raise HTTPException(403, "只能查看自己的学习状态")
    return L.get_state(student_id)


@router.put("/state/{student_id}")
def state_put(student_id: str, req: StatePatch, user: dict = Depends(current_user)):
    """教师写画像（策略层将来也走这条 upsert）。范围校验挡在入口：
    档位 0-3 / 轮次 1-3 是全系统共同语言，脏值一旦落库会被策略层当真。

    改档留痕（终审 #4）：scaffold_level **真实变化**时追写一行 scaffold_log ——
    带 suggestion_id 记 source='teacher_accept'（采纳建议），否则 source='teacher'（手动）。
    同档重写不算改档、不落流水（幂等重放不该刷出假干预记录）。"""
    _teacher(user)
    patch = {k: v for k, v in req.model_dump().items()
             if v is not None and k not in _STATE_META_KEYS}
    if not patch:
        raise HTTPException(400, "没有要更新的字段")
    if "scaffold_level" in patch and patch["scaffold_level"] not in (0, 1, 2, 3):
        raise HTTPException(400, "scaffold_level 必须在 0-3 之间")
    if "round_index" in patch and patch["round_index"] not in (1, 2, 3):
        raise HTTPException(400, "round_index 必须在 1-3 之间")
    if "fallback_count" in patch and patch["fallback_count"] < 0:
        raise HTTPException(400, "fallback_count 不能为负数")
    prev_level = L.get_state(student_id)["scaffold_level"]
    out = L.upsert_state(student_id, patch)
    if "scaffold_level" in patch and patch["scaffold_level"] != prev_level:
        room = (req.room_id or "").strip()[:64] or None
        L.add_scaffold_log(
            student_id, prev_level, patch["scaffold_level"],
            source="teacher_accept" if req.suggestion_id else "teacher",
            suggestion_id=req.suggestion_id,
            round_index=L.active_round_index(room) if room else None,
            room_id=room)
    return out


# ============ 教学轮 ============
class RoundOpenIn(BaseModel):
    room_id: str
    round_index: int
    label: str = ""


class RoundExitIn(BaseModel):
    exit_task_passed: bool | None = None   # None=未做出口任务；与 False（做了没过）是两回事


@router.post("/rounds/open")
def round_open(req: RoundOpenIn, user: dict = Depends(current_user)):
    _teacher(user)
    room = req.room_id.strip()[:64]
    if not room:
        raise HTTPException(400, "room_id 不能为空")
    if req.round_index not in (1, 2, 3):
        raise HTTPException(400, "round_index 必须在 1-3 之间（R1能跑/R2跑对/R3跑好）")
    rid = L.open_round(room, req.round_index, req.label.strip()[:40])
    if rid is None:
        raise HTTPException(409, "该房间已有进行中的教学轮，请先结束它")
    return {"id": rid, "round": L.active_round(room)}


def _freeze_round_snapshot(rid: int) -> int:
    """结轮钩子：冻结该轮窗口的行为过程诊断指数，供教师回放过程变化。

    这些指数不能形成能力等级或“第 2 轮能力优于第 1 轮”的结论；正式画像只能读取
    TaskAttempt/Evidence/Inference 合同中带量规、原件和教师确认的推断。

    - 窗口口径左闭右开，与 ct_counts / peer_turns 的既有约定一致（summary_for 原生支持）；
    - profile='neutral'（红线：研究口径不含 ai_helps 那条自变量直通因变量的通路）；
    - 参与者 = 窗口内在该房产生过 ct_events 的学生（挂机旁观不冻出全 0 行）；
    - 六维公式与 FORMULA_VERSION 一个字不动 —— 这里只是按既有公式在轮窗口上取值。
    """
    r = L.get_round(rid)
    if not r or not r.get("exited_at"):
        return 0
    t0, t1 = r["started_at"], r["exited_at"]
    n = 0
    for uid in store.ct_room_participants(r["room_id"], t0, t1):
        cs = summary_for(uid, since=t0, until=t1, profile="neutral")
        refs = [
            {"source_id": e["source_id"], "source_version": e["source_version"]}
            for e in store.ct_event_rows(uid, t0, t1)
            if e.get("room_id") == r["room_id"]
        ]
        diagnostic = {
            "diagnostic_only": True,
            "window": {"since": t0, "until": t1},
            "counts": {k: cs[k] for k in ("runs", "errors", "fixes", "ai_helps",
                                            "role_switches", "designs", "attempts", "successes")},
            "success_rate": cs["success_rate"],
            "engaged_minutes": cs["minutes"],
            "source_refs": refs,
        }
        L.save_round_diagnostic(rid, uid, diagnostic, len(refs))
        n += 1
    return n


@router.post("/rounds/{rid}/exit")
def round_exit(rid: int, req: RoundExitIn, user: dict = Depends(current_user)):
    _teacher(user)
    if not L.exit_round(rid, req.exit_task_passed):
        raise HTTPException(404, "教学轮不存在或已结束")
    # 冻结失败不反悔结轮：exit_round 已提交（重试会 404），快照是增益件，异常不卡教学。
    try:
        frozen = _freeze_round_snapshot(rid)
    except Exception:                                   # noqa: BLE001
        frozen = 0
    return {"ok": True, "snapshot_count": frozen}


@router.get("/rounds/{rid}/snapshot")
def round_snapshot_get(rid: int, user: dict = Depends(current_user)):
    """轮级过程快照（仅教师/研究员），明确标记为诊断上下文。"""
    _teacher(user)
    r = L.get_round(rid)
    if not r:
        raise HTTPException(404, "教学轮不存在")
    items = []
    for raw in L.round_snapshots(rid):
        item = dict(raw)
        # 两个旧列必须无条件弹出；用 `a or pop(b)` 会在 a 非空时短路，导致 b 泄漏。
        legacy_dims = item.pop("dims", {}) or {}
        legacy_report_dims = item.pop("report_dims", {}) or {}
        legacy = bool(legacy_dims or legacy_report_dims)
        item["diagnostic"] = item.get("diagnostic") or {}
        item["diagnostic_only"] = True
        if legacy and not item["diagnostic"]:
            item["legacy_snapshot_hidden"] = True
            item["note"] = "旧版行为评分已停止公开；请查看原始事件或新证据合同。"
        items.append(item)
    return {"round_id": rid, "room_id": r["room_id"], "round_index": r["round_index"],
            "exited": bool(r.get("exited_at")), "diagnostic_only": True, "items": items}


@router.get("/rounds")
def rounds(room_id: str = "", user: dict = Depends(current_user)):
    _teacher(user)
    return {"items": L.list_rounds(room_id or None)}


# ============ 结对聊天元数据（互动占比的分母之一）============
class ChatTurnIn(BaseModel):
    room_id: str
    role: str = ""                          # driver | observer


@router.post("/chat/turn")
def chat_turn(req: ChatTurnIn, user: dict = Depends(current_user)):
    """记一次生生对话轮次。**只落元数据，不收也不存消息原文**（未成年人平台不新增 PII 面）。
    发言人从令牌取 —— 学生伪造不了别人的轮次。当前结对聊天在前端/协作层，
    server/app 尚无 websocket 通道；协作层落地后由其 chat 消息处调本端点（或直接调
    store_learner.add_chat_turn）即可，指标口径不变。"""
    room = req.room_id.strip()[:64]
    if not room:
        raise HTTPException(400, "room_id 不能为空")
    role = req.role if req.role in ("driver", "observer") else ""
    L.add_chat_turn(room, user.get("sub", "anon"), role)
    return {"ok": True}


@router.get("/interaction")
def interaction(student_id: str = "", room_id: str = "",
                since: int | None = None, until: int | None = None,
                user: dict = Depends(current_user)):
    """人际互动占比（T1-12 对抗性指标）：peer/(peer+ai)，分母为 0 时 ratio=null。

    - 按学生：peer=其 chat_log 轮次，ai=其 ai_help 事件数（含全部语义版本）。
    - 按房间：peer=房内全部轮次，ai=房内**出现过的发言人**的 ai_help 合计
      （AI 对话暂无 room 维度，这是当前能做到的最诚实口径，宁可如实近似不硬编窗口）。
    - since/until（epoch 秒，可选）：时间窗 **[since, until) 左闭右开**，分子分母同窗过滤
      （R+2 的期段互动对比提前把口径钉死 —— 分子一个窗、分母另一个窗的占比是假的）。
    """
    _teacher(user)
    if not student_id and not room_id:
        raise HTTPException(400, "student_id 与 room_id 至少给一个")

    def _ai_turns(uid: str) -> int:
        # ct_counts 的 since/until 本就是 [since, until)，与 peer_turns 同一窗口约定
        return sum(c.get("ai_help", 0) for c in store.ct_counts(uid, since, until).values())

    if student_id:
        peer = L.peer_turns(student_id=student_id, since=since, until=until)
        ai = _ai_turns(student_id)
        # 诚实标志（终审 R+3 批次③，断点1「接通前」半步）：该学生名下 chat_log **一条都没有**
        # ＝聊天通道尚未接进来（协作层还没调 chat/turn），不是「他从不与人互动」——
        # 判定用全量不带窗（通道接没接通是布尔事实，与查询窗口无关）。
        available = L.peer_turns(student_id=student_id) > 0
        scope = {"student_id": student_id}
    else:
        peer = L.peer_turns(room_id=room_id, since=since, until=until)
        ai = sum(_ai_turns(u) for u in L.room_participants(room_id))
        available = L.peer_turns(room_id=room_id) > 0
        scope = {"room_id": room_id}
    denom = peer + ai
    # 通道未接通时 ratio 强制 null：0/(0+ai)=0.0 长得像「从不与人互动」，
    # 实际只是没接线 —— 假 0 会被当成「支架来源迁移失败」的证据写进报告。
    out = {**scope, "since": since, "until": until,
           "peer_turns": peer, "ai_turns": ai,
           "chat_channel_available": available,
           "ratio": round(peer / denom, 3) if (available and denom) else None}
    if not available:
        out["note"] = "聊天通道未接通，peer_turns 不可解释为 0"
    return out


# ============ cog_load 认知负荷自评（终审 #7 / T1-15）============
# 「支架递减而表现不塌」有两个机制：真内化 vs 高负荷硬扛（随后放弃/复制粘贴）——
# 不测负荷就无法排除最强竞争解释。Paas 式单题 9 点自评，**学生本人自报**（身份从令牌取，
# 伪造不了别人的负荷分）；提示文案由前端管，后端只收分。
# 不复用 ct_criterion（唯一键每 phase 一行且写入方相反：criterion 教师誊录/负荷学生自报）。


class CogLoadIn(BaseModel):
    score: int                              # 1-9（Paas 式单题：刚才这段学习你觉得费不费劲）
    room_id: str | None = None              # 可选：留痕自评发生的结对房间
    round_index: int | None = None          # 可选：挂在哪一轮的轮末（1-3；轮外自评为 NULL）


@router.post("/cogload")
def cogload_submit(req: CogLoadIn, user: dict = Depends(current_user)):
    """学生自报认知负荷。CONSENT_REQUIRED 门禁不豁免（负荷自评同样在收集未成年人数据，
    门禁不能只设在 /api/ai/chat 与测评上）；同一学生同一轮重复提交**覆盖式**
    （轮末点错再点是常态，以最后一次为准）。响应只有中性完成态。"""
    uid = user.get("sub", "anon")
    if not store.has_consent(uid):
        raise HTTPException(403, "CONSENT_REQUIRED")
    if not isinstance(req.score, int) or not (1 <= req.score <= 9):
        raise HTTPException(400, "score 必须是 1-9 的整数（Paas 式单题自评）")
    if req.round_index is not None and req.round_index not in (1, 2, 3):
        raise HTTPException(400, "round_index 必须在 1-3 之间")
    room = (req.room_id or "").strip()[:64] or None
    L.save_cog_load(uid, req.score, room, req.round_index)
    return {"ok": True}


@router.get("/cogload")
def cogload_list(student_id: str = "", user: dict = Depends(current_user)):
    """教师读某学生的负荷自评序列（渐退成功三条件合取的第三条腿：档位降∧probe 不降∧负荷不升）。
    学生 403 —— 同 /state 的边界：负荷分对同学也是标签，且本人已经知道自己填了什么。"""
    _teacher(user)
    sid = student_id.strip()
    if not sid:
        raise HTTPException(400, "student_id 不能为空")
    return {"items": L.list_cog_load(sid)}


# ============ 服务端支架策略 v1（建议性，不夺权）============
# 【硬约束·scaffold_policy v1】本节只读 ct_events 的**原始信号**（事件类型/时间戳/报错文本前缀），
# 一律不得引用 ct.py 的六维评分 —— 六维是未经效标验证的测量，拿它驱动真实干预会形成
# 「未验证测量 ↔ 干预」的自反循环（法源：ai.py SCAFFOLD 上方的 scaffold_policy v1 注释，T1-6）。
# test_learner 用 inspect.getsource 钉死本节函数源码不出现六维评分的引用。
# 建议只回给教师/本人看，**不写库** —— 改档仍走 PUT /state/{student_id}（教师确认制）。

FAIL_WINDOW_SEC = 30 * 60      # 连败观察窗：最近 30 分钟
IDLE_MINUTES = 20              # 无任何事件（无代码增量的代理）达到该分钟数 → 提示教师关注
REPEAT_LAST_ERRORS = 10        # 同类错误聚类只看最近这么多条 error
REPEAT_PREFIX_LEN = 24         # 报错文本的前缀聚类长度（与错题本的归集粒度同源）
CONSEC_FAILS_UP = 3            # 连败 ≥3 → 建议升一档
REPEAT_UP = 3                  # 同类错误 ≥3 → 建议升一档
CONSEC_SUCC_DOWN = 5           # 连续成功 ≥5 → 建议降一档（渐退方向）


def _policy_signals(student_id: str, now: int | None = None) -> dict:
    """从 ct_events 原始事件流提取可审计信号：只数事件，不打分。

    sv=2 语义下失败 = 相邻的 run+error 两条、报错后改对 = run+fix 两条，
    倒着扫时失败的 run 永远先撞上它自己的 error，不会被误计成成功。
    """
    now = now or int(time.time())
    evs = store.ct_events(student_id, 300)          # 时间正序；300 条足够覆盖观察窗
    # ① 连续运行失败：观察窗内从最新往回数 error，遇到成功（裸 run 或 fix）即停
    win = [e for e in evs if now - e["ts"] <= FAIL_WINDOW_SEC and e["type"] in ("run", "error", "fix")]
    fails = 0
    i = len(win) - 1
    while i >= 0:
        if win[i]["type"] != "error":
            break                                   # 成功运行 / 修好 → 连败终止
        fails += 1
        if i > 0 and win[i - 1]["type"] == "run":
            i -= 1                                  # 跳过这次失败运行配对的 run 事件
        i -= 1
    # ② 同类错误重复：最近 N 条 error 的报错文本按前缀聚类（与 /mistakes 的归集口径同源）
    errs = [e for e in evs if e["type"] == "error"][-REPEAT_LAST_ERRORS:]
    clusters: dict[str, int] = {}
    for e in errs:
        key = (e["detail"] or "运行出错").replace("运行出错：", "").strip()[:REPEAT_PREFIX_LEN] or "运行出错"
        clusters[key] = clusters.get(key, 0) + 1
    top_prefix, top_count = max(clusters.items(), key=lambda kv: kv[1]) if clusters else ("", 0)
    # ③ 空窗：最近一条事件距今的分钟数（从未有事件 → None，「没来过」≠「卡住了」）
    idle_minutes = round((now - evs[-1]["ts"]) / 60) if evs else None
    # ④ 连续成功：从最新往回数成功 run，遇到 error 即停（渐退方向的证据）
    succ = 0
    for e in reversed(evs):
        if e["type"] == "error":
            break
        if e["type"] == "run":
            succ += 1
    return {
        "window_sec": FAIL_WINDOW_SEC,
        "events_total": len(evs),
        "consecutive_failures": fails,
        "recent_errors_clustered": len(errs),
        "repeated_error_count": top_count,
        "repeated_error_prefix": top_prefix,
        "idle_minutes": idle_minutes,
        "had_activity": bool(evs),
        "consecutive_successes": succ,
    }


def suggest_scaffold(signals: dict) -> dict:
    """纯函数：原始信号 → 建议档位与理由（可审计：每条理由对应一条规则，规则只吃计数）。

    优先级：升档信号（挣扎的证据）> 空窗（保持并请教师现场关注）> 渐退降档。
    空窗时不降档 —— 学生离开了不是学生学会了。返回 {level, reasons, attention}。
    """
    cur = signals.get("current_level", 3)
    reasons: list[str] = []
    attention = False
    up = down = False
    if signals.get("consecutive_failures", 0) >= CONSEC_FAILS_UP:
        up = True
        reasons.append(f"最近 30 分钟内连续 {signals['consecutive_failures']} 次运行失败"
                       f"（其间无一次成功）→ 建议升一档")
    if signals.get("repeated_error_count", 0) >= REPEAT_UP:
        up = True
        pfx = (signals.get("repeated_error_prefix") or "")[:REPEAT_PREFIX_LEN]
        reasons.append(f"最近 {signals.get('recent_errors_clustered', 0)} 条报错中同类错误出现 "
                       f"{signals['repeated_error_count']} 次（{pfx}…）→ 建议升一档")
    idle = signals.get("idle_minutes")
    if signals.get("had_activity") and idle is not None and idle >= IDLE_MINUTES:
        attention = True
        reasons.append(f"最近 {idle} 分钟无任何事件（无代码增量的代理信号）且此前有活动"
                       f"→ 建议保持当前档位，请教师现场关注")
    if not up and not attention and signals.get("consecutive_successes", 0) >= CONSEC_SUCC_DOWN:
        down = True
        reasons.append(f"连续 {signals['consecutive_successes']} 次运行成功且无报错"
                       f"→ 建议降一档（渐退方向）")
    if up:
        level = min(3, cur + 1)
    elif down:
        level = max(0, cur - 1)
    else:
        level = cur
    if not reasons:
        reasons.append("信号不足：维持当前档位")
    return {"level": level, "reasons": reasons, "attention": attention}


@router.get("/policy/{student_id}")
def policy(student_id: str, user: dict = Depends(current_user)):
    """支架档位建议（v1）。**只建议不写库**：教师看到理由后确认，写档仍走 PUT /state。
    （红线只约束档位：learner_state 纹丝不动；建议本身落一行 policy_suggestion 审计痕迹 ——
    终审 #4「现算改算完留痕」，采纳/驳回链才能经 suggestion_id 回溯。）

    教师可看任一学生；学生只能看自己的（同 /state 的边界：别人的档位建议也是标签）。
    current_level 读 learner_state（没写过按缺省满档），suggested_level 由原始信号推出。
    """
    if user.get("role") not in ("teacher", "researcher") and user.get("sub") != student_id:
        raise HTTPException(403, "只能查看自己的支架建议")
    cur = L.get_state(student_id)["scaffold_level"]
    signals = _policy_signals(student_id)
    sug = suggest_scaffold({**signals, "current_level": cur})
    sug_id = L.add_policy_suggestion(student_id, cur, sug["level"], sug["attention"],
                                     sug["reasons"], user.get("sub", ""))
    return {"student_id": student_id, "current_level": cur,
            "suggested_level": sug["level"], "attention": sug["attention"],
            "reasons": sug["reasons"], "signals": signals,
            "suggestion_id": sug_id}


class DismissIn(BaseModel):
    suggestion_id: int


@router.post("/policy/{student_id}/dismiss")
def policy_dismiss(student_id: str, req: DismissIn, user: dict = Depends(current_user)):
    """教师驳回一条策略建议（终审 #4）。落一行 scaffold_log：level 不变、source='dismissed' ——
    「看过并且决定不改」也是一次干预决策，必须留痕；不落痕的话，同一条升档建议
    反复弹给教师与教师已明确驳回，在数据上无法区分。learner_state 不动。"""
    _teacher(user)
    sug = L.get_policy_suggestion(req.suggestion_id)
    if not sug or sug["student_id"] != student_id:
        raise HTTPException(404, "建议不存在")
    cur = L.get_state(student_id)["scaffold_level"]
    lid = L.add_scaffold_log(student_id, cur, cur, source="dismissed",
                             suggestion_id=req.suggestion_id)
    return {"ok": True, "log_id": lid}


# ============ goal_anchor 目标锚点（T1-11 最小闭环）============
# 锚点是教师为本题预设的**关键决策点描述**（如「需要一个循环直到猜对」），不是代码。
# 它只作为 navigator（ai.py reviewer persona）校准提问方向的内部参照。
# **学生不可读，含自己房间的**：锚点直接标出了解题的关键转折，学生看到等于泄答案方向 ——
# 与 learner_state 的「学生只读自己的」不同，这里对学生全线 403。
class AnchorIn(BaseModel):
    room_id: str
    anchor: str


@router.post("/anchors")
def anchor_add(req: AnchorIn, user: dict = Depends(current_user)):
    _teacher(user)
    room = req.room_id.strip()[:64]
    anchor = req.anchor.strip()[:200]      # 决策点描述一句话就够；长文/代码不该进锚点
    if not room:
        raise HTTPException(400, "room_id 不能为空")
    if not anchor:
        raise HTTPException(400, "anchor 不能为空")
    aid = L.add_anchor(room, anchor, user.get("sub", ""))
    return {"id": aid, "room_id": room, "anchor": anchor}


@router.get("/anchors")
def anchor_list(room_id: str = "", user: dict = Depends(current_user)):
    _teacher(user)                          # 学生 403：锚点可见即泄答案方向
    room = room_id.strip()[:64]
    if not room:
        raise HTTPException(400, "room_id 不能为空")
    return {"items": L.list_anchors(room)}


@router.delete("/anchors/{aid}")
def anchor_delete(aid: int, user: dict = Depends(current_user)):
    _teacher(user)
    if not L.delete_anchor(aid):
        raise HTTPException(404, "锚点不存在")
    return {"ok": True}
