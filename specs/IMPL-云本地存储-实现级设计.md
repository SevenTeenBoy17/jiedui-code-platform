# IMPL · 作品云端/本地存储（默认云、下载/上传、版本、离线）— 实现级设计

> **本文是《补充与优化升级_开发计划书与技术路线.md》§4.3「作品云端/本地存储」的实现级展开。**
>
> 上游 §4.3 目标：默认云端自动保存 + 版本树；一键下载**作品包**、上传**导入**继续编辑；本地 IndexedDB 离线缓存 + 联网同步队列。
> 上游验收：断网可编辑、联网自动同步；下载包可在另一账号上传后**原样打开（含积木工程）**。
>
> **对象**：面向初中生（未成年人）的结对编程智能体平台。存储设计须与合规护栏一致（数据最小化、上传防恶意、`require_active_consent` 门禁）。

---

## 0. 范围、锚定与不冲突声明

### 0.1 本文负责 / 不负责

| 负责（本文） | 不负责（引用既有规范） |
|---|---|
| 作品/版本/资源的**服务端持久化**（PG 元数据 + 对象存储 blob） | 作品包 `.zip` 的**前端序列化/反序列化**（已由编辑器规范定义，本文直接复用） |
| **下载/上传端点**、流式响应、解包校验、防恶意 | Blockly XML/JSON 互转、码↔块转换逻辑（编辑器规范 §8） |
| **版本树**（增版本/命名快照/回滚/diff） | 敏感词/PII 命中、危险分类、`OutputGuard`（合规规范 §4–6） |
| **前端 IndexedDB** 离线缓存 + 同步队列 + 冲突合并 | 实时协作 CRDT 合并（Yjs，本文只定义边界，见 §9.3） |
| `projects / project_versions / project_assets` 的细化 DDL | `project_blocks` 的列定义（上游 §6 已锚定，本文仅关联） |

### 0.2 数据表锚定（不自造）

上游 §6 / §7.1 已锚定以下表，本文**沿用列名、补充存储相关字段（external `object_key`、软删除、索引）**，不新增同义表：

```
projects(...)                                                  -- 作品（上游已有）
project_versions(...)                                          -- 版本树（本文细化）
project_assets(...)                                            -- 资源（本文细化，新增对象存储 key）
project_blocks(id, project_version_id, blockly_xml, generated_code)  -- 积木工程（上游 §6，本文只关联，不改列）
```

### 0.3 与编辑器规范对接点（关键，不重复实现）

编辑器规范 `IMPL-双模编辑器-实现级设计.md` §8.3 已定义作品包结构与 fflate 打包/解包：

```
work.zip
├─ source/main.(py|cpp|c)     # generated_code / 源码
├─ blocks/workspace.xml       # 仅 python 积木工程（决定 hasBlockOrigin）
├─ assets/                    # 绘图快照等（可选 turtle.png）
└─ metadata.json              # { version, language, hasBlockOrigin, ctTags, exportedAt }
```

本文的契约：

- **服务端打包**（`GET /download` 直出包）须产出**与前端 `exportWorkZip()` 字节级同构**的结构，以满足"另一账号上传原样打开"。
- **服务端解包**（`POST /upload` 校验入库）须接受前端 `exportWorkZip()` 产物，并完成 `metadata.json` schema 校验后映射到 `project_versions + project_blocks`。
- 二者共用一份 `metadata.json` schema（见 §5.2），编辑器侧与后端侧各持一份等价校验器，任一侧拒绝即拒绝。

---

## 1. 存储架构

### 1.1 三层职责

| 层 | 介质 | 存什么 | 不存什么 |
|---|---|---|---|
| **L1 前端离线层** | IndexedDB（`db: jiedui-works`） | 当前作品快照镜像、待同步操作的**同步队列**、最近 N 版只读缓存 | 任何他人作品；任何 PII |
| **L2 后端元数据层** | PostgreSQL（`learning` 库） | `projects / project_versions / project_assets / project_blocks` 的**元数据与小文本**（源码、blockly_xml、metadata_json） | 大二进制（绘图 PNG、上传原包）→ 仅存 `object_key` 引用 |
| **L3 对象存储层** | S3 兼容（MinIO/OSS/COS） | 资源 blob（图片/音频/绘图快照）、下载导出 `.zip` 缓存、上传原始包（审计留存） | 任何结构化业务字段 |

> **小文本入 PG、大 blob 入对象存储** 是本设计的核心取舍：源码与 blockly_xml 通常 < 64KB，直接入 PG 便于版本 diff/查询；资源与导出包是大对象，入对象存储以免膨胀 PG、并支持预签名直传直下，绕开应用层带宽。

### 1.2 默认云 + 本地兜底数据流

```
┌─────────────────────────── 浏览器（Vue3 + TS）───────────────────────────┐
│  EditorStore（code/blocks/language/dirty）                                │
│        │ onChange（防抖 800ms / 节流 5s）                                  │
│        ▼                                                                   │
│  useAutosave ──①写本地镜像──► IndexedDB.snapshots（永远先落本地）          │
│        │                                                                   │
│        ├─②在线 & 有同意─────► PUT /api/projects/{id}（乐观锁 base_version） │
│        │        成功 → 清 dirty、更新 server_version                        │
│        │        409  → 冲突合并（§2.4）                                     │
│        │                                                                   │
│        └─②离线/失败────────► IndexedDB.syncQueue.enqueue(op)              │
│                                  network online 事件 / 心跳 → replay()      │
└───────────────────────────────────────────────────────────────────────────┘
                                   │ HTTPS
                                   ▼
┌──────────────────────── 后端（FastAPI）──────────────────────────────────┐
│  require_active_consent（合规门禁，无同意 403）                            │
│  ProjectService ── PG: projects/project_versions/project_blocks（元数据）  │
│  AssetService   ── 预签名 ──► 对象存储（资源/导出包/上传原包）             │
│  AuditService   ── audit_logs（append-only：download/upload/restore）      │
└───────────────────────────────────────────────────────────────────────────┘
```

要点：

1. **永远先落本地**（IndexedDB）→ 即使断网/后端 500，用户编辑零丢失。
2. **默认云**：在线且有有效同意时，本地写后立即异步推云；云成功才算"已保存到云"。
3. **本地兜底**：离线或推云失败 → 入同步队列；恢复后自动重放，用户无感。

---

## 2. 保存策略

### 2.1 触发与节流

