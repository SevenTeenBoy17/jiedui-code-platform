/** 脱敏研究导出（§4.9 §6.4）：教师/研究员下载去标识化过程数据。 */
import { useAuthStore } from '@/stores/auth'

export const researchApi = {
  async export(format: 'json' | 'csv' = 'json'): Promise<boolean> {
    try {
      const r = await fetch(`/api/research/export?format=${format}`, {
        headers: { Authorization: `Bearer ${useAuthStore().token}` },
      })
      if (!r.ok) return false
      const blob = await r.blob()
      const cd = r.headers.get('Content-Disposition') || ''
      const m = cd.match(/filename=([^;]+)/)
      const name = m ? m[1].trim() : `jiedui_research.${format}`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      return true
    } catch {
      return false
    }
  },
}
