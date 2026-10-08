// Google Sign-In configuration.
//
// 1. Create your OAuth client IDs at:
//    https://console.cloud.google.com/apis/credentials
// 2. Paste each client ID below, replacing the PASTE_..._HERE placeholder.
//
// These IDs are public identifiers (not secrets), but keep them in this
// one file so nothing else needs editing.

export const GOOGLE_WEB_CLIENT_ID = "522179070431-rvj1a2vukkd8p45ld5pjcoi45qerab7v.apps.googleusercontent.com";


// True once the web client ID has been filled in.
export function googleConfigured() {
  return !GOOGLE_WEB_CLIENT_ID.startsWith("PASTE_");
}
