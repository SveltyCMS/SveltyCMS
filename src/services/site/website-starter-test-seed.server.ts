/**
 * @file src/services/site/website-starter-test-seed.server.ts
 * @description Test/E2E alias for Website Starter seeding — delegates to shared blueprint.
 */

export type {
  SeedWebsiteStarterBlueprintOptions as SeedWebsiteStarterOptions,
  SeedWebsiteStarterBlueprintResult as SeedWebsiteStarterResult,
} from "./website-starter-seed.server";

export { seedWebsiteStarterBlueprint as seedWebsiteStarterForTests } from "./website-starter-seed.server";
