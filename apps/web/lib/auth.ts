import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createSupabaseClient } from "./supabase/server";

// The one place pages and actions get the signed-in user (Next.js calls this a Data Access Layer).
// Call it in every page, Server Action and Route Handler before touching data.

export type User = { id: string; email: string };

export async function requireUser(): Promise<User> {
  // The session check reads the clock (token expiry), so it must run per request, never while prerendering.
  await connection();
  const supabase = await createSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");
  return { id: claims.sub, email: String(claims.email ?? "") };
}
