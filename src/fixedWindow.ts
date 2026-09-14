// Fixed window counter: time is chopped into windowMs-wide slots aligned to
// the epoch, and each slot gets its own counter that resets when a new
// event lands in the next slot. Cheaper than a sliding window log, but a
// burst straddling a window boundary can let through up to 2x the limit.

export interface FixedWindowOptions {
  limit: number
  windowMs: number
}

export interface CheckResult {
  allowed: boolean
  retryAfterMs: number
}

export class FixedWindow {
  private windowStart: number | null = null
  private count = 0

  constructor(private readonly options: FixedWindowOptions) {}

  check(atMs: number): CheckResult {
    if (this.windowStart === null || atMs - this.windowStart >= this.options.windowMs) {
      this.windowStart = Math.floor(atMs / this.options.windowMs) * this.options.windowMs
      this.count = 0
    }

    if (this.count < this.options.limit) {
      this.count++
      return { allowed: true, retryAfterMs: 0 }
    }

    const retryAfterMs = this.windowStart + this.options.windowMs - atMs
    return { allowed: false, retryAfterMs }
  }
}
