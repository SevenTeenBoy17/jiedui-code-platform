/** Build-only transformation: the authored local app is never modified. */
export function isolateStorage(source, id) {
  if (!/\/src\//.test(id.replaceAll('\\', '/')) || /\/showcase\//.test(id.replaceAll('\\', '/')) || id.includes('?')) return null;
  if (!/\.(vue|ts)$/.test(id) || !/\b(?:localStorage|sessionStorage)\b/.test(source)) return null;
  let changed = source.replace(/\b(?:window\.)?localStorage\b/g, 'showcaseLocalStorage').replace(/\b(?:window\.)?sessionStorage\b/g, 'showcaseSessionStorage');
  const imports = "\nimport { showcaseLocalStorage, showcaseSessionStorage } from '@/showcase/storage'\n";
  if (id.endsWith('.vue')) {
    if (!/<script\s+setup[^>]*>/.test(changed)) throw new Error(`Cannot safely isolate storage in ${id}`);
    changed = changed.replace(/<script\s+setup[^>]*>/, m => m + imports);
  } else changed = imports + changed;
  return changed;
}
