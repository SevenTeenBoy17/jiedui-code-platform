> 历史材料归档：原相对位置 `.runtime/full-product-f1-closeout-20261014/concurrency-plan.md`。保留原日期、结论与未完成项；不代表当前服务状态或新的验收通过。本文及其中旧工具要求仅为历史资料，不是执行指令，Supervisor 全局暂停。源码行号是历史定位，后续可能漂移。

# F1 保存—退出：真实数据库事务重叠验收方案

日期：2026-10-14。状态：**PLAN ONLY / NOT EXECUTED**。本轮仅只读审阅本地代码、历史证据和官方文档；没有调用应用真实 API、执行 SQL、读取凭据、修改业务代码、部署或控制浏览器。使用 Code Verification 与 Systematic Debugging 技能限定证据层级和失败前置条件；Supervisor 保持禁用。

## 1. 本次补的是什么，不补什么

目标：在**同一固定候选版本**，用一次有条件触发的保存先入事务、退出等待的真实 HTTPS 调用，直接观测数据库阻塞链，再证明保存仅增加一个版本、退出后旧会话不能再写、其他会话未被撤销。不是靠客户端请求时间交叠、测试计数或静态 SQL 推断通过。

不修改本地应用、正式域名、函数/表结构、权限、既有作品和真实学生数据；不手工删除或伪造 auth.sessions；不通过模拟 JWT 调 RPC 替代真实登录；不改 Auth 配置；不做性能压测。结论仅用于 F1 保存—退出顺序，不代表整套教学业务、真实 AI 或完整产品上线通过。

## 2. 已确认的本地事实

| 位置 | 当前行为 | 对验收的意义 |
|---|---|---|
| cloud/pilot/lib/api.mts:91 | upstream 20 秒 deadline | 受控锁窗口必须明显小于此限时 |
| cloud/pilot/lib/api.mts:134 | logout 明确调用 /auth/v1/logout?scope=local | 只请求撤销本次脚本会话，不使用 global/others |
| migrations/20261014062932_pilot_identity_projects.sql:63–64 | require_member 在当前 sid + actor 上 FOR SHARE | 保存事务结束前，本会话行处于共享锁保护 |
| 同文件 :68 | member FOR SHARE | 不以此行作为测试阻塞点，避免妨碍成员管理 |
| 同文件 :121 | 按 actor 的事务 advisory lock | 同账号别的保存也可能排队，必须隔离写入窗口 |
| 同文件 :157 | 项目 id + owner_id 的 FOR UPDATE | 可以只锁全新专用项目，使保存停在已取得会话锁之后 |

上述顺序来自本地冻结源码，执行前还须只读核对目标数据库实际函数定义及候选打包函数哈希。当前官方 Auth 源码的 local 分支在事务中删除指定 session；托管实例版本未在本轮核实，因此它只是设计依据，真实阻塞链仍是验收必需证据。

### 历史证据为何不够

- `.runtime/full-product-f1-20261014/save-logout-live-once.result.json`：旧候选 6acf65400ab57cd76a877fc5，HTTP 在途重叠 602.682 ms，logout 200 / save 401，重登录读回 v0。只证明退出先完成这一观察结果，不证明 DB 重叠。
- `.runtime/netlify-n1-20261013/logout-race.json`：更早一次受控锁未观测到保存等待链，根本未发送并发 logout。旧脚本随后错误执行“退出后写入”检查，实际会话仍有效而写入 v2；后来补了 confirmed-logout 前置，但原失败必须保留。
- 不直接重跑旧 `cloud/pilot/tests/live-logout-race.mjs`：其目标写死为正式域名，而且依赖外部手动命令提供锁证据，曾出现编排窗口错失。新验收必须由一个进程管理 HTTPS、独立数据库连接、条件等待和 finally 释放。

## 3. 前置条件：任一不满足便不启动锁实验

