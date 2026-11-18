// Supabase Edge Function: dispatch-whatsapp (Optional Phase 5 Channel)
// Official Meta WhatsApp Business Cloud API adapter ONLY (no unofficial automation).
// Subject to Meta Business verification, pre-approved FR/ES utility templates, and Meta fees.
//
// Required Edge Function Secrets (when enabling):
//   WHATSAPP_ENABLED          = "true" (omit or "false" to keep safely disabled)
//   WHATSAPP_ACCESS_TOKEN     = Meta System User permanent token (strictly server-side)
//   WHATSAPP_PHONE_NUMBER_ID  = Meta WhatsApp Business Phone Number ID
//   WHATSAPP_TEMPLATE_NAME    = Approved utility template name (e.g. "harvestflow_alert")
//                               Template body should accept 2 parameters: {{1}} title, {{2}} message
// Optional Secret:
//   WEBHOOK_SECRET            = Matches x-webhook-secret header on Database Webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface NotificationRecord {
  id: string;
  target_role: string;
  type: string;
  severity: string;
  title_key: string;
  message_key: string;
  params: Record<string, string | number> | null;
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
    'notifications.types.transport_prep_corrected_body': '{{farm}} a été corrigé de {{prev}}% à {{pct}}% ({{qty}} kg de {{product}}).',
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
    'notifications.types.transport_prep_corrected_body': '{{farm}} fue corregido del {{prev}}% al {{pct}}% ({{qty}} kg de {{product}}).',
    'notifications.types.harvest_ready_title': 'Listo para recoger - {{ref}}',
    'notifications.types.harvest_ready_body': '{{farm}} llegó al 100% ({{qty}} kg de {{product}}). Listo para recogida.',
    'notifications.types.pickup_done_title': 'Entrega en camino - {{ref}}',
    'notifications.types.pickup_done_body': 'Transporte recogió {{qty}} kg de {{product}} desde {{farm}}.',
    'notifications.types.order_completed_title': 'Pedido completado - {{ref}}',
    'notifications.types.order_completed_body': 'Todas las fincas de {{product}} ({{qty}} kg) fueron recibidas en almacén.',
  },
};

function renderText(
  lang: 'fr' | 'es',
  key: string,
  params: Record<string, string | number> | null,
): string {
  let out = TEMPLATES[lang][key] ?? TEMPLATES.fr[key] ?? key;
  if (!params) return out;
  for (const [k, v] of Object.entries(params)) {
    out = out.replaceAll(`{{${k}}}`, String(v));
  }
  return out;
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const payload = await req.json();
    const record: NotificationRecord | undefined = payload?.record ?? payload;
    if (!record?.id || !record?.target_role) {
      return new Response(JSON.stringify({ error: 'Invalid notification record' }), { status: 400 });
    }

    const enabled = Deno.env.get('WHATSAPP_ENABLED') === 'true';
    const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
    const templateName = Deno.env.get('WHATSAPP_TEMPLATE_NAME') ?? 'harvestflow_alert';

    if (!enabled || !token || !phoneNumberId) {
      await adminClient.from('notification_delivery_attempts').insert({
        notification_id: record.id,
        channel: 'whatsapp',
        status: 'skipped',
        error_message: 'WhatsApp Cloud API is disabled or not configured',
      });
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const { data: recipients } = await adminClient
      .from('profiles')
      .select('id, phone, preferred_language')
      .eq('role', record.target_role)
      .eq('is_active', true)
      .not('phone', 'is', null);

    if (!recipients || recipients.length === 0) {
      await adminClient.from('notification_delivery_attempts').insert({
        notification_id: record.id,
        channel: 'whatsapp',
        status: 'skipped',
        error_message: 'No active recipients with phone numbers for target role',
      });
      return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
    }

    let sent = 0;
    let failed = 0;

    for (const user of recipients) {
      const lang: 'fr' | 'es' = user.preferred_language === 'es' ? 'es' : 'fr';
      const title = renderText(lang, record.title_key, record.params);
      const body = renderText(lang, record.message_key, record.params);
      const to = String(user.phone).replace(/^\+/, '');

      try {
        const res = await fetch(
          `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to,
              type: 'template',
              template: {
                name: templateName,
                language: { code: lang },
                components: [
                  {
                    type: 'body',
                    parameters: [
                      { type: 'text', text: title },
                      { type: 'text', text: body },
                    ],
                  },
                ],
              },
            }),
          },
        );

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
        }

        const providerId = data?.messages?.[0]?.id ?? null;
        sent += 1;
        await adminClient.from('notification_delivery_attempts').insert({
          notification_id: record.id,
          user_id: user.id,
          channel: 'whatsapp',
          status: 'sent',
          provider_message_id: providerId,
        });
      } catch (err) {
        failed += 1;
        await adminClient.from('notification_delivery_attempts').insert({
          notification_id: record.id,
          user_id: user.id,
          channel: 'whatsapp',
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
