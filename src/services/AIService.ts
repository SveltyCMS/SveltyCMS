/**
 * @file src/services/AIService.ts
 * @description Integrated AI Service for SveltyCMS.
 * Uses a remote RAG knowledge base (mcp.sveltycms.com) for context,
 * and local Ollama for inference/generation.
 */

import ollama from 'ollama';
import { getPrivateSetting } from './settingsService';

// import { env } from '$env/dynamic/private'; // TODO: Use env for URL

// Default to the official SveltyCMS Knowledge Core
const DEFAULT_KNOWLEDGE_URL = 'https://mcp.sveltycms.com/api/v1/query';

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
	public async searchContext(query: string, limit = 3) {
		try {
			const useRemote = await getPrivateSetting('USE_REMOTE_AI_KNOWLEDGE');
			if (!useRemote) {
				return [];
			}

			// TODO: Add timeout and retry logic
			const response = await fetch(this.knowledgeUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': 'SveltyCMS-Server/0.0.6'
				},
				body: JSON.stringify({
					query,
					limit,
					version: '0.0.6' // Send CMS version for version-specific docs
				})
			});

			if (!response.ok) {
				console.warn(`AI Knowledge Core unreachable: ${response.status} ${response.statusText}`);
				return [];
			}

			const data = await response.json();
			return data.results || [];
		} catch (error) {
			console.error('AI Search Error:', error);
			// Fallback: If remote knowledge fails, just return empty context
			// and let the LLM use its internal knowledge.
			return [];
		}
	}

	/**
	 * Analyze an image and return a list of tags
	 * @param buffer - The image buffer to analyze
	 * @param limit - Maximum number of tags to return
	 */
	public async tagImage(buffer: Buffer, limit = 10): Promise<string[]> {
		try {
			const useAi = await getPrivateSetting('USE_AI_TAGGING');
			if (!useAi) {
				return [];
			}

			const model = (await getPrivateSetting('AI_MODEL_VISION')) || 'llava:latest';
			const ollamaUrl = await getPrivateSetting('OLLAMA_URL');

			// Create a local ollama instance with the configured URL
			const localOllama = ollamaUrl ? new (await import('ollama')).Ollama({ host: ollamaUrl }) : ollama;

			// Convert buffer to base64 for Ollama
			const base64 = buffer.toString('base64');

			const systemPrompt = `Analyze the provided image and generate up to ${limit} descriptive tags. 
      Return only the tags as a comma-separated list. 
      Do not include any other text or explanation. 
      Focus on objects, colors, setting, and mood.`;

			const response = await localOllama.generate({
				model,
				prompt: systemPrompt,
				images: [base64],
				stream: false
			});

			const tags = response.response
				.split(',')
				.map((t) => t.trim().toLowerCase())
				.filter((t) => t.length > 0 && t.length < 30);

			return tags.slice(0, limit);
		} catch (err) {
			console.error('Ollama Image Analysis Error:', err);
			// Fallback to empty tags instead of failing the whole process
			return [];
		}
	}

	/**
	 * Main chat interface for the CMS Dashboard
	 */
	public async chat(userMessage: string, history: any[] = []) {
		// 1. Get Context from Remote RAG (if enabled)
		const useRemote = await getPrivateSetting('USE_REMOTE_AI_KNOWLEDGE');
		const contextResults = useRemote ? await this.searchContext(userMessage) : [];

		let contextText = '';
		if (contextResults.length > 0) {
			contextText = contextResults.map((r: any) => `[From ${r.source}]: ${r.text}`).join('\n\n');
		}

		// 2. Query the Local LLM (Ollama)
		// We mix remote context with local privacy-preserving inference
		const systemPrompt = `You are SveltyAgent, the built-in AI for SveltyCMS. 
    Use the following verified context from the documentation to help the user.
    If the context doesn't answer the question, use your general knowledge but mention that you aren't sure.
    
    CONTEXT:
    ${contextText}`;

		try {
			const ollamaUrl = await getPrivateSetting('OLLAMA_URL');
			const chatModel = (await getPrivateSetting('AI_MODEL_CHAT')) || 'ministral-3:latest';
			const localOllama = ollamaUrl ? new (await import('ollama')).Ollama({ host: ollamaUrl }) : ollama;

			const response = await localOllama.chat({
				model: chatModel,
				messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: userMessage }]
			});
			return response.message.content;
		} catch (err) {
			console.error('Ollama Inference Error:', err);
			return "I'm having trouble connecting to my local brain (Ollama). Please ensure 'ollama serve' is running and OLLAMA_URL is correct.";
		}
	}
}

export const aiService = AIService.getInstance();
