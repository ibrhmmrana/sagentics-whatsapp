import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";

/**
 * Temporary debug endpoint to diagnose auth on production.
 * GET /api/debug/auth — returns what the server sees (no secrets).
 * Also sets a test cookie to check if cookie storage works at all.
 * Remove or protect this before going fully public.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const allCookies = request.cookies.getAll();
  const cookieNames = allCookies.map((c) => c.name);

  // Check if any Supabase auth cookies are present (they start with "sb-")
  const supabaseCookies = allCookies.filter((c) => c.name.startsWith("sb-"));

  // Check if our test cookie from a previous visit is present
  const testCookieValue = request.cookies.get("__debug_test")?.value ?? null;

  const hasAuthHeader = !!request.headers.get("Authorization")?.startsWith("Bearer ");
  const envOk =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Show the raw Supabase URL (just the host, not the key) so we can verify it's correct
  const supabaseUrlHost = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
    : null;

  const user = await getAuthUser(request);

  const response = NextResponse.json({
    cookieNames,
    cookieCount: cookieNames.length,
    supabaseCookieNames: supabaseCookies.map((c) => c.name),
    supabaseCookieCount: supabaseCookies.length,
    testCookieReceived: testCookieValue,
    hasAuthHeader,
    envOk,
    supabaseUrlHost,
    hasUser: !!user,
    userId: user?.id ?? null,
    hint: testCookieValue
      ? "Test cookie works! Cookie storage is functional on this domain."
      : "Test cookie NOT received. Visit this URL once (sets the cookie), then REFRESH to check if it persists.",
  });

  // Set a simple test cookie — if this persists on refresh, cookie storage works
  response.cookies.set("__debug_test", "cookie_works_" + Date.now(), {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 60 * 60, // 1 hour
  });

  return response;
}
