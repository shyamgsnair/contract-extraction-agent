import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Runs before every page request (Next.js 16 calls middleware "proxy"). It refreshes the Supabase login session
// cookie and sends signed-out visitors to /login. This is a convenience redirect; every page and action still
// checks the user itself (see lib/auth.ts), because the proxy is not a security boundary.

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(new URL(process.env.SUPABASE_URL!).origin, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Do not remove: getClaims() validates the session and triggers the cookie refresh above.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const onLogin = request.nextUrl.pathname.startsWith("/login");

  if (!signedIn && !onLogin) return redirectKeepingCookies(request, "/login", response);
  if (signedIn && onLogin) return redirectKeepingCookies(request, "/", response);
  return response;
}

function redirectKeepingCookies(request: NextRequest, path: string, from: NextResponse) {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = from.headers.get(header);
    if (value) redirect.headers.set(header, value);
  }
  return redirect;
}

export const config = {
  // Every path except Next.js assets and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
