/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/draft-resume-banner.test.ts
 * @description DOM interaction for the draft resume banner.
 *
 * The banner is the only place a stored draft can be applied or removed. It must
 * expose exactly two actions (Restore / Discard), name them for assistive tech,
 * and lock both while a request is in flight.
 */

import { describe, expect, it, vi } from "vitest";
import DraftResumeBanner from "@src/components/collection-display/draft-resume-banner.svelte";
import { click, renderComponent, settle } from "./render";

const UPDATED_AT = "2026-11-01T10:00:00.000Z";

function mount(
  overrides: {
    updatedAt?: string;
    isNewEntry?: boolean;
    busy?: boolean;
    onRestore?: () => void;
    onDiscard?: () => void;
  } = {},
) {
  return renderComponent(DraftResumeBanner, {
    updatedAt: UPDATED_AT,
    isNewEntry: false,
    busy: false,
    onRestore: vi.fn(),
    onDiscard: vi.fn(),
    ...overrides,
  });
}

describe("draft resume banner", () => {
  it("offers Restore and Discard with accessible names", async () => {
    const { target, cleanup } = mount();

    try {
      await settle();

      expect(target.querySelector('[data-testid="draft-resume-banner"]')).not.toBeNull();
      const restore = target.querySelector<HTMLButtonElement>(
        '[data-testid="draft-resume-restore"]',
      );
      const discard = target.querySelector<HTMLButtonElement>(
        '[data-testid="draft-resume-discard"]',
      );

      expect(restore?.textContent?.trim()).toBe("Restore draft");
      expect(restore?.tagName).toBe("BUTTON");
      expect(restore?.getAttribute("type")).toBe("button");
      expect(discard?.textContent?.trim()).toBe("Discard");
      expect(discard?.tagName).toBe("BUTTON");
      // A status region announces the offer when the editor opens with a draft.
      expect(target.querySelector("[data-testid=draft-resume-banner]")?.getAttribute("role")).toBe(
        "status",
      );
    } finally {
      cleanup();
    }
  });

  it("calls the handlers instead of navigating or creating anything", async () => {
    const onRestore = vi.fn();
    const onDiscard = vi.fn();
    const { target, cleanup } = mount({ onRestore, onDiscard });

    try {
      await settle();
      await click(target.querySelector('[data-testid="draft-resume-restore"]'));
      expect(onRestore).toHaveBeenCalledTimes(1);
      expect(onDiscard).not.toHaveBeenCalled();

      await click(target.querySelector('[data-testid="draft-resume-discard"]'));
      expect(onDiscard).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it("locks both actions while a request is in flight", async () => {
    const { target, cleanup } = mount({ busy: true });

    try {
      await settle();
      expect(
        target
          .querySelector<HTMLButtonElement>('[data-testid="draft-resume-restore"]')
          ?.hasAttribute("disabled"),
      ).toBe(true);
      expect(
        target
          .querySelector<HTMLButtonElement>('[data-testid="draft-resume-discard"]')
          ?.hasAttribute("disabled"),
      ).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("labels a draft for a not-yet-created entry differently", async () => {
    const { target, cleanup } = mount({ isNewEntry: true });

    try {
      await settle();
      expect(target.textContent).toContain("unsaved new entry");
    } finally {
      cleanup();
    }
  });
});
