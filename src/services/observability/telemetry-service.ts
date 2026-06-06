/*
 * @file src/services/telemetry-service.ts
 * @description Telemetry Service for SveltyCMS.
 *
 * ### Features
 * - Update Checks
 * - Admin/Guest Access
 * - Forward to telemetry.sveltycms.com
 *
 * ### Security
 * - Fail silently - telemetry should never break the app
 * - Uses Hashed Secret for Unique ID (Never sends raw secret)
 */

import { createHash } from "node:crypto";
import os from "node:os";
import { getPrivateEnv } from "@src/databases/db";
import { getPrivateSetting } from "@src/services/core/settings-service";
import { getWidgetsByType } from "@src/widgets/proxy";
import { logger } from "@utils/logger";
import { building, dev } from "$app/environment";
import pkg from "../../../package.json";

// In-memory cache for update checks, backed by globalThis to survive HMR in dev
const globalWithCache = globalThis as typeof globalThis & {
  __SVELTY_TELEMETRY_CACHE__?: unknown;
  __SVELTY_TELEMETRY_LAST_CHECK__?: number;
};

const CHECK_INTERVAL = 1000 * 60 * 60 * 12; // 12 hours

/**
 * Telemetry and Update Service (Singleton)
 */
export class TelemetryService {
  private cachedUpdateInfo: unknown = globalWithCache.__SVELTY_TELEMETRY_CACHE__ || null;
  private lastCheckTime = globalWithCache.__SVELTY_TELEMETRY_LAST_CHECK__ || 0;
  private activeCheckPromise: Promise<unknown> | null = null; // Deduping promise

  constructor() {}

