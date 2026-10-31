"""uptake **需求侧**度量块（外部调研 R2《贡献重写与度量必改》§2.1「Uptake 的最终定义」）。

【这块东西是什么】R2 把 CX 的度量拆成两块：
  - **供给侧（自变量保真度 / manipulation check）**：`ai_reply_log` 的 CQ/EQ/RQ/D 四分类
    ＋ `hop`（navigator 每回一轮的纯计数器）。R2 明文把 hop **降格**为「支架供给强度的
    服务端保真信号」—— 它不是任何淡出机制的触发器（CX 的淡出是 scaffold_level＋教师确认制）。
  - **需求侧（本模块）**：U1–U7，测「学生有没有在承接支架」。
两块的关系用 **Spearman ρ** 报出，与该文真实部署类别的 ρ≈0.31–0.35 对标。

【符号约定，论文里必须写死】u = (3 − x) / 2，u ∈ [−1, +1]；序数 x 越小 uptake 越高。
u>0 表示学生主要在**承接支架**，u<0 表示学生在**主导对话流**。

【红线归属声明（与 research.ai_reply_stats 同一套）】
  ① 本模块是**研究量**，不进 ct 六维公式、不动 ct.FORMULA_VERSION、不写回 ct_events；
  ② **不存学生回复原文，学生原话也不经 API 出参** —— 见下面 index_events 的处理：
     ct_events.detail 的 40 字前缀只在**索引那一瞬间**参与词表判定，随即被换成
     「锚点名 + 有效字符数 + 是否可能被截断」三个派生量，原文不进入任何数据结构；
     学生**代码**原文同理（U4/U5，探索量）：project_versions.code 只在 index_versions
     内参与 difflib 行数统计，索引与出参只含增删行数等派生量，代码文本不出该函数；
  ③ **不下发学生端** —— uptake 是研究量，学生看到 = 被标签化。

【纯计算 + 一处 I/O】除 `load_events` / `load_f3_after_hint` 两个读函数外全是纯函数
（给定行 → 给定结果）。这样验收向量能直接喂进来，不必造库；也让「同意口径过滤」这类
**政策**留在端点里（与 ai_reply_stats 同一处），本模块只管算。本模块不含任何路由。

【时间与定序（决定了下面每一条判据的写法）】
全库时间戳是秒级：ct_events.ts、ai_reply_log.created_at 都来自 int(time.time())，
无亚秒字段。三张表各有独立 AUTOINCREMENT，**跨表同秒事件在数据层根本无法定序**；
即便同表，ct_events.id 反映的也只是服务端 INSERT 到达顺序（前端 ctApi.track 是
fire-and-forget、不 await），实测存量语料里同秒簇的 id 序已与因果序相悖。
因此：窗口一律取**半开区间 (t0, t0+Δ]**，同秒判为不可判定、单列计数（ties_at_t0_n），
绝不默认归入命中 —— 默认命中会系统性抬高 U1/U3，方向自利，违反 R2 的编码偏移纪律。
"""
import difflib
import re
import sqlite3

from app import reply_class, stats, store

# ============ 预注册常量（改这里等于改预注册，必须同步方法章）============

DELTA_MAIN = 180                      # Δ 主值（秒）
DELTA_SENSITIVITY = (60, 180, 600)    # R2 要求预注册的三值敏感性分析，一次全给
AI_HELP_PREFIX_LEN = 40               # ai.py:248 的 safe_msg[:40]，U2/U3 的唯一文本来源长度
U3_MIN_EFFECTIVE_CHARS = 8            # U3「前缀有效字符 ≥8」的阈值（R2 §2.1 表 U3 行）

# ---- U4/U5（探索量）判据常量。前置：提交 50a9de5（save_version 内容去重＋前端运行即
# 自动保存）。U4/U5 只出现在 by_delta.<Δ>.exploratory 下，与主报 U1/U2 物理分层，
# 绝不可写进结论章（FIELD_NOTES["exploratory"]）。----

U4_SMALL_CHANGE_MAX_LINES = 3
# U4 小改/大改分档线：变更行数（增＋删）≤3 为小改，>3 为大改（R2 §2.1 表 U4 行原文）。
# 分档只作描述性拆分、不进命中判定，无偏移方向问题。

U5_MIN_ADDED_LINES = 5
# U5「体积跳增」下限：单版新增行数 ≥5。理由：navigator 违规（D 类）给出的是**成段完整
# 代码**（reply_class 对 D 的判定对象），极少 <5 行；5 行以下的粘贴与学生自己写的小补丁
# 在行数上不可分。偏移方向（必须注释）：本阈值**漏掉**短段直接抄 → U5 是已知下界；
# 这个残余方向对研究**有利**（少报「违规回复被直接抄」），数据层无法消除，因此
# ① 本值预注册、不得看数后调整（调高只会更自利）；② FIELD_NOTES["u5"] 明写 U5 是下界。

U5_ADDED_OVER_REMOVED_RATIO = 2
# U5「体积跳增」形状：新增 > 删除×2。理由：区分「粘贴外来代码」（增远大于删）与
# 「重构自有代码」（增删相当）。偏移方向：把大删大增的重构排除出 U5，同样压低 U5
# （自利残余，同上一并披露、预注册钉死）。

# 行为承接的动作集合。**刻意不含 run 之外的 error**：error 不是学生的主动动作，
# 把它算成「承接了支架」等于把「又报了一次错」读成「学到了」。
ACTION_TYPES = ("run", "fix", "design_create")

# 本模块要读的 ct_events 类型全集（hop 是供给侧信号，一起取以免第二次查库）。
# error 只供 U5 的「无 error」判据用：index_events 给它**单开一份 errors 索引**，
# 绝不混进 actions —— 混进去会把「又报了一次错」算成 U1/U3 的行为承接，方向自利
# （见 ACTION_TYPES 注释）。扩了 error 之后 MAX_EVENTS 会更早触顶，events_truncated
# 的波及面相应变大（U2 分母与 U5 判据都可能不完整），端点 field_notes 如实说明。
UPTAKE_EVENT_TYPES = ("ai_help", "run", "fix", "design_create", "hop", "error")

MAX_EVENTS = 50000                    # 取数上限，超过即在出参里如实报 events_truncated
MAX_VERSIONS = 50000                  # project_versions 取数上限（U4/U5），同向纪律：取最近一批

# 预注册的基准线（R2「预注册的基准线与解释规则」）。
# **这里只放数字，绝不放判定**：0.30 / 0.36 是真实部署、未筛选、有支架对齐的保守基准，
# 「实测落在 0.30–0.40 即正常」「u ≤ 0 即判自变量操纵失败」是**论文里的解释规则**，
# 不是 API 的结论 —— 端点吐一个 "success": true 出来，等于让代码替答辩下结论。
# 上限锚 CoMTA u=0.68 刻意不列为目标值（作者自陈是筛选过的正面样例集 + 高动机人群）。
BASELINES = {
    "stemchat_u_mean": 0.30,          # StemChat u=0.30±0.41
    "recipe4u_u_mean": 0.36,          # RECIPE4U u=0.36±0.37
    "deployment_rho_range": [0.308, 0.346],   # 真实部署两类别的供给×需求秩相关
}

