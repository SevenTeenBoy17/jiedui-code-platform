> 历史材料归档：原相对位置 `.runtime/full-product-f1-closeout-20261014/f2-readiness-audit.md`。保留原日期、结论与未完成项；不代表当前服务状态或新的验收通过。本文及其中旧工具要求仅为历史资料，不是执行指令，Supervisor 全局暂停。源码行号是历史定位，后续可能漂移。

# F2 就绪审计：教师发布 → 学生接收 → 教师读取任务原件

审计日期：2026-10-14。性质：独立只读源码核验与下一切片设计，不是实施、测试通过或生产许可。仅本文件属于本次写入白名单；没有读取凭据、业务数据库，没有启动服务、真实模型调用、部署或远端写入。Supervisor 保持暂停。

使用 Explore Codebase、code-verification 技能。图谱返回与 CX 不对应的历史模块，因此弃用该图谱，以当前文件为准。以下“现有”均指本地当前源码；“建议契约”尚未实现。F1 关闭证据由主任务单独汇总，本审计不重开或替代该验收。

## 1. 决策摘要

1. F1 原 Vue 外壳 + N1 私有作品保存，不等于完整产品。既定 F1→F6 顺序成立；F2 的任务身份和授权是可信 AI、证据链、反馈复核的前置，不能跳到主域名替换。
2. 下一最小可交付建议是 **F2-a：一个真实 Python 练习、一组明确授权的合成班级、一个指定学生、代码与伪代码固定版本、教师读原件**，复用原 Classes / Resources / Tasks / Workbench / IDE。它是 F2 第一个纵向闭环，不是全部资源类型、全部教师页面或完整产品完成。
3. 不能照搬旧 SQLite resources 授权：旧路由多数只检查教师角色，班级/名册/推送列表是全局的；空推送范围还有全平台群发语义。必须先明确教师可管理的班级与可分配学生名册，再迁移。
4. 现有代码没有“任务目标 → 作品 → 固定作品与设计版本 → 教师原件”的服务端关系。只移植推送、调用保存、把完成数加一，不能满足 F2。
5. C/C++ 安全执行、真实可信 AI、完整证据/反馈/画像/数据权利仍是最终发布门槛；它们可分片完成，不能以功能不可用提示永久替代用户要求的完整产品。

