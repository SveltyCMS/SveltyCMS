import { error, json } from '@sveltejs/kit';
import { getPrivateSettingSync } from '../../../../chunks/settingsService.js';
import { d as dbAdapter } from '../../../../chunks/db.js';
import { l as logger } from '../../../../chunks/logger.server.js';
const GET = async ({ locals }) => {
	const { user, tenantId } = locals;
	try {
		if (!user) {
			throw error(401, 'Authentication required');
		}
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}
		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			throw error(500, 'Database adapter not initialized');
		}
		if (!dbAdapter.systemVirtualFolder) {
			logger.error('Database adapter systemVirtualFolder interface not available');
			throw error(500, 'Database adapter systemVirtualFolder interface not available');
		}
		const result = await dbAdapter.systemVirtualFolder.getAll();
		if (!result.success) {
			logger.error('Database query failed', { error: result.error });
			throw error(500, result.error?.message || 'Database query failed');
		}
		const folders = result.data || [];
		logger.debug(`Fetched ${folders.length} system virtual folders`, { tenantId });
		return json({
			success: true,
			data: folders
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Error fetching system virtual folders: ${message}`, { tenantId });
		throw error(500, message);
	}
};
const POST = async ({ request, locals }) => {
	const { user, tenantId } = locals;
	try {
		if (!user) {
			throw error(401, 'Authentication required');
		}
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}
		const body = await request.json();
		const { name, parentId } = body;
		if (!name || typeof name !== 'string') {
			throw error(400, 'Name is required and must be a string');
		}
		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			throw error(500, 'Database adapter not initialized');
		}
		let folderPath = '';
		if (parentId) {
			const parentResult = await dbAdapter.systemVirtualFolder.getById(parentId);
			if (parentResult.success && parentResult.data) {
				folderPath = `${parentResult.data.path}/${name.trim()}`;
			} else {
				throw error(400, 'Parent folder not found');
			}
		} else {
			folderPath = `/${name.trim()}`;
		}
		const folderData = {
			name: name.trim(),
			path: folderPath,
			type: 'folder',
			parentId: parentId ? parentId : null,
			order: 0,
			...(getPrivateSettingSync('MULTI_TENANT') && { tenantId })
		};
		const result = await dbAdapter.systemVirtualFolder.create(folderData);
		if (!result.success) {
			logger.error('Database insert failed', { error: result.error });
			throw error(500, result.error?.message || 'Database insert failed');
		}
		const newFolder = result.data;
		logger.info(`Created system virtual folder: ${folderData.name}`, { tenantId });
		return json({
			success: true,
			folder: newFolder
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Error creating system virtual folder: ${message}`, { tenantId });
		throw error(500, message);
	}
};
const PATCH = async ({ request, locals }) => {
	const { user, tenantId } = locals;
	try {
		if (!user) {
			throw error(401, 'Authentication required');
		}
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}
		const body = await request.json();
		const { action, orderUpdates } = body;
		if (action !== 'reorder') {
			throw error(400, 'Invalid action');
		}
		if (!Array.isArray(orderUpdates)) {
			throw error(400, 'orderUpdates must be an array');
		}
		if (!dbAdapter) {
			logger.error('Database adapter not initialized');
			throw error(500, 'Database adapter not initialized');
		}
		const adapter = dbAdapter;
		const results = await Promise.all(
			orderUpdates.map(async (update) => {
				const { folderId, order, parentId: newParentId } = update;
				const currentFolder = await adapter.systemVirtualFolder.getById(folderId);
				if (!currentFolder.success || !currentFolder.data) {
					logger.error('Folder not found for reordering', { folderId });
					return { success: false, error: { message: 'Folder not found' } };
				}
				const updateData = { order };
				if (newParentId !== void 0) {
					updateData.parentId = newParentId ? newParentId : null;
					if (newParentId) {
						const parentResult = await adapter.systemVirtualFolder.getById(newParentId);
						if (parentResult.success && parentResult.data) {
							updateData.path = `${parentResult.data.path}/${currentFolder.data.name}`;
						} else {
							logger.warn('Parent folder not found, using root path', { parentId: newParentId });
							updateData.path = `/${currentFolder.data.name}`;
						}
					} else {
						updateData.path = `/${currentFolder.data.name}`;
					}
				}
				return adapter.systemVirtualFolder.update(folderId, updateData);
			})
		);
		const errors = results.filter((r) => !r.success);
		if (errors.length > 0) {
			logger.error('Error reordering folders', { errors });
			throw error(500, 'Error reordering folders');
		}
		logger.info('Reordered folders successfully', { tenantId });
		return json({ success: true });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error occurred';
		logger.error(`Error reordering folders: ${message}`, { tenantId });
		throw error(500, message);
	}
};
export { GET, PATCH, POST };
//# sourceMappingURL=_server.ts.js.map
