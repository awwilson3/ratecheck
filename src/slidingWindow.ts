// Sliding window log: keeps the exact timestamp of every hit still inside
// the trailing window and counts against those, rather than a bucket of
// tokens. Unlike a fixed window it can't be gamed by bursting at a window
// boundary, at the cost of remembering up to `limit` timestamps per key.

export interface SlidingWindowOptions {
  limit: number
  windowMs: number
}

export interface CheckResult {
  allowed: boolean
  retryAfterMs: number
}

export class SlidingWindow {
  private readonly hits: number[] = []

  constructor(private readonly options: SlidingWindowOptions) {}

  check(atMs: number): CheckResult {
    const windowStart = atMs - this.options.windowMs
    while (this.hits.length > 0 && this.hits[0] <= windowStart) {
      this.hits.shift()
    }

    if (this.hits.length < this.options.limit) {
      this.hits.push(atMs)
      return { allowed: true, retryAfterMs: 0 }
    }

    const retryAfterMs = this.hits[0] - windowStart
    return { allowed: false, retryAfterMs }
  }
}