1. 根代理批准这**一次新项目行锁实验**和专用合成项目写入，并指定最终候选 URL / deploy ID / 内容与函数哈希。上一片最终记录为 `6acf6aaa5bb1695c051f32b3`，但不能未经再次核验直接当成本次目标。禁止正式主域名、重定向和任意 URL 参数。
2. 确认数据库为该应用独立试用项目；不接本地 SQLite，不扩展到其他 Supabase 项目。冻结实际 SQL 函数定义哈希，不创建迁移或临时函数。
3. 能建立**两个真正并行、会话固定的 PostgreSQL 连接**：H 用于仅锁新项目行；O 只读观测。优先直连或已验证的 session 模式连接。不得把两次无状态 execute_sql 调用默认为持久会话，也不得假设工具支持并行。仅有 HTTP、无法读锁图、没有合法连接渠道时，直接记录 `NOT_PROVEN / ENVIRONMENT_LIMITATION`，不重置密码或扩大授权。
4. 已有授权连接具备本次表锁与跨角色锁观测权限；先只读核对可见性。不能因观测缺失临时 GRANT、改角色或导出管理员密钥。连接凭据只由受控环境提供，不进入命令参数、代码、报告、query dump 或日志。
5. 使用确认属于纯合成的账号。**优先专门只用于本次验收的已获授权账号**；如继续合成 A，必须由根代理暂停该账号全部浏览器/脚本写操作，保证窗口内没有其他 A 写入或退出。成员和权限不变。因为业务 save 会持有 actor advisory lock，未经这个条件不能保证同账号非测试会话不受短暂等待影响。若只能通过新建账号隔离，先单独确认创建，不在本方案中擅自实施。
6. 真实密码登录建立 R（race）和 C（canary）两个**脚本自有且不同 sid** 的会话；只在内存解析 sid 作为关联标识，身份仍以 /me 和数据库目标行核对为准，不能信任未验证解码值授权。确认登录不会触发单会话策略撤销其他会话；如未知或无法确认，先换专用账号/停止，不改 Auth 配置。
7. 只创建一个带 experiment UUID 的全新合成项目 P，owner 必须是合成账号，v0/history0。H 的 SQL 使用同时匹配 id、owner、title、v0 的精确条件；返回不是一行即 ROLLBACK 停止。旧项目 8/13/14 及任何演示/学生项目不复用。
8. 所有连接和观察器在持锁之前就绪；完成小范围只读探测，识别 PostgreSQL 版本、会话超时、实际连接角色、backend_start、时钟；评估正常 HTTPS 时延。如果 8 秒受控窗口不足以完成观察，**不延长锁或盲试**，先调整验收环境。

## 4. 一次实验的事件状态机

唯一允许的因果路径：

`预检 → H 锁定新项目 P → 证明 S 等待 H → 发起本会话 logout L → 证明 L 等待 S 且 S 等待 H → H 回滚释放 → 保存/退出实际结果 → 旧会话拒绝 → 新会话读回 → 清理`

### A. 建立有自动释放上限的 H

H 使用事务，设置该连接/事务的短时限，不修改数据库全局设置：lock_timeout 500ms、statement_timeout 2s、idle_in_transaction_session_timeout 8s。执行参数化精确 SELECT … FOR UPDATE NOWAIT，只锁 P。一旦取得锁，控制器开始 6 秒 watchdog；正常收到有效链立即回滚，不等待固定 sleep。

H 只读行值而非改行，但 FOR UPDATE 是**会施加数据库锁的受控变更动作**，不能称为无影响只读操作。服务端闲置事务 8 秒终止是控制器失联的第二层兜底。H 不持续跑心跳 SQL，避免不断刷新 idle deadline。H 最后始终 ROLLBACK，不 COMMIT；不锁 auth.sessions/member，不用表锁或人工 actor advisory lock。

### B. 真实保存 S，并以数据库观测作为发 logout 的门槛

由 R 携带自己的 HttpOnly Cookie 对固定候选 `POST /api/projects/P/versions`，expectedVersion=0、随机唯一 requestId、短合成代码标记。请求保持 pending；不得 mock、重试或直接调用 SQL 保存函数。

O 每 100–200ms 取一次小范围观测，最多 6 秒总窗口。定位唯一被 H 阻塞的实际 PostgREST `pilot_projects` backend S：

