#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
diag_ceiling.py —— 决策3（model 维存废）的开课前/开课后诊断脚本。

法源：外部调研 R2 §5.1 决策3、§2.2 脚本A/脚本C。
本脚本**只读库、不写库、不改公式**（FORMULA_VERSION 一个字都不动）——
它产出的是**分析计划**的判据，不是公式变更。

用法：
    python scripts/diag_ceiling.py                       # 默认读 server/jiedui.db
    python scripts/diag_ceiling.py --db path/to/x.db
    python scripts/diag_ceiling.py --json out.json       # 同时落一份机读结果
    python scripts/diag_ceiling.py --min-evidence 3      # 证据门槛，默认与 ct.py 一致

依赖：只用 Python 标准库（与本仓 5 个依赖的纪律一致）。

零数据时**优雅退出**（exit 0，打印"尚无数据"并给出何时该再跑），
不抛异常、不进 CI 红灯 —— 它是「有真实数据才跑」的分支。
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sqlite3
import sys
from collections import defaultdict

# Windows 控制台中文
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DEFAULT_DB = os.path.join(REPO, "server", "jiedui.db")
CT_PY = os.path.join(REPO, "server", "app", "ct.py")

DIMS = ("decompose", "abstract", "model", "algorithm", "verify", "transfer")
DIM_CN = {"decompose": "分解", "abstract": "抽象", "model": "建模",
          "algorithm": "算法设计", "verify": "验证优化", "transfer": "迁移"}

# ---------------------------------------------------------------- 公式护栏
# 本脚本为了不引 fastapi，**重写了一份** ct.py 的 v3 六维公式。重写就会漂移，
# 所以先把 ct.py 里的公式原文抠出来逐行比对：不一致就拒绝运行并打印差异 ——
# 「诊断脚本算的分和线上算的分不是同一个东西」是这类脚本最典型的死法。
FORMULA_FINGERPRINT = [
    'FORMULA_VERSION = "ct-rules/v3"',
    'return x / (x + k) if x > 0 else 0.0',
    'fixes_ev = fixes if errors else min(fixes, 2)',
    'fix_rate = min(1.0, fixes / errors) if errors else (1.0 if fixes else 0.0)',
    'sr = success / attempts if attempts else 0.0',
    'ev_fix = _sat(errors + fixes_ev, 4)',
    'ev_run = _sat(attempts, 6)',
    'abstract = 0.7 * _sat(runs, 30) + 0.3 * _sat(designs, 3)',
    '"decompose": round(100 * (0.5 * _sat(fixes, 8) + 0.25 * _sat(switches, 3) + 0.25 * _sat(designs, 3))),',
    '"abstract": round(100 * abstract),',
    '"model": round(100 * (0.7 * _sat(designs, 3) + 0.3 * _sat(runs, 40))),',
    '"algorithm": round(100 * (0.6 * sr * ev_run + 0.4 * _sat(success, 15))),',
    '"verify": round(100 * (0.6 * fix_rate * ev_fix + 0.4 * _sat(fixes if errors else fixes_ev, 6))),',
    '"transfer": round(100 * (0.5 * _sat(success, 15) + 0.3 * _sat(switches, 3) + 0.2 * sr * ev_run)),',
    '"has_real_data": (runs + errors + fixes + designs) >= 3,',
]


def formula_guard(path: str) -> list[str]:
    """返回缺失的指纹行。ct.py 读不到时返回 ['<ct.py 不可读>']（不阻断，只降级告警）。"""
    try:
        with open(path, encoding="utf-8") as f:
            src = f.read()
    except OSError:
        return ["<ct.py 不可读：%s>" % path]
    return [line for line in FORMULA_FINGERPRINT if line not in src]


# ---------------------------------------------------------------- v3 公式复刻
def _sat(x: float, k: float) -> float:
    return x / (x + k) if x > 0 else 0.0


def dims_neutral(runs: int, errors: int, fixes: int, designs: int, switches: int,
                 legacy: dict | None = None) -> dict:
    """ct.py summary_for(profile='neutral') 的六维，sv=2 语义。
    legacy: {类型: 条数} 的 sv<=1 计数（如有），按 ct.py 的 _attempts_and_successes 还原后相加。"""
    attempts = runs
    success = max(0, runs - errors)
    if legacy:
        lr, le, lf = legacy.get("run", 0), legacy.get("error", 0), legacy.get("fix", 0)
        attempts += lr + lf + le
        success += lr + lf
        runs, errors, fixes = runs + lr, errors + le, fixes + lf
    fixes_ev = fixes if errors else min(fixes, 2)
    fix_rate = min(1.0, fixes / errors) if errors else (1.0 if fixes else 0.0)
    sr = success / attempts if attempts else 0.0
    ev_fix = _sat(errors + fixes_ev, 4)
    ev_run = _sat(attempts, 6)
    abstract = 0.7 * _sat(runs, 30) + 0.3 * _sat(designs, 3)
    return {
        "decompose": round(100 * (0.5 * _sat(fixes, 8) + 0.25 * _sat(switches, 3) + 0.25 * _sat(designs, 3))),
        "abstract": round(100 * abstract),
        "model": round(100 * (0.7 * _sat(designs, 3) + 0.3 * _sat(runs, 40))),
        "algorithm": round(100 * (0.6 * sr * ev_run + 0.4 * _sat(success, 15))),
        "verify": round(100 * (0.6 * fix_rate * ev_fix + 0.4 * _sat(fixes if errors else fixes_ev, 6))),
        "transfer": round(100 * (0.5 * _sat(success, 15) + 0.3 * _sat(switches, 3) + 0.2 * sr * ev_run)),
    }


