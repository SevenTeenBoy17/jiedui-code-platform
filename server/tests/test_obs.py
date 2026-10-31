"""教师结构化观察表 A 包（《观察表与评分金标准_定稿》交付物 A）。

这批用例钉死的是**定稿里最容易被后续「优化」掉的五件事**：
observer_id 只能来自令牌、SRC 三码多选并存不许仲裁、X 率是效度闸门、
席位冲突只出数字绝不回写 ct_events、驾驶时间必须三数并排。
"""
import pytest


def _login(client, role: str, name: str) -> str:
    """本地登录助手。**不要**从 tests.conftest import —— tests/ 没有 __init__.py，
    那会把 conftest 当第二个模块重跑，它开头就删测试库。"""
    r = client.post(f"/api/auth/{role}/login", json={"username": name, "password": "123456"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def obs_stu(client):
    return {"Authorization": "Bearer " + _login(client, "student", "obs1")}


def _post(client, teacher, **kw):
    return client.post("/api/obs/window", json=kw, headers=teacher)


def _ct_snapshot():
    """ct_events 全表快照（行内容 + 行数）。align/* 是只读端点，跑完必须逐字节一致 ——
    §A8 冲突处置铁律①：冲突绝不回写平台数据。"""
    import app.store as st
    with st._conn() as c:
        rows = c.execute("SELECT id,user_id,type,detail,project_id,ts,sv,round_index,room_id,"
                         "switch_reason FROM ct_events ORDER BY id").fetchall()
    return [tuple(r) for r in rows]


# ============ ① 录入：observer_id 来自令牌，窗口由服务端写 ============

def test_batch_write_takes_observer_from_token_and_server_writes_the_window(client, teacher, obs_stu):
    """批量提交一轮的多对；observer_id 取令牌 sub、observed_from/to 服务端写。

    客户端**多传这三个字段一律无效**（§A1：observer_id 绝不可空、observed_from/to 禁人工填）——
    观察者可伪造则 κ 算不回来；观察时刻可人工填则 §A9.2 的 MTS 无偏前提（观察时刻与行为相位
    独立）直接作废。
    """
    r = _post(client, teacher, study_id="obs-s1", round_index=1, layer="sweep",
              tech_status="正常",
              items=[
                  # 客户端试图自己指定观察者与窗口时刻 —— 必须被丢弃
                  {"room_id": "room-o1", "pair_id": "01", "window_seq": 1, "kb": "L",
                   "src_a": 1, "src_p": 0, "src_s": 0, "n_code": "none",
                   "observer_id": "tea-伪造", "observed_from": 1, "observed_to": 2},
                  {"room_id": "room-o2", "pair_id": "02", "window_seq": 1, "kb": "R",
                   "src_p": 1, "n_code": "n1", "evt_tag": "求助无人应"},
              ])
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["count"] == 2 and len(d["ids"]) == 2
    assert d["observer_id"] == "tea-lishen"                       # 令牌 sub，不是客户端传的
    assert d["observed_to"] - d["observed_from"] == 13            # sweep 一窗 ≈13 秒（§A1）

    items = client.get("/api/obs/windows?study_id=obs-s1", headers=teacher).json()["items"]
    assert len(items) == 2
    assert {x["observer_id"] for x in items} == {"tea-lishen"}
    assert all(x["observed_from"] == d["observed_from"] and x["observed_to"] == d["observed_to"]
               for x in items)
    assert all(x["tech_status"] == "正常" and x["layer"] == "sweep" for x in items)
    # 窗起点 − 轮起点：该房没有 learning_round → NULL 是真值（没有可锚定的轮起点）
    assert all(x["window_offset_sec"] is None for x in items)
    # 过滤器可用（教师按房间/轮次回读自己刚交的表）
    one = client.get("/api/obs/windows?study_id=obs-s1&room_id=room-o2", headers=teacher).json()
    assert one["n"] == 1 and one["items"][0]["kb"] == "R"


def test_window_offset_is_anchored_to_the_platform_round_start(client, teacher):
    """有平台轮时 window_offset_sec = 窗起点 − 轮起点（§A1，A7 敏感性协变量 / §A9.2 相位记录）。"""
    from app import store_learner as L
    rid = client.post("/api/learner/rounds/open",
                      json={"room_id": "room-off", "round_index": 2}, headers=teacher).json()["id"]
    with L._conn() as c:                                          # 轮起点前移 600 秒
        c.execute("UPDATE learning_round SET started_at=started_at-600 WHERE id=?", (rid,))
    r = _post(client, teacher, study_id="obs-off", round_index=2, room_id="room-off",
              items=[{"pair_id": "01", "kb": "L"}]).json()
    row = client.get("/api/obs/windows?study_id=obs-off", headers=teacher).json()["items"][0]
    t0 = L.get_round(rid)["started_at"]
    assert row["window_offset_sec"] == r["observed_from"] - t0
    assert 580 <= row["window_offset_sec"] <= 620


def test_focus_layer_keeps_its_own_columns_and_sweep_rows_stay_null(client, teacher):
    """focus 扩展列（§A3 换手锚定分段 + F1/F2/F3/F4/F5/R0）原样落库；
    sweep 行的 focus 列**强制 NULL**（§A1「sweep 一律 NULL」）—— 两层量程不同
    （瞬时占有率 vs 事件式），混列会让「报告中不得合并」这条纪律在表结构上先失守。"""
    _post(client, teacher, study_id="obs-fx", round_index=1, layer="focus", room_id="room-fx",
          items=[{"pair_id": "07", "segment_seq": 1, "segment_driver_seat": "L",
                  "f1_switches": 2, "f1_trigger": "student", "f2_shared": "both_discussed",
                  "f3_after_hint": "discussed", "f4_l_turns": 9, "f4_r_turns": 4,
                  "r0_count": 3, "f5_direction": "peer_gt_ai", "kb": "L"}])
    # 同一 study 里再交一条 sweep，且**故意带上** focus 字段
    _post(client, teacher, study_id="obs-fx", round_index=1, layer="sweep", room_id="room-fx",
          items=[{"pair_id": "07", "kb": "R", "f1_switches": 5, "f5_direction": "equal",
                  "segment_seq": 9}])
    rows = client.get("/api/obs/windows?study_id=obs-fx", headers=teacher).json()["items"]
    f = next(x for x in rows if x["layer"] == "focus")
    s = next(x for x in rows if x["layer"] == "sweep")
    assert (f["f1_switches"], f["f1_trigger"], f["f2_shared"]) == (2, "student", "both_discussed")
    assert (f["f4_l_turns"], f["f4_r_turns"], f["r0_count"]) == (9, 4, 3)
    assert (f["segment_seq"], f["segment_driver_seat"], f["f5_direction"]) == (1, "L", "peer_gt_ai")
    assert f["observed_to"] - f["observed_from"] == 8 * 60         # focus 一窗 ≈8 分钟（§A3）
    assert (s["f1_switches"], s["f5_direction"], s["segment_seq"]) == (None, None, None)


# ============ ② SRC 三码多选并存：定稿对文献的主动拒绝（§A5）============

def test_src_three_codes_coexist_and_are_never_arbitrated(client, teacher):
    """同窗 A 与 P 同时点亮时**两个都留**。

    §A5：孙贞岳「同时包含 1 或 4 则优先编码为 4」的招数在 CX 有致命例外 ——
    孙保护的类不是他的因变量，保护无害；CX 的 P **就是因变量本身**，
    「同时出现 P 与 A 时判 P」等于用编码规则伪造研究结论。故落库层一格都不许仲裁。
    src_unclear=1 时三码一律 NULL（判不出 ≠ 三个都没出现）。
    """
    _post(client, teacher, study_id="obs-src", round_index=1, room_id="room-src",
          items=[{"pair_id": "01", "kb": "L", "src_a": 1, "src_p": 1, "src_s": 0},
                 {"pair_id": "02", "kb": "R", "src_a": 1, "src_p": 1, "src_s": 1},
                 {"pair_id": "03", "kb": "L", "src_a": 1, "src_p": 1, "src_unclear": 1}])
    rows = {x["pair_id"]: x for x in
            client.get("/api/obs/windows?study_id=obs-src", headers=teacher).json()["items"]}
    a = rows["01"]
    assert (a["src_a"], a["src_p"], a["src_s"]) == (1, 1, 0)       # A 与 P 并存，未被仲裁掉
    b = rows["02"]
    assert (b["src_a"], b["src_p"], b["src_s"]) == (1, 1, 1)       # 三码同时点亮同样合法
    c = rows["03"]
    assert (c["src_a"], c["src_p"], c["src_s"]) == (None, None, None) and c["src_unclear"] == 1


def test_dirty_codes_are_rejected_and_free_text_is_capped(client, teacher):
    """脏值挡在入口（与 ct.py 埋点白名单同一纪律）：脏值一旦落库，X 率与对齐表的分组就两可。
    唯一的自由字段 evt_note 超长**截断**而不是 400 —— 现场教师打字被弹错误框 = 下一轮弃填。"""
    base = dict(study_id="obs-bad", round_index=1, room_id="room-bad")
    for bad in ({"kb": "左"}, {"n_code": "N9"}, {"evt_tag": "自己编的标签"},
                {"src_a": 2}, {"seat": "M"}, {"window_seq": -1}):
        assert _post(client, teacher, **base,
                     items=[{"pair_id": "01", **bad}]).status_code == 400, bad
    # focus 专用格的白名单只在 focus 层校验（sweep 层这些列结构上不存在，一律清空）
    for bad in ({"f1_trigger": "随便"}, {"f2_shared": "都看了"}, {"f5_direction": "差不多"},
                {"f4_l_turns": -2}, {"segment_driver_seat": "中"}):
        assert _post(client, teacher, **base, layer="focus",
                     items=[{"pair_id": "01", **bad}]).status_code == 400, bad
    assert _post(client, teacher, study_id="obs-bad", round_index=9,
                 room_id="r", items=[{"pair_id": "01"}]).status_code == 400
    assert _post(client, teacher, study_id="obs-bad", round_index=1, layer="随手记",
                 room_id="r", items=[{"pair_id": "01"}]).status_code == 400
    assert _post(client, teacher, study_id="", round_index=1, room_id="r",
                 items=[{"pair_id": "01"}]).status_code == 400
    assert _post(client, teacher, study_id="obs-bad", round_index=1, room_id="r",
                 items=[]).status_code == 400
    assert _post(client, teacher, study_id="obs-bad", round_index=1,
                 items=[{"pair_id": "01"}]).status_code == 400     # 批级与格级都没有 room_id

    # 大小写归一（教师端按钮点出来的值不该因大小写分裂成两个类目）+ evt_note 截断
    _post(client, teacher, **base,
          items=[{"pair_id": "01", "kb": "l", "n_code": "N2", "evt_tag": "其他",
                  "evt_note": "一二三四五六七八九十一二三四五六七八九十二十一"}])
    row = client.get("/api/obs/windows?study_id=obs-bad", headers=teacher).json()["items"][0]
    assert row["kb"] == "L" and row["n_code"] == "n2"
    assert len(row["evt_note"]) == 20


# ============ ③ X 率自动汇总：效度闸门（§A2 T1-5）============

def test_quality_aggregates_x_rate_from_each_cell_and_flags_over_threshold(client, teacher):
    """X 率由后端从**各格的「没看清」**自动汇总（不设独立 X 格：教师不会主动勾「我判不出」，
    X 率恒接近 0，穷尽性检验永远触发不了）。>10% → over_threshold，判类目体系不完备。"""
    # 10 格：kb 没看清 1、src 没看清 1、n 没看清 1（三格分属不同窗）→ X = 3/10 = 0.3
    items = [{"pair_id": f"{i:02d}", "kb": "L", "src_a": 1, "n_code": "none"} for i in range(1, 8)]
    items += [{"pair_id": "08", "kb": "unclear", "src_a": 1, "n_code": "none"},
              {"pair_id": "09", "kb": "L", "src_unclear": 1, "n_code": "none"},
              {"pair_id": "10", "kb": "L", "src_a": 1, "n_code": "unclear"}]
    _post(client, teacher, study_id="obs-x", round_index=1, room_id="room-x", items=items)

    d = client.get("/api/obs/quality?study_id=obs-x", headers=teacher).json()
    assert d["n_windows"] == 10 and d["x_rate"] == 0.3
    assert d["by_field"]["kb"]["count"] == 1 and d["by_field"]["kb"]["rate"] == 0.1
    assert d["by_field"]["src"]["count"] == 1 and d["by_field"]["n_code"]["count"] == 1
    assert d["threshold"] == 0.10 and d["over_threshold"] is True
    assert "退回改手册" in d["note"]

    # 同一窗勾了多个「没看清」不许重复计数（分子是**窗**不是格）
    _post(client, teacher, study_id="obs-x2", round_index=1, room_id="room-x2",
          items=[{"pair_id": "01", "kb": "unclear", "src_unclear": 1, "n_code": "unclear"}]
                + [{"pair_id": f"{i:02d}", "kb": "L", "n_code": "none"} for i in range(2, 21)])
    d2 = client.get("/api/obs/quality?study_id=obs-x2", headers=teacher).json()
    assert d2["n_windows"] == 20 and d2["x_rate"] == 0.05          # 1/20，不是 3/20
    assert d2["over_threshold"] is False                           # 恰在闸门内
    # 空 study：x_rate 为 null 而不是 0（没有数据 ≠ 判得很清楚），闸门不误触发
    d3 = client.get("/api/obs/quality?study_id=obs-空", headers=teacher).json()
    assert d3["n_windows"] == 0 and d3["x_rate"] is None and d3["over_threshold"] is False


# ============ ④ T1 席位对齐：只出数字，绝不回写（§A8）============

def _seed_ct(uid: str, room: str, ts: int, etype: str = "run"):
    import app.store as st
    with st._conn() as c:
        c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv,room_id)"
                  " VALUES(?,?,'',NULL,?,2,?)", (uid, etype, ts, room))


