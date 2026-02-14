import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Sets the Supabase session via server-set cookies so the browser reliably
 * persists auth across refresh and navigation (fixes custom-domain cookie issues).
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { access_token?: string; refresh_token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { access_token, refresh_token } = body;
  if (!access_token || !refresh_token) {
    return NextResponse.json(
      { error: "access_token and refresh_token required" },
      { status: 400 }
    );
  }

  const cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[] = [];

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll().map((c) => ({ name: c.name, value: c.value }));
      },
      setAll(toSet) {
        toSet.forEach((c) => cookiesToSet.push(c));
      },
    },
  });

  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  // Diagnostic: return what cookies are being set
  const cookieInfo = cookiesToSet.map(({ name, value, options }) => ({
    name,
    valueLength: value.length,
    maxAge: (options as Record<string, unknown>)?.maxAge ?? null,
  }));

  const response = NextResponse.json({
    ok: true,
    cookiesSet: cookieInfo.length,
    cookies: cookieInfo,
  });
  cookiesToSet.forEach(({ name, value, options }) =>
    response.cookies.set(name, value, options as Record<string, unknown>)
  );

  return response;
}
