# 结对编程智能体平台 · 源码交接

面向中小学编程学习的学生端与教师端产品。包含原 Vue 界面、FastAPI 后端、教学规则与证据设计、测试、IP/界面资产，以及 Netlify 展示版构建和未完成的云端迁移代码。

**本仓库是 2026-10-31 的安全源码快照，不是压缩包，也不是完整生产业务上线声明。** 直接浏览目录、克隆后分析和修改即可。当前工作目录中的最新修改已纳入；未推送含数据库备份的旧 Git 历史。

[在线产品展示](https://jiedui-pilot-sg.netlify.app/) · [学生端](https://jiedui-pilot-sg.netlify.app/student/home?demo=1) · [教师端](https://jiedui-pilot-sg.netlify.app/teacher/teaching/today)

## 先区分三套入口

| 内容 | 入口 | 状态 |
| --- | --- | --- |
| 原产品本地版 | `web/` + `server/` | Vue 3 / TypeScript / Vite + FastAPI / SQLite；真实业务与测试源码 |
| 当前公开展示版 | `cloud/showcase/build.mjs` + `web/src/showcase/` | 复用原 UI，学生 9 页、教师 15 页；合成内存数据，刷新重置，无真实 AI/课堂调用 |
| 云端迁移与旧原型 | `cloud/full-product/`、`cloud/pilot/`；根 `src/`、`backend/` | 分阶段候选或历史实现，保留用于分析；不等于整套云端后台已完成 |

**根目录的 `npm run dev` 启动的是旧原型，不是当前 Vue 产品。** 请先使用下面的展示版或本地版流程。旧目录 README 和历史验收记录保留原时间语境；以本文件区分交付范围。

## 最快复现：展示版

推荐 Node.js 24。先在仓库根目录执行：

```powershell
npm ci --prefix web
node --test web/tests/showcase*.test.mjs
node cloud/showcase/build.mjs
```

构建不覆盖 `web/dist`。结果及输出目录见 `.runtime/showcase-20261014/latest-build.json` 的 `publishDirectory`；目录名称保留原构建约定，每次会生成新的时间戳子目录。部署规则见 [展示版说明](cloud/showcase/README.md)。

需要本地浏览时，可使用 Python 3 静态服务：

```powershell
$build = Get-Content .runtime/showcase-20261014/latest-build.json -Raw | ConvertFrom-Json
python -m http.server 8080 --bind 127.0.0.1 --directory $build.publishDirectory
```

打开 `http://127.0.0.1:8080/` 后通过站内导航浏览。此简单静态服务器不提供 SPA 深链回退，刷新 `/student/...` 可能 404；Netlify 的相应重写已放在 `cloud/showcase/netlify.toml`。不要把目录 HTTP 服务用于真实课堂。

展示版全部人物、作品、反馈、指标都是合成示例。AI 回复与运行结果是标注清楚的预设内容；不执行访客代码，不上传真实资料，不连接 Supabase 或模型服务。

## 开发原产品本地版

建议 Python 3.12 与 Node.js 24。以下命令从仓库根目录执行：

```powershell
py -3.12 -m venv server/.venv
server/.venv/Scripts/python.exe -m pip install -r server/requirements.txt
Copy-Item server/.env.example server/.env
```

先阅读 [本地安全配置模板](handoff/local.env.example)，自行配置 `.env`。不要复制他人的密钥，不要使用开发默认 JWT 或空教师口令对外部署。

```powershell
npm ci --prefix web
npm run fetch:pyodide --prefix web
npm run build --prefix web
Set-Location server
.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 12210
```

打开 `http://127.0.0.1:12210/`。首次运行会产生新的本地数据库；仓库不附真实用户库。Windows `启动平台.ps1` 是原有便捷脚本，默认绑定所有网络接口；初次开发优先用上述仅本机监听命令。

本地 AI 需自行配置服务；C/C++ 执行需相应编译器与真正隔离的运行环境。原裸子进程不能作为不受信任代码的生产沙箱；`SANDBOX_STRICT=1` 可禁止该路径。

## 测试入口

```powershell
npm run typecheck --prefix web
npm run lint:copy --prefix web
npm run lint:style --prefix web
node --test web/tests/showcase*.test.mjs
node --test cloud/pilot/tests/api.test.mjs
node --test cloud/full-product/tests/*.test.mjs
```

后端隔离测试：在 `server/` 下先安装 `pytest httpx`，再运行 `.venv/Scripts/python.exe -m pytest -q`。`server/tests/conftest.py` 和 `test_support.py` 使用临时库并限制外网；不要直接运行旧 `_smoke_*.py`、`_acceptance.py`、`live-*.mjs` 或部署脚本，它们可能改变目标服务。

## 交接导航

- [架构与接手顺序](handoff/ARCHITECTURE.md)
- [安全边界与历史风险](SECURITY.md)
- [本次交接检查](handoff/VALIDATION.md)
- [文件清单与 SHA256](handoff/file-manifest.json)
- [未上传项目清单](handoff/excluded-files.json)
- [2026-10-14 展示版历史验收](handoff/showcase-acceptance-20261014.md)：历史证据，不是本日完整业务验收。
- `docs/`、`specs/`、根产品计划书及 `progress.md`：需求、教学逻辑、分阶段状态。

## 保留与排除

保留源码、依赖锁文件、SQL 迁移、测试、部署配置、已审阅配置模板、文本产品文档，以及应用依赖的图片/图标/IP 资产。保持原相对路径，方便接手人员直接分析。

不上传真实 `.env`、登录状态、数据库/备份、运行日志、缓存、依赖目录、可再生成的构建产物、未核验研究 DOCX/PDF、原始 QA 截图及第三方安装包。这些原件未被删除，仍在原本地目录；详见排除清单。项目内引用但当前缺失的 Pair-Agent constitution/screens 目录未伪造补齐。

未指定开源许可证；不得因为可访问仓库就推定获得商业再分发权。第三方包/参考资产仍遵守各自许可，`pm4py` 的 AGPL 使用应保持原隔离安排。协作者权限通过 GitHub 仓库邀请管理。
