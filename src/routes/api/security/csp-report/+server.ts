import { metricsService } from "@src/services/metrics-service";
import { json, type RequestHandler } from "@sveltejs/kit";
import { dev } from "$app/environment";
// Unified Error Handling
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";
import { requireTenantContext } from "@utils/tenant-utils";

// --- TYPES ---

interface CSPViolationReport {
  "blocked-uri": string;
  "column-number": number;
  disposition: "enforce" | "report";
  "document-uri": string;
  "effective-directive": string;
  "line-number": number;
  "original-policy": string;
  referrer: string;
  "script-sample": string;
  "source-file": string;
  "status-code": number;
  "violated-directive": string;
}

interface CSPReportPayload {
  "csp-report": CSPViolationReport;
}

// --- VALIDATION ---

/**
 * Validates that the incoming report has the expected CSP format.
 */
function isValidCSPReport(data: unknown): data is CSPReportPayload {
  if (!data || typeof data !== "object") {
    return false;
  }

  const report = (data as CSPReportPayload)["csp-report"];
  if (!report || typeof report !== "object") {
    return false;
  }

  // Check for required fields
  return (
    typeof report["document-uri"] === "string" &&
    typeof report["violated-directive"] === "string" &&
    typeof report["original-policy"] === "string"
  );
}

/**
 * Checks if a CSP violation should be ignored (common false positives).
 */
function shouldIgnoreViolation(report: CSPViolationReport): boolean {
  const blockedUri = report["blocked-uri"] || "";
  const violatedDirective = report["violated-directive"] || "";

  // Ignore browser extensions
  if (
    blockedUri.startsWith("chrome-extension://") ||
    blockedUri.startsWith("moz-extension://") ||
    blockedUri.startsWith("safari-web-extension://")
  ) {
    return true;
  }

  // Ignore data URLs for images (commonly used legitimately)
  if (blockedUri.startsWith("data:") && violatedDirective.includes("img-src")) {
    return true;
  }

  return false;
}

// --- HANDLERS ---

/**
 * Handles CSP violation reports sent by browsers.
 */
export const POST = apiHandler(async ({ request, getClientAddress, locals }) => {
  // Parse the violation report
  const contentType = request.headers.get("content-type") || "";
  let reportData: unknown;

  // Handle standard CSP report format or newer Reporting API format
  try {
    if (contentType.includes("application/csp-report")) {
      reportData = await request.json();
    } else if (contentType.includes("application/reports+json")) {
      const reports = await request.json();
      if (Array.isArray(reports) && reports.length > 0) {
        reportData = { "csp-report": reports[0].body };
      }
    } else {
      logger.warn(`CSP report with unexpected content-type: ${contentType}`);
      throw new AppError("Invalid content type", 400, "INVALID_CONTENT_TYPE");
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.warn("Malformed JSON received at CSP report endpoint", { error });
    throw new AppError("Malformed JSON payload", 400, "MALFORMED_JSON");
  }

  // Validate report format
  if (!isValidCSPReport(reportData)) {
    logger.warn("Invalid CSP report format received", { data: reportData });
    throw new AppError("Invalid report format", 400, "INVALID_REPORT_FORMAT");
  }

  const report = reportData["csp-report"];

  // Resolve tenantId using shared utility
  const tenantId = requireTenantContext(locals, "CSP report processing");

  // Check if this violation should be ignored
  if (shouldIgnoreViolation(report)) {
    logger.trace(
      `Ignoring CSP violation: ${report["violated-directive"]} - ${report["blocked-uri"]}`,
    );
    return json({ status: "ignored" });
  }

  const clientIp = getClientAddress();

  // Log the violation for analysis
  const logLevel = dev ? "debug" : "warn";
  logger[logLevel]("CSP Violation Report", {
    documentUri: report["document-uri"],
    violatedDirective: report["violated-directive"],
    effectiveDirective: report["effective-directive"],
    blockedUri: report["blocked-uri"],
    sourceFile: report["source-file"],
    lineNumber: report["line-number"],
    columnNumber: report["column-number"],
    scriptSample: report["script-sample"]?.substring(0, 100), // Truncate for logging
    disposition: report.disposition,
    clientIp,
    tenantId,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  // Track violation metrics
  metricsService.incrementCSPViolations(tenantId ?? undefined);

  // Production-only security checks
  if (!dev) {
    const suspiciousPatterns = [
      /javascript:/i,
      /<script/i,
      /eval\(/i,
      /setTimeout\(/i,
      /setInterval\(/i,
    ];
    const blockedContent = report["script-sample"] || report["blocked-uri"] || "";
    const isSuspicious = suspiciousPatterns.some((pattern) => pattern.test(blockedContent));

    if (isSuspicious) {
      logger.error("Suspicious CSP violation detected - potential XSS attempt", {
        blockedUri: report["blocked-uri"],
        scriptSample: report["script-sample"],
        documentUri: report["document-uri"],
        clientIp,
        tenantId,
        userAgent: request.headers.get("user-agent") ?? undefined,
      });
    }
  }

  return json({ status: "received" });
});

/**
 * Handle OPTIONS requests for CORS preflight.
 */
export const OPTIONS: RequestHandler = async () => {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
};
