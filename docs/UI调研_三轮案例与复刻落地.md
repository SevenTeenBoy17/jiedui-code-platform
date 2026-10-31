# UI 三轮调研与复刻落地（2026-08-17）

> 任务：赴 Godly / Pageflows / Mobbin / uiuxshowcase 等聚合站与一线产品实站，三轮调研、
> 案例 ≥10、择优复刻。本档案记录**每个案例实际拿到了什么**、哪些值是实测、哪些是公开
> 源码知识、以及落进 CX 的五处实现。诚实边界：大厂 SPA 普遍对无头环境断 CSS/JS，
> 能实测的以「✓实测」标注，被拦的以「⛔」标注并注明该案例的知识来源。

## 轮1 · 门户/登录/控制台（对应 CX 登录页与教师端）

| # | 案例 | 状态 | 拿到的东西 |
|---|---|---|---|
| 1 | godly.website → **recent.design** | ✓实测 | Godly 已并入 Recent（uiuxshowcase 词条同证）；截图墙型聚合站，用于选案不用于取值 |
| 2 | uiuxshowcase.com | ✓实测 | 目录站定位确认；其 Godly 词条即指向 Recent |
| 3 | **Linear** /login | ✓实测 | 双层微影 `0 3px 6px -2px @2% + 0 1px 1px @4.3%`；胶囊按钮 13px/500；**150ms 单属性过渡**（不 all） |
| 4 | Stripe 主站 | ⛔半 | hero 确认为 WebGL canvas（不可低成本复刻）；按钮值被懒渲染挡住 |
| 5 | Vercel /login | ⛔ | CSS 被断（拿到的是浏览器默认样式，已识别并弃用） |

## 轮2 · 教育/少儿产品（对应 CX 学生端）

| # | 案例 | 状态 | 拿到的东西 |
|---|---|---|---|
| 6 | **code.org**（K-12 直接同行） | ✓实测 | MUI 底座、6px 圆角、250ms Material 曲线——工艺=库默认值。**作 CX 的底线基准而非上限** |
| 7 | Duolingo | ⛔ | 空壳。其「羽毛按钮」为公开工艺：深一档同色 border-bottom 4px + :active 下沉 |
| 8 | Scratch | ⛔ | 空壳（React 全客户端渲染） |
| 9 | **Arc** (arc.net) | ✓实测 | 下载键 `transform .15s + box-shadow .15s ease-out` 双属性协同上浮；10px 圆角、`0 5px 5px @10%` |
| 10 | **PostHog** | ✓实测 | **同色系深一档描边**（填充 235,157,42 / 描边 177,120,22）让扁平色块立起来；150ms Material 曲线 |

## 轮3 · 交互工艺（微交互的第一手来源）

| # | 案例 | 状态 | 拿到的东西 |
|---|---|---|---|
| 11 | **rauno.me/craft** | ✓实测 | Radix 风格 **alpha 灰阶**（grayA2=黑2.7%…，任何底色成立——与 CX `--ink-a06` 同哲学互证）；`0 30px 60px @12%` 大面影；Exclusion/Flashlight Tabs 滑动指示器 |
| 12 | **Emil Kowalski《7 Practical Animation Tips》** | ✓实测(全文) | 按压 scale(.97)；入场从 scale(.93) 起绝不从 0；tooltip 组内后续零延迟零动画(data-instant)；进出场一律 ease-out；内置曲线太弱用自定义；popover 要 origin-aware |
| 13 | Sonner 演示站 | ⛔ | JS 被拦。其真值属公开源码：堆叠 scale(1-i*0.05)、400ms cubic-bezier(.21,1.02,.73,1)、退出快于入场 |
| 14 | Basecamp / Radix / shadcn | ⛔ | CSS 被断×3（识别为默认样式后放弃取值） |

**环境结论**：能实测的都是「CSS 同源直出」的站（SSG/个人站/老牌 SSR）；CDN 分发 CSS 的
大厂 SPA 在无头环境一律拿到假样式——**取值前必须先验「是不是默认样式」**（13.33px/400 +
2px outset border = 没有样式表，值全不可信），本轮 Vercel/Basecamp/Radix 三次都是这么识别并弃用的。

## 与 CX 现状的对照（调研的最大收获是「验证」而非「推翻」）

- CX `motion.css` 的 `--e-out: cubic-bezier(.22,1,.36,1)` 与 Emil 推荐的强 ease-out
  (.23,1,.32,1) 几乎同曲线；`--d-*` 单一降级入口（reduced-motion/低配全站归零）
  是四个案例里都没有的工程化设计。**动效底座不动。**
- `MilestoneToast` 已满足「入场 scale(.94)+spring、退出更快且 ease-out」——与 Emil
  非对称进出场原则逐条吻合，零改动。
- 真正的缺口只有五处，全部已落地（见下）。

## 五处复刻落地（全部走既有令牌，自动吃 reduced-motion 降级）

