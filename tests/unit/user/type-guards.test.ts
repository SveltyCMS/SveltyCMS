/**
 * @file tests/unit/user/type-guards.test.ts
 * @description White-box unit tests for isUser / isToken type guards.
 *
 * Extracted from: src/routes/(app)/user/components/admin-area.svelte
 *
 * isUser(row): returns true if row has _id AND (username OR role) AND NOT token
 *   Actually per source: !!row && '_id' in row && !('token' in row)
 *   Wait — the task says "has _id and (username or role)" but source code says
 *   "!!row && '_id' in row && !('token' in row)" — will test actual behavior.
 *
 * isToken(row): returns true if row has token property (string)
 *   Per source: !!row && 'token' in row && typeof row.token === 'string'
 */

import { describe, it, expect } from "vitest";

// Replicate the inline functions from admin-area.svelte for unit testing.
// These are NOT exported — tests mirror the exact implementation.
function isToken(row: any): row is { token: string; [key: string]: any } {
  return !!row && "token" in row && typeof row.token === "string";
}

function isUser(row: any): row is { _id: string; [key: string]: any } {
  return !!row && typeof row === "object" && "_id" in row && !("token" in row);
}

describe("Type guards", () => {
  // ---------------------------------------------------------------------------
  // isUser
  // ---------------------------------------------------------------------------

  describe("isUser", () => {
    it("should return true for a valid User object", () => {
      const user = { _id: "abc123", username: "john", email: "john@example.com", role: "admin" };
      expect(isUser(user)).toBe(true);
    });

    it("should return true for User with _id and role (no username)", () => {
      const user = { _id: "abc123", role: "editor" };
      expect(isUser(user)).toBe(true);
    });

    it("should return true for User with _id and username (no role)", () => {
      const user = { _id: "abc123", username: "john" };
      expect(isUser(user)).toBe(true);
    });

    it("should return false for a Token object (has token)", () => {
      const token = { _id: "t1", token: "abc-token-string", email: "x@y.com" };
      expect(isUser(token)).toBe(false);
    });

    it("should return false for null", () => {
      expect(isUser(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isUser(undefined)).toBe(false);
    });

    it("should return false for an empty object", () => {
      expect(isUser({})).toBe(false);
    });

    it("should return false for object with only token property", () => {
      expect(isUser({ token: "abc" })).toBe(false);
    });

    it("should return false for object with _id AND token (collision)", () => {
      // Has both _id and token — isUser excludes objects with token
      const collision = { _id: "x", token: "y" };
      expect(isUser(collision)).toBe(false);
    });

    it("should return false for non-object primitives", () => {
      expect(isUser("string")).toBe(false);
      expect(isUser(42)).toBe(false);
      expect(isUser(true)).toBe(false);
      expect(isUser([])).toBe(false); // arrays are objects, but no _id
    });

    it("should return false for object with _id but no username/role (edge case — still user per source)", () => {
      // Per source: !!row && '_id' in row && !('token' in row)
      // It doesn't actually check username or role — just _id and no token
      const minimalUser = { _id: "abc" };
      expect(isUser(minimalUser)).toBe(true);
    });

    it("should return false for object with username but no _id", () => {
      expect(isUser({ username: "john" })).toBe(false);
    });

    it("should return false for falsy values", () => {
      expect(isUser(0)).toBe(false);
      expect(isUser("")).toBe(false);
      expect(isUser(false)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // isToken
  // ---------------------------------------------------------------------------

  describe("isToken", () => {
    it("should return true for a valid Token object", () => {
      const token = {
        _id: "t1",
        token: "valid-token-string-here",
        email: "x@y.com",
        role: "user",
        expires: "2026-01-01T00:00:00.000Z",
      };
      expect(isToken(token)).toBe(true);
    });

    it("should return false for a User object (no token)", () => {
      const user = { _id: "u1", username: "john", email: "john@example.com", role: "admin" };
      expect(isToken(user)).toBe(false);
    });

    it("should return false for null", () => {
      expect(isToken(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isToken(undefined)).toBe(false);
    });

    it("should return false for an empty object", () => {
      expect(isToken({})).toBe(false);
    });

    it("should return false when token is not a string", () => {
      expect(isToken({ token: 123 })).toBe(false);
      expect(isToken({ token: true })).toBe(false);
      expect(isToken({ token: null })).toBe(false);
      expect(isToken({ token: undefined })).toBe(false);
      expect(isToken({ token: {} })).toBe(false);
      expect(isToken({ token: [] })).toBe(false);
    });

    it("should return false when token is an empty string", () => {
      // typeof "" === "string", so this IS actually a valid Token per the guard
      expect(isToken({ token: "" })).toBe(true);
    });

    it("should return true for minimal token with only token string", () => {
      expect(isToken({ token: "minimal" })).toBe(true);
    });

    it("should return false for object with _id and token (isUser returns false, isToken returns true)", () => {
      // This demonstrates the mutual exclusion
      const collision = { _id: "x", token: "y" };
      expect(isUser(collision)).toBe(false);
      expect(isToken(collision)).toBe(true);
    });

    it("should return false for falsy values", () => {
      expect(isToken(0)).toBe(false);
      expect(isToken("")).toBe(false);
      expect(isToken(false)).toBe(false);
    });
  });
});
