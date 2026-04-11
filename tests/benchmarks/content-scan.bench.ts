import fs from "node:fs/promises";
import path from "node:path";

async function scanFiles() {
  const start = performance.now();
  const collectionsDir = path.resolve(process.cwd(), ".compiledCollections");
  const extension = ".js";

  async function recursivelyGetFiles(dir: string, ext: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...(await recursivelyGetFiles(fullPath, ext)));
        else if (entry.isFile() && entry.name.endsWith(ext)) files.push(fullPath);
      }),
    );
    return files;
  }

  try {
    const files = await recursivelyGetFiles(collectionsDir, extension);
    const end = performance.now();
    const duration = (end - start).toFixed(2);
    console.log("--- Content Scan Baseline ---");
    console.log("Files scanned:", files.length);
    console.log("Scanning duration:", duration, "ms");

    const resDir = process.env.RESULTS_DIR || path.join(process.cwd(), "tests/benchmarks/results");
    const fsNode = await import("node:fs/promises");
    await fsNode.mkdir(resDir, { recursive: true });
    const filePath = path.join(resDir, "content-scan.json");
    await fsNode.writeFile(
      filePath,
      JSON.stringify(
        {
          name: "Self-Healing Scan",
          files: files.length,
          durationMs: parseFloat(duration),
        },
        null,
        2,
      ),
    );
    console.log(`💾 Results exported to: ${filePath}`);
  } catch (e) {
    console.error("Scan failed:", (e as Error).message);
  }
}

scanFiles();
