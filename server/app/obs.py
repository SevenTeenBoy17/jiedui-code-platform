"""
教师结构化观察表 A 包的平台能力（《观察表与评分金标准_定稿》交付物 A）。

六个端点，一条主线：**把纸表落成可统计的窗，再把它与平台埋点对齐，冲突只出数字不回写。**

  POST /api/obs/window        录入（教师；批量：一次交一轮的多对）
  GET  /api/obs/windows       回读
  GET  /api/obs/quality       X 率自动汇总（§A2 T1-5 的效度闸门）
  GET  /api/obs/align/seat    T1 席位对齐 —— 共机半盲的定量估计
  GET  /api/obs/align/driving T5 驾驶时间占比 —— p_weak/both/none 三数并排
  GET  /api/obs/src_proxy     §A15 降级预案 SRC-proxy/v0（纯行为代理量）

四条不可让步的纪律（每条都在下面的函数里有对应实现与断言）：
1. **observer_id 从令牌 sub 取，不信客户端**；observed_from/to 服务端写（§A1 禁人工填）。
2. **SRC 三码多选并存，不做任何仲裁**（§A5：P 是因变量本身，保护即污染）。
3. **冲突绝不回写平台数据**：align/* 与 src_proxy 全部只读，一行 ct_events 都不改
   （§A8 冲突处置三条铁律之①；test_obs 用前后快照钉死这一条）。
4. **红线照旧**：分数不下发学生（本模块全线教师/研究员）、六维公式一个字不动
   （本模块不 import ct 的评分函数）、同意门（产出个体量的两个端点走 T0-2 分析集口径）。
"""
import time
from statistics import median

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import store
from app import store_learner as L
from app import store_obs as O
from app.auth import current_user
from app.research import _pid           # 假名复用研究导出的 HMAC 单一真源，不另起一套

router = APIRouter(prefix="/api/obs", tags=["教师观察表"])

X_THRESHOLD = 0.10          # §A2 T1-5：X>10% 判类目体系不完备，退回改手册
BOTH_THRESHOLD = 0.10       # §A9.2：both（两人同抢）率 >10% 即 idea32 的直接失败判据
ANCHOR_MIN = 30             # §A15：锚定子集 <30 时 conclusion_eligible 置 false
PROXY_VERSION = "src-proxy/v0"


def _teacher(user: dict):
    """A 包全线教师/研究员。学生一律 403 —— 观察表是对学生本人的过程判定，
    可读即等于把「老师认为你在卡住/在争执」下发给学生本人（红线：判定不下发学生）。"""
    if user.get("role") not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师/研究员权限")


# ============ 录入 ============
class ObsItemIn(BaseModel):
    """一格 = 一个 pair × 一个观察窗。**没有 observer_id / observed_from / observed_to 字段**
    是设计而不是遗漏：三者由服务端写，客户端多传的键被 pydantic 直接丢弃（§A1 禁人工填）。"""
    pair_id: str = ""
    room_id: str = ""                       # 逐对给；缺省用批级 room_id
    window_seq: int = 1
    seat: str | None = None                 # 'L'|'R'|None(pair 级行)
    student_id: str | None = None           # 给出即冻结 seat_map（seat→student 的权威来源）
    # —— sweep 五格 ——
    kb: str | None = None
    src_a: int | None = None                # 三码**多选并存**，不互斥（§A5）
    src_p: int | None = None
    src_s: int | None = None
    src_unclear: int = 0
    n_code: str | None = None
    evt_tag: str | None = None
    evt_note: str = ""
    # —— focus 扩展（§A3；sweep 行一律置 NULL）——
    segment_seq: int | None = None
    segment_driver_seat: str | None = None
    segment_from: int | None = None
    segment_to: int | None = None
    f1_switches: int | None = None
    f1_trigger: str | None = None
    f2_shared: str | None = None
    f3_after_hint: str | None = None
    f4_l_turns: int | None = None
    f4_r_turns: int | None = None
    r0_count: int | None = None
    f5_direction: str | None = None


