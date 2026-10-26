/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/system-settings-interaction.test.ts
 * @description Real DOM tests for the generic System Settings group form.
 *
 * This is the form behind every `/config/system-settings` group. It previously
 * had no interaction coverage: loading, dirty-state tracking, toggle bindings,
 * validation bounds, save payloads, discard, and reset were only reachable
 * through CI Playwright shards.
 *
 * The remote functions are mocked (network boundary); the component, its
 * bindings, validation helpers, and UI primitives run for real.
 *
 * ### Features:
 * - loads values into bound inputs
 * - dirty state + save-button enablement
 * - boolean checkbox toggle reaches the save payload
 * - required/email/min validation blocks the save
 * - discard restores the loaded snapshot
 * - reset calls the remote and re-loads bypassing cache
 */

import { describe, expect, it, vi } from "vitest";
import { SvelteSet } from "svelte/reactivity";
import GenericSettingsGroup from "@src/routes/(app)/config/system-settings/generic-settings-group.svelte";
import type { SettingGroup } from "@src/routes/(app)/config/system-settings/settings-groups";
import { click, renderComponent, settle, typeText } from "./render";

const remote = vi.hoisted(() => ({
  loadSettingsGroup: vi.fn(),
  saveSettingsGroup: vi.fn(),
  resetSettingsGroup: vi.fn(),
}));

vi.mock("@src/routes/(app)/config/system-settings/settings.remote", () => remote);

const modal = vi.hoisted(() => ({
  showConfirm: vi.fn((options: { onConfirm?: () => void }) => options.onConfirm?.()),
  modalState: {},
}));

vi.mock("@utils/modal.svelte", () => modal);

const GROUP: SettingGroup = {
  id: "dom-test",
  name: "DOM Test Settings",
  icon: "mdi:cog",
  description: "Synthetic group for interaction tests",
  enabled: true,
  fields: [
    {
      key: "SITE_NAME",
      label: "Site Name",
      description: "Public site name",
      type: "text",
      category: "public",
      required: true,
    },
    {
      key: "SESSION_TTL_HOURS",
      label: "Session TTL",
      description: "Hours a session stays valid",
      type: "number",
      category: "private",
      min: 1,
      max: 72,
    },
    {
      key: "ENABLE_CACHE",
      label: "Enable Cache",
      description: "Toggle the response cache",
      type: "boolean",
      category: "public",
    },
    {
      key: "SMTP_USER",
      label: "SMTP User",
      description: "Sender address",
      type: "text",
      category: "private",
    },
    {
      key: "API_TOKEN",
      label: "API Token",
      description: "Custom-validated token",
      type: "text",
      category: "private",
      validation: (value) =>
        typeof value === "string" && value.length > 0 && value.length < 8
          ? "API Token must be at least 8 characters"
          : null,
    },
  ],
};

const LOADED = {
  SITE_NAME: "Example Site",
  SESSION_TTL_HOURS: 24,
  ENABLE_CACHE: true,
  SMTP_USER: "mail@example.test",
  API_TOKEN: "long-enough-token",
};

type Rendered = ReturnType<typeof renderComponent>;

function field(target: HTMLElement, key: string): HTMLElement {
  const node = target.querySelector<HTMLElement>(`[data-testid='settings-field-${key}']`);
  if (!node) throw new Error(`field ${key} not rendered`);
  return node;
}

function fieldInput(target: HTMLElement, key: string): HTMLInputElement {
  const input = field(target, key).querySelector<HTMLInputElement>("input");
  if (!input) throw new Error(`input ${key} not rendered`);
  return input;
}

function saveButton(target: HTMLElement): HTMLButtonElement {
  const button = target.querySelector<HTMLButtonElement>("[data-testid='settings-group-save']");
  if (!button) throw new Error("save button not rendered");
  return button;
}

function discardButton(target: HTMLElement): HTMLButtonElement {
  const button = target.querySelector<HTMLButtonElement>("[data-testid='settings-group-discard']");
  if (!button) throw new Error("discard button not rendered");
  return button;
}

