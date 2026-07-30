/**
 * @file src/routes/(app)/config/appearance/+page.server.ts
 * @description Redirect legacy Appearance URL into Design System (canonical).
 *
 * Preserves `?tab=` so deep links like `/config/appearance?tab=overrides`
 * land on `/config/design-system?tab=overrides`.
 */

import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url }) => {
  const tab = url.searchParams.get("tab");
  const qs = tab ? `?tab=${encodeURIComponent(tab)}` : "";
  throw redirect(302, `/config/design-system${qs}`);
};
