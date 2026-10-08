// Google Sign-In configuration.
//
// 1. Create your OAuth client IDs at:
//    https://console.cloud.google.com/apis/credentials
// 2. Paste each client ID below, replacing the PASTE_..._HERE placeholder.
//
// These IDs are public identifiers (not secrets), but keep them in this
// one file so nothing else needs editing.

export const GOOGLE_WEB_CLIENT_ID = "PASTE_WEB_CLIENT_ID_HERE";
export const GOOGLE_ANDROID_CLIENT_ID = "PASTE_ANDROID_CLIENT_ID_HERE";
export const GOOGLE_IOS_CLIENT_ID = "PASTE_IOS_CLIENT_ID_HERE";

// True once the client ID for the current platform has been filled in.
// The web ID is NOT required on native: Android uses GOOGLE_ANDROID_CLIENT_ID
// (iOS will use GOOGLE_IOS_CLIENT_ID). Requiring the web slot broke Android
// builds, so any filled-in ID counts as configured.
export function googleConfigured() {
  return [GOOGLE_WEB_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID, GOOGLE_IOS_CLIENT_ID]
    .some((id) => typeof id === "string" && !id.startsWith("PASTE_"));
}

// Returns the client ID if it was filled in, otherwise undefined.
export function filledIn(clientId) {
  return clientId && !clientId.startsWith("PASTE_") ? clientId : undefined;
}
