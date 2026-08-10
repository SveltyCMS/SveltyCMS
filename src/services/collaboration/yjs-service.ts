/**
 * @file src/services/collaboration/yjs-service.ts
 * @description Server-side Yjs document management for concurrent editing.
 * Uses the internal EventBus/SSE as the transport layer.
 */

import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import { logger } from "@utils/logger";
import { pubSub } from "@src/services/background/pub-sub";
import { eventBus } from "@utils/event-bus";
import { encodeYjsToBase64 } from "@utils/tenant";

class YjsService {
  private static instance: YjsService;
  // Map of DocumentID -> Y.Doc (keyed by `${tenantId}:${docId}` for isolation)
  private docs: Map<string, Y.Doc> = new Map();
  // Per-document awareness (presence / cursors), keyed like the docs.
  private awareness: Map<string, awarenessProtocol.Awareness> = new Map();

  private constructor() {
    // Listen for incoming Yjs updates from the EventBus
    (async () => {
      for await (const data of pubSub.subscribe("yjs:update")) {
        await this.handleIncomingUpdate(data.docId, data.update, data.origin, data.tenantId);
      }
    })();
  }

  public static getInstance(): YjsService {
    if (!YjsService.instance) {
      YjsService.instance = new YjsService();
    }
    return YjsService.instance;
  }

  /**
   * Gets or creates a Y.Doc for a specific entry/field (tenant-scoped).
   */
  private getDoc(docId: string, tenantId: string): Y.Doc {
    const key = `${tenantId || "global"}:${docId}`;
    if (!this.docs.has(key)) {
      const doc = new Y.Doc();

      // Handle persistence if needed (e.g. periodically save to DB)
      doc.on("update", (update, origin) => {
        if (origin === "server") return; // Don't echo back if origin is server

        // Broadcast to other clients via PubSub
        // The SSE hook will pick this up and send to connected clients
        pubSub.publish("yjs:sync", {
          docId,
          update,
          origin: "server",
          tenantId,
        });

        // 🔌 SSE BRIDGE: forward the update onto the EventBus so the
        // /api/events SSE stream delivers it to other editors (the
        // SseProvider listens for `yjs:sync` with origin "server").
        // Base64 is required — Uint8Array does not survive JSON serialization.
        try {
          eventBus.emit("yjs:sync", {
            docId,
            updateBase64: encodeYjsToBase64(update),
            origin: "server",
            tenantId,
          });
        } catch (err) {
          logger.warn(`[Yjs] SSE bridge emit failed for ${docId}:`, err);
        }
      });

      this.docs.set(key, doc);
    }
    return this.docs.get(key)!;
  }

  /**
   * Gets or creates the awareness instance for a document (tenant-scoped).
   */
  private getAwareness(docId: string, tenantId: string): awarenessProtocol.Awareness {
    const key = `${tenantId || "global"}:${docId}`;
    let awareness = this.awareness.get(key);
    if (!awareness) {
      awareness = new awarenessProtocol.Awareness(this.getDoc(docId, tenantId));
      awareness.setLocalState(null);
      this.awareness.set(key, awareness);
    }
    return awareness;
  }

  /**
   * Applies a client awareness update (presence / cursors) and broadcasts it
   * to every SSE client of the same document. Senders ignore their own echo
   * via the `origin: "server"` guard in the SseProvider.
   */
  public handleAwarenessUpdate(docId: string, update: Uint8Array, tenantId: string): void {
    const awareness = this.getAwareness(docId, tenantId);
    try {
      awarenessProtocol.applyAwarenessUpdate(awareness, update, "client");
    } catch (err) {
      logger.warn(`[Yjs] Awareness update rejected for ${docId}:`, err);
      return;
    }

    const updateBase64 = encodeYjsToBase64(update);
    pubSub.publish("yjs:awareness", {
      docId,
      updateBase64,
      origin: "server",
      tenantId,
    });
    try {
      eventBus.emit("yjs:awareness", {
        docId,
        updateBase64,
        origin: "server",
        tenantId,
      });
    } catch (err) {
      logger.warn(`[Yjs] Awareness SSE bridge emit failed for ${docId}:`, err);
    }
  }

  /**
   * Process an update received from a client
   */
  private async handleIncomingUpdate(
    docId: string,
    update: Uint8Array,
    origin: string | undefined,
    tenantId: string,
  ) {
    const doc = this.getDoc(docId, tenantId);

    try {
      // Apply the binary update to the server-side doc
      Y.applyUpdate(doc, update, origin || "client");
      logger.debug(`[Yjs] Applied update to ${docId} from ${origin || "client"}`);
    } catch (error) {
      logger.error(`[Yjs] Failed to apply update to ${docId}:`, error);
    }
  }

  /**
   * Returns the full state of a document as a single update
   */
  public getFullState(docId: string, tenantId: string): Uint8Array {
    const doc = this.getDoc(docId, tenantId);
    return Y.encodeStateAsUpdate(doc);
  }
}

export const yjsService = YjsService.getInstance();
