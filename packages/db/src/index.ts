import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

// Creates a Drizzle client. Callers pass the URL so this package never reads env vars itself.
export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 1 });
  return { db: drizzle(client, { schema, casing: "snake_case" }), close: () => client.end() };
}

export * from "./schema.ts";
export * from "./save.ts";
export { createStorage, BUCKET } from "./storage.ts";
