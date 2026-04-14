/**
 * Push notification dispatch.
 *
 * Priority order:
 *   1. ntfy  — self-hosted, no Google, works on sideloaded + de-Googled devices
 *   2. OneSignal — free, requires Firebase/FCM under the hood (Google Play Services)
 *   3. FCM direct — requires Firebase account
 *
 * For sideloaded apps on normal Android: any option works.
 * For de-Googled devices (GrapheneOS etc.): use ntfy only.
 */
import { config } from '../config/index.js';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPushNotification(
  token: string,
  payload: PushPayload,
): Promise<void> {
  if (config.NTFY_URL) {
    await sendViaNtfy(token, payload);
    return;
  }

  if (config.ONESIGNAL_APP_ID && config.ONESIGNAL_API_KEY) {
    await sendViaOneSignal(token, payload);
    return;
  }

  if (config.FCM_PROJECT_ID && config.FCM_CLIENT_EMAIL && config.FCM_PRIVATE_KEY) {
    await sendViaFcm(token, payload);
    return;
  }

  process.stderr.write('[push] No push provider configured, skipping\n');
}

/**
 * ntfy: token = the topic the device subscribed to (e.g. "damagochat-user-u1")
 * Device subscribes to its own topic on app start.
 */
async function sendViaNtfy(topic: string, payload: PushPayload): Promise<void> {
  const url = `${config.NTFY_URL}/${topic}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Title': payload.title,
      'Content-Type': 'text/plain',
      ...(config.NTFY_TOKEN ? { 'Authorization': `Bearer ${config.NTFY_TOKEN}` } : {}),
      ...(payload.data ? { 'X-Tags': Object.entries(payload.data).map(([k, v]) => `${k}=${v}`).join(',') } : {}),
    },
    body: payload.body,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ntfy push failed (${res.status}): ${body}`);
  }
}

async function sendViaOneSignal(token: string, payload: PushPayload): Promise<void> {
  const res = await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${config.ONESIGNAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      app_id: config.ONESIGNAL_APP_ID,
      include_player_ids: [token],
      headings: { en: payload.title },
      contents: { en: payload.body },
      data: payload.data ?? {},
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OneSignal push failed (${res.status}): ${body}`);
  }
}

async function sendViaFcm(token: string, payload: PushPayload): Promise<void> {
  const { getFcmApp } = await import('./fcm.js');
  const app = getFcmApp();
  if (!app) return;

  await app.messaging().send({
    token,
    notification: { title: payload.title, body: payload.body },
    ...(payload.data !== undefined && { data: payload.data }),
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  });
}
