/**
 * @file src/databases/mongodb/methods/tenantMethods.ts
 * @description MongoDB implementation of Tenant management.
 *
 * Features:
 * - Create tenant
 * - Get tenant by ID
 * - Update tenant
 * - Delete tenant
 * - List tenants
 */

import type { Model } from 'mongoose';
import type { Tenant } from '../../dbInterface';
import type { DatabaseResult, DatabaseId, PaginationOption } from '../../dbInterface';
import { createDatabaseError, generateId } from './mongoDBUtils';
import { logger } from '@utils/logger';

export class MongoTenantMethods {
	private TenantModel: Model<Tenant>;

	constructor(TenantModel: Model<Tenant>) {
		this.TenantModel = TenantModel;
	}

	async create(tenantData: Omit<Tenant, '_id' | 'createdAt' | 'updatedAt'> & { _id?: DatabaseId }): Promise<DatabaseResult<Tenant>> {
		try {
			const tenant = new this.TenantModel({
				...tenantData,
				_id: tenantData._id || generateId() // Use provided ID or generate a new one
			});
			await tenant.save();
			logger.info(`Tenant created: ${tenant.name} (${tenant._id})`);
			return { success: true, data: tenant.toObject() as Tenant };
		} catch (error) {
			return {
				success: false,
				message: 'Failed to create tenant',
				error: createDatabaseError(error, 'CREATE_TENANT_ERROR', 'Failed to create tenant')
			};
		}
	}

	async getById(tenantId: DatabaseId): Promise<DatabaseResult<Tenant | null>> {
		try {
			const tenant = await this.TenantModel.findById(tenantId).lean();
			return { success: true, data: (tenant as Tenant) || null };
		} catch (error) {
			return {
				success: false,
				message: `Failed to get tenant ${tenantId}`,
				error: createDatabaseError(error, 'GET_TENANT_ERROR', `Failed to get tenant ${tenantId}`)
			};
		}
	}

	async update(tenantId: DatabaseId, data: Partial<Omit<Tenant, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Tenant>> {
		try {
			const tenant = await this.TenantModel.findByIdAndUpdate(tenantId, { $set: data }, { new: true, lean: true });
			if (!tenant) {
				return { success: false, message: 'Tenant not found', error: { code: 'NOT_FOUND', message: 'Tenant not found' } };
			}
			return { success: true, data: tenant as Tenant };
		} catch (error) {
			return {
				success: false,
				message: `Failed to update tenant ${tenantId}`,
				error: createDatabaseError(error, 'UPDATE_TENANT_ERROR', `Failed to update tenant ${tenantId}`)
			};
		}
	}

	async delete(tenantId: DatabaseId): Promise<DatabaseResult<void>> {
		try {
			await this.TenantModel.findByIdAndDelete(tenantId);
			return { success: true, data: undefined };
		} catch (error) {
			return {
				success: false,
				message: `Failed to delete tenant ${tenantId}`,
				error: createDatabaseError(error, 'DELETE_TENANT_ERROR', `Failed to delete tenant ${tenantId}`)
			};
		}
	}

	async list(options?: PaginationOption): Promise<DatabaseResult<Tenant[]>> {
		try {
			// Basic list implementation - can be enhanced with pagination from options if needed
			const query = this.TenantModel.find(options?.filter || {});
			if (options?.limit) query.limit(options.limit);
			if (options?.offset) query.skip(options.offset);

			// Fix sorting
			if (options?.sort) {
				const sortOptions: Record<string, 1 | -1> = {};
				if (Array.isArray(options.sort)) {
					options.sort.forEach(([field, direction]) => {
						sortOptions[field] = direction === 'asc' ? 1 : -1;
					});
				} else {
					Object.entries(options.sort).forEach(([field, direction]) => {
						sortOptions[field] = direction === 'asc' ? 1 : -1;
					});
				}
				query.sort(sortOptions);
			}

			const tenants = await query.lean();
			return { success: true, data: tenants as Tenant[] };
		} catch (error) {
			return {
				success: false,
				message: 'Failed to list tenants',
				error: createDatabaseError(error, 'LIST_TENANTS_ERROR', 'Failed to list tenants')
			};
		}
	}
}
