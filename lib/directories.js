import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Debug from 'debug'

const debug = Debug('bitsocial-previewer:directories')

// Maps a 5chan directory code to its display title, e.g. "tv" -> "/tv/ -
// Television & Film". A snapshot is bundled (data/board-titles.json) and
// refreshed from the 5chan repo in the background so new boards' names stay
// current without a redeploy.
const BUNDLE_PATH = fileURLToPath(new URL('../data/board-titles.json', import.meta.url))
const REMOTE_URL =
  'https://raw.githubusercontent.com/bitsocialnet/5chan/master/src/data/5chan-directories/5chan-directories-defaults.json'
const REFRESH_MS = 6 * 60 * 60 * 1000

let titles = new Map()
try {
  titles = new Map(Object.entries(JSON.parse(readFileSync(BUNDLE_PATH, 'utf8'))))
  debug('loaded %d bundled board titles', titles.size)
} catch (e) {
  debug('failed to load bundled board titles:', e?.message || e)
}

// Directory code (e.g. "tv") -> "/tv/ - Television & Film", or null if the code
// is not a known 5chan directory (arbitrary community addresses return null).
export const getBoardTitle = (code) => (code && titles.get(code)) || null

const refresh = async () => {
  try {
    const res = await fetch(REMOTE_URL, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const dirs = (await res.json())?.directories
    if (!dirs || typeof dirs !== 'object') throw new Error('no directories in remote')
    const next = new Map()
    for (const [code, entry] of Object.entries(dirs)) {
      if (entry?.title) next.set(code, entry.title)
    }
    if (next.size) {
      titles = next
      debug('refreshed %d board titles from remote', titles.size)
    }
  } catch (e) {
    debug('board-title refresh failed (keeping current set):', e?.message || e)
  }
}

// Best-effort, non-blocking; never throws.
refresh()
setInterval(refresh, REFRESH_MS).unref?.()
