# sagentics

WhatsApp AI agent + admin dashboard (Next.js App Router).

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Description |
|----------|-------------|
| **Webhook** | |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Secret for Meta webhook GET verification; must match Meta dashboard. |
| **WhatsApp Cloud API** | |
| `WHATSAPP_ACCESS_TOKEN` | Permanent access token from Meta Business. |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID from Meta (not the number itself). |
| `WHATSAPP_SESSION_ID_PREFIX` | Optional; default `APP-`. Session IDs = `{PREFIX}{waId}`. |
| `WHATSAPP_ALLOWED_AI_NUMBER` | Optional; digits only with country code (e.g. `27693475825`). Only this number receives AI replies; others get messages saved but no AI response. Default: `27693475825`. |
| **Supabase** | |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side writes (webhook, admin API). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required for admin dashboard (auth + Realtime). |
| **AI** | |
| `OPENAI_API_KEY` | For the WhatsApp AI agent (e.g. gpt-4o-mini). |
| **Inactivity email alert (optional)** | |
| `AWS_REGION` | AWS region for SES (e.g. `us-east-1`). |
| `AWS_ACCESS_KEY_ID` | AWS IAM access key with SES send permission. |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret key. |
| `SES_FROM_EMAIL` | Verified sender email in SES (e.g. `alerts@yourdomain.com`). |
| `INACTIVITY_ALERT_EMAIL` | Email address(es) to receive the inactivity alert. Comma- or semicolon-separated for multiple (e.g. `a@x.com, b@y.com`). |
| `INACTIVITY_ALERT_CRON_SECRET` | Secret for the cron endpoint; pass as `?secret=...` or `x-cron-secret` header so only your cron can call it. Optional but recommended. |

**Production (e.g. Vercel):** Set the same variables in your host’s environment (e.g. Vercel → Project → Settings → Environment Variables). Admin auth uses Supabase Auth (email + password). Session is stored in cookies via @supabase/ssr. In Supabase Dashboard go to Authentication → Providers → Email and turn off "Enable Sign Up". Add admin users manually under Authentication → Users → Add user.

**Custom domain:** If you use both a Vercel URL (e.g. `sagentics-whatsapp.vercel.app`) and a custom domain (e.g. `sagentics.intakt.co.za`), cookies are per-origin. Always open and sign in on the **same** URL you use for the dashboard (e.g. only the custom domain, or only the Vercel URL). Otherwise the server won't receive auth cookies and you'll see "Not signed in".

## Database (Supabase)

Run the SQL migrations in order:

1. **001_whatsapp_tables.sql** — creates **chatbot_history** (every message for dashboard and AI context) and **whatsapp_human_control** (human takeover flag).
2. **002_chatbot_history_flat_view.sql** — creates **chatbot_history_flat** view so messages show correctly when `message`/`customer` are stored as JSON strings in JSONB. Run this in Supabase SQL Editor if you already have data.
3. **005_inactivity_alert_log.sql** — creates **inactivity_alert_log** (used to throttle inactivity email alerts).

**Realtime (required for live updates in the dashboard):**

1. In Supabase Dashboard go to **Database → Replication**.
2. Find the **supabase_realtime** publication and click to edit.
3. Under "Tables", add **chatbot_history** (enable INSERT so new messages are broadcast).
4. Save. Without this, new messages will not appear in the UI until you refresh.
5. In production, set **NEXT_PUBLIC_SUPABASE_ANON_KEY** in Vercel (the dashboard uses it for auth and for the Realtime subscription).

---

## Production: Supabase checklist

If **conversations don’t load** or **live messages don’t appear** on production, check:

| Check | Why it matters |
|-------|----------------|
| **SUPABASE_SERVICE_ROLE_KEY** set in Vercel | The admin API uses this to read `chatbot_history`. If missing, the server returns "Supabase not configured" and you get no conversations. |
| **NEXT_PUBLIC_SUPABASE_URL** and **NEXT_PUBLIC_SUPABASE_ANON_KEY** set in Vercel | Required for auth and for the browser Realtime client. Redeploy after adding/changing these (they are inlined at build time). |
| **Replication:** `chatbot_history` in **supabase_realtime** publication | In Supabase Dashboard → Database → Replication → edit **supabase_realtime** → add table **chatbot_history** (INSERT). Otherwise Realtime won’t broadcast new rows and live messages won’t appear. |
| **Same Supabase project** for local and prod | Use the same project URL and keys in Vercel as in `.env.local` if you want to see the same data. |
| **No RLS on `chatbot_history`** (or policies that allow read) | The app does not use RLS by default. If you enable RLS, add policies so the service role (and, for Realtime, the anon/authenticated role) can read `chatbot_history`. |

## Scripts

- `npm run dev` — start dev server
- `npm run build` — build for production
- `npm run start` — start production server

## Routes

- `GET/POST /api/whatsapp/webhook` — Meta webhook (verify + receive messages).
- `GET /api/cron/inactivity-alert` — Cron: if no incoming WhatsApp message for 4+ hours, sends an email via AWS SES (throttled to at most one email per 4 hours). See **Inactivity alert (n8n)** below.
- `/` — Admin home (login if not authenticated).
- `/whatsapp` — WhatsApp conversations, take over / handover to AI, send messages.

### Inactivity alert (n8n)

Failure detection: get an email when there’s no WhatsApp activity for 4+ hours so you know when something may be broken (e.g. webhook or pipeline down):

1. Set `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SES_FROM_EMAIL`, `INACTIVITY_ALERT_EMAIL`, and optionally `INACTIVITY_ALERT_CRON_SECRET` in your environment.
2. Run migration **005_inactivity_alert_log.sql** in Supabase.
3. In n8n, create a **Schedule Trigger** (e.g. every **15 minutes**).
4. Add an **HTTP Request** node:
   - **Method:** GET
   - **URL:** `https://<your-app-domain>/api/cron/inactivity-alert`
   - **Authentication:** None (or add a query param: `?secret=<INACTIVITY_ALERT_CRON_SECRET>` or header `x-cron-secret: <INACTIVITY_ALERT_CRON_SECRET>`).

**How often to hit:** Every **15 minutes** is a good default. You’ll get at most one email per 4 hours when inactive; the endpoint skips sending if there was recent activity or a recent alert.

Redirects: `/dashboard-admin` → `/`, `/dashboard-admin/communications/whatsapp` → `/whatsapp` (for old links).
