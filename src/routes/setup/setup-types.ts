/**
 * @file src/routes/setup/setup-types.ts
 * @description Shared type definitions for the setup wizard.
 * Extracted from setup.server.ts so they can be imported by both
 * client-side stores and server-side handlers without violating
 * SvelteKit's .remote.ts export constraints.
 */

export interface DbConfig {
  type: string;
  host: string;
  port: number | string;
  name: string;
  user?: string;
  password?: string;
}
export interface SystemSettings {
  preset?: string | null;
  hostProd?: string;
  multiTenant?: boolean;
  demoMode?: boolean;
  siteName?: string;
  useRedis?: boolean;
  redisHost?: string;
  redisPort?: string;
  redisPassword?: string;
  defaultSystemLanguage?: string;
  systemLanguages?: string[];
  defaultContentLanguage?: string;
  contentLanguages?: string[];
  mediaStorageType?: string;
  mediaFolder?: string;
  timezone?: string;
  passwordMinLength?: number;
  cfApiToken?: string;
  cfZoneId?: string;
  cfPurgeMode?: string;
}
export interface AdminUser {
  username: string;
  email: string;
  password: string;
}
