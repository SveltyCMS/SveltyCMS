/**
 * @file src/server/wal-shutdown.ts
 * @description Final SQLite WAL truncation on the shutdown path.
 *
 * The periodic WAL housekeeping (`startWalHousekeeping`) checkpoints with
 * `PASSIVE`: frames are copied back into the database, but the WAL file itself
 * keeps its high-water mark. After a long uptime that leaves a multi-hundred-MB
 * `-wal` next to a small database, which the next boot has to re-read.
 * `TRUNCATE` resets the file, so a stopped container leaves no WAL behind.
 *
 * The adapter already supports the mode (`sqlite/adapter-core.ts`
 * `runWalCheckpoint(mode)`); only the shutdown path never asked for it. Kept as a
 * small pure function so the call site's mode choice is testable without a
 * database.
 */

/** The slice of the SQLite adapter this module needs. */
export interface WalCheckpointAdapter {
  runWalCheckpoint?: (mode: "PASSIVE" | "FULL" | "TRUNCATE") => {
    success: boolean;
    frames: number;
    busy: boolean;
  };
}

export interface WalShutdownLogger {
  info: (message: string) => void;
  warn: (message: string) => void;
}

export type WalTruncationOutcome = "skipped" | "truncated" | "busy" | "failed";

/**
 * Truncates the WAL before the database layer closes.
 *
 * Never throws: shutdown must not fail because a checkpoint is busy, and every
 * other engine has no `runWalCheckpoint` at all (structural check, no import).
 */
export function truncateWalBeforeShutdown(
  adapter: WalCheckpointAdapter | null | undefined,
  logger: WalShutdownLogger,
): WalTruncationOutcome {
  if (typeof adapter?.runWalCheckpoint !== "function") return "skipped";

  try {
    const result = adapter.runWalCheckpoint("TRUNCATE");
    if (result.busy) {
      logger.warn(
        "WAL checkpoint (TRUNCATE) left busy frames — another connection still holds the WAL.",
      );
      return "busy";
    }
    logger.info(`WAL checkpoint (TRUNCATE): ${result.frames} frame(s) written back.`);
    return "truncated";
  } catch (error) {
    logger.warn(`WAL checkpoint (TRUNCATE) failed: ${String(error)}`);
    return "failed";
  }
}
