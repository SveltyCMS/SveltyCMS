/**
 * @file src/routes/api/restart.ts
 * @description Secure API endpoint to restart the dev server using PM2.
 *
 * This module provides functionality to:
 * - Trigger a server restart via a POST request
 * - Execute a system command to restart the server
 *
 * Features:
 * - Asynchronous server restart
 * - Error handling and logging
 * - Detailed stdout and stderr logging
 *
 * Usage:
 * POST /api/restart
 * Returns: JSON object with 'success' boolean and optional 'error' message
 *
 * Note: This endpoint performs a critical system operation.
 * Ensure proper authentication, authorization, and security measures are in place.
 * The actual restart command should be properly configured for your specific environment.
 */

import { exec } from "node:child_process";
import { json } from "@sveltejs/kit";
// Unified Error Handling
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
// type RequestHandler removed
import { logger } from "@utils/logger.server";

export const POST = apiHandler(async ({ request }) => {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "").trim();

  if (!token || token !== process.env.ADMIN_RESTART_TOKEN) {
    logger.warn("❌ Unauthorized restart attempt");
    throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  }

  try {
    await restartServer();
    logger.info("✅ Server restart initiated");
    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("❌ Error during restart:", { error: message });
    throw new AppError(message, 500, "RESTART_FAILED");
  }
});

async function restartServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const restartCommand = "pm2 restart sveltycms-dev";
    logger.info(`🔁 Executing: ${restartCommand}`);

    exec(restartCommand, (error, stdout, stderr) => {
      if (error) {
        logger.error("❌ Exec error:", { error: error.message });
        return reject(error);
      }

      if (stdout) {
        logger.info("📤 stdout:", { stdout });
      }
      if (stderr) {
        logger.warn("📥 stderr:", { stderr });
      }

      logger.info("✅ Restart command executed");
      resolve();
    });
  });
}