class ObsBatchIn(BaseModel):
    """页眉级字段（§A2：每轮一次，3 秒）+ 主表 items[]。教师不填任何标识字段。"""
    study_id: str
    round_index: int
    layer: str = "sweep"
    room_id: str = ""                       # 批级缺省房间（focus 一批一对时只填这里）
    tech_status: str | None = None          # 页眉级技术状况，整批同值
    items: list[ObsItemIn] = []


MAX_ITEMS = 200                             # 一个班 22 对（§A2 走位路线 01→22），给足余量


def _one_of(v, allowed: tuple, field: str, lower: bool = False):
    """空 → None（NULL 是真值：这一格没点）；非空必须在白名单内，脏值 400 挡在入口。
    脏值一旦落库，X 率与对齐表的分组就成了两可 —— 与 ct.py 埋点白名单同一纪律。"""
    if v is None or v == "":
        return None
    s = str(v).strip()
    if lower:
        s = s.lower()
    if s not in allowed:
        raise HTTPException(400, f"{field} 取值必须是 {'/'.join(allowed)} 之一")
    return s


def _kb(v):
    """KB 大小写归一：席位 L/R 大写，none/both/unclear 小写（教师端按钮点出来的值不该因
    大小写分裂成两个类目）。"""
    if v is None or v == "":
        return None
    s = str(v).strip()
    s = s.upper() if s.upper() in ("L", "R") else s.lower()
    if s not in O.KB_CODES:
        raise HTTPException(400, f"kb 取值必须是 {'/'.join(O.KB_CODES)} 之一")
    return s


def _bit(v, field: str):
    if v is None:
        return None
    if v not in (0, 1, True, False):
        raise HTTPException(400, f"{field} 只能是 0 或 1")
    return int(v)


def _nonneg(v, field: str):
    if v is None:
        return None
    if not isinstance(v, int) or v < 0:
        raise HTTPException(400, f"{field} 必须是非负整数")
    return v


def _round_started_at(room_id: str, round_index: int, at: int) -> int | None:
    """该 room 第 round_index 轮的起点（started_at ≤ at 的最新一条）。

    没有平台轮记录 → None：window_offset_sec 为 NULL 是**真值**（这一窗没有可锚定的轮起点），
    不是缺数据。§A9.2 用它做相位随机化的记录与 A7 的敏感性协变量，硬编一个 0 会让
    「窗起点与行为相位独立」这个充要前提在数据上无法核查。
    """
    best = None
    for r in L.list_rounds(room_id):
        if r["round_index"] != round_index or not r["started_at"]:
            continue
        if r["started_at"] <= at and (best is None or r["started_at"] > best):
            best = r["started_at"]
    return best


