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
 * - Awareness ownership tracking per socket (presence pruned on disconnect)
 * - Heartbeat ping/pong sweep for half-open connections
 * - Multi-document support (keyed by docId)
 * - Tenant-aware document isolation (tenantId:docId keys)
 * - Per-document client set for broadcast (excluding sender)
 * - Graceful shutdown
 */

import { WebSocketServer, type WebSocket } from "ws";
import { Doc as YDoc } from "yjs";
import {
  readSyncMessage,
  messageYjsSyncStep2,
  messageYjsUpdate,
  writeSyncStep1,
} from "y-protocols/sync";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";
import { createDecoder, readVarUint } from "lib0/decoding";
import { createEncoder, toUint8Array, writeUint8Array, writeVarUint } from "lib0/encoding";
import type { Server, IncomingMessage } from "node:http";
import { logger } from "@utils/logger";
import { getWsAuthenticator, type WsAuthResult } from "./ws-auth-registry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface YjsSyncServerOptions {
  /** HTTP server to attach the WebSocket server to */
  server: Server;
  /** Path for WebSocket upgrades (default: /ws) */
  path?: string;
  /** Ping/pong sweep interval for half-open sockets (default: 30_000 ms) */
  heartbeatMs?: number;
}

/** Payload emitted by `y-protocols` awareness on state transitions. */
type AwarenessChanges = {
  added: number[];
  updated: number[];
  removed: number[];
};

type DocEntry = {
  doc: YDoc;
  awareness: Awareness;
  /** Set of connected WebSocket clients for this document (for broadcasting) */
  clients: Set<WebSocket>;
  /** Awareness client IDs each socket has claimed (pruned on disconnect) */
  controlledIds: Map<WebSocket, Set<number>>;
  idleTimer?: ReturnType<typeof setTimeout>;
};

// ---------------------------------------------------------------------------
// Protocol constants (outer message types matching y-websocket)
// ---------------------------------------------------------------------------

const messageSync = 0;
const messageAwareness = 1;
const DOC_IDLE_TTL = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// In-memory document store
// ---------------------------------------------------------------------------

const docs = new Map<string, DocEntry>();

function getOrCreateDoc(docId: string, tenantId?: string): DocEntry {
  const key = tenantId ? `${tenantId}:${docId}` : docId;
  let entry = docs.get(key);
  if (entry) {
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = undefined;
    }
    return entry;
  }

  const doc = new YDoc();
  doc.on("update", (_update: Uint8Array, _origin: unknown) => {
    // Server-originated updates should not be rebroadcast — the
    // per-client message handler already broadcasts incoming updates.
  });

  const awareness = new Awareness(doc);
  awareness.setLocalState(null);

  const clients = new Set<WebSocket>();
  const controlledIds = new Map<WebSocket, Set<number>>();

  awareness.on("change", (changes: AwarenessChanges, origin: unknown) => {
    // Attribute awareness IDs to the socket that sent the update so a
    // disconnect can retract exactly the presence that socket owned.
    const sender = origin as WebSocket | null;
    if (sender) {
      const owned = controlledIds.get(sender);
      if (owned) {
        for (const clientId of changes.added) owned.add(clientId);
        for (const clientId of changes.removed) owned.delete(clientId);
      }
    }

    // A removed client must be dropped by peers immediately, even when the
    // removal originated server-side (disconnect, timeout) and therefore has
    // no incoming frame to rebroadcast.
    if (changes.removed.length > 0) {
      const encoder = createEncoder();
      writeVarUint(encoder, messageAwareness);
      writeUint8Array(encoder, encodeAwarenessUpdate(awareness, changes.removed));
      const frame = toUint8Array(encoder);
      for (const client of clients) {
        if (client !== sender && client.readyState === 1) {
          client.send(frame);
        }
      }
    }
  });

  entry = { doc, awareness, clients, controlledIds };
  docs.set(key, entry);
  return entry;
}

/**
 * Test-only accessor for the in-memory awareness state map. Lets unit tests
 * assert server-side presence pruning without exposing the document store.
 * @internal
 */
