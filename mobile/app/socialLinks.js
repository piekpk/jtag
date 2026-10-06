// Shared social-link platform config for profile edit + public profile views.
// Stored on the user as settings.socialLinks: [{ platform: 'instagram', url: 'https://...' }]
import { Linking } from 'react-native';
import { showAlert } from './themedAlert.js';

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

// Keep only links for known platforms with a valid, platform-appropriate URL.
export function validSocialLinks(links) {
  if (!Array.isArray(links)) return [];
  return links.filter((l) => l && platformById(l.platform) && !validateSocialUrl(l.platform, l.url));
}

// Show the URL in a confirmation dialog before opening an external link.
export function confirmOpenLink(url, platformName) {
  const full = normalizeSocialUrl(url);
  showAlert(
    'Open this link?',
    `${platformName ? platformName + ':\n' : ''}${full}\n\nIt opens in your browser, outside Jtap.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open', onPress: () => Linking.openURL(full).catch(() => {}) },
    ],
  );
}

// Ensure the URL opens correctly (adds https:// when the scheme is missing).
export function normalizeSocialUrl(url) {
  const u = (url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return 'https://' + u;
}

// Expected domains per platform (Website accepts any domain).
const PLATFORM_DOMAINS = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com'],
  tiktok: ['tiktok.com'],
  youtube: ['youtube.com', 'youtu.be'],
  x: ['x.com', 'twitter.com'],
  reddit: ['reddit.com'],
  threads: ['threads.com', 'threads.net'],
  website: null,
};

// Returns an error message when the URL isn't appropriate, or null when valid.
export function validateSocialUrl(platformId, rawUrl) {
  const u = (rawUrl || '').trim();
  if (!u) return 'Enter a link.';
  if (/\s/.test(u)) return "Links can't contain spaces.";
  let host;
  try {
    host = new URL(normalizeSocialUrl(u)).hostname.toLowerCase();
  } catch (_) {
    return "That doesn't look like a valid link.";
  }
  if (!host.includes('.')) return "That doesn't look like a valid link.";
  const domains = PLATFORM_DOMAINS[platformId];
  if (domains && !domains.some((d) => host === d || host.endsWith('.' + d))) {
    const p = platformById(platformId);
    return `That doesn't look like a ${p ? p.name : 'valid'} link — use a ${domains[0]} URL.`;
  }
  return null;
}
