/**
 * @file src/routes/api/settings/public/stream/+server.ts
 * @description SSE endpoint for real-time settings change notifications
 *
 * Clients connect once and receive notifications only when settings actually change.
 * Much more efficient than polling every 5 seconds.
 */

import { subscribeToSettingsChanges } from '@src/utils/server/settingsVersion';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const stream = new ReadableStream({
		start(controller) {
			// Send initial connection message
			controller.enqueue(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

			// Subscribe to settings changes
			const unsubscribe = subscribeToSettingsChanges((version) => {
				controller.enqueue(`data: ${JSON.stringify({ type: 'update', version })}\n\n`);
			});

			// Keep connection alive with heartbeat every 30 seconds
			const heartbeat = setInterval(() => {
				try {
					controller.enqueue(': heartbeat\n\n');
				} catch {
					clearInterval(heartbeat);
				}
			}, 30_000);

			// Cleanup on connection close
			return () => {
				clearInterval(heartbeat);
				unsubscribe();
			};
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
