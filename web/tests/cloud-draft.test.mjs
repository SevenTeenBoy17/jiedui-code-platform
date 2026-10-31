import test from 'node:test';
import assert from 'node:assert/strict';
import { canLeaveCloudDraft, cloudDraftFingerprint } from '../src/api/cloudDraft.ts';
test('pending save cannot be abandoned or confirmed away', () => {
  assert.equal(canLeaveCloudDraft(true, true, () => { throw new Error('no confirm'); }), false);
});
test('clean draft leaves without prompt; dirty draft honors decision', () => {
  assert.equal(canLeaveCloudDraft(false, false, () => { throw new Error('no confirm'); }), true);
  assert.equal(canLeaveCloudDraft(false, true, () => false), false);
  assert.equal(canLeaveCloudDraft(false, true, () => true), true);
});
test('saved snapshot differs from text or blocks edited while saving', () => {
  const base = { id: 1, language: 'python', code: 'print(1)', blockState: null };
  assert.notEqual(cloudDraftFingerprint(base), cloudDraftFingerprint({ ...base, code: 'print(2)' }));
  assert.notEqual(cloudDraftFingerprint(base), cloudDraftFingerprint({ ...base, blockState: '{}' }));
});
