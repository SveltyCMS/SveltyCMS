/**
 * @file src/services/background/pub-sub.ts
 * @description PubSub service for cross-module and cross-worker events.
 *
 * Features:
 * - Typed `graphql-yoga` local PubSub singleton (`entryUpdated`, `contentStructureUpdated`, `webhook:failed`, `yjs:*`)
 * - Multi-worker Redis / fallback remote transport bridge with CSPRNG `nodeId` echo suppression
 * - Binary-safe serialization for `Uint8Array` payloads on collaborative Yjs channels
 */

import { createPubSub } from "graphql-yoga";

type PubSubChannels = {
  contentStructureUpdated: [
    event: {
      version: number;
      timestamp: string;
      affectedCollections: string[];
      changeType: string;
      tenantId?: string | null;
    },
  ];
  entryUpdated: [
    event: {
      collection: string;
      id: string;
      action: string;
      data: unknown;
      timestamp: string;
      tenantId?: string | null;
      user?: import("@src/databases/auth/types").User;
    },
  ];
  "webhook:failed": [
    event: {
      webhookId: string;
      deliveryId: string;
      error: string;
      tenantId: string;
    },
  ];
  "yjs:update": [
    event: {
      docId: string;
      update: Uint8Array;
      origin?: string;
      tenantId: string;
    },
  ];
  "yjs:sync": [
    event: {
      docId: string;
      update: Uint8Array;
      origin: string;
      tenantId: string;
    },
  ];
  "yjs:awareness": [
    event: {
      docId: string;
      updateBase64: string;
      origin: string;
      tenantId: string;
    },
  ];
};

export const PUBSUB_REDIS_CHANNEL = "sveltycms:pubsub:events";

const LOCAL_NODE_ID = globalThis.crypto.randomUUID();

type RemotePublishFn = (serializedEnvelope: string) => void | Promise<void>;

let remoteTransport: RemotePublishFn | null = null;
const basePubSub = createPubSub<PubSubChannels>();

interface SerializedPubSubEnvelope {
  nodeId: string;
  topic: keyof PubSubChannels;
  args: unknown[];
}

function encodeArgForWire(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return { __sveltyU8: Buffer.from(value).toString("base64") };
  }
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(encodeArgForWire);

  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === "user" && v && typeof v === "object") {
      // Minimize actor footprint on broadcast and avoid non-serializable objects
      const actor = v as { _id?: unknown; role?: unknown; email?: unknown };
      out[k] = {
        ...(actor._id !== undefined ? { _id: actor._id } : {}),
        ...(actor.role !== undefined ? { role: actor.role } : {}),
        ...(actor.email !== undefined ? { email: actor.email } : {}),
      };
    } else if (v instanceof Uint8Array) {
      out[k] = { __sveltyU8: Buffer.from(v).toString("base64") };
    } else if (typeof v !== "function" && typeof v !== "symbol") {
      out[k] = v;
    }
  }
  return out;
}

function decodeArgFromWire(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(decodeArgFromWire);

  const rec = value as Record<string, unknown>;
  if (typeof rec.__sveltyU8 === "string" && Object.keys(rec).length === 1) {
    return new Uint8Array(Buffer.from(rec.__sveltyU8, "base64"));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      typeof (v as Record<string, unknown>).__sveltyU8 === "string" &&
      Object.keys(v).length === 1
    ) {
      out[k] = new Uint8Array(Buffer.from((v as { __sveltyU8: string }).__sveltyU8, "base64"));
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Register (or clear) the cross-worker broadcast transport (e.g. Redis Pub/Sub). */
export function registerPubSubRemoteTransport(fn: RemotePublishFn | null): void {
  remoteTransport = fn;
}

/** Return this worker's unique CSPRNG node identifier for echo suppression tests/diagnostics. */
export function getPubSubNodeId(): string {
  return LOCAL_NODE_ID;
}

/**
 * Re-emit a serialized event received from a peer worker onto local subscribers
 * without re-broadcasting it back over the remote transport.
 */
export function handleRemotePubSubMessage(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as Partial<SerializedPubSubEnvelope>;
    if (!parsed || typeof parsed !== "object") return false;
    if (parsed.nodeId === LOCAL_NODE_ID) return false;
    if (typeof parsed.topic !== "string" || !Array.isArray(parsed.args)) return false;

    const decoded = parsed.args.map(decodeArgFromWire);
    (basePubSub.publish as (...params: unknown[]) => unknown)(parsed.topic, ...decoded);
    return true;
  } catch {
    // catch-allow: malformed cross-node pubsub envelopes are dropped without taking down subscribers
    return false;
  }
}

export const pubSub: typeof basePubSub = {
  subscribe: (...args) => basePubSub.subscribe(...args),
  publish: ((topic: keyof PubSubChannels, ...args: unknown[]) => {
    const res = (basePubSub.publish as (...params: unknown[]) => unknown)(topic, ...args);
    if (remoteTransport) {
      try {
        const envelope: SerializedPubSubEnvelope = {
          nodeId: LOCAL_NODE_ID,
          topic,
          args: args.map(encodeArgForWire),
        };
        const maybePromise = remoteTransport(JSON.stringify(envelope));
        if (maybePromise && typeof (maybePromise as Promise<void>).catch === "function") {
          void (maybePromise as Promise<void>).catch(() => {
            // catch-allow: remote fan-out is best-effort and must not fail local publishes
          });
        }
      } catch {
        // catch-allow: non-serializable payloads stay local instead of aborting publish
      }
    }
    return res;
  }) as typeof basePubSub.publish,
};
