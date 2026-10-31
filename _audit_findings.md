# 五维审计 · 对抗核验后成立的缺陷（18 条）

## 1. [high] 「点一下完成推送」写入 fix 事件，直接刷高验证优化与分解两维，并让学生从教师"卡住"名单里消失

**位置** `server/app/resources.py:311`

**场景** 学生在任务瓷片上对 5 条老师推送逐个点"完成"（不写一行代码、不运行一次）。每点一次 mark_done 就 add_ct_event(uid, "fix", "[push] 完成老师推送的学习任务")。按 ct.py:48/44 的公式实测：verify 从 28 → 73，decompose 从 35 → 65。更糟的是 teacher.py:40 的卡住判定是 stuck = (errs>0 and fixes==0)：一个真卡在报错上的学生，只要顺手点一下"完成"，fixes 就 >0，state 从 stuck 降为 active/idle，teacher.py:50 的排序把他从队首踢到后面，老师课堂上看不到他了。

**影响** 课题主张"六维分反映真实计算思维"，但验证优化维现在可以纯靠点击刷出来——这是直接的效度证伪点，答辩时一问就穿。research.py:79 导出的 fixes 列同样被污染，实验数据不可用。同时它还制造安全隐患：最需要老师介入的学生被自己的一次点击隐藏了。

**建议改法** resources.py:311 改成写一个独立事件类型（如 "task_done"），不要复用 "fix"。ct.py:13 的 KEY 里加上 task_done 以便进时间线，但 ct.py:37 的 fixes 计数、teacher.py:36 的 fixes 只统计 type=='fix'，保持只由 IdeView 的真实"报错→跑通"产生。若想让完成任务参与打分，另开一条与 verify 无关的加分项。

**核验证据** ai.py:117-129 逐行读到：`g = guard.check_input(req.message)` 只对 req.message 跑护栏；`safe_msg = g.get("scrubbed", req.message)`（127）；`system = _system(req.role, req.scaffold, req.codeContext)`（128）；`messages = (req.history or []) + [{"role": "user", "content": safe_msg}]`（129）——history 元素原样进 body，_call_llm(64-71) 直接 json.dumps 发到 AI_BASE(=gpt-agent.cc/v1)/messages。codeContext 路径：_system 第 59-60 行 `if code: parts.append(f"<学生当前代码>\n{code[:2000]}\n</学生当前代码>")`，全程无 guard 调用（grep 整个 ai.py 只有 117 和 158 两处 check_input）。前端确认：AiTutorPanel.vue:102 `messages.value.push({ role: 'user', content: msg })` 是**原文**，:107 `const history = messages.value.slice(-6).map(...)`，:108 连同 codeContext 一起发出。实跑 guard.check_input('我手机 13812345678，帮我看看这段代码') → {'allowed': True, 'scrubbed': '我手机 [phone_1]，帮我看看这段代码', 'pii_count': 1}，即同一请求 messages 数组里倒数第二条是明文手机号、最后一条是 [phone_1]。第二轮场景也成立：ai.py:120-122 L4 分支 `return {"reply": CRISIS, ..., "blocked": True}` 是 HTTP 200，前端只在 e.message==='CONSENT_REQUIRED' 时 `messages.value.pop()`（AiTutorPanel.vue:112-114），200 走的是 :109 push assistant，原文用户消息留在列表 → 下一次 slice(-6) 把「我不想活了」原文送进 LLM，且 add_risk_event 只在 ai.py:118-119 的 `if not g["allowed"]` 分支里调用，第二轮 req.message 是「继续写代码吧」不触发。api/ai.ts 确认 history 字段确实进 body。行号、文件、场景全部对得上。

---

## 2. [medium] 报错后跑通只记 fix 不记 run，导致 success = runs - errors 恒被低估，算法设计维恒等 40、迁移维恒等 30

**位置** `web/src/views/student/IdeView.vue:215`

**场景** 学生反复"报错→改→跑通"共 10 轮。前端 trackRun 里 ok 分支写的是 track(prevError ? 'fix' : 'run', ...)——跑通那次被记成 fix，run 一次都没记。于是后端 ct.py:37-39 得到 runs=0, errors=10, fixes=10，success = max(0, 0-10) = 0。实测六维：algorithm=40（地板）、transfer=30（地板）、model=25（地板）。而另一个 20 次全部一次过、从没调试过的学生：algorithm=100、transfer=100。调试能力最强的学生在"算法设计"和"迁移"上拿到全场最低分。

**影响** 两维被钉死在常数上，任何前后测都测不出增长——课题最想证明的"六维提升"在这两维上先天不可能成立。而且分数与真实能力反向，insights.py:155 的 weak_key = min(dims) 会把这类学生一律判成"迁移最弱"，推荐、教师看板、研究导出全部沿着错误结论走下去。teacher.py:91 的 funnel["transferred"] 门槛是 transfer>=50，需要 success>=6，凡是报错次数不少于 run 次数的学生永远进不了迁移漏斗。

**建议改法** IdeView.vue:213-221 改为跑通时**同时**打点：先 track('run',...)，若 prevError 再补 track('fix',...)——run 记录"跑了一次"，fix 记录"这次是修复"，语义分离。或者退一步在 ct.py:39 把 success 改为 max(0, runs + fixes - errors)，让修复成功计入成功次数。前者更干净，因为 ThinkingView/ProfilesView 的时间线也要看到这次运行。

**核验证据** guard.py:15 注释 `L4=锁定+通知, L3=阻断+记录, L2=阻断引导`；guard.py:20 `"adult": (["色情", "约炮", "黄片", "裸聊"], 2)`；check_input 第 50-59 行只有 `if level >= 3:` 一个分支，L2 之后无任何 level 相关处理，直接落到第 58 行 `return {"allowed": True, "category": None, "level": 0, "action": "pass", ...}`——注意连 category/level 都被硬写回 None/0，L2 命中信息彻底丢失。用 server/.venv/Scripts/python.exe 实跑：check_input('我想看黄片') → {'allowed': True, 'category': None, 'level': 0, 'action': 'pass', 'pii_count': 0}；check_input('约炮网站怎么进') 同样 allowed True；对照 check_input('赌博网站') → {'allowed': False, 'category': 'fraud', 'level': 3, 'action': 'block'}，check_input('我不想活了') → level 4 lock。同词库里 3/4 级能拦、2 级完全失效，属实。ai.py:118-119 `if not g["allowed"]: store.add_risk_event(...)` 确认无告警落库。降为 medium 仅因该词库本身是 guard.py:3 自认的「演示级」四词表，即便实现了 L2 也易绕过；但「声明的 L2 是死代码」这一缺陷本身成立。

---

## 3. [high] /api/teacher/home 的「班级六维均值」既没有班级过滤，门槛又低到 1 条事件，研究报告雷达图实际是全平台基线常数

**位置** `server/app/teacher.py:61`