| 触发源 | 策略 | 参数 |
|---|---|---|
| 编辑器内容变更（code/blocks） | **防抖** | `trailing` 800ms（停手后落盘） |
| 持续编辑（长时间不停手） | **节流兜底** | 每 5s 强制刷一次，防长会话丢失 |
| 失焦 / 路由离开 / 关闭页 | **立即 flush** | `beforeunload` + `visibilitychange:hidden` |
| 手动「保存为命名快照」 | **立即 + 升版本** | 见 §3.2 |

> 防抖落本地与推云用同一节奏；但**本地写不防抖到 800ms**——本地写是同步且廉价的，content 变更即刻镜像，防抖只作用于"推云"这一网络副作用。

### 2.2 前端 store（Pinia）— 保存状态机

```ts
// stores/persistence.ts
import { defineStore } from 'pinia'

export type SaveState = 'idle' | 'dirty' | 'savingLocal' | 'savingCloud' | 'synced' | 'offlineQueued' | 'conflict'

export const usePersistenceStore = defineStore('persistence', {
  state: () => ({
    saveState: 'idle' as SaveState,
    serverVersion: 0,          // 乐观锁基线：最近一次云端确认的 version_no
    localRevision: 0,          // 本地单调递增，用于队列去重
    lastSyncedAt: null as string | null,
    pendingOps: 0,             // 同步队列深度（UI 角标）
    conflict: null as null | { remote: any; local: any },
  }),
  getters: {
    canEditOffline: () => true,                        // 离线始终可编辑（写本地）
    badge: (s) => s.saveState === 'synced' ? '已同步'
                 : s.saveState === 'offlineQueued' ? `离线·待同步(${s.pendingOps})`
                 : s.saveState === 'conflict' ? '版本冲突'
                 : s.saveState === 'savingCloud' ? '保存中…' : '已修改',
  },
  actions: {
    markDirty()        { if (this.saveState !== 'conflict') this.saveState = 'dirty' },
    setServerVersion(v: number) { this.serverVersion = v; this.lastSyncedAt = new Date().toISOString() },
  },
})
```

### 2.3 自动保存 composable（核心）

```ts
// composables/useAutosave.ts
import { watch } from 'vue'
import { useEditorStore } from '@/stores/editor'
import { usePersistenceStore } from '@/stores/persistence'
import { idb } from '@/offline/idb'
import { syncQueue } from '@/offline/syncQueue'
import { putProject } from '@/api/projects'
import { debounce, throttle } from '@/utils/timing'

export function useAutosave(projectId: string) {
  const editor = useEditorStore()
  const ps = usePersistenceStore()

  // 组装一份"待持久化载荷"，与上游 §6 / 编辑器 §8.2 对齐
  function buildPayload() {
    return {
      language: editor.language,
      code: editor.code,
      blocks: editor.language === 'python' && editor.hasBlockOrigin
        ? editor.toPersistedBlocks()              // { blockly_xml, generated_code }
        : null,
      base_version: ps.serverVersion,             // 乐观锁基线
      client_revision: ++ps.localRevision,        // 幂等键的一部分
      client_mutation_id: crypto.randomUUID(),    // 幂等键（防重复 PUT）
    }
  }

  // ① 永远先落本地镜像（同步、廉价）
  async function persistLocal() {
    const payload = buildPayload()
    await idb.snapshots.put({ projectId, ...payload, updatedAt: Date.now() })
    ps.saveState = 'dirty'
    return payload
  }

  // ② 推云（防抖 800ms） / ③ 节流兜底（每 5s）
  const pushCloud = async () => {
    const payload = await persistLocal()
    if (!navigator.onLine) { return enqueue(payload) }
    try {
      ps.saveState = 'savingCloud'
      const res = await putProject(projectId, payload)   // PUT /api/projects/{id}
      ps.setServerVersion(res.version_no)
      ps.saveState = 'synced'
    } catch (e: any) {
      if (e.status === 409) return onConflict(e.body)     // 乐观锁冲突
      if (e.status === 403) { ps.saveState = 'dirty'; return }  // 无同意：仅本地，等门禁恢复
      enqueue(payload)                                     // 5xx/网络错 → 入队
    }
  }

  function enqueue(payload: any) {
    syncQueue.enqueue({ projectId, type: 'put', payload })
    ps.saveState = 'offlineQueued'
    ps.pendingOps = syncQueue.size()
  }

  async function onConflict(remote: any) {
    const local = await idb.snapshots.get(projectId)
    ps.conflict = { remote, local }
    ps.saveState = 'conflict'                              // 交给冲突合并 UI（§2.4）
  }

  const debounced = debounce(pushCloud, 800)
  const throttled = throttle(pushCloud, 5000)

  watch(
    () => [editor.code, editor.blocklyJson, editor.language],
    () => { ps.markDirty(); persistLocal(); debounced(); throttled() },
    { deep: true },
  )

  // 失焦/关页：立即 flush
  const flush = () => { debounced.flush?.(); throttled.flush?.(); pushCloud() }
  window.addEventListener('beforeunload', flush)
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush() })

  return { flush, pushCloud }
}
```

### 2.4 冲突合并（乐观锁 + last-write + 提示）

**并发场景**：同一作品在两个端（如教室机 + 家里）先后编辑；后到的 `PUT` 携带过期的 `base_version`，后端返回 `409 VERSION_CONFLICT` 并附**当前远端版本**。

合并策略（**默认安全：不静默覆盖**）：

1. **服务端**：乐观锁判定 `base_version == projects.current_version_no` 才放行；否则 `409` + 返回 `{ remote_version_no, remote_snapshot }`。
2. **前端**：
   - 若 `local.code === remote.code`（仅元数据差异）→ 直接采纳 remote 版本号，重放（无感）。
   - 否则弹**冲突解决面板**：左本地 / 右云端，行级 diff（§3.4 复用），三选一：
     - **保留我的**（local-wins）：以 remote 版本为 `base`，提交 local 内容 → 生成新版本（last-write 落地，但**保留了被覆盖版本**在版本树，可回滚）。
     - **采用云端**（remote-wins）：丢弃 local 未同步改动（已在版本树留底）。
     - **另存为分支**：local 作为 `parent_version_id = remote_version_no` 的新命名快照，两版共存。

```ts
async function resolveConflict(choice: 'mine' | 'theirs' | 'fork') {
  const ps = usePersistenceStore(); const { remote, local } = ps.conflict!
  if (choice === 'theirs') { editor.loadProject(remote); ps.setServerVersion(remote.version_no) }
  else {
    const payload = { ...local, base_version: remote.version_no,
                      fork: choice === 'fork', client_mutation_id: crypto.randomUUID() }
    const res = await putProject(projectId, payload)   // base 已对齐，必成功
    ps.setServerVersion(res.version_no)
  }
  ps.conflict = null; ps.saveState = 'synced'
}
```

