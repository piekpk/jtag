// Shared social-link platform config for profile edit + public profile views.
// Stored on the user as settings.socialLinks: [{ platform: 'instagram', url: 'https://...' }]

// Brand icons bundled in mobile/assets/social/ (Simple Icons, brand colors;
// X / TikTok / Threads in white since their brand color is black-on-dark).
const ICONS = {
  instagram: require('../assets/social/instagram.png'),
  facebook: require('../assets/social/facebook.png'),
  tiktok: require('../assets/social/tiktok.png'),
  youtube: require('../assets/social/youtube.png'),
  x: require('../assets/social/x.png'),
  reddit: require('../assets/social/reddit.png'),
  threads: require('../assets/social/threads.png'),
  website: require('../assets/social/website.png'),
};

export const SOCIAL_PLATFORMS = [
  { id: 'instagram', name: 'Instagram', icon: ICONS.instagram, placeholder: 'instagram.com/yourname' },
  { id: 'facebook', name: 'Facebook', icon: ICONS.facebook, placeholder: 'facebook.com/yourname' },
  { id: 'tiktok', name: 'TikTok', icon: ICONS.tiktok, placeholder: 'tiktok.com/@yourname' },
  { id: 'youtube', name: 'YouTube', icon: ICONS.youtube, placeholder: 'youtube.com/@yourchannel' },
  { id: 'x', name: 'X', icon: ICONS.x, placeholder: 'x.com/yourname' },
  { id: 'reddit', name: 'Reddit', icon: ICONS.reddit, placeholder: 'reddit.com/u/yourname' },
  { id: 'threads', name: 'Threads', icon: ICONS.threads, placeholder: 'threads.com/@yourname' },
  { id: 'website', name: 'Website', icon: ICONS.website, placeholder: 'yourwebsite.com' },
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
