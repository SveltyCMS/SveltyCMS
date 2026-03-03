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
import { hasDuplicateSiblingName } from '@src/content/utils';
// Auth - Use cached roles from locals instead of global config
import { hasPermissionWithRoles } from '@src/databases/auth/permissions';
import { compile } from '@src/utils/compilation/compile';
import { getCollectionDisplayPath, getCollectionFilePath, getCollectionsPath, getCompiledCollectionsPath } from '@utils/tenant-paths';
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
			// Normalize ids for matching (e.g. with/without dashes)
			const idsNorm = new Set(ids.map((id) => String(id).replace(/-/g, '')));
			// Resolve paths for these IDs (bypass cache so we see latest structure)
			const currentStructure = await contentManager.getContentStructureFromDatabase('flat', true);
			const nodesToDelete = currentStructure.filter((node) => node.path && idsNorm.has((node._id?.toString() ?? '').replace(/-/g, '')));
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

			// Fallback: scan collection dirs for .ts files whose _id matches a deleted id (in case path derivation missed them)
			for (const tid of tenantIdsToTry) {
				const dirToScan = path.dirname(getCollectionFilePath('_', tid));
				if (!fs.existsSync(dirToScan)) continue;
				try {
					const scanDir = (dirPath: string, prefix = ''): void => {
						const entries = fs.readdirSync(dirPath, { withFileTypes: true });
						for (const e of entries) {
							const rel = prefix ? `${prefix}/${e.name}` : e.name;
							if (e.isDirectory()) {
								scanDir(path.join(dirPath, e.name), rel);
							} else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
								const fullPath = path.join(dirPath, e.name);
								const content = fs.readFileSync(fullPath, 'utf-8');
								const idMatch = content.match(/_id\s*:\s*["']([^"']+)["']/);
								if (idMatch?.[1] && idsNorm.has(idMatch[1].replace(/-/g, ''))) {
									try {
										fs.unlinkSync(fullPath);
										logger.info(`Deleted collection file (by _id): ${fullPath}`);
									} catch (unlinkErr) {
										logger.warn(`Could not delete ${fullPath}`, unlinkErr);
									}
									const compiledBase = getCompiledCollectionsPath(tid);
									const jsPath = path.join(compiledBase, `${rel.replace(/\.ts$/i, '')}.js`);
									if (fs.existsSync(jsPath)) {
										try {
											fs.unlinkSync(jsPath);
											logger.info(`Deleted compiled file: ${jsPath}`);
										} catch (jsErr) {
											logger.warn(`Could not delete ${jsPath}`, jsErr);
										}
									}
								}
							}
						}
					};
					scanDir(dirToScan);
				} catch (scanErr) {
					logger.warn('Fallback scan for deleted collection files failed', scanErr);
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

			// Build full ancestor path (parentOfParentId.parentId) for id-based path consistency
			function buildFullAncestorPath(flatList: Array<{ _id?: unknown; parentId?: unknown }>, directParentId: string): string {
				const ids: string[] = [];
				let current = flatList.find(
					(n) => n._id?.toString() === directParentId || n._id?.toString()?.replace(/-/g, '') === directParentId.replace(/-/g, '')
				);
				while (current) {
					const idStr = (current._id?.toString() ?? '').replace(/-/g, '');
					if (idStr) ids.unshift(idStr);
					const pid = current.parentId?.toString();
					current = pid
						? flatList.find((n) => n._id?.toString() === pid || n._id?.toString()?.replace(/-/g, '') === pid.replace(/-/g, ''))
						: undefined;
				}
				return ids.join('.');
			}

			// New flat structure after applying items (for move detection and for path resolution in duplicates)
			const sanitizeFolderName = (name: string) =>
				String(name ?? '')
					.replace(/\s+/g, '-')
					.replace(/[/\\]/g, '')
					.trim() || 'category';
			const getCategoryFolderPath = (nodeId: string, flat: Array<{ _id?: unknown; parentId?: unknown; name?: unknown }>): string => {
				const node = flat.find((n) => n._id?.toString() === nodeId || n._id?.toString()?.replace(/-/g, '') === nodeId.replace(/-/g, ''));
				if (!node) return '';
				const name = sanitizeFolderName(String(node.name ?? ''));
				const parentId = node.parentId?.toString();
				if (!parentId) return name;
				const parentPath = getCategoryFolderPath(parentId, flat);
				return parentPath ? `${parentPath}/${name}` : name;
			};
			const newFlat = currentFlat.map((n) => {
				const op = items.find((o) => o.node && String(o.node._id) === String(n._id));
				return op ? (op.node as (typeof currentFlat)[0]) : n;
			});
			for (const op of items) {
				if (op.type === 'create' && op.node?._id != null && !newFlat.some((n) => String(n._id) === String(op.node!._id))) {
					newFlat.push(op.node as (typeof currentFlat)[0]);
				}
			}

			// Duplicate name validation: no sibling with same name (case-insensitive) at same level (create, rename, move)
			for (const op of items) {
				if (!op.node || (op.type !== 'create' && op.type !== 'rename' && op.type !== 'move')) continue;
				const node = op.node as { name?: string; parentId?: unknown; _id?: unknown };
				const name = node.name != null ? String(node.name).trim() : '';
				if (!name) continue;
				const parentId = node.parentId != null && node.parentId !== '' ? String(node.parentId) : undefined;
				const excludeId = node._id != null ? String(node._id) : undefined;
				if (hasDuplicateSiblingName(newFlat, parentId ?? null, name, excludeId)) {
					const message =
						op.type === 'move'
							? 'A collection with this name already exists in the target category.'
							: 'A category/collection with this name already exists at this level. Please choose another name.';
					return fail(400, { message });
				}
			}

			// Resolve actual folder path on disk (segment-by-segment, case-insensitive) so we MOVE not recreate
			function resolveExistingFolder(rootDir: string, logicalPath: string): string | null {
				const segments = logicalPath.split('/').filter(Boolean);
				let current = rootDir;
				const actualSegments: string[] = [];
				for (const seg of segments) {
					if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) return null;
					const found = fs.readdirSync(current, { withFileTypes: true }).find((d) => d.isDirectory() && d.name.toLowerCase() === seg.toLowerCase());
					if (!found) return null;
					actualSegments.push(found.name);
					current = path.join(current, found.name);
				}
				return actualSegments.length === segments.length ? current : null;
			}

			// 1. MOVE category folders first: use fs.rename only; never create dirs that would duplicate a moved folder
			const movedCategories: { node: (typeof currentFlat)[0]; oldPath: string; newPath: string }[] = [];
			for (const node of newFlat) {
				if (node.nodeType !== 'category') continue;
				const id = node._id?.toString() ?? '';
				const oldPath = getCategoryFolderPath(id, currentFlat);
				const newPath = getCategoryFolderPath(id, newFlat);
				if (oldPath && newPath && oldPath !== newPath) {
					movedCategories.push({ node, oldPath, newPath });
				}
			}
			movedCategories.sort((a, b) => b.oldPath.split('/').length - a.oldPath.split('/').length);
			const collectionsRoot = getCollectionsPath(tenantId);
			const compiledRoot = getCompiledCollectionsPath(tenantId);
			for (const { oldPath, newPath } of movedCategories) {
				// Resolve source: exact path first, then segment-by-segment (case-insensitive)
				let srcDir: string | null = path.join(collectionsRoot, oldPath);
				if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory()) {
					srcDir = resolveExistingFolder(collectionsRoot, oldPath);
				}
				if (!srcDir || !fs.existsSync(srcDir)) {
					logger.warn(`[saveConfig] Source folder not found for move, skipping: ${oldPath}`);
					continue;
				}
				const destDir = path.join(collectionsRoot, newPath);
				if (fs.existsSync(destDir)) {
					logger.warn(`[saveConfig] Destination already exists (skip): ${newPath}`);
					continue;
				}
				const destParent = path.dirname(destDir);
				// Only create parent if it does not exist (e.g. "Posts" may already exist)
				if (destParent && destParent !== collectionsRoot && !fs.existsSync(destParent)) {
					fs.mkdirSync(destParent, { recursive: true });
				}
				try {
					fs.renameSync(srcDir, destDir);
					logger.info(`[saveConfig] Moved category folder: ${oldPath} -> ${newPath}`);
				} catch (e) {
					logger.warn(`[saveConfig] Could not move category folder ${oldPath} to ${newPath}`, e);
					continue;
				}
				const compiledSrc = path.join(compiledRoot, oldPath);
				const compiledSrcResolved = resolveExistingFolder(compiledRoot, oldPath) ?? compiledSrc;
				const compiledDest = path.join(compiledRoot, newPath);
				if (fs.existsSync(compiledSrcResolved) && fs.statSync(compiledSrcResolved).isDirectory()) {
					const compiledDestParent = path.dirname(compiledDest);
					if (compiledDestParent && !fs.existsSync(compiledDestParent)) {
						fs.mkdirSync(compiledDestParent, { recursive: true });
					}
					try {
						fs.renameSync(compiledSrcResolved, compiledDest);
						logger.info(`[saveConfig] Moved compiled category folder: ${oldPath} -> ${newPath}`);
					} catch (e) {
						logger.warn(`[saveConfig] Could not move compiled folder ${oldPath} to ${newPath}`, e);
					}
				}
			}

			// 2. MOVE collection .ts files when parentId changed (e.g. "new2" moved under "Posts" -> Posts/new2.ts)
			const sanitizeCollectionName = (name: string) =>
				String(name ?? '')
					.replace(/\s+/g, '-')
					.replace(/[/\\]+/g, '')
					.trim() || 'collection';
			for (const node of newFlat) {
				if (node.nodeType !== 'collection') continue;
				const name = String(node.name ?? '');
				if (name.endsWith('_copy')) continue; // duplicates handled below
				const currentNode = currentFlat.find(
					(n) =>
						n._id?.toString() === node._id?.toString() ||
						(n._id?.toString() ?? '').replace(/-/g, '') === (node._id?.toString() ?? '').replace(/-/g, '')
				);
				if (!currentNode) continue;
				const currentParentId = currentNode.parentId?.toString() ?? null;
				const newParentId = node.parentId?.toString() ?? null;
				if (currentParentId === newParentId) continue;
				const nodeName = sanitizeCollectionName(name);
				const oldParentPath = currentParentId ? getCategoryFolderPath(currentParentId, currentFlat) : '';
				const newParentPath = newParentId ? getCategoryFolderPath(node.parentId!.toString(), newFlat) : '';
				const oldLogicalPath = oldParentPath ? `${oldParentPath}/${nodeName}` : nodeName;
				const newLogicalPath = newParentPath ? `${newParentPath}/${nodeName}` : nodeName;
				if (oldLogicalPath === newLogicalPath) continue;
				let oldFilePath = getCollectionFilePath(oldLogicalPath, tenantId);
				if (!fs.existsSync(oldFilePath)) {
					oldFilePath = getCollectionFilePath(nodeName, tenantId);
				}
				if (!fs.existsSync(oldFilePath)) {
					logger.warn(`[saveConfig] Collection file not found for move, skipping: ${oldLogicalPath} (tried ${nodeName})`);
					continue;
				}
				const newFilePath = getCollectionFilePath(newLogicalPath, tenantId);
				if (oldFilePath === newFilePath) continue;
				if (fs.existsSync(newFilePath)) {
					logger.warn(`[saveConfig] Destination collection file already exists, skipping move: ${newLogicalPath}`);
					continue;
				}
				const newDir = path.dirname(newFilePath);
				if (!fs.existsSync(newDir)) {
					fs.mkdirSync(newDir, { recursive: true });
				}
				try {
					fs.renameSync(oldFilePath, newFilePath);
					logger.info(`[saveConfig] Moved collection file: ${oldLogicalPath} -> ${newLogicalPath}`);
				} catch (e) {
					logger.warn(`[saveConfig] Could not move collection file ${oldLogicalPath} to ${newLogicalPath}`, e);
					continue;
				}
				const oldJsPath = path.join(getCompiledCollectionsPath(tenantId), `${oldLogicalPath}.js`);
				if (fs.existsSync(oldJsPath)) {
					try {
						fs.unlinkSync(oldJsPath);
						logger.info(`[saveConfig] Removed old compiled file: ${oldJsPath}`);
					} catch (unlinkErr) {
						logger.warn(`[saveConfig] Could not remove old compiled file ${oldJsPath}`, unlinkErr);
					}
				}
			}

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
					// Use newFlat so path reflects moved categories (folder already moved above)
					let parentName = (parentFromOps?.node?.name as string) ?? (newFlat.find((n) => n._id?.toString() === parentId)?.name as string) ?? '';
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
				// Only create dir if it does not exist (e.g. after move it may already exist)
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
				// Full hierarchy path (parentOfParentId.parentId.currentId) for consistency with new collection path
				const parentIdNorm = op.node.parentId != null ? String(op.node.parentId).replace(/-/g, '') : '';
				const ancestorPath = parentIdNorm ? buildFullAncestorPath(newFlat, op.node.parentId != null ? String(op.node.parentId) : '') : '';
				const pathForReconcile = ancestorPath ? `${ancestorPath}.${newId}` : parentIdNorm ? `${parentIdNorm}.${newId}` : newId;
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
