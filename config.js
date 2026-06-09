// Runtime config, driven entirely by environment variables so the same image
// runs locally and on the server. See .env.example for the production values.

const list = (value) =>
  (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

// Build @pkcprotocol/pkc-js options. Two modes:
//
//   • RPC mode (recommended on VPS B): set PKC_RPC_URLS to the local daemon the
//     seeder already runs (ws://127.0.0.1:9138). getComment is served by that
//     warm, content-pinned node — no second IPFS node, fastest + most reliable.
//
//   • Standalone mode (default, runs anywhere): in-process pkc-js reading from
//     IPFS gateways. On the server, point IPFS_GATEWAY_URLS at the local gateway
//     (http://127.0.0.1:6473); with no env set it falls back to public gateways
//     so `npm start` works on a laptop for review.
const buildPkcOptions = () => {
  const options = {}

  const rpc = list(process.env.PKC_RPC_URLS)
  if (rpc.length) options.pkcRpcClientsOptions = rpc

  const kubo = list(process.env.KUBO_RPC_URLS)
  if (kubo.length) options.kuboRpcClientsOptions = kubo

  const pubsub = list(process.env.PUBSUB_KUBO_RPC_URLS)
  if (pubsub.length) options.pubsubKuboRpcClientsOptions = pubsub

  const gateways = list(process.env.IPFS_GATEWAY_URLS)
  if (gateways.length) {
    options.ipfsGatewayUrls = gateways
  } else if (!rpc.length) {
    // public fallback only when not delegating to a local daemon
    options.ipfsGatewayUrls = ['https://ipfs.io', 'https://ipfsgateway.xyz', 'https://gateway.forumindex.com']
  }

  return options
}

export default {
  port: Number(process.env.PORT || 3924),
  // Bind to loopback by default: with host networking on the server, only the
  // local Caddy reaches it (never the public internet). Set BIND_HOST=0.0.0.0
  // when running in bridge networking with a published port.
  bindHost: process.env.BIND_HOST || '127.0.0.1',
  // Max time to resolve a comment before the request falls back to a generic card.
  getCommentTimeoutMs: Number(process.env.GETCOMMENT_TIMEOUT_MS || 10_000),
  pkcOptions: buildPkcOptions(),
}
