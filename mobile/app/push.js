import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { setPushToken } from './notificationsApi.js';

// Show the notification as an alert when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    null
  );
}

/**
 * Ask for permission, grab the Expo push token, and register it with the
 * backend. Safe to call on every app start; failures are logged, never thrown.
 *
 * Requires (one-time, on Pawel's build machine):
 *  - `npx eas init` (free) so the app has an EAS projectId, and
 *  - google-services.json from Firebase in mobile/android/app/
 */
export async function registerPushToken() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Jtap',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const { status: asked } = await Notifications.requestPermissionsAsync();
      status = asked;
    }
    if (status !== 'granted') {
      console.log('Push permission not granted.');
      return null;
    }
    const projectId = getProjectId();
    if (!projectId) {
      console.log('Push skipped: no EAS projectId configured.');
      return null;
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await setPushToken(token);
    console.log('Push token registered.');
    return token;
  } catch (e) {
    console.log('Push registration failed:', e?.message || e);
    return null;
  }
}
