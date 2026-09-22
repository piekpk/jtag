import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { API_URL } from '../config.js';

// Helper function to safely format image URLs and bypass hardcoded local IPs
const getImageUrl = (imagePath: string) => {
  if (!imagePath) return null;
  
  if (imagePath.includes('http://192.168.')) {
    return imagePath.replace(/http:\/\/192\.168\.\d+\.\d+:\d+/, API_URL);
  }
  
  if (imagePath.startsWith('http')) return imagePath;
  return `${API_URL}/${imagePath.startsWith('/') ? imagePath.slice(1) : imagePath}`;
};

export default function PublicRigScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [duckCount, setDuckCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDucking, setIsDucking] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(`${API_URL}/users/${id}/profile`, {
          headers: {
            'ngrok-skip-browser-warning': 'true'
          }
        });
        if (response.ok) {
          const data = await response.json();
          setProfile(data);
          setDuckCount(data.settings?.duckCount || 0);
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (id) fetchProfile();
  }, [id]);

  const handleDuckRig = async () => {
    if (isDucking) return;
    setIsDucking(true);
    try {
      const response = await fetch(`${API_URL}/users/${id}/duck`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setDuckCount(data.duckCount);
      } else {
        Alert.alert("Error", "Could not duck this rig.");
      }
    } catch (error) {
      console.error("Duck error:", error);
      Alert.alert("Network Error", "Failed to connect to the server.");
    } finally {
      setIsDucking(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#4caf50" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text>User not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={{ color: '#4caf50', fontSize: 18 }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const settings = profile.settings || {};
  const ownerName = settings.ownerName || 'Fellow Jeeper';
  const vehicleTitle = settings.vehicleTitle || 'Unknown Rig';
  const specs = settings.specs || { engine: 'N/A', wheels: 'N/A', interior: 'N/A' };
  const mods = settings.mods || 'No mods listed.';
  const photos = settings.photos || [];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{ownerName}'s Rig</Text>
            <Text style={styles.subtitle}>{vehicleTitle}</Text>
          </View>

          {/* Duck Button */}
          <TouchableOpacity 
            style={[styles.duckBtn, isDucking && { opacity: 0.6 }]} 
            onPress={handleDuckRig}
            disabled={isDucking}
          >
            <Text style={styles.duckBtnIcon}>🦆</Text>
            <Text style={styles.duckBtnCount}>{duckCount}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.photoGrid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.photoBox}>
            {photos[i] ? (
              <Image 
                source={{ 
                  uri: getImageUrl(photos[i]),
                  headers: { 
                    'ngrok-skip-browser-warning': 'true',
                    'User-Agent': 'JtapApp/1.0'
                  }
                }} 
                style={styles.photo} 
              />
            ) : (
              <Text style={styles.photoPlaceholder}>No Photo</Text>
            )}
          </View>
        ))}
      </View>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Vehicle Specs</Text>
        {Object.keys(specs).map((key) => (
          <View style={styles.specRow} key={key}>
            <Text style={styles.specLabel}>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
            <Text style={styles.specValue}>{specs[key]}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Active Mods & Gear</Text>
        <Text style={styles.modText}>{mods}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { padding: 25, paddingTop: 50, backgroundColor: '#1a1a1a' },
  backBtn: { marginBottom: 15 },
  backBtnText: { color: '#4caf50', fontSize: 16, fontWeight: 'bold' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 26, fontWeight: '900', color: '#ffffff', letterSpacing: 1 },
  subtitle: { fontSize: 15, color: '#4caf50', marginTop: 4, fontWeight: '600' },
  duckBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#333333', 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 20, 
    borderWidth: 1, 
    borderColor: '#ffeb3b' 
  },
  duckBtnIcon: { fontSize: 20, marginRight: 6 },
  duckBtnCount: { color: '#ffeb3b', fontWeight: 'bold', fontSize: 16 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 10, justifyContent: 'space-between' },
  photoBox: { width: '48%', height: 120, backgroundColor: '#e0e0e0', marginBottom: 10, borderRadius: 8, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  photoPlaceholder: { color: '#757575', fontWeight: '600' },
  photo: { width: '100%', height: '100%' },
  section: { marginHorizontal: 15, marginBottom: 15, padding: 20, backgroundColor: '#ffffff', borderRadius: 12, elevation: 3 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eeeeee', paddingBottom: 8 },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  specLabel: { fontSize: 16, color: '#666666', flex: 1 },
  specValue: { fontSize: 16, fontWeight: '600', color: '#333333', flex: 2, textAlign: 'right' },
  modText: { fontSize: 16, paddingVertical: 6, color: '#444444', lineHeight: 24 }
});