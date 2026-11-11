import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// Offline stand-in for pkc-js: each cid resolves only once it is "available" on
// the gateways, otherwise the fetch rejects like an unreachable comment.
const available = new Set()
const fetches = new Map()
const fakePkc = {
  on: () => {},
  getComment: async ({ cid }) => {
    fetches.set(cid, (fetches.get(cid) || 0) + 1)
    if (!available.has(cid)) throw new Error(`comment ${cid} not found on gateways`)
    return { cid, title: `title of ${cid}`, content: 'content', author: { shortAddress: 'author.eth' } }
  },
}
mock.module('@pkcprotocol/pkc-js', { defaultExport: async () => fakePkc })
const { getComment } = await import('../lib/pkc.js')

test('a cid that kept failing is fetched again after a cool-down and then previews', async (t) => {
  t.after(() => mock.timers.reset())
  mock.timers.enable({ apis: ['Date'], now: Date.now() })
  const cid = 'QmLatePropagatedCid1'

  for (let i = 0; i < 5; i++) await assert.rejects(getComment(cid), /not found/)
  await assert.rejects(getComment(cid), /giving up/)
  assert.equal(fetches.get(cid), 5, 'no fetch while giving up')

  // The content reaches the gateways later: still skipped during the cool-down,
  // fetched once it has passed.
  available.add(cid)
  await assert.rejects(getComment(cid), /giving up/)
  mock.timers.tick(60 * 60_000)
  assert.equal((await getComment(cid)).title, `title of ${cid}`)
})

test('a resolved cid does not keep its earlier failures', async () => {
  const cid = 'QmFlakyCid2'
  for (let i = 0; i < 4; i++) await assert.rejects(getComment(cid), /not found/)
  available.add(cid)
  assert.equal((await getComment(cid)).title, `title of ${cid}`)

  // Push it out of the in-memory comment cache with other comments.
  for (let i = 0; i < 20_001; i++) {
    const other = `QmOtherCid${i}`
    available.add(other)
    await getComment(other)
  }

  // One transient failure after eviction must not count as the fifth strike.
  available.delete(cid)
  const before = fetches.get(cid)
  await assert.rejects(getComment(cid), /not found/)
  assert.equal(fetches.get(cid), before + 1, 'the evicted cid is fetched again')
  available.add(cid)
  assert.equal((await getComment(cid)).title, `title of ${cid}`)
})
