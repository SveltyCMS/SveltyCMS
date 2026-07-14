/**
 * @file tests/unit/user/helpers.test.ts
 * @description White-box unit tests for helper functions:
 *   checkTokenExpired, getRemainingTime, formatDate.
 *
 * Extracted from: src/routes/(app)/user/components/admin-area.svelte
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Replicated inline functions from admin-area.svelte
// ---------------------------------------------------------------------------

function isToken(row: any): row is { token: string; [key: string]: any } {
  return !!row && "token" in row && typeof row.token === "string";
}

function isUser(row: any): row is { _id: string; [key: string]: any } {
  return !!row && "_id" in row && !("token" in row);
}
// Used in describe blocks below
void isUser;

function checkTokenExpired(row: any): boolean {
  if (!(isToken(row) && row.expires)) {
    return false;
  }
  return new Date(row.expires) < new Date();
}

function getRemainingTime(expiresDate: Date | string | null): string {
  if (!expiresDate) {
    return "Never";
  }

  const now = new Date();
  const expires = new Date(expiresDate);
  const diffMs = expires.getTime() - now.getTime();

  // If expired, return 'Expired'
  if (diffMs <= 0) {
    return "Expired";
  }

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    const remainingHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return remainingHours > 0 ? `${diffDays}d ${remainingHours}h` : `${diffDays}d`;
  }
  if (diffHours > 0) {
    const remainingMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return remainingMinutes > 0 ? `${diffHours}h ${remainingMinutes}m` : `${diffHours}h`;
  }
  return `${diffMinutes}m`;
}

function formatDate(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  try {
    const d = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(d.getTime())) {
      return "-";
    }
    return d.toLocaleString();
  } catch {
    return "-";
  }
}

// ---------------------------------------------------------------------------
// checkTokenExpired
// ---------------------------------------------------------------------------

describe("checkTokenExpired", () => {
  it("should return true for an expired token", () => {
    const token = {
      _id: "t1",
      token: "abc",
      expires: "2020-01-01T00:00:00.000Z", // far in the past
    };
    expect(checkTokenExpired(token)).toBe(true);
  });

  it("should return false for a future token", () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const token = {
      _id: "t1",
      token: "abc",
      expires: futureDate.toISOString(),
    };
    expect(checkTokenExpired(token)).toBe(false);
  });

  it("should return false for a User object (not a Token)", () => {
    const user = { _id: "u1", username: "john", email: "john@example.com" };
    expect(checkTokenExpired(user)).toBe(false);
  });

  it("should return false for null/undefined", () => {
    expect(checkTokenExpired(null)).toBe(false);
    expect(checkTokenExpired(undefined)).toBe(false);
  });

  it("should return false for token without expires field", () => {
    const token = { _id: "t1", token: "abc" };
    expect(checkTokenExpired(token)).toBe(false);
  });

  it("should return false for token with null expires", () => {
    const token = { _id: "t1", token: "abc", expires: null };
    // null is falsy, so !(isToken(row) && row.expires) is true → returns false
    expect(checkTokenExpired(token)).toBe(false);
  });

  it("should return false for an empty object", () => {
    expect(checkTokenExpired({})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getRemainingTime
// ---------------------------------------------------------------------------

describe("getRemainingTime", () => {
  it("should return 'Never' for null", () => {
    expect(getRemainingTime(null)).toBe("Never");
  });

  it("should return 'Never' for undefined (implicitly, but null check covers it)", () => {
    // The function signature takes Date | string | null, so undefined is not typed.
    // But it uses !expiresDate which covers undefined too
    expect(getRemainingTime(undefined as any)).toBe("Never");
  });

  it("should return 'Expired' for a past date", () => {
    const pastDate = new Date(Date.now() - 10000); // 10 seconds ago
    expect(getRemainingTime(pastDate)).toBe("Expired");
  });

  it("should return 'Expired' for exact current time (diffMs <= 0)", () => {
    const now = new Date();
    // At exactly now, diffMs could be 0 or negative depending on execution time
    const result = getRemainingTime(now);
    expect(result).toBe("Expired");
  });

  it("should return minutes only for < 1 hour remaining", () => {
    const future = new Date(Date.now() + 45 * 60 * 1000); // 45 min
    const result = getRemainingTime(future);
    expect(result).toMatch(/^\d+m$/);
  });

  it("should return hours and minutes for 1-24h remaining", () => {
    const future = new Date(Date.now() + 2.5 * 60 * 60 * 1000); // 2h 30m
    const result = getRemainingTime(future);
    expect(result).toBe("2h 30m");
  });

  it("should return hours only when minutes are 0", () => {
    const future = new Date(Date.now() + 3 * 60 * 60 * 1000); // exactly 3h
    const result = getRemainingTime(future);
    expect(result).toBe("3h");
  });

  it("should return days and hours for > 24h remaining", () => {
    const future = new Date(Date.now() + 3.5 * 24 * 60 * 60 * 1000); // 3d 12h
    const result = getRemainingTime(future);
    expect(result).toBe("3d 12h");
  });

  it("should return days only when hours are 0", () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // exactly 5d
    const result = getRemainingTime(future);
    expect(result).toBe("5d");
  });

  it("should handle string date input", () => {
    const future = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    const result = getRemainingTime(future.toISOString());
    expect(result).toBe("10m");
  });

  it("should return 'Expired' for a past date string", () => {
    expect(getRemainingTime("2020-01-01T00:00:00.000Z")).toBe("Expired");
  });

  it("should handle edge case: ~59 minutes as minutes, not hours", () => {
    const future = new Date(Date.now() + 59 * 60 * 1000);
    const result = getRemainingTime(future);
    expect(result).toBe("59m");
  });

  it("should handle edge case: exactly 60 minutes as 1h", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const result = getRemainingTime(future);
    expect(result).toBe("1h");
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe("formatDate", () => {
  it("should return '-' for null", () => {
    expect(formatDate(null)).toBe("-");
  });

  it("should return '-' for undefined", () => {
    expect(formatDate(undefined)).toBe("-");
  });

  it("should return '-' for empty string", () => {
    expect(formatDate("")).toBe("-");
  });

  it("should return '-' for invalid date string", () => {
    expect(formatDate("not-a-date")).toBe("-");
  });

  it("should return '-' for invalid number (NaN after new Date)", () => {
    // "abc" parsed as Date gives NaN.getTime() → '-'
    expect(formatDate("garbage")).toBe("-");
  });

  it("should format a valid Date object", () => {
    const d = new Date("2025-06-15T12:00:00.000Z");
    const result = formatDate(d);
    expect(result).not.toBe("-");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("should format a valid ISO date string", () => {
    const result = formatDate("2025-06-15T12:00:00.000Z");
    expect(result).not.toBe("-");
    expect(typeof result).toBe("string");
  });

  it("should format a numeric timestamp", () => {
    const result = formatDate(1718409600000); // some timestamp
    expect(result).not.toBe("-");
    expect(typeof result).toBe("string");
  });

  it("should handle Date object that is already a Date", () => {
    const d = new Date();
    expect(formatDate(d)).not.toBe("-");
  });

  it("should handle falsy numeric values (0)", () => {
    // 0 is not null/undefined/"" — it would be treated as a timestamp
    // new Date(0) gives epoch, which is valid
    const result = formatDate(0);
    expect(result).not.toBe("-");
  });

  it("should return '-' for boolean input", () => {
    // String(true) = "true" → new Date("true") → NaN → '-'
    expect(formatDate(true)).toBe("-");
  });

  it("should return '-' for object input", () => {
    // String({}) = "[object Object]" → new Date("[object Object]") → NaN → '-'
    expect(formatDate({})).toBe("-");
  });
});
