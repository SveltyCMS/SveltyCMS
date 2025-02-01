/**
 * @file src/databases/mongodb/models/revision.ts
 * @description MongoDB schema and model for Revisions.
 *
 * This module defines a schema and model for Revisions in the MongoDB database.
 * A Revision is a version of a document that is not yet published.
 */

import mongoose, { Schema } from 'mongoose';
import type { Revision } from '@src/databases/dbInterface';

// Define the Revision model if it doesn't exist already
export const RevisionModel =
	mongoose.models?.Revision ||
	mongoose.model<Revision>(
		'Revision',
		new Schema(
			{
				collectionId: { type: Schema.Types.Mixed, required: true, ref: 'collections' }, // ID of the collection - Mongoose Mixed type
				documentId: { type: Schema.Types.Mixed, required: true }, // ID of the document - Mongoose Mixed type
				createdBy: { type: Schema.Types.Mixed, ref: 'auth_users', required: true }, // ID of the user who created the revision - Mongoose Mixed type
				content: { type: Schema.Types.Mixed, required: true }, // Content of the revision - Mongoose Mixed type
				version: { type: Number, required: true } // Version number of the revision - Mongoose Number type
			},
			{ timestamps: false, collection: 'collection_revisions' }
		)
	);