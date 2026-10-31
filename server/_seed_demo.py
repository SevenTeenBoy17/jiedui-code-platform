# -*- coding: utf-8 -*-
"""重建演示数据：学生、班级、题库、视频、练习集、课例、推送、一项进行中的课题。"""
import json, io, time, urllib.request, sqlite3, random

B = "http://127.0.0.1:9099"
DB = "D:/VB/jiedui-code-platform/CX/server/jiedui.db"
log = io.open("seed_demo.log", "w", encoding="utf-8")


def out(*a):
    log.write(" ".join(str(x) for x in a) + "\n"); log.flush()


def call(m, p, tok=None, body=None):
    r = urllib.request.Request(B + p, method=m)
    r.add_header("Content-Type", "application/json")
    if tok:
        r.add_header("Authorization", "Bearer " + tok)
    d = json.dumps(body).encode() if body is not None else (b"{}" if m in ("POST", "PUT") else None)
    try:
        with urllib.request.urlopen(r, d) as x:
            return x.status, json.loads(x.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode() or "{}")
        except Exception:
            return e.code, {}


def login(u, role):
    return call("POST", f"/api/auth/{role}/login", body={"username": u, "password": "123456"})[1]["token"]


T = login("teacher", "teacher")
out("=== 重建演示数据 ===\n")

# 1 学生（登录一次即建号）
NAMES = ["xiaoma", "xiaohua", "xiaoming", "xiaohong", "xiaogang", "xiaomei",
         "xiaolin", "xiaoyu", "xiaotao", "xiaojun", "xiaoqi", "xiaoxue"]
for n in NAMES:
    login(n, "student")
out(f"1 学生      {len(NAMES)} 名（密码统一 123456）")

# 2 班级
c1 = call("POST", "/api/resources/classes", T, {"name": "初一(1)班", "grade": "七年级"})[1]["id"]
c2 = call("POST", "/api/resources/classes", T, {"name": "初一(2)班", "grade": "七年级"})[1]["id"]
call("PUT", f"/api/resources/classes/{c1}/students", T, {"student_ids": [f"stu-{n}" for n in NAMES[:6]]})
call("PUT", f"/api/resources/classes/{c2}/students", T, {"student_ids": [f"stu-{n}" for n in NAMES[6:]]})
out(f"2 班级      初一(1)班 id={c1}（6人）· 初一(2)班 id={c2}（6人）")

# 3 题库
EX = [
    {"title": "猜数字游戏", "summary": "电脑随机出数，用二分不断缩小范围",
     "language": "python", "difficulty": 2, "ct_dims": {"algorithm": 8, "decompose": 5},
     "statement": "电脑在 1–100 之间随机想一个数，你来猜，每次告诉你大了还是小了。",
     "hints": ["先想清楚：什么时候该往大猜？", "范围怎么表示？"]},
    {"title": "统计成绩", "summary": "读入一串成绩，算平均分与最高分",
     "language": "python", "difficulty": 1, "ct_dims": {"abstract": 6, "model": 5}},
    {"title": "水仙花数", "summary": "找出所有三位的水仙花数",
     "language": "python", "difficulty": 2, "ct_dims": {"algorithm": 7, "verify": 4}},
    {"title": "画正多边形", "summary": "用海龟画出边数可变的正多边形",
     "language": "python", "difficulty": 1, "ct_dims": {"transfer": 7, "abstract": 5}},
    {"title": "冒泡排序", "summary": "把一列数从小到大排好，并数一数比较了几次",
     "language": "cpp", "difficulty": 3, "ct_dims": {"algorithm": 9, "verify": 6}},
    {"title": "找出重复的名字", "summary": "一份名单里有人报了两次，把他找出来",
     "language": "python", "difficulty": 2, "ct_dims": {"model": 7, "decompose": 5}},
]
eids = [call("POST", "/api/resources/exercises", T, e)[1]["id"] for e in EX]
out(f"3 题库      {len(eids)} 道（Python/C++，带六维标注）")

