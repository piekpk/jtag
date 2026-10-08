import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { showAlert } from './themedAlert.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './config.js';
import { saveSession } from './auth.js';
import {
  GOOGLE_WEB_CLIENT_ID,
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  googleConfigured,
  filledIn,
} from './googleConfig.js';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isGoogleBusy, setIsGoogleBusy] = useState(false);

  // Google Sign-In request (ID token flow: the token goes to our backend,
  // which verifies it with Google and returns the app's own JWT).
  // Platform client IDs are optional: when left as placeholders, the web
  // client ID is used on every platform.
  const androidClientId = filledIn(GOOGLE_ANDROID_CLIENT_ID) || GOOGLE_WEB_CLIENT_ID;
  const iosClientId = filledIn(GOOGLE_IOS_CLIENT_ID) || GOOGLE_WEB_CLIENT_ID;
  const [gRequest, gResponse, gPromptAsync] = Google.useIdTokenAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    androidClientId,
    iosClientId,
  });

  // Check if user is already logged in on app startup
  useEffect(() => {
    const checkSession = async () => {
      try {
        const storedUserId = await AsyncStorage.getItem('userId');
        const storedToken = await AsyncStorage.getItem('userToken');
        if (storedUserId && storedToken) {
          router.replace('/(tabs)/profile');
        }
      } catch (error) {
        console.error("Session check error:", error);
      } finally {
        setIsCheckingSession(false);
      }
    };
    checkSession();
  }, []);

  // Handle the result of the Google sign-in browser flow
  useEffect(() => {
    if (gResponse?.type === 'success') {
      const idToken = gResponse.params.id_token;
      handleGoogleLogin(idToken);
    } else if (gResponse?.type === 'error') {
      showAlert('Google Sign-In', 'Google sign-in failed. Please try again.');
    }
  }, [gResponse]);

  const handleLogin = async () => {
    if (!email || !password) {
      showAlert('Missing Fields', 'Please enter your email and password.');
      return;
    }

    setIsSubmitting(true);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const response = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password: password,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        await saveSession(data.id, data.access_token);
        router.replace('/(tabs)/profile');
      } else {
        showAlert("Login Failed", data.detail || "Invalid email or password.");
      }
    } catch (error) {
      console.error("Network error:", error);
      showAlert("Connection Error", "Failed to connect to the server. Please check your network and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGooglePress = async () => {
    if (!googleConfigured()) {
      showAlert(
        'Not Configured',
        'Google sign-in needs your client IDs first. Open googleConfig.js and paste them in.'
      );
      return;
    }
    setIsGoogleBusy(true);
    try {
      await gPromptAsync();
    } finally {
      setIsGoogleBusy(false);
    }
  };

  const handleGoogleLogin = async (idToken) => {
    try {
      const response = await fetch(`${API_URL}/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ id_token: idToken }),
      });

      const data = await response.json();

      if (response.ok) {
        await saveSession(data.id, data.access_token);
        router.replace('/(tabs)/profile');
      } else {
        showAlert("Google Sign-In Failed", data.detail || "Could not sign you in with Google.");
      }
    } catch (error) {
      console.error("Google login network error:", error);
      showAlert("Connection Error", "Failed to connect to the server. Please check your network and try again.");
    }
  };

  if (isCheckingSession) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  const googleDisabled = !gRequest || isGoogleBusy;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Image source={require('../assets/icon.png')} style={styles.logo} />
            <Text style={styles.title}>Jtap</Text>
            <Text style={styles.subtitle}>Sign in to locate nearby rigs & trails</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              placeholder="name@example.com"
              placeholderTextColor="#8e8e93"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor="#8e8e93"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.loginButton, isSubmitting && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.loginButtonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={[styles.googleButton, googleDisabled && styles.googleButtonDisabled]}
              onPress={handleGooglePress}
              disabled={googleDisabled}
            >
              {isGoogleBusy ? (
                <ActivityIndicator color="#1a1a1a" />
              ) : (
                <>
                  <Image
                    source={require('../assets/google-g.png')}
                    style={styles.googleIcon}
                  />
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/signup')}>
              <Text style={styles.signupText}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#121212',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 110,
    height: 110,
    borderRadius: 24,
    marginBottom: 14,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#a0a0a0',
    marginTop: 6,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#d1d1d6',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#1e1e1e',
    borderWidth: 1,
    borderColor: '#333333',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#ffffff',
  },
  loginButton: {
    backgroundColor: '#d4af37',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  loginButtonDisabled: {
    backgroundColor: '#5c4a12',
    opacity: 0.7,
  },
  loginButtonText: {
    color: '#121212',
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#333333',
  },
  dividerText: {
    color: '#8e8e93',
    fontSize: 13,
    marginHorizontal: 12,
  },
  googleButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 13,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleIcon: {
    width: 20,
    height: 20,
    marginRight: 10,
  },
  googleButtonText: {
    color: '#1a1a1a',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 28,
  },
  footerText: {
    color: '#8e8e93',
    fontSize: 14,
  },
  signupText: {
    color: '#d4af37',
    fontSize: 14,
    fontWeight: '600',
  },
});
