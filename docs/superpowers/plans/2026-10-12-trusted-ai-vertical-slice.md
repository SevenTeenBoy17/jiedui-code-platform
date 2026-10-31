# 可信会话接入实际 AI 对话 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task after user review. One slice at a time; no commit, deployment, live student data access or Supervisor activation is authorized by this document.

**Goal:** 在隔离的严格实例中完成“教师建立可信任务会话 → 学生进入对应对话 → 最终 AI 请求使用正确任务与作品版本 → 回包再次核验 → 可追溯回执”的最小纵向链路。

**Architecture:** 新增严格对话入口，复用现有模型传输，不把可选 session 字段当权限。实例启动时冻结 `legacy|trusted_required` 模式；旧课堂/研究实例不动。严格入口只使用服务端验证的上下文，首片不保存完整对话，也不把客户端历史当系统事实。

**Tech Stack:** 现有 Vue 3 / TypeScript、FastAPI / Pydantic、SQLite、pytest 与现有 Node 前端契约测试。无需新增运行依赖。

**Spec:** `2026-10-11-pair-learning-review.md` M1–M5；`2026-10-11-m1a-pair-context-contract.md`；`2026-10-11-m1b-assessment-guard-contract.md`；根 `AGENTS.md`。

**状态：** 2026-10-12 细化设计，等待用户 review。本文不是已实现报告。原附件沿用上一轮全文研读所得映射，本轮没有重新全文研读、运行真实模型或验证课堂效果。

## Global Constraints

- 禁止「错误 N 次自动给完整代码 / 一键生成完整程序」。
- 禁止把点击数、错误次数、时长直接当成计算思维分数。
- 禁止画像只有雷达、不能点回证据。
- 禁止教师首页只有活跃度/题量。
- 禁止默认采集键盘流、鼠标轨迹、连续截屏。
- 本回合未声明的文件一律不准改。当前仅写本方案、`.runtime/m1b2-plan-review-20261012/**` 和 `progress.md`；下列业务文件是下一实施片候选，不是本轮写入许可。
- 一次只做一个切片。做完写 progress.md，停下来等人说 next。
- 保留全部既有脏修改；失败时只撤销本片已核实增量，不以整文件 git checkout 覆盖用户历史修改。Supervisor 持续暂停。
- 同一失败点最多两次尝试，仍失败则停止并保留原因；不得反复重跑直到偶然通过。
- 学生左侧编程猫头像与现有软塑图标不变；本片无资产重制、全站重排或品牌改名。

## 1. 已核实的问题，不从旧页面反推完成度

| 当前位置 | 事实 | 本轮设计回应 |
|---|---|---|
| `server/app/store_pair_sessions.py` | 有教师—班级—推送—attempt—作品校验；AI 尚未消费 | 复用权威来源检查，不复制另一套身份逻辑 |
| `server/app/ai.py` | 客户端 history 的 role、roomId 仍参与旧请求；代码材料进入旧 system | 新路径不接客户端历史/room/代码正文；系统规则与任务材料分层 |
| `web/src/views/student/StudioView.vue` | 当前唯一 aiApi.chat 调用；固定 socratic=true；本轮 message 重复进入 history | 严格分支由服务端给有效政策；旧路径不借本片静默更改研究条件 |
| Studio 异步发送 | 卸载检查不能隔离同组件切任务、切账号、A→B→A | 使用上下文代次；成功、错误、finally、总结均验证代次 |
| Workbench → IDE | target_id 被用作 taskId；resourceId 未贯通实际题目；缺省 A-03 | 首片不把这些字段当可信来源；工坊贯通在 M3 明确完成 |
| `RoleCompanion.vue` | 浮动 IP 主要是本机提示/跳转，并非真实模型入口 | 不宣称浮窗已接通；后续接入须复用同一严格请求客户端 |
| 画像 A/B/C | 示例数据、本标签页草稿与约定仍存在 | M5 才接真实画像；不能用 M1 分数包装成闭环完成 |

## 2. 研究与案例：如何转成约束

