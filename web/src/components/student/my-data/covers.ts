import type { DataProject } from './model'

export type CoverLanguage = 'python' | 'cpp' | 'c'

export function normalizeCoverLanguage(language: string): CoverLanguage | null {
  switch (language.trim().toLowerCase()) {
    case 'python':
    case 'py':
      return 'python'
    case 'cpp':
    case 'c++':
      return 'cpp'
    case 'c':
      return 'c'
    default:
      return null
  }
}

export function projectCoverFor(project: Pick<DataProject, 'id' | 'language'>): string | null {
  const language = normalizeCoverLanguage(project.language)
  const root = '/generated/project-covers-v1/'
  if (language === 'python') return root + 'python.png'
  if (language === 'cpp') return root + 'cpp.png'
  if (language !== 'c') return null

  // Stable project identity, rather than gallery order, selects the C illustration.
  let hash = 2166136261
  for (const character of String(project.id)) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0
  }
  // Mix all ID bits before selecting, so the variant is not just numeric parity.
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x7feb352d)
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b)
  hash ^= hash >>> 16
  return root + (hash >>> 31 === 0 ? 'c-build.png' : 'c-flow.png')
}
