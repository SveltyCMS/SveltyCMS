/**
 * @file src/services/background/background-supervisor.ts
 * @description Supervisor for the SveltyCMS background worker child process.
 * Decouples heavy pollers from the API server process, monitors health via heartbeats,
 * and automatically restarts the child worker upon unexpected exits.
 *
 * Features:
 * - Child process lifecycle management (fork, supervision, graceful shutdown)
 * - Automatic exponential backoff restart on unexpected termination
 * - IPC heartbeat tracking for health probes and system state monitoring
 * - Configurable via SVELTY_BACKGROUND_MODE ("child" | "inprocess" | "disabled")
 */

import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { logger } from "@utils/logger";

export interface SupervisorStatus {
  mode: "child" | "inprocess" | "disabled";
  running: boolean;
  workerPid: number | null;
  lastHeartbeat: number | null;
  workerStatus: "starting" | "healthy" | "degraded" | "stopping" | "offline";
  restarts: number;
}

export class BackgroundSupervisor {
  private child: ChildProcess | null = null;
  private isShuttingDown = false;
  private restartCount = 0;
  private lastHeartbeat: number | null = null;
  private workerStatus: "starting" | "healthy" | "degraded" | "stopping" | "offline" = "offline";
  private restartTimeout: NodeJS.Timeout | null = null;
  private backoffMs = 1_000;
  private readonly maxBackoffMs = 30_000;

  constructor() {}

  /**
   * Determine whether background worker should run as a child process.
   */
  public getMode(): "child" | "inprocess" | "disabled" {
    const envMode = (process.env.SVELTY_BACKGROUND_MODE || "").toLowerCase().trim();
    if (envMode === "disabled" || envMode === "off" || envMode === "0") {
      return "disabled";
    }
    if (envMode === "inprocess") {
      return "inprocess";
    }
    return "child";
  }

  /**
   * Start the background worker process under supervisor management.
   */
  public start(): boolean {
    const mode = this.getMode();
    if (mode === "disabled") {
      logger.info("[Supervisor] Background services disabled via SVELTY_BACKGROUND_MODE");
      this.workerStatus = "offline";
      return false;
    }

    if (mode === "inprocess") {
      logger.info("[Supervisor] Background services configured for in-process execution");
      return false;
    }

    if (this.child && !this.child.killed) {
      logger.debug("[Supervisor] Background worker is already running");
      return true;
    }

    this.isShuttingDown = false;
    this.spawnWorker();
    return true;
  }

  /**
   * Resolve target worker script path (build bundle vs source).
   */
  private resolveWorkerScript(): { scriptPath: string; execArgv: string[] } {
    const cwd = process.cwd();
    const buildWorker = path.resolve(cwd, "build/background-worker.js");
    if (fs.existsSync(buildWorker)) {
      return { scriptPath: buildWorker, execArgv: [] };
    }

    const srcWorker = path.resolve(cwd, "src/services/background/background-entry.ts");
    // If running under Bun, Bun directly executes TypeScript
    if (typeof Bun !== "undefined") {
      return { scriptPath: srcWorker, execArgv: [] };
    }

    // Node: If tsx is present or loader available
    return {
      scriptPath: srcWorker,
      execArgv: process.execArgv.includes("--import") ? process.execArgv : [],
    };
  }

