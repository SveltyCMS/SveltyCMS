/**
 * @file src/utils/serialize.ts
 * @description Helper functions to serialize and deserialize data.
 */

import type { User } from '@src/auth/types';
import type { Schema } from '@src/collections/types';

// Define the Serializable type
export type Serializable = {
	[key: string]: string | number | boolean | null | Serializable | Serializable[];
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
	if (serializedUser.createdAt instanceof Date) {
		serializedUser.createdAt = serializedUser.createdAt.toISOString();
	}

	// Add more serialization logic for other fields if necessary
	return serializedUser;
}

function serializeCollection(collection: Schema) {
	function serialize(obj: any) {
		if (obj instanceof Date) {
			return obj.toISOString();
		}
		if (typeof obj === 'function') {
			return obj.toString();
		}
		// For arrays, serialize each element
		if (Array.isArray(obj)) {
			return obj.map((item) => serialize(item));
		}
		// For nested objects, serialize recursively
		if (typeof obj === 'object') {
			return Object.keys(obj).reduce((acc, key) => {
				acc[key] = serialize(obj[key]);
				return acc;
			}, {});
		}
		return obj;
	}

	// Serialize fields
	collection.fields = collection.fields.map((field) => serialize(field));

	return collection;
}

// Interface representing an entry object
export interface Entry {
	_id?: string | { toString(): string };
	// Define other properties of your entry object here
	// e.g., name: string, createdAt: Date, etc.
	[key: string]: any; // Allow for any additional properties
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

export function serializeCollections(collections: { [key: string]: Schema }) {
	const serializedArray = Object.keys(collections).map((col) => serializeCollection(collections[col]));
	const response = {};
	for (let i = 0; i < serializedArray.length; i++) {
		const serializedCollection = serializedArray[i];
		if (serializedCollection && serializedCollection.name) {
			response[serializedCollection.name] = serializedCollection;
		}
	}
	return response;
}
