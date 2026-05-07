
/**
 * @file tests/benchmarks/crud-memory.test.ts
 * @description Memory audit for RelationalCrudModule to detect heap leaks.
 */

import { test, expect } from "bun:test";
import { RelationalCrudModule } from "../../src/databases/relational/modules/relational-crud-module";

// Mock Adapter to isolate CrudModule logic
class MockAdapter {
  db = {
    select: () => {
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: () => chain,
        // Make the chain thenable to simulate final execution
        // eslint-disable-next-line unicorn/no-thenable
        then: (onFullfilled: any) => Promise.resolve([{ _id: "123", name: "test" }]).then(onFullfilled)
      };
      return chain;
    },
    update: () => ({
      set: () => ({
        where: async () => [{ _id: "123", name: "test" }]
      })
    }),
    execute: async () => [
      { _id: "123", name: "test" }
    ],
  };

  getDb() { return this.db; }
  prepareData(data: any) { return data; }
  safeQuery() { return { query: {} as any, meta: {} as any }; }
  safeUpdateQuery() { return { query: {} as any, meta: {} as any }; }

  getTable() {
    return { _id: { name: "_id" } };
  }

  mapQuery(_table: any, query: any) {
    return query;
  }

  mapResult(result: any) {
    return result;
  }

  async wrap(fn: any, _coll: string, _op: string, options: any = {}) {
    // Simulate telemetry overhead but allow bypassing meta allocation
    if (!options.skipMeta) {
      const _meta = { timestamp: Date.now() }; 
      void _meta;
    }
    return fn(null);
  }
}

test("RelationalCrudModule: Memory Stability Audit (100k iterations)", async () => {
  const adapter = new MockAdapter() as any;
  const crud = new RelationalCrudModule(adapter);
  
  const ITERATIONS = 100_000;
  
  // Warmup
  for (let i = 0; i < 1000; i++) {
    await crud.findOne("posts", { filter: { _id: "123" } } as any);
  }
  
  if (global.gc) global.gc();
  const startMem = process.memoryUsage().heapUsed;
  
  console.log(`[Audit] Start Heap: ${(startMem / 1024 / 1024).toFixed(2)} MB`);
  
  for (let i = 0; i < ITERATIONS; i++) {
    // Test FindOne (Fast-Path)
    await crud.findOne("posts", { filter: { _id: "123" } } as any);
    
    // Test FindMany (Fast-Path)
    if (i % 2 === 0) {
      await crud.findMany("posts", { filter: { _id: "123" } } as any);
    }
    
    // Test Update (Fast-Path)
    if (i % 5 === 0) {
      await crud.update("posts", "123" as any, { name: "updated" } as any, { filter: { _id: "123" } } as any);
    }
    
    if (i % 20000 === 0 && i > 0) {
      if (global.gc) global.gc();
      const currentMem = process.memoryUsage().heapUsed;
      console.log(`[Audit] Iteration ${i}: ${(currentMem / 1024 / 1024).toFixed(2)} MB`);
    }
  }
  
  if (global.gc) global.gc();
  const endMem = process.memoryUsage().heapUsed;
  const delta = (endMem - startMem) / 1024 / 1024;
  
  console.log(`[Audit] End Heap: ${(endMem / 1024 / 1024).toFixed(2)} MB`);
  console.log(`[Audit] Delta: ${delta.toFixed(2)} MB`);
  
  // Leak threshold: < 5MB growth per 100k ops (mostly fragmentation/JIT)
  expect(delta).toBeLessThan(5);
});
