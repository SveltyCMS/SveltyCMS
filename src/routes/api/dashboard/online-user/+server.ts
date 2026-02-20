/**
 * @file src/routes/api/dashboard/online-user/+server.ts
 * @description API endpoint for user activity data for dashboard widgets (online users)
 */

import { auth } from '@src/databases/db';
import { getPrivateSettingSync } from '@src/services/settings-service';
import { json } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
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
type OnlineUser = v.InferOutput<typeof OnlineUserSchema>;

// Helper function to format online duration
function formatOnlineTime(minutes: number): string {
	if (minutes < 1) {
		return '< 1m';
	}
	if (minutes < 60) {
		return `${Math.floor(minutes)}m`;
	}
	if (minutes < 1440) {
		const hours = Math.floor(minutes / 60);
		const remainingMinutes = Math.floor(minutes % 60);
		return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
	}
	const days = Math.floor(minutes / 1440);
	const remainingHours = Math.floor((minutes % 1440) / 60);
	return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';

export const GET = apiHandler(async ({ locals }) => {
	const { user, tenantId } = locals;
	if (!user) {
		logger.warn('Unauthorized attempt to access online user data');
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}
	if (!auth) {
		logger.error('Auth service unavailable');
		throw new AppError('Internal Server Error: Auth service unavailable.', 500, 'AUTH_SERVICE_UNAVAILABLE');
	}

	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
		throw new AppError('Tenant could not be identified for this operation.', 400, 'TENANT_MISSING');
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
		throw new AppError(`Failed to retrieve active sessions: ${sessionsResult.message || 'Unknown error'}`, 500, 'SESSION_FETCH_ERROR');
	}
	const uniqueIds = Array.from(new Set(sessionsResult.data.map((s) => s.user_id)));

	// Create a map of user sessions to find the earliest (longest online) session per user
	// Extract timestamp from MongoDB ObjectId (first 4 bytes represent Unix timestamp)
	const userSessionMap = new Map<string, Date>();
	for (const session of sessionsResult.data) {
		const existingStart = userSessionMap.get(session.user_id);
		// Extract timestamp from ObjectId: first 8 hex chars = 4 bytes = Unix timestamp in seconds
		const timestamp = Number.parseInt(session._id.substring(0, 8), 16) * 1000;
		const sessionStart = new Date(timestamp);
		if (!existingStart || sessionStart < existingStart) {
			userSessionMap.set(session.user_id, sessionStart);
		}
	} // Fetch user details
	const onlineUsers: OnlineUser[] = [];
	logger.debug('Processing unique user IDs:', {
		uniqueIds,
		count: uniqueIds.length
	});

	for (const uid of uniqueIds) {
		logger.debug('Fetching user by ID:', { uid, tenantId });
		const userData = await auth.getUserById(uid, tenantId);
		logger.debug('User fetch result:', {
			uid,
			hasData: !!userData,
			username: userData?.username,
			email: userData?.email
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
	logger.info('Online users fetched successfully', {
		count: validated.onlineUsers.length,
		requestedBy: user._id
	});
	return json(validated);
});