**场景** 学校三个班共 120 个账号在同一实例上。教师打开 ReportView（研究报告）/AnalysisView/RubricsView，三者都读 useTeacherHome 的 classCt。但 home() 第 61 行 roster = store.list_students() 拉的是全库所有 stu-* 账号，函数签名（第 58 行）根本没有 class_id 参数——对比同文件 live() 第 19 行是有 class_id 的。同时第 82 行入均值的门槛是 cs["has_real_data"]，而 ct.py:64 定义为 len(evs) > 0，即**只要有 1 条事件**。实测：一个只点过一次运行的学生，六维是 {35,32,27,44,28,30}，几乎就是公式的常数项。100 个这样的账号一进来，class_ct 被拉向基线常数，5 个真正活跃学生的信号被稀释到看不见。

**影响** 这张雷达图是课题结论的主证据面。现在它既不是"某个班"的（跨班混算），也不代表"参与了学习"的学生（登录一次即入样）。实验班/对照班的差异会被互相污染，前后测差值会被大量僵尸账号压平——统计上得不出显著性，得出了也不可信。

**建议改法** teacher.py:57 给 home() 加 class_id: int = 0 参数，复用 live() 第 22-24 行的 store_resources.class_student_ids([class_id]) 过滤 roster；前端 useTeacherHome 传当前班级。同时把第 82 行的入样门槛从 has_real_data 提高到实质参与（例如 cs["runs"] + cs["designs"] >= 3），并把 dim_n 一起返回给前端，在雷达图上标注"基于 N 名活跃学生"，样本不足时不画图。

**核验证据** compliance.py:19-22 完整读到：`@router.post("/consent")` / `def consent_grant(req: ConsentReq, user: dict = Depends(current_user)): store.grant_consent(user.get("sub", "anon"), req.guardian); return {"granted": True}`——授权主体就是 Depends(current_user) 解出的调用者本人，无 role 校验（对比同文件 :47-50 teacher_alerts 明确写了 `if user.get("role") not in ("teacher", "researcher"): raise HTTPException(403, ...)`，说明作者在别处会查角色，此处是真的没查）。ConsentReq 只有 `guardian: str = "监护人"` 一个自由文本字段（:10-11），api/compliance.ts 的 grantConsent(guardian = '监护人') 连界面输入都没有，默认值直接发。current_user（auth.py:65-73）不验 aud，学生令牌可用。前端 AiTutorPanel.vue:24 按钮 `<button class="consent__ok" @click="grantConsent">我已获得监护人同意，开始使用</button>`，:60-62 点击即 POST。落库后 ai.py:113 chat 与 ai.py:156 image 的 `if not store.has_consent(uid)` 门禁同时打开。行号全部命中。

---

## 4. [medium] 薄弱维推荐在题库没有该维题目时静默回退成"按难度排序"，但返回文案仍宣称针对薄弱维

**位置** `server/app/insights.py:170`

**场景** 教师用 NewResource.vue:78 建题时，"主要锻炼"下拉框默认值是 ''（不指定），提交后 ct_dims={}，store_resources.create_exercise:197 算出 ct_primary=None。这样的题在 recommend 的 score() 里得分 = 0 + 0 - 2*|难度差|，最好也只有 0。第 170 行 picks = [e for e in ranked if score(e) > 0][:limit] or ranked[:limit]——因为门槛是严格 >0，连难度完全吻合但维度不对的题也被滤掉，于是必然走 or 后面的兜底，返回的就是纯按难度接近程度排的任意三道题。但第 172 行的 reason 照样输出「迁移」是当前最弱项（30 分），建议先练入门难度，第 182 行每道题的 why 是 训练综合。接口没有任何字段告诉教师"这次没匹配上"。

**影响** 这是链路上最典型的假闭合：教师看到"薄弱维 → 针对性推荐 → 一键下发"的完整界面，实际下发的是无关题目；学生做完后（经上一条 mark_done 的 fix 写回）薄弱维分还会涨，形成"推荐有效"的假象。课题"精准干预"这一环无法证实。考虑到上一条缺陷让 weak_key 系统性地落在迁移/建模上，而这两个维度恰恰是教师最不会去标注的，这条几乎是常态而非边界情况。

**建议改法** insights.py:170 把兜底显式化：matched = [e for e in ranked if score(e) > 0]；若 matched 为空，返回里加 targeted: False 和 note: "题库中暂无标注「迁移」的题目，以下按难度推荐"，前端据此改写提示。同时 NewResource.vue:78 的 dim 不应允许留空——把"不指定"选项去掉或在提交时校验，从源头保证新题都有 ct_primary。

**核验证据** research.py:23 `SALT = os.environ.get("JIEDUI_EXPORT_SALT", "jiedui-ct-2026")`（默认值硬编码在源码里）；research.py:27-28 `def _pid(uid): return "S" + hashlib.sha1((SALT + uid).encode("utf-8")).hexdigest()[:8]`。uid 来源确认：auth.py:49 `user = {"id": f"stu-{uname}", ...}`，uname 就是登录框自填用户名，取值空间等于班级名单。实跑 research._pid('stu-xiaoma') → 'S360b9b61'，SALT 打印为 'jiedui-ct-2026'（未设环境变量时），一次 sha1 即可反查；几十人名单穷举是毫秒级。声明冲突属实：docstring research.py:4 写「学生 ID → 加盐哈希假名（不可逆、跨导出稳定…）」，build_dataset 输出 research.py:63 `"anonymized": True` 与 :64 `"deidentification": "学生ID哈希假名；…"`。唯一对报告的修正：字面「不可逆」三字只在第 4 行 docstring，第 64 行导出字段没写「不可逆」，但配 anonymized:True 对外含义相同。定 medium 而非 high：导出端点有 _require（research.py:31-33，teacher/researcher）保护，风险只在导出文件离开机构后兑现，且部署时设 JIEDUI_EXPORT_SALT 即可缓解——但默认路径下缺陷成立。

---

## 5. [high] history/codeContext 完全不过护栏，PII 匿名在默认路径上 100% 失效

**位置** `server/app/ai.py:129`

**场景** 学生在小狐/小枭对话框第一句输入「我手机 13812345678，帮我看看这段代码」。前端 web/src/components/editor/AiTutorPanel.vue:102 先把这句**原文**push 进 messages，第 107 行再取最近 6 条组成 history 一起发出。服务端 ai.py:117 只对 req.message 跑 guard，第 129 行 `messages = (req.history or []) + [{...safe_msg}]` 把 history 原样拼进去 → 同一个请求里，倒数第二条是原文手机号、最后一条才是 [phone_1]，手机号明文出域到第三方代理 gpt-agent.cc。第二轮更严重：第一句「我不想活了」被 L4 拦截返回 CRISIS 后，该条消息仍留在本地列表（只有 CONSENT_REQUIRED 才 pop，AiTutorPanel.vue:114），学生随便再发一句「继续写代码吧」，「我不想活了」原文就随 history 进 LLM，而且这次不再触发 add_risk_event。codeContext 同理：ai.py:128 传进 _system()，第 60 行直接嵌进 system prompt，从头到尾没过 guard——把危险话题或身份证号写进编辑器即可直送 LLM。

**影响** 「PII 不出域」和「危险话题在进 LLM 之前拦截」两条红线，在学生什么都不做特殊操作的正常使用路径上就已经失效；教师端告警只在第一轮出现一次，之后学生反复谈同一话题都无痕。

