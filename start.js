import express from 'express'
import Debug from 'debug'
import config from './config.js'
import { getClient, matchRoute } from './lib/clients.js'
import { getComment } from './lib/pkc.js'
import { commentMediaUrl, scrapeLinkImage } from './lib/media.js'
import { buildPreviewHtml } from './lib/html.js'

const debug = Debug('bitsocial-previewer:server')
Debug.enable(process.env.DEBUG || 'bitsocial-previewer:*')

const app = express()
app.disable('x-powered-by')

// Paths that browsers/PWAs request but that are never share links.
const IGNORE = new Set(['/favicon.ico', '/service-worker.js', '/manifest.json', '/apple-touch-icon.png'])

const ONE_YEAR = 'public, max-age=31536000, immutable'
const FIVE_MIN = 'public, max-age=300'

const send = (res, html, cacheControl) => {
  res.setHeader('Cache-Control', cacheControl)
  res.type('html').send(html)
}

// Needed so social scrapers can crawl the previews.
app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nAllow: /\n'))
app.get('/health', (req, res) => res.json({ ok: true }))

app.get('*', async (req, res) => {
  if (IGNORE.has(req.path)) return res.status(404).end()

  const client = getClient(req.hostname)
  if (!client) return res.status(404).end('unknown host')

  const matched = matchRoute(client, req.path)

  // Unknown path -> send to the app home with a generic card (never dead-end).
  if (!matched) {
    return send(res, buildPreviewHtml({ client, appUrl: client.appBaseUrl }), FIVE_MIN)
  }

  const { route, m } = matched
  const board = m[1]
  const appUrl = client.appBaseUrl + route.app(m)

  if (route.kind === 'thread') {
    const cid = route.cid(m)
    try {
      const comment = await getComment(cid)
      let image = commentMediaUrl(comment)
      if (!image && comment.link) image = await scrapeLinkImage(comment.link)
      return send(res, buildPreviewHtml({ client, appUrl, comment, board, image }), ONE_YEAR)
    } catch (e) {
      // Graceful fallback: still redirect to the app with a generic card, but
      // with a short TTL so the rich preview can appear once the cid resolves.
      debug('getComment failed for', cid, '-', e?.message || e)
      return send(res, buildPreviewHtml({ client, appUrl, board }), FIVE_MIN)
    }
  }

  // page (board/catalog/home) -> generic card
  return send(res, buildPreviewHtml({ client, appUrl, board, pageTitle: route.title?.(m) }), FIVE_MIN)
})

app
  .listen(config.port, config.bindHost, () => debug(`listening on ${config.bindHost}:${config.port}`))
  .on('error', (e) => debug(e.message))
