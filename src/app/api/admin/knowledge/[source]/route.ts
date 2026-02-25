export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { noIndexHeaders } from "@/lib/adminAuth";
import { deleteKnowledgeBySource } from "@/lib/knowledge/ingest";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function headers(): Headers {
  const h = new Headers();
  Object.entries(noIndexHeaders()).forEach(([k, v]) => h.set(k, v));
  return h;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ source: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", reason: "Not signed in" },
      { status: 401, headers: headers() }
    );
  }

  const { source } = await params;
  const decoded = decodeURIComponent(source ?? "").trim();
  if (!decoded) {
    return NextResponse.json(
      { error: "source is required" },
      { status: 400, headers: headers() }
    );
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Database not configured", source: decoded, rawContent: "" },
      { status: 500, headers: headers() }
    );
  }

  const { data: sourceRow, error: sourceError } = await supabaseAdmin
    .from("knowledge_source")
    .select("raw_content")
    .eq("source", decoded)
    .maybeSingle();

  if (sourceError) {
    return NextResponse.json(
      { error: sourceError.message, source: decoded, rawContent: "" },
      { status: 500, headers: headers() }
    );
  }

  let rawContent = typeof sourceRow?.raw_content === "string" ? sourceRow.raw_content : "";

  // If we have no stored raw content, show what we have by reconstructing from chunks
  if (!rawContent || !rawContent.trim()) {
    const { data: chunks, error: chunksError } = await supabaseAdmin
      .from("knowledge_base")
      .select("id, content")
      .eq("source", decoded)
      .order("id", { ascending: true });

    if (!chunksError && Array.isArray(chunks) && chunks.length > 0) {
      rawContent = chunks
        .map((r) => (typeof r.content === "string" ? r.content : ""))
        .filter(Boolean)
        .join("\n\n");
    }
  }

  return NextResponse.json({ source: decoded, rawContent }, { headers: headers() });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ source: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", reason: "Not signed in" },
      { status: 401, headers: headers() }
    );
  }

  const { source } = await params;
  const decoded = decodeURIComponent(source ?? "").trim();
  if (!decoded) {
    return NextResponse.json(
      { error: "source is required" },
      { status: 400, headers: headers() }
    );
  }

  const { error } = await deleteKnowledgeBySource(decoded);
  if (error) {
    return NextResponse.json(
      { error },
      { status: 500, headers: headers() }
    );
  }

  return NextResponse.json({ success: true }, { headers: headers() });
}
