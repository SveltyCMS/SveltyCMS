/**
 * @file scripts/cache-clear.ts
 * @description CLI tool to clear the CMS cache (In-memory or Redis).
 *
 * Usage:
 * bun run scripts/cache-clear.ts [--tenant <id>] [--all]
 */

import { cacheService } from "../src/databases/cache/cache-service";
import { logger } from "../src/utils/logger";

async function main() {
  const args = process.argv.slice(2);
  const tenantIdx = args.indexOf("--tenant");
  const tenantId = tenantIdx !== -1 ? args[tenantIdx + 1] : null;
  const clearAll = args.includes("--all");

  logger.info("🧹 SveltyCMS Cache Clear Tool");

  try {
    // Initialize the cache service (loads config and connects)
    await cacheService.initialize();

    if (clearAll) {
      logger.info("Attempting to clear ALL cache entries across all tenants...");
      await cacheService.invalidateAll();
    } else if (tenantId) {
      logger.info(`Attempting to clear cache for tenant: ${tenantId}...`);
      await cacheService.invalidateAll(tenantId);
    } else {
      logger.info("Attempting to clear system-wide cache...");
      await cacheService.invalidateAll(null);
    }

    logger.info("✨ Cache cleared successfully.");
    process.exit(0);
  } catch (error) {
    logger.error("❌ Failed to clear cache:", error);
    process.exit(1);
  }
}

main();
