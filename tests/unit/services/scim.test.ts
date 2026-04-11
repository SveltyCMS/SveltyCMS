/**
 * @file tests/unit/services/scim.test.ts
 * @description Unit tests for SCIM 2.0 utilities (RFC 7644)
 *
 * Features:
 * - Filter parser tests (eq, co, sw operators)
 * - PATCH engine tests (add, remove, replace operations)
 * - SCIM response builder tests
 * - Bearer token validation tests
 */

import {
  applyScimPatchOps,
  buildScimGroup,
  buildScimListResponse,
  buildScimUser,
  matchesScimFilter,
  parseScimFilter,
} from "@utils/scim-utils";

// ============================================================================
// Filter Parser Tests
// ============================================================================

describe("SCIM Filter Parser", () => {
  it("should return empty array for null/empty filter", () => {
    expect(parseScimFilter(null)).toEqual([]);
    expect(parseScimFilter("")).toEqual([]);
    expect(parseScimFilter("   ")).toEqual([]);
  });

  it("should parse eq operator", () => {
    const filters = parseScimFilter('userName eq "john@example.com"');
    expect(filters).toHaveLength(1);
    expect(filters[0]).toEqual({
      attribute: "username",
      operator: "eq",
      value: "john@example.com",
    });
  });

  it("should parse co operator", () => {
    const filters = parseScimFilter('emails.value co "@acme.com"');
    expect(filters).toHaveLength(1);
    expect(filters[0]).toEqual({
      attribute: "emails.value",
      operator: "co",
      value: "@acme.com",
    });
  });

  it("should parse sw operator", () => {
    const filters = parseScimFilter('userName sw "john"');
    expect(filters).toHaveLength(1);
    expect(filters[0]).toEqual({
      attribute: "username",
      operator: "sw",
      value: "john",
    });
  });

  it("should parse multiple filters with AND", () => {
    const filters = parseScimFilter('userName eq "john" and active eq "true"');
    expect(filters).toHaveLength(2);
    expect(filters[0].attribute).toBe("username");
    expect(filters[1].attribute).toBe("active");
  });

  it("should be case-insensitive for operators", () => {
    const filters = parseScimFilter('userName EQ "test"');
    expect(filters).toHaveLength(1);
    expect(filters[0].operator).toBe("eq");
  });
});

// ============================================================================
// Filter Matching Tests
// ============================================================================

describe("SCIM Filter Matching", () => {
  const testUser = {
    _id: "user-123",
    email: "john@acme.com",
    username: "John",
    lastName: "Doe",
    isActive: true,
    role: "admin",
  };

  it("should match all users when no filters", () => {
    expect(matchesScimFilter(testUser, [])).toBe(true);
  });

  it("should match eq filter on userName (mapped to email)", () => {
    const filters = parseScimFilter('userName eq "john@acme.com"');
    expect(matchesScimFilter(testUser, filters)).toBe(true);
  });

  it("should not match eq filter with wrong value", () => {
    const filters = parseScimFilter('userName eq "jane@acme.com"');
    expect(matchesScimFilter(testUser, filters)).toBe(false);
  });

  it("should match co filter on emails.value", () => {
    const filters = parseScimFilter('emails.value co "@acme"');
    expect(matchesScimFilter(testUser, filters)).toBe(true);
  });

  it("should match sw filter on userName", () => {
    const filters = parseScimFilter('userName sw "john"');
    expect(matchesScimFilter(testUser, filters)).toBe(true);
  });

  it("should be case-insensitive for values", () => {
    const filters = parseScimFilter('userName eq "JOHN@ACME.COM"');
    expect(matchesScimFilter(testUser, filters)).toBe(true);
  });

  it("should match on id attribute", () => {
    const filters = parseScimFilter('id eq "user-123"');
    expect(matchesScimFilter(testUser, filters)).toBe(true);
  });

  it("should return false for non-existent attribute", () => {
    const filters = parseScimFilter('nonExistent eq "value"');
    expect(matchesScimFilter(testUser, filters)).toBe(false);
  });
});

// ============================================================================
// PATCH Engine Tests
// ============================================================================

