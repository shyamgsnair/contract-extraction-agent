import { createClient } from "@supabase/supabase-js";

// Original PDFs live in a private Supabase Storage bucket. The secret key bypasses all access rules,
// so this runs only in server-side code and the key lives only in .env.

export const BUCKET = "contracts";

export function createStorage(supabaseUrl: string, secretKey: string) {
  // Keep only the project URL: the dashboard's Data API page shows it with "/rest/v1/" on the end.
  const supabase = createClient(new URL(supabaseUrl).origin, secretKey, { auth: { persistSession: false } });
  let bucketReady = false;

  async function ensureBucket(): Promise<void> {
    if (bucketReady) return;
    const { error } = await supabase.storage.getBucket(BUCKET);
    if (error) {
      const created = await supabase.storage.createBucket(BUCKET, { public: false, allowedMimeTypes: ["application/pdf"] });
      if (created.error) throw new Error(`Could not create storage bucket "${BUCKET}": ${created.error.message}`);
    }
    bucketReady = true;
  }

  return {
    /** Confirms the key works and the bucket exists (creating it if needed). Call before slow work. */
    check: ensureBucket,
    /** Uploads a PDF and returns its path in the bucket. Re-uploading the same path overwrites it. */
    async uploadPdf(path: string, bytes: Uint8Array): Promise<string> {
      await ensureBucket();
      const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
      if (error) throw new Error(`Upload of ${path} failed: ${error.message}`);
      return path;
    },
  };
}
