import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type MessageType = "human" | "ai";

export interface CustomerInfo {
  number: string;
  name?: string;
}

export interface MessageRecord {
  type: MessageType;
  content: string;
  media_id?: string;
  additional_kwargs?: Record<string, unknown>;
  response_metadata?: Record<string, unknown>;
}

/**
 * Save a message to chatbot_history for dashboard and AI context.
 * Pass mediaId when the message is a voice note (incoming or outgoing) so the UI can show a playable audio player.
 */
export async function saveWhatsAppMessage(
  sessionId: string,
  messageType: MessageType,
  content: string,
  customer: CustomerInfo,
  aiMetadata?: Record<string, unknown>,
  mediaId?: string
): Promise<{ id?: number; date_time?: string; error?: string }> {
  if (!supabaseAdmin) {
    return { error: "Supabase not configured" };
  }

  const message: MessageRecord = {
    type: messageType,
    content,
    ...(aiMetadata && { response_metadata: aiMetadata }),
    ...(mediaId && { media_id: mediaId }),
  };

  const { data, error } = await supabaseAdmin
    .from("chatbot_history")
    .insert({
      session_id: sessionId,
      message,
      customer: { number: customer.number, name: customer.name ?? undefined },
    })
    .select("id, date_time")
    .single();

  if (error) {
    return { error: error.message };
  }
  return { id: data?.id, date_time: data?.date_time };
}
