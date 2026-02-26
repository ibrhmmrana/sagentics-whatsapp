/**
 * Parse incoming Meta webhook payloads (multiple formats).
 * Supports text and audio (voice note) message types.
 */

interface WhatsAppContact {
  wa_id: string;
  profile?: { name: string };
}

interface WhatsAppMessage {
  from: string;
  type: string;
  text?: { body: string };
  audio?: { id: string; mime_type?: string };
}

interface MessagesPayload {
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
}

export interface ParsedIncomingMessage {
  waId: string;
  text: string;
  customerName?: string;
  messageType: "text" | "audio";
  mediaId?: string;
  mediaMimeType?: string;
}

export function extractIncomingMessage(body: unknown): ParsedIncomingMessage | null {
  let payload: MessagesPayload | undefined;

  // Format A — Standard Meta Cloud API
  if (
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    "object" in body &&
    (body as Record<string, unknown>).object === "whatsapp_business_account"
  ) {
    try {
      const entry = (body as Record<string, unknown[]>).entry;
      const changes = (entry[0] as Record<string, unknown[]>).changes;
      const value = (changes[0] as Record<string, unknown>).value as MessagesPayload;
      if (value?.messages) payload = value;
    } catch {
      /* fall through */
    }
  }

  if (!payload && Array.isArray(body)) {
    try {
      const first = body[0] as MessagesPayload | undefined;
      if (first?.messages) payload = first;
    } catch {
      /* fall through */
    }
  }

  if (
    !payload &&
    body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    "messages" in body
  ) {
    payload = body as MessagesPayload;
  }

  if (!payload?.messages) return null;

  const waId = payload.contacts?.[0]?.wa_id;
  const customerName = payload.contacts?.[0]?.profile?.name;

  // Try text message first
  const textMsg = payload.messages.find((m) => m.type === "text");
  if (textMsg?.text?.body) {
    return {
      waId: waId ?? textMsg.from,
      text: textMsg.text.body,
      customerName: customerName ?? undefined,
      messageType: "text",
    };
  }

  // Try audio / voice note message
  const audioMsg = payload.messages.find((m) => m.type === "audio");
  if (audioMsg?.audio?.id) {
    return {
      waId: waId ?? audioMsg.from,
      text: "",
      customerName: customerName ?? undefined,
      messageType: "audio",
      mediaId: audioMsg.audio.id,
      mediaMimeType: audioMsg.audio.mime_type,
    };
  }

  return null;
}