- `pg_blocking_pids(S)` 包含 H；S 与 H 的 backend_start 在观察中不变；S active 且有有效 xact_start、`wait_event_type='Lock'`。
- 只回传 SQL 的**分类布尔值**（是否 pilot_projects），不回传 query 全文。保存 request ID、P、候选请求时间与唯一等待者共同归因；同时保存 S 的 virtualtransaction/backend_xid、受等待的 transactionid 及关系锁类型。
- 当前冻结流程中，S 等待精确项目行之前已经取得该 sid 的共享锁。仅见 auth.sessions 表级 RowShareLock 本身**不能**证明特定会话行锁，不能拿它独立计为通过。
- 若没看到 S→H，或者保存已经完成，不发送所谓“并发 logout”；先释放 H，转入真实状态核对和清理，结论 NOT_PROVEN。不得再执行没有 confirmed logout 的“退出后”写检查。

### C. S→H 已证后发真实退出 L

仍用 R 的同一 Cookie，向同一候选 POST /api/auth/logout。仅一次，明确对应 server 的 scope=local。O 继续观察链：

`L（Auth 的单会话 DELETE） → S（保存事务） → H（新项目行锁）`

至少保留两个相隔约 100ms 的合格快照，或一份有精确 transactionid 硬阻塞边的完整快照；要求：

- S→H 仍存在且保存 HTTP 未完成。
- L→S 出现在 pg_blocking_pids；L active、xact_start 有效、Lock 等待；query 仅在 DB 内分类为删除 sessions 的单会话形状，认证服务角色符合预检，且持有 auth.sessions 所需关系锁。
- 同一 transactionid 同时具有 S 的已授予 ExclusiveLock 与 L 未授予 ShareLock，可作为硬阻塞边补证；S→H 同理。不要要求 pg_locks 一定显示已授予 tuple lock，行锁通常以事务 ID 等待体现。
- L、S、H 必须是互异 PID，backend_start 固定，无 PID 复用；没有未知额外阻塞者。若认证实现不同导致 L 被其他事务阻塞、查询文本不可分类或 sid 无法可靠关联，就不是通过，立即释放 H。
- 核心证据是数据库锁依赖和同一观察窗口内的事务存在，不用本地时钟减数据库时间计算事务先后，不靠 HTTP 响应抵达先后来证明 commit 顺序。

观测 SQL 应限制至 H 的反向阻塞子图及已识别的 S/L，输出 `observed_at,pid,backend_start,xact_start,state,wait_event_type,wait_event,blockers,virtualtransaction,transactionid,mode,granted,relation_name,query_class`。不抓取无关用户会话/查询/请求体/令牌；会话标识持久化时仅保存哈希。pg_stat_activity/pg_locks 不是严格一致快照，故在 H 尚未释放时采集重复稳定链，并检查硬阻塞交易 ID，避免一次竞争性读误判。

### D. 立即释放，并验证实际结果

1. O 观察合格链后，H ROLLBACK；watchdog 取消；等待两次 HTTPS 自然结束（每请求上限 30 秒、上游仍为原 20 秒）。不得提前把网络超时当作没写入。
2. 预期 S 返回 200、versionNo=1；L 返回 200、remoteRevoked=true。任一错误都保留，不自动重试。网络响应先后可能乱序，不要求保存响应必须先到客户端。
3. O 只读确认 H 已无本次锁、S/L 对应交易已结束；已完成 logout 的 sid 不再是有效会话。只查询已知本次 sid，不遍历全部用户。
4. **只有确认 L 200 且 remoteRevoked=true 后**，显式用旧 R Cookie 再请求一次新的保存（expectedVersion=1、另一个 requestId、明确“不应保存”的合成标记），预期 401 SESSION_EXPIRED。没有已确认 logout 时跳过这一步，标记 NOT_RUN；不误制造 v2。
5. C 的 /me 仍 200，说明本次 local 退出没有撤销这个独立脚本会话；另用新密码登录 D 读取 P，预期 latest_version=1、history1、内容哈希完全等于 S，绝无后退出标记。正常版本计数与请求幂等记录均只增加一次。
6. C、D 只用各自 Cookie 做 scope=local 清理；R 若未确认撤销则在释放 H 后做一次明确标记的 cleanup logout，不能与并发 L 混淆。记录每次真实状态和清理未确认数。保持其他浏览器会话、角色/权限不动。

## 5. 意外影响、超时与退出约束

