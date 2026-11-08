/**
 * @file .github/workflows/db-matrix.ts
 * @description
 * Generates a GitHub Actions matrix JSON for database integration tests.
 *
 * Outputs a matrix with 4 database targets — sqlite, mongodb, mariadb,
 * and postgresql — each with the Docker image, port, and default credentials.
 *
 * `--bench` narrows the output to SQLite when the trigger cannot fail the run:
 * a push to `next` sets BENCHMARK_GATE_POLICY to `warn`, so the three networked
 * benchmarks would produce advisory noise only. They still run on `main`, the
 * merge queue and the nightly schedule, where the gate can fail. The decision
 * reads EVENT_NAME / REF so the generator stays a pure function of its input.
 *
 * Credentials match official Docker image defaults (see src/utils/test-db-credentials.ts).
 *
 * Usage:
 *   node .github/workflows/db-matrix.ts
 *   node .github/workflows/db-matrix.ts --bench
 *   # Prints JSON to stdout, suitable for workflow matrix generation.
 */

interface DbMatrixEntry {
  db: string;
  image: string;
  port: number | "";
  db_user: string;
  db_password: string;
}

export interface DbMatrix {
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
      image: "postgres:18",
      port: 5432,
      db_user: "postgres",
      db_password: "postgres",
    },
  ],
};

/** Builds the matrix; `benchOnly` + a `next` push narrows it to SQLite. */
export function buildDbMatrix(
  options: { benchOnly?: boolean; eventName?: string; ref?: string } = {},
): DbMatrix {
  const advisoryOnly =
    options.benchOnly === true && options.eventName === "push" && options.ref === "refs/heads/next";

  return advisoryOnly
    ? { db: ["sqlite"], include: dbMatrix.include.filter((entry) => entry.db === "sqlite") }
    : dbMatrix;
}

if (import.meta.main) {
  console.log(
    JSON.stringify(
      buildDbMatrix({
        benchOnly: process.argv.includes("--bench"),
        eventName: process.env.EVENT_NAME,
        ref: process.env.REF,
      }),
    ),
  );
}