@router.post("/window")
def window_add(req: ObsBatchIn, user: dict = Depends(current_user)):
    """录入一轮的观察窗（批量）。

    - **observer_id 从令牌 sub 取**（§A1「绝不可空」）：观察者是信度分析的分组键，
      客户端可指定即等于允许把 A 观察者的行记成 B，κ 从此算不回来。
    - **observed_from/to 服务端写**：以提交时刻为窗末端、按层回推窗长
      （sweep 13 秒 / focus 8 分钟，§A1/§A3）。批量提交下同批各对共用同一窗口 ——
      S 形走位（§A2）造成的逐对时差 ≤5 分钟，落库不做伪精度；需要逐对精确时刻时
      分批提交即可，口径不变。
    - **sweep 行强制清空 focus 列**（§A1「sweep 一律 NULL」）：两层量程不同
      （瞬时占有率 vs 事件式），混列会让「不得合并」这条纪律在表结构上失守。
    - **src_unclear=1 时三码一律 NULL**（§A1）：判不出不等于三个都没出现。
    """
    _teacher(user)
    study_id = req.study_id.strip()[:64]
    if not study_id:
        raise HTTPException(400, "study_id 不能为空")
    if req.round_index not in (1, 2, 3):
        raise HTTPException(400, "round_index 必须在 1-3 之间（R1能跑/R2跑对/R3跑好）")
    layer = _one_of(req.layer, O.LAYERS, "layer", lower=True) or "sweep"
    tech = _one_of(req.tech_status, O.TECH_STATUS, "tech_status")
    if not req.items:
        raise HTTPException(400, "items 不能为空")
    if len(req.items) > MAX_ITEMS:
        raise HTTPException(400, f"单次最多提交 {MAX_ITEMS} 格")

    observer_id = user.get("sub", "")
    if not observer_id:
        raise HTTPException(400, "令牌缺少观察者身份")
    now = int(time.time())
    observed_to = now
    observed_from = now - O.WINDOW_SEC[layer]
    batch_room = req.room_id.strip()[:64]

    rows, seats = [], []
    for it in req.items:
        room = (it.room_id.strip() or batch_room)[:64]
        if not room:
            raise HTTPException(400, "room_id 不能为空（批级或逐格给一个）")
        seat = _one_of(it.seat, O.SEATS, "seat")
        sid = (it.student_id or "").strip()[:64] or None
        unclear = 1 if it.src_unclear else 0
        row = {
            "study_id": study_id, "room_id": room, "round_index": req.round_index,
            # pair_id 缺省取 room：共机结对下「一台机 = 一对」，逼教师再填一个标识
            # 正是 §A0「教师不填任何标识字段」要避免的事。
            "pair_id": (it.pair_id.strip()[:64] or room),
            "seat": seat, "student_id": sid,
            "window_seq": _nonneg(it.window_seq, "window_seq") or 0,
            "layer": layer, "observer_id": observer_id,
            "observed_from": observed_from, "observed_to": observed_to,
            "window_offset_sec": (lambda t0: None if t0 is None else observed_from - t0)(
                _round_started_at(room, req.round_index, observed_from)),
            "tech_status": tech, "created_at": now,
            "kb": _kb(it.kb),
            # unclear 时三码全 NULL；否则原样落库 —— 出现即勾、不互斥、**不仲裁**（§A5）
            "src_a": None if unclear else _bit(it.src_a, "src_a"),
            "src_p": None if unclear else _bit(it.src_p, "src_p"),
            "src_s": None if unclear else _bit(it.src_s, "src_s"),
            "src_unclear": unclear,
            "n_code": _one_of(it.n_code, O.N_CODES, "n_code", lower=True),
            "evt_tag": _one_of(it.evt_tag, O.EVT_TAGS, "evt_tag"),
            # 唯一自由字段，超长截断而不是 400：现场教师打字被弹错误框 = 下一轮弃填
            "evt_note": (it.evt_note or "").strip()[:O.EVT_NOTE_MAX] or None,
        }
        if layer == "focus":
            row.update({
                "segment_seq": _nonneg(it.segment_seq, "segment_seq"),
                "segment_driver_seat": _one_of(it.segment_driver_seat, O.SEATS, "segment_driver_seat"),
                "segment_from": it.segment_from, "segment_to": it.segment_to,
                "f1_switches": _nonneg(it.f1_switches, "f1_switches"),
                "f1_trigger": _one_of(it.f1_trigger, O.F1_TRIGGERS, "f1_trigger", lower=True),
                "f2_shared": _one_of(it.f2_shared, O.F2_SHARED, "f2_shared", lower=True),
                "f3_after_hint": _one_of(it.f3_after_hint, O.F3_AFTER_HINT, "f3_after_hint", lower=True),
                "f4_l_turns": _nonneg(it.f4_l_turns, "f4_l_turns"),
                "f4_r_turns": _nonneg(it.f4_r_turns, "f4_r_turns"),
                "r0_count": _nonneg(it.r0_count, "r0_count"),
                "f5_direction": _one_of(it.f5_direction, O.F5_DIRECTIONS, "f5_direction", lower=True),
            })
        rows.append(row)
        if seat and sid:
            seats.append((room, req.round_index, seat, sid))

    ids = O.add_windows(rows)
    for room, ri, seat, sid in seats:      # 席位归属首写即冻结（不覆盖）
        O.freeze_seat(room, ri, seat, sid)
    return {"ok": True, "count": len(ids), "ids": ids, "layer": layer,
            "observer_id": observer_id,
            "observed_from": observed_from, "observed_to": observed_to}


