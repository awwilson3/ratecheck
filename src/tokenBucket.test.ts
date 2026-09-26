import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TokenBucket } from './tokenBucket.js'

test('allows up to capacity requests instantly, then denies', () => {
  const bucket = new TokenBucket({ capacity: 3, refillRatePerMs: 0 })
  assert.equal(bucket.check(0).allowed, true)
  assert.equal(bucket.check(0).allowed, true)
  assert.equal(bucket.check(0).allowed, true)
  assert.equal(bucket.check(0).allowed, false)
})

test('refills over time but never past capacity', () => {
  const bucket = new TokenBucket({ capacity: 2, refillRatePerMs: 0.001 }) // 1 token / 1000ms
  assert.equal(bucket.check(0).allowed, true)
  assert.equal(bucket.check(0).allowed, true)
  assert.equal(bucket.check(0).allowed, false)

  // enough time for the bucket to refill several times over; should still
  // cap at capacity rather than accumulate unbounded credit
  const afterLongWait = bucket.check(1_000_000)
  assert.equal(afterLongWait.allowed, true)
  assert.equal(afterLongWait.tokensRemaining, 1)
  assert.equal(bucket.check(1_000_000).allowed, true)
  assert.equal(bucket.check(1_000_000).allowed, false)
})

test('rejects an out-of-order timestamp', () => {
  const bucket = new TokenBucket({ capacity: 1, refillRatePerMs: 0.001 })
  bucket.check(1000)
  assert.throws(() => bucket.check(500), /before the previous event/)
})

test('retryAfterMs reflects the time until the next token is available', () => {
  const bucket = new TokenBucket({ capacity: 1, refillRatePerMs: 0.01 }) // 1 token / 100ms
  bucket.check(0)
  const denied = bucket.check(0)
  assert.equal(denied.allowed, false)
  assert.equal(denied.retryAfterMs, 100)
})
