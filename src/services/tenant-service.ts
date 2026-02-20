/**
 * @file src/services/tenant-service.ts
 * @description specialized service for managing Multi-Tenancy operations
 *
 * Responsibilities:
 * - Creating new tenants (linked to an owner)
 * - Enforcing Resource Quotas (limit checks)
 * - Tracking Usage (incrementing counters)
 * - Managing Tenant Lifecycle (suspend/activate)
 */

import type { Tenant, TenantQuota } from '@src/databases/db-interface';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger';

// Default quotas for new tenants
const DEFAULT_QUOTAS: TenantQuota = {
	maxUsers: 5,
	maxStorageBytes: 100 * 1024 * 1024, // 100MB
	maxCollections: 10,
	maxApiRequestsPerMonth: 10_000
};

export class TenantService {
	private static instance: TenantService;

	private constructor() {}

	public static getInstance(): TenantService {
		if (!TenantService.instance) {
			TenantService.instance = new TenantService();
		}
		return TenantService.instance;
	}

	private async getDbAdapter() {
		const { dbAdapter } = await import('@src/databases/db');
		return dbAdapter;
	}

	/**
	 * Create a new Tenant for a user.
	 * Typically called during Registration when MULTI_TENANT=true.
	 */
	public async createTenant(name: string, ownerId: string, fixedId?: string): Promise<Tenant> {
		try {
			// Adapter handles ID generation if not provided, but we pass fixedId if present.
			// The interface expects Omit<Tenant, '_id'...> but we might want to support fixed ID.
			// Standard dbAdapter create usually generates ID.
			// If we need fixed ID, we might need a specific method or rely on the adapter to handle _id if passed (which strictly it might not).
			// However, for now, let's assume the adapter implementation can handle it or we don't strictly need fixedId if we return the new one.
			// BUT, the login flow generated an ID to link things.
			// Let's rely on the fact that we can pass _id in the object if we cast it, or update the interface to allow optional _id.
			// For safety/agnosticism, it's better to let the DB generate it.
			// If the login flow needs the ID *before* creation, it generated one.
			// Let's trust the dbAdapter.system.tenants.create to return the created tenant with its ID.

			// Workaround: We really want to set the ID if provided.
			// The interface: create(tenant: Omit<Tenant, '_id' | 'createdAt' | 'updatedAt'>)
			// This explicitly forbids _id.
			// If we MUST have a fixed ID (e.g. from the signup flow), we might need to change the interface or
			// rely on the fact that we pass it to the user creation.
			// Actually, in `login/+page.server.ts`, we generate `tenantId`.
			// If we can't force it here, we should use the one returned by this method.

			const tenantData = {
				name,
				ownerId,
				status: 'active' as const,
				plan: 'free' as const,
				quota: DEFAULT_QUOTAS,
				usage: {
					usersCount: 1, // Owner is the first user
					storageBytes: 0,
					collectionsCount: 0,
					apiRequestsMonth: 0,
					lastUpdated: new Date()
				}
			};

			// If fixedId is provided, we're in a bit of a bind with the interface.
			// However, MongoDB adapter usually allows passing _id if it's in the data object, even if the type says Omit.
			// Let's try to pass it by casting.
			const dataToSave = fixedId ? { ...tenantData, _id: fixedId } : tenantData;

			// Fix: Access tenants directly on dbAdapter
			const dbAdapter = await this.getDbAdapter();
			if (!dbAdapter) {
				throw new Error('Database adapter not initialized');
			}
			const result = await dbAdapter.tenants.create(dataToSave as any);

			if (!result.success) {
				throw result.error || new Error('Failed to create tenant');
			}
			if (!result.data) {
				throw new Error('Failed to create tenant: No data returned');
			}

			logger.info(`New Tenant created: ${name} (${result.data._id}) for owner ${ownerId}`);
			return result.data;
		} catch (err) {
			logger.error('Failed to create tenant', err);
			throw new AppError('Failed to create organization', 500, 'CREATE_TENANT_ERROR');
		}
	}

	/**
	 * Get a tenant by its ID.
	 */
	public async getTenant(tenantId: string): Promise<Tenant | null> {
		if (!tenantId) {
			return null;
		}
		const dbAdapter = await this.getDbAdapter();
		if (!dbAdapter) {
			return null;
		}
		const result = await dbAdapter.tenants.getById(tenantId as any);
		if (!result.success) {
			return null;
		}
		return result.data;
	}