@router.get("/windows")
def windows(study_id: str, room_id: str = "", round_index: int | None = None,
            layer: str = "", user: dict = Depends(current_user)):
    _teacher(user)
    sid = study_id.strip()
    if not sid:
        raise HTTPException(400, "study_id 不能为空")
    items = O.list_windows(sid, room_id or None, round_index, layer or None)
    return {"study_id": sid, "n": len(items), "items": items}


# ============ X 率自动汇总（§A2 T1-5 的效度闸门）============
@router.get("/quality")
def quality(study_id: str, layer: str = "", user: dict = Depends(current_user)):
    """X 率 = 后端从各格「没看清」**自动汇总**。

    为什么不设独立的 X 格（§A6 T1-5 新砍）：教师不会主动勾「我判不出」，X 率恒接近 0，
    穷尽性检验永远触发不了。改成每格自带 unclear、后端汇总，X 率才是可信的。

    **它是效度闸门不是仪表盘**：X>10% → 判类目体系不完备，**退回改手册**，不是继续记。
    分子口径 = 任一格勾了「没看清」的窗（kb=='unclear' ∨ src_unclear ∨ n_code=='unclear'），
    分母 = 窗数（§A5：多选出现率的分母是窗数，设计固定，不随话量漂移）。
    """
    _teacher(user)
    sid = study_id.strip()
    if not sid:
        raise HTTPException(400, "study_id 不能为空")
    rows = O.list_windows(sid, layer=layer or None)
    n = len(rows)
    kb_x = sum(1 for r in rows if r["kb"] == "unclear")
    src_x = sum(1 for r in rows if r["src_unclear"])
    n_x = sum(1 for r in rows if r["n_code"] == "unclear")
    any_x = sum(1 for r in rows
                if r["kb"] == "unclear" or r["src_unclear"] or r["n_code"] == "unclear")
    rate = (lambda k: round(k / n, 4) if n else None)
    x_rate = rate(any_x)
    return {
        "study_id": sid, "layer": layer or "all",
        "n_windows": n,
        "x_rate": x_rate,
        # 逐格分解：整体 X 超标时要知道是哪一格的操作性定义不够可判，才知道改手册的哪一页
        "by_field": {
            "kb": {"count": kb_x, "rate": rate(kb_x)},
            "src": {"count": src_x, "rate": rate(src_x)},
            "n_code": {"count": n_x, "rate": rate(n_x)},
        },
        "threshold": X_THRESHOLD,
        "over_threshold": bool(n and x_rate > X_THRESHOLD),
        "note": "X 率为效度闸门（定稿 §A2 T1-5）：>10% 判类目体系不完备，须退回改手册，不是继续记",
    }


# ============ T1 席位对齐（§A8）============
def _operators(room_id: str, t0: int, t1: int, cache: dict) -> set:
    """窗内在该房产生过 ct_events 的学生集合（只读；复用 store.ct_room_participants，
    窗口口径 [t0, t1) 与全仓一致）。"""
    key = (room_id, t0, t1)
    if key not in cache:
        cache[key] = set(store.ct_room_participants(room_id, t0, t1))
    return cache[key]


