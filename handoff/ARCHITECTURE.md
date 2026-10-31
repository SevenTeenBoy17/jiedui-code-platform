# 产品架构与后续开发交接

整理日期：2026-10-31。本文是对当前源码的只读梳理，不代表本次重新完成了构建、测试、真实模型调用或生产验收。

本仓库交付的是**经过安全筛选的完整应用源码快照**，不是工作电脑的逐文件备份，也不表示所有真实业务已经迁移到云端。密钥、运行数据库、真实学生资料、工具缓存、依赖安装目录、第三方安装器等不应上传；实际排除清单见同目录 `excluded-files.json`。

## 一、先辨认三个版本

| 版本 | 主要目录 | 用途与边界 |
| --- | --- | --- |
| 原产品本地版 | `web/`、`server/` | Vue 学生端和教师端；FastAPI 接口；SQLite 数据层。功能实现与验收程度须逐项核对，不能因页面存在就判断真实链路完成。 |
| 线上全页面展示版 | `web/src/showcase/`、`cloud/showcase/` | 直接复用原 Vue 页面和图形资产，提供免登录的学生／教师演示入口；合成示例与临时内存，不接真实课堂、数据库或模型。 |
| 云端真实业务迁移 | `cloud/pilot/`、`cloud/full-product/` | N1 身份和个人作品版本试点，以及 F1 原 Vue 接入候选。不是完整课堂业务；后续迁移及未通过门槛须保留。 |

根目录 `src/`、`backend/`、`index.html`、`package.json`、部分 `scripts/`、`tests/` 与 `specs/` 保留了较早的 CodeX／AI 小海龟原型和研究开发过程。**根 `npm run dev` 不是当前 Vue 产品的默认入口**；也不要仅依据 `backend/README.md` 的旧描述判断当前后端仍未实现。

线上展示地址为 `https://jiedui-pilot-sg.netlify.app/`，对应 2026-10-14 的展示版发布记录。此次交接不将该地址的历史验证冒充为 2026-10-31 新一轮在线验收。

## 二、当前原产品结构

```text
web/src/
  router/                 登录、学生 9 页、教师 15 页及角色守卫
  layouts/                学生与教师共享页面外壳
  views/student/          学习、结对、编程、测评、成长、个人数据
  views/teacher/          教学与教研两组页面
  components/             编辑器、图表、抽屉、角色伙伴等组件
  api/ + stores/          接口适配、身份与前端状态
  assets/ + ../public/    图标、IP、作品封面等实际产品资产
  showcase/               展示版入口、临时身份、数据和请求隔离
server/
  app/main.py             FastAPI 入口及原 Vue 构建产物托管
  app/auth.py             本地身份与教师权限入口
  app/projects.py         作品和版本接口
  app/pair_sessions.py    可信结对会话入口
  app/pair_ai_context.py  可信上下文与策略关联
  app/pair_ai_output.py   AI 输出合同与核验
  app/ai.py               模型调用与分层引导
  app/evidence.py         单任务证据接口
  app/ct.py + learner.py  计算思维与学习状态相关接口
  app/teacher.py          教师教学数据
  app/study.py            测评与研究流程
  app/store*.py           SQLite 持久化模块
  tests/ + test_support.py 隔离测试及临时数据库／断网保护
cloud/
  showcase/               当前线上展示版独立构建与发布配置
  pilot/                  历史 N1：原生函数、SQL 迁移、独立试用页
  full-product/           F1 原 Vue 云端适配候选
```

前端主技术：Vue 3、TypeScript、Vue Router、Pinia、Vite；编辑器为 Monaco／Blockly；图表使用 ECharts，动效包含 GSAP。原 Python 浏览器执行路径使用另行下载的 Pyodide 资源。后端为 FastAPI、Pydantic、PyJWT 与 SQLite；无需把工作电脑上的 `.venv` 或 `node_modules` 上传才能复现。

## 三、页面与入口清单

页面定义的权威来源为 `web/src/router/index.ts`。下表不把重定向、Tab 或抽屉重复计为独立业务页。

