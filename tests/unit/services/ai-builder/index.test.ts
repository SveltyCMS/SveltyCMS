/**
 * @file tests/unit/services/ai-builder/index.test.ts
 * @description Contract-surface tests for the public AI builder entry point.
 *
 * Asserts that `src/services/ai-builder/index.ts` exports exactly the surface
 * documented in the API contract (plus the documented gateway extensions) so
 * the API agent can consume it without surprises.
 */

import { describe, expect, it } from "vitest";
import * as aiBuilder from "@src/services/ai-builder/index";

// Avoid loading the real widget scanner in this suite; the surface test only
// needs the modules to load, not a populated registry.
vi.mock("@src/services/core/widget-registry-service", () => ({
  widgetRegistryService: {
    getWidgetSync: () => undefined,
    getWidget: async () => undefined,
    getAllWidgets: async () => new Map<string, unknown>(),
    initialize: async () => {},
    isReady: () => true,
  },
}));

describe("public contract surface", () => {
  it("exports the gateway and default singleton", () => {
    expect(typeof aiBuilder.BuilderAiGateway).toBe("function");
    expect(aiBuilder.builderAiGateway).toBeInstanceOf(aiBuilder.BuilderAiGateway);
    expect(typeof aiBuilder.builderAiGateway.generateStructured).toBe("function");
    expect(typeof aiBuilder.builderAiGateway.checkQuota).toBe("function");
    expect(typeof aiBuilder.BuilderAiGateway.resetQuotasForTests).toBe("function");
  });

  it("exports the prompt builders and shield", () => {
    expect(typeof aiBuilder.shieldUserData).toBe("function");
    expect(typeof aiBuilder.buildDesignCollectionPrompt).toBe("function");
    expect(typeof aiBuilder.buildRefineCollectionPrompt).toBe("function");
  });

  it("exports the validator surface", () => {
    expect(aiBuilder.RESERVED_FIELD_NAMES).toBeInstanceOf(Set);
    expect(aiBuilder.RESERVED_FIELD_NAMES.has("tenantId")).toBe(true);
    expect(typeof aiBuilder.validateProposal).toBe("function");
    expect(typeof aiBuilder.validateAgainstRegistry).toBe("function");
  });

  it("exports the diff engine and designer services", () => {
    expect(typeof aiBuilder.diffSchema).toBe("function");
    expect(typeof aiBuilder.designCollection).toBe("function");
    expect(typeof aiBuilder.refineCollection).toBe("function");
  });

  it("exports the documented contract types (compile-time + runtime shape)", () => {
    const input: aiBuilder.DesignCollectionInput = {
      prompt: "p",
      tenantId: null,
      existingSchema: {},
      language: "de",
      availableWidgets: ["Input"],
    };
    const diff: aiBuilder.SchemaDiff = { added: [], removed: [], changed: [] };
    const result: aiBuilder.DesignResult = {
      proposal: {
        name: "n",
        slug: "s",
        label: "l",
        fields: [{ name: "f", widget: "w" }],
        rationale: ["r"],
      },
      diff,
      backend: "ollama",
    };
    expect(input.prompt).toBe("p");
    expect(result.backend).toBe("ollama");
  });
});
