import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("config/database/sveltycms.db.sqlite");
db.prepare(
  "UPDATE auth_users SET failedAttempts = 0, lockoutUntil = NULL WHERE email = 'RKroells@web.de'",
).run();
console.log("Unlocked RKroells@web.de");
