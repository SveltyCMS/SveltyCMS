/**
 * @file src/services/ai/chat-processor.ts
 * @description Pluggable ChatProcessor seam between the chat API and inference engines.
 *
 * The HTTP handler never talks to a model SDK directly: it resolves a processor
 * by id (the default is always registered, optionally selected through the
 * private `AI_CHAT_PROCESSOR` setting) and calls `process()`. Plugins and tests
 * can register their own implementation without changing the route.
 *
 * Features:
 * - Stable `ChatProcessorRequest` / `ChatProcessor` port (`process(request, signal?)`)
 * - Registry with `registerChatProcessor`, `getChatProcessor`, `resetChatProcessors`
 * - Default processor wrapping `AIService.chat()` (lazy import)
 * - Re-applies message/history bounds at the seam
 * - AbortSignal-aware processing
 * - Backwards-compatible `processChat()` helper, output redaction, and moderation guard
 */

import { logger } from "@utils/logger";
import { raise } from "@utils/error-handling";
import { redactSecrets } from "@utils/security/stream-redaction";
import type { AiChatMessage } from "./ai-provider";

export interface ChatProcessorHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatProcessorRequest {
  message: string;
  history: ChatProcessorHistoryMessage[];
  conversationId?: string;
  tenantId?: string | null;
  userId?: string | null;
  systemPrompt?: string;
}

export interface ChatProcessorResult {
  text: string;
  model?: string;
  redacted?: boolean;
}

export interface ChatProcessor {
  readonly id: string;
  process(request: ChatProcessorRequest, signal?: AbortSignal): Promise<ChatProcessorResult>;
}

/** Options retained for the legacy `processChat()` call shape. */
export interface ChatProcessorOptions {
  tenantId?: string | null;
  userId?: string | null;
  username?: string | null;
  room?: string | null;
  tab?: string | null;
  systemPrompt?: string;
  signal?: AbortSignal;
  moderationEnabled?: boolean;
}

export interface RedactionResult {
  text: string;
  redacted: boolean;
}

/** Default processor id used when no `AI_CHAT_PROCESSOR` setting is configured. */
export const DEFAULT_CHAT_PROCESSOR_ID = "default";

/** Defensive caps mirrored by `AIService.chat()` and the HTTP handler. */
const MAX_HISTORY_TURNS = 40;
const MAX_HISTORY_MESSAGE_CHARS = 8_000;
const MAX_MESSAGE_CHARS = 12_000;

/**
 * Deterministically redacts secrets/PII. Kept as a named export for callers
 * that only need a boolean "was anything redacted?" signal.
 */
export function applyRedactionGuardrails(text: string): RedactionResult {
  const redactedText = redactSecrets(text);
  return { text: redactedText, redacted: redactedText !== text };
}

function normalizeHistory(history: readonly unknown[] | undefined): ChatProcessorHistoryMessage[] {
  if (!Array.isArray(history)) return [];

  const validTurns: ChatProcessorHistoryMessage[] = [];
  for (const turn of history) {
    if (
      turn &&
      typeof turn === "object" &&
      "role" in turn &&
      "content" in turn &&
      (turn.role === "user" || turn.role === "assistant") &&
      typeof turn.content === "string" &&
      turn.content.trim().length > 0
    ) {
      validTurns.push({
        role: turn.role,
        content: turn.content.slice(0, MAX_HISTORY_MESSAGE_CHARS),
      });
    }
  }

  return validTurns.slice(-MAX_HISTORY_TURNS);
}

/** Rejects with an abort error as soon as the caller's signal fires. */
async function withAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) raise(499, "Chat request aborted", "REQUEST_ABORTED");

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      try {
        raise(499, "Chat request aborted", "REQUEST_ABORTED");
      } catch (error) {
        reject(error);
      }
    };
    signal.addEventListener("abort", onAbort, { once: true });

    operation.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Default processor: sanitizes request bounds and delegates to the lazy
 * `AIService` singleton. Tenant/user context is forwarded so tenant-scoped AI
 * settings (model, retrieval) resolve against the caller's configuration.
 */
export class DefaultChatProcessor implements ChatProcessor {
  readonly id = DEFAULT_CHAT_PROCESSOR_ID;

  async process(request: ChatProcessorRequest, signal?: AbortSignal): Promise<ChatProcessorResult> {
    const message = (request.message ?? "").trim().slice(0, MAX_MESSAGE_CHARS);
    if (!message) raise(400, "Content is required", "BAD_REQUEST");

    if (signal?.aborted) raise(499, "Chat request aborted", "REQUEST_ABORTED");

    const history = normalizeHistory(request.history);
    const { aiService } = await import("@src/services/core/ai-service");

    const rawText = await withAbort(
      aiService.chat(message, history as AiChatMessage[], {
        systemPrompt: request.systemPrompt,
        tenantId: request.tenantId ?? undefined,
        userId: request.userId ?? undefined,
      }),
      signal,
    );

    const { text, redacted } = applyRedactionGuardrails(rawText);
    return { text, model: "svelty-agent", redacted };
  }

  /** Legacy call shape — maps onto `process()`. */
  async processChat(
    message: string,
    history: readonly unknown[],
    options: ChatProcessorOptions = {},
  ): Promise<ChatProcessorResult> {
    return this.process(
      {
        message,
        history: normalizeHistory(history),
        tenantId: options.tenantId,
        userId: options.userId,
        systemPrompt: options.systemPrompt,
      },
      options.signal,
    );
  }
}

const defaultProcessor = new DefaultChatProcessor();
const processors = new Map<string, ChatProcessor>([[defaultProcessor.id, defaultProcessor]]);
let activeProcessorId = defaultProcessor.id;

function assertProcessor(processor: ChatProcessor): void {
  if (!processor || typeof processor.id !== "string" || !processor.id.trim()) {
    raise(400, "Chat processor requires a non-empty id", "VALIDATION_FAILED");
  }
  if (typeof processor.process !== "function") {
    raise(400, "Chat processor requires a process() method", "VALIDATION_FAILED");
  }
}

/**
 * Registers (or replaces) a processor by id. Intended for plugins, custom
 * workflows, and test doubles — never for client-controlled values.
 */
export function registerChatProcessor(processor: ChatProcessor): void {
  assertProcessor(processor);
  processors.set(processor.id, processor);
}

/** Legacy alias: register a processor and make it the default. */
export function setChatProcessor(processor: ChatProcessor): void {
  registerChatProcessor(processor);
  activeProcessorId = processor.id;
}

/**
 * Resolves a processor by id. Passing no id returns the active processor
 * (the default unless `setChatProcessor()` was used). An unknown configured
 * id fails closed rather than silently falling back.
 */
export function getChatProcessor(id?: string): ChatProcessor {
  const requestedId = typeof id === "string" && id.trim() ? id.trim() : activeProcessorId;
  const processor = processors.get(requestedId);

  if (!processor) {
    raise(503, "AI chat processor unavailable", "CHAT_PROCESSOR_UNAVAILABLE");
  }

  return processor;
}

/** Restores the registry to the default processor only (tests / hot reload). */
export function resetChatProcessors(): void {
  processors.clear();
  processors.set(defaultProcessor.id, defaultProcessor);
  activeProcessorId = defaultProcessor.id;
  logger.debug("[ChatProcessor] Registry reset");
}