def test_align_seat_computes_mismatch_rate_and_never_writes_ct_events(client, teacher):
    """构造观察侧与平台侧**冲突**的数据，断言不一致率算得出，且 ct_events 一行未被改动。

    ⚠️ 定稿铁律（§A8 冲突处置之①）：冲突绝不回写平台数据。观察表只产出三样东西 ——
    不一致率（进论文）、人工核查名单、脏标。这条一旦破，A 就从「第三条腿」变成
    「把平台数据改成自己想要的样子」。
    """
    # 席位：L=stu-al、R=stu-ar（seat 行同时冻结 seat_map）
    r = _post(client, teacher, study_id="obs-t1", round_index=1, room_id="room-t1a",
              items=[{"pair_id": "01", "seat": "L", "student_id": "stu-al", "kb": "L"},
                     {"pair_id": "01", "seat": "R", "student_id": "stu-ar", "kb": "L"},
                     {"pair_id": "01", "kb": "both"},
                     {"pair_id": "01", "kb": "none"},
                     {"pair_id": "01", "kb": "unclear"}]).json()
    t0 = r["observed_from"]
    # 平台侧：窗内只有 stu-ar 有事件 → 三条 kb='L' 的窗全部与平台冲突
    _seed_ct("stu-ar", "room-t1a", t0)
    _seed_ct("stu-ar", "room-t1a", t0 + 5, "fix")
    # 窗外的事件不该被算进来（左闭右开 [observed_from, observed_to)）
    _seed_ct("stu-al", "room-t1a", t0 - 100)
    _seed_ct("stu-al", "room-t1a", r["observed_to"])

    before = _ct_snapshot()
    d = client.get("/api/obs/align/seat?study_id=obs-t1", headers=teacher).json()
    assert _ct_snapshot() == before                                 # ← 只读：一行都没动

    assert d["n_windows"] == 5
    assert d["n_comparable"] == 2                                   # both/none/unclear 不计入分母
    assert d["mismatch_rate"] == 1.0                                # 两格都判成了 L，平台侧是 R
    assert d["both_rate"] == 0.2 and d["none_rate"] == 0.2 and d["unclear_rate"] == 0.2
    assert d["writes_platform_data"] is False
    assert d["note"] == "共机半盲的定量估计——此不一致率是论文测量局限章的原始数据，绝不回写平台"
    assert len(d["review_list"]) == 2 and d["review_list"][0]["room_id"] == "room-t1a"

    # 一致的一对：不一致率归 0（说明这个 1.0 不是恒真的假象）
    r2 = _post(client, teacher, study_id="obs-t1ok", round_index=1, room_id="room-t1b",
               items=[{"pair_id": "02", "seat": "L", "student_id": "stu-bl", "kb": "L"},
                      {"pair_id": "02", "seat": "R", "student_id": "stu-br", "kb": "L"}]).json()
    _seed_ct("stu-bl", "room-t1b", r2["observed_from"] + 1)
    d2 = client.get("/api/obs/align/seat?study_id=obs-t1ok", headers=teacher).json()
    assert d2["n_comparable"] == 2 and d2["mismatch_rate"] == 0.0


