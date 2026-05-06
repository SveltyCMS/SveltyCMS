import { pipe, string, isoTimestamp, safeParse } from "valibot";
const schema = pipe(string(), isoTimestamp());
console.log("2026-05-06:", safeParse(schema, "2026-05-06").success);
console.log("2026-05-06T00:00:00Z:", safeParse(schema, "2026-05-06T00:00:00Z").success);
console.log("2026-05-06T00:00:00.000Z:", safeParse(schema, "2026-05-06T00:00:00.000Z").success);
console.log("2026-05-06T00:00:", safeParse(schema, "2026-05-06T00:00").success);
