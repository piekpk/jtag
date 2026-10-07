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

export const getNearbySos = (lat, lng, radiusM = 16093) =>
  req(`/sos/nearby?lat=${lat}&lng=${lng}&radius_m=${radiusM}`);
export const createSos = (payload) =>
  req('/sos', { body: JSON.stringify(payload) });
export const respondSos = (sosId) =>
  req(`/sos/${sosId}/respond`, { method: 'POST' });
export const resolveSos = (sosId) =>
  req(`/sos/${sosId}/resolve`, { method: 'POST' });
export const cancelSos = (sosId) =>
  req(`/sos/${sosId}/cancel`, { method: 'POST' });

export const SOS_ISSUES = [
  { id: 'stuck', label: 'Stuck' },
  { id: 'breakdown', label: 'Breakdown' },
  { id: 'flat_tire', label: 'Flat tire' },
  { id: 'dead_battery', label: 'Dead battery' },
  { id: 'out_of_fuel', label: 'Out of fuel' },
  { id: 'other', label: 'Other' },
];

export function formatSosAge(isoString) {
  if (!isoString) return '';
  const d = new Date(/Z|[+-]\d{2}:?\d{2}$/.test(isoString) ? isoString : isoString + 'Z');
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.floor(mins / 60)} hr ${mins % 60} min ago`;
}
