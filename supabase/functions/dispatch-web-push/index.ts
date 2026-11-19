// Supabase Edge Function: dispatch-web-push
// Triggered by a Supabase Database Webhook on public.notifications (INSERT).
// Sends localized FR/ES standards-based Web Push notifications to all active devices
// belonging to the notification's target_role and logs every delivery attempt.
//
// Required Edge Function Secrets:
//   VAPID_PUBLIC_KEY   - Generated via: npx web-push generate-vapid-keys
//   VAPID_PRIVATE_KEY  - Kept strictly server-side (never expose in frontend!)
//   VAPID_SUBJECT      - e.g. mailto:ops@yourcompany.com
// Optional Secret:
//   WEBHOOK_SECRET     - Matches x-webhook-secret header configured on Database Webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

interface NotificationRecord {
  id: string;
  target_role: string;
  type: string;
  severity: string;
  title_key: string;
  message_key: string;
  params: Record<string, string | number> | null;
  order_id: string | null;
}

const TEMPLATES: Record<'fr' | 'es', Record<string, string>> = {
  fr: {
    'notifications.types.new_order_title': 'Nouvelle commande {{ref}}',
    'notifications.types.new_order_body': '{{qty}} kg de {{product}} ({{priority}}). À répartir entre les fermes.',
    'notifications.types.harvest_started_title': 'Récolte démarrée - {{ref}}',
    'notifications.types.harvest_started_body': 'La récolte a été lancée sur {{farmsCount}} ferme(s) ({{qty}} kg de {{product}}).',
    'notifications.types.harvest_reminder_title': 'Rappel de suivi récolte - {{ref}}',
    'notifications.types.harvest_reminder_body': 'Contactez {{farm}} pour vérifier l’avancement (actuellement {{pct}}%).',
    'notifications.types.transport_prep_title': 'Préparation transport - {{ref}}',
    'notifications.types.transport_prep_body': '{{farm}} a atteint {{pct}}% ({{qty}} kg de {{product}}). Préparez l’enlèvement.',
    'notifications.types.transport_prep_corrected_title': 'Avancement corrigé - {{ref}}',
    'notifications.types.transport_prep_corrected_body': '{{farm}} a été corrigé de {{prev}}% à {{pct}}% ({{qty}} kg de {{product}}). Ajustez la préparation.',
    'notifications.types.harvest_ready_title': 'Prêt pour enlèvement - {{ref}}',
    'notifications.types.harvest_ready_body': '{{farm}} a atteint 100% ({{qty}} kg de {{product}}). Prêt à collecter.',
    'notifications.types.pickup_done_title': 'Livraison en route - {{ref}}',
    'notifications.types.pickup_done_body': 'Le transport a collecté {{qty}} kg de {{product}} depuis {{farm}}.',
    'notifications.types.order_completed_title': 'Commande terminée - {{ref}}',
    'notifications.types.order_completed_body': 'Toutes les fermes pour {{product}} ({{qty}} kg) ont été reçues à l’entrepôt.',
  },
  es: {
    'notifications.types.new_order_title': 'Nuevo pedido {{ref}}',
    'notifications.types.new_order_body': '{{qty}} kg de {{product}} ({{priority}}). Pendiente de repartir entre fincas.',
    'notifications.types.harvest_started_title': 'Cosecha iniciada - {{ref}}',
    'notifications.types.harvest_started_body': 'Se ha iniciado la cosecha en {{farmsCount}} finca(s) ({{qty}} kg de {{product}}).',
    'notifications.types.harvest_reminder_title': 'Recordatorio de cosecha - {{ref}}',
    'notifications.types.harvest_reminder_body': 'Llama a {{farm}} para verificar el avance (actualmente {{pct}}%).',
    'notifications.types.transport_prep_title': 'Preparación de transporte - {{ref}}',
    'notifications.types.transport_prep_body': '{{farm}} alcanzó el {{pct}}% ({{qty}} kg de {{product}}). Prepara la recogida.',
    'notifications.types.transport_prep_corrected_title': 'Progreso corregido - {{ref}}',
    'notifications.types.transport_prep_corrected_body': '{{farm}} fue corregido del {{prev}}% al {{pct}}% ({{qty}} kg de {{product}}). Ajusta la preparación.',
    'notifications.types.harvest_ready_title': 'Listo para recoger - {{ref}}',
    'notifications.types.harvest_ready_body': '{{farm}} llegó al 100% ({{qty}} kg de {{product}}). Listo para recogida.',
    'notifications.types.pickup_done_title': 'Entrega en camino - {{ref}}',
    'notifications.types.pickup_done_body': 'Transporte recogió {{qty}} kg de {{product}} desde {{farm}}.',
    'notifications.types.order_completed_title': 'Pedido completado - {{ref}}',
    'notifications.types.order_completed_body': 'Todas las fincas de {{product}} ({{qty}} kg) fueron recibidas en almacén.',
  },
};

