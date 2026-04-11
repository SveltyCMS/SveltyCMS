/**
 * @file src/routes/api/ai/generate-layout/+server.ts
 * @description API endpoint for generating AI-native layouts.
 */

import { aiService } from "@services/ai-service";
import { getPrivateSettingSync } from "@src/services/settings-service";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, locals }) => {
  // 1. Check if user is logged in
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId } = locals;
  if (getPrivateSettingSync("MULTI_TENANT") && !tenantId) {
    return json({ error: "Tenant ID required" }, { status: 403 });
  }

  try {
    const { prompt, contextRules } = await request.json();

    if (!prompt) {
      return json({ error: "Prompt is required" }, { status: 400 });
    }

    // AIService is stateless, but passing context is good practice
    const spec = await aiService.generateLayoutSpec(prompt, contextRules || "");

    if (!spec) {
      return json({ error: "Failed to generate layout spec" }, { status: 500 });
    }

    return json({ spec });
  } catch (err: any) {
    console.error("AI Layout API Error:", err);
    return json({ error: err.message }, { status: 500 });
  }
};
