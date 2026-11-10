import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

// Short scrape deadline so a stalled link host fails fast; config reads env at import.
process.env.LINK_SCRAPE_TIMEOUT_MS = '200'
const { scrapeLinkImage } = await import('../lib/media.js')

const OG_PAGE = '<html><head><meta property="og:image" content="https://img.example/preview.png"></head></html>'

// Local link host. `respond: false` accepts the request and never answers, like a stalling site.
const startLinkHost = async ({ respond }) => {
  const host = { hits: 0 }
  host.server = http.createServer((req, res) => {
    host.hits++
    if (respond) res.writeHead(200, { 'content-type': 'text/html' }).end(OG_PAGE)
  })
  await new Promise((resolve) => host.server.listen(0, '127.0.0.1', resolve))
  host.url = `http://127.0.0.1:${host.server.address().port}/post`
  host.stop = () => {
    host.server.closeAllConnections()
    host.server.close()
  }
  return host
}

const settleWithin = (promise, ms) =>
  Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve('still pending'), ms).unref())])

test('scrapeLinkImage gives up on a link host that never responds', async () => {
  const host = await startLinkHost({ respond: false })
  try {
    const started = Date.now()
    assert.equal(await settleWithin(scrapeLinkImage(host.url), 3000), undefined)
    assert.ok(Date.now() - started < 2000, 'the scrape should stop at its deadline')
  } finally {
    host.stop()
  }
})

test('scrapeLinkImage reuses a scraped image instead of fetching the link on every request', async () => {
  const host = await startLinkHost({ respond: true })
  try {
    assert.equal(await scrapeLinkImage(host.url), 'https://img.example/preview.png')
    assert.equal(await scrapeLinkImage(host.url), 'https://img.example/preview.png')
    assert.equal(host.hits, 1)
  } finally {
    host.stop()
  }
})

test('scrapeLinkImage remembers a miss for a while, then tries the link again', async (t) => {
  t.after(() => mock.timers.reset())
  mock.timers.enable({ apis: ['Date'], now: Date.now() })
  const host = await startLinkHost({ respond: false })
  try {
    assert.equal(await settleWithin(scrapeLinkImage(host.url), 3000), undefined)
    assert.equal(await settleWithin(scrapeLinkImage(host.url), 3000), undefined)
    assert.equal(host.hits, 1, 'a fresh miss is served from cache')

    mock.timers.tick(60 * 60_000)
    assert.equal(await settleWithin(scrapeLinkImage(host.url), 3000), undefined)
    assert.equal(host.hits, 2, 'an expired miss is scraped again')
  } finally {
    host.stop()
  }
})