def test_align_seat_reports_unusable_windows_instead_of_hiding_them(client, teacher):
    """三类不可比如实分列，绝不混进分母 —— 混进去等于把「测不到」伪装成「测到了一致」：
    ① 席位不可解析；② 平台侧窗内零事件（共机下常态）；③ 平台侧窗内 ≥2 人（归属两可）。"""
    r = _post(client, teacher, study_id="obs-t1x", round_index=1, room_id="room-t1c",
              items=[{"pair_id": "03", "kb": "L"}]).json()          # 没有 seat/student → 不可解析
    r2 = _post(client, teacher, study_id="obs-t1x", round_index=1, room_id="room-t1d",
               items=[{"pair_id": "04", "seat": "L", "student_id": "stu-dl", "kb": "L"},
                      {"pair_id": "04", "seat": "R", "student_id": "stu-dr", "kb": "R"}]).json()
    # room-t1d 窗内两个账号都有事件 → 归属两可；另一格无任何事件 → 零证据
    _seed_ct("stu-dl", "room-t1d", r2["observed_from"])
    _seed_ct("stu-dr", "room-t1d", r2["observed_from"] + 1)
    assert r["observed_from"] <= r2["observed_from"]

    d = client.get("/api/obs/align/seat?study_id=obs-t1x", headers=teacher).json()
    assert d["excluded"]["no_seat_map"] == 1
    assert d["excluded"]["platform_ambiguous"] == 2
    assert d["n_comparable"] == 0 and d["mismatch_rate"] is None    # 无可比窗 → null 不是 0


