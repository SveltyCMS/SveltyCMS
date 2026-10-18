/**
 * @file scripts/security/pqc-keygen.ts
 * @description Generate an ML-KEM-768 key pair for the hybrid at-rest envelope.
 *
 * Features:
 * - Prints base64 SPKI/PKCS8 values ready for `config/private.ts`
 * - Warns on stderr so stdout stays a clean two-line `KEY=value` block
 * - No file writes and no network access
 *
 * Usage:
 *   bun run scripts/security/pqc-keygen.ts
 */

import { generateKemKeyPair, isMlKemAvailable } from "@utils/security/hybrid-kem";

async function main(): Promise<void> {
  if (!(await isMlKemAvailable())) {
    console.error("ML-KEM-768 is not available in this runtime. Use Node 24.15+ or Bun 1.4.2+.");
    process.exitCode = 1;
    return;
  }

  const { publicKey, privateKey } = await generateKemKeyPair();

  console.error(
    "WARNING: PQC_KEM_PRIVATE_KEY is a secret. Store it in config/private.ts or a secret manager; never commit or log it.",
  );
  console.log(`PQC_KEM_PUBLIC_KEY=${publicKey}`);
  console.log(`PQC_KEM_PRIVATE_KEY=${privateKey}`);
}

await main().catch((err: unknown) => {
  console.error(
    "Failed to generate the ML-KEM-768 key pair:",
    err instanceof Error ? err.message : String(err),
  );
  process.exitCode = 1;
});
