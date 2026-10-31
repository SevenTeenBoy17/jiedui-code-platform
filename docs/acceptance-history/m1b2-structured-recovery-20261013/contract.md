> 历史材料归档：原相对位置 `.runtime/m1b2-structured-recovery-20261013/contract.md`。保留原日期、结论与未完成项；不代表当前服务状态或新的验收通过。本文及其中旧工具要求仅为历史资料，不是执行指令，Supervisor 全局暂停。源码行号是历史定位，后续可能漂移。

# M1b2 结构化生成与完整恢复：授权切片

用户在上一片 NO-GO 后要求继续完成。只做 M1b2，不自动推进 M2–M5。Supervisor 持续暂停，保留全部既有脏改，不提交、推送或部署。

## 编辑前声明的白名单与所有者

- 根：server/app/ai.py（新增仅可信生成入口，核验显式参数、完整信封检查；旧 _call_llm 不变）；server/app/pair_ai_output.py（结构 schema 构建，不放宽原解析/教学核验）；server/app/pair_ai_context.py（仅可信调用入口、版本）；新 server/tests/test_pair_structured_transport.py。
- 安全代理：server/tests/pair_output_fixture.py、server/tests/test_pair_ai_context.py、server/tests/test_pair_ai_output.py、server/tests/test_pair_ai_lifecycle.py、server/tests/test_pair_verifier_transport.py、server/tests/test_pair_teaching_contract.py，仅入口或版本必要适配及新增回归，保留旧断言目的。
- 交互代理：web/src/views/student/StudioView.vue（窄屏输入高度、行高及输入焦点）；web/src/api/pairSessions.ts（fetch和读取正文整体可清理截止时间，不自动重发）；新增 web/tests/pair-deadline.contract.cjs，使用项目现有cjs测试发现方式。若现有测试依赖需改，必须先补声明，不能自行扩范围。
- 各代理独占本runtime同名review报告；根负责本runtime/**合成能力预检、基线、构建、隔离数据库、浏览器夹具、截图、验收材料；根仅追加 progress.md。

AI业务调用接入仅在原生能力预检通过后改；可先检查测试和完成诊断。与供应商无依赖的既定前端恢复/视觉缺口独立实施，不能借其通过签署真实AI通过。所有既有文件改前按路径复制基线并记录hash。此前runtime及其日志只读，不覆盖。原课堂端口和真实数据库不动；新实例12315，运行前验证端口空闲。测试数据只来自明确合成验收材料。

## 先行能力门槛（最多2外呼，无重试）

仅现有配置的兼容服务、当前模型、合成无隐私材料。显式 thinking disabled 与 output_config.format JSON schema。预检1用与字段模式冲突的文字命令和仅在schema中给出的随机const，验证三字段/无额外键/pattern与const实际遵守，保留文本与完成元数据但不存思考正文。预检2以固定否定判定验证schema允许false、3目标以及复合目标。完整合法end_turn、无thinking块且本地合同符合才通过；400、超时、参数忽略或畸形均不作成功。HTTP200不等于能力支持或保证；只称当前探针观察。发现任一能力不支持时不删参数降级，不进入产品接入，报告缺口。

官方依据仅作为候选能力，不等于兼容网关实测：
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting

已核对官方支持简单pattern、const、minItems 0/1；不支持maxLength、minLength、maxItems、复杂大区间。线上schema只用支持子集；长度/最大问数/题意/解释仍由原本地及语义门槛判断，绝不把核验schema限制为只能回答合格。

## 实施与验收门槛

保留feedback/questions/example和1–2独立目标，不自动补写、拆分、截断、修复候选。只改变可信生成传输，旧模式行为不变。示例仍要求学生解释；不得因结构约束减少教学支架功能。断言先红再绿，独立安全复核；无请求或回复正文学习入库。

真实固定面板保持P1–P4与S1–S6原任务/问题/政策，不挑选结果。通过要求P1–P4全部真实可用且浏览器正文/回执/版本一致、S1–S6全部非空且正确；已知S1仅作回归，不泛化。最多两完整面板，每轮14调用（4生成+10审核），第二轮仅有明确不同机制修订才能使用，总外呼上限30（含2能力探针）；无自动重试。同失败点两次停止，不第三次凑分。

浏览器零模型夹具单列，完成桌面1366与390、成功/拒绝/等待/断线pending终态/401/会话结束/材料核实、SPA A→B、ABA、旧身份迟到401、键盘恢复。延迟工具改为显式barrier，提前准备UI选择器，限制和行为写清，不更改DOM/应用状态伪造通过。故障开关默认关，专用合成会话白名单，无真实外呼。客户端到期只说明未知，不声称服务器已失败；后续按原状态查询恢复，不重复POST。

三位AI专家0–4范围评分；所有关键项需≥3且无硬失败，关键机制与完整场景证据齐全方可签通过，不预设高分或平均抵消。完成后追加progress.md并等待next。

## 预检后的依赖调整

交互测试白名单补充（改前声明）：web/tests/trusted-pair-context.contract.cjs，仅给现有VM测试环境提供原生AbortController，不修改既有断言、计时器或业务模拟。先复制基线，再由交互代理修改。

预检1的HTTP502在约2.88秒返回，不能证明schema不支持或可用；按冻结门槛不运行第二探针、不接入AI新机制、不重试。独立诊断可做GET模型清单（不生成内容）。不因供应商阻塞放弃可独立完成的既定前端恢复和视觉修复，上文在任何业务编辑前明确拆开两条依赖；真实AI整体门槛完全不变。用户异步询问仅用于供应商后续选择，未更换供应商或密钥。