  /**
   * Spawn the background child process with IPC and lifecycle monitoring.
   */
  private spawnWorker(): void {
    const { scriptPath, execArgv } = this.resolveWorkerScript();

    logger.info(`[Supervisor] Spawning background worker: ${scriptPath}`);
    this.workerStatus = "starting";

    try {
      const child = fork(scriptPath, [], {
        cwd: process.cwd(),
        execArgv,
        env: {
          ...process.env,
          SVELTY_IS_BACKGROUND_WORKER: "true",
          SVELTY_BACKGROUND_MODE: "child",
        },
        stdio: ["inherit", "inherit", "inherit", "ipc"],
      });

      this.child = child;
      const pid = child.pid ?? null;
      logger.info(`[Supervisor] Background worker child process spawned with PID ${pid}`);

      child.on("message", (msg: unknown) => {
        if (typeof msg === "object" && msg !== null && "type" in msg) {
          const payload = msg as { type: string; status?: string; timestamp?: number };
          if (payload.type === "heartbeat") {
            this.lastHeartbeat = payload.timestamp || Date.now();
            if (payload.status) {
              this.workerStatus = payload.status as typeof this.workerStatus;
            }
          }
        }
      });

      child.on("error", (err) => {
        logger.error("[Supervisor] Background worker process error:", err);
      });

      child.on("exit", (code, signal) => {
        const wasExpected = this.isShuttingDown;
        this.child = null;
        this.workerStatus = "offline";

        if (wasExpected) {
          logger.info(
            `[Supervisor] Background worker exited cleanly (code: ${code}, signal: ${signal})`,
          );
          return;
        }

        this.restartCount++;
        logger.warn(
          `[Supervisor] Background worker exited unexpectedly (code: ${code}, signal: ${signal}). Restarts: ${this.restartCount}. Next attempt in ${this.backoffMs}ms...`,
        );

        this.scheduleRestart();
      });
    } catch (err) {
      logger.error("[Supervisor] Failed to spawn background worker process:", err);
      this.scheduleRestart();
    }
  }

  /**
   * Schedule restart with exponential backoff.
   */
  private scheduleRestart(): void {
    if (this.isShuttingDown) return;

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
    }

    this.restartTimeout = setTimeout(() => {
      this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
      this.spawnWorker();
    }, this.backoffMs);

    if (typeof this.restartTimeout.unref === "function") {
      this.restartTimeout.unref();
    }
  }

  /**
   * Graceful termination of child process.
   */
  public async stop(): Promise<void> {
    this.isShuttingDown = true;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (!this.child) {
      this.workerStatus = "offline";
      return;
    }

    const child = this.child;
    logger.info("[Supervisor] Stopping background worker child process...");
    this.workerStatus = "stopping";

    return new Promise((resolve) => {
      let resolved = false;
      const finish = () => {
        if (!resolved) {
          resolved = true;
          this.child = null;
          this.workerStatus = "offline";
          resolve();
        }
      };

      const forceKillTimer = setTimeout(() => {
        try {
          if (child && !child.killed) {
            logger.warn("[Supervisor] Worker did not stop within 5s; sending SIGKILL");
            child.kill("SIGKILL");
          }
        } catch {}
        finish();
      }, 5_000);

      if (typeof forceKillTimer.unref === "function") {
        forceKillTimer.unref();
      }

      child.once("exit", () => {
        clearTimeout(forceKillTimer);
        finish();
      });

      // Try IPC shutdown command first
      try {
        if (child.connected) {
          child.send({ type: "shutdown" });
        } else {
          child.kill("SIGTERM");
        }
      } catch {
        child.kill("SIGTERM");
      }
    });
  }

  /**
   * Returns current status for health checks and observability.
   */
  public getStatus(): SupervisorStatus {
    return {
      mode: this.getMode(),
      running: this.child !== null && !this.child.killed,
      workerPid: this.child?.pid ?? null,
      lastHeartbeat: this.lastHeartbeat,
      workerStatus: this.workerStatus,
      restarts: this.restartCount,
    };
  }
}

// Global singleton
let supervisorInstance: BackgroundSupervisor | null = null;

export function getBackgroundSupervisor(): BackgroundSupervisor {
  if (!supervisorInstance) {
    supervisorInstance = new BackgroundSupervisor();
  }
  return supervisorInstance;
}

export function startBackgroundSupervisor(): BackgroundSupervisor {
  const supervisor = getBackgroundSupervisor();
  supervisor.start();
  return supervisor;
}
