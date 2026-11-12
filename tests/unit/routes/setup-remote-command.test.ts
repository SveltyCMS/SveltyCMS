/**
 * @file tests/unit/routes/setup-remote-command.test.ts
 * @description Regression guard for the setup wizard remote functions.
 *
 * `query` is a GET: its serialized payload lands in access logs, browser
 * history, and devtools URLs. The setup flow carries a database password, so
 * `testDatabaseConnection` and `seedDatabase` must be registered as `command`
 * (POST body) — this test pins the primitive each export was declared with.
 *
 * ### Features:
 * - Records the registration primitive while `$app/server` is mocked
 * - Asserts credential-carrying setup exports are `command`, not `query`
 */

import { describe, expect, it, vi } from "vitest";

const registrations = vi.hoisted(
  () => [] as Array<{ kind: "query" | "command"; handler: unknown }>,
);

vi.mock("$app/server", () => ({
  query: (_mode: string, handler: unknown) => {
    registrations.push({ kind: "query", handler });
    return handler;
  },
  command: (_mode: string, handler: unknown) => {
    registrations.push({ kind: "command", handler });
    return handler;
  },
  getRequestEvent: () => ({
    url: new URL("http://localhost/setup"),
    cookies: { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
  }),
}));

import * as setupRemote from "@src/routes/setup/setup.remote";

function registeredKind(name: keyof typeof setupRemote): "query" | "command" | undefined {
  return registrations.find((entry) => entry.handler === setupRemote[name])?.kind;
}

describe("setup.remote registration kinds", () => {
  it.each(["testDatabaseConnection", "seedDatabase", "completeSetup"] as const)(
    "%s is a command (POST body, never a GET URL)",
    (name) => {
      expect(registeredKind(name)).toBe("command");
    },
  );
});
