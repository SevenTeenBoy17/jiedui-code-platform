#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""CX 教学轮状态机的 conformance checking（过程挖掘·合规性检验）。

方法学定位（外部调研 R2 §1.4 禁用措辞第 4 条）：
    既有工作（Liu et al. 2022, IEEE TLT 15(6)）做的是 discovery / prediction —— 数据在先，
    模型是被挖出来的。本脚本做的是 **conformance checking** —— 模型在先：R1「能跑」/
    R2「跑对」/ R3「跑好」三个规范 Petri 网是教学设计**事先声明**的状态机，日志用来检验
    它们是否成立。这是 CX 唯一可辩护的方法学差异，脚本的一切设计都服务于这一点。

两条路线（R2 §5.2 定稿）：
    路线 A（拟合度）：三个手写规范网 × 三轮日志，报 fitness_alignments +
        precision_alignments + percentage_of_fitting_traces（后者必须与 log_fitness 并报，
        R2 §4.5：它通常远低于 log_fitness，评审一定会问）。
    路线 B（可分离性，最强证伪）：分轮各自 discover_petri_net_inductive，然后**交叉重放** ——
        第 i 轮的日志放到第 j 轮发现的网上跑。自身高、交叉也高 = 三轮根本不是三个状态机。

数据口径（已对实库 D:/VB/jiedui-code-platform/CX/server/jiedui.db 核实）：
    case_id   = user_id × room_id × round_index 三元拼键
                （不是学生、不是房间：三轮各有各的目标模型，跨轮拼 trace 会把三个模型混成一个）
    activity  = ct_events.type（白名单 6 个 + 服务端 hop，共 7 个）
    timestamp = ct_events.ts（unix 秒）→ datetime
    过滤      = WHERE sv = 2（sv=1 是旧埋点语义，两套混入同一 event log 会算歪；R2 §4.5）
                AND room_id IS NOT NULL AND round_index IS NOT NULL（轮外/无房间事件不硬归轮）

依赖与许可（重要，见文件末尾 LICENSE_NOTE）：
    pm4py 社区版是 **AGPL v3**。本脚本是**离线分析工具**，绝不可被 server/app/ 导入，
    也绝不可随校园版商业产品分发。请在独立虚拟环境中运行（见 --help 的安装说明）。

用法：
    # 真实数据（自动定位 server/jiedui.db）
    python scripts/process_mining.py
    # 指定库与输出
    python scripts/process_mining.py --db server/jiedui.db --out qa-artifacts/pm/report.json
    # 零真实数据时的自测（合成事件，不碰任何真实库）
    python scripts/process_mining.py --dry-run

退出码：0 正常 / 2 参数或库不可读 / 3 无可用数据（优雅退出，非错误）/ 4 表结构不符 / 5 缺 pm4py
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sqlite3
import sys
import tempfile
import time
import warnings
from datetime import datetime, timezone

# Windows 控制台默认 GBK，中文诊断信息会变乱码（且乱码信息等于没有信息）。
for _s in (sys.stderr, sys.stdout):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:  # 非 TTY 或已重定向
        pass

# pm4py 的 check_soundness 自 2.3.0 起标记为 deprecated（3.0 移除），但它仍是当前版本里
# 唯一的一行式健全性检查。此处显式吞掉该告警，并在报告里记下版本，便于将来定位替换点。
warnings.filterwarnings("ignore", message=r".*check_soundness is deprecated.*")
warnings.filterwarnings("ignore", message=r".*solution from scipy may be unstable.*")

# ─────────────────────────────────────────────────────────────────────────────
# 0. 依赖自检：缺 pm4py 时给出可直接复制的隔离安装命令，而不是抛 ImportError
# ─────────────────────────────────────────────────────────────────────────────
INSTALL_HINT = r"""
缺少 pm4py。CX 后端是 stdlib sqlite3 极简路线，**不要**把 pm4py 写进 server/requirements.txt。
在独立虚拟环境里装（已在 Windows + Python 3.14.0 实测通过）：

    python -m venv scripts/.venv-pm4py
    scripts\.venv-pm4py\Scripts\python.exe -m pip install "pm4py==2.7.23.4" "pandas<3"
    scripts\.venv-pm4py\Scripts\python.exe scripts\process_mining.py --dry-run

  * pandas<3 是**必须**的钉子：pm4py 2.7.23.4 对 pandas 只写了无版本约束的 `pandas`，
    而开发机全局环境是 pandas 3.0.1；pm4py 大量依赖 pandas 2.x 行为，不要在全局环境跑。
  * cvxopt 在 Python 3.14 有官方 cp314-win_amd64 wheel（1.3.3），无需编译。
  * graphviz 只是 Python 包装器；本脚本不出图，不需要装系统 Graphviz 二进制。
  * 记得把 scripts/.venv-pm4py/ 加进 .gitignore。
"""

