/**
 * @file src/plugins/editable-website/license-gate.server.ts
 * @description Server-side license gate for Live Preview bridge APIs only.
 */

import { checkExtensionLicense } from "@src/utils/license-manager";
import { error } from "@sveltejs/kit";
import type { LicenseStatus } from "@src/utils/license-manager";
import { EDITABLE_WEBSITE_PLUGIN_ID } from "./license-gate";

const LICENSE_MESSAGE =
  "Active Editable Website license required for Live Preview. Purchase at marketplace.sveltycms.com or use the 14-day trial. CMS form editing remains available without a license.";

/** Checks license/trial without throwing. */
export async function getEditableWebsiteLicenseStatus(): Promise<LicenseStatus> {
  return checkExtensionLicense("plugin", EDITABLE_WEBSITE_PLUGIN_ID);
}

/**
 * Gates Live Preview bridge endpoints only — never call from collection save hooks.
 * @throws SvelteKit 403 when license/trial is inactive
 */
export async function requireEditableWebsiteLicense(): Promise<LicenseStatus> {
  const status = await getEditableWebsiteLicenseStatus();
  if (!status.active) {
    throw error(403, LICENSE_MESSAGE);
  }
  return status;
}