| 落地 | 来源案例 | 文件 | 实测验证 |
|---|---|---|---|
| ① `--shadow-sm` 升级双层微影 | Linear 实测值 | tokens.css | 药丸阴影计算值 = `@4.3% + @3%` 双层 ✓ |
| ② BaseButton：transition 指明属性（废 all）+ 全局按压 scale(.97) | Emil tip1 + 复核清单 | BaseButton.vue | CSSOM 见 `.btn:active:not(:disabled){transform:scale(.97)}` ✓ |
| ③ 学生「运行」键 3D 按压（`0 3px 0 --orange-700` 底沿，按下下沉收平） | Duolingo 公开工艺 + PostHog 深描边 | BaseButton.vue | 计算值 `rgb(178,84,0) 0 3px 0` ✓；全库仅学生 IdeView 一处使用（已核） |
| ④ 教师端 zone 切换滑动药丸（::before + :has()，@supports 兜底） | rauno Exclusion Tabs | TeacherShell.vue | 教研侧位移 **86.1667px = calc(100%+3px)** 精确 ✓；:has() 不支持时退回各自白底 |
| ⑤ 两处浮层入场（scale(.97) 起 + ease-out + origin 锚触发器，@starting-style 零 JS） | Emil tips 2/4/5 | StudioView / IdeView | CSSOM 见 CSSStartingStyleRule ✓（Studio 侧同机制） |

## 调试记录（两条值得留的坑）

1. **面板隐藏 = 合成器不出帧 = 过渡冻结在 t=0**：带 transition 的属性改动在隐藏页里
   计算值永远停在起点，看起来像「规则没生效」。判定法：临时 `transition:none !important`
   再采样（本次药丸位移就是这么证实的）。
2. **超时脚本的遗留样式表**：上一个 evaluate 超时会把没来得及 remove 的临时 `<style>`
   （含 !important）留在 head 里，压住真样式——后续采样前先清理。

## 未复刻但记录在案的候选（下轮可用）

- Sonner 堆叠 toast（CX 现在只有单条 MilestoneToast，多条并发时值得引入其堆叠模型）
- rauno Flashlight Tabs（hover 追光高亮，适合教师端表格行）
- Emil tooltip data-instant 组内零延迟（CX 目前全是 title 原生提示，引入自绘 tooltip 时用）
- PostHog 深描边按钮用于学生端 chip 体系（本轮只动了运行键，控制爆炸半径）


---

# 二期 · 工作区布局与主界面减法（2026-08-18）

## 三轮调研（本期 9 案例，两期合计 23）

| # | 案例 | 状态 | 要点 |
|---|---|---|---|
| 15 | **Zed** | ✓实测 | hero 仅 **2 个动作**且各带单键提示（Download`D`/Clone`C`）——键位随动作内联 |
| 16 | **Obsidian** | ✓实测 | 主导航 5 项 |
| 17 | Raycast | ⛔半 | 文本懒渲染；键盘优先哲学为公开知识 |
| 18 | **Linear Method** | ✓实测 | 布局哲学成文（Scope projects down 等章节结构） |
| 19 | **Pageflows** | ✓目录/⛔内容 | /web/screens/dashboard/ 公开目录（Upbase/Neon/Clockify/Jira…）；录像需注册（不注册，如实记） |
| 20 | Mobbin | ⛔403 | 直接拒 |
| 21 | **Warp** | ✓实测 | 主导航 5 项 + 2 CTA |
| 22 | **Craft** | ✓实测 | 中文站；主导航 5 项 |
| 23 | **Notion** | ✓实测 | 分组下拉收纳多目的地 |

**基准**：工作区产品主导航 4–6 项；主区常驻动作 ≤2；低频选择收进下拉/菜单。

## CX 主界面审计（实测计数）

| 界面 | 改前 | 判定 |
|---|---|---|
| 学生 Studio | 17 可见交互 | 快捷词**已是空态专属**（对话开始即让位）——已达标不动；工作台是次级目的地容器非冗余页 |
| 学生 IDE | 18 | **语言 3 常驻按钮**（课堂级低频）与**保存主栏按钮**是加法项 → 本期动它 |
| 教师 今日 | 15（主区仅 4 统计瓦） | 已够瘦不动；7 项侧栏菜单各承独立功能，暂不合并 |

## 二期落地（前后端联动）

1. **语言 3 按钮 → 1 个下拉**（−2 交互位；与作品选择 select 形态统一；Zed/编辑器把语言收状态栏的同款心智）
2. **运行即自动保存**：run() 并行触发 saveVersion，成功即 `已自动保存 vN`；
   **刻意不发 save 埋点**——ct_events 里 save 的研究语义是「学生主动保存」，系统行为混入即污染数据流
3. **保存到云端 → ⋯ 菜单**（−1 主栏位；手动保存降为兜底，功能不减）
4. **后端 save_version 内容去重**（与最新版一致→不落行、幂等返回既有版本号）——
   既防自动保存刷版本，又是 **uptake U4 登记过的前置**：「Δ 内有新版本」从「是否恰好点了保存」
   变成「代码是否变了」的函数

## 实测验证
运行→POST /versions→`已自动保存 v2`；同代码二次运行→服务端 changed:false→tip 不动（去重生效）；
⋯ 菜单含 保存到云端/上传/下载；pytest 340 passed（+1 去重回归）；build ✓。
IDE 主栏交互位 18→15（编辑器内部元素除外）。
