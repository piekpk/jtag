import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { showAlert } from './themedAlert.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './config.js';
import { getAuthHeaders } from './auth.js';

// Email verification screen (issue #100). Enter the 6-digit code emailed
// to the user's address. The first code is requested automatically when
// the screen opens; Resend requests a fresh one (the old code stops
// working). Reached after signup and from the My Rig tab when the email
// is still unverified.
export default function VerifyEmailScreen() {
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof emailParam === 'string' ? emailParam : '');
  const [code, setCode] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const requestedRef = useRef(false);

  // Opened without an email (e.g. from the profile): load it from the profile.
  useEffect(() => {
    const loadEmail = async () => {
      if (email) return;
      try {
        const storedUserId = await AsyncStorage.getItem('userId');
        if (!storedUserId) return;
        const response = await fetch(`${API_URL}/users/${storedUserId}/profile`, {
          headers: await getAuthHeaders(),
        });
        if (response.ok) {
          const data = await response.json();
          if (data.email) setEmail(data.email);
        }
      } catch (error) {
        console.error('Failed to load profile email:', error);
      }
    };
    loadEmail();
  }, []);

  const requestCode = async () => {
    setIsSending(true);
    try {
      const response = await fetch(`${API_URL}/auth/email-verification/request`, {
        method: 'POST',
        headers: await getAuthHeaders(),
      });
      const data = await response.json();
      if (response.ok) {
        showAlert('Code Sent', `We sent a 6-digit code to ${email || 'your email'}. It expires in 15 minutes.`);
      } else {
        showAlert('Could Not Send Code', data.detail || 'Please try again.');
      }
    } catch (error) {
      console.error('Request code network error:', error);
      showAlert('Connection Error', 'Failed to connect to the server. Please check your network and try again.');
    } finally {
      setIsSending(false);
    }
  };

  // Send the first code automatically when the screen opens.
  useEffect(() => {
    if (!requestedRef.current) {
      requestedRef.current = true;
      requestCode();
    }
  }, []);

  const handleVerify = async () => {
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      showAlert('Invalid Code', 'Enter the 6-digit code from the email.');
      return;
    }

    setIsVerifying(true);
    try {
      const response = await fetch(`${API_URL}/auth/email-verification/verify`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ code: trimmed }),
      });

      const data = await response.json();

      if (response.ok && data.email_verified) {
        showAlert('Email Verified', 'Thanks — your email is verified.');
        router.replace('/(tabs)/profile');
      } else {
        showAlert('Verification Failed', data.detail || 'That code did not work.');
      }
    } catch (error) {
      console.error('Verify network error:', error);
      showAlert('Connection Error', 'Failed to connect to the server. Please check your network and try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Verify Your Email</Text>
            <Text style={styles.subtitle}>
              {email
                ? `We sent a 6-digit code to ${email}. Enter it below — it expires in 15 minutes.`
                : 'We sent a 6-digit code to your email. Enter it below — it expires in 15 minutes.'}
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Verification Code</Text>
            <TextInput
              style={styles.input}
              placeholder="123456"
              placeholderTextColor="#8e8e93"
              value={code}
              onChangeText={setCode}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="number-pad"
              maxLength={6}
            />

            <TouchableOpacity
              style={[styles.verifyButton, isVerifying && styles.verifyButtonDisabled]}
              onPress={handleVerify}
              disabled={isVerifying}
            >
              {isVerifying ? (
                <ActivityIndicator color="#121212" />
              ) : (
                <Text style={styles.verifyButtonText}>Verify</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resendButton}
              onPress={requestCode}
              disabled={isSending}
            >
              {isSending ? (
                <ActivityIndicator color="#d4af37" />
              ) : (
                <Text style={styles.resendButtonText}>Resend code</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity onPress={() => router.replace('/(tabs)/profile')}>
              <Text style={styles.laterText}>I'll do this later</Text>
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
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
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
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    color: '#ffffff',
  },
  verifyButton: {
    backgroundColor: '#d4af37',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  verifyButtonDisabled: {
    backgroundColor: '#5c4a12',
    opacity: 0.7,
  },
  verifyButtonText: {
    color: '#121212',
    fontSize: 16,
    fontWeight: '700',
  },
  resendButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  resendButtonText: {
    color: '#d4af37',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 28,
  },
  laterText: {
    color: '#8e8e93',
    fontSize: 14,
  },
});
