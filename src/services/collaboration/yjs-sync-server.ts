/**
 * @file src/services/collaboration/yjs-sync-server.ts
 * @description Lightweight Yjs WebSocket sync server for collaborative editing.
 * Uses ws + y-protocols directly — no Hocuspocus or y-websocket dependency needed.
 *
 * Protocol: outer varUint message type (0=Sync, 1=Awareness) wrapping standard
 * y-protocols inner messages. Compatible with y-websocket clients.
 *
 * Features:
 * - Yjs document synchronization via sync protocol (SyncStep1/2, Update)
 * - User awareness (cursor presence) via awareness protocol
 * - Multi-document support (keyed by docId)
 * - Tenant-aware document isolation (tenantId:docId keys)
 * - Per-document client set for broadcast (excluding sender)
 * - Graceful shutdown
 */

import { WebSocketServer, type WebSocket } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import type { Server } from "node:http";
import { logger } from "@utils/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface YjsSyncServerOptions {
  /** HTTP server to attach the WebSocket server to */
  server: Server;
  /** Path for WebSocket upgrades (default: /ws) */
  path?: string;
}

type DocEntry = {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  /** Set of connected WebSocket clients for this document (for broadcasting) */
  clients: Set<WebSocket>;
};

// ---------------------------------------------------------------------------
// Protocol constants (outer message types matching y-websocket)
// ---------------------------------------------------------------------------

const messageSync = 0;
const messageAwareness = 1;

// ---------------------------------------------------------------------------
// In-memory document store
// ---------------------------------------------------------------------------

const docs = new Map<string, DocEntry>();

function getOrCreateDoc(docId: string, tenantId?: string): DocEntry {
  const key = tenantId ? `${tenantId}:${docId}` : docId;
  let entry = docs.get(key);
  if (!entry) {
    const doc = new Y.Doc();
    doc.on("update", (_update: Uint8Array, _origin: unknown) => {
      // Server-originated updates should not be rebroadcast — the
      // per-client message handler already broadcasts incoming updates.
    });

    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalState(null);

    entry = { doc, awareness, clients: new Set() };
    docs.set(key, entry);
  }
  return entry;
}

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

/**
 * Send a raw Uint8Array (already outer-wrapped) to all connected clients
 * for the given document entry *except* the sender.
 */
function broadcast(entry: DocEntry, sender: WebSocket, data: Uint8Array): void {
  for (const client of entry.clients) {
    if (client !== sender && client.readyState === 1) {
      client.send(data);
    }
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

function handleMessage(ws: WebSocket, entry: DocEntry, data: Uint8Array): void {
  const decoder = decoding.createDecoder(data);
  const messageType = decoding.readVarUint(decoder);

  if (messageType === messageSync) {
    // The remaining bytes (from decoder.pos) are the inner sync protocol message
    const replyEncoder = encoding.createEncoder();
    const syncType = syncProtocol.readSyncMessage(decoder, replyEncoder, entry.doc, "server");

    // Send reply to the requesting client (wrapped with outer type)
    const reply = encoding.toUint8Array(replyEncoder);
    if (reply.byteLength > 0) {
      const wrapped = encoding.createEncoder();
      encoding.writeVarUint(wrapped, messageSync);
      encoding.writeUint8Array(wrapped, reply);
      ws.send(encoding.toUint8Array(wrapped));
    }

    // If it was an update (syncStep2 or update), broadcast to other clients
    if (
      syncType === syncProtocol.messageYjsSyncStep2 ||
      syncType === syncProtocol.messageYjsUpdate
    ) {
      broadcast(entry, ws, data);
    }
  } else if (messageType === messageAwareness) {
    // Extract the inner awareness update bytes (remaining after outer varUint)
    const awarenessUpdate = data.slice(decoder.pos);
    awarenessProtocol.applyAwarenessUpdate(entry.awareness, awarenessUpdate, "server");

    // Broadcast awareness state changes to all other clients
    broadcast(entry, ws, data);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function startYjsSyncServer(options: YjsSyncServerOptions): () => void {
  const { server, path = "/ws" } = options;

  const wss = new WebSocketServer({ noServer: true });

  // Intercept HTTP upgrade requests matching our /ws path
  server.on("upgrade", (request, socket, head) => {
    if (!request.url?.startsWith(path)) {
      // Not our path — let other handlers (e.g. adapter) take over
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (ws: WebSocket, request) => {
    // Parse docId and optional tenantId from query string
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    const docId = url.searchParams.get("docId") || "default";
    const tenantId = url.searchParams.get("tenantId") || undefined;

    logger.info(`[YjsSync] Client connected: docId=${docId}, tenantId=${tenantId || "global"}`);

    const entry = getOrCreateDoc(docId, tenantId);
    entry.clients.add(ws);

    // Send the server's sync step 1 to kick off synchronization
    {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeSyncStep1(encoder, entry.doc);
      ws.send(encoding.toUint8Array(encoder));
    }

    ws.on("message", (raw) => {
      const data = new Uint8Array(raw as ArrayBuffer);
      handleMessage(ws, entry, data);
    });

    ws.on("close", () => {
      entry.clients.delete(ws);
      logger.debug(`[YjsSync] Client disconnected: docId=${docId}`);
    });

    ws.on("error", (err) => {
      logger.warn(`[YjsSync] WebSocket error: docId=${docId}`, err.message);
    });
  });

  logger.info("[YjsSync] WebSocket sync server started on /ws");

  // Return cleanup function for graceful shutdown
  return () => {
    wss.close();
    for (const [, entry] of docs) {
      entry.awareness.destroy();
      entry.doc.destroy();
    }
    docs.clear();
    logger.info("[YjsSync] WebSocket sync server stopped");
  };
}
