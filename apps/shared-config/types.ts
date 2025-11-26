/**
 * @file apps/shared-config/types.ts
 * @description Shared types used by both setup-wizard and cms
 */

/**
 * Database ID type - represents a unique identifier in the database
 * Typically a MongoDB ObjectId string or UUID
 */
export type DatabaseId = string;

/**
 * ISO 8601 date string type
 * Format: YYYY-MM-DDTHH:mm:ss.sssZ
 * Example: "2025-11-07T12:34:56.789Z"
 */
export type ISODateString = string;

/**
 * Base entity interface - all database entities extend this
 */
export interface BaseEntity {
	_id: DatabaseId;
	createdAt: ISODateString;
	updatedAt: ISODateString;
}
