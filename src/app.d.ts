/**
 * @file src/app.d.ts
 * @description This file defines the types for the app.
 *
 * See https://kit.svelte.dev/docs/types#app
 * for information about these interfaces
 * and what to do when importing types
 */

import type { PipelineStage } from 'mongoose';
import type { Theme } from '@src/databases/dbInterface'; // Ensure correct import path
import type { User, Role, Token } from '@src/auth/types'; // Import the actual types

declare const __VERSION__: string; // Declare __VERSION__

declare global {
	/// <reference path="./types/**/*.d.ts" />
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
			user: {
				_id: string; //mongodb
				email: string;
				role: string;
				avatar?: string;
				permissions: string[];
				isAdmin?: boolean; // Added this property
				// Add other relevant user properties here
			} | null;
			collections?: unknown; // Replace with your actual Collections type if available
			permissions: string[]; // Changed from optional to required, and removed 'any'
			session_id?: string; // Added this property
			isFirstUser: boolean; // Added this property
			isAdmin: boolean; // Added this property for component access
			hasManageUsersPermission: boolean; // Added this property
			roles: Role[]; // Using imported Role type
			allUsers: User[]; // Using imported User type
			allTokens: Token[]; // Using imported Token type
			theme: Theme | null; // Ensure 'theme' is correctly typed
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
	 * The filters method takes a field, content language, and filter, and returns a promise of an array of pipeline stages.
	 * The sorts method takes a field, content language, and sort value, and returns a promise of an array of pipeline stages.
	 */
	type Aggregations = {
		filters?: ({ field, contentLanguage, filter }: { field: unknown; contentLanguage: string; filter: string }) => Promise<PipelineStage[]>;
		sorts?: ({ field, contentLanguage, sort }: { field: unknown; contentLanguage: string; sort: number }) => Promise<PipelineStage[]>;
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