try:
    import pandas as pd
    import pm4py
    from pm4py.util import constants as _pm4py_constants
    _pm4py_constants.SHOW_PROGRESS_BAR = False       # 进度条会淹没诊断输出
    _pm4py_constants.SHOW_EVENT_LOG_DEPRECATION = False
except ImportError:  # pragma: no cover - 环境问题，不是逻辑问题
    sys.stderr.write(INSTALL_HINT)
    sys.exit(5)
except AttributeError:                               # pm4py 换了常量名，不致命
    pass


# ─────────────────────────────────────────────────────────────────────────────
# 1. 三个规范模型（语义草案 —— 未经教学设计者签字，禁止当定稿引用）
#
# 表达式是 pm4py 的 process tree 语法：-> 顺序 / X 异或 / * 循环(do, redo) / tau 静默。
# 用 process tree 而不是手接 place/arc：手接容易产出不健全（unsound）的网，
# 而 alignments 在不健全的网上会给出无意义的 fitness。脚本会对每个网跑 check_soundness。
# ─────────────────────────────────────────────────────────────────────────────

# 求助/协商类活动（不推进任务状态，可在任意位置出现任意次）
_HELP = "X( 'ai_help', 'hop', 'role_switch' )"
_HELP_LOOP = f"*( tau, {_HELP} )"

# R1「能跑」：（可选）先设计 → 可求助 → 跑 → (报错 → 可求助 → 改 → 再跑)*
# 终态语义：模型只能停在一次 run 之后，停在 error 上的 trace 不拟合 —— 这就是「至少一次不带 error 的 run」。
_R1_BODY = (
    "->( X( 'design_create', tau ), "
    f"{_HELP_LOOP}, "
    "'run', "
    f"*( tau, ->( 'error', {_HELP_LOOP}, 'fix', 'run' ) ) )"
)

# R2「跑对」：R1 之上要求**复测确认** —— 首次跑通后再至少跑一次且其间不再报错。
# ⚠ 已知偏差：R2 §5.2 的语义草案写的是「run 后无 error 且出现 probe/测试事件」，
#   但 ct.py 的 KEY 白名单（run/error/fix/ai_help/role_switch/design_create）+ 服务端 hop
#   **不存在 probe/测试事件类型**。此处以「无报错的重复 run」作为可用代理，
#   属于必须由教学设计者裁决的建模决策（见 report.model_open_questions）。
_R2_BODY = (
    "->( " + _R1_BODY + ", 'run', *( tau, X( 'run', 'role_switch' ) ) )"
)

# R3「跑好」：R2 之上要求**非 error 触发的**改进 —— 确认跑通后仍出现 fix 或 design_create，并再次运行。
_R3_BODY = (
    "->( " + _R2_BODY + ", X( 'fix', 'design_create' ), 'run', "
    "*( tau, X( 'run', 'fix', 'design_create', 'role_switch', 'ai_help', 'hop' ) ) )"
)

NORMATIVE_MODELS = {
    1: {
        "label": "R1 能跑",
        "tree": _R1_BODY,
        "semantics_zh": "（可选）设计产出 → 求助/协商任意次 → 运行 → (报错 → 求助 → 修复 → 再运行)*；"
                        "轨迹必须终止于一次不带 error 的 run。",
    },
    2: {
        "label": "R2 跑对",
        "tree": _R2_BODY,
        "semantics_zh": "R1 之上追加复测确认：首次跑通后至少再运行一次且其间无 error。"
                        "【代理】原草案的 probe/测试事件在 ct_events 中不存在，以无报错的重复 run 代理。",
    },
    3: {
        "label": "R3 跑好",
        "tree": _R3_BODY,
        "semantics_zh": "R2 之上追加非 error 触发的改进：确认跑通后仍出现 fix 或 design_create，并再次运行。",
    },
}

MODEL_OPEN_QUESTIONS = [
    "（i）三个规范模型当前仅为语义草案，必须与教学设计者共同敲定后才能写进论文（R2 §5.2 第三轮交付项 i）。",
    "（ii）R2「跑对」的 probe/测试事件在 ct_events 白名单中不存在，本脚本以「无报错的重复 run」代理；"
    "若教学设计要求真实的测试事件，需新增埋点类型（动 ct.py 白名单，不动六维公式，不升 FORMULA_VERSION）。",
    "（iii）exit_task_passed 是否作为 trace 终态标记纳入模型尚未裁决；NULL（未做出口任务）算缺失还是算未通过亦未裁决。"
    "本脚本**不**把它并入模型，只在报告的 exit_task_distribution 中原样呈现，供裁决用（R2 §5.2 交付项 ii）。",
]

