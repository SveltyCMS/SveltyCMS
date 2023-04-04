import mongoose from 'mongoose';
import { DB_HOST_MONGO, DB_HOST_ATLAS, DB_NAME, DB_PASSWORD, DB_USER } from '$env/static/private';
import type { Handle } from '@sveltejs/kit';
import schemas from '$src/collections';
import { fieldsToSchema } from '$src/lib/utils/utils';

import { User } from '../models/user-model';

export const dbConnect: Handle = async ({ resolve, event }) => {
	// Turn off strict mode for query filters. Default in Mongodb 7
	mongoose.set('strictQuery', false);

	if (DB_HOST_MONGO) {
		// use for local mongodb
		mongoose.connect(DB_HOST_MONGO, {
			authSource: 'admin',
			user: DB_USER,
			pass: DB_PASSWORD,
			dbName: DB_NAME
		});
	} else if (DB_HOST_ATLAS) {
		// use for mongodb Atlas
		mongoose.connect(
			`mongodb+srv://${DB_USER}:${DB_PASSWORD}@${DB_HOST_ATLAS}/${DB_NAME}?retryWrites=true&w=majority`
		);
	} else {
		// handle case where neither DB_HOST_MONGO nor DB_HOST_ATLAS are defined
		console.error('Error: Neither DB_HOST_MONGO nor DB_HOST_ATLAS are defined');
	}

	return await resolve(event);
};

const collections: { [Key: string]: mongoose.Model<any> } = {};

// iterates over an array of schemas and creates a new Mongoose schema and model for each on
// if collections is not empty
for (const schema of schemas) {
	const schema_object = new mongoose.Schema(
		{ ...fieldsToSchema(schema.fields), createdAt: Number, updatedAt: Number },
		{
			typeKey: '$type',
			strict: schema.strict || false,
			timestamps: { currentTime: () => Date.now() }
		}
	);
	collections[schema.name] = mongoose.models[schema.name]
		? mongoose.model(schema.name)
		: mongoose.model(schema.name, schema_object);
}

collections['user'] = User;
export { collections };
