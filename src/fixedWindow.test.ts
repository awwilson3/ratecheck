import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FixedWindow } from './fixedWindow.js'

test('allows up to limit hits within a window, denies the rest', () => {
  const window = new FixedWindow({ limit: 2, windowMs: 1000 })
  assert.equal(window.check(0).allowed, true)
  assert.equal(window.check(500).allowed, true)
  assert.equal(window.check(999).allowed, false)
})

test('resets the counter once a new window starts', () => {
  const window = new FixedWindow({ limit: 1, windowMs: 1000 })
  assert.equal(window.check(0).allowed, true)
  assert.equal(window.check(500).allowed, false)
  assert.equal(window.check(1000).allowed, true)
})

test('windows are aligned to multiples of windowMs, not to the first event', () => {
  const window = new FixedWindow({ limit: 1, windowMs: 1000 })
  assert.equal(window.check(1500).allowed, true) // window [1000, 2000)
  assert.equal(window.check(1999).allowed, false)
  assert.equal(window.check(2000).allowed, true)
})

test('retryAfterMs points at the start of the next window', () => {
  const window = new FixedWindow({ limit: 1, windowMs: 1000 })
  window.check(0)
  const denied = window.check(200)
  assert.equal(denied.allowed, false)
  assert.equal(denied.retryAfterMs, 800)
})
