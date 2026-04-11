/**
 * @file tests/unit/services/ai-service.test.ts
 * @description Tests for AI service
 */

import { AIService } from "@src/services/ai-service";

// Mock settings-service
vi.mock("@src/services/settings-service", () => ({
  getPrivateSetting: vi.fn((key: string) => {
    if (key === "USE_REMOTE_AI_KNOWLEDGE") return Promise.resolve(true);
    if (key === "USE_AI_TAGGING") return Promise.resolve(true);
    if (key === "AI_MODEL_VISION") return Promise.resolve("llava:latest");
    if (key === "AI_MODEL_CHAT") return Promise.resolve("ministral-3:latest");
    return Promise.resolve(null);
  }),
  getPublicSetting: vi.fn(() => Promise.resolve("")),
}));

// Mock ollama
vi.mock("ollama", () => {
  const mockFn = vi.fn((params: any) => {
    if (params?.format === "json") {
      return Promise.resolve({
        message: { content: '{"root":"mock", "elements":{}}' },
      });
    }
    return Promise.resolve({ message: { content: "AI response" } });
  });
  const mockGenerate = vi.fn(() => Promise.resolve({ response: "tag1, tag2, tag3" }));

  return {
    default: {
      generate: mockGenerate,
      chat: mockFn,
    },
    Ollama: class {
      generate = mockGenerate;
      chat = mockFn;
    },
  };
});

// Mock fetch globally
const originalFetch = global.fetch;

describe("AIService", () => {
  let aiService: AIService;
  let mockFetch: any;

  beforeAll(() => {
    mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            results: [{ source: "docs", text: "relevant context" }],
          }),
      }),
    );
    global.fetch = mockFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    aiService = AIService.getInstance();
  });

  describe("searchContext", () => {
    it("should call remote knowledge base when enabled", async () => {
      const results = await aiService.searchContext("how to create collection");

      expect(global.fetch).toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].text).toBe("relevant context");
    });
  });

  describe("tagImage", () => {
    it("should generate tags using vision model", async () => {
      const buffer = Buffer.from("fake-image-data");
      const tags = await aiService.tagImage(buffer);

      expect(tags).toEqual(["tag1", "tag2", "tag3"]);
    });
  });

  describe("chat", () => {
    it("should mix remote context with local inference", async () => {
      const response = await aiService.chat("Hello");

      expect(global.fetch).toHaveBeenCalled(); // Should have searched context
      expect(response).toBe("AI response");
    });
  });

  describe("generateLayoutSpec", () => {
    it("should generate a json-render-svelte JSON spec", async () => {
      const prompt = "Create a dashboard layout";
      const spec = await aiService.generateLayoutSpec(prompt);

      expect(spec).toBeDefined();
      expect(spec?.root).toBe("mock");
      expect(spec?.elements).toBeDefined();
    });
  });
});
