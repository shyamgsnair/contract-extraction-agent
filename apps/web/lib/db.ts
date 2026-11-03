import "server-only";
import { createDb } from "@cea/db";

// One connection pool for the whole server process, like a singleton DataSource in Java.
// It is kept on globalThis so dev-mode hot reloads reuse it instead of opening new connections each time.
const globalForDb = globalThis as unknown as { cea?: ReturnType<typeof createDb> };

export function getDb() {
  if (!globalForDb.cea) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set in .env");
    globalForDb.cea = createDb(url, { max: 5 });
  }
  return globalForDb.cea.db;
}
