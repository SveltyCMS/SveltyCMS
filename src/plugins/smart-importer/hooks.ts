/**
 * @file src/plugins/smart-importer/hooks.ts
 * @description Lifecycle extension hooks for the Smart Importer plugin.
 *
 * Plugins and custom implementations can hook into migration events:
 * - onBeforeParse: transform raw file before parsing
 * - onAfterParse: modify SNC entries after parsing
 * - onBeforeImport: validate/transform before DB write
 * - onAfterImport: post-import side effects (cache clear, reindex, webhook)
 * - onRollback: cleanup after rollback
 * - onError: custom error handling
 */

import { logger } from "@utils/logger";
import type { SNCEnvelope, SNCEntry } from "./types";

export type MigrationHook = (...args: any[]) => Promise<any> | any;

export interface MigrationHooks {
  /** Transform raw file content before parsing */
  onBeforeParse?: (rawText: string, format: string) => Promise<string> | string;
  /** Modify parsed entries before import */
  onAfterParse?: (envelope: SNCEnvelope, format: string) => Promise<SNCEnvelope> | SNCEnvelope;
  /** Validate or transform entry before DB insert */
  onBeforeImport?: (entry: SNCEntry, index: number, total: number) => Promise<SNCEntry> | SNCEntry;
  /** Post-import side effects */
  onAfterImport?: (result: {
    imported: number;
    failed: number;
    collection: string;
  }) => Promise<void> | void;
  /** Cleanup after rollback */
  onRollback?: (transactionToken: string, collection: string) => Promise<void> | void;
  /** Custom error handler */
  onError?: (error: Error, entry: SNCEntry, phase: string) => Promise<void> | void;
}

class MigrationHookRegistry {
  private hooks: MigrationHooks[] = [];

  register(hooks: MigrationHooks): void {
    this.hooks.push(hooks);
    logger.info(`[MigrationHooks] Registered hooks (${this.hooks.length} total)`);
  }

  unregister(hooks: MigrationHooks): void {
    this.hooks = this.hooks.filter((h) => h !== hooks);
  }

  async runBeforeParse(rawText: string, format: string): Promise<string> {
    let text = rawText;
    for (const h of this.hooks) {
      if (h.onBeforeParse) text = await h.onBeforeParse(text, format);
    }
    return text;
  }

  async runAfterParse(envelope: SNCEnvelope, format: string): Promise<SNCEnvelope> {
    let env = envelope;
    for (const h of this.hooks) {
      if (h.onAfterParse) env = await h.onAfterParse(env, format);
    }
    return env;
  }

  async runBeforeImport(entry: SNCEntry, index: number, total: number): Promise<SNCEntry> {
    let e = entry;
    for (const h of this.hooks) {
      if (h.onBeforeImport) e = await h.onBeforeImport(e, index, total);
    }
    return e;
  }

  async runAfterImport(result: {
    imported: number;
    failed: number;
    collection: string;
  }): Promise<void> {
    for (const h of this.hooks) {
      if (h.onAfterImport) await h.onAfterImport(result);
    }
  }

  async runRollback(token: string, collection: string): Promise<void> {
    for (const h of this.hooks) {
      if (h.onRollback) await h.onRollback(token, collection);
    }
  }

  async runError(error: Error, entry: SNCEntry, phase: string): Promise<void> {
    for (const h of this.hooks) {
      if (h.onError) await h.onError(error, entry, phase);
    }
  }
}

export const migrationHooks = new MigrationHookRegistry();
