import "server-only";
import { createStorage } from "@cea/db";

// Storage client using the secret key. Server-only: the key must never reach the browser.
let storage: ReturnType<typeof createStorage> | undefined;

export function getStorage() {
  if (!storage) {
    const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env");
    storage = createStorage(SUPABASE_URL, SUPABASE_SECRET_KEY);
  }
  return storage;
}
