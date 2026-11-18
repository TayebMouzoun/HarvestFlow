# HarvestFlow — Step-by-Step Supabase Connection Guide

Follow these steps to connect HarvestFlow to your free **Supabase PostgreSQL** project.

> **Security rule:** Never put your `service_role` key in `.env.local`, Git, or frontend code. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` belong in `.env.local`.

---

## Step 1 — Create Your Supabase Project
1. Sign in at [supabase.com](https://supabase.com) and click **New project**.
2. Choose a name (e.g. `harvestflow`), pick a strong database password, select the region closest to your farms/team, and click **Create new project**.
3. Wait ~1–2 minutes until the project finishes provisioning.

---

## Step 2 — Run the Hardened SQL Migration
1. In the left sidebar, click **SQL Editor → + New query**.
2. Open [`supabase/migrations/0001_harvestflow_v1.sql`](./supabase/migrations/0001_harvestflow_v1.sql), copy its **entire** contents, paste into the SQL Editor, and click **Run**.
3. Confirm it finishes with **Success. No rows returned**.
4. *(Optional verification)* Run this quick query to verify all 9 Realtime tables are registered:

```sql
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
```

You should see: `app_settings`, `farm_allocations`, `farms`, `harvest_progress_steps`, `notification_reads`, `notifications`, `order_events`, `orders`, `profiles`.

---

## Step 3 — Create & Promote Your First Administrator
1. In the left sidebar, go to **Authentication → Users → Add user → Create new user**.
2. Enter your Admin email and a strong password, check **Auto Confirm User**, and click **Create user**.
   - *(By security design, every new user automatically starts with the safe read-only `'viewer'` role.)*
3. Go back to **SQL Editor → + New query** and run (replace with your real email & name):

```sql
update public.profiles
set role = 'admin',
    full_name = 'Nadia Benali',
    preferred_language = 'fr',
    is_active = true
where lower(email) = lower('your-admin@company.com');
```

---

## Step 4 — Deploy the `admin-manage-users` Edge Function
This lets the Admin create employee accounts, assign departments (`commercial`, `farm_coordinator`, `transport`, `warehouse`, `viewer`, `admin`), and set/reset passwords securely server-side.

### Option A — No CLI needed (Supabase Dashboard)
1. In your Supabase Dashboard, click **Edge Functions** in the left sidebar → **Deploy a new function → Via Editor**.
2. Name the function **`admin-manage-users`** (exact name).
3. Copy the entire contents of [`supabase/functions/admin-manage-users/index.ts`](./supabase/functions/admin-manage-users/index.ts) into the editor and click **Deploy function**.
4. *(Supabase automatically provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions — no manual secrets needed for this function.)*

### Option B — Using `npx supabase` (No Homebrew needed)
From `/Users/tayeb/Documents/HarvestFlow`:

```zsh
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase functions deploy admin-manage-users
```

---

## Step 5 — Create `.env.local` and Launch Live Mode
1. In your Supabase Dashboard, go to **Project Settings → API** (or **Data API / API Keys**).
2. Copy:
   - **Project URL** (`https://<your-project-ref>.supabase.co`)
   - **anon / public key** *(publishable key — NEVER the `service_role` / secret key)*
3. In `/Users/tayeb/Documents/HarvestFlow`, copy `.env.example` to `.env.local`:

```zsh
cp .env.example .env.local
```

4. Open `.env.local` and paste your two values:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
```

5. Start (or restart) the app:

```zsh
npm run dev
```

---

## Step 6 — Live Verification Checklist
1. Open the app in your browser — you should now see the clean **email + password login screen** (and the amber Demo Role Switcher strip is gone).
2. Sign in with your **Admin** email & password → you land directly on the **Admin Dashboard**.
3. Go to **Gestion → Utilisateurs** and create 1 test account for **Juan (`Coordinateur Fermes`)** and 1 for **Commercial** (plus an **Observateur** if desired).
4. Open a second browser window (Incognito) and sign in as **Juan** — verify he sees **only** his Spanish Farm Coordination dashboard!
5. Create an order as Commercial (or Admin → Départements → Commercial) and watch it appear **live in real time** on Juan's screen without refreshing!
