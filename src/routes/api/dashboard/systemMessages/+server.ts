/**
 * @file src/routes/api/dashboard/systemMessages/+server.ts
 * @description API endpoint for system messages for dashboard widgets
 */

import fs from 'fs/promises';
import path from 'path';
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

// Auth
import { roles } from '@root/config/roles';
import { hasPermissionByAction } from '@src/auth/permissions';

// System Logger
import { logger } from '@utils/logger.svelte';

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		// Check if user has permission for dashboard access
		const hasPermission = hasPermissionByAction(
			locals.user,
			'access',
			'system',
			'dashboard',
			locals.roles && locals.roles.length > 0 ? locals.roles : roles
		);

		if (!hasPermission) {
			logger.warn('Unauthorized attempt to access system messages', { userId: locals.user?._id });
			throw error(403, 'Forbidden: You do not have permission to access system messages.');
		}

		const limit = parseInt(url.searchParams.get('limit') || '5');

		try {
			// Try to read system logs for recent messages
			const logFile = path.join(process.cwd(), 'logs', 'app.log');
			const logContent = await fs.readFile(logFile, 'utf-8');
			const logLines = logContent
				.split('\n')
				.filter((line) => line.trim())
				.slice(-20);

			const messages = [];
			for (const line of logLines.slice(-limit)) {
				try {
					// Parse log format: timestamp level message
					const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\.\d+ \S+ \[(\w+)\]: (.+)$/);
					if (match) {
						const [, timestamp, level, message] = match;
						messages.push({
							id: Date.now() + Math.random(),
							title: `${level.toUpperCase()} Message`,
							message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
							level: level.toLowerCase(),
							timestamp: timestamp,
							type: level.toLowerCase() === 'error' ? 'error' : level.toLowerCase() === 'warn' ? 'warning' : 'info'
						});
					}
				} catch {
					// Skip invalid log lines
				}
			}

			if (messages.length === 0) {
				// Return default system status if no log messages
				messages.push({
					id: 1,
					title: 'System Status',
					message: 'System is running normally',
					level: 'info',
					timestamp: new Date().toISOString(),
					type: 'info'
				});
			}

			logger.info('System messages fetched successfully', {
				count: messages.length,
				requestedBy: locals.user?._id
			});

			return json(messages);
		} catch (logError) {
			logger.warn('Could not read system logs:', logError);
			// Return default system messages if log reading fails
			const defaultMessages = [
				{
					id: 1,
					title: 'System Online',
					message: 'SveltyCMS is running normally',
					level: 'info',
					timestamp: new Date().toISOString(),
					type: 'info'
				},
				{
					id: 2,
					title: 'Welcome',
					message: 'Dashboard widgets are functioning properly',
					level: 'info',
					timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
					type: 'info'
				}
			];
			return json(defaultMessages);
		}
	} catch (err) {
		const httpError = err as { status?: number; body?: { message?: string }; message?: string };
		const status = httpError.status || 500;
		const message = httpError.body?.message || httpError.message || 'Internal Server Error';
		logger.error('Error fetching system messages:', { error: message, status });
		throw error(status, message);
	}
};
