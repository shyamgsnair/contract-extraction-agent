"use server";

import { redirect } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Email or password is incorrect." };
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseClient();
  await supabase.auth.signOut();
  redirect("/login");
}
