/**
 * @file src/services/collaboration/yjs-service.ts
 * @description Server-side Yjs document management for concurrent editing.
 * Uses the internal EventBus/SSE as the transport layer.
 */

import * as Y from "yjs";
import { logger } from "@utils/logger.server";
import { pubSub } from "@src/services/pub-sub";

class YjsService {
  private static instance: YjsService;
  // Map of DocumentID -> Y.Doc
  private docs: Map<string, Y.Doc> = new Map();

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
   * Gets or creates a Y.Doc for a specific entry/field
   */
  private getDoc(docId: string, tenantId: string): Y.Doc {
    if (!this.docs.has(docId)) {
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
      });

      this.docs.set(docId, doc);
    }
    return this.docs.get(docId)!;
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
