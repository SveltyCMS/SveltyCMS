/**
 * @file src/routes/api/content/version/+server.ts
 * @description Thin API wrapper for fetching content version delegating to Local SDK.
 */

import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";

export const GET = apiHandler(async ({ locals }) => {
  const { cms } = locals;
  const version = cms?.version || 0;
  return json({ success: true, version });
});
