/**
 * @file src/routes/api/utils/translate-collection/+server.ts
 * @description API endpoint for bulk collection translation
 */

import { jobQueue } from "@src/services/jobs/job-queue-service";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";

export const POST = apiHandler(async ({ request, locals }) => {
  const { user, tenantId } = locals;

  // Require authentication
  if (!user) {
    throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  }

  const body = await request.json();
  const { collectionName, targetLanguages, sourceLanguage } = body;

  // Validate required parameters
  if (!collectionName) {
    throw new AppError("Collection name is required", 400, "MISSING_COLLECTION_NAME");
  }

  if (!targetLanguages || !Array.isArray(targetLanguages) || targetLanguages.length === 0) {
    throw new AppError("Target languages array is required", 400, "MISSING_TARGET_LANGUAGES");
  }

  const jobId = await jobQueue.dispatch(
    "bulk-translate",
    {
      collectionName,
      targetLanguages,
      sourceLanguage,
      tenantId,
    },
    tenantId || undefined,
  );

  if (jobId) {
    return json({
      success: true,
      message: "Bulk translation started in background",
      jobId,
      status: "pending",
    });
  } else {
    throw new AppError("Failed to dispatch background translation job", 500, "JOB_DISPATCH_FAILED");
  }
});
