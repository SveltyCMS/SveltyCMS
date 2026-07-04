/**
 * @file .github/workflows/db-matrix.ts
 * @description
 * Generates a GitHub Actions matrix JSON for database integration tests.
 *
 * Outputs a matrix with 4 database targets — sqlite, mongodb, mariadb,
 * and postgresql — each with the Docker image, port, and default credentials.
 *
 * Credentials match official Docker image defaults (see src/utils/test-db-credentials.ts).
 *
 * Usage:
 *   node .github/workflows/db-matrix.ts
 *   # Prints JSON to stdout, suitable for workflow matrix generation.
 */

interface DbMatrixEntry {
  db: string;
  image: string;
  port: number | "";
  db_user: string;
  db_password: string;
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
      db_user: "",
      db_password: "",
    },
    {
      db: "mongodb",
      image: "mongo:latest",
      port: 27017,
      db_user: "",
      db_password: "",
    },
    {
      db: "mariadb",
      image: "mariadb:latest",
      port: 3306,
      db_user: "root",
      db_password: "mariadb",
    },
    {
      db: "postgresql",
      image: "postgres:latest",
      port: 5432,
      db_user: "postgres",
      db_password: "postgres",
    },
  ],
};

// biome-ignore lint: top-level console for CI script output
console.log(JSON.stringify(dbMatrix));
