/**
 * @file src/databases/core/query-ir.ts
 * @description
 * Unified Query Intermediate Representation (IR) for SveltyCMS.
 * Standardizes MongoDB-style operators into a database-agnostic format
 * that can be reliably consumed by both SQL (Drizzle) and NoSQL (Mongoose) adapters.
 */

export type Operator =
  | "$eq"
  | "$ne"
  | "$gt"
  | "$gte"
  | "$lt"
  | "$lte"
  | "$in"
  | "$nin"
  | "$contains"
  | "$regex"
  | "$like"
  | "$exists"
  | "$or"
  | "$and"
  | "$not";

export interface QueryCondition {
  field: string;
  operator: Operator;
  value: any;
}

export interface LogicalGroup {
  operator: "$or" | "$and" | "$not";
  conditions: (QueryCondition | LogicalGroup)[];
}

/**
 * The Unified Query IR structure.
 */
export interface QueryIR {
  collection: string;
  filter: LogicalGroup;
  limit?: number;
  offset?: number;
  sort?: Array<{ field: string; direction: "asc" | "desc" }>;
}

/**
 * Translator that converts raw SveltyCMS queries (Mongo-style) into Query IR.
 */
export class QueryTranslator {
  public translate(collection: string, rawQuery: Record<string, any>, options: any = {}): QueryIR {
    return {
      collection,
      filter: this.parseLogicalGroup("$and", rawQuery),
      limit: options.limit,
      offset: options.offset,
      sort: this.parseSort(options.sort),
    };
  }

  private parseLogicalGroup(op: "$and" | "$or", query: Record<string, any>): LogicalGroup {
    const conditions: (QueryCondition | LogicalGroup)[] = [];

    // 🚀 DEFENSIVE: Handle null or non-object queries gracefully
    if (!query || typeof query !== "object") {
      return { operator: op, conditions };
    }

    for (const [key, value] of Object.entries(query)) {
      if (key === "$or" && Array.isArray(value)) {
        conditions.push({
          operator: "$or",
          conditions: value.map((sub) => this.parseLogicalGroup("$and", sub)),
        });
      } else if (key === "$and" && Array.isArray(value)) {
        conditions.push({
          operator: "$and",
          conditions: value.map((sub) => this.parseLogicalGroup("$and", sub)),
        });
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        // Handle operators: { price: { $gt: 10 } }
        for (const [subKey, subValue] of Object.entries(value)) {
          if (subKey.startsWith("$")) {
            conditions.push({ field: key, operator: subKey as Operator, value: subValue });
          } else {
            // Nested object without operator, assume equality (or nested field support in future)
            conditions.push({ field: key, operator: "$eq", value });
            break;
          }
        }
      } else {
        // Simple equality: { status: 'active' }
        conditions.push({ field: key, operator: "$eq", value });
      }
    }

    return { operator: op, conditions };
  }

  private parseSort(sort: any): QueryIR["sort"] {
    if (!sort) return undefined;
    if (Array.isArray(sort)) {
      return sort.map((s) => {
        if (Array.isArray(s)) return { field: s[0], direction: s[1] };
        return s;
      });
    }

    // 🚀 DEFENSIVE: Handle null or non-object sort gracefully
    if (typeof sort !== "object" || sort === null) return undefined;

    return Object.entries(sort).map(([field, direction]) => ({
      field,
      direction: direction === 1 || direction === "asc" ? "asc" : "desc",
    }));
  }
}

export const queryTranslator = new QueryTranslator();