| 区域 | 页面 | 原路由 |
| --- | --- | --- |
| 公共 | 登录／展示身份入口 | `/login` |
| 学生 | 学习工作台 | `/student/home` |
| 学生 | 结对编程 | `/student/studio` |
| 学生 | 编程工坊 | `/student/ide` |
| 学生 | 思维成长 | `/student/thinking` |
| 学生 | 证据画像 | `/student/thinking/profile` |
| 学生 | 重做复核 | `/student/thinking/review` |
| 学生 | 测评中心 | `/student/assess` |
| 学生 | 测评作答 | `/student/assess/:aid` |
| 学生 | 我的数据 | `/student/my-data` |
| 教师教学 | 今日 | `/teacher/teaching/today` |
| 教师教学 | 学情 | `/teacher/teaching/students` |
| 教师教学 | 班级 | `/teacher/teaching/classes` |
| 教师教学 | 资源 | `/teacher/teaching/resources` |
| 教师教学 | 任务 | `/teacher/teaching/tasks` |
| 教师教学 | 课堂实况 | `/teacher/teaching/live` |
| 教师教学 | 课堂观察 | `/teacher/teaching/observe` |
| 教师教研 | 课题 | `/teacher/research/study` |
| 教师教研 | 课题结论 | `/teacher/research/study/:sid/report` |
| 教师教研 | 班级分析 | `/teacher/research/analysis` |
| 教师教研 | 数据导出 | `/teacher/research/export` |
| 教师教研 | 学生画像 | `/teacher/research/profiles` |
| 教师教研 | 教学案例 | `/teacher/research/cases` |
| 教师教研 | 量规 | `/teacher/research/rubrics` |
| 教师教研 | 研究报告 | `/teacher/research/report` |

展示构建提供顶部身份切换和全部页面目录。学生页面的 `demo=1`、示例任务 ID 以及临时身份来自展示适配器，不能直接当作真实权限或教学数据合同。

## 四、构建与运行入口

### A. 只复现当前线上展示

先在 `web/` 安装锁定依赖：`npm ci`。在仓库根目录执行：

```text
node --test web/tests/showcase*.test.mjs
node cloud/showcase/build.mjs
```

独立构建读取原 Vue 源码，以展示入口、内存存储和合成接口替换真实连接；不覆盖本地 `web/dist`。输出目录及内容哈希记录在生成的 `.runtime/showcase-20261014/latest-build.json`。发布配置为 `cloud/showcase/netlify.toml`，不是 `cloud/pilot/netlify.toml`；后者会发布历史试点界面。

展示版没有真实业务函数；AI 回复和运行结果是明确标注的预设内容。上传不启用，刷新后临时状态重置。不要为了展示去复制真实学生库或服务端凭据。

### B. 本地原产品

- 前端：在 `web/` 使用 `npm ci`、`npm run build`。开发服务由 `npm run dev` 启动，默认端口 5273，API 代理到 12210。
- Python：建议从 Python 3.12 建立 `server/.venv`，安装 `server/requirements.txt`。不要复用随意安装了不同依赖版本的全局 Python。
- 配置：从脱敏模板复制私有 `server/.env`，为 JWT、教师口令、导出盐及所需模型服务填写独立配置；真实值不提交 Git。
- 后端：在 `server/` 执行 `python -m uvicorn app.main:app --host 127.0.0.1 --port 12210`。其 `/health` 提供健康检查；存在 `web/dist` 时，同一进程同时托管前端。
- Windows 的 `启动平台.ps1` 会寻找可用端口并打开浏览器，但默认监听 `0.0.0.0`；仅做个人本地验证时优先使用上面的回环地址命令。
- Pyodide：需要浏览器 Python／海龟运行时，在 `web/` 运行 `npm run fetch:pyodide`。下载目录是可再生依赖，不把未提供的运行时称为已经具备离线能力。
- 启动会创建或更新 SQLite。对已有工作库启动前应备份主库、WAL、SHM；交接源码不携带真实库。

### C. 检查与权限边界

- 前端：`npm run typecheck`、`npm run lint:copy`、`npm run lint:style`；`npm run build` 已串联这些门槛。
- 后端：测试开发依赖还需 `pytest httpx`；从 `server/` 执行 `python -m pytest`。`tests/conftest.py` 在导入应用前调用 `test_support.py`，建立临时数据库并禁止外部网络，勿绕过这层保护。
- N1 的 `.mts` 合同测试要求 Node 24 或更高；旧 CI 的前端 Node 20 配置不是整个仓库所有工具的统一运行版本。建议接手者先统一 Node 24，再逐项验证。
- `server/_smoke_*.py`、`cloud/*/live-*.mjs`、数据库验收 SQL 等可能连接真实服务或写入数据，不应加入未经批准的一键测试脚本。

## 五、不得误读的安全与教学边界

