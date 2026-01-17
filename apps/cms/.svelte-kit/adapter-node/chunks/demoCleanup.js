import { l as logger } from './logger.server.js';
import mongoose from 'mongoose';
import { C as ContentStructureModel, S as SystemSettingModel, T as ThemeModel, W as WebsiteTokenModel } from './websiteToken.js';
import { c as getPrivateEnv } from './db.js';
async function cleanupExpiredDemoTenants() {
	const env = getPrivateEnv();
	const isDemo = process.env.SVELTYCMS_DEMO === 'true' || env?.DEMO === true;
	if (!isDemo) return;
	const EXPIRATION_MS = 60 * 60 * 1e3;
	const cutoffDate = new Date(Date.now() - EXPIRATION_MS);
	try {
		const User = mongoose.models.auth_users || mongoose.model('auth_users');
		const Session = mongoose.models.auth_sessions || mongoose.model('auth_sessions');
		const expiredUsers = await User.find({
			tenantId: { $exists: true, $ne: null },
			createdAt: { $lt: cutoffDate },
			role: 'admin'
		}).select('tenantId');
		const tenantIds = [...new Set(expiredUsers.map((u) => u.tenantId).filter(Boolean))];
		if (tenantIds.length === 0) return;
		logger.info(`🧹 [Demo Cleanup] Found ${tenantIds.length} expired tenants. Starting cleanup...`);
		for (const tenantId of tenantIds) {
			if (!tenantId) continue;
			logger.debug(`🗑️ [Demo Cleanup] Deleting tenant: ${tenantId}`);
			const collections = await ContentStructureModel.find({
				tenantId,
				nodeType: 'collection'
			});
			for (const col of collections) {
				const c = col;
				if (c.name) {
					try {
						const collectionName = c.name;
						await mongoose.connection.db?.collection(collectionName).deleteMany({ tenantId });
					} catch (err) {}
				}
			}
			await Promise.all([
				User.deleteMany({ tenantId }),
				Session.deleteMany({ tenantId }),
				SystemSettingModel.deleteMany({ tenantId }),
				ThemeModel.deleteMany({ tenantId }),
				ContentStructureModel.deleteMany({ tenantId }),
				WebsiteTokenModel.deleteMany({ tenantId }),
				// Role is a dynamic model in authComposition, so we access the collection directly
				mongoose.connection.db?.collection('auth_roles').deleteMany({ tenantId })
			]);
		}
		logger.info(`✨ [Demo Cleanup] Successfully removed ${tenantIds.length} tenants.`);
	} catch (error) {
		logger.error('❌ [Demo Cleanup] Failed:', error);
	}
}
export { cleanupExpiredDemoTenants };
//# sourceMappingURL=demoCleanup.js.map
