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
