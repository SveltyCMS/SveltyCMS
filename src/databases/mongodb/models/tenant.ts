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

import type { BaseEntity, DatabaseId } from '@src/databases/db-interface';
import mongoose, { Schema } from 'mongoose';

export interface TenantQuota {
	maxApiRequestsPerMonth: number;
	maxCollections: number;
	maxStorageBytes: number;
	maxUsers: number;
}

export interface TenantUsage {
	apiRequestsMonth: number;
	collectionsCount: number;
	lastUpdated: Date;
	storageBytes: number;
	usersCount: number;
}

export interface Tenant extends BaseEntity {
	_id: DatabaseId;
	name: string;
	ownerId: DatabaseId; // The user ID of the tenant owner
	plan: 'free' | 'pro' | 'enterprise';
	quota: TenantQuota;
	settings?: Record<string, unknown>;
	status: 'active' | 'suspended' | 'archived';
	usage: TenantUsage;
}

const TENANT_SCHEMA = new Schema<Tenant>(
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
			maxApiRequestsPerMonth: { type: Number, default: 10_000 }
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
TENANT_SCHEMA.index({ 'usage.storageBytes': 1 }); // For finding heavy users
TENANT_SCHEMA.index({ 'usage.lastUpdated': 1 }); // For finding stale stats

export const TenantModel = mongoose.models.Tenant || mongoose.model<Tenant>('Tenant', TENANT_SCHEMA);
