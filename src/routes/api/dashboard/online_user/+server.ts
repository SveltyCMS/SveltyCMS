/**
 * @file src/routes/api/dashboard/online_user/+server.ts
 * @description API endpoint for user activity data for dashboard widgets (online users)
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { privateEnv } from '@root/config/private';
import { auth } from '@src/databases/db';
import { logger } from '@utils/logger.svelte';
import * as v from 'valibot';

// Schema for the outgoing API data
const OnlineUserSchema = v.object({
	id: v.string(),
	name: v.string(),
	avatarUrl: v.optional(v.string()),
	onlineTime: v.string(), // Human-readable online duration
	onlineMinutes: v.number() // Online time in minutes for sorting
});

// TypeScript type from schema
type OnlineUser = v.Output<typeof OnlineUserSchema>;

// Helper function to format online duration
function formatOnlineTime(minutes: number): string {
	if (minutes < 1) return '< 1m';
	if (minutes < 60) return `${Math.floor(minutes)}m`;
	if (minutes < 1440) {
		const hours = Math.floor(minutes / 60);
		const remainingMinutes = Math.floor(minutes % 60);
		return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
	}
	const days = Math.floor(minutes / 1440);
	const remainingHours = Math.floor((minutes % 1440) / 60);
	return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

export const GET: RequestHandler = async ({ locals }) => {
	const { user, tenantId } = locals;
	if (!user) {
		logger.warn('Unauthorized attempt to access online user data');
		throw error(401, 'Unauthorized');
	}
	if (!auth) {
		logger.error('Auth service unavailable');
		throw error(500, 'Internal Server Error: Auth service unavailable.');
	}
	try {
		if (privateEnv.MULTI_TENANT && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}
		// Fetch active sessions for all users (not just the current user)
		// We need to get all active sessions, then extract unique user IDs
		const sessionsResult = await auth.getAllActiveSessions(tenantId);
		logger.debug('Sessions result from auth.getAllActiveSessions:', {
			success: sessionsResult.success,
			dataLength: sessionsResult.data?.length || 0,
			requestedBy: user._id,
			tenantId
		});
		if (!sessionsResult.success) {
			logger.error('Failed to retrieve active sessions', {
				requestedBy: user._id,
				tenantId,
				error: sessionsResult.message
			});
			throw new Error(`Failed to retrieve active sessions: ${sessionsResult.message || 'Unknown error'}`);
		}
		const uniqueIds = Array.from(new Set(sessionsResult.data.map((s) => s.user_id)));

		// Create a map of user sessions to find the earliest (longest online) session per user
		const userSessionMap = new Map<string, Date>();
		for (const session of sessionsResult.data) {
			const existingStart = userSessionMap.get(session.user_id);
			const sessionStart = new Date(session.createdAt);
			if (!existingStart || sessionStart < existingStart) {
				userSessionMap.set(session.user_id, sessionStart);
			}
		}

		// Fetch user details
		const onlineUsers: OnlineUser[] = [];
		logger.debug('Processing unique user IDs:', { uniqueIds, count: uniqueIds.length });

		for (const uid of uniqueIds) {
			logger.debug('Fetching user by ID:', { uid, tenantId });
			const userData = await auth.getUserById(uid, tenantId);
			logger.debug('User fetch result:', {
				uid,
				hasData: !!userData,
				username: userData?.username,
				email: userData?.email?.replace(/(.{2}).*@(.*)/, '$1****@$2')
			});

			if (userData) {
				// Create display name - prefer username, fallback to firstName + lastName, then email
				let displayName = userData.username;
				if (!displayName && (userData.firstName || userData.lastName)) {
					displayName = [userData.firstName, userData.lastName].filter(Boolean).join(' ');
				}
				if (!displayName) {
					displayName = userData.email || 'Unknown User';
				}

				// Calculate online time
				const sessionStart = userSessionMap.get(uid);
				const onlineMinutes = sessionStart ? (Date.now() - sessionStart.getTime()) / (1000 * 60) : 0;
				const onlineTime = formatOnlineTime(onlineMinutes);

				logger.debug('Adding online user:', {
					id: userData._id.toString(),
					displayName,
					hasAvatar: !!userData.avatar,
					onlineMinutes: Math.floor(onlineMinutes),
					onlineTime
				});

				onlineUsers.push({
					id: userData._id.toString(),
					name: displayName,
					avatarUrl: userData.avatar || undefined,
					onlineTime,
					onlineMinutes: Math.floor(onlineMinutes)
				});
			} else {
				logger.warn('Failed to fetch user details:', { uid });
			}
		}

		// Sort users by online time (longest online first)
		onlineUsers.sort((a, b) => b.onlineMinutes - a.onlineMinutes);
		const responseData = { onlineUsers };
		const validated = v.parse(v.object({ onlineUsers: v.array(OnlineUserSchema) }), responseData);
		logger.info('Online users fetched successfully', { count: validated.onlineUsers.length, requestedBy: user._id });
		return json(validated);
	} catch (err) {
		if (err instanceof v.ValiError) {
			logger.error('Validation error for online_user data', { issues: err.issues });
			throw error(500, 'Internal Server Error: Failed to validate online user data.');
		}
		const httpErr = err as { status?: number; message?: string };
		logger.error('An error occurred fetching online users', { error: httpErr.message, status: httpErr.status });
		throw error(httpErr.status || 500, httpErr.message || 'An unexpected error occurred.');
	}
};