@router.get("/align/seat")
def align_seat(study_id: str, user: dict = Depends(current_user)):
    """T1 席位对齐：观察到的键鼠归属 vs 平台埋点里的实际操作者。

    判定：obs_window.kb（L/R）→ 经 seat_map 解析出「应该是谁在操作」；
    平台侧取同窗 [observed_from, observed_to) 内在该 room 有 ct_events 的 user_id。

    **不计入分母的四类**（如实分列，不塞进 mismatch 抬高不一致率）：
      ① 观察侧 both（两人同抢）/ none（都没碰）/ unclear（没看清）——§A0 要求如实点的真值；
      ② 席位不可解析（seat_map 与 obs 席位行都没有）；
      ③ 平台侧窗内零事件（共机下另一人操作但没触发白名单事件是常态）；
      ④ 平台侧窗内 ≥2 人（同一台机上两个账号都有事件，归属两可）。

    ⚠️ **定稿铁律（§A8 冲突处置之①）：冲突绝不回写平台数据。** 本端点只读 ——
    不改 ct_events 的任何一行，也不改 obs_window。观察表只产出三样东西：
    不一致率（进论文）、人工核查名单（该 pair-round 进复核）、脏标（技术异常轮整轮剔除）。
    """
    _teacher(user)
    sid = study_id.strip()
    if not sid:
        raise HTTPException(400, "study_id 不能为空")
    rows = [r for r in O.list_windows(sid) if r["kb"]]
    cache: dict = {}
    seat_cache: dict = {}
    n = len(rows)
    both = none_ = unclear = 0
    comparable = mismatch = 0
    no_seat = no_evidence = ambiguous = 0
    review: list = []                       # 人工核查名单（pair-round 粒度，不含分数）
    for r in rows:
        kb = r["kb"]
        if kb == "both":
            both += 1
            continue
        if kb == "none":
            none_ += 1
            continue
        if kb == "unclear":
            unclear += 1
            continue
        key = (r["room_id"], r["round_index"])
        if key not in seat_cache:
            seat_cache[key] = O.seat_students(r["room_id"], r["round_index"])
        expected = seat_cache[key].get(kb)
        if not expected:
            no_seat += 1
            continue
        ops = _operators(r["room_id"], r["observed_from"], r["observed_to"], cache)
        if not ops:
            no_evidence += 1
            continue
        if len(ops) > 1:
            ambiguous += 1
            continue
        comparable += 1
        if expected != next(iter(ops)):
            mismatch += 1
            review.append({"room_id": r["room_id"], "round_index": r["round_index"],
                           "pair_id": r["pair_id"], "window_seq": r["window_seq"]})
    rate = (lambda k: round(k / n, 4) if n else None)
    return {
        "study_id": sid,
        "n_windows": n,
        "n_comparable": comparable,
        "mismatch_rate": round(mismatch / comparable, 4) if comparable else None,
        "both_rate": rate(both), "none_rate": rate(none_), "unclear_rate": rate(unclear),
        # 不可比的三类原因分列 —— 混进分母会把「测不到」伪装成「测到了一致」
        "excluded": {"no_seat_map": no_seat, "no_platform_evidence": no_evidence,
                     "platform_ambiguous": ambiguous},
        "review_list": review[:100],
        "writes_platform_data": False,
        "note": "共机半盲的定量估计——此不一致率是论文测量局限章的原始数据，绝不回写平台",
    }


