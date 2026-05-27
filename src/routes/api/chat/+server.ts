/**
 * @file src/routes/api/chat/+server.ts
 * @description
 * API endpoint for real-time chat communication.
 * Dispatches messages to the global EventBus and coordinates
 * interactions between users and the AI Assistant.
 *
 * features:
 * - multi-room chat support
 * - real-time message distribution via EventBus
 * - AI Assistant integration and message simulation
 * - authenticated user payload resolution
 */

import { eventBus } from '@src/services/automation/event-bus';
import { json } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	// 1. Authentication Check
	if (!locals.user) {
		return json({ success: false, message: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { content, room, tab } = await request.json();

		if (!content?.trim()) {
			return json({ success: false, message: 'Content is required' }, { status: 400 });
		}

		const userPayload = {
			id: locals.user._id.toString(),
			username: locals.user.username,
			email: locals.user.email,
			avatar: locals.user.avatar
		};

		// 2. Dispatch the user message
		eventBus.emit('chat:message', {
			user: userPayload,
			data: {
				text: content,
				room: room || null,
				tab: tab || 'chat'
			}
		});

		// 3. AI Logic (Mocked or triggered via service)
		// If no room is specified, we assume it's a chat with the AI Assistant
		if (room) {
			logger.debug(`RTC: Group Chat message in room ${room} from ${locals.user.username}`);
		} else {
			logger.debug(`RTC: AI Chat message from ${locals.user.username}`);

			// Simulate AI "typing" by sending an empty response start
			setTimeout(() => {
				eventBus.emit('ai:response', {
					user: { _id: 'ai', username: 'AI Assistant' },
					data: {
						text: 'I am your AI Assistant. Currently, I am in mock mode. How can I help you with SveltyCMS today?',
						done: true
					}
				});
			}, 1000);
		}

		return json({ success: true });
	} catch (err) {
		logger.error('RTC: Chat API error:', err);
		return json({ success: false, message: 'Internal Server Error' }, { status: 500 });
	}
};
