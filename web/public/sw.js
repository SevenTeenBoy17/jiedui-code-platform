/* Service Worker（§4.11）：分类缓存 + 版本化更新。改版只需 bump VERSION。
   - 外壳：预缓存，离线可开。
   - 构建产物 /assets/*（带哈希、不可变）：CacheFirst，版本化。
   - 其余静态(svg/png/字体/css/js)：stale-while-revalidate（先快后新）。
   - /api/*：网络直连不缓存（数据要新）。 */
const VERSION = 'v3'
const SHELL_CACHE = `jiedui-shell-${VERSION}`
const ASSET_CACHE = `jiedui-assets-${VERSION}`
const KEEP = [SHELL_CACHE, ASSET_CACHE]
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

function staleWhileRevalidate(req) {
  return caches.open(ASSET_CACHE).then((cache) =>
    cache.match(req).then((hit) => {
      const fetching = fetch(req).then((res) => {
        if (res && res.status === 200) cache.put(req, res.clone())
        return res
      }).catch(() => hit)
      return hit || fetching
    }),
  )
}

function cacheFirst(req) {
  return caches.open(ASSET_CACHE).then((cache) =>
    cache.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.status === 200) cache.put(req, res.clone())
      return res
    })),
  )
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (url.pathname.startsWith('/api/')) return            // 数据要新：直连
  if (e.request.method !== 'GET') return
  if (url.origin !== self.location.origin) return         // 第三方(CDN)交给浏览器

  if (e.request.mode === 'navigate') {                    // SPA 导航：网络优先回退外壳
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')))
    return
  }
  if (url.pathname.startsWith('/assets/')) {              // 哈希命名、不可变
    e.respondWith(cacheFirst(e.request))
    return
  }
  // Pyodide 运行时（~6MB，版本化目录、内容不变）必须 CacheFirst：
  // 机房一个班 40 台机器，不缓存就是每台各拉一遍；拉不到的那几台海龟绘图会直接消失。
  if (url.pathname.startsWith('/pyodide/')) {
    e.respondWith(cacheFirst(e.request))
    return
  }
  if (/\.(svg|png|jpg|webp|woff2?|css|js|webmanifest)$/.test(url.pathname)) {
    e.respondWith(staleWhileRevalidate(e.request))
    return
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)))
})
