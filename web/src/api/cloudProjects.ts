import { useAuthStore } from '@/stores/auth'
import { cloudRequest, CloudApiError } from '@/api/cloud'
import type { Project } from './projects'

type SaveResult = { versionNo: number; changed: boolean }
type SavePayload = { code: string; blockState: string | null; expectedVersion: number; requestId: string }
type PendingSave = { payload: SavePayload; flight?: Promise<SaveResult>; conflict?: boolean }
type PendingCreate = { payload: { title: string; language: string; requestId: string }; flight?: Promise<Project> }
const conflictRecovery = '云端版本已变化。请先复制保存当前编辑稿，再刷新页面读取最新版本，对照合并后再保存。'

// These are editor baselines, not an authorization cache. Every server request
// still checks its HttpOnly session. A new login epoch invalidates local state.
let ownerSession = ''
const baselines = new Map<number, number>()
const pendingSaves = new Map<number, PendingSave>()
const pendingCreates = new Map<string, PendingCreate>()
let readSequence = 0
const latestReads = new Map<number, number>()

function identity() {
  const auth = useAuthStore()
  return auth.user?.id ? `${auth.user.id}:${auth.sessionRevision}` : ''
}
function scope() {
  const next = identity()
  if (next !== ownerSession) {
    ownerSession = next
    baselines.clear(); pendingSaves.clear(); pendingCreates.clear(); latestReads.clear()
  }
  if (!next) throw new CloudApiError(401, 'SESSION_EXPIRED', '请先登录，再打开或保存作品。')
  return next
}
function assertSameSession(expected: string) {
  if (identity() !== expected) {
    // A stale response must not erase a newer session's already loaded state.
    if (ownerSession === expected) {
      ownerSession = ''; baselines.clear(); pendingSaves.clear(); pendingCreates.clear(); latestReads.clear()
    }
    throw new CloudApiError(409, 'SESSION_CHANGED', '登录状态已变化，本次结果不应用到当前页面。请重新打开作品。')
  }
}
function invalidResponse(): never {
  throw new CloudApiError(503, 'INVALID_RESPONSE', '作品服务返回不完整，请保留编辑稿并重新核对。')
}
function readProject(value: unknown, requireLatest = false): Project {
  const p = value as Project | null
  if (!p || !Number.isSafeInteger(p.id) || p.id <= 0 || typeof p.title !== 'string'
    || !['python', 'cpp', 'c'].includes(p.language)
    || !Number.isSafeInteger(p.latest_version) || p.latest_version < 0) return invalidResponse()
  if (p.latest != null && (typeof p.latest.code !== 'string'
    || p.latest.version_no !== p.latest_version
    || (p.latest.block_state != null && typeof p.latest.block_state !== 'string'))) return invalidResponse()
  if (requireLatest && p.latest_version > 0 && !p.latest) return invalidResponse()
  return p
}
function isAmbiguous(error: unknown) {
  return !(error instanceof CloudApiError) || error.status === 0 || error.status >= 500
}
function onRequestFailure(error: unknown, captured: string) {
  // A response for a former login must never sign out the current account.
  assertSameSession(captured)
  if (error instanceof CloudApiError && error.status === 401) {
    useAuthStore().clearSession('登录已过期，请保留未保存内容后重新登录')
    ownerSession = ''; baselines.clear(); pendingSaves.clear(); pendingCreates.clear(); latestReads.clear()
  }
}

export function cloudProjectUnavailable(): never {
  throw new CloudApiError(501, 'NOT_AVAILABLE', '此功能尚未接入云端候选版，未执行任何修改。请使用本地完整版本。')
}

