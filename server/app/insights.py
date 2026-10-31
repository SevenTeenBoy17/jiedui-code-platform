"""
AI 学情洞察（V5）：把学生过程数据交给 LLM，产出**可审计的结论卡**。
设计三原则：
 1) 结论先行 + 证据可溯：每张卡 = 一句话结论 + 置信度 + evidence[]（来自真实指标，不是 LLM 编的）
 2) 证据由服务端计算后喂给 LLM，LLM 只负责"归因与建议"，不负责"造数据"
 3) 出闸审核 audit()：拦截绝对化措辞/给学生贴标签/涉隐私，未成年人保护优先
LLM 不可达时回退**确定性规则洞察**，保证教师端始终可用。
"""
import json
import os
import urllib.request

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import store
from app.ai import AI_BASE, AI_KEY, AI_MODEL
from app.auth import current_user
from app.ct import evidence_profile_for, resolve_profile_scope, summary_for

router = APIRouter(prefix="/api/insights", tags=["AI洞察"])

DIM_CN = {"decompose": "分解", "abstract": "抽象", "model": "建模",
          "algorithm": "算法设计", "verify": "验证优化", "transfer": "迁移"}

# 出闸审核：这些措辞不得出现在给教师的结论里（避免给未成年人贴标签）
BANNED = ("笨", "差生", "没救", "智商", "不可能学会", "放弃这个学生", "天生")


def _level_number(value) -> float | None:
    """只比较明确的数值/L1-L4 等级；未知标签不擅自排强弱。"""
    raw = str(value).strip().lower()
    if raw.startswith("l"):
        raw = raw[1:]
    try:
        return float(raw)
    except ValueError:
        return None

SYSTEM = (
    "你是中小学信息科技教研助手。只能基于已确认、可回溯的学情推断分析一名初中生。"
    "行为次数、报错次数、用时和求助次数只是诊断上下文，禁止据此判断能力强弱。"
    "严格要求：①没有已确认推断就明确说证据不足；②面向教师，给可执行的教学建议；"
    "③不得给学生贴负面标签或使用绝对化措辞；④每条结论都要能对应到指标。"
    "只输出 JSON，格式："
    '{"headline":"一句话结论(≤30字)","confidence":0.0-1.0,'
    '"strengths":["优势维度及依据"],"weaknesses":["薄弱维度及依据"],'
    '"suggestions":["给教师的教学建议(≤25字)"],"next_step":"建议下一步练什么(≤20字)"}'
)


def _facts(uid: str, scope: str | None = None, scope_ref: str | None = None) -> dict:
    """服务端计算证据：LLM 只做归因，不造数据。

    用 neutral 口径：抽象维的 ai_helps*5 会让"问得多"的学生看起来抽象能力强，
    而结论卡是要给教师做教学判断的，不能把工具使用量当成能力。
    """
    cs = summary_for(uid, profile="neutral")
    profile = evidence_profile_for(uid, scope, scope_ref)
    levels = profile["levels"] if profile["status"] == "evidence_backed" else {}
    comparable = [(k, v, _level_number(v)) for k, v in levels.items()]
    numbers_known = bool(comparable) and all(n is not None for _, _, n in comparable)
    ordered = ([(k, v) for k, v, _ in sorted(comparable, key=lambda row: row[2])]
               if numbers_known else [])
    risks = [r for r in store.list_risk_events(200) if r["user_id"] == uid]
    return {
        "行为": {"运行": cs["runs"], "报错": cs["errors"], "修复": cs["fixes"],
                 "求助": cs["ai_helps"], "换位": cs["role_switches"], "设计": cs["designs"],
                 "成功率": f'{cs["success_rate"]}%', "用时分钟": cs["minutes"]},
        "已确认学情": {DIM_CN.get(k, k): v for k, v in levels.items()},
        "最弱两维": [DIM_CN.get(k, k) for k, _ in ordered[:2]] if len(ordered) >= 2 else [],
        "最强两维": [DIM_CN.get(k, k) for k, _ in ordered[-2:]] if ordered else [],
        "安全提醒次数": len(risks),
        "画像状态": profile["status"],
        "推断": profile.get("inferences", []),
        "有真实数据": cs["has_real_data"],
        "_profile": profile,
        "_raw": cs,
    }


def _rule_insight(f: dict) -> dict:
    """LLM 不可达时的确定性洞察（可解释、零成本）。"""
    weak, strong = f["最弱两维"], f["最强两维"]
    if f["画像状态"] != "evidence_backed":
        return {
            "headline": "当前没有足够的可回溯证据形成学情判断",
            "confidence": 0.0, "strengths": [], "weaknesses": [],
            "suggestions": ["先完成带量规与原件的任务，再由教师确认判断"],
            "next_step": "补齐任务证据", "source": "rule",
        }
    head = (f'现有证据支持在{strong[-1]}上的暂定优势'
            if strong else "已有部分证据，仍需教师结合原件判断")
    sugg = [f'围绕「{weak[0]}」安排一次低支架复核'] if weak else ["补充跨任务复核证据"]
    return {
        "headline": head,
        "confidence": max((float(x.get("confidence") or 0) for x in f["推断"]), default=0.0),
        "strengths": [f'{s}：来自已确认推断' for s in strong[::-1]],
        "weaknesses": [f'{w}：来自已确认推断，需继续复核' for w in weak],
        "suggestions": sugg[:3],
        "next_step": f'{weak[0]}类复核任务' if weak else "跨任务复核",
        "source": "rule",
    }


