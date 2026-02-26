import OpenAI, { toFile } from "openai";
import { resolveWhatsAppCredentials } from "@/lib/whatsapp/connections";

/**
 * Download media from WhatsApp Cloud API by media ID.
 */
export async function downloadWhatsAppMedia(
  mediaId: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const creds = await resolveWhatsAppCredentials();
  if (!creds) return null;

  const metaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${creds.accessToken}` },
  });
  if (!metaRes.ok) {
    console.error("[Audio] Failed to get media URL:", metaRes.status);
    return null;
  }
  const metaData = (await metaRes.json()) as { url: string; mime_type?: string };

  const fileRes = await fetch(metaData.url, {
    headers: { Authorization: `Bearer ${creds.accessToken}` },
  });
  if (!fileRes.ok) {
    console.error("[Audio] Failed to download media:", fileRes.status);
    return null;
  }

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return { buffer, mimeType: metaData.mime_type || "audio/ogg" };
}

/**
 * Transcribe audio using OpenAI Whisper.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) throw new Error("OPENAI_API_KEY not set");

  const openai = new OpenAI({ apiKey: openaiKey });

  const ext = mimeType.includes("ogg")
    ? "ogg"
    : mimeType.includes("mp4")
      ? "mp4"
      : mimeType.includes("mpeg") || mimeType.includes("mp3")
        ? "mp3"
        : mimeType.includes("webm")
          ? "webm"
          : mimeType.includes("wav")
            ? "wav"
            : "ogg";

  const file = await toFile(audioBuffer, `voice.${ext}`, { type: mimeType });

  const transcription = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
  });

  return transcription.text;
}

/**
 * Convert text to speech using Azure Cognitive Services TTS.
 * Returns OGG/Opus audio buffer so WhatsApp renders it as a voice note.
 */
export async function textToSpeech(text: string): Promise<Buffer> {
  const ttsKey = process.env.AZURE_TTS_KEY;
  const ttsRegion = process.env.AZURE_TTS_REGION || "eastus";
  if (!ttsKey) throw new Error("AZURE_TTS_KEY not set");

  const ssml =
    `<speak version='1.0' xml:lang='en-US'>` +
    `<voice xml:lang='en-US' xml:gender='Female' name='en-US-EmmaMultilingualNeural'>` +
    escapeXml(text) +
    `</voice></speak>`;

  const res = await fetch(
    `https://${ttsRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": ttsKey,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "ogg-24khz-16bit-mono-opus",
        "User-Agent": "SagenticsWhatsApp",
      },
      body: ssml,
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Azure TTS error ${res.status}: ${errBody}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Check if a text message is requesting a voice note response.
 */
const VOICE_REQUEST_PATTERNS = [
  /voice\s*note/i,
  /voice\s*message/i,
  /audio\s*message/i,
  /audio\s*note/i,
  /send\b.*\bvoice/i,
  /respond\b.*\bvoice/i,
  /reply\b.*\bvoice/i,
  /answer\b.*\bvoice/i,
  /in\s+(?:a\s+)?voice/i,
  /as\s+(?:a\s+)?voice/i,
  /via\s+voice/i,
];

export function wantsVoiceResponse(text: string): boolean {
  return VOICE_REQUEST_PATTERNS.some((p) => p.test(text));
}
