import { delay } from '../../common'

export class RateLimiter {
  private lastRequestTime = 0
  private requestTimestamps: number[] = []

  async throttle(): Promise<void> {
    const now = Date.now()

    this.requestTimestamps = this.requestTimestamps.filter(t => now - t < 10000)

    if (this.requestTimestamps.length >= 5) {
      const oldest = this.requestTimestamps[0]
      const waitTime = 10000 - (now - oldest)
      if (waitTime > 0) {
        await delay(waitTime)
      }
    }

    const timeSinceLast = now - this.lastRequestTime
    if (timeSinceLast < 1000) {
      await delay(1000 - timeSinceLast)
    }

    this.lastRequestTime = Date.now()
    this.requestTimestamps.push(this.lastRequestTime)
  }

  reset(): void {
    this.lastRequestTime = 0
    this.requestTimestamps = []
  }
}
