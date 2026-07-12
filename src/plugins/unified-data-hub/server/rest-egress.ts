/**
 * @file src/plugins/unified-data-hub/server/rest-egress.ts
 * @description SSRF-safe outbound HTTP for REST federation connectors (read + write).
 *
 * Features:
 * - Host allowlist via buildRestUrl / parseAndValidateUrl
 * - Per-connector circuit breaker
 * - Auth forwarding (Bearer, Basic)
 * - Timeout and response size limits
 * - Optional Idempotency-Key on mutating requests
 */

import type { ConnectorRecord } from "../types";
import { FederationError } from "../types";
import {
  assertConnectorCircuitClosed,
  recordConnectorFailure,
  recordConnectorSuccess,
} from "./connector-circuit-breaker";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export type RestEgressMethod = "GET" | "HEAD" | "POST" | "PATCH" | "PUT" | "DELETE";

export function buildRestAuthHeaders(connector: ConnectorRecord): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const apiKey = connector.credentials?.apiKey as string | undefined;
  const username = connector.credentials?.username as string | undefined;
  const password = connector.credentials?.password as string | undefined;

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  } else if (username) {
    const secret = password ?? "";
    headers.Authorization = `Basic ${Buffer.from(`${username}:${secret}`).toString("base64")}`;
  }

  return headers;
}

export async function restEgressJson(args: {
  connector: ConnectorRecord;
  url: URL;
  method: RestEgressMethod;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<{ status: number; body: unknown }> {
  const connectorId = String(args.connector._id);
  assertConnectorCircuitClosed(connectorId);

  const headers = buildRestAuthHeaders(args.connector);
  if (args.idempotencyKey && args.method === "POST") {
    headers["Idempotency-Key"] = args.idempotencyKey;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const init: RequestInit = {
      method: args.method,
      headers,
      signal: controller.signal,
    };
    if (args.body !== undefined && args.method !== "GET" && args.method !== "HEAD") {
      init.body = JSON.stringify(args.body);
    }

    const response = await fetch(args.url.toString(), init);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_RESPONSE_BYTES) {
      recordConnectorFailure(connectorId);
      throw new FederationError("CONNECTOR_WRITE_FAILED", "Response too large", 502);
    }

    let body: unknown = null;
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      recordConnectorFailure(connectorId);
      throw new FederationError("CONNECTOR_WRITE_FAILED", "Response too large", 502);
    }
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!response.ok) {
      recordConnectorFailure(connectorId);
      const message =
        typeof body === "object" && body && "message" in body
          ? String((body as { message: unknown }).message)
          : `HTTP ${response.status}`;
      throw new FederationError(
        "CONNECTOR_WRITE_FAILED",
        message,
        response.status >= 400 && response.status < 500 ? response.status : 502,
      );
    }

    recordConnectorSuccess(connectorId);
    return { status: response.status, body };
  } catch (err) {
    if (!(err instanceof FederationError)) {
      recordConnectorFailure(connectorId);
    } else if (err.code !== "CONNECTOR_WRITE_FAILED") {
      recordConnectorFailure(connectorId);
    }
    if (err instanceof FederationError) throw err;
    throw new FederationError(
      "CONNECTOR_WRITE_FAILED",
      err instanceof Error ? err.message : String(err),
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}
