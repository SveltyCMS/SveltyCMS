/**
 * @file src/databases/dbUtils.ts
 * @description Database utility functions and error classes.
 */

import type { DatabaseError } from './dbInterface';

export class SystemVirtualFolderError extends Error {
	constructor(
		message: string,
		public status: number,
		public code: string
	) {
		super(message);
		this.name = 'SystemVirtualFolderError';
	}
}

/** Utility Type Guards */
export function isDatabaseError(error: unknown): error is DatabaseError {
	return typeof error === 'object' && error !== null && 'code' in error && 'message' in error;
}
