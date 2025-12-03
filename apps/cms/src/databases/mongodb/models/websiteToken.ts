/**
 * @file src/databases/mongodb/models/websiteToken.ts
 * @description Mongoose model for Website Tokens used for external access
 *
 * ### Fields
 * - `_id`: Unique identifier for the token
 * - `name`: Human-readable name for the token
 * - `token`: The actual token string used for authentication
 * - `createdAt`: Timestamp of when the token was created
 * - `updatedAt`: Timestamp of the last update to the token
 * - `createdBy`: User ID of the creator of the token
 */

import mongoose, { Schema } from 'mongoose';
import type { Model } from 'mongoose';
import type { WebsiteToken } from '@src/databases/schemas';
import { nowISODateString } from '@utils/dateUtils';
import { generateId } from '@src/databases/mongodb/methods/mongoDBUtils';

export const websiteTokenSchema = new Schema<WebsiteToken>(
	{
		_id: { type: String, required: true, default: () => generateId() },
		name: { type: String, required: true },
		token: { type: String, required: true, unique: true },
		createdAt: { type: String, default: () => nowISODateString() },
		updatedAt: { type: String, default: () => nowISODateString() },
		createdBy: { type: String, required: true }
	},
	{
		timestamps: true,
		collection: 'system_website_tokens',
		strict: true,
		_id: false
	}
);

websiteTokenSchema.index({ createdBy: 1 });

export const WebsiteTokenModel =
	(mongoose.models?.WebsiteToken as Model<WebsiteToken> | undefined) || mongoose.model<WebsiteToken>('WebsiteToken', websiteTokenSchema);