> **为什么不纯 last-write-wins？** 未成年人作品是研究证据，静默覆盖会丢过程数据。本设计用"乐观锁拦截 + 版本树留底 + 用户可选"把 last-write 限定在用户知情且可回滚的前提下。真正的字符级实时协作合并交给 Yjs（§9.3），不在自动保存路径里做。

---

## 3. 版本树

### 3.1 模型语义

`project_versions` 是**有向树**（非线性历史）：

- `parent_version_id` 指向父版本，形成树；普通保存是单链（每版 parent = 上一版），"另存为分支"/冲突 fork 产生分叉。
- `version_no` 在**单个 project 内单调递增**（`projects.current_version_no` 维护游标），全局唯一靠 `(project_id, version_no)`。
- 每个版本携带 `code_snapshot`（源码全量）、`metadata_json`（语言/CT 标签/hasBlockOrigin/导出信息）、关联 `project_blocks`（积木工程 XML）。

### 3.2 保存即增版本 vs 命名快照

| 类型 | 触发 | `is_named` | `label` | 保留策略 |
|---|---|---|---|---|
| **自动版本** | autosave 推云成功 | `false` | NULL | 滚动保留：每作品最近 50 个自动版本，超出按**时间衰减**清理（保留每天首末），但**永不删命名快照与分叉点** |
| **命名快照** | 用户点「保存里程碑」 | `true` | 用户输入（如"完成正方形"） | 永久保留 |
| **导入版本** | upload 入库 | `false` | "导入：{原文件名}" | 永久（作为来源凭证） |

```python
# app/works/version_service.py
from sqlalchemy import select, func
from app.works.models import Project, ProjectVersion, ProjectBlock

class VersionService:
    def __init__(self, db, audit, asset_svc):
        self.db, self.audit, self.asset = db, audit, asset_svc

    def create_version(self, project_id: str, *, author_id: str,
                       code: str, language: str, metadata: dict,
                       blockly_xml: str | None, generated_code: str | None,
                       parent_version_id: str | None, is_named: bool = False,
                       label: str | None = None, ip: str = "-") -> ProjectVersion:
        proj = self.db.get(Project, project_id)
        if proj is None or proj.deleted_at is not None:
            raise NotFound("project")

        next_no = proj.current_version_no + 1
        v = ProjectVersion(
            id=new_uuid(), project_id=project_id, version_no=next_no,
            parent_version_id=parent_version_id or proj.head_version_id,
            code_snapshot=code, language=language, metadata_json=metadata,
            is_named=is_named, label=label, created_by=author_id,
        )
        self.db.add(v); self.db.flush()

        # 关联积木工程（仅 python 双模），列名锚定上游 §6
        if blockly_xml is not None:
            self.db.add(ProjectBlock(
                id=new_uuid(), project_version_id=v.id,
                blockly_xml=blockly_xml, generated_code=generated_code or code,
            ))

        # 推进作品游标（HEAD）
        proj.current_version_no = next_no
        proj.head_version_id = v.id
        proj.updated_at = func.now()

        self.db.commit()
        self.audit.log(author_id, "version.create", v.id, ip,
                       {"version_no": next_no, "named": is_named})
        self._gc_auto_versions(project_id)   # 自动版本滚动清理
        return v
```

### 3.3 回滚

回滚**不删历史**——而是把某历史版本的内容**复制为一个新版本**置于 HEAD（git revert 风格），保证全程可追溯。

```python
    def rollback(self, project_id: str, target_version_id: str, actor_id: str, ip: str):
        proj = self.db.get(Project, project_id)
        tgt = self.db.get(ProjectVersion, target_version_id)
        if tgt is None or tgt.project_id != project_id:
            raise NotFound("version")
        blk = self.db.scalar(select(ProjectBlock)
                             .where(ProjectBlock.project_version_id == tgt.id))
        # 以目标内容生成新版本，parent = 当前 HEAD（保留"我们曾回滚过"的事实）
        return self.create_version(
            project_id, author_id=actor_id, code=tgt.code_snapshot,
            language=tgt.language, metadata={**tgt.metadata_json, "rolledBackFrom": tgt.version_no},
            blockly_xml=blk.blockly_xml if blk else None,
            generated_code=blk.generated_code if blk else None,
            parent_version_id=proj.head_version_id, is_named=True,
            label=f"回滚到 v{tgt.version_no}", ip=ip,
        )
```

### 3.4 diff

服务端提供两版差异；前端用 Monaco `DiffEditor` 渲染。源码为文本行级 diff；积木工程比对**生成码**（blockly_xml 直接 diff 噪声大，对学生无意义）。

```python
# GET /api/projects/{id}/versions/diff?base=..&target=..
import difflib

def text_diff(base: str, target: str) -> list[dict]:
    sm = difflib.SequenceMatcher(a=base.splitlines(), b=target.splitlines())
    out = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        out.append({"op": tag, "base": [i1, i2], "target": [j1, j2]})
    return out   # 前端按 op(equal/replace/insert/delete) 着色
```

---

## 4. 下载作品包

### 4.1 端点

```
GET /api/projects/{id}/download?version={version_no?}
Authorization: Bearer <jwt>            # 须本人或授课教师（RBAC）
→ 200  application/zip  (流式)
       Content-Disposition: attachment; filename="<safe_name>.zip"
       X-Work-Manifest-Sha256: <sha256>    # 包完整性校验头
```

- 不带 `version` → 下载 HEAD 版本；带则下载指定历史版本。
- **服务端打包**，产物与编辑器 `exportWorkZip()` 同构（§0.3），保证另一账号导入原样打开。

### 4.2 命名规范与大小限制

| 规则 | 值 |
|---|---|
| 文件名 | `{slug(project.title)}-v{version_no}-{yyyymmdd}.zip`，`slug` 去除非 `[\w\-一-龥]`，截断 64 字符 |
| 单包上限 | 20 MB（源码+blockly_xml 通常 < 1MB；assets 受限，见 §6） |
| assets 内联阈值 | 单资源 ≤ 2MB 内联进 zip；超过则 zip 内放 `assets/manifest.json` 记录 `object_key`，包瘦身 |
| 缓存 | 同一 `(project_id, version_no)` 的导出包缓存到对象存储 `exports/{project_id}/v{n}.zip`，TTL 24h，命中直接 302 预签名 URL |

### 4.3 服务端打包实现（流式 + 与前端同构）

