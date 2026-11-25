/**
 * @file tests/unit/services/pub-sub-bridge.test.ts
 * @description Tests the cross-worker PubSub remote transport bridge and echo suppression.
 */

import { describe, expect, it, afterEach } from "vitest";
import {
  getPubSubNodeId,
  handleRemotePubSubMessage,
  pubSub,
  registerPubSubRemoteTransport,
} from "@src/services/background/pub-sub";

describe("PubSub multi-worker bridge", () => {
  afterEach(() => {
    registerPubSubRemoteTransport(null);
  });

  it("fans out local entryUpdated publishes to registered remote transport", () => {
    const sent: string[] = [];
    registerPubSubRemoteTransport((payload) => {
      sent.push(payload);
    });

    pubSub.publish("entryUpdated", {
      collection: "posts",
      id: "entry-1",
      action: "update",
      data: { title: "Updated" },
      timestamp: "2026-11-25T10:00:00.000Z",
      tenantId: "t1",
    });

    expect(sent).toHaveLength(1);
    const decoded = JSON.parse(sent[0]);
    expect(decoded.nodeId).toBe(getPubSubNodeId());
    expect(decoded.topic).toBe("entryUpdated");
    expect(decoded.args[0].collection).toBe("posts");
    expect(decoded.args[0].id).toBe("entry-1");
  });

  it("suppresses echoes carrying the local nodeId", () => {
    const delivered = handleRemotePubSubMessage(
      JSON.stringify({
        nodeId: getPubSubNodeId(),
        topic: "entryUpdated",
        args: [{ collection: "posts", id: "1", action: "create", data: {}, timestamp: "now" }],
      }),
    );
    expect(delivered).toBe(false);
  });

  it("delivers peer messages without re-publishing and round-trips Uint8Array payloads", async () => {
    const echoedBack: string[] = [];
    registerPubSubRemoteTransport((payload) => {
      echoedBack.push(payload);
    });

    const received: Array<{ docId: string; update: Uint8Array; tenantId: string }> = [];
    const sub = pubSub.subscribe("yjs:update");
    const reader = (async () => {
      for await (const event of sub) {
        received.push(event);
        if (received.length === 1) break;
      }
    })();

    const encodedUpdate = Buffer.from(new Uint8Array([1, 2, 3, 250])).toString("base64");
    const ok = handleRemotePubSubMessage(
      JSON.stringify({
        nodeId: "peer-worker-99",
        topic: "yjs:update",
        args: [
          {
            docId: "doc-abc",
            update: { __sveltyU8: encodedUpdate },
            tenantId: "t1",
          },
        ],
      }),
    );
    expect(ok).toBe(true);
    await reader;

    expect(received).toHaveLength(1);
    expect(received[0].docId).toBe("doc-abc");
    expect(received[0].update).toBeInstanceOf(Uint8Array);
    expect(Array.from(received[0].update)).toEqual([1, 2, 3, 250]);
    // Re-emission from peer transport must never echo back out to remote transport
    expect(echoedBack).toHaveLength(0);
  });
});
