/**
 * @file src/services/AIService.ts
 * @description Integrated AI Service for SveltyCMS.
 * Uses a remote RAG knowledge base (mcp.sveltycms.com) for context,
 * and local Ollama for inference/generation.
 */

import ollama from 'ollama';
// import { env } from '$env/dynamic/private'; // TODO: Use env for URL

// Default to the official SveltyCMS Knowledge Core
const DEFAULT_KNOWLEDGE_URL = 'https://mcp.sveltycms.com/api/v1/query';

export class AIService {
	private static instance: AIService;
	private knowledgeUrl: string;

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
	public async searchContext(query: string, limit: number = 3) {
		try {
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
	 * Main chat interface for the CMS Dashboard
	 */
	public async chat(userMessage: string, history: any[] = []) {
		// 1. Get Context from Remote RAG
		const contextResults = await this.searchContext(userMessage);

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
			const response = await ollama.chat({
				model: 'ministral-3:latest',
				messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: userMessage }]
			});
			return response.message.content;
		} catch (err) {
			console.error('Ollama Inference Error:', err);
			return "I'm having trouble connecting to my local brain (Ollama). Please ensure 'ollama serve' is running.";
		}
	}
}

export const aiService = AIService.getInstance();
