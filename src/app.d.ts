/**
 * @file src/app.d.ts
 * @description This file defines the types for the app.
 *
 * See https://kit.svelte.dev/docs/types#app
 * for information about these interfaces
 * and what to do when importing types
 */

import type { Role, Token, User } from '@src/databases/auth/types'; // Import the actual types
import type { DatabaseAdapter, Theme } from '@src/databases/dbInterface'; // Ensure correct import path
import type { PrivateConfig } from '@src/databases/schemas';

// Declarations removed - handled by alias resolution

declare global {
	/// <reference path="./types/**/*.d.ts" />

	// Vite global variables
	const __FRESH_INSTALL__: boolean;

	declare type Item = import('svelte-dnd-action').Item;
	declare type DndEvent<ItemType = Item> = import('svelte-dnd-action').DndEvent<ItemType>;
	declare namespace svelteHTML {
		interface HTMLAttributes<T> {
			'on:consider'?: (event: CustomEvent<DndEvent<ItemType>> & { target: EventTarget & T }) => void;
			'on:finalize'?: (event: CustomEvent<DndEvent<ItemType>> & { target: EventTarget & T }) => void;
		}
	}

	namespace App {
		// interface Error {}
		// interface PageData {}
		// interface Platform {}
		interface Locals {
			user: User | null;
			collections?: unknown; // Replace with your actual Collections type if available
			permissions: string[]; // Array of user permissions
			session_id?: string;
			// Authorization flags
			isFirstUser: boolean; // True when no users exist in database (setup flow)
			isAdmin: boolean; // True when user's role has admin privileges
			hasManageUsersPermission: boolean; // True when user is admin OR has "manage user" permission
			// Data loaded by authorization hook
			roles: Role[]; // Using imported Role type
			allUsers: User[]; // Using imported User type
			allTokens: Token[]; // Using imported Token type
			theme: Theme | null; // Ensure 'theme' is correctly typed
			customCss: string; // The active theme's custom CSS
			tenantId?: string; // Added for multi-tenancy support
			darkMode: boolean; // Dark mode preference from cookies
			dbAdapter?: DatabaseAdapter | null; // Database adapter for adapter-agnostic operations
			cspNonce?: string; // CSP nonce for this request (managed by SvelteKit)
			// Setup hook caching - prevents duplicate checks/logs per request
			__setupConfigExists?: boolean; // Caches isSetupComplete() result per request
			__setupLogged?: boolean; // Prevents duplicate "config missing" warnings
			__setupRedirectLogged?: boolean; // Prevents duplicate setup redirect logs
			__setupLoginRedirectLogged?: boolean; // Prevents duplicate login redirect logs
			degradedServices?: string[]; // List of unhealthy services (populated by handleSystemState in DEGRADED state)
		}
	}

	type tokenTypes = 'register' | 'resetPassword' | 'emailVerification';

	// Defines the Result type, which represents an object with errors, success, message, and data properties.
	type Result = {
		errors: string[];
		success: boolean;
		message: string;
		data: unknown;
	};

	type AggregationFilterStage = Record<string, unknown>;
	type AggregationSortStage = Record<string, unknown>;

	// Defines the DISPLAY type, which represents a function that takes an object with data, collection, field, entry, and contentLanguage properties and returns a promise of any.
	type DISPLAY = (({ data: unknown, collection: unknown, field: unknown, entry: unknown, contentLanguage: string }) => Promise<unknown>) & {
		default?: boolean;
	};

	// Defines a type for the GraphqlSchema function, which takes an object with field, label, collection, and optional collectionNameMapping properties and returns an object with typeID, graphql, and optional resolver properties.
	type GraphqlSchema = ({
		field,
		label,
		collection,
		collectionNameMapping
	}: {
		field: unknown;
		label: string;
		collection: unknown;
		collectionNameMapping?: Map<string, string>;
	}) => {
		typeID: string | null;
		graphql: string;
		resolver?: { [key: string]: unknown };
	};

	/**
	 * Defines the Aggregations type, which represents an object with optional methods for performing transformations, filters, and sorts on data.
	 * The filters method takes a field, content language, and filter, and returns a promise of an array of aggregation stages.
	 * The sorts method takes a field, content language, and sort value, and returns a promise of an aggregation stage object.
	 */
	type Aggregations = {
		filters?: ({ field, contentLanguage, filter }: { field: unknown; contentLanguage: string; filter: string }) => Promise<AggregationFilterStage[]>;
		sorts?: ({
			field,
			contentLanguage,
			sort,
			sortDirection
		}: {
			field: unknown;
			contentLanguage: string;
			sort?: number;
			sortDirection?: 1 | -1 | 'asc' | 'desc';
		}) => Promise<AggregationSortStage | AggregationSortStage[]>;
	};

	// Defines the File type, which represents an object with an optional path property.
	interface File {
		path?: string;
	}

	interface RegExpConstructor {
		escape(str: string): string;
	}
}

// THIS IS IMPORTANT!!!
// Export an empty object to ensure this file is treated as a module
export {};
