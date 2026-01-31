/**
 * @file src/lib/utils/serialization.ts
 * @description Serialization utilities for ContentNode and database ID handling
 * 
 * Provides:
 * - Safe serialization of ContentNode objects (removes heavy collectionDef)
 * - DatabaseId creation and validation
 * - Stable UUID generation for new nodes
 */

import type { DatabaseId, ISODateString, ContentNode } from '@content/types';

/**
 * Serializable version of ContentNode without heavy collectionDef
 */
export interface SerializableContentNode {
	_id: string;
	parentId?: string;
	name: string;
	path: string;
	nodeType: 'category' | 'collection';
	order: number;
	icon?: string;
	slug?: string;
	description?: string;
	updatedAt: string;
	createdAt: string;
	translations?: Array<{ languageTag: string; translationName: string }>;
	tenantId?: string;
}

/**
 * Serialize a ContentNode for client-side use
 * Removes heavy collectionDef to reduce payload size
 */
export function serializeNode(node: ContentNode): SerializableContentNode {
	return {
		_id: node._id.toString(),
		parentId: node.parentId?.toString(),
		name: node.name,
		path: node.path || '',
		nodeType: node.nodeType,
		order: node.order,
		icon: node.icon,
		slug: node.slug,
		description: node.description,
		updatedAt: node.updatedAt as string,
		createdAt: node.createdAt as string,
		translations: node.translations,
		tenantId: node.tenantId
	};
}

/**
 * Convert a string to a DatabaseId with validation
 * @throws Error if the ID is invalid
 */
export function toDatabaseId(id: string): DatabaseId {
	if (!id || typeof id !== 'string') {
		throw new Error(`Invalid DatabaseId: ${id}`);
	}
	return id as DatabaseId;
}

/**
 * Generate a stable UUID for new database entities
 * Uses crypto.randomUUID() instead of Math.random() for security
 */
export function generateStableId(): DatabaseId {
	// Browser and Node.js both support crypto.randomUUID()
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		return crypto.randomUUID() as DatabaseId;
	}
	// Fallback for older environments
	return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}` as DatabaseId;
}

/**
 * Validate that a string is a valid DatabaseId format
 */
export function isValidDatabaseId(id: unknown): id is DatabaseId {
	return typeof id === 'string' && id.length > 0;
}
