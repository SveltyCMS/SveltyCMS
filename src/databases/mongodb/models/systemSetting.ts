/**
 * @file src/databases/mongodb/models/setting.ts
 * @description Mongoose schema and model for system key-value settings.
 */

import mongoose, { Schema } from 'mongoose';

export interface SystemSetting {
	key: string;
	value: unknown;
	scope: string; // e.g., 'system', 'public', 'private'
	category: string; // 'public' | 'private' - setting classification for security/organization
	isGlobal?: boolean;
	updatedAt?: Date;
}

const SystemSettingSchema = new Schema<SystemSetting>(
	{
		key: { type: String, required: true, index: true, unique: true },
		value: { type: Schema.Types.Mixed, required: true },
		scope: { type: String, default: 'system', index: true },
		category: { type: String, enum: ['public', 'private'], default: 'public', index: true },
		isGlobal: { type: Boolean, default: true },
		updatedAt: { type: Date, default: Date.now }
	},
	{
		timestamps: true,
		collection: 'system_settings',
		strict: true
	}
);

export const SystemSettingModel =
	(mongoose.models?.SystemSetting as mongoose.Model<SystemSetting> | undefined) ||
	mongoose.model<SystemSetting>('SystemSetting', SystemSettingSchema);
