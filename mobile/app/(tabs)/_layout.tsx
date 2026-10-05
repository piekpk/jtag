import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { registerPushToken } from '../push';

export default function TabLayout() {
  const router = useRouter();

  useEffect(() => {
    registerPushToken();
    // Tapping a push notification deep-links: ducked -> Ducks tab.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const type = response?.notification?.request?.content?.data?.type;
      if (type === 'ducked') router.push('/(tabs)/ducks');
    });
    return () => sub.remove();
  }, []);
  return (
    <Tabs
      initialRouteName="profile"
      screenOptions={{
        headerShown: false,
        // Hide the tab bar while the keyboard is open so it can't cover
        // text inputs (e.g. the Trail Chat message box).
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: '#1a1a1a',
          borderTopColor: '#2c2c2e',
        },
        tabBarActiveTintColor: '#d4af37',
        tabBarInactiveTintColor: '#8e8e93',
      }}
    >
      <Tabs.Screen
        name="profile"
        options={{
          title: 'My Rig',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="car-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ducks"
        options={{
          title: 'Ducks',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Browse',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Radar Map',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Trail Chat',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'Market',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pricetag-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}