# ============ ⑤ T5 驾驶时间占比：三数并排（§A9.2）============

def test_align_driving_reports_p_weak_both_and_none_side_by_side(client, teacher):
    """MTS 估计量：none/unclear 排除出分母、both 各计 0.5，**p_weak/both/none 三数并排必报**。

    只报 p̄ 会把「契约执行良好」与「两人天天抢」呈现成同一个数；
    both 率 >10% 就是受保护驾驶时间（idea32）的**直接失败判据**，比 p̂ 本身更重要。
    """
    client.post("/api/teacher/consent/batch",
                json={"student_ids": ["stu-dvl", "stu-dvr"]}, headers=teacher)
    kbs = ["L", "L", "R", "both", "none", "unclear"]
    _post(client, teacher, study_id="obs-t5", round_index=1, room_id="room-t5",
          items=[{"pair_id": "01", "seat": "L", "student_id": "stu-dvl", "kb": kbs[0]},
                 {"pair_id": "01", "seat": "R", "student_id": "stu-dvr", "kb": kbs[1]}]
                + [{"pair_id": "01", "kb": k} for k in kbs[2:]])

    d = client.get("/api/obs/align/driving?study_id=obs-t5", headers=teacher).json()
    assert d["n_analysis_windows"] == 6
    assert d["both_rate"] == round(1 / 6, 4) and d["none_rate"] == round(1 / 6, 4)
    assert d["unclear_rate"] == round(1 / 6, 4)
    # 分母 = 4 窗（L,L,R,both）；L 得 2+0.5=2.5 → 0.625，R 得 1+0.5=1.5 → 0.375
    assert d["p_weak"] == 0.375
    assert d["both_over_threshold"] is True                          # 1/6 > 10% → idea32 失败判据
    assert d["p_weak_definition"] == "within_pair_lower"
    assert d["writes_platform_data"] is False
    # 个体层 p̂ 永不可用于个体判定（§A9.2 半宽 ±0.23）→ rows 只给 HMAC 假名，不给学号
    from app.research import _pid
    by = {x["pid"]: x for x in d["rows"]}
    assert set(by) == {_pid("stu-dvl"), _pid("stu-dvr")}
    assert by[_pid("stu-dvl")]["p_hat"] == 0.625 and by[_pid("stu-dvl")]["n_windows"] == 4
    assert "stu-dvl" not in str(d)
    assert any("both 率 >10%" in x for x in d["notes"])


