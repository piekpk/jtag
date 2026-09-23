import { API_URL } from './config.js';
import { getAuthHeaders } from './auth.js';

export const RARITY_COLORS = {
  common: '#9e9e9e',
  rare: '#42a5f5',
  epic: '#ab47bc',
  legendary: '#d4af37',
};

export function rarityColor(rarity) {
  return RARITY_COLORS[rarity] || '#9e9e9e';
}

async function req(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...(options.body ? { method: options.method || 'POST' } : {}),
    ...options,
    headers: await getAuthHeaders(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Request failed (${response.status})`);
  }
  return response.json();
}

export const getDuckCatalog = () => req('/ducks/catalog');
export const getInventory = () => req('/ducks/inventory');
export const getMyPond = () => req('/ducks/pond');
export const getUserPond = (userId) => req(`/users/${userId}/pond`);
export const giveDuck = (recipientId, duckTypeId, note) =>
  req('/ducks/give', { body: JSON.stringify({ recipient_id: recipientId, duck_type_id: duckTypeId, note }) });
export const getDuckFeed = (limit = 50) => req(`/ducks/feed?limit=${limit}`);
export const getLeaderboard = ({ metric = 'given', days = 0, lat = null, lng = null, radiusM = 50000 } = {}) => {
  let path = `/ducks/leaderboard?metric=${metric}&days=${days}`;
  if (lat != null && lng != null) path += `&lat=${lat}&lng=${lng}&radius_m=${radiusM}`;
  return req(path);
};
export const getActiveDrops = (lat, lng, radiusM = 10000) =>
  req(`/drops/active?lat=${lat}&lng=${lng}&radius_m=${radiusM}`);
export const createDrop = (payload) =>
  req('/drops', { body: JSON.stringify(payload) });
export const claimDrop = (dropId, lat, lng) =>
  req(`/drops/${dropId}/claim`, { body: JSON.stringify({ lat, lng }) });
export const getTrades = (box = 'all') => req(`/trades?box=${box}`);
export const proposeTrade = (payload) =>
  req('/trades', { body: JSON.stringify(payload) });
export const acceptTrade = (tradeId) => req(`/trades/${tradeId}/accept`, { method: 'POST' });
export const declineTrade = (tradeId) => req(`/trades/${tradeId}/decline`, { method: 'POST' });
export const cancelTrade = (tradeId) => req(`/trades/${tradeId}/cancel`, { method: 'POST' });

export function formatExpiry(isoString) {
  const ms = new Date(isoString).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m left`;
  return `${Math.floor(hours / 24)}d left`;
}
