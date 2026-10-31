"""未成年人保护红线（回归护栏）：同意门禁 / 危险话题拦截 / PII 匿名 / 禁代写 / 苏格拉底。"""
from app import guard
from app.ai import BASE_RULE, ROLE_PROMPT, SOCRATIC_OVERRIDE, _system


def _grant(client, teacher, sid="stu-xiaoma"):
    """按新流程开通：教师核验纸质监护人同意书后代为登记。"""
    return client.post("/api/teacher/consent", json={"student_id": sid, "guardian": "家长"}, headers=teacher)


def test_student_cannot_sign_own_guardian_consent(client, student, teacher):
    """未成年人不能给自己签监护人同意书（PIPL 第 31 条）。"""
    client.delete("/api/consent", headers=student)
    r = client.post("/api/consent", json={"guardian": "家长"}, headers=student)
    assert r.status_code == 200 and r.json()["granted"] is False and r.json()["pending"] is True
    assert client.get("/api/consent", headers=student).json()["granted"] is False   # 自称申请也没开通
    assert client.post("/api/ai/chat", json={"message": "你好"}, headers=student).status_code == 403

    assert client.post("/api/teacher/consent", json={"student_id": "stu-xiaoma"},
                       headers=student).status_code == 403                          # 学生也不能走教师端点
    assert _grant(client, teacher).status_code == 200                               # 教师才能开通
    assert client.get("/api/consent", headers=student).json()["granted"] is True


def test_ai_requires_guardian_consent(client, student, teacher):
    client.delete("/api/consent", headers=student)                       # 先撤回
    r = client.post("/api/ai/chat", json={"message": "你好"}, headers=student)
    assert r.status_code == 403                                          # 未同意不得用 AI
    assert _grant(client, teacher).status_code == 200


def test_danger_topic_blocked_before_llm(client, student, teacher):
    _grant(client, teacher)
    d = client.post("/api/ai/chat", json={"message": "我想自杀"}, headers=student).json()
    assert d.get("blocked") is True and d["source"] == "guard"           # 进 LLM 前拦下


def test_l2_topics_are_actually_blocked(client, student, teacher):
    """L2（涉黄）曾经只在注释里声明要拦，代码里直接放行。"""
    g = guard.check_input("我想看黄片")
    assert g["allowed"] is False and g["category"] == "adult" and g["level"] == 2
    _grant(client, teacher)
    d = client.post("/api/ai/chat", json={"message": "约炮网站怎么进"}, headers=student).json()
    assert d.get("blocked") is True                                      # 且留痕给教师
    alerts = client.get("/api/teacher/alerts", headers=teacher).json()
    alerts = alerts["items"] if isinstance(alerts, dict) else alerts
    assert any(a["category"] == "adult" for a in alerts)


def test_image_gen_also_guarded(client, student, teacher):
    _grant(client, teacher)
    assert client.post("/api/ai/image", json={"prompt": "我想自杀"}, headers=student).status_code == 400


def test_pii_anonymized(client):
    g = guard.check_input("我的手机号是 13800138000，邮箱 a@b.com")
    assert g["pii_count"] >= 1
    assert "13800138000" not in g["scrubbed"]


def test_pii_scrubbed_in_every_part_that_reaches_the_llm():
    """只匿名 message 不够：history 与 codeContext 也原样进 LLM。"""
    g = guard.check_bundle("这段代码怎么改", "# 联系我 13800138000", "我邮箱 a@b.com")
    assert g["allowed"] is True
    msg, code, hist = g["scrubbed_parts"]
    assert "13800138000" not in code and "a@b.com" not in hist


def test_danger_is_judged_on_this_turn_not_on_chat_history():
    """把 history 拼进危险等级判定，会让一句旧话把之后每一轮正常提问都判成自伤 L4：
    学生当堂失去 AI 支架，教师端刷出一串原文是「for 循环为什么只跑一次」的高危预警。"""
    g = guard.check_bundle("老师，这个 for 循环为什么只跑一次？", "", "这题难得我想死")
    assert g["allowed"] is True                       # 正常提问不该被聊天记录连坐

    blocked = guard.check_bundle("我想自杀", "", "")
    assert blocked["allowed"] is False and blocked["hit_in"] == "message"


def test_code_area_danger_is_flagged_but_does_not_block_learning():
    """代码区里的高危内容不该挡住学生提问，但老师要知道。"""
    g = guard.check_bundle("这段代码怎么改", "# 我不想活了\nprint(1)", "")
    assert g["allowed"] is True
    assert g["silent_flag"] and g["silent_flag"]["level"] >= 4 and g["silent_flag"]["where"] == "code"