def test_align_driving_excludes_pairs_without_seat_map_or_consent(client, teacher):
    """分析集口径（T0-2）：**整对**都要有有效监护人同意才进研究数据 ——
    只剔一侧会让分子（某人的占有）与分母（该对的窗数）落在不同集合上，占比就是假的。
    席位不可解析的窗同样出分析集，两类剔除数如实分列。"""
    client.post("/api/teacher/consent", json={"student_id": "stu-nc1"}, headers=teacher)
    _post(client, teacher, study_id="obs-t5x", round_index=1, room_id="room-t5x",
          items=[{"pair_id": "01", "seat": "L", "student_id": "stu-nc1", "kb": "L"},
                 {"pair_id": "01", "seat": "R", "student_id": "stu-nc2", "kb": "R"}])
    _post(client, teacher, study_id="obs-t5x", round_index=1, room_id="room-t5y",
          items=[{"pair_id": "02", "kb": "L"}])                      # 无席位

    d = client.get("/api/obs/align/driving?study_id=obs-t5x", headers=teacher).json()
    assert d["excluded"]["no_consent"] == 2 and d["excluded"]["no_seat_map"] == 1
    assert d["n_analysis_windows"] == 0
    # 三数并排的字段**恒存在**（值可以是 null，键不许消失）
    assert set(("p_weak", "both_rate", "none_rate")) <= set(d)
    assert d["p_weak"] is None and d["both_rate"] is None and d["none_rate"] is None


