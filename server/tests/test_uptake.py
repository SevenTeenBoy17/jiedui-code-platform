"""uptake 需求侧度量块（外部调研 R2 §2.1）的闭环。

覆盖：① U1 真阳/真阴（「窗口内无新 ai_help」这一条是 U1 的要害，必须两向都卡）；
② U2 词表命中与**不误伤**（误伤的是「照抄你说的思路」这类高 uptake 话语，与构念反号）；
③ U3 三条分支各一；④ U7 轮级聚合（含 round_index 为 NULL 的锚点不静默丢弃）；
⑤ Δ=60/180/600 三值**确实给出不同结果**（不同才证明敏感性分析不是摆设）；
⑥ Spearman 的并列验收向量（勘察给定的 V1–V9，钉死「秩上的皮尔逊」而非简化式）；
⑦ n=0 返回 None **不返 0.0**；⑧ 学生 token 403；⑨ 无同意学生被剔除且如实报告；
⑩ 红线：不动 FORMULA_VERSION、出参不含学生原话、出参不含 formula_version；
⑪ U4/U5 探索量（前置提交 50a9de5 补上后实装）：真阳/真阴（窗外造）/小大改分档/
基线陈旧与缺失、同秒、run-error 同秒的单列纪律/Δ 三值分歧/登记处翻转/
红线（版本**代码**原文不出参 —— 在版本 code 里埋唯一标记串扫全出参）。

样例来源：**全部为合成文本与合成时间戳，不含任何真实语料**。
时间戳一律显式写死（直查库 INSERT，不走 add_ct_event/_now()）——Δ 窗判据要求秒级可控，
而两条写路径都只会写「当前秒」，用它们造不出 (t0, t0+Δ] 的边界用例。
"""
import json

import pytest

from app import reply_class, stats, store, store_ai_reply, store_obs, uptake
from app.ct import FORMULA_VERSION


