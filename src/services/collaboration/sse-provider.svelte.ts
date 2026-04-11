/**
 * @file src/services/collaboration/sse-provider.svelte.ts
 * @description Enterprise-grade Yjs provider using SSE for downstream and POST for upstream.
 * Implements batching, awareness throttling, and silent-drop recovery.
 */

import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { encodeYjsToBase64, decodeBase64ToYjs } from "@utils/tenant-utils";
import { browser } from "$app/environment";
import { logger } from "@utils/logger";

export interface SseProviderOptions {
  docId: string;
  yDoc: Y.Doc;
  tenantId?: string;
  awareness?: Awareness;
}

export class SseProvider {
  public docId: string;
  public doc: Y.Doc;
  public awareness: Awareness;
  public tenantId?: string;

  // Svelte 5 Runes for UI connectivity status
  public status = $state<"connecting" | "connected" | "disconnected" | "syncing">("connecting");
  public activeUsers = $state<number>(0);

  private eventSource: EventSource | null = null;
  private updateBuffer: Uint8Array[] = [];
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;
  private awarenessThrottleTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor({ docId, yDoc, tenantId, awareness }: SseProviderOptions) {
    this.docId = docId;
    this.doc = yDoc;
    this.awareness = awareness || new Awareness(yDoc);
    this.tenantId = tenantId;

    if (browser) {
      this.init();
    }
  }

  private async init() {
    // 1. Fetch initial state (Step 1)
    await this.fetchInitialState();

    // 2. Setup Upstream (POST with Batching)
    this.doc.on("update", this.handleLocalUpdate);

    // 3. Setup Awareness (Throttled)
    this.awareness.on("update", this.handleAwarenessUpdate);

    // 4. Setup Downstream (SSE with Recovery)
    this.connectSSE();
  }

  private async fetchInitialState() {
    this.status = "syncing";
    try {
      const res = await fetch(`/api/collaboration/yjs?docId=${this.docId}`);
      const data = await res.json();
      if (data.success && data.stateBase64) {
        Y.applyUpdate(this.doc, decodeBase64ToYjs(data.stateBase64), "server");
        this.status = "connected";
      }
    } catch (e) {
      logger.error("[SseProvider] Initial sync failed", e);
      this.status = "disconnected";
    }
  }

  private connectSSE() {
    if (this.eventSource) this.eventSource.close();

    this.eventSource = new EventSource("/api/events");

    this.eventSource.onopen = () => {
      if (this.status === "disconnected") {
        this.fetchInitialState(); // Re-sync on reconnect
      }
      this.status = "connected";
    };

    this.eventSource.onerror = () => {
      this.status = "disconnected";
    };

    // Listen specifically for Yjs sync events
    this.eventSource.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === "yjs:sync" && data.docId === this.docId) {
          if (data.origin === "server") {
            Y.applyUpdate(this.doc, decodeBase64ToYjs(data.updateBase64), "server");
          }
        }
      } catch {
        // Ignore malformed events
      }
    });
  }

  /**
   * GOTCHA #2 FIX: Batch multiple rapid updates into one POST
   */
  private handleLocalUpdate = (update: Uint8Array, origin: any) => {
    if (origin === "server") return; // Don't loop back server updates

    this.updateBuffer.push(update);

    if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => {
        this.sendBatchedUpdates();
      }, 50); // 50ms batch window
    }
  };

  private async sendBatchedUpdates() {
    if (this.updateBuffer.length === 0) return;

    const batched = Y.mergeUpdates(this.updateBuffer);
    this.updateBuffer = [];
    this.batchTimeout = null;

    try {
      await fetch("/api/collaboration/yjs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docId: this.docId,
          updateBase64: encodeYjsToBase64(batched),
        }),
      });
    } catch (e) {
      logger.error("[SseProvider] Update delivery failed", e);
    }
  }

  /**
   * GOTCHA #1 FIX: Aggressively throttle Awareness (Cursors)
   */
  private handleAwarenessUpdate = () => {
    if (this.awarenessThrottleTimeout) return;

    this.awarenessThrottleTimeout = setTimeout(() => {
      this.sendAwareness();
      this.awarenessThrottleTimeout = null;
    }, 100); // Max 10 updates per second
  };

  private sendAwareness() {
    // In a full implementation, we'd send awareness via a separate
    // lightweight endpoint or the same Yjs endpoint.
    // For now, we'll keep awareness local to prove the throttle.
    this.activeUsers = this.awareness.getStates().size;
  }

  public destroy() {
    this.doc.off("update", this.handleLocalUpdate);
    this.awareness.off("update", this.handleAwarenessUpdate);
    if (this.eventSource) this.eventSource.close();
    if (this.batchTimeout) clearTimeout(this.batchTimeout);
    if (this.awarenessThrottleTimeout) clearTimeout(this.awarenessThrottleTimeout);
  }
}