```python
# app/works/export_service.py
import io, json, zipfile, hashlib, re
from datetime import datetime, timezone

EXT = {"python": "py", "cpp": "cpp", "c": "c"}

class ExportService:
    def __init__(self, db, asset_svc, audit, obj):
        self.db, self.asset, self.audit, self.obj = db, asset_svc, audit, obj

    def _safe_name(self, title: str, ver: int) -> str:
        s = re.sub(r"[^\w\-一-龥]", "_", title or "work")[:64]
        return f"{s}-v{ver}-{datetime.now():%Y%m%d}.zip"

    def build_zip(self, project_id: str, version_no: int | None) -> tuple[bytes, str, str]:
        v = self._resolve_version(project_id, version_no)   # 含 ProjectBlock 关联
        ext = EXT[v.language]
        buf = io.BytesIO()
        # 固定 ZIP 条目顺序与压缩级别 → 与前端 fflate 产物结构同构
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(f"source/main.{ext}", v.code_snapshot)
            if v.language == "python" and v.block and v.block.blockly_xml:
                zf.writestr("blocks/workspace.xml", v.block.blockly_xml)
            # assets：小内联，大走 manifest（见 §6）
            inlined, manifest = self.asset.collect_for_version(v, inline_limit=2 * 1024 * 1024)
            for path, data in inlined.items():
                zf.writestr(f"assets/{path}", data)
            if manifest:
                zf.writestr("assets/manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
            # metadata.json —— schema 与编辑器 exportWorkZip() 严格一致（§5.2）
            zf.writestr("metadata.json", json.dumps({
                "version": 1,
                "language": v.language,
                "hasBlockOrigin": bool(v.block and v.block.blockly_xml),
                "ctTags": v.metadata_json.get("ctTags", []),
                "sourceProjectId": project_id,
                "versionNo": v.version_no,
                "exportedAt": datetime.now(timezone.utc).isoformat(),
            }, ensure_ascii=False, indent=2))
        data = buf.getvalue()
        sha = hashlib.sha256(data).hexdigest()
        return data, self._safe_name(self._title(project_id), v.version_no), sha
```

```python
# app/works/router_download.py
from fastapi import APIRouter, Depends, Response
from fastapi.responses import StreamingResponse
import io

router = APIRouter()

@router.get("/api/projects/{project_id}/download")
def download(project_id: str, version: int | None = None,
             student=Depends(require_active_consent),     # 合规门禁
             svc: ExportService = Depends(get_export_service),
             ctx=Depends(get_ctx)):
    ensure_can_read_project(student, project_id)          # RBAC：本人/授课教师
    data, fname, sha = svc.build_zip(project_id, version)
    svc.audit.log(student.id, "work.download", project_id, ctx.ip,
                  {"version": version, "bytes": len(data), "sha256": sha})
    headers = {
        "Content-Disposition": f'attachment; filename="{fname}"',
        "X-Work-Manifest-Sha256": sha,
        "Content-Length": str(len(data)),
    }
    return StreamingResponse(io.BytesIO(data), media_type="application/zip", headers=headers)
```

> 包 < 20MB，直接内存流式即可；若未来 assets 变大，改为对象存储侧拼包 + 302 预签名直下（应用层零带宽）。

---

## 5. 上传导入

### 5.1 端点与流水线

```
POST /api/projects/upload          (multipart/form-data)
  file=<work.zip>                  # 必填
  mode=new|version                 # new=建新作品；version=作为某作品新版本
  target_project_id=<id?>          # mode=version 时必填
  client_dedup_key=<sha256?>       # 幂等：客户端预算包 sha256
→ 201 { project_id, version_no, hasBlockOrigin }
```

流水线（任一步失败即拒绝并审计，**默认拒绝**）：

```
接收 multipart
  → ① 大小/MIME 门：≤20MB、Content-Type=application/zip、magic bytes "PK\x03\x04"
  → ② 解包安全门：zip bomb 防护（条目数≤64、解压总量≤50MB、压缩比≤100:1）、
       路径穿越防护（拒 "../"、绝对路径、符号链接条目）
  → ③ 结构白名单门：仅允许 source/ blocks/ assets/ metadata.json；
       扩展白名单 {.py,.cpp,.c,.xml,.json,.png,.jpg,.wav,.mp3}；拒 .exe/.sh/.js/.html 等
  → ④ metadata.json schema 校验（§5.2）+ 源码扩展与 language 一致性
  → ⑤ 内容安全扫描：源码经合规敏感词/PII 过滤（复用合规 §4）；
       图片二次解码校验（Pillow 重编码，剥离 EXIF/脚本块）；XML 防 XXE（禁 DTD/外部实体）
  → ⑥ 幂等去重：按 (uploader, sha256(file)) 查近期上传；命中则返回既有 project_id（不重复入库）
  → ⑦ 入库：mode=new 建 projects + 首版；mode=version 追加 project_versions(+project_blocks)
  → ⑧ 原始包留对象存储 uploads/{project_id}/{sha}.zip（审计/可回溯），写 audit_logs
```

### 5.2 metadata.json 共享 schema（前后端等价校验）

```python
# app/works/manifest_schema.py
from pydantic import BaseModel, field_validator

ALLOWED_LANG = {"python", "cpp", "c"}

class WorkManifest(BaseModel):
    version: int
    language: str
    hasBlockOrigin: bool = False
    ctTags: list[str] = []
    sourceProjectId: str | None = None
    versionNo: int | None = None
    exportedAt: str | None = None

    @field_validator("version")
    @classmethod
    def _v(cls, x):
        if x != 1: raise ValueError("unsupported manifest version")
        return x

    @field_validator("language")
    @classmethod
    def _lang(cls, x):
        if x not in ALLOWED_LANG: raise ValueError("bad language")
        return x
```

> 前端 `importWorkZip()`（编辑器 §8.3）在加载前先用等价的 TS 校验器跑一遍同一 schema；后端再校验一次。**两侧任一拒绝即拒绝**，防止恶意包绕过前端直打后端。

### 5.3 解包安全 + 入库实现

