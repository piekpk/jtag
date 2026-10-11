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
      // Squad profile screen lands in S4.2 (#49); deep link is forward-compatible.
      router.push(`/squads/${data.id}`);
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
              placeholderTextColor="#8a8a8a"
              value={name}
              onChangeText={(t) => { setName(t); if (inlineError) setInlineError(''); }}
              maxLength={80}
              autoCapitalize="words"
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="What is this crew about?"
              placeholderTextColor="#8a8a8a"
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
              placeholderTextColor="#8a8a8a"
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
                ? <ActivityIndicator color="#fff" />
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
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1 },
  content: { padding: 20 },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 15, color: '#666', marginTop: 4 },
  form: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginTop: 6,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  toggle: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 2,
    borderColor: '#999', alignItems: 'center', justifyContent: 'center',
  },
  toggleOn: { backgroundColor: '#2e7d32', borderColor: '#2e7d32' },
  toggleCheck: { color: '#fff', fontWeight: '700' },
  toggleLabel: { marginLeft: 10, fontSize: 15 },
  error: { color: '#b3261e', marginTop: 12, fontSize: 14 },
  button: {
    backgroundColor: '#2e7d32', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  cancel: { alignItems: 'center', marginTop: 12, paddingVertical: 8 },
  cancelText: { color: '#666', fontSize: 15 },
});
