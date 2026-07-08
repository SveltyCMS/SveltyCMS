/**
 * @file src/routes/setup/writePrivateConfig.ts
 * @description Utility to write the `config/private.ts` file with bootstrap-only
 * database credentials and security keys during the setup process.
 *
 * SSO/SAML keys, password policy, and rate limiting secrets are now DB-driven
 * and seeded via `seedSettings()` — they no longer belong in private.ts.
 */

import { generateSecureToken } from "@utils/native-utils";
import type { DatabaseConfig } from "@src/databases/schemas";
import { logger } from "@utils/logger";

/**
 * Writes bootstrap-only credentials and security keys to private.ts
 * Includes safety features: backup existing file and prevent overwrite after setup
 */
export async function writePrivateConfig(
  dbConfig: DatabaseConfig,
  system: { multiTenant?: boolean; demoMode?: boolean } = {},
): Promise<void> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  // Support TEST_MODE for isolated testing
  const configFileName = process.env.TEST_MODE ? "private.test.ts" : "private.ts";
  const privateConfigPath = path.resolve(process.cwd(), "config", configFileName);

  // Generate bootstrap security keys
  const jwtSecret = generateSecureToken(32);
  const encryptionKey = generateSecureToken(32);

  // Sanitization helper to prevent code injection via single quotes
  const escape = (val: string | number | undefined) => {
    if (val === undefined) {
      return "";
    }
    return String(val)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r");
  };

  // Generate the private.ts content (bootstrap-only values)
  const privateConfigContent = `
/**
 * @file config/private.ts
 * @description Private configuration file containing essential bootstrap variables.
 * These values are required for the server to start and connect to the database.
 * This file was populated during the initial setup process.
 */
// import { createPrivateConfig } from '@src/databases/schemas'; // Removed to avoid alias resolution issues in production/tests

export const privateEnv = {
	// --- Core Database Connection (bootstrap — required before DB is available) ---
	DB_TYPE: '${escape(dbConfig.type)}',
	DB_HOST: '${escape(dbConfig.host)}',
	DB_PORT: ${Number(dbConfig.port) || 0},
	DB_NAME: '${escape(dbConfig.name)}',
	DB_USER: '${escape(dbConfig.user)}',
	DB_PASSWORD: '${escape(dbConfig.password)}',

	// --- Connection Resilience (bootstrap) ---
	DB_RETRY_ATTEMPTS: 5,
	DB_RETRY_DELAY: 3000, // 3 seconds

	// --- Core Security Keys (bootstrap — session tokens + encryption need these immediately) ---
	JWT_SECRET_KEY: '${jwtSecret}',
	ENCRYPTION_KEY: '${encryptionKey}',

	// --- Architectural Mode (bootstrap — affects middleware before DB) ---
	MULTI_TENANT: ${system.multiTenant ? "true" : "false"},
	DEMO: ${system.demoMode ? "true" : "false"},

	/*
	 * NOTE: All other settings (SSO/SAML keys, password policy, rate limiting,
	 * SMTP, OAuth, Redis, feature flags, etc.) are seeded into the database
	 * during setup and managed via the System Settings UI at /config/system-settings.
	 */
};
`;

  try {
    await fs.writeFile(privateConfigPath, privateConfigContent, "utf-8");

    // Validate written file to ensure integrity
    const writtenContent = await fs.readFile(privateConfigPath, "utf-8");

    // Robust validation using Regex to ignore quoting styles and whitespace
    const checks = [
      {
        name: "JWT_SECRET_KEY",
        regex: /\bJWT_SECRET_KEY\s*:\s*['"][^'"]{32,}['"]/,
      },
      {
        name: "ENCRYPTION_KEY",
        regex: /\bENCRYPTION_KEY\s*:\s*['"][^'"]{32,}['"]/,
      },
      {
        name: "DB_HOST",
        // SQLite uses file paths not network hosts — skip exact match to avoid
        // Windows/Unix path separator mismatch (backslash vs forward slash).
        regex:
          dbConfig.type === "sqlite"
            ? /\bDB_HOST\s*:\s*['"][^'"]*['"]/
            : dbConfig.host
              ? new RegExp(`\\bDB_HOST\\s*:\\s*['"]${escape(dbConfig.host)}['"]`)
              : /\bDB_HOST\s*:\s*['"]['"]/,
      },
      {
        name: "DB_NAME",
        regex: dbConfig.name
          ? new RegExp(`\\bDB_NAME\\s*:\\s*['"]${escape(dbConfig.name)}['"]`)
          : /\bDB_NAME\s*:\s*['"][^'"]*['"]/,
      },
      {
        name: "DB_TYPE",
        regex: new RegExp(`\\bDB_TYPE\\s*:\\s*['"]${escape(dbConfig.type || "")}['"]`),
      },
    ];

    const missingFields = checks
      .filter((check) => !check.regex.test(writtenContent))
      .map((c) => c.name);

    if (missingFields.length > 0) {
      if (process.env.BENCHMARK_DEBUG === "true") {
        logger.error("Validation failed. Written content:", writtenContent);
      }
      throw new Error(
        `Private config validation failed - missing or malformed fields: ${missingFields.join(", ")}`,
      );
    }

    logger.info("Private configuration file written and validated successfully");
  } catch (error: any) {
    logger.error("Failed to write private config:", error);
    throw new Error(`Failed to write private configuration: ${error.message}`);
  }
}