本轮主代理 Exa 四次检索共返回 20 条候选结果（不是 20 篇深读文献），重点读取 OWASP 两页、Tutor CoPilot、W3C PROV；教育测量代理另核验 UMC、CT 评价及有/无辅助学习相关原文段落。候选不等于证据，研究结果不直接移植为本平台效果。

| 一手依据 | 可以借鉴 | 本平台的可验收设计 / 不可外推处 |
|---|---|---|
| [OWASP 授权](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) | 每个请求检查对象权限，不只检查角色 | 学生、会话、轮次、尝试、作品归属共同验证；外呼前及回包前重验 |
| [OWASP 提示注入](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) | 用户材料不是高优先级指令；需要纵深防护 | 新路径不允许伪造 system/assistant 历史；不把格式分隔符当充分防注入证明 |
| [Tutor CoPilot](https://arxiv.org/html/2410.03017v2) | 支持教师的引导策略，并保留人的判断 | M4 让教师采纳、修改、拒绝建议；其数学辅导实验不能证明本平台编程教学有效 |
| [W3C PROV](https://www.w3.org/TR/prov-primer/) | 区分原件、处理活动、责任主体和派生关系 | 保存来源 ID、版本与请求回执；来源可信不等于能力判断有效，不强制建设 RDF 中台 |
| [Lee 等 UMC](https://fgmart.github.io/assets/pdf/1929887.1929902.pdf) | Use/Modify/Create 可往返 | M3 按活动记录，不把三个阶段作为能力阶梯 |
| [Brennan 与 Resnick](https://scratched.gse.harvard.edu/ct/files/AERA2012.pdf) | 作品、解释与新情境观察互补 | 单个作品含循环不直接证明计算思维；M3 采多源原件，M5 才做有范围的判断 |
| [Bastani 等研究](https://hamsabastani.github.io/education_llm.pdf) | 辅助练习表现与独立表现须区分 | 项目推论：M4 将低帮助课堂复核与统一条件下的新任务独立测量分栏；AI 或教师内容提示都属于帮助，未做独立任务只报告对应帮助条件下的表现；不移植该高中数学情境的效果量 |

**项目设计推论，不是论文原结论：** 先建立可信请求上下文，再记录实际帮助和后续学生表现，最后生成可质疑的画像。一次成功回复只证明返回了内容，不证明学生看见、理解或学会。

## 3. 五步路线与完成门槛

| 顺序 | 交付切片 | 只有满足以下条件才能称完成 |
|---|---|---|
| 1 / M1b2 | 可信会话实际对话，隔离严格实例 | 有效会话抵达实际业务请求组装/传输边界；非法上下文零模型调用；学生页面能消费回执；可检测的在途失效不显示旧答案，检测边界见4.3 |
| 2 / M2 | 引导规则与版本化输出放行 | 明确帮助类型、角色边界、请求/实际提示版本；在线/离线回退受同一合同约束；违规输出不放行，真实模型抽样单列 |
| 3 / M3 | 单任务 UMC 原件链 | 教师真实题目→学生 attempt→预测/代码/实际测试/解释逐项关联；无证据不生成能力判断 |
| 4 / M4 | 教师反馈—再做—复核 | 反馈有真实投递和处理状态；有新的学生表现及帮助条件；同量规复核，不以已读或重存判改善 |
| 5 / M5 | A/B/C 真实画像 | 同证据不同表达；任务/单元分离；每条主张支持/冲突/缺失可查；学生更正能到教师并保留历史 |

M6 正式研究校准与真实课堂效果另行推进。每片新增真实采集、出域、留存或研究用途所需的批准与主体权利机制，均是该片真实启用的前置条件，不延后到 M6。当前只用隔离合成材料验证。每片收尾独立验收、追加进度并等 next；不能因路线获认可而一轮修改所有模块。

M2 的 H1找位置、H2找方向、H3搭步骤、H4理原理是帮助类型，不是按编号升降的难度等级；不得按错误次数自动给更接近答案的帮助。学生选择“不再需要”只表示停助，不证明掌握。

## 4. M1b2 的关键产品决策

### 4.1 首片选择：隔离严格实例，不全站强制切换

选择 B：专门的合成数据验证实例设置 `PAIR_AI_MODE=trusted_required`。A“同实例为每位学生新增 enrollment 并即时灰度”需要独立的退出、留存及多教师冲突治理，首片不做。C“可选 session，有问题回退旧入口”可绕过，拒绝。

- 启动时一次读取模式；只接受 `legacy|trusted_required`，非法值启动失败，缺省 legacy 保留现状。
- strict 实例内，所有学生旧 `/api/ai/chat`、旧 `/api/ai/image` 教学请求一律拒绝，即使携带 session 参数；只有新严格 chat 可以调用模型。固定安全援助与纯流程帮助保留。
- 关闭 session、到期清理、删除作品、撤回再同意均不能把 strict 实例变回 legacy。
- 新严格接口在 legacy 实例返回明确“未启用”，不能成为改变旧研究政策的旁门。
- 两种模式分别以新进程验证；本片不改真实部署配置、不重启真实服务、不将真实数据复制到测试库。
- 未来若 strict 与 legacy 共享学生身份且均可访问，仍会发生跨实例绕过。真实启用前必须关闭旁路，并验证旧工作进程全部排空；不把实例开关说成全平台防作弊。
- 当前演示登录允许合成账号，不能证明现实身份。真实启用前另验身份/教师权限；新模式不会把演示认证升级为生产认证。
- 数据库故障时停止教学外呼；高危文本固定安全援助不得依赖会话/测评查询成功，也不得声称通知已经送达。

### 4.2 单次可信请求，不伪装完整对话记忆

新增 `POST /api/pair/sessions/{session_id}/rounds/{round_id}/chat`。仅该 session 的学生可发起；创建教师能管理/读取会话，但不能冒用学生的 AI 交互记录。

请求白名单：`request_id`（1–100 位字母数字下划线连字符）、`message`（去首尾空白后 1–4000 字符）、`persona=guide|review`、可选正整数 `project_version_id`。拒绝 extra 字段，包括 history、roomId、codeContext、human_role、student_id、scaffold、研究组别和提示版本。

- 真人职责仅展示教师分配，不作为实际履职/能力证据，也不直接推导 AI 职责。IP 选择只选择批准的辅导视角；会话教师明确设定的提问政策可覆盖，回执和 UI 说明原因。
- **可信政策只取本会话不可变配置，不读取旧 learner_state 或旧班级锁。** 旧修改入口只校验角色、不校验对象，不能作为本片可信来源；本片不顺带改旧入口。新增 strict 专用 `PUT /api/pair/sessions/{id}/ai-policy`：仅会话创建教师且全部来源、session、attempt仍有效可设置，学生、研究员、其他教师均拒绝。请求仅含严格整数 `scaffold=0|1|2|3` 与严格布尔 `socratic`，两个都必填、拒绝extra；不默认复制旧值。服务端在pair_sessions新增可空 `ai_policy_json`，冻结 `pair-ai-policy/v1`、设置教师、时间、上述二值及内容hash；老记录NULL表示未配置，绝不表示无AI或默认低档。查询如实返回未配置，严格chat返回409 `POLICY_NOT_READY`且零外呼。
- 政策首次写入后不可修改：重复相同值幂等返回，不同值409；事务内校验来源、写入及只写一次。若要改变，本片只能先关闭旧会话，再用新attempt建立新会话；没有隐含热更新。现有研究组别仍NULL，政策不是研究分组。旧全局档位/班级锁对strict没有控制效力，必须在教师API说明与学生上下文条说明“本会话规则”；真实班级切换不在本片范围。
- 旧 D1 和 `ai-prompt/v2` 原样保留。新路径使用独立 `ai-prompt/v2-context1`；不复用包含“由AI握键盘”的旧角色原段，不声称新角色与旧干预等价。规则组合明确如下：

| 请求persona / IP | 会话socratic | 有效教学职责 / 档位应用 | 固定输出边界 |
|---|---|---|---|
| guide / 树小骥·导航员 | false | 分析辅导；不追加档位段（scaffold仍记录为已分配，但applied=false） | 先请学生说思路；可解释语法、示意局部步骤，最多3行不构成整题答案的API示例；绝不操作编辑器或替学生运行 |
| review / 熊猫·领航员 | false | 审查提问；追加会话scaffold段，applied=true | 从学生材料发现边界/测试问题；按0只点醒、1方向+问题、2步骤或伪代码、3最多3行局部API示例；任何档位都不能完成整题 |
| 任意persona | true | 有效职责强制审查提问；追加会话scaffold后由更严格提问规则覆盖 | 只复述理解、1–2个问题及必要自然语言方向；无可运行代码；回执记override_reason=session_socratic |

上述0–3是沿用的提示粒度，不是M2的H1–H4帮助类型，不自动升降。全部角色都只输出辅导内容，学生操作代码；真人human_role不参与此表。回执同时记录requested_persona、effective_role、assigned_scaffold、scaffold_applied、socratic、policy_hash。测试需检查全组合最终外发内容与实际回退文案，不只检查版本字符串。
- 没有获准的服务端历史正文时，只使用本轮问题与本任务材料。对话可在当前页面回看，但明确“AI 本次参考本任务和选定版本，不自动读取先前对话”。不声称已实现跨轮防拼答案。
- 初始任务版本仍是 `session_snapshot_only`；不补造推送当时版本。无代码版本时只提供任务理解帮助，回执 `code_source=none`。
- 提供 version_id 时必须属于 session 的绑定作品；未提供时在首次核验事务内冻结当前最新版本 ID/hash。之后保存新版不偷换本次输入，回执明确引用旧版；原版本删除/归属失效则终止。
- 系统规则只含服务端固定规则。允许的任务字段和代码经限长、脱敏及输入护栏后放入明确标记的数据消息；不读取隐藏用例、参考答案、任意 room 锚点、旧任务错误计数或其他学生材料。
- 最大出域预算：任务标题 200、摘要 1000、题干 8000、starter_code 4000、代码 12000、问题 4000 字符；超限在调用前返回 `CONTEXT_TOO_LARGE` 并说明需缩小材料，不截断后假装看过全文。预算是本地工程设定，不是研究阈值。

### 4.3 请求生命周期、在途变化与可追溯性

`核验并登记 pending → 释放数据库锁 → 最终外呼前重验 → 模型/固定回退 → 回包重验及终态事务 → 返回`。

核验包含：当前认证学生、教师/班级/推送/接收关系、尝试 active、session active/未到期/未撤回、round 属于该 session 且未结束、作品与版本、M1a 活跃研究隔离，以及 M1b1 学生全部独立测评状态。复用既有安全判据，不只调用 read_session。

- **永久状态/事件检测：** 通过现有API关闭轮次/会话不可重开，同意撤回使旧session永久revoked，测评许可保留在途首开标记检测；这些发生后，即使重新同意或新开测评随后立即提交，也丢弃旧回复及编程fallback。作品/版本已删除且在复核时不存在，同样拒绝；不宣称可检测绕过业务API直接篡改数据库的操作。
- **当前状态检查：** 班级/推送接收关系、尝试状态、任务发布状态和研究关联等，保证在首次、外呼前、回包前检查时有效；若在检查之间短暂失效又恢复原值，本片没有单调revision，可能观察不到。不能把这说成捕获全部在途变化；测试专门记录“移出再加入/结束再恢复/撤回发布再发布”的有限保证。真实课堂启用前必须补这些写端的单调失效标记或等价治理；不是本片通过即可上线。
- 本会话policy首次设置后不可变，每次核验policy hash与冻结值；缺失或异常变更则拒绝。旧全局档位或班级锁修改不改变本会话政策。未来可变政策须另立单调revision合同，不能用值比较冒充历史撤销检测。
- 网络请求绝不持有 SQLite 写事务/全局锁；已送出的请求不能收回；最后本地检查与网络交付之间仍有极短窗口，不能声称跨系统原子性。
- 新建最小 `pair_ai_requests` 元数据表：request ID、student/session/round/attempt、快照/版本 ID和version_no及hash、persona/有效职责、分配档位与是否应用/socratic/policy_hash、context/prompt版本、configured_model、provider_model_version（提供商未返回则NULL）、source（model|fallback，pending/未生成时NULL）、状态/原因码与服务端时间。无消息/回复正文、代码副本或学生姓名；不混写为旧研究 ai_reply_log 或伪造旧 room/hop。configured_model不能冒充实际提供商权重版本。
- 状态机仅 `pending → released|invalidated|failed`，终态不可覆盖；finalize须以条件更新避免并发覆盖。失效原因及终态先在短事务提交再返回相应错误，不能抛异常使审计回滚；审计提交失败则503且不发布正文，不能伪称failed已持久化。父记录已删除时不重建回执，保持主体删除结果。`released`只表示服务端允许返回，不是delivered/read/understood；模型失败后允许的固定模板明确source=fallback，没有可用模板才failed。
- 故障日志允许字段限定为request_id、随机session/round ID、阶段、稳定error_code、HTTP状态、context/prompt版本、source、配置模型名、服务端时间和耗时；不记token/密钥、任意异常原文、请求/响应body、题干、代码、history或身份姓名。错误码对学生翻译，不能直接回传提供商错误正文。
- 同 session＋request_id 唯一。重复 pending 返回409处理中；已有终态返回409已处理及允许的元数据，不重新调用、不从数据库恢复未保存的正文。网络中断后先查状态，再由学生明确发起新请求，不静默重试。
- 进程中断可能留下 pending：状态查询标记“结果未确认”，不自动再次调用或编造失败。到期随父 session 删除；后续增加队列恢复不能偷偷改变此语义。
- 表的留存不超过父 session，继承明确配置与 on_access_not_scheduled 边界；session与round外键均ON DELETE CASCADE，在删除注册顺序中先删本表再删round/session；避免表尚未迁移时旧数据库清理报错。同片接入本人查询、导出、删除与撤回业务不可读，policy列随父表同生命周期。元数据仍是个人数据，不称匿名。

### 4.4 学生界面不变壳，只补清楚的上下文条

- 模式发现：新增已认证 `GET /api/pair/sessions/capabilities`，返回 `mode`、`trusted_chat_enabled`、`trusted_image_enabled=false`、`history_mode=current_question_only`。须在动态 `/{session_id}` 路由之前注册。查询失败时不猜成legacy，显示配置读取失败并提供重试。
- 无pairSession入口：strict禁止启用发送框，显示“先选择老师安排的课堂会话”。新增已认证学生本人 `GET /api/pair/sessions/available`（同样优先于动态路由），仅返回当前来源/授权、active session/attempt及已配置policy均有效的本人会话摘要，最多50项按创建时间降序；可以包含尚无开放轮次但允许明确开轮的会话。缺policy不纳入；无会话显示“还没有可用的课堂会话，请老师建立并配置会话”，不能假装已发通知。不读取全班名单或给任意student_id参数。选择后以replace更新pairSession；legacy继续原入口。
- 使用 `/student/studio?pairSession=<服务器ID>`。URL 是定位信息，不是访问凭证；不带学生姓名/题干/代码。GET 校验通过后从服务器取任务、真人职责和唯一开放轮次。
- 顶部显示“正在讨论：任务名 · 本轮 · 本会话规则”。首片不做作品版本选择器：发送前显示“发送时读取已保存版本，不包含未保存草稿”，有回执后才依实际version_id/version_no显示“本次参考vN”；无绑定作品/无保存版本显示“仅任务材料”。发送期间保存新版也不改旧回执；未回执不能提前显示已冻结vN。保留左侧导航、头像和IP风格。
- strict隐藏或替换Studio原有 `learner.round_index` 徽章、旧全局锁和“两位伙伴均只提问”文案，包括aria/title。轮次只用可信round；有效规则只来自本会话policy。socratic=false不显示强制只提问，socratic=true明确本会话覆盖原因；不能保留不可操作却看似可切换的旧锁按钮。legacy的旧展示不变。
- 严格对话所有发送按钮（输入、推荐问题）使用同一个客户端；严格模式生图显示未开放，不调用旧接口。
- strict 隐藏“总结我刚才学到了什么”以及学习面板的自动学习总结入口，因为模型未读取旧对话，不能根据任务名猜学习经历。展示“本次问题与回复”，不称学习总结；旧legacy总结保持原状。若学生主动粘贴自己的反思，按本轮自述材料处理，不作为已核验学习事实。
- 错误不放进 AI 消息历史：401登录；403授权/同意按code区分；404不可访问；409轮次/来源/重复请求冲突；410到期；423测评期间暂停；503未启用/服务不可用。均提供具体下一步，不全说“未同意”。
- 冻结 `actor+session+round+requestEpoch`；切账号、session、round或卸载即使A→B→A也丢弃旧成功、旧失败和旧finally。capabilities、available、session GET的加载结果同样受独立加载代次约束，不只保护chat。草稿、总结、角色待定状态不跨上下文复用；明确未发送内容会清空。
- 没有开放轮次时，仅当前session和attempt均active、来源/授权/policy有效才显示“本轮已结束／开始下一轮”，由学生明确操作，不自动重开。GET的可用动作由服务端计算，前端不从rounds为空猜资格；后端openRound再次核验。关闭/撤回/到期/尝试完成显示各自终止原因，禁用开轮及发送。不提供学生修改真人职责或policy。
- 首片教师建会话仍通过既有受权 API，合成验收会实际走该 API；缺教师发会话 UI 因而不得宣称完整教师课堂编排已完成。教师日常操作入口在 M3 接入。
- 浮动 IP 真实对话消费、工坊传参、作品自动保存关联不借本片宣称完成；后续复用严格客户端，不再造第二条权限链。

## Review Focus

1. 学生省略/伪造上下文、直接访问旧 chat/image：strict 实例仍拒绝，零模型调用。
2. 模型在途发生撤回/关轮/首开测评：不返回教学内容、不生成 released 回执。
3. 合法登录但跨学生/作品版本/轮次：对象权限拒绝，不能回落自由练习。
4. 同组件换 session、账号或 A→B→A：旧消息与错误不会落入新会话。
5. 故障/重复请求/重启：不可重复外呼、伪造已送达、吞掉测试断言或把 pending 算成功。

## 5. 实施任务：仅在用户确认后执行

### Task 1: 冻结范围与隔离模式

**Files:** 新增 `server/app/pair_ai_context.py`；修改 `server/app/ai.py`、`server/app/pair_sessions.py`；新增 `server/tests/test_pair_ai_context.py`。预导入引导候选白名单为已核实存在的 `server/test_support.py`、`server/tests/conftest.py`、`scripts/check_test_isolation.py`，及 `server/tests/test_test_isolation.py` 的模式负例；实施时先声明实际需要修改的子集，不扩大隔离权限。

**Interfaces:** `PairAIMode` 启动配置；`StrictChatRequest` 为4.2的严格请求；`capabilities`与本人`available`的合同见4.4。新路由消费既有 session/round，不新增认证方式。

- [ ] 保存白名单文件本片检查点与哈希；读取待改文件现有 diff，不重置工作区。
- [ ] 写模式负例：非法值启动失败；legacy 新路由拒绝；strict 旧 chat/image 对省略、伪造和合法 session 参数均零外呼。
- [ ] 模式在app导入前注入，旧完整回归使用显式legacy新进程，strict专项及非法值启动使用各自受哨兵保护的新进程；启动后改环境不改变本进程模式。不得用导入后monkeypatch假装进程初始化验证，测试引导也不能把strict悄悄重置legacy。
- [ ] 在隔离预导入哨兵下证明预期 RED；若失败是环境/夹具问题，不能记成功复现。
- [ ] 实现模式判定和固定流程/高危安全例外；证明 GREEN，安全求助故障注入单列。

### Task 2: 可信请求解析与最终传输

**Files:** 修改 `server/app/store_pair_sessions.py`、上述 `pair_ai_context.py`/`ai.py`/`pair_sessions.py`；扩专项测试及 `server/tests/test_pair_context.py` 的合同响应检查。

**Interfaces:** `set_session_ai_policy(actor, session_id, scaffold, socratic)` 只写一次；`resolve_ai_context(actor, session_id, round_id, project_version_id) -> TrustedAIContext`；`revalidate_ai_context(actor, context) -> None`；`build_trusted_messages(context, scrubbed_message) -> {system, messages, prompt_version}`。正文材料不拼成system指令；GET返回服务端can_open_round/can_chat及reason_code，不由前端猜权限。

- [ ] 先写两个不同非温度任务、两个学生、两个session的正反例，检查最终传输 body，而非只检查 helper 返回值。
- [ ] 覆盖过期/撤回/关闭/错误版本/研究关联/测评/隐藏答案/伪造历史及输入长度；非法请求外呼计数为0。
- [ ] 有效请求复用生产模型传输；线上边界使用离线传输替身，记录其不是实际云模型质量验证。
- [ ] 验证guardian/session/round/assessment不可逆失效；验证class/source/attempt/research各检查点失效拒绝与ABA不可检测的明确边界；有效fallback说明来源，已检测失效不得fallback。
- [ ] 真实路由验证教师B设置教师A会话policy无效、学生/研究员拒绝、字段缺省不猜档位、首次设置原子且不同值不能覆盖；旧全局policy被改也不污染strict。
- [ ] 旧角色×档位×苏格拉底条件回归，旧D1/v2 unchanged；新增4.2全组合最终外发和fallback测试，新context1不能进入旧版本分母。

### Task 3: 原子回执、隐私与恢复

**Files:** 修改 `server/app/store_pair_sessions.py`、`server/app/store_erasure.py`；新增 `server/tests/test_pair_ai_lifecycle.py`。

**Interfaces:** `begin_ai_request(actor, context, request_id) -> receipt`；`finish_ai_request(actor, context, request_id, result_metadata) -> receipt`；`GET /api/pair/sessions/{id}/ai-requests/{request_id}` 仅返回本人或创建教师授权后的元数据，已撤回/来源失效不恢复业务访问。

- [ ] 写唯一请求、并发重复、不可覆盖终态、回包前失效原因持久化、事务中断、父记录删除不重建、同意撤回再授予与到期级联测试。
- [ ] 回执终态与核验在短事务内提交；审计落库失败不发布教学成功回复。不可将模型边界回调内的断言吞在业务异常中。
- [ ] 证明本表无正文；主体导出/删除、session到期清理不残留本表/他生数据；迁移失败整体回滚。
- [ ] 对 pending 中断给结果未确认，不伪装幂等重放正文；所有故障日志只保留批准的字段。

### Task 4: 学生显式入口与异步隔离

**Files:** 新增 `web/src/api/pairSessions.ts`、`web/src/composables/useTrustedPairContext.ts`；修改 `web/src/views/student/StudioView.vue`；新增 `web/tests/trusted-pair-context.contract.cjs`。如需修改通用 ai/http 客户端，先补白名单，不直接扩写。

**Interfaces:** `getCapabilities()`、`getAvailableSessions()`、`getSession(id)`、`openRound(id, request_id)`、`chat(sessionId, roundId, request)`、`getRequestStatus(sessionId, requestId)`；请求不携带客户端 history、room 或代码正文。

- [ ] 实源SFC/composable测试模式发现失败、无参数入口/本人会话列表/无会话、禁用无历史总结、延迟发送、同组件路由切换、换账号、A→B→A、两次点击、迟到错误/finally；capabilities/list/session各自迟到响应也覆盖。补无开放轮次但可开、session关闭/attempt完成/撤回/到期不可开；发送前/后版本文案及在途保存新版不污染回执。
- [ ] 实现上下文条、确定性错误行动和生图未开放提示；历史回看不宣称 AI 已读取；task标题只读服务端快照。
- [ ] strict可见文案及aria/title不残留旧learner轮次、旧全局锁或与会话政策相矛盾的“均只提问”；旧legacy展示回归不变。
- [ ] 保留 legacy 的旧研究语义与页面视觉；严格失败不删除参数、重发或跨模式跳转。

### Task 5: 集成验证与独立验收

**Files:** 本片候选 runtime 目录 `.runtime/m1b2-trusted-ai-20261012/**`、`progress.md`，以及最终审阅确认的上述白名单。

- [ ] 精确核对数据库/部署文件没有访问，按 `scripts/check_test_isolation.py --mode suite` 执行专项，再完整后端；保留命令、退出码、连接审计和失败日志。
- [ ] 执行新增实源前端专项、现有全部前端测试、`npm --prefix web run typecheck`，独立输出目录构建，不覆盖正式 web/dist。
- [ ] 仅隔离合成环境：受权师生API分别建立任务/推送/attempt/session→教师设置本会话policy→学生登录→链接或本人会话选择进入Studio→问题→正确上下文回执→关轮失效→符合条件才明确开新轮。浏览器观察本轮真实路由，不用静态HTML替代。
- [ ] 验证1440×900、1366×768、390×844及键盘/错误焦点；不冒称真人学生试用。
- [ ] 架构安全、教育测量、测试/体验代理分别对最终变更独立审查；重要发现修复后重跑受影响和综合检查。CodeRabbit仅审本片变更，不能把全工作区历史差异当本片产出。
- [ ] 获批准后才用合成材料做真实模型样本；未获批准/未执行时明确“传输接入已验证，真实模型行为未验收”。没有部署与真人试点证据，不签生产/教学效果通过。
- [ ] 用户所要求的“实际AI对话完成”另设必过门槛：获准的隔离合成材料真实模型调用及浏览器收到对应回复，检查其任务/版本回执与角色规则。替身测试只能签“接入机制通过”，不能替代这个门槛；如环境或权限不足，则本片保持实际AI验收未完成，不以高文档分交付已完成。
- [ ] 追加 progress 后停止，等待 next 进入 M2；不自动改 H1–H4/画像算法。

## 6. 量化验收：高分不能靠隐藏边界

**方案审阅分**（只评价本文）：每维0–4，0缺失，1原则性描述，2仍有关键歧义，3基本可执行但有明确非阻断待补，4责任/接口/失败处理/测试/边界齐全。独立代理可打低分；发现修正后重新评审，保留初稿意见。

**实施验收分**（未来依据新证据）：0缺失/违规，1仅设计，2局部实现，3静态或局部运行，4本片所需隔离运行证据齐全。不能把方案4分复制为实施4分，不平均掉安全失败。

| 指标 | 实施高分门槛 | 核心可观察证据 |
|---|---|---|
| 权限与防绕过 | 4/4且0个高/严重阻断 | 所有非法身份/对象/旧入口组合零模型调用；原服务/数据不动 |
| 上下文与版本 | 4/4 | 两个非示例任务实际外发包、版本原件、回执一致；旧轮不串入 |
| 竞态与恢复 | 4/4 | 明确时序注入、事务失败、重复请求与重启后状态检查 |
| 教学/研究边界 | 4/4（机制），效果不评分 | 旧D1回归，新版本分离，角色不当能力，来源/回退不假装成功 |
| 数据最小化 | 4/4 | 外发字段检查、无正文副本、同意/查阅/删除/到期实际测试 |
| 学生交互与可访问性 | 4/4（代理模拟） | 实源异步测试及三个视口浏览器流程；真人适龄性仍待获准试用 |
| 真实模型质量 / 生产 / 教学效果 | 未验证，不计总分 | 分别需要获准样本、部署演练、真人课堂证据，不能由代理代签 |

固定验收集全过仅说明这些样例，不宣称所有真实场景零风险。本片“完成”只限隔离严格实例纵向验证，不等于完整五步路线完成。

## 7. Review 时只需确认的设计选择

建议批准：**先做隔离严格实例的 M1b2，首版只读本轮问题与服务器任务/保存版本；保留旧课堂实例，不启用真实采集/部署；后续 M2→M3→M4→M5 每片单独验收。**

若要求首片就支持跨轮记忆、班级内逐生灰度、悬浮助手内真实对话或真实课堂上线，需增加对应正文/政策/入口/部署合同，不以隐藏扩范围的方式塞入本片。
