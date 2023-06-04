import mongoose from 'mongoose';
import { collections } from '$src/lib/utils/db';

export async function load({ request }) {
	if (request.method === 'POST') {
		const { name, DBName, description, icon, status, slug } = request.body;

		// define the schema for the new collection
		const newSchema = new mongoose.Schema({
			name: String,
			dbName: String,
			description: String,
			icon: String,
			status: String,
			slug: String
		});

		// define the model for the new collection using the user-defined name and dbName
		const NewCollection = mongoose.model(name, newSchema, DBName);

		// create a new document in the new collection
		const newDoc = new NewCollection({
			name,
			dbName: DBName,
			description,
			icon,
			status,
			slug
		});
		await newDoc.save();

		return {
			status: 200,
			body: {
				message: 'Collection created successfully'
			}
		};
	}
}
