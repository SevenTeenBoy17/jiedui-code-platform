"""
研究用的基础统计（纯标准库，不引 numpy/scipy）。

**刻意不提供 p 值 / t 检验 / ANCOVA**，三个理由：
1. 仓里没有 numpy/scipy，手搓不完全 Beta 函数往结题报告里塞 p 值不可接受；
2. 每组只有 1 个教学班时，组别与班级完全共线，p 值在数学上就是错的；
3. 一线教师不熟悉假设检验的前提，给了 p 值只会诱发"p<0.05 就是有效"的误读。

平台只出 mean / sd / n / gain / Cohen's d / 逐题难度与点二列区分度 / α 参考值 —— 全是纯算术，
推断留给导出的宽表 CSV 与高校导师。

α 范畴修正（终审 #5，法源：升级方案 L47）：对能力卷（pre/post 客观题卷）**不再把
Cronbach's α 当信度主张** —— 卷子六个维度是设计上的异质结构，α 的同质性前提不成立，
α 偏低是设计使然而非工具缺陷。能力卷的工具质量主张改由逐题统计承担：
item_difficulty（通过率 p）+ point_biserial（点二列区分度）；α 仅作同质性参考值报告。
"""
from math import sqrt, atanh, tanh, isfinite


def mean(xs) -> float:
    xs = [float(x) for x in xs if x is not None]
    return round(sum(xs) / len(xs), 2) if xs else 0.0


def sd(xs) -> float:
    """样本标准差（n-1）。少于 2 个有效值返回 0。"""
    xs = [float(x) for x in xs if x is not None]
    if len(xs) < 2:
        return 0.0
    m = sum(xs) / len(xs)
    return round(sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1)), 2)


def cohens_d(a, b) -> float | None:
    """两组均值差的标准化效应量（合并标准差）。样本不足或方差为零时返回 None，不硬凑数字。"""
    a = [float(x) for x in a if x is not None]
    b = [float(x) for x in b if x is not None]
    if len(a) < 2 or len(b) < 2:
        return None
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    va = sum((x - ma) ** 2 for x in a) / (len(a) - 1)
    vb = sum((x - mb) ** 2 for x in b) / (len(b) - 1)
    pooled = ((len(a) - 1) * va + (len(b) - 1) * vb) / (len(a) + len(b) - 2)
    if pooled <= 0:
        return None
    return round((ma - mb) / sqrt(pooled), 2)


def cronbach_alpha(response_matrix) -> float | None:
    """内部一致性系数 α。入参为「每人一行、每题一列」的得分矩阵。

    **范畴边界（升级方案 L47）**：α 假定各题测同一个构念（同质性）。本平台的能力卷
    六个维度**设计上异质**，对它算出的 α 只能作「同质性参考值」（alpha_reference）呈现，
    不构成信度主张 —— α 偏低是维度异质的预期结果，不是卷子不可靠的证据。
    工具质量主张请改用 item_difficulty / point_biserial 的逐题证据。
    """
    rows = [r for r in response_matrix if r]
    if len(rows) < 3:
        return None
    k = len(rows[0])
    if k < 2 or any(len(r) != k for r in rows):
        return None
    item_var_sum = sum(_var([r[i] for r in rows]) for i in range(k))
    total_var = _var([sum(r) for r in rows])
    if total_var <= 0:
        return None
    return round((k / (k - 1)) * (1 - item_var_sum / total_var), 2)


def _var(xs) -> float:
    if len(xs) < 2:
        return 0.0
    m = sum(xs) / len(xs)
    return sum((x - m) ** 2 for x in xs) / (len(xs) - 1)


