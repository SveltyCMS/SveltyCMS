/**
 * @file tests/schema_verification.ts
 * @description Verification script for Schema Drift Detection and Tree Integrity logic.
 *
 * This script serves as a standalone test runner to validate:
 * 1. Schema Drift Detection: Comparing code definitions vs database schemas to detect breaking changes (field removals, type changes).
 * 2. Tree Integrity: Ensuring content node structures (categories/collections) do not contain cycles or duplicate IDs.
 *
 * Usage: bun run tests/schema_verification.ts
 */

import type { ContentNode, Schema } from '../src/content/types';
import { compareSchemas } from '../src/utils/schema/comparison';
import { validateTreeIntegrity } from '../src/utils/schema/tree';

console.log('Starting Schema Verification...');

// --- Test 1: Schema Drift Detection ---
const codeSchema: Schema = {
	_id: 'test_coll',
	name: 'TestCollection',
	fields: [
		{ name: 'title', widget: 'text', required: true }, // Changed to required
		{ name: 'slug', widget: 'text', unique: true }
		// "description" field removed in code
	] as any
};

const dbSchema: Schema = {
	_id: 'test_coll',
	name: 'TestCollection',
	fields: [
		{ name: 'title', widget: 'text', required: false },
		{ name: 'slug', widget: 'text', unique: true },
		{ name: 'description', widget: 'richtext' } // Exists in DB
	] as any
};

const comparison = compareSchemas(codeSchema, dbSchema);

console.log('\n--- Comparison Results ---');
comparison.changes.forEach((c) => {
	console.log(`[${c.type.toUpperCase()}] ${c.fieldName} (Severity: ${c.severity})`);
});

const fieldRemoved = comparison.changes.find((c) => c.type === 'field_removed' && c.fieldName === 'description');
const requiredAdded = comparison.changes.find((c) => c.type === 'required_added' && c.fieldName === 'title');

if (fieldRemoved && requiredAdded) {
	console.log('✅ Schema Drift Validation Passed!');
} else {
	console.error('❌ Schema Drift Validation Failed!');
}

// --- Test 2: Tree Integrity (Cycle) ---
const nodeA: ContentNode = { _id: 'A', name: 'Node A', nodeType: 'category', children: [] } as any;
const nodeB: ContentNode = { _id: 'B', name: 'Node B', nodeType: 'category', children: [] } as any;
const nodeC: ContentNode = { _id: 'C', name: 'Node C', nodeType: 'category', children: [] } as any;

// A -> B -> C -> A
nodeA.children = [nodeB];
nodeB.children = [nodeC];
nodeC.children = [nodeA];

const error = validateTreeIntegrity([nodeA]);

console.log('\n--- Tree Integrity Results ---');
if (error && error.type === 'cycle') {
	console.log(`✅ Cycle Detected: ${error.message}`);
} else {
	console.error('❌ Failed to detect cycle!');
	console.log(error);
}

console.log('\nVerification Complete.');
