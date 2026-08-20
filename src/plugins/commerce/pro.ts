/**
 * @file src/plugins/commerce/pro.ts
 * @description Commerce Pro gates: gift cards, bundles, subscriptions,
 * custom checkout panes. Basic cart/checkout stays free.
 */

import { checkExtensionLicense } from "@src/utils/license-manager";
import { raise } from "@utils/error-handling";

export const DEFAULT_CHECKOUT_PANES = ["contact", "shipping", "payment", "review"] as const;

export async function isCommercePro(): Promise<boolean> {
  const status = await checkExtensionLicense("plugin", "commerce");
  return Boolean(status.active || status.hasLicense);
}

export async function requireCommercePro(feature: string): Promise<void> {
  if (!(await isCommercePro())) {
    raise(403, `${feature} requires Commerce Pro.`, "LICENSE_REQUIRED");
  }
}

export async function checkoutPanes(custom?: string[]): Promise<string[]> {
  if (custom?.length) {
    await requireCommercePro("Custom checkout panes");
    return custom;
  }
  return [...DEFAULT_CHECKOUT_PANES];
}
