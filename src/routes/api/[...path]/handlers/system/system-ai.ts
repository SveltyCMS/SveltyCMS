/**
 * @file src/routes/api/[...path]/handlers/system/system-ai.ts
 * @description AI chat, enrichment, translation, and AI-builder routes.
 */

import { logger } from "@src/utils/logger";
import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { successResponse } from "../base";
import { isMultiTenantEnabled } from "@utils/tenant-isolation.server";
import { isAdmin } from "@src/databases/auth/constants";
import {
  array,
  maxLength,
  minLength,
  object,
  optional,
  picklist,
  pipe,
  safeParse,
  string,
  trim,
} from "valibot";

/** Cached lazy handle to the event bus — one module-registry lookup instead of one per call. */
let eventBusModulePromise:
  | Promise<typeof import("@src/services/background/automation/event-bus")>
  | undefined;
function loadEventBusModule(): Promise<
  typeof import("@src/services/background/automation/event-bus")
> {
  return (eventBusModulePromise ??= import("@src/services/background/automation/event-bus"));
}

/**
 * Chat history is client-supplied, so it is untrusted: only `user`/`assistant`
 * turns are accepted (never `system`), each capped, and the turn count is
 * bounded. `AIService.chat()` re-applies the same limits for direct callers.
 */
const ChatHistoryMessageSchema = object({
  role: picklist(["user", "assistant"]),
  content: pipe(string(), trim(), maxLength(8_000, "history message is too long")),
});

const AiChatRequestSchema = object({
  userMessage: optional(pipe(string(), trim(), maxLength(12_000, "message is too long"))),
  content: optional(pipe(string(), trim(), maxLength(12_000, "message is too long"))),
  history: optional(array(ChatHistoryMessageSchema)),
  room: optional(string()),
  tab: optional(string()),
});

const ENRICH_ACTIONS = [
  "summarize",
  "rewrite",
  "seo",
  "tags",
  "keywords",
  "translate",
  "custom",
] as const;

const AiEnrichRequestSchema = object({
  text: pipe(
    string(),
    trim(),
    minLength(1, "text is required"),
    maxLength(12_000, "text is too long"),
  ),
  action: picklist(ENRICH_ACTIONS),
  language: optional(string()),
  customPrompt: optional(pipe(string(), trim(), maxLength(500, "customPrompt is too long"))),
});

/** Bound the conversation length before it reaches the model (cost/latency guard). */
const MAX_CHAT_HISTORY_TURNS = 40;

/**
 * --- AI ---
 */
export async function handleAiRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, locals } = event;
  if (isMultiTenantEnabled() && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }
  const action = segments[1];
  const body = await request.json();
  const { aiService } = await import("@src/services/core/ai-service");
  const { eventBus } = await loadEventBusModule();

  if (action === "chat") {
    const parsed = safeParse(AiChatRequestSchema, body);
    if (!parsed.success) {
      throw new AppError("Invalid chat payload", 400, "VALIDATION_FAILED");
    }

    const { userMessage, content, history = [], room, tab } = parsed.output;
    const text = (userMessage || content || "").trim();

    if (!text) throw new AppError("Content is required", 400);

    const userPayload = locals.user
      ? {
          id: locals.user._id.toString(),
          username: locals.user.username,
          email: locals.user.email,
          avatar: locals.user.avatar,
        }
      : { id: "guest", username: "Guest" };

    eventBus.emit("chat:message", {
      user: userPayload,
      data: { text, room: room || null, tab: tab || "chat" },
      tenantId,
    });

    if (!room) {
      (async () => {
        try {
          const aiResponse = await aiService.chat(text, history.slice(-MAX_CHAT_HISTORY_TURNS));
          eventBus.emit("ai:response", {
            user: { _id: "ai", username: "SveltyAgent" },
            data: { text: aiResponse, done: true },
            tenantId,
          });
        } catch (err) {
          logger.error("RTC: AI Inference failed:", err);
        }
      })();
    }
    return successResponse(event, { success: true });
  }

  if (action === "enrich") {
    const parsed = safeParse(AiEnrichRequestSchema, body);
    if (!parsed.success) {
      throw new AppError("Invalid enrichment payload", 400, "VALIDATION_FAILED");
    }
    const { text, action: enrichAction, language, customPrompt } = parsed.output;
    return successResponse(
      event,
      await aiService.enrichText(text, enrichAction, language, customPrompt),
    );
  }

  if (action === "generate-layout" && request.method === "POST") {
    return successResponse(event, await aiService.generateLayoutSpec(body.prompt, body.context));
  }

  if (action === "score" && request.method === "POST") {
    const { content, collectionName } = body;
    if (!content) throw new AppError("Content payload is required", 400);
    const scoreResult = await aiService.scoreContent(
      content,
      collectionName || "unknown",
      body.fields,
    );
    return successResponse(event, scoreResult);
  }

  if (action === "suggest-fields" && request.method === "POST") {
    const { collectionName, description, availableWidgets } = body;
    if (!collectionName) throw new AppError("collectionName is required", 400);
    const fields = await aiService.suggestFields(
      collectionName,
      description || "",
      availableWidgets || [],
      body.fields,
    );
    return successResponse(event, fields);
  }

  if (action === "translate" && request.method === "POST") {
    const { text, sourceLang, targetLang, field, collection } = body;
    if (!text?.trim()) throw new AppError("text is required", 400);
    if (!sourceLang) throw new AppError("sourceLang is required", 400);
    if (!targetLang) throw new AppError("targetLang is required", 400);

    const { aiTranslationService } = await import("@src/services/ai-translation");
    const user = locals.user;
    const translatedText = await aiTranslationService.translateField(text, sourceLang, targetLang, {
      field: field || "unknown",
      collection: collection || "unknown",
      userId: user?._id ?? null,
      userEmail: user?.email,
      userRole: user?.role,
      tenantId: tenantId as any,
    });

    if (translatedText === null) {
      return successResponse(event, {
        translatedText: null,
        message: "AI translation unavailable",
      });
    }

    return successResponse(event, { translatedText });
  }

  if (action === "translate-collection" && request.method === "POST") {
    const { user } = locals;
    if (!user || (!user.isAdmin && user.role !== "admin")) {
      throw new AppError("Admin access required for bulk translation", 403, "FORBIDDEN");
    }
    const { collectionName, targetLanguages, sourceLanguage } = body;
    if (!collectionName || !targetLanguages?.length) {
      throw new AppError("collectionName and targetLanguages[] are required", 400);
    }
    const { jobQueue } = await import("@src/services/background/jobs/job-queue-service");
    const jobId = await jobQueue.dispatch(
      "bulk-translate",
      {
        collectionName,
        targetLanguages,
        sourceLanguage,
        tenantId: tenantId as string,
      },
      tenantId as string,
    );
    return successResponse(
      event,
      {
        success: true,
        jobId,
        message: `Bulk translation dispatched for ${collectionName} → [${targetLanguages.join(", ")}]`,
      },
      202,
    );
  }

  throw new AppError(`AI action ${action} not found`, 404);
}

