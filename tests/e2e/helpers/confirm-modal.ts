/**
 * @file tests/e2e/helpers/confirm-modal.ts
 * @description Click the app showConfirm primary action (no soft-skip).
 *
 * Prefer data-testid + app dialog scoping so we never hit:
 * - table row "Delete" buttons (accessible name often just "Delete")
 * - GDPR cookie "Accept All" / privacy dialogs
 */

import { expect, type Page } from "@playwright/test";

const ACTION_TIMEOUT = 20_000;

/** Confirm destructive/modal actions from `@utils/modal.svelte` showConfirm. */
export async function confirmModal(page: Page, timeout = ACTION_TIMEOUT) {
  // 1) Preferred: stable testid on ConfirmDialog (added 2026-08)
  const byTestId = page.getByTestId("modal-confirm");
  if (
    await byTestId
      .first()
      .isVisible({ timeout: Math.min(2_000, timeout) })
      .catch(() => false)
  ) {
    await byTestId.first().click({ timeout });
    return;
  }

  // 2) App dialog only — exclude cookie / privacy banners
  const appDialog = page
    .getByRole("dialog")
    .filter({ hasNotText: /we value your privacy|cookie|privacy policy/i })
    .filter({ hasText: /delete|confirm|are you sure|cannot be undone/i });

  await expect(appDialog.first()).toBeVisible({ timeout });

  // Prefer primary action inside the confirm dialog only (never page table Delete)
  const confirmInDialog = appDialog
    .first()
    .getByTestId("modal-confirm")
    .or(appDialog.first().getByRole("button", { name: /^(confirm|delete|yes|ok|restore)$/i }));

  await expect(confirmInDialog.first()).toBeVisible({ timeout });
  await confirmInDialog.first().click({ timeout });
}