# ai.py:248 落库格式 f"[{role}] {safe_msg[:40]}"，role ∈ turtle|reviewer
_ROLE_PREFIX = re.compile(r"^\[(?:turtle|reviewer)\]\s")
# ai.py:339 的画图路径：f"[image] {req.prompt[:40]}"
_IMAGE_PREFIX = "[image] "
# guard 脱敏占位符（如 [phone_1] / [wechat_2]），会挤占 40 字预算
_PII_TOKEN = re.compile(r"\[[a-z_]+_\d+\]")
_WS = re.compile(r"\s+")


# ============ 纯函数：口径与判据 ============

def u_from_ordinal(x: int) -> float:
    """R2 的序数→uptake 映射 u = (3 − x) / 2（x∈[1,5] → u∈[−1,+1]）。

    只在这一处定义。词表文件 reply_class.u2_flag 刻意只回 0/1 不回 u ——
    两份 u 的定义迟早会分叉，而分叉的那一天没人会发现符号反了。
    """
    return (3 - x) / 2


def ai_help_body(detail) -> str | None:
    """从 ct_events.detail 取学生原话前缀本体（剥掉 "[role] " 前缀）。

    返回 None = **这条 ai_help 不属于 U2/U3 的分母**，目前只有一种情况：
    `[image] ` 开头的画图请求（ai.py:339）。两个必须排除的理由：
      ① 语用完全不同 —— 求生成一张图片，不是求编程帮助，混进来直接污染分母；
      ② 该路径落库用的是**未脱敏的 req.prompt 原文**（同函数 :331 送 LLM 用的却是
         已脱敏的 g["scrubbed"]），与 chat 路径 :248 的 safe_msg 口径不一致。
         「ai_help 的 40 字前缀已过 guard 脱敏」这一既有认定对 image 路径**不成立**，
         所以它连读都不该读进研究口径。
    """
    if detail is None:
        return None
    s = str(detail)
    if s.startswith(_IMAGE_PREFIX):
        return None
    return _ROLE_PREFIX.sub("", s, count=1)


def effective_len(body: str) -> int:
    """U3 的「前缀有效字符数」：剥掉 guard 脱敏占位符与全部空白后的字符数。

    为什么要剥占位符：40 字预算是**匿名化之后**的，
    「我手机13800138000…」脱敏后成「我手机[phone_1]…」，占位符白吃掉 9 个字符。
    把它算进有效长度，等于把一串被抹掉的手机号当成学生的实质表达，会让
    U3 的 +1 分支（「学生给出了实质回应」）虚高 —— 方向自利，不可接受。
    """
    return len(_WS.sub("", _PII_TOKEN.sub("", body or "")))


def in_window(t0: int, ts: int, delta: int) -> bool:
    """半开区间 (t0, t0+Δ]。ts == t0 一律**不算命中**，理由见模块 docstring 的定序段。"""
    return t0 < ts <= t0 + delta


# ============ 一处 I/O ============

