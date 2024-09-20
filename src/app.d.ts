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
		interface Locals {
			user?: {
				id: string;
				role: string;
				// Add other relevant user properties here
			};
			permissions?: any[]; // Replace 'any' with your actual Permissions type if available
			theme: Theme | null; // Ensure 'theme' is correctly typed
		}
	}

	type tokenTypes = 'register' | 'resetPassword' | 'emailVerification';

	// Defines the Result type, which represents an object with errors, success, message, and data properties.
	type Result = {
		errors: string[];
		success: boolean;
		message: string;
		data: any;
	};

	// Defines the DISPLAY type, which represents a function that takes an object with data, collection, field, entry, and contentLanguage properties and returns a promise of any.
	type DISPLAY = (({ data: any, collection: any, field: any, entry: any, contentLanguage: string }) => Promise<any>) & { default?: boolean };

	// Defines a type for the GraphqlSchema function, which takes an object with field, label, and collection properties and returns an object with typeName, graphql, and optional resolver properties.
	type GraphqlSchema = ({ field, label, collection }: { field: any; label: string; collection: any }) => {
		typeName: string | null;
		graphql: string;
		resolver?: { [key: string]: any };
	};

	/**
	 * Defines the Aggregations type, which represents an object with optional methods for performing transformations, filters, and sorts on data.
	 * The filters method takes a field, content language, and filter, and returns a promise of an array of pipeline stages.
	 * The sorts method takes a field, content language, and sort value, and returns a promise of an array of pipeline stages.
	 */
	type Aggregations = {
		filters?: ({ field, contentLanguage, filter }: { field: any; contentLanguage: string; filter: string }) => Promise<PipelineStage[]>;
		sorts?: ({ field, contentLanguage, sort }: { field: any; contentLanguage: string; sort: number }) => Promise<PipelineStage[]>;
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
