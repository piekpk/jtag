// X (Twitter) Login configuration for the Jtap app.
//
// The Client ID comes from https://developer.x.com/ (your Project -> App ->
// Keys and tokens -> OAuth 2.0 Client ID). It is a public client ID and is
// safe to ship in the mobile client.
//
// The X app must have OAuth 2.0 enabled, Type = Native App, and
// "com.jtap.app://oauthredirect" registered as a Callback URI.

// X OAuth 2.0 endpoints (Authorization Code Flow with PKCE).
export const X_AUTHORIZATION_ENDPOINT = "https://twitter.com/i/oauth2/authorize";
export const X_TOKEN_ENDPOINT = "https://api.twitter.com/2/oauth2/token";

// Redirect URI registered in the X app settings. Two slashes: X's validator
// rejects the one-slash form that Google requires.
export const X_REDIRECT_URI = "com.jtap.app://oauthredirect";

export const X_CLIENT_ID = "PASTE_X_CLIENT_ID_HERE";

// True once a real X Client ID has been filled in.
export function xConfigured() {
  return typeof X_CLIENT_ID === "string" && !X_CLIENT_ID.startsWith("PASTE_");
}
