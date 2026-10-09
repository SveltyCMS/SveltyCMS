/**
 * @file tests/benchmarks/read-replica-scaling.test.ts
 * @description Benchmark & verification suite for Read-Replica Splitting & Read-Your-Writes (RYW) Consistency.
 * Measures mixed read/write throughput, replica scaling, consistency watermarking, and failover resilience.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { unlinkSync } from "node:fs";
import { SQLiteAdapter } from "@src/databases/sqlite/sqlite-adapter";
import {
  createReplicaRouterAdapter,
  type ReadReplicaConfig,
} from "@src/databases/core/replica-router";
import { generateUUID } from "@utils/native-utils";
import type { IDBAdapter } from "@src/databases/db-interface";

const TEST_DB_PATH = "./config/test-database/replica_bench.sqlite";
const COLLECTION_NAME = "replica_bench_docs";
const TENANT_ID = "tenant_bench_1";

interface BenchmarkMetrics {
  totalOps: number;
  readOps: number;
  writeOps: number;
  durationMs: number;
  readRps: number;
  writeRps: number;
  totalRps: number;
  avgReadLatencyMs: number;
  p95ReadLatencyMs: number;
  readCoV: number;
  avgWriteLatencyMs: number;
  p95WriteLatencyMs: number;
  writeCoV: number;
}

function calculatePercentile(latencies: number[], p: number): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const index = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
  return sorted[index];
}

function calculateCoV(samples: number[], mean: number): number {
  if (samples.length < 2 || mean <= 0) return 0;
  const variance =
    samples.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (samples.length - 1);
  return (Math.sqrt(variance) / mean) * 100;
}

describe("Read-Replica Splitting & Read-Your-Writes Consistency Benchmark", () => {
  let primaryAdapter: SQLiteAdapter;
  let replicaAdapter1: SQLiteAdapter;
  let replicaAdapter2: SQLiteAdapter;
  let routedAdapter: IDBAdapter;

  beforeAll(async () => {
    try {
      unlinkSync(TEST_DB_PATH);
    } catch {}

    // Initialize Primary
    primaryAdapter = new SQLiteAdapter();
    const connectRes = await primaryAdapter.connect(TEST_DB_PATH);
    expect(connectRes.success).toBe(true);
    await primaryAdapter.provision();

    // Create the test collection table
    await primaryAdapter.collection.createModel({
      _id: COLLECTION_NAME,
      name: COLLECTION_NAME,
      fields: [
        { db_fieldName: "title", widget: { Name: "Input" }, required: true },
        { db_fieldName: "counter", widget: { Name: "Input" }, type: "number" },
        { db_fieldName: "tenantId", widget: { Name: "Input" } },
      ],
    });

    // Seed initial pool of 100 documents with canonical UUIDv7s
    const docIds: string[] = [];
    const seedDocs = Array.from({ length: 100 }, (_, i) => {
      const id = generateUUID();
      docIds.push(id);
      return {
        _id: id,
        title: `Initial Document ${i + 1}`,
        counter: i,
        tenantId: TENANT_ID,
      };
    });
    await primaryAdapter.crud.insertMany(COLLECTION_NAME, seedDocs as any, {
      tenantId: TENANT_ID as any,
    });

    // Initialize 2 Replicas connected to the same SQLite WAL database
    replicaAdapter1 = new SQLiteAdapter();
    await replicaAdapter1.connect(TEST_DB_PATH);

    replicaAdapter2 = new SQLiteAdapter();
    await replicaAdapter2.connect(TEST_DB_PATH);

    // Create the Replica Router Adapter wrapping primary + 2 replicas
    const replicaConfig: ReadReplicaConfig = {
      enabled: true,
      readYourWritesWindowMs: 1500,
      loadBalancing: "round-robin",
      maxConsecutiveErrors: 3,
      replicaTimeoutMs: 3000,
    };

    routedAdapter = createReplicaRouterAdapter(
      primaryAdapter,
      [replicaAdapter1, replicaAdapter2],
      replicaConfig,
    );
  });

  afterAll(async () => {
    if (routedAdapter?.disconnect) await routedAdapter.disconnect();
    try {
      unlinkSync(TEST_DB_PATH);
    } catch {}
  });

  async function runWorkload(
    adapter: IDBAdapter,
    totalOperations: number,
    writeRatio: number,
    options?: { useRywAffinity?: boolean },
  ): Promise<BenchmarkMetrics> {
    const readLatencies: number[] = [];
    const writeLatencies: number[] = [];
    let readCount = 0;
    let writeCount = 0;

    const start = performance.now();
    const promises: Promise<void>[] = [];

    // Pre-create 100 doc IDs for stable lookups
    const sampleIds = Array.from({ length: 100 }, () => generateUUID());
    await adapter.crud.insertMany(
      COLLECTION_NAME,
      sampleIds.map((id, idx) => ({
        _id: id,
        title: `Workload Doc ${idx}`,
        counter: idx,
        tenantId: TENANT_ID,
      })) as any,
      { tenantId: TENANT_ID as any },
    );

    for (let i = 0; i < totalOperations; i++) {
      const isWrite = i % Math.round(1 / writeRatio) === 0;
      const docId = sampleIds[i % sampleIds.length];
      const clientId = options?.useRywAffinity ? `client-session-${i % 10}` : undefined;

      if (isWrite) {
        writeCount++;
        promises.push(
          (async () => {
            const opStart = performance.now();
            const res = await adapter.crud.update(
              COLLECTION_NAME,
              docId as any,
              { counter: i + 1000 } as any,
              { tenantId: TENANT_ID as any, clientId } as any,
            );
            if (!res.success) {
              throw new Error(`Write failed: ${res.message}`);
            }
            writeLatencies.push(performance.now() - opStart);
          })(),
        );
      } else {
        readCount++;
        promises.push(
          (async () => {
            const opStart = performance.now();
            const res = await adapter.crud.findOne(COLLECTION_NAME, { _id: docId as any }, {
              tenantId: TENANT_ID as any,
              clientId,
            } as any);
            if (!res.success) {
              throw new Error(`Read failed: ${res.message}`);
            }
            readLatencies.push(performance.now() - opStart);
          })(),
        );
      }
    }

    await Promise.all(promises);
    const durationMs = performance.now() - start;

    const avgReadLatencyMs =
      readLatencies.reduce((sum, v) => sum + v, 0) / (readLatencies.length || 1);
    const p95ReadLatencyMs = calculatePercentile(readLatencies, 95);

    const avgWriteLatencyMs =
      writeLatencies.reduce((sum, v) => sum + v, 0) / (writeLatencies.length || 1);
    const p95WriteLatencyMs = calculatePercentile(writeLatencies, 95);

    return {
      totalOps: totalOperations,
      readOps: readCount,
      writeOps: writeCount,
      durationMs,
      readRps: Math.round((readCount / durationMs) * 1000),
      writeRps: Math.round((writeCount / durationMs) * 1000),
      totalRps: Math.round((totalOperations / durationMs) * 1000),
      avgReadLatencyMs,
      p95ReadLatencyMs,
      readCoV: calculateCoV(readLatencies, avgReadLatencyMs),
      avgWriteLatencyMs,
      p95WriteLatencyMs,
      writeCoV: calculateCoV(writeLatencies, avgWriteLatencyMs),
    };
  }

  it("measures baseline performance on standalone primary adapter", async () => {
    // 500 ops (80% reads, 20% writes) on bare primary
    const baseline = await runWorkload(primaryAdapter, 500, 0.2);

    console.log("\n=======================================================");
    console.log("📊 SCENARIO 1: STANDALONE PRIMARY BASELINE");
    console.log("=======================================================");
    console.log(`Total Throughput:  ${baseline.totalRps.toLocaleString()} ops/sec`);
    console.log(`Read Throughput:   ${baseline.readRps.toLocaleString()} reads/sec`);
    console.log(`Write Throughput:  ${baseline.writeRps.toLocaleString()} writes/sec`);
    console.log(`Avg Read Latency:  ${baseline.avgReadLatencyMs.toFixed(3)} ms`);
    console.log(`P95 Read Latency:  ${baseline.p95ReadLatencyMs.toFixed(3)} ms`);
    console.log(`Read Latency CoV:  ${baseline.readCoV.toFixed(2)} %`);
    console.log(`Avg Write Latency: ${baseline.avgWriteLatencyMs.toFixed(3)} ms`);
    console.log(`Write Latency CoV: ${baseline.writeCoV.toFixed(2)} %`);
    console.log("=======================================================\n");

    expect(baseline.totalOps).toBe(500);
    expect(baseline.readOps).toBeGreaterThan(350);
  });

  it("measures horizontally scaled performance on router with 2 read replicas", async () => {
    // Exact same 500 ops on routed adapter
    const scaled = await runWorkload(routedAdapter, 500, 0.2);

    console.log("\n=======================================================");
    console.log("📊 SCENARIO 2: PRIMARY + 2 READ REPLICAS (ROUTED)");
    console.log("=======================================================");
    console.log(`Total Throughput:  ${scaled.totalRps.toLocaleString()} ops/sec`);
    console.log(`Read Throughput:   ${scaled.readRps.toLocaleString()} reads/sec`);
    console.log(`Write Throughput:  ${scaled.writeRps.toLocaleString()} writes/sec`);
    console.log(`Avg Read Latency:  ${scaled.avgReadLatencyMs.toFixed(3)} ms`);
    console.log(`P95 Read Latency:  ${scaled.p95ReadLatencyMs.toFixed(3)} ms`);
    console.log(`Read Latency CoV:  ${scaled.readCoV.toFixed(2)} %`);
    console.log(`Avg Write Latency: ${scaled.avgWriteLatencyMs.toFixed(3)} ms`);
    console.log(`Write Latency CoV: ${scaled.writeCoV.toFixed(2)} %`);
    console.log("=======================================================\n");

    expect(scaled.totalOps).toBe(500);

    const stats = (routedAdapter as any).getReplicaStats();
    expect(stats.primaryWrites).toBeGreaterThan(0);
    expect(stats.replicaReads).toBeGreaterThan(0);
    console.log("Router Diagnostics:", stats);
  });

  it("guarantees 100% Read-Your-Writes (RYW) consistency after mutations", async () => {
    const clientSession = "user-session-alice-12345";
    const testDocId = generateUUID();
    const uniqueValue = 999888;

    // 0. Seed target doc
    await routedAdapter.crud.insert(
      COLLECTION_NAME,
      { _id: testDocId as any, title: "RYW Doc", counter: 10, tenantId: TENANT_ID as any } as any,
      { tenantId: TENANT_ID as any },
    );

    // 1. Client writes an update
    const writeRes = await routedAdapter.crud.update(
      COLLECTION_NAME,
      testDocId as any,
      { counter: uniqueValue } as any,
      { tenantId: TENANT_ID as any, clientId: clientSession } as any,
    );
    expect(writeRes.success).toBe(true);

    // 2. Client immediately reads back the document with the same clientId
    const readRes = await routedAdapter.crud.findOne(COLLECTION_NAME, { _id: testDocId as any }, {
      tenantId: TENANT_ID as any,
      clientId: clientSession,
    } as any);

    expect(readRes.success).toBe(true);
    expect((readRes as any).data?.counter).toBe(uniqueValue);

    // Verify stats record RYW hit routing to primary
    const stats = (routedAdapter as any).getReplicaStats();
    expect(stats.rywHits).toBeGreaterThan(0);
  });

  it("transparently falls back to primary when a replica encounters failure", async () => {
    // Inject artificial failure into both replicas
    const original1 = replicaAdapter1.crud.findOne;
    const original2 = replicaAdapter2.crud.findOne;
    (replicaAdapter1.crud as any).findOne = async () => {
      throw new Error("Simulated replica 1 network fault");
    };
    (replicaAdapter2.crud as any).findOne = async () => {
      throw new Error("Simulated replica 2 network fault");
    };

    const failoverDocId = generateUUID();
    await primaryAdapter.crud.insert(
      COLLECTION_NAME,
      {
        _id: failoverDocId as any,
        title: "Failover Doc",
        counter: 1,
        tenantId: TENANT_ID as any,
      } as any,
      { tenantId: TENANT_ID as any },
    );

    try {
      const readRes = await routedAdapter.crud.findOne(
        COLLECTION_NAME,
        { _id: failoverDocId as any },
        {
          tenantId: TENANT_ID as any,
        },
      );

      // Must succeed via graceful primary fallback without throwing to caller
      expect(readRes.success).toBe(true);
      expect((readRes as any).data?.title).toBe("Failover Doc");

      const stats = (routedAdapter as any).getReplicaStats();
      expect(stats.failoverHits).toBeGreaterThan(0);
      console.log("Failover successfully handled! Stats:", stats);
    } finally {
      replicaAdapter1.crud.findOne = original1;
      replicaAdapter2.crud.findOne = original2;
    }
  });
});
