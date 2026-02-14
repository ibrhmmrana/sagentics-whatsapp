import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";

/**
 * Temporary debug endpoint to diagnose auth on production.
 * GET /api/debug/auth — returns what the server sees (no secrets).
 * Remove or protect this before going fully public.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const allCookies = request.cookies.getAll();
  const cookieNames = allCookies.map((c) => c.name);
  const supabaseCookies = allCookies.filter((c) => c.name.startsWith("sb-"));

  const testCookieValue = request.cookies.get("__debug_test")?.value ?? null;

  const hasAuthHeader = !!request.headers.get("Authorization")?.startsWith("Bearer ");

  // Route handler env check (Node.js runtime)
  const envOk =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseUrlHost = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
    : null;

  // Middleware env check (read from headers set by middleware)
  const middlewareEnv = request.headers.get("x-middleware-env") ?? "header_not_set";
  const middlewareUser = request.headers.get("x-middleware-user") ?? "header_not_set";
  const middlewareError = request.headers.get("x-middleware-error") ?? null;
  const middlewareSetAll = request.headers.get("x-middleware-setall") ?? null;

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
    middleware: {
      env: middlewareEnv,
      user: middlewareUser,
      error: middlewareError,
      setAllCalled: middlewareSetAll,
    },
    hasUser: !!user,
    userId: user?.id ?? null,
  });

  // Set test cookies — small and large — to check size limits
  response.cookies.set("__debug_test", "cookie_works_" + Date.now(), {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 60 * 60,
  });

  // ~3500 byte cookie (same size as a Supabase session chunk)
  const largeValue = "L".repeat(3500);
  response.cookies.set("__debug_large", largeValue, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 60 * 60,
  });

  return response;
}
