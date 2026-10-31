# -*- coding: utf-8 -*-
"""F1 生图（gpt-image-2 · gpt-agent.cc）。生成卡通3D素材→ src/assets/generated/*.png。
命名铁律：覆盖类素材沿用现有 SVG 同名 key（assets.ts 按同名覆盖）。带重试+并发限流。
用法：python web/scripts/gen-assets.py [only_key1,only_key2]
"""
import urllib.request, json, base64, os, sys, time, concurrent.futures

# 密钥无兜底值：脚本会被分享、会被贴进文档，写死一次就等于泄漏一次。
# 运行前 set AI_API_KEY=...（或在 server/.env 里配好后由后端读取）。
KEY = os.getenv("AI_API_KEY", "")
if not KEY:
    raise SystemExit("请先设置环境变量 AI_API_KEY 再运行生图脚本")
# 端点优先级（实测：llm-token 21.2s < gpt-agent 33.2s）；前者失败自动回落后者
URLS = [u for u in [os.getenv("AI_IMG_URL"),
                    "https://api.llm-token.cn/v1/images/generations",
                    "https://gpt-agent.cc/v1/images/generations"] if u]
URL = URLS[0]
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "generated")
os.makedirs(OUT, exist_ok=True)

CHAR = ("cute cartoon 3D clay render, glossy soft plastic, rounded kawaii, soft studio lighting, soft shadow, "
        "plain clean white background, centered single character, children education mascot, high quality, no text no watermark. Subject: ")
ICON = ("cute glossy 3D clay render app icon, rounded, soft studio lighting, soft shadow, "
        "plain clean white background, centered single object, children education UI icon, high quality, no watermark. Subject: ")

ASSETS = {
    # —— 覆盖现有 key（同名覆盖 SVG）——
    "mascot_turtle": CHAR + "a friendly green turtle with a small orange hoodie, round glasses, hugging a laptop that shows </> on screen, waving happily",
    "tutor_turtle":  CHAR + "a green turtle programmer wearing an orange hoodie, round glasses and orange headphones, giving a cheerful thumbs up",
    "tutor_robot":   CHAR + "a friendly white-and-blue robot book-sprite tutor with small glasses, holding a magnifier and a checklist, calm and kind",
    "tile_python":   ICON + "a glossy blue cartoon python snake coiled into a rounded icon",
    "tile_cpp":      ICON + "a glossy glowing rounded block with the text 'C++' on it",
    "tile_c":        ICON + "a glossy glowing rounded block with the single letter 'C' on it",
    "tile_ai":       ICON + "a glossy speech bubble with a tiny cute turtle head peeking inside",
    "tile_report":   ICON + "a glossy 3D bar-chart report icon with an upward trend",
    "tile_template": ICON + "a glossy colorful template folder icon",
    # —— 新增 key（登录漂浮元素）——
    "hero_computer": ICON + "a glossy orange retro desktop computer floating, its screen showing colorful geometric shapes drawn by a turtle, isometric",
    "decor_code":    ICON + "a small glossy pastel rounded code block showing </>",
    "decor_star":    ICON + "a small glossy twinkling golden star",
    "decor_gear":    ICON + "a small glossy pastel gear cog",
    # —— 计算思维六维 glossy 徽章（F4，覆盖 ct_* SVG）——
    "ct_decompose":  ICON + "a glossy rounded square badge with colorful puzzle pieces splitting apart",
    "ct_abstract":   ICON + "a glossy rounded square badge with translucent stacked layers and a shining star",
    "ct_model":      ICON + "a glossy rounded square badge with connected flowchart nodes and lines",
    "ct_algorithm":  ICON + "a glossy rounded square badge with three interlocking gears in a row",
    "ct_verify":     ICON + "a glossy rounded square badge with a magnifier and a green check mark",
    "ct_transfer":   ICON + "a glossy rounded square badge with a curved arrow moving a block to a new position",
    # —— 教师端 3D 形象（F4，新增 key）——
    "teacher_turtle": CHAR + "a friendly turtle teacher wearing glasses and a graduation cap, holding a tablet and a pointer, kind and professional",

    # ============ V2 新形象家族（替代海龟：狐狸=驾驶员 / 猫头鹰=领航员）============
    "mate_fox":       CHAR + "an adorable round orange fox character wearing a hoodie and headphones, sitting confidently with paws on a small laptop keyboard, energetic and friendly, the 'doer' partner",
    "mate_fox_cheer": CHAR + "an adorable round orange fox character wearing a hoodie, both paws raised cheering with confetti around, joyful celebration pose",
    "mate_owl":       CHAR + "an adorable round blue-and-white owl character wearing big round glasses, holding a magnifier in one wing and a checklist in the other, calm wise reviewer, the 'thinker' partner",
    "mate_owl_think": CHAR + "an adorable round blue-and-white owl character with glasses, one wing on chin thinking, a glowing lightbulb above its head",
    "mate_duo":       CHAR + "an orange fox and a blue-and-white owl standing side by side as a friendly pair-programming duo, fox holding a laptop, owl holding a checklist, both cheerful, group shot",
    "teacher_owl":    CHAR + "a professional blue owl teacher wearing a graduation cap and glasses, holding a tablet, kind and authoritative",

    # —— 资源中心瓷片图标（V3.5）——
    "tile_video":    ICON + "a glossy rounded play button on a video card with a small screen, media library icon",
    "tile_bank":     ICON + "a glossy rounded question-bank icon: stacked cards with a question mark badge",
    "tile_practice": ICON + "a glossy rounded practice icon: a pencil writing on a checklist with a star",
    "tile_push":     ICON + "a glossy rounded paper plane sending icon with a small sparkle trail",
}

only = set(sys.argv[1].split(",")) if len(sys.argv) > 1 else None


def gen(name, prompt, tries=3):
    for i in range(tries):
        try:
            body = {"model": "gpt-image-2", "prompt": prompt, "size": "1024x1024", "n": 1}
            url = URLS[min(i, len(URLS) - 1)]        # 首选失败后回落备用端点
            req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                         headers={"Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
            it = json.loads(urllib.request.urlopen(req, timeout=120).read())["data"][0]
            p = os.path.join(OUT, name + ".png")
            if it.get("b64_json"):
                open(p, "wb").write(base64.b64decode(it["b64_json"]))
            elif it.get("url"):
                urllib.request.urlretrieve(it["url"], p)
            return "OK   %-16s %.0fKB" % (name, os.path.getsize(p) / 1024)
        except Exception as e:
            if i == tries - 1:
                return "FAIL %-16s %s" % (name, str(e)[:70])
            time.sleep(3 * (i + 1))


items = [(k, v) for k, v in ASSETS.items() if not only or k in only]
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
    for r in [f.result() for f in [ex.submit(gen, k, v) for k, v in items]]:
        print(r, flush=True)
print("DONE", len(items), "assets ->", OUT, flush=True)
