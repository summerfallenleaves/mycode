/**
 * @fileoverview Token bucket rate limiter for tool calls
 * @module @my-agent/core/safety/limiter
 */

export class RateLimiter {
  private tokens: number
  private lastRefill: number

  constructor(
    private readonly maxTokens: number,
    private readonly refillRate: number,
    private readonly refillIntervalMs: number = 1000,
  ) {
    this.tokens = maxTokens
    this.lastRefill = Date.now()
  }

  tryConsume(): boolean {
    this.refill()
    if (this.tokens < 1) return false
    this.tokens -= 1
    return true
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    const add = Math.floor(elapsed / this.refillIntervalMs) * this.refillRate
    this.tokens = Math.min(this.maxTokens, this.tokens + add)
    this.lastRefill = now
  }
}
