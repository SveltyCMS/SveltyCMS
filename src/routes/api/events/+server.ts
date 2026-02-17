/**
 * @file src/routes/api/events/+server.ts
 * @description Real-time collaboration stream using Server-Sent Events (SSE).
 * Connects to the central Automation EventBus and streams lifecycle events
 * to authenticated clients.
 */

import { eventBus } from '@src/services/automation/eventBus';
import { logger } from '@utils/logger.server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	// 1. Authentication Check
	// RTC is only available for authenticated users
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	logger.debug(`RTC: User ${locals.user.email} connecting to events stream`);

	const stream = new ReadableStream({
		start(controller) {
			// 2. Connection Confirmation
			// Sending a small initial payload confirms the connection is active
			controller.enqueue(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}

`);

			// 3. Subscribe to EventBus
			// We listen for ALL events and filter them on the client side based on preferences
			const unsubscribe = eventBus.on('*', (payload) => {
				try {
					// Format as SSE data chunk
					controller.enqueue(`data: ${JSON.stringify(payload)}

`);
				} catch (err) {
					logger.error('RTC: Error streaming event to client:', err);
				}
			});

			// 4. Heartbeat (Ping)
			// Keeps the connection alive and detects hung clients
			const heartbeat = setInterval(() => {
				try {
					controller.enqueue(`: heartbeat

`);
				} catch {
					// If enqueue fails, the client disconnected
					clearInterval(heartbeat);
					unsubscribe();
					logger.debug(`RTC: Connection closed for ${locals.user?.email} (heartbeat fail)`);
				}
			}, 30_000);

			// 5. Cleanup
			// This is called when the server shuts down or the connection is aborted
			return () => {
				clearInterval(heartbeat);
				unsubscribe();
				logger.debug(`RTC: Unsubscribed user ${locals.user?.email}`);
			};
		},
		cancel() {
			logger.debug(`RTC: Stream cancelled by ${locals.user?.email}`);
		}
	});

	// 6. Response Headers
	// Crucial for SSE: no caching, keep-alive, and the correct MIME type
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			'X-Accel-Buffering': 'no' // Disables buffering on Nginx (vital for SSE)
		}
	});
};
