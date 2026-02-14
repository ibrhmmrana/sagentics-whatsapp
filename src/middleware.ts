import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function middleware(request: NextRequest) {
  // If Supabase env vars are missing (build-time inlining failed), skip auth
  // and just pass the request through so we don't accidentally clear cookies.
  if (!supabaseUrl || !supabaseAnonKey) {
    const res = NextResponse.next({ request });
    res.headers.set("x-middleware-env", "MISSING");
    return res;
  }

  let response = NextResponse.next({ request });

  // Track what setAll does for debugging
  let setAllCalledWith: string[] = [];

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll().map((c) => ({
          name: c.name,
          value: c.value,
        }));
      },
      setAll(cookiesToSet) {
        setAllCalledWith = cookiesToSet.map((c) => `${c.name}=${c.options?.maxAge ?? "?"}`);

        // 1. Update request cookies so downstream server code (layout, API
        //    routes) sees the refreshed tokens via cookies().
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );

        // 2. Recreate the response with the updated request.
        response = NextResponse.next({ request });

        // 3. Set cookies on the response so the browser stores them.
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh the session — triggers setAll if tokens are refreshed.
  const { data, error } = await supabase.auth.getUser();

  // Debug headers (visible in Network tab / debug endpoint)
  response.headers.set("x-middleware-env", "OK");
  response.headers.set("x-middleware-user", data?.user?.id ? "found" : "none");
  if (error) response.headers.set("x-middleware-error", error.message);
  if (setAllCalledWith.length > 0) {
    response.headers.set("x-middleware-setall", setAllCalledWith.join(", "));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
