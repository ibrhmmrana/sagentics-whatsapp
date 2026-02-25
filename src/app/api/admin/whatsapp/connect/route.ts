export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { noIndexHeaders } from "@/lib/adminAuth";
import {
  getAllConnections,
  upsertConnection,
  deleteConnection,
} from "@/lib/whatsapp/connections";

const FB_APP_ID = process.env.NEXT_PUBLIC_FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const GRAPH_API_VERSION = "v20.0";

function headers() {
  const h = new Headers();
  Object.entries(noIndexHeaders()).forEach(([k, v]) => h.set(k, v));
  return h;
}

/**
 * GET — return all connected WhatsApp accounts.
 */
export async function GET(request: NextRequest) {
  const h = headers();
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: h });
  }

  const connections = await getAllConnections();
  return NextResponse.json({ connections }, { headers: h });
}

/**
 * POST — exchange Facebook code for access token and store connection.
 * Body: { code: string, phoneNumberId: string, wabaId: string }
 */
export async function POST(request: NextRequest) {
  const h = headers();
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: h });
  }

  if (!FB_APP_ID || !FB_APP_SECRET) {
    return NextResponse.json(
      { error: "Facebook app credentials not configured" },
      { status: 500, headers: h }
    );
  }

  let body: { code?: string; phoneNumberId?: string; wabaId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: h });
  }

  const { code, phoneNumberId, wabaId } = body;
  if (!code || !phoneNumberId || !wabaId) {
    return NextResponse.json(
      { error: "Missing required fields: code, phoneNumberId, wabaId" },
      { status: 400, headers: h }
    );
  }

  // Exchange the code for an access token
  const tokenUrl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", FB_APP_ID);
  tokenUrl.searchParams.set("client_secret", FB_APP_SECRET);
  tokenUrl.searchParams.set("code", code);

  const tokenRes = await fetch(tokenUrl.toString());
  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData.access_token) {
    console.error("[WhatsApp Connect] Token exchange failed:", tokenData);
    return NextResponse.json(
      { error: "Failed to exchange code for access token", details: tokenData.error?.message },
      { status: 400, headers: h }
    );
  }

  const accessToken: string = tokenData.access_token;

  // Fetch phone number details
  let displayPhoneNumber: string | undefined;
  let displayName: string | undefined;
  try {
    const phoneRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}?fields=display_phone_number,verified_name&access_token=${accessToken}`
    );
    if (phoneRes.ok) {
      const phoneData = await phoneRes.json();
      displayPhoneNumber = phoneData.display_phone_number;
      displayName = phoneData.verified_name;
    }
  } catch (err) {
    console.warn("[WhatsApp Connect] Could not fetch phone details:", err);
  }

  // Store in DB
  const { connection, error } = await upsertConnection({
    wabaId,
    phoneNumberId,
    accessToken,
    displayPhoneNumber,
    displayName,
    connectedBy: user.id,
  });

  if (error) {
    return NextResponse.json(
      { error: "Failed to save connection", reason: error },
      { status: 500, headers: h }
    );
  }

  return NextResponse.json({ connection }, { headers: h });
}

/**
 * DELETE — disconnect a WhatsApp account.
 * Body: { id: number }
 */
export async function DELETE(request: NextRequest) {
  const h = headers();
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: h });
  }

  let body: { id?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: h });
  }

  if (!body.id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400, headers: h });
  }

  const { error } = await deleteConnection(body.id);
  if (error) {
    return NextResponse.json({ error: "Failed to disconnect", reason: error }, { status: 500, headers: h });
  }

  return NextResponse.json({ success: true }, { headers: h });
}
