export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { hashToken, getCookieName, noIndexHeaders } from "@/lib/adminAuth";

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

  let password: string | null = null;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    password = typeof body.password === "string" ? body.password.trim() : null;
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    const val = formData.get("password");
    password = typeof val === "string" ? val.trim() : null;
  }

  if (!password) {
    return NextResponse.json(
      { error: "Password required" },
      { status: 400, headers }
    );
  }

  if (password !== expectedPassword) {
    return NextResponse.json(
      { error: "Invalid password" },
      { status: 401, headers }
    );
  }

  const token = hashToken(password);
  const cookieName = getCookieName();
  const maxAge = 30 * 24 * 60 * 60; // 30 days

  // Return 200 with Set-Cookie (no redirect).
  // The client will redirect after receiving the cookie.
  const response = NextResponse.json({ ok: true }, { status: 200, headers });

  response.cookies.set(cookieName, token, {
    path: "/",
    maxAge,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
