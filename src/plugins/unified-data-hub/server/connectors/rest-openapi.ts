/**
 * @file src/plugins/unified-data-hub/server/connectors/rest-openapi.ts
 * @description REST/OpenAPI connector for Unified Data Hub (read + opt-in writes).
 *
 * Features:
 * - SSRF-safe host allowlist
 * - Timeout and response size limits
 * - WordPress/Drupal JSON API path support
 * - v1.5 filter param pushdown (WordPress slug/status/search)
 * - Per-connector circuit breaker
 * - Opt-in writes (config.writesEnabled) with Idempotency-Key on POST
 */

import { FederationError } from "../../types";
import type { ConnectorRecord, FederatedRow } from "../../types";
import { generateUUID } from "@utils/native-utils";
import {
  assertConnectorCircuitClosed,
  recordConnectorFailure,
  recordConnectorSuccess,
} from "../connector-circuit-breaker";
import type { NormalizedFilter } from "../query-planner";
import { restEgressJson } from "../rest-egress";
import {
  buildRestCollectionUrl,
  buildRestEntryUrl,
  extractRestWriteItem,
  mapRestItemToFields,
  mapVirtualWriteBody,
  parseEntrySourceKey,
} from "../rest-write-utils";
import { applyInFilters } from "../in-filter-utils";
import { buildRestUrl } from "../ssrf";
import { BaseConnector, type ConnectorReadContext, type ConnectorWriteContext } from "./base";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export class RestOpenApiConnector extends BaseConnector {
  readonly type = "rest" as const;

  getDefaultCapabilities() {
    return {
      filterPushdown: false,
      sortPushdown: false,
      joinable: false as const,
      maxPageSize: 100,
      supportsTransactions: false,
      staleness: "cache" as const,
      ttlSeconds: 300,
      writable: false,
    };
  }

  async executeRead(ctx: ConnectorReadContext) {
    const { connector, collection, request, restQueryParams, clientFilters } = ctx;
    const connectorId = String(connector._id);
    assertConnectorCircuitClosed(connectorId);

    const baseUrl = (connector.config.baseUrl as string) || "";
    const endpoint = collection.source.endpoint || `/`;
    const allowedHosts = connector.allowedHosts ?? [];

    if (!baseUrl) {
      throw new FederationError("CONNECTOR_QUERY_FAILED", "REST connector missing baseUrl", 500);
    }

    const limit = Math.min(
      Math.max(1, request.limit ?? 25),
      connector.capabilities.maxPageSize ?? 100,
    );
    const offset = Math.max(0, request.offset ?? 0);

    const url = buildRestUrl(baseUrl, endpoint, allowedHosts);
    url.searchParams.set("per_page", String(limit));
    url.searchParams.set("page", String(Math.floor(offset / limit) + 1));

    if (restQueryParams) {
      for (const [key, value] of Object.entries(restQueryParams)) {
        if (value) url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    const apiKey = connector.credentials?.apiKey as string | undefined;
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        recordConnectorFailure(connectorId);
        throw new FederationError(
          "CONNECTOR_QUERY_FAILED",
          `REST connector returned HTTP ${response.status}`,
          502,
        );
      }

      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > MAX_RESPONSE_BYTES) {
        recordConnectorFailure(connectorId);
        throw new FederationError("CONNECTOR_QUERY_FAILED", "Response too large", 502);
      }

      const body = await response.json();
      let items = extractItems(body);
      if (request.filter) {
        items = applyInFilters(items, request.filter);
      }
      items = applyClientFilters(items, clientFilters);
      const sliced = items.slice(0, limit);

      let rows = sliced.map((item: Record<string, unknown>, index: number) => {
        const sourceKey = String(item.id ?? item._id ?? item.slug ?? offset + index);
        const mapped: Record<string, unknown> = {};
        for (const field of collection.fields) {
          mapped[field.name] = item[field.sourceField] ?? item[field.name];
        }
        return this.buildRow(connector._id, sourceKey, mapped);
      });

      rows = applyClientSort(rows, request.sort);

      recordConnectorSuccess(connectorId);
      return { rows, total: items.length };
    } catch (err) {
      if (!(err instanceof FederationError)) {
        recordConnectorFailure(connectorId);
      } else if (err.code === "CONNECTOR_QUERY_FAILED") {
        // already recorded above
      } else {
        recordConnectorFailure(connectorId);
      }
      if (err instanceof FederationError) throw err;
      throw new FederationError(
        "CONNECTOR_QUERY_FAILED",
        err instanceof Error ? err.message : String(err),
        502,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  protected async executeCreate(ctx: ConnectorWriteContext): Promise<FederatedRow> {
    const { connector, collection, data } = ctx;
    if (!data || Object.keys(data).length === 0) {
      throw new FederationError("CONNECTOR_WRITE_FAILED", "Create payload required", 400);
    }

    const baseUrl = (connector.config.baseUrl as string) || "";
    const endpoint = collection.source.endpoint || "/";
    const allowedHosts = connector.allowedHosts ?? [];
    if (!baseUrl) {
      throw new FederationError("CONNECTOR_QUERY_FAILED", "REST connector missing baseUrl", 500);
    }

    const url = buildRestCollectionUrl(baseUrl, endpoint, allowedHosts);
    const body = mapVirtualWriteBody(collection, data);
    const { body: responseBody } = await restEgressJson({
      connector,
      url,
      method: "POST",
      body,
      idempotencyKey: generateUUID(),
    });

    const item = extractRestWriteItem(responseBody);
    if (!item) {
      throw new FederationError("CONNECTOR_WRITE_FAILED", "Empty create response", 502);
    }
    const sourceKey = String(item.id ?? item._id ?? item.slug ?? "new");
    return this.buildRow(connector._id, sourceKey, mapRestItemToFields(item, collection));
  }

  protected async executeUpdate(ctx: ConnectorWriteContext): Promise<FederatedRow> {
    const { connector, collection, data, entryId } = ctx;
    if (!entryId) throw new FederationError("CONNECTOR_WRITE_FAILED", "entryId required", 400);
    if (!data || Object.keys(data).length === 0) {
      throw new FederationError("CONNECTOR_WRITE_FAILED", "Update payload required", 400);
    }

    const baseUrl = (connector.config.baseUrl as string) || "";
    const endpoint = collection.source.endpoint || "/";
    const allowedHosts = connector.allowedHosts ?? [];
    if (!baseUrl) {
      throw new FederationError("CONNECTOR_QUERY_FAILED", "REST connector missing baseUrl", 500);
    }

    const sourceKey = parseEntrySourceKey(entryId, String(connector._id));
    const url = buildRestEntryUrl(baseUrl, endpoint, sourceKey, allowedHosts);
    const body = mapVirtualWriteBody(collection, data);
    const updateMethod =
      (connector.config.writeMethod as string) === "put" ? ("PUT" as const) : ("PATCH" as const);

    const { body: responseBody } = await restEgressJson({
      connector,
      url,
      method: updateMethod,
      body,
    });

    const item = extractRestWriteItem(responseBody);
    if (!item) {
      throw new FederationError("VIRTUAL_ENTRY_NOT_FOUND", `Entry not found: ${entryId}`, 404);
    }
    const resolvedKey = String(item.id ?? item._id ?? sourceKey);
    return this.buildRow(connector._id, resolvedKey, mapRestItemToFields(item, collection));
  }

  protected async executeDelete(ctx: ConnectorWriteContext): Promise<void> {
    const { connector, collection, entryId } = ctx;
    if (!entryId) throw new FederationError("CONNECTOR_WRITE_FAILED", "entryId required", 400);

    const baseUrl = (connector.config.baseUrl as string) || "";
    const endpoint = collection.source.endpoint || "/";
    const allowedHosts = connector.allowedHosts ?? [];
    if (!baseUrl) {
      throw new FederationError("CONNECTOR_QUERY_FAILED", "REST connector missing baseUrl", 500);
    }

    const sourceKey = parseEntrySourceKey(entryId, String(connector._id));
    const url = buildRestEntryUrl(baseUrl, endpoint, sourceKey, allowedHosts);
    await restEgressJson({ connector, url, method: "DELETE" });
  }

  async healthCheck(connector: ConnectorRecord) {
    const baseUrl = (connector.config.baseUrl as string) || "";
    const allowedHosts = connector.allowedHosts ?? [];
    if (!baseUrl) return { health: "down" as const, message: "Missing baseUrl" };

    const connectorId = String(connector._id);
    assertConnectorCircuitClosed(connectorId);

    try {
      const url = buildRestUrl(baseUrl, "/", allowedHosts);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url.toString(), { method: "HEAD", signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        recordConnectorSuccess(connectorId);
        return { health: "ok" as const };
      }
      recordConnectorFailure(connectorId);
      return { health: "degraded" as const, message: `HTTP ${res.status}` };
    } catch (err) {
      recordConnectorFailure(connectorId);
      return {
        health: "down" as const,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

function applyClientSort(
  rows: FederatedRow[],
  sort?: { field: string; direction: "asc" | "desc" },
): FederatedRow[] {
  if (!sort?.field) return rows;
  const dir = sort.direction === "desc" ? -1 : 1;
  const field = sort.field;
  return [...rows].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av === bv) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return av < bv ? -dir : dir;
  });
}

function applyClientFilters(
  items: Record<string, unknown>[],
  filters?: NormalizedFilter[],
): Record<string, unknown>[] {
  if (!filters?.length) return items;
  return items.filter((item) =>
    filters.every((f) => {
      const actual = item[f.sourceField] ?? item[f.field];
      return String(actual ?? "") === String(f.value ?? "");
    }),
  );
}

function extractItems(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data as Record<string, unknown>[];
    if (Array.isArray(obj.items)) return obj.items as Record<string, unknown>[];
    if (Array.isArray(obj.results)) return obj.results as Record<string, unknown>[];
  }
  return [];
}
