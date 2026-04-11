/**
 * @file src/services/ai-service.ts
 * @description Integrated AI Service for SveltyCMS.
 * Uses a remote RAG knowledge base (mcp.sveltycms.com) for context,
 * and local Ollama for inference/generation.
 */

import ollama from "ollama";
import { getPrivateSetting } from "./settings-service";

// import { env } from '$env/dynamic/private'; // TODO: Use env for URL

// Default to the official SveltyCMS Knowledge Core
const DEFAULT_KNOWLEDGE_URL = "https://mcp.sveltycms.com/api/v1/query";

interface KnowledgeResult {
  source: string;
  text: string;
  score?: number;
}

export class AIService {
  private static instance: AIService;
  private readonly knowledgeUrl: string;

  private constructor() {
    this.knowledgeUrl = DEFAULT_KNOWLEDGE_URL;
  }

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  /**
   * Search the remote knowledge base for relevant context
   */
  public async searchContext(query: string, limit = 3): Promise<KnowledgeResult[]> {
    try {
      const useRemote = await getPrivateSetting("USE_REMOTE_AI_KNOWLEDGE");
      if (!useRemote) {
        return [];
      }

      // TODO: Add timeout and retry logic
      const response = await fetch(this.knowledgeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "SveltyCMS-Server/0.0.6",
        },
        body: JSON.stringify({
          query,
          limit,
          version: "0.0.6", // Send CMS version for version-specific docs
        }),
      });

