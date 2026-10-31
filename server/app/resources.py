"""
资源中心 API（V3.5）：题库 / 学习视频 / 练习集 / 推送。
- 教师：CRUD + 推送 + 推送记录（完成率）
- 学生：只读（题面不含参考解）+ 我的推送 + 标记已读/完成
未成年人保护：视频外链走域名白名单，非白名单入 pending 且学生端不可见。
"""
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import store, store_resources as R
from app.auth import current_user

router = APIRouter(prefix="/api/resources", tags=["资源中心"])

# 视频外链白名单（教育/主流平台）。非白名单 → review_state=pending，学生端不下发。
VIDEO_WHITELIST = (
    "bilibili.com", "b23.tv", "youku.com", "qq.com", "iqiyi.com",
    "ixigua.com", "douyin.com", "pku.edu.cn", "icourse163.org", "xuetangx.com",
)


def _require_teacher(user: dict):
    if user.get("role") not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师权限")


def _review(url: str) -> str:
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return "pending"
    return "ok" if any(host == d or host.endswith("." + d) for d in VIDEO_WHITELIST) else "pending"


# ============ 题库 ============
class ExerciseIn(BaseModel):
    title: str = "未命名题目"
    summary: str = ""
    statement: str = ""
    language: str = "python"
    difficulty: int = 2
    starter_code: str = ""
    reference_solution: str = ""
    test_cases: list = []
    hints: list = []
    ct_dims: dict = {}
    tags: list = []
    related_video_id: int | None = None
    status: str = "published"


@router.get("/exercises")
def exercises(q: str = "", language: str = "", difficulty: int = 0, user: dict = Depends(current_user)):
    return {"items": R.list_exercises(q, language, difficulty)}


@router.get("/exercises/{eid}")
def exercise_detail(eid: int, user: dict = Depends(current_user)):
    # 学生看不到参考解
    d = R.get_exercise(eid, with_solution=user.get("role") in ("teacher", "researcher"))
    if not d:
        raise HTTPException(404, "题目不存在")
    return d


@router.post("/exercises")
def exercise_create(req: ExerciseIn, user: dict = Depends(current_user)):
    _require_teacher(user)
    eid = R.create_exercise(user.get("sub", "anon"), req.model_dump())
    return {"id": eid}


@router.put("/exercises/{eid}")
def exercise_update(eid: int, req: ExerciseIn, user: dict = Depends(current_user)):
    _require_teacher(user)
    if not R.update_exercise(eid, req.model_dump(exclude_unset=True)):
        raise HTTPException(404, "题目不存在或无改动")
    return {"ok": True}


@router.delete("/exercises/{eid}")
def exercise_delete(eid: int, user: dict = Depends(current_user)):
    _require_teacher(user)
    if not R.delete_exercise(eid):
        raise HTTPException(404, "题目不存在")
    return {"ok": True}


# ============ 视频 ============
class VideoIn(BaseModel):
    title: str = "未命名视频"
    summary: str = ""
    url: str
    poster_url: str | None = None
    duration_sec: int = 0
    language: str | None = None
    category: str | None = None
    tags: list = []
    ct_dims: dict = {}
    status: str = "published"


@router.get("/videos")
def videos(q: str = "", category: str = "", user: dict = Depends(current_user)):
    items = R.list_videos(q, category)
    if user.get("role") not in ("teacher", "researcher"):
        items = [v for v in items if v.get("review_state") == "ok"]   # 未过审外链不给学生
    return {"items": items}


@router.post("/videos")
def video_create(req: VideoIn, user: dict = Depends(current_user)):
    _require_teacher(user)
    state = _review(req.url)
    vid = R.create_video(user.get("sub", "anon"), req.model_dump(), review_state=state)
    return {"id": vid, "review_state": state,
            "note": None if state == "ok" else "该外链不在白名单，已标记待审核，学生端暂不可见"}


@router.delete("/videos/{vid}")
def video_delete(vid: int, user: dict = Depends(current_user)):
    _require_teacher(user)
    if not R.delete_video(vid):
        raise HTTPException(404, "视频不存在")
    return {"ok": True}


# ============ 练习集 ============
class SetIn(BaseModel):
    title: str = "未命名练习集"
    goal: str = ""
    language: str | None = None
    status: str = "published"


class SetItemsIn(BaseModel):
    items: list = []          # [{item_type, ref_id, required?, note?}]


@router.get("/sets")
def sets(user: dict = Depends(current_user)):
    return {"items": R.list_sets()}


