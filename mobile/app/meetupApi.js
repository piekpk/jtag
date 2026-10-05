import { API_URL } from './config.js';
import { getAuthHeaders } from './auth.js';

const REQUEST_TIMEOUT_MS = 20000;

async function req(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...(options.body ? { method: options.method || 'POST' } : {}),
      ...options,
      signal: controller.signal,
      headers: await getAuthHeaders(),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Request failed (${response.status})`);
    }
    return await response.json().catch(() => ({}));
  } finally {
    clearTimeout(timer);
  }
}

export const getActiveMeetups = (lat, lng, radiusM = 50000) =>
  req(`/meetups/active?lat=${lat}&lng=${lng}&radius_m=${radiusM}`);
export const createMeetup = (payload) =>
  req('/meetups', { body: JSON.stringify(payload) });
export const rsvpMeetup = (meetupId) =>
  req(`/meetups/${meetupId}/rsvp`, { method: 'POST' });
export const leaveMeetup = (meetupId) =>
  req(`/meetups/${meetupId}/rsvp`, { method: 'DELETE' });
export const cancelMeetup = (meetupId) =>
  req(`/meetups/${meetupId}`, { method: 'DELETE' });

export function formatMeetupTime(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const day = sameDay ? 'Today' : isTomorrow ? 'Tomorrow'
    : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

export function formatDistance(m) {
  if (m == null) return '';
  if (m < 1000) return `${Math.round(m)}m away`;
  const mi = m / 1609.34;
  return mi < 10 ? `${mi.toFixed(1)} mi away` : `${Math.round(mi)} mi away`;
}
