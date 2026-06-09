import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getClient, matchRoute, allHostnames } from '../lib/clients.js'
import { buildPreviewHtml, __test__ } from '../lib/html.js'

// Resolve a share path the way start.js does, returning the app redirect URL
// and the route kind, so we can assert on the user-visible behaviour.
const resolve = (host, path) => {
  const client = getClient(host, false)
  if (!client) return undefined
  const matched = matchRoute(client, path)
  if (!matched) return { client, appUrl: client.appBaseUrl, kind: 'fallback' }
  const { route, m } = matched
  return { client, kind: route.kind, cid: route.cid?.(m), appUrl: client.appBaseUrl + route.app(m), board: m[1] }
}

test('s.5chan.app resolves to the 5chan profile', () => {
  assert.equal(getClient('s.5chan.app').id, '5chan')
  assert.equal(getClient('S.5CHAN.APP').id, '5chan') // case-insensitive
  assert.equal(getClient('s.5chan.app:3924').id, '5chan') // port stripped
})

test('unknown host has no profile when fallback is disabled', () => {
  assert.equal(getClient('example.com', false), undefined)
})

test('5chan thread share link -> rich preview + hash redirect', () => {
  const r = resolve('s.5chan.app', '/biz/thread/QmThreadCidAbc123')
  assert.equal(r.kind, 'thread')
  assert.equal(r.cid, 'QmThreadCidAbc123')
  assert.equal(r.board, 'biz')
  assert.equal(r.appUrl, 'https://5chan.app/#/biz/thread/QmThreadCidAbc123')
})

test('5chan catalog share link -> generic page', () => {
  const r = resolve('s.5chan.app', '/biz/catalog')
  assert.equal(r.kind, 'page')
  assert.equal(r.appUrl, 'https://5chan.app/#/biz/catalog')
})

test('5chan full-address board identifier works (dots allowed)', () => {
  const r = resolve('s.5chan.app', '/board.eth/thread/QmAbc')
  assert.equal(r.cid, 'QmAbc')
  assert.equal(r.appUrl, 'https://5chan.app/#/board.eth/thread/QmAbc')
})

test('legacy /p/{address}/c/{cid} maps to the new thread route', () => {
  const r = resolve('s.5chan.app', '/p/board.eth/c/QmLegacyCid')
  assert.equal(r.kind, 'thread')
  assert.equal(r.cid, 'QmLegacyCid')
  assert.equal(r.appUrl, 'https://5chan.app/#/board.eth/thread/QmLegacyCid')
})

test('bare board path -> generic page', () => {
  const r = resolve('s.5chan.app', '/all')
  assert.equal(r.kind, 'page')
  assert.equal(r.appUrl, 'https://5chan.app/#/all')
})

test('s.seedit.app resolves to the seedit profile and maps /s/ links', () => {
  assert.equal(getClient('s.seedit.app').id, 'seedit')
  assert.ok(allHostnames().includes('s.seedit.app'))

  const slashS = resolve('s.seedit.app', '/s/community.eth/c/QmSeeditCid')
  assert.equal(slashS.kind, 'thread')
  assert.equal(slashS.cid, 'QmSeeditCid')
  assert.equal(slashS.appUrl, 'https://seedit.app/#/s/community.eth/c/QmSeeditCid')

  const clean = resolve('s.seedit.app', '/community.eth/c/QmSeeditCid')
  assert.equal(clean.appUrl, 'https://seedit.app/#/s/community.eth/c/QmSeeditCid')
})

test('preview HTML escapes user content (no tag/attribute injection)', () => {
  const html = buildPreviewHtml({
    client: { siteName: '5chan', appBaseUrl: 'https://5chan.app' },
    appUrl: 'https://5chan.app/#/biz/thread/QmAbc',
    comment: { title: 'pwn "><img src=x onerror=alert(1)>', content: 'hi' },
    board: 'biz',
    kind: 'thread',
  })
  assert.ok(!html.includes('<img src=x'), 'raw injected tag must not survive')
  assert.ok(html.includes('&lt;img src=x'), 'injected tag must be escaped')
})

test('5chan thread builds a 4chan-style title + description with the board name', () => {
  const html = buildPreviewHtml({
    client: { siteName: '5chan', appBaseUrl: 'https://5chan.app', tagline: 'a serverless, adminless imageboard' },
    appUrl: 'https://5chan.app/#/tv/thread/QmX',
    comment: { title: 'Disclosure Day', content: 'all this UFO craze is fake', communityAddress: 'television-and-film.bso' },
    board: 'tv',
    boardTitle: '/tv/ - Television & Film',
    image: 'https://i.imgur.com/x.png',
    kind: 'thread',
  })
  assert.ok(
    html.includes('og:title" content="/tv/ - Disclosure Day - Television &amp; Film - 5chan"'),
    'title = code + subject + board name + site (4chan order)',
  )
  assert.ok(
    html.includes(
      'og:description" content="all this UFO craze is fake — &quot;/tv/ - Television &amp; Film&quot; on 5chan, a serverless, adminless imageboard."',
    ),
    'description = post text + board tagline',
  )
  assert.ok(html.includes('twitter:card" content="summary_large_image"'), 'image -> large card')
})

