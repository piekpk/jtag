import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { onThemedAlert } from './themedAlert';

// Themed replacement for native Alert.alert: black & gold rounded card,
// mounted once in the root layout. Mirrors the native (title, message, buttons)
// API; buttons default to a single OK.
export default function ThemedAlert() {
  const [queue, setQueue] = useState([]);
  const current = queue.length > 0 ? queue[0] : null;

  useEffect(() => onThemedAlert((alert) => {
    setQueue((q) => [...q, alert]);
  }), []);

  if (!current) return null;

  const dismiss = () => setQueue((q) => q.slice(1));

  const pressButton = (btn) => {
    dismiss();
    if (btn.onPress) btn.onPress();
  };

  const buttons = current.buttons || [{ text: 'OK' }];
  const useRow = buttons.length <= 2;

  return (
    <Modal visible={true} transparent={true} animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {!!current.title && <Text style={styles.title}>{current.title}</Text>}
          {!!current.message && <Text style={styles.message}>{current.message}</Text>}
          <View style={[styles.btnWrap, useRow ? styles.btnRow : styles.btnCol]}>
            {buttons.map((btn, i) => {
              const primary = i === buttons.length - 1;
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.btn,
                    useRow && styles.btnFlex,
                    primary ? styles.btnPrimary : styles.btnSecondary,
                  ]}
                  onPress={() => pressButton(btn)}
                  activeOpacity={0.85}
                >
                  <Text style={primary ? styles.btnPrimaryText : styles.btnSecondaryText}>
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    backgroundColor: '#1e1e1e',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#d4af37',
    padding: 22,
    shadowColor: '#d4af37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    color: '#d4af37',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 18,
  },
  btnWrap: { marginTop: 2 },
  btnRow: { flexDirection: 'row' },
  btnCol: { flexDirection: 'column' },
  btn: {
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 4,
  },
  btnFlex: { flex: 1 },
  btnPrimary: { backgroundColor: '#d4af37' },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#d4af37',
  },
  btnPrimaryText: { color: '#121212', fontSize: 15, fontWeight: 'bold' },
  btnSecondaryText: { color: '#d4af37', fontSize: 15, fontWeight: '600' },
});