function renderTemplate(
  lang: 'fr' | 'es',
  key: string,
  params: Record<string, string | number> | null,
): string {
  let template = TEMPLATES[lang][key] ?? TEMPLATES.fr[key] ?? key;
  if (!params) return template;
  for (const [k, v] of Object.entries(params)) {
    template = template.replaceAll(`{{${k}}}`, String(v));
  }
  return template;
}

Deno.serve(async (req) => {
  try {
    const expectedSecret = Deno.env.get('WEBHOOK_SECRET');
    if (expectedSecret) {
      const provided = req.headers.get('x-webhook-secret');
      if (provided !== expectedSecret) {
        return new Response(JSON.stringify({ error: 'Unauthorized webhook' }), { status: 401 });
      }
    }

    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@harvestflow.app';

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const payload = await req.json();
    const record: NotificationRecord | undefined = payload?.record ?? payload;

    if (!record?.id || !record?.target_role) {
      return new Response(JSON.stringify({ error: 'Invalid notification record' }), { status: 400 });
    }

    if (!vapidPublic || !vapidPrivate) {
      await adminClient.from('notification_delivery_attempts').insert({
        notification_id: record.id,
        channel: 'web_push',
        status: 'skipped',
        error_message: 'VAPID keys not configured in Edge Function secrets',
      });
      return new Response(JSON.stringify({ skipped: true, reason: 'missing_vapid_keys' }), {
        status: 200,
      });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    // Operational roles receive notifications targeted at them; Admins receive all operational alerts.
    const roleFilter =
      record.target_role === 'admin'
        ? 'role.eq.admin'
        : `role.eq.${record.target_role},role.eq.admin`;

    const { data: recipients, error: recipientsError } = await adminClient
      .from('profiles')
      .select('id, preferred_language')
      .or(roleFilter)
      .eq('is_active', true);

    if (recipientsError) {
      console.error('[dispatch-web-push] Failed to query recipients', {
        code: recipientsError.code,
        message: recipientsError.message,
      });
      return new Response(
        JSON.stringify({ error: 'Database error loading recipients', code: recipientsError.code }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (!recipients || recipients.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    const userIds = recipients.map((r) => r.id);
    const langByUser = new Map<string, 'fr' | 'es'>(
      recipients.map((r) => [r.id, r.preferred_language === 'es' ? 'es' : 'fr']),
    );

    const { data: subscriptions, error: subsError } = await adminClient
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .in('user_id', userIds)
      .eq('is_active', true);

    if (subsError) {
      console.error('[dispatch-web-push] Failed to query push subscriptions', {
        code: subsError.code,
        message: subsError.message,
      });
      return new Response(
        JSON.stringify({ error: 'Database error loading push subscriptions', code: subsError.code }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      await adminClient.from('notification_delivery_attempts').insert({
        notification_id: record.id,
        channel: 'web_push',
        status: 'skipped',
        error_message: 'No active push subscriptions for target role',
      });
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    let sent = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      const lang = langByUser.get(sub.user_id) ?? 'fr';
      const title = renderTemplate(lang, record.title_key, record.params);
      const body = renderTemplate(lang, record.message_key, record.params);

      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({
            title,
            body,
            severity: record.severity,
            type: record.type,
            orderId: record.order_id,
            url: '/',
          }),
        );

        sent += 1;
        await adminClient.from('notification_delivery_attempts').insert({
          notification_id: record.id,
          user_id: sub.user_id,
          channel: 'web_push',
          status: 'sent',
        });
      } catch (err) {
        failed += 1;
        const statusCode =
          err && typeof err === 'object' && 'statusCode' in err
            ? Number((err as { statusCode: unknown }).statusCode)
            : 0;

        if (statusCode === 404 || statusCode === 410) {
          await adminClient
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('id', sub.id);
        }

        await adminClient.from('notification_delivery_attempts').insert({
          notification_id: record.id,
          user_id: sub.user_id,
          channel: 'web_push',
          status: 'failed',
          error_message: String(err).slice(0, 300),
        });
      }
    }

    return new Response(JSON.stringify({ sent, failed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
