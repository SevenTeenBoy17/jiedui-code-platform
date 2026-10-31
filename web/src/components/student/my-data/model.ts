import fixture from './demo-data.json'
import type { MyData } from '@/api/compliance'

export const demoData = fixture
export const assetRoot = '/generated/my-data-v2/'
export const icons = ['folder', 'palette', 'feedback', 'classroom', 'clipboard', 'pair']
export interface DataItem { category: string; title: string; n: number | null; description?: string }
export interface DataGroup { id: string; title: string; icon: string; count: number | null; items: DataItem[] }
export interface DataProject {
  id: string | number; title: string; language: string; version: number; edit_mode?: string
  submission_id?: string | null; submission_state?: string; next_action?: string
  tests?: { passed: number; total: number; record_id?: string; record_version?: number; cases?: Array<{input: string; expected: string; actual: string; result: string}> }
  evidence_ids?: string[]; teacher_feedback?: string
}
export interface ProjectOriginal { id: number; title: string; language: string; latest_version: number; latest?: { code: string; version_no: number; source_id?: string; source_version?: string | number } | null }
export const demoProjects: DataProject[] = fixture.projects

export function makeGroups(summary: MyData | null, demo: boolean): DataGroup[] {
  const seen = new Set<string>()
  const groups: DataGroup[] = fixture.groups.map((g, index) => {
    const items = g.items.map(i => {
      seen.add(i.category)
      const actual = summary?.items.find(x => x.category === i.category)
      return { category: i.category, title: i.title, n: demo ? i.n : actual?.n ?? null,
        description: demo ? `演示类别：${i.title}。这是分类数量，不代表能力水平。` : actual?.what ?? '当前接口没有返回这一类，不能当成没有记录。' }
    })
    return { id: g.id, title: g.title, icon: assetRoot + icons[index] + '.png', items,
      count: items.some(i => i.n === null) ? null : items.reduce((n, i) => n + (i.n as number), 0) }
  })
  if (!demo && summary) {
    const unknown = summary.items.filter(i => !seen.has(i.category))
    if (unknown.length) groups.push({ id: 'unknown', title: '待归类的资料', icon: assetRoot + 'document.png',
      count: unknown.reduce((n, i) => n + i.n, 0), items: unknown.map(i => ({ category: i.category, title: i.what, n: i.n, description: '接口返回的新类别，保留原名称和数量，等待归类。' })) })
  }
  return groups
}
export const languageLabel = (language: string) => ({ python: 'Python', cpp: 'C++', c: 'C' }[language] || language)
export const previewFor = (project: DataProject) => project.id === 'DEMO-P01' ? assetRoot + 'garden.png' : project.id === 'DEMO-P02' ? assetRoot + 'guess.png' : null
