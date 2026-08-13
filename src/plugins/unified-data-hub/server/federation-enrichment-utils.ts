/**
 * @file src/plugins/unified-data-hub/server/federation-enrichment-utils.ts
 * @description Re-export shim for the shared pure helpers (moved out of the
 * `server` directory so client components may import them under SvelteKit 3's
 * server-only module rules). Kept for server-side consumers' existing paths.
 */

export {
  enrichmentKey,
  normalizeFederationEnrichments,
  validateFederationEnrichment,
} from "../federation-enrichment-utils";
