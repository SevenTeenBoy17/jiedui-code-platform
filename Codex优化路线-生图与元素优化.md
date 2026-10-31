# Codex 优化路线文档 · 生图与元素优化（S7 重点）

> 定位：本文是**交给 Codex（或任何在有网环境运行的编码 Agent）直接执行**的优化路线，重点是
> **图像/元素生成（提示词 → 生成 → 调整调试 → 验收）**，并附其他优化项的路线。
> 适用工程：`D:\VB\jiedui-code-platform\CX\web`（Vue3+TS+Vite，S1–S6 已建成可运行）+ `CX\server`（FastAPI）。
> 进度上下文见 `CX/开发实施总纲与进度日志.md`（SSOT）。本文对应路线图 **S7（§4.10/§4.11/§4.5 3D 形象）**。

---

## 0. 为什么交给 Codex 执行（环境约束）
本机环境对 `gpt-agent.cc` 的 **图像端点 `/v1/images/generations` 间歇不可达**（实测 45s 超时；LLM `/v1/messages` 间歇可达）。因此**素材生成需在网络可达的环境（Codex 运行环境）执行**。本文给出可直接运行的脚本与逐元素提示词；Codex 跑通后将产物落到 `CX/web/src/assets/generated/` 并按 §2.5 集成、§2.6 验收即可。

**已知必踩坑（先读，避免返工）：**
- **端点可达性间歇** → 生成脚本必须带**重试 + 并发限流 + 失败不阻塞其余**（§2.4 已内置）。
- **中文经 shell/curl 易乱码** → 一律用脚本（`json.dumps` UTF-8）调用，勿用 `curl -d '中文'`。
- **Windows 端口排除区间 7981–8180** → 后端用 9099（已就位），新服务避开该区间。
- **SQLite 事务**：写后读需先退出 `with _conn()`（提交）再读（store.py 已修）。

---

## 1. 设计基线（生成的素材必须吻合）
- **配色（取 `CX/web/src/styles/tokens.css`）**：教育蓝 `#4A90E2`(主) + 暖橙 `#F5A623`(强调/运行/小龟) + 青绿 `#2EC4B6`(成功) + 文本 `#1F2A44`；学生端背景 `#F7FAFF`，教师端 `#F4F7FB`。
- **风格**：卡通 3D 渲染、粗描边、圆润可爱、glossy、柔和投影、儿童友好；主题=**初中编程 / 小海龟**；**干净白底**便于抠图、**居中单主体、无文字水印**。
- **师生区分**：学生端活泼 pastel + 暖橙 + 吉祥物；教师端浅色数据大屏、蓝绿、专业。
- **当前占位（需被素材替换）**：`AiTutorPanel.vue` 用 `🐢/🤖` emoji 头像；`Login.vue`/`StudentShell.vue` 用 `🐢` emoji；`TurtleCanvas`/瓷片等暂无插画。

---

## 2. 生图 / 图像元素优化（重点）

### 2.1 技术路线
- **模型**：`gpt-image-2`；**端点**：`{AI_API_BASE_URL}/images/generations`（OpenAI 兼容）；默认 `AI_API_BASE_URL=https://gpt-agent.cc/v1`、`AI_API_KEY=${AI_API_KEY}（见 server/.env，不入库）`（与 `CX/server/.env`/`app/ai.py` 一致；**生产改环境变量注入**）。
- **请求体**：`{"model":"gpt-image-2","prompt":<str>,"size":"1024x1024","n":1}`；部分代理支持 `"background":"transparent"`，不支持则回退 §2.4 的本地抠图。
- **响应**：`data[0].b64_json`（优先）或 `data[0].url`。
- **产物目录**：`CX/web/src/assets/generated/*.png`；**统一 512px、PNG、透明底**。

