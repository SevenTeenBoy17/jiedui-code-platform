# 登录首页 Design QA

- Source visual truth: `C:\Users\nuoya\.codex\generated_images\01a05179-22ad-7af2-8473-2d225c4e6954\exec-cad9ef05-0668-4652-a6f4-d56c35233f38.png`
- Implementation screenshot: `C:\Users\nuoya\.codex\visualizations\2026\08\30\01a05179-22ad-7af2-8473-2d225c4e6954\login-reference-v5-1280.png`
- Earlier implementation screenshots: `login-reference-v2-1280.png`、`login-reference-v3-1280.png`、`login-reference-v4-1280.png`（同目录）
- Route: `http://127.0.0.1:12210/login`
- State: 学生身份、账号登录、空表单
- Source pixels: 1586 × 992
- Implementation pixels / CSS viewport: 1280 × 720，devicePixelRatio 1
- Density normalization: IAB 固定为 1280 × 720，无法切换到源图原生尺寸；以完整源图和完整 1280 × 720 首屏共同对比，并记录该视口差异，不据此做伪像素判断。

## Full-view comparison evidence

同一次 `view_image` 检查中打开了源图与最终实现截图。以下五个必查面均已对照：

1. Fonts and typography: 保留中文现代无衬线、深色高字重两行标题；标题在 1280px 下仍是两行，控件字号和字重均明确声明，无浏览器默认控件字体。
2. Spacing and layout rhythm: 顶部品牌与三枚能力卡、左侧文案、中部编程猫、右侧登录卡恢复参考稿的三段骨架；登录卡与主视觉轻叠压，左右轨道稳定。
3. Colors and tokens: 暖白/浅灰画布、深墨文字、橙色主行动、蓝色次行动、薄边框和轻投影与源图一致；没有恢复旧海龟色彩或品牌资产。
4. Image quality and asset fidelity: 复用现有 1536 × 1024 透明编程猫 WebP，保留猫脸、橙色连帽衫、电脑、代码面板和桌面，暖白背景上未见透明边缘黑边。
5. Copy and content: 保留“结对编程智能体”、学生/教师登录、五步学习路径与“不代写答案”边界；没有照抄原图中的协议、忘记密码或其他无后端依据的控件。

图标检查：全页使用仓库现有 `BaseIcon` 线性图标，任务、分层、证据、角色、路径、输入框及密码显隐的尺寸与颜色一致。无 Emoji、占位图标或新造 SVG。

Focused-region comparison was not required: 1280 × 720 原图级截图中的标题、学习路径与 326 × 488 登录卡文字均清晰可读；IAB 不支持 element screenshot，表单细节另以 DOM 尺寸、角色切换、placeholder、焦点和密码显隐状态核验。

## Comparison history

### Pass 1 — blocked

- [P2] 1280 × 720 首屏纵向溢出：页面 `scrollHeight` 为 809，外框底部和学习路径卡片不能完整进入首屏。
- [P2] 400px 左栏使用桌面路径间距，最后一个“反思迁移”发生裁切。

Fixes made:

- 将收窄规则提前到 1320px，缩小左右轨、路径间距、主视觉与表单内边距。
- 增加桌面低高度规则，将 720px 高视口的顶栏、内容纵向间距和主视觉同步压缩。
- 保持猫、标题和登录表单的层级关系，不通过隐藏核心内容解决溢出。

### Pass 2 — passed

- 1280 × 720 下 `scrollWidth = 1280`、`scrollHeight = 720`。
- 外框 1229 × 669、主视觉 393 × 480、登录卡 326 × 488、学习路径卡 404 × 107，均完整可见。
- 学生/教师切换会更新 `aria-pressed`、账号提示并聚焦账号框；学生账号/班级码切换会更新 `aria-pressed` 与 placeholder；密码显隐同步更新 input type、按钮名称和 pressed 状态。
- 浏览器控制台日志为空。

### Pass 3 — review fixes passed

- 独立审查发现小字对比度不足，已将眉题、身份选中态、登录方式选中态、placeholder、隐私提示及未选登录方式调整到至少 4.5:1；计算值分别为 6.24:1、6.09:1、6.37:1、4.63:1、4.93:1、5.45:1。
- CodeRabbit 两轮分别指出 761–830px 的视觉区双列，以及 1061–1110px 的主内容双列最小轨道可能横向溢出；已增加 761–840px 中间断点，并将主内容单列断点扩到 1120px，保持 760px 以下全单列。
- 修复后 `typecheck`、`lint:style`、`build:only` 与 `git diff --check` 均通过；1280 × 720 最终截图仍保持完整首屏和原有构图。
- 再次验证教师身份切换、班级码切换和密码显隐，字段提示、焦点、input type 与 `aria-pressed` 均同步更新。

