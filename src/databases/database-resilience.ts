/**
 * @file src\databases\database-resilience.ts
 * @description Database resilience and self-healing system
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Self-healing database reconnection
 * - Connection pool diagnostics
 * - Admin notifications on failures
 * - Comprehensive error tracking
 */

import { getSystemState, updateServiceHealth } from "@src/stores/system/state.svelte.ts";
import { logger } from "@utils/logger";
import { sendMail } from "@utils/email.server";
import type { DatabaseError } from "./db-interface";

// Type definitions
export interface RetryConfig {
  backoffMultiplier: number;
  initialDelayMs: number;
  jitterMs: number;
  maxAttempts: number;
  maxDelayMs: number;
}

export interface ConnectionPoolDiagnostics {
  activeConnections: number;
  avgConnectionTime: number;
  healthStatus: "healthy" | "degraded" | "critical";
  idleConnections: number;
  poolUtilization: number;
  recommendations: string[];
  totalConnections: number;
  waitingRequests: number;
}

export interface ResilienceMetrics {
  averageRecoveryTime: number;
  circuitBreakerTransitions: number;
  circuitState: "CLOSED" | "OPEN" | "HALF_OPEN";
  connectionUptime: number;
  failedRetries: number;
  failureHistory: Array<{
    timestamp: number;
    error: string;
    recovered: boolean;
    recoveryTime?: number;
  }>;
  lastFailureTime?: number;
  lastRecoveryTime?: number;
  successfulReconnections: number;
  successfulRetries: number;
  totalReconnections: number;
  totalRetries: number;
}

// Default retry configuration
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelayMs: 1000, // 1 second
  maxDelayMs: 32_000, // 32 seconds
  backoffMultiplier: 2,
  jitterMs: 500,
};

export interface CircuitBreakerConfig {
  cooldownMs: number;
  failureThreshold: number;
  halfOpenMaxRequests: number;
}

const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 60_000, // 1 minute
  halfOpenMaxRequests: 1,
};

export interface CircuitState {
  consecutiveFailures: number;
  lastFailureTimestamp: number;
  halfOpenRequests: number;
  circuitState: "CLOSED" | "OPEN" | "HALF_OPEN";
}

/**
 * Database Resilience Manager
 * Handles automatic retries, reconnection, and health monitoring
 */
export class DatabaseResilience {
  private readonly metrics: ResilienceMetrics = {
    totalRetries: 0,
    successfulRetries: 0,
    failedRetries: 0,
    totalReconnections: 0,
    successfulReconnections: 0,
    averageRecoveryTime: 0,
    connectionUptime: 0,
    failureHistory: [],
    circuitState: "CLOSED",
    circuitBreakerTransitions: 0,
  };

  private readonly retryConfig: RetryConfig;
  private readonly circuitConfig: CircuitBreakerConfig;

  private circuitStates = new Map<string, CircuitState>();

  private getCircuitState(name: string) {
    if (!this.circuitStates.has(name)) {
      this.circuitStates.set(name, {
        consecutiveFailures: 0,
        lastFailureTimestamp: 0,
        halfOpenRequests: 0,
        circuitState: "CLOSED",
      });
    }
    return this.circuitStates.get(name)!;
  }

