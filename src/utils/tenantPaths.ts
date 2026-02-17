/**
 * @file src/utils/tenantPaths.ts
 * @description Tenant-aware path resolution utilities for multi-tenant file organization
 *
 * Supports both legacy single-tenant structure and new tenant-based structure:
 * - Legacy: config/collections/
 * - Multi-tenant: config/{tenantId}/collections/ or config/global/collections/
 */

import path from 'node:path';

/**
 * Resolve collection directory based on tenant ID
 *
 * @param tenantId - Tenant ID (null = global, undefined = legacy single-tenant mode)
 * @returns Absolute path to collections directory
 *
 * @example
 * getCollectionsPath('tenant-123')  // => /path/to/config/tenant-123/collections
 * getCollectionsPath(null)          // => /path/to/config/global/collections
 * getCollectionsPath(undefined)     // => /path/to/config/collections (legacy)
 */
export function getCollectionsPath(tenantId?: string | null): string {
	const base = path.join(process.cwd(), 'config');

	if (tenantId === undefined) {
		// Legacy single-tenant mode: config/collections
		return path.join(base, 'collections');
	}

	// Multi-tenant mode: config/{tenantId}/collections or config/global/collections
	const tenant = tenantId === null ? 'global' : tenantId;
	return path.join(base, tenant, 'collections');
}

/**
 * Resolve compiled collections output directory
 *
 * @param tenantId - Tenant ID (null = global, undefined = legacy mode)
 * @returns Absolute path to compiled collections directory
 *
 * @example
 * getCompiledCollectionsPath('tenant-123')  // => /path/to/.compiledCollections/tenant-123
 * getCompiledCollectionsPath(null)          // => /path/to/.compiledCollections/global
 * getCompiledCollectionsPath(undefined)     // => /path/to/.compiledCollections (legacy)
 */
export function getCompiledCollectionsPath(tenantId?: string | null): string {
	const base = path.join(process.cwd(), '.compiledCollections');

	if (tenantId === undefined) {
		// Legacy mode: .compiledCollections/
		return base;
	}

	// Multi-tenant mode: .compiledCollections/{tenantId} or .compiledCollections/global
	const tenant = tenantId === null ? 'global' : tenantId;
	return path.join(base, tenant);
}

/**
 * Extract tenant ID from collection file path
 *
 * @param filePath - File path to analyze
 * @returns Tenant ID (null = global, undefined = legacy path)
 *
 * @example
 * extractTenantFromPath('config/tenant-123/collections/Products.ts')  // => 'tenant-123'
 * extractTenantFromPath('config/global/collections/Categories.ts')    // => null
 * extractTenantFromPath('config/collections/Legacy.ts')               // => undefined
 */
export function extractTenantFromPath(filePath: string): string | null | undefined {
	// Normalize path separators
	const normalized = filePath.replace(/\\/g, '/');

	// Match: config/{tenantId}/collections/...
	const match = normalized.match(/config\/([^/]+)\/collections\//);

	if (!match) {
		// No match - could be legacy path (config/collections/...) or invalid
		return normalized.includes('config/collections/') ? undefined : undefined;
	}

	// Return null for 'global', otherwise return the tenant ID
	return match[1] === 'global' ? null : match[1];
}

/**
 * Get all tenant collection paths for multi-tenant mode
 * Returns both tenant-specific and global paths
 *
 * @param tenantId - Tenant ID (should not be undefined in multi-tenant mode)
 * @returns Array of paths to scan for collections
 */
export function getAllTenantCollectionPaths(tenantId: string | null): string[] {
	const paths: string[] = [];

	// Add tenant-specific path
	paths.push(getCollectionsPath(tenantId));

	// Add global path (if not already global)
	if (tenantId !== null) {
		paths.push(getCollectionsPath(null));
	}

	return paths;
}

/**
 * Validate tenant ID to prevent directory traversal attacks
 *
 * @param tenantId - Tenant ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidTenantId(tenantId: string | null | undefined): boolean {
	if (tenantId === null || tenantId === undefined) {
		return true; // null and undefined are valid
	}

	// Tenant ID must be alphanumeric with hyphens/underscores only
	// No path separators or special characters
	const validPattern = /^[a-zA-Z0-9_-]+$/;
	return validPattern.test(tenantId) && !tenantId.includes('..');
}

/**
 * Get relative path for collection file within tenant structure
 *
 * @param collectionName - Name of the collection
 * @param tenantId - Tenant ID
 * @returns Relative path from project root
 */
export function getCollectionFilePath(collectionName: string, tenantId?: string | null): string {
	const collectionsPath = getCollectionsPath(tenantId);
	return path.join(collectionsPath, `${collectionName}.ts`);
}

/**
 * Get display path for documentation/logging
 *
 * @param collectionName - Name of the collection
 * @param tenantId - Tenant ID
 * @returns Human-readable path string
 */
export function getCollectionDisplayPath(collectionName: string, tenantId?: string | null): string {
	if (tenantId === undefined) {
		return `config/collections/${collectionName}.ts`;
	}

	const tenant = tenantId === null ? 'global' : tenantId;
	return `config/${tenant}/collections/${collectionName}.ts`;
}
