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

// opts: { client, appUrl, comment?, board?, image?, pageTitle? }
export const buildPreviewHtml = ({ client, appUrl, comment, board, image, pageTitle }) => {
  const siteName = client.siteName
  const where = board ? `/${board}/` : comment?.communityAddress || ''

  const firstLine = comment?.content?.split('\n').find((l) => l.trim())
  const title = truncate(comment?.title || firstLine || pageTitle || siteName, 70) || siteName

  let description
  if (comment) {
    const body = comment.content?.trim()
    description = truncate(body || (where ? `Thread in ${where} on ${siteName}` : `A post on ${siteName}`), 200)
  } else if (board) {
    description = `Browse ${where} on ${siteName}`
  } else {
    description = `Shared from ${siteName}`
  }

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

export const __test__ = { escapeHtml, jsString, truncate }
