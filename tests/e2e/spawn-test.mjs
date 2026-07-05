import { spawn } from "node:child_process";

const env = {
  ...process.env,
  DB_HOST: "spawned-localhost",
  TEST_MODE: "true",
  NODE_ENV: "test",
  DB_NAME: "spawned-test-db",
};

console.log("[spawn-test] Spawning child with DB_HOST=" + env.DB_HOST);

const child = spawn(
  "node",
  [
    "-e",
    "console.log('CHILD: DB_HOST=' + process.env.DB_HOST + ' TEST_MODE=' + process.env.TEST_MODE + ' DB_NAME=' + process.env.DB_NAME)",
  ],
  {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  },
);

child.stdout.on("data", (d) => process.stdout.write("[child-stdout] " + d));
child.stderr.on("data", (d) => process.stderr.write("[child-stderr] " + d));

child.on("exit", (code) => {
  console.log("[spawn-test] Child exited with code", code);
  process.exit(0);
});