# ============ ⑥ SRC-proxy/v0（§A15）============

def test_src_proxy_carries_is_proxy_flag_and_three_separate_components(client, teacher):
    """响应**必须带** is_proxy 与那句 note（§A15 三条硬纪律写进响应体）；
    三个分量分别报，禁止合成「主导来源」（那是 §A5 已封杀的保护性仲裁借尸还魂）。"""
    import time
    import app.store as st
    uid, now = "stu-px1", int(time.time())
    client.post("/api/teacher/consent", json={"student_id": uid}, headers=teacher)
    # error→fix（干净）/ error→ai_help→fix（不干净）/ role_switch→run 延迟 60 秒
    seq = [(-600, "error", None), (-590, "fix", None),
           (-500, "error", None), (-495, "ai_help", None), (-480, "fix", None),
           (-300, "role_switch", "negotiated"), (-240, "run", None),
           (-100, "ai_help", None)]
    with st._conn() as c:
        for off, t, reason in seq:
            c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv,switch_reason)"
                      " VALUES(?,?,'',NULL,?,2,?)", (uid, t, now + off, reason))

    d = client.get(f"/api/obs/src_proxy?student_id={uid}", headers=teacher).json()
    assert d["is_proxy"] is True
    assert d["note"] == "代理量：无观察表A数据时不得单独作结论依据，须报其与A的相关系数"
    assert d["proxy_version"] == "src-proxy/v0" and d["requires_observation_anchor"] is True
    # A：两个都报（趋势检验以 ai_rate 为主 —— 占比的分母随行为总量漂移）
    assert d["a"]["ai_help"] == 2 and d["a"]["a_share"] == round(2 / 8, 4)
    assert d["a"]["ai_rate"] is not None
    # P：换手后首个 run/fix 的延迟中位数 60 秒 → 1/(1+1) = 0.5；negotiated 并排必报
    assert d["p"]["role_switches"] == 1 and d["p"]["median_delay_sec"] == 60
    assert d["p"]["p_proxy"] == 0.5 and d["p"]["negotiated_share"] == 1.0
    # S：其间有 ai_help 的那次修复不算自我修复 → 1/2
    assert (d["s"]["triples"], d["s"]["errors"], d["s"]["s_proxy"]) == (1, 2, 0.5)
    assert d["s"]["sv_mixed"] is False and set(d["s"]["by_sv"]) == {"2"}
    # 无 A 锚定 → 不得单独作结论（这是设计不是缺陷）
    assert d["conclusion_eligible"] is False and d["composite_forbidden"] is True
    assert d["anchor"]["n"] == 0 and d["anchor"]["rho_a"] is None
    # 六维公式一个字不动：代理量不写任何 ct_scores 口径
    assert "ct_scores" not in str(d) and "formula" not in str(d).lower()


