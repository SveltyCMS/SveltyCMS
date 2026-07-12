/**
 * @file src/plugins/editable-website/license-gate.ts
 * @description Shared constants and client license status for the Editable Website bridge.
 */

export const EDITABLE_WEBSITE_PLUGIN_ID = "editable-website";
export const EDITABLE_WEBSITE_EXTENSION_ID = "plugin:editable-website";
export const EDITABLE_WEBSITE_PRICE = "€14.99";

export interface EditableWebsiteLicenseView {
  active: boolean;
  daysRemaining: number | null;
  hasLicense?: boolean;
}

/** Returns whether the collection schema has live preview configured. */
export function collectionHasLivePreview(livePreview: unknown): boolean {
  return livePreview === true || (typeof livePreview === "string" && livePreview.length > 0);
}

/** Fetches license/trial status for the Editable Website plugin (CMS UI). */
export async function fetchEditableWebsiteLicense(): Promise<EditableWebsiteLicenseView> {
  try {
    const res = await fetch(
      `/api/system/license-status?type=plugin&id=${EDITABLE_WEBSITE_PLUGIN_ID}`,
      { credentials: "include" },
    );
    if (!res.ok) {
      return { active: false, daysRemaining: 0 };
    }
    const data = (await res.json()) as EditableWebsiteLicenseView;
    return {
      active: !!data.active,
      daysRemaining: data.daysRemaining ?? null,
      hasLicense: data.hasLicense,
    };
  } catch {
    return { active: false, daysRemaining: 0 };
  }
}