1. **展示、源码实现、真实端到端验证、课堂效果是四种不同结论。** 既有展示测试通过不代表可信 AI、数据库并发或教学效果通过。
2. 本地身份配置包含开发默认行为。正式使用前必须设置教师口令和 JWT 密钥，并审阅 CORS 与跨角色授权；不能仅隐藏前端菜单。
3. `server/app/executor.py` 使用本地子进程。它不是已经完成的生产级代码沙箱；`SANDBOX_STRICT=1` 会拒绝后端裸执行。C/C++ 安全执行环境需单独设计和验收。
4. 云端 N1 的个人作品身份／版本闭环，不等于课堂任务、可信 AI、证据反馈、测评和画像已迁移。F1–F6 范围见部署纠偏方案。
5. 画像中的能力主张必须回到任务、版本与证据。不得把点击数、错误次数、时长直接换算成计算思维分数，也不得因多次失败自动提供完整程序。
6. 不新增键盘流、鼠标轨迹或连续截屏采集。研究导出、同意撤回和数据主体权利应保持独立验收。
7. `scripts/process_mining.py` 的 pm4py 依赖有 AGPL 许可边界，现有设计为独立分析环境；不要直接并入服务端常规 requirements。
8. 美术、字体、参考附件及第三方资产的使用权需由项目所有者确认。仓库拥有某个文件并不自动意味着具备对外再分发许可。

## 六、缺失合同与文档版本问题

当前 `AGENTS.md` 引用了 `docs/pair-agent/constitution/**` 与 `docs/pair-agent/screens/**`，但此次扫描的工作区中**这两个路径并不存在**。交接不得伪造这些文件，也不能把其它计划书当作已经批准的同一合同。

后续应先请产品负责人确认是否有独立保存的原合同；若确实遗失，应建立可审阅的恢复草案并获得确认，再作为约束使用。已有 `docs/superpowers/plans/` 中的可信会话与测评合同可以提供历史依据，但不自动取代缺失文件。

此外，`backend/README.md` 描述旧原型，`cloud/pilot/README.md` 的“当前生产”段落记录的是历史 N1 状态，`docs/进校首日检查单.md` 中的通过数量与日期也属于当时记录。接手者应保留历史文本，以最新 `progress.md` 和发布记录解释先后关系，避免为了文案整齐擦除未通过或未证明的事项。

全局 Agent Supervisor 仍处于用户要求的暂停状态。交接、安装工具或修复代码均不构成重新启用其入口、钩子或质量门禁的授权。

## 七、后续改进优先级

| 优先级 | 工作 | 验收证据 |
| --- | --- | --- |
| P0 交接可复现 | 明确三种构建；完善无秘密配置模板；新机器安装；核对源码、依赖、资产与排除清单 | 干净环境可构建原前端和展示版，页面／资产清单一致；没有真实库或凭据入仓 |
| P0 身份与运行安全 | 教师服务端身份、任务／班级范围授权、未保存草稿确认、并发与撤销，以及代码执行隔离 | 正反权限用例、原生确认的取消／确认分支、并发锁观察证据；失败不能假成功 |
| P1 双端课堂基础 | 先完成班级、任课、资源、任务分发及不可变作品提交版本 | 同一任务从教师发布到指定学生提交，再回到教师查阅；其他班级不可访问 |
| P1 可信 AI 和引导 | 延续当前模型服务；接可信会话、策略、生成合同和核验；处理超时、取消、重试和迟到结果 | 同版本真实模型与浏览器回执；核验失败候选不泄露，不重复生成证据 |
| P1 单任务证据 | 关联分析、设计、运行、测试、反思的原件与版本 | 任一判断可点回原件；模拟结果与真实运行分离；缺失证据如实提示 |
| P1 教师反馈复核 | 教师反馈→学生低支架重做→教师复核 | 前后证据分开保留；未复核不称有效改进 |
| P1 测评和真实画像 | 测评发布／作答权限、结果开放、画像证据、研究导出和数据权利 | 未发布答案不可见；画像可追证据；授权、撤回、导出均有测试 |
| P2 正式业务上线 | 完成全页、双角色、跨账号、异常恢复、响应式及同版本发布验收 | 明确部署版本、资源哈希、测试记录与未完成项；不以静态展示验收替代真实课堂验收 |

这是一份后续路线，不是这些工作已经完成的声明，也不构成新增云资源、收费服务或真实学生数据迁移的授权。

## 八、建议阅读顺序

1. 根 `README.md` 与 `cloud/showcase/README.md`：当前交付和演示边界。
2. `handoff/showcase-acceptance-20261014.md`：2026-10-14 的展示验收记录，按其原日期理解。
3. `docs/deployment/2026-10-14-完整产品上线纠偏方案.md`：原产品保真、F1–F6 和未完成门槛。
4. `docs/superpowers/plans/2026-10-12-trusted-ai-vertical-slice.md` 及 2026-10-11 的会话／测评合同：可信学习链路的设计依据。
5. `docs/教师使用手册.md`、`docs/进校首日检查单.md`、`docs/合规/`、红队报告：教学使用与安全限制。
6. `progress.md`：按日期追溯每片实施、测试、失败、未证明事项和用户范围变化；不要把历史计划当作现成功能。
