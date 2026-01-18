/**
 * @file shared/utils/src/content/relationPopulation.ts
 * @description Utility for populating relationship fields with configurable depth
 *
 * Features:
 * - Recursive relation population with depth control (0-10)
 * - Efficient batching to avoid N+1 queries
 * - Per-field population control
 * - Multi-tenant aware
 */

import type { Schema } from '@shared/database/dbInterface';
import type { DatabaseAdapter } from '@shared/database/dbInterface';
import { logger } from '@shared/utils/logger.server';

// Minimal interface for FieldInstance requirements in this utility
interface FieldInstance {
	db_fieldName: string;
	widget: { key: string };
	collection?: string;
	displayField?: string;
	populationDepth?: number;
}

export interface PopulationOptions {
	/** Population depth: 0 = IDs only, 1+ = populate nested relations */
	depth: number;
	/** Limit which fields to populate (if not specified, populates all relations) */
	fields?: string[];
	/** Tenant ID for multi-tenant filtering */
	tenantId?: string;
}

/**
 * Normalize collection ID for database operations
 */
function normalizeCollectionName(collectionId: string): string {
	const cleanId = collectionId.replace(/-/g, '');
	return `collection_${cleanId}`;
}

/**
 * Check if a field is a relation field
 */
function isRelationField(field: FieldInstance): boolean {
	const widgetType = field.widget?.key || '';
	return widgetType === 'Relation' || widgetType === 'RelationList';
}

/**
 * Get relation field configuration
 */
function getRelationConfig(field: FieldInstance): { collection: string; displayField: string; populationDepth?: number } | null {
	if (!isRelationField(field)) return null;

	// Type guard: check if field has relation properties
	const fieldWithProps = field as FieldInstance & { collection?: string; displayField?: string; populationDepth?: number };

	const collection = fieldWithProps.collection;
	const displayField = fieldWithProps.displayField;
	const populationDepth = fieldWithProps.populationDepth;

	if (!collection || !displayField) return null;

	return { collection, displayField, populationDepth };
}

/**
 * Populate relationship fields in a collection of entries
 *
 * @param entries - Array of entries to populate
 * @param schema - Collection schema containing field definitions
 * @param options - Population options (depth, fields, tenantId)
 * @param dbAdapter - Database adapter for queries
 * @param contentManager - Content manager for schema lookup
 * @returns Populated entries
 */
export async function populateRelations(
	entries: Array<Record<string, unknown>>,
	schema: Schema,
	options: PopulationOptions,
	dbAdapter: DatabaseAdapter,
	contentManager: { getCollectionById: (id: string, tenantId?: string) => Promise<Schema | null> }
): Promise<Array<Record<string, unknown>>> {
	// Depth 0 means no population
	if (options.depth <= 0 || !entries || entries.length === 0) {
		return entries;
	}

	// Validate depth range
	const depth = Math.min(Math.max(options.depth, 0), 10);

	logger.debug(`Populating relations for ${entries.length} entries with depth ${depth}`);

	// Find all relation fields in the schema
	const relationFields = (schema.fields as FieldInstance[]).filter(isRelationField);

	if (relationFields.length === 0) {
		return entries;
	}

	// Filter to requested fields if specified
	const fieldsToPopulate = options.fields ? relationFields.filter((f) => options.fields!.includes(f.db_fieldName)) : relationFields;

	if (fieldsToPopulate.length === 0) {
		return entries;
	}

	// Process each relation field
	for (const field of fieldsToPopulate) {
		const config = getRelationConfig(field);
		if (!config) continue;

		// Use field-specific depth if available, otherwise use global depth
		const fieldDepth = config.populationDepth ?? depth;
		if (fieldDepth <= 0) continue;

		try {
			await populateField(entries, field, config, fieldDepth - 1, options, dbAdapter, contentManager);
		} catch (error) {
			logger.error(`Failed to populate field ${field.db_fieldName}:`, error);
			// Continue with other fields
		}
	}

	return entries;
}

/**
 * Populate a single relation field across multiple entries
 */
async function populateField(
	entries: Array<Record<string, unknown>>,
	field: FieldInstance,
	config: { collection: string; displayField: string },
	remainingDepth: number,
	options: PopulationOptions,
	dbAdapter: DatabaseAdapter,
	contentManager: { getCollectionById: (id: string, tenantId?: string) => Promise<Schema | null> }
): Promise<void> {
	const fieldName = field.db_fieldName;

	// Collect all unique IDs to fetch
	const idsToFetch = new Set<string>();
	for (const entry of entries) {
		const value = entry[fieldName];
		if (value) {
			if (Array.isArray(value)) {
				// RelationList - array of IDs
				value.forEach((id) => {
					if (typeof id === 'string') idsToFetch.add(id);
				});
			} else if (typeof value === 'string') {
				// Relation - single ID
				idsToFetch.add(value);
			}
		}
	}

	if (idsToFetch.size === 0) return;

	// Fetch related entries in batch
	const relatedCollectionName = normalizeCollectionName(config.collection);
	const query: any = { _id: { $in: Array.from(idsToFetch) } };

	// Apply tenant filtering if enabled
	if (options.tenantId) {
		query.tenantId = options.tenantId;
	}

	const result = await dbAdapter.crud.findMany(relatedCollectionName, query);

	if (!result.success || !result.data) {
		logger.warn(`Failed to fetch related entries for field ${fieldName}`);
		return;
	}

	// Create lookup map for fast access
	const relatedMap = new Map<string, any>();
	for (const related of result.data) {
		relatedMap.set(related._id, related);
	}

	// Recursively populate nested relations if depth > 0
	if (remainingDepth > 0 && result.data.length > 0) {
		try {
			const relatedSchema = await contentManager.getCollectionById(config.collection, options.tenantId);
			if (relatedSchema) {
				await populateRelations(
					result.data as unknown as Record<string, unknown>[],
					relatedSchema,
					{ ...options, depth: remainingDepth },
					dbAdapter,
					contentManager
				);
			}
		} catch (error) {
			logger.warn(`Failed to populate nested relations for ${fieldName}:`, error);
		}
	}

	// Update entries with populated data
	for (const entry of entries) {
		const value = entry[fieldName];
		if (!value) continue;

		if (Array.isArray(value)) {
			// RelationList - populate array
			entry[fieldName] = value.map((id) => {
				if (typeof id === 'string') {
					return relatedMap.get(id) || id; // Keep ID if not found
				}
				return id;
			});
		} else if (typeof value === 'string') {
			// Relation - populate single value
			const populated = relatedMap.get(value);
			if (populated) {
				entry[fieldName] = populated;
			}
			// Keep ID if not found
		}
	}
}

/**
 * Extract depth parameter from URL query params
 * Validates and returns a safe depth value (0-10)
 */
export function getDepthFromQuery(url: URL): number {
	const depthParam = url.searchParams.get('depth');
	if (!depthParam) return 1; // Default depth of 1 for backward compatibility

	const depth = parseInt(depthParam, 10);
	if (isNaN(depth)) return 1;

	// Clamp to valid range
	return Math.min(Math.max(depth, 0), 10);
}
