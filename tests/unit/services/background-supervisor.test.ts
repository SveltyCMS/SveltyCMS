/**
 * @file tests/unit/services/background-supervisor.test.ts
 * @description Unit tests for BackgroundSupervisor lifecycle, modes, health status,
 * and the standalone worker's SvelteKit virtual-module boundary.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BackgroundSupervisor } from "@src/services/background/background-supervisor";
import {
  browser as workerBrowser,
  building as workerBuilding,
} from "@src/services/background/background-runtime-env";

describe("BackgroundSupervisor", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("resolves mode correctly based on SVELTY_BACKGROUND_MODE", () => {
    const supervisor = new BackgroundSupervisor();

    delete process.env.SVELTY_BACKGROUND_MODE;
    expect(supervisor.getMode()).toBe("child");

    process.env.SVELTY_BACKGROUND_MODE = "disabled";
    expect(supervisor.getMode()).toBe("disabled");

    process.env.SVELTY_BACKGROUND_MODE = "off";
    expect(supervisor.getMode()).toBe("disabled");

    process.env.SVELTY_BACKGROUND_MODE = "0";
    expect(supervisor.getMode()).toBe("disabled");

    process.env.SVELTY_BACKGROUND_MODE = "inprocess";
    expect(supervisor.getMode()).toBe("inprocess");

    process.env.SVELTY_BACKGROUND_MODE = "child";
    expect(supervisor.getMode()).toBe("child");
  });

  it("does not spawn when mode is disabled", () => {
    process.env.SVELTY_BACKGROUND_MODE = "disabled";
    const supervisor = new BackgroundSupervisor();

    const started = supervisor.start();
    expect(started).toBe(false);

    const status = supervisor.getStatus();
    expect(status.running).toBe(false);
    expect(status.mode).toBe("disabled");
    expect(status.workerStatus).toBe("offline");
  });

  it("does not spawn child when mode is inprocess", () => {
    process.env.SVELTY_BACKGROUND_MODE = "inprocess";
    const supervisor = new BackgroundSupervisor();

    const started = supervisor.start();
    expect(started).toBe(false);

    const status = supervisor.getStatus();
    expect(status.running).toBe(false);
    expect(status.mode).toBe("inprocess");
  });

  it("reports offline status when stopped", async () => {
    const supervisor = new BackgroundSupervisor();
    await supervisor.stop();

    const status = supervisor.getStatus();
    expect(status.running).toBe(false);
    expect(status.workerStatus).toBe("offline");
  });

  it("bundles a runtime replacement for SvelteKit's virtual environment module", () => {
    const viteConfig = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");
    expect(viteConfig).toContain('"$app/env": path.resolve(');
    expect(viteConfig).toContain('"src/services/background/background-runtime-env.ts"');
    expect(viteConfig).toContain('name: "compile-svelte-runes-modules"');
    expect(viteConfig).toContain("compileModule(stripped.code");
    expect(workerBrowser).toBe(false);
    expect(workerBuilding).toBe(false);
  });
});
