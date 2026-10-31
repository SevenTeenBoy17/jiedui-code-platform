"""navigator 四分类 CQ/EQ/RQ/D 的落库闭环（定稿 §B2-x，B 包首上线项）。

覆盖：① 四类各 ≥2 条构造样例 + O 兜底；② D override（唯一允许的优先级）；
③ 有代码围栏必判 D；④ **表里不存回复原文**（无 content 列 + 逐列比对断言）；
⑤ 统计端点（两套占比分开命名、违规率、空库不报 0、教师权限）。

样例来源标注：带「定稿 few-shot #N」的照抄定稿表格（合成样例，推演自 ai.py 指定行）；
其余为本测试新增的构造样例。全部为合成文本，不含任何真实语料。
"""
import pytest

from app.reply_class import classify_reply, classify_detail
from app import store_ai_reply


def _login(client, role: str, name: str) -> str:
    """本地登录助手（同 test_goal_anchor.py：不从 conftest import，那会把它当模块重跑）。"""
    r = client.post(f"/api/auth/{role}/login", json={"username": name, "password": "123456"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ============ ① 四类分类正确性（每类 ≥2 条）============

# CQ 主张类：要学生提出/识别一个主张
CQ_SAMPLES = [
    # 定稿 few-shot #1（推演自 ai.py:146-167 _fallback）：含拒绝话术但有实质问句 → 不落 O
    "键盘在你手里哦～我不能直接给完整答案，但我们可以一步步来 💪\n"
    "先回答我：① 这道题的**输入**是什么？② **输出**又是什么？③ 中间要做哪几步处理？",
    # 定稿 few-shot #5（SCAFFOLD 0）
    "你先说说，这段程序现在做到了哪一步？",
    # 定稿 few-shot #7（SCAFFOLD 2）：自然语言步骤清单**不判 D**——BASE_RULE 明确授权「思路拆解、伪代码」
    "思路可以是：① 读入一个数 ② 判断是否大于已知最大值 ③ 是就更新。"
    "你觉得第②步的判断条件怎么写？",
]

# EQ 证据类：要学生提供/评估证据
EQ_SAMPLES = [
    # 定稿 few-shot #3
    "① 你测过**边界情况**吗（空输入、最大值、0）？② 循环的**终止条件**对吗？③ 变量命名是否清楚？",
    # 定稿 few-shot #6（SCAFFOLD 1）
    "问题可能出在循环的边界上 🔍 你能找出 i 最后一次取到的值吗？",
    "先别改代码，把报错信息的最后一行念给我听，它说了什么？",
]

# RQ 推理类：要学生展示/分析推理过程
RQ_SAMPLES = [
    # 定稿 few-shot #4：ai.py:33-45 ROLE_PROMPT['reviewer'] 内嵌原文句
    "第8行循环条件，如果 i 等于数组长度会怎样？",
    "这里为什么要先判断再累加，换个顺序还成立吗？",
    "这两步之间是什么关系？",
]

# D 直答/给码：navigator 契约的违规态
D_SAMPLES = [
    # 定稿 few-shot #9（越界样例）：模型在压力下吐出完整代码块，无问句
    "好的，这是完整的猜数游戏：\n```python\nimport random\nt = random.randint(1, 100)\n"
    "while True:\n    g = int(input())\n    if g == t:\n        break\n```",
    "把第 8 行改成 while i < len(a): 就好了。",
]

# O 兜底：四码全 0（寒暄、鼓励、流程说明、拒绝话术）
O_SAMPLES = [
    # 定稿 few-shot #10：单句、无问句、无解法产物
    "别急，报错是学习的好机会 🔍",
    "收到，键盘在你手里，我陪你一步步来。",
    # 拒绝话术里的「答案是…」不能被 D 的词锚误伤：判成 D 会让红线违规率凭空虚高
    "答案是要你自己想出来的，我只能陪你拆步骤。",
]


@pytest.mark.parametrize("text", CQ_SAMPLES)
def test_cq_samples(text):
    cls, ev = classify_reply(text)
    assert cls == "CQ", f"{text[:24]} → {cls} / {ev}"
    assert classify_detail(text)["d"] == 0     # 三条都不该被判违规


@pytest.mark.parametrize("text", EQ_SAMPLES)
def test_eq_samples(text):
    d = classify_detail(text)
    assert d["eq"] == 1 and d["rq"] == 0 and d["d"] == 0
    assert d["reply_class"] == "EQ", d


@pytest.mark.parametrize("text", RQ_SAMPLES)
def test_rq_samples(text):
    d = classify_detail(text)
    assert d["rq"] == 1 and d["d"] == 0
    assert d["reply_class"] == "RQ", d


@pytest.mark.parametrize("text", D_SAMPLES)
def test_d_samples(text):
    d = classify_detail(text)
    assert d["d"] == 1 and d["violation"] == 1
    assert d["reply_class"] == "D", d


@pytest.mark.parametrize("text", O_SAMPLES)
def test_o_fallback_samples(text):
    """O 是定稿明列的兜底码。把纯鼓励句硬塞进 CQ 等于凭空造出一条苏格拉底提问。"""
    d = classify_detail(text)
    assert (d["cq"], d["eq"], d["rq"], d["d"]) == (0, 0, 0, 0)
    assert d["reply_class"] == "O" and d["evidence"] == ""


def test_scaffold3_inline_snippet_is_not_d():
    """定稿 few-shot #8（全套最易错标的一条）：档位 3 授权的「≤3 行核心 API 示例」
    以**行内单反引号**书写时不构成围栏 → D=0，与 BASE_RULE 的合规豁免一致。"""
    text = "试试 `random.randint(1,100)` —— 这行做了什么？你打算把它放在哪一步？"
    d = classify_detail(text)
    assert d["d"] == 0 and d["has_code_block"] == 0
    assert d["reply_class"] == "CQ"


# ============ ② D override / 折叠优先级 ============

def test_d_overrides_all_other_codes():
    """唯一允许的优先级是 D 的 override：一条回复只要出现可直接采用的解法产物，
    整条另打 violation=1，**不论是否同时含问句** —— CQ/EQ/RQ 照标不变。"""
    text = ("为什么这里会越界？你测过边界了吗？这段程序的输入是什么？\n"
            "```python\nfor i in range(len(a) - 1):\n    print(a[i])\n    total += a[i]\n```")
    d = classify_detail(text)
    assert (d["cq"], d["eq"], d["rq"], d["d"]) == (1, 1, 1, 1)   # 多标二值：四码并存，不互斥
    assert d["reply_class"] == "D" and d["violation"] == 1       # 折叠码取 D
    for code in ("D:", "RQ:", "EQ:", "CQ:"):
        assert code in d["evidence"]


def test_collapse_priority_rq_over_eq_over_cq():
    """折叠优先级 D > RQ > EQ > CQ > O（**仅**用于单值列，占比结论走多标二值）。"""
    assert classify_detail("你测过吗？为什么会这样？")["reply_class"] == "RQ"
    assert classify_detail("你测过吗？这是什么？")["reply_class"] == "EQ"
    assert classify_detail("这是什么？")["reply_class"] == "CQ"
    # 定稿 few-shot #2：EQ 与 RQ 同时命中（读报错=取证据，期望vs实际=推理）→ 折叠取 RQ
    d = classify_detail("① 把报错信息的**最后一行**读出来；② 定位到对应**行号**；"
                        "③ 想一想：这里你**期望**它做什么，**实际**做了什么？")
    assert d["eq"] == 1 and d["rq"] == 1 and d["reply_class"] == "RQ"


def test_generic_question_falls_back_to_cq_with_marked_evidence():
    """有问号但四类词锚全不中：仍是在向学生要一个陈述 → 记 CQ，
    但 evidence 标明来自兜底，人工复标时一眼能筛出来。"""
    d = classify_detail("嗯，接下来呢？")
    assert d["reply_class"] == "CQ" and d["evidence"] == "CQ:泛问句"


# ============ ③ 有代码围栏必判 D ============

@pytest.mark.parametrize("body", [
    "print(1)",
    "def f():\n    return 1",
    "# 只是注释",
])
def test_any_code_fence_is_d(body):
    """从严记违规：偏移对 CX 自身不利、不会虚假抬高结论，故合法（定稿 D 以召回为主闸）。"""
    d = classify_detail(f"你看这样：\n```\n{body}\n```")
    assert d["has_code_block"] == 1 and d["d"] == 1 and d["reply_class"] == "D"


# ============ ④ 不存原文 ============

def test_table_has_no_content_column():
    """铁律：只存分类与元数据。注释拦不住下一次 ALTER，所以由测试直接卡住列名。"""
    cols = store_ai_reply.columns()
    assert cols, "ai_reply_log 未建表"
    for forbidden in store_ai_reply.FORBIDDEN_COLUMNS:
        assert forbidden not in cols, f"ai_reply_log 出现了原文列 {forbidden}"


def test_stored_row_contains_no_reply_text():
    """逐列比对：任何一列都不得包含回复原文的可辨识片段。
    evidence 只能是闭合词表里的锚点名（如 'RQ:为什么'），不是回复切片。"""
    marker = "紫水晶联合体八十七号"          # 回复里独一无二的串，出现在任何列都算泄漏
    reply = f"{marker}：这里为什么会越界？"
    rid = store_ai_reply.add("stu-arl-probe", "reviewer", "llm", 2, False,
                             classify_detail(reply), room_id="room-arl", round_index=1,
                             prompt_version="test/v0")
    assert rid > 0
    with store_ai_reply._conn() as c:
        row = dict(c.execute("SELECT * FROM ai_reply_log WHERE id=?", (rid,)).fetchone())
    for k, v in row.items():
        assert marker not in str(v), f"列 {k} 里出现了回复原文"
    assert row["evidence"] == "RQ:为什么"
    assert row["reply_len"] == len(reply)      # 长度是元数据，可以存


# ============ ⑤ 端到端：navigator 回包落库 + 统计端点 ============

@pytest.fixture(scope="module")
def stu_arl(client):
    return {"Authorization": "Bearer " + _login(client, "student", "arl1")}


def test_navigator_reply_is_logged_driver_is_not(client, teacher, stu_arl, monkeypatch):
    """只有 navigator 回复进表：driver（小狐·驾驶员）按契约本就可按学生指令写关键片段，
    对它记 D 是误报；红线违规率的分母只能是 navigator 回复。"""
    import app.ai as ai_mod
    monkeypatch.setattr(ai_mod, "_call_llm",
                        lambda system, messages: "第 3 行的循环条件，为什么猜对时会退出？")
    client.post("/api/teacher/consent",
                json={"student_id": "stu-arl1", "guardian": "家长"}, headers=teacher)

    def _n() -> int:
        with store_ai_reply._conn() as c:
            return c.execute("SELECT COUNT(*) FROM ai_reply_log WHERE student_id='stu-arl1'").fetchone()[0]

    n0 = _n()
    r = client.post("/api/ai/chat",
                    json={"message": "我卡住了", "role": "reviewer", "roomId": "room-arl1"},
                    headers=stu_arl)
    assert r.status_code == 200 and r.json().get("blocked") is not True
    assert _n() == n0 + 1

    with store_ai_reply._conn() as c:
        row = dict(c.execute("SELECT * FROM ai_reply_log WHERE student_id='stu-arl1'"
                             " ORDER BY id DESC LIMIT 1").fetchone())
    assert row["reply_class"] == "RQ" and row["rq"] == 1 and row["violation"] == 0
    assert row["role"] == "reviewer" and row["source"] == "llm"
    assert row["room_id"] == "room-arl1"
    assert row["round_index"] is None          # 该房间没有进行中的轮：NULL 是真值不是缺数据
    assert row["prompt_version"] == ai_mod.PROMPT_VERSION

    # driver 不落表
    client.post("/api/ai/chat", json={"message": "帮我看看", "role": "turtle"}, headers=stu_arl)
    assert _n() == n0 + 1

    # 强制苏格拉底把 driver 顶成 navigator → 照样落表（is_navigator = socratic or reviewer）
    client.post("/api/ai/chat",
                json={"message": "再想想", "role": "turtle", "socratic": True}, headers=stu_arl)
    assert _n() == n0 + 2


def test_guard_blocked_reply_never_enters_the_corpus(client, teacher, stu_arl):
    """source='guard' 的护栏话术整条排除出语料（定稿）——它不是 navigator 生成的，
    判成 O 会把平台自己的固定话术算进「AI 没在提问」的分母。"""
    def _n() -> int:
        with store_ai_reply._conn() as c:
            return c.execute("SELECT COUNT(*) FROM ai_reply_log WHERE student_id='stu-arl1'").fetchone()[0]

    n0 = _n()
    d = client.post("/api/ai/chat",
                    json={"message": "我想自杀", "role": "reviewer"}, headers=stu_arl).json()
    assert d["source"] == "guard" and d["blocked"] is True
    assert _n() == n0


def test_stats_endpoint_two_rate_families_and_permissions(client, teacher, stu_arl):
    """统计端点：两套占比分开命名、违规率、教师权限、空集不冒充 0。"""
    assert client.get("/api/research/ai_reply_stats", headers=stu_arl).status_code == 403

    d = client.get("/api/research/ai_reply_stats?room_id=room-arl1", headers=teacher).json()
    assert d["n"] >= 1
    assert set(d["by_class"]) == set(store_ai_reply.CLASSES)      # 计数为 0 的类也显式出现
    assert set(d["occurrence"]) == {"cq", "eq", "rq", "d"}
    assert abs(sum(d["class_share"].values()) - 1.0) < 1e-6       # 折叠码占比和=1
    assert d["violation_n"] == d["occurrence_n"]["d"]
    assert d["analysis_set"] is True
    assert d["sampling_gate_ready"] is False                      # 远不到 400 条前置闸

    # 空集：占比一律 None，不是 0.0 ——「一条样本都没有」≠「占比确实是 0」
    empty = client.get("/api/research/ai_reply_stats?room_id=room-不存在", headers=teacher).json()
    assert empty["n"] == 0
    assert empty["violation_rate"] is None
    assert all(v is None for v in empty["occurrence"].values())

    # study_id 名单为空时必须返回空集，不能退化成「不过滤」把全平台数据算进某个课题
    ghost = client.get("/api/research/ai_reply_stats?study_id=999999", headers=teacher).json()
    assert ghost["n"] == 0


def test_stats_excludes_students_without_consent(client, teacher, stu_arl):
    """T0-2 分析集口径：无有效监护人同意的学生默认不进研究数据，剔了几条如实报告。"""
    store_ai_reply.add("stu-arl-noconsent", "reviewer", "llm", 1, False,
                       classify_detail("这是什么？"), room_id="room-arl-consent")
    d = client.get("/api/research/ai_reply_stats?room_id=room-arl-consent", headers=teacher).json()
    assert d["n"] == 0 and d["excluded_no_consent"] == 1
    d2 = client.get("/api/research/ai_reply_stats?room_id=room-arl-consent&include_no_consent=1",
                    headers=teacher).json()
    assert d2["n"] == 1 and d2["analysis_set"] is False
