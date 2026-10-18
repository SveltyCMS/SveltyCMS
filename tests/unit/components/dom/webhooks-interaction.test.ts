/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/webhooks-interaction.test.ts
 * @description Real DOM tests for the Webhooks management page.
 *
 * Mounts the real `/config/webhooks/+page.svelte`: list rendering, search,
 * create/edit modal, secret generation, event subscriptions, validation,
 * test delivery, and delete confirmation. Only the HTTP API client, confirm
 * dialog, and toast service are mocked (boundaries).
 *
 * ### Features:
 * - list + empty states
 * - search filtering
 * - add modal defaults (secret + default event)
 * - name/URL/event validation blocks the save
 * - create/edit payloads, active toggle, secret regeneration
 * - test delivery and delete confirmation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import WebhooksPage from "@src/routes/(app)/config/webhooks/+page.svelte";
import { click, renderComponent, settle, typeText } from "./render";

const h = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  test: vi.fn(),
  confirm: vi.fn(),
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@src/routes/(app)/config/webhooks/webhooks-api", () => ({
  unwrapWebhookList: (result: any) => {
    if (!result?.success) return [];
    const raw = result.data ?? result;
    if (Array.isArray(raw)) return raw;
    if (raw && typeof raw === "object" && Array.isArray(raw.data)) return raw.data;
    return [];
  },
  listWebhooks: h.list,
  saveWebhook: h.save,
  deleteWebhook: h.remove,
  testWebhookDelivery: h.test,
}));

vi.mock("@utils/modal.svelte", () => ({
  showConfirm: h.confirm,
  modalState: {},
}));

vi.mock("@src/stores/toast.svelte.ts", () => ({ toast: h.toast }));

const WEBHOOKS = [
  {
    id: "hook-1",
    name: "Deploy Hook",
    url: "https://example.test/deploy",
    events: ["entry:publish"],
    active: true,
    secret: "secret-one",
  },
  {
    id: "hook-2",
    name: "Media Hook",
    url: "https://example.test/media",
    events: ["media:upload", "media:delete"],
    active: false,
    secret: "secret-two",
  },
];

type Rendered = ReturnType<typeof renderComponent>;

async function mount(): Promise<Rendered> {
  const rendered = renderComponent(WebhooksPage);
  await vi.waitFor(() => expect(h.list).toHaveBeenCalled());
  await vi.waitFor(() =>
    expect(
      rendered.target.querySelector("[data-testid='webhooks-list']") ??
        rendered.target.querySelector("[data-testid='webhooks-empty']"),
    ).toBeInTheDocument(),
  );
  return rendered;
}

function modal(target: HTMLElement): HTMLElement {
  const node = target.querySelector<HTMLElement>("[data-testid='webhooks-modal']");
  if (!node) throw new Error("webhooks modal not rendered");
  return node;
}

function input(target: HTMLElement, testid: string): HTMLInputElement {
  const node = target.querySelector<HTMLInputElement>(`[data-testid='${testid}']`);
  if (!node) throw new Error(`webhook input ${testid} not rendered`);
  return node;
}

function checkboxForLabel(target: HTMLElement, text: string): HTMLInputElement {
  const label = [...target.querySelectorAll("label")].find((l) =>
    l.textContent?.trim().includes(text),
  );
  const id = label?.htmlFor;
  const inputEl = id ? target.querySelector<HTMLInputElement>(`#${CSS.escape(id)}`) : null;
  if (!inputEl) throw new Error(`checkbox ${text} not rendered`);
  return inputEl;
}

beforeEach(() => {
  h.list.mockReset();
  h.list.mockResolvedValue({ success: true, data: WEBHOOKS });
  h.save.mockReset();
  h.save.mockResolvedValue({ success: true, data: WEBHOOKS[0] });
  h.remove.mockReset();
  h.remove.mockResolvedValue({ success: true });
  h.test.mockReset();
  h.test.mockResolvedValue({ success: true });
  h.confirm.mockReset();
  h.confirm.mockImplementation((options: { onConfirm?: () => void }) => options.onConfirm?.());
  for (const fn of Object.values(h.toast)) fn.mockReset();
});

