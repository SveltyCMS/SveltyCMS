/**
 * @file tests/unit/services/yjs-sync-server-awareness.test.ts
 * @description Real-socket tests for the standalone Yjs WebSocket sync server:
 * awareness ownership pruning on disconnect and the ping/pong liveness sweep.
 *
 * A real `ws` client connects to a real `http.Server` on an ephemeral port; the
 * authenticator is faked through `ws-auth-registry` (the same bridge the app
 * uses at boot). Frames are encoded exactly like the server expects: an outer
 * varUint message type followed by the raw y-protocols payload (the handler
 * slices `decoder.pos`, it does not read a length prefix).
 *
 * ### Features covered:
 * - a disconnected socket's awareness IDs are removed from the server doc
 * - peers receive an awareness removal frame and drop the cursor
 * - the heartbeat terminates a half-open socket that stops answering pings
 * - healthy sockets survive the heartbeat as long as pongs arrive
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness";
import { createDecoder, readVarUint } from "lib0/decoding";
import { createEncoder, toUint8Array, writeUint8Array, writeVarUint } from "lib0/encoding";
import {
  getAwarenessStatesForTests,
  startYjsSyncServer,
} from "@src/services/collaboration/yjs-sync-server";
import { registerWsAuthenticator } from "@src/services/collaboration/ws-auth-registry";

const TENANT_ID = "tenant-yjs-sync-test";
const DOC_PRESENCE = "presence-doc";
const DOC_HALF_OPEN = "half-open-doc";
const DOC_HEALTHY = "healthy-doc";

const messageAwareness = 1;

type Harness = {
  server: Server;
  port: number;
  clients: WebSocket[];
  stop: () => void;
};

let harness: Harness | null = null;
let activeAwarenesses: Awareness[] = [];
let activeDocs: Y.Doc[] = [];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function closeClient(client: WebSocket): Promise<void> {
  if (client.readyState === WebSocket.CLOSED) return Promise.resolve();
  const closed = new Promise<void>((resolve) => client.once("close", () => resolve()));
  if (client.readyState === WebSocket.OPEN) {
    client.close();
  } else if (client.readyState === WebSocket.CONNECTING) {
    client.terminate();
  }
  return Promise.race([closed, delay(2_000)]);
}

async function startHarness(heartbeatMs?: number): Promise<Harness> {
  const server = createServer();
  const stop = startYjsSyncServer({ server, heartbeatMs });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { server, port, clients: [], stop };
}

async function connect(target: Harness, docId: string): Promise<WebSocket> {
  const client = new WebSocket(`ws://127.0.0.1:${target.port}/ws?docId=${docId}`);
  // Permanent listener: the half-open test expects an abnormal close and must
  // not turn it into an unhandled 'error' event.
  client.on("error", () => {});
  target.clients.push(client);
  await new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      client.off("error", onError);
      resolve();
    };
    const onError = (err: Error) => {
      client.off("open", onOpen);
      reject(err);
    };
    client.once("open", onOpen);
    client.once("error", onError);
  });
  return client;
}

/** Client-side Awareness whose 3s check interval is destroyed by `afterEach`. */
function createClientAwareness(): Awareness {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  activeDocs.push(doc);
  activeAwarenesses.push(awareness);
  return awareness;
}

/** Outer frame: [messageAwareness][raw awareness update]. */
function frameAwareness(update: Uint8Array): Uint8Array {
  const encoder = createEncoder();
  writeVarUint(encoder, messageAwareness);
  writeUint8Array(encoder, update);
  return toUint8Array(encoder);
}

