/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/media-grid-virtual-window.test.ts
 * @description Real DOM tests for the media grid's large-folder windowing.
 *
 * Mounts the real `media-grid.svelte` against generated gallery rows. jsdom has
 * no layout engine, so the component falls back to its documented row/viewport
 * estimates — exactly the pre-measurement path the browser takes before the
 * first `requestAnimationFrame` measurement.
 *
 * ### Features:
 * - large lists mount only the row window, not every tile
 * - the bottom spacer carries the scroll height of the unmounted rows
 * - small lists keep the existing bounded batch reveal
 * - `isRefreshing` marks the grid busy without clearing its tiles
 */

import { afterEach, describe, expect, it } from "vitest";
import { SvelteSet } from "svelte/reactivity";
import MediaGrid from "@src/routes/(app)/mediagallery/media-grid.svelte";
import type { MediaBase } from "@utils/media/media-models";
import { renderComponent, settle } from "./render";

function makeFiles(count: number): MediaBase[] {
  return Array.from({ length: count }, (_, index) => {
    const name = `asset-${String(index).padStart(4, "0")}.png`;
    return {
      _id: `asset-${index}`,
      type: "image",
      filename: name,
      originalFilename: name,
      url: `/media/${name}`,
      metadata: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      createdBy: "user-1",
      updatedBy: "user-1",
      user: "user-1",
    } as unknown as MediaBase;
  });
}

function mountGrid(files: MediaBase[], props: Record<string, unknown> = {}) {
  // The route component's generated type is not assignable to `Component<any, …>`
  // under the DOM config's Svelte copy; the repo's DOM suites use the same cast.
  return renderComponent(
    MediaGrid as never,
    {
      filteredFiles: files,
      selectedFiles: new SvelteSet<string>(),
      ...props,
    } as never,
  );
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Media grid — large-folder windowing", () => {
  it("mounts a row window instead of every tile and fills the rest with a spacer", async () => {
    const files = makeFiles(600);
    const { target, cleanup } = mountGrid(files);

    try {
      await settle();

      const tiles = target.querySelectorAll('[data-testid="media-item"]');
      expect(tiles.length).toBeGreaterThan(0);
      expect(tiles.length).toBeLessThan(files.length);

      // Top of the list: no spacer above the window, a spacer below it.
      expect(target.querySelector('[data-testid="media-grid-top-spacer"]')).toBeNull();
      const bottomSpacer = target.querySelector<HTMLElement>(
        '[data-testid="media-grid-bottom-spacer"]',
      );
      expect(bottomSpacer).not.toBeNull();
      expect(Number.parseFloat(bottomSpacer?.style.height ?? "0")).toBeGreaterThan(0);

      // The first window holds the head of the server result.
      expect(tiles[0]?.getAttribute("data-media-id")).toBe("asset-0");

      // Row wrappers keep the grid's row → gridcell ownership.
      expect(tiles[0]?.closest('[role="row"]')).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it("keeps the bounded batch reveal for folders below the windowing threshold", async () => {
    const files = makeFiles(100);
    const { target, cleanup } = mountGrid(files);

    try {
      await settle();

      // Matches the historical BATCH_SIZE contract for small folders.
      expect(target.querySelectorAll('[data-testid="media-item"]')).toHaveLength(60);
      expect(target.querySelector('[data-testid="media-grid-top-spacer"]')).toBeNull();
      expect(target.querySelector('[data-testid="media-grid-bottom-spacer"]')).toBeNull();
      expect(target.querySelector('[data-testid="media-grid-load-more"]')).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it("marks the grid busy while a search refresh is pending and keeps the tiles", async () => {
    const files = makeFiles(100);
    const { target, cleanup } = mountGrid(files, { isRefreshing: true });

    try {
      await settle();

      const grid = target.querySelector('[data-testid="media-grid"]');
      expect(grid).toHaveAttribute("aria-busy", "true");
      expect(target.querySelectorAll('[data-testid="media-item"]')).toHaveLength(60);
    } finally {
      cleanup();
    }
  });
});
