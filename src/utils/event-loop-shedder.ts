/**
 * @file src/utils/event-loop-shedder.ts
 * @description Event-loop-lag adaptive load shedding for low-priority traffic under saturation.
 *
 * Features:
 * - Samples event-loop timer drift at a configurable interval (default: 100ms)
 * - Exponentially smoothed lag measurement to avoid single-spike flapping
 * - Sheds `low` priority requests with `503 Service Unavailable` + `Retry-After` above threshold
 * - Preserves `high` (admin writes, auth) and `normal` traffic
 */

export type RequestPriority = "high" | "normal" | "low";

export interface EventLoopShedderOptions {
  /** Sampling interval in ms (default: 100). */
  sampleIntervalMs?: number;
  /** Lag threshold in ms above which low-priority traffic is shed (default: 50). */
  lagThresholdMs?: number;
  /** Retry-After header value in seconds when shedding (default: 2). */
  retryAfterSeconds?: number;
}

export class EventLoopShedder {
  private readonly sampleIntervalMs: number;
  private readonly lagThresholdMs: number;
  private readonly retryAfterSeconds: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private smoothedLagMs = 0;

  constructor(options: EventLoopShedderOptions = {}) {
    this.sampleIntervalMs = options.sampleIntervalMs ?? 100;
    this.lagThresholdMs = options.lagThresholdMs ?? 50;
    this.retryAfterSeconds = options.retryAfterSeconds ?? 2;
  }

  /** Current exponentially smoothed event-loop lag in milliseconds. */
  get lagMs(): number {
    return this.smoothedLagMs;
  }

  /** Fast O(1) check so hot-path handlers skip header inspection when healthy. */
  get isOverloaded(): boolean {
    return this.smoothedLagMs >= this.lagThresholdMs;
  }

  /** Starts periodic event-loop lag sampling. */
  start(): void {
    if (this.timer) return;
    this.lastTick = performance.now();
    this.timer = setInterval(() => {
      const now = performance.now();
      const drift = Math.max(0, now - this.lastTick - this.sampleIntervalMs);
      this.lastTick = now;
      this.smoothedLagMs = this.smoothedLagMs * 0.7 + drift * 0.3;
    }, this.sampleIntervalMs);
    if (typeof this.timer === "object" && "unref" in this.timer) {
      this.timer.unref();
    }
  }

  /** Stops periodic event-loop lag sampling. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Allows deterministic lag injection in tests. */
  recordLagSample(lagMs: number): void {
    this.smoothedLagMs = Math.max(0, lagMs);
  }

  /** Returns true if a request of the given priority should be shed. */
  shouldShed(priority: RequestPriority): boolean {
    if (priority !== "low") return false;
    return this.smoothedLagMs >= this.lagThresholdMs;
  }

  /** Builds a standard `503 Service Unavailable` response with `Retry-After`. */
  createShedResponse(): Response {
    return new Response(
      JSON.stringify({
        error: "Service Unavailable",
        message: "Server under high load; please retry shortly.",
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(this.retryAfterSeconds),
        },
      },
    );
  }
}
