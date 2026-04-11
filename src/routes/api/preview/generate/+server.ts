/**
 * @file src/routes/api/preview/generate/+server.ts
 * @description Securely generate authorized live preview URLs for authenticated users.
 */

import { previewService } from "@src/services/preview-service";
import { json } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";

export const POST = apiHandler(async ({ request, locals }) => {
  if (!locals.user) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }

  const { schema, entry, contentLanguage, tenantId } = await request.json();

  if (!schema || !entry || !contentLanguage) {
    throw new AppError(
      "Missing required parameters: schema, entry, contentLanguage",
      400,
      "MISSING_PARAMS",
    );
  }

  // Permission check: User must be admin or editor
  const role = locals.user.role;
  if (role !== "admin" && role !== "editor" && role !== "developer") {
    throw new AppError("Insufficient permissions for live preview", 403, "FORBIDDEN");
  }

  const previewUrl = previewService.generatePreviewUrl(
    schema,
    entry,
    contentLanguage,
    tenantId || locals.tenantId,
    locals.user._id,
  );

  return json({ previewUrl });
});
