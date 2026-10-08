/**
 * @file src/routes/indexnow.txt/+server.ts
 * @description IndexNow key file. The protocol (indexnow.org) verifies site
 * ownership by fetching the key file at the submitted `keyLocation` (this
 * fixed path). Serves only the configured key; 404s when no key is set.
 */

import type { RequestHandler } from "@sveltejs/kit";
import { getPublicSettingSync } from "@src/services/core/settings-service";

export const GET: RequestHandler = async () => {
  const key = getPublicSettingSync("INDEXNOW_KEY");
  if (!key) return new Response("Not Found", { status: 404 });
  return new Response(key, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
};