- 如果发现 H 或 S 令任何非本次允许 PID 等待，立即 ROLLBACK H，不继续实验，不杀对方连接；记录隔离失败。尤其留意同合成账号的其他 save 因 actor lock 等待。
- 不使用 pg_terminate_backend/pg_cancel_backend 对业务/Auth/PostgREST进程干预；只关闭自己创建的 H/O 连接。释放 H 不等于取消已发送保存，请求随后仍可能成功，必须读回真实结果。
- 任意异常都通过 finally 发 H ROLLBACK/关连接；观察连接失败时也不能继续持锁等待人工输入。关闭客户端无法确认释放时，以服务端 8 秒 idle 保护兜底，再做有限只读确认；无法确认则 CLEANUP_UNCONFIRMED。
- 若权限不足、观测窗口错失或冷启动超时，一次即停，不反复撞并发直到绿。原始失败记录和实验 UUID 保留。
- 专用项目和正常 API 写出的版本/审计留作证据，不重置序列、不删除历史、不手工改业务行。后续需要清除应单独列出精确合成对象请求授权。
- 非测试数据不主动读写；同库仍会有少量连接与锁观测开销，因此不作“物理零负载”的绝对承诺。无关事务一旦进入阻塞子图即按失败中止。

## 6. 判定与交付证据

| 门槛 | PASS 必须观察到 | 缺失时 |
|---|---|---|
| 同版本 | 固定候选 deploy/静态内容/函数与 DB 定义哈希匹配 | VERSION_UNVERIFIED |
| 真事务重叠 | 可归因的 L→S→H 稳定链 + 相应交易 ID 锁/有效事务 | NOT_PROVEN |
| 正常顺序 | S 保存 v1；L 远端撤销确认；P 只有一次有效新增 | FAIL 或 INCONCLUSIVE |
| 撤销后拒绝 | 仅在确认 logout 后，旧 Cookie 写入 401 且数据不增 | FAIL / NOT_RUN |
| 其他会话 | C 退出 R 后仍 /me 200，无非测试等待者 | ISOLATION_NOT_PROVEN 或 FAIL |
| 清理 | 自有 H/O 已释放，脚本会话全部清理，未确认数0 | CLEANUP_UNCONFIRMED |

全部满足才把 **F1_SAVE_FIRST_LOGOUT_OVERLAP** 标为 PASS。历史退出先完成 HTTP 分支可作为补充但版本不同需明确，不冒充本次同版本覆盖；该一次计划也不声称已遍历全部可达交错。

输出最少包含：执行脚本哈希、候选哈希、函数定义哈希、目标合成项目 ID、版本前后/内容哈希、每次 HTTP 开始/结束/状态/Netlify request ID、脱敏锁快照、H 释放证据、canary 状态、清理记录、实际分支与未覆盖项。严禁报告密码、Cookie、JWT、连接串、原始 query 或管理员密钥。

## 7. 执行前仍需根代理决定

本次尚未检查或取得任何 DB 连接凭据，也没有连接数据库验证权限。因此不能承诺现有环境一定可执行。请先确认：①允许上述单行短时锁试验；②使用专用合成账号或暂停 A 的其他写操作；③已有安全数据库连接和只读跨角色锁观测渠道。若这些不具备，应保留 NOT_PROVEN，不为了凑验收而改线上权限或放宽证据。

### 本轮 MCP 能力探测结论：已阻断，不执行真实竞态

根代理完成无行锁、无业务写入的能力探测：同一 functions.exec 内 Promise.all 发出两个 execute_sql；pg_sleep(2) 调用约 +5095ms 返回，数据库观察时间 12:27:43.777275；旁路只读 SELECT 约 +7857ms 返回，数据库观察时间 12:27:48.529852，旁路晚于前者结束。此结果来自根代理通报，本子代理未自行重跑。

这不能区分服务端串行、工具层串行、排队和偶然延迟，但已经不足以证明可在持锁期间可靠观测。因此本轮**不使用 MCP 行锁、不发真实保存/退出并发、不尝试加长锁或反复碰撞**。当前结论 `NOT_PROVEN / CONTROL_CHANNEL_NOT_VERIFIED`。

理论上，单个 execute_sql 内 BEGIN → 确切新项目 FOR UPDATE NOWAIT → pg_sleep(12) → ROLLBACK 可以构成有界持锁事务（需 statement/idle 超时保护并确认执行器事务语义）；但它没有可由外部脚本立即 ROLLBACK 的控制通道，且本轮旁路同时执行未证。不能采用“先锁住，盼另一调用赶上”的做法。优先补已受控、真正独立的直连/会话级 PG 持锁与观察连接；无需因此改数据库密码、取 service_role 或新增数据库权限。

