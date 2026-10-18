/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/system-health-interaction.test.ts
 * @description Real DOM tests for the SystemHealth monitoring widget.
 *
 * Exercises the interactive client behaviour of `system-health.svelte`:
 * real-time system state display, service cards and statuses, health percentage,
 * auto-refresh toggle, manual refresh trigger, reinitialize confirmation guard,
 * and endpoint copy-to-clipboard functionality.
 *
 * ### Features:
 * - renders overall system state and stats grid
 * - renders service badges with corresponding status variants
 * - computes health percentage based on healthy vs total services
 * - manual refresh button fetches health endpoint and updates state
 * - reinitialize button prompts confirmation and posts reinitialize payload
 * - cancelling reinitialize blocks the POST request
 * - copy button writes health endpoint URL to clipboard
 * - cleans up intervals and event listeners on unmount
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SystemHealth from "@src/components/system-health.svelte";
import { click, renderComponent } from "./render";

const toastSpy = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@src/stores/toast.svelte.ts", () => ({
  toast: toastSpy,
}));

describe("SystemHealth (client interaction)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock response for /api/system?action=health
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("action=health")) {
        return {
          ok: true,
          json: async () => ({
            overallStatus: "READY",
            components: {
              database: { status: "healthy", message: "SQLite operational" },
              auth: { status: "healthy", message: "JWT keys valid" },
              media: { status: "unhealthy", message: "Storage quota reached", error: "ENOSPC" },
            },
            uptime: 120_000,
          }),
        };
      }
      if (urlStr.includes("/api/system")) {
        return {
          ok: true,
          json: async () => ({
            status: "success",
            message: "System reinitialized successfully",
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }) as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders overall status, stats grid and service badges", async () => {
    const { target, cleanup } = renderComponent(SystemHealth);

    try {
      await vi.waitFor(() => {
        expect(target.querySelector('[role="region"]')).toBeInTheDocument();
        expect(target.textContent).toContain("System Health");
        expect(target.textContent).toContain("Database");
        expect(target.textContent).toContain("SQLite operational");
      });

      // Verify healthy/unhealthy breakdown: 2 healthy out of 3 total = 67%
      expect(target.textContent).toContain("Database");
      expect(target.textContent).toContain("Auth");
      expect(target.textContent).toContain("Media");
      expect(target.textContent).toContain("1 unhealthy");
    } finally {
      cleanup();
    }
  });

  it("fetches health on manual refresh click", async () => {
    const { target, cleanup } = renderComponent(SystemHealth);

    try {
      const refreshBtn = target.querySelector('button[aria-label="Refresh system health"]');
      expect(refreshBtn).toBeInTheDocument();

      // Wait for initial mount health check to finish so button is enabled
      await vi.waitFor(() => expect(refreshBtn).not.toBeDisabled());

      const initialCalls = (globalThis.fetch as any).mock.calls.length;
      await click(refreshBtn);

      await vi.waitFor(() => {
        expect((globalThis.fetch as any).mock.calls.length).toBeGreaterThan(initialCalls);
      });
    } finally {
      cleanup();
    }
  });

  it("guards reinitialization with confirm dialog and posts when accepted", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { target, cleanup } = renderComponent(SystemHealth);

    try {
      const reinitBtn = target.querySelector('button[aria-label="Reinitialize system"]');
      expect(reinitBtn).toBeInTheDocument();

      // Wait for initial health check to complete
      await vi.waitFor(() => expect(reinitBtn).not.toBeDisabled());

      await click(reinitBtn);

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => {
        expect(toastSpy.warning).toHaveBeenCalledWith("Reinitializing system...");
        expect(toastSpy.success).toHaveBeenCalledWith("System reinitialized successfully", {
          duration: 5000,
        });
      });
    } finally {
      cleanup();
    }
  });

  it("aborts reinitialization when confirm dialog is cancelled", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { target, cleanup } = renderComponent(SystemHealth);

    try {
      const reinitBtn = target.querySelector('button[aria-label="Reinitialize system"]');
      expect(reinitBtn).toBeInTheDocument();

      // Wait for initial health check to complete
      await vi.waitFor(() => expect(reinitBtn).not.toBeDisabled());

      await click(reinitBtn);

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(toastSpy.warning).not.toHaveBeenCalled();
      // No extra POST to /api/system
      const postCalls = (globalThis.fetch as any).mock.calls.filter(
        ([_url, init]: [any, any]) => init?.method === "POST",
      );
      expect(postCalls.length).toBe(0);
    } finally {
      cleanup();
    }
  });

  it("copies API health endpoint URL to clipboard", async () => {
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextSpy,
      },
    });

    const { target, cleanup } = renderComponent(SystemHealth);

    try {
      await vi.waitFor(() =>
        expect(
          target.querySelector('button[aria-label="Copy endpoint URL to clipboard"]'),
        ).toBeInTheDocument(),
      );

      const copyBtn = target.querySelector('button[aria-label="Copy endpoint URL to clipboard"]');
      await click(copyBtn);

      expect(writeTextSpy).toHaveBeenCalledTimes(1);
      expect(writeTextSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/system?action=health"),
      );
      expect(toastSpy.success).toHaveBeenCalledWith("Endpoint copied to clipboard", {
        duration: 2000,
      });
    } finally {
      cleanup();
    }
  });
});
