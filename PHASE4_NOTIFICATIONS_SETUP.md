# HarvestFlow — Phase 4: Background Reminders & Web Push Setup

Phase 4 makes Juan's harvest reminders run **reliably on the server even when his app/phone is closed**, adds **standards-based Web Push notifications** (Windows, Android, and iPhone Home Screen PWA), and logs every notification delivery attempt in PostgreSQL.

---

## Step 1 — Run the Phase 4 SQL Migration
1. Open **Supabase Dashboard → SQL Editor → + New query**.
2. Copy the entire contents of [`supabase/migrations/0002_notifications_and_push.sql`](./supabase/migrations/0002_notifications_and_push.sql), paste, and click **Run**.
3. Confirm **Success. No rows returned**.

---

## Step 2 — Schedule Background Harvest Reminders (`pg_cron`)
Reminders only fire for harvests **explicitly started by Juan** (`harvest_started_at IS NOT NULL`) that are still below `100%`, respecting the Admin's configured interval (default `60` minutes).

1. In Supabase Dashboard, go to **Database → Extensions**, search for **`pg_cron`**, and enable it.
2. In **SQL Editor → + New query**, run:

```sql
select cron.schedule(
  'harvestflow-periodic-reminders',
  '*/5 * * * *',
  'select public.rpc_trigger_active_reminders(false);'
);
```

3. Verify the job is registered:

```sql
select jobid, jobname, schedule, command from cron.job;
```

---

## Step 3 — Generate VAPID Keys for Web Push (Free, Standards-Based)
From your terminal, run:

```zsh
npx web-push generate-vapid-keys
```

You will receive a **Public Key** and a **Private Key**:
- **Public Key:** Safe for frontend → add to `.env.local` (and Cloudflare Pages env vars in Phase 5) as `VITE_VAPID_PUBLIC_KEY=<public-key>`.
- **Private Key:** **Secret!** Store ONLY in Supabase Edge Function Secrets (never in `.env.local` or Git).

---

## Step 4 — Deploy `dispatch-web-push` Edge Function & Secrets
1. In Supabase Dashboard → **Edge Functions → Deploy a new function → Via Editor**.
2. Name the function **`dispatch-web-push`**.
3. Paste the full contents of [`supabase/functions/dispatch-web-push/index.ts`](./supabase/functions/dispatch-web-push/index.ts) and click **Deploy function**.
4. In **Edge Functions → Secrets** (or Project Settings → Edge Functions), add:
   - `VAPID_PUBLIC_KEY` = your generated public key
   - `VAPID_PRIVATE_KEY` = your generated private key
   - `VAPID_SUBJECT` = `mailto:ops@yourcompany.com`
   - `WEBHOOK_SECRET` = any random secret string (e.g. 32 random chars)

---

## Step 5 — Connect Database Webhook (Automatic Push on Every Notification)
1. In Supabase Dashboard, go to **Database → Webhooks → Create a new hook**.
2. Configure:
   - **Name:** `dispatch-web-push-on-notification`
   - **Table:** `public.notifications`
   - **Events:** check **Insert** only
   - **Type:** **Supabase Edge Functions** → select **`dispatch-web-push`**
   - **HTTP Headers:** add `x-webhook-secret` = the exact `WEBHOOK_SECRET` you saved in Step 4.
3. Click **Create webhook**.

---

## Step 6 — Enable & Test on Any Device
1. Restart `npm run dev` (or deploy to HTTPS on Cloudflare Pages for mobile phones).
2. Open **Profile** (top-right user chip) → click **Activer les push / Activar push** → click **Tester / Probar**.
3. On **iPhone**, first install HarvestFlow via Safari **Share → Add to Home Screen**, open the installed app, then enable push in **Profile**.
