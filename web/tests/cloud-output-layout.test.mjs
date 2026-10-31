import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('cloud result body has a bounded grid without changing the local drawer layout', async () => {
  const source = await readFile(new URL('../src/views/student/IdeView.vue', import.meta.url), 'utf8');
  assert.match(source, /:class="\{ 'cloud-output-drawer': isCloudDeployment \}"/);
  assert.match(source, /<div class="output-content">\s*<div class="output-tabs"/);
  assert.match(source, /\.output-content\s*\{\s*display: contents;/);
  assert.match(source, /\.cloud-output-drawer\[open\] \.output-content\s*\{[^}]*position: absolute;[^}]*inset: 38px 0 0;[^}]*grid-template-rows: 38px minmax\(0, 1fr\);/);
});
