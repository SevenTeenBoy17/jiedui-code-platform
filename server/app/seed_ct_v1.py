"""
把 ct-v1 题库组成前测卷与后测卷（等值卷对）。

等值卷 = 同蓝图、同知识点、同难度序，但情境与数字全换。
学生做完前测不会记住原题，后测测的还是同一批能力点。
"""
from app.ct_v1_items import BANK


def build_papers(blueprint_id: str = "ct-v1"):
    """返回 (前测题目, 后测题目)。题目结构与 assessments.items 一致。

    出题顺序按「每维取第 1 组 → 每维取第 2 组 → 每维取第 3 组」交错，
    而不是六道分解连着考 —— 连续同维度会让学生形成答题定势，也让中途放弃的
    学生在维度上系统性缺失（他只做了前几道 = 只测了某一维）。
    """
    if blueprint_id != "ct-v1":
        raise ValueError(f"未知的测评蓝图：{blueprint_id}")
    pre, post = [], []
    depth = max(len(d["pairs"]) for d in BANK)
    n = 0
    for level in range(depth):
        for d in BANK:
            if level >= len(d["pairs"]):
                continue
            p = d["pairs"][level]
            n += 1
            pre.append(_item(n, p["pre"], d["dim"], p["why"], level))
            post.append(_item(n, p["post"], d["dim"], p["why"], level))
    return pre, post


def _item(no: int, q: dict, dim: str, why: str, level: int) -> dict:
    return {
        "id": no,
        "stem": q["stem"],
        "options": q["options"],
        "answer": q["answer"],
        "dim": dim,
        "score": 1,
        "level": level + 1,        # 1 易 / 2 中 / 3 难
        "why": why,
    }


def build_probe_paper(blueprint_id: str = "ct-v1", exclude_stems=(), count: int = 3,
                      round_index: int = 1) -> list:
    """轮末 probe 锚题卷（学测评一体化·切分2）：抽 2-3 道客观题，跨维度、按轮序轮换。

    题池现状：ct-v1 只有 18 组 pre/post 等值题对，**没有独立 probe 池** ——
    probe_pool 独立扩题留待题库建设（届时题对扩为 (pre, probe_pool, post) 三元组，
    本函数改从 probe_pool 抽即可，调用侧口径不变）。当前的最小实现：

    - **只从 pre 变体抽题，post 变体绝不提前出现**：后测题面一旦在 probe 里露出，
      「同蓝图不同题」的前后测等值设计当场作废（锁卷红线的题面版）。
    - 先排除本课题 pre/post 卷已用题面（exclude_stems）；ct-v1 现状下 pre 变体
      全部用于前测，排除后必为空 → 回退为**复用 pre 变体作跨波锚题**——
      这不是妥协而有文献依据（蓝图铁律3：silent probe 即两波天然客观锚，
      重测间隔数周，锚题正确率差还能回填难度等值证据）。
    - 按轮序轮换起点（round_index 决定从哪一维/哪一难度带起抽），每维至多 1 题 ——
      交错抽维沿用 build_papers 的防呆：中途放弃不会造成维度系统性缺失。
    """
    if blueprint_id != "ct-v1":
        raise ValueError(f"未知的测评蓝图：{blueprint_id}")
    count = max(2, min(3, count))
    pre, _post = build_papers(blueprint_id)            # 只取 pre 变体（见上：post 绝不提前出现）
    excluded = set(exclude_stems)
    pool = [it for it in pre if it["stem"] not in excluded] or pre   # 排除后为空 → 锚题回退
    start = ((round_index - 1) * count) % len(pool)
    picked, dims_seen, i = [], set(), 0
    while len(picked) < count and i < len(pool):
        it = pool[(start + i) % len(pool)]
        if it["dim"] not in dims_seen:
            dims_seen.add(it["dim"])
            picked.append(it)
        i += 1
    # 重新编号 1..n：probe 卷是独立卷面，不沿用原卷题号
    return [{**it, "id": n + 1} for n, it in enumerate(picked)]


def blueprint_summary(blueprint_id: str = "ct-v1") -> dict:
    pre, _ = build_papers(blueprint_id)
    dims: dict = {}
    for it in pre:
        dims[it["dim"]] = dims.get(it["dim"], 0) + 1
    return {"blueprint_id": blueprint_id, "item_count": len(pre), "dims": dims,
            "note": "平台自编起步题库，未标准化；只解读两组增值之差"}
