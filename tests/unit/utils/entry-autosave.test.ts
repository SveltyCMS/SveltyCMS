/**
 * @file tests/unit/utils/entry-autosave.test.ts
 * @description Unit tests for the navigation-guard autosave payload.
 */

import { describe, it, expect } from "vitest";
import { buildAutosavePayload } from "../../../src/utils/entry-autosave";

const NOW = "2026-10-19T12:00:00.000Z";

describe("entry-autosave - status preservation", () => {
  it("saves a new entry as draft", () => {
    const payload = buildAutosavePayload({ title: "New" }, null, NOW);
    expect(payload.status).toBe("draft");
    expect(payload.updatedAt).toBe(NOW);
  });

  it("keeps a published entry published", () => {
    const payload = buildAutosavePayload(
      { _id: "entry-1", title: "Edited", status: "draft" },
      { _id: "entry-1", title: "Live", status: "publish" },
      NOW,
    );
    expect(payload.status).toBe("publish");
  });

  it("keeps a scheduled entry scheduled and preserves its timestamp", () => {
    const payload = buildAutosavePayload(
      { _id: "entry-1", title: "Edited", status: "publish" },
      {
        _id: "entry-1",
        title: "Live",
        status: "schedule",
        _scheduled: 1_765_000_000_000,
      },
      NOW,
    );
    expect(payload.status).toBe("schedule");
    expect(payload._scheduled).toBe(1_765_000_000_000);
  });

  it("drops a schedule timestamp added only in the form", () => {
    const payload = buildAutosavePayload(
      { _id: "entry-1", title: "Edited", status: "schedule", _scheduled: 1_765_000_000_000 },
      { _id: "entry-1", title: "Live", status: "draft" },
      NOW,
    );
    expect(payload.status).toBe("draft");
    expect(Object.hasOwn(payload, "_scheduled")).toBe(false);
  });

  it("never writes a client-supplied scheduling actor", () => {
    const payload = buildAutosavePayload(
      { _id: "entry-1", title: "Edited", _scheduledBy: "attacker" },
      { _id: "entry-1", title: "Live", status: "publish" },
      NOW,
    );
    expect(Object.hasOwn(payload, "_scheduledBy")).toBe(false);
  });
});
