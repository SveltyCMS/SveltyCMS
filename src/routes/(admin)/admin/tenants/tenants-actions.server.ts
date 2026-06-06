/**
 * @file src/routes/(admin)/admin/tenants/tenants.remote.ts
 * @description Tenant Management Remote Functions.
 */

export const toggleTenantStatus = async (data: any) => {
  const { TenantModel } = await import("@src/databases/mongodb/tenant");
  const { error } = await import("@sveltejs/kit");
  const { logger } = await import("@utils/logger");
  const { tenantId, status } = data;

  if (!tenantId || !["active", "suspended"].includes(status)) {
    throw error(400, "Invalid parameters");
  }

  try {
    await TenantModel.updateOne({ _id: tenantId }, { status });
    return { success: true };
  } catch (err) {
    logger.error(`Failed to update tenant status ${tenantId}`, err);
    throw error(500, "Update failed");
  }
};
