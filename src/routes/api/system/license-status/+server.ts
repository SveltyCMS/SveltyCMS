/**
 * @file src/routes/api/system/license-status/+server.ts
 * @description
 * API endpoint to check extension license status.
 */

import { json } from "@sveltejs/kit";
import { checkExtensionLicense } from "@src/utils/license-manager";

export async function GET({ url, locals }: any) {
  // Validate authorization
  if (!locals.user) {
    return json({ active: false, reason: "Unauthorized" }, { status: 401 });
  }

  const type = url.searchParams.get("type") as "widget" | "plugin" | "theme" | "dashboard";
  const id = url.searchParams.get("id");

  if (!type || !id) {
    return json({ active: false, reason: "Missing type or id parameters" }, { status: 400 });
  }

  const status = await checkExtensionLicense(type, id);
  return json(status);
}
