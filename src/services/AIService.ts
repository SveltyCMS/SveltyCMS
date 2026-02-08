/**
 * @file src/services/AIService.ts
 * @description Integrated AI Service for SveltyCMS.
 * Uses the local RAG knowledge base to assist users in the dashboard.
 */

import { connect } from 'vectordb';
import ollama from 'ollama';
import path from 'path';

// Path to the vector DB we created in the MCP step
const DB_PATH = path.resolve('mcp-server/data/vector-db');

export class AIService {
	private static instance: AIService;

	private constructor() {}

	public static getInstance(): AIService {
		if (!AIService.instance) {
			AIService.instance = new AIService();
		}
		return AIService.instance;
	}

	/**
	 * Search the internal knowledge base for relevant context
	 */
	public async searchContext(query: string, limit: number = 3) {
		try {
			const db = await connect(DB_PATH);
			let table;
			try {
				table = await db.openTable('sveltycms_knowledge');
			} catch (e) {
				// Table likely doesn't exist.
				// For now, return empty or try to create a dummy one if needed,
				// but creating requires schema/data.
				// Let's just log and return empty.
				console.warn("Vector DB table 'sveltycms_knowledge' not found. AI context will be empty.");
				return [];
			}

			const embedResponse = await ollama.embeddings({
				model: 'nomic-embed-text',
				prompt: query
			});

			const results = await table.search(embedResponse.embedding).limit(limit).execute();

			return results;
		} catch (error) {
			console.error('AI Search Error:', error);
			return [];
		}
	}

	/**
	 * Main chat interface for the CMS Dashboard
	 */
	public async chat(userMessage: string, history: any[] = []) {
		// 1. Get Context from RAG
		const contextResults = await this.searchContext(userMessage);
		const contextText = contextResults.map((r: any) => `[From ${r.source}]: ${r.text}`).join('\n\n');

		// 2. Query the LLM (Using ministral or nemotron from your machine)
		const systemPrompt = `You are SveltyAgent, the built-in AI for SveltyCMS. 
    Use the following verified context from the documentation and codebase to help the user.
    If the answer isn't in the context, be honest.
    
    CONTEXT:
    ${contextText}`;

		const response = await ollama.chat({
			model: 'ministral-3:latest', // Using your 6GB model for speed
			messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: userMessage }]
		});

		return response.message.content;
	}
}

export const aiService = AIService.getInstance();
