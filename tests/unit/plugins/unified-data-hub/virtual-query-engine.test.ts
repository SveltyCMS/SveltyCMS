/**
 * @file tests/unit/plugins/unified-data-hub/virtual-query-engine.test.ts
 * @description Unit tests for passthrough virtual query engine rejection rules.
 */

import { describe, expect, it } from "vitest";
import {
  rejectHybridQuery,
  rejectMultiCollection,
} from "@plugins/unified-data-hub/server/query-planner";
import { FederationError } from "@plugins/unified-data-hub/types";
import { parseAndValidateUrl } from "@plugins/unified-data-hub/server/ssrf";

describe("virtual-query-engine rejection rules", () => {
  it("rejects cross-source joins", () => {
    expect(() => rejectMultiCollection(["a", "b"])).toThrow(FederationError);
    expect(() => rejectMultiCollection(["a"])).not.toThrow();
  });

  it("rejects hybrid native+virtual filter keys", () => {
    expect(() => rejectHybridQuery({ "_native.title": "x" })).toThrow(FederationError);
    expect(() => rejectHybridQuery({ title: "x" })).not.toThrow();
  });
});

describe("SSRF host allowlist", () => {
  it("blocks loopback hosts outside test mode", () => {
    const saved = {
      NODE_ENV: process.env.NODE_ENV,
      TEST_MODE: process.env.TEST_MODE,
      BENCHMARK: process.env.BENCHMARK,
      SVELTY_BENCHMARK_SUITE: process.env.SVELTY_BENCHMARK_SUITE,
    };
    process.env.NODE_ENV = "production";
    delete process.env.TEST_MODE;
    delete process.env.BENCHMARK;
    delete process.env.SVELTY_BENCHMARK_SUITE;
    try {
      expect(() => parseAndValidateUrl("http://127.0.0.1/api", ["127.0.0.1"])).toThrow(
        FederationError,
      );
    } finally {
      process.env.NODE_ENV = saved.NODE_ENV;
      if (saved.TEST_MODE !== undefined) process.env.TEST_MODE = saved.TEST_MODE;
      else delete process.env.TEST_MODE;
      if (saved.BENCHMARK !== undefined) process.env.BENCHMARK = saved.BENCHMARK;
      else delete process.env.BENCHMARK;
      if (saved.SVELTY_BENCHMARK_SUITE !== undefined) {
        process.env.SVELTY_BENCHMARK_SUITE = saved.SVELTY_BENCHMARK_SUITE;
      } else {
        delete process.env.SVELTY_BENCHMARK_SUITE;
      }
    }
  });

  it("allows allowlisted loopback in test mode for fixtures", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    try {
      const url = parseAndValidateUrl("http://127.0.0.1/wp-json/wp/v2/posts", ["127.0.0.1"]);
      expect(url.hostname).toBe("127.0.0.1");
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it("allows allowlisted public hosts", () => {
    const url = parseAndValidateUrl("https://api.example.com/v1/posts", ["api.example.com"]);
    expect(url.hostname).toBe("api.example.com");
  });

  it("denies hosts not on allowlist", () => {
    expect(() => parseAndValidateUrl("https://evil.example.com/data", ["api.example.com"])).toThrow(
      FederationError,
    );
  });
});
