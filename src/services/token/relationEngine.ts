/**
 * @file src/services/token/relationEngine.ts
 * @description Extension for the token engine to support Relations widget with RBAC
 *
 * Features
 * - Relation Tokens
 * - Security Checks
 * - Token Generation
 */
import type { TokenContext, TokenDefinition } from './types';
import type { Schema, FieldInstance } from '@src/content/types';
import type { User } from '@src/databases/auth/types';
import { contentManager } from '@src/content/ContentManager';
import { logger } from '@utils/logger';
import { canAccessCollection } from './relationResolver';

// Generates token definitions for Relations fields with security checks
export async function getRelationTokens(
	schema: Schema,
	user: User | undefined,
	tenantId?: string,
	roles?: import('@src/databases/auth/types').Role[]
): Promise<TokenDefinition[]> {
	const tokens: TokenDefinition[] = [];

	// Find all Relation fields in the schema
	const relationFields = (schema.fields as FieldInstance[]).filter((field) => field.widget?.Name === 'Relation');

	for (const field of relationFields) {
		const fieldName = field.db_fieldName || field.label;
		const widget = field.widget as unknown as { collection?: string; display_field?: string; multiple?: boolean };
		const relatedCollection = widget?.collection;

		if (!fieldName || !relatedCollection) continue;

		// Security: Check if user can access the related collection
		const hasAccess = await canAccessCollection(user, relatedCollection, tenantId, roles);
		if (!hasAccess) {
			logger.debug(`User ${user?._id} denied access to relation ${fieldName} → ${relatedCollection}`);
			continue;
		}

		// Get the related collection schema to discover its fields
		try {
			const relatedSchema = await contentManager.getCollectionById(relatedCollection, tenantId);
			if (!relatedSchema) continue;

			// Generate tokens for related collection fields
			const displayField = widget?.display_field || 'title';

			// Primary display field token
			tokens.push({
				token: `entry.${fieldName}.${displayField}`,
				name: `${field.label || fieldName} → ${displayField}`,
				category: 'entry',
				type: 'string',
				description: `Related ${relatedSchema.label || relatedSchema.name}: ${displayField} field`,
				example: `{{entry.${fieldName}.${displayField}}}`,
				requiresPermission: `read:collection:${relatedCollection}`,
				resolve: async (ctx: TokenContext) => {
					const relationData = ctx.entry?.[fieldName] as any;
					if (!relationData) return '';

					// Handle both single and multiple relations
					if (Array.isArray(relationData)) {
						// Multiple relations: return first item's display field
						return relationData[0]?.[displayField] || '';
					}

					// Single relation
					return relationData[displayField] || '';
				}
			});

			// Additional common fields from related collection
			// const commonFields = ['_id', 'createdAt', 'updatedAt', 'status'];

			for (const relField of relatedSchema.fields as FieldInstance[]) {
				const relFieldName = relField.db_fieldName || relField.label;
				if (!relFieldName || relFieldName === displayField) continue;

				// Skip sensitive fields
				if (relFieldName.toLowerCase().includes('password')) continue;

				tokens.push({
					token: `entry.${fieldName}.${relFieldName}`,
					name: `${field.label || fieldName} → ${relField.label || relFieldName}`,
					category: 'entry',
					type: getFieldType(relField),
					description: `Related ${relatedSchema.label || relatedSchema.name}: ${relField.helper || relFieldName}`,
					example: `{{entry.${fieldName}.${relFieldName}}}`,
					requiresPermission: `read:collection:${relatedCollection}`,
					resolve: async (ctx: TokenContext) => {
						const relationData = ctx.entry?.[fieldName] as any;
						if (!relationData) return '';

						if (Array.isArray(relationData)) {
							return relationData[0]?.[relFieldName] || '';
						}

						return relationData[relFieldName] || '';
					}
				});
			}

			// Special token for multiple relations (array handling)
			if (widget?.multiple) {
				tokens.push({
					token: `entry.${fieldName}.count`,
					name: `${field.label || fieldName} → Count`,
					category: 'entry',
					type: 'number',
					description: `Number of related ${relatedSchema.label || relatedSchema.name} items`,
					example: `{{entry.${fieldName}.count}}`,
					requiresPermission: `read:collection:${relatedCollection}`,
					resolve: async (ctx: TokenContext) => {
						const relationData = ctx.entry?.[fieldName];
						if (!relationData) return 0;
						return Array.isArray(relationData) ? relationData.length : 1;
					}
				});

				tokens.push({
					token: `entry.${fieldName}.all`,
					name: `${field.label || fieldName} → All Items`,
					category: 'entry',
					type: 'string',
					description: `Comma-separated list of all related ${relatedSchema.label || relatedSchema.name}`,
					example: `{{entry.${fieldName}.all | truncate(100)}}`,
					requiresPermission: `read:collection:${relatedCollection}`,
					resolve: async (ctx: TokenContext) => {
						const relationData = ctx.entry?.[fieldName] as any;
						if (!relationData) return '';

						if (Array.isArray(relationData)) {
							return relationData
								.map((item) => item[displayField] || item._id)
								.filter(Boolean)
								.join(', ');
						}

						return relationData[displayField] || '';
					}
				});
			}
		} catch (error) {
			logger.error(`Failed to load relation schema for ${relatedCollection}:`, error);
		}
	}

	return tokens;
}

// Helper to infer field type from widget
function getFieldType(field: FieldInstance): 'string' | 'number' | 'date' | 'boolean' {
	const widgetName = field.widget?.Name;

	const typeMap: Record<string, 'string' | 'number' | 'date' | 'boolean'> = {
		Checkbox: 'boolean',
		Date: 'date',
		Number: 'number',
		Currency: 'number',
		Rating: 'number',
		Input: 'string',
		RichText: 'string',
		Email: 'string'
	};

	return typeMap[widgetName || ''] || 'string';
}
