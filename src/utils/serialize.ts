/**
 * @file src/utils/serialize.ts
 * @description Helper functions to serialize and deserialize data.
 */

// Interface representing a serializable object
interface Serializable {
	[key: string]: string | number | boolean | Date | object | null | undefined;
}

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

// Interface representing an entry object
interface Entry {
	// Define properties of your entry object here
	// e.g., _id: string, name: string, createdAt: Date, etc.
}

// Serializes a single entry by converting ObjectId fields to strings
export function serializeEntry(entry: Entry): Serializable {
	const serializedEntry: Serializable = { ...entry };

	// Convert _id to string if it exists and has a toString method
	if (serializedEntry._id && typeof serializedEntry._id.toString === 'function') {
		serializedEntry._id = serializedEntry._id.toString();
	}

	// Serialize other non-serializable fields as needed

	return serializedEntry;
}

// Serializes an array of entries
export function serializeEntries(entries: Entry[]): Serializable[] {
	return entries.map((entry) => serializeEntry(entry));
}