```python
# app/works/import_service.py
import zipfile, io, hashlib, json
from PIL import Image
from app.works.manifest_schema import WorkManifest

MAX_FILE = 20 * 1024 * 1024
MAX_UNCOMPRESSED = 50 * 1024 * 1024
MAX_ENTRIES = 64
ALLOWED_EXT = {".py", ".cpp", ".c", ".xml", ".json", ".png", ".jpg", ".jpeg", ".wav", ".mp3"}
ALLOWED_TOP = {"source", "blocks", "assets", "metadata.json"}

class ImportError422(Exception):
    def __init__(self, code, msg): self.code, self.msg = code, msg

class ImportService:
    def __init__(self, db, version_svc, asset_svc, sensitive_filter, audit, obj):
        self.db, self.vsvc, self.asset = db, version_svc, asset_svc
        self.filter, self.audit, self.obj = sensitive_filter, audit, obj

    def ingest(self, raw: bytes, *, uploader_id: str, mode: str,
               target_project_id: str | None, ip: str) -> dict:
        # ① 大小 + magic bytes
        if len(raw) > MAX_FILE: raise ImportError422("FILE_TOO_LARGE", "包超过 20MB")
        if raw[:4] != b"PK\x03\x04": raise ImportError422("NOT_ZIP", "非法 zip")
        sha = hashlib.sha256(raw).hexdigest()

        # ⑥ 幂等去重（先查，命中直接返回）
        dup = self._find_recent_upload(uploader_id, sha)
        if dup: return {"project_id": dup.project_id, "version_no": dup.version_no, "deduped": True}

        # ② 解包安全门
        try:
            zf = zipfile.ZipFile(io.BytesIO(raw))
        except zipfile.BadZipFile:
            raise ImportError422("BAD_ZIP", "无法解压")
        infos = zf.infolist()
        if len(infos) > MAX_ENTRIES: raise ImportError422("TOO_MANY_ENTRIES", "条目过多")
        total = sum(i.file_size for i in infos)
        if total > MAX_UNCOMPRESSED: raise ImportError422("BOMB", "解压体积异常")
        for i in infos:
            name = i.filename
            if name.startswith("/") or ".." in name.split("/"):
                raise ImportError422("PATH_TRAVERSAL", "非法路径")
            top = name.split("/")[0]
            if top not in ALLOWED_TOP: raise ImportError422("UNEXPECTED_ENTRY", f"非法条目 {name}")
            ext = ("." + name.rsplit(".", 1)[-1]).lower() if "." in name else ""
            if not name.endswith("/") and ext and ext not in ALLOWED_EXT:
                raise ImportError422("BAD_EXT", f"禁止扩展 {ext}")

        # ④ metadata 校验
        meta = WorkManifest(**json.loads(zf.read("metadata.json")))
        ext = {"python": "py", "cpp": "cpp", "c": "c"}[meta.language]
        code = zf.read(f"source/main.{ext}").decode("utf-8")
        blockly_xml = (zf.read("blocks/workspace.xml").decode("utf-8")
                       if meta.hasBlockOrigin and f"blocks/workspace.xml" in zf.namelist() else None)

        # ⑤ 内容安全：源码敏感词/PII（复用合规护栏）
        hit = self.filter.scan(code)
        if hit.blocked:
            self.audit.log(uploader_id, "work.upload_rejected", "-", ip,
                           {"reason": "sensitive_content", "sha256": sha})
            raise ImportError422("UNSAFE_CONTENT", "内容含违规信息")
        # 图片二次解码（剥离恶意载荷）
        safe_assets = self._sanitize_assets(zf)

        # ⑦ 入库
        if mode == "new":
            proj = self._create_project(uploader_id, title=f"导入作品 {meta.language}", ip=ip)
            project_id, parent = proj.id, None
        else:
            project_id = target_project_id
            self._ensure_owner(uploader_id, project_id)
            parent = self.db.get(Project, project_id).head_version_id

        v = self.vsvc.create_version(
            project_id, author_id=uploader_id, code=code, language=meta.language,
            metadata={"ctTags": meta.ctTags, "importedFrom": meta.sourceProjectId, "uploadSha256": sha},
            blockly_xml=blockly_xml, generated_code=code,
            parent_version_id=parent, is_named=True, label="导入版本", ip=ip,
        )
        self.asset.attach_to_version(v, safe_assets)

        # ⑧ 原始包留存（审计/可回溯）
        self.obj.put(f"uploads/{project_id}/{sha}.zip", raw, content_type="application/zip")
        self._record_upload(uploader_id, project_id, v.version_no, sha)
        self.audit.log(uploader_id, "work.upload", project_id, ip,
                       {"mode": mode, "version_no": v.version_no, "sha256": sha})
        return {"project_id": project_id, "version_no": v.version_no, "hasBlockOrigin": blockly_xml is not None}
```

### 5.4 幂等与去重

- **幂等键**：`(uploader_id, sha256(file))`。短窗（如 10 分钟）内同键重传 → 返回首次结果，不重复建版本。可由客户端在 header 传 `Idempotency-Key` 加固。
- **跨账号去重**：包内容相同但上传者不同 → **不**去重（不同人导入同一作品是合法的协作/教学行为），但 `audit_logs` 会记录同一 `sha256` 被多账号导入，供研究方追溯传播。

---

## 6. 资源管理

### 6.1 `project_assets` 与对象存储 key 规约

资源（绘图快照 PNG、上传图片/音频）**元数据入 PG、二进制入对象存储**。

| object_key 规约 | 示例 |
|---|---|
| `assets/{project_id}/{asset_id}.{ext}` | `assets/9f.../a13b....png` |
| 导出包缓存 | `exports/{project_id}/v{n}.zip` |
| 上传原包留存 | `uploads/{project_id}/{sha256}.zip` |
| 同意凭证（合规域，复用合规规范） | `consent/{student_id}/{sha256}`（仅合规服务可读） |

> key 用 `project_id` 前缀分桶，便于按作品批量清理/迁移；用随机 `asset_id`/`sha256` 做叶子名，避免可枚举与覆盖。

### 6.2 预签名上传 / 下载

资源走**预签名直传/直下**，blob 不经应用层，省带宽、防 OOM。

```python
# app/works/asset_service.py
class AssetService:
    def __init__(self, db, obj, audit):  # obj: S3 兼容客户端
        self.db, self.obj, self.audit = db, obj, audit

    def presign_upload(self, project_id: str, ext: str, content_type: str,
                       max_bytes: int = 5 * 1024 * 1024) -> dict:
        asset_id = new_uuid()
        key = f"assets/{project_id}/{asset_id}.{ext}"
        # 预签名 PUT：限制 content-type 与最大体积（policy 条件），TTL 5min
        url = self.obj.presigned_put(key, content_type=content_type,
                                     max_bytes=max_bytes, expires=300)
        # 先登记 PENDING，前端直传成功后回调 confirm 转 ACTIVE（防孤儿见 §6.3）
        self.db.add(ProjectAsset(id=asset_id, project_id=project_id, object_key=key,
                                 content_type=content_type, state="PENDING"))
        self.db.commit()
        return {"asset_id": asset_id, "upload_url": url, "object_key": key}

    def confirm_upload(self, asset_id: str, sha256: str, size: int):
        a = self.db.get(ProjectAsset, asset_id)
        head = self.obj.head(a.object_key)            # 核验确实已落对象存储
        if head is None or head.size != size:
            raise NotFound("asset blob")
        a.state, a.sha256, a.size_bytes = "ACTIVE", sha256, size
        self.db.commit()

    def presign_download(self, asset_id: str) -> str:
        a = self.db.get(ProjectAsset, asset_id)
        return self.obj.presigned_get(a.object_key, expires=300)
```

