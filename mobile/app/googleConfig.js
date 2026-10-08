// Google Sign-In configuration.
//
// 1. Create your OAuth client IDs at:
//    https://console.cloud.google.com/apis/credentials
// 2. Paste each client ID below, replacing the PASTE_..._HERE placeholder.
//
// The ANDROID client ID is REQUIRED for Google sign-in on real Android devices:
// Google rejects the app's custom-scheme redirect when the web client is used.
// (The iOS ID is optional until iOS is tested; the app falls back to the web ID.)
// These IDs are public identifiers (not secrets), but keep them in this
// one file so nothing else needs editing.

export const GOOGLE_WEB_CLIENT_ID = "522179070431-rvj1a2vukkd8p45ld5pjcoi45qerab7v.apps.googleusercontent.com";
export const GOOGLE_ANDROID_CLIENT_ID = "522179070431-rvj1a2vukkd8p45ld5pjcoi45qerab7v.apps.googleusercontent.com";
export const GOOGLE_IOS_CLIENT_ID = "PASTE_IOS_CLIENT_ID_HERE";

// True once the web client ID has been filled in.
export function googleConfigured() {
  return !GOOGLE_WEB_CLIENT_ID.startsWith("PASTE_");
}

// Returns the client ID if it was filled in, otherwise undefined.
export function filledIn(clientId) {
  return clientId && !clientId.startsWith("PASTE_") ? clientId : undefined;
}