def _call_llm(facts: dict) -> dict | None:
    payload = {
        "model": AI_MODEL, "max_tokens": 900,
        "system": SYSTEM,
        "messages": [{"role": "user", "content": json.dumps(
            {k: v for k, v in facts.items() if not k.startswith("_") and k != "行为"},
            ensure_ascii=False)}],
    }
    try:
        req = urllib.request.Request(
            AI_BASE.rstrip("/") + "/messages", data=json.dumps(payload).encode(), method="POST",
            headers={"x-api-key": AI_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        body = json.loads(urllib.request.urlopen(req, timeout=60).read())
        text = "".join(b.get("text", "") for b in body.get("content", []))
        s, e = text.find("{"), text.rfind("}")
        if s < 0 or e < 0:
            return None
        d = json.loads(text[s:e + 1])
        d["source"] = "llm"
        return d
    except Exception:
        return None


TEXT_FIELDS = ("headline", "strengths", "weaknesses", "suggestions", "next_step", "summary", "profile")


def audit(card: dict) -> dict:
    """出闸审核：命中禁用措辞就把**所有**自由文本字段一并降级。

    曾经只改写 headline / strengths / suggestions 三个字段，weaknesses 与 next_step 原样返回——
    贴标签的原话（"这孩子有点笨…"）照样渲染到教师界面的「薄弱」区，审核漏掉了一半。
    """
    blob = json.dumps(card, ensure_ascii=False)
    hit = [w for w in BANNED if w in blob]
    if hit:
        for k in TEXT_FIELDS:
            if k in card:
                card[k] = [] if isinstance(card[k], list) else ""
        card["headline"] = "该结论未通过内容审核，已改为按指标呈现"
        card["suggestions"] = ["请结合下方指标自行判断"]
        card["blocked_words"] = hit
    card["audited"] = True
    return card


@router.get("/student/{uid}")
def student_insight(uid: str, scope: str | None = None,
                    task_id: str | None = None, unit_id: str | None = None,
                    user: dict = Depends(current_user)):
    """教师/研究员查看某学生的 AI 学情结论（含证据链）。"""
    if user.get("role") not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师权限")
    profile_scope, scope_ref = resolve_profile_scope(scope, task_id, unit_id)
    f = _facts(uid, profile_scope, scope_ref)
    # 无证据时不调用 LLM，避免模型从行为次数重新发明一套能力判断。
    card = (_call_llm(f) or _rule_insight(f)
            if f["画像状态"] == "evidence_backed" else _rule_insight(f))
    card = audit(card)
    cs = f["_raw"]
    return {
        "student_id": uid,
        "name": uid.replace("stu-", ""),
        "card": card,
        # 证据链：结论下方可展开，全部来自真实聚合，不经 LLM
        "evidence": {"诊断上下文": f["行为"], "已确认学情": f["已确认学情"],
                     "安全提醒次数": f["安全提醒次数"]},
        "profile": f["_profile"],
        "path": cs["path"][-8:],
        "timeline": cs["timeline"][-10:],
    }


@router.get("/my/recommend")
def my_recommend(limit: int = 3, scope: str | None = None,
                 task_id: str | None = None, unit_id: str | None = None,
                 user: dict = Depends(current_user)):
    """学生看自己的进阶推荐（学习面板「进阶」页签）。

    与教师端同一套规则，只是把 uid 锁死为调用者本人 —— 学生传不了别人的 id。
    """
    uid = user.get("sub", "anon")
    profile_scope, scope_ref = resolve_profile_scope(scope, task_id, unit_id)
    d = _recommend_for(uid, limit, with_level=False, scope=profile_scope, scope_ref=scope_ref)
    d.pop("weak_level", None)
    return d


@router.get("/recommend/{uid}")
def recommend(uid: str, limit: int = 3, scope: str | None = None,
              task_id: str | None = None, unit_id: str | None = None,
              user: dict = Depends(current_user)):
    """按学生最弱维度从题库/视频里挑推荐（可一键推送）——闭合「分析→干预」链路。

    排序信号：① 主维命中最弱维 ② ct_dims 中该维权重 ③ 难度贴近当前水平（弱维分低→给简单题）。
    纯规则可解释，不依赖 LLM（LLM 只在结论卡里做归因）。
    """
    if user.get("role") not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师权限")
    profile_scope, scope_ref = resolve_profile_scope(scope, task_id, unit_id)
    return _recommend_for(uid, limit, scope=profile_scope, scope_ref=scope_ref)


def _recommend_for(uid: str, limit: int = 3, with_level: bool = True,
                   scope: str | None = None, scope_ref: str | None = None):
    from app import store_resources as R

    profile = evidence_profile_for(uid, scope, scope_ref)
    levels = profile["levels"] if profile["status"] == "evidence_backed" else {}
    comparable = {k: _level_number(v) for k, v in levels.items()}
    weak_key = (min(comparable, key=comparable.get)
                if comparable and all(v is not None for v in comparable.values()) else None)
    weak_level = levels.get(weak_key) if weak_key else None
    weak_number = _level_number(weak_level) if weak_level is not None else None
    want_diff = (2 if weak_number is None else 1 if weak_number <= 1 else
                 2 if weak_number <= 2 else 3)

    def score(ex: dict) -> float:
        d = ex.get("ct_dims") or {}
        s = 0.0
        if weak_key and ex.get("ct_primary") == weak_key:
            s += 10                                   # 主维正中薄弱点
        s += float(d.get(weak_key, 0)) if weak_key else 0.0
        s -= abs(int(ex.get("difficulty", 2)) - want_diff) * 2   # 难度贴合
        return s

    ranked = sorted(R.list_exercises(limit=200), key=score, reverse=True)
    matched = [e for e in ranked if score(e) > 0][:limit]
    # 题库里没有标注该维度的题时，只能按难度兜底 —— 但**必须说清楚**，
    # 不能一边回退成通用排序、一边宣称"针对薄弱维推荐"，否则教师会误以为题目对症。
    picks = matched or ranked[:limit]
    targeted = bool(matched)

    diff_cn = ["", "入门", "基础", "提高", "挑战"][want_diff]
    # 学生端不给分值。`my_recommend` 里那句 `d.pop("weak_score")` 拦不住这里 ——
    # 分数被 f-string 拼进了 reason 正文，InsightRail.vue 原样渲染出来。
    # 六维分是行为次数的单调函数，学生看得见分就会去刷行为，刷的恰好是
    # fixes / ai_helps 这些过程指标，干预效果与刷分行为从此再也分不开。
    level_cn = f'（证据等级 {weak_level}）' if with_level and weak_level is not None else ''
    if not weak_key:
        reason = f'当前没有已确认的能力推断，以下仅是{diff_cn}难度通用练习，不代表薄弱项判断'
    else:
        reason = (f'已确认推断中「{DIM_CN.get(weak_key, weak_key)}」等级最低{level_cn}，建议先练{diff_cn}难度'
                  if targeted else
                  f'已确认推断中「{DIM_CN.get(weak_key, weak_key)}」等级最低{level_cn}，但题库里还没有标注该维度，'
                  f'下面按{diff_cn}难度兜底推荐——建题时填「主要锻炼」才能对症')
    videos = [v for v in R.list_videos(limit=50)
              if weak_key and (v.get("ct_dims") or {}).get(weak_key)][:2]

    return {
        "student_id": uid,
        "weak_dim": DIM_CN.get(weak_key, weak_key) if weak_key else None,
        "weak_level": weak_level,
        "profile_status": profile["status"],
        "reason": reason,
        "targeted": targeted,          # false = 只是按难度兜底，不是对症推荐
        "exercises": [{"id": e["id"], "title": e["title"], "difficulty": e["difficulty"],
                       "language": e["language"], "why": f'训练{DIM_CN.get(e.get("ct_primary") or "", "综合")}'}
                      for e in picks],
        "videos": [{"id": v["id"], "title": v["title"]} for v in videos],
    }


class ClassReq(BaseModel):
    limit: int = 8


@router.get("/class")
def class_insight(limit: int = 8, scope: str | None = None,
                  task_id: str | None = None, unit_id: str | None = None,
                  user: dict = Depends(current_user)):
    """班级共性问题：按最弱维度聚合，给教师下一步教学建议。"""
    if user.get("role") not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师权限")
    roster = store.list_students()[:max(1, min(limit, 40))]
    profile_scope, scope_ref = resolve_profile_scope(scope, task_id, unit_id)
    tally: dict[str, int] = {}
    rows = []
    for s in roster:
        profile = evidence_profile_for(s["id"], profile_scope, scope_ref)
        levels = profile["levels"] if profile["status"] == "evidence_backed" else {}
        if not levels:
            continue
        comparable = {k: _level_number(v) for k, v in levels.items()}
        if not comparable or any(v is None for v in comparable.values()):
            continue
        weakest = min(comparable, key=comparable.get)
        tally[weakest] = tally.get(weakest, 0) + 1
        rows.append({"id": s["id"], "name": s["name"],
                     "weakest": DIM_CN.get(weakest, weakest), "level": levels[weakest]})
    top = sorted(tally.items(), key=lambda kv: -kv[1])
    return {
        "n": len(rows),
        "common_weak": [{"dim": DIM_CN[k], "count": v} for k, v in top[:3]],
        "headline": (f'班级最普遍的薄弱点是「{DIM_CN[top[0][0]]}」（{top[0][1]} 人）'
                     if top else "暂无足够数据形成班级结论"),
        "students": rows,
    }
