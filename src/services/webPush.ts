import { rpcDeactivatePushSubscription, rpcUpsertPushSubscription } from './supabaseApi';

export interface PushStatus {
  supported: boolean;
  isIosSafariWithoutPwa: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  vapidConfigured: boolean;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function detectIosSafariWithoutPwa(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return isIos && !isStandalone;
}

export function getVapidPublicKey(): string | undefined {
  return import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() || undefined;
}

export async function getWebPushStatus(): Promise<PushStatus> {
  const isIosSafariWithoutPwa = detectIosSafariWithoutPwa();
  const vapidConfigured = Boolean(getVapidPublicKey());
  const supported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  if (!supported) {
    return {
      supported: false,
      isIosSafariWithoutPwa,
      permission: 'unsupported',
      subscribed: false,
      vapidConfigured,
    };
  }

  let subscribed = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      subscribed = Boolean(sub);
    }
  } catch {
    subscribed = false;
  }

  return {
    supported: true,
    isIosSafariWithoutPwa,
    permission: Notification.permission,
    subscribed,
    vapidConfigured,
  };
}

async function waitForActiveServiceWorker(
  timeoutMs = 8000,
): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Worker is not supported in this browser.');
  }

  const existing = await navigator.serviceWorker.getRegistration();
  if (existing?.active) {
    return existing;
  }

  let timerId: number | undefined;
  try {
    const readyPromise = navigator.serviceWorker.ready;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = window.setTimeout(() => {
        reject(
          new Error(
            'Service Worker not active yet. Refresh the page (or restart the dev server) and try again.',
          ),
        );
      }, timeoutMs);
    });
    return await Promise.race([readyPromise, timeoutPromise]);
  } finally {
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
    }
  }
}

export async function enableWebPush(
  backendMode: 'supabase' | 'demo',
): Promise<{ ok: boolean; error?: string }> {
  if (!('Notification' in window)) {
    return { ok: false, error: 'Notifications are not supported in this browser.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, error: 'Notification permission was denied.' };
  }

  const vapidKey = getVapidPublicKey();
  if (backendMode === 'supabase' && vapidKey && 'serviceWorker' in navigator && 'PushManager' in window) {
    try {
      const reg = await waitForActiveServiceWorker();
      const applicationServerKey = urlBase64ToUint8Array(vapidKey);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
        } catch (subscribeErr) {
          // If a stale subscription exists under a different VAPID key, clear and retry once.
          const stale = await reg.pushManager.getSubscription();
          if (stale) {
            await stale.unsubscribe();
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey,
            });
          } else {
            throw subscribeErr;
          }
        }
      }

      const json = sub.toJSON();
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (!sub.endpoint || !p256dh || !auth) {
        return { ok: false, error: 'Browser did not return valid push subscription keys.' };
      }

      await rpcUpsertPushSubscription({
        endpoint: sub.endpoint,
        p256dh,
        auth,
        userAgent: navigator.userAgent.slice(0, 200),
      });
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      if (rawMessage.includes('rpc_upsert_push_subscription')) {
        return {
          ok: false,
          error:
            'Database push table not installed yet. Run supabase/migrations/0002_notifications_and_push.sql in Supabase SQL Editor.',
        };
      }
      return {
        ok: false,
        error: rawMessage,
      };
    }
  }

  return { ok: true };
}

export async function disableWebPush(backendMode: 'supabase' | 'demo'): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    if (backendMode === 'supabase' && endpoint) {
      await rpcDeactivatePushSubscription(endpoint).catch(() => {});
    }
  }
}

export async function sendLocalTestNotification(
  title: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!('Notification' in window)) {
    return { ok: false, error: 'Notifications are not supported in this browser.' };
  }
  if (Notification.permission !== 'granted') {
    return {
      ok: false,
      error: `Notification permission is "${Notification.permission}". Allow notifications for this site first.`,
    };
  }

  let swError: string | undefined;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg?.active) {
      await reg.showNotification(title, {
        body,
        tag: `hf-test-${Date.now()}`,
      });
      return { ok: true };
    }
  } catch (err) {
    swError = err instanceof Error ? err.message : String(err);
  }

  try {
    new Notification(title, {
      body,
      tag: `hf-test-${Date.now()}`,
    });
    return { ok: true };
  } catch (err) {
    const fallbackError = err instanceof Error ? err.message : String(err);
    return { ok: false, error: swError || fallbackError };
  }
}
