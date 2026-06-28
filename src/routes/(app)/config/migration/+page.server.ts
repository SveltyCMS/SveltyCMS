/**
 * @file src/routes/(app)/config/migration/+page.server.ts
 * @description Legacy redirect — migration wizard moved to plugin page slot.
 */

import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = () => {
  throw redirect(301, "/config?plugin=smart-importer");
};