def test_src_proxy_nulls_p_when_no_switch_and_splits_by_event_semantics(client, teacher):
    """窗内无 role_switch 时 p_proxy 置 **NULL 而不是 0**（§A15）——
    没换过手不等于「换手后接手很慢」。sv 混用时按 sv 分组算再合并并输出 sv_mixed。"""
    import time
    import app.store as st
    uid, now = "stu-px2", int(time.time())
    client.post("/api/teacher/consent", json={"student_id": uid}, headers=teacher)
    with st._conn() as c:
        for off, t, sv in ((-900, "error", 1), (-890, "fix", 1),
                           (-300, "error", 2), (-290, "fix", 2), (-200, "run", 2)):
            c.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv)"
                      " VALUES(?,?,'',NULL,?,?)", (uid, t, now + off, sv))
    d = client.get(f"/api/obs/src_proxy?student_id={uid}", headers=teacher).json()
    assert d["p"]["p_proxy"] is None and d["p"]["negotiated_share"] is None
    assert d["s"]["sv_mixed"] is True and set(d["s"]["by_sv"]) == {"1", "2"}
    assert d["s"]["by_sv"]["1"]["triples"] == 1 and d["s"]["by_sv"]["2"]["triples"] == 1
    # 时间窗 [since, until) 与全仓同口径：右开界上的事件出窗
    d2 = client.get(f"/api/obs/src_proxy?student_id={uid}&since={now - 400}&until={now - 200}",
                    headers=teacher).json()
    assert d2["events_total"] == 2 and d2["s"]["sv_mixed"] is False


def test_src_proxy_honours_the_consent_gate(client, teacher):
    """同意门不豁免（红线）：代理量同样是对未成年人行为流的研究测量，
    无有效监护人同意的学生不进研究数据（与 research.build_dataset 同源口径）。"""
    r = client.get("/api/obs/src_proxy?student_id=stu-无同意", headers=teacher)
    assert r.status_code == 403 and r.json()["detail"] == "CONSENT_REQUIRED"
    assert client.get("/api/obs/src_proxy?student_id=", headers=teacher).status_code in (400, 422)


# ============ ⑦ RBAC 与表结构纪律 ============