同目录 `concurrency-controller.mjs` 仅为未来受控条件就绪后的准备脚本：默认不联网；并且 `LIVE_EXECUTION_ENABLED=false`，即使传 --execute 也会在任何 fetch / 凭据读取之前拒绝执行。没有偷偷用原生产脚本兜底。本轮只允许本地语法/纯函数检查。

准备脚本约定的脱敏观测字段：`observedAt`，行内 `pid,backendStart,xactStart,state,waitEventType,queryClass,sessionRelationLock,blockers,hardBlocks`。hardBlocks 必须由 pg_locks 同 transactionid 的 holder 已授予 ExclusiveLock / waiter 未授予 ShareLock 映射而来，不可以直接复制 pg_blocking_pids 伪造；后者还可能包含等待队列中的软阻塞。L→S→H 证据不足时脚本不会接受。脚本本身不执行 SQL、不控制锁，释放仍由根控制器负责。

本地准备检查已执行：node --check 退出0；默认运行显示 PREPARED_NOT_EXECUTED/networkCalls=0；6/6 纯函数断言验证候选域名接受、正式域名拒绝、保存硬阻塞链、缺少硬边拒绝、完整退出链、backend_start 不匹配拒绝；传 --execute 退出1并显示 BLOCKED_CONTROL_CHANNEL_NOT_VERIFIED/networkCalls=0/credentialsRead=false。这些只是准备脚本的静态/纯逻辑检查，不是数据库或真实并发验收。

## 参考依据（2026-10-14 查阅）

