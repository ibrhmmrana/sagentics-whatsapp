import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const AWS_REGION = process.env.AWS_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL;

let client: SESClient | null = null;

function getClient(): SESClient | null {
  if (!AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) return null;
  if (!client) {
    client = new SESClient({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

export interface SendMailOptions {
  /** One or more recipient email addresses */
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * Send an email via AWS SES.
 * Returns { ok: true } or { ok: false, error: string }.
 */
export async function sendSes(options: SendMailOptions): Promise<{ ok: boolean; error?: string }> {
  const ses = getClient();
  if (!ses) {
    return {
      ok: false,
      error: "SES not configured (AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY missing)",
    };
  }
  if (!SES_FROM_EMAIL) {
    return { ok: false, error: "SES_FROM_EMAIL not set" };
  }
  const toAddresses = Array.isArray(options.to) ? options.to : [options.to];
  if (toAddresses.length === 0) {
    return { ok: false, error: "No recipients (to is empty)" };
  }
  try {
    await ses.send(
      new SendEmailCommand({
        Source: SES_FROM_EMAIL,
        Destination: { ToAddresses: toAddresses },
        Message: {
          Subject: { Data: options.subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: options.text, Charset: "UTF-8" },
            ...(options.html && {
              Html: { Data: options.html, Charset: "UTF-8" },
            }),
          },
        },
      })
    );
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
