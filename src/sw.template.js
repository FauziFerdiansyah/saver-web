const CACHE = "saver-__VERSION__"
const PRECACHE = __PRECACHE__

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("saver-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return

  // The page itself is network-first, so a new deploy is picked up on the next
  // load and the cached copy is only used offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put("./", copy))
          }
          return response
        })
        .catch(() => caches.match("./", { cacheName: CACHE }).then((cached) => cached || Response.error())),
    )
    return
  }

  // Built files carry a content hash in their name, so a cached copy never goes stale.
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const route = (event.notification.data && event.notification.data.route) || ""
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const client = clients.find((item) => item.url.startsWith(self.registration.scope))
      if (client) return client.focus().then((focused) => focused.navigate(self.registration.scope + route))
      return self.clients.openWindow(self.registration.scope + route)
    }),
  )
})
