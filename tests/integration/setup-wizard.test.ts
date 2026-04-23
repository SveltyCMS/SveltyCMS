/**
 * @file tests/integration/setup-wizard.test.ts
 * @description Integration tests for SveltyCMS setup logic.
 * Refactored to be 100% Black-Box using the external API.
 */

import { describe, expect, it, beforeAll } from "bun:test";
import { getApiBaseUrl, safeFetch } from "./helpers/server";
import fs from "node:fs";
import path from "node:path";

const API_BASE_URL = getApiBaseUrl();

describe("Setup Wizard Integration (Black-Box)", () => {
  const privateTestPath = path.resolve(process.cwd(), "config", "private.test.ts");

  beforeAll(() => {
    process.env.TEST_MODE = "true";
  });

  it("Action: testDatabase - should succeed with sqlite", async () => {
    const formData = new FormData();
    formData.append(
      "config",
      JSON.stringify({
        type: "sqlite",
        host: "config",
        name: "svelty_setup_test.sqlite",
        port: 0,
      }),
    );
    formData.append("createIfMissing", "true");

    const response = await safeFetch(`${API_BASE_URL}/setup?/testDatabase`, {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    // SvelteKit actions return JSON with "type" and "data"
    expect(response.ok).toBe(true);

    // Support both direct data and SvelteKit wrapper format
    let finalResult: any = result;
    if (result.data) {
      const data = typeof result.data === "string" ? JSON.parse(result.data) : result.data;
      finalResult = Array.isArray(data) ? data[1] : data;
    }

    // Log for debugging if needed
    if (!finalResult || (finalResult.success === undefined && finalResult.valid === undefined)) {
      console.log("Unexpected action response format:", result);
    }

    expect(finalResult.success || finalResult.valid || result.type === "success").toBe(true);
  });

  it("Action: seedDatabase - should write private config and start seeding", async () => {
    const formData = new FormData();
    const config = {
      type: "sqlite",
      host: "config",
      name: "svelty_setup_test.sqlite",
      port: 0,
    };
    formData.append("config", JSON.stringify(config));
    formData.append("system", JSON.stringify({ preset: "blank" }));

    const response = await safeFetch(`${API_BASE_URL}/setup?/seedDatabase`, {
      method: "POST",
      body: formData,
    });

    expect(response.ok).toBe(true);

    // Check if the file was actually written on the server
    expect(fs.existsSync(privateTestPath)).toBe(true);
  });
});
