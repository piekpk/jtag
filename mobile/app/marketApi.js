import { API_URL } from './config.js';
import { getAuthHeaders } from './auth.js';

export const MARKET_CATEGORIES = [
  'All', 'Wheels & Tires', 'Lighting', 'Recovery', 'Interior', 'Exterior', 'Other',
];

/** Full URL for a backend-served photo path like /uploads/marketplace/x.jpg */
export function photoUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${API_URL}${path}`;
}

const REQUEST_TIMEOUT_MS = 20000;

async function reqJson(path, options = {}) {
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
    return response.json();
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('Request timed out. Check your connection and try again.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function listMarketplace({ q = '', category = 'All', includeSold = false, limit = 50, offset = 0 } = {}) {
  const params = new URLSearchParams({
    q, category, limit: String(limit), offset: String(offset),
  });
  if (includeSold) params.set('include_sold', 'true');
  return reqJson(`/marketplace?${params.toString()}`);
}

export const getListing = (id) => reqJson(`/marketplace/${id}`);

export async function createListing({ photoUri, title, price, description, contactInfo, category }) {
  const filename = (photoUri.split('/').pop() || 'photo.jpg').split('?')[0];
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1].toLowerCase()}` : 'image/jpeg';

  const formData = new FormData();
  // @ts-ignore - React Native FormData expects this specific structure
  formData.append('photo', { uri: photoUri, name: filename, type });
  formData.append('title', title);
  formData.append('price', String(price || 0));
  formData.append('description', description);
  formData.append('contact_info', contactInfo);
  formData.append('category', category && category !== 'All' ? category : 'Other');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(`${API_URL}/marketplace`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
      headers: await getAuthHeaders(false),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Upload failed (${response.status})`);
    }
    return response.json();
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('Upload timed out. Check your connection and try again.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const deleteListing = (id) =>
  reqJson(`/marketplace/${id}`, { method: 'DELETE' });

export const markListingSold = (id, sold = true) =>
  reqJson(`/marketplace/${id}/sold?sold=${sold ? 'true' : 'false'}`, { method: 'POST' });
