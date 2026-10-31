# 原产品全页面展示版

本构建用于向访客展示原有 Vue 学生端和教师端，不是完整后端迁移版。

## 使用

- 正式入口：https://jiedui-pilot-sg.netlify.app/
- 直接进入学生端：https://jiedui-pilot-sg.netlify.app/student/home?demo=1
- 直接进入教师端：https://jiedui-pilot-sg.netlify.app/teacher/teaching/today
- 无需注册或账号密码。顶部可以切换身份，也可通过“全部页面”浏览 24 个业务页面。
- 原学生导航、编程工坊、测评三个分区、成长与反馈页面、作品预览及教师教学/教研界面均来自原产品组件。

## 演示边界

- 人物、任务、作品、反馈及统计都是合成示例。
- 普通演示操作仅影响当前页面会话的内存，刷新重置。
- AI 使用标注清楚的预设回复；运行使用明确标注的预设结果，不执行访客代码。
- 下载文件为示例格式，不能用于真实教学评价或研究结论。上传不启用。
- 不连接 Supabase、真实课堂、原 FastAPI 或任何模型服务，不创建真实账号。
- 保留本地原应用；不改变此前真实业务迁移的验收状态。

## 构建与发布

在项目根目录运行：

```powershell
node --test web/tests/showcase*.test.mjs
node cloud/showcase/build.mjs
```

构建读取原 `web/src`，独立使用演示入口、身份和数据适配器，输出路径与哈希写入 `.runtime/showcase-20261014/latest-build.json`。不覆盖原 `web/dist`。

发布时必须在 `cloud/showcase` 目录运行，以载入此目录的独立重写规则和安全响应头。使用清单中的绝对 publishDirectory，以及此目录的空 functions 目录；先候选验收，再将**同一构建**发布到已有站点，不回滚到历史 deploy。

发布门槛：类型/文案/样式检查、展示版测试、26 个入口 HTTP、逐文件内容哈希、原双端浏览器页面及关键交互检查。HTTP 200 不能代替浏览器页面渲染验收。

## 实现隔离

- `web/src/showcase/`：演示入口、目录、临时身份、内存数据、下载与请求隔离。
- `isolate-storage.mjs`：只在展示构建中把原组件存储调用替换为隔离内存，避免读取真实本地草稿。
- `clarify-demo.mjs`：仅在展示构建中修正“真实记录/云端保存”等可能误导的文案。
- `netlify.toml`：深链重写、API 禁用说明、安全响应头；不部署业务函数。
- 原教师观察表列对齐修正限定于展示容器，不修改本地原页面源码。

日期：2026-10-14。浏览器验收以桌面横屏为主；不把此演示版作为真实课堂服务或完整移动端验收。