# 4 视频（白名单内 + 一个待审核用于演示拦截）
V = [
    {"title": "Python 入门·变量与输入", "url": "https://www.bilibili.com/video/BV1demo1",
     "summary": "10 分钟搞懂变量", "category": "python", "ct_dims": {"abstract": 5}},
    {"title": "循环怎么想", "url": "https://www.icourse163.org/course/demo",
     "summary": "把重复的事交给循环", "category": "python", "ct_dims": {"algorithm": 6}},
    {"title": "站外来源示例", "url": "https://unknown-site.example.com/v/1", "summary": "用于演示外链审核"},
]
vids = []
for v in V:
    st, d = call("POST", "/api/resources/videos", T, v)
    vids.append(d["id"])
    if d.get("review_state") != "ok":
        out(f"   外链审核 「{v['title']}」→ {d['review_state']}（学生端不可见）")
out(f"4 视频      {len(vids)} 个")

# 5 练习集
sid_set = call("POST", "/api/resources/sets", T, {"title": "第一周·从输入到循环", "goal": "会用变量、条件和循环解决简单问题"})[1]["id"]
call("PUT", f"/api/resources/sets/{sid_set}/items", T,
     {"items": [{"item_type": "exercise", "ref_id": eids[1], "required": 1},
                {"item_type": "video", "ref_id": vids[0], "required": 0},
                {"item_type": "exercise", "ref_id": eids[0], "required": 1}]})
out(f"5 练习集    id={sid_set}（3 项）")

# 6 课例
call("POST", "/api/research/../api/resources/cases", T, {}) if False else None
case = call("POST", "/api/resources/cases", T, {
    "title": "猜数字·一课时", "grade": "七年级", "language": "python",
    "goal": "用循环与条件解决猜数问题，体会二分思想",
    "ct_dims": {"algorithm": 8, "decompose": 5},
    "flow": [{"stage": "情境导入", "minutes": 5, "teacher": "演示猜数游戏", "student": "试猜并说规律"},
             {"stage": "建模", "minutes": 10, "teacher": "引导画流程图", "student": "小组画图"},
             {"stage": "实践", "minutes": 20, "teacher": "巡视答疑", "student": "结对编程实现"},
             {"stage": "小结", "minutes": 5, "teacher": "追问为什么二分快", "student": "复述思路"}],
    "reflection": "学生容易把边界写错，下次先让他们手算 3 轮再动手。"})[1]
out(f"6 课例      id={case.get('id')}（4 环节 / 40 分钟）")

# 7 学习行为（让学情、六维、课堂监看有真实数据）
now = int(time.time())
con = sqlite3.connect(DB)
random.seed(7)
for i, n in enumerate(NAMES):
    uid = f"stu-{n}"
    base = now - (6 - i % 6) * 3600
    seq = []
    for r in range(random.randint(4, 14)):
        seq.append("run")
        if random.random() < 0.45:
            seq.append("error")
            if random.random() < 0.75:
                seq += ["run", "fix"]
        if random.random() < 0.3:
            seq.append("ai_help")
    if random.random() < 0.5:
        seq.append("design_create")
    for j, t in enumerate(seq):
        con.execute("INSERT INTO ct_events(user_id,type,detail,project_id,ts,sv) VALUES(?,?,?,NULL,?,2)",
                    (uid, t, "运行成功" if t == "run" else ("NameError: name 'n' is not defined" if t == "error" else ""),
                     base + j * random.randint(40, 200)))
con.commit(); con.close()
out("7 学习行为  12 名学生的真实事件流（运行/报错/修复/求助/设计）")

# 8 监护人同意 + 一次推送
for n in NAMES:
    call("POST", "/api/teacher/consent", T, {"student_id": f"stu-{n}", "guardian": "家长"})
p = call("POST", "/api/resources/push", T,
         {"res_type": "set", "res_id": sid_set, "class_ids": [c1],
          "reason": "本周作业，周三前完成", "due_at": now + 3 * 86400, "required": 1})[1]
out(f"8 同意与推送 12 人已登记监护人同意 · 练习集下发给 {p['targets']} 人")

out("\n完成。教师 teacher/123456，学生 xiaoma…xiaoxue/123456。")
log.close()
