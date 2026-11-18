-- ============================================================================
-- HarvestFlow Phase 5 (Optional) - Employee E.164 Phone Column for WhatsApp
-- Run ONLY if/when activating official Meta WhatsApp Business Cloud API alerts.
-- ============================================================================

alter table public.profiles
  add column if not exists phone text
  check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');
