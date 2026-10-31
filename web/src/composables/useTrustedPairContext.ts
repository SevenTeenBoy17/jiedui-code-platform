import { computed, onUnmounted, ref, watch } from 'vue'
import { PairApiError, pairErrorText, pairSessionsApi, type PairCapabilities, type PairChatReply, type PairReceipt, type PairSession, type PairSessionSummary } from '@/api/pairSessions'

interface ContextOptions {
  actor: () => string
  token: () => string
  sessionId: () => string
  onContextChange: () => void
}
interface ContextError { status: number; code: string; message: string }
const requestId = () => crypto.randomUUID()

export function useTrustedPairContext(options: ContextOptions) {
  const capabilities = ref<PairCapabilities | null>(null)
  const mode = computed(() => capabilities.value?.mode || 'unknown')
  const session = ref<PairSession | null>(null)
  const available = ref<PairSessionSummary[]>([])
  const loading = ref(true)
  const busy = ref(false)
  const error = ref<ContextError | null>(null)
  const epoch = ref(0)
  const uncertain = ref<{ sessionId: string; requestId: string; roundId: string } | null>(null)
  const checkingStatus = ref(false)
  const blocked = ref(false)
  const round = computed(() => {
    const open = session.value?.rounds?.filter(r => r.ended_at == null) || []
    return open.length === 1 ? open[0] : null
  })
  const canSend = computed(() => mode.value === 'trusted_required' && capabilities.value?.trusted_chat_enabled === true
    && !loading.value && !busy.value && !blocked.value && !uncertain.value && !!session.value?.ai_policy
    && session.value?.actions?.can_chat === true && !!round.value)
  const canOpenRound = computed(() => mode.value === 'trusted_required' && !loading.value && !busy.value
    && !uncertain.value && !!session.value?.ai_policy && session.value?.actions?.can_open_round === true)
  const reason = computed(() => session.value?.actions?.reason_code
    ? pairErrorText({ code: session.value.actions.reason_code }) : '')
  let disposed = false, capabilityEpoch = 0, listEpoch = 0, sessionEpoch = 0

  function invalidate() {
    epoch.value++
    busy.value = false
    uncertain.value = null
    checkingStatus.value = false
    error.value = null
    blocked.value = false
    options.onContextChange()
  }
  function showError(value: unknown, code?: string) {
    const e = value instanceof PairApiError ? value : new PairApiError(503, 'UNAVAILABLE')
    error.value = { status: e.status, code: code || e.code, message: pairErrorText({ status: e.status, code: code || e.code }) }
  }
  function current(generation: number) { return !disposed && generation === epoch.value }

  async function loadSelection() {
    const generation = ++sessionEpoch, listGeneration = ++listEpoch
    invalidate()
    session.value = null
    available.value = []
    loading.value = true
    const actor = options.actor(), sid = options.sessionId(), token = options.token()
    const valid = () => !disposed && actor === options.actor() && token === options.token() && sid === options.sessionId()
      && generation === sessionEpoch && listGeneration === listEpoch && mode.value === 'trusted_required'
    try {
      if (sid) {
        const value = await pairSessionsApi.getSession(sid)
        if (!valid()) return
        if (value?.session_id !== sid || !Array.isArray(value.rounds) || !value.actions) throw new PairApiError(503, 'INVALID_RESPONSE')
        session.value = value
      } else {
        const value = await pairSessionsApi.getAvailableSessions()
        if (!valid()) return
        if (!Array.isArray(value?.sessions)) throw new PairApiError(503, 'INVALID_RESPONSE')
        available.value = value.sessions
      }
    } catch (e) { if (valid()) showError(e) }
    finally { if (valid()) loading.value = false }
  }

  async function reload() {
    const generation = ++capabilityEpoch
    sessionEpoch++; listEpoch++
    invalidate()
    capabilities.value = null
    session.value = null
    available.value = []
    loading.value = true
    const actor = options.actor(), token = options.token()
    const valid = () => !disposed && generation === capabilityEpoch && actor === options.actor() && token === options.token()
    if (!actor || !token) { showError(new PairApiError(401, 'UNAUTHENTICATED')); loading.value = false; return }
    try {
      const value = await pairSessionsApi.getCapabilities()
      if (!valid()) return
      capabilities.value = value
      if (value.mode === 'trusted_required') await loadSelection()
      else loading.value = false
    } catch (e) {
      if (valid()) { showError(e, e instanceof PairApiError && e.status === 401 ? e.code : 'CONFIG_UNAVAILABLE'); loading.value = false }
    }
  }

  async function openRound() {
    if (!canOpenRound.value || !session.value) return
    const sid = session.value.session_id, generation = epoch.value
    busy.value = true; error.value = null
    try {
      await pairSessionsApi.openRound(sid, requestId())
      if (current(generation)) await loadSelection()
    } catch (e) { if (current(generation)) showError(e) }
    finally { if (current(generation)) busy.value = false }
  }

  function receiptMatches(receipt: PairReceipt, sid: string, rid: string, id: string) {
    return receipt.session_id === sid && receipt.round_id === rid && receipt.request_id === id
  }

  async function checkRequestStatus() {
    if (!uncertain.value || checkingStatus.value) return
    const context = uncertain.value, generation = epoch.value
    checkingStatus.value = true
    try {
      const receipt = await pairSessionsApi.getRequestStatus(context.sessionId, context.requestId)
      if (!current(generation)) return
      if (!receiptMatches(receipt, context.sessionId, context.roundId, context.requestId)) throw new PairApiError(503, 'INVALID_RESPONSE')
      if (receipt.status === 'pending') showError(new PairApiError(409, 'REQUEST_PENDING'))
      else if (['released','failed','invalidated'].includes(receipt.status)) {
        uncertain.value = null
        if (receipt.status === 'invalidated') blocked.value = true
        // Only a known terminal reason gets specific UI copy; never expose arbitrary receipt/provider text.
        const outputRejected = receipt.status === 'failed' && receipt.reason_code === 'OUTPUT_CONSTRAINT_FAILED'
        showError(new PairApiError(outputRejected ? 422 : 409,
          outputRejected ? 'OUTPUT_CONSTRAINT_FAILED' : receipt.status === 'released' ? 'REQUEST_RELEASED' : 'REQUEST_FAILED'))
      } else throw new PairApiError(503, 'INVALID_RESPONSE')
    } catch (e) {
      if (!current(generation)) return
      if (e instanceof PairApiError && e.status === 404) {
        uncertain.value = null
        showError(e, 'REQUEST_NOT_FOUND')
      } else showError(e)
    } finally { if (current(generation)) checkingStatus.value = false }
  }

  async function send(message: string, persona: 'guide' | 'review'): Promise<PairChatReply | null> {
    if (!canSend.value || !session.value || !round.value) return null
    const sid = session.value.session_id, rid = round.value.round_id, generation = epoch.value, id = requestId()
    const question = message.trim()
    if (!question || question.length > 4000) { showError(new PairApiError(422, 'INVALID_MESSAGE')); return null }
    busy.value = true; error.value = null
    try {
      const result = await pairSessionsApi.chat(sid, rid, { request_id: id, message: question, persona })
      if (!current(generation)) return null
      if (!result || typeof result !== 'object') throw new PairApiError(503, 'INVALID_RESPONSE')
      if (result.source === 'guard' && result.receipt === null && typeof result.reply === 'string') return result
      if (!['model','fallback'].includes(result.source) || typeof result.reply !== 'string' || !result.receipt
        || result.receipt.status !== 'released' || !receiptMatches(result.receipt, sid, rid, id)) throw new PairApiError(503, 'INVALID_RESPONSE')
      return result
    } catch (e) {
      if (!current(generation)) return null
      showError(e)
      const pendingConflict = e instanceof PairApiError && e.status === 409 && e.receipt?.status === 'pending'
      // Uncertainty blocks a pending request; only a refusal should latch the context block.
      if (e instanceof PairApiError && [401,403,404,409,410,423].includes(e.status) && !pendingConflict) blocked.value = true
      if (e instanceof PairApiError && (e.status === 0 || e.status >= 500 || pendingConflict)) {
        uncertain.value = { sessionId: sid, roundId: rid, requestId: id }
        await checkRequestStatus()
      }
      return null
    } finally { if (current(generation)) busy.value = false }
  }

  watch(() => round.value?.round_id, (value, previous) => { if (previous && value !== previous) invalidate() }, { flush: 'sync' })
  watch(() => [options.actor(), options.token()], () => { void reload() }, { immediate: true, flush: 'sync' })
  watch(options.sessionId, () => {
    invalidate()
    if (mode.value === 'trusted_required') void loadSelection()
  }, { flush: 'sync' })
  onUnmounted(() => { disposed = true; capabilityEpoch++; sessionEpoch++; listEpoch++; invalidate() })
  return { mode, capabilities, session, available, round, loading, busy, error, epoch, uncertain, checkingStatus,
    canSend, canOpenRound, reason, reload, openRound, send, checkRequestStatus }
}
