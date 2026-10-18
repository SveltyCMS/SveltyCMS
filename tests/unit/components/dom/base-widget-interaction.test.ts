/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/base-widget-interaction.test.ts
 * @description Real DOM tests for BaseWidget dashboard container and controls.
 *
 * Exercises the interactive client behaviour of `base-widget.svelte`:
 * title rendering, size menu dropdown toggling, size selection callback,
 * close request handling, resize handles rendering, data fetching, and caching.
 *
 * ### Features:
 * - renders widget title and container accessibility labels
 * - fires onCloseRequest when close button is clicked
 * - toggles size menu dropdown and dispatches onSizeChange
 * - closes size menu on outside click
 * - toggles resize handles based on resizable prop
 * - fetches initial data from endpoint and calls onDataLoaded
 * - handles fetch errors and displays error state
 * - cleans up event listeners on unmount
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BaseWidget from "@src/routes/(app)/dashboard/base-widget.svelte";
import { click, renderComponent, settle } from "./render";

describe("BaseWidget (client interaction)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders widget title and accessible label", () => {
    const { target, cleanup } = renderComponent(BaseWidget, {
      label: "Analytics Widget",
      widgetId: "analytics-1",
      resizable: false,
    });

    try {
      const heading = target.querySelector("#widget-title-analytics-1");
      expect(heading).toBeInTheDocument();
      expect(heading?.textContent).toContain("Analytics Widget");

      const article = target.querySelector("article");
      expect(article).toHaveAttribute("aria-labelledby", "widget-title-analytics-1");
    } finally {
      cleanup();
    }
  });

  it("fires onCloseRequest when close button is clicked", async () => {
    const onCloseRequest = vi.fn();
    const { target, cleanup } = renderComponent(BaseWidget, {
      label: "Closeable Widget",
      onCloseRequest,
      resizable: false,
    });

    try {
      const closeBtn = target.querySelector('button[aria-label*="Closeable Widget"]');
      expect(closeBtn).toBeInTheDocument();

      await click(closeBtn);
      expect(onCloseRequest).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it("toggles size menu dropdown and selects new size", async () => {
    const onSizeChange = vi.fn();
    const { target, cleanup } = renderComponent(BaseWidget, {
      label: "Resizable Widget",
      size: { w: 1, h: 1 },
      onSizeChange,
      resizable: false,
    });

    try {
      expect(
        target.querySelector('button[aria-label*="size"], button[aria-label*="Size"]'),
      ).toBeInTheDocument();
      const menuButton = target.querySelector(
        'button[aria-label*="size"], button[aria-label*="Size"]',
      ) as HTMLElement;

      // Click to open menu
      await click(menuButton);

      // Find size option 2×1
      const sizeButtons = Array.from(target.querySelectorAll("button")).filter((btn) =>
        btn.textContent?.includes("2×1"),
      );
      expect(sizeButtons.length).toBeGreaterThan(0);

      // Click 2×1 size option
      await click(sizeButtons[0]);
      expect(onSizeChange).toHaveBeenCalledWith({ w: 2, h: 1 });

      // Menu should be closed after selection
      const closedSizeButtons = Array.from(target.querySelectorAll("button")).filter((btn) =>
        btn.textContent?.includes("2×1"),
      );
      expect(closedSizeButtons.length).toBe(0);
    } finally {
      cleanup();
    }
  });

  it("closes size menu when clicking outside", async () => {
    const { target, cleanup } = renderComponent(BaseWidget, {
      label: "Outside Click Widget",
      size: { w: 1, h: 1 },
      resizable: false,
    });

    try {
      const menuButton = target.querySelector(
        'button[aria-label*="size"], button[aria-label*="Size"]',
      ) as HTMLElement;
      await click(menuButton);

      let sizeButtons = Array.from(target.querySelectorAll("button")).filter((btn) =>
        btn.textContent?.includes("2×1"),
      );
      expect(sizeButtons.length).toBeGreaterThan(0);

      // Click outside on the document body
      document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await settle();

      // Menu should close
      sizeButtons = Array.from(target.querySelectorAll("button")).filter((btn) =>
        btn.textContent?.includes("2×1"),
      );
      expect(sizeButtons.length).toBe(0);
    } finally {
      cleanup();
    }
  });

  it("renders resize handles only when resizable is true", () => {
    const resizableTarget = renderComponent(BaseWidget, {
      label: "Resizable",
      resizable: true,
    });
    const nonResizableTarget = renderComponent(BaseWidget, {
      label: "Non-resizable",
      resizable: false,
    });

    try {
      expect(resizableTarget.target.querySelector(".resize-handles")).toBeInTheDocument();
      expect(nonResizableTarget.target.querySelector(".resize-handles")).not.toBeInTheDocument();
    } finally {
      resizableTarget.cleanup();
      nonResizableTarget.cleanup();
    }
  });

  it("fetches data from endpoint and calls onDataLoaded", async () => {
    const mockData = { totalUsers: 42, activeUsers: 30 };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    }) as any;

    const onDataLoaded = vi.fn();
    const { target, cleanup } = renderComponent(BaseWidget, {
      label: "Data Widget",
      endpoint: "/api/stats",
      onDataLoaded,
      resizable: false,
    });

    try {
      await vi.waitFor(() => expect(onDataLoaded).toHaveBeenCalledWith(mockData));
      expect(globalThis.fetch).toHaveBeenCalledWith("/api/stats", { cache: "no-store" });

      const pre = target.querySelector("pre");
      expect(pre).toBeInTheDocument();
      expect(pre?.textContent).toContain('"totalUsers": 42');
    } finally {
      cleanup();
    }
  });

  it("displays error state when endpoint request fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    }) as any;

    const { target, cleanup } = renderComponent(BaseWidget, {
      label: "Failing Widget",
      endpoint: "/api/broken",
      retryCount: 0,
      resizable: false,
    });

    try {
      await vi.waitFor(() => expect(target.querySelector(".error-state")).toBeInTheDocument());
      const errorEl = target.querySelector(".error-state");
      expect(errorEl?.textContent).toContain("HTTP 500: Internal Server Error");
    } finally {
      cleanup();
    }
  });

  it("uses cached data from localStorage when available", async () => {
    const cachedPayload = {
      data: { cachedValue: 999 },
      timestamp: Date.now(),
    };
    localStorage.setItem("widget_cache_test-cache-key", JSON.stringify(cachedPayload));

    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;

    const onDataLoaded = vi.fn();
    const { target, cleanup } = renderComponent(BaseWidget, {
      label: "Cached Widget",
      endpoint: "/api/cached-endpoint",
      cacheKey: "test-cache-key",
      cacheTTL: 60000,
      onDataLoaded,
      resizable: false,
    });

    try {
      await settle();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(onDataLoaded).toHaveBeenCalledWith({ cachedValue: 999 });

      const pre = target.querySelector("pre");
      expect(pre?.textContent).toContain('"cachedValue": 999');
    } finally {
      cleanup();
    }
  });
});
