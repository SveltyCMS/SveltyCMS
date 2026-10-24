/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/design-system-draft-interaction.test.ts
 * @description Page-level draft/discard state machine for the Design System page.
 *
 * Mounts the real `/config/design-system/+page.svelte` on the `layout` tab and
 * exercises the dirty comparison (`draft` vs `savedDraft`) and Discard.
 *
 * The audit finding this pins:
 * - F05: Discard used to flip the "unsaved" boolean only, leaving the edited
 *   control value — and the shared live-preview theme context — ahead of what
 *   the server holds. Discard must restore the saved snapshot in both places.
 *
 * The theme context is the only Svelte-provider boundary mocked (a context can
 * only be provided by a parent component); `getThemeContext` returns a real
 * `AdminTheme` instance so the page and every primitive read/write the same
 * object, exactly as in the app. The appearance API (HTTP) is mocked too.
 *
 * ### Features:
 * - a freshly mounted form is clean (no unsaved bar)
 * - changing density marks it dirty
 * - the draft is pushed into the shared live theme
 * - Discard restores both the control and the live theme, and clears the bar
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import DesignSystemPage from "@src/routes/(app)/config/design-system/+page.svelte";
import { AdminTheme } from "@components/ui/theme-context.svelte";
import { page } from "../../mocks/$app/state";
import { click, renderPage, settle, select } from "./render";

const h = vi.hoisted(() => ({
  liveTheme: null as InstanceType<typeof AdminTheme> | null,
}));

// Real module, overridden lookup: the page's `getThemeContext()` must resolve to
// the same object the test holds, while every primitive keeps its real getters.
vi.mock("@components/ui/theme-context.svelte", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getThemeContext: () => h.liveTheme };
});

const api = vi.hoisted(() => ({
  listThemes: vi.fn(),
  listMarketplaceThemes: vi.fn(),
  installMarketplaceTheme: vi.fn(),
  activateTheme: vi.fn(),
  createTheme: vi.fn(),
  cloneTheme: vi.fn(),
  deleteTheme: vi.fn(),
  saveAdminTheme: vi.fn(),
  resetAdminTheme: vi.fn(),
  importThemePreset: vi.fn(),
  updateUserThemePrefs: vi.fn(),
}));

vi.mock("@src/routes/(app)/config/design-system/appearance-api", () => api);

const FEATURES = {
  stickyActionBar: false,
  collapsibleSidebar: false,
  brandedLogin: false,
  highContrastMode: false,
  reducedMotion: false,
  layoutRegions: { collections: "left" as const, mediaGalleries: "left" as const },
};

const ADMIN_THEME = {
  id: "default",
  name: "Default",
  density: "cozy" as const,
  variant: "bordered" as const,
  accentMode: "default" as const,
  role: "admin" as const,
  themeName: "default",
  customCss: "",
  features: FEATURES,
  lockedSettings: {},
};

const THEMES = [{ id: "default", name: "Default", isActive: true, isDefault: true }];

type Rendered = ReturnType<typeof renderPage>;

function densitySelect(target: HTMLElement): HTMLSelectElement {
  const node = target.querySelector<HTMLSelectElement>("select[aria-label='Admin Density']");
  if (!node) throw new Error("Admin Density select not rendered");
  return node;
}

function discardButton(target: HTMLElement): HTMLButtonElement | null {
  return target.querySelector<HTMLButtonElement>("[data-testid='appearance-theme-discard']");
}

async function mount(): Promise<Rendered> {
  const rendered = renderPage(DesignSystemPage, {
    isAdmin: true,
    adminTheme: structuredClone(ADMIN_THEME),
    themes: structuredClone(THEMES),
    user: { preferences: {} },
  });
  await settle();
  await vi.waitFor(() => expect(densitySelect(rendered.target)).toBeInTheDocument());
  return rendered;
}

beforeEach(() => {
  localStorage.clear();
  page.url = new URL("http://localhost/config/design-system?tab=layout");
  page.data = {};

  h.liveTheme = new AdminTheme({
    density: "cozy",
    variant: "bordered",
    features: structuredClone(FEATURES),
  });

  api.listThemes.mockReset();
  api.listThemes.mockResolvedValue(structuredClone(THEMES));
  api.listMarketplaceThemes.mockReset();
  api.listMarketplaceThemes.mockResolvedValue({ items: [], source: "local" });
});

describe("Design System — draft/discard state (client interaction)", () => {
  it("is clean on mount, tracks density edits, and Discard restores control + live theme (F05)", async () => {
    const { target, cleanup } = await mount();
    try {
      // Fresh form: controls show the persisted theme and nothing is dirty.
      expect(densitySelect(target).value).toBe("cozy");
      expect(discardButton(target)).not.toBeInTheDocument();

      // Edit: the derived `hasChanges` flips because the draft differs from the
      // saved snapshot, and the shared live theme follows the draft.
      await select(densitySelect(target), "spacious");
      expect(densitySelect(target).value).toBe("spacious");
      expect(discardButton(target)).toBeInTheDocument();
      expect(h.liveTheme?.density).toBe("spacious");

      // Discard must restore both surfaces. Pre-F05 it only hid the bar, so the
      // select and the live theme stayed on "spacious".
      await click(discardButton(target));

      expect(densitySelect(target).value).toBe("cozy");
      expect(h.liveTheme?.density).toBe("cozy");
      expect(discardButton(target)).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it("exposes WAI-ARIA tabs: roving tabindex, arrow keys and a labelled panel", async () => {
    const { target, cleanup } = await mount();
    try {
      const layoutTab = target.querySelector<HTMLElement>("[data-testid='appearance-tab-layout']");
      const tabpanel = target.querySelector<HTMLElement>("[role='tabpanel']");

      expect(layoutTab?.getAttribute("role")).toBe("tab");
      expect(layoutTab?.getAttribute("aria-selected")).toBe("true");
      expect(layoutTab?.getAttribute("tabindex")).toBe("0");
      expect(tabpanel?.getAttribute("aria-labelledby")).toBe("appearance-tab-layout");
      expect(tabpanel?.getAttribute("tabindex")).toBe("0");

      // ArrowRight moves selection (and focus) to the next visible tab.
      layoutTab?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      await settle();

      const styleTab = target.querySelector<HTMLElement>("[data-testid='appearance-tab-style']");
      expect(styleTab?.getAttribute("aria-selected")).toBe("true");
      expect(styleTab?.getAttribute("tabindex")).toBe("0");
      expect(layoutTab?.getAttribute("aria-selected")).toBe("false");
      expect(layoutTab?.getAttribute("tabindex")).toBe("-1");
      expect(
        target.querySelector<HTMLElement>("[role='tabpanel']")?.getAttribute("aria-labelledby"),
      ).toBe("appearance-tab-style");
    } finally {
      cleanup();
    }
  });
});
