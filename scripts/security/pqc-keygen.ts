/**
 * @file scripts/security/pqc-keygen.ts
 * @description Generate an ML-KEM-768 (or X25519 + ML-KEM-768 composite) key pair
 * for the post-quantum at-rest envelope.
 *
 * Features:
 * - Prints base64 SPKI/PKCS8 values ready for `config/private.ts`
 * - `--composite` also generates an X25519 pair for `v2:` X25519+ML-KEM-768 envelopes
 * - Warns on stderr so stdout stays a clean `KEY=value` block
 * - No file writes and no network access
 *
 * Usage:
 *   bun run scripts/security/pqc-keygen.ts
 *   bun run scripts/security/pqc-keygen.ts --composite
 */

import {
  generateCompositeKemKeyPair,
  generateKemKeyPair,
  isCompositeKemAvailable,
  isMlKemAvailable,
} from "@utils/security/hybrid-kem";

async function main(): Promise<void> {
  const composite = process.argv.includes("--composite");

  if (composite) {
    if (!(await isCompositeKemAvailable())) {
      console.error(
        "Composite X25519 + ML-KEM-768 is not available in this runtime. Use Node 24.15+ or Bun 1.4.2+.",
      );
      process.exitCode = 1;
      return;
    }

    const { publicKey, privateKey, classicalPublicKey, classicalPrivateKey } =
      await generateCompositeKemKeyPair();

    console.error(
      "WARNING: PQC_KEM_PRIVATE_KEY and PQC_X25519_PRIVATE_KEY are secrets. Store them in config/private.ts or a secret manager; never commit or log them.",
    );
    console.log(`PQC_KEM_PUBLIC_KEY=${publicKey}`);
    console.log(`PQC_KEM_PRIVATE_KEY=${privateKey}`);
    console.log(`PQC_X25519_PUBLIC_KEY=${classicalPublicKey}`);
    console.log(`PQC_X25519_PRIVATE_KEY=${classicalPrivateKey}`);
    return;
  }

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
