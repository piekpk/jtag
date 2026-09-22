import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function PublicRigScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(`http://192.168.50.158:8000/users/${id}/profile`);
        if (response.ok) {
          const data = await response.json();
          setProfile(data);
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (id) fetchProfile();
  }, [id]);

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
        <Text style={styles.title}>{ownerName}'s Rig</Text>
        <Text style={styles.subtitle}>{vehicleTitle}</Text>
      </View>

      <View style={styles.photoGrid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.photoBox}>
            {photos[i] ? (
              <Image source={{ uri: photos[i] }} style={styles.photo} />
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
  title: { fontSize: 28, fontWeight: '900', color: '#ffffff', letterSpacing: 1 },
  subtitle: { fontSize: 16, color: '#4caf50', marginTop: 8, fontWeight: '600' },
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
