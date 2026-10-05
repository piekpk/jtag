import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getUserPond, rarityColor } from '../duckApi.js';
import { API_URL } from '../config.js';
import DuckIcon from '../DuckIcon';

// Same image-URL handling as the public profile screen.
const getImageUrl = (imagePath) => {
  if (!imagePath) return null;
  if (imagePath.includes('http://192.168.')) {
    return imagePath.replace(/http:\/\/192\.168\.\d+\.\d+:\d+/, API_URL);
  }
  if (imagePath.startsWith('http')) return imagePath;
  return `${API_URL}/${imagePath.startsWith('/') ? imagePath.slice(1) : imagePath}`;
};

/**
 * Another user's duck pond. Opened by tapping the featured-duck row
 * on a public rig profile. Same grid + lore view as your own pond;
 * ducks they haven't unlocked stay hidden as ???.
 */
export default function UserPondScreen() {
  const { userId, name, coverPhoto } = useLocalSearchParams();
  const router = useRouter();
  const [pond, setPond] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDuck, setSelectedDuck] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setPond(await getUserPond(userId));
      } catch (e) {
        console.error('Failed to load pond:', e);
      } finally {
        setIsLoading(false);
      }
    };
    if (userId) load();
  }, [userId]);

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {coverPhoto ? (
        <View style={styles.coverWrap}>
          <Image
            source={{
              uri: getImageUrl(Array.isArray(coverPhoto) ? coverPhoto[0] : coverPhoto),
              headers: {
                'ngrok-skip-browser-warning': 'true',
                'User-Agent': 'JtapApp/1.0'
              }
            }}
            style={styles.coverImg}
          />
          <View style={styles.coverDim} />
          <View style={styles.coverTopRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.coverTitleWrap}>
            <Text style={styles.coverTitle}>{name ? `${name}'s Pond` : 'Duck Pond'}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{name ? `${name}'s Pond` : 'Duck Pond'}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll}>
        {!pond ? (
          <Text style={styles.errorText}>Could not load this pond.</Text>
        ) : (
          <>
            <Text style={styles.sectionHead}>
              {pond.unlocked} of {pond.total} ducks collected
            </Text>
            <View style={styles.grid}>
              {pond.slots.map((slot) => {
                const d = slot.duck;
                const c = rarityColor(d.rarity);
                return (
                  <TouchableOpacity
                    key={d.id}
                    style={[styles.duckCell, { borderColor: slot.unlocked ? c : '#333' }]}
                    onPress={() => slot.unlocked && setSelectedDuck({ ...d, count: slot.count })}
                    activeOpacity={slot.unlocked ? 0.7 : 1}
                  >
                    <DuckIcon
                      duck={slot.unlocked ? d : { emoji: '🦆' }}
                      size={40}
                      style={[!slot.unlocked && { opacity: 0.25 }]}
                    />
                    <Text style={[styles.duckName, !slot.unlocked && { color: '#666' }]} numberOfLines={1}>
                      {slot.unlocked ? d.name : '???'}
                    </Text>
                    {slot.unlocked && slot.count > 0 && (
                      <Text style={styles.duckCount}>×{slot.count}</Text>
                    )}
                    <Text style={[styles.rarityTag, { color: c }]}>{d.rarity}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.hint}>
              Locked ducks stay hidden as ??? — the mystery is part of the hunt.
            </Text>
          </>
        )}
      </ScrollView>

      {/* Duck lore modal (tap an unlocked pond duck) */}
      <Modal visible={!!selectedDuck} transparent animationType="fade"
        onRequestClose={() => setSelectedDuck(null)}>
        <View style={styles.loreOverlay}>
          <View style={styles.loreBox}>
            {selectedDuck && (
              <>
                <DuckIcon duck={selectedDuck} size={72} />
                <Text style={styles.loreName}>{selectedDuck.name}</Text>
                <Text style={[styles.loreRarity, { color: rarityColor(selectedDuck.rarity) }]}>
                  {selectedDuck.rarity}{selectedDuck.count > 0 ? ` • ×${selectedDuck.count}` : ''}
                </Text>
                {selectedDuck.description ? (
                  <Text style={styles.loreDesc}>{selectedDuck.description}</Text>
                ) : null}
                {selectedDuck.lore ? (
                  <Text style={styles.loreText}>{selectedDuck.lore}</Text>
                ) : (
                  <Text style={styles.lorePending}>Legend still being written…</Text>
                )}
                <TouchableOpacity style={styles.loreClose} onPress={() => setSelectedDuck(null)}>
                  <Text style={styles.loreCloseText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
  backBtn: { backgroundColor: '#d4af37', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, marginRight: 8 },
  backText: { color: '#121212', fontSize: 16, fontWeight: 'bold' },
  coverWrap: { height: 220, position: 'relative' },
  coverImg: { width: '100%', height: '100%' },
  coverDim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.15)' },
  coverTopRow: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 50 },
  coverTitleWrap: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  coverTitle: { fontSize: 26, fontWeight: '900', color: '#ffffff', letterSpacing: 1, textShadowColor: 'rgba(0,0,0,0.85)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  scroll: { padding: 16 },
  errorText: { color: '#e0e0e0', fontSize: 14, textAlign: 'center', marginTop: 32 },
  sectionHead: { color: '#d4af37', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  duckCell: {
    width: '31%', aspectRatio: 0.85, backgroundColor: '#1e1e1e', borderRadius: 12,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 12, padding: 6,
  },
  duckName: { color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  duckCount: { color: '#d4af37', fontSize: 13, fontWeight: 'bold' },
  rarityTag: { fontSize: 10, textTransform: 'capitalize', marginTop: 2 },
  hint: { color: '#757575', fontSize: 13, marginTop: 8, lineHeight: 20, fontStyle: 'italic' },
  loreOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  loreBox: { backgroundColor: '#1e1e1e', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340, alignItems: 'center', borderWidth: 1, borderColor: '#d4af37' },
  loreName: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 8 },
  loreRarity: { fontSize: 13, fontWeight: '700', textTransform: 'capitalize', marginTop: 4 },
  loreDesc: { color: '#d4af37', fontSize: 14, fontStyle: 'italic', textAlign: 'center', marginTop: 10 },
  loreText: { color: '#e0e0e0', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 10 },
  lorePending: { color: '#8e8e93', fontSize: 13, fontStyle: 'italic', marginTop: 10 },
  loreClose: { backgroundColor: '#d4af37', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 28, marginTop: 18 },
  loreCloseText: { color: '#121212', fontWeight: '700', fontSize: 14 },
});
