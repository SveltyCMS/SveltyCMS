/**
 * @file src/services/collaboration/collaboration-service.svelte.ts
 * @description Frontend service for orchestrating Yjs collaborative editing.
 * Handles document initialization, provider connectivity, and awareness state.
 */

import { browser } from "$app/environment";
import { page } from "$app/state";
import { collectionValue } from "@src/stores/collection-store.svelte";
import { logger } from "@utils/logger";
import * as Y from "yjs";
import { untrack } from "svelte";

// Define the shape of user presence data
export interface CollaborativeUser {
  clientId: number;
  name: string;
  color: string;
  avatar?: string;
  activeField?: string;
  isTyping?: boolean;
}

class CollaborationService {
  // --- Reactive State ---
  activeUsers = $state<CollaborativeUser[]>([]);
  isConnected = $state(false);
  isCollaborative = $state(false);

  // --- Internal State ---
  private ydoc: Y.Doc | null = null;
  private provider: any = null; // SseProvider or HocuspocusProvider
  private awareness: any = null;
  private entryId: string | null = null;
  private collectionId: string | null = null;

  /**
   * Initializes collaboration for a specific entry.
   * Only proceeds if collaboration is enabled for the collection.
   */
  async init(collection: any, entry: any) {
    if (!browser || !collection?.collaboration?.enabled) {
      this.isCollaborative = false;
      return;
    }

    this.entryId = entry?._id || "new";
    this.collectionId = collection._id;
    this.isCollaborative = true;

    logger.info(`[Collaboration] Initializing for ${this.collectionId}/${this.entryId}`);

    try {
      // 1. Create Y.Doc
      this.ydoc = new Y.Doc();

      // 2. Setup Provider (Lazy load to keep bundle lean for non-collab users)
      const { SseProvider } = await import("./sse-provider.svelte.ts");

      const docId = `entry:${this.collectionId}:${this.entryId}`;
      this.provider = new SseProvider({
        docId,
        yDoc: this.ydoc,
        tenantId: page.data.tenantId,
      });

      this.awareness = this.provider.awareness;
      this.setupAwareness();

      // 3. Setup Reconciliation (Sync Y.Doc -> collectionValue)
      const yMap = this.ydoc.getMap("content");
      yMap.observeDeep((_events) => {
        this.reconcileFromYjs(yMap.toJSON());
      });

      this.isConnected = true;
    } catch (error) {
      logger.error("[Collaboration] Initialization failed:", error);
      this.isCollaborative = false;
    }
  }

  /**
   * Updates the global collectionValue store from Yjs data.
   * This ensures non-Yjs parts of the CMS stay in sync.
   */
  private reconcileFromYjs(data: Record<string, any>) {
    if (!data || Object.keys(data).length === 0) return;

    // Use untrack to avoid dependency loops if collectionValue is read elsewhere
    untrack(() => {
      const current = (collectionValue.value as Record<string, any>) || {};
      const merged = { ...current, ...data };

      // Only update if there's a meaningful change
      if (JSON.stringify(current) !== JSON.stringify(merged)) {
        logger.debug("[Collaboration] Reconciling Yjs -> Store");
        collectionValue.value = merged;
      }
    });
  }

  /**
   * Pushes a change from a widget to Yjs.
   */
  updateField(fieldName: string, value: any) {
    if (!this.ydoc || !this.isCollaborative) return;

    const yMap = this.ydoc.getMap("content");
    const currentVal = yMap.get(fieldName);

    if (JSON.stringify(currentVal) !== JSON.stringify(value)) {
      yMap.set(fieldName, value);
    }
  }

  /**
   * Manages user presence and remote cursors.
   */
  private setupAwareness() {
    if (!this.awareness) return;

    // Set local state
    const user = page.data.user;
    const colors = [
      "#f87171",
      "#fb923c",
      "#fbbf24",
      "#4ade80",
      "#2dd4bf",
      "#38bdf8",
      "#818cf8",
      "#c084fc",
    ];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    this.awareness.setLocalStateField("user", {
      name: user?.name || "Anonymous",
      color: randomColor,
      avatar: user?.avatar,
    });

    // Listen for remote changes
    this.awareness.on("change", () => {
      const states = Array.from(this.awareness.getStates().entries()) as [number, any][];
      this.activeUsers = states.map(([clientId, state]) => ({
        clientId,
        name: state.user?.name || "Anonymous",
        color: state.user?.color || "#ccc",
        avatar: state.user?.avatar,
        activeField: state.activeField,
        isTyping: state.isTyping,
      }));
    });
  }

  /**
   * Updates focus state for field-level highlights.
   */
  setFieldFocus(fieldName: string | null) {
    if (this.awareness) {
      this.awareness.setLocalStateField("activeField", fieldName);
    }
  }

  /**
   * Cleanly disconnects collaboration.
   */
  destroy() {
    logger.info("[Collaboration] Destroying session");
    this.provider?.destroy();
    this.ydoc?.destroy();
    this.ydoc = null;
    this.provider = null;
    this.awareness = null;
    this.isCollaborative = false;
    this.isConnected = false;
    this.activeUsers = [];
  }

  /**
   * Helper to get native Yjs types for complex widgets (like RichText)
   */
  getYDoc() {
    return this.ydoc;
  }
}

export const collaborationService = new CollaborationService();
