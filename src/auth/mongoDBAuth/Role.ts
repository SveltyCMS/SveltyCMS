import mongoose, { Schema, Document } from 'mongoose';

import type { Role } from '../types';

// Define the Role schema
const RoleSchema = new Schema(
	{
		name: { type: String, required: true }, // Name of the role, required field
		description: String, // Description of the role, optional field
		permissions: [{ type: Schema.Types.ObjectId, ref: 'Permission' }] // Permissions associated with the role, optional field
	},
	{ timestamps: true }
);

// Export the Role model if it doesn't exist
export const RoleModel = mongoose.models.auth_roles || mongoose.model<Role & Document>('auth_roles', RoleSchema);