def _login(client, role: str, name: str) -> str:
    """本地登录助手（同 test_reply_class.py：**不从 conftest import**，
    tests/ 没有 __init__.py，那会把 conftest 当第二个模块重跑，DB_PATH 会指到另一个空库）。"""
    r = client.post(f"/api/auth/{role}/login", json={"username": name, "password": "123456"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ============ ⑥ Spearman 验收向量（改了就必须红）============
# 每条都带手算过程，便于主线独立复核；V4/V5/V7/V9 专门用来卡住被禁用的简化式
# ρ = 1 − 6Σd²/(n(n²−1))：它在并列时高估 |ρ|，方向自利，违反 R2 的编码偏移纪律。
SPEARMAN_VECTORS = [
    # (名称, x, y, 期望)
    ("V1 完全正单调", [1, 2, 3, 4, 5], [10, 20, 30, 40, 50], 1.0),
    ("V2 完全负单调", [1, 2, 3, 4, 5], [5, 4, 3, 2, 1], -1.0),
    # 无并列：正确实现必须与简化式一致（1−6·4/120=0.8），排除「通用式抄错了」
    ("V3 无并列非平凡", [1, 2, 3, 4, 5], [2, 1, 4, 3, 5], 0.8),
    # 两侧重并列，直接映射 hop × u_round 的真实形状。简化式给 0.869（高估 0.014）
    ("V4 两侧重并列", [1, 1, 2, 2, 3, 3, 4, 4], [-1, 0, 0, 0, 1, 0, 1, 1], 0.855),
    # 单侧一个二元并列：简化式给 0.95，只差 0.001 —— 正因差得小才危险，
    # 防止实现里「并列少时走近似」的偷懒分支蒙混过关
    ("V5 轻并列", [1, 2, 2, 3], [1, 2, 3, 4], 0.949),
    # 钉死管线顺序：先丢缺失再排秩。反过来（先排秩后丢缺失）得 0.707
    ("V6 成对丢缺失的顺序", [1, 2, 3, 4, None], [10, 5, 40, 30, 20], 0.6),
    ("V7 y 侧全常数", [1, 2, 3, 4], [7, 7, 7, 7], None),      # 简化式凭空吐 0.5
    ("V8 n<3", [1, 2], [2, 1], None),
    ("V9 x 侧全并列", [5, 5, 5, 5], [1, 2, 3, 4], None),      # 简化式同样吐 0.5
]


@pytest.mark.parametrize("name,xs,ys,expected", SPEARMAN_VECTORS)
def test_spearman_rho_ties_and_degenerate_edges(name, xs, ys, expected):
    """有并列时 ρ ≡ 平均秩上的皮尔逊，这是定义不是近似。

    被禁用的简化式在并列时**高估 |ρ|**，即偏向「hop 供给侧确实解释了需求侧 uptake」的
    自利结论；零方差时它还会凭空吐出 0.5，而正确答案是「无定义」。
    退化一律 None，**绝不 0.0** —— 0.0 是「不存在单调关联」这个可解读的真值。
    """
    got = stats.spearman_rho(xs, ys)
    assert got == expected, f"{name}: {got} ≠ {expected}"


def test_rank_avg_is_midrank_not_competition_rank():
    """平均秩（1.5,1.5,3.5,…）而非竞争排名（1,1,3）或稠密排名（1,1,2）——
    只有平均秩能让「秩上的皮尔逊」等于带 tie-correction 的 ρ。秩和恒为 n(n+1)/2。"""
    r = stats.rank_avg([1, 1, 2, 2, 3, 3, 4, 4])
    assert r == [1.5, 1.5, 3.5, 3.5, 5.5, 5.5, 7.5, 7.5]
    assert abs(sum(r) - 8 * 9 / 2) < 1e-9


# ============ ② U2 闭合词表：命中与不误伤 ============

U2_TRUE_POSITIVES = [
    "直接给我代码吧", "你直接告诉我怎么写", "直接写吧我不会", "直接说结果",
    "把代码发我", "代码发我", "给我完整代码", "答案给我",
    "帮我写一个循环", "帮我搞定这个报错", "帮我弄完吧",
    "你来写吧", "你写出来吧我不会",
    "整段代码发过来", "有没有现成的代码", "我要全部代码",
    "答案是什么", "答案是多少", "告诉我答案", "我只要答案",
    "别问了", "不要再问我了", "别提问了", "不用再反问我",
    "我抄一下代码行不行", "抄作业", "代码让我抄一下",
    "求代码", "跪求一份答案",
]

# **误伤反例是本表的重点**：这些句子里有一半是学生在**逐字承接支架**（高 uptake），
# 判成 u=−1 不是噪声而是与构念**反号**的噪声，比漏判危险得多。
U2_MUST_NOT_HIT = [
    "抄写笔记的时候我发现少了一行",          # 「抄」的裸字误伤
    "老师说不能抄别人的作业",
    "我照抄你说的思路做了一遍还是不对",      # ← 逐字承接支架，uptake 最高的一档
    "我把你刚才说的抄下来了",                # ← 同上
    "我直接写了个 while 循环结果死循环了",   # ← 学生自述已动手
    "然后我就直接写了个函数",
    "直接说明一下这个报错好吗",              # 要解释，不是要产物
    "你说的答案是什么意思啊",                # ← 追问 AI 刚给的说法，是 U3 的正向响应
    "这道题要求交完整代码的截图",            # 作业要求陈述
    "作业要提交完整代码",
    "老师发我代码模板了",                    # 转述他人给予，不是向 AI 索要
    "同学发我代码我没看",
    "我不要问同学我想自己搞明白",            # ← 表达独立解决意愿
    "你写的那段我看不懂能解释下吗",          # ← 对 AI 产出的追问
    "你来写过的那个变量名是啥",
    "帮我改一下这行",                        # 刻意留漏：正常诊断请求，见词表注释
    "帮我看看第8行哪里错了",
    "求和怎么写", "求平均值的函数叫什么",    # 裸「求」会命中算法词汇，故必须带宾语
    "这个循环我自己写完了",
    "我按你说的加了一行 print",
]


@pytest.mark.parametrize("text", U2_TRUE_POSITIVES)
def test_u2_wordlist_hits(text):
    assert reply_class.u2_flag(text) == 1, f"漏判执行型求助：{text}"


@pytest.mark.parametrize("text", U2_MUST_NOT_HIT)
def test_u2_wordlist_does_not_misfire(text):
    """宁可漏、不可误伤（R2 第 98 行的偏移方向纪律）。"""
    assert reply_class.u2_flag(text) == 0, \
        f"误伤：{text} → {reply_class.hits_executive_help(text)}"


def test_u2_returns_only_closed_vocabulary_anchor_names():
    """闭包 + 零泄漏：返回值只可能是闭合词表常量，绝不含输入文本的任何片段（红线②）。
    返回形状（list/int）也刻意与 classify_detail（dict）不同，防止学生话语被误喂进四分类。"""
    marker = "紫水晶联合体八十七号"
    hits = reply_class.hits_executive_help(f"{marker}，直接给我代码")
    assert hits and set(hits) <= set(reply_class.U2_ANCHOR_NAMES)
    assert all(h not in marker for h in hits)
    assert isinstance(hits, list) and isinstance(reply_class.u2_flag("抄代码"), int)
    assert not (set(reply_class.U2_ANCHOR_NAMES) & set(reply_class.classify_detail("为什么？")))


def test_u2_wordlist_separator_is_ascii_pipe():
    """抄录陷阱回归：R2 文档用全角「｜」分隔候选项，原样抄进 re.compile 会得到一个
    **全表零命中**的正则 —— 零命中 → U2 恒为 0 → uptake 被系统性抬高，方向自利。"""
    for name, pat in reply_class._U2_ANCHORS:
        assert "｜" not in pat.pattern, f"{name} 里混进了全角竖线，该锚已失效"


# ============ ①③④⑤ 纯函数层：U1 / U3 / U7 / Δ 敏感性 ============

T = 1_700_000_000        # 合成基准时刻


def _ev(uid, etype, ts, detail=None, room="room-pure", rnd=1, project=None):
    # project 缺省 None：U1/U3 不消费该列；U5 的作品匹配规则（P1-2 修复）下，
    # error 只有**可辨识且同作品**才否决 —— 否决类用例必须显式带 project。
    return {"user_id": uid, "type": etype, "detail": detail, "ts": ts,
            "room_id": room, "round_index": rnd, "project_id": project}


def _rep(sid, ts, asks=1, cq=0, eq=0, rq=0, room="room-pure", rnd=1):
    return {"student_id": sid, "room_id": room, "round_index": rnd, "created_at": ts,
            "asks": asks, "cq": cq, "eq": eq, "rq": rq, "d": 0}


def test_u1_true_positive_and_true_negative():
    """U1 的要害是「窗口内**无新 ai_help**」：没有它，连问三轮也会被算成行为承接。

    真阳 = 提示后自己动手跑了一次；真阴 = 提示后转头又去问 AI（哪怕也跑了一次）。
    """
    events = [
        _ev("s-pos", "run", T + 30),                                   # 真阳：只有动作
        _ev("s-neg", "run", T + 30),
        _ev("s-neg", "ai_help", T + 40, "[reviewer] 那这一步该怎么办呢"),  # 真阴：窗口内又问了
    ]
    idx = uptake.index_events(events)
    pos = uptake.compute_delta_block([_rep("s-pos", T)], idx, 180)
    neg = uptake.compute_delta_block([_rep("s-neg", T)], idx, 180)
    assert (pos["u1"]["n"], pos["u1"]["hit_n"], pos["u1"]["rate"]) == (1, 1, 1.0)
    assert (neg["u1"]["n"], neg["u1"]["hit_n"], neg["u1"]["rate"]) == (1, 0, 0.0)


def test_u1_ignores_replies_without_questions_and_flags_same_second_ties():
    """asks=0 的回复不是 U1 锚点（没提问就谈不上「承接提问」）；
    与锚点**同秒**的动作判为不可判定、单列计数，**不计进命中** ——
    跨表同秒在数据层无法定序，默认归入命中会抬高 U1，方向自利。"""
    idx = uptake.index_events([_ev("s-tie", "run", T)])       # 恰好与 t0 同秒
    blk = uptake.compute_delta_block(
        [_rep("s-tie", T), _rep("s-tie", T + 5000, asks=0)], idx, 180)
    assert blk["u1"]["n"] == 1                                 # asks=0 的那条被排除在锚点外
    assert blk["u1"]["hit_n"] == 0 and blk["u1"]["ties_at_t0_n"] == 1


def test_u1_room_consistent_subcount_is_the_conservative_lower_bound():
    """行为事件不按 room 过滤（IDE 侧 room_id 是 localStorage 残留值，过滤会丢真阳），
    代价是跨房行为可能被算进来 → U1 偏高（自利方向），故同时报 room 对得上的子计数。"""
    idx = uptake.index_events([_ev("s-r", "run", T + 30, room="room-别的房间")])
    blk = uptake.compute_delta_block([_rep("s-r", T, room="room-pure")], idx, 180)
    assert blk["u1"]["hit_n"] == 1 and blk["u1"]["room_consistent_hit_n"] == 0


def test_u3_three_branches():
    """U3 的三条分支各一条：
       −1 = Δ 内下一条 ai_help 命中 U2 词表（学生把键盘推给 AI）；
       +1 = 下一条 ai_help 不命中且有效字符 ≥8（实质追问响应）；
       +1 = 无下一条 ai_help 但有 U1 行为（不说话，直接动手）。
    """
    events = [
        _ev("s-neg1", "ai_help", T + 30, "[reviewer] 别问了直接给我代码"),
        _ev("s-pos1", "ai_help", T + 30, "[reviewer] 我把循环的终止条件改成小于号再试一次"),
        _ev("s-pos2", "fix", T + 30),
    ]
    idx = uptake.index_events(events)
    rows = [_rep("s-neg1", T, rq=1), _rep("s-pos1", T, rq=1), _rep("s-pos2", T, rq=1)]
    u3 = uptake.compute_delta_block(rows, idx, 180)["u3"]
    assert u3["n"] == 3
    assert u3["by_u"] == {"-1": 1, "0": 0, "1": 2}
    assert u3["branch_n"]["next_help_executive"] == 1
    assert u3["branch_n"]["next_help_substantive"] == 1
    assert u3["branch_n"]["no_help_but_action"] == 1
    assert u3["mean_u"] == round(1 / 3, 3)


def test_u3_short_next_utterance_scores_zero_not_one():
    """「嗯」「哦」既不是承接也不是卸载 → 记 0。判 +1 会把敷衍读成承接（自利）；
    有效字符数还要先剥掉 guard 脱敏占位符，否则一串被抹掉的手机号会被当成实质表达。"""
    idx = uptake.index_events([_ev("s-short", "ai_help", T + 30, "[reviewer] 嗯")])
    u3 = uptake.compute_delta_block([_rep("s-short", T, rq=1)], idx, 180)["u3"]
    assert u3["by_u"]["0"] == 1 and u3["branch_n"]["next_help_too_short"] == 1
    assert uptake.effective_len("我手机[phone_1]") == 3        # 占位符不算有效字符


def test_u3_anchor_requires_a_question_code():
    """U3 的锚点是「含 RQ/CQ/EQ 且 asks≥1」的回复。四码全 0 的寒暄句不是追问，
    拿它当锚点等于凭空造出一次苏格拉底提问。"""
    idx = uptake.index_events([_ev("s-o", "run", T + 30)])
    u3 = uptake.compute_delta_block([_rep("s-o", T, asks=1)], idx, 180)["u3"]   # cq/eq/rq 全 0
    assert u3["n"] == 0 and u3["mean_u"] is None


def test_image_path_ai_help_is_excluded_from_the_denominator():
    """ai.py:339 的画图路径也写 ai_help，但语用完全不同（求生成图片，不是求编程帮助），
    且落库用的是**未脱敏**的 req.prompt 原文 —— 必须显式排除，否则既污染分母，
    又把未脱敏文本拉进研究口径。注意该样例文本恰好会命中 U2 词表：漏排即穿帮。"""
    idx = uptake.index_events([_ev("s-img", "ai_help", T + 30, "[image] 帮我写一只小海龟")])
    assert uptake.compute_u2(idx, room_id="room-pure")["n"] == 0


def test_u7_round_aggregation_and_null_round_is_not_dropped_silently():
    """U7 = 按 (student, room, round) 对 U3 的 {−1,0,1} 取均值。
    多带一个 room_id 是因为 round_index 只在房间内唯一，跨房会重号 ——
    只按学生+轮号聚合会把两个房间的第 1 轮合成一轮。
    round_index 为 NULL 的锚点无法归轮，**单列计数**而不是静默丢弃。"""
    events = [
        _ev("s7", "ai_help", T + 30, "[reviewer] 抄作业"),                    # → −1
        _ev("s7", "fix", T + 1030, rnd=2),                                    # → +1
    ]
    idx = uptake.index_events(events)
    rows = [
        _rep("s7", T, rq=1, rnd=1),                       # room-pure/1 → −1
        _rep("s7", T + 1000, rq=1, rnd=1),                # room-pure/1 → +1（无 help 有行为）
        _rep("s7", T + 5000, rq=1, rnd=None),             # 无轮号 → 不进 U7
    ]
    u7 = uptake.compute_delta_block(rows, idx, 180)["u7"]
    assert u7["n_rounds"] == 1 and u7["u_round_values"] == [0.0]
    assert u7["mean_u_round"] == 0.0                      # 真值 0.0，不是 None
    assert uptake.compute_delta_block(rows, idx, 180)["u3"]["dropped_no_round_index_n"] == 1


def test_delta_sensitivity_actually_changes_the_result():
    """Δ=60/180/600 必须给出**不同**结果，否则三值敏感性分析是摆设。
    动作落在 t0+120：Δ=60 够不着，Δ=180/600 够得着。"""
    idx = uptake.index_events([_ev("s-d", "run", T + 120)])
    rows = [_rep("s-d", T, rq=1)]
    blocks = {d: uptake.compute_delta_block(rows, idx, d) for d in uptake.DELTA_SENSITIVITY}
    assert blocks[60]["u1"]["hit_n"] == 0
    assert blocks[180]["u1"]["hit_n"] == 1 and blocks[600]["u1"]["hit_n"] == 1
    assert blocks[60]["u3"]["mean_u"] == 0.0 and blocks[180]["u3"]["mean_u"] == 1.0
    assert uptake.DELTA_MAIN == 180 and tuple(uptake.DELTA_SENSITIVITY) == (60, 180, 600)


def test_half_open_window_boundaries():
    """窗口是半开区间 (t0, t0+Δ]：t0 同秒不算（不可判定），t0+Δ 整点算。"""
    assert uptake.in_window(T, T, 180) is False
    assert uptake.in_window(T, T + 1, 180) is True
    assert uptake.in_window(T, T + 180, 180) is True
    assert uptake.in_window(T, T + 181, 180) is False


def test_u_from_ordinal_direction():
    """u = (3 − x)/2：序数越小 uptake 越高。U2 命中 = 序数 5 → u = −1。
    符号一旦反过来，整篇结论就反了，所以这条单独钉死。"""
    assert uptake.u_from_ordinal(1) == 1.0
    assert uptake.u_from_ordinal(3) == 0.0
    assert uptake.u_from_ordinal(5) == -1.0


# ============ ⑪ U4/U5 探索量：纯函数层 ============

BASE3 = "print(1)\nprint(2)\nprint(3)"
JUMP6 = BASE3 + "\n" + "\n".join(f"pasted_{i} = {i}" for i in range(6))   # 相对 BASE3 增 6 删 0


def _ver(owner, pid, ver, code, ts, blocks=None):
    return {"owner_id": owner, "project_id": pid, "version_no": ver,
            "code": code, "block_state": blocks, "created_at": ts}


def _rep5(sid, ts, d=1, hcb=0, **kw):
    """U5 锚点行：在 _rep 之上补 d / has_code_block（真实 ai_reply_log 行里这两列必在）。"""
    r = _rep(sid, ts, **kw)
    r["d"] = d
    r["has_code_block"] = hcb
    return r


def _u4(rows, vidx, delta=180, events=()):
    idx = uptake.index_events(list(events))
    return uptake.compute_delta_block(rows, idx, delta, versions_idx=vidx)["exploratory"]["u4"]


def _u5(rows, vidx, delta=180, events=()):
    idx = uptake.index_events(list(events))
    return uptake.compute_delta_block(rows, idx, delta, versions_idx=vidx)["exploratory"]["u5"]


def test_diff_line_counts_is_opcode_based_not_unified_text():
    """行数统计走 SequenceMatcher 的 opcodes：以 "++" 开头的学生代码行
    不会与 unified_diff 的 "+++" 文件头混淆。"""
    assert uptake.diff_line_counts("a\nb", "a\nb\n++ x") == (1, 0)
    assert uptake.diff_line_counts("a\nb", "a\nc") == (1, 1)
    assert uptake.diff_line_counts(None, "") == (0, 0)


def test_u4_true_positive_with_small_big_split():
    """U4 真阳：提示后 Δ 内出现新版本且行级 diff ≥1 行 → 1。
    手算：s-small ver2 相对 ver1 增 1 删 0（变更 1 ≤3 → 小改）；
    s-big ver2 把第 3 行换成 4 行新内容（增 4 删 1，变更 5 >3 → 大改）。"""
    vidx = uptake.index_versions([
        _ver("s-small", 1, 1, BASE3, T - 30),
        _ver("s-small", 1, 2, BASE3 + "\nx=1", T + 60),
        _ver("s-big", 2, 1, BASE3, T - 30),
        _ver("s-big", 2, 2, "print(1)\nprint(2)\na\nb\nc\nd", T + 60),
    ])
    u4 = _u4([_rep("s-small", T), _rep("s-big", T)], vidx)
    assert (u4["n_anchors"], u4["judged_n"], u4["hit_n"], u4["rate"]) == (2, 2, 2, 1.0)
    assert u4["small_change_hit_n"] == 1 and u4["big_change_hit_n"] == 1
    assert u4["exploratory"] is True


def test_u4_true_negative_window_out_and_block_only_change():
    """U4 真阴的两种造法：
    ① 新版本落在窗外（50a9de5 去重后「零 diff 新版本」根本不存在，窗外是真阴的正确造法）；
    ② 版本只动了 block_state 没动 code（去重放行，但行级 diff=0 → 不是代码承接）。
    两条都是**可判定的 0**：rate 是真值 0.0，不是 None。"""
    vidx = uptake.index_versions([
        _ver("s-out", 1, 1, BASE3, T - 30),
        _ver("s-out", 1, 2, BASE3 + "\nx=1", T + 300),          # Δ=180 窗外
        _ver("s-blockonly", 2, 1, BASE3, T - 30, blocks='{"a":1}'),
        _ver("s-blockonly", 2, 2, BASE3, T + 60, blocks='{"a":2}'),
    ])
    u4 = _u4([_rep("s-out", T), _rep("s-blockonly", T)], vidx)
    assert (u4["n_anchors"], u4["judged_n"], u4["hit_n"]) == (2, 2, 0)
    assert u4["rate"] == 0.0


def test_u4_stale_and_missing_baseline_are_sidelined_not_zero():
    """基线纪律：基线早于 t0−Δ 记 stale_baseline_n（把提示前很久的编辑算成承接会系统性
    抬高 U4，方向自利、非法）；窗内首版无前一版记 no_baseline_n。
    两者都**不算 0 也不算 1** —— judged_n=0 时 rate 是 None，不是 0.0。"""
    vidx = uptake.index_versions([
        _ver("s-stale", 1, 1, BASE3, T - 1000),                 # 早于 t0−180
        _ver("s-stale", 1, 2, BASE3 + "\nx=1", T + 60),
        _ver("s-nobase", 2, 1, BASE3 + "\ny=2", T + 60),        # version_no=1，无前一版
    ])
    u4 = _u4([_rep("s-stale", T), _rep("s-nobase", T)], vidx)
    assert (u4["n_anchors"], u4["judged_n"], u4["hit_n"], u4["rate"]) == (2, 0, 0, None)
    assert u4["stale_baseline_n"] == 1 and u4["no_baseline_n"] == 1


def test_u4_same_second_version_is_undecidable():
    """同秒纪律：版本恰与 t0 同秒时，它是「窗内新版」还是「基线」在数据层无法定序 →
    ties_at_t0_n 单列、不可判定（默认判命中会抬高 U4，方向自利）。"""
    vidx = uptake.index_versions([
        _ver("s-t1", 1, 1, BASE3, T - 30),
        _ver("s-t1", 1, 2, BASE3 + "\nx=1", T),                 # 新版与 t0 同秒
        _ver("s-t2", 2, 1, BASE3, T),                           # 基线与 t0 同秒
        _ver("s-t2", 2, 2, BASE3 + "\ny=2", T + 60),
    ])
    u4 = _u4([_rep("s-t1", T), _rep("s-t2", T)], vidx)
    assert (u4["judged_n"], u4["hit_n"], u4["rate"]) == (0, 0, None)
    assert u4["ties_at_t0_n"] == 2


def test_u4_multi_project_ambiguity_is_counted():
    """回复行无 project_id：一人多作品同窗命中时「任一作品命中即算」（自利方向，
    field_notes 已披露）—— 歧义锚点必须以 multi_project_ambiguous_n 单列；
    分档取命中作品的最大变更量（此处 10 行 → 大改）。"""
    vidx = uptake.index_versions([
        _ver("s-m", 1, 1, BASE3, T - 30),
        _ver("s-m", 1, 2, BASE3 + "\nx=1", T + 60),             # 作品1：变更 1 行
        _ver("s-m", 2, 1, BASE3, T - 40),
        _ver("s-m", 2, 2, "a\nb\nc\nd\ne\nf\ng", T + 70),       # 作品2：增 7 删 3 = 10 行
    ])
    u4 = _u4([_rep("s-m", T)], vidx)
    assert (u4["hit_n"], u4["multi_project_ambiguous_n"]) == (1, 1)
    assert u4["big_change_hit_n"] == 1 and u4["small_change_hit_n"] == 0


def test_u4_blockly_versions_are_flagged_on_hit():
    """Blockly 生成代码一次积木移动可整段重排，行级 diff 与手写**不可比**（探索量上限）：
    命中里涉及积木版本的必须在 blockly_involved_hit_n 单列，供读数时当口径噪声上界。"""
    vidx = uptake.index_versions([
        _ver("s-blk", 1, 1, BASE3, T - 30, blocks="{}"),
        _ver("s-blk", 1, 2, BASE3 + "\nx=1", T + 60, blocks="{}"),
    ])
    u4 = _u4([_rep("s-blk", T)], vidx)
    assert u4["hit_n"] == 1 and u4["blockly_involved_hit_n"] == 1


def test_u4_delta_sensitivity_diverges():
    """Δ 三值必须能给出不同结果：版本落在 t0+120，Δ=60 够不着（可判定的 0），
    Δ=180/600 命中 —— U4 的敏感性分析不是摆设。"""
    vidx = uptake.index_versions([
        _ver("s-d4", 1, 1, BASE3, T - 30),
        _ver("s-d4", 1, 2, BASE3 + "\nx=1", T + 120),
    ])
    rows = [_rep("s-d4", T)]
    assert _u4(rows, vidx, delta=60)["rate"] == 0.0
    assert _u4(rows, vidx, delta=180)["rate"] == 1.0
    assert _u4(rows, vidx, delta=600)["rate"] == 1.0


def test_u5_true_positive_jump_immediate_run_no_error():
    """U5 真阳：d=1 回复后 Δ 内体积跳增（+6/−0）＋立即 run ＋无 error → 1。
    run 与版本**同秒**也算「立即」：前端「运行即自动保存」在同一处理链里先落版本再跑，
    同秒因果序由构造保证（全模块唯一的同秒可判例外，方向是多记 U5 = 对研究不利，合法）。"""
    vidx = uptake.index_versions([
        _ver("s5a", 1, 1, BASE3, T - 30),
        _ver("s5a", 1, 2, JUMP6, T + 60),
    ])
    u5 = _u5([_rep5("s5a", T)], vidx, events=[_ev("s5a", "run", T + 60)])
    assert (u5["n_anchors"], u5["judged_n"], u5["hit_n"], u5["rate"]) == (1, 1, 1, 1.0)
    assert u5["exploratory"] is True


def test_u5_error_after_run_is_a_true_negative():
    """跳增后立即 run 但该 run 之后 Δ 内报了 error：抄进来跑不通 → 不是无摩擦卸载，
    这是**可判定的 0**（rate=0.0，不是 None）。"""
    vidx = uptake.index_versions([
        _ver("s5b", 1, 1, BASE3, T - 30),
        _ver("s5b", 1, 2, JUMP6, T + 60),
    ])
    u5 = _u5([_rep5("s5b", T)], vidx,
             events=[_ev("s5b", "run", T + 61, project=1), _ev("s5b", "error", T + 70, project=1)])
    assert (u5["judged_n"], u5["hit_n"], u5["rate"]) == (1, 0, 0.0)


def test_u5_jump_thresholds_and_missing_run():
    """跳增阈值逐边卡死（常量预注册、方向注释见 uptake.py）：
    增 4（<5）不算；增 5 删 3（5 ≤ 3×2）不算；增 5 删 2（5 > 2×2）算；
    跳增但没有立即 run 也不算。四锚点 → 判定 4、命中 1、rate=0.25。"""
    base5 = "a\nb\nc\nd\ne"
    vidx = uptake.index_versions([
        _ver("s5c", 1, 1, base5, T - 30), _ver("s5c", 1, 2, base5 + "\nn1\nn2\nn3\nn4", T + 60),
        _ver("s5d", 2, 1, base5, T - 30), _ver("s5d", 2, 2, "a\nb\nn1\nn2\nn3\nn4\nn5", T + 60),
        _ver("s5e", 3, 1, base5, T - 30), _ver("s5e", 3, 2, "a\nb\nc\nn1\nn2\nn3\nn4\nn5", T + 60),
        _ver("s5f", 4, 1, BASE3, T - 30), _ver("s5f", 4, 2, JUMP6, T + 60),
    ])
    rows = [_rep5("s5c", T), _rep5("s5d", T), _rep5("s5e", T), _rep5("s5f", T)]
    events = [_ev(s, "run", T + 61) for s in ("s5c", "s5d", "s5e")]   # s5f 无 run
    u5 = _u5(rows, vidx, events=events)
    assert (u5["n_anchors"], u5["judged_n"], u5["hit_n"], u5["rate"]) == (4, 4, 1, 0.25)


def test_u5_run_error_same_second_is_undecidable():
    """run 与 error 同秒：这条 run 干不干净在数据层无法定序 → run_error_same_second_n
    单列、不算 0 也不算 1；只此一锚时 judged_n=0 → rate=None。
    （判「有 error」会压低 U5 = 自利；判「无 error」又违背 error 随 run 同秒落地的事实 ——
    唯一合法出路就是单列。）"""
    vidx = uptake.index_versions([
        _ver("s5g", 1, 1, BASE3, T - 30),
        _ver("s5g", 1, 2, JUMP6, T + 60),
    ])
    u5 = _u5([_rep5("s5g", T)], vidx,
             events=[_ev("s5g", "run", T + 61, project=1), _ev("s5g", "error", T + 61, project=1)])
    assert (u5["judged_n"], u5["hit_n"], u5["rate"]) == (0, 0, None)
    assert u5["run_error_same_second_n"] == 1


def test_u5_anchor_set_is_d_or_has_code_block():
    """U5 锚点 = d=1 或 has_code_block=1 的回复；两码全 0 的普通回复不进 U5 分母 ——
    混进来会稀释 U5 命中率（自利方向，非法）。"""
    vidx = uptake.index_versions([
        _ver("s5h", 1, 1, BASE3, T - 30),
        _ver("s5h", 1, 2, JUMP6, T + 60),
    ])
    events = [_ev("s5h", "run", T + 61)]
    plain = _u5([_rep("s5h", T)], vidx, events=events)          # d=0 且无 has_code_block
    hcb = _u5([_rep5("s5h", T, d=0, hcb=1)], vidx, events=events)
    assert plain["n_anchors"] == 0 and plain["rate"] is None
    assert hcb["n_anchors"] == 1 and hcb["hit_n"] == 1


def test_error_events_feed_u5_only_and_never_pollute_u1_u3():
    """扩 UPTAKE_EVENT_TYPES 取 error 只为 U5 的「无 error」判据；error 不是学生的
    主动动作，**绝不能**进 actions —— 否则「又报了一次错」会被 U1/U3 读成行为承接
    （方向自利，非法）。ACTION_TYPES 保持不含 error。"""
    assert "error" in uptake.UPTAKE_EVENT_TYPES
    assert "error" not in uptake.ACTION_TYPES
    idx = uptake.index_events([_ev("s-err", "error", T + 30)])
    assert idx["errors"]["s-err"] == [(T + 30, None)]     # (ts, project_id) 对，见 P1-2 修复
    assert "s-err" not in idx["actions"] and "s-err" not in idx["runs"]
    blk = uptake.compute_delta_block([_rep("s-err", T, rq=1)], idx, 180)
    assert blk["u1"]["hit_n"] == 0                       # error 不构成 U1 行为承接
    assert blk["u3"]["branch_n"]["nothing"] == 1         # 也不是 U3 的行为分支


# ============ ⑦⑧⑨⑩ 端点层 ============

ROOM = "room-upt"
STU = ("stu-upt1", "stu-upt2", "stu-upt3")
NOCONSENT = "stu-upt-noconsent"
MARKER = "紫水晶联合体八十七号"          # 学生原话里独一无二的串，出现在出参任何处都算泄漏
def test_u5_cross_project_error_does_not_veto_and_foreign_run_does_not_serve():
    """作品匹配规则（P1-2 修复）的两半：
    ① B 作品的 error **不得**否决 A 作品的干净命中 —— 反着做会压低 U5（自利非法）；
    ② 可辨识的 B 作品 run **不得**充当 A 的「立即 run」（事实性修正：A 的跳增没有被运行过）；
       project_id 为 NULL 的 run 仍计入（回退方向多记 U5 = 对研究不利，合法——真阳用例
       test_u5_true_positive 的 run 就不带 project，恰好一直在覆盖这条回退路径）。"""
    # ① 跨作品 error 不否决
    vidx = uptake.index_versions([
        _ver("s5x", 1, 1, BASE3, T - 30),
        _ver("s5x", 1, 2, JUMP6, T + 60),
    ])
    u5 = _u5([_rep5("s5x", T)], vidx,
             events=[_ev("s5x", "run", T + 61, project=1),
                     _ev("s5x", "error", T + 70, project=2)])   # 别的作品报错
    assert (u5["judged_n"], u5["hit_n"], u5["rate"]) == (1, 1, 1.0), "B 作品的 error 否决了 A 的命中"

    # ② 可辨识的外作品 run 不充当「立即 run」→ 跳增无 run → 可判定的 0
    vidx2 = uptake.index_versions([
        _ver("s5y", 1, 1, BASE3, T - 30),
        _ver("s5y", 1, 2, JUMP6, T + 60),
    ])
    u5b = _u5([_rep5("s5y", T)], vidx2, events=[_ev("s5y", "run", T + 61, project=2)])
    assert (u5b["judged_n"], u5b["hit_n"], u5b["rate"]) == (1, 0, 0.0), "B 作品的 run 被当成了 A 的立即 run"


def test_u5_first_version_jump_is_disclosed_not_rated():
    """拍板 Q2：新建作品的窗内首版行数 ≥ 跳增阈值 → first_version_jump_n 计数披露，
    但**不进 rate**（首版无基线，也可能是模板+正常起步）。低于阈值不计。"""
    six = chr(10).join(f"l{i} = {i}" for i in range(6))
    four = chr(10).join(f"l{i} = {i}" for i in range(4))
    vidx = uptake.index_versions([
        _ver("s5fv", 1, 1, six, T + 30),        # 窗内首版 6 行 ≥ 阈值 → 计数
        _ver("s5fv", 2, 1, four, T + 40),       # 窗内首版 4 行 < 阈值 → 不计
    ])
    u5 = _u5([_rep5("s5fv", T)], vidx)
    assert u5["first_version_jump_n"] == 1
    assert u5["no_baseline_n"] == 1 and u5["judged_n"] == 0 and u5["rate"] is None
    assert u5["hit_n"] == 0, "首版跳增被算进了 rate（拍板 Q2 明令只披露）"


def test_code_mode_subrate_excludes_blockly_anchors():
    """拍板 Q5：code-mode 子率只吃「窗内合法版本对全不涉积木」的锚点。
    两锚点各自命中，一个纯代码、一个涉积木 → 主率 judged 2/hit 2，
    子率 judged 1/hit 1（积木锚整个被排除，而不是只扣 hit）。"""
    vidx = uptake.index_versions([
        _ver("s5cm1", 1, 1, BASE3, T - 30), _ver("s5cm1", 1, 2, JUMP6, T + 60),
        _ver("s5cm2", 2, 1, BASE3, T - 30),
        _ver("s5cm2", 2, 2, JUMP6, T + 60, blocks='{"b":1}'),
    ])
    u5 = _u5([_rep5("s5cm1", T), _rep5("s5cm2", T)], vidx,
             events=[_ev("s5cm1", "run", T + 61, project=1),
                     _ev("s5cm2", "run", T + 61, project=2)])
    assert (u5["judged_n"], u5["hit_n"]) == (2, 2)
    assert u5["blockly_involved_hit_n"] == 1
    assert u5["code_mode"] == {"judged_n": 1, "hit_n": 1, "rate": 1.0}


ROOM5 = "room-upt5"                      # U5 专用小场景：独立房间，不动 ROOM 的手算基线
STU5, STU6 = "stu-upt5", "stu-upt6"
VMARKER = "翡翠回廊第十九棱镜"           # 版本**代码**里独一无二的串（红线：代码原文不出参）
LONG_BODY = "我先把循环的终止条件打印出来看了一下发现变量在第三次迭代之后就没有再更新过所以一直循环下去了"

RQ_TEXT = "这里为什么会越界？"           # rq=1, asks=1
CQ_TEXT = "这段程序的输入是什么？"       # cq=1, asks=1
EQ_TEXT = "你测过边界情况吗？"           # eq=1, asks=1
O_TEXT = "别急，报错是学习的好机会 🔍"   # 四码全 0, asks=0


def _raw_event(uid, etype, detail, ts, room, rnd, project=None):
    """直查库 INSERT：断言的是 Δ 窗判据，必须能写死秒级 ts，
    而 store.add_ct_event 只会写 _now()。
    project：真实前端的 run/error 都带 currentId（ctApi.track 第三参），U5 端点场景
    必须照实构造 —— error 的作品匹配规则（P1-2）下 NULL error 不否决。"""
    with store._conn() as c:
        c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv,round_index,room_id)"
                  " VALUES(?,?,?,?,?,?,?,?)", (uid, etype, detail, project, ts, 2, rnd, room))


