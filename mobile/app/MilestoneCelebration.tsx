import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { onCelebration } from './celebration';

// Themed replacement for the native Alert.alert milestone popup:
// black & gold, rounded card, mounted once in the root layout so it can
// fire from any screen (map, ducks tab, rig profiles, ...).
export default function MilestoneCelebration() {
  const [queue, setQueue] = useState([]);
  const current = queue.length > 0 ? queue[0] : null;

  useEffect(() => onCelebration((completed) => {
    setQueue((q) => [...q, completed]);
  }), []);

  const dismiss = () => setQueue((q) => q.slice(1));

  if (!current) return null;

  const title = current.length === 1
    ? `Milestone complete: ${current[0].milestone.name}!`
    : `${current.length} milestones complete!`;

  return (
    <Modal visible={true} transparent={true} animationType="fade" onRequestClose={dismiss}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={dismiss}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {current.map((c, i) => (
            <Text key={i} style={styles.duckLine}>
              {c.duck.emoji} {c.duck.name}
            </Text>
          ))}
          <Text style={styles.subtitle}>Added to your inventory</Text>
          <TouchableOpacity style={styles.btn} onPress={dismiss} activeOpacity={0.85}>
            <Text style={styles.btnText}>Awesome!</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
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
    padding: 24,
    alignItems: 'center',
    shadowColor: '#d4af37',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    color: '#d4af37',
    fontSize: 19,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  duckLine: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginVertical: 3,
  },
  subtitle: {
    color: '#888',
    fontSize: 12.5,
    marginTop: 10,
    marginBottom: 16,
  },
  btn: {
    backgroundColor: '#d4af37',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 36,
  },
  btnText: {
    color: '#121212',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
