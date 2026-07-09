/**
 * @file src/plugins/unified-data-hub/server/connectors/base.ts
 * @description Base connector interface for Unified Data Hub federation.
 *
 * Features:
 * - Read-only execute contract
 * - Capability declaration
 * - Health check hook
 */

import type {
  ConnectorCapabilities,
  ConnectorHealth,
  ConnectorRecord,
  FederatedRow,
  VirtualCollectionRecord,
  VirtualReadRequest,
  VirtualWriteOperation,
} from "../../types";
import { FederationError } from "../../types";
import type { NormalizedFilter } from "../query-planner";

export interface ConnectorReadContext {
  connector: ConnectorRecord;
  collection: VirtualCollectionRecord;
  request: VirtualReadRequest;
  /** v1.5 REST upstream query params (WordPress slug/search/status) */
  restQueryParams?: Record<string, string>;
  /** v1.5 filters applied in-memory after REST fetch */
  clientFilters?: NormalizedFilter[];
}

export interface ConnectorWriteContext {
  connector: ConnectorRecord;
  collection: VirtualCollectionRecord;
  operation: VirtualWriteOperation;
  entryId?: string;
  data?: Record<string, unknown>;
}

export abstract class BaseConnector {
  abstract readonly type: ConnectorRecord["type"];

  abstract getDefaultCapabilities(): ConnectorCapabilities;

  abstract executeRead(ctx: ConnectorReadContext): Promise<{
    rows: FederatedRow[];
    total?: number;
  }>;

  abstract healthCheck(connector: ConnectorRecord): Promise<{
    health: ConnectorHealth;
    message?: string;
  }>;

  async executeWrite(ctx: ConnectorWriteContext): Promise<FederatedRow | null> {
    const writable = ctx.connector.capabilities?.writable ?? this.getDefaultCapabilities().writable;
    if (!writable) {
      throw new FederationError(
        "CONNECTOR_WRITE_NOT_SUPPORTED",
        `Connector ${this.type} does not support writes`,
        405,
      );
    }
    switch (ctx.operation) {
      case "create":
        return this.executeCreate(ctx);
      case "update":
        return this.executeUpdate(ctx);
      case "delete":
        await this.executeDelete(ctx);
        return null;
      default:
        throw new FederationError("CONNECTOR_WRITE_FAILED", "Unknown write operation", 400);
    }
  }

  protected async executeCreate(_ctx: ConnectorWriteContext): Promise<FederatedRow> {
    throw new FederationError(
      "CONNECTOR_WRITE_NOT_SUPPORTED",
      `Create not implemented for ${this.type}`,
      405,
    );
  }

  protected async executeUpdate(_ctx: ConnectorWriteContext): Promise<FederatedRow> {
    throw new FederationError(
      "CONNECTOR_WRITE_NOT_SUPPORTED",
      `Update not implemented for ${this.type}`,
      405,
    );
  }

  protected async executeDelete(_ctx: ConnectorWriteContext): Promise<void> {
    throw new FederationError(
      "CONNECTOR_WRITE_NOT_SUPPORTED",
      `Delete not implemented for ${this.type}`,
      405,
    );
  }

  protected buildRow(
    connectorId: string,
    sourceKey: string,
    fields: Record<string, unknown>,
  ): FederatedRow {
    return {
      _id: `${connectorId}:${sourceKey}`,
      _source: { connectorId, sourceKey },
      ...fields,
    };
  }
}
