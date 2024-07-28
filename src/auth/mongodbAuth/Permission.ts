import mongoose, { Schema, Document } from 'mongoose';

import { PermissionAction, type Permission } from '../types';

// Define the Permission schema
export const PermissionSchema = new Schema(
	{
		name: { type: String, required: true }, // Name of the permission, required field
		action: { type: String, enum: Object.values(PermissionAction), required: true }, // Action of the permission, required field
		description: String, // Description of the permission, optional field
		contextId: { type: String, required: true }, // ID of the context associated with the permission, required field
		contextType: { type: String, required: true }, // Type of the context associated with the permission, required field
		requiredRole: { type: Schema.Types.ObjectId, ref: 'Role', required: true }, // Required role for the permission, required field
		requires2FA: Boolean // Whether the permission requires 2FA, optional field
	},
	{ timestamps: true }
);

// Export the Permission model if it doesn't exist
export const PermissionModel = mongoose.models.auth_permissions || mongoose.model<Permission & Document>('auth_permissions', PermissionSchema);