## Above-the-fold copy diff

允许且已实现：`结对编程智能体`、`任务驱动`、`分层提示`、`证据可追溯`、`初中信息课`、`和智能体一起，把思路写成程序`、学生/教师登录、学习路径、`只给分层提示，不代写答案`、身份和登录字段。

有意省略：原图中的“记住我”“忘记密码”“用户协议”“隐私政策”，因为仓库没有对应行为，本切片禁止伪造功能。保留参考图未展示的“班级码登录”，因为它是现有学生登录能力。

## Remaining intentional deviations

- 按用户要求，用当前原创编程猫工作台替换源图里的小海龟和复古橙色电脑；构图角色仍是中央 3D 学习伙伴。
- IAB 本轮固定 1280 × 720，无法取得 1586 × 992、1024 或 390 的浏览器截图。相关断点已做静态布局审计，但原生尺寸/移动端视觉捕获仍是残余测试缺口。
- 仅保留现有登录行为，没有新增找回密码、记住我、协议或后端接口。

## Findings

第三轮没有剩余可执行的 P0、P1 或 P2。残余项均为上面记录的有意产品偏差或工具视口限制。

## Follow-up polish

- [P3] 若后续浏览器支持可变视口，再补 1586 × 992、1024 × 768、390 × 844 三张同状态截图，不需要为此修改当前布局。

final result: passed

## 2026-08-30 左缘接缝清零与可见动效复核

- 用户标注区域：`C:\Users\nuoya\AppData\Local\Temp\codex-clipboard-f1d3dc93-49f1-4fc3-9aee-217311c677a2.png` 中主视觉最左侧窄条。
- 最终桌面截图：`C:\Users\nuoya\.codex\visualizations\2026\08\30\01a05179-22ad-7af2-8473-2d225c4e6954\login-hero-feather-motion-v2-desktop-final.png`（SHA-256 `507FCBE16B018ADBBB36B3F8868CDA436297A2B38AAEE89985BEA5D3D7805C9C`）。
- 移动端截图：同目录 `login-hero-feather-motion-v2-mobile.png`（SHA-256 `2592AEB3117FEC058B7717D8C30E2981A369ACA958D89DC1AEB58B85BF42CB76`）。

### 两轮视觉修正

1. 第一轮把复合遮罩拆成图片径向透明遮罩与 18% 左缘柔化层，并加入编程猫漂浮、背景光晕呼吸和周期性轻扫。1440 × 900 截图整体已有羽化，但逐像素扫描仍在框体左边界 `x=606` 检出 85 个偏蓝像素，说明存在 1px 亚像素接缝。
2. 第二轮在框体增加独立单向 alpha mask：`0%` 完全透明、`2% / 6% / 10%` 逐级过渡、`15%` 后完全不透明。复测同一条边界的偏蓝像素为 0；`y=360`、`x=602..620` 的 RGB 均稳定在约 `248–252`，没有可辨识竖线或矩形裁切感。

### 动效与响应式证据

- 时间样本 A：图片矩阵位移约 `-5.80px`，光晕透明度 `.743`，轻扫 X 位移约 `119.8px`。
- 时间样本 B：图片矩阵位移约 `-8.96px`，光晕透明度 `.974`，轻扫 X 位移约 `253.7px`。三个动画名均存在，说明漂浮、光晕与扫光在页面停留期间持续运行，而非只有不可见的首帧声明。
- 1440 × 900：横向溢出为 0，编程猫图片完整加载（源宽 1536），登录卡保持在动效层上方。
- 390 × 844：`documentWidth = 382 <= viewport 390`，无横向溢出；学生/教师切换与字段更新正常，最终恢复学生状态；控制台 0 errors / 0 warnings。
- `prefers-reduced-motion: reduce` 实测为 true 时，图片和光晕 `animation-name = none`、扫光 `display = none`、图片 `will-change = auto`。
- 独立视觉与动效审查均为 `APPROVE`，无阻断 P0/P1/P2；视觉审查记录“左杯略柔”属于用户要求羽化后的可接受非阻断取舍。

final result: passed

## 2026-08-30 主视觉羽化与动效复核

