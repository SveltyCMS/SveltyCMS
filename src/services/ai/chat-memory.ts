/**
 * @file src/services/ai/chat-memory.ts
 * @description Tenant-scoped server-side chat memory with a bounded context window.
 *
 * Memory is stored in `cacheService` (L1 + L2) under a tenant- and conversation-
 * scoped key, with a small in-process mirror for low-latency reads. Only whole
 * turns are ever dropped: a turn is never split by the context window.
 *
 * Features:
 * - `append` / `get` / `reset` scoped by tenant + conversation id
 * - Bounded window: 40 turns, 8,000 chars/turn, 32,000 chars total
 * - Conversation-id validation and tenant requirement under MULTI_TENANT
 * - 24h TTL; `reset` deletes both L1 and L2 entries
 * - Serialized read-modify-write per conversation (in-process)
 */

import { logger } from "@utils/logger";
import { raise, rethrow } from "@utils/error-handling";
import { nowISODateString } from "@utils/date";
import type { ISODateString } from "@src/content/types";
import { isMultiTenantEnabled } from "@utils/tenant-isolation.server";
import { cacheService } from "@src/databases/cache/cache-service";

export type ChatTurnRole = "user" | "assistant";

export interface ChatTurn {
  role: ChatTurnRole;
  content: string;
  at: ISODateString;
}

export interface ChatTurnInput {
  role: ChatTurnRole;
  content: string;
  at?: ISODateString;
}

/** Maximum number of turns retained per conversation. */
export const MAX_CHAT_MEMORY_TURNS = 40;
/** Maximum characters retained per turn. */
export const MAX_CHAT_MEMORY_TURN_CHARS = 8_000;
/** Maximum characters retained across all turns. */
export const MAX_CHAT_MEMORY_TOTAL_CHARS = 32_000;
/** TTL for a conversation, in seconds (24 hours). */
export const CHAT_MEMORY_TTL_SECONDS = 24 * 60 * 60;

/** Conversation ids are client-supplied in some flows — keep them filename/key safe. */
const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
/** Bound the in-process mirror so long-lived processes cannot grow unbounded. */
const MAX_MIRROR_CONVERSATIONS = 256;

const GLOBAL_TENANT = "global";

export function isValidConversationId(value: unknown): value is string {
  return typeof value === "string" && CONVERSATION_ID_PATTERN.test(value);
}

/** Validates a conversation id, raising a 400 for malformed client input. */
export function assertConversationId(value: unknown): string {
  if (!isValidConversationId(value)) {
    raise(400, "Invalid conversationId", "VALIDATION_FAILED");
  }
  return value;
}

/**
 * Derives a stable conversation id for a user (`user-<id>`) or a CSPRNG UUID
 * for anonymous callers. The `user-` form stays within the allowed id grammar.
 */
export function createConversationId(userId?: string | null): string {
  if (typeof userId === "string" && userId.trim()) {
    const safeUserId = userId
      .trim()
      .replace(/[^A-Za-z0-9_-]/g, "-")
      .slice(0, 100);
    if (safeUserId) return `user-${safeUserId}`;
  }

  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || typeof cryptoApi.randomUUID !== "function") {
    raise(500, "Secure randomness unavailable", "CSPRNG_UNAVAILABLE");
  }
  return `chat-${cryptoApi.randomUUID()}`;
}

/** The tenant key segment used in cache keys — never empty. */
function resolveTenantScope(tenantId: string | null | undefined): string {
  if (!tenantId) {
    if (isMultiTenantEnabled()) {
      raise(400, "Tenant ID required", "TENANT_REQUIRED");
    }
    return GLOBAL_TENANT;
  }
  return String(tenantId);
}

function memoryKey(tenantScope: string, conversationId: string): string {
  return `ai:chat:memory:${tenantScope}:${conversationId}`;
}

/** Strictly normalizes cached payloads — corrupt entries are treated as empty. */
function normalizeTurns(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];

  const turns: ChatTurn[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Record<string, unknown>;
    const role = candidate.role;
    const content = candidate.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const at = typeof candidate.at === "string" ? candidate.at : nowISODateString();
    turns.push({ role, content, at: at as ISODateString });
  }
  return boundTurns(turns);
}

