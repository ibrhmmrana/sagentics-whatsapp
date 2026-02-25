import { resolveWhatsAppCredentials } from "@/lib/whatsapp/connections";

/**
 * Send a text message via WhatsApp Cloud API.
 * Credentials are resolved from DB (Embedded Signup) first, then env vars.
 */
export async function sendWhatsAppMessage(
  phoneNumber: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const creds = await resolveWhatsAppCredentials();

  if (!creds) {
    return { ok: false, error: "No WhatsApp credentials configured (DB or env vars)" };
  }

  const { phoneNumberId, accessToken } = creds;
  const to = phoneNumber.replace(/\D/g, "");

  const res = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: message },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    return { ok: false, error: `${res.status}: ${errBody}` };
  }

  return { ok: true };
}
