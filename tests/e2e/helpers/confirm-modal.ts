/**
 * @file tests/e2e/helpers/confirm-modal.ts
 * @description Click the app showConfirm primary action (no soft-skip).
 */

import { expect, type Page } from "@playwright/test";

const ACTION_TIMEOUT = 20_000;

/** Confirm destructive/modal actions from `@utils/modal.svelte` showConfirm. */
export async function confirmModal(page: Page, timeout = ACTION_TIMEOUT) {
  const confirmBtn = page
    .getByRole("button", { name: /^(confirm|delete|yes|ok|restore)$/i })
    .or(page.getByTestId("modal-confirm"));
  await expect(confirmBtn.first()).toBeVisible({ timeout });
  await confirmBtn.first().click();
}
