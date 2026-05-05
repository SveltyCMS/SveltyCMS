/**
 * @file src/databases/auth/saml-auth.ts
 * @description Core SAML 2.0 / Enterprise SSO Integration using @boxyhq/saml-jackson.
 *
 * Features:
 * - Dynamic Jackson initialization mapping DB connection from SveltyCMS configs.
 * - IdP Connection Management.
 * - SSO Authentication logic (ACS parsing).
 * - JIT provisioning configuration handling.
 */

import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { logger } from "@utils/logger";
import jackson from "@boxyhq/saml-jackson";
import { dbAdapter } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";
import { json } from "@sveltejs/kit";
import { dateToISODateString } from "@utils/date";

// Use any for Jackson instance to avoid version-specific type mismatches in build environments
let jacksonInstance: any = null;
let connectionPromise: Promise<any> | null = null;

/**
 * Dynamically initializes the Jackson instance based on SveltyCMS database configuration.
 */
export async function getJackson() {
  if (jacksonInstance) return jacksonInstance;
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    try {
      const dbConnection = getJacksonDBConnection();
      const samlConfig = {
        externalUrl: getPrivateSettingSync("HOST_PROD") || "http://localhost:5173",
        samlAudience: "sveltycms",
        samlPath: "/api/auth/saml/acs",
        db: {
          engine: getJacksonEngine(),
          url: dbConnection,
          type: getJacksonDBType(),
        },
      };

      jacksonInstance = await jackson(samlConfig as any);
      return jacksonInstance;
    } catch (err) {
      logger.error("Failed to initialize SAML Jackson", err);
      connectionPromise = null;
      throw err;
    }
  })();

  return connectionPromise;
}

function getJacksonDBType(): string {
  const type = getPrivateSettingSync("DB_TYPE") || "mongodb";
  if (type.startsWith("mongodb")) return "mongodb";
  if (type === "postgresql") return "postgres";
  if (type === "mariadb") return "mysql";
  return type;
}

function getJacksonEngine(): "mongodb" | "sql" {
  const type = getJacksonDBType();
  return type === "mongodb" ? "mongodb" : "sql";
}

function getJacksonDBConnection(): string {
  const config = getPrivateSettingSync("DB_TYPE")
    ? {
        DB_TYPE: getPrivateSettingSync("DB_TYPE"),
        DB_USER: getPrivateSettingSync("DB_USER"),
        DB_PASSWORD: getPrivateSettingSync("DB_PASSWORD"),
        DB_HOST: getPrivateSettingSync("DB_HOST"),
        DB_PORT: getPrivateSettingSync("DB_PORT"),
        DB_NAME: getPrivateSettingSync("DB_NAME"),
      }
    : null;

  if (!config) return "";

  const { DB_TYPE, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME } = config;
  const authPart = DB_USER ? `${DB_USER}:${DB_PASSWORD}@` : "";

  switch (DB_TYPE) {
    case "mongodb":
    case "mongodb+srv": {
      const protocol = DB_TYPE === "mongodb" ? "mongodb" : "mongodb+srv";
      return `${protocol}://${authPart}${DB_HOST}${DB_PORT ? `:${DB_PORT}` : ""}/${DB_NAME}`;
    }
    case "postgresql":
      return `postgres://${authPart}${DB_HOST}:${DB_PORT || 5432}/${DB_NAME}`;
    case "mariadb":
      return `mysql://${authPart}${DB_HOST}:${DB_PORT || 3306}/${DB_NAME}`;
    case "sqlite":
      return `sqlite://config/database/${DB_NAME}.sqlite`;
    default:
      return "";
  }
}

/**
 * Logic for processing SAML Authentication Result and JIT Provisioning.
 */
export async function processSAMLResponse(samlResponse: string, relayState: string) {
  const api = await getJackson();
  const { profile } = await api.saml.parseSAMLResponse({
    samlResponse,
    relayState,
  });

  if (!profile || !profile.email) {
    throw new Error("Invalid SAML profile or missing email");
  }

  // JIT Provisioning
  // 1. Find user by email
  const authAdapter = dbAdapter!.auth;
  const findResult = await authAdapter.getUserByEmail({ email: profile.email, tenantId: null });

  let user = findResult.success ? findResult.data : null;

  if (!user && getPrivateSettingSync("SAML_JIT_PROVISIONING")) {
    // Create new user via JIT
    const newUserResult = await authAdapter.createUser({
      email: profile.email,
      username: profile.email.split("@")[0],
      firstName: (profile as any).firstName || "",
      lastName: (profile as any).lastName || "",
      role: "user",
      lastAuthMethod: "saml",
    });

    if (!newUserResult.success) throw new Error("Failed to provision SAML user");
    user = newUserResult.data;
  }

  if (!user) {
    throw new Error("Access denied: User not found and JIT provisioning disabled.");
  }

  // 2. Create Session
  const sessionResult = await authAdapter.createSession({
    user_id: user._id as DatabaseId,
    expires: dateToISODateString(new Date(Date.now() + 1000 * 60 * 60 * 24)), // 24hr
  });

  if (!sessionResult.success) throw new Error("Failed to create SSO session");

  return { user, session: sessionResult.data };
}

/**
 * ACS Endpoint Handler for SAML
 */
export async function handleSAMLACS(request: Request) {
  const formData = await request.formData();
  const SAMLResponse = formData.get("SAMLResponse") as string;
  const RelayState = formData.get("RelayState") as string;

  try {
    const { user, session } = await processSAMLResponse(SAMLResponse, RelayState);

    // Set Session Cookie
    const response = json({ success: true, user });
    response.headers.append(
      "Set-Cookie",
      `auth_session=${session._id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
    );

    return response;
  } catch (err: any) {
    logger.error("SAML Authentication Failed", err);
    return json({ success: false, message: err.message }, { status: 401 });
  }
}

/**
 * Public wrapper for ACS Handler (Expected by router)
 */
export async function handleSAMLResponse(event: any) {
  return handleSAMLACS(event.request);
}

/**
 * Public wrapper for Auth URL Generation (Expected by router)
 */
export async function generateSAMLAuthUrl(tenant?: string | null, product?: string | null) {
  const api = await getJackson();
  // Standard Jackson API uses oauthController.authorize
  const result = await api.oauthController.authorize({
    tenant: tenant || "sveltycms",
    product: product || "sveltycms",
    redirect_uri: "/api/auth/saml/callback",
    state: "default",
  });
  return result.redirect_url || result.authorizeUrl;
}

/**
 * Public wrapper for SAML Connection creation (Expected by router)
 */
export async function createSAMLConnection(params: any) {
  const api = await getJackson();
  // Standard Jackson API uses connectionAPIController.createSAMLConnection
  return api.connectionAPIController.createSAMLConnection(params);
}
