# Webfluential

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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-side Realtime in admin dashboard (optional; enable Realtime in Supabase). |
| **Admin dashboard** | |
| `ADMIN_DASH_PASSWORD` | Password for `/dashboard-admin` login. |
| `ADMIN_DASH_COOKIE_SECRET` | Secret for signing the auth cookie. |
| `ADMIN_DASH_COOKIE_NAME` | Optional; default `app_admin_auth`. |
| **AI** | |
| `OPENAI_API_KEY` | For the WhatsApp AI agent (e.g. gpt-4o-mini). |

**Production (e.g. Vercel):** Set the same variables in your host’s environment (e.g. Vercel → Project → Settings → Environment Variables). For the WhatsApp dashboard to show conversations and messages you must set at least `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ADMIN_DASH_PASSWORD` / `ADMIN_DASH_COOKIE_SECRET`. Set `NEXT_PUBLIC_SUPABASE_ANON_KEY` for live message updates. Log in on the production URL (e.g. `https://your-app.vercel.app`) so the auth cookie is set for that domain; if you only log in on localhost, the production site will show the login form and API calls will return 401 until you log in on prod.

## Database (Supabase)

Run the SQL in `supabase/migrations/001_whatsapp_tables.sql` to create:

- **chatbot_history** — every message (incoming + outgoing) for dashboard and AI context.
- **whatsapp_human_control** — which conversations are in human takeover (AI does not reply).

**Realtime (required for live updates in the dashboard):**

1. In Supabase Dashboard go to **Database → Replication**.
2. Find the **supabase_realtime** publication and click to edit.
3. Add the **chatbot_history** table so INSERTs are broadcast to subscribed clients.
4. Set **NEXT_PUBLIC_SUPABASE_ANON_KEY** in `.env.local` (the dashboard uses it to subscribe to new messages). Without this, new messages will not appear until you refresh.

## Scripts

- `npm run dev` — start dev server
- `npm run build` — build for production
- `npm run start` — start production server

## Routes

- `GET/POST /api/whatsapp/webhook` — Meta webhook (verify + receive messages).
- `/dashboard-admin` — Admin home (login if not authenticated).
- `/dashboard-admin/communications/whatsapp` — WhatsApp conversations, take over / handover to AI, send messages.
