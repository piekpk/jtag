// Google Sign-In configuration.
//
// You need TWO separate OAuth clients in Google Cloud
// (https://console.cloud.google.com/apis/credentials). They can NEVER share
// an ID - Google issues a unique client ID per client:
//
//   1. Application type "Web application", name it "Jtag web"
//      -> paste its client ID as GOOGLE_WEB_CLIENT_ID below.
//   2. Application type "Android", name it "Jtag Android"
//      Package name: com.jtap.app
//      SHA-1: 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25
//      Advanced settings -> "Enable Custom URI Scheme" must be ON.
//      -> paste its client ID as GOOGLE_ANDROID_CLIENT_ID below.
//
// The iOS client is optional until iOS is tested; the app falls back to the
// web ID on iOS when the placeholder is left in place.

export const GOOGLE_WEB_CLIENT_ID = "PASTE_WEB_CLIENT_ID_HERE";
export const GOOGLE_ANDROID_CLIENT_ID = "522179070431-rvj1a2vukkd8p45ld5pjcoi45qerab7v.apps.googleusercontent.com";
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