  private isReconnecting = false;
  private connectionEstablishedAt?: number;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(config?: Partial<RetryConfig & CircuitBreakerConfig>) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    this.circuitConfig = { ...DEFAULT_CIRCUIT_CONFIG, ...config };
    this.startHealthMonitoring();
  }

  // Execute operation with automatic retry, exponential backoff, and circuit breaker
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    onRetry?: (attempt: number, error: Error) => void,
  ): Promise<T> {
    const circuit = this.getCircuitState(operationName);

    // 1. Check Circuit Breaker State
    if (circuit.circuitState === "OPEN") {
      const timeSinceFailure = Date.now() - circuit.lastFailureTimestamp;
      if (timeSinceFailure < this.circuitConfig.cooldownMs) {
        logger.debug(`Circuit breaker is OPEN for ${operationName} - failing fast`);
        throw new Error(
          `Circuit breaker is OPEN for '${operationName}' due to consecutive failures`,
        );
      }
      // Attempt recovery
      this.transitionTo(operationName, "HALF_OPEN");
    }

    if (circuit.circuitState === "HALF_OPEN") {
      if (circuit.halfOpenRequests >= this.circuitConfig.halfOpenMaxRequests) {
        throw new Error(
          `Circuit breaker is HALF_OPEN for '${operationName}' - too many test requests`,
        );
      }
      circuit.halfOpenRequests++;
    }

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        const result = await operation();

        // Success: Reset Circuit Breaker
        this.onSuccess(operationName);

        if (attempt > 1) {
          // Operation succeeded after retry
          this.metrics.successfulRetries++;
          logger.info(`✓ Operation '${operationName}' succeeded after ${attempt} attempt(s)`);
        }

        return result;
      } catch (error: any) {
        lastError = error as Error;
        this.metrics.totalRetries++;

        // 🚀 FAIL FAST for configuration errors that won't change with a retry
        const isConfigError =
          lastError.message?.includes("DB_TYPE_MISSING") ||
          lastError.message?.includes("UNSUPPORTED_DB_TYPE");

        if (isConfigError) {
          this.onFailure(operationName, lastError);
          throw lastError;
        }

        if (attempt < this.retryConfig.maxAttempts) {
          const delay = this.calculateBackoffDelay(attempt);

          logger.warn(
            `Operation '${operationName}' failed (attempt ${attempt}/${this.retryConfig.maxAttempts}), retrying in ${delay}ms...`,
            {
              error: lastError.message,
            },
          );

          // Call retry callback if provided
          if (onRetry) {
            onRetry(attempt, lastError);
          }

          await this.sleep(delay);
        } else {
          // Final failure: Track for Circuit Breaker
          this.onFailure(operationName, lastError);
          this.metrics.failedRetries++;
          logger.error(
            `Operation '${operationName}' failed after ${this.retryConfig.maxAttempts} attempts`,
            {
              error: lastError.message,
            },
          );
        }
      }
    }

    throw lastError || new Error(`Operation '${operationName}' failed after all retry attempts`);
  }

  private onSuccess(operationName: string) {
    const circuit = this.getCircuitState(operationName);
    circuit.consecutiveFailures = 0;
    if (circuit.circuitState !== "CLOSED") {
      this.transitionTo(operationName, "CLOSED");
    }
    circuit.halfOpenRequests = 0;
  }

  private onFailure(operationName: string, _error: Error) {
    const circuit = this.getCircuitState(operationName);
    circuit.consecutiveFailures++;
    circuit.lastFailureTimestamp = Date.now();
    this.metrics.lastFailureTime = circuit.lastFailureTimestamp;

    if (circuit.circuitState === "HALF_OPEN") {
      this.transitionTo(operationName, "OPEN");
    } else if (
      circuit.circuitState === "CLOSED" &&
      circuit.consecutiveFailures >= this.circuitConfig.failureThreshold
    ) {
      this.transitionTo(operationName, "OPEN");
    }
  }

  private transitionTo(operationName: string, state: "CLOSED" | "OPEN" | "HALF_OPEN") {
    const circuit = this.getCircuitState(operationName);
    const oldState = circuit.circuitState;
    if (oldState === state) return;

    circuit.circuitState = state;
    this.metrics.circuitState = state; // Keep global metric tracking the latest state change
    this.metrics.circuitBreakerTransitions++;
    circuit.halfOpenRequests = 0;

    logger.warn(`Circuit breaker state transition for ${operationName}: ${oldState} -> ${state}`, {
      consecutiveFailures: circuit.consecutiveFailures,
    });

    if (state === "OPEN") {
      updateServiceHealth(
        "database",
        "unhealthy",
        `Circuit breaker tripped for ${operationName} after ${circuit.consecutiveFailures} failures`,
      );
    } else if (state === "CLOSED") {
      updateServiceHealth("database", "healthy", "Circuit breaker reset - database recovered");
      // 🚀 ADAPTIVE: Shrink cooldown window if recovery was rapid
      if (this.metrics.lastRecoveryTime && circuit.lastFailureTimestamp) {
        const recoverySpeed = this.metrics.lastRecoveryTime - circuit.lastFailureTimestamp;
        if (recoverySpeed < 5000) {
          logger.info("[Resilience] Rapid recovery detected. Shrinking cooldown...");
          this.circuitConfig.cooldownMs = Math.max(10000, this.circuitConfig.cooldownMs * 0.8);
        }
      }
    }
  }

  // Attempt to reconnect to database with self-healing
  async attemptReconnection(
    reconnectFn: () => Promise<void>,
    notifyAdmins: (error: DatabaseError) => Promise<void>,
  ): Promise<boolean> {
    if (this.isReconnecting) {
      logger.debug("Reconnection already in progress, skipping...");
      return false;
    }

    this.isReconnecting = true;
    this.metrics.totalReconnections++;

    const startTime = Date.now();
    const failureRecord = {
      timestamp: startTime,
      error: "Connection lost",
      recovered: false,
      recoveryTime: undefined as number | undefined,
    };

    try {
      updateServiceHealth("database", "initializing", "Attempting database reconnection...");

      await this.executeWithRetry(reconnectFn, "Database Reconnection", (attempt, error) => {
        updateServiceHealth(
          "database",
          "unhealthy",
          `Reconnection attempt ${attempt}/${this.retryConfig.maxAttempts} failed: ${error.message}`,
        );
      });

      const recoveryTime = Date.now() - startTime;
      failureRecord.recovered = true;
      failureRecord.recoveryTime = recoveryTime;

      this.metrics.successfulReconnections++;
      this.metrics.lastRecoveryTime = Date.now();
      this.updateAverageRecoveryTime(recoveryTime);
      this.connectionEstablishedAt = Date.now();

      updateServiceHealth("database", "healthy", "Database reconnected successfully");
      logger.info(`✓ Database reconnected successfully in ${recoveryTime}ms`);

      return true;
    } catch (reconnectError) {
      const dbError: DatabaseError = {
        code: "RECONNECTION_FAILED",
        message: reconnectError instanceof Error ? reconnectError.message : "Unknown error",
        details: { attempts: this.retryConfig.maxAttempts },
      };

      this.metrics.lastFailureTime = Date.now();
      updateServiceHealth("database", "unhealthy", "Database reconnection failed", dbError.message);

      // Notify admins of persistent failure
      await notifyAdmins(dbError);

      logger.fatal("Database reconnection failed after all attempts", {
        error: dbError,
      });

      return false;
    } finally {
      this.metrics.failureHistory.push(failureRecord);
      // Keep only last 50 failure records
      if (this.metrics.failureHistory.length > 50) {
        this.metrics.failureHistory = this.metrics.failureHistory.slice(-50);
      }
      this.isReconnecting = false;
    }
  }

  /**
   * Get connection pool diagnostics
   * Fetches real-time statistics from the database adapter
   */
  async getPoolDiagnostics(): Promise<ConnectionPoolDiagnostics> {
    try {
      // Get the current database adapter
      const { dbAdapter } = await import("./db");

      if (!dbAdapter) {
        throw new Error("Database adapter not available");
      }

      // 1. Try to get pool stats from monitoring module
      let poolStats: any = null;
      if (typeof dbAdapter.monitoring?.getConnectionPoolStats === "function") {
        const result = await dbAdapter.monitoring.getConnectionPoolStats();
        if (result.success) {
          poolStats = result.data;
        }
      }

      // 2. Try to get diagnostics from the adapter itself (BaseAdapter implementation)
      let baseDiagnostics: any = null;
      if (typeof dbAdapter.getPoolDiagnostics === "function") {
        const res = await dbAdapter.getPoolDiagnostics();
        if (res.success) {
          baseDiagnostics = res.data;
        }
      }

      // 3. Merge and normalize results
      const finalStats = {
        total: poolStats?.total ?? 0,
        active: (poolStats?.active ?? baseDiagnostics?.metrics?.queryCount > 0) ? 1 : 0,
        idle: poolStats?.idle ?? 0,
        waiting: poolStats?.waiting ?? 0,
        avgConnectionTime:
          poolStats?.avgConnectionTime ?? baseDiagnostics?.metrics?.lastLatency ?? 0,
      };

      const poolUtilization =
        finalStats.total > 0 ? (finalStats.active / finalStats.total) * 100 : 0;
      const healthStatus = this.determinePoolHealth(poolUtilization, finalStats.waiting);
      const recommendations = this.generatePoolRecommendations(finalStats, poolUtilization);

      return {
        totalConnections: finalStats.total,
        activeConnections: finalStats.active,
        idleConnections: finalStats.idle,
        waitingRequests: finalStats.waiting,
        poolUtilization,
        avgConnectionTime: finalStats.avgConnectionTime,
        healthStatus,
        recommendations,
      };
    } catch (error) {
      logger.error("Failed to get pool diagnostics", { error });

      // Return default diagnostics on error
      return {
        totalConnections: 0,
        activeConnections: 0,
        idleConnections: 0,
        waitingRequests: 0,
        poolUtilization: 0,
        avgConnectionTime: 0,
        healthStatus: "critical",
        recommendations: [
          "Unable to retrieve pool statistics - database may be disconnected or adapter does not support diagnostics",
        ],
      };
    }
  }

  // Get resilience metrics
  getMetrics(): ResilienceMetrics {
    const uptime = this.connectionEstablishedAt ? Date.now() - this.connectionEstablishedAt : 0;

    return {
      ...this.metrics,
      connectionUptime: uptime,
    };
  }

  // Check if database connection is healthy
  async healthCheck(pingFn: () => Promise<number>): Promise<{
    healthy: boolean;
    latency: number;
    message: string;
  }> {
    try {
      const latency = await pingFn();

      const healthy = latency < 1000; // Consider healthy if latency < 1s
      const message = healthy
        ? `Database healthy (latency: ${latency}ms)`
        : `Database degraded (latency: ${latency}ms)`;

      return { healthy, latency, message };
    } catch (error) {
      return {
        healthy: false,
        latency: -1,
        message: error instanceof Error ? error.message : "Health check failed",
      };
    }
  }

  // Start continuous health monitoring
  private startHealthMonitoring(): void {
    // Monitor every 30 seconds
    this.monitoringInterval = setInterval(() => {
      this.updateConnectionUptime();
    }, 30_000);
  }

  // Stop health monitoring (cleanup)
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
  }

  // Calculate exponential backoff delay with jitter
  private calculateBackoffDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      this.retryConfig.initialDelayMs * this.retryConfig.backoffMultiplier ** (attempt - 1),
      this.retryConfig.maxDelayMs,
    );

    // Add random jitter to prevent thundering herd
    const jitter = Math.random() * this.retryConfig.jitterMs;

    return Math.floor(exponentialDelay + jitter);
  }

  // Sleep utility
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Update average recovery time with exponential moving average
  private updateAverageRecoveryTime(newRecoveryTime: number): void {
    if (this.metrics.averageRecoveryTime === 0) {
      this.metrics.averageRecoveryTime = newRecoveryTime;
    } else {
      // EMA with alpha = 0.3
      this.metrics.averageRecoveryTime =
        0.3 * newRecoveryTime + 0.7 * this.metrics.averageRecoveryTime;
    }
  }

  // Update connection uptime
  private updateConnectionUptime(): void {
    if (this.connectionEstablishedAt) {
      this.metrics.connectionUptime = Date.now() - this.connectionEstablishedAt;
    }
  }

  // Determine pool health status based on metrics
  private determinePoolHealth(
    utilization: number,
    waiting: number,
  ): "healthy" | "degraded" | "critical" {
    if (waiting > 10 || utilization > 90) {
      return "critical";
    }
    if (waiting > 5 || utilization > 75) {
      return "degraded";
    }
    return "healthy";
  }

  // Generate recommendations based on pool stats
  private generatePoolRecommendations(
    stats: { total: number; active: number; idle: number; waiting: number },
    utilization: number,
  ): string[] {
    const recommendations: string[] = [];

    if (utilization > 90) {
      recommendations.push(
        "Pool utilization is very high (>90%). Consider increasing maxPoolSize.",
      );
    }

    if (stats.waiting > 10) {
      recommendations.push(
        `${stats.waiting} requests are waiting for connections. Increase pool size or optimize queries.`,
      );
    }

    if (stats.idle > stats.total * 0.8) {
      recommendations.push(
        "Pool has many idle connections. Consider reducing minPoolSize to save resources.",
      );
    }

    if (stats.total < 10) {
      recommendations.push("Pool size is very small. Consider increasing for better concurrency.");
    }

    // Enterprise scaling: external pooler recommendation (PgBouncer for PG, ProxySQL for MariaDB)
    if (stats.waiting > 5 || utilization > 70) {
      recommendations.push(
        "High pool pressure or waiting requests. For Postgres at scale (or managed DBs with connection limits), deploy PgBouncer as optional proxy layer (transaction mode). MariaDB equivalent: ProxySQL. Full guidance + examples: docs/guides/deployment/scaling-layers.mdx. Redis (optional) + reverse proxy are complementary layers.",
      );
    }

    if (recommendations.length === 0) {
      recommendations.push("Connection pool is healthy and well-configured.");
    }

    return recommendations;
  }
}