# ============ T5 驾驶时间占比（§A8 T5 / §A9.2）============
@router.get("/align/driving")
def align_driving(study_id: str, user: dict = Depends(current_user)):
    """T5：按 sweep 的 KB 做**瞬时时间取样（MTS）**估计键鼠占有率。

    只吃 layer='sweep'（§A1：sweep 是时点占有率、focus 是事件式，两者**报告中不得合并**）。

    估计量（§A9.2）：X_ij=1 若第 j 窗观察时刻键鼠在学生 i 手上；p̂_i=(1/n_i)ΣX_ij。
      - `none`（都没碰）**排除出分母** —— 空档不是驾驶权归属证据；
      - `both`（抢）**各计 0.5** 并单独报 both 率；
      - `unclear` 同样排除出分母（判不出不是证据）。

    **三数并排必报**（定稿硬性要求）：p_weak / both_rate / none_rate。
    只报 p̄ 会把「契约执行良好」与「两人天天抢」呈现成同一个数；both 率 >10% 就是
    受保护驾驶时间（idea32）的**直接失败判据**，这个信号比 p̂ 更重要。

    **p_weak 的口径限制（必须与数一起读）**：定稿的「弱势方」= 前测三分位下段，
    而分层标签**绝不印在教师表单上**（§A1：印上去等于给教师一个期望效应源），
    只能走离线 join。平台侧因此只给得出代理口径 **within_pair_lower**（对内占有率较低的一方），
    字段 p_weak_definition 如实标出，不冒充定稿口径。

    个体层 p̂_i 按 §A9.2 表「永不可用」（L=6 时半宽 ±0.23）：只作群体估计的输入，
    **不下发教师、不进学生画像、不作个体判定** —— 故 rows 里只给 HMAC 假名，不给学号。
    """
    _teacher(user)
    sid = study_id.strip()
    if not sid:
        raise HTTPException(400, "study_id 不能为空")
    rows = [r for r in O.list_windows(sid, layer="sweep") if r["kb"]]

    seat_cache: dict = {}
    consent_cache: dict = {}
    used = []                               # 进入分析集的行
    ex_seat = ex_consent = 0
    for r in rows:
        key = (r["room_id"], r["round_index"])
        if key not in seat_cache:
            seat_cache[key] = O.seat_students(*key)
        sm = seat_cache[key]
        if not (sm.get("L") and sm.get("R")):
            ex_seat += 1
            continue
        # T0-2 分析集口径：**整对**都要有有效监护人同意才进研究数据 —— 只剔一侧会让
        # 分子（某人的占有）与分母（该对的窗数）落在不同的集合上，占比就是假的。
        pair_key = (sm["L"], sm["R"])
        if pair_key not in consent_cache:
            ok = store.consent_ok_map([sm["L"], sm["R"]])
            consent_cache[pair_key] = bool(ok.get(sm["L"])) and bool(ok.get(sm["R"]))
        if not consent_cache[pair_key]:
            ex_consent += 1
            continue
        used.append((r, sm))

    n_used = len(used)
    both = sum(1 for r, _ in used if r["kb"] == "both")
    none_ = sum(1 for r, _ in used if r["kb"] == "none")
    unclear = sum(1 for r, _ in used if r["kb"] == "unclear")
    # 分组累计：credit 记占有（both 各 0.5），denom 记进分母的窗数（排除 none/unclear）
    per_pair: dict = {}
    per_stu: dict = {}
    for r, sm in used:
        if r["kb"] not in ("L", "R", "both"):
            continue
        g = per_pair.setdefault((r["room_id"], r["round_index"]), {})
        for seat in ("L", "R"):
            stu = sm[seat]
            if r["kb"] == "both":
                add = 0.5
            else:
                add = 1.0 if r["kb"] == seat else 0.0
            a = g.setdefault(stu, [0.0, 0])
            a[0] += add
            a[1] += 1
            b = per_stu.setdefault(stu, [0.0, 0])
            b[0] += add
            b[1] += 1
    # p_weak = 各对「对内占有率较低一方」的 p̂ 的均值（代理口径，见 docstring）
    lows = [min(c / d for c, d in g.values() if d) for g in per_pair.values()
            if len(g) == 2 and all(d for _, d in g.values())]
    rate = (lambda k: round(k / n_used, 4) if n_used else None)
    both_rate = rate(both)
    return {
        "study_id": sid,
        "n_windows": len(rows), "n_analysis_windows": n_used,
        "n_pairs": len(lows),
        # —— 三数并排（定稿硬性要求，缺一不可）——
        "p_weak": round(sum(lows) / len(lows), 4) if lows else None,
        "both_rate": both_rate,
        "none_rate": rate(none_),
        # 附带：unclear 同样排除出分母，如实报出
        "unclear_rate": rate(unclear),
        "both_over_threshold": bool(n_used and both_rate > BOTH_THRESHOLD),
        "p_weak_definition": "within_pair_lower",
        "estimator": "MTS 时点取样：none/unclear 排除出分母，both 各计 0.5（定稿 §A9.2）",
        "excluded": {"no_seat_map": ex_seat, "no_consent": ex_consent},
        "rows": [{"pid": _pid(stu), "p_hat": round(c / d, 4) if d else None, "n_windows": d}
                 for stu, (c, d) in sorted(per_stu.items())],
        "writes_platform_data": False,
        "notes": [
            "both 率 >10% 即受保护驾驶时间（idea32）的直接失败判据，该信号比 p̂ 更重要",
            "个体层 p̂ 半宽 ±0.23（§A9.2），永不可用于个体判定：只作群体估计的输入，故只给假名",
            "p_weak 为 within_pair_lower 代理口径；定稿的「弱势方」= 前测三分位下段，须离线 join",
            "只取 layer='sweep'：focus 为事件式，与瞬时占有率量程不同，报告中不得合并",
        ],
    }


