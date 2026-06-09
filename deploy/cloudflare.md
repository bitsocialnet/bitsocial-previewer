# Cloudflare DNS for `s.5chan.app`

Goal: stop redirecting `s.5chan.app` → `5chan.app`, and instead point it at the
previewer on the VPS so Caddy can serve link previews.

## Steps (DNS-only A record + Caddy)

1. **Remove the old redirect.** In the `5chan.app` zone → **Rules**, delete the
   Redirect Rule / Page Rule that sends `s.5chan.app` → `5chan.app`. Also delete
   any placeholder DNS record for `s` that the redirect relied on.

2. **Add the A record.** Zone → **DNS → Records → Add record**:
   - Type: `A`
   - Name: `s`
   - IPv4 address: `<your VPS IP>`
   - Proxy status: **DNS only** (grey cloud)
   - TTL: Auto

   Grey-cloud lets Caddy obtain a Let's Encrypt cert directly and lets social
   scrapers (Twitter/Telegram/Discord/…) crawl the previews without challenges.

3. **Wait for propagation**, then confirm TLS + a real preview:
   ```bash
   curl -sI https://s.5chan.app/health
   curl -s  https://s.5chan.app/<board>/thread/<cid> | grep -i 'og:'
   ```
   The HTML should contain `og:title` / `og:description` and redirect a browser
   into `https://5chan.app/#/<board>/thread/<cid>`.

4. **Validate the card** with the Twitter/Telegram/Discord link-preview tools.

## Later (optional): put Cloudflare in front

To gain Cloudflare CDN/WAF, flip the A record to **Proxied** (orange) and set
**SSL/TLS → Overview → Full (strict)**. Because proxied TLS-ALPN renewal is
blocked, Caddy then needs either a **Cloudflare Origin Certificate** installed,
or the **DNS-01** challenge via a Cloudflare API token. Keep bot-fight settings
relaxed for `s.5chan.app` so OG scrapers aren't challenged.
