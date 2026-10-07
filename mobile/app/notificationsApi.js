import { API_URL } from './config.js';
import { getAuthHeaders } from './auth.js';

async function req(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: await getAuthHeaders(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Request failed (${response.status})`);
  }
  return response.json();
}

/** Newest-first inbox plus unread count. */
export const listNotifications = (limit = 30, offset = 0) =>
  req(`/notifications?limit=${limit}&offset=${offset}`);

export const markAllNotificationsRead = () =>
  req('/notifications/read-all', { method: 'POST' });

export const markNotificationRead = (id) =>
  req(`/notifications/${id}/read`, { method: 'POST' });

/** Register this device's Expo push token (empty string clears it). */
export const setPushToken = (token) =>
  req('/users/me/push-token', {
    method: 'POST',
    body: JSON.stringify({ token: token || '' }),
  });

/** Register this device's native FCM token for direct push (empty clears it). */
export const setFcmToken = (token) =>
  req('/users/me/fcm-token', {
    method: 'POST',
    body: JSON.stringify({ fcm_token: token || '' }),
  });