def item_difficulty(scores_matrix) -> list:
    """逐题难度（经典测量的通过率 p）：每题「得分>0 的人数 / 作答人数」。纯算术。

    入参与 cronbach_alpha 同构（每人一行、每题一列）。空矩阵或行长不齐返回 []
    （行长不齐说明数据本身有问题，硬对齐会把难度算到错的题上）。
    p 的常用参考区间是 0.3~0.8：过高（全对）没有区分空间，过低（全错）可能是题干有歧义 ——
    这是能力卷（维度异质）该报的工具质量证据，替代被降级的 α（升级方案 L47）。
    """
    rows = [r for r in scores_matrix if r]
    if not rows:
        return []
    k = len(rows[0])
    if any(len(r) != k for r in rows):
        return []
    return [round(sum(1 for r in rows if r[i] > 0) / len(rows), 2) for i in range(k)]


def point_biserial(item, total) -> float | None:
    """点二列相关（区分度）：单题 0/1 得分与卷面总分的相关。纯算术，不引 scipy。

    r_pb = (M1 - M0) / S_x × sqrt(p·q)，S_x 取总体标准差 —— 数学上等价于把
    二分题目当 0/1 变量与总分做皮尔逊相关。样本 <3、题目无变异（全对/全错）
    或总分无变异时返回 None，不硬凑数字（与 cohens_d 的拒凑原则一致）。
    """
    pairs = [((1 if a > 0 else 0), float(b)) for a, b in zip(item, total)
             if a is not None and b is not None]
    n = len(pairs)
    if n < 3:
        return None
    ones = [t for x, t in pairs if x == 1]
    zeros = [t for x, t in pairs if x == 0]
    p = len(ones) / n
    if p in (0.0, 1.0):
        return None                                   # 全对/全错：该题无区分信息
    mt = sum(t for _, t in pairs) / n
    var_pop = sum((t - mt) ** 2 for _, t in pairs) / n
    if var_pop <= 0:
        return None                                   # 总分无变异：相关无定义
    m1 = sum(ones) / len(ones)
    m0 = sum(zeros) / len(zeros)
    return round((m1 - m0) / sqrt(var_pop) * sqrt(p * (1 - p)), 2)


def pearson_r(xs, ys) -> float | None:
    """皮尔逊相关（纯算术，效标效度 r 的算式 —— 终审断点8：让六维第一次从断言变可证伪假设）。

    成对丢缺失（任一侧 None 的对子整对不进）；n<3 或任一侧零方差返回 None，
    不硬凑数字（与 cohens_d / point_biserial 的拒凑原则一致）。
    """
    pairs = [(float(a), float(b)) for a, b in zip(xs, ys) if a is not None and b is not None]
    n = len(pairs)
    if n < 3:
        return None
    mx = sum(a for a, _ in pairs) / n
    my = sum(b for _, b in pairs) / n
    sxx = sum((a - mx) ** 2 for a, _ in pairs)
    syy = sum((b - my) ** 2 for _, b in pairs)
    if sxx <= 0 or syy <= 0:
        return None                                   # 零方差：相关无定义，拒凑
    sxy = sum((a - mx) * (b - my) for a, b in pairs)
    return round(sxy / sqrt(sxx * syy), 3)


def fisher_ci(r, n, z: float = 1.96) -> list | None:
    """Fisher-z 变换的 r 置信区间 [lo, hi]（默认 95%）。

    定位纪律（终审 §8-1）：单班规模下这是**估计不是检验** —— 报点估计 + CI，
    禁止只报显著性。n<4 时 se=1/sqrt(n-3) 无定义，返回 None；|r|>=1 时
    atanh 无定义（完全相关的 CI 无意义），同样返回 None 不硬造。
    """
    if r is None or n is None or n < 4:
        return None
    if not (-1 < r < 1):
        return None
    zr = atanh(r)
    se = 1 / sqrt(n - 3)
    return [round(tanh(zr - z * se), 3), round(tanh(zr + z * se), 3)]


