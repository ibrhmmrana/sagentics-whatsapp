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

/**
 * Send an audio message (voice note) via WhatsApp Cloud API.
 * Uploads the audio buffer as media first, then sends a message referencing it.
 */
export async function sendWhatsAppAudioMessage(
  phoneNumber: string,
  audioBuffer: Buffer,
  mimeType: string = "audio/ogg"
): Promise<{ ok: boolean; error?: string; mediaId?: string }> {
  const creds = await resolveWhatsAppCredentials();

  if (!creds) {
    return { ok: false, error: "No WhatsApp credentials configured (DB or env vars)" };
  }

  const { phoneNumberId, accessToken } = creds;
  const to = phoneNumber.replace(/\D/g, "");

  // Upload audio as media
  const ext = mimeType.includes("ogg") ? "ogg" : "mp3";
  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("type", mimeType);
  formData.append(
    "file",
    new Blob([new Uint8Array(audioBuffer)], { type: mimeType }),
    `voice.${ext}`
  );

  const uploadRes = await fetch(
    `https://graph.facebook.com/v20.0/${phoneNumberId}/media`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    }
  );

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text();
    return { ok: false, error: `Media upload failed ${uploadRes.status}: ${errBody}` };
  }

  const uploadData = (await uploadRes.json()) as { id?: string };
  const mediaId = uploadData.id;
  if (!mediaId) {
    return { ok: false, error: "Media upload returned no ID" };
  }

  // Send audio message referencing the uploaded media
  const sendRes = await fetch(
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
        type: "audio",
        audio: { id: mediaId },
      }),
    }
  );

  if (!sendRes.ok) {
    const errBody = await sendRes.text();
    return { ok: false, error: `${sendRes.status}: ${errBody}` };
  }

  return { ok: true, mediaId };
}
