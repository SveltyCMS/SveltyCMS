/**
 * @file src/utils/error-display.ts
 * @description Pure copy resolution for the admin `(app)` error boundary.
 *
 * Centralises the status → title/summary ladder so it can be unit-tested without
 * a component render, and so an HTTP-level regression (e.g. a 5xx that claims the
 * page "doesn't exist or has been moved") is caught by a test instead of review.
 *
 * ### Features:
 * - 404-only "page moved" helper line (never shown for 4xx/5xx that are not 404)
 * - database / setup / rate-limit specific copy kept from the previous inline logic
 * - safe fallbacks when the server message is stripped in production
 */

import {
  db_error_description,
  db_error_title,
  error_pagenotfound,
  error_wrong,
} from "@src/paraglide/messages";

export interface ErrorDisplayCopy {
  title: string;
  summary: string;
  /** Helper line "The page you're looking for doesn't exist or has been moved." */
  showPageMoved: boolean;
}

/**
 * Resolves the user-facing copy for an HTTP status shown inside the admin shell.
 *
 * @param status HTTP status (defaults to 500 when unknown)
 * @param errorMessage Server-provided message (SvelteKit strips 5xx messages in production)
 */
export function resolveErrorDisplay(status: number, errorMessage?: string): ErrorDisplayCopy {
  const message = (errorMessage || "").toLowerCase();

  const isDatabaseError =
    status === 503 &&
    (message.includes("database") ||
      message.includes("connection") ||
      message.includes("failed to initialize"));
  const isSetupMode = status === 503 && message.includes("setup");
  const isRateLimited = status === 429;

  const title = isDatabaseError
    ? db_error_title()
    : status === 404
      ? error_pagenotfound()
      : status === 403
        ? "Access Denied"
        : status === 401
          ? "Unauthorized"
          : isRateLimited
            ? "Too Many Requests"
            : "System Error";

  const summary = isDatabaseError
    ? db_error_description()
    : isSetupMode
      ? "System in Setup Mode"
      : status === 404
        ? error_pagenotfound()
        : status === 403
          ? errorMessage || "You do not have permission to access this resource (Forbidden)."
          : status === 401
            ? errorMessage || "Authentication is required to access this resource (Unauthorized)."
            : isRateLimited
              ? "Slow down — you're sending requests too quickly. Please wait and try again."
              : errorMessage || error_wrong();

  return {
    title,
    summary,
    // A 500 is not a moved page — claiming so sends users looking for a renamed
    // URL instead of retrying/reporting the failure.
    showPageMoved: status === 404,
  };
}
