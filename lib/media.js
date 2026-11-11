import extName from 'ext-name'
import ogs from 'open-graph-scraper'
import QuickLRU from 'quick-lru'
import Debug from 'debug'
import config from '../config.js'

const debug = Debug('bitsocial-previewer:media')

// Direct media URL from a comment's own fields (no network).
// Mirrors the old previewer's getCommentMediaInfo: prefer an image link, then a
// stored thumbnail, then a video link.
export const commentMediaUrl = (comment) => {
  if (!comment || (!comment.link && !comment.thumbnailUrl)) return undefined

  let mime
  try {
    mime = extName(new URL(comment.link).pathname.toLowerCase().replace('/', ''))[0]?.mime
  } catch {
    // link is missing or not a URL — fall through to thumbnail
  }

  if (mime?.startsWith('image')) return comment.link
  if (comment.thumbnailUrl) return comment.thumbnailUrl
  if (mime?.startsWith('video')) return comment.link
  return undefined
}

const GOOGLE_HEADERS = { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' }
const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
}
// Twitter/X only serve OpenGraph tags to Googlebot.
const USE_GOOGLE_HEADERS = new Set(['twitter.com', 'www.twitter.com', 'x.com', 'www.x.com'])

// The link is author-controlled and its site may be slow or stall, so every
// scrape has a deadline, and its result (a miss too) is reused for a while
// instead of fetching the link again on every share-link click.
const LINK_IMAGE_TTL_MS = 10 * 60_000
const linkImageCache = new QuickLRU({ maxSize: 10_000 })
const scraping = new Map()

const scrape = async (link) => {
  try {
    const headers = USE_GOOGLE_HEADERS.has(new URL(link).hostname) ? GOOGLE_HEADERS : BROWSER_HEADERS
    // The signal bounds the whole fetch, redirects and retries included.
    const signal = AbortSignal.timeout(config.linkScrapeTimeoutMs)
    const { result } = await ogs({ url: link, headers, signal })
    const ogImage = result?.ogImage
    if (Array.isArray(ogImage)) return ogImage[0]?.url
    return ogImage?.url
  } catch (e) {
    debug('scrapeLinkImage failed', link, e?.message || e?.result?.error || e)
    return undefined
  }
}

// Scrape an external link's og:image so link posts still get a preview image.
// Returns an image URL or undefined; never throws. Concurrent calls share one scrape.
export const scrapeLinkImage = async (link) => {
  const cached = linkImageCache.get(link)
  if (cached && Date.now() - cached.at < LINK_IMAGE_TTL_MS) return cached.image

  let promise = scraping.get(link)
  if (!promise) {
    promise = scrape(link)
      .then((image) => {
        linkImageCache.set(link, { image, at: Date.now() })
        return image
      })
      .finally(() => scraping.delete(link))
    scraping.set(link, promise)
  }
  return promise
}
