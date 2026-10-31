/** All original page drafts/preferences are isolated in this tab's memory. */
export function memoryStorage(seed: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(seed))
  return {
    get length() { return values.size },
    getItem(key: string) { return values.get(key) ?? null },
    setItem(key: string, value: string) { values.set(String(key), String(value)) },
    removeItem(key: string) { values.delete(key) },
    clear() { values.clear() },
    key(index: number) { return [...values.keys()][index] ?? null },
  }
}
export const showcaseLocalStorage = memoryStorage({ 'cx-live-room': 'demo-room-1', 'cx-obs-study': '1', 'cx-studio-room': 'demo-room-1' })
export const showcaseSessionStorage = memoryStorage()
