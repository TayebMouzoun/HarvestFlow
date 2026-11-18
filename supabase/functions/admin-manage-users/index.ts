// Supabase Edge Function: admin-manage-users
// Secure server-side employee creation, editing, role assignment, password setting & activation.
// Deploy via Supabase Dashboard (Edge Functions -> admin-manage-users) or:
//   npx supabase functions deploy admin-manage-users
// Env vars auto-provided by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VALID_ROLES = [
  'admin',
  'commercial',
  'farm_coordinator',
  'transport',
  'warehouse',
  'viewer',
] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[admin-manage-users] Missing server environment variables', {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasServiceRoleKey: Boolean(serviceRoleKey),
      });
      return json(
        { error: 'Server misconfiguration: missing Supabase backend credentials' },
        500,
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return json({ error: 'Missing or malformed Authorization header' }, 401);
    }

    const jwt = authHeader.slice(7).trim();
    if (!jwt) {
      return json({ error: 'Empty bearer token' }, 401);
    }

    // Server-side admin client using SUPABASE_SERVICE_ROLE_KEY (never persists user session)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 1. Validate caller's JWT and retrieve the authenticated Auth user
    const { data: userData, error: userErr } = await adminClient.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      console.warn('[admin-manage-users] JWT verification failed', {
        errorCode: userErr?.code ?? null,
        errorMessage: userErr?.message ?? 'No user returned',
      });
      return json({ error: 'Invalid or expired session' }, 401);
    }

    const authUserId = userData.user.id;

    // 2. Look up caller's profile using service-role client and inspect BOTH data & error
    const { data: callerProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('id, full_name, role, is_active')
      .eq('id', authUserId)
      .maybeSingle();

    if (profileErr) {
      console.error('[admin-manage-users] Database error looking up caller profile', {
        authUserId,
        code: profileErr.code ?? null,
        message: profileErr.message,
        details: profileErr.details ?? null,
        hint: profileErr.hint ?? null,
      });
      return json(
        {
          error: 'Database error while verifying administrator permissions',
          code: profileErr.code ?? 'PROFILE_LOOKUP_ERROR',
        },
        500,
      );
    }

    if (!callerProfile) {
      console.warn('[admin-manage-users] Authenticated user has no matching row in public.profiles', {
        authUserId,
        profileFound: false,
      });
      return json(
        { error: 'Forbidden: No employee profile found for this authenticated account' },
        403,
      );
    }

    if (callerProfile.id !== authUserId) {
      console.error('[admin-manage-users] Profile ID mismatch', {
        authUserId,
        profileId: callerProfile.id,
      });
      return json({ error: 'Forbidden: Profile identity mismatch' }, 403);
    }

    if (!callerProfile.is_active) {
      console.warn('[admin-manage-users] Inactive account attempted admin action', {
        authUserId,
        role: callerProfile.role,
        isActive: callerProfile.is_active,
      });
      return json({ error: 'Forbidden: Account is deactivated' }, 403);
    }

    if (callerProfile.role !== 'admin') {
      console.warn('[admin-manage-users] Non-admin user attempted admin action', {
        authUserId,
        role: callerProfile.role,
        isActive: callerProfile.is_active,
      });
      return json({ error: 'Forbidden: Admin role required' }, 403);
    }

    // 3. Process authorized Admin action
    const body = await req.json();
    const { action } = body;

    if (action === 'create_user') {
      const { name, email, role, defaultLanguage, password } = body;
      if (
        !name?.trim() ||
        !email?.trim() ||
        !password ||
        password.length < 6 ||
        !VALID_ROLES.includes(role)
      ) {
        return json({ error: 'Invalid user creation payload' }, 400);
      }

      const lang = defaultLanguage === 'es' ? 'es' : 'fr';
      const normalizedEmail = email.trim().toLowerCase();
      const trimmedName = name.trim();

      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: trimmedName,
          preferred_language: lang,
        },
      });

      if (createErr || !created.user) {
        console.error('[admin-manage-users] auth.admin.createUser failed', {
          callerId: authUserId,
          code: createErr?.code ?? null,
          message: createErr?.message ?? 'User creation failed',
        });
        return json({ error: createErr?.message ?? 'User creation failed' }, 400);
      }

      // Explicitly assign operational role server-side (signup trigger always defaults to 'viewer')
      const nowIso = new Date().toISOString();
      const { error: roleErr } = await adminClient
        .from('profiles')
        .upsert(
          {
            id: created.user.id,
            full_name: trimmedName,
            email: normalizedEmail,
            role,
            preferred_language: lang,
            is_active: true,
            password_updated_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: 'id' },
        );

      if (roleErr) {
        console.error('[admin-manage-users] Failed to assign role on profiles', {
          callerId: authUserId,
          targetUserId: created.user.id,
          code: roleErr.code ?? null,
          message: roleErr.message,
        });
        return json({ error: roleErr.message }, 500);
      }

      const { error: auditErr } = await adminClient.from('order_events').insert({
        actor_id: callerProfile.id,
        actor_name: callerProfile.full_name,
        actor_role: 'admin',
        action_key: 'history.actions.admin_user_created',
        params: { name: trimmedName, role },
      });

      if (auditErr) {
        console.error('[admin-manage-users] Audit log insert failed on create_user', {
          code: auditErr.code ?? null,
          message: auditErr.message,
        });
      }

      return json({ user: { id: created.user.id, email: created.user.email } });
    }

    if (action === 'update_user') {
      const { userId, name, email, role, defaultLanguage, newPassword } = body;
      if (!userId || !name?.trim() || !email?.trim() || !VALID_ROLES.includes(role)) {
        return json({ error: 'Invalid update payload' }, 400);
      }
      if (userId === callerProfile.id && role !== 'admin') {
        return json({ error: 'Cannot remove admin role from your own account' }, 400);
      }
      if (newPassword && newPassword.length < 6) {
        return json({ error: 'Password must be at least 6 characters' }, 400);
      }

      const lang = defaultLanguage === 'es' ? 'es' : 'fr';
      const normalizedEmail = email.trim().toLowerCase();
      const trimmedName = name.trim();

      const authPatch: Record<string, unknown> = {
        email: normalizedEmail,
        user_metadata: {
          full_name: trimmedName,
          preferred_language: lang,
        },
      };
      if (newPassword) authPatch.password = newPassword;

      const { error: authErr } = await adminClient.auth.admin.updateUserById(userId, authPatch);
      if (authErr) {
        console.error('[admin-manage-users] auth.admin.updateUserById failed', {
          callerId: authUserId,
          targetUserId: userId,
          code: authErr.code ?? null,
          message: authErr.message,
        });
        return json({ error: authErr.message }, 400);
      }

      const nowIso = new Date().toISOString();
      const profilePatch: Record<string, unknown> = {
        full_name: trimmedName,
        email: normalizedEmail,
        role,
        preferred_language: lang,
        updated_at: nowIso,
      };
      if (newPassword) profilePatch.password_updated_at = nowIso;

      const { error: profErr } = await adminClient
        .from('profiles')
        .update(profilePatch)
        .eq('id', userId);

      if (profErr) {
        console.error('[admin-manage-users] Profile update failed', {
          callerId: authUserId,
          targetUserId: userId,
          code: profErr.code ?? null,
          message: profErr.message,
        });
        return json({ error: profErr.message }, 500);
      }

      const { error: auditErr } = await adminClient.from('order_events').insert({
        actor_id: callerProfile.id,
        actor_name: callerProfile.full_name,
        actor_role: 'admin',
        action_key: 'history.actions.admin_user_updated',
        params: { name: trimmedName, role },
      });

      if (auditErr) {
        console.error('[admin-manage-users] Audit log insert failed on update_user', {
          code: auditErr.code ?? null,
          message: auditErr.message,
        });
      }

      return json({ ok: true });
    }

    if (action === 'toggle_active') {
      const { userId } = body;
      if (!userId) return json({ error: 'Missing userId' }, 400);
      if (userId === callerProfile.id) {
        return json({ error: 'Cannot deactivate your own account' }, 400);
      }

      const { data: target, error: targetErr } = await adminClient
        .from('profiles')
        .select('id, full_name, is_active')
        .eq('id', userId)
        .maybeSingle();

      if (targetErr) {
        console.error('[admin-manage-users] Failed to fetch target user', {
          callerId: authUserId,
          targetUserId: userId,
          code: targetErr.code ?? null,
          message: targetErr.message,
        });
        return json({ error: targetErr.message }, 500);
      }

      if (!target) return json({ error: 'User not found' }, 404);

      const nextActive = !target.is_active;
      const { error: updErr } = await adminClient
        .from('profiles')
        .update({ is_active: nextActive, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (updErr) return json({ error: updErr.message }, 500);

      // Ban/unban in Supabase Auth so deactivated users cannot sign in
      const { error: banErr } = await adminClient.auth.admin.updateUserById(userId, {
        ban_duration: nextActive ? 'none' : '876000h',
      });
      if (banErr) {
        console.error('[admin-manage-users] Auth ban toggle failed', {
          callerId: authUserId,
          targetUserId: userId,
          code: banErr.code ?? null,
          message: banErr.message,
        });
        return json({ error: banErr.message }, 500);
      }

      const { error: auditErr } = await adminClient.from('order_events').insert({
        actor_id: callerProfile.id,
        actor_name: callerProfile.full_name,
        actor_role: 'admin',
        action_key: 'history.actions.admin_user_toggled',
        params: { name: target.full_name, status: nextActive ? 'active' : 'inactive' },
      });

      if (auditErr) {
        console.error('[admin-manage-users] Audit log insert failed on toggle_active', {
          code: auditErr.code ?? null,
          message: auditErr.message,
        });
      }

      return json({ ok: true, isActive: nextActive });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    console.error('[admin-manage-users] Unhandled exception', {
      message: err instanceof Error ? err.message : String(err),
    });
    return json({ error: 'Internal server error' }, 500);
  }
});
