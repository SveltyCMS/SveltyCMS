/**
 * @file scripts/generate-sbom.ts
 * @description Generates a Software Bill of Materials (SBOM) in CycloneDX JSON format
 * for supply chain security auditing and compliance (SOC 2, GDPR Art. 32).
 *
 * Usage: bun run scripts/generate-sbom.ts
 * Output: sbom.json (project root)
 */

import { resolve } from "node:path";
import fs from "node:fs/promises";

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

async function parseBunLock(): Promise<PackageInfo[]> {
  try {
    const rawText = await fs.readFile("bun.lock", "utf-8");
    const cleanText = rawText.replace(/^\uFEFF/, "").replace(/,\s*([\]}])/g, "$1");
    const lockData = JSON.parse(cleanText);
    const packages: PackageInfo[] = [];

    if (lockData.packages) {
      for (const [_name, info] of Object.entries(lockData.packages)) {
        if (Array.isArray(info) && info.length >= 1) {
          const fullPkgStr = info[0];
          const lastAtIndex = fullPkgStr.lastIndexOf("@");
          if (lastAtIndex > 0) {
            const pkgName = fullPkgStr.substring(0, lastAtIndex);
            const pkgVersion = fullPkgStr.substring(lastAtIndex + 1);
            const integrity = info[3] || undefined;

            packages.push({
              name: pkgName,
              version: pkgVersion,
              integrity,
            });
          }
        }
      }
    }
    return packages;
  } catch (error: any) {
    console.error("Failed to parse bun.lock:", error.message);
    return [];
  }
}

async function buildSBOM(packages: PackageInfo[]): Promise<SBOM> {
  const rawText = await fs.readFile("package.json", "utf-8");
  const cleanText = rawText.replace(/^\uFEFF/, "");
  const pkgJson = JSON.parse(cleanText);
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
        purl: `pkg:npm/${p.name}@${p.version}`,
        scope: optDeps.has(p.name)
          ? ("optional" as const)
          : devDeps.has(p.name)
            ? ("excluded" as const)
            : ("required" as const),
        hashes: p.integrity ? [{ alg: "SHA-512", content: p.integrity }] : undefined,
      })),
  };
}

const packages = await parseBunLock();
const sbom = await buildSBOM(packages);
const outputPath = resolve(process.cwd(), "sbom.json");
await fs.writeFile(outputPath, JSON.stringify(sbom, null, 2), "utf-8");

console.log(`✅ SBOM generated: ${outputPath}`);
console.log(`   ${sbom.components.length} components`);
console.log(`   CycloneDX ${sbom.specVersion} format`);
console.log(`   Serial: ${sbom.serialNumber}`);
