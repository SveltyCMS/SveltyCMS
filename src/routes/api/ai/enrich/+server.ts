import { json } from "@sveltejs/kit";
import { aiService } from "@src/services/ai-service";
import type { RequestHandler } from "./$types";
import { logger } from "@utils/logger.server";
import { getPrivateSettingSync } from "@src/services/settings-service";

export const POST: RequestHandler = async ({ request, locals }) => {
  // 1. Authentication Check
  if (!locals.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tenantId } = locals;
  if (getPrivateSettingSync("MULTI_TENANT") && !tenantId) {
    return json({ error: "Tenant ID required" }, { status: 403 });
  }

  try {
    const { text, action, customPrompt, language } = await request.json();

    if (!text) {
      return json({ error: "Source text is empty" }, { status: 400 });
    }

    let prompt = "";

    switch (action) {
      case "summarize":
        prompt = `Summarize the following text concisely in ${language}. Keep it professional.`;
        break;
      case "seo":
        prompt = `Generate a compelling SEO meta description (max 160 characters) in ${language} based on this text. Return ONLY the description.`;
        break;
      case "keywords":
        prompt = `Extract the most important keywords from this text. Return them as a comma-separated list in ${language}.`;
        break;
      case "translate":
        prompt = `Translate the following text accurately into ${language}. Preserve the tone and formatting.`;
        break;
      case "custom":
        prompt = customPrompt || "Process the following text.";
        break;
      default:
        return json({ error: "Invalid action" }, { status: 400 });
    }

    const result = await aiService.process(prompt, text);

    return json({ result });
  } catch (err: any) {
    logger.error("[AI Enrich API] Error:", err);
    return json({ error: err.message }, { status: 500 });
  }
};
