import { useEffect } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';

// Catches the OAuth redirect deep link (jtap:///oauthredirect).
// expo-auth-session consumes the URL through its own Linking listener;
// without this route, Expo Router shows "Unmatched Route" on top of the app
// after Google redirects back.
export default function OAuthRedirect() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, []);
  return <View />;
}
