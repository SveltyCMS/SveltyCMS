/**
 * @file src/plugins/unified-data-hub/server/connector-pool-invalidation.ts
 * @description Invalidate cached connector pools when credentials or config change.
 */

import type { ConnectorRecord } from "../types";
import { invalidateMariaDbPool } from "./mariadb-pool-cache";
import { invalidateMongoConnection } from "./mongodb-client-cache";
import { invalidatePostgresPool } from "./postgres-pool-cache";
import { invalidateSqliteConnection } from "./sqlite-connection-cache";

export async function invalidateConnectorPool(
  connector: Pick<ConnectorRecord, "_id" | "type">,
): Promise<void> {
  const id = String(connector._id);
  switch (connector.type) {
    case "postgres":
      await invalidatePostgresPool(id);
      break;
    case "mariadb":
      await invalidateMariaDbPool(id);
      break;
    case "sqlite":
      await invalidateSqliteConnection(id);
      break;
    case "mongodb":
      await invalidateMongoConnection(id);
      break;
    default:
      break;
  }
}