def _raw_reply(sid, text, ts, room, rnd):
    """走真实写入口 store_ai_reply.add（分类结果不自行拼），再把 created_at 改成合成时刻。"""
    rid = store_ai_reply.add(sid, "reviewer", "llm", 2, False,
                             reply_class.classify_detail(text), room_id=room, round_index=rnd)
    with store_ai_reply._conn() as c:
        c.execute("UPDATE ai_reply_log SET created_at=? WHERE id=?", (ts, rid))
    return rid


def _raw_project(owner):
    """直查库 INSERT 作品行（版本由 _raw_version 补，latest_version 在那里同步）。"""
    with store._conn() as c:
        cur = c.execute(
            "INSERT INTO projects(owner_id,title,language,latest_version,created_at,updated_at)"
            " VALUES(?,?,?,0,?,?)", (owner, "U4样例作品", "python", T, T))
        return int(cur.lastrowid)


def _raw_version(pid, ver, code, ts, blocks=None):
    """直查库 INSERT 版本行（同 _raw_event 的理由：save_version 只写 _now()，
    造不出 (t0, t0+Δ] 的边界用例），并同步 projects.latest_version。"""
    with store._conn() as c:
        c.execute("INSERT INTO project_versions(project_id,version_no,code,block_state,created_at)"
                  " VALUES(?,?,?,?,?)", (pid, ver, code, blocks, ts))
        c.execute("UPDATE projects SET latest_version=? WHERE id=?", (ver, pid))


