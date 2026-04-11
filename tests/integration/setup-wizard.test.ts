/**
 * @file tests/integration/setup-wizard.test.ts
 * @description Integration tests for SveltyCMS setup logic.
 * This directly tests server actions to verify DB configuration and seeding logic.
 */

import { describe, expect, it, beforeAll, afterAll } from "bun:test";
import { actions } from "@src/routes/setup/+page.server";
import fs from "node:fs";
import path from "node:path";

describe("Setup Wizard Integration", () => {
  const testDbPath = path.resolve(process.cwd(), "config", "svelty_setup_test.sqlite");
  const privateTestPath = path.resolve(process.cwd(), "config", "private.test.ts");

  beforeAll(() => {
    process.env.TEST_MODE = "true";
    // Cleanup potential stale files
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(privateTestPath)) fs.unlinkSync(privateTestPath);
  });

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(privateTestPath)) fs.unlinkSync(privateTestPath);
  });

  it("Action: testDatabase - should succeed with sqlite", async () => {
    const formData = new FormData();
    formData.append(
      "config",
      JSON.stringify({
        type: "sqlite",
        host: "config", // directory where the db will live
        name: "svelty_setup_test.sqlite",
      }),
    );
    formData.append("createIfMissing", "true");

    const request = new Request("http://localhost/setup?/testDatabase", {
      method: "POST",
      body: formData,
    });

    // @ts-expect-error - Mocking SvelteKit action context
    const result = (await actions.testDatabase({ request })) as any;

    expect(result.success).toBe(true);
    expect(result.message).toContain("connected successfully");
  });

  it("Action: seedDatabase - should write private config and start seeding", async () => {
    const formData = new FormData();
    const config = {
      type: "sqlite",
      host: "config",
      name: "svelty_setup_test.sqlite",
    };
    formData.append("config", JSON.stringify(config));
    formData.append("system", JSON.stringify({ preset: "blank" }));

    const request = new Request("http://localhost/setup?/seedDatabase", {
      method: "POST",
      body: formData,
    });

    // @ts-expect-error
    const result = (await actions.seedDatabase({ request })) as any;

    expect(result.success).toBe(true);
    expect(fs.existsSync(privateTestPath)).toBe(true);

    const content = fs.readFileSync(privateTestPath, "utf-8");
    expect(content).toContain("DB_TYPE: 'sqlite'");
    expect(content).toContain("DB_NAME: 'svelty_setup_test.sqlite'");
  });

  it("Action: completeSetup - should create admin user and session", async () => {
    const formData = new FormData();
    formData.append(
      "data",
      JSON.stringify({
        database: {
          type: "sqlite",
          host: "config",
          name: "svelty_setup_test.sqlite",
        },
        admin: {
          username: "testadmin",
          email: "test@example.com",
          password: "Password123!",
          confirmPassword: "Password123!",
        },
        system: {
          siteName: "Test CMS",
          multiTenant: false,
          demoMode: false,
        },
      }),
    );

    const mockCookies: any = {
      set: (name: string, value: string) => {
        expect(name).toBeDefined();
        expect(value).toBeDefined();
      },
      get: () => {},
      delete: () => {},
      getAll: () => [],
      serialize: () => "",
    };

    const request = new Request("http://localhost/setup?/completeSetup", {
      method: "POST",
      body: formData,
    });

    // @ts-expect-error
    const result = (await actions.completeSetup({
      request,
      cookies: mockCookies,
      url: new URL("http://localhost"),
    })) as any;

    expect(result.success).toBe(true);
    expect(result.redirectPath).toBeDefined();
    expect(result.sessionId).toBeDefined();
  });
});
