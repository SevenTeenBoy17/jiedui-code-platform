"""作品云端存储 + 下载/上传作品包（S2-4 §4.3）。"""
import io
import json
import zipfile
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app import store
from app.auth import current_user

router = APIRouter(prefix="/api/projects", tags=["作品"])

EXT = {"python": "py", "cpp": "cpp", "c": "c"}


class CreateReq(BaseModel):
    title: str
    language: str  # python|cpp|c


class SaveReq(BaseModel):
    code: str
    blockState: str | None = None


def _uid(user: dict) -> str:
    return user.get("sub", "anon")


@router.get("")
def list_projects(user: dict = Depends(current_user)):
    return store.list_projects(_uid(user))


@router.post("")
def create(req: CreateReq, user: dict = Depends(current_user)):
    if req.language not in EXT:
        raise HTTPException(400, "不支持的语言")
    return store.create_project(_uid(user), req.title.strip() or "未命名作品", req.language)


@router.get("/{pid}")
def get(pid: int, user: dict = Depends(current_user)):
    p = store.get_project(pid, _uid(user))
    if not p:
        raise HTTPException(404, "作品不存在")
    return p


@router.post("/{pid}/versions")
def save_version(pid: int, req: SaveReq, user: dict = Depends(current_user)):
    r = store.save_version(pid, _uid(user), req.code, req.blockState)
    if r is None:
        raise HTTPException(404, "作品不存在")
    # changed=False 表示内容与最新版一致、未落新行（幂等）。自动保存靠它决定要不要打扰学生。
    return {"versionNo": r["ver"], "changed": r["changed"]}


@router.get("/{pid}/versions")
def versions(pid: int, user: dict = Depends(current_user)):
    vs = store.list_versions(pid, _uid(user))
    if vs is None:
        raise HTTPException(404, "作品不存在")
    return vs


@router.delete("/{pid}")
def delete(pid: int, user: dict = Depends(current_user)):
    try:
        if not store.delete_project(pid, _uid(user)):
            raise HTTPException(404, "作品不存在")
    except store.EvidenceRetentionError as exc:
        raise HTTPException(409, str(exc)) from exc
    return {"ok": True}


class DesignReq(BaseModel):
    type: str  # flow | pseudocode
    payload: str


@router.post("/{pid}/design")
def save_design(pid: int, req: DesignReq, user: dict = Depends(current_user)):
    """保存设计产物（流程图/伪代码，§4.7）。建模维度证据。"""
    if not store.get_project(pid, _uid(user)):
        raise HTTPException(404, "作品不存在")
    store.save_design(pid, _uid(user), req.type, req.payload)
    return {"ok": True}


@router.get("/{pid}/design")
def get_design(pid: int, user: dict = Depends(current_user)):
    return store.get_designs(pid, _uid(user))


@router.get("/{pid}/download")
def download(pid: int, user: dict = Depends(current_user)):
    """打包下载作品：main.<ext> + metadata.json + block_state.json。"""
    p = store.get_project(pid, _uid(user))
    if not p:
        raise HTTPException(404, "作品不存在")
    latest = p.get("latest") or {}
    code = latest.get("code") or ""
    ext = EXT[p["language"]]
    meta = {
        "format": "jiedui-work@1",
        "title": p["title"], "language": p["language"],
        "versionNo": p["latest_version"], "exportedBy": _uid(user),
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(f"main.{ext}", code)
        z.writestr("metadata.json", json.dumps(meta, ensure_ascii=False, indent=2))
        if latest.get("block_state"):
            z.writestr("block_state.json", latest["block_state"])
    buf.seek(0)
    import urllib.parse
    ascii_name = "".join(ch for ch in p["title"] if ch.isascii() and (ch.isalnum() or ch in "._-")) or "work"
    utf8_name = urllib.parse.quote(f"{p['title']}.zip")
    return StreamingResponse(
        buf, media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=\"{ascii_name}.zip\"; filename*=UTF-8''{utf8_name}"},
    )


@router.post("/upload")
async def upload(file: UploadFile = File(...), user: dict = Depends(current_user)):
    """导入作品包（.zip）：解析 metadata + main.<ext>，新建作品 + 首版本。"""
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(413, "文件过大（>5MB）")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            names = z.namelist()
            # 安全：禁路径穿越
            if any(n.startswith("/") or ".." in n for n in names):
                raise HTTPException(400, "非法的包内路径")
            meta = json.loads(z.read("metadata.json")) if "metadata.json" in names else {}
            language = meta.get("language", "python")
            if language not in EXT:
                language = "python"
            srcname = next((n for n in names if n.startswith("main.")), None)
            code = z.read(srcname).decode("utf-8", "replace") if srcname else ""
            block = z.read("block_state.json").decode("utf-8", "replace") if "block_state.json" in names else None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, f"无法解析作品包: {e}")
    title = (meta.get("title") or file.filename or "导入作品").replace(".zip", "")
    p = store.create_project(_uid(user), title, language)
    store.save_version(p["id"], _uid(user), code, block)
    return store.get_project(p["id"], _uid(user))
