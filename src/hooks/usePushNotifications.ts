import { useEffect } from 'react';
import { initPushNotifications } from '../services/push';

export function usePushNotifications() {
  useEffect(() => {
    initPushNotifications().catch(() => {});
  }, []);
}