def _raw_reply_d(sid, ts, room, rnd):
    """U5 锚点行：走真实入口落一条 navigator 回复（机器文本，本表不存原文），
    再显式钉死 d=1 / has_code_block=1 —— 不赌词表分类的巧合，锚点身份必须确定。"""
    rid = _raw_reply(sid, "这段实现分三步走", ts, room, rnd)
    with store_ai_reply._conn() as c:
        c.execute("UPDATE ai_reply_log SET d=1, violation=1, has_code_block=1 WHERE id=?", (rid,))
    return rid


@pytest.fixture(scope="module")
def seeded(client, teacher):
    """一份完全确定的合成语料。所有期望值都在下面的测试里手算给出。"""
    for sid in STU:
        client.post("/api/teacher/consent",
                    json={"student_id": sid, "guardian": "家长"}, headers=teacher)
    # NOCONSENT 刻意不开通 —— 它的行必须被分析集口径剔掉

    # —— ct_events ——
    _raw_event(STU[0], "run", "运行成功", T + 120, ROOM, 1)
    _raw_event(STU[0], "ai_help", f"[reviewer] {MARKER}我把边界条件改了再跑一次", T + 1030, ROOM, 1)
    _raw_event(STU[0], "ai_help", "[reviewer] 别问了直接给我代码", T + 2030, ROOM, 1)
    _raw_event(STU[1], "ai_help", "[turtle] 抄作业", T + 3010, ROOM, 2)
    _raw_event(STU[2], "fix", "修好了", T + 4050, None, 3)          # room 缺失：不影响命中
    _raw_event(STU[2], "run", "运行成功", T + 4250, "room-别的房间", 3)   # room 残留值
    _raw_event(STU[0], "ai_help", "[image] 帮我写一只小海龟的图片", T + 5000, None, None)
    _raw_event(NOCONSENT, "ai_help", "[reviewer] 直接给我代码", T + 6000, ROOM, 1)
    _raw_event(STU[2], "ai_help", f"[reviewer] {LONG_BODY}", T + 7000, ROOM, 3)
    _raw_event(STU[2], "run", "运行成功", T + 9000, ROOM, 3)        # 与 R9 同秒 → 不可判定
    for i in range(3):
        _raw_event(STU[0], "hop", "navigator追问", T + 10 + i, ROOM, 1)
    for i in range(5):
        _raw_event(STU[1], "hop", "navigator追问", T + 3001 + i, ROOM, 2)
    _raw_event(STU[2], "hop", "navigator追问", T + 4001, ROOM, 3)

    # —— ai_reply_log（R1..R10 进分析集，R11 无同意）——
    _raw_reply(STU[0], RQ_TEXT, T + 0, ROOM, 1)          # R1
    _raw_reply(STU[0], CQ_TEXT, T + 1000, ROOM, 1)       # R2
    _raw_reply(STU[0], RQ_TEXT, T + 2000, ROOM, 1)       # R3
    _raw_reply(STU[1], EQ_TEXT, T + 3000, ROOM, 2)       # R4
    _raw_reply(STU[1], EQ_TEXT, T + 3100, ROOM, 2)       # R5
    _raw_reply(STU[2], CQ_TEXT, T + 4000, ROOM, 3)       # R6
    _raw_reply(STU[2], CQ_TEXT, T + 4200, ROOM, 3)       # R7
    _raw_reply(STU[0], O_TEXT, T + 8000, ROOM, 1)        # R8：asks=0，不是锚点但进供给侧分母
    _raw_reply(STU[2], CQ_TEXT, T + 9000, ROOM, 3)       # R9
    _raw_reply(STU[1], EQ_TEXT, T + 10000, ROOM, None)   # R10：无轮号
    _raw_reply(NOCONSENT, RQ_TEXT, T + 6000, ROOM, 1)    # R11：无同意

    # —— obs_window：U6 效标 ——
    base = dict(study_id="obs-upt", room_id=ROOM, pair_id="01", layer="focus",
                observer_id="tea-lishen", observed_from=T, observed_to=T + 300,
                created_at=T, student_id=STU[0])
    store_obs.add_windows([
        {**base, "round_index": 1, "window_seq": 1, "f3_after_hint": "discussed"},
        {**base, "round_index": 1, "window_seq": 2, "f3_after_hint": "ignored"},
    ])

    # —— U4（探索量）：STU[0] 的作品与版本。VMARKER 埋进新增的那一行代码（红线扫描用）。
    # 只有 R1（t0=T）窗内有 ver2@T+60；基线 ver1@T−30 合法；diff 增 1 删 0 → 小改。
    p1 = _raw_project(STU[0])
    _raw_version(p1, 1, "print(1)\nprint(2)\nprint(3)", T - 30)
    _raw_version(p1, 2, f"print(1)\nprint(2)\nprint(3)\nprint('{VMARKER}')", T + 60)

    # —— ROOM5：U5 专用小场景（独立房间，绝不动 ROOM 的手算基线）——
    for sid in (STU5, STU6):
        client.post("/api/teacher/consent",
                    json={"student_id": sid, "guardian": "家长"}, headers=teacher)
    u5base = "print('a')\nprint('b')\nprint('c')"
    p5 = _raw_project(STU5)
    _raw_version(p5, 1, u5base, T - 30)
    _raw_version(p5, 2, u5base + "\n" + "\n".join(f"pasted_{i} = {i}" for i in range(5))
                 + f"\ns = '{VMARKER}'", T + 60)                # 增 6 删 0 → 体积跳增
    p6 = _raw_project(STU6)
    _raw_version(p6, 1, u5base, T - 30)
    _raw_version(p6, 2, u5base + "\n" + "\n".join(f"pasted_{i} = {i}" for i in range(6)), T + 60)
    _raw_event(STU5, "run", "运行", T + 61, ROOM5, 1, project=p5)   # 立即 run，无 error → 命中
    _raw_event(STU6, "run", "运行", T + 61, ROOM5, 1, project=p6)
    _raw_event(STU6, "error", "报错", T + 70, ROOM5, 1, project=p6)  # run 后报错 → 可判定的 0
    _raw_reply_d(STU5, T, ROOM5, 1)                             # d=1 → U5 锚点
    _raw_reply_d(STU6, T, ROOM5, 1)
    return True


