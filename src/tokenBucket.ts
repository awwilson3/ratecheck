// A token bucket driven by explicit event timestamps instead of the system
// clock. That's what makes it useful for replaying a log after the fact
// rather than only rate-limiting live traffic.

export interface TokenBucketOptions {
  capacity: number
  refillRatePerMs: number
}

export interface CheckResult {
  allowed: boolean
  tokensRemaining: number
  retryAfterMs: number
}

export class TokenBucket {
  private tokens: number
  private lastSeenMs: number | null = null

  constructor(private readonly options: TokenBucketOptions) {
    this.tokens = options.capacity
  }

  // atMs must be non-decreasing across calls; this bucket has no notion of
  // "now" of its own, so out-of-order input is a caller error.
  check(atMs: number): CheckResult {
    if (this.lastSeenMs === null) {
      this.lastSeenMs = atMs
    } else if (atMs < this.lastSeenMs) {
      throw new Error(`timestamp ${atMs} is before the previous event ${this.lastSeenMs}`)
    } else {
      const elapsedMs = atMs - this.lastSeenMs
      this.tokens = Math.min(this.options.capacity, this.tokens + elapsedMs * this.options.refillRatePerMs)
      this.lastSeenMs = atMs
    }

    if (this.tokens >= 1) {
      this.tokens -= 1
      return { allowed: true, tokensRemaining: this.tokens, retryAfterMs: 0 }
    }

    const tokensNeeded = 1 - this.tokens
    const retryAfterMs = Math.ceil(tokensNeeded / this.options.refillRatePerMs)
    return { allowed: false, tokensRemaining: this.tokens, retryAfterMs }
  }
}
