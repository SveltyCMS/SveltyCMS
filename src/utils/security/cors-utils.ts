/**
 * @file src/utils/security/cors-utils.ts
 * @description Centralized CORS configuration utility.
 */

import { getPrivateSettingSync } from "@src/services/settings-service";

/**
 * Returns CORS headers if allowed, otherwise null.
 */
export function getCorsHeaders(
  origin: string | null,
  isApiRoute: boolean,
): Record<string, string> | null {
  const corsEnabled = getPrivateSettingSync("CORS_ENABLED") as boolean;
  if (!corsEnabled || !isApiRoute || !origin) return null;

  const allowedOriginsRaw = getPrivateSettingSync("CORS_ALLOWED_ORIGINS") as any;
  const allowedOrigins = Array.isArray(allowedOriginsRaw)
    ? allowedOriginsRaw
    : typeof allowedOriginsRaw === "string"
      ? allowedOriginsRaw.split(",").map((s: string) => s.trim())
      : [];

  if (
    Array.isArray(allowedOrigins) &&
    !allowedOrigins.includes(origin) &&
    !allowedOrigins.includes("*")
  )
    return null;

  const allowOrigin = allowedOrigins.includes(origin) ? origin : "*";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": (
      (getPrivateSettingSync("CORS_ALLOWED_METHODS") as string[]) || [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
      ]
    ).join(", "),
    "Access-Control-Allow-Headers": (
      (getPrivateSettingSync("CORS_ALLOWED_HEADERS") as string[]) || [
        "Content-Type",
        "Authorization",
      ]
    ).join(", "),
    "Access-Control-Max-Age": String((getPrivateSettingSync("CORS_MAX_AGE") as number) || 86400),
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, X-Total-Count",
  };

  if ((getPrivateSettingSync("CORS_ALLOW_CREDENTIALS") as boolean) && allowOrigin !== "*") {
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}
