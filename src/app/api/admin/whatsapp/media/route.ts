export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { downloadWhatsAppMedia } from "@/lib/whatsapp/audio";

/**
 * GET /api/admin/whatsapp/media?mediaId=xxx
 * Proxies WhatsApp media (e.g. voice notes) so the dashboard can play them with <audio src="...">.
 * Requires admin auth.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mediaId = searchParams.get("mediaId");
  if (!mediaId?.trim()) {
    return NextResponse.json({ error: "mediaId required" }, { status: 400 });
  }

  const media = await downloadWhatsAppMedia(mediaId.trim());
  if (!media) {
    return new NextResponse("Failed to load media", { status: 502 });
  }

  return new NextResponse(media.buffer, {
    status: 200,
    headers: {
      "Content-Type": media.mimeType || "audio/ogg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