# ─────────────────────────────────────────────────────────────────────────────
# 2. 预注册的三档解释规则（R2 §5.2 交付项 iii）
#    ⚠ 0.80 / 0.15 / 0.60 三个数**无文献依据，为本研究预先设定**，
#      论文与预注册文件中必须原样标注这句话。禁止事后挑阈值。
# ─────────────────────────────────────────────────────────────────────────────
PREREG = {
    "fitness_support_min": 0.80,     # 自身模型 log_fitness ≥ 0.80 → 该轮状态机得到支持
    "separability_min_gap": 0.15,    # 交叉重放差值 ≥ 0.15 → 三轮可分离
    "model_misspec_max": 0.60,       # 自身模型 log_fitness < 0.60 → 是模型写错了，回去改模型而不是改数据
    "note": "本研究预先设定、无文献依据（R2 §5.2）。必须写进预注册文件，禁止事后调整。",
    "rules_zh": [
        "三轮各自 log_fitness ≥ 0.80，且交叉重放 fitness 比自身低 ≥ 0.15 → R1/R2/R3 三段式状态机得到支持。",
        "自身高但交叉也高（差值 < 0.15）→ 状态机不成立。这是有价值的证伪结果，照实写，不得回避。",
        "自身 log_fitness < 0.60 → 规范模型写错了，回去改模型，不是改数据、不是放宽阈值。",
        "percentage_of_fitting_traces 必须与 log_fitness 并报（前者通常远低于后者）。",
    ],
}

ACTIVITY_WHITELIST = ["run", "error", "fix", "ai_help", "role_switch", "design_create", "hop"]
REQUIRED_COLUMNS = {"user_id", "type", "detail", "ts", "sv", "round_index", "room_id"}


# ─────────────────────────────────────────────────────────────────────────────
# 3. 数据抽取
# ─────────────────────────────────────────────────────────────────────────────
def _connect(db_path: str) -> sqlite3.Connection:
    if not os.path.exists(db_path):
        sys.stderr.write(f"[FATAL] 找不到数据库：{db_path}\n")
        sys.exit(2)
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _check_schema(conn: sqlite3.Connection) -> None:
    try:
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(ct_events)")}
    except sqlite3.Error as e:
        sys.stderr.write(f"[FATAL] 读 ct_events 表结构失败：{e}\n")
        sys.exit(4)
    if not cols:
        sys.stderr.write("[FATAL] ct_events 表不存在。\n")
        sys.exit(4)
    missing = REQUIRED_COLUMNS - cols
    if missing:
        sys.stderr.write(
            f"[FATAL] ct_events 缺少必需列 {sorted(missing)}。\n"
            "        round_index / room_id / sv 由 store.py 的 _add_column 在启动时补齐，"
            "请先正常启动一次后端再跑本脚本。\n"
        )
        sys.exit(4)


