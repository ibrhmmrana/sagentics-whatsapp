export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { noIndexHeaders } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Debug endpoint: returns raw chatbot_history rows for a session_id.
 * Compare this with what the dashboard shows to find mismatches.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const headers = new Headers();
  Object.entries(noIndexHeaders()).forEach(([k, v]) => headers.set(k, v));

  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  const { sessionId } = await params;
  if (!sessionId || !supabaseAdmin) {
    return NextResponse.json({ error: "sessionId required / supabase not configured" }, { status: 400, headers });
  }

  // Raw rows from chatbot_history table
  const { data: rawRows, error: rawErr } = await supabaseAdmin
    .from("chatbot_history")
    .select("id, session_id, message, customer, date_time")
    .eq("session_id", sessionId)
    .order("date_time", { ascending: true });

  // Also try the view (to compare)
  const { data: viewRows, error: viewErr } = await supabaseAdmin
    .from("chatbot_history_flat")
    .select("id, session_id, msg_type, msg_content, msg_body, cust_name, cust_number, date_time")
    .eq("session_id", sessionId)
    .order("date_time", { ascending: true });

  return NextResponse.json({
    sessionId,
    table: {
      count: rawRows?.length ?? 0,
      error: rawErr?.message ?? null,
      rows: rawRows ?? [],
    },
    view: {
      count: viewRows?.length ?? 0,
      error: viewErr?.message ?? null,
      rows: viewRows ?? [],
    },
  }, { headers });
}