- [PostgreSQL 显式锁](https://www.postgresql.org/docs/current/explicit-locking.html)：共享行锁与删除/更新互斥，结束事务释放；FOR UPDATE 也可能触发行级物理写，不能称完全无副作用。
- [PostgreSQL pg_locks](https://www.postgresql.org/docs/current/view-pg-locks.html)：行锁通常表现为 transactionid 等待；官方建议用 pg_blocking_pids 辨识阻塞关系，视图采集存在一致性限制。
- [PostgreSQL 系统信息函数](https://www.postgresql.org/docs/current/functions-info.html)：pg_blocking_pids 提供阻塞 PID，不等同于业务请求追踪。
- [Supabase 退出作用域](https://supabase.com/docs/guides/auth/signout)：local 仅当前会话；access token 本身可能在过期前保持有效，因此本产品会话行复核不可省略。
- [Supabase Auth logout 源码](https://raw.githubusercontent.com/supabase/auth/master/internal/api/logout.go) 与 [会话模型](https://raw.githubusercontent.com/supabase/auth/master/internal/models/sessions.go)：当前 master 的 local 分支事务删除指定 sid，仅作设计参考，不能替代托管版本与现场锁证据。

## 8. 追加评审：单个有界持锁 SQL 自行观测，能否替代第二条 PG 连接？

### 8.1 修正后的结论

**原则上可以，是值得先评审的替代路径，但当前尚未证明现有 MCP 执行器能可靠完成该形态。** PostgreSQL 不要求必须用第二个连接读取锁目录；H 持有新项目行锁时，同一 H 连接可以读取其他 backend 的 pg_locks、pg_blocking_pids 和有权限的 pg_stat_activity。Supabase REST/Auth 的业务事务仍由自身连接执行，因此工具层两次 execute_sql 串行，并不必然妨碍“一个 SQL 调用内部自观测 + 外部 HTTPS”产生真实重叠。

前文“需要独立 PG 控制连接”应理解为**双连接控制方案的前置条件**，不再作为所有安全方案的绝对必要条件。无锁双调用探测仅说明该双调用路径未获证明，不能推出没有其他安全办法，也不构成向用户索取新数据库密码/密钥的充分理由。可先验证单调用的语义和结果传输；仅在确有需要、另行授权后才考虑新连接渠道。本轮仍不执行任何竞态、SQL 或应用 HTTPS，现有脚本保持关闭且不修改。

### 8.2 能成立的有限结构（伪流程，不是已验证可执行 SQL）

1. 外部控制器提前完成独立合成会话、新专用作品和目标版本的核验；提前把**至多一次保存和一次本会话退出**排入其自己的执行队列，不依赖 SQL 工具中途返回或人工消息往返。这里只安排候选交叠窗口，不假称已经知道 H 取得了锁。
2. 一次 execute_sql 请求内开启有界事务，设置本事务超时，精确匹配新项目 id/owner/title/v0 后 FOR UPDATE NOWAIT。记录 `pg_backend_pid()`、本 backend_start、实际取得锁后的 clock_timestamp()。匹配不唯一或已不是 v0就立即结束，不把别人的记录作为阻塞点。
3. 同一连接执行短轮询循环（例如每 150–250ms 一次，硬上限按实际持锁时间约 12 秒）。每轮刷新统计快照，再采集 H 的反向阻塞子图。先记录真正出现的 S→H，再记录同时仍存在的 L→S→H；只留下少量脱敏快照和交易 ID 硬边，不导出全库查询内容。
4. 看到两次稳定有效链时可提前结束；发现未知非测试阻塞者时也提前结束，记录隔离失败；到上限仍无链则结束并记录 NOT_PROVEN，不能延长窗口或补造证据。
5. 将有限大小的证据带出本次 SQL 调用，并确保事务结束释放锁。外部控制器随后核对保存/退出的真实响应、旧会话拒绝、重新登录读回和清理。只有这些后置条件全部闭合才可 PASS，单个锁快照并非整个验收结论。

重要区别：这个形态不再要求“外部看到 S→H 以后才发 logout”，因为外部可能直到 SQL 调用结束才收到采样结果。它改为**安排一次机会窗口，事后只接受数据库确实观测到的保存先入事务交错**。外部定时偏差可使测试无结果，但不能产生假阳性。若不同步到目标交错，本轮保持 NOT_PROVEN；绝不因为已经发过两个 HTTP 就算成功。

### 8.3 同一事务内必须解决的关键技术风险

| 风险 | 必须满足的控制条件 | 不满足时的判定 |
|---|---|---|
| pg_stat_activity 在同一事务内缓存当前查询信息 | 每次采样先单独调用 pg_stat_clear_snapshot()，再执行读取语句；不能只反复 SELECT，也不能假设 stats_fetch_consistency=none 已解决所有活动快照缓存 | STALE_OBSERVATION / NOT_PROVEN |
| now()/transaction_timestamp 在长事务内不前进 | 循环上限和采样时刻用 clock_timestamp()；仅用同一 DB 时钟度量持锁窗口，外部时间只记录请求到达区间 | DEADLINE_UNVERIFIED |
| 执行器内联/重排观察表达式 | 明确先刷新、后采样、再短 sleep 的依赖顺序；如用匿名 PL/pgSQL，按独立语句执行；如用递归 CTE 必须实际验证每轮 volatile 函数与快照更新，不凭SQL外观相信顺序 | SAMPLING_UNVERIFIED |
| 一条超长 sleep 不会采样 | 采用有界短循环，而非 pg_sleep(12) 后只拍一次；总窗口不超过原授权上限 | 未观测重叠即 NOT_PROVEN |
| 超时仅配置在查询内部，可能未覆盖当前语句 | statement_timeout 必须在观察语句开始前已在同一会话生效；同时设置短 lock_timeout，循环自有截止与工具总超时是额外防线，不相互替代 | 不启动实际持锁 |
| 匿名 DO 不直接返回结果集 | 必须先确认 MCP 对多语句 SELECT 结果/通知的保留方式，不能假设 RAISE NOTICE 一定完整返回 | EVIDENCE_TRANSPORT_UNVERIFIED |
| ROLLBACK 导致临时状态消失，或工具只返回最后一条命令 | 若用事务局部变量/GUC暂存观测，需明确证据 SELECT 在释放前如何被工具保留；若用单 SELECT 返回行，则需确认隐式事务结束释放。不能为返回证据新增永久表、函数、触发器或业务日志 | 不具备可采纳证据链 |
| 外部 save/logout 定时早于锁生效，或工具排队 | 只接受实际同一窗口完整 L→S→H；保存先完成、退出先拒绝保存、API冷启动错过窗口都不是本分支通过 | NOT_PROVEN，不自动重试 |
| API 与 MCP 实际没有并行 | 单调用自观测也不能凭空产生并发；后续允许的能力检查应验证 SQL 运行期间外部独立进程确能进行不变更状态的请求 | CONTROL_CHANNEL_NOT_VERIFIED |
| 同一连接自观测不是严格原子视图 | 持锁期间重复短采样，要求稳定 PID/backend_start、硬 transactionid 边与 pg_blocking_pids 同时一致 | 单一不稳定快照不算通过 |
| 权限使活动字段不可见 | 空值/隐藏 query 不能拿“没有反例”算通过；不临时提升角色或取 service_role | OBSERVABILITY_LIMITATION |

刷新活动快照后看到的 H 本人查询类别可能就是整个观察块，不应依赖 H 当前 query 内容来发现 H；H 可直接用 pg_backend_pid() 标识。S/L 的归因仍须依赖真实等待链、backend_start、来源角色和 SQL 的脱敏类别；仅发现某个 DELETE 或某个活跃连接不够。

匿名 DO 的本地变量可聚合少量 JSON，却不能直接像 SELECT 一样返回行。一个可研究的接口形态是“同一多语句事务中用局部状态收集 → SELECT 输出 → ROLLBACK”，但它能否返回 SELECT 的证据取决于 MCP 的多结果集实现，**尚未验证**。另一可研究形态是带明确依赖顺序的有界单 SELECT/递归 CTE，以结果行携带采样并在语句结束释放；这也需验证求值与超时语义，不能作为已写好可直接执行的方案。不要用人为抛异常携带大段证据作为首选传输，更不能让异常后的证据丢失被标成通过。

### 8.4 安全边界与验收逻辑不变

- 同一持锁连接也不能消除业务 actor advisory lock 对同账号其他写入的影响；仍需专用合成窗口，避免与根代理浏览器保存同时进行。
- 不锁真实会话行、不伪造 claims、不修改 Auth、不建永久对象；业务写只允许专用新项目的一次保存及有 confirmed logout 前置的拒绝检查。
- 有界循环只能在检测到隔离问题后尽快结束，不能承诺零负载；实际总持锁时间必须落盘并证明在授权上限内。SQL 执行异常/工具响应丢失时，必须确认事务释放，不能把 HTTP 超时当作取消数据库事务。
- 保存和退出都可能先后成功、退出先拒绝保存，或因时限形成未知结果；报告逐项记录实际状态。只有**真实 L→S→H + 保存 v1 + 退出确认 + 退出后拒绝 + 重登读回 + 自有会话清理**全部满足，才通过保存先提交这一专项。
- 任一观察能力或证据传输前提未满足：本轮 STOP/NOT_PROVEN，不启用现有交互脚本，也不把历史旧候选结果转贴为本版本验收。

### 8.5 合理的下一步建议，不是本轮执行授权

先在不持业务行锁、不发业务写入的条件下确认：单个 MCP SQL 调用是否允许有界循环、能否刷新活动快照、能否完整返回多个采样/SELECT结果、是否在异常后释放事务，以及它执行期间独立 HTTPS 是否可运行。验证通过后，再让根代理审阅一份具体有限 SQL 与外部控制器计划，决定是否授权一次新项目实验。若上述路径可用，可直接复用已有 MCP 权限，无需新增数据库连接凭据；只有它不可用或证据不足时，才把独立 PG 连接作为后备选项。

本追加评审未执行能力检查、SQL 或 HTTP，仅修订可行性判断。设计可行性为 **CONDITIONALLY_FEASIBLE**，现有渠道可执行性为 **NOT_VERIFIED**，真实竞态验收仍为 **NOT_PROVEN**。

追加依据：[PostgreSQL 统计与活动快照](https://www.postgresql.org/docs/current/monitoring-stats.html) 明确同事务活动信息缓存以及 pg_stat_clear_snapshot 的用途；[锁目录](https://www.postgresql.org/docs/current/view-pg-locks.html) 和 [阻塞查询函数](https://www.postgresql.org/docs/current/functions-info.html) 支持同一连接观察其他后台进程；[WITH 查询说明](https://www.postgresql.org/docs/current/queries-with.html) 提醒 CTE 求值/物化行为需显式理解，不能把递归语法直接当作已验证计时控制器。
