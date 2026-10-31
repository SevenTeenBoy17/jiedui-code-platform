> 历史材料归档：原相对位置 `.runtime/m1b2-structured-recovery-20261013/security-review.md`。保留原日期、结论与未完成项；不代表当前服务状态或新的验收通过。本文及其中旧工具要求仅为历史资料，不是执行指令，Supervisor 全局暂停。源码行号是历史定位，后续可能漂移。

# M1b2 结构化能力门槛：独立只读安全审计

日期：2026-10-13（本地）。审阅者：security_recovery。结论：**INCONCLUSIVE / 能力门槛尚未满足，不能认定“不支持”，也不能进入产品接入。**

## 1. 范围与边界

已完整阅读本片 contract.md、capability_probe.py、capability-results.json，以及 Code Verification 技能和验证矩阵；按 Review Changes 技能尝试图上下文，发现索引仍指向无关的 server-image/dashboard-image/lib-ppt，未用它的“低风险”摘要作为证据，也未重建图。最初 detail_level 参数被工具接口拒绝后仅去掉该参数重新读取。

本次唯一文件写入为本报告。未修改产品、测试、探针、配置、旧日志或前轮结果；未运行能力探针、未发任何 POST、未进行模型调用、未操作浏览器/服务、未访问真实或合成数据库。只按根代理明确授权，在内存选择 AI_API_KEY、AI_API_BASE_URL、AI_MODEL 三项，完成一次配置端点的 GET /models 可用性检查；不输出 URL、密钥、模型清单详情或错误正文。Supervisor 持续暂停。

审阅时固定证据哈希：

- capability_probe.py：8FD39A91C5627C875F25B575FD3BB338B3C9006F4FC3D6F8D106622E4B252DDA
- capability-results.json：3D06040983AA5810E0DA2AE929B9C69E05B9F653AD7CCCD3AD186B62DADB33F6

## 2. 真实观测：502 与目录可用性不能互相替代

| 检查 | 实际结果 | 能证明什么 | 不能证明什么 |
| --- | --- | --- | --- |
| 根代理已执行的能力预检1 | HTTP 502 / HTTPError，2.8755997 秒，capability_pass=false；只记录一个探针条目 | 本次结构化 POST 尝试失败，预检2未执行；脚本没有在失败后继续或降级 | 模型不支持参数、schema错误、鉴权失败、thinking导致超时、模型已经/没有实际执行 |
| 本代理唯一 GET /models | HTTP 200，application/json，0.4552 秒；对象与 data 数组形状有效，包含当前配置模型 | 在此时该目录端点可达，当前认证能读取目录且存在该模型条目 | /messages 的推理路由健康、模型原生身份、禁思考或结构化参数被透传/执行 |

GET 检查使用原配置认证方式，禁用重定向，无重试，15 秒 socket 超时与 64 KiB 响应上限；仅输出状态与布尔摘要。结果读取没有进入模型生成端点。目录成功不能抵消 POST 502；单次 502 也不能当成稳定不可用或“不支持”的判定。2.88 秒不是此前 30 秒核验超时的同一故障表现。错误正文未读取或记录，当前证据无法进一步区分上游路由、模型服务暂时不可用、网关转译异常或其他原因。

预算解释：原结果保留为一次已消耗的外呼尝试，不因没有模型正文就将计数清零；是否实际发生上游推理或计费，本审计无法确定。我的 GET 不是新增生成/核验调用。不存在“已证明支持”或“已证明不支持”的结论。

## 3. 请求 schema 与官方规范核对

