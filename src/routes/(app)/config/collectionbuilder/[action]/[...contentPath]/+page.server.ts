/**
 * @file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/+page.server.ts
 * @description Server-side logic for creating and editing individual collections.
 *
 * #Features:
 * - Handles 'new' and 'edit' actions based on URL parameters.
 * - Checks for authenticated user in locals (set by hooks.server.ts).
 * - Verifies user permissions: Must be admin or have 'config:collection:manage' permission.
 * - Fetches all permissions and roles to pass to the client (for UI selectors).
 * - For 'edit' mode, fetches the specific collection data from contentManager.
 * - For 'new' mode, returns a null collection object.
 * - Serializes collection data, removing functions before sending to the client.
 * - Provides 'saveCollection' and 'deleteCollections' actions for persistence.
 */

import fs from 'node:fs';
import path from 'node:path';
// Collections
import { contentManager } from '@src/content/content-manager';
import type { Schema } from '@src/content/types';
// Auth
// Use hasPermissionWithRoles and roles from locals, like the example pattern
import { hasPermissionWithRoles, permissionConfigs, permissions } from '@src/databases/auth/permissions';
import { MigrationEngine } from '@src/services/migration-engine';
// Widgets
import { widgets } from '@src/stores/widget-store.svelte.ts';
import { compile } from '@src/utils/compilation/compile';
import { type Actions, error, redirect } from '@sveltejs/kit';
// System Logger
import { logger } from '@utils/logger.server';
import { getCollectionDisplayPath, getCollectionFilePath, getCollectionsPath, getCompiledCollectionsPath } from '@utils/tenant-paths';
import prettier from 'prettier';
import * as ts from 'typescript';
import type { PageServerLoad } from './$types';

// Type definitions for widget field structure
interface WidgetConfig {
	GuiFields: Record<string, unknown>;
	key: string;
	Name: string;
	widgetId?: string;
}

interface FieldWithWidget {
	widget?: WidgetConfig;
	[key: string]: unknown;
}

interface WidgetGuiSchema {
	imports?: string[];
	[key: string]: unknown;
}

interface WidgetDefinition {
	GuiSchema?: Record<string, WidgetGuiSchema>;
	[key: string]: unknown;
}

type FieldsData = Record<string, FieldWithWidget>;

// Load Prettier config
async function getPrettierConfig() {
	try {
		const config = await prettier.resolveConfig(process.cwd());
		return { ...config, parser: 'typescript' };
	} catch (err) {
		logger.warn('Failed to load Prettier config, using defaults:', err);
		return { parser: 'typescript' };
	}
}

