# 历史验收与后续路线

这些材料保留 2026-10-13 至 2026-10-14 的原结论，包括 NO-GO、未验证与外部服务阻断；不是当前服务健康证明，也不能把展示站当成全部真实业务已经上线。

- [F1 收口验收](full-product-f1-closeout-20261014/acceptance.md)
- [F2 教师任务与学生提交的迁移审计](full-product-f1-closeout-20261014/f2-readiness-audit.md)
- [数据库并发验收计划](full-product-f1-closeout-20261014/concurrency-plan.md)
- [可信 AI 能力重新预检](m1b2-capability-recheck-20261013/acceptance.md)
- [结构化能力与前端恢复验收](m1b2-structured-recovery-20261013/acceptance.md)
- [范围合同](m1b2-structured-recovery-20261013/contract.md) · [前端历史差异](m1b2-structured-recovery-20261013/scoped-review/frontend-recovery.diff)
- [安全评审](m1b2-structured-recovery-20261013/security-review.md) · [教学评审](m1b2-structured-recovery-20261013/teaching-review.md) · [交互评审](m1b2-structured-recovery-20261013/interaction-review.md)
- [浏览器观察与直接截图](m1b2-structured-recovery-20261013/browser-observations.md)

上述验收页直接链接的文本和四张关键截图已随包归档。文中提及的全部原始日志、隔离数据库、冻结清单和其余故障实验过程不是本包的内容；保留这层边界，不把文档复制当作重新执行验收。历史方案中的 SQL、命令和 diff 不应直接对线上服务运行或套用。

特别说明：`concurrency-controller.mjs` 仅为当时数据库控制工具的历史引用，本次未审阅、不归档、不运行；原 `logout-race.json`、探针/故障控制状态及 DB/WAL/SHM 继续保留本地。并发计划对 `cloud/pilot/tests/live-logout-race.mjs` 硬编码目标的描述属于历史原版，仓库交接副本已改为环境变量和显式运行门禁。教学评审中的三个合成请求标识使用稳定的 `SYNTHETIC-*` 标签代替，关联含义未改。

配置提示：`server/app/pair_ai_context.py` 默认 `PAIR_AI_MODE=legacy`。可信会话路径使用 `trusted_required`，但该开关本身不能证明模型生成、教学核验、教师权限或画像链路通过；先阅读实现、使用合成数据并核验当前服务。示例见 [local.env.example](../../handoff/local.env.example)。

源码链接已改为仓库相对路径；行号保留历史定位，后续源码可能漂移。原本不存在的 `docs/pair-agent/constitution/`、`screens/` 未伪造。归档旧工具指令只供阅读，Supervisor 仍全局暂停。
