import React, { useState } from 'react';
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
import { router } from 'expo-router';
import { showAlert } from './themedAlert.js';
import { API_URL } from './config.js';
import { getAuthHeaders } from './auth.js';

// Forgot password screen (issue #99). Two steps: enter the account email
// to have a 6-digit reset code emailed, then enter the code plus a new
// password. Reuses the Day 1 verification PIN system (purpose="reset"),
// so the code expires after 15 minutes and only works for resetting.
// Reached from the "Forgot password?" link on the login screen.
export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const requestCode = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      showAlert('Missing Email', 'Enter the email address for your account.');
      return;
    }
    setIsSending(true);
    try {
      const response = await fetch(`${API_URL}/auth/password-reset/request`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ email: trimmedEmail }),
      });
      const data = await response.json();
      if (response.ok) {
        // The server always reports success here, even when no account
        // exists for the email — it never says which it was.
        showAlert('Code Sent', 'If an account exists for this email, a 6-digit reset code is on its way. It expires in 15 minutes.');
        setEmail(trimmedEmail);
        setStep('reset');
      } else {
        showAlert('Could Not Send Code', data.detail || 'Please try again.');
      }
    } catch (error) {
      console.error('Request reset code network error:', error);
      showAlert('Connection Error', 'Failed to connect to the server. Please check your network and try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleReset = async () => {
    const trimmedCode = code.trim();
    if (trimmedCode.length !== 6) {
      showAlert('Invalid Code', 'Enter the 6-digit code from the email.');
      return;
    }
    if (!newPassword) {
      showAlert('Missing Password', 'Enter a new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert('Password Mismatch', 'The new passwords do not match.');
      return;
    }

    setIsResetting(true);
    try {
      const response = await fetch(`${API_URL}/auth/password-reset/confirm`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: trimmedCode, new_password: newPassword }),
      });

      const data = await response.json();

      if (response.ok) {
        showAlert('Password Reset', 'Your password has been reset. Sign in with your new password.');
        router.replace('/');
      } else {
        showAlert('Reset Failed', data.detail || 'That code did not work.');
      }
    } catch (error) {
      console.error('Reset password network error:', error);
      showAlert('Connection Error', 'Failed to connect to the server. Please check your network and try again.');
    } finally {
      setIsResetting(false);
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
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>
              {step === 'email'
                ? 'Enter the email for your account and we will send you a 6-digit reset code.'
                : `We sent a 6-digit code to ${email}. Enter it below with your new password — the code expires in 15 minutes.`}
            </Text>
          </View>

          {step === 'email' ? (
            <View style={styles.form}>
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="name@example.com"
                placeholderTextColor="#8e8e93"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />

              <TouchableOpacity
                style={[styles.actionButton, isSending && styles.actionButtonDisabled]}
                onPress={requestCode}
                disabled={isSending}
              >
                {isSending ? (
                  <ActivityIndicator color="#121212" />
                ) : (
                  <Text style={styles.actionButtonText}>Send Reset Code</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              <Text style={styles.label}>Reset Code</Text>
              <TextInput
                style={styles.codeInput}
                placeholder="123456"
                placeholderTextColor="#8e8e93"
                value={code}
                onChangeText={setCode}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="number-pad"
                maxLength={6}
              />

              <Text style={styles.label}>New Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#8e8e93"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
              />

              <Text style={styles.label}>Confirm New Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#8e8e93"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />

              <TouchableOpacity
                style={[styles.actionButton, isResetting && styles.actionButtonDisabled]}
                onPress={handleReset}
                disabled={isResetting}
              >
                {isResetting ? (
                  <ActivityIndicator color="#121212" />
                ) : (
                  <Text style={styles.actionButtonText}>Reset Password</Text>
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
          )}

          <View style={styles.footer}>
            <TouchableOpacity onPress={() => router.replace('/')}>
              <Text style={styles.backText}>Back to Sign In</Text>
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
    fontSize: 16,
    color: '#ffffff',
  },
  codeInput: {
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
  actionButton: {
    backgroundColor: '#d4af37',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  actionButtonDisabled: {
    backgroundColor: '#5c4a12',
    opacity: 0.7,
  },
  actionButtonText: {
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
  backText: {
    color: '#8e8e93',
    fontSize: 14,
  },
});
