/**
 * @file tests/unit/dashboard/dashboard-storage.test.ts
 * @description Unit tests for sandboxed widget client storage: namespacing, TTL, and quota.
 */

import { describe, expect, it } from "vitest";
import { createWidgetStorage } from "@src/routes/(app)/dashboard/widget-storage";

describe("createWidgetStorage", () => {
  it("isolates keys by widget ID, tenant, and user", () => {
    const storage1 = createWidgetStorage("widget-a", "tenant-1", "user-1");
    const storage2 = createWidgetStorage("widget-b", "tenant-1", "user-1");

    storage1.set("settings", { threshold: 80 });
    storage2.set("settings", { threshold: 50 });

    expect(storage1.get("settings")).toEqual({ threshold: 80 });
    expect(storage2.get("settings")).toEqual({ threshold: 50 });
  });

  it("returns default value when key does not exist", () => {
    const storage = createWidgetStorage("widget-c");
    expect(storage.get("nonexistent", { fallback: true })).toEqual({ fallback: true });
    expect(storage.get("nonexistent")).toBeNull();
  });

  it("handles removal and clearing correctly", () => {
    const storage = createWidgetStorage("widget-d");
    storage.set("k1", "v1");
    storage.set("k2", "v2");

    expect(storage.get("k1")).toBe("v1");
    storage.remove("k1");
    expect(storage.get("k1")).toBeNull();
    expect(storage.get("k2")).toBe("v2");

    storage.clear();
    expect(storage.get("k2")).toBeNull();
  });

  it("respects TTL expiration", async () => {
    const storage = createWidgetStorage("widget-ttl");
    storage.set("temp", "expiring_soon", 50); // 50ms TTL

    expect(storage.get("temp")).toBe("expiring_soon");

    // Wait 60ms for expiration
    await new Promise((r) => setTimeout(r, 60));
    expect(storage.get("temp")).toBeNull();
  });

  it("enforces storage quota cap per widget value", () => {
    const storage = createWidgetStorage("widget-quota");
    // Generate large string > 256KB
    const giantPayload = "x".repeat(300 * 1024);

    const result = storage.set("giant", giantPayload);
    expect(result).toBe(false);
    expect(storage.get("giant")).toBeNull();
  });

  it("caps the total bytes across keys for one widget instance", () => {
    const storage = createWidgetStorage("widget-total-quota");
    const chunk = "x".repeat(100 * 1024);

    expect(storage.set("a", chunk)).toBe(true);
    expect(storage.set("b", chunk)).toBe(true);
    expect(storage.set("c", chunk)).toBe(false);
    expect(storage.get("c")).toBeNull();

    // Replacing an existing key does not grow the total.
    expect(storage.set("a", chunk)).toBe(true);
  });

  it("keeps fallback storage per instance (no cross-instance leak)", () => {
    const first = createWidgetStorage("widget-fallback", "tenant-1", "user-1");
    const second = createWidgetStorage("widget-fallback", "tenant-1", "user-1");

    first.set("secret", "a-value");
    expect(second.get("secret")).toBeNull();
  });
});