export const cloudProjectsApi = {
  async list(): Promise<Project[]> {
    const captured = scope()
    try {
      const data = await cloudRequest<unknown>('/api/projects')
      assertSameSession(captured)
      if (!Array.isArray(data)) return invalidResponse()
      // A background list refresh must not rebase an unsaved open editor.
      return data.map(item => readProject(item))
    } catch (error) {
      onRequestFailure(error, captured)
      throw error
    }
  },
  async get(id: number): Promise<Project> {
    const captured = scope()
    if (pendingSaves.get(id)?.flight) {
      throw new CloudApiError(409, 'SAVE_IN_PROGRESS', '作品正在保存，请等待结果后再重新打开。')
    }
    const read = ++readSequence
    latestReads.set(id, read)
    try {
      const data = await cloudRequest<unknown>(`/api/projects/${id}`)
      assertSameSession(captured)
      if (latestReads.get(id) !== read) {
        throw new CloudApiError(409, 'STALE_PROJECT_REQUEST', '作品读取已被后续操作替代，请保留当前编辑内容。')
      }
      const project = readProject(data, true)
      if (project.id !== id) return invalidResponse()
      baselines.set(id, project.latest_version)
      pendingSaves.delete(id)
      return project
    } catch (error) {
      onRequestFailure(error, captured)
      throw error
    }
  },
  async create(title: string, language: string): Promise<Project> {
    const captured = scope()
    const key = JSON.stringify([title, language])
    let pending = pendingCreates.get(key)
    if (pending?.flight) return pending.flight
    if (!pending) {
      pending = { payload: { title, language, requestId: crypto.randomUUID() } }
      pendingCreates.set(key, pending)
    }
    const operation = pending
    const flight = (async () => {
      try {
        const data = await cloudRequest<unknown>('/api/projects', {
          method: 'POST', body: JSON.stringify(operation.payload),
        })
        assertSameSession(captured)
        const project = readProject(data, true)
        baselines.set(project.id, project.latest_version)
        pendingCreates.delete(key)
        return project
      } catch (error) {
        onRequestFailure(error, captured)
        if (!isAmbiguous(error)) pendingCreates.delete(key)
        throw error
      } finally {
        operation.flight = undefined
      }
    })()
    operation.flight = flight
    return flight
  },
  async saveVersion(id: number, code: string, blockState?: string | null): Promise<SaveResult> {
    const captured = scope()
    let pending = pendingSaves.get(id)
    if (pending?.conflict) {
      throw new CloudApiError(409, 'VERSION_CONFLICT', conflictRecovery)
    }
    if (pending && (pending.payload.code !== code || pending.payload.blockState !== (blockState ?? null))) {
      throw new CloudApiError(409, pending.flight ? 'SAVE_IN_PROGRESS' : 'SAVE_UNCONFIRMED',
        pending.flight ? '上一份编辑稿仍在保存，请稍后再试。'
          : '上次保存结果尚未确认。请先复制保存新编辑稿，再刷新页面核对云端版本，对照合并后再保存。')
    }
    if (pending?.flight) return pending.flight
    if (!pending) {
      const expectedVersion = baselines.get(id)
      if (expectedVersion === undefined) {
        throw new CloudApiError(409, 'RELOAD_REQUIRED', '尚未确认作品的云端版本。请先复制保存当前编辑稿，再刷新页面读取作品，对照合并后再保存。')
      }
      pending = { payload: { code, blockState: blockState ?? null, expectedVersion, requestId: crypto.randomUUID() } }
      pendingSaves.set(id, pending)
    }
    const operation = pending
    // A read begun before this mutation cannot later rebase the open editor or
    // erase the retry identity of this save, even if the UI ignores that read.
    latestReads.delete(id)
    const flight = (async () => {
      try {
        const data = await cloudRequest<SaveResult>(`/api/projects/${id}/versions`, {
          method: 'POST', body: JSON.stringify(operation.payload),
        })
        assertSameSession(captured)
        if (!data || typeof data.changed !== 'boolean' || !Number.isSafeInteger(data.versionNo)
          || data.versionNo !== operation.payload.expectedVersion + (data.changed ? 1 : 0)) return invalidResponse()
        baselines.set(id, data.versionNo)
        pendingSaves.delete(id)
        return { versionNo: data.versionNo, changed: data.changed }
      } catch (error) {
        onRequestFailure(error, captured)
        if (error instanceof CloudApiError && error.status === 409) {
          operation.conflict = true
          error.message = conflictRecovery
        }
        else if (!isAmbiguous(error)) pendingSaves.delete(id)
        throw error
      } finally {
        operation.flight = undefined
      }
    })()
    operation.flight = flight
    return flight
  },
}
