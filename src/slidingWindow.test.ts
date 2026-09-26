import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SlidingWindow } from './slidingWindow.js'

test('allows up to limit hits inside the window, denies the next', () => {
  const window = new SlidingWindow({ limit: 2, windowMs: 1000 })
  assert.equal(window.check(0).allowed, true)
  assert.equal(window.check(100).allowed, true)
  assert.equal(window.check(200).allowed, false)
})

test('a hit exactly windowMs old has expired', () => {
  const window = new SlidingWindow({ limit: 1, windowMs: 1000 })
  window.check(0)
  assert.equal(window.check(999).allowed, false)
  assert.equal(window.check(1000).allowed, true)
})

test('retryAfterMs is the time until the oldest hit exits the window', () => {
  const window = new SlidingWindow({ limit: 1, windowMs: 1000 })
  window.check(0)
  const denied = window.check(400)
  assert.equal(denied.allowed, false)
  assert.equal(denied.retryAfterMs, 600)
})