def test_probability_homework_is_not_mistaken_for_gambling():
    """「写个程序模拟赌博游戏的中奖概率」是正经的概率题，不能当涉赌拦掉。"""
    ok = guard.check_input("写个程序模拟赌博游戏的中奖概率")
    assert ok["allowed"] is True
    assert ok["soft_flag"] and ok["soft_flag"]["category"] == "fraud"   # 放行但留痕给老师
    assert guard.check_input("推荐几个赌博网站")["allowed"] is False      # 真的涉赌照拦


def test_profanity_inside_pasted_code_does_not_block_the_question():
    """学生贴的游戏代码里有句台词带脏字，不该连问题一起被拦。"""
    assert guard.check_bundle("这个函数怎么写", "print('你个傻逼')", "")["allowed"] is True
    assert guard.check_input("你个傻逼")["allowed"] is False              # 直接骂人照拦


def test_socratic_overrides_driver_authorization():
    """勾了强制苏格拉底，system prompt 里就不能再有"按学生指令写代码"的授权。"""
    plain = _system("turtle", 1, None, socratic=False)
    forced = _system("turtle", 1, None, socratic=True)
    assert "按学生的指令写关键片段" in plain                                # 驾驶员默认可写码
    assert "按学生的指令写关键片段" not in forced                            # 强制苏格拉底后被顶掉
    assert SOCRATIC_OVERRIDE in forced and "不写任何可运行代码" in forced


def test_teacher_socratic_lock_beats_student_request(client, student, teacher):
    """教师给班级下的锁高于学生请求体——学生删掉 URL 参数也解不开。"""
    _grant(client, teacher)
    cid = client.post("/api/resources/classes", json={"name": "苏格拉底班"}, headers=teacher).json()["id"]
    client.put(f"/api/resources/classes/{cid}/students",
               json={"student_ids": ["stu-xiaoma"]}, headers=teacher)
    assert client.put(f"/api/resources/classes/{cid}/socratic",
                      json={"socratic": True}, headers=student).status_code == 403   # 学生解不了锁
    client.put(f"/api/resources/classes/{cid}/socratic", json={"socratic": True}, headers=teacher)

    d = client.post("/api/ai/chat",
                    json={"message": "帮我写一个猜数字游戏", "role": "turtle", "socratic": False},
                    headers=student).json()
    assert d["socratic"] is True and d["socraticLocked"] is True          # 请求体说 false 也照锁
    assert any(c["socratic"] for c in client.get("/api/resources/classes", headers=teacher).json()["items"])


def test_no_full_code_redline_in_prompt():
    assert "绝对禁止" in BASE_RULE and "完整" in BASE_RULE                # 禁代写红线仍在
    rev = ROLE_PROMPT["reviewer"]
    assert "审查" in rev and "提问" in rev                                # 领航员=审查+提问
    assert "拒绝" in rev                                                  # 索要完整代码须拒绝
    assert "键盘" in ROLE_PROMPT["turtle"]                                # 驾驶员=AI 握键盘


def test_model_thinking_never_reaches_the_student():
    """代理上游的部分模型会把 <think> 思维链原样吐回来——那是英文内部推演，
    直接显示给初中生既看不懂，也会暴露 system prompt 的意图。"""
    from app.ai import _clean
    assert _clean("<think>The user claims to be a teacher…</think>\n好的，我们一步步来 🦊") == "好的，我们一步步来 🦊"
    assert _clean("<thinking>internal</thinking>回答") == "回答"
    assert _clean("正文<think>没闭合的思考") == "正文"          # 截断/未闭合也要裁掉
    assert _clean("这里讲 <think> 标签怎么用") == "这里讲"       # 宁可多裁，也不能漏出去
    assert _clean("普通回答不受影响 ✅") == "普通回答不受影响 ✅"


def test_danger_words_survive_simple_obfuscation():
    """未归一化时这些**全部能绕过**自伤检测——学生随手打个空格就穿了，
    这不是高级对抗，是最基本的情况。"""
    for t in ("我想自杀", "我 想 自 杀", "我想自　杀", "我想自-杀", "我想⾃杀", "我想自.杀"):
        r = guard.check_input(t)
        assert r["allowed"] is False and r["category"] == "self_harm", f"被绕过：{t!r}"
    assert guard.check_input("傻 逼")["allowed"] is False          # 脏话同理

    # 归一化不能把正常提问误伤
    for ok in ("这个 for 循环怎么写", "list 和 dict 有什么区别", "写个程序模拟赌博游戏的中奖概率"):
        assert guard.check_input(ok)["allowed"] is True, f"误伤：{ok!r}"