describe("Webhooks page (client interaction)", () => {
  it("renders the loaded webhooks", async () => {
    const { target, cleanup } = await mount();
    try {
      expect(target.textContent).toContain("Deploy Hook");
      expect(target.textContent).toContain("https://example.test/deploy");
      expect(target.querySelector("[data-testid='webhook-card-hook-1']")).toBeInTheDocument();
      expect(target.querySelector("[data-testid='webhook-card-hook-2']")).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it("shows the empty state", async () => {
    h.list.mockResolvedValue({ success: true, data: [] });
    const { target, cleanup } = await mount();
    try {
      expect(target.querySelector("[data-testid='webhooks-empty']")).toBeInTheDocument();
      expect(target.querySelector("[data-testid='webhooks-empty-cta']")).toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it("filters by name or URL", async () => {
    const { target, cleanup } = await mount();
    try {
      const search = target.querySelector<HTMLInputElement>("[data-testid='webhooks-search']");
      expect(search).toBeInTheDocument();

      await typeText(search, "media");
      expect(target.querySelector("[data-testid='webhook-card-hook-2']")).toBeInTheDocument();
      expect(target.querySelector("[data-testid='webhook-card-hook-1']")).not.toBeInTheDocument();

      await typeText(search, "deploy");
      expect(target.querySelector("[data-testid='webhook-card-hook-1']")).toBeInTheDocument();
      expect(target.querySelector("[data-testid='webhook-card-hook-2']")).not.toBeInTheDocument();
    } finally {
      cleanup();
    }
  });

  it("opens the add modal with a generated secret and a default event", async () => {
    const { target, cleanup } = await mount();
    try {
      await click(target.querySelector("[data-testid='webhooks-add']"));
      await settle();

      const node = modal(target);
      expect(node.textContent).toContain("Add New Webhook");
      expect(input(target, "webhook-secret").value.length).toBeGreaterThan(0);
      expect(checkboxForLabel(target, "entry:publish").checked).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("blocks creation when name, URL, or events are invalid", async () => {
    const { target, cleanup } = await mount();
    try {
      await click(target.querySelector("[data-testid='webhooks-add']"));
      await settle();

      // Defaults: name/url empty, one event selected.
      await click(target.querySelector("[data-testid='webhook-save']"));
      await settle();
      expect(h.save).not.toHaveBeenCalled();
      expect(modal(target).textContent).toContain("Name is required");
      expect(modal(target).textContent).toContain("URL is required");

      await typeText(input(target, "webhook-name"), "Bad Hook");
      await typeText(input(target, "webhook-url"), "ftp://example.test/hook");
      // Deselect the only event.
      await click(checkboxForLabel(target, "entry:publish"));
      await click(target.querySelector("[data-testid='webhook-save']"));
      await settle();

      expect(h.save).not.toHaveBeenCalled();
      expect(modal(target).textContent).toContain("URL must use http or https");
      expect(modal(target).textContent).toContain("Select at least one event");
    } finally {
      cleanup();
    }
  });

  it("creates a webhook with the edited fields, active flag, and events", async () => {
    const { target, cleanup } = await mount();
    try {
      await click(target.querySelector("[data-testid='webhooks-add']"));
      await settle();

      await typeText(input(target, "webhook-name"), "My Hook");
      await typeText(input(target, "webhook-url"), "https://example.test/my-hook");
      await click(checkboxForLabel(target, "media:upload"));
      await click(checkboxForLabel(target, "Active (Enabled)"));
      await click(target.querySelector("[data-testid='webhook-save']"));

      await vi.waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
      expect(h.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "My Hook",
          url: "https://example.test/my-hook",
          active: false,
          events: expect.arrayContaining(["entry:publish", "media:upload"]),
          secret: expect.any(String),
        }),
      );
      await vi.waitFor(() =>
        expect(target.querySelector("[data-testid='webhooks-modal']")).not.toBeInTheDocument(),
      );
      expect(h.list).toHaveBeenCalledTimes(2);
    } finally {
      cleanup();
    }
  });

  it("edits an existing webhook with its id", async () => {
    const { target, cleanup } = await mount();
    try {
      const card = target.querySelector("[data-testid='webhook-card-hook-1']")!;
      await click(card.querySelector("[data-testid='webhook-edit']"));
      await settle();

      expect(modal(target).textContent).toContain("Edit Webhook");
      expect(input(target, "webhook-name").value).toBe("Deploy Hook");
      expect(input(target, "webhook-url").value).toBe("https://example.test/deploy");

      await typeText(input(target, "webhook-name"), "Renamed Hook");
      await click(target.querySelector("[data-testid='webhook-save']"));

      await vi.waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
      expect(h.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "hook-1", name: "Renamed Hook" }),
      );
    } finally {
      cleanup();
    }
  });

  it("regenerates the signing secret", async () => {
    const { target, cleanup } = await mount();
    try {
      await click(target.querySelector("[data-testid='webhooks-add']"));
      await settle();

      const secret = input(target, "webhook-secret");
      const before = secret.value;
      await click(target.querySelector("[data-testid='webhook-regenerate-secret']"));

      expect(secret.value).not.toBe(before);
      expect(secret.value.length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  it("sends a test delivery", async () => {
    const { target, cleanup } = await mount();
    try {
      const card = target.querySelector("[data-testid='webhook-card-hook-2']")!;
      await click(card.querySelector("[data-testid='webhook-test']"));

      await vi.waitFor(() => expect(h.test).toHaveBeenCalledWith("hook-2"));
      expect(h.toast.success).toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it("deletes after confirmation and reloads the list", async () => {
    const { target, cleanup } = await mount();
    try {
      const card = target.querySelector("[data-testid='webhook-card-hook-1']")!;
      await click(card.querySelector("[data-testid='webhook-delete']"));

      expect(h.confirm).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => expect(h.remove).toHaveBeenCalledWith("hook-1"));
      await vi.waitFor(() => expect(h.list).toHaveBeenCalledTimes(2));
      expect(h.toast.success).toHaveBeenCalledWith("Webhook deleted");
    } finally {
      cleanup();
    }
  });
});
