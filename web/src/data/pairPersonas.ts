import { computed, readonly, ref } from 'vue'

/** IP persona is presentation/local coaching, never an account or human pair seat. */
export type PairPersonaId = 'guide' | 'review'
export type LegacyPairRole = 'turtle' | 'reviewer'
export interface PairGuideAction {
  id: string
  label: string
  detail: string
  steps: readonly string[]
}

export const PAIR_PERSONAS = {
  guide: {
    id: 'guide', name: '树小骥', roleLabel: '导航员',
    image: '/generated/pair-ip-v1/horse-guide.png', backendRole: 'turtle',
    description: '先说目标，再把输入、输出和步骤想清楚。',
    actions: [
      { id: 'goal', label: '梳理任务', detail: '我想解决什么问题？', steps: ['用一句话说出任务目标。', '哪些信息是已知的？最后要得到什么？'] },
      { id: 'io', label: '想清输入和输出', detail: '先把条件摆出来', steps: ['列出需要读入的信息，以及允许的范围。', '写一个输入例子，猜一猜应当输出什么。'] },
      { id: 'steps', label: '整理我的步骤', detail: '先写计划，再动手', steps: ['把计划拆成三到五个小步骤。', '检查每一步是否都接得上，先尝试最小的一步。'] },
    ],
  },
  review: {
    id: 'review', name: '熊猫泡泡', roleLabel: '领航员',
    image: '/generated/pair-ip-v2/panda-wave.png', backendRole: 'reviewer',
    description: '一起检查边界、寻找依据，再解释你的改进。',
    actions: [
      { id: 'edge', label: '检查边界情况', detail: '还有什么情况没想到？', steps: ['选一个正常输入、一个边界输入和一个异常输入。', '先写预期结果，再运行对照。'] },
      { id: 'evidence', label: '回看我的依据', detail: '找到能支持想法的原件', steps: ['找到这份作品的版本、测试结果或自己的解释。', '哪些结果支持你的想法？还有哪些结果不一致？'] },
      { id: 'reflect', label: '准备下一次验证', detail: '改了什么，怎么再试？', steps: ['说清这次改了哪一步，以及修改原因。', '换一组输入再试；没有新结果时，先保留判断。'] },
    ],
  },
} as const

const selectedId = ref<PairPersonaId>('guide')
const requestBusy = ref(false)

export function personaForLegacyRole(role?: LegacyPairRole) {
  return PAIR_PERSONAS[role === 'reviewer' ? 'review' : 'guide']
}

export function usePairPersona() {
  const persona = computed(() => PAIR_PERSONAS[selectedId.value])
  function selectPersona(id: PairPersonaId) {
    if (!requestBusy.value) selectedId.value = id
  }
  return {
    personaId: readonly(selectedId), persona,
    requestBusy: readonly(requestBusy), selectPersona,
    setRequestBusy: (busy: boolean) => { requestBusy.value = busy },
  }
}