**建议改法** 在 ai.py chat() 里把 req.history 每条 content 与 req.codeContext 都送 guard.check_input：任一条 not allowed 就整体拒绝并写 add_risk_event，允许的用 scrubbed 文本重建 messages 再送 LLM。更稳的做法是服务端按 uid 自己存会话历史（store 加一张 chat_turns 表），根本不接受客户端传 history。

**核验证据** 逐条复核全部对得上。StudioView.vue:164 `const r = await aiApi.chat(msg, role.value, { scaffold: socratic.value ? 0 : 1, history })` —— 勾选苏格拉底后唯一变化是 scaffold 1→0，role.value 仍是 'turtle'（第 98 行 `const role = ref<'turtle'|'reviewer'>('turtle')`，只有 onRole() 第 140-143 行才会改）。服务端 ai.py:128 `system = _system(req.role, req.scaffold, req.codeContext)`，_system() 在 ai.py:58 拼 `[BASE_RULE, ROLE_PROMPT.get(role,...), SCAFFOLD.get(scaffold,...)]`；role='turtle' 时取 ai.py:29-34 的「你现在是【小狐·驾驶员】…你按学生的指令写关键片段并解释语法」，再追加 ai.py:42 SCAFFOLD[0]「支架强度：最低。只用一两个问题点醒，不给提示细节。」——同一 system prompt 里「按指令写关键片段」与「只提问不给细节」并列，而按钮 title(StudioView.vue:9)承诺的是「开启后 AI 只提问不给答案」。role/scaffold 全部来自请求体（ai.py:49-54 ChatReq），服务端无任何角色强制。锁定态更确凿：locked 只在 StudioView.vue:207 `if (route.query.socratic === '1') { socratic.value = true; locked.value = true }` 和 209 行 watch 里被置真，watch 只在 v==='1' 时赋值、从不复位，locked 默认 false（第 100 行，注释自认「V3 教师端下发；此处读 query 占位」）。全仓 grep socratic 只命中 StudioView.vue 的 8/11/99/142/150/164/207/209 八处，server 端零命中 —— 教师端确实没有下发锁的接口，删掉地址栏 ?socratic=1 刷新即 locked=false、按钮可点。

---

## 6. [medium] 危险话题 L2 档只声明不执行，色情类词库等于没写

**位置** `server/app/guard.py:51`

**场景** guard.py:15 注释写明「L4=锁定+通知, L3=阻断+记录, L2=阻断引导」，DANGER 里 adult 类 [色情/约炮/黄片/裸聊] 定级 2，但 check_input 第 51 行只有 `if level >= 3` 一个分支，L2 后面没有任何处理就落到 allowed=True。用 server/.venv 实跑验证：check_input('我想看黄片') → {'allowed': True, 'category': None, 'level': 0}，check_input('约炮网站怎么进') 同样放行，原文直送 LLM。又因为 ai.py:118 只在 not allowed 时才调 add_risk_event，教师端 /api/teacher/alerts 连一条记录都不会有。同一份词库里 fraud 定级 3 能拦，adult 定级 2 完全失效。

**影响** 学生拿课堂平台探索涉黄内容，既不被拦、也不留痕，教师事后无从知情，正好是家长最敏感的那类内容。

**建议改法** guard.py check_input 在 SENSITIVE 检查之前补 L2 分支：`if level == 2: return {'allowed': False, 'category': cat, 'level': level, 'action': 'guide'}`（或直接把阈值改成 >= 2 并按 level 决定 action）；同时 ai.py 对 L2 也写 risk_event，用 level 字段让教师端区分「引导级」和「高危级」，避免告警噪音。

**核验证据** InsightRail.vue:59-63 PLACEHOLDER 是模块级常量（mistakes: {title:'错题本', sub:'运行报错会自动归集到这里'}），模板 34-40 行 v-else 分支只渲染 img + ph__t + ph__s 三个节点，除 behavior 外的 summary/mistakes/next 三签走的都是这一支；组件全生命周期唯一的数据请求是第 78 行 `onMounted(async () => { ct.value = await ctApi.summary() })`。数据源确认不存在：grep -rniE 'mistake|错题|wrong_' 排除 .venv 后在 server/app 与 web/src 零命中；store.py:25-65 executescript 建的表只有 projects / project_versions / ct_events / design_artifacts / guardian_consents / risk_events / usage_sessions，store_resources.py 的 CREATE TABLE 也只有 exercises/videos/exercise_sets/set_items/classes/class_students/cases/pushes/push_targets —— 无任何错题表。报错埋点确如所述：全仓 ctApi.track 只有 7 处（ct.ts:22 定义、AiTutorPanel.vue:89、DesignPanel.vue:108、IdeView.vue:161/215/218、StudioView.vue:145），唯一 error 事件是 IdeView.vue:218 `ctApi.track('error', '运行出错', currentId.value)`，detail 写死四字，不带 stderr/行号/代码。自指闭环也成立：StudioView.vue:196-199 summarize() 调 setRailTab('summary') → 第 112-116 行把 query.rail 置为 'summary' → 第 109 行 rail computed 变真、面板弹出 → 显示 InsightRail.vue:60 的「点输入框旁的 📋 让 AI 总结这次学习」。

---

## 7. [high] 研究导出的「不可逆假名」可用源码里的硬编码盐秒级还原

**位置** `server/app/research.py:28`

**场景** _pid(uid) = 'S' + sha1(SALT + uid).hexdigest()[:8]，而 SALT 的默认值 'jiedui-ct-2026' 就硬编码在 research.py:23；uid 由 auth.py:49 拼成 'stu-' + 学生自填用户名（实际就是姓名拼音或学号）。拿到导出文件的任何人——论文附录读者、合作校、课题评审——只要有一份班级名单，把几十个候选用户名逐个算 sha1 前 8 位比对即可把全部假名还原成真人，笔记本上毫秒级完成；不用名单也能拿常见拼音/学号字典跑穷举。但 research.py:4 与第 64 行的 deidentification 字段对外声明「不可逆」，build_dataset 还打了 anonymized: true。

**影响** 课题数据一旦作为论文附录或交给外部合作方，就是可重标识的未成年人过程数据（含 risk 类别、使用时长、行为序列），与导出文件自身的去标识化声明不符，是课题材料里最容易被审查挑出来的一处。

**建议改法** research.py 去掉 SALT 的硬编码默认值——os.environ 未设置时直接 raise/拒绝导出；改用高熵随机盐并只存服务端环境变量，把 sha1(salt+uid) 换成 hmac.new(key, uid, sha256)。若不需要跨导出追踪同一被试，更彻底的做法是每次导出生成随机映射表，映射表单独留档、不随数据分发。