### 2.2 素材清单（逐元素）
| 文件名 | 用途 | 放置组件 | 透明底 |
|---|---|---|---|
| `mascot_turtle.png` | 小海龟吉祥物（品牌/登录/空状态） | `Login.vue`、`StudentShell` brand | 是 |
| `tutor_turtle.png` | **小龟导师**(Driver 支架，鼓励/拆解) | `AiTutorPanel` assistant 头像(turtle) | 是 |
| `tutor_robot.png` | **智伴导师**(Navigator 支架，审查/检查清单) | `AiTutorPanel` assistant 头像(reviewer) | 是 |
| `tutor_turtle_think.png`/`_cheer.png` | 小龟思考/庆祝表情（可选多态） | AI 面板状态 | 是 |
| `teacher_turtle.png` | 教师端 3D 形象（海龟老师/讲台） | 教师 `DashboardView` 欢迎区 | 是 |
| `hero_computer.png` | 登录页 3D 橙色复古电脑（屏显海龟画布） | `Login.vue` hero | 是 |
| `tile_python/cpp/c/template/task/ai/report.png` | 瓷片区 3D 图标 | 学生工作台瓷片(待建 BentoGrid) | 是 |
| `ct_decompose/abstract/model/algorithm/verify/transfer.png` | 计算思维六维徽章图标 | `ThinkingView` 六维图例 | 是 |
| `empty_projects/empty_tasks.png` | 空状态插画 | 作品/任务空态 | 是 |
| `badge_star.png` | 成就徽章 | 成长档案 | 否(可白底) |

### 2.3 统一风格 Prompt 规范（所有元素拼接此前缀）
```
卡通3D渲染，粗描边，圆润可爱，glossy质感，柔和投影；
主色 教育蓝#4A90E2 + 暖橙#F5A623 + 青绿#2EC4B6；
干净纯白背景（便于抠图），居中，单一主体，无任何文字与水印；
面向初中生编程教育，小海龟主题，高质量。
主体：<element-specific>
```

### 2.4 逐元素提示词（element-specific，填入上面 `<主体>`）
| key | element-specific 提示词 |
|---|---|
| `mascot_turtle` | 一只友好的绿色小海龟，戴圆框眼镜，穿橙色卫衣，怀抱一台笔记本电脑，屏幕有 `</>` 代码符号，大眼睛微笑，贴纸风 |
| `tutor_turtle` | 一只蓝橙配色的小海龟程序员，背壳有发光的电路/代码纹理，活泼地竖起大拇指鼓励，戴耳机，动感 |
| `tutor_robot` | 一个白蓝色卡通小机器人/书本精灵，戴小眼镜，一手拿放大镜一手拿检查清单(checklist)，沉稳友好 |
| `tutor_turtle_think` | 小海龟单手托腮思考，头顶一个发光小灯泡 |
| `tutor_turtle_cheer` | 小海龟双手举起欢呼庆祝，周围彩色纸屑 |
| `teacher_turtle` | 一只戴眼镜系橙色领带的海龟老师，手持教鞭站在小黑板旁，鼓励姿态 |
| `hero_computer` | 一台橙色复古台式电脑悬浮，屏幕里显示小海龟画的彩色几何图形，旁边漂浮着齿轮/星星等小元素，等距视角 |
| `tile_python` | 一条蓝色卡通蟒蛇盘成图标 | 
| `tile_cpp` | 印着 `C++` 的发光积木方块图标(无其它文字) |
| `tile_c` | 印着 `C` 的发光积木方块图标 |
| `tile_template` | 彩色模板文件夹图标 | `tile_task` 带勾的任务清单图标 | `tile_ai` 对话气泡内有小海龟图标 | `tile_report` 柱状图报表图标 |
| `ct_decompose` | 彩色拼图块被拆分，分解概念，圆角徽章 |
| `ct_abstract` | 半透明叠层加一颗星，抽象概念，圆角徽章 |
| `ct_model` | 流程图/思维导图节点连线，建模概念，圆角徽章 |
| `ct_algorithm` | 互锁齿轮形成步骤序列，算法概念，圆角徽章 |
| `ct_verify` | 友好的小虫加放大镜和扳手，调试验证概念，圆角徽章 |
| `ct_transfer` | 一个解法箭头迁移到新场景，迁移概念，圆角徽章 |
| `empty_projects` | 小海龟望着空空的画板，温馨 | `empty_tasks` 小海龟拿着空任务清单，轻松 |
| `badge_star` | 金色五角星奖章带丝带，闪光 |

