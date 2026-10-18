/**
 * @file src/routes/api/[...path]/handlers/system/system-ai.ts
 * @description AI chat, enrichment, translation, and AI-builder routes.
 */

import { logger } from "@src/utils/logger";
import { AppError, raise, rethrow } from "@utils/error-handling";
import { redactSecrets } from "@utils/security/stream-redaction";
import {
  assertConversationId,
  chatMemory,
  createConversationId,
} from "@src/services/ai/chat-memory";
import { getChatProcessor } from "@src/services/ai/chat-processor";
import { moderateAiText } from "@src/services/ai/moderation";
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
  message: optional(pipe(string(), trim(), maxLength(12_000, "message is too long"))),
  history: optional(array(ChatHistoryMessageSchema)),
  room: optional(string()),
  conversationId: optional(pipe(string(), trim(), maxLength(128, "conversationId is too long"))),
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
const MAX_CHAT_HISTORY_TURN_CHARS = 8_000;

interface ChatHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Merges persisted memory with client history without exceeding the window.
 * Duplicate turns (memory replayed by the client) are collapsed; the newest
 * turns win because the result is sliced to the tail.
 */
function mergeChatHistory(
  memory: readonly ChatHistoryTurn[],
  clientHistory: readonly ChatHistoryTurn[],
): ChatHistoryTurn[] {
  const seen = new Set<string>();
  const merged: ChatHistoryTurn[] = [];

  for (const turn of [...memory, ...clientHistory]) {
    const content = turn.content.trim().slice(0, MAX_CHAT_HISTORY_TURN_CHARS);
    if (!content) continue;
    const fingerprint = `${turn.role}\u0000${content}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    merged.push({ role: turn.role, content });
  }

  return merged.slice(-MAX_CHAT_HISTORY_TURNS);
}

/** Stable conversation id: explicit id/room, then `user-<id>`, then a UUID. */
function resolveConversationId(
  explicitId: string | undefined,
  room: string | undefined,
  userId: string | null,
): string {
  const requested = (explicitId || room || "").trim();
  if (requested) return assertConversationId(requested);
  return createConversationId(userId);
}

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
  const body = await request.json().catch(() => ({}));
  const { aiService } = await import("@src/services/core/ai-service");
  const { eventBus } = await loadEventBusModule();

  // POST /api/ai/chat/reset (and /api/system/ai/chat/reset) — caller's tenant + conversation only.
  if (action === "chat" && segments[2] === "reset") {
    if (request.method !== "POST") {
      raise(405, "Method not allowed", "METHOD_NOT_ALLOWED");
    }
    const user = locals.user;
    if (!user) {
      raise(401, "Authentication required", "UNAUTHORIZED");
    }
    if (isMultiTenantEnabled() && !tenantId) {
      raise(400, "Tenant ID required", "TENANT_REQUIRED");
    }

    const requestedConversationId =
      typeof (body as { conversationId?: unknown }).conversationId === "string"
        ? (body as { conversationId: string }).conversationId.trim()
        : undefined;
    const conversationId = requestedConversationId
      ? assertConversationId(requestedConversationId)
      : createConversationId(String(user._id));

    await chatMemory.reset(tenantId, conversationId);
    return successResponse(event, { success: true });
  }

  if (action === "chat") {
    const parsed = safeParse(AiChatRequestSchema, body);
    if (!parsed.success) {
      throw new AppError("Invalid chat payload", 400, "VALIDATION_FAILED");
    }

    const {
      userMessage,
      content,
      message,
      history = [],
      room,
      tab,
      conversationId: requestedConversationId,
    } = parsed.output;
    const text = (userMessage || content || message || "").trim();

    if (!text) throw new AppError("Content is required", 400);

    const userId = locals.user?._id?.toString() ?? null;
    const conversationId = resolveConversationId(requestedConversationId, room, userId);

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
      data: { text, room: room || null, tab: tab || "chat", conversationId },
      tenantId,
    });

    if (!room) {
      void (async () => {
        try {
          // Persist the user turn before inference; prior memory is merged with
          // client history but the current message is supplied separately.
          const priorTurns = await chatMemory.get(tenantId, conversationId);
          await chatMemory.append(tenantId, conversationId, { role: "user", content: text });
          const mergedHistory = mergeChatHistory(priorTurns, history);

          const { getUntypedSetting } = await import("@src/services/core/settings-service");
          const configuredProcessorId = await getUntypedSetting<string>(
            "AI_CHAT_PROCESSOR",
            "private",
            tenantId ?? undefined,
          );
          const processor = getChatProcessor(
            typeof configuredProcessorId === "string" ? configuredProcessorId.trim() : undefined,
          );

          const result = await processor.process(
            {
              message: text,
              history: mergedHistory,
              conversationId,
              tenantId: tenantId ?? null,
              userId,
            },
            request.signal,
          );

          // 🛡️ Fail-closed moderation: provider configured + unavailable ⇒ no text.
          try {
            const moderation = await moderateAiText(result.text, {
              tenantId: tenantId ?? null,
              userId,
            });
            if (!moderation.allowed) {
              eventBus.emit("ai:response", {
                user: { _id: "ai", username: "SveltyAgent" },
                data: {
                  text: "",
                  done: true,
                  error: "MODERATION_BLOCKED",
                  reason: moderation.reason ?? "moderation_flagged",
                },
                tenantId,
              });
              return;
            }
          } catch (moderationError) {
            rethrow(moderationError);
            logger.warn("RTC: AI moderation unavailable; response suppressed", { tenantId });
            eventBus.emit("ai:response", {
              user: { _id: "ai", username: "SveltyAgent" },
              data: { text: "", done: true, error: "MODERATION_UNAVAILABLE" },
              tenantId,
            });
            return;
          }

          const safeText = redactSecrets(result.text);
          await chatMemory.append(tenantId, conversationId, {
            role: "assistant",
            content: safeText,
          });

          eventBus.emit("ai:response", {
            user: { _id: "ai", username: "SveltyAgent" },
            data: { text: safeText, done: true, redacted: safeText !== result.text },
            tenantId,
          });
        } catch (err) {
          rethrow(err);
          logger.error("RTC: AI inference failed", {
            tenantId,
            message: redactSecrets(err instanceof Error ? err.message : String(err)),
          });
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