def test_students_are_403_on_every_obs_endpoint(client, obs_stu):
    """A 包全线教师/研究员。观察表是对学生本人的过程判定（在卡住/在争执/键鼠不在你手上），
    可读即等于把判定下发给学生本人 —— 红线：判定与分数不下发学生。"""
    assert _post(client, obs_stu, study_id="obs-rbac", round_index=1, room_id="r",
                 items=[{"pair_id": "01", "kb": "L"}]).status_code == 403
    for path in ("/api/obs/windows?study_id=obs-s1",
                 "/api/obs/quality?study_id=obs-s1",
                 "/api/obs/align/seat?study_id=obs-s1",
                 "/api/obs/align/driving?study_id=obs-s1",
                 "/api/obs/src_proxy?student_id=stu-obs1"):
        assert client.get(path, headers=obs_stu).status_code == 403, path


def test_obs_window_pins_observer_id_not_null_and_the_column_set(client):
    """§A1 明文「observer_id 绝不可空」：没有它就永远算不出观察者间一致性。
    列集合一并钉死 —— 谁加自由文本列（evt_note 之外）谁触发这条：
    自由文本进不了统计管线，且在 chat_log 纯元数据的铁律下会凭空开一个语义采集面。"""
    from app import store_obs as O
    with O._conn() as c:
        info = {r[1]: r for r in c.execute("PRAGMA table_info(obs_window)")}
    for col in ("study_id", "room_id", "round_index", "pair_id", "window_seq", "layer",
                "observer_id", "observed_from", "observed_to", "created_at"):
        assert info[col][3] == 1, f"{col} 必须 NOT NULL"
    assert set(info) == {
        "id", "study_id", "room_id", "round_index", "pair_id", "seat", "student_id",
        "window_seq", "layer", "observer_id", "observed_from", "observed_to",
        "window_offset_sec", "tech_status", "created_at",
        "kb", "src_a", "src_p", "src_s", "src_unclear", "n_code", "evt_tag", "evt_note",
        "segment_seq", "segment_driver_seat", "segment_from", "segment_to",
        "f1_switches", "f1_trigger", "f2_shared", "f3_after_hint",
        "f4_l_turns", "f4_r_turns", "r0_count", "f5_direction"}
    # seat_map：seat→student 的唯一权威来源，**首写即冻结**（§A1 补的草案缺口）
    assert O.freeze_seat("room-frz", 1, "L", "stu-frz1") is True
    assert O.freeze_seat("room-frz", 1, "L", "stu-别人") is False    # 不覆盖
    assert O.seat_students("room-frz", 1) == {"L": "stu-frz1"}
    # ct_events 的房间维索引（§A14 P0-5 / §A15「上线前先补 idx_ct_room」）
    import app.store as st
    with st._conn() as c:
        idx = {r[1] for r in c.execute("PRAGMA index_list(ct_events)")}
    assert "idx_ct_room" in idx


def test_obs_module_never_touches_the_six_dim_formula():
    """红线静态钉死：A 包不消费也不改六维评分（消费=动公式=升 FORMULA_VERSION）。
    SRC-proxy/v0 定名独立版本号，不进 ct_scores、不进 REPORT_FOLD、不动 FORMULA_VERSION。

    走 AST 而不是文本 in：注释与文档字符串里必须能**写出**这些名字来说明为什么不用它们，
    可执行代码里则一个都不许出现（照 test_learner 的 inspect 钉死法，判据更精确一层）。"""
    import ast
    import inspect
    from app import obs
    tree = ast.parse(inspect.getsource(obs))
    from_ct = {a.name for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)
               and n.module == "app.ct" for a in n.names}
    assert from_ct == {"KEY"}, f"obs.py 只许从 ct.py 借事件白名单，实际借了 {from_ct}"
    used = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)}
    used |= {n.attr for n in ast.walk(tree) if isinstance(n, ast.Attribute)}
    for banned in ("summary_for", "ct_scores", "ct_report", "REPORT_FOLD", "FORMULA_VERSION"):
        assert banned not in used, f"obs.py 引用了 {banned}，违反六维公式红线"