> 注：瓷片/积木上的 `C`/`C++` 等极简标识可保留；其余一律"无文字"，避免模型把中文渲染坏。

### 2.5 生成脚本（Codex 直接运行）

**① 生成 `CX/web/scripts/gen-assets.py`**（带重试 + 并发限流 + 失败不阻塞）：
```python
import os, json, base64, urllib.request, concurrent.futures, time
KEY = os.getenv("AI_API_KEY", "${AI_API_KEY}（见 server/.env，不入库）")
BASE = os.getenv("AI_API_BASE_URL", "https://gpt-agent.cc/v1")
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "generated")
os.makedirs(OUT, exist_ok=True)
STYLE = ("卡通3D渲染,粗描边,圆润可爱,glossy,柔和投影;主色 教育蓝#4A90E2+暖橙#F5A623+青绿#2EC4B6;"
         "干净纯白背景便于抠图,居中,单一主体,无文字无水印;初中编程教育,小海龟主题,高质量。主体：")
ASSETS = {
  "mascot_turtle": "友好的绿色小海龟,戴圆框眼镜,橙色卫衣,抱笔记本电脑屏幕有</>,大眼微笑,贴纸风",
  "tutor_turtle": "蓝橙小海龟程序员,背壳发光电路纹,竖大拇指鼓励,戴耳机",
  "tutor_robot": "白蓝卡通小机器人,戴小眼镜,一手放大镜一手检查清单,沉稳友好",
  "teacher_turtle": "戴眼镜系橙色领带的海龟老师,手持教鞭站小黑板旁,鼓励姿态",
  "hero_computer": "橙色复古台式电脑悬浮,屏内显示小海龟画的彩色几何图形,周围漂浮齿轮星星,等距视角",
  "tile_python": "蓝色卡通蟒蛇盘成图标", "tile_cpp": "印着C++的发光积木方块",
  "tile_c": "印着C的发光积木方块", "tile_template": "彩色模板文件夹图标",
  "tile_task": "带勾的任务清单图标", "tile_ai": "对话气泡内有小海龟图标", "tile_report": "柱状图报表图标",
  "ct_decompose": "彩色拼图块被拆分,圆角徽章", "ct_abstract": "半透明叠层加一颗星,圆角徽章",
  "ct_model": "流程图节点连线,圆角徽章", "ct_algorithm": "互锁齿轮序列,圆角徽章",
  "ct_verify": "友好小虫加放大镜扳手,圆角徽章", "ct_transfer": "解法箭头迁移到新场景,圆角徽章",
  "empty_projects": "小海龟望着空画板,温馨", "empty_tasks": "小海龟拿空任务清单,轻松",
  "badge_star": "金色五角星奖章带丝带闪光",
}
def gen(name, desc, tries=3):
    body = {"model": "gpt-image-2", "prompt": STYLE + desc, "size": "1024x1024", "n": 1}
    for i in range(tries):
        try:
            req = urllib.request.Request(BASE.rstrip("/") + "/images/generations",
                data=json.dumps(body).encode(), method="POST",
                headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
            it = json.loads(urllib.request.urlopen(req, timeout=120).read())["data"][0]
            p = os.path.join(OUT, name + ".png")
            if it.get("b64_json"): open(p, "wb").write(base64.b64decode(it["b64_json"]))
            elif it.get("url"): urllib.request.urlretrieve(it["url"], p)
            return f"OK  {name} ({os.path.getsize(p)}B)"
        except Exception as e:
            if i == tries - 1: return f"FAIL {name}: {type(e).__name__} {str(e)[:80]}"
            time.sleep(2 * (i + 1))
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
    for r in [f.result() for f in [ex.submit(gen, n, d) for n, d in ASSETS.items()]]:
        print(r, flush=True)
```
运行：`python CX/web/scripts/gen-assets.py`

