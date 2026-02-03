/**
 * @file src/utils/schema/validation.ts
 * @description Valibot schemas for content node operations
 */

import { object, string, optional, number } from 'valibot';

// Basic Schema for DatabaseId validation
export const DatabaseIdSchema = string(); // Can be refined with regex/length if needed

// Schema for a Content Node (simplified for validation)
export const ContentNodeSchema = object({
	_id: DatabaseIdSchema,
	name: string(),
	slug: optional(string()),
	nodeType: string(), // 'category' | 'collection'
	parentId: optional(DatabaseIdSchema),
	order: optional(number())
});

// Operations Types
export const CreateNodeSchema = object({
	type: string(), // 'create'
	node: ContentNodeSchema,
	parentId: optional(DatabaseIdSchema)
});

export const MoveNodeSchema = object({
	type: string(), // 'move'
	nodeId: DatabaseIdSchema,
	targetParentId: optional(DatabaseIdSchema),
	newOrder: number()
});

export const UpdateNodeSchema = object({
	type: string(), // 'update'
	nodeId: DatabaseIdSchema,
	data: object({
		name: optional(string()),
		slug: optional(string()),
		icon: optional(string())
	})
});

export const DeleteNodeSchema = object({
	type: string(), // 'delete'
	nodeId: DatabaseIdSchema
});

// Union of all operations
// Note: In a real implementation we might use union() but for flexibility separate exports are fine
