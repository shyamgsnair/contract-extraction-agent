import { sql } from "drizzle-orm";
import { createDb } from "./index.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env at the repo root and fill it in.");
  process.exit(1);
}

const { db, close } = createDb(url);
try {
  const rows = await db.execute<{ version: string }>(sql`select version()`);
  console.log("Connected to Supabase Postgres:", rows[0]?.version);
} catch (err) {
  console.error("Could not connect:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await close();
}
