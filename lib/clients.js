// Client profiles for the multi-tenant previewer.
//
// Every incoming request is mapped to a profile by its Host header, so ONE
// running instance serves every client (5chan, seedit, ...) and every mirror
// domain. Adding a mirror = one more entry in `hostnames`. Adding a client =
// one more profile here.
//
// A route maps an incoming share-link path to a redirect + preview:
//   kind:  'thread' -> has a comment cid, gets a rich preview
//          'page'   -> no cid (board/catalog/home), gets a generic preview
//   test:  RegExp matched against the request path (req.path, no query/hash)
//   cid:   (m) => commentCid                    // required for kind 'thread'
//   app:   (m) => '/#/...'                       // hash route appended to appBaseUrl
//   title: (m) => 'generic title'               // optional, for kind 'page'
// `m` is the RegExp match array (m[1], m[2], ... are the capture groups).
//
// NOTE on {board}: in 5chan share links the first path segment is usually a
// short *directory code* (e.g. "biz"), not the full community address. That is
// fine: for the redirect we pass it straight through to the app, which resolves
// it; for thread previews the cid is authoritative, so we never need to resolve
// the code server-side.

export const CLIENTS = [
  {
    id: '5chan',
    // s.5chan.app is live in 5chan 0.9.1. Add mirror domains below as you bring
    // them online — they all resolve to this same profile.
    hostnames: ['s.5chan.app'],
    appBaseUrl: 'https://5chan.app',
    siteName: '5chan',
    tagline: 'a serverless, adminless imageboard',
    // 5chan boards have nice directory names ("/tv/ - Television & Film"),
    // resolved from the directory code via lib/directories.js.
    directoryTitles: true,
    routes: [
      // /{board}/thread/{cid}  -> rich thread preview (the common share link)
      {
        kind: 'thread',
        test: /^\/([^/]+)\/thread\/([^/]+)\/?$/,
        cid: (m) => m[2],
        app: (m) => `/#/${m[1]}/thread/${m[2]}`,
      },
      // /{board}/catalog  -> generic board preview
      {
        kind: 'page',
        pageKind: 'catalog',
        test: /^\/([^/]+)\/catalog\/?$/,
        app: (m) => `/#/${m[1]}/catalog`,
      },
      // legacy /p/{address}/c/{cid} format (still valid)
      {
        kind: 'thread',
        test: /^\/p\/([^/]+)\/c\/([^/]+)\/?$/,
        cid: (m) => m[2],
        app: (m) => `/#/${m[1]}/thread/${m[2]}`,
      },
      // legacy /p/{address}
      {
        kind: 'page',
        test: /^\/p\/([^/]+)\/?$/,
        app: (m) => `/#/${m[1]}`,
      },
      // bare /{board}  (board home, /all, /subscriptions, /mod, ...)
      {
        kind: 'page',
        test: /^\/([^/]+)\/?$/,
        app: (m) => `/#/${m[1]}`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────
  // seedit (reddit-style). Its real share format is /s/<community>/c/<cid> and
  // its app routes are #/s/<community>/c/<cid>. NOTE: seedit still emits
  // seedit.app/s/... links today — its app must be pointed at s.seedit.app
  // (like 5chan 0.9.1 was) before this profile actually receives traffic.
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'seedit',
    hostnames: ['s.seedit.app'],
    appBaseUrl: 'https://seedit.app',
    siteName: 'seedit',
    tagline: 'a decentralized Reddit alternative',
    routes: [
      // /{community}/c/{cid}  -> clean subdomain form
      { kind: 'thread', test: /^\/([^/]+)\/c\/([^/]+)\/?$/, cid: (m) => m[2], app: (m) => `/#/s/${m[1]}/c/${m[2]}` },
      // /s/{community}/c/{cid}  -> mirrors seedit's existing /s/ links
      { kind: 'thread', test: /^\/s\/([^/]+)\/c\/([^/]+)\/?$/, cid: (m) => m[2], app: (m) => `/#/s/${m[1]}/c/${m[2]}` },
      // community pages
      { kind: 'page', test: /^\/s\/([^/]+)\/?$/, app: (m) => `/#/s/${m[1]}` },
      { kind: 'page', test: /^\/([^/]+)\/?$/, app: (m) => `/#/s/${m[1]}` },
    ],
  },
]

// Build the hostname -> profile lookup once.
const byHost = new Map()
for (const client of CLIENTS) {
  for (const hostname of client.hostnames) {
    byHost.set(hostname.toLowerCase(), client)
  }
}

// Resolve the client profile for a request hostname. When `fallback` is true,
// unknown hosts (e.g. localhost during dev) resolve to the first profile so the
// server is testable; in production DNS only routes configured hosts here.
export const getClient = (hostname, fallback = true) => {
  const host = String(hostname || '')
    .toLowerCase()
    .replace(/:\d+$/, '') // strip port
    .replace(/^www\./, '')
  return byHost.get(host) || (fallback ? CLIENTS[0] : undefined)
}

// First matching route wins. Returns { route, m } or undefined.
export const matchRoute = (client, path) => {
  for (const route of client.routes) {
    const m = route.test.exec(path)
    if (m) return { route, m }
  }
  return undefined
}

// All configured hostnames across every client (handy for Caddy / DNS docs).
export const allHostnames = () => CLIENTS.flatMap((c) => c.hostnames)
