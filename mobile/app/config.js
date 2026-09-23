// config.js
// Central API configuration. Set EXPO_PUBLIC_API_URL in your environment
// (e.g. in .env) to point at your backend. Falls back to localhost for dev.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";