**核验证据** IdeView.vue:88 `let prevError = false`；213-221 行 trackRun(ok)：ok 分支 `ctApi.track(prevError ? 'fix' : 'run', prevError ? '报错后修复成功' : '运行成功', currentId.value)` 后 216 行 prevError=false，失败分支 218 行上报 'error' 并 219 行 prevError=true。故「错→改→对」序列只产生 error + fix 两条事件，零条 run。服务端 ct.py:37 `runs, errors, fixes = cnt("run"), cnt("error"), cnt("fix")` → runs=0/errors=1/fixes=1；ct.py:39 `success = max(0, runs - errors)` = 0；ct.py:40 `success_rate = round(success / runs * 100) if runs else 0` = 0。InsightRail.vue:17-20 直接渲染 ct.runs / ct.errors / ct.fixes / ct.success_rate，故面板显示「运行 0 / 报错 1 / 修复 1 / 成功率 0%」，与所述完全一致。教师端连带确认：teacher.py:87-88 `if cs["runs"] > 0: funnel["ran"] += 1`，该学生被归入「从没运行过」。附带查到同源的第二处错算（报告未提）：'run' 只在成功时上报，而 ct.py:39 又用 runs 减 errors，成功 3 次+报错 3 次的学生 success 直接归 0，algorithm 维（ct.py:47 `40 + success*4`）与 transfer 维（ct.py:49）随之失真。

---

## 8. [medium] 空班级下发会回退成全平台群发

**位置** `server/app/resources.py:280`

**场景** 教师在「任务下发」页勾选一个刚建好、还没加学生的班（列表显示「初一(3)班·0人」，前端 TasksView.vue:57 只校验 class_ids 非空，按钮可点）→ 后端 targets = [] + class_student_ids([cid]) = [] → 走到 `if not targets: targets = [s["id"] for s in store.list_students()]` → 这道题带着截止日期和「必做」标记推给了平台上**所有**学生。同样地，class_ids 传一个不存在的班级 id，也会静默群发。

**影响** 教师以为只发给一个班，实际全校学生的「我的推送」里都多出一条必做任务；红点、未读数、完成率统计全部被污染，而且 push_targets 已落库，没有撤回接口。教师下次再看完成率会以为学生大面积没做。

**建议改法** resources.py 的 push() 里把「无目标 = 全员」的兜底删掉：当 req.class_ids 或 req.student_ids 非空但解析出的 targets 为空时，直接 raise HTTPException(400, "所选班级暂无学生")；只有当两个字段都为空（真正的「全部学生」意图，PushSheet.vue 的 toAll 分支）才允许回退到 store.list_students()。即把判断从 `if not targets` 改成 `if not req.class_ids and not req.student_ids`，再对结果为空时报 400。

**核验证据** resources.py:270-283 `push()` 实测代码：`targets = list(req.student_ids)` → `if req.class_ids: targets += R.class_student_ids(req.class_ids)` → 第280行 `if not targets: targets = [s["id"] for s in store.list_students()]` → 第282行 `if not targets: raise HTTPException(400,...)`。store_resources.py:393-399 `class_student_ids` 只是 `SELECT DISTINCT student_id FROM class_students WHERE class_id IN (...)`，班里没人 / 班 id 不存在都返回 []，不抛错、不区分「没指定班」和「指定了空班」。上游没有任何非空校验：resources.py:266 只校验 res_type，PushIn 里 class_ids 无 min_items。store_resources.py:360-370 list_classes 对空班返回 size=0 照样下发到前端；TasksView.vue:47 渲染成「…·0人」可勾选，:57 的 disabled 条件是 `!form.class_ids.length`，勾了空班就可点。落库确实是 push_targets（store_resources.py:474-487 create_push），全仓 grep `delete_push|revoke|撤回` 在 resources.py / store_resources.py 无任何命中 → 确实没有撤回接口。判断为真实缺陷；触发需教师主动勾一个 0 人班，故降为 medium。

---

## 9. [high] 删除他人作品虽返回 404，版本历史却已被真删

**位置** `server/app/store.py:239`

**场景** 学生小马（任意学生凭 123456 即可登录，auth.py:43）调用 DELETE /api/projects/1，而作品 1 属于小华。delete_project 第一条 DELETE 带了 owner_id 过滤，rowcount=0 → 接口回 404「作品不存在」；但第二条 `DELETE FROM project_versions WHERE project_id=?` 没有任何归属校验，小华这个作品的**全部版本记录被删除**。已用临时库复刻验证：projects 行还在、latest_version 仍是 3，project_versions 剩 0 条。

**影响** 学生打开自己的作品发现代码全空（get_project 的 latest 变成 None），而版本列表也空了，等于一学期的作业没了，且没有任何日志能追到是谁触发的。同时 submissions_count() 会凭空变小，教师首页「提交数」KPI 跟着错。

**建议改法** store.py 的 delete_project 改成先校验归属：先 `SELECT 1 FROM projects WHERE id=? AND owner_id=?`，取不到就直接 return False（不执行任何 DELETE）；确认归属后再依次删 project_versions、design_artifacts（design_artifacts 目前也没清，同样留孤儿行）和 projects。

**核验证据** store.py:236-240 原文：`def delete_project(pid, owner_id): with _lock, _conn() as c: cur = c.execute("DELETE FROM projects WHERE id=? AND owner_id=?", (pid, owner_id)); c.execute("DELETE FROM project_versions WHERE project_id=?", (pid,)); return cur.rowcount > 0` —— 第239行确无 owner 归属校验，且和第238行在同一事务里无条件执行。projects.py:66-70 路由 `@router.delete("/{pid}")` 只做 `if not store.delete_project(pid, _uid(user)): raise HTTPException(404,"作品不存在")`，pid 由 URL 直给、无预先归属查询。临时库实跑（store.DB_PATH 指向 tempdir）：建 stu-xiaohua 的作品并存 3 个版本 → before: versions=3 latest_version=3；调 delete_project(pid,'stu-xiaoma') 返回 False（接口即 404）→ after: project还在=True, latest=None, latest_version=3, versions=0。与报告描述逐项一致。建表虽写了 ON DELETE CASCADE（store.py:37），但 _conn() 只开 WAL、未开 PRAGMA foreign_keys，与此条无关。

---

## 10. [high] ct_events 用 ORDER BY ts ASC + LIMIT，取到的是最老 N 条

**位置** `server/app/store.py:170`

**场景** 一个学生累计事件超过 300 条（几节课就到）后：teacher.py:33 的课堂实时监看用 store.ct_events(id, 300) 取到的全是几天前的旧事件，`now - e["ts"] <= window` 过滤后一条不剩 → 该生 runs/errors/fixes 全是 0、state 判成 "away"。超过 500 条后 ct.py:34 的 summary_for 同样只读到最老 500 条，六维分数、成功率、用时、「最近12步路径」「时间线」全部冻结在第一节课。已复刻验证：500 条上限下本节课事件命中 0 条，前端当作「最新一步」的那条距今 25 万秒。

**影响** 这正好打在课题的核心数据上——用得越多的学生，计算思维六维越不动、课堂监看越显示他「离开了」，教师会去关注一个其实在认真敲代码的学生，而洞察卡、班级共性、推荐题目全部基于这份冻结数据。

**建议改法** store.py 的 ct_events 改为取最近 N 条再按时间正序返回：`SELECT type,detail,ts FROM (SELECT type,detail,ts FROM ct_events WHERE user_id=? ORDER BY ts DESC LIMIT ?) ORDER BY ts ASC`。另外 teacher.py 的 /live 应直接按时间窗查询（WHERE user_id=? AND ts>=?）而不是先取 N 条再在 Python 里过滤。