@router.get("/sets/{sid}")
def set_detail(sid: int, user: dict = Depends(current_user)):
    d = R.get_set(sid)
    if not d:
        raise HTTPException(404, "练习集不存在")
    return d


@router.post("/sets")
def set_create(req: SetIn, user: dict = Depends(current_user)):
    _require_teacher(user)
    return {"id": R.create_set(user.get("sub", "anon"), req.model_dump())}


@router.put("/sets/{sid}/items")
def set_items(sid: int, req: SetItemsIn, user: dict = Depends(current_user)):
    _require_teacher(user)
    return {"count": R.set_items_replace(sid, req.items)}


@router.delete("/sets/{sid}")
def set_delete(sid: int, user: dict = Depends(current_user)):
    _require_teacher(user)
    if not R.delete_set(sid):
        raise HTTPException(404, "练习集不存在")
    return {"ok": True}


# ============ 班级（教学·下发与统计的单位）============
class ClassIn(BaseModel):
    name: str = "未命名班级"
    grade: str | None = None
    note: str = ""


class ClassStudentsIn(BaseModel):
    student_ids: list[str] = []


class ClassSocraticIn(BaseModel):
    socratic: bool = True


@router.get("/classes")
def classes(user: dict = Depends(current_user)):
    _require_teacher(user)
    flags, groups = R.class_socratic_map(), R.class_group_map()
    items = R.list_classes()
    for c in items:
        c["socratic"] = flags.get(c["id"], False)
        c["group_kind"] = groups.get(c["id"], "")
    return {"items": items, "roster": store.list_students()}


class ClassGroupIn(BaseModel):
    group_kind: str = ""          # exp 实验组 | ctrl 对照组 | '' 不参与


@router.put("/classes/{cid}/group")
def class_group(cid: int, req: ClassGroupIn, user: dict = Depends(current_user)):
    """给班级标注研究分组。分组是班级级的：同一个班里让一半学生的 AI 只提问、
    另一半正常写码，学生互相看屏幕，污染不可控。"""
    _require_teacher(user)
    if req.group_kind not in ("exp", "ctrl", ""):
        raise HTTPException(400, "分组只能是 exp / ctrl / 空")
    if not R.set_class_group(cid, req.group_kind):
        raise HTTPException(404, "班级不存在")
    return {"ok": True, "group_kind": req.group_kind,
            "socratic_hint": req.group_kind == "exp"}


@router.put("/classes/{cid}/socratic")
def class_socratic(cid: int, req: ClassSocraticIn, user: dict = Depends(current_user)):
    """给整个班锁定「强制苏格拉底式引导」。锁在服务端生效，学生端改不掉。"""
    _require_teacher(user)
    if not R.set_class_socratic(cid, req.socratic):
        raise HTTPException(404, "班级不存在")
    return {"ok": True, "socratic": req.socratic}


@router.post("/classes")
def class_create(req: ClassIn, user: dict = Depends(current_user)):
    _require_teacher(user)
    return {"id": R.create_class(user.get("sub", "anon"), req.model_dump())}


@router.put("/classes/{cid}/students")
def class_students(cid: int, req: ClassStudentsIn, user: dict = Depends(current_user)):
    _require_teacher(user)
    return {"size": R.set_class_students(cid, req.student_ids)}


@router.delete("/classes/{cid}")
def class_delete(cid: int, user: dict = Depends(current_user)):
    _require_teacher(user)
    # 进行中的课题引用了这个班就不能删 —— 一轮研究做到一半样本没了，数据直接作废
    from app import store_study
    used = store_study.studies_using_class(cid)
    if used:
        raise HTTPException(409, f"课题「{used[0]['title']}」正在使用这个班（{used[0]['phase']} 阶段），"
                                 f"删掉会让研究样本残缺。请先结束或删除该课题。")
    if not R.delete_class(cid):
        raise HTTPException(404, "班级不存在")
    return {"ok": True}


# ============ 课例（教研·操作性成果）============
class CaseIn(BaseModel):
    title: str = "未命名课例"
    grade: str | None = None
    language: str | None = None
    goal: str = ""
    ct_dims: dict = {}
    flow: list = []            # [{stage,minutes,teacher,student}]
    reflection: str = ""
    set_id: int | None = None
    status: str = "published"


@router.get("/cases")
def cases(q: str = "", user: dict = Depends(current_user)):
    return {"items": R.list_cases(q)}


@router.get("/cases/{cid}")
def case_detail(cid: int, user: dict = Depends(current_user)):
    d = R.get_case(cid)
    if not d:
        raise HTTPException(404, "课例不存在")
    return d


