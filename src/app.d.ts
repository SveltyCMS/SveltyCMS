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
		interface Permission {
			name: string;
			action: 'read' | 'write' | 'delete' | 'manage';
			resource: string;
		}

		interface Locals {
			user?: {
				_id: string; //mongodb
				email: string;
				role: string;
				avatar?: string;
				permissions: string[];
				// Add other relevant user properties here
			} | null;
			collections?: Record<string, DisplayCollection>; // Map of collection names to their definitions
			permissions?: Permission[]; // Array of Permission objects
			theme: Theme | null; // Ensure 'theme' is correctly typed
		}
	}

	type tokenTypes = 'register' | 'resetPassword' | 'emailVerification';

	// Defines the Result type, which represents an object with errors, success, message, and data properties.
	type Result<T = unknown> = {
		errors: string[];
		success: boolean;
		message: string;
		data: T;
	};

	// Defines the DISPLAY type, which represents a function that takes an object with data, collection, field, entry, and contentLanguage properties and returns a promise of any.
	interface DisplayField {
		type: string;
		[key: string]: unknown;
	}

	interface DisplayCollection {
		name: string;
		fields: Record<string, DisplayField>;
	}

	type DisplayData = Record<string, unknown>;
	type DisplayEntry = Record<string, unknown>;

	type DISPLAY = (({
		data: DisplayData,
		collection: DisplayCollection,
		field: DisplayField,
		entry: DisplayEntry,
		contentLanguage: string
	}) => Promise<unknown>) & { default?: boolean };

	/**
	 * Defines the Aggregations type, which represents an object with optional methods for performing transformations, filters, and sorts on data.
	 * The filters method takes a field, content language, and filter, and returns a promise of an array of pipeline stages.
	 * The sorts method takes a field, content language, and sort value, and returns a promise of an array of pipeline stages.
	 */
	type Aggregations = {
		filters?: ({ field, contentLanguage, filter }: { field: DisplayField; contentLanguage: string; filter: string }) => Promise<PipelineStage[]>;
		sorts?: ({ field, contentLanguage, sort }: { field: DisplayField; contentLanguage: string; sort: number }) => Promise<PipelineStage[]>;
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
export { };
