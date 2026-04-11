/*
 * @files api/telemetry/register/+server.ts
 * @description Telemetry Registration Endpoint (Receiver Implementation)
 *
 * This endpoint is used by SveltyCMS clients to obtain a unique secret
 * for signing telemetry payloads.
 *
 * ### Security
 * - Rate limited by IP
 * - Cryptographically secure secret generation
 */

import { json } from "@sveltejs/kit";
import { randomBytes } from "node:crypto";
import { logger } from "@utils/logger.server";

// Unified Error Handling
import { apiHandler } from "@utils/api-handler";

export const POST = apiHandler(async ({ request }) => {
  try {
    const { installation_id } = await request.json();

    if (!installation_id || typeof installation_id !== "string") {
      return json({ error: "Invalid installation_id" }, { status: 400 });
    }

    // 1. Generate a cryptographically secure 64-character hex string
    const uniqueSecret = randomBytes(32).toString("hex");

    // 2. Save it to your central database
    // NOTE: In a real receiver, you would upsert this to your MongoDB/Postgres
    // await db.collection("installations").updateOne(
    //   { installation_id },
    //   { $set: { client_secret: uniqueSecret, registered_at: new Date() } },
    //   { upsert: true }
    // );

    logger.info(`[Telemetry Receiver] Registered new installation: ${installation_id}`);

    // 3. Send it back to the SveltyCMS client
    return json({ success: true, secret: uniqueSecret });
  } catch (error) {
    logger.error("[Telemetry Receiver] Registration failed:", error);
    return json({ error: "Registration failed" }, { status: 500 });
  }
});
