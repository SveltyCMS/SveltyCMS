/**
 * @file tests/unit/services/ai-builder/collection-designer.test.ts
 * @description Unit tests for the collection design/refine services.
 *
 * The default gateway singleton is exercised end-to-end with the ai-service
 * module mocked, so no Ollama call ever leaves the process. The widget
 * registry service is mocked with a deterministic widget set.
 *
 * ### Features covered:
 * - design + refine happy paths with backend attribution
 * - diff computation when an existing schema is supplied
 * - AI_UNAVAILABLE / AI_OUTPUT_INVALID / VALIDATION_FAILED error surfaces
 * - caller-provided widget allowlist enforcement
 * - registry-derived default allowlist
 * - quota enforcement + system-user bypass
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@utils/error-handling";
import { BuilderAiGateway } from "@src/services/ai-builder/gateway";
import { designCollection, refineCollection } from "@src/services/ai-builder/collection-designer";

// The default singleton lazily imports ai-service (Ollama). Mock it so tests
// never touch the network.
vi.mock("@src/services/core/ai-service", () => ({
  aiService: { generateJSON: vi.fn(), chat: vi.fn() },
}));
vi.mock("@src/services/core/widget-registry-service", () => {
  const names = ["Input", "Number", "RichText", "Slug", "Checkbox"];
  const widgetMap = new Map<string, unknown>(names.map((name) => [name, { Name: name }]));
  return {
    widgetRegistryService: {
      getWidgetSync: (name: string) => widgetMap.get(name),
      getWidget: async (name: string) => widgetMap.get(name),
      getAllWidgets: async () => new Map(widgetMap),
      initialize: async () => {},
      isReady: () => true,
    },
  };
});
import { aiService } from "@src/services/core/ai-service";

const validProposal = {
  name: "Blog Post",
  slug: "blog-post",
  label: "Blog Post",
  description: "A blog post",
  fields: [
    {
      name: "title",
      label: "Title",
      widget: "Input",
      type: "string",
      required: true,
      translated: false,
    },
    { name: "body", widget: "RichText", type: "richtext", required: false, translated: false },
    { name: "slug", widget: "Slug", required: false },
  ],
  rationale: ["Standard blog schema"],
};

const baseInput = {
  prompt: "Create a blog post collection.",
  language: "en",
  availableWidgets: ["Input", "Number", "RichText", "Slug", "Checkbox"],
};

beforeEach(() => {
  BuilderAiGateway.resetQuotasForTests();
  vi.mocked(aiService.generateJSON).mockReset();
});

async function expectAppError(
  fn: () => Promise<unknown>,
  status: number,
  code: string,
): Promise<AppError> {
  try {
    await fn();
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    const appError = err as AppError;
    expect(appError.status).toBe(status);
    expect(appError.code).toBe(code);
    return appError;
  }
  throw new Error(`Expected AppError ${status} ${code}, but nothing was thrown`);
}

describe("designCollection", () => {
  it("returns a validated proposal with the producing backend", async () => {
    vi.mocked(aiService.generateJSON).mockResolvedValue(validProposal);
    const result = await designCollection(baseInput, "user-1");
    expect(result.backend).toBe("ollama");
    expect(result.proposal.slug).toBe("blog-post");
    expect(result.proposal.fields).toHaveLength(3);
    expect(result.diff).toBeUndefined();
  });

  it("computes a diff when an existing schema is provided", async () => {
    vi.mocked(aiService.generateJSON).mockResolvedValue(validProposal);
    const existing = {
      fields: [
        { db_fieldName: "title", widget: "Input" },
        { db_fieldName: "oldField", widget: "Number" },
      ],
    };
    const result = await designCollection({ ...baseInput, existingSchema: existing }, "user-2");
    expect(result.diff).toBeDefined();
    expect(result.diff?.removed).toEqual([{ name: "oldField" }]);
    expect(result.diff?.added.map((field) => field.name)).toEqual(["body", "slug"]);
  });

  it("throws AI_UNAVAILABLE when every backend returns null", async () => {
    vi.mocked(aiService.generateJSON).mockResolvedValue(null);
    const err = await expectAppError(
      () => designCollection(baseInput, "user-3"),
      503,
      "AI_UNAVAILABLE",
    );
    expect(err.message).toContain("AI provider unavailable");
  });

  it("throws AI_OUTPUT_INVALID for malformed model output", async () => {
    vi.mocked(aiService.generateJSON).mockResolvedValue({ slug: "missing-the-rest" });
    await expectAppError(() => designCollection(baseInput, "user-4"), 400, "AI_OUTPUT_INVALID");
  });

  it("throws VALIDATION_FAILED for unknown widgets", async () => {
    vi.mocked(aiService.generateJSON).mockResolvedValue({
      ...validProposal,
      fields: [{ name: "ghost", widget: "GhostWidget" }],
    });
    const err = await expectAppError(
      () => designCollection(baseInput, "user-5"),
      400,
      "VALIDATION_FAILED",
    );
    expect(err.message).toContain("GhostWidget");
  });

  it("enforces the caller-provided widget allowlist on the output", async () => {
    vi.mocked(aiService.generateJSON).mockResolvedValue({
      ...validProposal,
      fields: [
        { name: "title", widget: "Input" },
        { name: "price", widget: "Number" }, // valid widget, but not in the allowlist below
      ],
    });
    const input = { ...baseInput, availableWidgets: ["Input", "Slug"] };
    const err = await expectAppError(
      () => designCollection(input, "user-6"),
      400,
      "VALIDATION_FAILED",
    );
    expect(err.message).toContain("Number");
  });

  it("derives the widget list from the registry when no allowlist is given", async () => {
    vi.mocked(aiService.generateJSON).mockResolvedValue(validProposal);
    await designCollection({ ...baseInput, availableWidgets: undefined }, "user-7");
    const prompt = vi.mocked(aiService.generateJSON).mock.calls[0][0] as string;
    expect(prompt).toContain("Input");
    expect(prompt).toContain("RichText");
    expect(prompt).toContain("<user_data>");
  });

  it("embeds the shielded user prompt for the model", async () => {
    vi.mocked(aiService.generateJSON).mockResolvedValue(validProposal);
    await designCollection(baseInput, "user-8");
    const prompt = vi.mocked(aiService.generateJSON).mock.calls[0][0] as string;
    expect(prompt).toContain("Create a blog post collection.");
    expect(prompt).toContain("passive reference data");
  });

  it("bypasses the quota for system/undefined users", async () => {
    vi.mocked(aiService.generateJSON).mockResolvedValue(validProposal);
    for (let i = 0; i < 25; i++) {
      await designCollection(baseInput); // no userId
      await designCollection(baseInput, "system");
    }
  });

  it("enforces the per-user quota without calling the model again", async () => {
    vi.mocked(aiService.generateJSON).mockResolvedValue(validProposal);
    for (let i = 0; i < 20; i++) {
      await designCollection(baseInput, "quota-user");
    }
    expect(vi.mocked(aiService.generateJSON).mock.calls.length).toBe(20);
    await expectAppError(() => designCollection(baseInput, "quota-user"), 429, "RATE_LIMITED");
    expect(vi.mocked(aiService.generateJSON).mock.calls.length).toBe(20);
  });
});

describe("refineCollection", () => {
  const previousProposal = {
    name: "Blog Post",
    slug: "blog-post",
    label: "Blog Post",
    fields: [{ name: "title", widget: "Input" }],
  };

  it("embeds the previous proposal and returns the refined one", async () => {
    vi.mocked(aiService.generateJSON).mockResolvedValue(validProposal);
    const result = await refineCollection(
      { ...baseInput, prompt: "Add a slug field", previousProposal },
      "user-9",
    );
    expect(result.backend).toBe("ollama");
    expect(result.proposal.fields).toHaveLength(3);
    const prompt = vi.mocked(aiService.generateJSON).mock.calls[0][0] as string;
    expect(prompt).toContain("Current proposal");
    expect(prompt).toContain("blog-post");
    expect(prompt).toContain("Add a slug field");
  });

  it("throws AI_UNAVAILABLE when the backend is down", async () => {
    vi.mocked(aiService.generateJSON).mockResolvedValue(null);
    await expectAppError(
      () => refineCollection({ ...baseInput, previousProposal }, "user-10"),
      503,
      "AI_UNAVAILABLE",
    );
  });
});
