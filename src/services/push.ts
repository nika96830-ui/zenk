import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { savePushToken } from './auth';

const isNative = Capacitor.isNativePlatform();

export async function initPushNotifications() {
  if (!isNative) return;
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;
  await PushNotifications.register();
  PushNotifications.addListener('registration', async (token) => {
    try { await savePushToken(token.value); } catch {}
  });
}