export function getAwarenessStatesForTests(
  docId: string,
  tenantId?: string,
): Map<number, Record<string, unknown>> | undefined {
  const key = tenantId ? `${tenantId}:${docId}` : docId;
  return docs.get(key)?.awareness.getStates();
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
  const decoder = createDecoder(data);
  const messageType = readVarUint(decoder);

  if (messageType === messageSync) {
    // The remaining bytes (from decoder.pos) are the inner sync protocol message
    const replyEncoder = createEncoder();
    const syncType = readSyncMessage(decoder, replyEncoder, entry.doc, "server");

    // Send reply to the requesting client (wrapped with outer type)
    const reply = toUint8Array(replyEncoder);
    if (reply.byteLength > 0) {
      const wrapped = createEncoder();
      writeVarUint(wrapped, messageSync);
      writeUint8Array(wrapped, reply);
      ws.send(toUint8Array(wrapped));
    }

    // If it was an update (syncStep2 or update), broadcast to other clients
    if (syncType === messageYjsSyncStep2 || syncType === messageYjsUpdate) {
      broadcast(entry, ws, data);
    }
  } else if (messageType === messageAwareness) {
    // Extract the inner awareness update bytes (remaining after outer varUint)
    const awarenessUpdate = data.slice(decoder.pos);
    // Origin is the socket, so the awareness change handler can attribute the
    // IDs in this update to the client that owns them.
    applyAwarenessUpdate(entry.awareness, awarenessUpdate, ws);

    // Broadcast awareness state changes to all other clients
    broadcast(entry, ws, data);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function startYjsSyncServer(options: YjsSyncServerOptions): () => void {
  const { server, path = "/ws", heartbeatMs = 30_000 } = options;

  const wss = new WebSocketServer({ noServer: true });

  /**
   * Liveness per socket: true on connect and on every pong. Each heartbeat tick
   * marks a socket false before pinging, so a peer that did not answer the
   * previous ping is terminated on the following tick (half-open TCP).
   */
  const alive = new WeakMap<WebSocket, boolean>();

  // Intercept HTTP upgrade requests matching our /ws path.
  // 🔐 SESSION VALIDATION (fail-closed): the app registers an authenticator via
  // ws-auth-registry (globalThis bridge across bundle graphs). Unauthenticated
  // upgrades get an HTTP 401 and the socket is destroyed — no WebSocket is ever
  // established without a resolved session. In TEST_MODE the hooks.ws upgrade
  // path still accepts the x-test-secret bypass.
  server.on("upgrade", async (request, socket, head) => {
    if (!request.url?.startsWith(path)) {
      // Not our path — let other handlers (e.g. adapter) take over
      return;
    }

    const authenticate = getWsAuthenticator();
    let auth: WsAuthResult | null = null;
    if (authenticate) {
      try {
        auth = await authenticate({
          url: request.url,
          headers: request.headers,
        });
      } catch (err) {
        logger.warn("[YjsSync] Authenticator threw — rejecting upgrade:", err);
      }
    }

    if (!auth) {
      logger.info("[YjsSync] Rejected unauthenticated upgrade");
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request, auth);
    });
  });

  wss.on("connection", (ws: WebSocket, request: IncomingMessage, auth: WsAuthResult) => {
    // Parse and validate docId from query string. Tenant is strictly AUTHORITATIVE from the resolved
    // session — client-supplied tenantId query params are rejected.
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    const rawDocId = url.searchParams.get("docId") || "default";
    const docId = /^[a-zA-Z0-9_-]{1,128}$/.test(rawDocId) ? rawDocId : "default";
    const tenantId = auth.tenantId || undefined;
    const docKey = tenantId ? `${tenantId}:${docId}` : docId;

    logger.info(
      `[YjsSync] Client connected: docId=${docId}, tenantId=${tenantId || "global"}, userId=${auth.userId}`,
    );

    const entry = getOrCreateDoc(docId, tenantId);
    entry.clients.add(ws);
    entry.controlledIds.set(ws, new Set());
    alive.set(ws, true);

    ws.on("pong", () => alive.set(ws, true));

    // Send the server's sync step 1 to kick off synchronization
    {
      const encoder = createEncoder();
      writeVarUint(encoder, messageSync);
      writeSyncStep1(encoder, entry.doc);
      ws.send(toUint8Array(encoder));
    }

    ws.on("message", (raw) => {
      const data = new Uint8Array(raw as ArrayBuffer);
      handleMessage(ws, entry, data);
    });

    // Remove this socket's awareness states first so peers drop the cursors
    // immediately, then release the socket and arm the idle-document timer.
    // Idempotent: `close` and `error` can both fire for the same socket.
    let cleanedUp = false;
    const cleanupClient = () => {
      if (cleanedUp) return;
      cleanedUp = true;

      const owned = entry.controlledIds.get(ws);
      if (owned && owned.size > 0) {
        removeAwarenessStates(entry.awareness, Array.from(owned), null);
      }
      entry.controlledIds.delete(ws);
      entry.clients.delete(ws);
      alive.delete(ws);

      if (entry.clients.size === 0 && !entry.idleTimer) {
        const timer = setTimeout(() => {
          const current = docs.get(docKey);
          if (current && current.clients.size === 0) {
            current.controlledIds.clear();
            current.awareness.destroy();
            current.doc.destroy();
            docs.delete(docKey);
            logger.debug(`[YjsSync] Idle document cleaned up: key=${docKey}`);
          }
        }, DOC_IDLE_TTL);
        if (typeof timer.unref === "function") timer.unref();
        entry.idleTimer = timer;
      }
      logger.debug(`[YjsSync] Client disconnected: docId=${docId}`);
    };

    ws.on("close", cleanupClient);
    ws.on("error", (err) => {
      logger.warn(`[YjsSync] WebSocket error: docId=${docId}`, err.message);
      cleanupClient();
    });
  });

  // 30s ping/pong sweep: terminate sockets that stopped answering. Without it,
  // half-open TCP connections stay in `clients` (and in every peer's presence)
  // until the process exits.
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState !== 1) continue;
      if (alive.get(client) === false) {
        client.terminate();
        continue;
      }
      alive.set(client, false);
      client.ping();
    }
  }, heartbeatMs);
  if (typeof heartbeat.unref === "function") heartbeat.unref();

  logger.info("[YjsSync] WebSocket sync server started on /ws");

  // Return cleanup function for graceful shutdown
  return () => {
    clearInterval(heartbeat);
    wss.close();
    for (const [, entry] of docs) {
      if (entry.idleTimer) clearTimeout(entry.idleTimer);
      entry.controlledIds.clear();
      entry.awareness.destroy();
      entry.doc.destroy();
    }
    docs.clear();
    logger.info("[YjsSync] WebSocket sync server stopped");
  };
}