function checkboxLabel(target: HTMLElement, key: string): HTMLLabelElement {
  const input = fieldInput(target, key);
  const label = target.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`);
  if (!label) throw new Error(`label for ${key} not rendered`);
  return label;
}

async function mount(overrides: Partial<typeof LOADED> = {}): Promise<{
  rendered: Rendered;
  onUnsavedChanges: ReturnType<typeof vi.fn>;
  groupsNeedingConfig: SvelteSet<string>;
}> {
  remote.loadSettingsGroup.mockResolvedValue({
    success: true,
    values: { ...LOADED, ...overrides },
  });
  remote.saveSettingsGroup.mockResolvedValue({ success: true });
  remote.resetSettingsGroup.mockResolvedValue({ success: true });

  const onUnsavedChanges = vi.fn();
  const groupsNeedingConfig = new SvelteSet<string>();
  const rendered = renderComponent(GenericSettingsGroup, {
    group: GROUP,
    groupsNeedingConfig,
    onUnsavedChanges,
    saveTrigger: { fire: () => {}, discard: () => {} },
  });

  // Wait until the initial remote load flips `loading` off (the form wrapper
  // is visibility:hidden until then).
  await vi.waitFor(() => expect(fieldInput(rendered.target, "SITE_NAME")).toBeVisible());

  return { rendered, onUnsavedChanges, groupsNeedingConfig };
}

describe("System Settings group form (client interaction)", () => {
  it("loads remote values into the bound controls", async () => {
    const { rendered } = await mount();
    try {
      expect(fieldInput(rendered.target, "SITE_NAME").value).toBe("Example Site");
      expect(fieldInput(rendered.target, "SESSION_TTL_HOURS").value).toBe("24");
      expect(fieldInput(rendered.target, "ENABLE_CACHE").checked).toBe(true);
      expect(remote.loadSettingsGroup).toHaveBeenCalledWith({
        groupId: "dom-test",
        bypassCache: false,
      });
      expect(saveButton(rendered.target)).toBeDisabled();
    } finally {
      rendered.cleanup();
    }
  });

  it("opens the field tooltip from the ? icon only, never from the label", async () => {
    const { rendered } = await mount();
    try {
      const node = field(rendered.target, "SITE_NAME");

      const label = node.querySelector<HTMLLabelElement>('label[for="SITE_NAME"]');
      if (!label) throw new Error("label not rendered");
      // The label is inert text: the trigger and glyph live beside it.
      expect(label.querySelector("[role='button'], [role='tooltip'], iconify-icon")).toBeNull();

      const trigger = node.querySelector<HTMLButtonElement>(
        "button[aria-label='Field information']",
      );
      if (!trigger) throw new Error("help trigger not rendered");
      expect(trigger.getAttribute("type")).toBe("button");
      expect(trigger.querySelector("iconify-icon")?.getAttribute("icon")).toBe(
        "mdi:help-circle-outline",
      );

      // Hovering the label text alone must not open a tooltip.
      label.dispatchEvent(new MouseEvent("mouseenter"));
      await settle();
      expect(document.querySelector("[role='tooltip']")).toBeNull();

      // The tooltip belongs to the icon wrapper, not the field row.
      trigger.parentElement?.dispatchEvent(new MouseEvent("mouseenter"));
      await vi.waitFor(() => {
        expect(document.querySelector("[role='tooltip']")?.textContent).toContain(
          "Public site name",
        );
      });
    } finally {
      rendered.cleanup();
    }
  });

  it("tracks dirty state and enables Save after an edit", async () => {
    const { rendered, onUnsavedChanges } = await mount();
    try {
      await typeText(fieldInput(rendered.target, "SITE_NAME"), "Renamed Site");

      await vi.waitFor(() => expect(onUnsavedChanges).toHaveBeenLastCalledWith(true));
      expect(saveButton(rendered.target)).toBeEnabled();
    } finally {
      rendered.cleanup();
    }
  });

  it("binds the checkbox toggle into the save payload", async () => {
    const { rendered } = await mount();
    try {
      await click(checkboxLabel(rendered.target, "ENABLE_CACHE"));
      await settle();

      expect(fieldInput(rendered.target, "ENABLE_CACHE").checked).toBe(false);
      await click(saveButton(rendered.target));

      await vi.waitFor(() => expect(remote.saveSettingsGroup).toHaveBeenCalled());
      expect(remote.saveSettingsGroup).toHaveBeenCalledWith({
        groupId: "dom-test",
        values: expect.objectContaining({ ENABLE_CACHE: false }),
      });
    } finally {
      rendered.cleanup();
    }
  });

  it("blocks the save when a required field is empty", async () => {
    const { rendered } = await mount();
    try {
      const siteName = fieldInput(rendered.target, "SITE_NAME");
      await typeText(siteName, "");

      // Native constraint validation blocks the submit before Svelte runs.
      expect(siteName.checkValidity()).toBe(false);
      await click(saveButton(rendered.target));
      await settle();
      expect(remote.saveSettingsGroup).not.toHaveBeenCalled();
    } finally {
      rendered.cleanup();
    }
  });

  it("flags a group that loads with an empty required field", async () => {
    const { rendered, groupsNeedingConfig } = await mount({ SITE_NAME: "" });
    try {
      expect(groupsNeedingConfig.has("dom-test")).toBe(true);
      expect(rendered.target.textContent).toMatch(/default values/i);
    } finally {
      rendered.cleanup();
    }
  });

  it("blocks the save when the number is below its minimum", async () => {
    const { rendered } = await mount();
    try {
      const ttl = fieldInput(rendered.target, "SESSION_TTL_HOURS");
      await typeText(ttl, "0");

      expect(ttl.valueAsNumber).toBe(0);
      expect(ttl.checkValidity()).toBe(false);
      await click(saveButton(rendered.target));
      await settle();
      expect(remote.saveSettingsGroup).not.toHaveBeenCalled();
    } finally {
      rendered.cleanup();
    }
  });

  it("rejects an invalid email in an email-named field", async () => {
    const { rendered } = await mount();
    try {
      const email = fieldInput(rendered.target, "SMTP_USER");
      await typeText(email, "not-an-email");

      expect(email.checkValidity()).toBe(false);
      await click(saveButton(rendered.target));
      await settle();
      expect(remote.saveSettingsGroup).not.toHaveBeenCalled();
    } finally {
      rendered.cleanup();
    }
  });

  it("renders the custom validator error and blocks the save", async () => {
    const { rendered } = await mount();
    try {
      await typeText(fieldInput(rendered.target, "API_TOKEN"), "short");
      await click(saveButton(rendered.target));

      await vi.waitFor(() =>
        expect(rendered.target.textContent).toContain("API Token must be at least 8 characters"),
      );
      expect(remote.saveSettingsGroup).not.toHaveBeenCalled();
    } finally {
      rendered.cleanup();
    }
  });

  it("saves the edited values and clears the dirty state", async () => {
    const { rendered, onUnsavedChanges } = await mount();
    try {
      await typeText(fieldInput(rendered.target, "SITE_NAME"), "Renamed Site");
      await click(saveButton(rendered.target));

      await vi.waitFor(() => expect(remote.saveSettingsGroup).toHaveBeenCalledTimes(1));
      expect(remote.saveSettingsGroup).toHaveBeenCalledWith({
        groupId: "dom-test",
        values: expect.objectContaining({ SITE_NAME: "Renamed Site" }),
      });
      await vi.waitFor(() => expect(onUnsavedChanges).toHaveBeenLastCalledWith(false));
    } finally {
      rendered.cleanup();
    }
  });

  it("discards edits back to the loaded snapshot", async () => {
    const { rendered, onUnsavedChanges } = await mount();
    try {
      await typeText(fieldInput(rendered.target, "SITE_NAME"), "Temporary");
      await vi.waitFor(() => expect(saveButton(rendered.target)).toBeEnabled());

      await click(discardButton(rendered.target));

      expect(fieldInput(rendered.target, "SITE_NAME").value).toBe("Example Site");
      await vi.waitFor(() => expect(onUnsavedChanges).toHaveBeenLastCalledWith(false));
      expect(saveButton(rendered.target)).toBeDisabled();
    } finally {
      rendered.cleanup();
    }
  });

  it("resets through the confirm dialog and reloads bypassing cache", async () => {
    const { rendered } = await mount();
    try {
      const reset = rendered.target.querySelector<HTMLButtonElement>(
        "[data-testid='settings-group-reset']",
      );
      await click(reset);

      await vi.waitFor(() => expect(remote.resetSettingsGroup).toHaveBeenCalledWith("dom-test"));
      expect(modal.showConfirm).toHaveBeenCalledTimes(1);
      await vi.waitFor(() =>
        expect(remote.loadSettingsGroup).toHaveBeenLastCalledWith({
          groupId: "dom-test",
          bypassCache: true,
        }),
      );
    } finally {
      rendered.cleanup();
    }
  });
});
