export interface DatabaseConfig {
  type: string;
  port: number;
  host: string;
  user: string;
  password: string;
  useRedis?: boolean;
  label?: string;
}

export interface DatabaseCapabilities {
  concurrency: number;
  capabilities: string[];
  transactional: boolean;
  networked: boolean;
}

export interface BenchmarkScript {
  path: string;
  label: string;
  shortLabel: string;
  level: string;
  section: string;
  intensity: string;
  estimatedMs: number;
  timeoutMs?: number;
  desc: string;
  strategy: "all" | "sql" | "once";
  tags: string[];
  metricCategory: string;
  requiredCapabilities?: string[];
  correlatedWith?: string[];
  antiCorrelatedWith?: string[];
  codePaths?: string[];
}

export interface BenchmarkResult {
  db: string;
  status: string;
  coldStartMs?: number;
  metrics?: Record<string, any>;
  budgetViolations?: string[];
  hostInfo?: any;
  scriptTimings?: Record<string, number>;
}

export interface RunConfig {
  databases?: string[];
  scripts?: string[];
  iterations?: number;
  concurrency?: number;
}
