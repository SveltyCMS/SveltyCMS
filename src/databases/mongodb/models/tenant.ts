/**
 * @file src/databases/mongodb/models/tenant.ts
 * @description Mongoose schema for the Tenant entity.
 *
 * This entity represents a customer/organization in the multi-tenant system.
 * It stores:
 * - Basic info (name, owner)
 * - Resource Quotas (max users, max storage, etc.)
 * - Usage Stats (current usage)
 * - Status (active, suspended)
 */

import mongoose, { Schema, model } from 'mongoose';
import type { BaseEntity, DatabaseId } from '@src/databases/dbInterface';

export interface TenantQuota {
	maxUsers: number;
	maxStorageBytes: number;
	maxCollections: number;
	maxApiRequestsPerMonth: number;
}

export interface TenantUsage {
	usersCount: number;
	storageBytes: number;
	collectionsCount: number;
	apiRequestsMonth: number;
	lastUpdated: Date;
}

export interface Tenant extends BaseEntity {
	_id: DatabaseId;
	name: string;
	ownerId: DatabaseId; // The user ID of the tenant owner
	status: 'active' | 'suspended' | 'archived';
	plan: 'free' | 'pro' | 'enterprise';
	quota: TenantQuota;
	usage: TenantUsage;
	settings?: Record<string, unknown>;
}

const TenantSchema = new Schema<Tenant>(
	{
		_id: { type: String, required: true }, // UUID
		name: { type: String, required: true },
		ownerId: { type: String, required: true, index: true },
		status: {
			type: String,
			enum: ['active', 'suspended', 'archived'],
			default: 'active',
			index: true
		},
		plan: {
			type: String,
			enum: ['free', 'pro', 'enterprise'],
			default: 'free'
		},
		quota: {
			maxUsers: { type: Number, default: 5 }, // Default to 5 users
			maxStorageBytes: { type: Number, default: 1024 * 1024 * 100 }, // Default 100MB
			maxCollections: { type: Number, default: 10 }, // Default 10 collections
			maxApiRequestsPerMonth: { type: Number, default: 10000 }
		},
		usage: {
			usersCount: { type: Number, default: 1 }, // Starts with 1 (owner)
			storageBytes: { type: Number, default: 0 },
			collectionsCount: { type: Number, default: 0 },
			apiRequestsMonth: { type: Number, default: 0 },
			lastUpdated: { type: Date, default: Date.now }
		},
		settings: { type: Schema.Types.Mixed }
	},
	{
		timestamps: true,
		_id: false // We provide our own UUID
	}
);

// Indexes
TenantSchema.index({ 'usage.storageBytes': 1 }); // For finding heavy users
TenantSchema.index({ 'usage.lastUpdated': 1 }); // For finding stale stats

export const TenantModel = mongoose.models.Tenant || model<Tenant>('Tenant', TenantSchema);