# ============ SRC-proxy/v0 降级预案（§A15）============
def _s_proxy(evs: list) -> tuple:
    """s_proxy：「error →（其间无 ai_help、无 role_switch）→ fix」三元组数 / error 总数。

    **必须按 sv 分组算再合并并输出 sv_mixed 标志**（§A15，照 ct._attempts_and_successes
    的还原纪律）：sv=1 与 sv=2 下 fix 的产生条件不同，混在一起算等于把两套语义当同质数据。
    """
    by_sv: dict = {}
    for e in evs:
        by_sv.setdefault(int(e["sv"] or 1), []).append(e)
    triples = errors = 0
    per_sv: dict = {}
    for sv, seq in sorted(by_sv.items()):
        t = er = 0
        pending = False                     # 是否有一次「干净」的报错在等它的修复
        for e in seq:
            ty = e["type"]
            if ty == "error":
                er += 1
                pending = True
            elif ty in ("ai_help", "role_switch"):
                pending = False             # 其间求过助/换过手 → 这次修复不算自我修复
            elif ty == "fix" and pending:
                t += 1
                pending = False
        triples += t
        errors += er
        per_sv[str(sv)] = {"triples": t, "errors": er,
                           "s_proxy": round(t / er, 4) if er else None}
    return triples, errors, per_sv, len(by_sv) > 1


