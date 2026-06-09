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

const TITLE_SEP = ' - '
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// Build the page title and description, modelled on 4chan's:
//   title:  "/tv/ - Television & Film - <subject> - 5chan"
//   desc:   "<post text> — "/tv/ - Television & Film" on 5chan, a serverless imageboard."
// `label` is the board's display name (nice directory title, else the community
// address); it can be null for non-board pages.
const buildMeta = ({ kind, comment, label, siteName, tagline }) => {
  const onSite = tagline ? `${siteName}, ${tagline}` : siteName
  const context = label ? `"${label}" on ${onSite}` : onSite // board clause for descriptions
  const boardPart = label ? `${label}${TITLE_SEP}` : ''

  if (kind === 'thread' && comment) {
    const subject = truncate(comment.title || firstLine(comment.content), 65)
    const body = truncate(comment.content || comment.title, 120)
    return {
      title: subject ? `${boardPart}${subject}${TITLE_SEP}${siteName}` : `${boardPart}${siteName}`,
      description: body ? `${body} — ${context}.` : `${capitalize(context)}.`,
    }
  }
  if (kind === 'catalog') {
    return {
      title: `${boardPart}Catalog${TITLE_SEP}${siteName}`,
      description: label ? `Browse the "${label}" catalog on ${onSite}.` : `Browse ${onSite}.`,
    }
  }
  // board home / fallback
  return {
    title: label ? `${label}${TITLE_SEP}${siteName}` : siteName,
    description: `${capitalize(context)}.`,
  }
}

// opts: { client, appUrl, comment?, board?, boardTitle?, image?, kind }
//   kind: 'thread' | 'catalog' | 'board' (default 'board')
export const buildPreviewHtml = ({ client, appUrl, comment, board, boardTitle, image, kind = 'board' }) => {
  const siteName = client.siteName
  // Board display label: nice directory title > community address > /board/ > none.
  const label = boardTitle || comment?.communityAddress || (board ? `/${board}/` : null)

  const { title, description } = buildMeta({ kind, comment, label, siteName, tagline: client.tagline })

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