// Send email notification to administrators
export async function notifyAdminsOfDatabaseFailure(
  error: DatabaseError,
  metrics: ResilienceMetrics,
): Promise<void> {
  try {
    // Check if SMTP is configured
    const { getPrivateSetting } = await import("../services/core/settings-service");
    const smtpHost = await getPrivateSetting("SMTP_HOST" as any);

    if (!smtpHost) {
      logger.debug("SMTP not configured, skipping admin notification email");
      return;
    }

    // Get admin users
    // Use relative path to avoid alias resolution issues
    const { auth } = await import("./db");
    if (!auth) {
      logger.warn("Auth service not available, cannot fetch admin users for notification");
      return;
    }

    const allUsers = await auth.getAllUsers();
    const adminUsers = allUsers.filter((user: any) => user.role === "admin");
    if (!adminUsers || adminUsers.length === 0) {
      logger.warn("No admin users found to notify");
      return;
    }

    // Prepare email data
    const { publicEnv } = await import("../stores/global-settings.svelte");
    const systemState = getSystemState();

    const emailData = {
      subject: `🚨 Critical: Database Connection Failure - ${publicEnv.SITE_NAME || "SveltyCMS"}`,
      recipientEmail: adminUsers.map((u: any) => u.email).filter(Boolean),
      templateName: "databaseFailure",
      props: {
        sitename: publicEnv.SITE_NAME || "SveltyCMS",
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        metrics: {
          totalReconnections: metrics.totalReconnections,
          successfulReconnections: metrics.successfulReconnections,
          failedRetries: metrics.failedRetries,
          averageRecoveryTime: Math.round(metrics.averageRecoveryTime),
          lastFailureTime: metrics.lastFailureTime
            ? new Date(metrics.lastFailureTime).toISOString()
            : "Unknown",
        },
        systemState: {
          overall: systemState.overallState,
          databaseStatus: systemState.services.database.status,
          databaseMessage: systemState.services.database.message,
        },
        timestamp: new Date().toISOString(),
        hostLink: publicEnv.HOST_PROD || "http://localhost:5173",
      },
    };

    // Send email directly via service
    const mailResult = await sendMail({
      recipientEmail: (emailData.recipientEmail as string[]).join(", "),
      subject: emailData.subject,
      templateName: emailData.templateName,
      props: emailData.props,
      languageTag: "en", // Default system language for alerts
    });

    if (mailResult.success) {
      logger.info(`Database failure notification sent directly to ${adminUsers.length} admin(s)`);
    } else {
      logger.error(`Failed to send database failure notification: ${mailResult.message}`);
    }
  } catch (notificationError) {
    logger.error("Error sending admin notification", {
      error: notificationError,
    });
    // Don't throw - notification failure shouldn't block other operations
  }
}

// Global resilience instance (singleton)
let resilienceInstance: DatabaseResilience | null = null;

export function getDatabaseResilience(
  config?: Partial<RetryConfig & CircuitBreakerConfig>,
): DatabaseResilience {
  if (!resilienceInstance) {
    resilienceInstance = new DatabaseResilience(config);
  }
  return resilienceInstance;
}

export function resetDatabaseResilience(): void {
  if (resilienceInstance) {
    resilienceInstance.stop();
    resilienceInstance = null;
  }
}