# ---------------------------------------------------------------- 统计（stdlib）
def mean(v): return sum(v) / len(v) if v else float("nan")


def sd(v):
    if len(v) < 2:
        return float("nan")
    m = mean(v)
    return math.sqrt(sum((x - m) ** 2 for x in v) / (len(v) - 1))


def median(v):
    if not v:
        return float("nan")
    s = sorted(v)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def quantile(v, q):
    if not v:
        return float("nan")
    s = sorted(v)
    i = q * (len(s) - 1)
    lo, hi = int(math.floor(i)), int(math.ceil(i))
    return s[lo] if lo == hi else s[lo] + (s[hi] - s[lo]) * (i - lo)


def skewness(v):
    """样本偏度 g1 = m3 / m2^1.5（总体矩口径，与常见统计软件的 g1 一致）。"""
    n = len(v)
    if n < 3:
        return float("nan")
    m = mean(v)
    m2 = sum((x - m) ** 2 for x in v) / n
    m3 = sum((x - m) ** 3 for x in v) / n
    return m3 / m2 ** 1.5 if m2 > 0 else float("nan")


def kurtosis_excess(v):
    """超额峰度 g2 = m4/m2^2 − 3（Gravetter 等常引的 ±7 区间即此口径）。"""
    n = len(v)
    if n < 4:
        return float("nan")
    m = mean(v)
    m2 = sum((x - m) ** 2 for x in v) / n
    m4 = sum((x - m) ** 4 for x in v) / n
    return m4 / m2 ** 2 - 3 if m2 > 0 else float("nan")


def _ranks(v):
    """平均秩（处理并列）。"""
    idx = sorted(range(len(v)), key=lambda i: v[i])
    r = [0.0] * len(v)
    i = 0
    while i < len(idx):
        j = i
        while j + 1 < len(idx) and v[idx[j + 1]] == v[idx[i]]:
            j += 1
        avg = (i + j) / 2 + 1
        for k in range(i, j + 1):
            r[idx[k]] = avg
        i = j + 1
    return r


def spearman(x, y):
    """带并列校正的 Spearman ρ（秩上的 Pearson）。样本 <3 或方差为 0 返回 nan。"""
    if len(x) != len(y) or len(x) < 3:
        return float("nan")
    rx, ry = _ranks(x), _ranks(y)
    mx, my = mean(rx), mean(ry)
    num = sum((a - mx) * (b - my) for a, b in zip(rx, ry))
    dx = math.sqrt(sum((a - mx) ** 2 for a in rx))
    dy = math.sqrt(sum((b - my) ** 2 for b in ry))
    return num / (dx * dy) if dx > 0 and dy > 0 else float("nan")


def cliffs_delta(a, b):
    """Cliff's delta：分布偏斜时比 Cohen's d 稳（R2 §2.3 指定）。"""
    if not a or not b:
        return float("nan")
    gt = sum(1 for x in a for y in b if x > y)
    lt = sum(1 for x in a for y in b if x < y)
    return (gt - lt) / (len(a) * len(b))


def mannwhitney_p(a, b):
    """Mann-Whitney U 的正态近似 p（含并列校正）。小样本下只作参考，脚本会标注。"""
    n1, n2 = len(a), len(b)
    if n1 < 3 or n2 < 3:
        return float("nan")
    allv = a + b
    r = _ranks(allv)
    r1 = sum(r[:n1])
    u1 = r1 - n1 * (n1 + 1) / 2
    u = min(u1, n1 * n2 - u1)
    mu = n1 * n2 / 2
    n = n1 + n2
    ties = defaultdict(int)
    for x in allv:
        ties[x] += 1
    tie_term = sum(t ** 3 - t for t in ties.values())
    var = n1 * n2 / 12 * ((n + 1) - tie_term / (n * (n - 1)))
    if var <= 0:
        return float("nan")
    z = (u - mu + 0.5) / math.sqrt(var)
    return 2 * (1 - 0.5 * (1 + math.erf(abs(z) / math.sqrt(2))))


def fmt(x, nd=2):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return "  n/a"
    return f"{x:.{nd}f}"


# ---------------------------------------------------------------- 取数
def table_exists(c, name):
    return c.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                     (name,)).fetchone() is not None