def extract(conn: sqlite3.Connection, sv: int) -> dict:
    """抽取事件日志 + 全部口径诊断计数。返回 dict（rows 为逐事件列表）。"""
    q = conn.execute

    diag = {
        "ct_events_total": q("SELECT COUNT(*) FROM ct_events").fetchone()[0],
        "legacy_sv1_events": q("SELECT COUNT(*) FROM ct_events WHERE sv=1 OR sv IS NULL").fetchone()[0],
        "sv_selected": sv,
        "events_at_selected_sv": q("SELECT COUNT(*) FROM ct_events WHERE sv=?", (sv,)).fetchone()[0],
        "dropped_null_room_id": q(
            "SELECT COUNT(*) FROM ct_events WHERE sv=? AND room_id IS NULL", (sv,)).fetchone()[0],
        "dropped_null_round_index": q(
            "SELECT COUNT(*) FROM ct_events WHERE sv=? AND round_index IS NULL", (sv,)).fetchone()[0],
        "dropped_non_whitelist_type": q(
            "SELECT COUNT(*) FROM ct_events WHERE sv=? AND type NOT IN ({})".format(
                ",".join("?" * len(ACTIVITY_WHITELIST))), (sv, *ACTIVITY_WHITELIST)).fetchone()[0],
    }
    for tbl in ("round_snapshot", "obs_window", "ai_reply_log", "learning_round"):
        try:
            diag[f"{tbl}_rows"] = q(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
        except sqlite3.Error:
            diag[f"{tbl}_rows"] = None

    placeholders = ",".join("?" * len(ACTIVITY_WHITELIST))
    rows = q(
        f"""
        SELECT id, user_id, type, ts, round_index, room_id
          FROM ct_events
         WHERE sv = ?
           AND room_id IS NOT NULL
           AND round_index IS NOT NULL
           AND type IN ({placeholders})
         ORDER BY user_id, room_id, round_index, ts, id
        """,
        (sv, *ACTIVITY_WHITELIST),
    ).fetchall()

    # 出口任务分布：只报，不入模型（见 MODEL_OPEN_QUESTIONS iii）
    exit_dist = {}
    try:
        for r in q(
            "SELECT round_index, "
            "  CASE WHEN exit_task_passed IS NULL THEN 'null' "
            "       WHEN exit_task_passed=1 THEN 'passed' ELSE 'failed' END AS k, "
            "  COUNT(*) n FROM learning_round GROUP BY round_index, k"
        ):
            exit_dist.setdefault(str(r["round_index"]), {})[r["k"]] = r["n"]
    except sqlite3.Error:
        exit_dist = {}

    return {"rows": [dict(r) for r in rows], "diag": diag, "exit_task_distribution": exit_dist}


def to_dataframe(rows: list) -> "pd.DataFrame":
    """三元拼键 + 秒级时间戳去并列。

    ct_events.ts 是 unix **秒**，实库里一次运行的 run/error 常同秒落库（436 条里大量并列）。
    pm4py 会按 timestamp 排序，并列时次序不确定 —— 而次序正是 conformance checking 的全部内容。
    故：先按 (case, ts, id) 稳定排序，再在 case 内按行序注入微秒偏移，把自增 id 的真实先后固化进时间戳。
    """
    df = pd.DataFrame(rows)
    df["case_id"] = (df["user_id"].astype(str) + "|" + df["room_id"].astype(str)
                     + "|R" + df["round_index"].astype(int).astype(str))
    df = df.sort_values(["case_id", "ts", "id"], kind="mergesort").reset_index(drop=True)
    seq = df.groupby("case_id").cumcount()
    df["timestamp"] = (pd.to_datetime(df["ts"], unit="s", utc=True)
                       + pd.to_timedelta(seq.astype("int64"), unit="us"))
    df["activity"] = df["type"]
    return df[["case_id", "activity", "timestamp", "round_index", "user_id", "room_id", "id"]]


def to_log(df: "pd.DataFrame"):
    return pm4py.format_dataframe(df.copy(), case_id="case_id",
                                  activity_key="activity", timestamp_key="timestamp")


# ─────────────────────────────────────────────────────────────────────────────
# 4. 模型构建与两条路线
# ─────────────────────────────────────────────────────────────────────────────
def build_normative_nets() -> dict:
    nets = {}
    for ri, spec in NORMATIVE_MODELS.items():
        tree = pm4py.parse_process_tree(spec["tree"])
        net, im, fm = pm4py.convert_to_petri_net(tree)
        sound = pm4py.check_soundness(net, im, fm)
        nets[ri] = {
            "net": net, "im": im, "fm": fm,
            "meta": {
                "label": spec["label"],
                "process_tree": spec["tree"],
                "semantics_zh": spec["semantics_zh"],
                "places": len(net.places),
                "transitions": len(net.transitions),
                "silent_transitions": sum(1 for t in net.transitions if t.label is None),
                "is_sound_wfnet": bool(sound[0] if isinstance(sound, tuple) else sound),
            },
        }
    return nets


def _conformance(log, net, im, fm) -> dict:
    fit = pm4py.fitness_alignments(log, net, im, fm)
    prec = pm4py.precision_alignments(log, net, im, fm)
    return {
        "log_fitness": round(float(fit["log_fitness"]), 4),
        "average_trace_fitness": round(float(fit["average_trace_fitness"]), 4),
        "percentage_of_fitting_traces": round(float(fit["percentage_of_fitting_traces"]), 2),
        "precision_alignments": round(float(prec), 4),
    }


def route_a(logs_by_round: dict, nets: dict, quiet: bool) -> dict:
    """路线 A：三个规范网 × 三轮日志的全矩阵（对角线 = 该轮对自己规范模型的拟合度）。"""
    out = {}
    for log_r, log in sorted(logs_by_round.items()):
        out[str(log_r)] = {}
        for net_r, bundle in sorted(nets.items()):
            if not quiet:
                sys.stderr.write(f"  [A] log R{log_r} × normative R{net_r} ...\n")
            out[str(log_r)][str(net_r)] = _conformance(
                log, bundle["net"], bundle["im"], bundle["fm"])
    return out


def route_b(logs_by_round: dict, noise_threshold: float, quiet: bool) -> dict:
    """路线 B：分轮 inductive discover → **交叉重放**（最强证伪）。"""
    discovered, meta = {}, {}
    for r, log in sorted(logs_by_round.items()):
        if not quiet:
            sys.stderr.write(f"  [B] discover R{r} (inductive, noise={noise_threshold}) ...\n")
        net, im, fm = pm4py.discover_petri_net_inductive(log, noise_threshold=noise_threshold)
        discovered[r] = (net, im, fm)
        sound = pm4py.check_soundness(net, im, fm)
        meta[str(r)] = {"places": len(net.places), "transitions": len(net.transitions),
                        "is_sound_wfnet": bool(sound[0] if isinstance(sound, tuple) else sound)}

    matrix = {}
    for log_r, log in sorted(logs_by_round.items()):
        matrix[str(log_r)] = {}
        for net_r, (net, im, fm) in sorted(discovered.items()):
            if not quiet:
                sys.stderr.write(f"  [B] replay log R{log_r} on discovered R{net_r} ...\n")
            matrix[str(log_r)][str(net_r)] = _conformance(log, net, im, fm)
    return {"discovered_model_meta": meta, "cross_replay_matrix": matrix,
            "noise_threshold": noise_threshold}


# ─────────────────────────────────────────────────────────────────────────────
# 5. 预注册判定
# ─────────────────────────────────────────────────────────────────────────────
def verdicts(route_a_res: dict, route_b_res: dict) -> dict:
    out = {"per_round": {}, "overall": None, "prereg_thresholds": PREREG}
    gaps_ok, all_supported, any_misspec = [], True, False

    for r in ("1", "2", "3"):
        if r not in route_a_res:
            continue
        own_a = route_a_res[r][r]["log_fitness"]
        cross = route_b_res["cross_replay_matrix"].get(r, {}) if route_b_res else {}
        own_b = cross.get(r, {}).get("log_fitness")
        others = [v["log_fitness"] for k, v in cross.items() if k != r]
        min_gap = round(own_b - max(others), 4) if (own_b is not None and others) else None

        if own_a < PREREG["model_misspec_max"]:
            v = "规范模型写错了（自身 log_fitness < 0.60）→ 回去改模型，不是改数据"
            any_misspec = True
            all_supported = False
        elif own_a >= PREREG["fitness_support_min"]:
            v = "该轮规范模型得到支持（自身 log_fitness ≥ 0.80）"
        else:
            v = "灰区（0.60 ≤ log_fitness < 0.80）：不支持也不判模型错，须在论文中原样报告"
            all_supported = False

        if min_gap is not None and min_gap < PREREG["separability_min_gap"]:
            gaps_ok.append(False)
        elif min_gap is not None:
            gaps_ok.append(True)

        out["per_round"][r] = {
            "normative_log_fitness": own_a,
            "normative_percentage_of_fitting_traces": route_a_res[r][r]["percentage_of_fitting_traces"],
            "discovered_self_fitness": own_b,
            "min_cross_replay_gap": min_gap,
            "verdict_zh": v,
            "separable_zh": (None if min_gap is None else
                             ("与其余轮可分离" if min_gap >= PREREG["separability_min_gap"]
                              else "与其余轮不可分离（自身高、交叉也高）")),
        }

    if any_misspec:
        out["overall"] = "至少一轮的规范模型 log_fitness < 0.60：先修模型再谈结论。"
    elif all_supported and gaps_ok and all(gaps_ok):
        out["overall"] = "R1/R2/R3 三段式状态机得到支持（三轮自身 ≥0.80 且交叉重放差值 ≥0.15）。"
    elif gaps_ok and not all(gaps_ok):
        out["overall"] = ("状态机不成立：某轮自身拟合高但交叉重放同样高（差值 < 0.15）。"
                          "这是有价值的证伪结果，必须照实写进论文，不得回避。")
    else:
        out["overall"] = "混合结果：逐轮见 per_round，禁止事后调整阈值。"
    return out


# ─────────────────────────────────────────────────────────────────────────────
# 6. --dry-run：合成事件自测（不碰任何真实库）
# ─────────────────────────────────────────────────────────────────────────────
DRY_DDL = """
CREATE TABLE ct_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL, type TEXT NOT NULL, detail TEXT,
  project_id INTEGER, ts INTEGER, sv INTEGER DEFAULT 1,
  round_index INTEGER, room_id TEXT, switch_reason TEXT);
CREATE TABLE learning_round(
  id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL,
  round_index INTEGER NOT NULL, label TEXT NOT NULL DEFAULT '',
  started_at INTEGER, exited_at INTEGER, exit_task_passed INTEGER);
"""


def _synth_trace(rnd: int, rng: random.Random) -> list:
    """按三个规范模型的语义生成轨迹；加少量噪声，让 dry-run 的判定结果不是人造的满分。"""
    seq = []
    if rng.random() < 0.7:
        seq.append("design_create")
    for _ in range(rng.randint(0, 2)):
        seq.append(rng.choice(["ai_help", "hop"]))
    seq.append("run")
    for _ in range(rng.randint(0, 2 if rnd == 1 else 1)):
        seq += ["error"] + (["ai_help"] if rng.random() < 0.5 else []) + ["fix", "run"]
    if rnd >= 2:
        seq.append("run")
        if rng.random() < 0.4:
            seq.append("run")
    if rnd == 3:
        seq.append(rng.choice(["fix", "design_create"]))
        seq.append("run")
        if rng.random() < 0.3:
            seq += ["role_switch", "run"]
    if rng.random() < 0.12:                        # 噪声：卡在报错上（未跑通）
        seq.append("error")
    return seq


def make_dry_db(n_students: int = 12, seed: int = 20260813) -> str:
    rng = random.Random(seed)
    path = os.path.join(tempfile.mkdtemp(prefix="cx_pm_dry_"), "dry.db")
    conn = sqlite3.connect(path)
    conn.executescript(DRY_DDL)
    t = int(time.time()) - 86400 * 7
    for room_no in range(1, 4):
        room = f"room-{room_no:02d}"
        for rnd in (1, 2, 3):
            conn.execute("INSERT INTO learning_round(room_id,round_index,label,started_at,"
                         "exited_at,exit_task_passed) VALUES(?,?,?,?,?,?)",
                         (room, rnd, f"R{rnd}", t, t + 2400, rng.choice([0, 1, None])))
            for s in range(n_students // 3):
                uid = f"stu-{room_no:02d}{s:02d}"
                for act in _synth_trace(rnd, rng):
                    conn.execute(
                        "INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv,round_index,room_id)"
                        " VALUES(?,?,?,?,?,?,?,?)", (uid, act, None, None, t, 2, rnd, room))
                    t += rng.choice([0, 0, 1, 3, 17])   # 故意制造同秒并列，检验去并列逻辑
            t += 600
    # 少量 sv=1 旧语义脏数据：验证 WHERE sv=2 真的把它挡在外面
    for i in range(5):
        conn.execute("INSERT INTO ct_events(user_id,type,ts,sv,round_index,room_id)"
                     " VALUES(?,?,?,?,?,?)", (f"stu-old{i}", "run", t, 1, 1, "room-01"))
    conn.commit()
    conn.close()
    return path


# ─────────────────────────────────────────────────────────────────────────────
# 7. 主流程
# ─────────────────────────────────────────────────────────────────────────────
def _dry_run_selftest(df, ex: dict, ra: dict, nets: dict) -> list:
    """自测的是**管道正确性**，不是教学结论 —— 合成数据上的 fitness 数值没有实质含义。"""
    checks = []

    def add(name, ok, detail):
        checks.append({"name": name, "ok": bool(ok), "detail": detail})

    add("sv 过滤生效（sv=1 旧语义未泄漏进 event log）",
        ex["diag"]["legacy_sv1_events"] > 0 and len(df) == ex["diag"]["events_at_selected_sv"]
        - ex["diag"]["dropped_null_room_id"] - ex["diag"]["dropped_null_round_index"],
        f"库内 sv=1 共 {ex['diag']['legacy_sv1_events']} 条；进入日志 {len(df)} 条"
        f"（sv=2 共 {ex['diag']['events_at_selected_sv']} 条）")

    bad = int((df.groupby("case_id")["timestamp"].diff().dropna() <= pd.Timedelta(0)).sum())
    add("秒级并列已去并列（case 内时间戳严格递增）", bad == 0,
        f"非递增相邻对 {bad} 个（ct_events.ts 是秒级，去并列失效会让轨迹次序随机化）")

    add("三元拼键成立（case 数 = user×room×round 组合数）",
        df["case_id"].nunique() == df.groupby(["user_id", "room_id", "round_index"]).ngroups,
        f"{df['case_id'].nunique()} 个 case")

    add("三个规范网均为健全工作流网",
        all(b["meta"]["is_sound_wfnet"] for b in nets.values()),
        {str(r): b["meta"]["is_sound_wfnet"] for r, b in nets.items()})

    # R1 的轨迹放到 R3 的规范网上必须更差：R3 强制要求确认运行 + 非报错触发的改进。
    ok13 = ra["1"]["1"]["log_fitness"] > ra["1"]["3"]["log_fitness"]
    add("规范网有区分力（R1 日志对 R1 网优于对 R3 网）", ok13,
        f"R1×R1={ra['1']['1']['log_fitness']} vs R1×R3={ra['1']['3']['log_fitness']}")

    add("percentage_of_fitting_traces 与 log_fitness 并报",
        all("percentage_of_fitting_traces" in v and "log_fitness" in v
            for row in ra.values() for v in row.values()),
        "两项在路线 A 矩阵的每个格子里都存在")
    return checks


def repo_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="CX 教学轮状态机 conformance checking（pm4py）",
        formatter_class=argparse.RawDescriptionHelpFormatter, epilog=INSTALL_HINT)
    ap.add_argument("--db", default=os.path.join(repo_root(), "server", "jiedui.db"),
                    help="jiedui.db 路径（只读打开）")
    ap.add_argument("--out", default=None, help="JSON 报告输出路径")
    ap.add_argument("--sv", type=int, default=2, help="埋点语义版本，默认 2（勿改，见 R2 §4.5）")
    ap.add_argument("--min-traces", type=int, default=5,
                    help="每轮最少 trace 数，低于此值该轮不参与 conformance（默认 5）")
    ap.add_argument("--noise-threshold", type=float, default=0.2,
                    help="路线 B inductive miner 的噪声阈值（默认 0.2；须在预注册中写死）")
    ap.add_argument("--no-cross-replay", action="store_true", help="跳过路线 B")
    ap.add_argument("--dry-run", action="store_true", help="用合成事件自测，不读任何真实库")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    started = datetime.now(timezone.utc)
    db_path = make_dry_db() if args.dry_run else os.path.abspath(args.db)
    if not args.quiet:
        sys.stderr.write(f"[CX-PM] {'DRY-RUN 合成库' if args.dry_run else '真实库'}: {db_path}\n")

    conn = _connect(db_path)
    _check_schema(conn)
    ex = extract(conn, args.sv)
    conn.close()

    report = {
        "tool": "CX process_mining.py",
        "method": "conformance checking (model-first)，非 discovery/prediction",
        "generated_at_utc": started.isoformat(),
        "pm4py_version": pm4py.__version__,
        "pandas_version": pd.__version__,
        "python_version": sys.version.split()[0],
        "mode": "dry-run" if args.dry_run else "real",
        "db_path": db_path,
        "case_id_definition": "user_id | room_id | R<round_index>（三元拼键）",
        "filters": {"sv": args.sv, "room_id": "NOT NULL", "round_index": "NOT NULL",
                    "activity_whitelist": ACTIVITY_WHITELIST},
        "data_diagnostics": ex["diag"],
        "exit_task_distribution": ex["exit_task_distribution"],
        "model_open_questions": MODEL_OPEN_QUESTIONS,
        "prereg": PREREG,
        "license_note": LICENSE_NOTE,
    }

    # —— 零真实数据的优雅退出（当前实库：round_snapshot=0 / obs_window=0 / ai_reply_log=0）——
    if not ex["rows"]:
        report["status"] = "NO_DATA"
        report["explanation_zh"] = (
            "没有任何满足条件的事件（sv={sv} 且 room_id、round_index 均非空）。"
            "当前实库共 {tot} 条 ct_events，其中 sv=1 旧语义 {sv1} 条；"
            "缺 room_id {nr} 条、缺 round_index {nri} 条。"
            "真实课堂数据尚未开始收集时这是**预期结果**，不是故障：conformance checking 需要"
            "由教师显式开轮（learning_round）后产生的房间内事件流。"
            "先跑 `--dry-run` 验证脚本本身，再等第一节真实课后重跑。"
        ).format(sv=args.sv, tot=ex["diag"]["ct_events_total"],
                 sv1=ex["diag"]["legacy_sv1_events"],
                 nr=ex["diag"]["dropped_null_room_id"],
                 nri=ex["diag"]["dropped_null_round_index"])
        _write(report, args, started)
        sys.stderr.write("[CX-PM] " + report["explanation_zh"] + "\n")
        return 3

    df = to_dataframe(ex["rows"])
    per_round_df = {int(r): g for r, g in df.groupby("round_index")}
    trace_counts = {str(r): int(g["case_id"].nunique()) for r, g in per_round_df.items()}
    report["log_summary"] = {
        "events_used": int(len(df)),
        "traces_total": int(df["case_id"].nunique()),
        "traces_per_round": trace_counts,
        "activity_counts": {k: int(v) for k, v in df["activity"].value_counts().items()},
        "variants_per_round": {},
    }

    usable = {r: g for r, g in per_round_df.items()
              if g["case_id"].nunique() >= args.min_traces and r in NORMATIVE_MODELS}
    skipped = {str(r): int(g["case_id"].nunique()) for r, g in per_round_df.items() if r not in usable}
    report["log_summary"]["skipped_rounds_below_min_traces"] = skipped

    if not usable:
        report["status"] = "INSUFFICIENT_DATA"
        report["explanation_zh"] = (
            f"有事件但没有任何一轮达到 --min-traces={args.min_traces} 的 trace 数下限："
            f"{trace_counts}。alignments 在个位数 trace 上算得出数字，但那个数字不能解释。"
            "等样本积累后重跑；或在明确知情的前提下降低 --min-traces（须在预注册中记录）。")
        _write(report, args, started)
        sys.stderr.write("[CX-PM] " + report["explanation_zh"] + "\n")
        return 3

    logs = {}
    for r, g in usable.items():
        logs[r] = to_log(g)
        report["log_summary"]["variants_per_round"][str(r)] = int(
            g.sort_values(["case_id", "timestamp"]).groupby("case_id")["activity"]
            .apply(lambda s: ",".join(s)).nunique())

    nets = build_normative_nets()
    report["normative_models"] = {str(r): b["meta"] for r, b in nets.items()}
    unsound = [r for r, b in nets.items() if not b["meta"]["is_sound_wfnet"]]
    if unsound:
        report["status"] = "MODEL_ERROR"
        report["explanation_zh"] = (f"规范模型 {unsound} 不是健全工作流网；alignments 在不健全的网上"
                                    "会给出无意义的 fitness。先修模型表达式。")
        _write(report, args, started)
        return 4

    if not args.quiet:
        sys.stderr.write("[CX-PM] 路线 A：规范网 × 日志\n")
    ra = route_a(logs, nets, args.quiet)
    report["route_a_normative_conformance"] = ra

    rb = None
    if not args.no_cross_replay and len(logs) >= 2:
        if not args.quiet:
            sys.stderr.write("[CX-PM] 路线 B：分轮 discover + 交叉重放\n")
        rb = route_b(logs, args.noise_threshold, args.quiet)
        report["route_b_cross_replay"] = rb
    else:
        report["route_b_cross_replay"] = {
            "skipped_reason": "--no-cross-replay" if args.no_cross_replay
            else f"可用轮数 {len(logs)} < 2，交叉重放无意义"}

    report["verdicts"] = verdicts(ra, rb or {"cross_replay_matrix": {}})
    report["status"] = "OK"

    rc = 0
    if args.dry_run:
        checks = _dry_run_selftest(df, ex, ra, nets)
        report["dry_run_selftest"] = checks
        if not all(c["ok"] for c in checks):
            rc = 1

    _write(report, args, started)

    if args.dry_run and not args.quiet:
        sys.stderr.write("\n[CX-PM] --dry-run 自测：\n")
        for c in report["dry_run_selftest"]:
            sys.stderr.write(f"  [{'PASS' if c['ok'] else 'FAIL'}] {c['name']}：{c['detail']}\n")

    if not args.quiet:
        sys.stderr.write("\n[CX-PM] 判定：" + report["verdicts"]["overall"] + "\n")
        for r, v in report["verdicts"]["per_round"].items():
            sys.stderr.write(
                f"  R{r}: 规范 log_fitness={v['normative_log_fitness']} "
                f"（拟合轨迹占比 {v['normative_percentage_of_fitting_traces']}%）"
                f" 交叉最小差值={v['min_cross_replay_gap']} → {v['verdict_zh']}\n")
    return 0


def _write(report: dict, args, started) -> None:
    out = args.out or os.path.join(
        repo_root(), "qa-artifacts", "process-mining",
        f"report_{'dry_' if args.dry_run else ''}{started.strftime('%Y%m%dT%H%M%SZ')}.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    report["elapsed_seconds"] = round((datetime.now(timezone.utc) - started).total_seconds(), 2)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    sys.stderr.write(f"[CX-PM] 报告已写入：{out}\n")


LICENSE_NOTE = (
    "pm4py 社区版为 AGPL v3（导入时会打印该声明）。本脚本只能作为**离线分析工具**在独立环境中运行；"
    "不得被 server/app/ 任何模块导入，不得随校园版商业产品分发，否则触发 AGPL 的开源传染条款。"
    "论文/学位论文使用属学术用途，不受影响。"
)


if __name__ == "__main__":
    sys.exit(main())
