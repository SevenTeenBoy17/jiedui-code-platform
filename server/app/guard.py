"""
未成年人安全护栏（S5 §4.9）：输入阶段 PII 匿名 + 敏感词 + 危险话题分级。
原则：默认拒绝偏保守、进 LLM 前阻断高危、可审计。词库为演示级，生产应外置可热更新。
"""
import re
import unicodedata

# —— PII 正则（中文场景，可逆匿名）——
# 顺序与边界都要命（2026-08-03 在姊妹项目实测发现、回灌本项目）：
# ① **idcard 必须排在 phone 前**：18 位身份证里嵌的 11 位数字会先被手机正则吃掉，
#    身份证只剩两端碎片半裸露（实测 11010119900307123X → 110101[phone_1]X）。
#    `(?<!\d)…(?!\d)` 保证不在更长数字串中间误匹配。
# ② QQ 前缀与号码之间会有中文助词：「我qq**是** 123456789」「QQ**号码**：…」。
#    原来只允许 `[:：\s]*`，这两种最常见的中文写法直接漏过，号码原样送进 LLM。
# 分隔符：中文场景里手机号/身份证极少连着打，「139-0013-8000」是运营商官方写法，
# 「138 0013 8000」是手写抄录的默认习惯。红队实测这三种分隔写法**全部漏网**。
_SEP = r"[\s\-—－‐–]?"