/**
 * --- AI BUILDER (Phase 0) ---
 *
 * Design/refine are read-only AI proposal actions; approve-collection
 * validates, writes the schema via AST, compiles, and reloads collections.
 */
export async function handleAiBuilderRoutes(
  event: RequestEvent,
  _cms: LocalCMS,
  tenantId: DatabaseId,
  segments: string[],
) {
  const { request, locals } = event;

  if (isMultiTenantEnabled() && !tenantId) {
    throw new AppError("Tenant ID required", 400, "TENANT_REQUIRED");
  }

  // 🛡️ SECURITY: AI builder is an admin-only design surface.
  // Defense-in-depth: handler-level check independent of the middleware pipeline.
  const { user } = locals;
  if (!user) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }
  if (!isAdmin(user)) {
    throw new AppError("Admin access required for AI builder", 403, "FORBIDDEN");
  }

  if (request.method !== "POST") {
    throw new AppError(
      `Method ${request.method} not allowed for ai-builder`,
      405,
      "METHOD_NOT_ALLOWED",
    );
  }

  const action = segments[1];
  const body = await request.json().catch(() => ({}));

  if (action === "design-collection") {
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      throw new AppError("prompt is required", 400, "BAD_REQUEST");
    }

    const { designCollection } = await import("@src/services/ai-builder");
    // Quota is consumed exactly once inside designCollection() — do not pre-consume here.
    const result = await designCollection(
      {
        prompt,
        tenantId,
        existingSchema: body.existingSchema,
        language: body.language,
        availableWidgets: body.availableWidgets,
      },
      String(user._id),
    );
    return successResponse(event, result);
  }

  if (action === "refine-collection") {
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      throw new AppError("prompt is required", 400, "BAD_REQUEST");
    }
    if (!body.previousProposal) {
      throw new AppError("previousProposal is required", 400, "BAD_REQUEST");
    }

    const { refineCollection } = await import("@src/services/ai-builder");
    // Quota is consumed exactly once inside refineCollection() — do not pre-consume here.
    const result = await refineCollection(
      {
        prompt,
        tenantId,
        existingSchema: body.existingSchema,
        language: body.language,
        previousProposal: body.previousProposal,
      },
      String(user._id),
    );
    return successResponse(event, result);
  }

  if (action === "approve-collection") {
    if (!body.proposal || typeof body.proposal !== "object") {
      throw new AppError("proposal is required", 400, "BAD_REQUEST");
    }

    const { approveCollection } = await import("@src/services/ai-builder");
    const result = await approveCollection({
      proposal: body.proposal,
      tenantId,
      overwrite: body.overwrite === true,
      icon: typeof body.icon === "string" ? body.icon : undefined,
      status: typeof body.status === "string" ? body.status : "draft",
      userId: String(user._id),
      userEmail: typeof user.email === "string" ? user.email : undefined,
      userRole: typeof user.role === "string" ? user.role : undefined,
    });
    return successResponse(event, result);
  }

  throw new AppError("Unknown AI builder action", 404, "NOT_FOUND");
}
