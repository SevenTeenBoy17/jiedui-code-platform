"""
计算思维过程评价（S3 §4.6）。行为事件采集 + 六维规则聚合 + 路径/时间线 + 数字画像数据。
六维：抽象 abstract / 分解 decompose / 建模 model / 算法设计 algorithm / 验证与优化 verify / 迁移 transfer。
LLM 标注通道（更精细）留后续；当前为规则启发式（可审计、零成本）。
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app import store
from app import store_learner
from app.auth import current_user

router = APIRouter(prefix="/api/ct", tags=["计算思维"])

KEY = {"run", "error", "fix", "ai_help", "role_switch", "design_create", "save"}
# ↑ save 是前端 IdeView 一直在发、白名单一直在丢的类型（发了拿到 ok，但 0 行落库）——
#   典型的「写路径断线」：看起来在采集，其实没有。它不进六维公式（公式按名字取
#   run/error/fix/design_create/ai_help/role_switch，加它是惰性的，不动 FORMULA_VERSION），
#   只进教师端时间线与 ProgSnap2 导出。**但它不进参与者口径**，见 store.PARTICIPATION_TYPES：
#   只保存过一次的学生不该被冻结出一行全 0 的六维快照。
# ↑ 白名单**刻意不收 hop**：hop（navigator 追问跳数，T1-11）只能由服务端 ai.py 落库，
#   学生 POST 进不来 —— 它是渐退度量的原始信号（hops 历时下降=渐退在发生），
#   六维公式也**不消费**它（消费=动公式=升 FORMULA_VERSION，红线）。


class EventReq(BaseModel):
    type: str
    detail: str | None = None
    projectId: int | None = None
    roomId: str | None = None      # 结对房间号：有进行中的教学轮时给事件盖轮号（T1-6）
    # role_switch 专属语义（终审 R+3 批次④）：forced=强制轮换 / negotiated=学生协商轮换。
    # 落独立列 ct_events.switch_reason（不污染 detail 自由文本）；白名单外取值静默置空。
    # 六维公式**不消费**该字段 —— 它是轮换机制分析的数据源（Zhong et al. 2017：
    # 半自由协商最优的检验），消费=动公式=升 FORMULA_VERSION（红线）。
    reason: str = ""
    # 创作情境协变量（见 store.init() 的加列注释）：design_create 只在 python+block 下才可能
    # 触发，故「没建模」与「在代码模式下做了但测不到」在现有数据里不可分。这两个字段是把它分开
    # 的唯一办法，且**必须在真实采集开始前就位** —— 事后无法回填。白名单外取值静默置空。
    lang: str = ""          # python | cpp | c
    editMode: str = ""      # block | code


LANGS = ("python", "cpp", "c")
EDIT_MODES = ("block", "code")


@router.post("/events")
def add_event(req: EventReq, user: dict = Depends(current_user)):
    """埋点入口只收**白名单**类型。此前任意字符串都进 ct_events：学生可直接 POST
    伪造 task_done 之类服务端专属事件，或塞垃圾类型污染研究数据流。
    白名单外静默丢弃（返回 ok）：埋点是锦上添花，报错会打断学习，但**不落库**。"""
    if req.type in KEY:
        # 该 room 有进行中的 learning_round 就带上轮号；没有就 NULL（轮外事件不硬归轮）。
        # room_id 同步落库（终审 #3）：轮号只答「第几轮」，房间维度才能把同一学生
        # 跨房间的行为流切开 —— 无房间的事件 room_id 为 NULL（真值，不是缺数据）。
        room = (req.roomId or "").strip()[:64] or None
        ri = store_learner.active_round_index(room) if room else None
        # 轮换语义只在 role_switch 上有意义；白名单外的取值静默置空（与埋点入口的容错纪律一致）
        reason = req.reason if (req.type == "role_switch"
                                and req.reason in ("forced", "negotiated")) else None
        # 情境协变量同样白名单校验：脏值置 NULL 而不是原样落库 —— 分析期按值分组时，
        # 一个拼错的 "Python" 会安静地分出第三组。
        lang = req.lang if req.lang in LANGS else None
        mode = req.editMode if req.editMode in EDIT_MODES else None
        store.add_ct_event(user.get("sub", "anon"), req.type, req.detail, req.projectId,
                           round_index=ri, room_id=room, switch_reason=reason,
                           lang=lang, edit_mode=mode)
    return {"ok": True}


# 投入时长的实现移到 store.ct_gap_minutes（走 SQL 取全部时间戳，不受"最近 500 条"上限影响）。
# 口径：相邻事件间隔累加，单段超过 10 分钟按"离开了又回来"不计。
# 曾经直接用 `(最后一条 - 第一条)/60`，学生第一次用是上个月，界面就显示「48883 分钟」。


def _attempts_and_successes(by_sv: dict) -> tuple[int, int, int, int, int]:
    """把两套埋点语义各自还原成「尝试次数 / 成功次数」，再相加。

    sv=1（旧）：成功且此前报过错只记 fix 不记 run → 尝试 = run+fix+error，成功 = run+fix。
    sv=2（现）：每次运行都记 run，失败补 error         → 尝试 = run，成功 = run-error。
    不分版本直接 `run - error` 会让跨学期数据不可比：旧数据 runs 被系统性低估、
    成功率被压到 0%，于是「干预后算法维上升」会被旧数据人为放大。
    """
    attempts = successes = runs = errors = fixes = 0
    for sv, c in by_sv.items():
        r, e, f = c.get("run", 0), c.get("error", 0), c.get("fix", 0)
        runs, errors, fixes = runs + r, errors + e, fixes + f
        if sv <= 1:
            attempts += r + f + e
            successes += r + f
        else:
            attempts += r
            successes += max(0, r - e)
    return attempts, successes, runs, errors, fixes


# 口径版本史（跨版本数据一律不可直接比较，版本随快照/导出一起带出去）：
# v2（2026-07-27）：`design_create` 的来源从「打开过设计面板」改为「积木模式首次拼出 ≥3 块」。
# v3（2026-07-28）：线性累计 + 封顶 → **质量率 × 饱和量**。
#   v2 的六维全是行为累计次数的线性函数再 clamp 到 100，到顶阈值极低（verify 修 6 次、
#   abstract/model 跑 35~38 次、algorithm 成功 15 次）。一轮 6 周干预（人均 ~80 次行为）
#   实测 20 名学生里 4/6 个维度只剩一个取值 100：组间差恒 0、方差为 0，
#   报告却把它们当「机制解释」呈现 —— 演示数据（人均 ~30 次）撞不到顶，所以这一点
#   只有把整条链走完才看得见。v3 改用两类**天然有界**的信号：
#     质量率  fix_rate = fixes/errors、success_rate = successes/attempts ∈ [0,1]
#     饱和量  sat(x,k) = x/(x+k) ∈ [0,1)，x=k 时得 0.5，严格递增、永不到顶
#   分数 = round(100 × 加权和)：任何用量下都保留区分度，且「刷量」的边际收益递减 ——
#   这也顺带削弱了刷行为换分的动机（红线一的第二道防线）。
# v4（2026-08-18，决策 D3 拍板执行）：`design_create` 新增**伪代码通道**来源（IDE 设计
#   抽屉保存 ≥3 行伪代码，任何语言/任何编辑模式可用）。公式数学一个字未动，但事件的
#   触发集扩了 —— 此前 design_create 只在「Python 且积木模式」可触发（IdeView 的 v-if），
#   而它扛着 model 维 70%/decompose 25%/abstract(研究口径) 30%：写文本 Python 或 C++ 的
#   学生 model 被钉死在 0.3·sat(runs,40)，该维有相当部分在测「你选了哪个编辑器」。
#   触发口径变更按 v1→v2 先例强制升位；跨版本 design 计数不可直接比较。
FORMULA_VERSION = "ct-rules/v4"


def _sat(x: float, k: float) -> float:
    """饱和量 x/(x+k)：k 是**半分点**（做到 k 次拿到一半的量分）。严格递增、趋近 1 不达到。"""
    return x / (x + k) if x > 0 else 0.0


def _safe_detail(e: dict) -> str:
    """出参口径：ai_help 的 detail 存的是**学生对 AI 说的话前 40 字**（已过 guard.anonymize 脱敏，
    但脱敏≠不是内容）。path/timeline 原样带出去，等于把学生话语摊到教师端出参上 ——
    与「结对聊天只存元数据、不开语义采集面」的既定口径自相矛盾（外部调研 R2 的 P0-B）。

    这里只在**出参**上收口：保留角色前缀与长度分箱（教师判断「谁在求助、问得长不长」够用），
    原文仍留库内、仅经研究导出通道（同意门 + 脱敏 + 去标识）读取。库表不动，历史数据不受影响。
    """
    d = e.get("detail") or ""
    if e.get("type") != "ai_help":
        return d
    role = d[1:d.index("]")] if d.startswith("[") and "]" in d else ""
    body = d[d.index("]") + 1:].strip() if "]" in d else d
    n = len(body)
    bucket = "短" if n <= 10 else ("中" if n <= 25 else "长")
    return f"[{role}] 求助（{bucket}）" if role else f"求助（{bucket}）"


# 报告层口径版本（T1-7）。与 FORMULA_VERSION 是两层：FORMULA_VERSION 管六维怎么算（内部），
# REPORT_VERSION 管六维怎么**呈现**（对外折叠成四维）。改呈现只动这里，绝不动六维公式。
REPORT_VERSION = "report/v1"

# 六维 → 四要素的折叠映射（**单一真源**，终审 R+1）：ct_report 的呈现层与 criterion 的
# 分维小计（study.py probe 钩子 / 教师录入校验）共用此表 —— 两处各写一份必然漂移，
# 漂移的后果是分维 r 的分子分母各按各的口径归维。
# **transfer 刻意不在表中** = 不进任何四要素口径（迁移在实时行为侧没有可辩护的测量）。
REPORT_FOLD = {"decompose": "问题分解", "abstract": "抽象建模", "model": "抽象建模",
               "algorithm": "算法设计", "verify": "调试评估"}


def ct_report(scores: dict) -> dict:
    """报告层折叠（纯函数）：六内部维 → 四报告维。

    ⚠️ 红线：本函数**只做报告层映射**，六维公式与 FORMULA_VERSION 一个字都不动 ——
    动了跨版本数据不可比。折叠规则（第三波总审 §3.2/§7 T1-7）：
      问题分解=decompose；抽象建模=(abstract+model)/2（两维在初中生数据上大概率塌成一维，
      报告层先合并，等因子分析裁决）；算法设计=algorithm；调试评估=verify。
    **transfer 不进报告维**：迁移在实时行为侧没有可辩护的测量（换位次数≠迁移能力），
    只保留在 internal_dims 备查；R3 出口改看 exit_task_passed（learning_round）。
    映射关系由 REPORT_FOLD 单一真源持有；多对一的维取平均（0-100 分口径下合并即均值）。
    """
    groups: dict[str, list] = {}
    for k, name in REPORT_FOLD.items():
        groups.setdefault(name, []).append(scores.get(k, 0))
    return {
        "report_version": REPORT_VERSION,
        "internal_dims": dict(scores),
        "report_dims": {name: (vs[0] if len(vs) == 1 else round(sum(vs) / len(vs), 1))
                        for name, vs in groups.items()},
    }


def resolve_profile_scope(scope: str | None, task_id: str | None,
                          unit_id: str | None) -> tuple[str | None, str | None]:
    """校验公开画像的适用范围。

    能力主张必须明确属于一个任务或一个教学单元。旧调用未传 scope 时仍可读取
    诊断行为事实，但画像状态只能是 insufficient_evidence，绝不自动混算范围。
    """
    normalized = scope.strip().lower() if scope else None
    task_ref = (task_id or "").strip() or None
    unit_ref = (unit_id or "").strip() or None
    if normalized is None:
        if task_ref or unit_ref:
            raise HTTPException(400, "task_id/unit_id 必须与显式 scope 一起提供")
        return None, None
    if normalized not in ("task", "unit"):
        raise HTTPException(400, "scope 只能是 task 或 unit")
    if normalized == "task":
        if not task_ref or unit_ref:
            raise HTTPException(400, "scope=task 时必须只提供 task_id")
        return normalized, task_ref
    if not unit_ref or task_ref:
        raise HTTPException(400, "scope=unit 时必须只提供 unit_id")
    return normalized, unit_ref


def evidence_profile_for(target: str, scope: str | None,
                         scope_ref: str | None) -> dict:
    """读取证据支持的公开画像；绝不从 ct_events 或过程指数回退生成能力结论。"""
    empty = {
        "status": "insufficient_evidence",
        "scope": scope,
        "scope_ref": scope_ref,
        "levels": {},
        "inferences": [],
        "evidence_count": 0,
    }
    if not scope or not scope_ref:
        return {**empty, "reason": "explicit_scope_required"}
    try:
        from app import store_evidence
    except ImportError:
        # 兼容数据库尚未完成迁移的部署：失败应透明降级，不能偷用旧行为公式补画像。
        return {**empty, "reason": "evidence_store_unavailable"}
    profile = store_evidence.profile_levels(target, scope, scope_ref)
    if not isinstance(profile, dict) or profile.get("status") != "evidence_backed":
        reason = profile.get("reason") if isinstance(profile, dict) else "invalid_profile_response"
        return {**empty, "reason": reason or "no_confirmed_inference"}
    levels = profile.get("levels") or {}
    inferences = profile.get("inferences") or []
    if not levels or not inferences:
        return {**empty, "reason": "no_confirmed_inference"}
    return {
        **profile,
        "status": "evidence_backed",
        "scope": scope,
        "scope_ref": scope_ref,
        "levels": levels,
        "inferences": inferences,
        "evidence_count": int(profile.get("evidence_count") or 0),
    }


def summary_for(target: str, since: int | None = None, until: int | None = None,
                profile: str = "v1_all") -> dict:
    """计算某用户的计算思维聚合（供 /summary 与教师工作台复用）。

    `since`/`until` 用于按干预期切分（课题的前后对比）；默认全量，行为与从前一致。
    `profile="neutral"`：抽象维**去掉求助项**（v3 里是 `0.3 * sat(ai_helps, 6)` 这一项）。
    「问 AI 的次数」正是干预（强制苏格拉底）的直接机械后果 —— 拿它做课题因变量，
    等于自变量直通因变量，不经过「计算思维」这个构念。研究场景一律用 neutral。
    """
    # 展示用（路径/时间线）取最近若干条即可；计数一律走 ct_counts 的 SQL 聚合，不受截断影响
    evs = [e for e in store.ct_events(target, 500)
           if (since is None or e["ts"] >= since) and (until is None or e["ts"] < until)]
    by_sv = store.ct_counts(target, since, until)
    def cnt(t):
        return sum(c.get(t, 0) for c in by_sv.values())
    attempts, success, runs, errors, fixes = _attempts_and_successes(by_sv)
    ai_helps, switches, designs = cnt("ai_help"), cnt("role_switch"), cnt("design_create")
    success_rate = round(success / attempts * 100) if attempts else 0
    legacy = sum(sum(c.values()) for sv, c in by_sv.items() if sv <= 1)

    # 六维规则启发式（行为/代码演化 → 维度）。v3：质量率 × 证据权重 + 饱和量，见 FORMULA_VERSION 注释。
    # k 值按一轮 6 周课的真实量级标定（实测人均 runs ~45 / fixes ~10 / designs 0~4 / switches 0~3），
    # 让「认真上完一轮课」落在 40~70 分段 —— 既看得出增长，也留得出上升空间。
    #
    # 第三轮审计补上的两条修订（v3 尚无任何真实数据，就地修订不另升版）：
    # ① 质量率必须乘**证据权重** sat(样本量, k)。裸比率无小样本收缩：3 次全成功的 sr=1.0
    #    拿到的分数与认真一轮课几乎相同 —— 3 次行为不构成「算法能力强」的证据。
    # ② 窗口内 errors=0 但 fixes>0 时修复率取 1 而不是 0。期段切分会把同一次「报错→修好」
    #    拆到窗口两侧：修复本身就是验证行为的证据，错报在窗口外不该把它按 0 算
    #    （实测同一次修复，跨窗口从 66 分被压到 6 分）。
    # 孤儿修复（窗口内 errors=0 但 fixes>0）取修复率 1，但**证据量按边界合理值封顶**：
    # 期段切分最多把一两次「错→修」对拆到窗口两侧，窗口里凭空出现 50 个 fix 不是边界效应，
    # 是刷的 —— 不封顶的话纯 fix 刷量能把 verify 从 <40 抬到 81。
    fixes_ev = fixes if errors else min(fixes, 2)
    fix_rate = min(1.0, fixes / errors) if errors else (1.0 if fixes else 0.0)
    sr = success / attempts if attempts else 0.0               # 运行成功率
    ev_fix = _sat(errors + fixes_ev, 4)                        # 修复率的证据量：错与修的总次数
    ev_run = _sat(attempts, 6)                                 # 成功率的证据量：尝试次数
    if profile == "neutral":
        # 研究口径：不计求助 —— ai_helps 是「强制苏格拉底」这个自变量的机械后果
        abstract = 0.7 * _sat(runs, 30) + 0.3 * _sat(designs, 3)
    else:
        abstract = 0.5 * _sat(runs, 30) + 0.2 * _sat(designs, 3) + 0.3 * _sat(ai_helps, 6)
    process_indices = {
        # 分解：把问题拆小的证据 —— 修好过错、换过位（分工）、先拼过积木
        "decompose": round(100 * (0.5 * _sat(fixes, 8) + 0.25 * _sat(switches, 3) + 0.25 * _sat(designs, 3))),
        # 抽象：迭代打磨 + 先设计后写码（+ 教学口径的「向 AI 提炼问题」）
        "abstract": round(100 * abstract),
        # 建模：积木/流程设计为主，辅以迭代量
        "model": round(100 * (0.7 * _sat(designs, 3) + 0.3 * _sat(runs, 40))),
        # 算法设计：成功率（质量×证据量）为主，成功量（积累）为辅
        "algorithm": round(100 * (0.6 * sr * ev_run + 0.4 * _sat(success, 15))),
        # 验证优化：修复率（报错→改对的闭环质量×证据量）为主，修复量为辅（量项同受孤儿封顶）
        "verify": round(100 * (0.6 * fix_rate * ev_fix + 0.4 * _sat(fixes if errors else fixes_ev, 6))),
        # 迁移：稳定成功 + 情境切换（换位）
        "transfer": round(100 * (0.5 * _sat(success, 15) + 0.3 * _sat(switches, 3) + 0.2 * sr * ev_run)),
    }

    # detail 走 _safe_detail：ai_help 的学生原话不进出参（P0-B），其余类型原样
    path = [
        {"type": e["type"], "detail": _safe_detail(e), "ts": e["ts"]}
        for e in evs if e["type"] in KEY
    ][-12:]
    timeline = [{"type": e["type"], "detail": _safe_detail(e), "ts": e["ts"]} for e in evs][-20:]
    minutes = store.ct_gap_minutes(target, since, until)

    return {
        "runs": runs, "errors": errors, "fixes": fixes, "ai_helps": ai_helps,
        "role_switches": switches, "designs": designs,
        "attempts": attempts, "successes": success,
        "success_rate": success_rate, "minutes": minutes,
        # 旧埋点语义的事件条数。>0 说明这份统计跨了两套语义（已分别还原后相加），
        # 研究报告里要如实说明，别当成同质数据。
        "legacy_events": legacy,
        "window": {"since": since, "until": until},
        # 这些数值是行为启发式生成的**过程诊断指数**，不是能力等级或画像结论。
        # 不再提供 ct_scores 别名，避免新代码把诊断上下文重新当成能力分。
        "process_indices": process_indices,
        "diagnostic_only": True,
        "path": path, "timeline": timeline,
        # 只要有 1 条事件就算「有数据」，会把从没真正编程过的账号也算进班级均值。
        # 门槛：**3 条编程行为**（运行/报错/修复/设计）；点击类事件不计入证据量。
        # （v2 时代这里还有第二重危害：公式带 25–40 的常数地板分，空账号会把基线拉成常数；
        # v3 无地板分，空行为=0 分，但证据门槛仍然要守 —— 3 条行为算出的分数不算画像。）
        "has_real_data": (runs + errors + fixes + designs) >= 3,
        "evidence_count": runs + errors + fixes + designs,
    }


@router.get("/mistakes")
def mistakes(user_id: str | None = None, limit: int = 20, user: dict = Depends(current_user)):
    """错题本：把 `error` 事件按报错文本归集，同一个错误反复犯会被合并并计次。

    数据源就是 CT 事件流本身，不另立一张表 —— 报错本来就是过程数据的一部分，
    分两处存会出现「学习面板和六维分对不上」。
    """
    target = user_id if (user.get("role") in ("teacher", "researcher") and user_id) else user.get("sub", "anon")
    groups: dict[str, dict] = {}
    for e in store.ct_events(target, 500):
        if e["type"] != "error":
            continue
        key = (e["detail"] or "运行出错").replace("运行出错：", "").strip() or "运行出错"
        g = groups.setdefault(key, {"text": key, "count": 0, "first_at": e["ts"], "last_at": e["ts"]})
        g["count"] += 1
        g["last_at"] = max(g["last_at"], e["ts"])
        g["first_at"] = min(g["first_at"], e["ts"])
    items = sorted(groups.values(), key=lambda g: (-g["count"], -g["last_at"]))[:limit]
    return {"items": items, "total": sum(g["count"] for g in groups.values())}


RANK_CN = {0: "较强", 1: "中等", 2: "待加强"}


def _to_rank(scores: dict) -> list:
    """把六维分值转成**相对强弱**（不给数字）。

    学生端不该看到六维分值：那些分是行为次数的单调函数，一旦变成"我的分数"，
    理性的学生就会去多点几下把它刷上去 —— 而课题恰恰要用这些行为当过程指标。
    给相对强弱仍然能回答「我该练哪一维」，但没有可以追逐的数字。

    分档必须**按分值**，不能按名次下标。原来直接 `enumerate` 取前 1/3、中 1/3、后 1/3：
    六个维度分值完全相同时（典型情形是全部撞到 100 的上限，一轮 6 周干预下来
    多数学生都会这样），它照样判出两个「待加强」—— 靠的是字典插入顺序。
    学生看到的「你的『迁移』待加强」于是是任意的，却以诊断的口吻呈现；
    insights 再拿这个最弱维去挑练习题，推荐也跟着变成任意的。
    并列就该同档，全部并列就是全部同档。
    """
    order = sorted(scores.items(), key=lambda kv: -kv[1])
    n = len(order)
    all_tied = len(set(scores.values())) == 1
    if all_tied:
        # 六维完全并列（v3 无地板分后，零行为学生的全 0 并列是常态）一律归「中等」。
        # 按首现名次给档会让全 0 显示成六个「较强」—— 对没写过一行代码的学生说
        # 「你六维都较强」，比凭空判「待加强」还离谱。tied 标志让前端说「还看不出差别」。
        return [{"dim": k, "band": 1, "label": RANK_CN[1], "tied": True} for k, _ in order]
    band_of = {}
    out = []
    for i, (k, v) in enumerate(order):
        if v not in band_of:                       # 同分同档：档位由**首次出现的名次**定
            band_of[v] = 0 if i < n / 3 else (1 if i < n * 2 / 3 else 2)
        # 0 分 = 该维**没有任何证据**，不管名次落在哪一档都只能是「待加强」。
        # 三次运行全失败的学生：四个 0 分维按名次会标成「中等」，
        # 而 6 分和 2 分反倒标「较强」—— 全败学生的画像里一个「待加强」都没有。
        band = 2 if v <= 0 else band_of[v]
        out.append({"dim": k, "band": band, "label": RANK_CN[band], "tied": False})
    return out


@router.get("/summary")
def summary(user_id: str | None = None, scope: str | None = None,
            task_id: str | None = None, unit_id: str | None = None,
            user: dict = Depends(current_user)):
    # 学生看自己；教师/研究员可传 user_id 看任一学生
    is_teacher = user.get("role") in ("teacher", "researcher")
    target = user_id if (is_teacher and user_id) else user.get("sub", "anon")
    profile_scope, scope_ref = resolve_profile_scope(scope, task_id, unit_id)
    # v1_all 只作为课堂诊断上下文：求助、运行、报错等可帮助老师决定是否介入，
    # 但不得改变下方 evidence-backed profile。
    d = summary_for(target, profile="v1_all")
    process_indices = dict(d.get("process_indices") or {})
    d["diagnostic"] = {
        "diagnostic_only": True,
        "formula_version": FORMULA_VERSION,
        "process_indices": process_indices,
        "counts": {k: d[k] for k in ("runs", "errors", "fixes", "ai_helps",
                                      "role_switches", "designs", "attempts", "successes")},
        "success_rate": d["success_rate"],
        "minutes": d["minutes"],
    }
    d["profile"] = evidence_profile_for(target, profile_scope, scope_ref)
    # 公共响应不再暴露旧的能力化命名；学生也不会在无证据时得到“中等/待加强”。
    d.pop("process_indices", None)
    d.pop("diagnostic_only", None)
    # 学生与教师均保留稳定键，但值只能来自证据画像；本切片不再生成行为排名。
    d["ct_rank"] = []
    return d


@router.get("/report")
def report_profile(user_id: str, scope: str | None = None,
                   task_id: str | None = None, unit_id: str | None = None,
                   user: dict = Depends(current_user)):
    """教师/研究员查看证据支持的能力主张；行为过程指数不进入公开报告。"""
    if user.get("role") not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师权限")
    profile_scope, scope_ref = resolve_profile_scope(scope, task_id, unit_id)
    if not profile_scope or not scope_ref:
        raise HTTPException(400, "能力报告必须显式提供 scope 与对应的 task_id/unit_id")
    profile = evidence_profile_for(user_id, profile_scope, scope_ref)
    return {"student_id": user_id, **profile}
