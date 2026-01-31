/**
 * @file src/lib/schemas/collectionBuilder.ts
 * @description Valibot validation schemas for Collection Builder operations
 * 
 * Provides type-safe validation for:
 * - Content node operations (create, move, update, delete)
 * - Schema drift detection
 * - Breaking change analysis
 */

import {
	object,
	string,
	number,
	optional,
	literal,
	array,
	pipe,
	minLength,
	transform,
	union,
	record,
	any,
	boolean,
	type InferOutput
} from 'valibot';
import type { DatabaseId, ISODateString } from '@content/types';

// Branded type transformers for type safety
export const DatabaseIdSchema = pipe(
	string(),
	minLength(1),
	transform((input) => input as DatabaseId)
);

export const ISODateStringSchema = pipe(
	string(),
	transform((input) => input as ISODateString)
);

// Content Node Operation Schemas
export const ContentNodeOperationSchema = union([
	object({
		type: literal('create'),
		nodeId: DatabaseIdSchema,
		parentId: optional(DatabaseIdSchema),
		order: number(),
		name: pipe(string(), minLength(1)),
		nodeType: union([literal('category'), literal('collection')]),
		path: pipe(string(), minLength(1)),
		metadata: optional(record(string(), any()))
	}),
	object({
		type: literal('move'),
		nodeId: DatabaseIdSchema,
		newParentId: optional(DatabaseIdSchema),
		newOrder: number(),
		newPath: optional(pipe(string(), minLength(1)))
	}),
	object({
		type: literal('update'),
		nodeId: DatabaseIdSchema,
		updates: record(string(), any())
	}),
	object({
		type: literal('delete'),
		nodeId: DatabaseIdSchema,
		cascade: optional(boolean()) // Delete children or reparent?
	})
]);

export type ContentNodeOperation = InferOutput<typeof ContentNodeOperationSchema>;

// Schema Drift Detection Types
export const SchemaChangeTypeSchema = union([
	literal('field_removed'),
	literal('field_renamed'),
	literal('type_changed'),
	literal('required_added'),
	literal('unique_added'),
	literal('constraint_tightened')
]);

export type SchemaChangeType = InferOutput<typeof SchemaChangeTypeSchema>;

export const BreakingChangeSchema = object({
	type: SchemaChangeTypeSchema,
	field: string(),
	severity: union([literal('blocking'), literal('warning')]),
	dataLoss: boolean(),
	migrationPossible: boolean(),
	affectedCount: number(),
	transform: optional(string()) // Serialized function for server execution
});

export type BreakingChange = InferOutput<typeof BreakingChangeSchema>;

// Schema Drift Result
export interface SchemaDriftResult {
	collection: string;
	changes: BreakingChange[];
	requiresMigration: boolean;
	documentCount: number;
	severity: 'blocking' | 'warning';
}

// Migration Result
export interface MigrationResult {
	success: boolean;
	processed: number;
	failed: number;
	errors: Array<{ documentId: string; error: string }>;
	duration: number;
	backup?: string;
}
