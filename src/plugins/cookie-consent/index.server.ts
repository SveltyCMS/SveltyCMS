/**
 * @file src/plugins/cookie-consent/index.server.ts
 * @description Server-side module for Cookie Consent Manager plugin.
 *
 * Exposes server routes for consent audit logging without pulling server
 * dependencies into the client bundle graph.
 */

import { json } from "@sveltejs/kit";
import { getDb } from "@src/databases/db";
import type { PluginPart, PluginServerModule } from "../types";
import { handleConsentLog } from "./api.server";

export const parts: PluginPart[] = [
  {
    type: "route",
    routes: [
      {
        path: "/api/plugins/cookie-consent/consent",
        method: "POST",
        requiredCapabilities: "public",
        handler: async (event) => {
          const body = await event.request.json().catch(() => null);
          if (!body || typeof body !== "object") {
            return json({ success: false, message: "Invalid payload" }, { status: 400 });
          }
          const db = await getDb();
          if (!db) {
            return json({ success: false, message: "Database not ready" }, { status: 503 });
          }
          const tenantId = (event.locals as { tenantId?: string })?.tenantId || "default";
          const result = await handleConsentLog(db, body, tenantId);
          return json(result, { status: result.success ? 200 : 400 });
        },
      },
    ],
  },
];

const serverModule: PluginServerModule = {
  parts,
};

export default serverModule;
