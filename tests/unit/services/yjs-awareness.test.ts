/**
 * @file tests/unit/services/yjs-awareness.test.ts
 * @description Server-side awareness (presence / cursors) round-trip for the
 * SSE collaboration transport. Verifies that a client awareness update applied
 * via `yjsService.handleAwarenessUpdate` is broadcast on the EventBus (which
 * feeds the `/api/events` SSE stream) in a form a second client can apply.
 *
 * The setup.ts eventBus mock is not a vitest spy, so broadcasts are captured
 * by wrapping `eventBus.emit` for the duration of each test.
 */

import { describe, it, expect, beforeEach } from "vitest";
import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from "y-protocols/awareness";
import { decodeBase64ToYjs } from "@utils/tenant";
import { eventBus } from "@utils/event-bus";
import { yjsService } from "@src/services/collaboration/yjs-service";

/** Captures every `eventBus.emit(name, payload)` during `fn`. */
function captureEventBus(fn: () => void): Array<[string, Record<string, unknown>]> {
  const emitted: Array<[string, Record<string, unknown>]> = [];
  const original = (eventBus as unknown as { emit: (...args: unknown[]) => boolean }).emit;
  (eventBus as unknown as { emit: (...args: unknown[]) => boolean }).emit = (
    name: unknown,
    payload: unknown,
  ) => {
    emitted.push([String(name), (payload ?? {}) as Record<string, unknown>]);
    return true;
  };
  try {
    fn();
  } finally {
    (eventBus as unknown as { emit: (...args: unknown[]) => boolean }).emit = original;
  }
  return emitted;
}

describe("yjs-service awareness (SSE round-trip)", () => {
  beforeEach(() => {
    // no-op: state is per-test via captureEventBus
  });

  it("applies a client awareness update and broadcasts yjs:awareness on the event bus", () => {
    const senderDoc = new Y.Doc();
    const sender = new Awareness(senderDoc);
    sender.setLocalStateField("user", { name: "Alice", color: "#f00" });
    const update = encodeAwarenessUpdate(sender, [sender.clientID]);

    const emitted = captureEventBus(() =>
      yjsService.handleAwarenessUpdate("entry:c1:e1", update, "tenant-a"),
    );

    expect(emitted.length).toBe(1);
    const [name, payload] = emitted[0];
    expect(name).toBe("yjs:awareness");
    expect(payload).toMatchObject({
      docId: "entry:c1:e1",
      tenantId: "tenant-a",
      origin: "server",
    });

    // A second client applying the broadcast sees Alice's presence.
    const updateBase64 = payload.updateBase64 as string;
    expect(updateBase64).toBeTruthy();
    const receiverDoc = new Y.Doc();
    const receiver = new Awareness(receiverDoc);
    applyAwarenessUpdate(receiver, decodeBase64ToYjs(updateBase64), "server");
    expect(receiver.getStates().get(sender.clientID)?.user?.name).toBe("Alice");
  });

  it("broadcasts are tenant-scoped by payload (docId + tenantId carried)", () => {
    const doc = new Y.Doc();
    const sender = new Awareness(doc);
    sender.setLocalStateField("user", { name: "Bob" });
    const update = encodeAwarenessUpdate(sender, [sender.clientID]);

    const emitted = captureEventBus(() =>
      yjsService.handleAwarenessUpdate("entry:c2:e9", update, "tenant-b"),
    );

    expect(emitted[0][1]).toMatchObject({
      docId: "entry:c2:e9",
      tenantId: "tenant-b",
    });
  });

  it("does not crash on malformed awareness payloads (fail-closed)", () => {
    expect(() =>
      yjsService.handleAwarenessUpdate("entry:c1:e1", new Uint8Array([1, 2, 3]), "tenant-a"),
    ).not.toThrow();
  });
});