@router.post("/cases")
def case_create(req: CaseIn, user: dict = Depends(current_user)):
    _require_teacher(user)
    return {"id": R.create_case(user.get("sub", "anon"), req.model_dump())}


@router.put("/cases/{cid}")
def case_update(cid: int, req: CaseIn, user: dict = Depends(current_user)):
    _require_teacher(user)
    if not R.update_case(cid, req.model_dump(exclude_unset=True)):
        raise HTTPException(404, "课例不存在或无改动")
    return {"ok": True}


@router.delete("/cases/{cid}")
def case_delete(cid: int, user: dict = Depends(current_user)):
    _require_teacher(user)
    if not R.delete_case(cid):
        raise HTTPException(404, "课例不存在")
    return {"ok": True}


# ============ 推送 ============
class PushIn(BaseModel):
    res_type: str                 # exercise|video|set
    res_id: int
    student_ids: list[str] = []   # 指定学生
    class_ids: list[int] = []     # 或按班级下发（= 任务场景）
    reason: str = ""
    due_at: int | None = None     # 截止时间（任务）
    required: int = 0             # 是否必做


@router.post("/push")
def push(req: PushIn, user: dict = Depends(current_user)):
    """推送 = 轻量即时下发；带 class_ids + due_at 即为「任务」。两者共用一套记录，避免概念重复。"""
    _require_teacher(user)
    if req.res_type not in ("exercise", "video", "set", "assessment"):
        raise HTTPException(400, "未知资源类型")
    # 只有「两个范围都没指定」才算全班群发。
    # 曾经写成 `if not targets: 全平台` —— 勾了一个 0 人的空班（或不存在的班级 id）
    # 也会落到这条兜底上，一道带截止的必做题直接推给平台上所有学生。
    scoped = bool(req.student_ids or req.class_ids)
    targets = list(req.student_ids) + (R.class_student_ids(req.class_ids) if req.class_ids else [])
    if scoped and not targets:
        raise HTTPException(400, "所选班级里还没有学生，请先在「班级」页添加名单")
    if not scoped:
        targets = [s["id"] for s in store.list_students()]
    if not targets:
        raise HTTPException(400, "没有可推送的学生")
    targets = list(dict.fromkeys(targets))       # 跨班重复的学生只推一次
    pid = R.create_push(user.get("sub", "anon"), req.res_type, req.res_id,
                        targets, req.reason, req.due_at, req.required)
    return {"id": pid, "targets": len(targets)}


@router.get("/pushes")
def pushes(user: dict = Depends(current_user)):
    _require_teacher(user)
    return {"items": R.list_pushes()}


# ============ 学生端 ============
@router.get("/my/tasks/chain")
def my_task_chain(limit: int = 5, user: dict = Depends(current_user)):
    """学生端「任务链条」：老师推给我的最近几件事，按下发顺序排。

    替代此前那个「成长百分环」。链条只表示**做没做**，不含分数、百分比、排名 ——
    完成与否由服务端裁定（答题/标记完成都落库），学生改本地存储改不动它。
    """
    items = R.my_pushes(user.get("sub", "anon"), 30)
    items = sorted(items, key=lambda i: i["created_at"])[-limit:]
    return {"items": [{
        "target_id": i["target_id"], "title": i["title"], "kind": i["res_type"],
        "res_id": i["res_id"], "done": bool(i["done_at"]),
        "required": i["required"], "due_at": i["due_at"],
    } for i in items]}


@router.get("/my/pushes")
def my_pushes(user: dict = Depends(current_user)):
    items = R.my_pushes(user.get("sub", "anon"))
    return {"items": items, "unread": sum(1 for i in items if not i.get("read_at"))}


@router.post("/my/pushes/{target_id}/read")
def mark_read(target_id: int, user: dict = Depends(current_user)):
    return {"ok": R.mark_push(target_id, user.get("sub", "anon"), "read_at")}


@router.post("/my/pushes/{target_id}/done")
def mark_done(target_id: int, user: dict = Depends(current_user)):
    """标记完成只写 `task_done`，**不写 `fix`**。

    `fix` 是「报错后改对了」的证据，计入验证优化维；如果点一下「完成」也算 fix，
    学生不写一行代码就能把调试能力刷到满分，六维分就不再反映真实计算思维（课题效度问题）。
    `task_done` 只进时间线与完成率，不参与六维打分。
    """
    ok = R.mark_push(target_id, user.get("sub", "anon"), "done_at")
    if ok:
        store.add_ct_event(user.get("sub", "anon"), "task_done", "[push] 完成老师推送的学习任务", None)
    return {"ok": ok}
