# HarvestFlow - Phase 5: Production Deployment Guide (Cloudflare Pages)

Deploy HarvestFlow on **Cloudflare Pages** (Free tier, global CDN, automatic HTTPS required for PWA installation and Web Push across Windows, Android, and iPhone).

---

## Step 1 - Push Your Repository to GitHub
Make sure `.env.local` is **never** committed (already excluded in `.gitignore`):

```zsh
cd /Users/tayeb/Documents/HarvestFlow
git init
git add .
git status   # Verify .env.local is NOT listed!
git commit -m "HarvestFlow v1 production release"
git branch -M main
git remote add origin https://github.com/<your-username>/harvestflow.git
git push -u origin main
```

---

## Step 2 - Deploy to Cloudflare Pages
1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Pages → Connect to Git**.
2. Select your `harvestflow` GitHub repository.
3. Configure build settings:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Node version (Environment variable):** `NODE_VERSION` = `22` (or `20`)
4. Add your **Environment Variables** (Production & Preview):
   - `VITE_SUPABASE_URL` = `https://<your-project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `<your-anon-public-key>` *(never `service_role`!)*
   - `VITE_VAPID_PUBLIC_KEY` = `<your-public-vapid-key>` *(optional, from Phase 4)*
5. Click **Save and Deploy**. Cloudflare builds and publishes your app over HTTPS (e.g., `https://harvestflow.pages.dev`).
   - SPA fallback routing (`public/_redirects`) and security/PWA headers (`public/_headers`) are applied automatically.

---

## Step 3 - Update Supabase Auth Allowed URLs
1. In **Supabase Dashboard → Authentication → URL Configuration**:
   - **Site URL:** `https://harvestflow.pages.dev` *(or your custom domain)*
   - **Redirect URLs:** add `https://harvestflow.pages.dev/**`
2. Click **Save**.

---

## Step 4 - Install PWA & Test Across Devices
- **Windows (Chrome / Edge):** Open the HTTPS URL → click the **Install** icon in the address bar → sign in → enable Push in **Profile**.
- **Android (Chrome):** Open the HTTPS URL → tap **Install app** (or menu → **Add to Home screen**) → sign in → enable Push in **Profile**.
- **iPhone (Safari, iOS 16.4+):** Open the HTTPS URL in Safari → tap **Share → Add to Home Screen** → open the Home Screen icon → sign in → enable Push in **Profile**.

---

## Step 5 - Optional Official WhatsApp Business Cloud API
When your Meta Business account is verified and your FR/ES utility template (`harvestflow_alert` with 2 body parameters `{{1}}` and `{{2}}`) is approved:
1. Run [`supabase/migrations/0003_whatsapp_phone_column.sql`](./supabase/migrations/0003_whatsapp_phone_column.sql) in Supabase SQL Editor and set E.164 phone numbers (e.g. `+212600000000`) on `profiles`.
2. Deploy [`supabase/functions/dispatch-whatsapp/index.ts`](./supabase/functions/dispatch-whatsapp/index.ts).
3. Add Edge Function Secrets: `WHATSAPP_ENABLED=true`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`, and `WEBHOOK_SECRET`.
4. Add a Supabase Database Webhook on `public.notifications` (`INSERT`) pointing to `dispatch-whatsapp`.
