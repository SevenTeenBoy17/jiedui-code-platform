# 校验 workflow 产出的 SVG（well-formed + 配色白名单 + 禁用项），补齐缺失 3 个，落盘到 src/assets/builtin/
import json, os, re, sys
from xml.dom import minidom

OUT_JSON = r"C:\Users\nuoya\AppData\Local\Temp\claude\D--Code-CodeAgent\e586b3f2-84c9-48d7-a1d1-6f1249954177\tasks\wd33lhwcr.output"
DEST = os.path.join(os.path.dirname(__file__), "..", "src", "assets", "builtin")
os.makedirs(DEST, exist_ok=True)

ALLOWED = {"#4A90E2", "#2F6FB0", "#F5A623", "#FFD66B", "#2EC4B6", "#1F2A44", "#FFFFFF", "#EEF3FF"}
FORBIDDEN = ["<script", "<image", "lineargradient", "radialgradient", "<filter", "url("]

# 手工补齐 3 个被限流的元素（同一调色板、扁平卡通）
HAND = {
    "badge_star": '<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg"><g stroke-linecap="round" stroke-linejoin="round"><path d="M38 58 L32 86 L44 78 L46 70 Z" fill="#4A90E2" stroke="#2F6FB0" stroke-width="3"/><path d="M58 58 L64 86 L52 78 L50 70 Z" fill="#2EC4B6" stroke="#2F6FB0" stroke-width="3"/><circle cx="48" cy="40" r="26" fill="#FFD66B" stroke="#F5A623" stroke-width="4"/><path d="M48 24 L53.5 36 L66 37.5 L56.5 46 L59 58.5 L48 52 L37 58.5 L39.5 46 L30 37.5 L42.5 36 Z" fill="#FFFFFF" fill-opacity="0.9" stroke="#F5A623" stroke-width="3"/></g></svg>',
    "empty_projects": '<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg"><g stroke-linecap="round" stroke-linejoin="round"><rect x="46" y="20" width="36" height="30" rx="5" fill="#FFFFFF" stroke="#2F6FB0" stroke-width="4"/><line x1="64" y1="50" x2="64" y2="62" stroke="#2F6FB0" stroke-width="4"/><line x1="54" y1="68" x2="74" y2="68" stroke="#2F6FB0" stroke-width="4"/><path d="M52 36 h24 M52 42 h16" fill="none" stroke="#EEF3FF" stroke-width="3"/><ellipse cx="26" cy="60" rx="18" ry="14" fill="#2EC4B6" stroke="#1F2A44" stroke-width="4"/><circle cx="34" cy="46" r="11" fill="#FFD66B" stroke="#1F2A44" stroke-width="4"/><circle cx="34" cy="46" r="6.5" fill="none" stroke="#2F6FB0" stroke-width="2.5"/><circle cx="33" cy="45" r="2.4" fill="#1F2A44"/><path d="M30 52 q4 3 8 1" fill="none" stroke="#1F2A44" stroke-width="3"/></g></svg>',
    "empty_tasks": '<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg"><g stroke-linecap="round" stroke-linejoin="round"><rect x="40" y="22" width="34" height="44" rx="5" fill="#FFFFFF" stroke="#2F6FB0" stroke-width="4"/><rect x="50" y="18" width="14" height="9" rx="3" fill="#F5A623" stroke="#2F6FB0" stroke-width="3"/><path d="M47 36 h20 M47 45 h20 M47 54 h13" fill="none" stroke="#EEF3FF" stroke-width="3"/><ellipse cx="28" cy="64" rx="16" ry="13" fill="#2EC4B6" stroke="#1F2A44" stroke-width="4"/><circle cx="32" cy="50" r="10" fill="#FFD66B" stroke="#1F2A44" stroke-width="4"/><circle cx="31" cy="49" r="2.2" fill="#1F2A44"/><path d="M28 55 q4 3 8 1" fill="none" stroke="#1F2A44" stroke-width="3"/></g></svg>',
}

def lint(key, svg):
    errs = []
    try:
        minidom.parseString(svg.encode("utf-8"))
    except Exception as e:
        errs.append("not-wellformed: " + str(e)[:60])
    if "viewBox=\"0 0 96 96\"" not in svg:
        errs.append("bad-viewBox")
    low = svg.lower()
    for f in FORBIDDEN:
        if f in low:
            errs.append("forbidden:" + f)
    bad = {c.upper() for c in re.findall(r"#[0-9A-Fa-f]{6}", svg)} - ALLOWED
    if bad:
        errs.append("palette:" + ",".join(sorted(bad)))
    return errs

data = json.load(open(OUT_JSON, encoding="utf-8"))["result"]
items = {r["key"]: r["svg"] for r in data if r.get("svg")}
items.update(HAND)

ok, bad = [], []
for key in sorted(items):
    svg = items[key].strip()
    errs = lint(key, svg)
    if errs:
        bad.append((key, errs))
    else:
        open(os.path.join(DEST, key + ".svg"), "w", encoding="utf-8").write(svg)
        ok.append(key)

out = sys.stdout
out.write("WROTE %d: %s\n" % (len(ok), ", ".join(ok)))
out.write("BAD %d:\n" % len(bad))
for k, e in bad:
    out.write("  %s -> %s\n" % (k, "; ".join(e)))