**② 透明化 + 压缩 `CX/web/scripts/post-assets.py`**（四角洪水去白底 + 512 缩放，依赖 Pillow）：
```python
import glob, os
from PIL import Image, ImageDraw
DIR = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "generated")
for p in glob.glob(os.path.join(DIR, "*.png")):
    im = Image.open(p).convert("RGBA"); w, h = im.size
    already = sum(im.split()[3].histogram()[:10]) / (w * h) > 0.05
    if not already:
        rgb = im.convert("RGB")
        for c in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
            if min(rgb.getpixel(c)) >= 235:
                ImageDraw.floodfill(rgb, c, (255, 0, 254), thresh=42)
        src, rp = im.load(), rgb.load()
        for y in range(h):
            for x in range(w):
                if rp[x, y] == (255, 0, 254):
                    r, g, b, _ = src[x, y]; src[x, y] = (r, g, b, 0)
    im.thumbnail((512, 512), Image.LANCZOS)
    im.save(p, "PNG", optimize=True)
    print("post", os.path.basename(p))
```
运行：`python CX/web/scripts/post-assets.py`

### 2.6 集成（替换 emoji/占位）
**① 新建 `CX/web/src/assets/assets.ts`（动态装载 + 缺失回退，零构建报错）：**
```ts
const mods = import.meta.glob('./generated/*.png', { eager: true, import: 'default' }) as Record<string, string>
const map: Record<string, string> = {}
for (const k in mods) map[k.split('/').pop()!.replace('.png', '')] = mods[k]
export function asset(name: string, fallback = 'mascot_turtle'): string { return map[name] || map[fallback] || '' }
export const hasAsset = (n: string) => !!map[n]
```
**② 替换占位（关键点，逐处改）：**
- `src/components/editor/AiTutorPanel.vue`：assistant 头像 `{{ role==='turtle'?'🐢':'🤖' }}` → `<img :src="asset(role==='turtle'?'tutor_turtle':'tutor_robot')" />`（缺图回退 emoji）。
- `src/views/Login.vue`：`.mascot 🐢` → `<img :src="asset('mascot_turtle')" class="mascot-img"/>`；hero 区加 `hero_computer`。
- `src/layouts/StudentShell.vue` brand、`src/views/student/ThinkingView.vue` 六维图例(`ct_*`)、空状态(`empty_*`)、教师 `DashboardView` 欢迎区(`teacher_turtle`)。
- 3D 形象落地：当前用 2D PNG（低配友好）；进阶可 Live2D/Three.js GLTF（懒加载、`prefers-reduced-motion` 降级，见 §3.2）。

### 2.7 调整 / 调试（常见问题修法）
| 现象 | 修法 |
|---|---|
| 端点超时/间歇失败 | gen 脚本已带重试+限流；可降 `max_workers=1`、加 `time.sleep`；换网络环境重跑（仅补失败项：脚本对已存在文件可加跳过判断） |
| 抠图后白边/啃边 | `post-assets` 的 `thresh` 调 30–50；边缘半透明可加 1px 收边；个别复杂图改人工 |
| 风格漂移（不像3D/配色偏） | Prompt 前缀加权重词、固定 `size`；同一元素多生成几张选优 |
| 模型把中文渲染坏 | 元素一律"无文字"；必须的标识只留 `C/C++/</>`等 ASCII |
| 体积过大 | `post-assets` 512+optimize；必要时转 webp |
| 头像在圆形容器里露白角 | 容器 `overflow:hidden;border-radius:50%` + 素材透明底 |

### 2.8 验收标准（逐元素 + 整体）
**逐元素（每个 PNG 均须满足）：**
1. 风格统一：卡通3D/粗描边/教育蓝+暖橙+青绿，与既有基线一致；
2. **透明底**（≤5% 非透明四角）、**≤512px**、**≤300KB**、PNG；
3. 单一主体、居中、**无错误文字/水印**；
4. 经 `assets.ts` 可加载，**缺失自动回退**不白屏；
5. 落到目标组件且显示正常（AI 头像/登录/六维/教师/瓷片）。

