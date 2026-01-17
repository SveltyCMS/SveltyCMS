import { redirect, error } from '@sveltejs/kit';
import { l as logger } from '../../../../chunks/logger.server.js';
const load = async ({ locals }) => {
	const { user, isAdmin } = locals;
	if (!user) {
		logger.warn('Unauthenticated access attempt to Configuration Manager');
		throw redirect(302, '/login');
	}
	if (!isAdmin) {
		logger.warn(`Permission denied for user=${user._id} to access Configuration Manager.`);
		throw error(403, 'Forbidden: You do not have permission to access this page.');
	}
	return {
		user: {
			email: user.email
		}
	};
};
export { load };
//# sourceMappingURL=_page.server.ts.js.map