- 用户标注区域：`C:\Users\nuoya\AppData\Local\Temp\codex-clipboard-871a8e12-9958-4426-bcbc-550ebd11a3dc.png` 中央编程猫矩形图像。
- 桌面截图：`C:\Users\nuoya\.codex\visualizations\2026\08\30\01a05179-22ad-7af2-8473-2d225c4e6954\login-hero-feather-v1-1440.png`（SHA-256 `c93b1e264fd8dc8d76c41f00a9e434625a630dc0b06b1abdbd57c8a20de877bd`）。
- 移动端分段截图：同目录 `login-hero-feather-v1-mobile-top.png`、`login-hero-feather-v1-mobile-bottom.png`。

### 实现对照

- 图片边缘采用带径向回退的双轴透明遮罩：中心主体保持完全清晰，左右在外侧 10% 内渐隐，底部从约 83% 开始柔化，消除原图矩形边界；同时声明 WebKit 与标准 mask 属性。
- 编程猫按断点等比放大：桌面 `1.055`、平板 `1.04`、移动端 `1.025`；未改变图像宽高比，也未遮挡登录卡交互层。
- 主视觉、能力卡、学习路径卡与登录卡采用分层入场；主视觉只做 6.4–7.2 秒、6px 范围的轻呼吸。全部动效只改 `transform` / `opacity`，未动画阴影、滤镜或布局尺寸。
- `prefers-reduced-motion: reduce` 会彻底关闭新增动画并保留静态放大状态，避免无限动画被压缩为 `.01ms` 后高速重复。
- 工程未安装 GSAP；本切片按 GSAP 的合成层与 reduced-motion 原则使用原生 CSS，未新增依赖。

### 浏览器证据

- 1440 × 900：`scrollWidth = 1440`、`scrollHeight = 900`；遮罩和 `hero-enter` / `hero-breathe` / `panel-enter` 均为生效状态，登录卡保持在主视觉上层。
- 390 × 844：`scrollWidth = 390`，无横向溢出；主视觉和表单完整显示。默认应用内浏览器 401 × 694 的顶部/底部分段截图亦无重叠、裁切或重复内容。
- 学生/教师身份切换分别更新 `aria-pressed` 与账号字段；最终恢复学生账号状态。浏览器控制台错误日志为 0。
- 独立只读审查：`APPROVE`，无 P0/P1/P2；CodeRabbit：0 findings。

final result: passed

## 2026-08-30 唯一编程猫入口与真实角色登录复核

- 用户截图中的“AI小海龟”页面与 `web/src/views/Login.vue` 的 Git HEAD 历史实现逐项吻合；它不是另一条当前 Vue 路由。当前工作树与生产构建中的 `/`、`/login` 都只加载编程猫登录页。
- 当前 `Login.vue` 与 `web/dist` 扫描 `AI小海龟`、`mascot_turtle`、`hero_computer`、`点亮计算思维成长指数` 均为 0 匹配；没有删除 `/login` 路由或误删与当前 12210 服务无关的根目录历史原型。
- 将 `web/public/sw.js` 的缓存版本从 `v2` 提升到 `v3` 并重建。Playwright 实测 Cache API 只剩 `jiedui-shell-v3`、`jiedui-assets-v3`，旧 v2 外壳已在 activate 阶段清除；断网刷新 `/login` 仍呈现完整编程猫页，唯一离线控制台信息是未缓存 favicon 的预期网络失败。
- 学生 `xiaoma / 123456`：真实 `POST /api/auth/student/login` 返回 200，后续受保护接口均为 200，最终落到 `/student/studio`。
- 教师 `teacher / 123456`：真实 `POST /api/auth/teacher/login` 返回 200，`GET /api/teacher/home` 返回 200，最终落到 `/teacher/teaching/today`；教师访问 `/student` 被角色守卫送回教师页。
- 在线学生页、教师页与最终编程猫登录页的浏览器控制台均为 0 errors / 0 warnings。独立只读复核结论为 `APPROVE`，P0 = 0、P1 = 0，无需继续修改产品代码。
- 截图：`C:\Users\nuoya\.codex\visualizations\2026\08\30\01a05179-22ad-7af2-8473-2d225c4e6954\login-only-cat-v3.png`（SHA-256 `04C7CB2645E1D5DE1988F5568262BCD3F56469EE8EF1CE4FFEF1B78FDA1A8A24`）、同目录 `student-login-redirect-v3.png`（`AD97774F707B96DC5CADE79D75C917883866653BE389D9193FC0A2F5FC1B9123`）与 `teacher-login-redirect-v3.png`（`E7A757643A282E2D5D6CAA1FD73E151A455B1AFEBBE184E353D4059154496A6C`）。

final result: passed