@pytest.fixture(scope="module")
def upt(client, teacher, seeded):
    r = client.get(f"/api/research/uptake?room_id={ROOM}", headers=teacher)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def upt5(client, teacher, seeded):
    r = client.get(f"/api/research/uptake?room_id={ROOM5}", headers=teacher)
    assert r.status_code == 200, r.text
    return r.json()


def test_uptake_requires_teacher_or_researcher(client, teacher, seeded):
    """学生 token 必须 403：uptake 是**研究量，不下发学生端** —— 学生看到 = 被标签化（红线③）。"""
    stu = {"Authorization": "Bearer " + _login(client, "student", "upt1")}
    assert client.get("/api/research/uptake", headers=stu).status_code == 403
    assert client.get(f"/api/research/uptake?room_id={ROOM}", headers=teacher).status_code == 200


def test_uptake_scope_echoes_delta_and_filters(upt):
    """scope 必须回显 Δ：三值敏感性分析的三张表长得一模一样，
    不写清是哪个 Δ 算的就没法引用。空串一律归一成 None，不回 ""。"""
    assert upt["schema"] == "jiedui-uptake/v2"   # 拍板 Q3：登记键更名随 schema 升位
    assert upt["scope"] == {"study_id": None, "room_id": ROOM, "source": None,
                            "delta_sec_main": 180, "delta_sec_sensitivity": [60, 180, 600]}
    assert set(upt["by_delta"]) == {"60", "180", "600"}