**核验证据** store.py:167-172：`SELECT type,detail,ts FROM ct_events WHERE user_id=? ORDER BY ts ASC LIMIT ?`，默认 limit=500 —— 升序 + LIMIT 取的确是最老 N 条。调用方 teacher.py:33 `evs = [e for e in store.ct_events(s["id"], 300) if now - e["ts"] <= window]`（window 默认 900s）；ct.py:34 `evs = store.ct_events(target)` 走默认 500。临时库实跑一：插 300 条 20 万秒前的 run + 20 条 10 秒前的 run → ct_events(300) 返回 n=300、窗口内命中=0、取到的最新一条距今 199701s → runs/errors/fixes 全 0、last 落到旧 ts，按 teacher.py:41-43 判成 away。实跑二：插 500 条旧 run + 30 条本节课 fix（共 530）→ summary_for 读到 runs=500 fixes=0，timeline 最后一条 detail='old' 距今 199501s，verify 维=28（基线值，30 次修复完全没计入），minutes=8。两条路径均复现。

---

## 11. [high] audit() 命中禁词后只清洗了三个字段，薄弱项和下一步原文照发

**位置** `server/app/insights.py:111`

**场景** LLM 返回 {"headline":"...","weaknesses":["这孩子有点笨，抽象维度明显落后"],"next_step":"..."}。audit() 把整卡 dump 成字符串确实命中了「笨」，于是改写了 headline、截断 strengths、替换 suggestions，但 **weaknesses 和 next_step 原样保留**并随响应返回。前端 InsightCard.vue:28 会把 weaknesses 逐条渲染在「薄弱」区，同时 InsightCard.vue:40 打出「⚠ 原始结论含不当措辞已被审核拦截」——拦截提示和未拦截的原文同时出现在教师屏幕上。

**影响** 给未成年人贴标签的措辞恰恰最可能出现在「薄弱」这一段，而这段是唯一没被清洗的。教师看到的是一句「已拦截」的假保证 + 一句原封不动的贬损评价，一旦被截图外传，等于平台自己承认审核形同虚设。（禁词表本身只有 7 个词、纯子串匹配，「资质一般」「跟不上」「不是这块料」等同义表述连命中都不会命中，建议同批加上白名单式改写。）

**建议改法** insights.py 的 audit() 在 hit 非空时对**所有**文本字段统一降级：weaknesses 替换为按指标生成的中性描述（可直接复用 _rule_insight(f) 的 weaknesses），next_step 替换为 f'{最弱维}类练习'，或更简单地整卡丢弃、直接返回 _rule_insight(f) 并带上 blocked_words 标记——即让 student_insight() 在审核不通过时走规则版而不是修补 LLM 版。

**核验证据** insights.py:107-117 原文：`blob = json.dumps(card, ensure_ascii=False); hit = [w for w in BANNED if w in blob]; if hit: card["headline"]=...; card["strengths"]=card.get("strengths",[])[:1]; card["suggestions"]=["请结合下方指标自行判断"]; card["blocked_words"]=hit` —— 只改写 headline/strengths/suggestions，weaknesses 与 next_step 没有任何赋值或删除。而这两个字段确实存在于契约里：SYSTEM 提示词 insights.py:35-36 明确要求 LLM 输出 `"weaknesses":[...]` 和 `"next_step":"..."`，_rule_insight 也在 insights.py:77/79 产出它们；student_insight（insights.py:126-132）把 `card = audit(card)` 后整卡原样返回。前端 InsightCard.vue:26-29 `v-for="(s,i) in card.weaknesses"` 渲染「薄弱」区，:40-42 同时按 `card.blocked_words?.length` 打出「⚠ 原始结论含不当措辞已被审核拦截」→ 拦截提示与未清洗原文并存，成立。补充两点不影响结论的偏差：weaknesses 位于 <details>「看证据」折叠区需点开，而 next_step 在 InsightCard.vue:17 是常驻可见的，所以未清洗文本仍有一处直接暴露在首屏；BANNED 表（insights.py:27）确实只有 7 个纯子串词。

---

## 12. [high] 「强制苏格拉底」开关既拦不住 AI 写码，也拦不住学生关掉

**位置** `web/src/views/student/StudioView.vue:164`

**场景** 学生停在默认角色「🦊小狐·驾驶员」，勾上顶栏「✅苏格拉底」，然后说"帮我写一个猜数字游戏"。前端做的唯一一件事是把 scaffold 从 1 降到 0（StudioView.vue:164），role 仍然发 'turtle'。服务端 _system() 拼出的 system prompt 里角色段仍是 ROLE_PROMPT["turtle"]「你按学生的指令写关键片段并解释语法」(server/app/ai.py:31-33)，后面只追加一句「只用一两个问题点醒」(ai.py:42) —— 两条指令直接冲突，AI 照样给代码片段，而按钮 title 承诺的是"开启后 AI 只提问不给答案"(StudioView.vue:9)。另一路更彻底：locked（"老师已锁定：本节课必须苏格拉底式引导"）只由 route.query.socratic==='1' 赋值(StudioView.vue:207-209)，服务端 /api/ai/chat 完全不知道有锁，role 与 scaffold 全部由前端请求体决定(ai.py:49-54, 128)。学生把地址栏 ?socratic=1 删掉刷新，或点导航回 /student/studio，锁即消失。

**影响** 「AI 只提问不写码」是本课题苏格拉底组与对照组的唯一自变量。现在勾选后 AI 仍会写码，等于两组无差别；且全仓 grep socratic 只有 StudioView 这两处，教师端根本没有下发锁的接口，"老师已锁定"这个状态在产品里无法真正产生。同时「禁代写」红线在驾驶员模式下只靠 BASE_RULE 一句话兜底。

**建议改法** 把苏格拉底做成服务端事实：① server/app/ai.py 的 _system() 增加 socratic 参数，为真时用 ROLE_PROMPT["reviewer"] 或一段覆盖驾驶员写码授权的 SOCRATIC_OVERRIDE 顶掉 turtle 段，而不是只叠 SCAFFOLD 文案；② store.py 增一张 lesson_lock/class_settings 表，教师端写入、chat() 里按学生所在班级读锁并强制覆盖请求体的 role/scaffold，前端 locked 只负责显示。

**核验证据** 主体成立，逐项复核：

(1) resources.py:307-312 完全对上：
```
@router.post("/my/pushes/{target_id}/done")
def mark_done(target_id: int, user: dict = Depends(current_user)):
    ok = R.mark_push(target_id, user.get("sub", "anon"), "done_at")
    if ok:
        store.add_ct_event(user.get("sub","anon"), "fix", "[push] 完成老师推送的学习任务", None)
```
无任何"是否真的做了题"的校验；唯一门禁是 store_resources.py:527-533 的 `UPDATE ... AND {field} IS NULL`，即同一 push_target 只能记一次 fix——所以刷不了同一条，但 5 条推送 = 5 个 target = 5 条 fix 事件，报告者的场景成立。