### 6.3 孤儿资源清理

孤儿来源：预签名签发但前端未完成上传（`PENDING` 超时）、版本被 GC 后无引用的 `ACTIVE` 资源、作品软删后过保留期。

```python
# app/works/asset_gc.py  （定时任务：每日）
class AssetGC:
    def run(self):
        # ① PENDING 超 1h 未 confirm → 删记录 + 删可能的半成品 blob
        for a in self.db.scalars(select(ProjectAsset).where(
                ProjectAsset.state == "PENDING",
                ProjectAsset.created_at < now() - timedelta(hours=1))):
            self.obj.delete_if_exists(a.object_key)
            self.db.delete(a)
        # ② ACTIVE 但无任何 version 引用，且作品未软删 → 标记 DANGLING，灰度 7 天后删
        for a in self._find_unreferenced_active():
            a.state = "DANGLING"; a.dangling_since = now()
        for a in self._find_dangling_expired(grace_days=7):
            self.obj.delete(a.object_key); self.db.delete(a)
        # ③ 作品软删 deleted_at 超保留期 → 连带删 exports/ uploads/ assets/ 全部 key
        self.db.commit()
```

---

## 7. 数据模型（SQL DDL）

> 沿用上游 §6/§7.1 表名与既有列；本文**补充存储相关字段**（external `object_key`、软删除、索引、乐观锁游标）。`project_blocks` 不改列，仅给出关联约束。

```sql
-- ============ projects：作品（细化存储/版本游标/软删除）============
CREATE TABLE projects (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id           UUID NOT NULL REFERENCES users(id),     -- 学生
    title              VARCHAR(120) NOT NULL DEFAULT '未命名作品',
    language           VARCHAR(16)  NOT NULL DEFAULT 'python'  -- python|cpp|c
                       CHECK (language IN ('python','cpp','c')),
    current_version_no INTEGER NOT NULL DEFAULT 0,             -- 乐观锁游标 / 版本号生成器
    head_version_id    UUID,                                   -- 指向 HEAD 版本（延迟外键）
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ                             -- 软删除
);
CREATE INDEX idx_projects_owner       ON projects(owner_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_projects_updated     ON projects(updated_at DESC) WHERE deleted_at IS NULL;

-- ============ project_versions：版本树 ============
CREATE TABLE project_versions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version_no        INTEGER NOT NULL,                        -- 作品内单调递增
    parent_version_id UUID REFERENCES project_versions(id),    -- 树结构（分叉/回滚）
    code_snapshot     TEXT NOT NULL,                           -- 源码全量（小文本入 PG）
    language          VARCHAR(16) NOT NULL,
    metadata_json     JSONB NOT NULL DEFAULT '{}',             -- {language,ctTags,hasBlockOrigin,rolledBackFrom,...}
    is_named          BOOLEAN NOT NULL DEFAULT false,          -- 命名快照=true（永久保留）
    label             VARCHAR(120),                            -- 命名/导入/回滚标签
    created_by        UUID NOT NULL REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, version_no)
);
CREATE INDEX idx_versions_project   ON project_versions(project_id, version_no DESC);
CREATE INDEX idx_versions_parent    ON project_versions(parent_version_id);
CREATE INDEX idx_versions_named     ON project_versions(project_id) WHERE is_named = true;

-- HEAD 延迟外键（建表后补约束，避免循环依赖）
ALTER TABLE projects
  ADD CONSTRAINT fk_projects_head FOREIGN KEY (head_version_id)
  REFERENCES project_versions(id) DEFERRABLE INITIALLY DEFERRED;

-- ============ project_blocks：积木工程（上游 §6 锚定，不改列，仅关联）============
-- project_blocks(id, project_version_id, blockly_xml, generated_code)
ALTER TABLE project_blocks
  ADD CONSTRAINT fk_blocks_version FOREIGN KEY (project_version_id)
  REFERENCES project_versions(id) ON DELETE CASCADE;
CREATE INDEX idx_blocks_version ON project_blocks(project_version_id);

-- ============ project_assets：资源（新增 object_key/生命周期/去重）============
CREATE TABLE project_assets (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version_id    UUID REFERENCES project_versions(id) ON DELETE SET NULL,  -- 资源可跨版本复用
    kind          VARCHAR(16) NOT NULL DEFAULT 'image'      -- image|audio|snapshot
                  CHECK (kind IN ('image','audio','snapshot')),
    object_key    VARCHAR(256) NOT NULL,                    -- 对象存储引用（不存 blob 于 PG）
    content_type  VARCHAR(64),
    size_bytes    BIGINT,
    sha256        CHAR(64),                                 -- 去重/完整性
    state         VARCHAR(16) NOT NULL DEFAULT 'PENDING'    -- PENDING|ACTIVE|DANGLING
                  CHECK (state IN ('PENDING','ACTIVE','DANGLING')),
    dangling_since TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_assets_key      ON project_assets(object_key);
CREATE INDEX idx_assets_project        ON project_assets(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_assets_dedupe         ON project_assets(project_id, sha256);
CREATE INDEX idx_assets_gc             ON project_assets(state, created_at);

-- ============ work_uploads：上传留痕/幂等（审计与去重）============
CREATE TABLE work_uploads (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploader_id   UUID NOT NULL REFERENCES users(id),
    project_id    UUID NOT NULL REFERENCES projects(id),
    version_no    INTEGER NOT NULL,
    file_sha256   CHAR(64) NOT NULL,
    object_key    VARCHAR(256) NOT NULL,                    -- uploads/{project_id}/{sha}.zip
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_uploads_dedupe ON work_uploads(uploader_id, file_sha256, created_at DESC);
```

---

## 8. API 契约

> 统一约定：JSON body；鉴权 `Authorization: Bearer <jwt>`；核心写操作前置 `require_active_consent`（合规门禁，无有效同意 `403 NO_ACTIVE_CONSENT`）。错误体 `{ "error": { "code": "...", "message": "..." } }`。

### 8.1 作品列表 / 新建