def test_supply_side_block(upt):
    """供给侧（manipulation check）：四分类 occurrence 是多标二值主口径（四者之和≠1），
    hop 已按 R2 降格为「支架供给强度的服务端保真信号」，只作 ρ 的一端。"""
    s = upt["supply_side"]
    assert s["n_navigator_replies"] == 10            # R1..R10；R11 无同意已剔
    assert s["occurrence_n"] == {"cq": 4, "eq": 3, "rq": 2, "d": 0}
    assert s["violation_n"] == 0 and s["violation_rate"] == 0.0
    assert (s["hop_total"], s["hop_rounds_n"], s["hop_mean_per_round"]) == (9, 3, 3.0)


def test_u2_block_counts_and_lower_bound_evidence(upt):
    """U2 分母 = room 内的 ai_help（[image] 路径与无同意学生都已剔除）。
    命中 2/4；「拒绝被问」一族单列（它捕的是拒绝支架，不是索要产物）；
    占满 40 字的条目单列为已知下界证据。"""
    u2 = upt["u2"]
    assert (u2["n"], u2["hit_n"], u2["rate"]) == (4, 2, 0.5)
    assert u2["u_when_hit"] == -1.0                                  # 序数 5 → u=−1
    assert u2["refusal_family_n"] == 1
    assert u2["truncation_suspect_n"] == 1
    assert set(u2["by_anchor"]) == set(reply_class.U2_ANCHOR_NAMES)   # 计数为 0 的锚也显式出现
    assert u2["by_anchor"]["U2:抄"] == 1 and u2["by_anchor"]["U2:拒绝被问"] == 1
    assert u2["by_anchor"]["U2:帮我写"] == 0


