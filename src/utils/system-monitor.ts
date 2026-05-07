/**
 * @file src/utils/system-monitor.ts
 * @description
 * High-performance system monitoring utility for real-time hardware health tracking.
 * Provides normalized pressure scores (0.0 to 1.0) based on CPU load and Event Loop lag.
 */

import os from "node:os";

export interface SystemMetrics {
  cpuLoad: number;
  eventLoopLag: number;
  memoryUsage: number;
  pressureScore: number;
  status: "idle" | "nominal" | "high" | "critical";
}

class SystemMonitor {
  private static instance: SystemMonitor;
  private currentLag = 0;
  private lastCheck = Date.now();
  private readonly SAMPLE_INTERVAL = 2000; // 2 seconds
  private readonly LAG_THRESHOLD_MS = 100; // 100ms lag is considered high stress
  private metrics: SystemMetrics = {
    cpuLoad: 0,
    eventLoopLag: 0,
    memoryUsage: 0,
    pressureScore: 0,
    status: "idle",
  };

  private constructor() {
    this.startMonitoring();
  }

  public static getInstance(): SystemMonitor {
    if (!SystemMonitor.instance) {
      SystemMonitor.instance = new SystemMonitor();
    }
    return SystemMonitor.instance;
  }

  /**
   * Starts the internal monitoring loop.
   * Measures Event Loop lag by calculating the difference between expected and actual execution time.
   */
  private startMonitoring() {
    const check = () => {
      const now = Date.now();
      const delta = now - this.lastCheck - this.SAMPLE_INTERVAL;
      this.currentLag = Math.max(0, delta);
      this.lastCheck = now;

      this.updateMetrics();
      setTimeout(check, this.SAMPLE_INTERVAL).unref();
    };

    setTimeout(check, this.SAMPLE_INTERVAL).unref();
  }

  /**
   * Updates internal metrics based on OS and sampled data.
   */
  private updateMetrics() {
    const cpus = os.cpus().length || 1;
    const loadAvg = os.loadavg()[0]; // 1-minute load average
    const cpuLoad = Math.min(1, loadAvg / cpus);

    const lagScore = Math.min(1, this.currentLag / this.LAG_THRESHOLD_MS);
    const mem = process.memoryUsage();
    const memoryScore = Math.min(1, mem.heapUsed / mem.heapTotal);

    // Weighted Pressure Score (Lag is the most critical for responsiveness)
    const pressureScore = cpuLoad * 0.3 + lagScore * 0.6 + memoryScore * 0.1;

    let status: SystemMetrics["status"] = "nominal";
    if (pressureScore > 0.8 || lagScore > 0.8) status = "critical";
    else if (pressureScore > 0.5) status = "high";
    else if (pressureScore < 0.1) status = "idle";

    this.metrics = {
      cpuLoad,
      eventLoopLag: this.currentLag,
      memoryUsage: mem.heapUsed,
      pressureScore,
      status,
    };
  }

  /**
   * Returns the current system metrics.
   */
  public getMetrics(): SystemMetrics {
    return this.metrics;
  }

  /**
   * Returns a cost multiplier for rate limits based on system pressure.
   * 1.0 = Nominal, 2.0 = Critical (Requests cost double), 0.8 = Idle (Requests are cheaper)
   */
  public getAdaptiveCostMultiplier(): number {
    const score = this.metrics.pressureScore;
    const metrics = this.metrics;

    // Critical stress: Heavy throttle
    if (score > 0.8 || metrics.eventLoopLag > 80) return 2.0;

    // High stress: Moderate throttle
    if (score > 0.5 || metrics.eventLoopLag > 40) return 1.5;

    // Idle: Reward with more capacity
    if (score < 0.1 && metrics.eventLoopLag < 5) return 0.8;

    return 1.0;
  }
}

export const systemMonitor = SystemMonitor.getInstance();