def cols_of(c, name):
    return {r[1] for r in c.execute(f"PRAGMA table_info({name})")}


def load_events(c):
    """逐生 × 逐轮的事件计数。返回 {(student, round_index or None): {sv: {type: n}}}"""
    out = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    per_student = defaultdict(lambda: defaultdict(int))
    for r in c.execute("SELECT user_id, type, COALESCE(sv,1) sv, round_index, detail "
                       "FROM ct_events"):
        out[(r["user_id"], r["round_index"])][int(r["sv"])][r["type"]] += 1
        per_student[r["user_id"]][r["type"]] += 1
    return out, per_student


def split_sv(bysv):
    """把 {sv:{type:n}} 拆成 (sv2 计数, sv<=1 计数)。"""
    cur = defaultdict(int)
    leg = defaultdict(int)
    for sv, d in bysv.items():
        tgt = cur if sv >= 2 else leg
        for t, n in d.items():
            tgt[t] += n
    return cur, leg


# ---------------------------------------------------------------- 分节
def sec(title):
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)


def describe(name, vals, out):
    """一维描述统计 + R2 §2.2 脚本A 的判据。"""
    n = len(vals)
    if n == 0:
        print(f"  {name:<10} n=0")
        return
    p_top = sum(1 for v in vals if v >= 90) / n
    p_bot = sum(1 for v in vals if v <= 10) / n
    s, k = skewness(vals), kurtosis_excess(vals)
    sdv = sd(vals)
    flags = []
    if p_top >= 0.15:
        flags.append("顶效应(p_top≥.15)")
    if not math.isnan(s) and s < -2:
        flags.append("顶效应(偏度<-2)")
    if not math.isnan(k) and k < -7:
        flags.append("顶效应(峰度<-7)")
    if p_bot >= 0.15:
        flags.append("地板(p_bot≥.15)")
    if not math.isnan(sdv) and sdv < 8:
        flags.append("方差塌陷(sd<8)")
    print(f"  {name:<10} n={n:<4} mean={fmt(mean(vals),1):>6} sd={fmt(sdv,1):>6} "
          f"min={min(vals):>3} med={fmt(median(vals),1):>5} max={max(vals):>3} "
          f"p_top={p_top:.2f} p_bot={p_bot:.2f} skew={fmt(s):>6} kurt={fmt(k):>6}"
          + ("  ⚠ " + " / ".join(flags) if flags else ""))
    out[name] = {"n": n, "mean": mean(vals), "sd": sdv, "min": min(vals), "max": max(vals),
                 "median": median(vals), "p_top": p_top, "p_bot": p_bot,
                 "skew": s, "kurtosis": k, "flags": flags}