def test_endpoint_delta_sensitivity_and_hand_computed_values(upt):
    """逐值手算（口径改了就必须红）：
       U1 锚点 9 条（R8 asks=0 不算）。Δ=60 命中 R6/R7；Δ=180/600 追加 R1（动作在 t0+120）。
       U3 值 Δ=180：R1+1 R2+1 R3−1 R4−1 R5 0 R6+1 R7+1 R9 0 R10 0 → 和 2 / 9。
       Δ=60 时 R1 落到 0 → 和 1 / 9。
    """
    d60, d180, d600 = (upt["by_delta"][k] for k in ("60", "180", "600"))
    assert d180["u1"]["n"] == 9 and d180["u1"]["hit_n"] == 3
    assert d180["u1"]["rate"] == round(3 / 9, 4)
    assert d60["u1"]["hit_n"] == 2 and d600["u1"]["hit_n"] == 3
    assert d180["u1"]["room_consistent_hit_n"] == 1      # 只有 R1 的动作 room 对得上
    assert d180["u1"]["ties_at_t0_n"] == 1               # R9 的 run 与 t0 同秒 → 不可判定

    assert d180["u3"]["n"] == 9
    assert d180["u3"]["by_u"] == {"-1": 2, "0": 3, "1": 4}
    assert d180["u3"]["mean_u"] == round(2 / 9, 3)
    assert d60["u3"]["mean_u"] == round(1 / 9, 3)
    assert d60["u3"]["mean_u"] != d180["u3"]["mean_u"]   # Δ 三值确实给出不同结果
    assert d180["u3"]["dropped_no_round_index_n"] == 1   # R10 无轮号，如实报告不静默丢

    # U7：三轮 → 0.333 / −0.5 / 0.667，均值 0.167
    u7 = d180["u7"]
    assert u7["n_rounds"] == 3
    assert u7["u_round_values"] == [-0.5, 0.333, 0.667]
    assert u7["mean_u_round"] == 0.167


def test_spearman_pairs_supply_vs_demand(upt):
    """hop（供给侧）× u_round（需求侧）的秩相关，R2「hop 的正确定位」要求两块关系用 ρ 报出。
    hop=[3,5,1] 对 u_round=[0.333,−0.5,0.667]：秩 [2,3,1] 对 [2,1,3] → ρ=−1.0。
    支架占比 [0.75,1.0,1.0] 一侧有并列 → ρ 恰为 **0.0**：这是一个真值（无单调关联），
    与「样本不足/无定义」的 None 是两件事，本条正是用来把二者分开的。"""
    sp = upt["by_delta"]["180"]["spearman"]
    assert sp["hop_vs_u_round"] == {"rho": -1.0, "n_pairs": 3}
    assert sp["scaffold_vs_u_round"]["n_pairs"] == 3
    assert sp["scaffold_vs_u_round"]["rho"] == 0.0
    assert sp["scaffold_vs_u_round"]["rho"] is not None


def test_u6_criterion_is_pulled_but_not_scored(upt):
    """U6 只把人工金标准取出来供对照，**刻意不算 AC1** ——
    真实标注语料还不存在，现在算出来的一致性是假的，而数字一旦落进出参就会被抄进方法章。"""
    u6 = upt["u6_criterion"]
    assert u6["n"] == 2 and u6["distribution"] == {"discussed": 1, "ignored": 1}
    assert u6["agreement_ac1"] is None and u6["gate_pending"] is True


def test_u4_u5_registry_flipped_to_exploratory_with_provenance(upt):
    """U4/U5 曾在 not_computed 登记「不可做」；前置（提交 50a9de5：save_version 内容去重
    ＋前端运行即自动保存）补上后，登记翻转为「已作为探索量实现」。键名 not_computed
    保留给既有消费方定位；当年 blockers 里**仍然成立**的约束（归属歧义/同秒定序/
    Blockly diff 不可比）没有消失 —— 降格为读数上限，移入 field_notes 与出参单列计数。"""
    nc = upt["metric_registry"]          # 拍板 Q3：not_computed → metric_registry（schema v2）
    assert set(nc) == {"U4", "U5"}
    for k in ("U4", "U5"):
        assert nc[k]["computed"] is True and nc[k]["exploratory"] is True
        assert "50a9de5" in nc[k]["unblocked_by"]
        assert "exploratory" in nc[k]["where"]
        assert nc[k]["remaining_limits"]
    assert "Blockly" in nc["U4"]["remaining_limits"]
    assert "下界" in nc["U5"]["remaining_limits"]
    # 关键约束提示确实挪进了 field_notes（积木 diff 不可比 / U5 下界 / 物理分层）
    assert "不可比" in upt["field_notes"]["u4"]
    assert "下界" in upt["field_notes"]["u5"]
    assert "物理分层" in upt["field_notes"]["exploratory"]


def test_endpoint_u4_exploratory_block_hand_computed(upt):
    """U4 手算（ROOM 语料）：锚点=U1 的 9 条。只有 R1（STU0, t0=T）窗内有新版本
    （p1 ver2@T+60；基线 ver1@T−30 合法；diff 增 1 删 0 → 小改）。
    T+60 落在 60/180/600 全部窗内 → 三个 Δ 都是 1/9。整块字典全等断言钉死 schema。
    ROOM 语料无 d=1/has_code_block=1 的回复 → U5 n=0 → rate None（不是 0.0）。"""
    for k in ("60", "180", "600"):
        u4 = upt["by_delta"][k]["exploratory"]["u4"]
        assert u4 == {"exploratory": True, "n_anchors": 9, "judged_n": 9,
                      "hit_n": 1, "rate": round(1 / 9, 4),
                      "small_change_hit_n": 1, "big_change_hit_n": 0,
                      "ties_at_t0_n": 0, "stale_baseline_n": 0, "no_baseline_n": 0,
                      "multi_project_ambiguous_n": 0, "blockly_involved_hit_n": 0,
                      # code-mode 子率（拍板 Q5）：ROOM 语料全程无积木 → 与主率同值
                      "code_mode": {"judged_n": 9, "hit_n": 1, "rate": round(1 / 9, 4)}}
        u5 = upt["by_delta"][k]["exploratory"]["u5"]
        assert u5["n_anchors"] == 0 and u5["judged_n"] == 0 and u5["rate"] is None
    assert upt["n_project_versions"] == 2 and upt["versions_truncated"] is False