describe("SCIM PATCH Engine", () => {
  const existingUser = {
    _id: "user-123",
    email: "john@acme.com",
    username: "John",
    isActive: true,
  };

  it("should handle replace operation with path", () => {
    const updates = applyScimPatchOps(existingUser, [
      { op: "replace", path: "active", value: false },
    ]);
    expect(updates).toEqual({ isActive: false });
  });

  it("should handle add operation with path", () => {
    const updates = applyScimPatchOps(existingUser, [
      { op: "add", path: "displayName", value: "John Doe" },
    ]);
    expect(updates).toEqual({ username: "John Doe" });
  });

  it("should handle remove operation", () => {
    const updates = applyScimPatchOps(existingUser, [{ op: "remove", path: "displayName" }]);
    expect(updates).toEqual({ username: null });
  });

  it("should handle replace without path (merge object)", () => {
    const updates = applyScimPatchOps(existingUser, [
      { op: "replace", value: { userName: "jane@acme.com", active: false } },
    ]);
    expect(updates.email).toBe("jane@acme.com");
    expect(updates.isActive).toBe(false);
  });

  it("should handle multiple operations", () => {
    const updates = applyScimPatchOps(existingUser, [
      { op: "replace", path: "active", value: false },
      { op: "replace", path: "displayName", value: "Jane" },
    ]);
    expect(updates.isActive).toBe(false);
    expect(updates.username).toBe("Jane");
  });

  it("should handle name object in no-path merge", () => {
    const updates = applyScimPatchOps(existingUser, [
      {
        op: "replace",
        value: { name: { givenName: "Jane", familyName: "Smith" } },
      },
    ]);
    expect(updates.username).toBe("Jane");
    expect(updates.lastName).toBe("Smith");
  });

  it("should handle emails array in no-path merge", () => {
    const updates = applyScimPatchOps(existingUser, [
      {
        op: "replace",
        value: { emails: [{ value: "new@example.com", primary: true }] },
      },
    ]);
    expect(updates.email).toBe("new@example.com");
  });

  it("should ignore unknown paths", () => {
    const updates = applyScimPatchOps(existingUser, [
      { op: "replace", path: "unknownField", value: "test" },
    ]);
    expect(Object.keys(updates)).toHaveLength(0);
  });
});

// ============================================================================
// Response Builder Tests
// ============================================================================

describe("SCIM Response Builders", () => {
  describe("buildScimUser", () => {
    it("should build a compliant SCIM User resource", () => {
      const user = {
        _id: "user-123",
        email: "john@acme.com",
        username: "John",
        lastName: "Doe",
        role: "admin",
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      };

      const result = buildScimUser(user, "https://cms.example.com");

      expect(result.schemas).toContain("urn:ietf:params:scim:schemas:core:2.0:User");
      expect(result.id).toBe("user-123");
      expect(result.userName).toBe("john@acme.com");
      expect(result.name.givenName).toBe("John");
      expect(result.name.familyName).toBe("Doe");
      expect(result.active).toBe(true);
      expect(result.emails).toHaveLength(1);
      expect(result.emails[0].value).toBe("john@acme.com");
      expect(result.meta.resourceType).toBe("User");
      expect(result.meta.location).toBe("https://cms.example.com/api/scim/v2/Users/user-123");
    });

    it("should handle missing optional fields", () => {
      const user = { _id: "u1", email: "test@test.com" };
      const result = buildScimUser(user, "https://example.com");

      expect(result.userName).toBe("test@test.com");
      expect(result.name.givenName).toBe("");
      expect(result.active).toBe(true); // default
    });
  });

  describe("buildScimGroup", () => {
    it("should build a compliant SCIM Group resource", () => {
      const role = {
        _id: "role-1",
        name: "editor",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
      };
      const members = [
        { _id: "u1", email: "a@test.com" },
        { _id: "u2", email: "b@test.com" },
      ];

      const result = buildScimGroup(role, "https://cms.example.com", members);

      expect(result.schemas).toContain("urn:ietf:params:scim:schemas:core:2.0:Group");
      expect(result.id).toBe("role-1");
      expect(result.displayName).toBe("editor");
      expect(result.members).toHaveLength(2);
      expect(result.members[0].value).toBe("u1");
      expect(result.members[0].$ref).toBe("https://cms.example.com/api/scim/v2/Users/u1");
    });

    it("should handle no members", () => {
      const role = { _id: "r1", name: "viewer" };
      const result = buildScimGroup(role, "https://example.com");
      expect(result.members).toHaveLength(0);
    });
  });

  describe("buildScimListResponse", () => {
    it("should build a compliant ListResponse", () => {
      const resources = [{ id: "1" }, { id: "2" }];
      const result = buildScimListResponse(resources, 5, 1);

      expect(result.schemas).toContain("urn:ietf:params:scim:api:messages:2.0:ListResponse");
      expect(result.totalResults).toBe(5);
      expect(result.itemsPerPage).toBe(2);
      expect(result.startIndex).toBe(1);
      expect(result.Resources).toHaveLength(2);
    });

    it("should default startIndex to 1", () => {
      const result = buildScimListResponse([], 0);
      expect(result.startIndex).toBe(1);
    });
  });
});
