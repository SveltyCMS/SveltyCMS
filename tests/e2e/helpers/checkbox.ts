/**
 * @file tests/e2e/helpers/checkbox.ts
 * @description Toggle a SveltyCMS `<Checkbox>` through its visible label.
 *
 * The native input is `sr-only` (1×1px, clipped), so Playwright's actionability
 * check rejects a direct click and `evaluate(el => el.click())` bypasses the
 * real hit-target. Clicking the `label[for]` is what a user actually does — if
 * an overlay intercepts it, the test should fail.
 */

import { expect, type Locator } from "@playwright/test";

/**
 * Click the visible label for `input`, then assert the checked state flipped.
 * Returns the new checked value.
 */
export async function toggleCheckbox(input: Locator): Promise<boolean> {
  const id = await input.getAttribute("id");
  if (!id) throw new Error("toggleCheckbox(): checkbox input has no id");

  const label = input.page().locator(`label[for="${id}"]`).first();
  const before = await input.isChecked();
  await label.click();
  await expect(input).toBeChecked({ checked: !before });
  return !before;
}