      if (!response.ok) {
        console.warn(`AI Knowledge Core unreachable: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      return data.results || [];
    } catch (error) {
      console.error("AI Search Error:", error);
      // Fallback: If remote knowledge fails, just return empty context
      // and let the LLM use its internal knowledge.
      return [];
    }
  }

  /**
   * Internal helper to generate text from the local LLM.
   */
  private async generateText(prompt: string): Promise<string> {
    try {
      const ollamaUrl = await getPrivateSetting("OLLAMA_URL");
      const chatModel = (await getPrivateSetting("AI_MODEL_CHAT")) || "ministral-3:latest";
      const localOllama = ollamaUrl
        ? new (await import("ollama")).Ollama({ host: ollamaUrl })
        : ollama;

      const response = await localOllama.generate({
        model: chatModel,
        prompt: prompt,
        stream: false,
      });
      return response.response;
    } catch (err) {
      console.error("AI Text Generation Error:", err);
      return "";
    }
  }

  /**
   * Generates a JSON response from the AI.
   */
  public async generateJSON(prompt: string): Promise<any> {
    const fullPrompt = `${prompt}\n\nReturn ONLY raw JSON. No markdown blocks, no explanations.`;
    const text = await this.generateText(fullPrompt);
    try {
      // Strip potential markdown backticks
      const cleanJson = text.replace(/```json|```/g, "").trim();
      return JSON.parse(cleanJson);
    } catch {
      console.error("Failed to parse AI JSON response:", text);
      return null;
    }
  }

  /**
   * Analyze an image and return a list of tags
   * @param buffer - The image buffer to analyze
   * @param limit - Maximum number of tags to return
   */
  public async tagImage(buffer: Buffer, limit = 10): Promise<string[]> {
    try {
      const useAi = await getPrivateSetting("USE_AI_TAGGING");
      if (!useAi) {
        return [];
      }

      const model = (await getPrivateSetting("AI_MODEL_VISION")) || "llava:latest";
      const ollamaUrl = await getPrivateSetting("OLLAMA_URL");

      // Create a local ollama instance with the configured URL
      const localOllama = ollamaUrl
        ? new (await import("ollama")).Ollama({ host: ollamaUrl })
        : ollama;

      // Convert buffer to base64 for Ollama
      const base64 = buffer.toString("base64");

      const systemPrompt = `Analyze the provided image and generate up to ${limit} descriptive tags. 
      Return only the tags as a comma-separated list. 
      Do not include any other text or explanation. 
      Focus on objects, colors, setting, and mood.`;

      const response = await localOllama.generate({
        model,
        prompt: systemPrompt,
        images: [base64],
        stream: false,
      });

      const tags = response.response
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length < 30);

      return tags.slice(0, limit);
    } catch (err) {
      console.error("Ollama Image Analysis Error:", err);
      // Fallback to empty tags instead of failing the whole process
      return [];
    }
  }

  /**
   * Main chat interface for the CMS Dashboard
   */
  public async chat(userMessage: string, history: import("ollama").Message[] = []) {
    // 1. Get Context from Remote RAG (if enabled)
    const useRemote = await getPrivateSetting("USE_REMOTE_AI_KNOWLEDGE");
    const contextResults = useRemote ? await this.searchContext(userMessage) : [];

    let contextText = "";
    if (contextResults.length > 0) {
      contextText = contextResults.map((r) => `[From ${r.source}]: ${r.text}`).join("\n\n");
    }

    // 2. Query the Local LLM (Ollama)
    // We mix remote context with local privacy-preserving inference
    const systemPrompt = `You are SveltyAgent, the built-in AI for SveltyCMS. 
    Use the following verified context from the documentation to help the user.
    If the context doesn't answer the question, use your general knowledge but mention that you aren't sure.
    
    CONTEXT:
    ${contextText}`;

    try {
      const ollamaUrl = await getPrivateSetting("OLLAMA_URL");
      const chatModel = (await getPrivateSetting("AI_MODEL_CHAT")) || "ministral-3:latest";
      const localOllama = ollamaUrl
        ? new (await import("ollama")).Ollama({ host: ollamaUrl })
        : ollama;

      const response = await localOllama.chat({
        model: chatModel,
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: userMessage },
        ],
      });
      return response.message.content;
    } catch (err) {
      console.error("Ollama Inference Error:", err);
      return "I'm having trouble connecting to my local brain (Ollama). Please ensure 'ollama serve' is running and OLLAMA_URL is correct.";
    }
  }

  /**
   * Generate an AI-Native layout specification for json-render-svelte.
   * Returns parsed JSON structure directly consumable by <Renderer spec={...} />
   */
  public async generateLayoutSpec(
    prompt: string,
    contextRules = "",
  ): Promise<Record<string, unknown> | null> {
    const systemPrompt = `You are SveltyAgent, an expert AI generating layout specs for json-render-svelte.
Return ONLY valid JSON. No markdown blocks, no conversational text.
The JSON must have a 'root' pointing to the root element's ID, and an 'elements' object containing the UI nodes.
You have access to the following SveltyCMS widgets: 'Text', 'Input', 'RichText', 'Date', 'Repeater', 'VerticalLayout', 'HorizontalLayout'.

Format example:
{
  "root": "layout",
  "elements": {
    "layout": { "type": "VerticalLayout", "elements": ["title", "desc"] },
    "title": { "type": "Control", "scope": "#/properties/title", "label": "Title", "options": { "widget": "Text" } },
    "desc": { "type": "Control", "scope": "#/properties/desc", "label": "Description", "options": { "widget": "RichText" } }
  }
}
${contextRules}`;

    try {
      const ollamaUrl = await getPrivateSetting("OLLAMA_URL");
      const chatModel = (await getPrivateSetting("AI_MODEL_CHAT")) || "ministral-3:latest";
      // Dynamically import Ollama to allow custom hosts
      const localOllama = ollamaUrl
        ? new (await import("ollama")).Ollama({ host: ollamaUrl })
        : ollama;

      const response = await localOllama.chat({
        model: chatModel,
        format: "json",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      });

      return JSON.parse(response.message.content);
    } catch (err) {
      console.error("Generative Layout Error:", err);
      return null;
    }
  }

  /**
   * Translates content between languages with cultural awareness.
   */
  public async translate(
    text: string,
    sourceLoc: string,
    targetLoc: string,
    context = "",
  ): Promise<string> {
    const systemPrompt = `You are a professional localization expert. 
		Translate the following text from ${sourceLoc} to ${targetLoc}.
		Maintain the original tone, formatting, and technical terms.
		Cultural Context: ${context}
		
		Return ONLY the translated text.`;

    try {
      const ollamaUrl = await getPrivateSetting("OLLAMA_URL");
      const chatModel = (await getPrivateSetting("AI_MODEL_CHAT")) || "ministral-3:latest";
      const localOllama = ollamaUrl
        ? new (await import("ollama")).Ollama({ host: ollamaUrl })
        : ollama;

      const response = await localOllama.chat({
        model: chatModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      });
      return response.message.content;
    } catch (err) {
      console.error("AI Translation Error:", err);
      return text; // Fallback to original
    }
  }

  /**
   * Suggest a mapping from a source schema to a target SveltyCMS collection schema.
   * Returns a JSON mapping object.
   */
  public async suggestMapping(
    sourceSchema: any,
    targetCollection: any,
  ): Promise<Record<string, any>> {
    const systemPrompt = `You are an expert content architect. 
    Map the provided source fields to SveltyCMS widgets for the collection "${targetCollection.name}".
    Return ONLY valid JSON mapping source field names to target field names and transformations.
    
    Target Collection Fields: ${JSON.stringify(targetCollection.fields)}
    
    Example response:
    {
      "title": "name",
      "body": "content",
      "field_image": { "target": "thumbnail", "transform": "media" }
    }`;

    try {
      const ollamaUrl = await getPrivateSetting("OLLAMA_URL");
      const chatModel = (await getPrivateSetting("AI_MODEL_CHAT")) || "ministral-3:latest";
      const localOllama = ollamaUrl
        ? new (await import("ollama")).Ollama({ host: ollamaUrl })
        : ollama;

      const response = await localOllama.chat({
        model: chatModel,
        format: "json",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Source Fields: ${JSON.stringify(sourceSchema)}`,
          },
        ],
      });

      return JSON.parse(response.message.content);
    } catch (err) {
      console.error("AI Mapping Suggestion Error:", err);
      return {};
    }
  }

  /**
   * Generic text enrichment service (translate, summarize, seo, tags).
   * @param text - The source text to enrich
   * @param action - The action to perform (translate, summarize, seo, tags)
   * @param language - The target language for translation
   */
  public async enrichText(text: string, action: string, language?: string): Promise<string> {
    if (!text) return "";

    let prompt = "";
    switch (action) {
      case "translate":
        if (!language) throw new Error("Target language is required for translation.");
        return this.translate(text, "source", language);
      case "summarize":
        prompt = "Summarize the following text concisely. Keep the original language.";
        break;
      case "seo":
        prompt =
          "Optimize the following text for SEO. Provide a title, description, and keywords. Keep the original language.";
        break;
      case "tags":
        prompt =
          "Generate up to 5 descriptive tags for the following text. Return ONLY as a comma-separated list. Keep the original language.";
        break;
      default:
        throw new Error(`Unsupported AI action: ${action}`);
    }

    return this.process(prompt, text);
  }

  /**
   * Internal helper to process text with a specific prompt.
   */
  public async process(prompt: string, text: string): Promise<string> {
    const systemPrompt = `${prompt}\n\nReturn ONLY the processed text.`;

    try {
      const ollamaUrl = await getPrivateSetting("OLLAMA_URL");
      const chatModel = (await getPrivateSetting("AI_MODEL_CHAT")) || "ministral-3:latest";
      const localOllama = ollamaUrl
        ? new (await import("ollama")).Ollama({ host: ollamaUrl })
        : ollama;

      const response = await localOllama.chat({
        model: chatModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
      });
      return response.message.content;
    } catch (err) {
      console.error("AI Text Processing Error:", err);
      return text; // Fallback to original
    }
  }
}

export const aiService = AIService.getInstance();
