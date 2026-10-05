// Shared social-link platform config for profile edit + public profile views.
// Stored on the user as settings.socialLinks: [{ platform: 'instagram', url: 'https://...' }]

export const SOCIAL_PLATFORMS = [
  { id: 'instagram', name: 'Instagram', icon: '📸', placeholder: 'instagram.com/yourname' },
  { id: 'facebook', name: 'Facebook', icon: '📘', placeholder: 'facebook.com/yourname' },
  { id: 'tiktok', name: 'TikTok', icon: '🎵', placeholder: 'tiktok.com/@yourname' },
  { id: 'youtube', name: 'YouTube', icon: '▶️', placeholder: 'youtube.com/@yourchannel' },
  { id: 'x', name: 'X', icon: '✖️', placeholder: 'x.com/yourname' },
  { id: 'reddit', name: 'Reddit', icon: '👽', placeholder: 'reddit.com/u/yourname' },
  { id: 'threads', name: 'Threads', icon: '🧵', placeholder: 'threads.com/@yourname' },
];

export function platformById(id) {
  return SOCIAL_PLATFORMS.find((p) => p.id === id) || null;
}

// Keep only links for known platforms with a non-empty URL.
export function validSocialLinks(links) {
  if (!Array.isArray(links)) return [];
  return links.filter((l) => l && platformById(l.platform) && (l.url || '').trim());
}

// Ensure the URL opens correctly (adds https:// when the scheme is missing).
export function normalizeSocialUrl(url) {
  const u = (url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return 'https://' + u;
}
