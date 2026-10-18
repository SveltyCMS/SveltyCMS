/**
 * @file src/services/ai/ai-provider.ts
 * @description Provider port interface for SveltyCMS AI subsystem.
 *
 * Decouples inference callers from specific LLM vendors (Ollama, cloud models, test doubles).
 * Provider selection and execution stay strictly server-side.
 *
 * Features:
 * - Unified AiProvider interface for generate, chat, embed, and usage tracking
 * - OpenTelemetry GenAI-aligned usage and message typing
 * - Pluggable provider port enabling test doubles and multi-model fallbacks
 */

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Provider-reported token usage, using OpenTelemetry GenAI naming. */
export interface AiUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface AiGenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface AiGenerateResult {
  text: string;
  usage?: AiUsage;
  model: string;
}

export interface AiChatOptions extends AiGenerateOptions {
  messages: AiChatMessage[];
}

export interface AiChatResult {
  message: AiChatMessage;
  usage?: AiUsage;
  model: string;
}

export interface AiEmbedOptions {
  model?: string;
}

export interface AiEmbedResult {
  embedding: number[];
  model: string;
}

/**
 * Universal AI Provider Port.
 * Implemented by Ollama, cloud adapters, and test doubles.
 */
export interface AiProvider {
  readonly id: string;
  readonly name: string;

  /** Health/connectivity check */
  isAvailable(): Promise<boolean>;

  /** Single text generation */
  generate(prompt: string, options?: AiGenerateOptions): Promise<AiGenerateResult>;

  /** Multi-turn chat completion */
  chat(options: AiChatOptions): Promise<AiChatResult>;

  /** Vector embedding */
  embed?(text: string, options?: AiEmbedOptions): Promise<AiEmbedResult>;
}
