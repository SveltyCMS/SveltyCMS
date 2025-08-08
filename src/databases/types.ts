/**
 * @file src/databases/types.ts
 * @description Shared database-related types for SveltyCMS.
 *
 * This file contains type definitions that are safe to be shared between
 * the server-side and client-side of the application. It should not
 * contain any server-only logic or imports.
 */

/** Core Types **/
export type DatabaseId = string & { readonly __brand: unique symbol }; // Unique identifier type
export type ISODateString = string & { readonly __isoDate: unique symbol }; // ISO 8601 date string type

/** Base Entity **/
export interface BaseEntity {
	_id: DatabaseId; // Unique identifier
	createdAt: ISODateString; // ISO 8601 date string
	updatedAt: ISODateString; // ISO 8601 date string
}

/** Translation **/
export interface Translation {
	languageTag: string;
	translationName: string;
	isDefault?: boolean;
}

/** Content Management Types **/
export interface ContentNode<ContentType = 'category' | 'collection'> extends BaseEntity {
	name: string;
	nodeType: ContentType;
	icon?: string;
	order: number;
	translations: Translation[];
}
