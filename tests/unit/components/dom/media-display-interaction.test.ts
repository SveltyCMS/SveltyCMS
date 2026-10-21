/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/media-display-interaction.test.ts
 * @description Real DOM tests for the read-only Media widget (entry-list cell).
 *
 * Regression pins for the 2026-10-21 recording: `/api/media/:id` answers with
 * `{ success, data }`, and reading fields off the envelope produced a broken
 * image in the entry list.
 *
 * ### Features:
 * - unwraps the API envelope before reading filename/thumbnails
 * - prefers the stored thumbnail over the original
 * - renders hydrated media objects without a network round-trip
 * - keeps an en dash for an empty value
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import MediaDisplay from "@src/widgets/core/media-upload/display.svelte";
import { renderComponent, settle } from "./render";

function stubFetch(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Media widget display (entry list)", () => {
  it("unwraps `{ success, data }` and renders the stored thumbnail", async () => {
    stubFetch({
      success: true,
      data: {
        _id: "media-1",
        filename: "photo.png",
        mimeType: "image/png",
        url: "/files/original/photo.png",
        size: 2048,
        thumbnails: { thumbnail: { url: "/files/thumbnail/photo.png" } },
        metadata: {},
      },
    });

    const { target, cleanup } = renderComponent(MediaDisplay, { value: "media-1" });
    try {
      await settle();
      const img = await vi.waitFor(() => {
        const found = target.querySelector<HTMLImageElement>("img");
        expect(found).not.toBeNull();
        return found!;
      });

      expect(img.getAttribute("src")).toBe("/files/thumbnail/photo.png");
      expect(img.getAttribute("alt")).toBe("photo.png");
      expect(img.getAttribute("title")).toBe("photo.png");
    } finally {
      cleanup();
    }
  });

  it("renders a hydrated media object without fetching", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { target, cleanup } = renderComponent(MediaDisplay, {
      value: [
        {
          _id: "media-2",
          filename: "inline.jpg",
          mimeType: "image/jpeg",
          url: "/files/inline.jpg",
        },
      ],
    });

    try {
      await settle();
      const img = target.querySelector<HTMLImageElement>("img");
      expect(img?.getAttribute("src")).toBe("/files/inline.jpg");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it("renders an en dash when no media is selected", async () => {
    const { target, cleanup } = renderComponent(MediaDisplay, { value: null });
    try {
      await settle();
      expect(target.textContent).toContain("–");
      expect(target.querySelector("img")).toBeNull();
    } finally {
      cleanup();
    }
  });
});
