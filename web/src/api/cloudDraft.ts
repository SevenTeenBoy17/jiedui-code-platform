export function cloudDraftFingerprint(draft: { id: number | null; language: string; code: string; blockState: string | null }): string {
  return JSON.stringify(draft)
}
export function canLeaveCloudDraft(pending: boolean, dirty: boolean, confirm: () => boolean): boolean {
  return !pending && (!dirty || confirm())
}
