import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const publishDirectory = resolve(root, `.runtime/full-product-f1-20261014/builds/${Date.now()}/site`);
export function validatePublishPaths(paths) {
  for (const path of paths) {
    if (/(^|\/)(\.|backup|secrets)|private|credentials|\.db(?:-|$)|\.(?:ts|vue|py|md|txt|map)$/i.test(path))
      throw new Error(`Unsafe publish file: ${path}`);
  }
}
async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Publish symlinks are forbidden');
    if (entry.isDirectory()) result.push(...await filesUnder(full));
    else result.push(full);
  }
  return result;
}
export async function buildCandidate() {
  // Independent output: never replace local web/dist or use pilot/public as UI.
  process.env.VITE_DEPLOYMENT_TARGET = 'netlify';
  const { build } = await import('../../web/node_modules/vite/dist/node/index.js');
  await build({ root: resolve(root, 'web'), configFile: resolve(root, 'web/vite.config.ts'),
    build: { outDir: publishDirectory, emptyOutDir: false, sourcemap: false } });
  const files = await filesUnder(publishDirectory);
  const paths = files.map(file => relative(publishDirectory, file).replaceAll('\\', '/'));
  validatePublishPaths(paths);
  for (const file of ['pyodide.js', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) {
    if ((await stat(resolve(publishDirectory, 'pyodide', file))).size < 100) throw new Error(`Missing Python runtime: ${file}`);
  }
  const digest = createHash('sha256');
  for (const path of paths.filter(p => p !== 'release.json').sort()) {
    digest.update(path).update(await readFile(resolve(publishDirectory, path)));
  }
  const manifest = { slice: 'F1', source: 'original web/src Vue product', status: 'candidate-not-full-product',
    builtAt: new Date().toISOString(), contentSha256: digest.digest('hex'), files: paths.length,
    available: ['invited-session', 'own-project-list', 'own-project-create', 'version-save'],
    pending: ['classes-tasks', 'trusted-ai', 'task-evidence', 'teacher-review', 'assessment-profile', 'secure-c-cpp-runtime'] };
  await writeFile(resolve(publishDirectory, 'release.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ ...manifest, publishDirectory }, null, 2));
  await writeFile(resolve(root, '.runtime/full-product-f1-20261014/latest-build.json'), JSON.stringify({ ...manifest, publishDirectory }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await buildCandidate();
