import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendSes } from "@/lib/email/sendSes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INACTIVITY_HOURS = 4;
const THROTTLE_HOURS = 4; // don't send another alert within this many hours

const CRON_SECRET = process.env.INACTIVITY_ALERT_CRON_SECRET ?? process.env.CRON_SECRET;

/** Comma- or semicolon-separated list of emails; spaces trimmed */
function parseAlertEmails(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(Boolean);
}
const ALERT_EMAILS = parseAlertEmails(process.env.INACTIVITY_ALERT_EMAIL);

/**
 * GET /api/cron/inactivity-alert
 *
 * Hit this from n8n (or any cron) to check WhatsApp inactivity and send an email
 * via AWS SES if there have been no incoming messages for more than 4 hours.
 *
 * Auth: pass ?secret=<INACTIVITY_ALERT_CRON_SECRET> or header x-cron-secret
 * so only your cron can trigger it.
 */
export async function GET(request: NextRequest) {
  const urlSecret = request.nextUrl.searchParams.get("secret");
  const headerSecret = request.headers.get("x-cron-secret");
  const providedSecret = urlSecret ?? headerSecret;

  if (CRON_SECRET && providedSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Server misconfiguration", sent: false },
      { status: 500 }
    );
  }

  if (ALERT_EMAILS.length === 0) {
    return NextResponse.json(
      { error: "INACTIVITY_ALERT_EMAIL not set or empty", sent: false },
      { status: 500 }
    );
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - INACTIVITY_HOURS * 60 * 60 * 1000);
  const throttleCutoff = new Date(now.getTime() - THROTTLE_HOURS * 60 * 60 * 1000);

  try {
    // Latest rows first; we'll find the most recent human message in code
    const { data: rows, error: historyError } = await supabaseAdmin
      .from("chatbot_history")
      .select("id, message, date_time")
      .order("date_time", { ascending: false })
      .limit(200);

    if (historyError) {
      console.error("[inactivity-alert] chatbot_history error:", historyError);
      return NextResponse.json(
        { error: historyError.message, sent: false },
        { status: 500 }
      );
    }

    const lastHumanMessageAt = (() => {
      if (!rows?.length) return null;
      for (const row of rows) {
        const msg = row.message as { type?: string } | null;
        if (msg?.type === "human" && row.date_time) {
          return new Date(row.date_time as string);
        }
      }
      return null;
    })();

    const inactive = !lastHumanMessageAt || lastHumanMessageAt < cutoff;
    if (!inactive) {
      return NextResponse.json({
        status: "ok",
        sent: false,
        reason: "recent_activity",
        lastHumanMessageAt: lastHumanMessageAt?.toISOString() ?? null,
      });
    }

    // Throttle: don't send if we already sent an alert recently
    const { data: lastAlert } = await supabaseAdmin
      .from("inactivity_alert_log")
      .select("sent_at")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastSentAt = lastAlert?.sent_at ? new Date(lastAlert.sent_at as string) : null;
    if (lastSentAt && lastSentAt > throttleCutoff) {
      return NextResponse.json({
        status: "ok",
        sent: false,
        reason: "throttled",
        lastAlertSentAt: lastSentAt.toISOString(),
      });
    }

    const sendResult = await sendSes({
      to: ALERT_EMAILS,
      subject: `[Webfluential] No WhatsApp messages for ${INACTIVITY_HOURS}+ hours`,
      text: `There has been no incoming WhatsApp message for more than ${INACTIVITY_HOURS} hours.\n\nLast incoming message: ${lastHumanMessageAt?.toISOString() ?? "never"}\nChecked at: ${now.toISOString()}`,
    });

    if (!sendResult.ok) {
      console.error("[inactivity-alert] SES send failed:", sendResult.error);
      return NextResponse.json(
        { error: sendResult.error, sent: false },
        { status: 500 }
      );
    }

    await supabaseAdmin.from("inactivity_alert_log").insert({ sent_at: now.toISOString() });

    return NextResponse.json({
      status: "ok",
      sent: true,
      reason: "no_activity_4h",
      lastHumanMessageAt: lastHumanMessageAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error("[inactivity-alert] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), sent: false },
      { status: 500 }
    );
  }
}
