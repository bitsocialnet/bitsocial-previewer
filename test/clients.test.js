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
  })
  assert.ok(!html.includes('<img src=x'), 'raw injected tag must not survive')
  assert.ok(html.includes('&lt;img src=x'), 'injected tag must be escaped')
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
