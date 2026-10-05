import { Redirect } from 'expo-router';

// Never shown: the tab bar renders NotificationBell as a custom tabBarButton
// that opens the inbox sheet instead of navigating here.
export default function NotificationsRoute() {
  return <Redirect href="/(tabs)/profile" />;
}
