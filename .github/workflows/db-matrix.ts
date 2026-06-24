/**
 * @file .github/workflows/db-matrix.ts
 * @description
 * Generates a GitHub Actions matrix JSON for database integration tests.
 *
 * Outputs a matrix with 4 database targets — sqlite, mongodb, mariadb,
 * and postgresql — each with the appropriate Docker image, port, and
 * health-check command for use in service containers.
 *
 * Usage:
 *   bun run .github/workflows/db-matrix.ts
 *   # Prints JSON to stdout, suitable for workflow matrix generation.
 */

interface DbMatrixEntry {
  db: string;
  image: string;
  port: number | "";
}

interface DbMatrix {
  db: string[];
  include: DbMatrixEntry[];
}

const dbMatrix: DbMatrix = {
  db: ["sqlite", "mongodb", "mariadb", "postgresql"],
  include: [
    {
      db: "sqlite",
      image: "alpine:latest",
      port: "",
    },
    {
      db: "mongodb",
      image: "mongo:8",
      port: 27017,
    },
    {
      db: "mariadb",
      image: "mariadb:11",
      port: 3306,
    },
    {
      db: "postgresql",
      image: "postgres:16",
      port: 5432,
    },
  ],
};

// biome-ignore lint: top-level console for CI script output
console.log(JSON.stringify(dbMatrix));
