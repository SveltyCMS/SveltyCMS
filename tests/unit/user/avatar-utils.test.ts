/**
 * @file tests/unit/user/avatar-utils.test.ts
 * @description White-box unit tests for normalizeAvatarUrl.
 *
 * Source: src/stores/user-store.svelte.ts (re-exported from src/stores/store.svelte.ts)
 *
 * Behavior:
 * - null/undefined/falsy → '/Default_User.svg'
 * - 'data:' URIs → returned as-is
 * - http/https URLs → host stripped, path returned
 * - '/Default_User.svg' (case-insensitive) → '/Default_User.svg'
 * - Paths starting with '/files/' → returned as-is
 * - Paths starting with 'files/' (no leading slash) → '/' prepended
 * - Other paths → '/files/' prepended if no leading '/'
 */

import { describe, it, expect } from "vitest";
import { normalizeAvatarUrl } from "@src/stores/user-store.svelte";

describe("normalizeAvatarUrl", () => {
  // ---------------------------------------------------------------------------
  // NULL / UNDEFINED / FALSY
  // ---------------------------------------------------------------------------

  it("should return default avatar for null", () => {
    expect(normalizeAvatarUrl(null)).toBe("/Default_User.svg");
  });

  it("should return default avatar for undefined", () => {
    expect(normalizeAvatarUrl(undefined)).toBe("/Default_User.svg");
  });

  it("should return default avatar for empty string", () => {
    expect(normalizeAvatarUrl("")).toBe("/Default_User.svg");
  });

  // ---------------------------------------------------------------------------
  // DATA: URIs
  // ---------------------------------------------------------------------------

  it("should return data URI as-is", () => {
    const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=";
    expect(normalizeAvatarUrl(dataUri)).toBe(dataUri);
  });

  it("should return data URI with svg+xml as-is", () => {
    const dataUri = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0i...";
    expect(normalizeAvatarUrl(dataUri)).toBe(dataUri);
  });

  // ---------------------------------------------------------------------------
  // HTTP / HTTPS URLs
  // ---------------------------------------------------------------------------

  it("should strip host from https URL, returning just the path", () => {
    expect(normalizeAvatarUrl("https://example.com/avatars/user.png")).toBe("/avatars/user.png");
  });

  it("should strip host from http URL, returning just the path", () => {
    expect(normalizeAvatarUrl("http://cdn.example.com/avatar.jpg")).toBe("/avatar.jpg");
  });

  // ---------------------------------------------------------------------------
  // DEFAULT AVATAR VARIANTS
  // ---------------------------------------------------------------------------

  it("should normalize 'Default_User.svg' (no slash) to default path", () => {
    expect(normalizeAvatarUrl("Default_User.svg")).toBe("/Default_User.svg");
  });

  it("should normalize '/Default_User.svg' to itself", () => {
    expect(normalizeAvatarUrl("/Default_User.svg")).toBe("/Default_User.svg");
  });

  it("should handle case-insensitive Default_User.svg", () => {
    expect(normalizeAvatarUrl("default_user.svg")).toBe("/Default_User.svg");
    expect(normalizeAvatarUrl("/DEFAULT_USER.SVG")).toBe("/Default_User.svg");
  });

  // ---------------------------------------------------------------------------
  // /files/ PREFIXED PATHS
  // ---------------------------------------------------------------------------

  it("should return /files/ path as-is", () => {
    expect(normalizeAvatarUrl("/files/avatars/user123.png")).toBe("/files/avatars/user123.png");
  });

  it("should normalize 'files/' path (no leading slash) by prepending '/'", () => {
    // "files/avatars/user.png" → regex strips nothing → "files/avatars/user.png"
    // startsWith("/files/")? No → startsWith("/")? No → startsWith("files/")? Yes → "/" + path = "/files/avatars/user.png"
    expect(normalizeAvatarUrl("files/avatars/user.png")).toBe("/files/avatars/user.png");
  });

  // ---------------------------------------------------------------------------
  // PATHS WITHOUT /files/ PREFIX
  // ---------------------------------------------------------------------------

  it("should prepend /files/ to a bare filename", () => {
    expect(normalizeAvatarUrl("avatar.png")).toBe("/files/avatar.png");
  });

  it("should prepend /files/ to a relative path", () => {
    expect(normalizeAvatarUrl("uploads/avatar.png")).toBe("/files/uploads/avatar.png");
  });

  it("should handle paths already starting with slash (but not /files/)", () => {
    // "/avatars/user.png" → strip host? No host → replace(/^\/+/, "/") → "/avatars/user.png"
    // startsWith("/files/")? No → startsWith("/")? Yes → return "/avatars/user.png"
    expect(normalizeAvatarUrl("/avatars/user.png")).toBe("/avatars/user.png");
  });

  // ---------------------------------------------------------------------------
  // ABSOLUTE URL → STRIP HOST, KEEP PATH
  // ---------------------------------------------------------------------------

  it("should strip host from https /files/ URL, returning just the path", () => {
    // Implementation strips protocol and host, keeps /files/ path
    expect(normalizeAvatarUrl("https://mycms.com/files/avatars/user.png")).toBe(
      "/files/avatars/user.png",
    );
  });

  it("should strip host from https uploads URL, returning just the path", () => {
    // Implementation strips protocol and host, keeps path
    expect(normalizeAvatarUrl("https://mycms.com/uploads/avatar.png")).toBe("/uploads/avatar.png");
  });

  // ---------------------------------------------------------------------------
  // EDGE CASES
  // ---------------------------------------------------------------------------

  it("should handle multiple leading slashes", () => {
    expect(normalizeAvatarUrl("///files/avatar.png")).toBe("/files/avatar.png");
  });

  it("should handle path with mediaFolder prefix (returns as absolute path with leading slash)", () => {
    // "mediaFolder/avatar.png" → no host → replace nothing → no leading slash to normalize
    // startsWith("/files/")? No → path === "/"? No → startsWith("/")? No
    // startsWith("files/")? No → startsWith("mediaFolder")? Yes → "/mediaFolder/avatar.png"
    expect(normalizeAvatarUrl("mediaFolder/avatar.png")).toBe("/mediaFolder/avatar.png");
  });
});