PII = [
    ("idcard", re.compile(rf"(?<!\d)\d{{6}}{_SEP}\d{{8}}{_SEP}\d{{3}}[\dXx](?!\d)")),
    ("phone", re.compile(rf"(?<!\d)1[3-9](?:{_SEP}\d){{9}}(?!\d)")),
    ("email", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")),
    ("qq", re.compile(r"(?:QQ|qq|Qq|qQ|扣扣|企鹅)[\s的是为:：号码]{0,4}(\d{5,12})(?!\d)")),
    # 微信号：中文互联网第一大社交 ID，此前词表里**完全没有**。
    # 规则按腾讯的：字母开头，6~20 位字母/数字/下划线/减号。
    ("wechat", re.compile(
        r"(?:微信|威信|v信|V信|VX|vx|Wx|wx|weixin|WeChat|wechat)"
        r"[\s的是为:：号码同]{0,4}([A-Za-z][-_A-Za-z0-9]{5,19})(?![A-Za-z0-9_-])")),
]

# —— 危险话题分级（类别 → (关键词, 等级)）。L4=锁定+通知, L3=阻断+记录, L2=阻断引导 ——
DANGER = {
    # 英文与委婉表达是红队实测点出的漏网：`suicide`/`kill myself` 零成本可加；
    # 「活着没意思」「想解脱」是中文里比「自杀」更常见的表达方式 —— 说得出「自杀」
    # 两个字的孩子往往已经是少数，词表只认直球等于只拦住最不需要拦的那部分。
    "self_harm": (["自杀", "自残", "割腕", "不想活", "轻生", "想死", "结束生命",
                   "想解脱", "活着没意思", "活着没劲", "不想上学了不想活",
                   "suicide", "kill myself", "killmyself", "end my life", "endmylife",
                   "self harm", "selfharm", "cut myself"], 4),
    "violence": (["杀了他", "炸学校", "报复社会", "弄死", "砍人"], 4),
    "fraud": (["赌博", "刷单", "洗钱", "博彩"], 3),
    "adult": (["色情", "约炮", "黄片", "裸聊"], 2),
}
# —— 敏感词（脏话/侮辱，命中 → 打码或阻断）——
SENSITIVE = ["傻逼", "滚蛋", "去死"]


def anonymize(text: str):
    """可逆匿名：原值映射到 token，落库/送 LLM 用 token。"""
    mapping = {}
    out = text
    for kind, pat in PII:
        def repl(m):
            raw = m.group(1) if m.lastindex else m.group(0)
            tok = f"[{kind}_{len(mapping) + 1}]"
            mapping[tok] = raw
            return tok if not m.lastindex else m.group(0).replace(raw, tok)
        out = pat.sub(repl, out)
    return out, mapping


# 编程课上会正当出现的语境：模拟概率、统计随机事件。命中这些词时把 fraud 降一级，
# 否则「写个程序模拟赌博游戏的中奖概率」这种正经课题提问会被当成涉赌拦掉。
FRAUD_OK_CONTEXT = ["概率", "模拟", "统计", "随机", "期望值", "蒙特卡洛", "数学"]


# 匹配前先归一化。实测未归一化时下面这些**全部能绕过**自伤检测：
#   「我 想 自 杀」（半角空格）「我想自　杀」（全角空格）「我想自-杀」（插入连字符）
#   「我想⾃杀」（康熙部首 U+2F00 等兼容汉字）
# 一个 12–15 岁的学生随手打空格就绕过了，这不是"高级对抗"，是最基本的情况。
_NOISE = str.maketrans("", "", " \t　-_·.．*~^…、​‌‍")


def normalize(text: str) -> str:
    # NFKC 把兼容汉字/全角字符折叠成标准形式，再去掉常见的插入噪声
    return unicodedata.normalize("NFKC", text or "").translate(_NOISE).lower()


def classify_danger(text: str):
    """按类分别留下命中，最后取最高的那一类。

    原来只留 `cat/level` 一对（边扫边取最高），再对 `cat == "fraud"` 做语境降级 ——
    改的却是**全局** level。于是「模拟」「概率」这类词能把整句清零：
    只要句子里的最高档恰好是 fraud，同一句里定级 2 的涉黄内容就跟着一起放行。
    构造成本近乎为零（加「模拟」两个字），这种东西会在学生之间口耳相传。
    降级只应作用于 fraud 这一类自己。
    """
    text = f"{text}\n{normalize(text)}"      # 原文与归一化文本一起匹配，两边都不漏
    hits = {c: lv for c, (words, lv) in DANGER.items()
            if any(w in text or normalize(w) in text for w in words)}
    if "fraud" in hits and any(w in text for w in FRAUD_OK_CONTEXT):
        hits["fraud"] = 1              # 放行（仍会留痕给老师），不挡正经的概率模拟题
    if not hits:
        return None, 0
    return max(hits.items(), key=lambda kv: kv[1])


def check_input(text: str) -> dict:
    """返回 {allowed, category, level, action, scrubbed, pii_count}。

    L2（如涉黄）曾经只在第 15 行注释里声明「阻断引导」却没有对应分支，
    直接落到放行，连 category/level 都被写回 None/0 —— 词库里定级 2 的那一类等于没写。
    """
    cat, level = classify_danger(text)
    if level >= 2:
        return {"allowed": False, "category": cat, "level": level,
                "action": "lock" if level >= 4 else ("block" if level >= 3 else "guide")}
    norm = normalize(text)
    for w in SENSITIVE:
        if w in text or normalize(w) in norm:
            return {"allowed": False, "category": "profanity", "level": 1, "action": "block"}
    scrubbed, mapping = anonymize(text)
    return {"allowed": True, "category": None, "level": 0, "action": "pass",
            # 降级放行的（如概率模拟题里的"赌博"）仍留一条低等级痕迹给老师，但不挡学生
            "soft_flag": {"category": cat, "level": level} if level == 1 and cat else None,
            "scrubbed": scrubbed, "pii_count": len(mapping)}


def check_bundle(message: str, code: str = "", history: str = "") -> dict:
    """对「这次请求送进 LLM 的全部文本」过闸，但**按来源分别施策**。

    - 阻断判定只看 `message`（本轮发言）。曾经把 message+code+history 拼起来取最大等级：
      学生早前说过一句「这题难得我想死」，之后每一轮正常提问都会被判成自伤 L4 —— 当堂失去
      AI 支架、教师端刷出一串原文是「for 循环为什么只跑一次」的高危预警。危险**意图**要看
      当前这句话，不是看聊天记录。
    - `code` 里的高危内容不阻断编程（那会让学生连问都不能问），但 L4 会静默记一条给老师看。
    - 三段都做 PII 匿名 —— 隐私不出域这条与阻断无关，必须全覆盖。
    """
    v = check_input(message)
    if not v["allowed"]:
        v["hit_in"] = "message"
        return v
    cat, lv = classify_danger(code or "")
    # 把**命中的原文**一起带出去。此前 ai.py 给这条留痕写的是 req.message，于是老师
    # 在教师端看到的是 `self_harm / L4 / "老师，这个 for 循环为什么只跑一次？"` ——
    # 真正写在代码注释里的那句话从未落库。效果是训练老师把 L4 当噪音，
    # 那正好是这条红线最不该出的岔子。用匿名后的版本，避免 PII 二次落库。
    v["silent_flag"] = ({"category": cat, "level": lv, "where": "code",
                         "excerpt": anonymize(code)[0][:120]} if lv >= 4 else None)
    v["scrubbed_parts"] = [anonymize(p)[0] if p else p for p in (message, code, history)]
    return v