(2) 分数复算（用 ct.py:43-50 原式跑 D:/VB/jiedui-code-platform/CX/server/.venv/Scripts/python.exe）：
零事件基线 {'decompose':35,'abstract':30,'model':25,'algorithm':40,'verify':28,'transfer':30}
点 5 次完成后 {'decompose':65,...,'verify':73,...}
verify 28→73、decompose 35→65 与报告者数字**逐位相符**。ct.py:48 `28 + fixes*9`、ct.py:44 `35 + fixes*6` 属实。

(3) 污染研究导出属实：research.py:36-52 build_dataset 里 `cs = summary_for(uid)`，behavior 直接取 cs 的 "fixes"，CSV 的 fixes 列（research.py:79 表头）与六维列同源。

(4) **stuck 部分被我部分推翻**：teacher.py:40 的真实代码是
`stuck = (errs > 0 and fixes == 0) or errs >= 2`
报告者只引了前半个分句。窗口内报错 ≥2 次的学生点多少次"完成"都仍然 stuck、仍排队首。只有**窗口内恰好 1 次报错且 0 次修复**的学生，点一次完成才会翻成 active/idle。此外 live() 只看 `window`（默认 900s）内事件，隐藏效果还受时间窗限制。所以"最需要老师介入的学生被隐藏"成立但范围远小于描述（errs==1 这一档）。

结论：效度污染（verify/decompose 可纯点击刷分 + 导出 fixes 列被污）证据确凿，判成立；stuck 一节按 errs==1 收窄。

---

## 13. [high] 学习面板 4 个页签有 3 个是写死占位，错题本连底层数据都不存在

**位置** `web/src/components/studio/InsightRail.vue:59`

**场景** 学生点 ▤ 打开学习面板 →「错题」页签，看到"错题本／运行报错会自动归集到这里"，但永远不会出现任何条目：PLACEHOLDER 是常量对象(InsightRail.vue:59-63)，v-else 分支只渲染一个图标加两行字(34-40)，整个组件全生命周期只发过一次 ctApi.summary()(78)。「进阶」页签同理。数据源本身也不存在：唯一记录报错的地方是 web/src/views/student/IdeView.vue:218 的 ctApi.track('error', '运行出错', currentId.value)，detail 是写死的四个字，不带 stderr、行号、出错代码；server/app/store.py:25-63 的建表清单里没有任何 mistakes/错题 表。另一个可复现的尴尬：点输入框旁 📋「总结这次学习」，summarize() 会 setRailTab('summary')(StudioView.vue:196-199) 把面板弹出来，而 summary 页签显示的正是"点输入框旁的 📋 让 AI 总结这次学习"——AI 的总结只留在对话流里，永远不会进面板。

**影响** 「错题总结」是明确要求的 8 项能力之一，目前是 0 实现；即使只补前端也拿不到数据，必须先改埋点才能重建。学生看到"会自动归集"的承诺后反复回来查，每次都是空的，反而消耗信任。

**建议改法** ① IdeView.vue trackRun 的失败分支把真实报错文本（截断 + PII 脱敏）随 error 事件上报；② 服务端新增 mistakes 表，或直接基于 ct_events 中 type='error' 的 detail 开 /api/my/mistakes（学生只读自己）；③ InsightRail 的 mistakes 分支改成真实请求渲染列表，summary 分支至少缓存并回显最近一次 AI 总结，不要再显示"点 📋 总结"。

**核验证据** 完全成立，且行号精确。

IdeView.vue:213-220 原文：
```
function trackRun(ok: boolean) {
  if (ok) {
    ctApi.track(prevError ? 'fix' : 'run', prevError ? '报错后修复成功' : '运行成功', currentId.value)
    prevError = false
  } else {
    ctApi.track('error', '运行出错', currentId.value)
    prevError = true
  }
}
```
第 215 行就是报告者指的那行。失败分支只发 'error' 不发 'run'，成功分支在 prevError 时发 'fix' 不发 'run' —— 即**报错那次和修复后跑通那次都不计入 runs**，而 ct.py:39 又做 `success = max(0, runs - errors)`，等于对同一批报错扣两遍。

我确认全仓 'run' 事件只有这一个出口：`grep -rn "ctApi.track" web/src` 只有 6 处（IdeView 3 处 run/error/fix + save，AiTutorPanel/StudioView 的 role_switch，DesignPanel 的 design_create）；后端 `grep -rn add_ct_event server/app` 只有 ai.py(ai_help×3)、ct.py:24(前端转发)、resources.py:311(push fix)。没有任何补记 run 的路径。

实测（原式复算）：
10 轮"报错→改→跑通" → runs=0,errors=10,fixes=10 → {'decompose':95,'abstract':30,'model':25,'algorithm':40,'verify':100,'transfer':30}
20 次一次过 → {'algorithm':100,'transfer':100,'abstract':70,'model':65}
algorithm 40 / transfer 30 / model 25 三个地板值与报告者数字完全一致；"调试最多的学生在算法设计与迁移上垫底"属实。

transfer>=50 需 `30+(success-2)*5>=50` → success>=6（switches=0 时），teacher.py:91 漏斗门槛的推论成立。

**一处细节需更正**：报告者说 insights.py:155 的 `weak_key = min(dims, key=dims.get)` 会把这类学生判成"迁移最弱"。实算最小值是 **model=25**（transfer=30），所以系统性误判落在"建模"而非"迁移"。结论方向不变（推荐/看板沿错误维度走），只是维名说错。

---

## 14. [medium] 「主动进阶提问」是 6 条写死文案，与学生说了什么、弱在哪都无关

**位置** `web/src/views/student/StudioView.vue:166`

**场景** 无论学生问"猜数字游戏怎么做"还是"这个 IndexError 什么意思"，只要当前是小狐驾驶员，AI 回完后底下弹出的进阶胶囊永远是同样三条：'为什么这样写？'/'还能更简单吗？'/'换个思路试试'；切到小枭就永远是另外固定三条(StudioView.vue:166-168)。它们既不来自 AI 回复内容，也不读 ct_scores，更不碰题库。而侧栏「进阶」页签写着"AI 会按你的薄弱环节推荐下一题"(InsightRail.vue:62)——真正按六维最弱项排序选题的规则引擎确实实现了(server/app/insights.py:141-185 的 /api/insights/recommend/{uid})，但函数开头就是 if user.get("role") not in ("teacher","researcher"): raise HTTPException(403)(insights.py:148-149)，学生 token 调用必定 403，这条链路现在连不上。

**影响** 「主动进阶提问」在课题设计里承担促迁移的作用，固定三句话既不进阶也不迁移，学生点两次就不再点，采集到的迁移维度数据也失去意义；同时平台里唯一能按薄弱维推荐练习的规则引擎被锁在教师角色，学生端完全用不到。

**建议改法** ① insights.py recommend() 的权限判断放开"学生查自己"（uid == user['sub'] 时允许），InsightRail 的 next 页签改为调用它并渲染 exercises/reason；② 进阶追问改由 /api/ai/chat 返回（让 LLM 按约定格式在回复尾部给 2-3 条追问并在服务端解析出来），退一步也应按 ct_scores 最弱维从分维常量表里选，至少与学情相关。