function applyAwarenessFrame(awareness: Awareness, frame: Uint8Array): void {
  const decoder = createDecoder(frame);
  if (readVarUint(decoder) !== messageAwareness) return;
  applyAwarenessUpdate(awareness, frame.slice(decoder.pos), "server");
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(10);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

beforeAll(() => {
  registerWsAuthenticator(async () => ({ userId: "user-yjs-test", tenantId: TENANT_ID }));
});

afterEach(async () => {
  for (const awareness of activeAwarenesses) awareness.destroy();
  activeAwarenesses = [];
  for (const doc of activeDocs) doc.destroy();
  activeDocs = [];

  if (harness) {
    await Promise.all(harness.clients.map(closeClient));
    harness.stop();
    harness.server.closeAllConnections();
    await new Promise<void>((resolve) => harness?.server.close(() => resolve()));
    harness = null;
  }
});

afterAll(() => {
  registerWsAuthenticator(null);
});

describe("yjs sync server awareness ownership", () => {
  it("prunes a disconnected client's state and tells peers to drop the cursor", async () => {
    harness = await startHarness();

    const clientA = await connect(harness, DOC_PRESENCE);
    const clientB = await connect(harness, DOC_PRESENCE);

    const awarenessA = createClientAwareness();
    const awarenessB = createClientAwareness();

    const framesForB: Uint8Array[] = [];
    clientB.on("message", (raw) => framesForB.push(new Uint8Array(raw as ArrayBuffer)));
    let appliedFrames = 0;
    const applyNewFrames = () => {
      for (; appliedFrames < framesForB.length; appliedFrames++) {
        applyAwarenessFrame(awarenessB, framesForB[appliedFrames]);
      }
    };

    awarenessA.setLocalStateField("user", { name: "Alice" });
    clientA.send(frameAwareness(encodeAwarenessUpdate(awarenessA, [awarenessA.clientID])));

    await waitFor(
      () => getAwarenessStatesForTests(DOC_PRESENCE, TENANT_ID)?.has(awarenessA.clientID) === true,
      "the server document to apply client A's awareness",
    );

    // B learns about Alice through the ordinary incoming-update broadcast.
    await waitFor(() => {
      applyNewFrames();
      return awarenessB.getStates().has(awarenessA.clientID);
    }, "client B to receive client A's awareness");

    const closed = new Promise<void>((resolve) => clientA.once("close", () => resolve()));
    clientA.close();
    await closed;

    await waitFor(
      () => getAwarenessStatesForTests(DOC_PRESENCE, TENANT_ID)?.has(awarenessA.clientID) !== true,
      "the server document to prune client A's awareness",
    );
    expect(getAwarenessStatesForTests(DOC_PRESENCE, TENANT_ID)?.has(awarenessA.clientID)).toBe(
      false,
    );

    // The removal frame is broadcast, so B drops Alice without waiting for the
    // 30s awareness timeout (or the 5 min document idle TTL).
    await waitFor(() => {
      applyNewFrames();
      return !awarenessB.getStates().has(awarenessA.clientID);
    }, "client B to apply the removal frame");
    expect(awarenessB.getStates().has(awarenessA.clientID)).toBe(false);
  }, 15_000);
});

describe("yjs sync server heartbeat", () => {
  it("terminates a half-open socket that stops answering pings", async () => {
    harness = await startHarness(25);
    const client = await connect(harness, DOC_HALF_OPEN);

    const awareness = createClientAwareness();
    awareness.setLocalStateField("user", { name: "HalfOpen" });
    client.send(frameAwareness(encodeAwarenessUpdate(awareness, [awareness.clientID])));

    await waitFor(
      () => getAwarenessStatesForTests(DOC_HALF_OPEN, TENANT_ID)?.has(awareness.clientID) === true,
      "the server document to apply the awareness of the socket under test",
    );

    // Pausing the client's raw socket stops it from reading the server's PING
    // frames, so its automatic pong never goes out — a real half-open peer
    // (the TCP connection stays established until the server terminates it).
    const rawSocket = (client as unknown as { _socket?: Socket })._socket;
    expect(rawSocket).toBeDefined();
    rawSocket?.pause();

    await waitFor(
      () => getAwarenessStatesForTests(DOC_HALF_OPEN, TENANT_ID)?.has(awareness.clientID) !== true,
      "the heartbeat to terminate the unresponsive socket and prune its awareness",
      5_000,
    );

    const closed = new Promise<void>((resolve) => client.once("close", () => resolve()));
    rawSocket?.resume();
    await Promise.race([closed, delay(2_000)]);
    expect(client.readyState).toBe(WebSocket.CLOSED);
  }, 15_000);

  it("keeps sockets that answer pings connected", async () => {
    harness = await startHarness(20);
    const client = await connect(harness, DOC_HEALTHY);

    // Several ping/pong rounds; `ws` answers pings automatically.
    await delay(150);

    expect(client.readyState).toBe(WebSocket.OPEN);
  }, 15_000);
});