计划依据：[纠偏方案 F1–F6](../../deployment/2026-10-14-完整产品上线纠偏方案.md#L64)。本次不重新批准缩减最终范围。

## 2. 已核实的断点及其直接后果

| 当前源码证据 | 实际含义 | F2 处理要求 |
| --- | --- | --- |
| [resources.py:190](../../../server/app/resources.py#L190)、[store_resources.py:367](../../../server/app/store_resources.py#L367) | 教师角色可列全部班级和全局 roster；created_by 有存储但列表未按它过滤 | 角色检查之外，每次读写验证教师班级授权；名册只能是可分配的指定学生 |
| [resources.py:312](../../../server/app/resources.py#L312)、[PushSheet.vue:50](../../../web/src/components/resources/PushSheet.vue#L50) | 未指定 class_ids/student_ids 时推送给 store.list_students() 全体；“全部学生”UI 正是传空数组 | 云端拒绝空范围；显式列出已授权接收者，不保留全平台兜底 |
| [store_resources.py:139](../../../server/app/store_resources.py#L139)、[store_resources.py:548](../../../server/app/store_resources.py#L548) | pushes 保存资源 ID、创建者和期限；targets 保存接收人/read/done；不保留任务班级关系、资源版本、作品版本、提交原件 | 发布时固化资源内容/版本、班级范围和去重后的接收目标；新增受约束的任务作品与提交关系 |
| [WorkbenchView.vue:209](../../../web/src/views/student/WorkbenchView.vue#L209)、[WorkbenchView.vue:245](../../../web/src/views/student/WorkbenchView.vue#L245) | 同资源可能回退匹配别的 target；打开 IDE 仅传 taskId/resourceId/taskTitle 查询参数 | 任务身份只认服务端 target_id；不能以 URL 标题/资源 ID 作为授权或内容来源，同资源重复任务也不得串线 |
| [IdeView.vue:54](../../../web/src/views/student/IdeView.vue#L54)、[IdeView.vue:711](../../../web/src/views/student/IdeView.vue#L711)、[IdeView.vue:1269](../../../web/src/views/student/IdeView.vue#L1269) | 任务说明尚未接入；taskId 来自 query 或 A-03 示例；saveVersion 只保存个人作品 | 从目标详情加载真实说明/初始代码；任务作品绑定与保存版本必须服务端可验证 |
| [projects.ts:68](../../../web/src/api/projects.ts#L68)、[IdeView.vue:625](../../../web/src/views/student/IdeView.vue#L625) | 原 API 有 design(type,payload)，但云端明确 NOT_AVAILABLE；分析材料仍有本机路径 | F2-a 至少接通当前伪代码的真实版本化存储/读取，不把本地成功提示当云端原件 |
| [NewResource.vue:84](../../../web/src/components/resources/NewResource.vue#L84) | 教师新建练习仅送 title/summary/language/difficulty/ct_dims，未送 statement/starter_code | 在原弹窗补真实任务说明与起始代码；不能用只有标题的资源验收“教学任务发布” |
| [store_resources.py:161](../../../server/app/store_resources.py#L161)、[store_resources.py:193](../../../server/app/store_resources.py#L193) | 学生公开投影含全部 test_cases，hidden 标志未过滤；只排除 reference_solution；列表还包含非 archived 的 draft | 学生只收已分配、已发布的资源快照；隐藏测试答案与参考解答必须不返回，教师草稿不可通过 ID 探测读取 |
| [store_resources.py:390](../../../server/app/store_resources.py#L390) | 旧学生 ID 规范化会加 stu- 前缀 | 云端使用可信 auth.uid()/members UUID，不复用旧字符串变换，不从客户端 metadata 接受角色/归属 |
| [pilot api.mts:70](../../../cloud/pilot/lib/api.mts#L70)、[pilot migration:105](../../../cloud/pilot/supabase/migrations/20261014062932_pilot_identity_projects.sql#L105) | 现有函数白名单只覆盖认证与个人作品；save 精确允许 id/code/blockState/expectedVersion/requestId | 新任务/设计契约要明确新增；给旧请求偷偷加 targetId 并不能建立关系。保持个人作品 owner-only 读取，不能改成 teacher 可读全体 |

## 3. 教师现有 15 个业务页面的实际 API 清单

口径：原路由中教师教学 7 页、研究 8 页；排除外壳、重定向。下表是页面及其子组件调用，不代表这些 API 已迁云。路径前缀写全，`{id}` 为参数。源路由：[router/index.ts:57](../../../web/src/router/index.ts#L57)。

| 页面与当前文件 | 真实调用路径/方法 | 归属 |
| --- | --- | --- |
| `/teacher/teaching/today`；TodayView / [useTeacherHome.ts:27](../../../web/src/composables/useTeacherHome.ts#L27) | GET `/api/teacher/home?class_id=`；学生侧栏还读 GET `/api/ct/summary?user_id=`、`/api/insights/recommend/{uid}`；预警操作含 DELETE `/api/teacher/data/{uid}` | 首页数据/证据主要 F4–F5，删除属于数据权利，不纳入 F2-a |
| `/teacher/teaching/students`；[StudentsView.vue:151](../../../web/src/views/teacher/teaching/StudentsView.vue#L151) | GET `/api/teacher/home?class_id=`、`/api/resources/classes`；同学生侧栏 | 当前前端按 student_ids 交集筛选不能替代服务端授权 |
| `/teacher/teaching/classes`；[ClassesView.vue:157](../../../web/src/views/teacher/teaching/ClassesView.vue#L157) | GET/POST `/api/resources/classes`；PUT `/api/resources/classes/{id}/students`、`/group`、`/socratic`；DELETE `/api/resources/classes/{id}` | F2-a 做建班/范围名册；研究分组与 AI 锁待相应切片，未接通操作明确禁用 |
| `/teacher/teaching/resources`；[ResourcesView.vue:141](../../../web/src/views/teacher/teaching/ResourcesView.vue#L141) | GET/POST `/api/resources/exercises`、`/videos`、`/sets`；DELETE exercise/video；弹窗 POST `/api/resources/push` | F2-a 先 exercise；video/set 保留未接通提示，不伪造空数据成功 |
| `/teacher/teaching/tasks`；[TasksView.vue:150](../../../web/src/views/teacher/teaching/TasksView.vue#L150) | GET `/api/resources/pushes`、`/classes`、`/exercises`、`/sets`、`/videos`；POST `/api/resources/push` | F2-a 核心；现有表格无提交原件入口，需最小追加 |
| `/teacher/teaching/live`；[LiveView.vue:117](../../../web/src/views/teacher/teaching/LiveView.vue#L117) | GET `/api/teacher/live?window=&class_id=`、`/api/resources/classes`、`/api/learner/rounds?room_id=`；POST `/api/learner/rounds/open`、`/rounds/{rid}/exit`；GET `/rounds/{rid}/snapshot`（后三者均 `/api/learner`） | F4 课堂证据/轮次，不以活动数冒充能力 |
| `/teacher/teaching/observe`；[ObserveView.vue:200](../../../web/src/views/teacher/teaching/ObserveView.vue#L200) | GET `/api/research/studies`；GET `/api/obs/windows?study_id=&room_id=&round_index=`；POST `/api/obs/window` | F4–F5；不默认增设键鼠流或连续截图采集 |
| `/teacher/research/study`；[StudyView.vue:294](../../../web/src/views/teacher/research/StudyView.vue#L294) | GET/POST `/api/research/studies`；DELETE `/studies/{sid}`；POST `/studies/{sid}/{next_action.key}`、`/withdraw`、`/probe/open`、`/probe/close`；GET `/studies/{sid}/probe`（均 `/api/research`）；GET classes；POST `/api/teacher/consent/batch` | F5；状态机、同意/撤回不可用静态列表顶替 |
| `/teacher/research/study/{sid}/report`；[StudyReportView.vue:204](../../../web/src/views/teacher/research/StudyReportView.vue#L204) | GET `/api/research/studies/{sid}/report`、`/export?format=wide|json` | F5；报告与下载必须同授权口径 |
| `/teacher/research/analysis`；AnalysisView / useTeacherHome | GET `/api/teacher/home?class_id=` | F5；真实口径与证据，不是演示雷达 |
| `/teacher/research/export`；[ExportView.vue:44](../../../web/src/views/teacher/research/ExportView.vue#L44) | GET `/api/research/export?format=json|csv` | F5；原请求是 raw fetch/Bearer，须接云端认证/失败状态 |
| `/teacher/research/profiles`；[ProfilesView.vue:181](../../../web/src/views/teacher/research/ProfilesView.vue#L181) | GET `/api/insights/class`、`/student/{uid}`、`/recommend/{uid}`；GET `/api/ct/report?user_id=`、`/api/learner/interaction?student_id=`；POST `/api/resources/push` | F4–F5；洞察不可越班读取，推送复用 F2 授权 |
| `/teacher/research/cases`；[CasesView.vue:128](../../../web/src/views/teacher/research/CasesView.vue#L128) | GET/POST `/api/resources/cases`；DELETE `/api/resources/cases/{id}` | F5 教学案例 |
| `/teacher/research/rubrics`；RubricsView / useTeacherHome | GET `/api/teacher/home?class_id=`；量规本地定义 | F5；不能因本地文字可显示就判完整业务通过 |
| `/teacher/research/report`；[ReportView.vue:176](../../../web/src/views/teacher/research/ReportView.vue#L176) | GET `/api/insights/class`、`/api/resources/pushes` | F5；不能把全局聚合直接迁成云端教师数据 |

上述主 API 定义：[resources.ts:51](../../../web/src/api/resources.ts#L51)、[teacher.ts:30](../../../web/src/api/teacher.ts#L30)、[learner.ts:64](../../../web/src/api/learner.ts#L64)、[study.ts:78](../../../web/src/api/study.ts#L78)、[obs.ts:77](../../../web/src/api/obs.ts#L77)、[insights.ts:39](../../../web/src/api/insights.ts#L39)。

## 4. F2-a 最小可执行契约（明确区分保留和新增）

### 4.1 复用原路径，迁移必要接口

下表请求体为现有字段；云端变更还应增加 `requestId`、严格字段/尺寸校验和一致错误合同。ID 从服务器返回，不靠客户端猜测。

| 步骤/前端入口 | 现有 API 与关键字段 | F2-a 必须新增的语义 |
| --- | --- | --- |
| 教师原班级页 | GET `/api/resources/classes` → `{items:[{id,name,grade,note,student_ids,size,updated_at}],roster:[{id,name}]}`；POST 同路径 `{name,grade?,note?}` → `{id}`；PUT `/{cid}/students` `{student_ids:string[]}` → `{size}` | items 只含该教师管理的班级；roster 只含经可信流程分配给他的试用学生 UUID；全量替换名单必须原子、校验每个成员，不能通过填入任意 UUID 把别人纳入读取范围；可增加 rosterRevision 防覆盖 |
| 教师原资源页/新建弹窗 | GET `/api/resources/exercises?q=&language=&difficulty=`；POST 同路径；GET `/{eid}` | 首片支持真实 `title,summary,statement,language:'python',difficulty,starter_code`；学生投影不含 reference_solution/隐藏测试答案；teacher draft 与 published 分开。发布固定 resourceVersion（或不可变快照），不能后改题干影响已发任务 |
| 教师原任务页 | POST `/api/resources/push` `{res_type:'exercise',res_id,class_ids,reason,required:0|1,due_at:秒|null}` → `{id,targets}`；GET `/api/resources/pushes` → PushRec | 显式非空且全部有权的 class_ids；跨班学生去重；服务端填 created_by；同事务写任务、范围、资源快照、目标。响应增 `resource_version,class_ids`；列表只含有权任务，绝不列全局 |
| 学生原首页 | GET `/api/resources/my/tasks/chain` → `{items:[{target_id,title,kind,res_id,done,required,due_at}]}`；GET `/api/resources/my/pushes` → `{items,unread}`；POST `/my/pushes/{targetId}/read` `{}` | target 对当前 auth.uid；只按 target_id 关联，同资源的两次发布不串联；重复 read 是安全幂等，不从 URL 接受学生 ID |
| 学生原 IDE 个人版本保存 | GET `/api/projects/{pid}`；POST `/api/projects/{pid}/versions` `{code,blockState,expectedVersion,requestId}` → `{versionNo,changed}` | 沿用已验收的 owner-only、409 冲突、稳定 requestId/相同正文重试与晚回包保护；任务工作区加载须先取得可信绑定。不要让教师通过此个人接口读草稿 |
| 原 IDE 伪代码 | 原 POST `/api/projects/{pid}/design` `{type:'pseudocode',payload}`；GET 同路径 | 云端接入版本化伪代码，建议 POST 增 `expectedDesignVersion,requestId` → `{designVersionNo,changed}`；GET → 每类当前版本号/内容；原函数签名和 UI 应返回并消费真实版本回执，不能仅保留 Promise<void> 而丢失版本归属。首片 flow 未实现则明确禁用，最终仍待补齐 |

时间仍按现有秒级时间戳，后端应明确截止时间的时区与过期策略；不能依赖教师电脑本地时区隐含定义。原 UI 目前将选定日期解释为本机当天 23:59:59：[TasksView.vue:176](../../../web/src/views/teacher/teaching/TasksView.vue#L176)。

### 4.2 闭环缺失接口：以下均是建议的新契约，不是已有实现

只增加完成“教师读原件”所需能力，不借此重写全部资源/教学域。

| 新接口建议 | 请求/返回最小字段 | 原子约束/页面接入 |
| --- | --- | --- |
| GET `/api/resources/my/pushes/{targetId}` | 返回 `{target_id,push_id,resource_version,resource:{id,title,statement,language,starter_code},required,due_at,project_id}` | 目标必须属于当前学生；ID、题干/初始代码来自保存的快照，覆盖 query 展示数据；未知/他人目标一致 404 |
| POST `/api/resources/my/pushes/{targetId}/work` | 请求 `{requestId}`；返回 `{target_id,project_id,created}` | 首次原子创建 actor-owned 作品并绑定该 target，语言/标题/初始代码由任务快照派生；已有则返回原绑定，不创建重复作品。首片不接受任意 projectId，降低挪用他人/其他任务作品风险 |
| POST `/api/resources/my/pushes/{targetId}/submissions` | 请求 `{projectId,versionNo,designVersionNo,requestId}`；返回 `{submission_id,target_id,project_id,version_no,design_version_no,submitted_at}` | 明确“交给教师查看”动作，先成功保存代码和伪代码，再提交已存在且属于绑定作品的不可变版本。服务端固定 actor、哈希、时间、资源版本，原子更新 done_at；完成只表示提交，绝不代表正确/能力/教师复核 |
| GET `/api/resources/pushes/{pushId}/submissions` | `{items:[{submission_id,target_id,student_id,student_name,version_no,design_version_no,submitted_at}]}` | 原 TasksView 任务行增加“查看原件”；只返回该教师当前授权班级内且归属该任务的提交元数据 |
| GET `/api/resources/pushes/{pushId}/submissions/{submissionId}` | 返回固定的 `submission_id,target_id,resource_version,project_id,version_no,code,blockState,design_version_no,pseudocode,content_sha256,submitted_at` | 验证 push/submission/target/project 全链一致及当前教师班级权限；只读原件面板，不自动执行学生代码。学生后来保存 vN+1，旧原件仍保持 vN，不能动态读 latest |

说明：用新的“提交”边界避免把学生个人工作草稿默认暴露给教师；这是最小授权设计建议。若产品明确要求教师查看未提交进行中的草稿，须另外定义授权/告知边界，不能借 teacher 角色放开所有 `/api/projects/{id}`。

最小持久关系应具备：教师班级授权、受限可分配学生名册、class_members、资源版本/发布快照、push 与 class 的关系、targets、target-work 唯一绑定、设计版本、不可变提交引用。可以复用现有项目/版本表；这里不强制物理表数量或另建大型组织系统，但不能省略这些关系约束。

### 4.3 不可跳过的授权和失败规则

- 每次函数/RPC均重新确认有效登录 session、members.active 与可信角色。教师权限是“当前被授权的班级/任务”，不是 metadata 里的 teacher，也不是只能在网页上隐藏按钮。
- 学生只能读自己 target、写自己绑定作品、提交自己真实已保存版本。targetId、projectId、versionNo、designVersionNo 交叉拼装必须拒绝且不写入。
- 教师只能给自己可管理班级发布自己有权使用的资源；带一个无权 class_id 的请求整体拒绝，不能部分发送。学生名单分配须有受限名单依据，否则教师能把任意 UUID 加班后获得越权读取。
- 发布接收者是发布时的去重快照；后来加班不应自动获得历史任务。教师班级授权/账号被撤销后应立即不能继续读原件。移除学生的历史可见性规则须在实现前固定，不能由 SQL 偶然连接行为决定。
- 个人作品所有权不放宽；教师原件通过单独的提交授权读取。公开 Supabase 入口/RPC 同样执行授权，private schema/table 权限保持封闭；只保护 Netlify HTTP 层不足。
- mutating requestId 按 actor + 操作/正文指纹幂等；同 key 同 body 返回原回执，不重发目标、不重复作品/设计/提交；同 key 异 body 409。网络超时视为结果未知，原 key 查询/重试，不自动另造新 key。
- 401/撤销、403/未邀请、404/跨范围、409/冲突、429/限额、5xx/未知保存结果各自保留可恢复状态；失败不能显示“已提交”。旧 markDone `{}` 不再作为该编程任务的交稿证明；不能把 read/done 次数转换成 CT 分数。

### 4.4 最小实施边界与验收

实施建议依次完成：先云端 ACL/事务与 HTTP 契约 → 原班级/资源/任务三页接入 → 学生首页及 IDE 可信任务/设计/提交 → 原任务页原件面板。每次实际实施前另列白名单；本审计不授权这些修改，也不要求重画原页面。

预计需要的实际区域：`web/src/api/resources.ts`、设计的 projects 适配、上述原 Vue 页面/组件、云端资源/任务 handler 与 PostgreSQL migration、对应测试。保持本地分支行为；不要把 Python SQLite 模块直接 import 到工具脚本（其模块初始化会访问/写库）。不迁真实学生本地数据库。

| 验收层 | F2-a 必需证据；任一缺失不能称闭环通过 |
| --- | --- |
| 数据/事务本地回归 | 授权矩阵；不发空范围/无权班；重复名单去重；同 key 三种重试/冲突；保存/提交原子性；代码及设计版本关联；teacher 不能读私人草稿；隐藏答案不出学生投影 |
| 真候选 HTTP/API | 使用明确授权的合成教师 T1、学生 S1、其他班学生 S2、无权教师 T2，真实发布→接收→保存代码/伪代码→提交→T1 固定原件；S2/T2 跨范围全部拒绝且无数据/行数变化；撤销/会话失效拒绝；直接 RPC 同样隔离 |
| 双角色浏览器 | 原页面发布真实说明；S1 首页看到指定任务并打开正确内容；保存/刷新伪代码和代码仍在；T1 原任务页读取确切版本；S1 后改下一版本，教师旧提交原件不漂移；同一资源再次发布也不串任务 |
| 异常/恢复 | 保存 409、断网后原 key 重试、设计失败不得提交、重复点击仅一份提交；任务切换/退出未保存确认；账号换人后旧请求不污染新身份/草稿；无权/空班/已撤回的 UI 提示真实 |
| 交付证据 | 同一不可变候选 build/hash，API 与浏览器证据绑定同版本；真实账号不放报告，synthetic 数据清单/残留明确；不能用 stub/local 单测代替真实云端证据 |

上述四个身份可用明确许可的现有合成试用账号配置，不意味着本审计获准创建账号、升级套餐或写线上数据。F2-a 暂不接 AI、评价分数、视频/集合、研究/导出/擦除；保留“未接通”状态，不以首片完结宣布整个 F2 或完整产品完成。

## 5. F1→F6 不能被页面截图/接口数量替代的真实门槛

| 切片 | 真实业务门槛 | 不能拿什么替代 |
| --- | --- | --- |
| F1 | 当前候选原登录/双端外壳/深链/学生保存与运行基础；补齐既有退出竞态与未保存稿保护 | 全量静态文件发布、测试数量、教师空外壳不能证明后端业务可用；本审计不判定本轮关闭结果 |
| F2 | 可信班级/任务/资源身份及本审计的双端原件闭环；其他班不可读 | 全局教师角色、URL taskId、标记 done、教师只见完成数 |
| F3 | 既定模型真实生成及核验；同版本浏览器回执；权限/过期/撤回/版本变化后不发布；幂等重试不重复计证据 | mock 回复、仅配置了 key、只成功调用模型但未核验/未发布正确上下文 |
| F4 | 分析/设计/运行/测试/反思逐项真实原件；教师反馈→学生再做→教师复核；每条判断回到任务/版本/证据 | 本地草稿、活动计数、只有雷达；“提交”不等于教师已复核 |
| F5 | 作答/发布结果权限、成长三页真实来源、班级/课题授权、可用导出、有效同意与撤回/数据权利闭环 | 静态研究页、演示数据、全局聚合、按钮可点但无实际下载/删除/撤回生效 |
| F6 | 同一候选的两角色逐页、跨账号、刷新/异常/恢复；真实 Python/C/C++/可信 AI；资源/CSP/数据库/运行环境；限定账号交付；可回退的最终域名替换 | 汇总所有旧候选绿测、仅单人演示、用“未接通”长期删除承诺功能。达到前仍是完整产品 NO-GO |

F3→F4→F5 的业务顺序保持不变；安全执行可行性应提前验证，不能等 F6 前最后一刻才发现托管边界不成立。

## 6. Netlify 原生函数与运行环境：当前事实、门槛、待决策

### 6.1 C/C++：当前不是安全云端执行实现

- [run.py:15](../../../server/app/run.py#L15) 对登录用户直接调用 executor，未绑定任务或作品版本。
- [executor.py:24](../../../server/app/executor.py#L24)、[executor.py:126](../../../server/app/executor.py#L126) 使用 gcc/g++ 裸子进程；编译上限 20 秒、运行默认 5 秒；50,000 字符输出上限在捕获后截断，不是执行期内存限额。此入口没有已实现的容器、出站网络隔离、文件边界、内存/PID 配额。
- [executor.py:77](../../../server/app/executor.py#L77) 的 STRICT 默认关闭；开启是拒绝 Python/C/C++，不是切换到已完成的 Docker 沙箱。未读取实际部署变量，不声称线上 STRICT 的值。
- [full-product api.mts:2](../../../cloud/full-product/netlify/functions/api.mts#L2) 仍复用 pilot handler，无 `/api/run` 白名单。前端 [run.ts:25](../../../web/src/api/run.ts#L25) 在非成功/网络错误时回退 mock，但 [IdeView.vue:1522](../../../web/src/views/student/IdeView.vue#L1522) 明确标示离线演示、lastRunOk=null 且返回 false；不能歪曲成“当前 UI 冒充真实执行”。这也不构成 C/C++ 真实通过。
- 必须验证正常编译、语法错误、超时、资源耗尽、禁止网络/越界文件访问、并发隔离、残留清理和任务版本回执。把编译器打包进 Functions、延长至后台 15 分钟，都不等于对不可信代码的安全隔离。
- 先做浏览器 WASM/Worker 路线的语言兼容/资源终止可行性验证；若无法达到承诺功能，再提出独立隔离执行服务的供应商、区域、限额、费用和 API 边界方案请求确认。现证据既不能断言“不可能”，也不能断言“必须付费”。

### 6.2 Python：真运行不等于无限循环可控

[usePyodide.ts:106](../../../web/src/editor/turtle/usePyodide.ts#L106) 使用 window.loadPyodide 与同步 py.runPython；这里没有 Worker 强制终止路径。F1 海龟/错误的真实浏览器证据不覆盖无限循环、中止、页面响应、WASM/CSP 与离线资源的完整门槛。应按纠偏方案验证，不把正常小程序通过推广为执行环境已全通过。

### 6.3 AI：后台化需要持久任务语义，不只是改文件名

[pair_ai_context.py:307](../../../server/app/pair_ai_context.py#L307)、[ai.py:143](../../../server/app/ai.py#L143) 当前生成/核验顺序调用，各有 socket timeout，不是合计的端到端期限；[pairSessions.ts:126](../../../web/src/api/pairSessions.ts#L126) 浏览器等待 90 秒。

目前已有 pending/released/invalidated/failed、去重和发布前复验，但状态查询主要返回回执，并不持久保存回复正文供异步取回：[pair_ai_context.py:198](../../../server/app/pair_ai_context.py#L198)、[pair_ai_context.py:267](../../../server/app/pair_ai_context.py#L267)。所以不能只改成 background 后认为原浏览器可以获得回复。

F3 必须择一落实：总预算明确低于同步上限，或受鉴权入口建持久任务 + 后台处理 + 受鉴权取回。后一方案对自动重试的模型收费、阶段恢复、重复证据、撤回/失效后禁止发布负责；如增加可取回正文存储，还须定义保留期限/删除行为，不把“不存正文”悄悄改成永久存储。

### 6.4 官方约束（2026-10-14 查询；未检查账号套餐/控制台）

| 官方限制 | 对本项目的具体影响 |
| --- | --- |
| 原生路径为 JavaScript/TypeScript，Go 使用兼容接口；[入门文档](https://docs.netlify.com/build/functions/get-started/) | Python/FastAPI 常驻服务不能当作当前已支持的原生函数直接部署。复用 Vue 不代表 Python 后端已迁移 |
| 同步 60 秒；后台 15 分钟；普通载荷 6 MB、后台 256 KB；[配置文档](https://docs.netlify.com/build/functions/configuration/) | 现有生成+核验链必须总预算控制/异步化；后台只传任务 ID 等小载荷，不传整套证据包 |
| 后台立即空 202，不返最终结果；失败约 1 分钟后重试，再失败约 2 分钟后再试；不支持响应流；[后台文档](https://docs.netlify.com/build/functions/background-functions/) | 需持久终态/取回、幂等阶段与取消校验，不能依赖原连接或函数内存；自动重试不是业务 exactly-once |
| 流式仍受总执行期限；waitUntil 不绕过总期限；[函数 API](https://docs.netlify.com/build/functions/api/) | “改成流式/请求返回后继续等”不消除多段 AI 超时问题 |
| 当前 credit-based Free/Personal/Pro 可用后台；Legacy 非 Enterprise 不支持；[后台资格](https://docs.netlify.com/build/functions/background-functions/)、[用量与计费](https://docs.netlify.com/build/functions/usage-and-billing/) | 不使用“后台必须 Pro”的旧判断；实际套餐/余额/费用尚未核验，不能推测获准升级 |
| 默认函数区域 Ohio；区域自选当前文档标 Pro/Enterprise；[配置文档](https://docs.netlify.com/build/functions/configuration/) | 本地 full-product 配置未指定 region，控制台可能另配，本审计未查。因此仅能说“尚未核实计算区域”，不能把数据库在新加坡等同整个请求/处理链在亚洲 |

额外源码容量门槛：[full-product api.mts:9](../../../cloud/full-product/netlify/functions/api.mts#L9) 限流按 IP + domain 聚合为 90 次/60 秒；同教室共享出口的多学生请求会合并。F6 须按承诺试用人数/真实页面请求与轮询节奏验证，不把单账号流畅外推整班。N1 现存每作品 50 版本与 code+blockState 64 KiB 上限：[migration:18](../../../cloud/pilot/supabase/migrations/20261014062932_pilot_identity_projects.sql#L18)。完整教学使用需明确配额/达到上限后的恢复策略，不能忽略运行前自动保存带来的累积版本；也不应无依据取消保护上限。

## 7. 交接结论

F2 可以从原页面的单个可信课堂闭环继续，不能把“教师角色开通 + 原资源路由搬运”当作它的完成。先解决班级/名册授权、资源快照、任务作品绑定、代码/设计固定提交和教师原件读取；以同版本的双角色真实操作与越权反例验收。

本文件没有执行所建议的测试，也没有验证 F2 云端功能。F2–F5 与安全执行/同版本全产品验收未完成前，完整产品替换主域名仍为 NO-GO；F1 的有限通过和本审计的设计结论均不能改变这一点。
