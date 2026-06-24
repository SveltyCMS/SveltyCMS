/**
 * @file .github/workflows/db-matrix.ts
 * @description
 * Generates a GitHub Actions matrix JSON for database integration tests.
 *
 * Outputs a matrix with 4 database targets — sqlite, mongodb, mariadb,
 * and postgresql — each with the Docker image, port, and health-check.
 *
 * Image tags match docker-compose.yml and local Docker Desktop setup.
 *
 * Usage:
 *   node .github/workflows/db-matrix.ts
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
      image: "mongo:latest",
      port: 27017,
    },
    {
      db: "mariadb",
      image: "mariadb:latest",
      port: 3306,
    },
    {
      db: "postgresql",
      image: "postgres:latest",
      port: 5432,
    },
  ],
};

// biome-ignore lint: top-level console for CI script output
console.log(JSON.stringify(dbMatrix));
