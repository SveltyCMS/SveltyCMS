/**
 * @file src/utils/http-client.ts
 * @description Domain-free HTTP transport for the browser API: one fetch wrapper
 * with a standardized envelope, CSRF on mutations, and list normalisation.
 * Contains no collection/draft/revision logic, so consumers that only talk HTTP
 * do not depend on the collection client.
 *
 * ### Features:
 * - `fetchApi` — JSON parse + standardized `ApiResponse` shape
 * - **CSRF on all non-GET mutations** via `clientJsonHeaders` (cookie or explicit token)
 * - `credentials: include` for session cookies
 * - `unwrapList` — normalises the list envelopes the API actually returns
 */

import { logger } from "@utils/logger";
import { clientJsonHeaders } from "@utils/security/client-csrf";

// --- Type Definitions ---

/**
 * Standardized API Response structure.
 * Matches the shape returned by the server-side 'handleApiError'.
 */
export interface ApiResponse<T = unknown> {
  code?: string; // Error code (e.g., 'VALIDATION_ERROR', 'FORBIDDEN')
  data?: T;
  error?: string; // Alias for message (for backward compatibility)
  issues?: string[]; // Validation specific issues
  // Error fields
  message?: string; // Primary error message
  success: boolean;
}

/**
 * Normalizes a list payload from the envelopes the API actually returns:
 * `{ success, data: T[] }`, a bare array, or `{ success, data: { data: T[] } }`.
 * Returns `[]` for a failed response or an unrecognized shape.
 */
export function unwrapList<T>(result: ApiResponse<unknown>): T[] {
  if (!result.success) return [];
  const raw = result.data ?? result;
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

// --- Core API Functions ---

export type FetchApiOptions = RequestInit & {
  /** Optional CSRF override (defaults to cookie via clientJsonHeaders on mutations) */
  csrfToken?: string | null;
};

/**
 * Universal fetch wrapper that handles:
 * 1. JSON parsing
 * 2. HTTP Error status codes
 * 3. Unified Error Response extraction
 * 4. Network error catching
 * 5. **CSRF headers on POST/PUT/PATCH/DELETE** (Testing 2026 ADR)
 */
export async function fetchApi<T>(
  endpoint: string,
  options: FetchApiOptions = {},
): Promise<ApiResponse<T>> {
  const { csrfToken, headers: optionHeaders, ...rest } = options;
  const method = String(rest.method || "GET").toUpperCase();
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(method);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(isMutation ? clientJsonHeaders(csrfToken) : {}),
  };

  // Merge caller headers last so explicit X-CSRF-Token still wins
  if (optionHeaders) {
    const extra =
      optionHeaders instanceof Headers
        ? Object.fromEntries(optionHeaders.entries())
        : Array.isArray(optionHeaders)
          ? Object.fromEntries(optionHeaders)
          : (optionHeaders as Record<string, string>);
    Object.assign(headers, extra);
  }

  // Admin-UI write consumers read the returned document (`data._id`, the merged
  // row, batch counts), while the API's default is now a minimal status-only ack
  // (`Prefer: return=minimal`). Explicitly opt the UI back into the full
  // representation — unless the caller already chose a preference.
  if (isMutation) {
    let hasPrefer = headers.prefer !== undefined || headers.Prefer !== undefined;
    if (!hasPrefer) {
      for (const h in headers) {
        if (h.length === 6 && h.toLowerCase() === "prefer") {
          hasPrefer = true;
          break;
        }
      }
    }
    if (!hasPrefer) {
      headers.prefer = "return=representation";
    }
  }

  try {
    const response = await fetch(endpoint, {
      credentials: "include",
      ...rest,
      method: rest.method || "GET",
      headers,
    });

    // 1. Handle Successful Responses (2xx)
    if (response.ok) {
      // Handle 204 No Content
      if (response.status === 204) {
        return { success: true } as ApiResponse<T>;
      }

      // Attempt to parse JSON
      try {
        const data = await response.json();
        // Some endpoints might return { success: true, ... } or just data
        // We ensure the shape is consistent
        return { success: true, ...data };
      } catch {
        // Fallback if response is OK but not JSON (rare)
        logger.warn(`[API] Response OK but invalid JSON at ${endpoint}`);
        return { success: true } as ApiResponse<T>;
      }
    }

    // 2. Handle HTTP Error Responses (4xx, 5xx)
    let errorData: Partial<ApiResponse> = {};
    try {
      errorData = await response.json();
    } catch {
      // Fallback if JSON parsing fails (e.g., raw 500 HTML or network gateway error)
      errorData = {
        message: response.statusText || `HTTP Error ${response.status}`,
      };
    }

    // Log significant errors
    if (response.status >= 500) {
      logger.error(`[API Server Error] ${response.status} on ${endpoint}`, errorData);
    } else {
      // 4xx errors are warnings (validation, auth, etc.)
      logger.warn(`[API Client Fail] ${response.status} on ${endpoint}`, errorData);
    }

    // Return standardized error shape
    return {
      success: false,
      message: errorData.message || "An unknown error occurred",
      error: errorData.message || errorData.error || "An unknown error occurred", // Backward compat
      code: errorData.code || `HTTP_${response.status}`,
      issues: errorData.issues,
    };
  } catch (error) {
    // 3. Handle Network/Client Errors (Offline, DNS, etc)
    const err = error as Error;
    // 🛡️ Avoid logging raw Error objects (may contain PII/stack traces)
    logger.error(`[API Network Error] ${endpoint.split("?")[0]}`);
    return {
      success: false,
      message: err.message || "Network error occurred",
      error: err.message,
      code: "NETWORK_ERROR",
    };
  }
}
