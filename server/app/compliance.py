"""合规端点（S5 §4.9）：监护人同意、使用时长、高危告警。"""
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app import store, store_erasure
from app.auth import current_user

router = APIRouter(prefix="/api", tags=["合规"])


class ConsentReq(BaseModel):
    guardian: str = "监护人"


class ConsentGrantReq(BaseModel):
    student_id: str
    guardian: str = "监护人"


@router.get("/consent")
def consent_status(user: dict = Depends(current_user)):
    return {"granted": store.has_consent(user.get("sub", "anon"))}


@router.post("/consent")
def consent_request(req: ConsentReq, user: dict = Depends(current_user)):
    """学生侧只能**发起申请**，不能自己签。

    原来这里是学生用自己的令牌直接 grant —— 等于未成年人给自己签监护人同意书，
    PIPL 第 31 条要求的「监护人同意」形同虚设。真正的授权改由教师确认（见下方端点），
    教师手上有纸质同意书，服务端记录经办人以备审计。
    """
    if store.has_consent(user.get("sub", "anon")):
        return {"granted": True, "pending": False}
    store.add_risk_event(user.get("sub", "anon"), "consent_request", 1,
                         f"学生申请开通 AI（监护人：{req.guardian[:20]}），待教师核验纸质同意书")
    return {"granted": False, "pending": True,
            "message": "已通知老师。请把监护人签好的同意书交给老师核验后开通。"}


@router.post("/teacher/consent")
def consent_grant_by_teacher(req: ConsentGrantReq, user: dict = Depends(current_user)):
    """教师核验纸质监护人同意书后为学生开通。"""
    if user.get("role") not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师权限")
    store.grant_consent(req.student_id, req.guardian, granted_by=user.get("sub", ""))
    return {"granted": True, "student_id": req.student_id}


class ConsentBatchReq(BaseModel):
    student_ids: list[str] = []
    guardian: str = "监护人"


# 字符类必须含姓名间隔号 U+00B7「·」：维吾尔族/哈萨克族等学生的学号常按姓名转写
# （如 stu-迪丽热巴·迪力木拉提），漏掉它会把真学生拒之门外 —— 校验的代价不能由少数民族学生付。
_STU_ID = re.compile(r"^stu-[\w一-鿿·-]{1,64}$")


@router.post("/teacher/consent/batch")
def consent_grant_batch(req: ConsentBatchReq, user: dict = Depends(current_user)):
    """一次开通多名学生。场景模拟实测：40 人的班老师要**逐个点 40 下**，
    这是整条链上最大的一块点击债 —— 而收同意书本来就是一摞纸一起收上来的。

    合规上与逐个开通完全等价：仍是教师核验纸质件后登记、逐条记录经办人；
    批量的只是点击，不是审查。

    第三轮审计的两条硬化：
    ① **只收学生 id 形状**。原来 `if x` 就放行，空白串、5000 字符长串、教师 id、
       路径穿越串全部原样落进 guardian_consents —— 同意表是审计凭证，脏行会
       在合规检查里变成「给不存在的人登记过监护人授权」。
    ② **截断必须如实报告**。原来 [:200] 静默截，240 人的课题老师看到「已开通」
       就翻页了，最后 40 人做不了测评还查不出原因。skipped 一并返回，前端要比对。
    """
    if user.get("role") not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师权限")
    # 先 strip 再去重：反过来的话 'stu-a' 和 'stu-a ' 会双双穿过去重、strip 后变成两条同名记录，
    # granted 计数虚高，老师以为多开了人
    seen = list(dict.fromkeys(x.strip() for x in req.student_ids if x and x.strip()))
    ids = [x for x in seen if _STU_ID.match(x)][:200]
    skipped = [x[:40] for x in seen if x not in ids]
    for uid in ids:
        store.grant_consent(uid, req.guardian, granted_by=user.get("sub", ""))
    return {"granted": len(ids), "student_ids": ids,
            "skipped": len(skipped), "skipped_ids": skipped[:20]}


@router.get("/teacher/consents")
def consent_list(user: dict = Depends(current_user)):
    if user.get("role") not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师权限")
    granted = {r["user_id"]: r for r in store.consent_rows() if r["consent_at"] and not r["withdrawn_at"]}
    return {"items": [
        {"id": s["id"], "name": s["name"], "granted": s["id"] in granted,
         "guardian": granted.get(s["id"], {}).get("guardian", "")}
        for s in store.list_students()
    ]}