**整体：**
6. 师生端视觉明显区分；7. 替换后 `npm run build` + `npm run typecheck` 通过；8. AI 面板/登录/思维成长/教师端**目视**与设计基线一致；9. 低配/移动端图像懒加载、不拖慢首屏（§3.2）。

---

## 3. 其他需在 Codex 中优化的路线

### 3.1 UI 高保真还原（§4.10）
- 建 **BentoGrid 瓷片区**学生工作台（用 `tile_*` 素材 + `BentoTile`，参考 `UI瓷片区样式.jpg`）。
- **登录页** Pixel-Rise 风改造：嵌 `hero_computer`，"成长指数"文案。
- 教师端按 `教师后端界面2.jpg` 预警系统补**班级分布/学生关怀**卡。
- 组件零硬编码色值（全走 `tokens.css`），验收：改令牌全站联动。

### 3.2 移动端 / 低配 / PWA（§4.11）
- `vite-plugin-pwa` 接管 SW（重资源 CacheFirst 版本化 + 离线外壳 + 不打断更新）。
- `useDeviceCapability`（deviceMemory/CPU/网络/reduced-motion → low/mid/high）+ 降级 store：3D→2D、Pyodide 低配转后端、Monaco 关 minimap、ECharts 关动画。
- IDE 窄屏：三区 Tab/AI 底部抽屉/触摸 ≥44px；首屏 < 3MB（Monaco/Pyodide/echarts/blockly 已分包懒加载）。

### 3.3 S6-2 班级/任务管理 + 脱敏研究导出
- 班级表 + 任务下发（可复用 CodeAgent 模式：`classes/assignments` + 进度由真实提交驱动）。
- `GET /api/research/export`（researcher 角色）：去标识化（user_id→哈希、去 PII）导出 ct_events/observations/作品演化，供论文（§4.9 §6.4）。

### 3.4 生产硬化
- **代码执行容器化**：当前 `executor.py` 为子进程（开发级）；生产改 Docker + seccomp + ulimit + 禁网（§4.2 spec §3 已给 Dockerfile/seccomp/run-wrapper）。
- **托管 DB**：SQLite→PostgreSQL（store.py 抽象 repository）。
- **真实 LLM/图像端点**：`gpt-agent.cc` 间歇可达；生产配稳定供应商 + 密钥经环境变量；AI 已有 fallback，图像生成应**离线预生成**入库（本文 §2 即一次性预生成）。
- JWT 升 RS256 + `aud` 严格校验（§4.4 spec）；CORS 白名单；演示密码移出 seed。

### 3.5 性能 / 可访问性
- Lighthouse：LCP<2.5s、PWA 通过；中文字体子集化 + `font-display:swap`。
- WCAG AA：对比度、焦点态（`:focus-visible` 已全局）、图标按钮 `aria-label`、图像 `alt`。

---

## 4. 执行顺序与里程碑（建议）
1. **M1 生图**：在有网环境跑 §2.5 ①②，产出 `generated/*.png`，按 §2.6 集成，过 §2.8 验收。
2. **M2 UI 还原**：§3.1 瓷片区/登录/教师卡。
3. **M3 适配**：§3.2 PWA/移动/低配。
4. **M4 收尾**：§3.3 班级任务+脱敏导出；§3.4 生产硬化；§3.5 性能/可访问性。

## 5. 总验收清单（勾验）
- [ ] 全部素材生成、透明/压缩、经 `assets.ts` 集成、缺失回退（§2.8）
- [ ] AI 双导师/登录/思维成长/教师端用真实 3D 素材，师生视觉区分
- [ ] `npm run build` + `npm run typecheck` 通过；首屏 < 3MB；移动端可用
- [ ] 班级/任务 + 脱敏研究导出可用；生产硬化项按 §3.4 完成或登记
- [ ] 对照课题 6 维 + 安全伦理逐条达成（见 `开发实施总纲与进度日志.md`）

> 备注：本文所有脚本/提示词均可直接复制运行；图像端点不可达时仅 M1 受阻，其余 M2–M4 可并行推进。
