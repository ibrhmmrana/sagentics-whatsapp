export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { hashToken, getCookieName, noIndexHeaders } from "@/lib/adminAuth";

async function getPasswordFromRequest(request: NextRequest): Promise<string | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return typeof body.password === "string" ? body.password.trim() : null;
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    const password = formData.get("password");
    return typeof password === "string" ? password.trim() : null;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const headers = new Headers();
  Object.entries(noIndexHeaders()).forEach(([k, v]) => headers.set(k, v));

  const expectedPassword = process.env.ADMIN_DASH_PASSWORD;
  if (!expectedPassword) {
    return NextResponse.json(
      { error: "Admin login not configured" },
      { status: 500, headers }
    );
  }

  const password = await getPasswordFromRequest(request);
  if (!password) {
    return NextResponse.json(
      { error: "Password required" },
      { status: 400, headers }
    );
  }

  if (password !== expectedPassword) {
    const url = request.nextUrl;
    const redirectTo = new URL("/", url.origin);
    redirectTo.searchParams.set("login_failed", "1");
    return NextResponse.redirect(redirectTo, { status: 302, headers });
  }

  const token = hashToken(password);
  const cookieName = getCookieName();
  const maxAge = 30 * 24 * 60 * 60; // 30 days

  const cookieValue = `${cookieName}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
  headers.append("Set-Cookie", cookieValue);

  // Redirect so the browser receives Set-Cookie and then navigates (session persists)
  const url = request.nextUrl;
  const redirectTo = new URL("/", url.origin);
  return NextResponse.redirect(redirectTo, { status: 302, headers });
}
