/**
 * @file src/databases/mongodb/models/setting.ts
 * @description Mongoose schema and model for system key-value settings.
 *
 * ### Features
 * - Schema definition with fields for key, value, scope, category, and timestamps
 * - Indexes for efficient querying by key, scope, and category
 * - UUID primary key generation
 * - Supports different setting scopes (system, public, private)
 * - Categorization of settings for security and organization
 */

import mongoose, { Schema } from 'mongoose';
import { generateId } from '@src/databases/mongodb/methods/mongoDBUtils';
import { nowISODateString } from '@utils/dateUtils';

export interface SystemSetting {
	_id: string; // UUID primary key
	key: string;
	value: unknown;
	scope: string; // e.g., 'system', 'public', 'private'
	category: string; // 'public' | 'private' - setting classification for security/organization
	isGlobal?: boolean;
	updatedAt?: string; // ISODateString
}

const SystemSettingSchema = new Schema<SystemSetting>(
	{
		_id: { type: String, required: true, default: () => generateId() }, // UUID primary key
		key: { type: String, required: true, index: true, unique: true },
		value: { type: Schema.Types.Mixed, required: true },
		scope: { type: String, default: 'system', index: true },
		category: { type: String, enum: ['public', 'private'], default: 'public', index: true },
		isGlobal: { type: Boolean, default: true },
		updatedAt: { type: String, default: () => nowISODateString() }
	},
	{
		timestamps: true,
		collection: 'system_settings',
		strict: true,
		_id: false // Disable Mongoose auto-ObjectId generation
	}
);

// Force model recreation if schema changed
if (mongoose.models.system_settings) {
	delete mongoose.models.system_settings;
}
if (mongoose.models.SystemSetting) {
	delete mongoose.models.SystemSetting;
}

export const SystemSettingModel =
	(mongoose.models?.SystemSetting as mongoose.Model<SystemSetting> | undefined) ||
	mongoose.model<SystemSetting>('SystemSetting', SystemSettingSchema);
