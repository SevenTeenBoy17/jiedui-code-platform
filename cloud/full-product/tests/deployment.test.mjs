import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePublishPaths } from '../build.mjs';

test('publish guard rejects credentials, database, source and backup artefacts', () => {
  for (const path of ['accounts.private.json', '.env', 'jiedui.db', 'backup/foo.ts', 'secrets.txt']) {
    assert.throws(() => validatePublishPaths(['index.html', path]), /publish/i);
  }
});
test('publish guard allows product assets and runtime files', () => {
  assert.doesNotThrow(() => validatePublishPaths(['index.html', 'assets/app.js', 'assets/app.css', 'generated/horse.webp', 'pyodide/pyodide.asm.wasm', 'pyodide/python_stdlib.zip', 'pyodide/pyodide-lock.json', 'release.json']));
});
test('SPA rewrites only known route prefixes, leaving missing assets as 404', async () => {
  const config = await readFile(new URL('../netlify.toml', import.meta.url), 'utf8');
  assert.match(config, /from = "\/student\/\*"/);
  assert.match(config, /from = "\/teacher\/\*"/);
  assert.doesNotMatch(config, /from = "\/\*"/);
  assert.match(config, /wasm-unsafe-eval/);
  assert.match(config, /worker-src 'self' blob:/);
});
