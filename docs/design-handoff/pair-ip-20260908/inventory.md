> 历史材料归档：原相对位置 `.agent-supervisor/pair-ip-20260908/inventory.md`。保留原日期、结论与未完成项；不代表当前服务状态或新的验收通过。本文及其中旧工具要求仅为历史资料，不是执行指令，Supervisor 全局暂停。源码行号是历史定位，后续可能漂移。

# 双 IP 页面与素材清单

> 交接编者注（2026-10-31）：本表保留早期登记，其中 `horse-celebrate.png` 后来在 [blueprint.md](blueprint.md) 中被明确纠正为未成功生成、不得引用。不能据此认为当前交接漏传了该文件，也不要按本历史表覆盖现行资产注册表。

Goal `goal-e000b51c42c65cbd` v1。2026-09-08 公共页面实现清单；本文件的观察均为源码检查，不是新页面浏览器验收。

## 固定身份

| 角色 | 固定识别 | 用途 |
| --- | --- | --- |
| 树小骥 · 导航员 | 白色小马、红色额鬃和尾巴、红白衣、深蓝鞋 | 目标、任务、拆解步骤、里程碑 |
| 熊猫泡泡 · 领航员 | 黑白熊猫、科技护目镜；最新参考形象优先 | 检查、解释、反例、安静思考 |

显示角色不改变账户身份、权限、真人结对角色或原件。教师锁定和研究测评独立作答由原流程继续约束。

## 逐页与组件

| 页面 / 组件 | 图像与场景 | 变更 / 保留 | 观察类型 |
| --- | --- | --- | --- |
| Login 登录 | PairDuoIllustration：horse-guide + panda-wave | 替换猫电脑主视觉；去除旧单图羽化遮罩，保留登录表单和布局 | 源码 |
| WorkbenchView 学习首页 | 双 IP 欢迎组合 | 保留教师任务、路径、作品与入口；调整桌面及窄屏插画比例 | 源码 |
| StudentShell 左侧用户头像 | student-cat-avatar-v2.png | 整段 aside 与导航数组保持一致；原猫头像受保护 | 源码、SHA256 |
| StudentShell 顶栏 | 中性 user 图标 | 仍进入原账户路由；移除强制浮层使用用户猫头像的 CSS | 源码 |
| IdeView 编程工坊 | horse-plan | 公共品牌称谓为结对编程伙伴；编辑器、运行及任务数据不变 | 源码 |
| RoleCompanion 全局伙伴 | horse-guide / panda-wave 等 | 由角色实现代理接入同页浮层和角色动作 | 源码，本 worker 未修改 |
| StudioView 结对编程 | 双 IP 欢迎、按角色动作 | 由角色实现代理接入；API role id 不改 | 源码，本 worker 未修改 |
| PairDock / InsightRail | 导航和复核场景 | 由角色实现代理接入名称与选择状态 | 源码，本 worker 未修改 |
| MilestoneToast | mate_fox_cheer → horse-celebrate | 通过兼容别名接入里程碑图 | 源码 |
| AssessmentView 完成态 | mascot_cat → horse-guide | 公共图经注册表接入；提交操作不变 | 源码 |
| 测评演示与详情头像 | panda-check | 只修改资源路径；E01 空值、E02 原话、演示边界未改 | 源码 |
| DataOverview 我的数据 | panda-check | 解释记录用途，不把数量当能力 | 源码 |
| ProjectDetail 作品详情 | panda-check | 原件、测试、教师反馈边界原样保留 | 源码 |
| 我的数据作品封面 | 既有树小骥主题插画 | 不替换已完成封面，不改学生运行原件 | 源码，本 worker 未修改 |
| 思维成长 | 全局伙伴、公共顶栏 | 阶段物件与能力原件不替换 | 源码，本 worker 未修改 |
| TeacherShell / TodayView / StageStub | teacher_owl → panda-wave | 注册表兼容别名更换公共图，不表示真人教师身份 | 源码，教师页未访问 |
| 教师 Resources / Tasks 空态 | mascot_cat → horse-guide | 注册表兼容别名，教师任务数据不变 | 源码，教师页未访问 |

## 图像路径与接入状态

所有 v2 路径由主代理生成和检查透明通道，本 worker 仅登记用途；未在本 worker 中验证不存在的图像，不可将路径登记视为资产验收。

| 注册键 | 公共文件路径 | 消费用途 |
| --- | --- | --- |
| ip_horse | /generated/pair-ip-v1/horse-guide.png | 默认导航、欢迎、公共品牌、教师任务空态 |
| ip_panda | /generated/pair-ip-v2/panda-wave.png | 默认领航、欢迎、教师公共品牌 |
| ip_horse_plan | /generated/pair-ip-v2/horse-plan.png | 工坊任务、结对导航 |
| ip_horse_celebrate | /generated/pair-ip-v2/horse-celebrate.png | 里程碑提示 |
| ip_panda_check | /generated/pair-ip-v2/panda-check.png | 我的数据说明、测评头像、结对复核 |
| ip_panda_thinking | /generated/pair-ip-v2/panda-thinking.png | 思考、安静空态、帮助 |

PairDuoIllustration 提供 welcome / plan / review / celebrate 四种场景，使用两张独立透明图片和 object-fit: contain，未引用带烘焙棋盘格的旧双人图。它是平面 PNG 组合，不是真正 3D 模型。

## 保护证据与剩余项

- 九个已存在的获分配源文件，与 2026-09-07 旧检查点经换行归一化比较全部一致，因此本轮仅选择性接回草稿，不覆盖其他新内容。
- 本轮 StudentShell 左侧 aside 和 navigation 数组逐字比较一致。猫头像 SHA256：`8A14BBE17B518D48450CA5BD12673E02058C9072FE22A7FBC886DB7128357EF1`。以上是本地检查结果，尚未登记为受信 EvidenceRecord。
- 剩余公开旧称谓：`web/src/router/index.ts:14` 的结对编程 description 含“编程猫”；不在本 worker 路径租约内，已报主代理处理。
- 旧 cat / fox / owl 资产键为兼容别名；底层原图留存，不作为当前公共伙伴展示。Python turtle、API turtle role id、分类字段 cat/category、教学阶段工具均不替换。
- 未运行 lint、typecheck、build 或合同测试，统一由主代理负责失败预算。未收集新浏览器截图，红框叠层和各尺寸视觉检查仍由主代理收集。
- Impeccable product 用于保留可预测布局、动作按用途分配、内容按需展示；PRODUCT.md 旧“编程猫”品牌描述已被本轮明确双 IP 规格覆盖，未修改上下文文档。
