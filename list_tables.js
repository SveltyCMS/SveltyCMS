import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("config/database/sveltycms.db.sqlite");
console.log(db.prepare("SELECT name FROM sqlite_master WHERE type='table';").all());
