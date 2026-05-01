import { logger } from '../../../shared/logger';

/**
 * AdaptiveThrottler — adjusts delay between requests based on success/failure.
 * Backs off on failures, speeds up when healthy.
 * SRS §5.4: Adaptive throttling with 1–8s jitter.
 */
export class AdaptiveThrottler {
  private baseDelay: number;
  private currentDelay: number;
  private minDelay: number;
  private maxDelay: number;
  private consecutiveFailures: number = 0;
  private consecutiveSuccesses: number = 0;

  constructor(options?: { baseDelay?: number; minDelay?: number; maxDelay?: number }) {
    this.baseDelay = options?.baseDelay ?? 2000;  // 2s
    this.minDelay = options?.minDelay ?? 1000;     // 1s
    this.maxDelay = options?.maxDelay ?? 8000;     // 8s
    this.currentDelay = this.baseDelay;
  }

  /**
   * Report a successful action — throttle may speed up.
   */
  reportSuccess(): void {
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;

    if (this.consecutiveSuccesses >= 5) {
      this.currentDelay = Math.max(this.minDelay, this.currentDelay * 0.8);
      this.consecutiveSuccesses = 0;
    }
  }

  /**
   * Report a failure — throttle backs off.
   */
  reportFailure(): void {
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.currentDelay = Math.min(this.maxDelay, this.currentDelay * 1.5);

    logger.warn({
      consecutiveFailures: this.consecutiveFailures,
      currentDelay: this.currentDelay,
    }, 'Throttler: backing off');
  }

  /**
   * Wait for the current throttle delay + random jitter.
   */
  async wait(): Promise<void> {
    // Add jitter: ±30% of current delay
    const jitter = this.currentDelay * 0.3 * (Math.random() * 2 - 1);
    const delay = Math.round(this.currentDelay + jitter);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Get current delay value (for logging).
   */
  getCurrentDelay(): number {
    return this.currentDelay;
  }

  /**
   * Check if throttler is in heavy backoff (too many failures).
   */
  isInBackoff(): boolean {
    return this.consecutiveFailures >= 3;
  }

  /**
   * Reset throttler to base state.
   */
  reset(): void {
    this.currentDelay = this.baseDelay;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
  }
}
