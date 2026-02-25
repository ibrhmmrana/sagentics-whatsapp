import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface WhatsAppConnection {
  id: number;
  waba_id: string;
  phone_number_id: string;
  access_token: string;
  display_phone_number: string | null;
  display_name: string | null;
  connected_at: string;
}

/**
 * Get the most recently connected WhatsApp account (if any).
 * Used by sender.ts and webhook to resolve credentials dynamically.
 */
export async function getActiveConnection(): Promise<WhatsAppConnection | null> {
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from("whatsapp_connections")
    .select("*")
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as WhatsAppConnection;
}

/**
 * Get all connections.
 */
export async function getAllConnections(): Promise<WhatsAppConnection[]> {
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin
    .from("whatsapp_connections")
    .select("*")
    .order("connected_at", { ascending: false });

  if (error || !data) return [];
  return data as WhatsAppConnection[];
}

/**
 * Upsert a WhatsApp connection from Embedded Signup.
 */
export async function upsertConnection(params: {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
  displayPhoneNumber?: string;
  displayName?: string;
  connectedBy?: string;
}): Promise<{ connection?: WhatsAppConnection; error?: string }> {
  if (!supabaseAdmin) return { error: "Supabase not configured" };

  const { data, error } = await supabaseAdmin
    .from("whatsapp_connections")
    .upsert(
      {
        waba_id: params.wabaId,
        phone_number_id: params.phoneNumberId,
        access_token: params.accessToken,
        display_phone_number: params.displayPhoneNumber ?? null,
        display_name: params.displayName ?? null,
        connected_at: new Date().toISOString(),
        connected_by: params.connectedBy ?? null,
      },
      { onConflict: "phone_number_id" }
    )
    .select("*")
    .single();

  if (error) return { error: error.message };
  return { connection: data as WhatsAppConnection };
}

/**
 * Delete a connection by ID.
 */
export async function deleteConnection(id: number): Promise<{ error?: string }> {
  if (!supabaseAdmin) return { error: "Supabase not configured" };

  const { error } = await supabaseAdmin
    .from("whatsapp_connections")
    .delete()
    .eq("id", id);

  return error ? { error: error.message } : {};
}

/**
 * Resolve WhatsApp credentials: DB connection first, then env vars.
 */
export async function resolveWhatsAppCredentials(): Promise<{
  phoneNumberId: string;
  accessToken: string;
} | null> {
  const conn = await getActiveConnection();
  if (conn?.phone_number_id && conn?.access_token) {
    return {
      phoneNumberId: conn.phone_number_id,
      accessToken: conn.access_token,
    };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (phoneNumberId && accessToken) {
    return { phoneNumberId, accessToken };
  }

  return null;
}