test('thread on an arbitrary board falls back to the community address', () => {
  const html = buildPreviewHtml({
    client: { siteName: '5chan', appBaseUrl: 'https://5chan.app', tagline: 'a serverless, adminless imageboard' },
    appUrl: 'https://5chan.app/#/cool.bso/thread/QmX',
    comment: { title: 'hello', content: 'hi', communityAddress: 'cool.bso' },
    board: 'cool.bso',
    boardTitle: null,
    kind: 'thread',
  })
  assert.ok(html.includes('og:title" content="cool.bso - hello - 5chan"'), 'uses community address as board label')
})

test('catalog page uses the directory name', () => {
  const html = buildPreviewHtml({
    client: { siteName: '5chan', appBaseUrl: 'https://5chan.app', tagline: 'a serverless, adminless imageboard' },
    appUrl: 'https://5chan.app/#/tv/catalog',
    board: 'tv',
    boardTitle: '/tv/ - Television & Film',
    kind: 'catalog',
  })
  assert.ok(html.includes('og:title" content="/tv/ - Television &amp; Film - Catalog - 5chan"'), 'catalog title')
})

test('thread display title: 50-char content excerpt when there is no subject', () => {
  const html = buildPreviewHtml({
    client: { siteName: '5chan', appBaseUrl: 'https://5chan.app', tagline: 't' },
    appUrl: 'https://5chan.app/#/tv/thread/Q',
    comment: { content: 'y'.repeat(80), communityAddress: 'tv.bso' },
    board: 'tv',
    boardTitle: '/tv/ - Television & Film',
    kind: 'thread',
  })
  const ogTitle = html.match(/og:title" content="([^"]*)"/)[1]
  assert.equal(ogTitle, '/tv/ - ' + 'y'.repeat(49) + '… - Television &amp; Film - 5chan')
})

test('thread display title: link fallback when no subject or content', () => {
  const link = 'https://i.imgur.com/abcdefgh.png'
  const html = buildPreviewHtml({
    client: { siteName: '5chan', appBaseUrl: 'https://5chan.app', tagline: 't' },
    appUrl: 'https://5chan.app/#/tv/thread/Q',
    comment: { link, communityAddress: 'tv.bso' },
    board: 'tv',
    boardTitle: '/tv/ - Television & Film',
    kind: 'thread',
  })
  const ogTitle = html.match(/og:title" content="([^"]*)"/)[1]
  assert.equal(ogTitle, '/tv/ - ' + link + ' - Television &amp; Film - 5chan')
})

test('description strips bare URLs (no platform image hijack) and keeps the post image', () => {
  const html = buildPreviewHtml({
    client: { siteName: '5chan', appBaseUrl: 'https://5chan.app', tagline: 'a serverless, adminless imageboard' },
    appUrl: 'https://5chan.app/#/m/thread/Q',
    comment: {
      title: 'Best Gundam opening',
      content: 'https://www.youtube.com/watch?v=bM9IvVH3pKE',
      link: 'https://i.imgur.com/352orvK.jpeg',
      communityAddress: 'mecha.bso',
    },
    board: 'm',
    boardTitle: '/m/ - Mecha',
    image: 'https://i.imgur.com/352orvK.jpeg',
    kind: 'thread',
  })
  assert.ok(!/youtube|youtu\.be/i.test(html), 'no YouTube URL anywhere in the page')
  assert.ok(
    html.includes(
      'og:description" content="Best Gundam opening — &quot;/m/ - Mecha&quot; on 5chan, a serverless, adminless imageboard."',
    ),
    'description falls back to the title with URLs stripped',
  )
  assert.ok(html.includes('og:image" content="https://i.imgur.com/352orvK.jpeg"'), 'keeps the imgur post image')
})

test('redirect script cannot break out of the <script> tag', () => {
  const html = buildPreviewHtml({
    client: { siteName: '5chan', appBaseUrl: 'https://5chan.app' },
    appUrl: 'https://5chan.app/#/biz/thread/Qm</script><script>alert(1)//',
  })
  assert.ok(!html.includes('</script><script>alert(1)'), 'must neutralise </script> breakout')
})

test('html helpers behave', () => {
  assert.equal(__test__.escapeHtml('a&b<c>"d\''), 'a&amp;b&lt;c&gt;&quot;d&#39;')
  assert.equal(__test__.truncate('a'.repeat(80), 10).length, 10)
  assert.equal(__test__.jsString('x</script>'), '"x\\u003c/script>"')
})
