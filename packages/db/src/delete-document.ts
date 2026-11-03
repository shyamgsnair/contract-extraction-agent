// Developer tool: deletes an uploaded document by file name, with its runs, evidence, contract row and stored PDF.
// Usage: pnpm --filter @cea/db delete-document trilogy-flex.pdf

import { eq } from "drizzle-orm";
import { createDb } from "./index.ts";
import { documents } from "./schema.ts";
import { createStorage } from "./storage.ts";

const fileName = process.argv[2];
const { DATABASE_URL, SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!fileName) {
  console.error("Usage: pnpm --filter @cea/db delete-document <file name>");
  process.exit(1);
}
if (!DATABASE_URL || !SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("DATABASE_URL, SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env");
  process.exit(1);
}

const { db, close } = createDb(DATABASE_URL);
try {
  const docs = await db.select().from(documents).where(eq(documents.fileName, fileName));
  if (docs.length === 0) console.log(`No document named ${fileName}.`);
  for (const doc of docs) {
    await createStorage(SUPABASE_URL, SUPABASE_SECRET_KEY).removePdf(doc.storagePath);
    await db.delete(documents).where(eq(documents.id, doc.id)); // runs, fields and contract row cascade
    console.log(`Deleted ${doc.fileName} (document ${doc.id}) and its stored PDF.`);
  }
} finally {
  await close();
}