def _conn():
    """按调用时刻读 store.DB_PATH（不做 `from app.store import DB_PATH` 的模块级绑定）。

    测试夹具是在 import app.main **之前**打的 DB_PATH 补丁，冻结绑定这次恰好也对；
    但那是靠导入顺序侥幸成立的，顺序一变就是「夹具写 A 库、端点读 B 库」的一批空结果。
    多一次属性查找换掉一整类难查的偶发失败。
    """
    c = sqlite3.connect(store.DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def load_events(student_ids: list[str] | None = None, limit: int = MAX_EVENTS) -> tuple[list[dict], bool]:
    """取 uptake 需要的 ct_events 行，返回 (行, 是否被截断)。

    student_ids 为**空列表**时返回空集 —— 「名单里一个人都没有」与「不按名单过滤」是两回事
    （照 store_ai_reply.rows 的同一条纪律：后者会把全平台数据算进某个课题）。

    取数方向照 store.ct_events 的教训：先 `ORDER BY ts DESC, id DESC LIMIT ?` 取**最近**
    一批再倒回正序。写成 `ORDER BY ts ASC LIMIT ?` 的话，一旦超过上限拿到的永远是最老那批，
    而丢失量与活跃度正相关 —— 越活跃的学生被砍得越狠，足以把组间结论算反。
    """
    if student_ids is not None and not student_ids:
        return [], False
    ph = ",".join("?" * len(UPTAKE_EVENT_TYPES))
    sql = (f"SELECT user_id, type, detail, ts, room_id, round_index, project_id FROM ct_events"
           f" WHERE type IN ({ph})")
    args: list = list(UPTAKE_EVENT_TYPES)
    if student_ids:
        sql += f" AND user_id IN ({','.join('?' * len(student_ids))})"
        args += student_ids
    sql += " ORDER BY ts DESC, id DESC LIMIT ?"
    args.append(int(limit) + 1)                 # 多取一条只为判断是否触顶
    try:
        with _conn() as c:
            rows = [dict(r) for r in c.execute(sql, args).fetchall()]
    except sqlite3.OperationalError:
        return [], False                         # 老库还没建表：空集，不是 500
    truncated = len(rows) > limit
    return list(reversed(rows[:limit])), truncated


def load_versions(student_ids: list[str] | None = None,
                  limit: int = MAX_VERSIONS) -> tuple[list[dict], bool]:
    """取 U4/U5 需要的版本行（JOIN projects 拿 owner_id），返回 (行, 是否被截断)。

    行里含 code 原文 —— **必须**立刻交给 index_versions 换成行数派生量（红线②），
    调用方不得把返回值存进任何长期结构，更不得让它靠近出参。
    student_ids 为空列表时返回空集（同 load_events：「名单里一个人都没有」≠「不过滤」）。
    端点层的正确用法是把**已过同意口径的回复学生名单**传进来 —— 版本行的同意过滤
    在取数名单上就完成了，未同意学生的版本根本不落地（U4/U5 的锚点都是回复行，
    无回复的学生不需要版本）。
    取数方向同 load_events：先 created_at DESC 取最近一批再倒回正序。被截断的版本链
    头部由 index_versions 靠 version_no 是否连续识别、按 no_baseline 单列，
    不会伪装成可判定。
    """
    if student_ids is not None and not student_ids:
        return [], False
    sql = ("SELECT p.owner_id, v.project_id, v.version_no, v.code, v.block_state, v.created_at"
           " FROM project_versions v JOIN projects p ON p.id = v.project_id")
    args: list = []
    if student_ids:
        sql += f" WHERE p.owner_id IN ({','.join('?' * len(student_ids))})"
        args += student_ids
    sql += " ORDER BY v.created_at DESC, v.id DESC LIMIT ?"
    args.append(int(limit) + 1)
    try:
        with _conn() as c:
            rows = [dict(r) for r in c.execute(sql, args).fetchall()]
    except sqlite3.OperationalError:
        return [], False                         # 老库还没建表：空集，不是 500
    truncated = len(rows) > limit
    return list(reversed(rows[:limit])), truncated


def load_f3_after_hint(room_id: str = "", student_ids: list[str] | None = None) -> list[str]:
    """U6 效标：把 obs_window.f3_after_hint（提示后处置二值，人工金标准）取出来供对照。

    只按 room_id / student_id 过滤：obs_window.study_id 是观察表自己的自由文本课题串
    （'obs-s1' 这种），与 store_study 的数字课题 id 不是一套键，硬 join 会静默取到空集。
    room_id 则是 obs_window 建表注释里写明的「与 ct_events / learning_round 同键」。
    """
    if student_ids is not None and not student_ids:
        return []
    sql = "SELECT f3_after_hint FROM obs_window WHERE f3_after_hint IS NOT NULL AND f3_after_hint<>''"
    args: list = []
    if room_id:
        sql += " AND room_id=?"
        args.append(room_id)
    if student_ids:
        sql += f" AND student_id IN ({','.join('?' * len(student_ids))})"
        args += student_ids
    try:
        with _conn() as c:
            return [str(r[0]) for r in c.execute(sql, args).fetchall()]
    except sqlite3.OperationalError:
        return []


# ============ 索引：学生原话在这一步就被换成派生量 ============

def index_events(event_rows: list[dict]) -> dict:
    """把 ct_events 行拆成 uptake 要用的几份索引。

    **红线②的执行点在这里**：ai_help 的 40 字前缀只在本函数内部参与词表判定，
    索引里存的是「命中的锚点名 / 有效字符数 / 是否可能被截断」三个派生量，
    原文出了这个函数就不存在了。下游任何函数即使想泄漏也拿不到文本。

    runs / errors 是 U5 专用的两份时刻表：run 同时进 actions（U1/U3 的既有口径不动）；
    error **只**进 errors —— 它不是学生的主动动作，混进 actions 会把「又报了一次错」
    算成行为承接（方向自利，非法），见 ACTION_TYPES 注释。
    """
    helps: dict[str, list[dict]] = {}
    actions: dict[str, list[dict]] = {}
    # U5 复核 P1-2：run/error 行前端本就带 project_id（ctApi.track 传 currentId），
    # 之前索引只存 ts，跨作品的 error 会否决另一作品的干净命中 —— 压低 U5 = 自利方向。
    # 现存 (ts, project_id) 对；project_id 可能为 NULL（历史行/未开作品），匹配规则见 U5 消费处。
    runs: dict[str, list[tuple]] = {}
    errors: dict[str, list[tuple]] = {}
    hops: dict[tuple, int] = {}
    for e in event_rows:
        sid = e.get("user_id")
        etype = e.get("type")
        if etype == "ai_help":
            body = ai_help_body(e.get("detail"))
            if body is None:
                continue                          # [image] 路径：不进分母，见 ai_help_body
            helps.setdefault(sid, []).append({
                "ts": int(e["ts"]),
                "room_id": e.get("room_id"),
                "round_index": e.get("round_index"),
                "u2_anchors": reply_class.hits_executive_help(body),
                "eff_len": effective_len(body),
                # 去掉角色前缀后仍占满 40 字 → 学生原话很可能在这里被切断了。
                # 这是 U2 最大的漏源（实测长求助里「请求动词」常落在第 40 字之后），
                # 必须作为「U2 命中率是下界」的证据一并报出。
                "maybe_truncated": len(body) >= AI_HELP_PREFIX_LEN,
            })
        elif etype in ACTION_TYPES:
            actions.setdefault(sid, []).append({"ts": int(e["ts"]), "room_id": e.get("room_id")})
            if etype == "run":
                runs.setdefault(sid, []).append((int(e["ts"]), e.get("project_id")))
        elif etype == "error":
            errors.setdefault(sid, []).append((int(e["ts"]), e.get("project_id")))
        elif etype == "hop":
            key = (sid, e.get("room_id"), e.get("round_index"))
            hops[key] = hops.get(key, 0) + 1
    for d in (helps, actions):
        for v in d.values():
            v.sort(key=lambda r: r["ts"])
    for d2 in (runs, errors):
        for v2 in d2.values():
            v2.sort(key=lambda t: t[0])
    return {"helps": helps, "actions": actions, "hops": hops, "runs": runs, "errors": errors}


def diff_line_counts(old: str | None, new: str | None) -> tuple[int, int]:
    """行级 diff 的 (新增行数, 删除行数)。stdlib difflib，刻意不做语义 diff（探索量不值得）。

    不拿 unified_diff 的文本输出数 +/−：学生代码里以 "++" 开头的行经它加前缀后与
    "+++" 文件头无法区分。SequenceMatcher 的 opcodes 数的是行区间，无此歧义。
    """
    a = (old or "").splitlines()
    b = (new or "").splitlines()
    added = removed = 0
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if tag in ("replace", "delete"):
            removed += i2 - i1
        if tag in ("replace", "insert"):
            added += j2 - j1
    return added, removed


def index_versions(version_rows: list[dict]) -> dict:
    """把版本行换成 U4/U5 要用的**派生量**索引：{owner_id: {project_id: [entry,...]}}。

    **红线②的第二个执行点**：project_versions.code 只在本函数内参与 difflib 行数统计，
    entry 里只有 {ts, prev_ts, added, removed, blocks} 五个派生量，代码文本出了本函数
    就不存在了 —— 下游 compute 层即使想把 diff 片段塞进出参也拿不到文本。

    entry 口径：
      - added/removed：**相对上一版**（version_no−1）的行级 diff。相邻对 diff 与锚点
        t0 无关、可预先算好；compute 层再按窗口纪律挑「前驱落在 t0 之前」的那一对当
        基线 diff —— 与「基线 = t0 之前该生该作品的最新版本」完全等价（save_version
        单调递增发号，版本序即时间序），且索引里不必保留任何代码文本。
      - prev_ts=None：无可用前驱（version_no==1，或版本链被取数上限截断 ——
        「前驱没取到」与「前驱不存在」在此都判 no_baseline 单列，绝不当 0 diff 硬算）。
      - blocks：本版或前驱带 block_state（Blockly 产物）。一次积木移动可致生成代码
        整段重排，行级 diff 与手写不可比 —— 命中时单列计数（FIELD_NOTES["u4"] 上限声明）。
    """
    grouped: dict[tuple, list[dict]] = {}
    for r in version_rows:
        grouped.setdefault((r.get("owner_id"), r.get("project_id")), []).append(r)
    chains: dict[str, dict] = {}
    for (owner, pid), rows in grouped.items():
        rows.sort(key=lambda r: int(r.get("version_no") or 0))
        entries = []
        for i, r in enumerate(rows):
            prev = rows[i - 1] if i > 0 else None
            if prev is not None and int(prev.get("version_no") or 0) != int(r.get("version_no") or 0) - 1:
                prev = None                       # 链被截断：前驱未取到，按无基线处理
            own_lines = None
            if prev is None:
                added = removed = None
                # 首版行数（拍板 Q2，2026-08-18）：新建作品直接粘贴是**最典型**的违规后
                # 整段卸载，但首版无基线、预注册规则把它记 no_baseline 单列 —— 为了不把
                # 信号整个丢掉，这里记下首版自身的行数，U5 端以 first_version_jump_n
                # **单独计数披露**（不进 rate：首版也可能是模板+正常起步，需人工复核）。
                own_lines = len([ln for ln in (r.get("code") or "").splitlines() if ln.strip()])
            else:
                added, removed = diff_line_counts(prev.get("code"), r.get("code"))
            entries.append({
                "ts": int(r.get("created_at") or 0),
                "prev_ts": int(prev.get("created_at") or 0) if prev is not None else None,
                "added": added, "removed": removed, "own_lines": own_lines,
                "blocks": bool(r.get("block_state")) or bool(prev is not None and prev.get("block_state")),
            })
        chains.setdefault(owner, {})[pid] = entries
    return chains


def _round_key(row: dict) -> tuple:
    """轮级聚合键 = (student_id, room_id, round_index)。

    R2 写的是 (student_id, round_index)，但 round_index 在 CX 里只在**房间内**唯一
    （learning_round 按房发号），跨房间会重号 —— 只按学生+轮号聚合会把两个房间的第 1 轮
    合成一轮，u_round 变成两段无关对话的平均数。多带一个 room_id 是纯粹的修正，不改口径。
    """
    return (row.get("student_id"), row.get("room_id"), row.get("round_index"))


# ============ U1 / U3 / U7 / U4 / U5：与 Δ 有关 ============

def _judge_anchor_versions(chains: dict, t0: int, delta: int) -> dict:
    """单锚点的版本判定素材（U4/U5 共用的窗口×基线纪律）。纯函数。

    返回 {"inwin_project_n", "tie", "stale", "no_baseline", "valid": {pid: [entry,...]}}：
      - valid 里的 entry 都是「窗口内新版本 × 可用基线」的合法 diff：前驱要么落在
        [t0−Δ, t0)（真正的基线），要么本身就在窗口内（窗内连续编辑，两端都晚于 t0）。
      - tie：该生任一版本恰与 t0 同秒（窗口归属与基线身份都无法定序），或某窗内版本的
        前驱恰在 t0 同秒 —— 一律不可判定、单列（同全模块的同秒纪律）。
      - stale：基线早于 t0−Δ —— 把提示前很久的编辑算成承接会系统性抬高 U4，
        方向自利、非法；单列剔除的反向（压低 U4）对研究不利，合法。
      - no_baseline：窗内版本没有可用前驱（首版，或链被截断）。
    tie / stale / no_baseline 都**不算 0 也不算 1**，由调用方按优先级单列计数。
    """
    out = {"inwin_project_n": 0, "tie": False, "stale": False,
           "no_baseline": False, "first_version_max_lines": 0, "valid": {}}
    for pid, chain in chains.items():
        if any(e["ts"] == t0 for e in chain):
            out["tie"] = True
        iw = [e for e in chain if in_window(t0, e["ts"], delta)]
        if not iw:
            continue
        out["inwin_project_n"] += 1
        for e in iw:
            if e["prev_ts"] is None:
                out["no_baseline"] = True
                if e.get("own_lines"):
                    out["first_version_max_lines"] = max(out["first_version_max_lines"], e["own_lines"])
            elif e["prev_ts"] == t0:
                out["tie"] = True
            elif e["prev_ts"] < t0 - delta:
                out["stale"] = True
            else:
                out["valid"].setdefault(pid, []).append(e)
    return out


def compute_delta_block(reply_rows: list[dict], idx: dict, delta: int,
                        versions_idx: dict | None = None) -> dict:
    """给定 Δ 算 U1 / U3 / U7 与两条 Spearman ρ，外加探索量 U4/U5。纯函数。

    U1（主报，最硬）：对每条 asks≥1 的 navigator 回复，若 (t0, t0+Δ] 内该生出现
      ≥1 条 run/fix/design_create **且窗口内无新 ai_help** → 1，否则 0。
      「无新 ai_help」这一条是 U1 的要害：它把「学生自己动手了」与「学生转头又去问 AI」
      分开，没有它 U1 会把连问三轮也算成承接。触发本轮回复的那条 ai_help 落在 t0 之前
      （ai.py 先记 ai_help 再等 LLM 回包），半开区间天然把它排除在外。

    U3（条件主报）：navigator 回复含 RQ/CQ/EQ 任一且 asks≥1 时看学生的下一步。
      四个分支的取值即 u 本身（+1 / −1 / 0），不再过 u_from_ordinal。
      「有下一条 ai_help 但有效字符 <8」记 0 而不是 +1：一句「嗯」「哦」既不是承接也不是
      卸载，判 +1 会把敷衍读成承接（自利），判 −1 又会把它读成拒绝支架（矫枉过正）。

    U7（条件报）：按 (student, room, round) 对 U3 的 {−1,0,1} 取均值 → u_round ∈[−1,1]，
      与原文 per-chat mean 同口径。round_index 为 NULL 的锚点无法归轮，单列计数不静默丢弃。

    U4/U5（**探索量**，与主报量物理分层在返回值 exploratory 键下，绝不混排）：
      versions_idx 是 index_versions 的产物（只含行数派生量，无代码文本）；
      None 视作无版本数据，此时 U4/U5 只会给出 0 或单列，绝不臆造命中。
      逐条判据与偏移方向见 FIELD_NOTES["u4"] / ["u5"] 与各常量注释。
    """
    helps, actions = idx["helps"], idx["actions"]

    # ---- U1 ----
    u1_anchors = [r for r in reply_rows if (r.get("asks") or 0) >= 1]
    u1_hit = u1_room_consistent = u1_ties = 0
    for a in u1_anchors:
        t0, sid = int(a["created_at"]), a["student_id"]
        acts = [e for e in actions.get(sid, []) if in_window(t0, e["ts"], delta)]
        has_new_help = any(in_window(t0, h["ts"], delta) for h in helps.get(sid, []))
        if any(e["ts"] == t0 for e in actions.get(sid, [])) or \
           any(h["ts"] == t0 for h in helps.get(sid, [])):
            u1_ties += 1                          # 同秒 = 不可判定，如实单列，不计进命中
        if acts and not has_new_help:
            u1_hit += 1
            # 行为事件**不按 room 过滤**（见 field_notes）：IDE 侧 run/fix 的 room_id 取自
            # localStorage 残留值，可能是学生早已离开的房间；按它过滤会系统性丢真阳。
            # 代价是跨房行为可能被算进来 → U1 偏高（自利方向），故把「room 也对得上」的
            # 子计数一并报出，当作 U1 的保守下界，让读表的人自己夹逼。
            if a.get("room_id") and any(e.get("room_id") == a["room_id"] for e in acts):
                u1_room_consistent += 1

    # ---- U3 ----
    u3_anchors = [r for r in reply_rows
                  if (r.get("asks") or 0) >= 1 and (r.get("rq") or r.get("cq") or r.get("eq"))]
    u3_by_u = {"-1": 0, "0": 0, "1": 0}
    u3_branch = {"next_help_executive": 0, "next_help_substantive": 0,
                 "next_help_too_short": 0, "no_help_but_action": 0, "nothing": 0}
    per_round: dict[tuple, list] = {}
    u3_no_round = 0
    for a in u3_anchors:
        t0, sid = int(a["created_at"]), a["student_id"]
        nxt = next((h for h in helps.get(sid, []) if in_window(t0, h["ts"], delta)), None)
        if nxt is not None:
            if nxt["u2_anchors"]:
                u, branch = -1, "next_help_executive"
            elif nxt["eff_len"] >= U3_MIN_EFFECTIVE_CHARS:
                u, branch = 1, "next_help_substantive"
            else:
                u, branch = 0, "next_help_too_short"
        elif any(in_window(t0, e["ts"], delta) for e in actions.get(sid, [])):
            u, branch = 1, "no_help_but_action"
        else:
            u, branch = 0, "nothing"
        u3_by_u[str(u)] += 1
        u3_branch[branch] += 1
        if a.get("round_index") is None:
            u3_no_round += 1
        else:
            per_round.setdefault(_round_key(a), []).append(u)

    n1, n3 = len(u1_anchors), len(u3_anchors)
    # n=0 时占比/均值一律 None 而不是 0.0（照抄 ai_reply_stats 的纪律）：
    # 0.0 在 u 的量纲上是一个**可解读的真值**（学生既不承接也不主导），
    # 用它冒充「一条样本都没有」会被直接读成「干预完全没生效」。
    u1_rate = round(u1_hit / n1, 4) if n1 else None
    u3_mean = round(sum(k_ * v for k_, v in
                        ((-1, u3_by_u["-1"]), (0, u3_by_u["0"]), (1, u3_by_u["1"]))) / n3, 3) \
        if n3 else None

    # ---- U7 ----
    u_rounds = {k: round(sum(v) / len(v), 3) for k, v in per_round.items()}
    vals = list(u_rounds.values())
    u7_mean = round(sum(vals) / len(vals), 3) if vals else None

    # ---- 供给侧 × 需求侧的秩相关（R2「hop 的正确定位」）----
    # 两条都按**轮**配对：hop 与 ai_help 只有落在同一轮同一房才配得上对（P0-A 的全部意义）。
    scaffold_num: dict[tuple, int] = {}
    scaffold_den: dict[tuple, int] = {}
    for r in reply_rows:
        if r.get("round_index") is None:
            continue
        k = _round_key(r)
        scaffold_den[k] = scaffold_den.get(k, 0) + 1
        if r.get("rq") or r.get("cq") or r.get("eq"):
            scaffold_num[k] = scaffold_num.get(k, 0) + 1
    keys = sorted(u_rounds, key=lambda t: tuple(str(x) for x in t))
    hop_x = [idx["hops"].get(k, 0) for k in keys]
    sca_x = [scaffold_num.get(k, 0) / scaffold_den[k] for k in keys if scaffold_den.get(k)]
    sca_y = [u_rounds[k] for k in keys if scaffold_den.get(k)]
    hop_y = [u_rounds[k] for k in keys]

    # ---- U4（探索量）：代码承接 ----
    # 锚点 = U1 锚点（asks≥1 的 navigator 回复）：承接的对象是支架提问，与 U1 同口径，
    # 不另造第二套锚点定义。版本不按 room 过滤（版本表无 room 概念，同 U1 行为事件的理由）。
    vchains = versions_idx or {}
    u4_hit = u4_judged = u4_small = u4_big = u4_blocks = 0
    u4_tie = u4_stale = u4_nobase = u4_multi = 0
    u4_cm_judged = u4_cm_hit = 0        # code-mode 子率（拍板 Q5）：窗内合法对全不涉积木的锚点
    for a in u1_anchors:
        t0, sid = int(a["created_at"]), a["student_id"]
        j = _judge_anchor_versions(vchains.get(sid, {}), t0, delta)
        if j["inwin_project_n"] > 1:
            # ai_help/回复行无 project_id，只能经 owner 反查名下全部作品；
            # 「任一作品命中即算」使 U4/U5 偏高（自利方向）——歧义锚点单列披露，读数夹逼。
            u4_multi += 1
        proj_changed = {pid: sum(e["added"] + e["removed"] for e in es)
                        for pid, es in j["valid"].items()}
        hit_pids = [pid for pid, es in j["valid"].items()
                    if any(e["added"] + e["removed"] >= 1 for e in es)]
        if hit_pids:
            u4_hit += 1
            u4_judged += 1
            # 分档取命中作品里窗口内合法 diff 的变更行数之和（窗口内总编辑量）的最大者；
            # 中途改了又改回会把「和」推高 → 偏向大改，分档不进命中判定，仅描述用。
            changed = max(proj_changed[pid] for pid in hit_pids)
            if changed <= U4_SMALL_CHANGE_MAX_LINES:
                u4_small += 1
            else:
                u4_big += 1
            if any(e["blocks"] for pid in hit_pids for e in j["valid"][pid]):
                u4_blocks += 1
            # code-mode 子率：任一窗内合法对涉积木即整锚排除（Blockly 生成代码的行级
            # diff 与手写不可比 —— 混排会让子率失去「可解释子群」的意义）
            if not any(e["blocks"] for es in j["valid"].values() for e in es):
                u4_cm_judged += 1
                u4_cm_hit += 1
        elif j["tie"]:
            u4_tie += 1
        elif j["stale"]:
            u4_stale += 1
        elif j["no_baseline"]:
            u4_nobase += 1
        else:
            u4_judged += 1        # 可判定的 0：窗内无新版本，或新版本只动了积木没动代码
            if not any(e["blocks"] for es in j["valid"].values() for e in es):
                u4_cm_judged += 1

    # ---- U5（探索量）：违规后卸载 ----
    # 锚点 = d=1 或 has_code_block=1 的 navigator 回复（触发侧字段齐备，R2 表 U5 行）。
    u5_anchors = [r for r in reply_rows if (r.get("d") or r.get("has_code_block"))]
    u5_hit = u5_judged = u5_blocks = 0
    u5_tie = u5_stale = u5_nobase = u5_multi = u5_run_err_tie = 0
    u5_cm_judged = u5_cm_hit = 0        # code-mode 子率（拍板 Q5）
    u5_first_jump = 0                   # 首版即跳增的锚点数（拍板 Q2：披露不进 rate）
    for a in u5_anchors:
        t0, sid = int(a["created_at"]), a["student_id"]
        j = _judge_anchor_versions(vchains.get(sid, {}), t0, delta)
        if j["inwin_project_n"] > 1:
            u5_multi += 1
        runs = idx["runs"].get(sid, [])
        errors = idx["errors"].get(sid, [])
        hit = run_err_tie = hit_blocks = False
        for pid, es in j["valid"].items():
            # 作品匹配规则（U5 复核 P1-2）。版本方 pid 恒非空；事件方 project_id 可能 NULL。
            # - run：可辨识且不同作品 → 排除（B 作品的 run 不能充当 A 的「立即 run」，事实性修正）；
            #   不可辨识（NULL）→ 计入。回退方向多记 run = U5 偏高 = 对研究不利，合法。
            # - error：**仅**可辨识且同作品才否决/判同秒 —— 不可辨识的 error 不否决。
            #   回退方向少 veto = U5 偏高 = 合法；反着做（NULL 也 veto）会压低 U5，自利非法。
            p_runs = [ts for ts, rp in runs if rp is None or rp == pid]
            p_errors = [ts for ts, ep in errors if ep == pid]
            for e in es:
                if not (e["added"] >= U5_MIN_ADDED_LINES
                        and e["added"] > e["removed"] * U5_ADDED_OVER_REMOVED_RATIO):
                    continue                     # 不是体积跳增
                # 「立即 run」：run.ts ≥ 版本 created_at 且在窗内，**含同秒** ——
                # 前端 run() 现已 `await autoSave()`（IdeView，U5 复核 P1-1）：版本先落、
                # 代码后跑由 await **构造保证**，不再是统计性成立（这是全模块唯一一处
                # 同秒可判的例外；且方向是多记 U5 = 对研究不利，合法）。
                cand = [ts for ts in p_runs if e["ts"] <= ts <= t0 + delta]
                if not cand:
                    continue                     # 跳增但没有立即 run → 不构成卸载证据
                tr = cand[0]                     # 「立即」= 版本落地后的第一次 run
                if any(tr < ts <= t0 + delta for ts in p_errors):
                    continue                     # 抄进来跑不通 → 不是无摩擦卸载，判 0
                if any(ts == tr for ts in p_errors):
                    run_err_tie = True           # run 与 error 同秒：这条 run 干不干净无法定序
                    continue
                hit = True
                hit_blocks = hit_blocks or e["blocks"]
        _no_blocks = not any(e["blocks"] for es in j["valid"].values() for e in es)
        if hit:
            u5_hit += 1
            u5_judged += 1
            if hit_blocks:
                u5_blocks += 1
            if _no_blocks:
                u5_cm_judged += 1
                u5_cm_hit += 1
        elif run_err_tie:
            u5_run_err_tie += 1
        elif j["tie"]:
            u5_tie += 1
        elif j["stale"]:
            u5_stale += 1
        elif j["no_baseline"]:
            u5_nobase += 1
        else:
            u5_judged += 1
            if _no_blocks:
                u5_cm_judged += 1
        # 首版跳增（拍板 Q2）：无基线的窗内首版行数达到跳增阈值 —— 最典型的整段粘贴
        # 形态，但首版也可能是模板+正常起步，故**只披露计数、不进 rate**，留人工复核。
        if j["first_version_max_lines"] >= U5_MIN_ADDED_LINES:
            u5_first_jump += 1

    n4, n5 = len(u1_anchors), len(u5_anchors)
    # rate 的分母是 judged_n（可判定的 0/1），单列（tie/stale/no_baseline/run_err_tie）
    # 不进分母；judged_n=0 时一律 None 不返 0.0（同全模块纪律）。
    u4_rate = round(u4_hit / u4_judged, 4) if u4_judged else None
    u5_rate = round(u5_hit / u5_judged, 4) if u5_judged else None

    return {
        "delta_sec": delta,
        "u1": {"n": n1, "hit_n": u1_hit, "rate": u1_rate,
               "room_consistent_hit_n": u1_room_consistent, "ties_at_t0_n": u1_ties},
        "u3": {"n": n3, "by_u": u3_by_u, "mean_u": u3_mean, "branch_n": u3_branch,
               "dropped_no_round_index_n": u3_no_round},
        "u7": {"n_rounds": len(vals), "mean_u_round": u7_mean,
               "sd_u_round": stats.sd(vals) if len(vals) >= 2 else None,
               "u_round_values": sorted(vals)},
        "spearman": {
            # ρ 与 n_pairs **必须成对出现**：None 有两种意思（样本不足 / 秩零方差），
            # 没有 n_pairs 读表的人分不清是哪一种。
            "hop_vs_u_round": {"rho": stats.spearman_rho(hop_x, hop_y), "n_pairs": len(hop_y)},
            "scaffold_vs_u_round": {"rho": stats.spearman_rho(sca_x, sca_y),
                                    "n_pairs": len(sca_y)},
        },
        # 探索量与主报量**物理分层**：结论章只可引用 u1/u2/u3/u7，本块只进讨论/附录，
        # 且引用时必须连同各单列计数一起给出（FIELD_NOTES["exploratory"]）。
        "exploratory": {
            "u4": {
                "exploratory": True,
                "n_anchors": n4, "judged_n": u4_judged,
                "hit_n": u4_hit, "rate": u4_rate,
                "small_change_hit_n": u4_small, "big_change_hit_n": u4_big,
                "ties_at_t0_n": u4_tie, "stale_baseline_n": u4_stale,
                "no_baseline_n": u4_nobase,
                "multi_project_ambiguous_n": u4_multi,
                "blockly_involved_hit_n": u4_blocks,
                # code-mode 子率（拍板 Q5）：敏感性附录量，不替代主 rate
                "code_mode": {"judged_n": u4_cm_judged, "hit_n": u4_cm_hit,
                              "rate": round(u4_cm_hit / u4_cm_judged, 4) if u4_cm_judged else None},
            },
            "u5": {
                "exploratory": True,
                "n_anchors": n5, "judged_n": u5_judged,
                "hit_n": u5_hit, "rate": u5_rate,
                "ties_at_t0_n": u5_tie, "stale_baseline_n": u5_stale,
                "no_baseline_n": u5_nobase,
                "first_version_jump_n": u5_first_jump,
                "run_error_same_second_n": u5_run_err_tie,
                "multi_project_ambiguous_n": u5_multi,
                "blockly_involved_hit_n": u5_blocks,
                "code_mode": {"judged_n": u5_cm_judged, "hit_n": u5_cm_hit,
                              "rate": round(u5_cm_hit / u5_cm_judged, 4) if u5_cm_judged else None},
            },
        },
    }


# ============ U2：与 Δ 无关 ============

def compute_u2(idx: dict, room_id: str = "") -> dict:
    """U2 执行型求助（主报，最硬）：对每条 ai_help 的 40 字前缀跑闭合词表 →
    命中即序数 5 → u = (3−5)/2 = −1。

    **U2 不含时间窗，与 Δ 无关**，所以它不在 by_delta 里重复 —— 在三个 Δ 块里各印一份
    一模一样的数字，只会让人以为它随 Δ 变化。

    room 过滤只施于 U2 的分母（ai_help 的 room_id 是服务端 ai.py 写的，可信），
    不施于 U1 的行为事件（IDE 侧 room_id 是 localStorage 残留值，见 compute_delta_block）。
    """
    rows = [h for sid in idx["helps"] for h in idx["helps"][sid]]
    if room_id:
        rows = [h for h in rows if h.get("room_id") == room_id]
    n = len(rows)
    hit = [h for h in rows if h["u2_anchors"]]
    by_anchor = {name: 0 for name in reply_class.U2_ANCHOR_NAMES}   # 计数为 0 的锚也要显式出现
    refusal = 0
    for h in hit:
        for name in h["u2_anchors"]:
            by_anchor[name] = by_anchor.get(name, 0) + 1
        if any(name in reply_class.U2_REFUSAL_ANCHORS for name in h["u2_anchors"]):
            refusal += 1
    return {
        "n": n,
        "hit_n": len(hit),
        "rate": round(len(hit) / n, 4) if n else None,
        "u_when_hit": u_from_ordinal(5),          # −1.0，把序数映射钉在出参里，防止口径漂移
        "by_anchor": by_anchor,
        "refusal_family_n": refusal,
        "truncation_suspect_n": sum(1 for h in rows if h["maybe_truncated"]),
    }


# ============ 供给侧块（manipulation check）============

def compute_supply(reply_rows: list[dict], idx: dict, room_id: str = "") -> dict:
    """自变量保真度块：ai_reply_log 四分类 + hop。

    口径与 GET /api/research/ai_reply_stats 完全一致（occurrence 是多标二值主口径，
    一条回复可同时计进多类，**四者之和≠1**，这是对的）。这里重算而不是内部调那个端点，
    是为了让供给侧与需求侧共用**同一批**同意过滤后的行；占比结论的**唯一发布口径**
    仍然是 ai_reply_stats，本块只为让 ρ 的两端可追溯。
    """
    n = len(reply_rows)
    occ = {k: 0 for k in ("cq", "eq", "rq", "d")}
    for r in reply_rows:
        for k in occ:
            occ[k] += 1 if r.get(k) else 0
    hops = idx["hops"]
    if room_id:
        hops = {k: v for k, v in hops.items() if k[1] == room_id}
    hop_total = sum(hops.values())
    return {
        "n_navigator_replies": n,
        "occurrence_n": occ,
        "occurrence": {k: (round(v / n, 4) if n else None) for k, v in occ.items()},
        "violation_n": occ["d"],
        "violation_rate": round(occ["d"] / n, 4) if n else None,
        "hop_total": hop_total,
        "hop_rounds_n": len(hops),
        "hop_mean_per_round": round(hop_total / len(hops), 3) if hops else None,
    }


# ============ U6 效标 ============

def compute_u6(values: list[str]) -> dict:
    """U6 人工金标准：obs_window.f3_after_hint 的分布，**只取出来供对照**。

    刻意**不算** AC1 / κ：真实人工标注语料现在还不存在，对一批空的或单值的标注算出来的
    一致性是假的，而一旦有个数字落进出参，它就会被抄进方法章。R2 的降级规则
    （U3 与 U6 金标准 AC1 < 0.40 → 放弃 U7 连续化、只报 U1/U2）要等真实标注到位后才能判，
    这里把它落成一个显式字段 gate_pending，明说「还没到能判的时候」。
    """
    dist: dict[str, int] = {}
    for v in values:
        dist[v] = dist.get(v, 0) + 1
    return {
        "n": len(values),
        "distribution": dist,
        "agreement_ac1": None,
        "gate_pending": True,
    }


# ============ U4/U5 登记处：曾「不可做」，前置补上后翻转为「已作为探索量实现」 ============

# 本登记处曾如实记录「U4/U5 在当时的数据结构下算不出来」（分母由『学生是否恰好点了保存』
# 决定、无去重、无逐次码态等）。提交 50a9de5 补上了两条前置 ——
# ① store.save_version **内容去重**（「有新版本」从「学生是否恰好点了保存」变成
#    「代码是否变了」的函数）；② 前端**运行即自动保存**（每次 run 落一版码态，
#    版本节奏与行为流对齐）—— 之后两项已实现为**探索量**，落在 by_delta.<Δ>.exploratory
#    下，与主报 U1/U2 物理分层。
# 拍板 Q3（2026-08-18）：登记键由 not_computed 更名 metric_registry、schema 升 v2。
# 理由：U4/U5 实装后登记内容是「计算出处与残余上限」，键名 not_computed 与内容相反 ——
# 论文附录里出现 not_computed:{computed:true} 是永久的自我矛盾。现在平台尚无外部消费方
# （真实数据 0 行），这是把形状改对的最便宜时刻；tests 同步更新。登记内容
# 翻转为「已实现＋残余上限」。当年 blockers 里**仍然成立**的约束（归属歧义、跨表同秒、
# 基线陈旧、Blockly diff 不可比）没有消失，只是从「不可做的理由」降格为「读数时的上限」——
# 已移入 FIELD_NOTES["u4"]/["u5"] 与出参的各单列计数。
METRIC_REGISTRY = {
    "U4": {
        "label": "代码承接（Δ 内新版本且行级 diff ≥1 行；再分小改≤3行/大改>3行）",
        "computed": True,
        "exploratory": True,
        "where": "by_delta.<Δ>.exploratory.u4",
        "unblocked_by": "提交 50a9de5：save_version 内容去重 ＋ 前端运行即自动保存",
        "remaining_limits": "归属歧义（ai_help/回复行无 project_id，经 owner 反查、任一作品"
                            "命中即算，方向自利 → multi_project_ambiguous_n 单列）；"
                            "跨表同秒不可定序（ties_at_t0_n 单列）；基线陈旧/缺失单列"
                            "（stale_baseline_n / no_baseline_n，不算 0 也不算 1）；"
                            "Blockly 生成代码的行级 diff 与手写不可比"
                            "（blockly_involved_hit_n 单列）。详见 field_notes.u4。",
    },
    "U5": {
        "label": "违规后卸载（Δ 内代码体积跳增＋立即 run＋无 error）",
        "computed": True,
        "exploratory": True,
        "where": "by_delta.<Δ>.exploratory.u5",
        "unblocked_by": "同 U4：提交 50a9de5 的逐次码态（运行即自动保存）正是当年登记的"
                        "前置采集；到位后 U5 成为 CX 相对原文的方法学增量（原文测不出）",
        "remaining_limits": "跳增阈值（新增≥5 且新增>删除×2）会漏掉短段直接抄 → "
                            "U5 是已知下界，残余方向对研究有利，故阈值预注册不可事后调；"
                            "run/error 同秒不可定序（run_error_same_second_n 单列）；"
                            "自动保存静默失败时版本缺失 → 该次卸载测不到（又一漏源，同为下界方向）；"
                            "error 的 project_id 为 NULL 时不参与否决（回退方向推高 U5，合法）；"
                            "其余单列同 U4。详见 field_notes.u5。",
    },
}


# ============ field_notes（逐字段口径说明，中文）============

FIELD_NOTES = {
    "u_symbol": "u = (3 − x) / 2，u∈[−1,+1]，序数 x 越小 uptake 越高。"
                "u>0 = 学生主要在承接支架；u<0 = 学生在主导对话流。全平台只此一处定义。",
    "delta_sec": f"时间窗 Δ。主值 {DELTA_MAIN} 秒，同时给 {list(DELTA_SENSITIVITY)} 三值敏感性分析"
                 "（R2 要求预注册）。窗口是半开区间 (t0, t0+Δ]。",
    "ties_at_t0_n": "与锚点**同秒**的候选事件数。全库时间戳是秒级且跨表 id 独立，同秒无法定序，"
                    "故判为不可判定、单列计数，**不计进命中** —— 默认计进去会抬高 U1，方向自利。",
    "u1": "行为承接（主报，最硬）：asks≥1 的 navigator 回复后 Δ 内有 run/fix/design_create "
          "且**无新 ai_help** → 1。行为事件按「学生+时间窗」匹配，**不按 room 过滤** —— "
          "IDE 侧 run/fix 的 room_id 取自 localStorage 残留值，按它过滤会系统性丢真阳。"
          "代价是跨房行为可能被算进来（U1 偏高，自利方向），故同时报 room_consistent_hit_n "
          "作为保守下界，两者夹逼着读。",
    "u2": "执行型求助（主报，最硬）：ai_help 的 40 字前缀命中闭合词表 → 序数 5 → u=−1。"
          "**与 Δ 无关**，故不在 by_delta 内重复。词表与四分类同在 reply_class.py 管理。",
    "u2.by_anchor": "逐锚点命中数（闭合词表常量，非学生原话切片）。计数为 0 的锚也显式出现。",
    "u2.refusal_family_n": "「别问了/不要问/别提问」一族的子计数。**口径提醒**：这一族捕的是"
                           "「拒绝支架」而非「索要产物」，按 R2 的序数 5 锚点它是真阳，"
                           "但按「执行型求助」这个中文标签名不副实，故单列以便评审看清 U2 的组成。",
    "u2.truncation_suspect_n": "去掉角色前缀后仍占满 40 字的 ai_help 条数 —— 学生原话很可能在此被截断。"
                               "这是 U2 最大的漏源（长求助里请求动词常落在第 40 字之后），"
                               "**U2 命中率因此是真实执行型求助的已知下界**。"
                               "词表本身也刻意留漏（不收「帮我改/帮我看」，见 reply_class.py 该锚注释）。"
                               "两处偏移都使 uptake 显得更高，方向对 CX 不利，故合法。",
    "u3": "追问响应（条件主报）：navigator 回复含 RQ/CQ/EQ 且 asks≥1 时看学生下一步。"
          "Δ 内下一条 ai_help 不命中 U2 且有效字符≥8 → +1；命中 U2 → −1；"
          "无下一条 ai_help 但有 U1 行为 → +1；皆无 → 0。"
          "「有下一条但有效字符<8」记 0（敷衍既不是承接也不是卸载）。"
          "有效字符 = 剥掉 guard 脱敏占位符与空白后的字符数。",
    "u7": "轮级聚合（条件报）：按 (student_id, room_id, round_index) 对 U3 的 {−1,0,1} 取均值，"
          "与原文 per-chat mean 同口径。多带 room_id 是因为 round_index 只在房间内唯一，"
          "跨房会重号。round_index 为 NULL 的锚点在 dropped_no_round_index_n 里如实报告。",
    "u6": "人工金标准（效标）：obs_window.f3_after_hint 分布。**刻意不算 AC1** —— "
          "真实人工标注语料尚不存在，现在算出来的一致性是假的。R2 的降级规则"
          "（U3 与 U6 的 AC1<0.40 → 放弃 U7 连续化、只报 U1/U2）待标注到位后才可判，"
          "现以 gate_pending=true 表示「还没到能判的时候」。",
    "supply_side": "自变量保真度块（manipulation check）：ai_reply_log 四分类 + hop。"
                   "occurrence 是多标二值主口径，一条回复可同时计进多类，**四者之和≠1**。"
                   "hop 按 R2 已**降格**为「支架供给强度的服务端保真信号」——"
                   "它不是任何淡出机制的触发器，CX 的淡出是 scaffold_level＋教师确认制。"
                   "占比结论的唯一发布口径仍是 /api/research/ai_reply_stats。",
    "spearman": "供给侧×需求侧的秩相关（R2 要求两块关系用 ρ 报出）。按轮配对。"
                "有并列时用平均秩上的皮尔逊（禁用 1−6Σd²/(n(n²−1)) 简化式，它会高估 |ρ|）。"
                "**只报点估计 + n_pairs，不报 p 值**（无 scipy、单班共线、教师易误读）。"
                "rho=None 有两种意思：样本不足(<3 对) 或秩零方差，靠 n_pairs 区分；"
                "**绝不用 0.0 冒充 None** —— 0.0 会被读成「hop 与学生 uptake 无关」。",
    "baselines": "预注册基准线，**仅供论文解释，API 不做任何判定**："
                 "StemChat u=0.30±0.41、RECIPE4U u=0.36±0.37（真实部署、未筛选、有支架对齐）；"
                 "真实部署两类别的供给×需求秩相关 ρ=0.308~0.346。"
                 "上限锚 CoMTA u=0.68 刻意不列为目标值（筛选过的正面样例集＋高动机人群）。"
                 "「落在 0.30–0.40 即正常」「u≤0 判操纵失败」是论文里的解释规则，不是端点的结论。",
    "metric_registry": "U4/U5 登记处（拍板 Q3 由 not_computed 更名）：两项已随提交 50a9de5 的"
                    "前置（save_version 内容去重＋前端运行即自动保存）实现为**探索量**，"
                    "落在 by_delta.<Δ>.exploratory 下；当年 blockers 里仍成立的约束降格为"
                    "读数上限，见 field_notes.u4 / u5 与出参各单列计数。",
    "exploratory": "U4/U5 是**探索量**，与主报量（U1/U2）及条件主报（U3/U7）**物理分层**在 "
                   "by_delta.<Δ>.exploratory 下。结论章只可引用主报量；探索量只进讨论/附录，"
                   "且引用时必须连同各单列计数（ties/stale/no_baseline/multi_project/blockly）"
                   "一起给出，rate 的分母只含可判定的 judged_n。",
    "u4": "代码承接（探索量）：锚点 = asks≥1 的 navigator 回复（与 U1 同口径）。"
          "【拍板 Q1（2026-08-18）：不含 asks=0 的回复】纯鼓励/陈述型回复之后的代码变更"
          "多为进行中的编辑而非对支架的承接，配进去会把巧合编辑算成命中（U4 偏高=自利非法）；"
          "且与 U1 共用分母概念，两量可直接对读。"
          "(t0, t0+Δ] 内该生任一作品出现新版本、且相对基线的行级 diff ≥1 行 → 1；"
          "变更行数（增＋删）≤3 记小改、>3 记大改（只作描述分档）。"
          "基线 = 该版本的前一版且须落在 [t0−Δ, t0)：早于 t0−Δ 记 stale_baseline_n、"
          "无前一版记 no_baseline_n、与 t0 同秒记 ties_at_t0_n，三者都**不算 0 也不算 1**"
          "（rate 分母只含 judged_n）—— 把提示前的编辑算成承接会系统性抬高 U4（自利，非法），"
          "单列剔除压低 U4（对研究不利，合法）。已知自利残余：回复行无 project_id，"
          "任一作品命中即算 → multi_project_ambiguous_n 单列披露，读数夹逼。"
          "上限：Python 默认积木模式，Blockly 生成代码一次积木移动可整段重排，"
          "行级 diff 与手写**不可比** —— 命中里涉及积木版本的在 blockly_involved_hit_n "
          "单列，应把它当作口径噪声的上界读。",
    "u5": "违规后卸载（探索量，CX 相对原文的方法学增量）：锚点 = d=1 或 has_code_block=1 "
          "的回复。Δ 内出现体积跳增（单版新增 ≥5 行且新增>删除×2）＋立即 run"
          "（run.ts ≥ 版本时刻，含同秒：前端 run() 已 await 自动保存 —— 版本先落、代码后跑"
          "由 await 构造保证；多记 U5 的方向对研究不利，合法）＋该 run 后 Δ 内"
          "无 error → 1。run 与 error 同秒不可定序 → run_error_same_second_n 单列。"
          "**U5 是已知下界**：跳增阈值漏掉短段直接抄、版本与 t0 同秒剔除也压低命中 —— "
          "残余方向对研究有利，故阈值预注册不可事后调，读数必须连同单列计数夹逼。"
          "Blockly 上限同 u4。first_version_jump_n（拍板 Q2）：窗内**首版**行数即达跳增"
          "阈值的锚点数 —— 新建作品直接粘贴是最典型的整段卸载形态，但首版无基线且可能是"
          "模板+正常起步，故只披露计数、不进 rate，留人工复核。code_mode（拍板 Q5）："
          "窗内合法版本对全不涉积木的锚点子率（敏感性附录量）—— Blockly 生成代码的行级 "
          "diff 与手写不可比，子率给出可解释子群的读数，不替代主 rate。",
    "analysis_set": "true = 分析集口径（无有效监护人同意的学生已剔除，剔了多少在 "
                    "excluded_no_consent 里如实报告）；include_no_consent=1 为誊录核对视图。",
    "student_utterance": "学生原话**绝不出现在任何出参里**（红线②）。40 字前缀只在 index_events "
                         "内部参与词表判定，随即被换成锚点名/有效字符数/截断标记三个派生量。",
    "not_for_students": "uptake 是**研究量，不下发学生端**（红线③：学生看到 = 被标签化）。"
                        "本块也不进 ct 六维、不动 FORMULA_VERSION、不写回 ct_events（红线①）。",
}
