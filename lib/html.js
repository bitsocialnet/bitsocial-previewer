// Renders the preview page: OpenGraph/Twitter meta tags for social scrapers,
// plus an immediate redirect into the app for real browsers. Pure (no I/O), so
// it is unit-testable without a network or the protocol client.

const escapeHtml = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

// Safe to embed inside a <script> string literal (also neutralises </script>).
const jsString = (value) => JSON.stringify(String(value)).replaceAll('<', '\\u003c')

const truncate = (value, max) => {
  if (!value) return value
  const s = String(value).replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s
}

const firstLine = (value) => (value ? String(value).split('\n').find((l) => l.trim()) : undefined)
const stripUrls = (value) => (value ? value.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim() : value)

const TITLE_SEP = ' - '
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const join = (...parts) => parts.filter(Boolean).join(TITLE_SEP)

// Split a directory title "/tv/ - Television & Film" into its code ("/tv/") and
// name ("Television & Film") halves.
const splitDirectoryTitle = (title) => {
  const i = title.indexOf(TITLE_SEP)
  return i === -1 ? { code: title, name: null } : { code: title.slice(0, i), name: title.slice(i + TITLE_SEP.length) }
}

// Build the page title and description, modelled on 4chan's. For a thread the
// title leads with the directory code + post subject, then the board name, so
// the reader sees what they care about (which board + the post) first:
//   title:  "/tv/ - <subject> - Television & Film - 5chan"
//   desc:   "<post text> — "/tv/ - Television & Film" on 5chan, a serverless imageboard."
// `boardTitle` is the nice directory title (or null); `label` is the general
// display label (boardTitle, else the community address); both can be null.
const buildMeta = ({ kind, comment, boardTitle, label, siteName, tagline }) => {
  const onSite = tagline ? `${siteName}, ${tagline}` : siteName
  const context = label ? `"${label}" on ${onSite}` : onSite // board clause for descriptions

  if (kind === 'thread' && comment) {
    // Display title: post subject, else a content excerpt, else the link URL — capped at 50.
    const subject = truncate(comment.title || firstLine(comment.content) || comment.link, 50)
    // Description body: post text with URLs stripped — a bare media URL (e.g. a
    // YouTube link) reads badly and makes platforms like Telegram replace our
    // image with the linked site's. Fall back to the subject when nothing's left.
    const body = truncate(stripUrls(comment.content) || comment.title, 120)
    let title
    if (boardTitle && subject) {
      const { code, name } = splitDirectoryTitle(boardTitle)
      title = join(code, subject, name, siteName) // "/tv/ - <subject> - Television & Film - 5chan"
    } else if (subject) {
      title = join(label, subject, siteName)
    } else {
      title = label ? join(label, siteName) : siteName
    }
    return {
      title,
      description: body ? `${body} — ${context}.` : `${capitalize(context)}.`,
    }
  }
  if (kind === 'catalog') {
    return {
      title: join(label, 'Catalog', siteName),
      description: label ? `Browse the "${label}" catalog on ${onSite}.` : `Browse ${onSite}.`,
    }
  }
  // board home / fallback
  return {
    title: label ? join(label, siteName) : siteName,
    description: `${capitalize(context)}.`,
  }
}

// opts: { client, appUrl, comment?, board?, boardTitle?, image?, kind }
//   kind: 'thread' | 'catalog' | 'board' (default 'board')
export const buildPreviewHtml = ({ client, appUrl, comment, board, boardTitle, image, kind = 'board' }) => {
  const siteName = client.siteName
  // Board display label: nice directory title > community address > /board/ > none.
  const label = boardTitle || comment?.communityAddress || (board ? `/${board}/` : null)

  const { title, description } = buildMeta({ kind, comment, boardTitle, label, siteName, tagline: client.tagline })

  const twitterCard = image ? 'summary_large_image' : 'summary'
  const favicon = `${client.appBaseUrl}/favicon.ico`
  const imageTags = image
    ? `
    <meta property="og:image" content="${escapeHtml(image)}"/>
    <meta name="twitter:image" content="${escapeHtml(image)}"/>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}"/>
    <meta property="og:site_name" content="${escapeHtml(siteName)}"/>
    <meta property="og:type" content="website"/>
    <meta property="og:url" content="${escapeHtml(appUrl)}"/>
    <meta property="og:title" content="${escapeHtml(title)}"/>
    <meta property="og:description" content="${escapeHtml(description)}"/>${imageTags}
    <meta name="twitter:card" content="${twitterCard}"/>
    <meta name="twitter:title" content="${escapeHtml(title)}"/>
    <meta name="twitter:description" content="${escapeHtml(description)}"/>
    <link rel="icon" href="${escapeHtml(favicon)}"/>
    <link rel="canonical" href="${escapeHtml(appUrl)}"/>
    <meta http-equiv="refresh" content="0; url=${escapeHtml(appUrl)}"/>
  </head>
  <body>
    <p>Redirecting to <a href="${escapeHtml(appUrl)}">${escapeHtml(siteName)}</a>…</p>
    <script>location.replace(${jsString(appUrl)})</script>
  </body>
</html>`
}

export const __test__ = { escapeHtml, jsString, truncate, buildMeta }
