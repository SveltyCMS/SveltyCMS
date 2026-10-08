/**
 * @file index.cjs
 * @description Passenger / Plesk entry point for SveltyCMS.
 * Loads the SvelteKit adapter-node built application.
 *
 * Features:
 * - CommonJS loader for environments requiring a CJS entry (Plesk / Phusion Passenger)
 * - Environment variable initialization (PORT, HOST, BODY_SIZE_LIMIT) before adapter-node loads
 * - Direct execution of the compiled SvelteKit production server
 */

// Set environment defaults before importing adapter-node
process.env.BODY_SIZE_LIMIT = process.env.BODY_SIZE_LIMIT || "104857600"; // 100MB
process.env.PORT = process.env.PORT || "4173";
process.env.HOST = process.env.HOST || "0.0.0.0";

// Load SvelteKit's adapter-node built server
import("./build/index.js").catch((err) => {
  console.error("[SveltyCMS] CRITICAL: Failed to start server:", err);
  process.exit(1);
});