// Define load function as async function that takes an event parameter
export const load: PageServerLoad = async ({ depends, locals, params }) => {
	// Invalidate with layout so edit page gets fresh collection data after rename/save (avoids stale "new6" in UI)
	depends('app:content');

	try {
		// 1. Get user, roles, and admin status from locals (set by hook)
		const { user, roles: tenantRoles, isAdmin } = locals;
		const { action } = params;

		// 2. User authentication (already done by hook, this is a fallback)
		if (!user) {
			logger.warn('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		logger.trace(`User authenticated successfully for user: ${user._id}`);

		// 3. Authorization check
		// Use the 'config:collection:manage' permission string (adjust if needed)
		const hasManagePermission = hasPermissionWithRoles(user, 'config:collection:manage', tenantRoles);

		// Replicate original logic: User must be an Admin OR have the specific permission.
		if (!(isAdmin || hasManagePermission)) {
			const message = `User ${user._id} lacks 'config:collection:manage' permission and is not admin.`;
			logger.warn(message, { userId: user._id, isAdmin, hasManagePermission });
			throw error(403, 'Insufficient permissions');
		}

		// 4. Serialize user data (like the example)
		const { _id, ...rest } = user;
		const serializedUser = {
			id: _id.toString(),
			...rest,
			isAdmin // Include admin status
		};

		// 5. Handle 'new' action
		if (action === 'new') {
			return {
				user: serializedUser,
				roles: tenantRoles || [], // Roles:' key
				permissions, // Permissions data
				permissionConfigs, // Permission configs
				collection: null // Pass null for 'new' action
			};
		}

		// 6. Handle 'edit' action (default)
		// await contentManager.refresh((locals as { tenantId?: string }).tenantId);

		try {
			await contentManager.refresh(); // Force a refresh to bypass any stale cache
		} catch (refreshErr) {
			logger.warn('ContentManager refresh failed during edit load, continuing with current state', refreshErr);
			// Proceed so getCollection may still find the collection from existing state
		}

		const rawPath = params.contentPath;
		const collectionIdentifier = Array.isArray(rawPath) ? (rawPath as string[]).join('/') : typeof rawPath === 'string' ? rawPath : String(rawPath);

		console.log('collectionIdentifier', collectionIdentifier);
		// Try resolving exactly as passed (UUID or relative path)
		let currentCollection = await contentManager.getCollection(collectionIdentifier);

		// Fallback: Try identifying as an absolute path if not found
		if (!(currentCollection || collectionIdentifier.startsWith('/'))) {
			currentCollection = await contentManager.getCollection(`/${collectionIdentifier}`);
		}

		if (!currentCollection) {
			logger.warn(`Collection not found at path: ${collectionIdentifier}`, {
				identifier: collectionIdentifier
			});
			throw error(404, 'Collection not found');
		}

		// Helper function to deep clone and remove functions
		function deepCloneAndRemoveFunctions(obj: unknown): unknown {
			if (obj === null || typeof obj !== 'object') {
				return obj;
			}

			if (obj instanceof Date) {
				return new Date(obj.getTime());
			}

			if (Array.isArray(obj)) {
				return (obj as unknown[]).map((item) => deepCloneAndRemoveFunctions(item));
			}

			const newObj: Record<string, unknown> = {};
			for (const key in obj as Record<string, unknown>) {
				if (Object.hasOwn(obj, key)) {
					const value = (obj as Record<string, unknown>)[key];
					if (typeof value === 'function') {
						continue; // Skip functions
					}
					newObj[key] = deepCloneAndRemoveFunctions(value);
				}
			}
			return newObj;
		}

		const serializableCollection = currentCollection ? deepCloneAndRemoveFunctions(currentCollection) : null;

		console.log('serializableCollection', JSON.stringify(serializableCollection));

		return {
			user: serializedUser,
			roles: tenantRoles || [], // roles:' key
			permissions, // Permissions data
			permissionConfigs, //Permission configs
			collection: serializableCollection
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

/**
 * Resolve collection to the .ts file on disk by _id (and optional path to disambiguate).
 * Tries legacy config/collections first, then tenant path. Returns logical path + which root to write to.
 */
function resolveCollectionFilePathById(
	collectionId: string,
	tenantId: string | null | undefined,
	expectedPath?: string
): { logicalPath: string; writeTenantId: string | null | undefined } | null {
	if (!collectionId?.trim()) return null;
	const idNorm = collectionId.replace(/-/g, '');
	const pathNorm = expectedPath?.replace(/-/g, '') ?? '';

	function scanDir(dir: string, prefix = ''): string | null {
		if (!fs.existsSync(dir)) return null;
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const e of entries) {
			const rel = prefix ? `${prefix}/${e.name}` : e.name;
			if (e.isDirectory()) {
				const found = scanDir(path.join(dir, e.name), rel);
				if (found) return found;
			} else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
				try {
					const content = fs.readFileSync(path.join(dir, e.name), 'utf-8');
					const idMatch = content.match(/_id\s*:\s*["']([^"']+)["']/);
					if (!idMatch?.[1] || idMatch[1].replace(/-/g, '') !== idNorm) continue;
					if (pathNorm) {
						const pathInFile = content.match(/path\s*:\s*["']([^"']+)["']/)?.[1];
						if (pathInFile?.replace(/-/g, '') !== pathNorm) continue;
					}
					return rel.replace(/\.ts$/i, '');
				} catch {
					// skip unreadable files
				}
			}
		}
		return null;
	}

	// Try legacy first so we update/rename files in config/collections when that's where they live
	const toTry: Array<{ writeTenantId: string | null | undefined }> = [
		{ writeTenantId: undefined },
		...(tenantId !== undefined ? [{ writeTenantId: tenantId }] : [])
	];
	for (const { writeTenantId } of toTry) {
		const collectionsDir = getCollectionsPath(writeTenantId);
		const logical = scanDir(collectionsDir);
		if (logical) return { logicalPath: logical, writeTenantId };
	}
	return null;
}

export const actions: Actions = {
	// Save Collection
	saveCollection: async ({ request }) => {
		try {
			console.log('saveCollection');
			const formData = await request.formData();
			const fieldsData = formData.get('fields') as string;
			const originalName = formData.get('originalName') as string;
			const contentPathParam = (formData.get('contentPath') as string) || originalName || '';
			const contentName = formData.get('name') as string;
			const collectionIcon = String(formData.get('icon') ?? '');
			const collectionSlug = formData.get('slug') as string;
			const collectionDescription = formData.get('description');
			const collectionStatus = formData.get('status') as string;
			const confirmDeletions = formData.get('confirmDeletions') === 'true';
			let collectionId = (formData.get('_id') as string) || '';
			// Normalize _id (client may send string or JSON like {"$oid":"..."})
			if (collectionId && typeof collectionId === 'string' && collectionId.trim().startsWith('{')) {
				try {
					const parsed = JSON.parse(collectionId) as { $oid?: string; toString?: () => string };
					collectionId = parsed?.$oid ?? parsed?.toString?.() ?? String(parsed ?? '');
				} catch {
					// keep as-is
				}
			}
			collectionId = (collectionId && String(collectionId).trim()) || '';
			const parentIdParam = (formData.get('parentId') as string) || '';

			// New collection: generate id and use id-based path (file path = id so DB gets path from file)
			const isNewCollection = !collectionId;
			if (isNewCollection) {
				collectionId = (Math.random().toString(36).substring(2, 15) + Date.now().toString(36)).replace(/-/g, '');
			}

			// Widgets Fields
			const fields = JSON.parse(fieldsData) as FieldsData;

			// 1. Drift Detection & Safety Check
			// Construct a temporary schema for comparison
			const tempSchema: Schema = {
				name: contentName,
				icon: collectionIcon,
				status: collectionStatus as any,
				slug: collectionSlug,
				description: String(collectionDescription || ''),
				fields: Object.values(fields) as any[]
			};

			console.log('tempSchema', JSON.stringify(tempSchema));

			const migrationPlan = await MigrationEngine.createPlan(tempSchema, { compareByIndex: true });
			console.log('migrationPlan', JSON.stringify(migrationPlan.requiresMigration));

			if (migrationPlan.requiresMigration && !confirmDeletions) {
				logger.warn(`Drift detected for collection ${contentName}. Save blocked pending confirmation.`);
				return {
					status: 202,
					driftDetected: true,
					plan: migrationPlan
				};
			}

			const imports = await goThrough(fields, fieldsData);

			// Get tenant ID from request locals (set by hooks.server.ts)
			const tenantId = (request as any).locals?.tenantId;
			// When we resolve file by id we may find it in legacy config/collections; use that for write/compile/rename
			let effectiveWriteTenantId: string | null | undefined = tenantId;

			// Resolve target file path.
			// - New collection: use collection NAME for the file (e.g. new.ts); ID is used only for schema _id and DB path.
			// - Existing (edit): id-based or name-based path as before.
			const originalPathTrimmed = (originalName || '').replace(/^\//, '').trim();
			const flat = await contentManager.getContentStructureFromDatabase('flat', true);
			let targetFilePath: string;
			let oldFilePathForRename: string | null = null;
			let resolvedNodeForPath: (typeof flat)[0] | undefined;

			// Sanitize collection name for use as filename (no slashes, safe chars)
			const nameForFile =
				(contentName || 'new')
					.trim()
					.replace(/[/\\]+/g, '')
					.replace(/\s+/g, '-') || 'new';

			if (isNewCollection) {
				// File path by name: <name>.ts or parentName/<name>.ts (ID is used only for _id and idBasedPath)
				if (parentIdParam) {
					const parent = flat.find((n) => n._id?.toString() === parentIdParam);
					const parentName = (parent?.name as string)?.replace(/\s+/g, '-').replace(/\/|\\/g, '').trim() ?? '';
					targetFilePath = parentName ? `${parentName}/${nameForFile}` : nameForFile;
				} else {
					targetFilePath = nameForFile;
				}
			} else {
				// Find node by id first so resolver can disambiguate (e.g. new6.ts vs new/new6.ts) and we write/rename in the right dir
				let existingNode: (typeof flat)[0] | undefined;
				if (collectionId) {
					const idNorm = collectionId.replace(/-/g, '');
					existingNode = flat.find((n) => n.nodeType === 'collection' && n._id?.toString().replace(/-/g, '') === idNorm);
				}
				const urlPathRaw = (contentPathParam || '').replace(/^\//, '').trim() || originalPathTrimmed || '';
				const looksLikeId = !urlPathRaw.includes('/') && /^[a-zA-Z0-9_-]{16,32}$/.test(urlPathRaw);
				const resolved =
					looksLikeId && collectionId ? resolveCollectionFilePathById(collectionId, tenantId, existingNode?.path as string | undefined) : null;
				const urlFilePath = resolved ? resolved.logicalPath : urlPathRaw;
				if (resolved) effectiveWriteTenantId = resolved.writeTenantId;
				targetFilePath = urlFilePath || contentName.trim();
				if (!existingNode) {
					existingNode =
						flat.find(
							(n) =>
								n.nodeType === 'collection' &&
								(n.path === targetFilePath ||
									n._id?.toString() === targetFilePath ||
									n._id?.toString().replace(/-/g, '') === targetFilePath.replace(/-/g, ''))
						) ??
						(collectionId
							? flat.find((n) => n.nodeType === 'collection' && n._id?.toString().replace(/-/g, '') === collectionId.replace(/-/g, ''))
							: undefined);
				}
				if (existingNode) resolvedNodeForPath = existingNode;
				const newName =
					(contentName || '')
						.trim()
						.replace(/[/\\]+/g, '')
						.replace(/\s+/g, '-') ||
					(existingNode?.name as string)?.trim() ||
					urlFilePath.split('/').pop() ||
					'new';
				const renamed = newName && urlFilePath && newName !== urlFilePath.split('/').pop();
				if (renamed) {
					oldFilePathForRename = urlFilePath;
					targetFilePath = urlFilePath.includes('/')
						? `${urlFilePath.slice(0, urlFilePath.lastIndexOf('/'))}/${newName}`.replace(/^\/+/, '')
						: newName;
				} else {
					targetFilePath = urlFilePath || newName;
				}
			}

			// Id-based path: new collections get new path; when editing, keep existing node path in schema so refresh doesn't orphan
			const idBasedPath = isNewCollection
				? parentIdParam
					? `${parentIdParam}.${collectionId}`
					: collectionId
				: ((resolvedNodeForPath?.path as string | undefined) ??
					(flat.find(
						(n) =>
							n.nodeType === 'collection' &&
							(n._id?.toString() === collectionId || n._id?.toString().replace(/-/g, '') === collectionId?.replace(/-/g, ''))
					)?.path as string | undefined));

			// Generate collection file using AST transformation (preserve _id and path when editing so DB node is kept)
			const content = await generateCollectionFileWithAST({
				contentName,
				collectionIcon,
				collectionStatus,
				collectionDescription,
				collectionSlug,
				fields,
				imports,
				tenantId,
				collectionId: collectionId || undefined,
				collectionPath: idBasedPath
			});

			console.log('content__', content);

			// Write to the resolved path; use effectiveWriteTenantId so we touch the same dir as the existing file (e.g. legacy config/collections)
			const collectionPath = getCollectionFilePath(targetFilePath, effectiveWriteTenantId);
			const oldCollectionPath = isNewCollection
				? null
				: ((oldFilePathForRename ? getCollectionFilePath(oldFilePathForRename, effectiveWriteTenantId) : null) ??
					(originalPathTrimmed ? getCollectionFilePath(originalPathTrimmed, effectiveWriteTenantId) : null));
			const isRename = Boolean(oldCollectionPath && (oldFilePathForRename ?? originalPathTrimmed) !== targetFilePath);

			if (isRename && oldCollectionPath) {
				try {
					if (!fs.existsSync(oldCollectionPath)) {
						logger.warn(`Save: original file not found for rename (${oldCollectionPath}), writing new file only`);
					} else {
						if (collectionPath !== oldCollectionPath && fs.existsSync(collectionPath)) {
							fs.unlinkSync(collectionPath);
						}
						fs.renameSync(oldCollectionPath, collectionPath);
					}
				} catch (renameErr) {
					logger.warn('Save: rename failed, writing to new path', renameErr);
				}
			}
			const targetDir = path.dirname(collectionPath);
			if (!fs.existsSync(targetDir)) {
				fs.mkdirSync(targetDir, { recursive: true });
			}
			fs.writeFileSync(collectionPath, content);

			// Compile using same tenant/path we wrote to
			await compile({ logger, tenantId: effectiveWriteTenantId });

			await contentManager.refresh(tenantId);

			// Return edit path for new collections so client can navigate to edit page
			if (isNewCollection && idBasedPath) {
				return { status: 200, editPath: idBasedPath };
			}
			return { status: 200 };
		} catch (err) {
			const message = `Error in saveCollection action: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return { status: 500, error: message };
		}
	},

	// Save config
	saveConfig: async ({ request }) => {
		try {
			const formData = await request.formData();
			const categories = JSON.parse(formData.get('categories') as string);

			// Convert categories to path-based structure
			interface Category {
				collections?: Array<{
					name: string;
					path?: string;
				}>;
				name: string;
				path?: string;
			}

			const pathCategories = (categories as Category[]).map((cat) => ({
				...cat,
				path: cat.name.toLowerCase().replace(/\s+/g, '-'),
				collections:
					cat.collections?.map((col) => ({
						...col,
						path: `${cat.path || cat.name.toLowerCase().replace(/\s+/g, '-')}/${col.name.toLowerCase().replace(/\s+/g, '-')}`
					})) || []
			}));

			// Update collections with new category paths
			await contentManager.refresh();

			return {
				status: 200,
				categories: pathCategories
			};
		} catch (err) {
			const message = `Error in saveConfig action: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return { status: 500, error: message };
		}
	},

	// Delete collection(s): remove .ts and .js files and DB nodes (client sends ids)
	deleteCollections: async ({ request }) => {
		try {
			const formData = await request.formData();
			const ids = JSON.parse(formData.get('ids') as string) as string[];
			const tenantId = (request as { locals?: { tenantId?: string } }).locals?.tenantId;
			if (!ids?.length) {
				return { status: 400, error: 'Invalid IDs for deletion' };
			}
			const currentStructure = await contentManager.getContentStructureFromDatabase('flat', true);
			const nodesToDelete = currentStructure.filter((node) => node.path && ids.includes(node._id.toString()));
			const pathsToDelete = nodesToDelete.map((node) => node.path as string);
			// Try multiple path candidates (derived path + flat name) and both legacy + tenant dirs
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
				node: { path } as import('@src/content/types').ContentNode
			}));
			await contentManager.upsertContentNodes(operations);
			await compile({ logger, tenantId });
			await contentManager.refresh(tenantId);
			return { status: 200 };
		} catch (err) {
			const message = `Error in deleteCollections action: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			return { status: 500, error: message };
		}
	}
};

// Recursively goes through a collection's fields
async function goThrough(object: FieldsData, fields: string): Promise<string> {
	const imports = new Set<string>();

	async function processField(field: FieldWithWidget | FieldsData, fields?: string): Promise<void> {
		if (!(field instanceof Object)) {
			return;
		}

		for (const key in field) {
			if (!Object.hasOwn(field, key)) {
				continue;
			}
			const fieldValue = field[key];

			// Recursively process nested fields
			if (typeof fieldValue === 'object' && fieldValue !== null) {
				await processField(fieldValue as FieldWithWidget, fields);
			}

			// Check if this field has a widget configuration
			if (!fieldValue || typeof fieldValue !== 'object') {
				continue;
			}
			const fieldWithWidget = fieldValue as FieldWithWidget;
			if (!fieldWithWidget.widget) {
				continue;
			}

			// Get widget definition
			const widgetName = fieldWithWidget.widget.Name;
			const widget = widgets.widgetFunctions[widgetName] as unknown as WidgetDefinition;
			if (!widget?.GuiSchema) {
				continue;
			}

			// Process widget imports
			for (const importKey in widget.GuiSchema) {
				if (!Object.hasOwn(widget.GuiSchema, importKey)) {
					continue;
				}
				const widgetImport = widget.GuiSchema[importKey].imports;
				if (!widgetImport) {
					continue;
				}

				for (const _import of widgetImport) {
					const importValue = fieldWithWidget[importKey];
					const replacement = (typeof importValue === 'string' ? importValue : '').replace(/🗑️/g, '').trim();
					imports.add(_import.replace(`{${importKey}}`, replacement));
				}
			}

			// Convert widget to string representation
			const widgetFnName = fieldWithWidget.widget.key || fieldWithWidget.widget.Name || fieldWithWidget.widget.widgetId;
			const widgetConfig: Record<string, unknown> = {};
			for (const guiKey of Object.keys(widget.GuiSchema || {})) {
				if (guiKey === 'permissions') {
					continue;
				}
				if (fieldWithWidget[guiKey] !== undefined) {
					widgetConfig[guiKey] = fieldWithWidget[guiKey];
				}
			}
			const widgetCall = `🗑️widgets.${widgetFnName}(${JSON.stringify(widgetConfig, (_k, value) =>
				typeof value === 'string' ? String(value.replace(/\s*🗑️\s*/g, '🗑️').trim()) : value
			)})🗑️`;

			field[key] = widgetCall as unknown as FieldWithWidget;

			// Add permissions if present
			const parsedFields = JSON.parse(fields || '{}') as FieldsData;
			if (parsedFields[key]?.permissions) {
				const subWidget = widgetCall.split('}');
				const permissions = removeFalseValues(parsedFields[key].permissions);
				const permissionStr = `,"permissions":${JSON.stringify(permissions)}}`;
				const newWidget = subWidget[0] + permissionStr + subWidget[1];
				field[key] = newWidget as unknown as FieldWithWidget;
			}
		}
	}

	try {
		await processField(object, fields);
		return Array.from(imports).join('\n');
	} catch (err) {
		const message = `Error in goThrough function: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}

	// Asynchronously processes a field recursively
}

// Check if permissions are present and append them

// Remove false values from an object
function removeFalseValues(obj: unknown): unknown {
	if (typeof obj !== 'object' || obj === null) {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map(removeFalseValues).filter(Boolean);
	}

	return Object.fromEntries(
		Object.entries(obj)
			.map(([key, value]) => [key, removeFalseValues(value)])
			.filter(([, value]) => value !== false)
	);
}

// AST-based collection file generation
interface CollectionData {
	collectionDescription: string | FormDataEntryValue | null;
	collectionIcon: string;
	collectionSlug: string;
	collectionStatus: string;
	contentName: string;
	fields: FieldsData;
	imports: string;
	tenantId?: string | null;
	/** When editing, preserve so compiled schema matches DB node and refresh does not orphan it */
	collectionId?: string;
	/** Id-based path for DB (e.g. "<id>" or "parentId.<id>"); when set, written into schema so reconciliation uses it */
	collectionPath?: string;
}

async function generateCollectionFileWithAST(data: CollectionData): Promise<string> {
	try {
		// Generate tenant-aware file path for header comment
		const displayPath = getCollectionDisplayPath(data.contentName, data.tenantId);

		// Create the base template with imports
		const sourceCode = `/**
 * @file ${displayPath}
 * @description Collection file for ${data.contentName}
 */

${data.imports}
import { widgets } from '@src/stores/widget-store.svelte.ts';
import type { Schema } from '@src/content/types';

export const schema: Schema = {
	// Collection Name coming from filename so not needed
	
	// Optional & Icon, status, slug
	// See for possible Icons https://icon-sets.iconify.design/
	icon: '',
	status: '',
	description: '',
	slug: '',
	
	// Defined Fields that are used in your Collection
	// Widget fields can be inspected for individual options
	fields: []
};`;

		// Parse the source code into an AST
		const sourceFile = ts.createSourceFile(
			`${data.contentName}.ts`,
			sourceCode,
			ts.ScriptTarget.ESNext,
			true // setParentNodes
		);

		// Transform the AST to inject the collection data
		const transformationResult = ts.transform(sourceFile, [createCollectionTransformer(data)]);
		const transformedSourceFile = transformationResult.transformed[0];

		// Print the transformed AST back to code
		const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
		let result = printer.printFile(transformedSourceFile);

		// Clean up the 🗑️ markers, unescape JSON quotes, and format with prettier
		result = result
			.replace(/["']🗑️|🗑️["']/g, '')
			.replace(/🗑️/g, '')
			.replace(/\\"/g, '"');

		const prettierConfig = await getPrettierConfig();
		result = await prettier.format(result, prettierConfig);

		return result;
	} catch (error) {
		logger.error('Error generating collection file with AST:', error);
		throw new Error(`Failed to generate collection file: ${error instanceof Error ? error.message : String(error)}`);
	}
}

// Transformer factory to inject collection data into the AST
function createCollectionTransformer(data: CollectionData): ts.TransformerFactory<ts.SourceFile> {
	return (context) => {
		return (sourceFile) => {
			const visitor = (node: ts.Node): ts.VisitResult<ts.Node> => {
				// Find the schema object literal and replace its properties
				if (
					ts.isVariableStatement(node) &&
					node.declarationList.declarations.some((decl) => ts.isIdentifier(decl.name) && decl.name.text === 'schema')
				) {
					// Create the schema object with actual data
					const schemaObject = createSchemaObjectLiteral(data);

					// Create new variable declaration (TypeScript 5.9+ API)
					// createVariableDeclaration(name, exclamationToken, type, initializer)
					const newDeclaration = ts.factory.createVariableDeclaration(
						ts.factory.createIdentifier('schema'),
						undefined, // exclamation token
						undefined, // type  - let TypeScript infer
						schemaObject // initializer
					);

					// Create new variable statement with export modifier
					return ts.factory.createVariableStatement(
						[ts.factory.createModifier(ts.SyntaxKind.ExportKeyword)],
						ts.factory.createVariableDeclarationList([newDeclaration], ts.NodeFlags.Const)
					);
				}

				return ts.visitEachChild(node, visitor, context);
			};

			return ts.visitNode(sourceFile, visitor) as ts.SourceFile;
		};
	};
}

// Create TypeScript AST nodes for the schema object
function createSchemaObjectLiteral(data: CollectionData): ts.ObjectLiteralExpression {
	const properties: ts.ObjectLiteralElementLike[] = [];

	// Preserve _id when editing so DB node is matched on refresh (id-based path duplicates)
	if (data.collectionId) {
		const idStr = String(data.collectionId).replace(/-/g, '');
		properties.push(ts.factory.createPropertyAssignment(ts.factory.createIdentifier('_id'), ts.factory.createStringLiteral(idStr)));
	}

	// Id-based path for new collections so DB stores path by id (reconciliation uses schema.path when id-based)
	if (data.collectionPath) {
		properties.push(
			ts.factory.createPropertyAssignment(ts.factory.createIdentifier('path'), ts.factory.createStringLiteral(String(data.collectionPath)))
		);
	}

	// Name is required so UI and reconciliation show the collection name (not fileName/_id fallback)
	properties.push(
		ts.factory.createPropertyAssignment(
			ts.factory.createIdentifier('name'),
			ts.factory.createStringLiteral(typeof data.contentName === 'string' ? data.contentName : '')
		)
	);

	// Add icon property (ensure string for AST)
	properties.push(
		ts.factory.createPropertyAssignment(
			ts.factory.createIdentifier('icon'),
			ts.factory.createStringLiteral(typeof data.collectionIcon === 'string' ? data.collectionIcon : '')
		)
	);

	// Add status property (ensure string so we never write literal "null")
	const statusStr = typeof data.collectionStatus === 'string' ? data.collectionStatus : 'unpublished';
	properties.push(ts.factory.createPropertyAssignment(ts.factory.createIdentifier('status'), ts.factory.createStringLiteral(statusStr)));

	// Add description property
	const descriptionStr = data.collectionDescription != null ? String(data.collectionDescription) : '';
	properties.push(ts.factory.createPropertyAssignment(ts.factory.createIdentifier('description'), ts.factory.createStringLiteral(descriptionStr)));

	// Add slug property
	properties.push(ts.factory.createPropertyAssignment(ts.factory.createIdentifier('slug'), ts.factory.createStringLiteral(data.collectionSlug)));

	// Add fields property - this is more complex as it contains processed widget calls
	const fieldsString = JSON.stringify(data.fields);
	// Parse the fields as a JavaScript expression (this handles the widget calls)
	const fieldsExpression = ts.factory.createIdentifier(`🗑️${fieldsString}🗑️`);

	properties.push(ts.factory.createPropertyAssignment(ts.factory.createIdentifier('fields'), fieldsExpression));

	return ts.factory.createObjectLiteralExpression(properties, true);
}
