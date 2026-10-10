// Facebook Login configuration for the Jtap app.
//
// The Facebook App ID comes from https://developers.facebook.com/apps/
// (your app's Settings -> Basic). It is safe to ship in the mobile client.
//
// For Android, the app's key hash must be added under Settings -> Basic ->
// Android, and "com.jtap.app://oauthredirect" must be listed under
// Facebook Login -> Settings -> Valid OAuth Redirect URIs.

export const FB_APP_ID = "2223284278283422";

// True once a real Facebook App ID has been filled in.
export function facebookConfigured() {
  return typeof FB_APP_ID === "string" && !FB_APP_ID.startsWith("PASTE_");
}
