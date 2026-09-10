import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function PublicRigScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const rigs = {
    '1': { name: '2023 Wrangler Rubicon', driver: 'TrailBoss99', engine: '2.0L Turbo', mods: '• 35" Tires\n• 2.5" Lift Kit\n• Warn Winch' },
    '2': { name: '2021 Gladiator Mojave', driver: 'MudCrawler', engine: '3.6L V6', mods: '• Fox Shocks\n• Bed Rack\n• Light bar' },
    '3': { name: '2015 Wrangler Sahara', driver: 'SaharaSteve', engine: '3.6L V6', mods: '• Stock Setup\n• All-Terrain Tires' }
  };
  
  const rig = rigs[id as keyof typeof rigs] || { name: 'Unknown Rig', driver: 'Unknown', engine: 'N/A', mods: 'None' };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back to Chat</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{rig.driver}'s Rig</Text>
        <Text style={styles.subtitle}>{rig.name}</Text>
      </View>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Vehicle Specs</Text>
        <View style={styles.specRow}>
          <Text style={styles.specLabel}>Engine</Text>
          <Text style={styles.specValue}>{rig.engine}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Active Mods & Gear</Text>
        <Text style={styles.modText}>{rig.mods}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { padding: 25, paddingTop: 50, backgroundColor: '#1a1a1a' },
  backBtn: { marginBottom: 15, paddingVertical: 5 },
  backBtnText: { color: '#4caf50', fontSize: 16, fontWeight: 'bold' },
  title: { fontSize: 32, fontWeight: '900', color: '#ffffff', letterSpacing: 1 },
  subtitle: { fontSize: 16, color: '#4caf50', marginTop: 8, fontWeight: '600' },
  section: { margin: 15, padding: 20, backgroundColor: '#ffffff', borderRadius: 12, elevation: 3 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eeeeee', paddingBottom: 8 },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  specLabel: { fontSize: 16, color: '#666666' },
  specValue: { fontSize: 16, fontWeight: '600', color: '#333333' },
  modText: { fontSize: 16, paddingVertical: 6, color: '#444444', lineHeight: 24 }
});