```
GET  /api/student/projects?cursor=&limit=20
→ 200 { items: [{ id, title, language, version_no, updated_at }], next_cursor }

POST /api/student/projects        { title?, language }
→ 201 { id, version_no: 0 }
错误：403 NO_ACTIVE_CONSENT
```

### 8.2 保存 / 更新（乐观锁）

```
PUT  /api/projects/{id}
body { language, code, blocks?:{blockly_xml,generated_code}|null,
       base_version, client_mutation_id, fork?:bool }
→ 200 { version_no }                        # 新版本号
→ 409 { error:{code:"VERSION_CONFLICT"}, remote_version_no, remote_snapshot }
→ 403 NO_ACTIVE_CONSENT | 404 PROJECT_NOT_FOUND
幂等：同 client_mutation_id 重放返回首次 version_no（不重复升版）
```

### 8.3 版本树

```
POST /api/projects/{id}/versions      { label, code?, blocks? }   # 命名快照（不传则快照当前 HEAD）
→ 201 { version_no, is_named:true }

GET  /api/projects/{id}/versions?limit=50
→ 200 { items:[{ version_no, parent_version_no, is_named, label, created_by, created_at }] }

POST /api/projects/{id}/versions/{version_no}/rollback
→ 201 { version_no }                        # 新建"回滚到 vN"版本置 HEAD

GET  /api/projects/{id}/versions/diff?base=&target=
→ 200 { code_diff:[{op,base,target}], blockOriginChanged:bool }
```

### 8.4 下载 / 上传

```
GET  /api/projects/{id}/download?version=
→ 200 application/zip（流式）  headers: Content-Disposition, X-Work-Manifest-Sha256
→ 403 NO_ACTIVE_CONSENT | 403 FORBIDDEN(非本人/非授课教师) | 404

POST /api/projects/upload   (multipart) file, mode=new|version, target_project_id?, Idempotency-Key?
→ 201 { project_id, version_no, hasBlockOrigin, deduped? }
→ 422 { error:{code} } 其中 code ∈ {
        FILE_TOO_LARGE, NOT_ZIP, BAD_ZIP, TOO_MANY_ENTRIES, BOMB,
        PATH_TRAVERSAL, UNEXPECTED_ENTRY, BAD_EXT, BAD_MANIFEST,
        UNSAFE_CONTENT }
→ 403 NO_ACTIVE_CONSENT
```

### 8.5 资源预签名

```
POST /api/projects/{id}/assets/presign   { ext, content_type }
→ 200 { asset_id, upload_url, object_key }     # 前端 PUT 直传对象存储

POST /api/assets/{asset_id}/confirm      { sha256, size }
→ 200 { state:"ACTIVE" }

GET  /api/assets/{asset_id}/url
→ 200 { download_url }                          # 预签名 GET，TTL 5min
```

---

## 9. 离线与一致性

### 9.1 IndexedDB schema

```ts
// offline/idb.ts （封装 idb 库）
import { openDB, DBSchema } from 'idb'

interface JieduiDB extends DBSchema {
  snapshots: {                          // 每作品最新本地镜像（断网编辑兜底）
    key: string                         // projectId
    value: { projectId: string; language: string; code: string;
             blockly_xml: string | null; base_version: number;
             client_revision: number; updatedAt: number }
  }
  syncQueue: {                          // 待重放操作（FIFO，单调 seq）
    key: number                         // auto-increment seq
    value: { seq?: number; projectId: string; type: 'put' | 'upload';
             payload: any; enqueuedAt: number; tries: number;
             clientMutationId: string }
    indexes: { 'by-project': string }
  }
  versionCache: {                       // 最近版本只读缓存（离线查看历史）
    key: [string, number]               // [projectId, versionNo]
    value: { projectId: string; versionNo: number; code: string; metadata: any }
  }
}

export const dbp = openDB<JieduiDB>('jiedui-works', 1, {
  upgrade(db) {
    db.createObjectStore('snapshots', { keyPath: 'projectId' })
    const q = db.createObjectStore('syncQueue', { keyPath: 'seq', autoIncrement: true })
    q.createIndex('by-project', 'projectId')
    db.createObjectStore('versionCache', { keyPath: ['projectId', 'versionNo'] })
  },
})
```

### 9.2 同步队列重放

```ts
// offline/syncQueue.ts
import { dbp } from './idb'
import { putProject } from '@/api/projects'

export const syncQueue = {
  async enqueue(op: { projectId: string; type: 'put'|'upload'; payload: any }) {
    const db = await dbp
    await db.add('syncQueue', { ...op, enqueuedAt: Date.now(), tries: 0,
                                clientMutationId: op.payload.client_mutation_id })
  },
  async size() { return (await dbp).count('syncQueue') },

  // 联网重放：FIFO，指数退避，幂等键防重
  async replay() {
    const db = await dbp
    let cursor = await db.transaction('syncQueue').store.openCursor()
    const items: any[] = []
    while (cursor) { items.push({ key: cursor.primaryKey, ...cursor.value }); cursor = await cursor.continue() }
    items.sort((a, b) => (a.key as number) - (b.key as number))

    for (const it of items) {
      try {
        if (it.type === 'put') {
          const res = await putProject(it.projectId, it.payload)   // 幂等：client_mutation_id
          // 推进本地 base_version，避免后续重放自相冲突
          const snap = await db.get('snapshots', it.projectId)
          if (snap) { snap.base_version = res.version_no; await db.put('snapshots', snap) }
        }
        await db.delete('syncQueue', it.key)                       // 成功出队
      } catch (e: any) {
        if (e.status === 409) {                                    // 冲突：停在此项，交 UI 解决
          usePersistenceStore().saveState = 'conflict'; break
        }
        if (e.status === 403) break                                // 同意失效：暂停重放
        it.tries++                                                 // 网络/5xx：退避重试
        await db.put('syncQueue', it)
        if (it.tries < 5) break                                    // 退避后下次心跳再试
      }
    }
    usePersistenceStore().pendingOps = await this.size()
  },
}

// 触发器：online 事件 + 30s 心跳
window.addEventListener('online', () => syncQueue.replay())
setInterval(() => { if (navigator.onLine) syncQueue.replay() }, 30_000)
```

### 9.3 并发编辑边界（与 Yjs）

| 场景 | 归本设计处理 | 归 Yjs（引用，不在本文实现） |
|---|---|---|
| 单用户多端**异步**编辑（教室/家里先后） | 乐观锁 + 冲突合并面板（§2.4） | — |
| 多用户**同一时刻**字符级协同（结对实时） | — | Yjs CRDT 文档；协作会话结束时由协作模块**落一个版本**到 `project_versions` |

