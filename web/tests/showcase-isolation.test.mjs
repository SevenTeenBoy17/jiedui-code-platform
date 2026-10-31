import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { isolateStorage } from '../../cloud/showcase/isolate-storage.mjs';
import { clarifyDemo } from '../../cloud/showcase/clarify-demo.mjs';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const cache = new Map();
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const source = readFileSync(new URL(`../src/showcase/${name}.ts`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; cache.set(name, exports);
  runInNewContext(output, { exports, require: n => load(n.replace('./', '')), URL, Response, Request, TextEncoder, console, Date }, { timeout: 3000 });
  return exports;
}
test('API calls, including writes and unknown routes, never reach a real server', async () => {
  let count = 0;
  const fetch = load('transport').createShowcaseFetch(async () => { count++; return new Response('asset') }, 'https://demo.invalid');
  assert.equal((await fetch('/api/projects')).status, 200);
  assert.equal((await fetch('/api/projects', { method: 'POST', body: JSON.stringify({title:'演示',language:'python'}) })).status, 200);
  assert.equal((await fetch('/api/not-supported')).status, 501);
  assert.equal((await fetch('https://other.invalid/api/projects')).status, 403);
  assert.equal((await fetch('/.netlify/functions/api')).status, 403);
  assert.equal((await fetch('/static-write', { method: 'POST' })).status, 403);
  assert.equal(count, 0);
  const run = await (await fetch('/api/run', { method:'POST', body:'{}' })).json();
  assert.equal(run.mock, true); assert.match(run.stdout, /未在云端执行/);
});
test('static asset requests omit cookies and non-api mutations are denied', async () => {
  let options;
  const fetch = load('transport').createShowcaseFetch(async (_url, init) => { options = init; return new Response('asset') }, 'https://demo.invalid');
  await fetch('/pyodide/pyodide.js', { credentials: 'include' });
  assert.equal(options.credentials, 'omit');
});
test('all authored storage reads are rewritten to isolated memory without modifying original files', () => {
  const original = "<script setup lang=\"ts\">const x = localStorage.getItem('jiedui_local_draft');window.sessionStorage.setItem('x','y')</script>";
  const result = isolateStorage(original, 'D:/repo/web/src/Test.vue');
  assert.match(result, /import \{ showcaseLocalStorage, showcaseSessionStorage \}/);
  assert.match(result, /showcaseLocalStorage.getItem/);
  assert.match(result, /showcaseSessionStorage.setItem/);
  assert.doesNotMatch(result, /window\.showcase/);
  assert.equal(isolateStorage(original, 'D:/repo/web/src/showcase/Test.vue'), null);
  const storage = load('storage').memoryStorage();
  storage.setItem('x', 'y'); assert.equal(storage.getItem('x'), 'y'); storage.clear(); assert.equal(storage.length, 0);
});
test('catalog includes every original concrete student and teacher view', () => {
  const catalog = load('catalog').showcasePages;
  assert.equal(catalog.filter(p=>p.path.startsWith('/student')).length,9);
  assert.equal(catalog.filter(p=>p.path.startsWith('/teacher')).length,15);
  assert.equal(new Set(catalog.map(p=>p.path)).size,24);
  const router = readFileSync(new URL('../src/router/index.ts', import.meta.url),'utf8');
  assert.equal((router.match(/component: \(\) => import\('@\/views\/(student|teacher)/g)||[]).length,catalog.length);
});
test('downloads are real ZIP containers and research CSV is not JSON in disguise', async () => {
  const fetch = load('transport').createShowcaseFetch(async()=>{throw Error('network')},'https://demo.invalid',()=>true);
  const zip = await fetch('/api/projects/1/download');
  assert.equal(zip.headers.get('content-type'),'application/zip');
  const bytes = new Uint8Array(await zip.arrayBuffer());
  assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
  assert.equal(new DataView(bytes.buffer).getUint32(bytes.length-22,true),0x06054b50);
  const csv = await fetch('/api/research/export?format=csv');
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(await csv.text(), /^mode,record,content\r\n.*DEMO_ONLY/s);
});

test('showcase copy does not claim real records, cloud persistence, or usable research results', () => {
  const ide = '云端 v2 / 保存到云端';
  assert.equal(clarifyDemo(ide, '/src/views/student/IdeView.vue'), '演示内存 v2 / 保存到演示内存');
  assert.equal(clarifyDemo(ide, '/src/views/Other.vue'), null);
  const reportPath = new URL('../src/views/teacher/research/ReportView.vue', import.meta.url);
  const report = clarifyDemo(readFileSync(reportPath, 'utf8'), reportPath.pathname);
  assert.doesNotMatch(report, /数据取自平台真实记录/);
  assert.match(report, /全部为合成示例/);
  const exportPath = new URL('../src/views/teacher/research/ExportView.vue', import.meta.url);
  assert.match(clarifyDemo(readFileSync(exportPath, 'utf8'), exportPath.pathname), /不可用于真实课题分析/);
});