@router.get("/src_proxy")
def src_proxy(student_id: str, since: int | None = None, until: int | None = None,
              user: dict = Depends(current_user)):
    """SRC-proxy/v0：**纯行为代理量**，A 观察表缺位时的降级预案（定稿 §A15）。

    定名独立版本号：**不进 ct_scores、不进 REPORT_FOLD、不动 FORMULA_VERSION**
    （本函数不 import 任何六维评分，红线：六维公式一个字不动）。

    三个分量（各自分别报，**禁止合成「主导来源」派生变量** —— 那是 §A5 已封杀的
    保护性仲裁借尸还魂）：
      - a_share / ai_rate：两个都报，趋势检验以 **ai_rate** 为主 ——
        占比的分母随行为总量漂移，正是 03 表6-10「总编码数 207→317 后占比不可比」的同型坑。
      - p_proxy：对每个 role_switch 取其后第一个 run 或 fix 的延迟 d，p=1/(1+median(d)/60)。
        窗内无 role_switch 时置 **NULL 而不是 0**；并排必报 negotiated_share。
      - s_proxy：见 _s_proxy（按 sv 分组算再合并）。

    **降格如实写进响应**：原设想的「编辑间隔序列」在 CX 拿不到（ct_events 无 edit/save，
    §A10），只能用六类白名单事件的相邻间隔近似，命名「操作间隔」，并强制复用
    ct_gap_minutes 的 gap_cap=600s 语义 —— 否则同一份报告里会出现两个打架的「间隔」定义。

    **conclusion_eligible 恒 false 直到 T4 锚定落地，这是设计不是缺陷**：定稿要求
    「必须报与 A 的相关系数」且「无 A 数据不得单独作结论」。ρ 须在同时有 A 数据的
    pair-round 子集上离线算（T4），端点绝不凭空造一个 ρ —— 造出来的相关系数比没有更糟。
    """
    _teacher(user)
    sid = student_id.strip()
    if not sid:
        raise HTTPException(400, "student_id 不能为空")
    # 同意门（T0-2 分析集口径，与 research.build_dataset 同源）：无有效监护人同意的
    # 学生不进研究数据 —— 代理量同样是对未成年人行为流的研究测量，门禁不豁免。
    if not store.has_consent(sid):
        raise HTTPException(403, "CONSENT_REQUIRED")

    evs = store.ct_event_rows(sid, since, until)
    from app.ct import KEY                  # 白名单单一真源在 ct.py（只读取集合，不碰评分）
    wl = [e for e in evs if e["type"] in KEY]
    total = len(wl)
    ai = sum(1 for e in wl if e["type"] == "ai_help")
    minutes = store.ct_gap_minutes(sid, since, until, gap_cap=600)

    # p_proxy：换手后首个有效动作（run/fix）的延迟中位数
    delays: list[int] = []
    switches = [e for e in wl if e["type"] == "role_switch"]
    for i, e in enumerate(wl):
        if e["type"] != "role_switch":
            continue
        for f in wl[i + 1:]:
            if f["type"] in ("run", "fix"):
                delays.append(max(0, f["ts"] - e["ts"]))
                break
    negotiated = sum(1 for e in switches if e["switch_reason"] == "negotiated")
    triples, errors, per_sv, sv_mixed = _s_proxy(wl)

    anchor_n = O.count_windows(sid, tech_status="正常")
    return {
        "schema": "jiedui-src-proxy/v0",
        "proxy_version": PROXY_VERSION,
        "student_id": sid,
        "window": {"since": since, "until": until, "gap_cap_sec": 600},
        "events_total": total, "engaged_minutes": minutes,
        "a": {
            "ai_help": ai,
            "a_share": round(ai / total, 4) if total else None,
            "ai_rate": round(ai / minutes, 4) if minutes else None,
            "note": "两个都报；趋势检验以 ai_rate 为主（占比的分母随行为总量漂移）",
        },
        "p": {
            "role_switches": len(switches),
            # 无 role_switch 时 NULL 而不是 0（§A15）：没换过手不等于换手后接手很慢
            "p_proxy": round(1 / (1 + median(delays) / 60), 4) if delays else None,
            "median_delay_sec": median(delays) if delays else None,
            "negotiated_share": round(negotiated / len(switches), 4) if switches else None,
            "note": "构念效度完全未验证（§A15）：首轮锚定 ρ<0.40 应整条撤回，不保留为「弱证据」",
        },
        "s": {
            "triples": triples, "errors": errors,
            "s_proxy": round(triples / errors, 4) if errors else None,
            "by_sv": per_sv, "sv_mixed": sv_mixed,
        },
        # —— 三条硬纪律写进响应体（§A15）——
        "is_proxy": True,
        "requires_observation_anchor": True,
        "anchor": {"n": anchor_n, "min_n": ANCHOR_MIN,
                   "rho_a": None, "rho_p": None, "rho_s": None,
                   "note": "ρ 须在同时有 A 数据的 pair-round 子集上离线算（T4）；"
                           "端点不凭空造相关系数。ρ<0.40 或 CI 含 0 的分量禁止单独出现在结论段"},
        "conclusion_eligible": False,
        "composite_forbidden": True,
        "operation_gap_note": "「编辑间隔序列」在 CX 拿不到（ct_events 无 edit/save，§A10），"
                              "此处为六类白名单事件的**操作间隔**近似，复用 gap_cap=600s 语义",
        "note": "代理量：无观察表A数据时不得单独作结论依据，须报其与A的相关系数",
    }
