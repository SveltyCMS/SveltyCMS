/**
 * @file src/databases/core/schema-data.ts
 * @description Minimal schema shape consumed by the per-adapter DDL sync helpers.
 *
 * The SQL schema-sync modules only need the collection id and its declared
 * fields. `Schema` (the full content type) carries widget/runtime members the
 * DDL path never reads, and importing it here created a content↔database edge.
 */

import type { FieldInstance } from "@src/content/types";

export interface SchemaData {
  _id: string;
  fields: FieldInstance[];
  [key: string]: unknown;
}
