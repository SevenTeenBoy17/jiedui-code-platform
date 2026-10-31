import { readdir, readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { isolateStorage } from './isolate-storage.mjs';
import { clarifyDemo } from './clarify-demo.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const runtime = resolve(root, '.runtime/showcase-20261014');
const publishDirectory = resolve(runtime, `builds/${Date.now()}/site`);
process.env.VITE_DEPLOYMENT_TARGET = 'showcase';
const { build } = await import('../../web/node_modules/vite/dist/node/index.js');
const { default: vue } = await import('../../web/node_modules/@vitejs/plugin-vue/dist/index.mjs');
await build({
  root: resolve(root, 'web'), configFile: false, publicDir: resolve(root, 'web/public'),
  plugins: [{ name: 'showcase-copy', enforce: 'pre', transform: clarifyDemo }, { name: 'showcase-storage', enforce: 'pre', transform: isolateStorage }, vue(), { name: 'showcase-entry', transformIndexHtml: { order: 'pre', handler(html) {
    if (!html.includes('/src/main.ts')) throw new Error('Original entry changed; review showcase build');
    return html.replace('/src/main.ts', '/src/showcase/main.ts').replace(/\s*<link rel="manifest"[^>]*>/, '');
  } } }],
  resolve: { alias: [
    { find: '@/stores/auth', replacement: resolve(root, 'web/src/showcase/auth.ts') },
    { find: '@/editor/turtle/usePyodide', replacement: resolve(root, 'web/src/showcase/python.ts') },
    { find: '@', replacement: resolve(root, 'web/src') },
  ] },
  build: { outDir: publishDirectory, emptyOutDir: false, copyPublicDir: false, sourcemap: false, target: 'es2022', chunkSizeWarningLimit: 650,
    rollupOptions: { output: { manualChunks(id) { if (/[\\/]node_modules[\\/](vue|vue-router|pinia|@vue)[\\/]/.test(id)) return 'vendor' } } } },
});
for (const name of ['generated', 'icon.svg']) await cp(resolve(root, 'web/public', name), resolve(publishDirectory, name), { recursive: true });
await writeFile(resolve(publishDirectory, 'showcase-api-disabled.json'), JSON.stringify({ mode: 'showcase', liveBackend: false, detail: '此站点仅供界面演示，不提供真实课堂 API。' }));
const files = [];
async function walk(dir) { for (const e of await readdir(dir, { withFileTypes: true })) { const f = resolve(dir, e.name); if (e.isSymbolicLink()) throw new Error('Symlink forbidden'); if (e.isDirectory()) await walk(f); else files.push(f); } }
await walk(publishDirectory);
const paths = files.map(f => relative(publishDirectory, f).replaceAll('\\', '/')).sort();
for (const p of paths) if (/(^|\/)(\.|backup|secrets)|credentials|\.db(?:-|$)|\.(ts|vue|py|md|map)$/i.test(p)) throw new Error(`Unsafe file: ${p}`);
const hash = createHash('sha256');
for (const p of paths) hash.update(p).update(await readFile(resolve(publishDirectory, p)));
const manifest = { mode: 'showcase', source: 'original Vue student and teacher product', studentPages: 9, teacherPages: 15, syntheticOnly: true, liveBackend: false, builtAt: new Date().toISOString(), contentSha256: hash.digest('hex'), files: paths.length };
await writeFile(resolve(publishDirectory, 'release.json'), JSON.stringify(manifest, null, 2));
await mkdir(runtime, { recursive: true });
await writeFile(resolve(runtime, 'latest-build.json'), JSON.stringify({ ...manifest, publishDirectory }, null, 2));
console.log(JSON.stringify({ ...manifest, publishDirectory }, null, 2));