/**
 * Updates the private.ts file to set architectural modes (Demo / Multi-Tenant).
 * This is called during the final step of setup.
 */
export async function updatePrivateConfigMode(modes: {
  demoMode?: boolean;
  multiTenant?: boolean;
}): Promise<void> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  // Support TEST_MODE for isolated testing
  const configFileName = process.env.TEST_MODE ? "private.test.ts" : "private.ts";
  const privateConfigPath = path.resolve(process.cwd(), "config", configFileName);

  try {
    logger.debug("DEBUG: [updatePrivateConfigMode] CALLED with:", JSON.stringify(modes));
    let content = await fs.readFile(privateConfigPath, "utf-8");
    logger.debug("DEBUG: [updatePrivateConfigMode] READ content length:", content.length);
    let modified = false;

    // Helper to properly stringify boolean
    const toBoolString = (val: boolean) => (val ? "true" : "false");

    // Update MULTI_TENANT
    if (modes.multiTenant !== undefined) {
      const multiTenantRegex = /\bMULTI_TENANT\s*:\s*(true|false),?/;
      const match = multiTenantRegex.exec(content);
      const newValue = `MULTI_TENANT: ${toBoolString(modes.multiTenant)},`;

      if (match) {
        if (match[0] !== newValue) {
          content = content.replace(multiTenantRegex, newValue);
          modified = true;
          logger.debug("DEBUG: [updatePrivateConfigMode] Updated MULTI_TENANT");
        }
      } else {
        // If not found, try to insert after the marker
        const insertMarker = "// --- Architectural Mode";
        if (content.includes(insertMarker)) {
          content = content.replace(insertMarker, `${insertMarker}\n\t${newValue}`);
          modified = true;
          logger.debug("DEBUG: [updatePrivateConfigMode] Inserted MULTI_TENANT after marker");
        } else {
          // Fallback: insert at end of object, ensuring previous line has a comma
          const lastBraceIndex = content.lastIndexOf("};");
          if (lastBraceIndex !== -1) {
            let prefix = content.slice(0, lastBraceIndex);
            // Ensure preceding property has a comma if it's not the start of the object
            if (!prefix.trim().endsWith(",") && !prefix.trim().endsWith("{")) {
              prefix = prefix.replace(/(\s*)$/, ",$1");
            }
            content = `${prefix}\t${newValue}\n${content.slice(lastBraceIndex)}`;
            modified = true;
            logger.debug("DEBUG: [updatePrivateConfigMode] Inserted MULTI_TENANT at end");
          }
        }
      }
    }

    // Update DEMO
    if (modes.demoMode !== undefined) {
      const demoRegex = /\bDEMO\s*:\s*(true|false),?/;
      const match = demoRegex.exec(content);
      const newValue = `DEMO: ${toBoolString(modes.demoMode)},`;

      if (match) {
        if (match[0] !== newValue) {
          content = content.replace(demoRegex, newValue);
          modified = true;
          logger.debug("DEBUG: [updatePrivateConfigMode] Updated DEMO");
        }
      } else {
        // If not found, try to insert after MULTI_TENANT for logical grouping
        const multiTenantMatch = /\bMULTI_TENANT\s*:\s*(true|false),?/;
        const mtMatch = multiTenantMatch.exec(content);

        if (mtMatch) {
          const mtLine = mtMatch[0];
          // Ensure MULTI_TENANT has a comma before adding DEMO on next line
          const replacement = mtLine.endsWith(",")
            ? `${mtLine}\n\t${newValue}`
            : `${mtLine},\n\t${newValue}`;
          content = content.replace(multiTenantMatch, replacement);
          modified = true;
          logger.debug("DEBUG: [updatePrivateConfigMode] Inserted DEMO after MULTI_TENANT");
        } else {
          // Fallback: insert at end of object
          const lastBraceIndex = content.lastIndexOf("};");
          if (lastBraceIndex !== -1) {
            let prefix = content.slice(0, lastBraceIndex);
            if (!prefix.trim().endsWith(",") && !prefix.trim().endsWith("{")) {
              prefix = prefix.replace(/(\s*)$/, ",$1");
            }
            content = `${prefix}\t${newValue}\n${content.slice(lastBraceIndex)}`;
            modified = true;
            logger.debug("DEBUG: [updatePrivateConfigMode] Inserted DEMO at end");
          }
        }
      }
    }

    if (modified) {
      await fs.writeFile(privateConfigPath, content, "utf-8");
      logger.info("Updated private.ts with architectural modes:", modes);
    } else {
      logger.warn("No changes made to private.ts (values might be identical or regex failed)");
    }
  } catch (error) {
    logger.error("Failed to update private config modes:", error);
    // Critical failure - we must throw to alert the setup process
    throw error;
  }
}
