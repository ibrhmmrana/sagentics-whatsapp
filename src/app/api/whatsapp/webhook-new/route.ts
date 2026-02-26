export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { extractIncomingMessage } from "@/lib/whatsapp/parsePayload";
import { isHumanInControl } from "@/lib/whatsapp/humanControl";
import { saveWhatsAppMessage } from "@/lib/whatsapp/messageStorage";
import { sendWhatsAppMessage, sendWhatsAppAudioMessage } from "@/lib/whatsapp/sender";
import { processMessage } from "@/lib/whatsapp/aiAgent";
import { isNumberAllowedForAi } from "@/lib/whatsapp/aiModeSettings";
import {
  downloadWhatsAppMedia,
  transcribeAudio,
  textToSpeech,
  wantsVoiceResponse,
} from "@/lib/whatsapp/audio";

const SESSION_PREFIX = process.env.WHATSAPP_SESSION_ID_PREFIX ?? "APP-";

function buildSessionId(waId: string): string {
  const digits = waId.replace(/\D/g, "");
  return SESSION_PREFIX + digits;
}

// ---------------------------------------------------------------------------
// GET — Meta webhook verification
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  ) {
    console.log("[WhatsApp Webhook] Verification successful");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("[WhatsApp Webhook] Verification failed — token mismatch or bad mode");
  return new NextResponse("Forbidden", { status: 403 });
}

// ---------------------------------------------------------------------------
// POST — Incoming message: text or voice note
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const parsed = extractIncomingMessage(body);

    if (!parsed) {
      console.log("[WhatsApp Webhook] No actionable message in payload");
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    const { waId, customerName, messageType, mediaId } = parsed;
    let messageText = parsed.text;
    const sessionId = buildSessionId(waId);
    const customerNumber = waId.replace(/\D/g, "");
    const customer = { number: customerNumber, name: customerName };

    let respondWithVoice = false;

    // --- Voice note: download and transcribe ---
    if (messageType === "audio" && mediaId) {
      console.log(`[WhatsApp Webhook] Voice note from ${waId}, mediaId=${mediaId}`);
      respondWithVoice = true;

      try {
        const media = await downloadWhatsAppMedia(mediaId);
        if (!media) {
          console.error("[WhatsApp Webhook] Failed to download voice note");
          return NextResponse.json({ status: "ok" }, { status: 200 });
        }
        messageText = await transcribeAudio(media.buffer, media.mimeType);
        console.log(`[WhatsApp Webhook] Transcription: ${messageText}`);
      } catch (err) {
        console.error("[WhatsApp Webhook] Transcription error:", err);
        return NextResponse.json({ status: "ok" }, { status: 200 });
      }

      if (!messageText.trim()) {
        console.log("[WhatsApp Webhook] Empty transcription — skipping");
        return NextResponse.json({ status: "ok" }, { status: 200 });
      }
    } else {
      respondWithVoice = wantsVoiceResponse(messageText);
    }

    console.log(`[WhatsApp Webhook] Message from ${waId}: ${messageText}`);

    await saveWhatsAppMessage(sessionId, "human", messageText, customer, undefined, messageType === "audio" ? mediaId : undefined);

    const allowed = await isNumberAllowedForAi(customerNumber);
    if (!allowed) {
      console.log(`[WhatsApp Webhook] Number ${customerNumber} not allowed for AI — skipping reply`);
      return NextResponse.json(
        { status: "ok", message: "Number not allowed for AI" },
        { status: 200 }
      );
    }

    const humanInControl = await isHumanInControl(sessionId);
    if (humanInControl) {
      console.log("[WhatsApp Webhook] Human in control — AI skipped");
      return NextResponse.json(
        { status: "ok", message: "Human in control - AI skipped" },
        { status: 200 }
      );
    }

    // --- AI reply ---
    const { content: replyText } = await processMessage(
      sessionId,
      messageText,
      customerNumber,
      customerName
    );

    // --- Send voice note or text ---
    let aiMediaId: string | undefined;
    if (respondWithVoice) {
      try {
        const audioBuffer = await textToSpeech(replyText);
        const sendResult = await sendWhatsAppAudioMessage(waId, audioBuffer, "audio/ogg");
        if (sendResult.ok && sendResult.mediaId) {
          aiMediaId = sendResult.mediaId;
        }
        if (!sendResult.ok) {
          console.error("[WhatsApp Webhook] Voice reply failed:", sendResult.error, "— falling back to text");
          const textFallback = await sendWhatsAppMessage(waId, replyText);
          if (!textFallback.ok) {
            console.error("[WhatsApp Webhook] Text fallback also failed:", textFallback.error);
          }
        }
      } catch (err) {
        console.error("[WhatsApp Webhook] TTS error, falling back to text:", err);
        const textFallback = await sendWhatsAppMessage(waId, replyText);
        if (!textFallback.ok) {
          console.error("[WhatsApp Webhook] Text fallback also failed:", textFallback.error);
        }
      }
    } else {
      const sendResult = await sendWhatsAppMessage(waId, replyText);
      if (!sendResult.ok) {
        console.error("[WhatsApp Webhook] Failed to send reply:", sendResult.error);
      }
    }

    await saveWhatsAppMessage(sessionId, "ai", replyText, customer, undefined, aiMediaId);
  } catch (err) {
    console.error("[WhatsApp Webhook] Error processing request:", err);
  }

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
