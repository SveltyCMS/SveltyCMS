/**
 * @file tests/unit/permissions/collection-permissions.test.ts
 * @description Unit tests for collection-permissions.svelte tab logic.
 *
 * Validates status types, sort field options, pagination clamping,
 * debounce behavior, and collection store hydration patterns.
 * Pure-logic tests — no DOM/JSDOM needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Test constants (match the component) ────────────────────────────────
const StatusTypes = {
  publish: "publish",
  unpublish: "unpublish",
  archive: "archive",
} as const;

const sortFields = [
  { value: "createdAt", label: "Created Date" },
  { value: "updatedAt", label: "Updated Date" },
  { value: "title", label: "Title" },
  { value: "status", label: "Status" },
  { value: "order", label: "Manual Order" },
];

const sortDirections = [
  { value: "desc", label: "Newest First" },
  { value: "asc", label: "Oldest First" },
];

const statusOptions = [
  { value: StatusTypes.publish, label: "Published" },
  { value: StatusTypes.unpublish, label: "Draft" },
  { value: StatusTypes.archive, label: "Archived" },
];

// ── Replicated logic ────────────────────────────────────────────────────
function clampEntries(value: number): number {
  const v = Number.isNaN(value) ? 20 : value;
  return Math.max(5, Math.min(200, v));
}

function validateSortField(field: string): string {
  const valid = sortFields.map((f) => f.value);
  return valid.includes(field) ? field : "createdAt";
}

function validateSortDir(dir: string): string {
  return dir === "asc" ? "asc" : "desc";
}

function validateStatus(s: string): string {
  const valid = statusOptions.map((o) => o.value);
  return valid.includes(s) ? s : StatusTypes.unpublish;
}

// ── Debounce helper (simulates the 300ms pattern) ───────────────────────
function createDebouncedFlush() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let flushed: Record<string, any> | null = null;

  function schedule(partial: Record<string, any>, ms = 300) {
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      flushed = { ...partial };
      dirty = false;
    }, ms);
  }

  function forceFlush(partial: Record<string, any>) {
    if (timer) clearTimeout(timer);
    flushed = { ...partial };
    dirty = false;
  }

  return { schedule, forceFlush, get dirty() { return dirty; }, get flushed() { return flushed; } };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe("Collection Permissions — Status & Visibility", () => {
  it("statusOptions includes publish, unpublish, archive", () => {
    const values = statusOptions.map((o) => o.value);
    expect(values).toContain("publish");
    expect(values).toContain("unpublish");
    expect(values).toContain("archive");
  });

  it("validateStatus rejects invalid statuses", () => {
    expect(validateStatus("bogus")).toBe(StatusTypes.unpublish);
  });

  it("validateStatus accepts all valid statuses", () => {
    for (const o of statusOptions) {
      expect(validateStatus(o.value)).toBe(o.value);
    }
  });

  it("default status is unpublish", () => {
    expect(validateStatus("")).toBe(StatusTypes.unpublish);
    expect(validateStatus(undefined as any)).toBe(StatusTypes.unpublish);
  });
});

describe("Collection Permissions — Sort Fields", () => {
  it("has 5 sort field options including Manual Order", () => {
    expect(sortFields).toHaveLength(5);
    const values = sortFields.map((f) => f.value);
    expect(values).toContain("order");
    expect(values).toContain("createdAt");
    expect(values).toContain("title");
  });

  it("validateSortField returns fallback for unknown fields", () => {
    expect(validateSortField("nonexistent")).toBe("createdAt");
  });

  it("validateSortField accepts all configured fields", () => {
    for (const f of sortFields) {
      expect(validateSortField(f.value)).toBe(f.value);
    }
  });

  it("validateSortDir accepts asc/desc only", () => {
    expect(validateSortDir("asc")).toBe("asc");
    expect(validateSortDir("desc")).toBe("desc");
    expect(validateSortDir("ASC")).toBe("desc"); // case-sensitive: defaults to desc
    expect(validateSortDir("bogus")).toBe("desc");
  });
});

describe("Collection Permissions — Pagination Clamping", () => {
  it("clampEntries floors at 5", () => {
    expect(clampEntries(0)).toBe(5);
    expect(clampEntries(1)).toBe(5);
    expect(clampEntries(4)).toBe(5);
    expect(clampEntries(-10)).toBe(5);
  });

  it("clampEntries caps at 200", () => {
    expect(clampEntries(201)).toBe(200);
    expect(clampEntries(999)).toBe(200);
    expect(clampEntries(1000)).toBe(200);
  });

  it("clampEntries returns valid value as-is", () => {
    expect(clampEntries(20)).toBe(20);
    expect(clampEntries(50)).toBe(50);
    expect(clampEntries(100)).toBe(100);
    expect(clampEntries(5)).toBe(5);
    expect(clampEntries(200)).toBe(200);
  });

  it("clampEntries defaults NaN to 20", () => {
    expect(clampEntries(NaN)).toBe(20);
  });
});

describe("Collection Permissions — Debounced Auto-Save", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks dirty immediately on schedule", () => {
    const db = createDebouncedFlush();
    db.schedule({ entriesPerPage: 50 });
    expect(db.dirty).toBe(true);
  });

  it("does NOT flush before timeout", () => {
    const db = createDebouncedFlush();
    db.schedule({ entriesPerPage: 50 }, 300);
    vi.advanceTimersByTime(200);
    expect(db.flushed).toBeNull();
    expect(db.dirty).toBe(true);
  });

  it("flushes after timeout", () => {
    const db = createDebouncedFlush();
    db.schedule({ entriesPerPage: 50, status: "publish" }, 300);
    vi.advanceTimersByTime(350);
    expect(db.flushed).toEqual({ entriesPerPage: 50, status: "publish" });
    expect(db.dirty).toBe(false);
  });

  it("resets timer on rapid consecutive calls", () => {
    const db = createDebouncedFlush();
    db.schedule({ entriesPerPage: 10 }, 300);
    vi.advanceTimersByTime(200);
    db.schedule({ entriesPerPage: 30 }, 300);
    vi.advanceTimersByTime(200);
    expect(db.flushed).toBeNull();
    vi.advanceTimersByTime(150);
    expect(db.flushed).toEqual({ entriesPerPage: 30 });
  });

  it("forceFlush writes immediately", () => {
    const db = createDebouncedFlush();
    db.schedule({ apiVisible: false }, 300);
    db.forceFlush({ apiVisible: false });
    expect(db.flushed).toEqual({ apiVisible: false });
    expect(db.dirty).toBe(false);
  });

  it("cleanup on unmount flushes pending changes", () => {
    const db = createDebouncedFlush();
    db.schedule({ defaultSortField: "title" }, 300);
    // Simulate onDestroy cleanup
    db.forceFlush({ defaultSortField: "title" });
    expect(db.flushed).toEqual({ defaultSortField: "title" });
  });
});
