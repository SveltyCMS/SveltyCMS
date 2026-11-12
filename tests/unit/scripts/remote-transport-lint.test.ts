/**
 * @file tests/unit/scripts/remote-transport-lint.test.ts
 * @description Transport/payload contract for SvelteKit remote functions.
 *
 * WHY: `query()` is a GET, so its arguments end up in the URL. Manual QA found a
 * setup wizard sending database, SMTP and Redis passwords that way, plus a
 * state-changing seed call served over GET. The first run of this rule also
 * found `verifyPassword`, `reauthForSessionManagement` and `deleteUser` in the
 * admin app — the same class, outside the QA surface.
 *
 * ### Features:
 * - a secret-shaped payload field on query() is an error
 * - a mutating name on query() is an error
 * - the handler BODY is never scanned (reading `user.password` is fine)
 * - strings/comments cannot unbalance the argument extraction
 * - command() and non-remote files are ignored
 * - the documented allow marker suppresses exactly one registration
 */

import { describe, expect, it } from "vitest";

import { findRemoteTransportOffenses } from "../../../scripts/lint/scan-remote-transport";

const REMOTE = "src/routes/example/demo.remote.ts";

function scan(source: string, path = REMOTE) {
  return findRemoteTransportOffenses([{ path, source }]);
}

describe("remote transport lint", () => {
  it("flags a credential passed to query()", () => {
    const offenses = scan(`
      export const verifyPassword = query("unchecked", async (password: string) => {
        return { valid: true };
      });
    `);

    expect(offenses).toHaveLength(1);
    expect(offenses[0]).toMatchObject({ file: REMOTE, name: "verifyPassword" });
    expect(offenses[0].reason).toContain("command()");
  });

  it("flags an object payload whose type names a secret", () => {
    const offenses = scan(`
      export const testConnection = query(
        "unchecked",
        async ({ config }: { config: { host: string; password: string } }) => config,
      );
    `);

    expect(offenses).toHaveLength(1);
    expect(offenses[0].name).toBe("testConnection");
  });

  it("flags a mutating remote served over GET", () => {
    const offenses = scan(`
      export const deleteUser = query("unchecked", async (id: string) => id);
      export const seedDatabase = query("unchecked", async (cfg: unknown) => cfg);
    `);

    expect(offenses.map((o) => o.name)).toEqual(["deleteUser", "seedDatabase"]);
    expect(offenses[0].reason).toContain("mutating");
  });

  it("never scans the handler body for secret-shaped reads", () => {
    const offenses = scan(`
      export const checkAuthMethods = query("unchecked", async (email: string) => {
        const user = await findUser(email);
        return { hasPassword: Boolean(user.password), hasPasskey: false };
      });
    `);

    expect(offenses).toEqual([]);
  });

  it("is not unbalanced by parentheses inside strings or comments", () => {
    const offenses = scan(`
      export const probe = query("unchecked", async (email: string) => {
        // a comment with a ( paren
        const note = "a string with ) paren and // slashes";
        return { email, note };
      });
    `);

    expect(offenses).toEqual([]);
  });

  it("accepts command() for secrets and mutations", () => {
    const offenses = scan(`
      export const verifyPassword = command("unchecked", async (password: string) => password);
      export const deleteUser = command("unchecked", async (id: string) => id);
    `);

    expect(offenses).toEqual([]);
  });

  it("ignores files that are not .remote.ts", () => {
    const offenses = scan(
      `export const verifyPassword = query("unchecked", async (password: string) => password);`,
      "src/routes/example/+page.server.ts",
    );

    expect(offenses).toEqual([]);
  });

  it("honours the documented allow marker on the line above", () => {
    const offenses = scan(`
      // remote-transport-allow: body is empty, the argument is a capability URL issued server-side
      export const resolveLink = query("unchecked", async (token: string) => token);
    `);

    expect(offenses).toEqual([]);
  });

  it("reports the 1-based line of the registration", () => {
    const offenses = scan(
      `\n\nexport const deleteUser = query("unchecked", async (id: string) => id);`,
    );

    expect(offenses[0].line).toBe(3);
  });
});