def test_endpoint_u5_room5_hand_computed_with_delta_divergence(upt5):
    """U5 手算（ROOM5）：两条 d=1 锚点（t0=T）。
    STU5：跳增（+6/−0）@T+60 ＋ run@T+61 ＋ 无 error → 命中；
    STU6：同跳增 ＋ run@T+61 ＋ error@T+70 → 可判定的 0。
    Δ=180/600 → rate 0.5；Δ=60 时 run@T+61 落在窗外（无「立即 run」）→ 两条都判 0 →
    rate 0.0 —— Δ 三值给出不同结果，U5 的敏感性分析不是摆设。"""
    d180 = upt5["by_delta"]["180"]["exploratory"]["u5"]
    assert d180 == {"exploratory": True, "n_anchors": 2, "judged_n": 2,
                    "hit_n": 1, "rate": 0.5,
                    "ties_at_t0_n": 0, "stale_baseline_n": 0, "no_baseline_n": 0,
                    "first_version_jump_n": 0,          # 拍板 Q2：窗内无首版（ver1 在窗外）
                    "run_error_same_second_n": 0, "multi_project_ambiguous_n": 0,
                    "blockly_involved_hit_n": 0,
                    "code_mode": {"judged_n": 2, "hit_n": 1, "rate": 0.5}}
    assert upt5["by_delta"]["600"]["exploratory"]["u5"]["rate"] == 0.5
    d60 = upt5["by_delta"]["60"]["exploratory"]["u5"]
    assert (d60["judged_n"], d60["hit_n"], d60["rate"]) == (2, 0, 0.0)
    # ROOM5 的两条回复 asks=0 → 不构成 U4/U1 锚点：U4 在这里 n=0 → None
    u4 = upt5["by_delta"]["180"]["exploratory"]["u4"]
    assert u4["n_anchors"] == 0 and u4["rate"] is None


def test_endpoint_exploratory_empty_scope_returns_none(client, teacher, seeded):
    """空 scope 下探索量同全模块纪律：n=0 → None，绝不用 0.0 冒充「没有承接/没有卸载」。"""
    d = client.get("/api/research/uptake?room_id=room-根本不存在", headers=teacher).json()
    assert d["n_project_versions"] == 0
    for k in ("60", "180", "600"):
        ex = d["by_delta"][k]["exploratory"]
        assert ex["u4"]["n_anchors"] == 0 and ex["u4"]["rate"] is None
        assert ex["u5"]["n_anchors"] == 0 and ex["u5"]["rate"] is None


def test_baselines_are_numbers_not_verdicts(upt):
    """基准线只放数字不放判定：0.30/0.36 的解释规则是论文里的事，
    端点吐一个「达标/未达标」出来等于让代码替答辩下结论。"""
    b = upt["baselines"]
    assert b["stemchat_u_mean"] == 0.30 and b["recipe4u_u_mean"] == 0.36
    assert b["deployment_rho_range"] == [0.308, 0.346]
    flat = json.dumps(upt, ensure_ascii=False)
    for word in ("成功", "达标", "pass", "success"):
        assert f'"{word}"' not in flat, f"出参里出现了判定性字段 {word}"
    assert "0.30" in upt["field_notes"]["baselines"]      # 基准线在 field_notes 里有口径说明


def test_empty_scope_returns_none_not_zero(client, teacher, seeded):
    """n=0 时占比/均值/ρ 一律 None，**不是 0.0** ——
    「一条样本都没有」与「占比确实是 0 / 学生既不承接也不主导」是两件事，
    用 0.0 冒充会把空库读成「干预完全没生效」。"""
    d = client.get("/api/research/uptake?room_id=room-根本不存在", headers=teacher).json()
    assert d["n_navigator_replies"] == 0
    assert d["u2"]["n"] == 0 and d["u2"]["rate"] is None
    assert d["supply_side"]["violation_rate"] is None
    for k in ("60", "180", "600"):
        b = d["by_delta"][k]
        assert b["u1"]["rate"] is None and b["u3"]["mean_u"] is None
        assert b["u7"]["mean_u_round"] is None and b["u7"]["n_rounds"] == 0
        assert b["spearman"]["hop_vs_u_round"] == {"rho": None, "n_pairs": 0}


def test_study_id_ghost_list_returns_empty_not_everything(client, teacher, seeded):
    """名单为空时必须返回空集，不得退化成「不过滤」把全平台数据算进某个课题。"""
    d = client.get("/api/research/uptake?study_id=999999", headers=teacher).json()
    assert d["n_navigator_replies"] == 0 and d["n_ct_events"] == 0


def test_no_consent_students_are_excluded_and_reported(client, teacher, upt):
    """T0-2 分析集口径：无有效监护人同意的学生默认不进研究数据，剔了几条如实报告。
    **两个来源都要过滤** —— 只剔回复行会让未同意学生的 ai_help 仍然留在 U2 的分母里。"""
    assert upt["analysis_set"] is True
    assert upt["excluded_no_consent_detail"]["replies"] >= 1
    assert upt["excluded_no_consent_detail"]["ct_events"] >= 1
    assert upt["excluded_no_consent"] == (upt["excluded_no_consent_detail"]["replies"]
                                          + upt["excluded_no_consent_detail"]["ct_events"])
    full = client.get(f"/api/research/uptake?room_id={ROOM}&include_no_consent=1",
                      headers=teacher).json()
    assert full["analysis_set"] is False
    assert full["n_navigator_replies"] == 11          # R11 回来了
    assert full["u2"]["n"] == 5 and full["u2"]["hit_n"] == 3   # 未同意学生那条也是执行型求助


# ============ ⑩ 红线 ============

def test_redline_student_utterance_never_leaves_the_api(client, teacher, upt):
    """红线②：不存学生回复原文，学生原话也不经 API 出参。
    40 字前缀只在 uptake.index_events 内部参与词表判定，随即被换成锚点名/有效字符数/截断标记。"""
    flat = json.dumps(upt, ensure_ascii=False)
    assert MARKER not in flat, "学生原话泄漏进了 uptake 出参"
    for frag in ("别问了直接给我代码", "抄作业", LONG_BODY[:12], "小海龟的图片"):
        assert frag not in flat, f"学生原话片段泄漏：{frag}"
    full = client.get(f"/api/research/uptake?room_id={ROOM}&include_no_consent=1",
                      headers=teacher).text
    assert MARKER not in full                          # 誊录核对视图同样不许泄漏


def test_redline_formula_version_untouched_and_not_exported(upt):
    """红线①：不进 ct 六维、不动 FORMULA_VERSION、不写回 ct_events。

    出参里**刻意不带** formula_version —— 带上它会暗示 uptake 进了六维公式
    （research/export 带是因为那份数据真的含六维分）。"""
    assert FORMULA_VERSION == "ct-rules/v4"
    assert "formula_version" not in json.dumps(upt, ensure_ascii=False)
    assert "不进 ct 六维" in upt["field_notes"]["not_for_students"]


def test_redline_version_code_never_leaves_the_api(client, teacher, upt, upt5):
    """红线（U4/U5 新增面）：学生**代码**原文不经端点出参 —— diff 只出行数统计。
    VMARKER 埋在两处版本代码里（p1 的新增行、ROOM5 的跳增行），恰好都是被 diff 判定
    「命中」的那部分文本 —— 若实现把 diff 片段而非行数放进出参，这里立刻穿帮。
    誊录核对视图（include_no_consent=1）同样不许泄漏。"""
    for payload in (upt, upt5):
        flat = json.dumps(payload, ensure_ascii=False)
        assert VMARKER not in flat, "版本代码原文泄漏进了 uptake 出参"
        assert "pasted_0" not in flat and "print(" not in flat    # 代码片段也不许出现
    full = client.get(f"/api/research/uptake?room_id={ROOM}&include_no_consent=1",
                      headers=teacher).text
    assert VMARKER not in full


def test_redline_uptake_writes_nothing_back_to_ct_events(client, teacher, seeded):
    """本端点是只读的：调它前后 ct_events 行数必须一字不差。"""
    def _n() -> int:
        with store._conn() as c:
            return c.execute("SELECT COUNT(*) FROM ct_events").fetchone()[0]

    before = _n()
    client.get(f"/api/research/uptake?room_id={ROOM}", headers=teacher)
    assert _n() == before