	/**
	 * Check if a tenant has exceeded a specific resource quota.
	 * Throws AppError if quota exceeded.
	 */
	public async checkQuota(tenantId: string, resource: keyof TenantQuota, currentIncrement = 1): Promise<void> {
		const dbAdapter = await this.getDbAdapter();
		if (!dbAdapter) {
			return; // Added null check for dbAdapter
		}
		const tenant = await this.getTenant(tenantId);
		if (!tenant) {
			return;
		}

		// Skip checks for Enterprise plans
		if (tenant.plan === 'enterprise') {
			return;
		}

		let usageVal = 0;
		let limitVal = 0;

		switch (resource) {
			case 'maxUsers':
				usageVal = tenant.usage.usersCount;
				limitVal = tenant.quota.maxUsers;
				break;
			case 'maxStorageBytes':
				usageVal = tenant.usage.storageBytes;
				limitVal = tenant.quota.maxStorageBytes;
				break;
			case 'maxCollections':
				usageVal = tenant.usage.collectionsCount;
				limitVal = tenant.quota.maxCollections;
				break;
			case 'maxApiRequestsPerMonth':
				usageVal = tenant.usage.apiRequestsMonth;
				limitVal = tenant.quota.maxApiRequestsPerMonth;
				break;
		}

		if (usageVal + currentIncrement > limitVal) {
			logger.warn(`Quota Exceeded for Tenant ${tenantId}: ${resource} (${usageVal}/${limitVal})`);
			throw new AppError(`Resource limit reached: ${resource}. Please upgrade your plan.`, 403, 'QUOTA_EXCEEDED');
		}
	}

	/**
	 * Increment usage stats for a tenant.
	 */
	public async incrementUsage(tenantId: string, resource: keyof TenantQuota, amount = 1): Promise<void> {
		if (!tenantId) {
			return;
		}

		const fieldMap: Record<keyof TenantQuota, string> = {
			maxUsers: 'usage.usersCount',
			maxStorageBytes: 'usage.storageBytes',
			maxCollections: 'usage.collectionsCount',
			maxApiRequestsPerMonth: 'usage.apiRequestsMonth'
		};

		const updateField = fieldMap[resource];
		if (!updateField) {
			return;
		}

		// We need a way to atomicaly increment.
		// The generic update interface usually takes a partial object to set.
		// DB Agnostic increment is hard without specific support.
		// For now, we might have to read-modify-write if atomic increment isn't exposed.
		// OR we rely on the adapter knowing how to handle special keys, but that breaks agnosticism.

		// Better approach for now (MVP): Read, Modify, Write.
		// Race conditions are possible but acceptable for simple quotas for now.
		// Ideally IDBAdapter.update supports atomic operations or we add an increment method.

		try {
			const tenant = await this.getTenant(tenantId);
			if (!tenant) {
				return;
			}

			// Logic to update the specific nested field
			// Since our update method takes Partial<Tenant>, we need to reconstruct the nested usage object?
			// Standard separate field updates might overwrite other usage stats if we are not careful,
			// dependent on how adapter implements generic update (usually $set in mongo).

			// Let's try to update just the usage object.
			const newUsage = { ...tenant.usage };
			// const k = resource as keyof TenantQuota; // Unused but kept for reference if needed logic expanded

			// Mapping resource to usage key
			if (resource === 'maxUsers') {
				newUsage.usersCount += amount;
			}
			if (resource === 'maxStorageBytes') {
				newUsage.storageBytes += amount;
			}
			if (resource === 'maxCollections') {
				newUsage.collectionsCount += amount;
			}
			if (resource === 'maxApiRequestsPerMonth') {
				newUsage.apiRequestsMonth += amount;
			}
			newUsage.lastUpdated = new Date();

			const dbAdapter = await this.getDbAdapter();
			if (!dbAdapter) {
				return;
			}
			await dbAdapter.tenants.update(tenantId as any, { usage: newUsage });
		} catch (err) {
			logger.error(`Failed to update usage for tenant ${tenantId}`, err);
		}
	}

	/**
	 * Decrement usage (e.g. deleting users/files)
	 */
	public async decrementUsage(tenantId: string, resource: keyof TenantQuota, amount = 1): Promise<void> {
		return this.incrementUsage(tenantId, resource, -amount);
	}
}

export const tenantService = TenantService.getInstance();