预检1使用对象、三项 required、additionalProperties=false、字符串 const、minItems=1 与简单字符类 pattern。未使用 maxItems、maxLength、复杂正则或其他已知不支持约束；从官方规范看，属于支持子集。随机 const 仅在 schema 出现，加上冲突的纯文本请求，有助于观察是否遵守结构约束，但少量成功样本仍不是网关实现原生约束解码的证明。[官方结构化输出](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

预检2的否定判定 schema 允许 false、整数3与每行多目标，没有把核验强制成全 true 或最多两目标，方向正确；本次它没有执行。字段长度、最终问数与教学语义仍应保留本地检查，不应借 API schema 替代。

官方 Sonnet 4.6 配置允许 thinking disabled，默认思考关闭。因此参数候选并非凭空猜测；但兼容网关是否认可和实际执行，仍需独立实际证据。[官方思考配置](https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting)

## 4. 中等风险：未来成功判据不够严格（高置信、离线复现）

定位：capability_probe.py 的 call()，约43–50行，以及预检2约97–100行。

当前 call() 仅检查 stop_reason=end_turn 与所有 content 块类型为 text，使用普通 json.loads 解析外层与候选。它没有检查 type=message、role=assistant、stop_sequence=null、冲突 finish_reason、错误字段或重复键。预检2还只用 question_count == 3，未明确拒绝浮点3.0；目标行长度被检查，但目标元素字符串类型未检查。

独立离线验证直接抽取此文件的 call() AST 到内存执行，HTTP、输出文件均替换为纯内存对象，未执行脚本顶层、未加载凭据。四种受控 HTTP200 响应分别为：

1. 错误 envelope type/role；
2. 非 null stop_sequence；
3. 冲突 finish_reason=length；
4. 候选 JSON 的 feedback 重复键。

四种都能使现有预检1的最终 oracle 判为通过。网络、模型调用、数据库访问与文件写入均为零。这是未来能力门槛的假阳性风险，不是当前502被误放行，也不是新证明的产品路线漏洞。

最小修正方向（本代理未实施）：探针成功条件应与已审过的产品严格信封条件对齐；外层/候选拒绝重复键，明确整数和目标字符串类型。先用上述内存负例作 RED，再修探针并 GREEN，之后才有资格把真实预检的绿色结果作为接入门槛。任何异常都不能自动删参数重试。

## 5. 中等风险：默认重定向不能保证只访问配置端点（高置信、离线复现）

定位：capability_probe.py 约38行，使用默认 urllib.request.urlopen，没有禁止重定向。

本代理另用当前 Python 标准库 HTTPRedirectHandler，在内存构造含合成 x-api-key 的 POST 请求和跨主机302；默认处理器生成了 GET 重定向请求，并保留合成 x-api-key 头。没有实际联网，未使用真实凭据。因而当前探针的“仅配置端点”保证不覆盖重定向场景；自带调用计数也不能反映额外重定向请求。

最小方向：未来获授权的探针明确拒绝重定向，不能向未知主机自动转送认证头。不声称本次502发生过重定向或泄露；现有结果没有这种证据。本代理的唯一 GET 使用 NoRedirect，未遇重定向。

## 6. 恢复前需要的信息与步骤

1. 请兼容服务方确认当前模型的 /messages 路由是否可用、是否支持 thinking disabled 和 output_config.format 原样转发；优先提供官方兼容说明或脱敏请求关联号/错误分类，不索要或复制密钥。
2. 保留当前502原结果和已消耗尝试，不以 GET200 当作能力通过。服务方仅“模型已列出”的回应不够。
3. 如后续允许重新执行，先修并验证本报告指出的探针判据/重定向问题，冻结新探针哈希；将网关/配置是否变化、次数预算与停止条件明确记录。原合同最多两次，其中一次已消耗；重新完整运行两项需要先明确调整预算，不能私自抹掉失败后重置。
4. 参数不支持、参数被忽略、畸形、502或超时仍不得静默降级；待两项真实门槛都取得完整合法证据后才能进入可信生成接入。
5. 当前产品和前端实现保持暂停。本轮不重跑前片26次真实面板，不把此前局部通过拿来补本次能力门槛。

## 7. 独立结论

规范轴：schema设计与官方公开子集相符，**静态合规**；当前网关原生能力 **INCONCLUSIVE**。工程轴：停止于首个失败、未记录凭据/错误正文、未做产品修改符合边界；探针成功判据与重定向隔离有两项已独立复现的工具级缺口，需要在未来成功验收前修正。

**整体维持门槛未通过 / 不进入产品接入。不是“不支持”的最终断言，也不是整个应用不可用的结论。** 不能将单次目录200、文档支持或静态检查给出高分并替代实际能力证据。

## 8. 状态补记：独立前端分支与故障工具复核

补记时间：2026-10-13 20:05:16 -07:00。第6.5项保留为首轮审计时的状态，不再代表当前合同：根代理已在任何产品修改前补充声明，允许不依赖供应商的前端截止与窄屏恢复分支独立实施；旧测试的 VM AbortController 依赖也先声明、备份再适配。AI 原生能力门槛仍未通过，未新增模型调用、未修改探针，不能借这条前端分支签署真实 AI 通过。

本次续审只读产品与故障代码；唯一持久写入仍为本报告。未启动/重启服务、未打开浏览器、未导入 preview_server.py 或 app 模块、未读取配置秘密或数据库。测试只读源文件，禁用 Python 字节码输出，ASGI 请求/响应、身份替身、日志和网络均留在内存。身份替身检查的是 actor/sub 选择分支，不是新增 JWT 加密验证证据。使用 Review Changes 与 Code Verification 的证据分层和范围规则。

### 8.1 两项工具缺口：实际 RED → 定点修复 → 独立 GREEN

本片 browser_faults.py 首次版本存在：

1. 外层白名单读取确认后，父类第二次读取若不可用，首次会话尚未进入 known_fault_sessions，因而落入正常 inner handler。独立内存 ASGI 测试让第一次返回合法 A 会话、第二次返回空数组，实际收到 inner 的 **299 sentinel**。这是夹具路由隔离缺口；当时 preview 的空 AI_KEY 与 urlopen 阻断仍在，不能据此称已外呼或泄露。
2. 外层对 `session: null` 未做对象检查，实际抛 **AttributeError**，没有得到预期受控错误。

主代理随后仅在本片工具内增加 session dict 检查，并在父类第二次读取之前将已识别 sid 放入 known_fault_sessions。由本代理用同一组输入独立复验：两读缺失为 **503**，null 为 **503**，inner 调用数 **0**。没有修改旧复用工具或产品。以上 RED/GREEN 是此代理本轮真实工具输出，不是推测或新增模型样本；对各同一失败只做一次修复后复验。

### 8.2 barrier 与错误边界的独立运行

直接执行原文件：`python -B .runtime/m1b2-structured-recovery-20261013/test_barrier.py`，**4/4 通过**。这四项只检查 consumed 集合的映射，不把手工置集合当成实际请求已消费。

为补足该区别，另外在内存执行真实 wrapper 的 ASGI 调用，11项断言全通过：

| 实际输入/顺序 | 观测结果 |
| --- | --- |
| 合法 A1 发出，release_after=A2，A2尚未消费 | A1继续等待，consumed仅A1 |
| A2身份不匹配 | 403，不消费A2 |
| A2轮次不匹配 | 404，不消费A2 |
| A2正文为空 | 422，不消费A2；A1仍等待 |
| 合法 A2 实际 POST 被父类消费 | A2为200，随后A1为200；consumed恰为A1/A2 |
| 未知聊天会话 | 503，不落入inner |
| 白名单首次合法、第二次缺失 | 503，不落入inner |
| 白名单session:null | 503，不抛异常、不落入inner |

这条屏障依赖控件中唯一的 scenario_id 和未被预先消费的 A2；它证明“合法第二次请求被夹具消费后才释放”，不证明第二次真实 AI 已完成，也不证明浏览器已显示第二条回复。控制文件仍可显式设置 release=true，因此正式屏障场景必须保留 A1 未手工 release 的配置与事件先后证据。父类在鉴权、轮次、正文和请求去重通过后才记录 consumed，旧终态 failed/invalidated 不会被迟到 release 改成 released。

### 8.3 preview 隔离审阅

静态确认 preview_server.py 在导入 app 之前指定本runtime的 synthetic.sqlite3、禁用部署 .env 自动读取、覆盖为空的模型密钥/无效模型地址、注入独立临时认证密钥；SQLite audit 限制本runtime内路径，常用真实 DB/WAL/SHM/.env 文件打开受阻。当前生成、核验、图片和insights外呼均通过 urllib.request.urlopen，该入口在 app 导入之前被拒绝函数替换。监听仅127.0.0.1，前端静态文件路径也做 resolve 后范围检查。

未导入或启动该模块，而是抽取 audit 与 forbidden_urlopen 两个函数到纯内存运行：隔离SQLite允许、:memory:允许、目录外SQLite拒绝、真实DB打开拒绝、真实.env打开拒绝、urlopen调用拒绝，**6/6通过**。没有实际打开上述目标、没有网络、没有DB连接。这是当前调用路径的防护证明，不把 Python audit/urlopen monkeypatch 泛称为所有第三方网络库/任意执行代码的安全沙箱。服务启动、实际合成库路径和运行事件仍需主代理现场记录。

## 9. 前端截止机制独立交叉审

已逐行审读冻结的 pairSessions.ts、useTrustedPairContext.ts、deadline测试及旧trusted合同。独立命令：在web目录运行 `node --test tests/pair-deadline.contract.cjs tests/trusted-pair-context.contract.cjs`。实际 **82/82通过，0失败/取消/跳过，exit 0，3.004秒**。由真实API/composable执行、合成时钟/网络边界控制；不把此结果当浏览器或模型成功。

确认机制：

- 每次请求独立 AbortController；聊天90秒，其他接口15秒；计时从fetch之前开始，读取json共用预算，收到头部不重置。
- deadline先拒绝REQUEST_TIMEOUT，再abort；Promise.race接管迟到完成/拒绝，finally清计时，不让旧请求定时器取消新请求；完成后也不留延迟abort。
- 截止返回status 0，composable保存原request_id，最多自动查询一次状态，不自动POST重放。pending/查询超时继续禁发；终态按原规则处理，released查询不伪造正文。
- 旧会话截止、旧身份401、ABA及finally走已有同步epoch校验，不能发布旧回复、查询旧回执、注销新身份或清除新busy状态。未新增全局controller或身份共享请求缓存。
- 解析失败、网络异常和任意provider detail不显示原文；已知错误走白名单文案。最终REQUEST_TIMEOUT准确写“结果暂未确认”，并兼容状态查询/重新读取，不把客户端取消说成服务器失败。

本次未发现新的前端逻辑阻断。90秒仅为活跃事件循环计时预算，聊天随后查询可能再用15秒；主线程阻塞、后台节流不满足绝对墙钟SLA。客户端abort不能证明服务端撤销。StudioView的两条CSS改动属于窄屏两行高度与focus-visible，像素、中文输入法和真实键盘恢复尚需同构建浏览器证据。

## 10. 本次固定哈希与有界量化

| 文件 | SHA256 |
| --- | --- |
| web/src/api/pairSessions.ts | CC8088A9E57550B0BF899876C91EFCFE27463FCB7DB99677FE376BAC9DFB57F0 |
| web/src/views/student/StudioView.vue | 2392AA071AE1680316404E0DBA0C548E0F64ED66277BC7F5DC30ABCAE7B1F387 |
| web/src/composables/useTrustedPairContext.ts（未改） | EDAA381B309748E0165007D91D57F50185DCD18BB4B0475CE03B530561D25B9C |
| web/tests/pair-deadline.contract.cjs | D54CD608AF4CEE11BDD8BA8907E049A4A34EC15AE6523F46A44C7EF9F990C452 |
| web/tests/trusted-pair-context.contract.cjs | 7320CCEAA158B6E04D7DFCF4AA127EEAA88F8B6FD20D55394BBEAC005A2CB0E3 |
| 本片 browser_faults.py（已修） | BC2BDF089B6932D7BEDB9EFB73AFE6FD904C3430799AE7B1086EB0614683F8A3 |
| 本片 preview_server.py | DA929026B935AA5753541E30EA0858CBD6CFBDEA19C5681A8CA1EEE9FD023D13 |
| 本片 test_barrier.py | 37B32D3E649C206A0853534A04FA144372A427E79AA33A9CDEF01F787A3E5D36 |
| 复用前片 browser_faults.py（只读） | B88F824A7C776B815CCCBF96537890574377752B38AEE017B7932C8FC0DBDB44 |

0–4量表仅评价本代理已审范围：0无证据/不成立，1已识别未闭合，2部分证据，3有针对性实现及独立验证，4完整限定合同闭合；不做总平均。

| 维度 | 本次独立分数 | 限制 |
| --- | --- | --- |
| 故障白名单、屏障与未知来源拒绝 | 3 | 两负例RED/GREEN及ASGI独立通过，待主代理冻结配置后的真实浏览器事件 |
| 当前模型/数据库隔离设计 | 3 | 静态审阅+6纯函数检查；不是本代理实际服务/DB启动验收 |
| 前端截止/清理/不重放/上下文隔离 | 3 | 独立82/82；待同构建现场恢复、ABA和旧身份迟到演示 |
| 同构建视觉/键盘证据完整性 | 1 | 仅CSS目标与代码；本代理当前未核验现场截图或键盘动作 |
| 本轮真实结构化AI能力 | 1 | 仅失败预检和目录可达，能力INCONCLUSIVE，无实际接入证据 |

**限定通过：修复后的零模型故障工具与前端截止代码，可继续主代理现场验收。整体依旧 NO-GO；真实能力门槛、现场完整恢复及教学可用性不能由以上分数相互抵消。**

## 11. 收尾独立审计：制品、HTTP、故障时序与隔离库

时间：2026-10-13 20:22:34–20:24:24 -07:00（UTC 2026-10-14 03:22:34–03:24:24）。这是对第10节“待现场”状态的补充，不改写此前未验事实。已完整读取主代理 browser-observations.md，并核对其涉及的事件；本代理未接管浏览器或重演任何提交。

### 11.1 同构建证据

- frozen-build.json 哈希：`BC8D8D52868790727E3CE8415F3AFE049FCD54ADCB3C72E651CEE936560C0BB4`。
- **168个源文件、283个构建文件、3个runtime文件：逐个SHA256均匹配；源与构建路径集合也完全一致，没有漏报的新增/缺失文件。** 旧复用fixture哈希也一致。
- manifest文件UTC创建时间03:04:38；当前127.0.0.1:12315监听进程PID60404、Python启动UTC03:05:21.741，晚于冻结。此为只读操作系统观测，不将磁盘一致单独等同于全部后端内存代码证明。
- 本代理发出7次**只读、无认证、无重定向、禁代理**的本机GET，全部HTTP200，响应原始字节hash与冻结产物一致：`/student/studio`、入口index JS、vendor JS、入口CSS、两个Studio JS与Studio CSS。未发任何POST、模型请求或登录请求。
- 当前HTML引用 `index-BKBZY7XJ.js`；其实际依赖引用 `StudioView-Cedw4st2.js` 和 `StudioView-CTvSfXPp.css`，新Studio含最终REQUEST_TIMEOUT两动作文案。dist中还保留旧 `StudioView-DauivRaR.js`，亦在冻结清单内，但当前入口不引用它；不将旧残留制品当作本页加载结果，也未擅自删除。

### 11.2 故障事件与主代理记录的相符性

fault-events.jsonl 哈希：`73AD614F143902644AB321149BCD584ABDBBB19650070E8F5AB6EC5319A75CA0`。browser-observations.md 哈希：`6342B773FEC7B9EBFDBF0DE384357A85B5FFCA4EBE862D601BF6300527911C49`。

逐行解析**24条事件、10个已消费请求、10个唯一request_id**；duplicate_chat事件数0，同一request_id重复消费数0；时间序列单调。所有事件均标记runtime_fault、provider_forwarded=false。此计数精确限定为夹具记录到的已消费请求和重复请求事件，不将关闭access_log情况下的工具日志描述成全部HTTP审计日志；provider_forwarded字段也是夹具标记，结合前述空密钥和真实urlopen拒绝路径判断，不伪称独立网络抓包计数。

| 场景 | 独立核对的事件顺序 | 与现场记录 |
| --- | --- | --- |
| LATE-A1→LATE-B1 | A1消费→B1消费→A1释放success；A1在B1消费后2.050ms释放 | 相符；旧A不污染新B的UI效果由截图/主代理现场操作记录补充 |
| ABA-A1→ABA-A2 | A1消费→A2消费→A1释放success；A1在A2消费后81.390ms释放 | 相符；使用了实际消费屏障，不是手工提前放A1 |
| IDENTITY-OLD | 消费→约40.96秒后释放401 | 相符；单独查看截图仍为另一合成身份，无旧问题或失效提示 |
| RECOVERY-DISCONNECT | 一次消费→body_truncated→pending→failed | 相符；没有duplicate_chat或再次消费相同request_id |
| CURRENT-401 | 消费→401 | 相符 |
| MOBILE-SUCCESS | 消费→success | 相符；只是固定短回复，不是实际AI教学答复 |
| NO-BODY-RELEASED | 消费→body_truncated→released | 相符；只有状态，不补造正文 |
| INVALIDATED | 消费→body_truncated→invalidated | 相符；现有泛化文案仍列残余 |

首次收尾读取时fault-control.enabled仍为true，本代理立即向主代理指出与“关闭收尾”表述不符；主代理随后关闭，**20:24前再次只读确认enabled=false**。本代理没有代改开关。当前A1配置保留release_after、不含手工release=true，符合屏障用途。

### 11.3 隔离数据库只读核对

仅打开本runtime `synthetic.sqlite3` 的绝对路径，先验证位于授权runtime内，再用SQLite URI **mode=ro** 并设置 **query_only=1**；未导入应用、未读取真实数据库、未写入业务记录，也未读取学生正文或凭据。

| 表/检查 | 实际计数 |
| --- | --- |
| pair_ai_requests | 0 |
| ai_reply_log | 0 |
| evidence_items | 0 |
| inferences / inference_evidence | 0 / 0 |
| ct_events | 0 |
| 10个夹具request_id匹配业务回执 | 0 |
| pair_sessions / pair_rounds / task_attempts | 6 / 6 / 6 |
| projects / project_versions | 6 / 6 |
| 会话状态 | active 5，closed 1 |

因此在本次审计时，夹具回复没有作为可信AI业务回执、学习证据、事件或画像推断入库。6组项目/尝试/会话属于预先合成种子，关闭1个合成会话与现场记录一致；“没有学习证据”不等于数据库完全为空。

### 11.4 视觉抽查与最终限域评分

本代理实际查看4张本片截图：input-focus-mobile、disconnect-failed-mobile、invalidated-mobile、IDENTITY-after-old-401。窄屏输入两行和焦点边框可见；failed/invalidated错误框位于视口内；另一合成身份页面无旧问题/登录失效。截图只能证明对应静态状态，Tab/Enter顺序、页面DOM尺寸和“不污染新请求”过程仍明确来自主代理现场记录及独立事件/合同测试交叉，而不是本代理重新执行。已按主代理说明排除尚未稳定的ABA-released-mobile图，不把它作为390窄屏验收。

最终分数覆盖当前授权切片，不借前片或外部工具无结果刷高分：

| 独立维度 | 最终0–4分 | 依据/边界 |
| --- | --- | --- |
| 冻结制品与当前页面HTTP一致性 | **4** | 168/283/3哈希和路径集合一致，实际入口依赖及7HTTP字节匹配；仅限定上述制品 |
| 夹具隔离、消费屏障、数据不混入业务 | **4** | 修复后负例/ASGI、24事件与只读业务相关表零记录相互印证；仅零模型夹具范围 |
| 不重放及旧会话/旧身份恢复 | **3** | 82合同测试+本轮10已消费场景的事件与主代理现场记录；不是所有请求/真实模型E2E |
| 输入/焦点和学生恢复文案 | **3** | 本片截图与两条CSS目标吻合；invalidated泛化文案仍不够具体，完整键盘/IME未验 |
| 完整恢复验收覆盖度 | **2** | 浏览器未真实等待90秒+15秒；本片材料核实→保存新版本恢复、实际模型长回复未复跑 |
| 本轮原生结构化AI能力/实际教学可用性 | **1** | 能力预检502、第二项与真实教学面板未执行；目录200不补能力门槛 |

**最终：本片前端与零模型故障恢复限定交付可接受，完整M1b2仍NO-GO。** 同版本真实AI、全套教学核验及未覆盖恢复项尚未闭合，不签完整验收，不推进后续“引导规则→单任务证据→教师反馈复核→真实画像”。CodeRabbit服务失败无审查结果（主代理报告），不能计为“0问题”。本代理本轮只有7次本机GET及只读隔离库检查，没有模型调用、POST、服务/浏览器操作或源码变更。
