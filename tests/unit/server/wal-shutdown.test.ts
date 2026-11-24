/**
 * @file tests/unit/server/wal-shutdown.test.ts
 * @description Pins the shutdown WAL checkpoint: mode, failure handling, engines
 * without the method. The regression this guards against is silent — the periodic
 * housekeeping uses PASSIVE, so a call site that quietly drifts back to PASSIVE
 * (or drops the call) leaves a large -wal file behind and no test notices.
 */

import { describe, expect, it } from "vitest";

import {
  truncateWalBeforeShutdown,
  type WalCheckpointAdapter,
  type WalShutdownLogger,
} from "../../../src/server/wal-shutdown";

interface Recorder extends WalShutdownLogger {
  infos: string[];
  warns: string[];
}

function recorder(): Recorder {
  const infos: string[] = [];
  const warns: string[] = [];
  return {
    infos,
    warns,
    info: (message) => infos.push(message),
    warn: (message) => warns.push(message),
  };
}

function adapter(
  impl: (mode: "PASSIVE" | "FULL" | "TRUNCATE") => {
    success: boolean;
    frames: number;
    busy: boolean;
  },
): WalCheckpointAdapter & { modes: string[] } {
  const modes: string[] = [];
  return {
    modes,
    runWalCheckpoint: (mode) => {
      modes.push(mode);
      return impl(mode);
    },
  };
}

describe("truncateWalBeforeShutdown", () => {
  it("asks for TRUNCATE, not the housekeeping PASSIVE", () => {
    const fake = adapter(() => ({ success: true, frames: 42, busy: false }));
    const log = recorder();

    expect(truncateWalBeforeShutdown(fake, log)).toBe("truncated");
    expect(fake.modes).toEqual(["TRUNCATE"]);
    expect(log.infos.join("\n")).toContain("42 frame(s)");
  });

  it("reports a busy WAL without failing the shutdown", () => {
    const fake = adapter(() => ({ success: true, frames: 7, busy: true }));
    const log = recorder();

    expect(truncateWalBeforeShutdown(fake, log)).toBe("busy");
    expect(log.warns.join("\n")).toContain("busy frames");
  });

  it("survives an adapter that throws", () => {
    const fake = adapter(() => {
      throw new Error("database is locked");
    });
    const log = recorder();

    expect(truncateWalBeforeShutdown(fake, log)).toBe("failed");
    expect(log.warns.join("\n")).toContain("database is locked");
  });

  it("skips engines that have no runWalCheckpoint", () => {
    const log = recorder();

    expect(truncateWalBeforeShutdown({}, log)).toBe("skipped");
    expect(truncateWalBeforeShutdown(null, log)).toBe("skipped");
    expect(truncateWalBeforeShutdown(undefined, log)).toBe("skipped");
    expect(log.infos).toEqual([]);
    expect(log.warns).toEqual([]);
  });
});