def main():
    ap = argparse.ArgumentParser(description="决策3：model 维存废诊断（只读、不改公式）")
    ap.add_argument("--db", default=DEFAULT_DB)
    ap.add_argument("--json", default="")
    ap.add_argument("--min-evidence", type=int, default=3,
                    help="证据门槛，须与 ct.py has_real_data 一致（默认 3，勿放宽）")
    args = ap.parse_args()

    R: dict = {"db": args.db, "min_evidence": args.min_evidence}

    print("CX 决策3 诊断：model 维存废 / 六维天花板与偏倚")
    print("库：", args.db)

    # ---- 0 公式护栏 ----
    missing = formula_guard(CT_PY)
    if missing:
        print("\n✗ 公式护栏失败：ct.py 的以下行与本脚本复刻的 v3 公式不一致——")
        for m in missing:
            print("   ", m)
        print("  → 公式已改动而本脚本未同步。**拒绝出具判据**（算错的判据比没有判据更坏）。")
        print("  → 修法：同步本脚本的 dims_neutral 与 FORMULA_FINGERPRINT，或核对 FORMULA_VERSION 是否已升位。")
        return 2
    print("公式护栏：ct-rules/v3 指纹 %d 行全部命中 ✓" % len(FORMULA_FINGERPRINT))

    if not os.path.exists(args.db):
        print("\n库文件不存在。开课后再跑本脚本。")
        return 0
    c = sqlite3.connect(args.db)
    c.row_factory = sqlite3.Row

    # ---- 1 就绪门：零数据优雅退出 ----
    sec("§1 数据就绪门")
    n_ev = c.execute("SELECT COUNT(*) n FROM ct_events").fetchone()["n"] if table_exists(c, "ct_events") else 0
    n_rs = c.execute("SELECT COUNT(*) n FROM round_snapshot").fetchone()["n"] if table_exists(c, "round_snapshot") else 0
    n_ob = c.execute("SELECT COUNT(*) n FROM obs_window").fetchone()["n"] if table_exists(c, "obs_window") else 0
    n_ar = c.execute("SELECT COUNT(*) n FROM ai_reply_log").fetchone()["n"] if table_exists(c, "ai_reply_log") else 0
    n_cr = c.execute("SELECT COUNT(*) n FROM ct_criterion").fetchone()["n"] if table_exists(c, "ct_criterion") else 0
    n_stu = c.execute("SELECT COUNT(DISTINCT user_id) n FROM ct_events").fetchone()["n"] if n_ev else 0
    print(f"  ct_events={n_ev}（{n_stu} 名学生） round_snapshot={n_rs} "
          f"obs_window={n_ob} ai_reply_log={n_ar} ct_criterion={n_cr}")
    R["counts"] = {"ct_events": n_ev, "students": n_stu, "round_snapshot": n_rs,
                   "obs_window": n_ob, "ai_reply_log": n_ar, "ct_criterion": n_cr}
    if n_ev == 0:
        print("\n  尚无任何 ct_events —— 优雅退出。")
        print("  何时再跑：开课**前一周**做一次预试课后立刻跑（决策3 要求的『先测产生率』）；")
        print("            开课后每周跑一次，R3 结轮后跑最后一次定稿。")
        return 0
    if n_rs == 0:
        print("  ⚠ round_snapshot 为空：六维分布将用 ct_events **现算**（非冻结值），")
        print("    仅供开课前判据；正式分析必须以 round_snapshot 冻结值为准。")

    ev_by_key, per_student = load_events(c)

    # ---- 2 每生事件产生率 ----
    sec("§2 每生事件产生率分布（决策3 的直接判据：designs 中位数）")
    students = sorted(per_student)
    rate_out = {}
    for t in ("run", "error", "fix", "design_create", "ai_help", "role_switch", "hop"):
        vals = [per_student[s].get(t, 0) for s in students]
        zero = sum(1 for v in vals if v == 0) / len(vals)
        print(f"  {t:<14} n={len(vals):<4} 中位={median(vals):>6.1f} 均值={mean(vals):>6.1f} "
              f"p25={quantile(vals,.25):>5.1f} p75={quantile(vals,.75):>5.1f} "
              f"max={max(vals):>4} 零值占比={zero:.0%}")
        rate_out[t] = {"median": median(vals), "mean": mean(vals), "max": max(vals),
                       "zero_share": zero, "n": len(vals)}
    R["event_rates"] = rate_out
    designs_med = rate_out["design_create"]["median"]
    designs_zero = rate_out["design_create"]["zero_share"]

    # ---- 3 design_create 的结构性上限 ----
    sec("§3 design_create 的**结构性**产生上限（不是『学生没画』，是埋点封顶）")
    print("  埋点事实（web/src/views/student/IdeView.vue onBlockCount + BlockEditor blocks 事件）：")
    print("   · 触发条件 = **积木模式**下首次拼出 ≥3 块；代码模式 / C++ / C 模式**结构上产生不了**。")
    print("   · `let blocksMilestone` 是组件实例级一次性开关 → **每次 IDE 挂载最多 1 条**。")
    print("   · 因此 designs 的天然量程 ≈『用过积木模式的课时数』，而不是『做过几次设计』。")
    n_design = c.execute("SELECT COUNT(*) n FROM ct_events WHERE type='design_create'").fetchone()["n"]
    n_design_blocky = c.execute(
        "SELECT COUNT(*) n FROM ct_events WHERE type='design_create' AND detail LIKE '积木拼出%'"
    ).fetchone()["n"]
    per_day = c.execute(
        "SELECT user_id, DATE(ts,'unixepoch','localtime') d, COUNT(*) n FROM ct_events "
        "WHERE type='design_create' GROUP BY user_id, d ORDER BY n DESC LIMIT 1").fetchone()
    print(f"  实测：design_create={n_design} 条，其中 detail 形如「积木拼出 N 块」的 {n_design_blocky} 条；"
          f"单生单日最大 {per_day['n'] if per_day else 0} 条")
    R["design_create"] = {"total": n_design, "blocky": n_design_blocky,
                          "max_per_student_day": per_day["n"] if per_day else 0}
    if designs_med == 0:
        print("  ⇒ designs 中位数 = 0：**决策3 的触发条件已满足**（详见 §5/§8）。")

    # ---- 4 六维分布 ----
    sec("§4 六维分布（含 R1→R2→R3 偏度轨迹与顶/底判据）")
    rounds: dict = defaultdict(lambda: defaultdict(list))   # round -> dim -> [scores]
    pool: dict = defaultdict(list)                          # dim -> [scores]（全量，用于折叠裁决）
    pair_am: list = []                                      # (abstract, model) 配对
    dropped = []                                            # 未过证据门槛的 (student, round)
    used_source = "round_snapshot(冻结值)" if n_rs else "ct_events(现算)"

    if n_rs:
        # 冻结快照没有 designs 原始计数 → 从 ct_events 现取该生的 designs 作为分层键
        designs_of = {s: per_student[s].get("design_create", 0) for s in per_student}
        q = ("SELECT rs.student_id, rs.dims, rs.evidence_count, lr.round_index "
             "FROM round_snapshot rs LEFT JOIN learning_round lr ON lr.id = rs.round_id")
        for r in c.execute(q):
            try:
                d = json.loads(r["dims"] or "{}")
            except Exception:
                continue
            if not d:
                continue
            if (r["evidence_count"] or 0) < args.min_evidence:
                dropped.append((r["student_id"], r["round_index"]))
                continue
            ri = r["round_index"]
            for k in DIMS:
                if k in d:
                    rounds[ri][k].append(d[k])
                    pool[k].append(d[k])
            if "abstract" in d and "model" in d:
                pair_am.append((r["student_id"], ri, d["abstract"], d["model"],
                                designs_of.get(r["student_id"], 0)))
    else:
        for (stu, ri), bysv in ev_by_key.items():
            cur, leg = split_sv(bysv)
            runs, errors = cur.get("run", 0), cur.get("error", 0)
            fixes, designs = cur.get("fix", 0), cur.get("design_create", 0)
            switches = cur.get("role_switch", 0)
            ev = runs + errors + fixes + designs + leg.get("run", 0) + leg.get("error", 0) \
                + leg.get("fix", 0) + leg.get("design_create", 0)
            if ev < args.min_evidence:
                dropped.append((stu, ri))
                continue
            d = dims_neutral(runs, errors, fixes, designs, switches, leg)
            for k in DIMS:
                rounds[ri][k].append(d[k])
                pool[k].append(d[k])
            pair_am.append((stu, ri, d["abstract"], d["model"], designs))

    print("  数据源：", used_source, f"（证据门槛 evidence_count ≥ {args.min_evidence}，未放宽）")
    R["source"] = used_source
    dims_out = {}
    for ri in sorted(rounds, key=lambda x: (x is None, x)):
        label = f"R{ri}" if ri is not None else "轮外(round_index=NULL)"
        print(f"\n  —— {label} ——")
        o = {}
        for k in DIMS:
            describe(f"{k}/{DIM_CN[k]}", rounds[ri][k], o)
        dims_out[str(ri)] = o
    R["dims_by_round"] = dims_out

    print("\n  偏度轨迹（R1→R2→R3，照 cCTt 呈现方式）：")
    for k in DIMS:
        traj = []
        for ri in (1, 2, 3):
            v = rounds.get(ri, {}).get(k, [])
            traj.append(fmt(skewness(v)) if len(v) >= 3 else " n/a")
        print(f"    {k:<10} " + " → ".join(traj))

    print("\n  区分度（R2→R3 同维 Spearman ρ，<0.3 判排序被噪声吞掉）：")
    # 只有 round_snapshot 才能按 student 配对；现算路径同样可按 (student, round)
    by_stu_round: dict = defaultdict(dict)
    if n_rs:
        for r in c.execute("SELECT rs.student_id, rs.dims, rs.evidence_count, lr.round_index "
                           "FROM round_snapshot rs LEFT JOIN learning_round lr ON lr.id=rs.round_id"):
            if (r["evidence_count"] or 0) < args.min_evidence:
                continue
            try:
                by_stu_round[r["student_id"]][r["round_index"]] = json.loads(r["dims"] or "{}")
            except Exception:
                pass
    else:
        for (stu, ri), bysv in ev_by_key.items():
            cur, leg = split_sv(bysv)
            ev = sum(cur.get(t, 0) for t in ("run", "error", "fix", "design_create"))
            if ev < args.min_evidence:
                continue
            by_stu_round[stu][ri] = dims_neutral(cur.get("run", 0), cur.get("error", 0),
                                                 cur.get("fix", 0), cur.get("design_create", 0),
                                                 cur.get("role_switch", 0), leg)
    disc = {}
    for k in DIMS:
        xs = [by_stu_round[s][2][k] for s in by_stu_round
              if 2 in by_stu_round[s] and 3 in by_stu_round[s] and k in by_stu_round[s][2]]
        ys = [by_stu_round[s][3][k] for s in by_stu_round
              if 2 in by_stu_round[s] and 3 in by_stu_round[s] and k in by_stu_round[s][3]]
        rho = spearman(xs, ys) if len(xs) == len(ys) else float("nan")
        disc[k] = rho
        mark = "  ⚠ <0.3" if (not math.isnan(rho) and rho < 0.3) else ""
        print(f"    {k:<10} n_pair={len(xs):<3} ρ={fmt(rho)}{mark}")
    R["discrimination_r2r3"] = disc

    # ---- 5 model 维专项：可达上界 ----
    sec("§5 model 维专项：数学上确界 vs **本班可达上界**")
    print("  公式：model = 100 × [0.7·sat(designs,3) + 0.3·sat(runs,40)]，sat(x,k)=x/(x+k)")
    print("  designs=0 时 model = 30·sat(runs,40)，上确界 30 但**永不可达**：")
    for r_ in (10, 20, 45, 80, 120, 300):
        print(f"    runs={r_:<4} → model = {round(100*0.3*_sat(r_,40)):>3}")
    runs_all = [per_student[s].get("run", 0) for s in students]
    runs_p90 = quantile(runs_all, 0.90)
    reach = round(100 * (0.7 * _sat(designs_med, 3) + 0.3 * _sat(runs_p90, 40)))
    print(f"  本库实测：runs 的 p90={runs_p90:.0f}，designs 中位数={designs_med:.0f}")
    print(f"  ⇒ **本班可达上界 ≈ {reach} 分**（p90 活跃度 × 中位 designs）——"
          f"{'远低于' if reach < 30 else '接近'} 名义上确界 30。")
    mvals = pool.get("model", [])
    R["model"] = {"reachable_ceiling": reach, "runs_p90": runs_p90,
                  "designs_median": designs_med, "designs_zero_share": designs_zero,
                  "observed_max": max(mvals) if mvals else None,
                  "observed_sd": sd(mvals) if len(mvals) > 1 else None}
    if mvals:
        print(f"  实测 model：max={max(mvals)} sd={fmt(sd(mvals),1)} "
              f"取值集合大小={len(set(mvals))}（越小=区分度越差）")

    # ---- 6 REPORT_FOLD 裁决 + 退化警报 ----
    sec("§6 REPORT_FOLD 裁决（abstract↔model）——**含退化警报**")
    xs = [p[2] for p in pair_am]
    ys = [p[3] for p in pair_am]
    rho_am = spearman(xs, ys)
    # 关键分层：designs=0 的观测里，abstract 与 model **都是 runs 的严格单调变换**，
    # ρ 在这些观测上恒为 +1 —— 它验证的是「两个公式都用了 runs」，不是构念塌陷。
    sub = [(p[2], p[3]) for p in pair_am if p[4] > 0]
    rho_sub = spearman([a for a, _ in sub], [m for _, m in sub])
    zero_share_win = sum(1 for p in pair_am if p[4] == 0) / len(pair_am) if pair_am else float("nan")
    print(f"  全样本  Spearman(abstract, model) = {fmt(rho_am)}   (n={len(xs)})")
    print(f"  designs>0 子样本 ρ              = {fmt(rho_sub)}   (n={len(sub)})")
    print(f"  分析窗口中 designs=0 的占比      = {zero_share_win:.0%}")
    degenerate = (not math.isnan(zero_share_win) and zero_share_win >= 0.80) or len(sub) < 10
    R["fold"] = {"rho_all": rho_am, "rho_designs_gt0": rho_sub, "n_all": len(xs),
                 "n_designs_gt0": len(sub), "zero_share_windows": zero_share_win,
                 "degenerate": degenerate}
    if degenerate:
        print("\n  ⚠⚠ **退化警报（R2 §2.3-4 未预见，本轮新发现）**")
        print("      designs=0 时：abstract = 70·sat(runs,30)、model = 30·sat(runs,40)，")
        print("      两者都是**同一个变量 runs 的严格单调变换** ⇒ 这些观测上 ρ 恒 = +1。")
        print("      因此 R2 的『ρ>0.8 ⇒ 折叠有据』在本数据上是**同义反复**：")
        print("      它证明的是『两个公式共用 runs』，不是『两个构念在初中生数据上塌成一维』。")
        print("      ⇒ 判据作废条件（建议写进预注册）：designs=0 的窗口占比 ≥80%，")
        print("        或 designs>0 的子样本 n<10 时，**不得据 ρ 主张折叠有据**。")
        print("      ⇒ 替代裁决路径：① 用 designs>0 子样本的 ρ（上行，n 够时）；")
        print("        ② 用 ct-v1 测评题的分维结构或外部效标（Bebras）裁决；")
        print("        ③ 开课前修埋点恢复 designs 量程后再测（见 §9 第四项）。")
    elif not math.isnan(rho_am):
        if rho_am > 0.8:
            print("  ⇒ ρ>0.8：折叠有据（可写进论文；须同时报告 designs 有效变异与子样本 ρ）。")
        elif rho_am < 0.5:
            print("  ⇒ ρ<0.5：折叠掩盖真实差异，应拆回两维分别报告。")
        else:
            print("  ⇒ 0.5≤ρ≤0.8：判据未落入任一侧，按预注册维持现状并如实报告 ρ。")

    # ---- 7 孤儿修复：verify 的点质量 ----
    sec("§7 孤儿修复支路：verify 的**点质量**（不是伪双峰，是两个离散点）")
    print("  errors=0 且 fixes≥2 时 verify **恒等于 30**；fixes=1 时恒等于 18。")
    print("  → 无需 Hartigan dip test（n≈60 功效不明）：直接数占比即可，判据 >10% 则 verify 组间比较无效。")
    orphan = 0
    total_w = 0
    v30 = 0
    for (stu, ri), bysv in ev_by_key.items():
        cur, _ = split_sv(bysv)
        ev = sum(cur.get(t, 0) for t in ("run", "error", "fix", "design_create"))
        if ev < args.min_evidence:
            continue
        total_w += 1
        if cur.get("error", 0) == 0 and cur.get("fix", 0) > 0:
            orphan += 1
            if cur.get("fix", 0) >= 2:
                v30 += 1
    share = orphan / total_w if total_w else float("nan")
    print(f"  孤儿修复窗口 {orphan}/{total_w} = {fmt(share*100 if total_w else float('nan'),1)}%"
          f"（其中落在 verify=30 这一点上的 {v30} 个）"
          + ("   ⚠ >10%，verify 组间比较无效" if total_w and share > 0.10 else ""))
    R["orphan_fix"] = {"orphan": orphan, "windows": total_w, "share": share, "at_30": v30}

    # ---- 8 分组偏倚 ----
    sec("§8 分组偏倚检查（性别 / 编程基础）")
    have_profile = table_exists(c, "student_profile")
    prof_cols = cols_of(c, "student_profile") if have_profile else set()
    group_fields = {}
    if have_profile:
        for f in ("gender", "prior_prog", "typing_wpm", "device_kind"):
            if f in prof_cols:
                group_fields[f] = True
    if not group_fields:
        print("  ✗ **字段缺失，如实报告**：全库无任何人口学/协变量字段。")
        print("    · 无 student_profile 表；users 表不存在（auth.py 为 DEMO_USERS 硬编码）；")
        print("    · class_students 仅 (id, class_id, student_id)；study_members 仅 group_kind /")
        print("      cluster_class_id / consent_ok —— 均非人口学变量。")
        print("    ⇒ 按性别/编程基础的偏倚检查**现在做不了**，且开课后补采既不合伦理也不可信。")
        print("    ⇒ 前置阻塞项：按 R2 §2.3 新建 student_profile（CREATE TABLE IF NOT EXISTS，")
        print("       不 ALTER 既有表），含 gender(必须有 refuse 选项) / prior_prog / typing_wpm")
        print("       (服务端实测) / device_kind / consent_scope。**开课前落地，否则本节永久缺失。**")
        R["group_bias"] = {"available": False,
                           "missing": ["student_profile", "gender", "prior_prog", "typing_wpm"]}
    # 可得的代理分组：仍然要跑（CONSORT 流失表的天然延伸）
    print("\n  可得代理分组的 has_real_data 剔除率（MNAR 检查，判据：组间差 >10pp 即幸存者偏倚）：")
    proxies = []
    if table_exists(c, "study_members"):
        rows = c.execute("SELECT student_id, group_kind FROM study_members").fetchall()
        proxies.append(("study_members.group_kind", {r["student_id"]: r["group_kind"] for r in rows}))
    if table_exists(c, "class_students"):
        rows = c.execute("SELECT student_id, class_id FROM class_students").fetchall()
        proxies.append(("class_students.class_id", {r["student_id"]: str(r["class_id"]) for r in rows}))
    for f in sorted(group_fields):
        rows = c.execute(f"SELECT student_id, {f} FROM student_profile").fetchall()
        proxies.append((f"student_profile.{f}", {r["student_id"]: str(r[f]) for r in rows}))

    def evidence_of(stu):
        d = per_student[stu]
        return d.get("run", 0) + d.get("error", 0) + d.get("fix", 0) + d.get("design_create", 0)

    bias_out = {}
    for name, mapping in proxies:
        buckets = defaultdict(list)
        for s in students:
            g = mapping.get(s)
            if g is None:
                continue
            buckets[g].append(s)
        if len(buckets) < 2:
            print(f"    {name}: 分组不足 2 组（n_group={len(buckets)}），跳过")
            continue
        print(f"    {name}:")
        rates = {}
        for g, ss in sorted(buckets.items()):
            drop = sum(1 for s in ss if evidence_of(s) < args.min_evidence) / len(ss)
            rates[g] = drop
            print(f"      {str(g):<12} n={len(ss):<4} 剔除率={drop:.0%}")
        spread = (max(rates.values()) - min(rates.values())) * 100
        print(f"      组间最大差 = {spread:.0f}pp"
              + ("   ⚠ >10pp：存在幸存者偏倚" if spread > 10 else ""))
        # 六维的分组分布比较（Mann-Whitney + Cliff's delta），仅两组时报
        dim_stats = {}
        if len(buckets) == 2:
            (ga, sa), (gb, sb) = sorted(buckets.items())
            for k in DIMS:
                va = [by_stu_round[s][ri][k] for s in sa for ri in by_stu_round.get(s, {})]
                vb = [by_stu_round[s][ri][k] for s in sb for ri in by_stu_round.get(s, {})]
                if len(va) >= 3 and len(vb) >= 3:
                    dim_stats[k] = {"cliffs_delta": cliffs_delta(va, vb),
                                    "p_mwu": mannwhitney_p(va, vb), "n_a": len(va), "n_b": len(vb)}
            if dim_stats:
                print(f"      六维分组比较（{ga} vs {gb}；Cliff's δ + MWU p，**未做 BH 校正，n 小仅供参考**）：")
                for k, st in dim_stats.items():
                    print(f"        {k:<10} δ={fmt(st['cliffs_delta']):>6} p={fmt(st['p_mwu'],3):>6} "
                          f"(n={st['n_a']}/{st['n_b']})")
        bias_out[name] = {"drop_rates": rates, "spread_pp": spread, "dims": dim_stats}
    R["group_bias_proxy"] = bias_out
    print("\n  注：六维过程分是 0–100 连续合成分，**DIF/测量不变性不适用**（R2 §2.3）；")
    print("      正确路径 = 分组分布比较(MWU/KW + Dunn + BH) + Cliff's δ + 差异性预测效度(Fisher r-to-z)。")
    print("      driver 时长占比必须作协变量进主模型（seat_map join），否则测的是『谁坐在键盘前』。")

    # ---- 9 判据裁决 ----
    sec("§9 决策3 裁决（判据 → 建议）")
    verdict = []
    if n_rs == 0 and n_ev < 200:
        verdict.append(("信息不足", "数据量过小且无冻结快照，本次只作『产生率预试』读，不得据此定稿分析计划。"))
    trig_designs = designs_med == 0
    trig_var = (R["model"]["observed_sd"] is not None and R["model"]["observed_sd"] < 8)
    trig_ceiling = reach < 30
    print(f"  判据①  designs 中位数=0 ................. {'触发' if trig_designs else '未触发'}"
          f"（实测中位 {designs_med:.0f}，零值占比 {designs_zero:.0%}）")
    print(f"  判据②  model 方差塌陷 sd<8 ............... {'触发' if trig_var else '未触发'}"
          f"（sd={fmt(R['model']['observed_sd'],1)}）")
    print(f"  判据③  本班可达上界 <30 .................. {'触发' if trig_ceiling else '未触发'}（≈{reach}）")
    print(f"  判据④  折叠裁决退化（ρ 同义反复） ........ {'触发' if degenerate else '未触发'}")

    print("\n  建议（三选一 + 一个 R2 未列的第四项）：")
    if trig_designs:
        print("  ★ 主选：**从主分析剔除 model**，在预注册里写明剔除依据与本次诊断日期。")
        print("     理由：designs 中位=0 ⇒ model 退化为 30·sat(runs,40)，是 runs 的单调变换，")
        print("          与 abstract 的主导项、algorithm 的 attempts 项共用同一信息源，")
        print("          不构成独立构念证据；本班可达上界 ≈%d 分，量程不足以承载组间比较。" % reach)
        print("     ✗ **不可选『并入 abstract』**（此处与 R2 §5.1 决策3 的两个选项之一相左）：")
        print("       designs=0 时两维皆为 runs 的单调变换，合并等于把同一信息按 (0.7+0.3)")
        print("       的权重算两遍，会**虚增**『抽象建模』这一报告维的表观信度与效应量。")
        print("       『并入 abstract』只在 designs 有真实变异、且 designs>0 子样本 ρ>0.8 时成立。")
    elif degenerate:
        print("  ★ 主选：**暂缓裁决**。designs 有非零值但 designs>0 子样本 n=%d 过小，" % len(sub))
        print("     折叠判据尚不可信；扩样后重跑本脚本再定。")
    else:
        print("  ★ 主选：**保留 model**（designs 有真实变异，公式在本班有区分度）。")
        print("     若 designs>0 子样本 ρ>0.8，可另行主张报告层折叠（两个决策相互独立）。")
    print("  ☆ 第四项（R2 未列，本轮新发现，**只在开课前可选**）：")
    print("     修 design_create 埋点以恢复 model 的量程 —— 触发点从『积木模式首次≥3块』")
    print("     扩到『流程图/伪代码保存』(design_artifacts 已有表) 或去掉每挂载一次的封顶。")
    print("     这是**口径变更**：按仓库自身先例（v2 就是为这次口径改动升的位），")
    print("     必须升 FORMULA_VERSION 至 ct-rules/v4，且只能在真实数据收集开始前做。")
    print("     当前 round_snapshot=%d / ai_reply_log=%d，若均为 0 则窗口仍然开着。"
          % (n_rs, n_ar))
    print("\n  纪律边界（写进 DECISIONS）：①②③ 改的是**分析计划**，FORMULA_VERSION 不动；")
    print("  第四项改的是**采集口径**，必须升 FORMULA_VERSION —— 两者不可混为一谈。")

    R["verdict"] = {"designs_median_zero": trig_designs, "variance_collapse": trig_var,
                    "reachable_ceiling_below_30": trig_ceiling, "fold_test_degenerate": degenerate}

    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(R, f, ensure_ascii=False, indent=2, default=str)
        print("\n机读结果已写入：", args.json)
    return 0


if __name__ == "__main__":
    sys.exit(main())
