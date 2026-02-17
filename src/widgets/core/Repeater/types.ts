import type { FieldInstance } from '@src/content/types';

export interface RepeaterProps {
	/** Label for the "Add Item" button */
	addLabel?: string;
	/** By default, we use 'fields' to define the schema of items */
	fields?: FieldInstance[];

	/** Maximum number of items */
	max?: number;

	/** Minimum number of items */
	min?: number;

	[key: string]: unknown;
}

// Helper to define the data structure
export type RepeaterItem = Record<string, any>;
export type RepeaterValue = RepeaterItem[];
