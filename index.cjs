// Passenger / container entry point (CJS).
//
// The server itself lives in index.server.mjs so Node and Bun execute ONE
// implementation instead of a copy each. Passenger needs a CJS file it can
// require, so this file exists only to load that module:
//   node index.cjs   (container, Passenger)
//   bun index.cjs    (same behaviour, Bun runtime)
// Direct ESM launch works too: `node index.server.mjs` / `bun index.server.mjs`.
import("./index.server.mjs")
  .then(({ startServer }) => startServer())
  .catch((err) => {
    console.error("[SveltyCMS] CRITICAL: Failed to start server:", err);
    process.exit(1);
  });