边界约定：自动保存路径**只处理离线/异步冲突**；实时协作由独立 Yjs 通道承担，协作产物以"一次提交一个版本"的形式回流到本文的版本树，二者通过 `project_versions` 解耦、互不阻塞。

### 9.4 幂等键一致性

| 操作 | 幂等键 | 服务端去重依据 |
|---|---|---|
| `PUT /projects/{id}` | `client_mutation_id`（UUID） | 近期已处理的 mutation 表/缓存，命中返回首次 version_no |
| `POST /upload` | `Idempotency-Key` 或 `(uploader, file_sha256)` | `work_uploads` 查近期记录 |
| 队列重放 | 复用上述键 | 重放与首次提交共用键，天然防重 |

---

## 10. 合规对接（与数据安全规范一致）

| 合规要求 | 本文落点 |
|---|---|
| `require_active_consent` 门禁 | 挂在 `PUT /projects/{id}`、`/download`、`/upload`、`/versions/*` 等所有核心写/导出路由；无有效同意 `403`，仅允许本地编辑（IndexedDB）不推云 |
| 未成年人数据最小化 | 作品库不存 PII；`metadata.json` 不含真实姓名；上传源码经 PII/敏感词过滤（§5.3 step ⑤） |
| 防恶意文件 | §5.1 八步流水线：大小/MIME/zip-bomb/路径穿越/扩展白名单/内容扫描/图片重编码/XXE 防护 |
| 审计留痕（append-only） | `download/upload/upload_rejected/version.create/rollback` 全部经 `AuditService.log` 写 `audit_logs`（actor/action/resource/ip/payload_hash） |
| 数据销毁联动 | 同意撤回（`WITHDRAWN`）→ 合规 `LifecycleService` 调用作品软删 + 触发 `AssetGC` 清 `exports/uploads/assets/` 全部 object_key |
| 分库隔离 | 作品数据落 `learning` 库（`svc_learning` role）；上传原包/导出包对象存储桶与合规域（`consent/`）隔离 |

---

## 11. 验收标准与测试点（逐条可勾验）

### 11.1 默认云 + 本地兜底
- [ ] **AC-1 默认云自动保存**：编辑后停手 800ms，`PUT /projects/{id}` 被调用，`saveState→synced`，`project_versions` 多一条自动版本。
- [ ] **AC-2 本地永不丢**：拔网编辑 → IndexedDB.snapshots 实时更新；刷新页面后内容仍在（从本地镜像恢复）。
- [ ] **AC-3 无同意仅本地**：撤回同意后编辑，`PUT` 返回 403，内容仍落 IndexedDB，不推云，UI 不报错。

### 11.2 离线同步
- [ ] **AC-4 断网可编辑→联网自动同步**（上游验收）：断网编辑多次入 `syncQueue`；恢复网络后 `online` 事件触发 `replay()`，队列清空，云端版本与本地一致。
- [ ] **AC-5 重放幂等**：重放过程中再次断网/刷新，重连后不产生重复版本（`client_mutation_id` 去重）。

### 11.3 版本树
- [ ] **AC-6 保存即增版本**：连续 3 次保存 → `version_no` 递增 1→2→3，`parent_version_id` 链式相连。
- [ ] **AC-7 命名快照永久**：自动版本超 50 个触发 GC，命名快照与分叉点仍在。
- [ ] **AC-8 回滚可追溯**：回滚到 v2 → 新建"回滚到 v2"版本置 HEAD，v3/v4 历史仍可查。
- [ ] **AC-9 diff**：`/versions/diff?base=2&target=3` 返回行级 op，前端 DiffEditor 正确着色。

### 11.4 下载 / 上传（核心验收）
- [ ] **AC-10 包往返跨账号**（上游验收）：A 账号 `GET /download` 得 `.zip`（含 `blocks/workspace.xml`）；B 账号 `POST /upload` 导入后，积木工程**原样打开**、可继续编辑与运行，`hasBlockOrigin=true`。
- [ ] **AC-11 服务端/前端包同构**：服务端 `build_zip` 与前端 `exportWorkZip` 产物结构一致（条目、metadata schema），互相可解。
- [ ] **AC-12 命名/大小限制**：下载文件名符合 `slug-vN-yyyymmdd.zip`；上传 > 20MB 被拒 `FILE_TOO_LARGE`。

### 11.5 防恶意上传
- [ ] **AC-13 恶意被拒**：上传含 `../etc/passwd` 的 zip → `PATH_TRAVERSAL`；含 `.exe` → `BAD_EXT`；zip bomb → `BOMB`；含敏感词源码 → `UNSAFE_CONTENT`；全部写 `upload_rejected` 审计。
- [ ] **AC-14 图片净化**：上传带异常载荷的 PNG → 经 Pillow 重编码剥离，入库为干净图。

### 11.6 冲突与一致性
- [ ] **AC-15 乐观锁冲突**：两端用同 `base_version` 提交不同内容，第二个收 `409 VERSION_CONFLICT` + remote 快照，冲突面板可"保留我的/采用云端/另存分支"，且被覆盖版本仍在版本树。
- [ ] **AC-16 幂等去重上传**：10 分钟内同账号重传同包 → 返回首次 `project_id`，不重复建作品（`deduped:true`）。

### 11.7 资源
- [ ] **AC-17 预签名直传**：`presign`→前端 PUT 对象存储→`confirm` 转 ACTIVE；blob 不经应用层。
- [ ] **AC-18 孤儿清理**：PENDING 超 1h、DANGLING 超 7d 被 `AssetGC` 清除；作品软删后连带清 object_key。

---

## 12. 关键取舍小结

1. **永远先落本地、再推云**：本地写是真相源的"暂存"，云是"权威";这样断网零丢失，又满足"默认云"。
2. **小文本入 PG、大 blob 入对象存储**：源码/blockly_xml 入 PG 支撑版本 diff 与查询；资源/导出/上传包入对象存储走预签名，省带宽防膨胀。
3. **乐观锁拦截 + 版本树留底 + 用户可选**，而非纯 last-write-wins：未成年人作品是研究证据，绝不静默覆盖；真正的实时字符级合并交给 Yjs，与自动保存解耦。
4. **服务端打包与前端 fflate 同构**：保证"另一账号上传原样打开（含积木工程）"这一上游硬验收。
5. **上传默认拒绝 + 八步安全流水线**：与未成年人合规护栏一致，任一层可独立拦截，全程审计。
6. **回滚不删历史（revert 风格）**：把历史内容复制为新 HEAD 版本，保留"曾回滚"的事实，满足可追溯。
