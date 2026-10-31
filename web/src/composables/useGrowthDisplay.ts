import { computed, reactive } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { profileByScope, type GrowthScope } from '@/data/studentGrowth'
import { useAuthStore } from '@/stores/auth'

// TODO(api): Tab-memory drafts only; no correction is submitted to a teacher.
const drafts = reactive<Record<string, { text: string; status: string }>>({})
const selection = reactive<Record<string, string>>({})
let draftOwner = ''

export function useGrowthDisplay() {
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()
  const owner = String(auth.user?.id ?? 'demo')
  if (draftOwner !== owner) {
    Object.keys(drafts).forEach((key) => delete drafts[key])
    Object.keys(selection).forEach((key) => delete selection[key])
    draftOwner = owner
  }
  const scope = computed<GrowthScope>({
    get: () => route.query.scope === 'unit' ? 'unit' : 'task',
    set: (value) => {
      selection[scope.value] = selectedClaim.value.id
      void router.replace({ path: route.path, query: { scope: value, claim: selection[value] } })
    },
  })
  const selectedClaim = computed(() => {
    const claims = profileByScope[scope.value].claims
    const id = typeof route.query.claim === 'string' ? route.query.claim : selection[scope.value]
    const evidence = typeof route.query.evidence === 'string' ? route.query.evidence : undefined
    return claims.find((item) => item.id === id)
      ?? (evidence ? claims.find((item) => [...item.supporting, ...item.conflicting].some((entry) => entry.id === evidence)) : undefined)
      ?? claims.find((item) => item.title === '算法设计') ?? claims[0]
  })
  function selectClaim(id: string) {
    if (!profileByScope[scope.value].claims.some((item) => item.id === id)) return
    selection[scope.value] = id
    void router.replace({ path: route.path, query: { ...route.query, scope: scope.value, claim: id, evidence: undefined } })
  }
  function linkTo(path: string, extra: LocationQueryRaw = {}) {
    const resolved = router.resolve(path)
    return { path: resolved.path, query: { scope: scope.value, claim: selectedClaim.value.id, ...resolved.query, ...extra } }
  }
  function draftFor(key: string) { return drafts[key] ?? (drafts[key] = { text: '', status: '仅保留在当前标签页，刷新后清空' }) }
  const responseKey = computed(() => `${owner}:${scope.value}:${selectedClaim.value.id}`)
  const studentResponse = computed({ get: () => draftFor(responseKey.value).text, set: (text: string) => {
    draftFor(responseKey.value).text = text
    draftFor(responseKey.value).status = '草稿已改动，仅当前标签页保留'
  } })
  const responseState = computed(() => draftFor(responseKey.value).status)
  function recordResponse(kind: 'explanation' | 'correction') {
    const draft = draftFor(responseKey.value)
    draft.status = draft.text.trim()
      ? kind === 'correction' ? '更正草稿已保留，尚未发送教师' : '解释已保留在当前标签页，尚未同步'
      : '请先写下解释或更正依据'
  }
  const redoExplanation = computed({
    get: () => draftFor(`${owner}:${scope.value}:FB-A03-TEACHER-v1`).text,
    set: (text: string) => { draftFor(`${owner}:${scope.value}:FB-A03-TEACHER-v1`).text = text },
  })
  return { scope, selectedClaim, selectClaim, linkTo, studentResponse, responseState, recordResponse, redoExplanation }
}