  public async checkUpdateStatus() {
    // Disable telemetry strictly in test mode or CI/CD
    const isTestOrCI =
      typeof globalThis !== "undefined" &&
      ((globalThis as any).process?.env?.TEST_MODE === "true" ||
        (globalThis as any).process?.env?.CI === "true" ||
        (globalThis as any).process?.env?.VITEST === "true" ||
        (globalThis as any).process?.env?.NODE_ENV === "test" ||
        process.env.BUN_TEST === "true");

    if (isTestOrCI) {
      return { status: "test_mode", latest: null, security_issue: false };
    }

    if (building) {
      return { status: "building", latest: null, security_issue: false };
    }

    // Check opt-out settings
    let isTelemetryEnabled = true;
    try {
      const setting = await getPrivateSetting("SVELTYCMS_TELEMETRY");
      if ((setting as any) === false || (setting as any) === "false") {
        isTelemetryEnabled = false;
      }
    } catch (err) {
      logger.debug("[Telemetry] Could not check opt-out setting, defaulting to enabled", err);
    }

    if (!isTelemetryEnabled) {
      logger.info("📡 Telemetry is disabled by configuration.");
      return { status: "disabled", latest: null, security_issue: false };
    }

    const now = Date.now();
    if (this.cachedUpdateInfo && now - this.lastCheckTime < CHECK_INTERVAL && !dev) {
      return this.cachedUpdateInfo;
    }

    // Return existing promise if a check is already running (deduplication)
    if (this.activeCheckPromise) {
      logger.debug("[Telemetry] Reusing active check promise");
      return this.activeCheckPromise;
    }

    logger.debug("📡 Starting Telemetry check (Background)...");

    // Start the check in a truly non-blocking way
    this.activeCheckPromise = (async () => {
      try {
        // 1. Calculate Installation ID (Specific to this config/secret)
        const jwtSecret = (await getPrivateSetting("JWT_SECRET_KEY")) || "fallback_secret";
        const installationId = createHash("sha256").update(jwtSecret).digest("hex");

        // 2. Calculate Stable Machine ID (Survives fresh installs/config deletion)
        const stableTraits = `${os.type()}-${os.arch()}-${os.totalmem()}-${os.cpus().length}-${os.cpus()[0]?.model || "unknown"}`;
        const stableId = createHash("sha256").update(stableTraits).digest("hex");

        // Real widget detection (Custom Only)
        let widgets: string[] = [];
        try {
          widgets = getWidgetsByType("custom");
        } catch (err) {
          logger.debug("[Telemetry] Failed to collect widget info:", err);
        }

        // Use direct env access for infrastructure config
        const privateEnv = getPrivateEnv();
        const dbType = privateEnv?.DB_TYPE || (await getPrivateSetting("DB_TYPE")) || "unknown";

        // Collect geolocation data
        let location = {
          country: undefined as string | undefined,
          country_code: undefined as string | undefined,
          region: undefined as string | undefined,
          city: undefined as string | undefined,
          latitude: undefined as number | undefined,
          longitude: undefined as number | undefined,
          isp: undefined as string | undefined,
          org: undefined as string | undefined,
        };

        try {
          const geoRes = await fetch(
            "http://ip-api.com/json/?fields=status,country,countryCode,region,regionName,city,lat,lon,isp,org",
            {
              headers: { "User-Agent": `SveltyCMS/${pkg.version}` },
              signal: AbortSignal.timeout(5000),
            },
          );

          if (geoRes.ok) {
            const geoData = await geoRes.json();
            if (geoData.status === "success") {
              location = {
                country: geoData.country,
                country_code: geoData.countryCode,
                region: geoData.regionName || geoData.region,
                city: geoData.city,
                latitude: geoData.lat,
                longitude: geoData.lon,
                isp: geoData.isp,
                org: geoData.org,
              };
            }
          }
        } catch (e) {
          logger.debug("[Telemetry] Could not resolve location:", e);
        }

        // Metrics
        let userCount = 0;
        let collectionCount = 0;
        let roleCount = 0;

        try {
          const { dbAdapter } = await import("@src/databases/db");

          if (!dbAdapter) {
            logger.debug("[Telemetry] Skipped: Database adapter not available");
            return {
              status: "error",
              latest: pkg.version,
              security_issue: false,
            };
          }

          if (typeof dbAdapter.isConnected === "function" && !dbAdapter.isConnected()) {
            logger.debug("[Telemetry] Skipped: DB not connected yet");
            return {
              status: "error",
              latest: pkg.version,
              security_issue: false,
            };
          }

          if (dbAdapter.ensureMonitoring) {
            await dbAdapter.ensureMonitoring().catch(() => {
              logger.debug("Monitoring ensure failed silently");
            });
          }

          if (dbAdapter.ensureAuth) {
            try {
              await dbAdapter.ensureAuth();
            } catch {
              logger.debug("[Telemetry] Auth module not ready yet, skipping metrics");
            }
          }

          if (dbAdapter.auth) {
            const userCountResult = await dbAdapter.auth.getUserCount(undefined, {
              bypassTenantCheck: true,
            });
            if (userCountResult.success) {
              userCount = userCountResult.data;
            }
            roleCount = (
              await dbAdapter.auth.getAllRoles({
                bypassTenantCheck: true,
              })
            ).length;
          }

          const { contentSystem } = await import("@src/content/index.server");

          if (dbAdapter.ensureContent) {
            try {
              await dbAdapter.ensureContent();
            } catch {
              logger.debug("[Telemetry] Content module not ready yet, skipping collection count");
            }
          }

          if (contentSystem.isInitialized) {
            const collections = await contentSystem.getCollections();
            collectionCount = collections.length;
          }
        } catch (err) {
          logger.debug("[Telemetry] Metrics collection failed:", err);
        }

        // System Info
        const cpus = os.cpus();
        const systemInfo = {
          cpu_count: cpus.length,
          cpu_model: cpus.length > 0 ? cpus[0].model : "unknown",
          total_memory_gb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
          os_type: os.type(),
          os_release: os.release(),
          os_arch: os.arch(),
        };

        const nodeVersion =
          typeof globalThis !== "undefined"
            ? (globalThis as any).process?.version || "unknown"
            : "browser";
        const environment =
          typeof globalThis !== "undefined"
            ? (globalThis as any).process?.env?.NODE_ENV || (dev ? "development" : "production")
            : dev
              ? "development"
              : "production";
        const timestamp = Date.now();

        let clientSecret = await getPrivateSetting("TELEMETRY_CLIENT_SECRET");

        if (!clientSecret) {
          logger.info("📡 Telemetry: No secret found. Registering installation...");
          const registrationSecret = await this.register(installationId);
          if (registrationSecret) {
            clientSecret = registrationSecret;
          } else {
            logger.warn("📡 Telemetry: Registration failed. Using fallback signature.");
          }
        }

        const TELEMETRY_SALT = clientSecret || "sveltycms-telemetry";

        const cryptoSignature = (await import("node:crypto"))
          .createHmac("sha256", TELEMETRY_SALT)
          .update(`${installationId}:${pkg.version}:${timestamp}`)
          .digest("hex");

        const payload = {
          current_version: pkg.version,
          node_version: nodeVersion,
          environment,
          os: os.type(),
          installation_id: installationId,
          timestamp,
          signature: cryptoSignature,
          is_ephemeral: environment === "development" || environment === "test",
          stable_id: stableId,
          db_type: dbType,
          location: Object.values(location).some((v) => v !== undefined) ? location : undefined,
          usage_metrics: {
            users: userCount,
            collections: collectionCount,
            roles: roleCount,
          },
          system_info: systemInfo,
          widgets,
        };

        const telemetryEndpoint =
          process.env.TELEMETRY_ENDPOINT || "https://telemetry.sveltycms.com/api/check-update";

        const response = await fetch(telemetryEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "SveltyCMS-Telemetry/1.0",
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10_000),
        });

        if (response.status === 429) {
          this.cachedUpdateInfo = {
            status: "rate_limited",
            latest: pkg.version,
            security_issue: false,
          };
        } else if (response.ok) {
          const data = await response.json();
          this.cachedUpdateInfo = {
            status: "active",
            latest: data.latest_version,
            security_issue: data.has_vulnerability,
            message: data.message,
            telemetry_id: data.telemetry_id,
          };
        } else {
          throw new Error(`Update server unreachable: ${response.status}`);
        }

        this.lastCheckTime = Date.now();
        globalWithCache.__SVELTY_TELEMETRY_CACHE__ = this.cachedUpdateInfo;
        globalWithCache.__SVELTY_TELEMETRY_LAST_CHECK__ = this.lastCheckTime;

        return this.cachedUpdateInfo;
      } catch (err: any) {
        logger.warn("[Telemetry] Check failed:", err.message);
        this.lastCheckTime = Date.now();
        this.cachedUpdateInfo = {
          status: "error",
          latest: pkg.version,
          security_issue: false,
        };
        globalWithCache.__SVELTY_TELEMETRY_CACHE__ = this.cachedUpdateInfo;
        globalWithCache.__SVELTY_TELEMETRY_LAST_CHECK__ = this.lastCheckTime;
        return this.cachedUpdateInfo;
      } finally {
        this.activeCheckPromise = null;
      }
    })();

    return this.activeCheckPromise;
  }

  async register(installationId: string): Promise<string | null> {
    try {
      const registrationUrl =
        process.env.TELEMETRY_REGISTRATION_URL || "https://telemetry.sveltycms.com/api/register";

      const response = await fetch(registrationUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installation_id: installationId }),
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const { secret } = await response.json();
        if (secret) {
          const { setPrivateSetting } = await import("@src/services/core/settings-service");
          await setPrivateSetting("TELEMETRY_CLIENT_SECRET", secret);
          return secret;
        }
      }
      return null;
    } catch (err) {
      logger.debug("[Telemetry] Registration handshake failed:", err);
      return null;
    }
  }
}

export const telemetryService = new TelemetryService();
