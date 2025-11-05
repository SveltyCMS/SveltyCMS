/**
 * @file src/utils/serialize.ts
 * @description Helper functions to serialize and deserialize data.
 */

import type { User } from '@src/databases/auth/types';
import type { Schema } from '@root/src/content/types';

// System Logger
import { logger } from '@utils/logger';

// Define the Serializable type
export type SerializableValue = string | number | boolean | null | Date | Serializable | Serializable[];

export type Serializable = {
	[key: string]: SerializableValue;
};

// Serializes a single user object by converting non-serializable fields to strings
export function serializeUser(user: User): Serializable {
	const serializedUser: Serializable = { ...user };

	// Convert _id to string if it exists and has a toString method
	if (serializedUser._id && typeof serializedUser._id.toString === 'function') {
		serializedUser._id = serializedUser._id.toString();
	}

	// Serialize other non-serializable fields as needed
	// Example: Convert Date objects to ISO strings
	for (const key in serializedUser) {
		if (serializedUser[key] instanceof Date) {
			serializedUser[key] = serializedUser[key].toISOString();
		}
	}

	// Add more serialization logic for other fields if necessary
	return serializedUser;
}

export function serializeCollection(collection: Schema) {
	// Serialize fields

	return JSON.stringify(collection);
}

export function deserializeCollection(collection: string): Schema {
	try {
		return JSON.parse(collection);
	} catch (error) {
		logger.error('Error deserializing collection:', error);
		throw error;
	}
}

// Interface representing an entry object
export interface Entry {
	_id?: string | { toString(): string };
	// Define other properties of your entry object here
	// e.g., name: string, createdAt: Date, etc.
	[key: string]: string | number | boolean | null | Date | { toString(): string } | undefined;
}

// Serializes a single entry by converting ObjectId fields to strings
export function serializeEntry(entry: Entry): Serializable {
	const serializedEntry: Serializable = { ...entry };

	// Convert _id to string if it exists and has a toString method
	if (serializedEntry._id && typeof serializedEntry._id.toString === 'function') {
		serializedEntry._id = serializedEntry._id.toString();
	}

	// Serialize other non-serializable fields as needed
	// Example: Convert Date objects to ISO strings
	for (const key in serializedEntry) {
		if (serializedEntry[key] instanceof Date) {
			serializedEntry[key] = serializedEntry[key].toISOString();
		}
	}

	return serializedEntry;
}

// Serializes an array of entries
export function serializeEntries(entries: Entry[]): Serializable[] {
	return entries.map((entry) => serializeEntry(entry));
}

// Serializes an array of users
export function serializeUsers(users: User[]): Serializable[] {
	return users.map((user) => serializeUser(user));
}

export function serializeCollections(collections: { [key: string]: Schema }): Record<string, Schema> {
	const serializedArray = Object.keys(collections).map((col) => serializeCollection(collections[col]));
	const response: Record<string, Schema> = {};
	for (let i = 0; i < serializedArray.length; i++) {
		const serializedCollectionString = serializedArray[i];
		if (serializedCollectionString) {
			const deserializedCollection = JSON.parse(serializedCollectionString) as Schema;
			if (deserializedCollection && deserializedCollection.name) {
				response[deserializedCollection.name] = deserializedCollection;
			}
		}
	}
	return response;
}