def rank_avg(vals) -> list:
    """平均秩（midrank）：值完全相等的一段占位次 [i..j] 时，该段所有元素统一取 (i+j)/2+1。

    **不是**竞争排名 (1,1,3)，**也不是**稠密排名 (1,1,2) —— 只有平均秩能让「秩上的皮尔逊」
    等于带 tie-correction 的 Spearman ρ。返回值与入参等长、位置一一对应；
    秩之和恒为 n(n+1)/2（可作自检）。
    """
    idx = sorted(range(len(vals)), key=lambda i: vals[i])
    ranks = [0.0] * len(vals)
    i = 0
    while i < len(idx):
        j = i
        while j + 1 < len(idx) and vals[idx[j + 1]] == vals[idx[i]]:
            j += 1
        r = (i + j) / 2 + 1                 # 0-based 位次 → 1-based 平均秩
        for k in range(i, j + 1):
            ranks[idx[k]] = r
        i = j + 1
    return ranks


def spearman_rho(xs, ys) -> float | None:
    """Spearman 秩相关 ρ ≡ 对**平均秩向量**做皮尔逊相关（外部调研 R2「hop 的正确定位」：
    供给侧×需求侧两块的关系必须用 ρ 报出，与真实部署类别的 ρ≈0.31–0.35 对标）。

    有并列时「秩上的皮尔逊」不是近似，而是 ρ 的定义本身，所以实现只要 rank_avg + pearson_r，
    零新数学。要在方法章写公式请写带 tie-correction 的那一支：
      ρ = [(n³−n)/6 − Σd² − T_x − T_y] / sqrt(((n³−n)/6 − 2T_x)·((n³−n)/6 − 2T_y))
    （T = Σ_g (t_g³ − t_g)/12 逐并列组求和）——已与本实现在 9 条验收向量上逐值核对一致。

    **禁用简化式 ρ = 1 − 6Σd²/(n(n²−1))**：它只在两侧都无并列时成立，而 hop×u_round 两侧
    天然重并列。有并列时它给出错值，且错误方向不受控地偏向**高估 |ρ|**（验收向量 V4：
    真值 0.855，简化式给 0.869；V5：真值 0.949，给 0.95）—— 也就是偏向「hop 供给侧确实
    解释了需求侧 uptake」的自利结论，直接违反 R2「编码偏移方向必须对自己不利」的纪律。
    零方差时它更会凭空吐出 0.5（V7/V9），而正确答案是「无定义」。

    **管线顺序不可颠倒**：① 成对丢缺失 → ② 在**剩余配对上**排秩 → ③ 交给 pearson_r。
    先排秩后丢缺失会让幸存元素带着已作废的秩进入计算（V6：正确 0.6，错序得 0.707）。

    退化一律 None（n<3、任一侧秩零方差、NaN/inf 剔除后不足 3 对），**绝不返回 0.0**：
    0.0 是「不存在单调关联」这个可解读的真值，用它冒充「样本不足/无定义」会被直接读成
    「hop 与学生 uptake 无关」—— 凭空造出一条与预注册结论相反的证据。
    调用方必须同时回 n_pairs，否则读表的人分不清 None 是哪一种。

    不返回 p 值：本模块顶部的纪律（无 scipy、单班共线、教师误读）对秩相关同样成立。
    需要区间请配 fisher_ci(rho, n_pairs)，并注明 Fisher-z 施于秩相关是近似。
    """
    pairs = []
    for a, b in zip(xs, ys):
        if a is None or b is None:
            continue
        fa, fb = float(a), float(b)         # bool/int/float 混排都可比，不对 bool 特判
        if not (isfinite(fa) and isfinite(fb)):
            continue                        # NaN 参与排序会产生依赖排序实现的垃圾秩，属静默错误
        pairs.append((fa, fb))
    if len(pairs) < 3:
        return None                         # 两点必然穿过一条单调曲线，ρ 恒为 ±1，是伪信息
    rx = rank_avg([a for a, _ in pairs])
    ry = rank_avg([b for _, b in pairs])
    # 退化判定（n<3 / 零方差 → None）与四舍五入到 3 位由 pearson_r 一次性承担，不重复实现
    return pearson_r(rx, ry)


def describe(xs) -> dict:
    xs = [x for x in xs if x is not None]
    return {"n": len(xs), "mean": mean(xs), "sd": sd(xs)}
