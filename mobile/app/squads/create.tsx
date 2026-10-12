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
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { showAlert } from '../themedAlert.js';
import { API_URL } from '../config.js';
import { getAuthHeaders } from '../auth.js';

export default function CreateSquadScreen() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [inlineError, setInlineError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setInlineError('Squad name is required.');
      return;
    }
    setInlineError('');
    setIsSubmitting(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/squads`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim() || null,
          avatar_url: avatarUrl.trim() || null,
          is_private: isPrivate,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setInlineError(data.detail || 'Could not create squad. Please try again.');
        return;
      }
      // Squad profile screen lands in Story 2.4 (S4.2, #49); until then,
      // go back with a success toast instead of pushing a dead route.
      showAlert('Squad Created', `"${trimmedName}" is ready.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      showAlert('Network Error', 'Could not reach the server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Create Squad</Text>
            <Text style={styles.subtitle}>Gather your trail crew in one place</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Squad Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Pine Barrens Riders"
              placeholderTextColor="#8e8e93"
              value={name}
              onChangeText={(t) => { setName(t); if (inlineError) setInlineError(''); }}
              maxLength={80}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="What is this crew about?"
              placeholderTextColor="#8e8e93"
              value={description}
              onChangeText={setDescription}
              maxLength={500}
              multiline
              numberOfLines={3}
            />

            <Text style={styles.label}>Avatar Image URL (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="https://..."
              placeholderTextColor="#8e8e93"
              value={avatarUrl}
              onChangeText={setAvatarUrl}
              autoCapitalize="none"
              keyboardType="url"
            />

            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setIsPrivate((v) => !v)}
              accessibilityRole="switch"
              accessibilityState={{ checked: isPrivate }}
            >
              <View style={[styles.toggle, isPrivate && styles.toggleOn]}>
                {isPrivate && <Text style={styles.toggleCheck}>✓</Text>}
              </View>
              <Text style={styles.toggleLabel}>Private squad (invite only)</Text>
            </TouchableOpacity>

            {inlineError ? <Text style={styles.error}>{inlineError}</Text> : null}

            <TouchableOpacity
              style={[styles.button, isSubmitting && styles.buttonDisabled]}
              onPress={handleCreate}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? <ActivityIndicator color="#121212" />
                : <Text style={styles.buttonText}>Create Squad</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancel} onPress={() => router.back()}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#121212' },
  container: { flex: 1 },
  content: { padding: 20 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 15, color: '#8e8e93', marginTop: 4 },
  form: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 12, color: '#fff' },
  input: {
    borderWidth: 1, borderColor: '#2c2c2e', borderRadius: 10,
    backgroundColor: '#1c1c1e', color: '#fff',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginTop: 6,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  toggle: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 2,
    borderColor: '#8e8e93', alignItems: 'center', justifyContent: 'center',
  },
  toggleOn: { backgroundColor: '#D4AF37', borderColor: '#D4AF37' },
  toggleCheck: { color: '#121212', fontWeight: '700' },
  toggleLabel: { marginLeft: 10, fontSize: 15, color: '#fff' },
  error: { color: '#f28b82', marginTop: 12, fontSize: 14 },
  button: {
    backgroundColor: '#D4AF37', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#121212', fontSize: 17, fontWeight: '600' },
  cancel: { alignItems: 'center', marginTop: 12, paddingVertical: 8 },
  cancelText: { color: '#8e8e93', fontSize: 15 },
});
