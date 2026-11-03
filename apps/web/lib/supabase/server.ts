import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase Auth client for Server Components, Server Actions and Route Handlers. It uses the publishable key,
// so it can only do what a signed-in user may do; the login session lives in cookies.
// Create a new client per request: never keep one in a global variable.
export async function createSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), publishableKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Server Components cannot set cookies. The proxy refreshes the session instead, so this is safe to ignore.
        }
      },
    },
  });
}

/** The project URL without any path (the dashboard's Data API page shows it with "/rest/v1/" on the end). */
export function supabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL is not set in .env");
  return new URL(url).origin;
}

export function publishableKey(): string {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error("SUPABASE_PUBLISHABLE_KEY is not set in .env");
  return key;
}