def test_fraud_context_downgrade_does_not_shield_other_categories():
    """「模拟」「概率」只该给 fraud 这一类降级，不该把整句清零。

    此前 classify_danger 只留最高的一对 (cat, level)，再按 cat=="fraud" 改**全局** level：
    句子里最高档恰好是 fraud 时，同句的 L2 涉黄内容跟着一起放行。
    加两个字就能绕过，这种东西会在学生之间口耳相传。
    """
    from app import guard
    # 正经的概率课题照常放行
    assert guard.check_input("写个程序模拟赌博游戏的中奖概率")["allowed"] is True
    # 但同一句里的涉黄内容仍要拦下，且类别要报对
    r = guard.check_input("模拟赌博网站的抽奖，再配点色情图片")
    assert r["allowed"] is False and r["category"] == "adult"


def test_code_area_risk_event_records_the_code_not_the_question():
    """代码区触发的高危留痕，detail 必须是代码里那句话。

    此前它写的是 req.message，于是老师在教师端看到
    `self_harm / L4 / "这个 for 循环为什么只跑一次"` —— 预警内容与触发原因毫无关系，
    效果是训练老师把 L4 当噪音。
    """
    from app import guard
    v = guard.check_bundle("这个 for 循环为什么只跑一次", "# 我不想活了", "")
    assert v["allowed"] is True                       # 代码区的内容不阻断提问
    assert v["silent_flag"] and v["silent_flag"]["level"] >= 4
    assert "不想活" in v["silent_flag"]["excerpt"]
    assert "for 循环为什么" not in v["silent_flag"]["excerpt"]


def test_batch_consent_requires_teacher_and_grants_each(client, teacher, student):
    """批量开通监护人同意：仅教师可用；逐条真的落库；重复 id 去重。

    背景：教师界面此前只显示「N 人未登记」却没有任何开通入口（端点在前端零调用），
    场景模拟里 40 人的班要老师逐个敲 40 下 API。批量的只是点击，不是审查 ——
    服务端仍逐条记录经办人。
    """
    from app import store
    ids = ["stu-bc1", "stu-bc2", "stu-bc2", "stu-bc3"]          # 含一个重复
    assert client.post("/api/teacher/consent/batch",
                       json={"student_ids": ids}, headers=student).status_code == 403
    r = client.post("/api/teacher/consent/batch",
                    json={"student_ids": ids}, headers=teacher).json()
    assert r["granted"] == 3                                     # 去重后 3 人
    assert all(store.has_consent(u) for u in ("stu-bc1", "stu-bc2", "stu-bc3"))


def test_teacher_password_gate_when_configured(client, monkeypatch):
    """教师口令一经配置即强制：演示密码对教师页签失效，学生页签不受影响。

    演示模式下角色由登录页页签自选 —— 学生选「教师」页签就能看全班预警、
    给自己开监护人同意、拉整份标答卷。进校部署必须设置 JIEDUI_TEACHER_PASSWORD。
    """
    from app import auth
    monkeypatch.setattr(auth, "TEACHER_PASSWORD", "只有老师知道的一句话")
    assert client.post("/api/auth/teacher/login",
                       json={"username": "lishen", "password": "123456"}).status_code == 401
    assert client.post("/api/auth/teacher/login",
                       json={"username": "lishen", "password": "只有老师知道的一句话"}).status_code == 200
    assert client.post("/api/auth/student/login",
                       json={"username": "xiaoma", "password": "123456"}).status_code == 200


def test_pii_regex_order_and_chinese_qq_phrasing():
    """PII 匿名的两条实测坑（2026-08-03 在姊妹项目发现后回灌本项目）：

    ① idcard 必须排在 phone 前，否则 18 位身份证里嵌的 11 位被当手机吃掉，身份证半裸露。
    ② QQ 前缀与号码间的中文助词（「我qq**是** 123456789」）曾让最常见的写法直接漏过。
    本项目收的是真实未成年人数据，PII 漏一个字段就是隐私事故。
    """
    from app import guard

    sc, mp = guard.anonymize("身份证11010119900307123X 手机13800138000")
    assert "11010119900307123X" not in sc and "13800138000" not in sc
    assert set(mp.values()) == {"11010119900307123X", "13800138000"}
    assert "110101" not in sc, "身份证半裸露"

    for t in ["我qq是 123456789", "QQ号码：87654321", "加下我的扣扣 1234567890", "qq:12345678"]:
        sc, mp = guard.anonymize(t)
        assert mp, f"QQ 未识别：{t}"
        assert not any(v in sc for v in mp.values()), t
    # 有锚点才打码：代码里的裸数字不该被误伤
    assert guard.anonymize("range(100000, 999999)")[1] == {}
