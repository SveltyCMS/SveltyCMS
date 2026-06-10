/**
 * @file scripts/generate-sbom.ts
 * @description Generates a Software Bill of Materials (SBOM) in CycloneDX JSON format
 * for supply chain security auditing and compliance (SOC 2, GDPR Art. 32).
 *
 * Usage: bun run scripts/generate-sbom.ts
 * Output: sbom.json (project root)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface PackageInfo {
  name: string;
  version: string;
  resolved?: string;
  integrity?: string;
  dependencies?: Record<string, string>;
  dev?: boolean;
  optional?: boolean;
}

interface SBOM {
  bomFormat: string;
  specVersion: string;
  serialNumber: string;
  version: number;
  metadata: {
    timestamp: string;
    tools: Array<{ name: string; version: string }>;
    component: {
      name: string;
      version: string;
      type: "application";
      purl: string;
    };
  };
  components: Array<{
    type: "library";
    name: string;
    version: string;
    purl?: string;
    scope?: "required" | "optional" | "excluded";
    hashes?: Array<{ alg: string; content: string }>;
  }>;
}

function parseBunLock(): PackageInfo[] {
  const lockContent = readFileSync("bun.lock", "utf-8");
  const packages: PackageInfo[] = [];
  const lines = lockContent.split("\n");
  let currentPkg: Partial<PackageInfo> | null = null;
  let inPackages = false;
  let inDependencies = false;

  for (const line of lines) {
    if (line.trim() === "packages:") {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    if (line.match(/^  \w/)) inPackages = false;

    const pkgMatch = line.match(/^\s{2}"([^"]+)":\s*\["([^"]+)",/);
    if (pkgMatch && !inDependencies) {
      if (currentPkg && currentPkg.name) packages.push(currentPkg as PackageInfo);
      currentPkg = { name: pkgMatch[1], version: pkgMatch[2] };
      continue;
    }

    if (currentPkg) {
      const resolvedMatch = line.match(/"resolved":\s*"([^"]+)"/);
      if (resolvedMatch) currentPkg.resolved = resolvedMatch[1];
      const integrityMatch = line.match(/"integrity":\s*"([^"]+)"/);
      if (integrityMatch) currentPkg.integrity = integrityMatch[1];
    }
  }

  if (currentPkg && currentPkg.name) packages.push(currentPkg as PackageInfo);
  return packages;
}

function buildSBOM(packages: PackageInfo[]): SBOM {
  const pkgJson = JSON.parse(readFileSync("package.json", "utf-8"));
  const devDeps = new Set(Object.keys(pkgJson.devDependencies || {}));
  const optDeps = new Set(Object.keys(pkgJson.optionalDependencies || {}));

  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [{ name: "sveltycms-sbom", version: "1.0.0" }],
      component: {
        name: pkgJson.name,
        version: pkgJson.version,
        type: "application",
        purl: `pkg:npm/${pkgJson.name}@${pkgJson.version}`,
      },
    },
    components: packages
      .filter((p) => p.name && p.version)
      .map((p) => ({
        type: "library" as const,
        name: p.name,
        version: p.version,
        purl: p.name.startsWith("@")
          ? `pkg:npm/${p.name}@${p.version}`
          : `pkg:npm/${p.name}@${p.version}`,
        scope: optDeps.has(p.name)
          ? ("optional" as const)
          : devDeps.has(p.name)
            ? ("excluded" as const)
            : ("required" as const),
        hashes: p.integrity ? [{ alg: "SHA-512", content: p.integrity }] : undefined,
      })),
  };
}

const packages = parseBunLock();
const sbom = buildSBOM(packages);
const outputPath = resolve(process.cwd(), "sbom.json");
writeFileSync(outputPath, JSON.stringify(sbom, null, 2));

console.log(`✅ SBOM generated: ${outputPath}`);
console.log(`   ${sbom.components.length} components`);
console.log(`   CycloneDX ${sbom.specVersion} format`);
console.log(`   Serial: ${sbom.serialNumber}`);
