import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

export async function hapticLight() {
  if (!isNative) return;
  try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
}
export async function hapticMedium() {
  if (!isNative) return;
  try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
}
export async function hapticHeavy() {
  if (!isNative) return;
  try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch {}
}
export async function hapticSuccess() {
  if (!isNative) return;
  try { await Haptics.notification({ type: NotificationType.Success }); } catch {}
}
export async function hapticError() {
  if (!isNative) return;
  try { await Haptics.notification({ type: NotificationType.Error }); } catch {}
}