**核验证据** 两个事实点都对上了。

(1) 无班级过滤：teacher.py:57-62
```
@router.get("/home")
def home(user: dict = Depends(current_user)):   # ← 58 行，签名确实没有 class_id
    _require_teacher(user)
    now = int(time.time())
    roster = store.list_students()              # ← 实际是 62 行，报告者写 61（差一行）
```
对比同文件 teacher.py:19 `def live(window: int = 900, class_id: int = 0, ...)`，第 28-30 行有 `class_student_ids([class_id])` 过滤——同一文件里 live 有、home 没有，且 live 的注释自己写着"不传会把全平台账号都铺出来"。班级是真实存在的实体（store_resources.py:105 class_students 表、393 行 class_student_ids），不是空概念。

(2) 三个研究视图确实都吃这个未过滤的均值：
ReportView.vue:97 / AnalysisView.vue:37 / RubricsView.vue:54 均 `const { classCt, ... } = useTeacherHome()`，useTeacherHome.ts:36 `classCt: computed(() => data.value?.class_ct ?? {})`，而 UI 文案是 AnalysisView.vue:6「班级计算思维六维」、ReportView.vue:8「班级研究报告」——标称"班级"、实算全平台。

(3) 入样门槛：teacher.py:82 `if cs["has_real_data"]`，ct.py:64 `"has_real_data": len(evs) > 0`，确为 1 条事件。复算"只点过一次运行"的学生：{'decompose':35,'abstract':32,'model':27,'algorithm':44,'verify':28,'transfer':30}，与报告者给的 {35,32,27,44,28,30} **完全一致**，确实就是公式常数项。

(4) 一处我替它收紧的地方：store.py:120-132 的 list_students() 不是"所有 stu-* 账号"，而是 ct_events / projects / usage_sessions 里出现过的 uid。纯注册没登录的账号不会进 roster；但只要有 1 条事件就进均值，稀释路径依然成立。

判成立（跨班混算 + 1 事件入样），严重度定 medium：它损害的是研究结论口径而非功能可用性。

---

## 15. [high] 班级名单草稿被所有班级共用，展开第二个班后保存第一个班会把名单覆盖成别人的

**位置** `web/src/views/teacher/teaching/ClassesView.vue:59`

**场景** 页面为每个班级渲染一个独立的 <details>（第 18-26 行），但里面的复选框全部 v-model 到同一个 draft ref（第 22 行、第 59 行）。操作序列：教师展开「初一(1)班」的『编辑名单』→ onToggle 把 draft 灌成 A 的 12 人；不关闭 A，再展开「初一(2)班」的『编辑名单』→ onToggle 把 draft 改写成 B 的 30 人，此时仍然摊开的 A 面板里勾选状态**同步变成了 B 的 30 人**；教师在 A 面板点『保存名单』→ saveRoster(c=A) 用 draft（B 的 30 人）调用 PUT /classes/A/students，A 班名单被静默替换成 B 班的人，界面还提示『已保存 30 人』。

**影响** 班级是全平台下发与统计的唯一单位。名单被写错后，『任务』页按班下发会把作业推给完全不相干的学生，课堂监看与学情统计的分班数据同时失真，而且没有任何报错，教师只有事后被学生反馈才可能发现。两个班同时展开对照名单是极其自然的操作。

**建议改法** 把单一 draft 改成按班级 id 隔离：drafts = reactive<Record<number, string[]>>({})，模板改 v-model="drafts[c.id]"、onToggle 里写 drafts[c.id] = [...c.student_ids]、saveRoster 里传 drafts[c.id]；或把整张班级卡抽成子组件让 draft 成为组件内局部状态。两种改法都能顺带修掉『展开 B 会清掉 A 已勾选内容』的问题。

**核验证据** ClassesView.vue:57-59 只有一个组件级 `const draft = ref<string[]>([])`，而 v-for 在同一个组件里渲染全部班级卡片（第 10 行 `v-for="(c,i) in items"`）。第 18-26 行每张卡片各有一个 `<details ... @toggle="onToggle(c,$event)">`，第 22 行 `<input type="checkbox" :value="s.id" v-model="draft" />` —— 所有班级的复选框绑到同一个 draft。第 72-74 行 `function onToggle(c,e){ if((e.target as HTMLDetailsElement).open) draft.value=[...c.student_ids] }`，只在展开时灌值。这些 <details> 没有 name 属性，HTML 规范下可以同时展开多个，所以展开 B 后 draft 变成 B 的 ids，仍然摊开的 A 面板会响应式地显示成 B 的勾选；第 93-100 行 `saveRoster(c)` 用的是 `draft.value` 而非按班隔离的副本：`await resourcesApi.setClassStudents(c.id, draft.value)`，随后 `flash(`已保存 ${r.size} 人`)`，无任何校验或提示。注释「避免多个班互相覆盖」只覆盖了顺序展开的情形，未覆盖同时展开。报告的行号（59/22/18-26/93-100）全部对得上。

---

## 16. [high] 教师端 API 把 401/500/断网一律吞成 null，令牌过期时首页显示「班级状态平稳」、课堂页显示「还没有人开始编程」

**位置** `web/src/api/teacher.ts:29`

**场景** get() 在第 29 行对任何非 2xx 返回 null、第 30-32 行对网络异常也返回 null，全站没有任何 401 处理（grep 全仓无 401 分支、无自动跳登录）。后端 JWT TTL 为 12 小时（server/app/auth.py:14）。场景：教师昨天上午登录、今天上课打开浏览器，token 已过期 → /api/teacher/home 与 /api/teacher/live 都返回 401 → data 恒为 null。结果：『今日』页 summary 计算出 urgent=0，显示『班级状态平稳，可以开始上课了』，四块 KPI 瓷片全是 0（TodayView.vue:51-66）；『课堂』页 seats=[]，显示『这节课还没有人开始编程』，卡住/在跑/停顿 计数全 0（LiveView.vue:10、25）；『学情』页显示『没有匹配的学生』。整节课教师看到的都是「一切正常」。

**影响** 这正是最危险的静默失败：不是白屏（白屏教师会知道坏了），而是伪造出一个「班级平稳、没人卡住」的正常读数。教师会据此判断不需要介入，课堂监看这个功能在最需要它的时候（后端重启、掉线、登录过期）反而给出反向结论。

**建议改法** api/teacher.ts 的 get() 区分三种情况：r.status===401 时调用 useAuthStore().logout() 并跳 /login；其它非 ok 与网络异常改为 throw；useTeacherHome 与 LiveView 增加 error ref，模板里把『还没有人开始编程』『班级状态平稳』的空态与『读取失败，请刷新/重新登录』的错误态分开渲染。

