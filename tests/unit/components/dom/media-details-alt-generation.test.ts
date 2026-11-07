/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/media-details-alt-generation.test.ts
 * @description DOM contract for the on-device AI alt-text action in the media details modal.
 *
 * The AI client is mocked at its public boundary (`ai.generateAltText`); the
 * component itself, the media fetch, and the existing 300 ms debounce stay real.
 *
 * ### Features:
 * - generation fills an empty alt and persists through the existing debounce
 * - authored alt text is never overwritten without confirmation, and can be undone
 * - a failed generation reports an error and leaves the editor usable
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MediaDetailsModal from "@src/components/media/media-details-modal.svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { click, renderComponent } from "./render";

const { generateAltText } = vi.hoisted(() => ({ generateAltText: vi.fn() }));

vi.mock("@src/services/ai-client", () => ({ ai: { generateAltText } }));

const GENERATED = {
  altText: "A red bicycle leaning against a wall",
  confidence: 0.82,
  backend: "litert" as const,
  latencyMs: 120,
};

function imageFile(alt = "") {
  return {
    _id: "media-1",
    filename: "photo.jpg",
    type: "image",
    mimeType: "image/jpeg",
    url: "/files/photo.jpg",
    size: 1024,
    metadata: { alt },
  };
}

type Patch = { url: string; body: { metadata?: { alt?: string } } | null };

/**
 * Route the component's fetches: same-origin image bytes for the AI action and
 * the JSON envelope for the debounced `PATCH /api/media/:id`.
 */
function stubMediaFetch() {
  const patches: Patch[] = [];
  const imageRequests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/media/")) {
      patches.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return new Response(JSON.stringify({ success: true, data: imageFile("") }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    imageRequests.push({ url, init });
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, patches, imageRequests };
}

function query<T extends Element>(target: HTMLElement, selector: string): T | null {
  return target.querySelector<T>(selector);
}

async function openAltEditor(target: HTMLElement): Promise<void> {
  await click(query<HTMLButtonElement>(target, "button[aria-label='Edit alt text']"));
}

beforeEach(() => {
  generateAltText.mockReset();
  vi.spyOn(toast, "error").mockImplementation(() => "toast-error");
  vi.spyOn(toast, "success").mockImplementation(() => "toast-success");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MediaDetailsModal — AI alt-text generation", () => {
  it("fills an empty alt and persists it through the existing debounce", async () => {
    const { patches, imageRequests } = stubMediaFetch();
    generateAltText.mockResolvedValue(GENERATED);

    const rendered = renderComponent(MediaDetailsModal, {
      file: imageFile(),
      onEdit: () => {},
    });
    try {
      await openAltEditor(rendered.target);

      const generate = query<HTMLButtonElement>(
        rendered.target,
        "[data-testid='media-alt-generate']",
      );
      expect(generate).not.toBeNull();
      expect(generate?.getAttribute("aria-label")).toBe("Generate alt text");
      expect(generate?.getAttribute("aria-busy")).not.toBe("true");

      await click(generate);

      const input = query<HTMLInputElement>(rendered.target, "input[aria-label='Alt text']");
      await vi.waitFor(() => expect(input?.value).toBe(GENERATED.altText));

      // Same-origin bytes, never credentials to a CDN/media-server origin.
      expect(imageRequests).toHaveLength(1);
      expect(imageRequests[0]?.url).toBe("/files/photo.jpg");
      expect(imageRequests[0]?.init?.credentials).toBe("same-origin");

      const call = generateAltText.mock.calls[0] as unknown as
        | [ArrayBuffer, string, string]
        | undefined;
      expect(call?.[0]).toBeInstanceOf(ArrayBuffer);
      expect(call?.[1]).toBe("image/jpeg");
      expect(call?.[2]).toBe("photo.jpg");

      // Only the pre-existing debounce saves — generation adds no second path.
      await vi.waitFor(() => expect(patches).toHaveLength(1), { timeout: 2000 });
      expect(patches[0]?.body?.metadata?.alt).toBe(GENERATED.altText);

      const source = query<HTMLElement>(rendered.target, "[data-testid='media-alt-ai-source']");
      expect(source?.textContent).toContain("On-device AI");
      expect(source?.textContent).toContain("82%");
    } finally {
      rendered.cleanup();
    }
  });

  it("requires confirmation before replacing authored alt text, then allows undo", async () => {
    const { patches } = stubMediaFetch();
    generateAltText.mockResolvedValue(GENERATED);

    const rendered = renderComponent(MediaDetailsModal, {
      file: imageFile("Hand-written alt"),
      onEdit: () => {},
    });
    try {
      await openAltEditor(rendered.target);
      const input = query<HTMLInputElement>(rendered.target, "input[aria-label='Alt text']");
      expect(input?.value).toBe("Hand-written alt");

      await click(query<HTMLButtonElement>(rendered.target, "[data-testid='media-alt-generate']"));

      await vi.waitFor(() =>
        expect(
          query<HTMLElement>(rendered.target, "[data-testid='media-alt-suggestion']"),
        ).not.toBeNull(),
      );
      const suggestion = query<HTMLElement>(
        rendered.target,
        "[data-testid='media-alt-suggestion']",
      );
      expect(suggestion?.textContent).toContain(GENERATED.altText);
      // Nothing was replaced and nothing was saved yet.
      expect(input?.value).toBe("Hand-written alt");
      expect(patches).toHaveLength(0);

      await click(
        query<HTMLButtonElement>(rendered.target, "[data-testid='media-alt-apply-suggestion']"),
      );
      expect(input?.value).toBe(GENERATED.altText);
      await vi.waitFor(() => expect(patches).toHaveLength(1), { timeout: 2000 });
      expect(patches[0]?.body?.metadata?.alt).toBe(GENERATED.altText);

      await click(query<HTMLButtonElement>(rendered.target, "[data-testid='media-alt-undo']"));
      expect(input?.value).toBe("Hand-written alt");
      await vi.waitFor(() => expect(patches).toHaveLength(2), { timeout: 2000 });
      expect(patches[1]?.body?.metadata?.alt).toBe("Hand-written alt");
    } finally {
      rendered.cleanup();
    }
  });

  it("reports a failed generation and keeps the editor usable", async () => {
    const { patches } = stubMediaFetch();
    generateAltText.mockRejectedValueOnce(new Error("worker offline"));

    const rendered = renderComponent(MediaDetailsModal, {
      file: imageFile(),
      onEdit: () => {},
    });
    try {
      await openAltEditor(rendered.target);
      const generate = query<HTMLButtonElement>(
        rendered.target,
        "[data-testid='media-alt-generate']",
      );
      await click(generate);

      await vi.waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Alt-text generation failed. Please try again."),
      );

      const input = query<HTMLInputElement>(rendered.target, "input[aria-label='Alt text']");
      expect(input).not.toBeNull();
      expect(input?.value).toBe("");
      expect(generate?.disabled).toBe(false);
      expect(generate?.getAttribute("aria-busy")).not.toBe("true");
      expect(query(rendered.target, "[data-testid='media-alt-suggestion']")).toBeNull();

      // The control recovers on the next attempt.
      generateAltText.mockResolvedValueOnce(GENERATED);
      await click(generate);
      await vi.waitFor(() => expect(input?.value).toBe(GENERATED.altText));
      await vi.waitFor(() => expect(patches).toHaveLength(1), { timeout: 2000 });
    } finally {
      rendered.cleanup();
    }
  });
});
