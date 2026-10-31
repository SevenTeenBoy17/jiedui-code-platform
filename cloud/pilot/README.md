# 云端试用 N1

这是批准的分片迁移第一片，不是整个产品的替代版本。原 `web/`、`server/` 和 SQLite 数据不变。本目录只开放指定账号登录和作品版本闭环；AI、测评、教师反馈、执行器尚未迁移，不能声称已上线。

## 部署与边界

- Netlify 静态入口 `public/`；原生函数 `netlify/functions/api.mts`；应用 API 均位于 `/api/*`。
- Supabase 项目 `jiedui-pilot-sg`，区域 `ap-southeast-1`，引用 `slyzlplnuozzccdznuqp`。不导入真实课堂数据。
- 运行时配置：`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`。只使用公开应用 key；没有 service_role key、数据库管理员密码或浏览器直连管理员权限。
- Netlify 当前 Free 套餐，不主动设置付费函数区域，不自动升级。亚洲数据库不代表全链路亚洲。
- Supabase Auth 密码登录；每次请求验证用户和数据库会话／成员状态。角色只从管理员维护的成员记录获得。未加入试用名单者无数据访问权。
- access token 只在 `Secure; HttpOnly; SameSite=Strict; Path=/` cookie，最长 30 分钟且不超过 token 到期；不保存 refresh token。到期需要重新登录，不承诺闲置自动退出。界面不保存身份或作品到 localStorage。
- 写请求要求严格同源 Origin。退出撤销当前 Supabase 会话；远端撤销失败必须提示，不能声称远端退出已确认。
- PostgreSQL 私有 schema 的表启用 RLS、撤销客户端表权限。受控私有函数检查身份、会话、成员、owner、数据约束；公开 invoker wrapper 只允许 authenticated 执行。
- 保存以 expectedVersion + requestId 进行事务冲突检测和幂等处理。旧基版本返回 409，不覆盖。每个作品上限 50 个版本，代码 UTF-8 上限 64 KiB，每账号上限 100 个作品（试用资源限制，不是教学评价）。
- 代码与可选积木状态合计不超过 64 KiB，RPC 总输入不超过 80 KB；没有直接表访问权限。会话行锁保证已进入事务的保存与远端撤销有明确先后顺序，真实并发退出场景仍须专门验收。
- 登录失效时，未保存稿只暂存在本页内存，登录同一账号并核对云端版本后才能恢复；不自动提交，换账号／主动退出／放弃会清除。刷新或关闭页面会丢失这份暂存。

## 验收门槛

1. 未登录、未列入名单、篡改角色、跨账号读写、撤销后旧 token 重用全部拒绝。
2. 创建／保存／重新载入从远端数据库取回同一作品；不依赖函数内存或浏览器缓存。
3. 同一基版本并发修改恰好一份成功、一份 409；相同 requestId 重试只新增一次；同键不同内容拒绝。
4. API 故障不得伪装登录成功、空列表或保存成功；没有 mock fallback。
5. 1366 桌面和 390 窄屏实际浏览器验证；焦点、错误恢复、退出后的内存隔离。
6. 原本地版源文件保持不变。只有本片全部远端验证通过才能说 N1 完成，不能扩展为全平台完成。

## 核验指令

`node --test tests/api.test.mjs` 检验 API 合同及故障路径。数据库测试、同版本远端浏览器和最终结论单独记在 `.runtime/netlify-n1-20261013/`，不能用单元测试替代。

迁移 SQL 使用已认证的 Supabase 管理工具仅在上述新项目执行，不对其他项目执行。正式试用账号通过管理员创建并加入成员名单；不提供公开自助注册入口。

## 当前状态（2026-10-14）

指定人员试用入口：https://jiedui-pilot-sg.netlify.app 。当前生产 deploy 为 `6acf3ee486e4b664ffcf926d`。所有者已登录管理控制台，公开注册已关闭；实际注册请求返回 `signup_disabled`。已建立两名独立合成验收用户，不是真实学生。A 可供所有者体验；B 已停用，不能用于试用。

当前同版本本地合同 32/32、真实 HTTPS 身份／作品／并发／退出后拒绝 23/23、成员停用专项 10/10、生产静态与匿名边界 10/10 通过。已实际操作桌面登录、创建、保存、刷新恢复、历史只读、冲突及 401 同账号草稿恢复，窄屏编辑和历史弹层已查看。计数互不替代，也不是教学效果评分。

**N1 完整验收仍未签署。** 保存与退出同时发生的受控锁测试没有捕获等待证据，结果为 `NOT_PROVEN`；不能用普通退出后拒绝测试替代。Chrome 原生放弃草稿确认框阻断自动化，取消／确认流程仍未完整现场验证。详细记录见 `.runtime/netlify-n1-20261013/acceptance.md` 与 `browser-acceptance.md`。N2–N4 未迁移，不得将当前独立工作台描述为原教学平台已完整上线。

账号交付仅放在被 Git 忽略的本地私有文件，不上传到静态站点。后续正式试用人选须由所有者指定；不要共享验收账号给全班。被成员名单拒绝的登录可能留下无业务访问权限的 Auth 会话记录，这是待改进的清理项，不声称会话全部清空。

部署绑定：Netlify `d37a66a1-4411-4579-9c23-b4ac3aac7de7`；不连接 Git 自动部署，不升级套餐。此 Windows 多目录仓库使用官方 CLI 27.12.1，手动部署必须显式提供 `--dir` 为本目录的 `public` 绝对路径、`--functions` 为本目录 `netlify/functions` 绝对路径，避免 CLI 将相对目录误解为仓库根目录。`--no-build` 不与 `--context` 混用。

安全检查出现四项 INFO：私有表 RLS 开启但无策略；这是默认拒绝客户端直读写的设计，不能为消除提示添加宽松策略。仅受控函数可读写，详见 Supabase [说明](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)。

当前另有一项 WARN：泄露密码检测未启用。Supabase 官方说明该功能需 Pro 及以上；本轮不擅自升级费用。验收账号使用随机长密码且公开注册已关闭，这些措施不等于启用了泄露检测。参见 [密码安全说明](https://supabase.com/docs/guides/auth/password-security)。
