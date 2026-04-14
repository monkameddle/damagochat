import admin from 'firebase-admin';
import { config } from '../config/index.js';

let _app: admin.app.App | null = null;

export function getFcmApp(): admin.app.App | null {
  if (!config.FCM_PROJECT_ID || !config.FCM_CLIENT_EMAIL || !config.FCM_PRIVATE_KEY) {
    return null;
  }
  if (!_app) {
    _app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.FCM_PROJECT_ID,
        clientEmail: config.FCM_CLIENT_EMAIL,
        privateKey: config.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
  return _app;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export async function sendPushNotification(
  token: string,
  payload: PushPayload,
): Promise<void> {
  const app = getFcmApp();
  if (!app) {
    process.stderr.write('[fcm] FCM not configured, skipping push notification\n');
    return;
  }
  await app.messaging().send({
    token,
    notification: { title: payload.title, body: payload.body },
    ...(payload.data !== undefined && { data: payload.data }),
    android: { priority: 'high' },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  });
}
