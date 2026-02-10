/**
 * @file src/routes/api/ai/chat/+server.ts
 * @description API endpoint for the built-in CMS AI Assistant.
 *
 * Features:
 * - Chat with AI Assistant
 * - History of messages
 *
 */

import { json } from '@sveltejs/kit';
import { aiService } from '@services/AIService';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	// 1. Check if user is logged in (Security first)
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { message, history } = await request.json();

		if (!message) {
			return json({ error: 'Message is required' }, { status: 400 });
		}

		const reply = await aiService.chat(message, history || []);

		return json({ reply });
	} catch (err: any) {
		console.error('AI API Error:', err);
		return json({ error: err.message }, { status: 500 });
	}
};