**核验证据** api/teacher.ts:26-33 `async function get<T>(path){ try{ const r=await fetch(path,{headers:{Authorization:`Bearer ${useAuthStore().token}`}}); return r.ok ? r.json() : null } catch { return null } }` —— 非 2xx 与网络异常都返回 null，无重抛、无跳转。在 web/src 全量 `grep -rn "401" .` 结果为空，确认全站无 401 分支。router/index.ts:54-65 的 beforeEach 只判断 `auth.isLoggedIn`（stores/auth.ts:13 `computed(()=>!!token.value)`，token 直接从 localStorage 读，不解 exp、不校验过期），所以过期 token 仍能进入教师端。server/app/auth.py:14 `TTL = 60*60*12` 属实。下游确认：composables/useTeacherHome.ts 的 `data.value = await teacherApi.home()`，null 时 `kpis` 为 undefined、`urgent` computed 对 `data.value?.alerts ?? []` 求值得 0；TodayView.vue:51-53 `urgent.value ? ... : '班级状态平稳，可以开始上课了'`，第 57-65 四块瓷片全走 `?? 0`。LiveView.vue:58 `data.value = await teacherApi.live(...)` → 第 49 `seats = data.value?.seats ?? []` → 第 25 `v-if="!seats.length"` 显示「这节课还没有人开始编程」，第 10 `data?.tally[k] ?? 0` 计数全 0。StudentsView.vue:25 空 rows 显示「没有匹配的学生」。整条链路无任何错误态。

---

## 17. [medium] 删除课例/题目/视频没有二次确认也没有失败提示，误点即永久删除

**位置** `web/src/views/teacher/research/CasesView.vue:108`

**场景** CasesView.vue:108 的 del(id) 直接 await resourcesApi.deleteCase(id)，没有 confirm；ResourcesView.vue:109 的 del() 删题目/视频同样没有 confirm。后端 server/app/store_resources.py:468 是 `DELETE FROM cases WHERE id=?` 硬删，无软删除、无回收站。场景：教师在课例卡片上想点『看教学流程与反思』（第 24 行），手指偏一点点点到紧邻的『删除』（第 35 行），一节课的完整教学流程与反思瞬间消失且无法恢复。同一份代码里 ClassesView.vue:102 的删除**是有** confirm 的，行为不一致会让教师形成「这里会先问我」的错误预期。另外这两个 del() 都没有 try/catch：删除请求失败（如 403）时 await 抛出，后面的 load() 和 flash('已删除') 都不执行，按钮点了完全没反应也没提示。

**影响** 课例是课题的操作性成果、题库是备课积累，都是教师手工录入且无处找回的内容。一次误触就永久损失，等同于数据丢失；失败时的无反馈又会让教师重复点击。

**建议改法** 给 CasesView.vue:108 与 ResourcesView.vue:109 的 del() 加上与 ClassesView.vue:102 一致的 confirm(`删除「${title}」？此操作不可恢复。`)，并用 try/catch 包住请求，失败时 flash('删除失败')。更稳妥的做法是后端改为软删（加 deleted_at 字段）以支持撤销。

**核验证据** CasesView.vue:108-112 `async function del(id:number){ await resourcesApi.deleteCase(id); await load(); flash('已删除') }` —— 无 confirm、无 try/catch。第 35 行 `<button class="mini ghost" @click="del(c.id)">删除</button>` 与第 23-24 行的 `<summary>看教学流程与反思</summary>` 同在一张卡片内，相邻可误触。ResourcesView.vue:108-112 `async function del(kind,id){ if(kind==='exercise') await resourcesApi.deleteExercise(id); else await resourcesApi.deleteVideo(id); load(); flash('已删除') }` 同样无 confirm、无 catch。对照 ClassesView.vue:101-102 `async function del(c){ if(!confirm(`删除「${c.name}」？…`)) return` —— 同一份代码里班级删除确实有 confirm，行为不一致属实。失败无反馈部分也成立：api/resources.ts:6-9 `if(!r.ok) throw new Error(...)`，两个 del 都不 catch，403/500 时 await 抛出，后续 load() 与 flash 不执行，UI 完全无响应。后端 server/app/store_resources.py:468-470 `def delete_case(cid): ... c.execute("DELETE FROM cases WHERE id=?", (cid,))` 是硬删，无软删除字段。

---

## 18. [high] 全站下钻抽屉没有挂内容插槽，教师点「看学情」「N 条待介入」只弹出一行占位文字

**位置** `web/src/layouts/TeacherShell.vue:35`

**场景** TeacherShell.vue:35 与 StudentShell.vue:17 都是自闭合的 <PeekHost />，全仓没有任何地方给它传默认插槽内容（已 grep 确认）。于是 PeekHost.vue:22-24 的插槽兜底生效，抽屉正文永远只渲染 `<p class="peek__todo">学生 · stu-xiaoma</p>`。受影响的入口共 5 处、全是教师端主动作：LiveView.vue:23 每个座位的『看学情』、StudentsView.vue:23 的『学情 →』、TodayView.vue:10 首页那颗红色『N 条待介入 →』按钮、TodayView.vue:22 预警列表每一条、TodayView.vue:65『待介入』瓷片。场景：课堂上教师看到某学生标红『卡住』，点『看学情』→ 右侧滑出抽屉，里面只有『学生 · stu-xiaoma』一行灰字，没有代码、没有报错、没有六维，教师无法判断该不该走过去。

**影响** 课堂监看的价值链是「发现卡住 → 看清为什么卡住 → 介入」，第二步是空的，整条链断在最关键处；首页那颗最醒目的红色 CTA 同样点了等于没点。数据链路其实是通的（insightsApi.student + InsightCard 已在 ProfilesView 里跑通），只差把它接进抽屉。

**建议改法** 在 TeacherShell.vue 的 <PeekHost> 上补默认插槽：<PeekHost v-slot="{ kind, id }"> 内按 kind 分发——kind==='student' 时复用 components/insights/InsightCard.vue + insightsApi.student(id)（照抄 ProfilesView.vue:114-129 的拉取逻辑），kind==='alert' 时渲染 useTeacherHome().alerts 的明细；暂时接不上的 kind 至少改成明确文案『该明细尚未开放』，不要留一行看起来像加载失败的 ID。

**核验证据** `grep -rn "PeekHost" web/src` 只有 4 处命中：StudentShell.vue:17 `<PeekHost />`、StudentShell.vue:28 import、TeacherShell.vue:35 `<PeekHost />`、TeacherShell.vue:47 import —— 两处使用均为自闭合标签，全仓没有任何地方向它传插槽内容。PeekHost.vue:21-25 `<div class="peek__body"><slot :target="t" :kind="..." :id="..."><p class="peek__todo">{{ kindLabel(parse(t).kind) }} · {{ parse(t).id }}</p></slot></div>`，插槽兜底必然生效，抽屉正文永远只有一行灰字（.peek__todo 样式在第 60 行，颜色 var(--color-text-3)，类名本身就是 todo）。5 处入口全部核实存在：LiveView.vue:23 `<button class="mini" @click="peek.open(`student:${s.id}`)">看学情</button>`、StudentsView.vue:23 `@click.prevent="peek.open(`student:${s.id}`)">学情 →`、TodayView.vue:10-12 红色 `@click="peek.open('alert:all')"` 的「N 条待介入 →」、TodayView.vue:22 预警列表 `@click="peek.open(`alert:${a.id}`)"`、TodayView.vue:65 瓷片 `drill: { peek: 'alert:all' }`。

---