/** Caps per-turn length, total size, and turn count — dropping oldest whole turns. */
function boundTurns(turns: ChatTurn[]): ChatTurn[] {
  const capped = turns.map((turn) => ({
    role: turn.role,
    content:
      turn.content.length > MAX_CHAT_MEMORY_TURN_CHARS
        ? turn.content.slice(0, MAX_CHAT_MEMORY_TURN_CHARS)
        : turn.content,
    at: turn.at,
  }));

  let totalChars = capped.reduce((sum, turn) => sum + turn.content.length, 0);
  while (capped.length > MAX_CHAT_MEMORY_TURNS || totalChars > MAX_CHAT_MEMORY_TOTAL_CHARS) {
    const removed = capped.shift();
    if (!removed) break;
    totalChars -= removed.content.length;
  }

  return capped;
}

/**
 * Tenant-scoped chat memory. A single instance is exported as `chatMemory`.
 */
export class ChatMemory {
  private readonly mirror = new Map<string, ChatTurn[]>();
  private readonly writeChains = new Map<string, Promise<unknown>>();

  /** Serializes read-modify-write cycles per conversation. */
  private enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.writeChains.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    this.writeChains.set(key, run);
    void run
      .finally(() => {
        if (this.writeChains.get(key) === run) this.writeChains.delete(key);
      })
      .catch(() => {
        /* task rejection is surfaced through `run` */
      });
    return run;
  }

  private remember(key: string, turns: ChatTurn[]): void {
    this.mirror.delete(key);
    this.mirror.set(key, turns);
    if (this.mirror.size > MAX_MIRROR_CONVERSATIONS) {
      const oldest = this.mirror.keys().next().value;
      if (oldest) this.mirror.delete(oldest);
    }
  }

  private async read(tenantScope: string, conversationId: string): Promise<ChatTurn[]> {
    const key = memoryKey(tenantScope, conversationId);
    const mirrored = this.mirror.get(key);
    if (mirrored) return mirrored;

    try {
      const cached = await cacheService.get<unknown>(key);
      const turns = normalizeTurns(cached);
      if (turns.length > 0) this.remember(key, turns);
      return turns;
    } catch (err) {
      rethrow(err);
      logger.debug("[ChatMemory] Cache read failed", { conversationId });
      return [];
    }
  }

  private async write(
    tenantScope: string,
    conversationId: string,
    turns: ChatTurn[],
  ): Promise<void> {
    const key = memoryKey(tenantScope, conversationId);
    const snapshot = turns.slice();
    this.remember(key, snapshot);

    try {
      await cacheService.set(key, snapshot, CHAT_MEMORY_TTL_SECONDS);
    } catch (err) {
      rethrow(err);
      logger.debug("[ChatMemory] Cache write failed", { conversationId });
    }
  }

  /** Returns the bounded memory for a tenant + conversation. */
  async get(tenantId: string | null | undefined, conversationId: string): Promise<ChatTurn[]> {
    const tenantScope = resolveTenantScope(tenantId);
    const id = assertConversationId(conversationId);
    return this.read(tenantScope, id);
  }

  /**
   * Appends a turn, applies the bounded window, and returns the retained turns.
   * The per-turn cap and total/turn budgets are enforced before writing.
   */
  async append(
    tenantId: string | null | undefined,
    conversationId: string,
    turn: ChatTurnInput,
  ): Promise<ChatTurn[]> {
    const tenantScope = resolveTenantScope(tenantId);
    const id = assertConversationId(conversationId);

    if (turn.role !== "user" && turn.role !== "assistant") {
      raise(400, "Invalid chat turn role", "VALIDATION_FAILED");
    }

    const key = memoryKey(tenantScope, id);
    return this.enqueue(key, async () => {
      const existing = await this.read(tenantScope, id);
      const next = boundTurns([
        ...existing,
        {
          role: turn.role,
          content: turn.content,
          at: turn.at ?? nowISODateString(),
        },
      ]);
      await this.write(tenantScope, id, next);
      return next;
    });
  }

  /** Deletes both L1 and L2 entries for a tenant + conversation. */
  async reset(tenantId: string | null | undefined, conversationId: string): Promise<void> {
    const tenantScope = resolveTenantScope(tenantId);
    const id = assertConversationId(conversationId);
    const key = memoryKey(tenantScope, id);

    this.mirror.delete(key);

    try {
      await cacheService.delete(key);
    } catch (err) {
      rethrow(err);
      logger.debug("[ChatMemory] Cache delete failed", { conversationId: id });
    }
  }

  /** Test-only: drops the in-process mirror without touching cache. */
  clearMirror(): void {
    this.mirror.clear();
  }
}

export const chatMemory = new ChatMemory();
