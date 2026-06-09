# bitsocial-previewer

Link-preview + redirect server for Bitsocial clients. When someone shares a
post link on Twitter/Telegram/Discord/etc., this server renders the
OpenGraph/Twitter card for that post, then redirects real browsers into the app.

It is **multi-tenant**: one running instance serves many clients and many mirror
domains, picking the right profile from the request's `Host` header — so a single
deployment (and a single TLS setup) covers every client and every mirror.

```
                      ┌──────────── s.5chan.app/biz/thread/<cid>
 share link  ───────► │  bitsocial-previewer  ──► OG/Twitter card (for scrapers)
 (no #/ hash)         └──────────── 302-ish JS redirect ──► 5chan.app/#/biz/thread/<cid>
```

## How it works

1. 5chan 0.9.1 copies **path-based** share links (no `#/` hash) so the path
   reaches the server: `https://s.5chan.app/<board>/thread/<cid>`.
2. The server matches the path to a client profile + route, fetches the post by
   cid via `@pkcprotocol/pkc-js` (`getComment`), and builds the card.
3. Browsers get redirected into the app's hash route; scrapers read the tags.

`<board>` is usually a short **directory code** (e.g. `biz`). We pass it straight
through to the app (which resolves it); the cid is authoritative for the preview,
so the previewer never needs to resolve codes itself.

### Recognised share-link formats (5chan)

| Incoming on `s.5chan.app` | Preview | Redirects to |
|---|---|---|
| `/<board>/thread/<cid>` | rich (title/text/image) | `5chan.app/#/<board>/thread/<cid>` |
| `/<board>/catalog` | generic board card | `5chan.app/#/<board>/catalog` |
| `/<board>` | generic board card | `5chan.app/#/<board>` |
| `/p/<address>/c/<cid>` (legacy) | rich | `5chan.app/#/<address>/thread/<cid>` |

Unresolvable cid → still redirects to the app with a generic card (short cache),
so a share link never dead-ends.

## Layout

| File | Purpose |
|---|---|
| [`lib/clients.js`](lib/clients.js) | **The per-client design.** Profiles (hostnames, app URL, routes) + host→profile + route matching. |
| [`lib/html.js`](lib/html.js) | OG/Twitter tag rendering + redirect (HTML-escaped, XSS-safe). Pure. |
| [`lib/pkc.js`](lib/pkc.js) | `@pkcprotocol/pkc-js` init + cached `getComment`. |
| [`lib/media.js`](lib/media.js) | Comment media URL + external-link `og:image` scraping. |
| [`start.js`](start.js) | Express wiring. |
| [`config.js`](config.js) | Env-driven config (port, bind host, pkc options). |

## Run locally

```bash
npm install
npm start            # listens on 127.0.0.1:3924, public-gateway fallback
# in another shell:
curl -s 'http://localhost:3924/biz/thread/<cid>' | grep -i og:
```

```bash
npm test             # routing + HTML unit tests (no network/install needed for the pure logic)
```

## Deploy (Caddy)

Deployed under `/opt/bitsocial-previewer` like the box's other services. Config
(gateways, port) is inline in [`docker-compose.yml`](docker-compose.yml). The
previewer resolves shared comments through the public IPFS gateways the 5chan app
uses — a fetch is sub-second once a gateway has the content, and a hard timeout
falls back to a generic card so a request never hangs. (A box's local IPFS node
generally can't resolve arbitrary shared comment cids: thinly peered, and it
doesn't pin individual comment blocks.)

```bash
# on the box, in /opt/bitsocial-previewer (source synced or git-cloned):
docker compose up -d --build       # builds + runs on 127.0.0.1:3924
docker compose logs -f --tail=50
```

CI also publishes `ghcr.io/bitsocialnet/bitsocial-previewer:latest`
([workflow](.github/workflows/docker.yml)); once that package is made public you
can `docker compose pull && docker compose up -d` instead of building on the box.

Point the local Caddy at it with [`deploy/Caddyfile.snippet`](deploy/Caddyfile.snippet),
then do the Cloudflare DNS change in [`deploy/cloudflare.md`](deploy/cloudflare.md).

## Add a client or a mirror

- **New mirror domain for 5chan:** add it to the `5chan` profile's `hostnames`
  in [`lib/clients.js`](lib/clients.js), add a Caddy block + a DNS A record.
- **New client (e.g. seedit):** fill in the `seedit` profile template
  (hostnames, `appBaseUrl`, route formats) and enable it.

## License

[GPL-3.0-or-later](LICENSE) — matching the Bitsocial core stack it builds on
(`@pkcprotocol/pkc-js`, `bitsocial-react-hooks`, 5chan, seedit).
