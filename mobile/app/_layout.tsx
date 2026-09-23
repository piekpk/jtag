import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Root layout: guarantees a black system status bar with light icons on every
// screen and every Android device (notches, punch-holes, foldables, edge-to-edge).
// The native bar color comes from app.config.js `androidStatusBar`; this runtime
// StatusBar re-asserts it on every route, and the black root view means the bar
// region can never show a light flash behind it.
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="light" backgroundColor="#000000" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#121212' },
          }}
        />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
});