@router.delete("/consent")
def consent_withdraw(user: dict = Depends(current_user)):
    """撤回随时可由学生本人发起 —— 收紧的是授予，不是撤回。

    注意：撤回**只让该学生退出分析集**（consent_ok_map 过滤），不删任何数据。
    删除是另一项权利、另一条通道（见下方 /my/data 三个端点）。这两件事必须分开，
    因为它们的后果不同：撤回可逆，删除不可逆。响应里如实带上这句话，
    否则学生点完撤回会以为「我的数据没了」。
    """
    store.withdraw_consent(user.get("sub", "anon"))
    return {"granted": False,
            "data_deleted": False,
            "message": "已撤回同意：AI 功能停止，你的数据不再进入研究分析。"
                       "但已有记录仍然保存着——如果你还想把它们删掉，请另外提出删除申请。"}


# ============ 个人信息主体权利（PIPL 第 44–47 条）============
# 查阅/复制是**本人自助**：非破坏性，且这是数据主体自己的权利，不该由教师把关。
# 删除照抄监护人同意的既定形态「学生发起申请、教师核验后执行」：未成年人的权利由监护人行使，
# 且删除比撤回更不可逆 —— 学生一时赌气不该能把自己整学期的作业和作品一键抹掉。

@router.get("/my/data")
def my_data(user: dict = Depends(current_user)):
    """查阅权：我身上存了哪些类别的数据、各多少条。"""
    return store_erasure.subject_summary(user.get("sub", "anon"))


@router.get("/my/data/export")
def my_data_export(user: dict = Depends(current_user)):
    """可携带权：给本人一份机器可读的完整副本。

    与 /api/research/export 的根本区别：那份是**给研究者的假名化数据**，
    这份是**给本人的原始数据** —— 对数据主体本人脱敏没有意义，他就是那个人。
    正因不脱敏，这里只认登录者自己的 uid，不接受任何 user_id 参数。
    """
    return store_erasure.subject_export(user.get("sub", "anon"))


@router.post("/my/data/erasure")
def my_data_erasure_request(user: dict = Depends(current_user)):
    """删除申请（学生侧只能申请，同监护人同意的形态）。"""
    uid = user.get("sub", "anon")
    n = store_erasure.subject_summary(uid)["total_rows"]
    store.add_risk_event(uid, "erasure_request", 1, f"学生申请删除全部个人数据（当前 {n} 条），待教师核验")
    return {"pending": True, "rows_pending": n,
            "message": "已通知老师。老师会与你和监护人确认后执行删除——删除不可撤销。"}


@router.delete("/teacher/data/{student_id}")
def erase_student_data(student_id: str, user: dict = Depends(current_user)):
    """教师核验后执行删除。逐表返回删除条数 ——「已删除」必须能被核对，不能只回一个 ok。"""
    if user.get("role") not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师权限")
    if not _STU_ID.match(student_id):
        raise HTTPException(400, "学号格式不合法")
    result = store_erasure.erase_subject(student_id)
    # 审计留痕**挂在经办教师名下**，不挂被删学生：挂学生等于删完立刻又写一条关于他的记录。
    # 代价是学生那条 erasure_request 会随删除一起消失（它本身也是他的个人信息），
    # 于是「谁申请的」不再可查 —— 这里记的是「教师执行了一次删除、清了多少条」，
    # 足够审计，且不复活个人信息。
    store.add_risk_event(user.get("sub", ""), "erasure_done", 1,
                         f"已执行删除请求，共清除 {result['total_rows']} 条记录")
    return result


class HeartbeatReq(BaseModel):
    seconds: int = 30


@router.post("/usage/heartbeat")
def usage_heartbeat(req: HeartbeatReq, user: dict = Depends(current_user)):
    # 返回**连续会话**时长，前端据此在一节课的量（40 分钟）上提醒休息一次。
    # 累计值不适合做这件事：它是终身累加的，第二天一进来就会立刻弹提醒。
    r = store.add_usage(user.get("sub", "anon"), max(0, min(120, req.seconds)))
    return {"total": r["total"], "sessionSeconds": r["session_seconds"]}


class MilestoneReq(BaseModel):
    kind: str


@router.post("/student/milestone")
def milestone_claim(req: MilestoneReq, user: dict = Depends(current_user)):
    """认领里程碑。`first=true` 时前端才播动画。

    「一生只弹一次」必须由服务端裁定：放 localStorage 的话，学生换台机器或清一次缓存
    就能重刷，它就从「能力确认」退化成「可反复触发的奖励」。
    """
    return {"first": store.claim_milestone(user.get("sub", "anon"), req.kind)}


@router.get("/student/milestones")
def milestone_list(user: dict = Depends(current_user)):
    return {"kinds": store.list_milestones(user.get("sub", "anon"))}


@router.get("/student/usage")
def usage_get(user: dict = Depends(current_user)):
    total = store.get_usage(user.get("sub", "anon"))
    return {"totalSeconds": total, "minutes": round(total / 60, 1)}


@router.get("/teacher/alerts")
def teacher_alerts(user: dict = Depends(current_user)):
    if user.get("role") not in ("teacher", "researcher"):
        raise HTTPException(403, "需要教师权限")
    return store.list_risk_events()
