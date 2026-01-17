import { a as auth } from '../../../chunks/db.js';
import { getUntypedSetting } from '../../../chunks/settingsService.js';
import { l as logger } from '../../../chunks/logger.server.js';
const load = async (event) => {
	try {
		const user = event.locals.user;
		const roles = event.locals.roles || [];
		const isFirstUser = event.locals.isFirstUser;
		const hasManageUsersPermission = event.locals.hasManageUsersPermission;
		if (!user) {
			logger.warn('User object missing in event.locals. Returning fallback response.', {
				request: event.request.url
			});
			return {
				user: null,
				roles: [],
				isFirstUser: false,
				is2FAEnabledGlobal: Boolean(getUntypedSetting('USE_2FA')),
				manageUsersPermissionConfig: {
					contextId: 'config/userManagement',
					requiredRole: 'admin',
					action: 'manage',
					contextType: 'system'
				},
				adminData: null,
				permissions: {
					'config/adminArea': { hasPermission: false }
				},
				error: 'User session not found. Please log in again.'
			};
		}
		const userRole = roles.find((role) => role._id === user?.role);
		const isAdmin = Boolean(userRole?.isAdmin);
		let freshUser = null;
		if (user?._id && auth) {
			freshUser = await auth.getUserById(user._id.toString());
			if (freshUser) {
				logger.debug('Fresh user data fetched for user page', {
					userId: freshUser._id,
					username: freshUser.username,
					email: freshUser.email
				});
			}
		}
		if (!freshUser) {
			freshUser = user;
		}
		const safeUser = freshUser
			? {
					...freshUser,
					_id: freshUser._id.toString(),
					password: '[REDACTED]',
					// Ensure password is not sent to client
					isAdmin
					// Add the properly calculated admin status
				}
			: null;
		let adminData = null;
		if (isAdmin || hasManageUsersPermission) {
			adminData = {
				users: [],
				// Empty arrays - data loaded on demand
				tokens: []
			};
		}
		const manageUsersPermissionConfig = {
			contextId: 'config/userManagement',
			action: 'manage',
			contextType: 'system',
			name: 'User Management',
			description: 'Manage user accounts and roles'
		};
		return {
			user: safeUser,
			roles: roles.map((role) => ({
				...role,
				_id: role._id.toString()
			})),
			isFirstUser,
			is2FAEnabledGlobal: Boolean(getUntypedSetting('USE_2FA')),
			manageUsersPermissionConfig,
			adminData,
			permissions: {
				'config/adminArea': { hasPermission: isAdmin || hasManageUsersPermission }
			},
			isAdmin
			// Pass isAdmin to client for PermissionGuard
		};
	} catch (err) {
		logger.error('Error during load function (ErrorCode: USER_LOAD_500):', err);
		return {
			user: null,
			roles: [],
			isFirstUser: false,
			is2FAEnabledGlobal: false,
			manageUsersPermissionConfig: {
				contextId: 'config/userManagement',
				requiredRole: 'admin',
				action: 'manage',
				contextType: 'system'
			},
			adminData: null,
			permissions: {
				'config/adminArea': { hasPermission: false }
			},
			isAdmin: false,
			error: 'Internal Server Error. Please try again later.'
		};
	}
};
export { load };
//# sourceMappingURL=_page.server.ts.js.map
