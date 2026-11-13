/**
 * @vitest-environment jsdom
 * @file tests/unit/components/dom/cart-setqty-error.test.ts
 * @description The guest cart's `setQty` must surface a failed PATCH instead of
 * reloading the stale cart and pretending the quantity changed.
 *
 * `setQty` previously `await fetch(...)`ed the PATCH and unconditionally called
 * `load()` again, so a non-OK response (or a 200 envelope carrying
 * `success: false`) was silently ignored — the line re-rendered with its old
 * quantity and no error.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import CartPage from "@src/routes/(site)/cart/+page.svelte";
import { click, renderComponent, type RenderedComponent } from "./render";

function jsonResponse(ok: boolean, status: number, body: unknown): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

const LINE = { productId: "prod_1", title: "Test Product", qty: 1, sku: "SKU-1" };

describe("Guest cart setQty", () => {
  let rendered: RenderedComponent | null = null;

  afterEach(() => {
    rendered?.cleanup();
    rendered = null;
    vi.unstubAllGlobals();
  });

  it("shows the API error when the PATCH write fails instead of silently reloading", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return jsonResponse(false, 400, {
          success: false,
          message: "Quantity must be at least 1.",
        });
      }
      return jsonResponse(true, 200, {
        success: true,
        data: { items: [LINE], subtotal: 10 },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    rendered = renderComponent(CartPage, {});
    await vi.waitFor(() => {
      expect(rendered!.target.querySelector('button[aria-label="Increase quantity"]')).toBeTruthy();
    });

    const increase = rendered.target.querySelector<HTMLButtonElement>(
      'button[aria-label="Increase quantity"]',
    );
    await click(increase);

    await vi.waitFor(() => {
      const alert = rendered!.target.querySelector('[role="alert"]');
      expect(alert).toBeTruthy();
      expect(alert?.textContent).toContain("Quantity must be at least 1.");
    });
  });
});
