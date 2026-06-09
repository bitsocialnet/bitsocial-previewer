import PKC from '@pkcprotocol/pkc-js'
import QuickLRU from 'quick-lru'
import Debug from 'debug'
import config from '../config.js'

const debug = Debug('bitsocial-previewer:pkc')

// Initialise the protocol client once over the configured IPFS gateways.
let pkc
export const whenReady = (async () => {
  pkc = await PKC(config.pkcOptions)
  pkc.on('error', (e) => debug('pkc error:', e?.message || e))
  debug('pkc initialised with options:', Object.keys(config.pkcOptions))
})()

// Comments are immutable, so cache hard. Track repeated failures so a
// permanently-unresolvable cid stops hammering the gateways.
const commentCache = new QuickLRU({ maxSize: 10_000 })
const failedCache = new QuickLRU({ maxSize: 100_000 })
const inflight = new Map()
const MAX_ATTEMPTS = 5

// Underlying fetch, deduped per-cid. It caches on success even if the caller
// already gave up (timed out), so the next request serves the warm cache.
const fetchComment = (cid) => {
  let promise = inflight.get(cid)
  if (promise) return promise

  promise = pkc
    .getComment({ cid })
    .then((raw) => {
      const comment = {
        cid,
        title: raw.title,
        content: raw.content,
        link: raw.link,
        thumbnailUrl: raw.thumbnailUrl,
        communityAddress: raw.communityAddress,
        authorShortAddress: raw.author?.shortAddress,
      }
      commentCache.set(cid, comment)
      return comment
    })
    .catch((e) => {
      failedCache.set(cid, (failedCache.get(cid) || 0) + 1)
      throw e
    })
    .finally(() => inflight.delete(cid))

  inflight.set(cid, promise)
  return promise
}

// Fetch a comment by cid, bounded by a timeout so a slow/cold fetch never hangs
// the request. On timeout we throw (the caller serves a generic card) while the
// fetch keeps running in the background to warm the cache for the retry.
export const getComment = async (cid) => {
  await whenReady

  const cached = commentCache.get(cid)
  if (cached) return cached
  if ((failedCache.get(cid) || 0) >= MAX_ATTEMPTS) {
    throw new Error(`comment ${cid} failed ${MAX_ATTEMPTS}x, giving up`)
  }

  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`getComment timeout after ${config.getCommentTimeoutMs}ms`)),
      config.getCommentTimeoutMs,
    )
  })
  try {
    return await Promise.race([fetchComment(cid), timeout])
  } finally {
    clearTimeout(timer)
  }
}
