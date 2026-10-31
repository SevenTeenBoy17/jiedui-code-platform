/**
 * 作品云端存储 API（§4.3）。默认云端；下载/上传作品包；本地 localStorage 自动缓存（离线韧性）。
 */
import { useAuthStore } from '@/stores/auth'
import { isCloudDeployment } from '@/config/deployment'
import { cloudProjectsApi, cloudProjectUnavailable } from '@/api/cloudProjects'

export interface Project {
  id: number
  title: string
  language: 'python' | 'cpp' | 'c'
  latest_version: number
  latest?: { code: string; block_state?: string | null; version_no: number } | null
}

function authHeaders(json = true): Record<string, string> {
  const t = useAuthStore().token
  const h: Record<string, string> = { Authorization: `Bearer ${t}` }
  if (json) h['Content-Type'] = 'application/json'
  return h
}

export const projectsApi = {
  async list(): Promise<Project[]> {
    if (isCloudDeployment) return cloudProjectsApi.list()
    const r = await fetch('/api/projects', { headers: authHeaders(false) })
    return r.ok ? r.json() : []
  },
  async create(title: string, language: string): Promise<Project> {
    if (isCloudDeployment) return cloudProjectsApi.create(title, language)
    const r = await fetch('/api/projects', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ title, language }) })
    if (!r.ok) throw new Error('创建失败')
    return r.json()
  },
  async get(id: number): Promise<Project> {
    if (isCloudDeployment) return cloudProjectsApi.get(id)
    const r = await fetch(`/api/projects/${id}`, { headers: authHeaders(false) })
    if (!r.ok) throw new Error('作品不存在')
    return r.json()
  },
  /** changed=false 表示内容与最新版一致、服务端未落新行（幂等去重）。
      自动保存靠它决定要不要打扰学生 —— 没变化就一声不吭。 */
  async saveVersion(id: number, code: string, blockState?: string | null): Promise<{ versionNo: number; changed: boolean }> {
    if (isCloudDeployment) return cloudProjectsApi.saveVersion(id, code, blockState)
    const r = await fetch(`/api/projects/${id}/versions`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ code, blockState }) })
    if (!r.ok) throw new Error('保存失败')
    const d = await r.json()
    return { versionNo: d.versionNo, changed: !!d.changed }
  },
  async remove(id: number): Promise<void> {
    if (isCloudDeployment) return cloudProjectUnavailable()
    await fetch(`/api/projects/${id}`, { method: 'DELETE', headers: authHeaders(false) })
  },
  /** 触发浏览器下载作品包 .zip */
  async download(id: number, title: string): Promise<void> {
    if (isCloudDeployment) return cloudProjectUnavailable()
    const r = await fetch(`/api/projects/${id}/download`, { headers: authHeaders(false) })
    if (!r.ok) throw new Error('下载失败')
    const blob = await r.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title || 'work'}.zip`
    a.click()
    URL.revokeObjectURL(url)
  },
  /** 保存设计产物（流程图/伪代码，§4.7 建模证据） */
  async saveDesign(id: number, type: 'flow' | 'pseudocode', payload: string): Promise<void> {
    if (isCloudDeployment) return cloudProjectUnavailable()
    await fetch(`/api/projects/${id}/design`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ type, payload }) })
  },
  async getDesign(id: number): Promise<{ type: string; payload: string }[]> {
    if (isCloudDeployment) return cloudProjectUnavailable()
    const r = await fetch(`/api/projects/${id}/design`, { headers: authHeaders(false) })
    return r.ok ? r.json() : []
  },
  /** 上传作品包导入 */
  async upload(file: File): Promise<Project> {
    if (isCloudDeployment) return cloudProjectUnavailable()
    const fd = new FormData()
    fd.append('file', file)
    const r = await fetch('/api/projects/upload', { method: 'POST', headers: { Authorization: `Bearer ${useAuthStore().token}` }, body: fd })
    if (!r.ok) throw new Error('导入失败')
    return r.json()
  },
}

// —— 本地自动缓存（离线韧性，§4.3 本地先行）——
const LK = 'jiedui_local_draft'
function draftKey(): string | null {
  if (!isCloudDeployment) return LK
  const owner = useAuthStore().user?.id
  return owner ? `jiedui_cloud_draft:${encodeURIComponent(owner)}` : null
}
export function saveLocalDraft(d: { projectId: number | null; language: string; code: string }) {
  const key = draftKey()
  if (!key) return
  try { localStorage.setItem(key, JSON.stringify({ ...d, ts: Date.now() })) } catch {}
}
export function loadLocalDraft(): { projectId: number | null; language: string; code: string } | null {
  const key = draftKey()
  if (!key) return null
  try {
    const draft = JSON.parse(localStorage.getItem(key) || 'null')
    if (isCloudDeployment && draft && (typeof draft.code !== 'string'
      || !['python', 'cpp', 'c'].includes(draft.language)
      || (draft.projectId !== null && (!Number.isSafeInteger(draft.projectId) || draft.projectId <= 0)))) return null
    return draft
  } catch { return null }
}
