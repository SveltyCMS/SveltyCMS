/**
 * @file src/routes/(app)/config/collectionbuilder/+page.server.ts
 * @description Server-side logic for Collection Builder page authentication and authorization.
 *
 * #Features:
 * - Checks for authenticated user in locals (set by hooks.server.ts).
 * - Verifies user permissions for collection builder access (`config:collectionbuilder`).
 * - Fetches initial content structure data from `contentManager`.
 * - Determines user's admin status based on roles.
 * - Redirects unauthenticated users to login.
 * - Throws 403 error for insufficient permissions.
 * - Returns user data and content structure for client-side rendering.
 */

import fs from 'node:fs';
import path from 'node:path';
// System Logger
import { contentManager } from '@root/src/content/content-manager';
// Auth - Use cached roles from locals instead of global config
import { hasPermissionWithRoles } from '@src/databases/auth/permissions';
import { compile } from '@src/utils/compilation/compile';
import { getCollectionDisplayPath, getCollectionFilePath, getCompiledCollectionsPath } from '@utils/tenant-paths';
import { error, fail, redirect } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		const { user, roles: tenantRoles, isAdmin } = locals;

		// User authentication already done by handleAuthorization hook
		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		// Check user permission for collection builder using cached roles from locals
		const hasCollectionBuilderPermission = hasPermissionWithRoles(user, 'config:collectionbuilder', tenantRoles);

		if (!hasCollectionBuilderPermission) {
			const userRole = tenantRoles.find((r) => r._id === user.role);
			logger.warn('Permission denied for collection builder', {
				userId: user._id,
				userRole: user.role,
				roleFound: !!userRole,
				isAdmin: userRole?.isAdmin,
				rolePermissions: userRole?.permissions?.length || 0
			});
			throw error(403, 'Insufficient permissions');
		}

		// Initializecontent-managerbefore accessing data
		await contentManager.initialize();

		const contentStructure = await contentManager.getContentStructureFromDatabase('flat', true);

		const serializedStructure = contentStructure.map((node) => ({
			...node,
			_id: node._id.toString(),
			...(node.parentId ? { parentId: node.parentId.toString() } : {})
		}));

		// Return user data with proper admin status and the content structure
		const { _id, ...rest } = user;
		return {
			user: {
				id: _id.toString(),
				...rest,
				isAdmin // Add the properly calculated admin status
			},
			contentStructure: serializedStructure
		};
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			// This is likely a redirect or an error we've already handled
			throw err;
		}
		const message = `Error in load function: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
};

export const actions: Actions = {
	deleteCollections: async ({ request }) => {
		const formData = await request.formData();
		const ids = JSON.parse(formData.get('ids') as string);
		const tenantId = (request as { locals?: { tenantId?: string } }).locals?.tenantId;

		if (!(ids && Array.isArray(ids))) {
			return fail(400, { message: 'Invalid IDs for deletion' });
		}

		try {
			// Resolve paths for these IDs (bypass cache so we see latest structure)
			const currentStructure = await contentManager.getContentStructureFromDatabase('flat', true);
			const nodesToDelete = currentStructure.filter((node) => node.path && ids.includes(node._id.toString()));
			const pathsToDelete = nodesToDelete.map((node) => node.path as string);

			// Delete collection source (.ts) and compiled (.js) files so they do not reappear after next refresh.
			// Try multiple path candidates: derived path (e.g. "new/new") and flat name (e.g. "new"), and both legacy and tenant dirs.
			const tenantIdsToTry: (string | null | undefined)[] = [undefined, ...(tenantId !== undefined ? [tenantId] : [])];
			for (const node of nodesToDelete) {
				if (node.nodeType !== 'collection' || !node.path) continue;
				const rawPath = (node.path as string).replace(/^\//, '');
				const hasDot = rawPath.includes('.') && !rawPath.includes('/');
				const looksLikeBareId = !rawPath.includes('/') && /^[a-zA-Z0-9_-]{16,32}$/.test(rawPath);
				const isIdBasedPath = hasDot || looksLikeBareId;
				let collectionPathForFile: string;
				if (isIdBasedPath) {
					const parent = node.parentId ? currentStructure.find((n) => n._id?.toString() === node.parentId?.toString()) : null;
					const parentName = (parent?.name as string)?.replace(/\s+/g, '-').replace(/\/|\\/g, '').trim() ?? '';
					const nodeName = (node.name as string)?.replace(/\s+/g, '-').replace(/\/|\\/g, '').trim() ?? '';
					collectionPathForFile = parentName ? `${parentName}/${nodeName}` : nodeName;
				} else {
					collectionPathForFile = rawPath;
				}
				const flatName = (node.name as string)?.replace(/\s+/g, '-').replace(/\/|\\/g, '').trim() ?? '';
				const candidates = [...new Set([collectionPathForFile, flatName].filter(Boolean))];
				for (const logicalPath of candidates) {
					for (const tid of tenantIdsToTry) {
						const tsPath = getCollectionFilePath(logicalPath, tid);
						const compiledBase = getCompiledCollectionsPath(tid);
						const jsPath = path.join(compiledBase, `${logicalPath}.js`);
						for (const filePath of [tsPath, jsPath]) {
							try {
								if (fs.existsSync(filePath)) {
									fs.unlinkSync(filePath);
									logger.info(`Deleted collection file: ${filePath}`);
								}
							} catch (e) {
								logger.warn(`Could not delete collection file ${filePath}`, e);
							}
						}
					}
				}
			}

			const operations = pathsToDelete.map((path) => ({
				type: 'delete' as const,
				node: { path } as any
			}));

			await contentManager.upsertContentNodes(operations);

			// Recompile so orphaned .js files are removed and next refresh does not bring back deleted collections
			await compile({ logger, tenantId });

			// Return updated flat structure so client can refresh sidebar and tree (layout may use cached data)
			const updatedFlat = await contentManager.getContentStructureFromDatabase('flat', true);
			const serialized = updatedFlat.map((node) => ({
				...node,
				_id: node._id.toString(),
				...(node.parentId ? { parentId: node.parentId.toString() } : {})
			}));
			return { success: true, contentStructure: serialized };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			logger.error('Error deleting collections:', message);
			return fail(500, { message: message || 'Failed to delete collections' });
		}
	},

	saveConfig: async ({ request }) => {
		const formData = await request.formData();
		const items = JSON.parse(formData.get('items') as string);
		const tenantId = (request as { locals?: { tenantId?: string } }).locals?.tenantId;

		if (!(items && Array.isArray(items))) {
			return fail(400, { message: 'Invalid items for save' });
		}

		try {
			// Map create ops by node _id so we can resolve parent name when path is id-based
			const createOpsById = new Map<string, (typeof items)[0]>();
			for (const op of items) {
				if (op.type === 'create' && op.node?._id != null) {
					createOpsById.set(String(op.node._id), op);
				}
			}

			// Current structure: resolve parent category name for id-based duplicate paths (parent is not in create ops)
			const currentFlat = await contentManager.getContentStructureFromDatabase('flat', true);

			// For duplicated collections: create the .ts source file (copy from original).
			// Detect by node.name.endsWith('_copy') because path is often id-based (e.g. "categoryId.collectionId") and does not contain "_copy".
			for (const op of items) {
				if (op.type !== 'create' || op.node?.nodeType !== 'collection') continue;
				const name = String(op.node.name ?? '');
				if (!name.endsWith('_copy')) continue;

				const rawPath = String(op.node.path ?? '').replace(/^\//, '');
				const isIdBasedPath = rawPath.includes('.') && !rawPath.includes('/');
				let filePathForCreation: string;
				if (!isIdBasedPath && rawPath.endsWith('_copy')) {
					filePathForCreation = rawPath;
				} else {
					const parentId = op.node.parentId != null ? String(op.node.parentId) : '';
					const parentFromOps = parentId ? createOpsById.get(parentId) : null;
					let parentName = (parentFromOps?.node?.name as string) ?? (currentFlat.find((n) => n._id?.toString() === parentId)?.name as string) ?? '';
					// Sanitize for filesystem: no slashes, no leading/trailing spaces
					parentName = String(parentName).replace(/\s+/g, '-').replace(/\/|\\/g, '').trim() || '';
					filePathForCreation = parentName ? `${parentName}/${name}` : name;
				}

				const lastSegment = filePathForCreation.split('/').pop() ?? name;
				const originalName = lastSegment.slice(0, -5);
				const parentDir = filePathForCreation.includes('/') ? filePathForCreation.slice(0, filePathForCreation.lastIndexOf('/')) : '';
				let sourcePath = getCollectionFilePath(parentDir ? `${parentDir}/${originalName}` : originalName, tenantId);
				if (!fs.existsSync(sourcePath)) {
					sourcePath = getCollectionFilePath(originalName, tenantId);
				}
				if (!fs.existsSync(sourcePath)) {
					const subPath = getCollectionFilePath(`Collections/${originalName}`, tenantId);
					if (fs.existsSync(subPath)) sourcePath = subPath;
				}
				if (!fs.existsSync(sourcePath)) {
					logger.warn(`[saveConfig] Duplicate source not found: ${sourcePath}, skipping file copy`);
					continue;
				}
				const targetPath = getCollectionFilePath(filePathForCreation, tenantId);
				const pathSegments = filePathForCreation.split('/').filter(Boolean);
				if (pathSegments.length === 2) {
					const wrongPath = getCollectionFilePath(`${pathSegments[0]}/Collections/${pathSegments[1]}`, tenantId);
					if (fs.existsSync(wrongPath)) {
						fs.unlinkSync(wrongPath);
						logger.info(`[saveConfig] Removed incorrect duplicate path: ${wrongPath}`);
					}
				}
				const targetDir = path.dirname(targetPath);
				if (!fs.existsSync(targetDir)) {
					fs.mkdirSync(targetDir, { recursive: true });
				}
				let content = fs.readFileSync(sourcePath, 'utf-8');
				const displayName = op.node.name ?? filePathForCreation;
				content = content.replace(/@file\s+[^\n]+/, `@file ${getCollectionDisplayPath(filePathForCreation, tenantId)}`);
				content = content.replace(/@description\s+[^\n]+/, `@description Collection file for ${displayName}`);
				content = content.replace(/slug:\s*["']([^"']*)["']/, () => `slug: "${filePathForCreation}"`);
				// So refresh shows the duplicate name (e.g. new_22_copy), not the original
				content = content.replace(/name:\s*["']([^"']*)["']/, () => `name: "${displayName}"`);
				const newId = op.node._id != null ? String(op.node._id).replace(/-/g, '') : '';
				// Use id-based path (same format as other collections) so reconcile and orphan check match
				const parentIdNorm = op.node.parentId != null ? String(op.node.parentId).replace(/-/g, '') : '';
				const pathForReconcile = parentIdNorm ? `${parentIdNorm}.${newId}` : newId;
				content = content.replace(/path:\s*["']([^"']*)["']/, () => `path: "${pathForReconcile}"`);
				if (newId) {
					// Remove any existing _id lines (match nanoid/uuid-style: alphanumeric + hyphen)
					content = content.replace(/\s*_id:\s*["']?[a-zA-Z0-9_-]+["']?,?\s*/g, '\n');
					content = content.replace(/(export const schema\s*=\s*\{)/, `$1\n  _id: "${newId}",`);
				}
				fs.writeFileSync(targetPath, content);
				op.node.path = pathForReconcile;
				logger.info(`[saveConfig] Created duplicate collection file: ${targetPath}`);
			}

			await contentManager.upsertContentNodes(items);

			// Compile so new duplicate collections get .js in .compiledCollections
			await compile({ logger, tenantId });
			await contentManager.refresh(tenantId);

			// Return full structure after refresh so client sees authoritative tree (duplicates included)
			const afterRefresh = await contentManager.getContentStructureFromDatabase('flat', true);
			const serializedStructure = afterRefresh.map((node) => ({
				...node,
				_id: node._id.toString(),
				...(node.parentId ? { parentId: node.parentId.toString() } : {})
			}));

			return { success: true, contentStructure: serializedStructure };
		} catch (err) {
			const raw =
				err instanceof Error
					? err.message
					: typeof err === 'object' && err && 'message' in err
						? String((err as { message: unknown }).message)
						: String(err);
			const message = (raw && raw !== '[object Object]' ? raw : 'Failed to save configuration').slice(0, 500);
			logger.error('Error saving config:', err instanceof Error ? err.stack : message);
			return fail(500, { message });
		}
	}
};
