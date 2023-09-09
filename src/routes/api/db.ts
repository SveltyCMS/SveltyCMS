import { collections } from '@src/stores/store';
import { fieldsToSchema } from '@src/utils/utils';
import { dev } from '$app/environment';
import type { Unsubscriber } from 'svelte/store';

// Lucia
import lucia from 'lucia-auth';
import adapter from '@lucia-auth/adapter-mongoose';
import { session, key, UserSchema } from '@src/collections/Auth';
import { sveltekit } from 'lucia-auth/middleware';

// mongoose
import mongoose from 'mongoose';
import { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD } from '$env/static/private';

// Turn off strict mode for query filters. Default in Mongodb 7
mongoose.set('strictQuery', false);

// Connect to MongoDB database using imported environment variables
mongoose
	.connect(DB_HOST, {
		authSource: 'admin',
		user: DB_USER,
		pass: DB_PASSWORD,
		dbName: DB_NAME
	})
	.then(() =>
		console.log(
			'---------------------Connection to database is successful! -----------------------'
		)
	)
	.catch((error) => console.error('Error connecting to database:', error));

// Initialize collections object
const collectionsModels: { [Key: string]: mongoose.Model<any> } = {};

let unsubscribe: Unsubscriber | undefined;

// Set up collections in the database using imported schemas
export async function getCollectionModels() {
	// Return a new Promise that resolves with the collectionsModels object
	return new Promise<any>((resolve) => {
		// Subscribe to the collections store
		unsubscribe = collections.subscribe((collections) => {
			// If collections are defined
			if (collections) {
				// Iterate over each collection
				for (const collection of collections) {
					// Create a new mongoose schema using the collection's fields and timestamps
					const schema_object = new mongoose.Schema(
						{ ...fieldsToSchema(collection.fields), createdAt: Number, updatedAt: Number },
						{
							typeKey: '$type',
							strict: false,
							timestamps: { currentTime: () => Date.now() }
						}
					);

					// Add the mongoose model for the collection to the collectionsModels object
					if (!collection.name) return;
					collectionsModels[collection.name] = mongoose.models[collection.name]
						? mongoose.model(collection.name)
						: mongoose.model(collection.name, schema_object);
				}

				// Unsubscribe from the collections store and resolve the Promise with the collectionsModels object
				unsubscribe && unsubscribe();
				unsubscribe = undefined;
				resolve(collectionsModels);
			}
		});
	});
}

// Set up authentication collections if they don't already exist
!mongoose.models['auth_session'] &&
	mongoose.model('auth_session', new mongoose.Schema({ ...session }, { _id: false }));
!mongoose.models['auth_key'] &&
	mongoose.model('auth_key', new mongoose.Schema({ ...key }, { _id: false }));
!mongoose.models['auth_user'] &&
	mongoose.model(
		'auth_user',
		new mongoose.Schema({ ...UserSchema }, { _id: false, timestamps: true })
	);

// Set up authentication using Lucia and export auth object
const auth = lucia({
	adapter: adapter(mongoose),

	//for production & cloned dev environment
	env: dev ? 'DEV' : 'PROD',

	autoDatabaseCleanup: true,

	transformDatabaseUser: (userData) => {
		return {
			...userData
		};
	},
	middleware: sveltekit()
});

// Export collections and auth objects
export { collectionsModels, auth };
