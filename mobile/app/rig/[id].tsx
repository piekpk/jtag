import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, TouchableOpacity, Alert, Modal, FlatList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { API_URL } from '../config.js';
import { getAuthHeaders } from '../auth.js';
import { getInventory, giveDuck, getUserPond, proposeTrade, rarityColor, celebrateMilestones } from '../duckApi.js';

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
  const rigId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [duckCount, setDuckCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isDucking, setIsDucking] = useState(false);
  const [duckPickerVisible, setDuckPickerVisible] = useState(false);
  const [tradeModalVisible, setTradeModalVisible] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [theirPond, setTheirPond] = useState(null);
  const [tradeOffer, setTradeOffer] = useState(null);
  const [tradeRequest, setTradeRequest] = useState(null);
  const [isTrading, setIsTrading] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(`${API_URL}/users/${id}/profile`, {
          headers: await getAuthHeaders()
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

  const openDuckPicker = async () => {
    try {
      const inv = await getInventory();
      if (inv.length === 0) {
        Alert.alert("No ducks", "You're out of ducks! Claim a drop on the map or trade with someone.");
        return;
      }
      setInventory(inv);
      setDuckPickerVisible(true);
    } catch (error) {
      console.error("Inventory error:", error);
      Alert.alert("Error", "Could not load your ducks.");
    }
  };

  const handleGiveDuck = async (duckTypeId) => {
    if (isDucking) return;
    setIsDucking(true);
    try {
      const data = await giveDuck(rigId, duckTypeId);
      setDuckCount(data.recipient_duck_count);
      setDuckPickerVisible(false);
      Alert.alert("🦆 Ducked!", "Your duck has been delivered.");
      celebrateMilestones(data.milestones_completed);
    } catch (error) {
      console.error("Duck error:", error);
      Alert.alert("Error", error.message || "Could not duck this rig.");
    } finally {
      setIsDucking(false);
    }
  };

  const openTradeModal = async () => {
    try {
      const [inv, pond] = await Promise.all([getInventory(), getUserPond(rigId)]);
      setInventory(inv);
      setTheirPond(pond);
      setTradeOffer(null);
      setTradeRequest(null);
      setTradeModalVisible(true);
    } catch (error) {
      console.error("Trade modal error:", error);
      Alert.alert("Error", "Could not load trade data.");
    }
  };

  const handleProposeTrade = async () => {
    if (!tradeOffer || !tradeRequest || isTrading) return;
    setIsTrading(true);
    try {
      await proposeTrade({
        recipient_id: parseInt(rigId, 10),
        offered_duck_type_id: tradeOffer.duck.id,
        offered_qty: 1,
        requested_duck_type_id: tradeRequest.duck.id,
        requested_qty: 1,
      });
      setTradeModalVisible(false);
      Alert.alert("Trade proposed!", "They'll see it in their Ducks tab.");
    } catch (error) {
      Alert.alert("Error", error.message || "Could not propose trade.");
    } finally {
      setIsTrading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text>User not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={{ color: '#d4af37', fontSize: 18 }}>Go Back</Text>
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
    <View style={styles.container}>
    <ScrollView style={{ flex: 1 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{ownerName}'s Rig</Text>
            <Text style={styles.subtitle}>{vehicleTitle}</Text>
          </View>

          {/* Duck Button */}
          <TouchableOpacity 
            style={[styles.duckBtn, isDucking && { opacity: 0.6 }]} 
            onPress={openDuckPicker}
            disabled={isDucking}
          >
            <Text style={styles.duckBtnIcon}>🦆</Text>
            <Text style={styles.duckBtnCount}>{duckCount}</Text>
          </TouchableOpacity>
        </View>

        {/* Propose Trade Button */}
        <TouchableOpacity style={styles.tradeBtn} onPress={openTradeModal}>
          <Text style={styles.tradeBtnText}>⇄ Propose Duck Trade</Text>
        </TouchableOpacity>
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

    {/* Duck picker modal */}
    <Modal visible={duckPickerVisible} transparent animationType="slide" onRequestClose={() => setDuckPickerVisible(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>Pick a duck to give</Text>
          <FlatList
            data={inventory}
            keyExtractor={(item) => item.duck.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.duckRow, { borderColor: rarityColor(item.duck.rarity) }]}
                onPress={() => handleGiveDuck(item.duck.id)}
                disabled={isDucking}
              >
                <Text style={styles.duckRowEmoji}>{item.duck.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.duckRowName}>{item.duck.name}</Text>
                  <Text style={[styles.duckRowRarity, { color: rarityColor(item.duck.rarity) }]}>{item.duck.rarity}</Text>
                </View>
                <Text style={styles.duckRowCount}>×{item.count}</Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity style={styles.modalClose} onPress={() => setDuckPickerVisible(false)}>
            <Text style={styles.modalCloseText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

    {/* Trade proposal modal */}
    <Modal visible={tradeModalVisible} transparent animationType="slide" onRequestClose={() => setTradeModalVisible(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>Propose a trade</Text>
          <Text style={styles.modalLabel}>You offer:</Text>
          <ScrollView horizontal style={styles.pickRow} showsHorizontalScrollIndicator={false}>
            {inventory.map((item) => (
              <TouchableOpacity
                key={item.duck.id}
                style={[styles.pickChip, tradeOffer?.duck.id === item.duck.id && styles.pickChipActive]}
                onPress={() => setTradeOffer(item)}
              >
                <Text style={styles.pickEmoji}>{item.duck.emoji}</Text>
                <Text style={styles.pickCount}>×{item.count}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={styles.modalLabel}>You want (their pond):</Text>
          <ScrollView horizontal style={styles.pickRow} showsHorizontalScrollIndicator={false}>
            {(theirPond?.slots || []).filter((s) => s.unlocked && s.count > 0).map((slot) => (
              <TouchableOpacity
                key={slot.duck.id}
                style={[styles.pickChip, tradeRequest?.duck.id === slot.duck.id && styles.pickChipActive]}
                onPress={() => setTradeRequest(slot)}
              >
                <Text style={styles.pickEmoji}>{slot.duck.emoji}</Text>
                <Text style={styles.pickCount}>×{slot.count}</Text>
              </TouchableOpacity>
            ))}
            {(theirPond?.slots || []).filter((s) => s.unlocked && s.count > 0).length === 0 && (
              <Text style={styles.emptyNote}>They have no ducks to trade.</Text>
            )}
          </ScrollView>
          <TouchableOpacity
            style={[styles.proposeBtn, (!tradeOffer || !tradeRequest || isTrading) && { opacity: 0.5 }]}
            onPress={handleProposeTrade}
            disabled={!tradeOffer || !tradeRequest || isTrading}
          >
            <Text style={styles.proposeBtnText}>
              {tradeOffer && tradeRequest
                ? `Offer ${tradeOffer.duck.emoji} for ${tradeRequest.duck.emoji}`
                : 'Select both ducks'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalClose} onPress={() => setTradeModalVisible(false)}>
            <Text style={styles.modalCloseText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: { padding: 25, paddingTop: 50, backgroundColor: '#1a1a1a' },
  backBtn: { marginBottom: 15, backgroundColor: '#d4af37', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, alignSelf: 'flex-start' },
  backBtnText: { color: '#121212', fontSize: 16, fontWeight: 'bold' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 26, fontWeight: '900', color: '#ffffff', letterSpacing: 1 },
  subtitle: { fontSize: 15, color: '#d4af37', marginTop: 4, fontWeight: '600' },
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
  photoBox: { width: '48%', height: 120, backgroundColor: '#2c2c2e', marginBottom: 10, borderRadius: 8, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  photoPlaceholder: { color: '#757575', fontWeight: '600' },
  photo: { width: '100%', height: '100%' },
  section: { marginHorizontal: 15, marginBottom: 15, padding: 20, backgroundColor: '#1e1e1e', borderRadius: 12, elevation: 3 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#2c2c2e', paddingBottom: 8 },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  specLabel: { fontSize: 16, color: '#aaa', flex: 1 },
  specValue: { fontSize: 16, fontWeight: '600', color: '#fff', flex: 2, textAlign: 'right' },
  modText: { fontSize: 16, paddingVertical: 6, color: '#ccc', lineHeight: 24 },
  tradeBtn: { marginTop: 12, backgroundColor: '#2c2c2e', borderWidth: 1, borderColor: '#d4af37', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tradeBtnText: { color: '#d4af37', fontWeight: 'bold', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#1e1e1e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  modalLabel: { color: '#d4af37', fontWeight: '600', marginTop: 10, marginBottom: 8 },
  duckRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2c2c2e', borderRadius: 10, borderWidth: 1.5, padding: 12, marginBottom: 8 },
  duckRowEmoji: { fontSize: 32, marginRight: 12 },
  duckRowName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  duckRowRarity: { fontSize: 12, textTransform: 'capitalize' },
  duckRowCount: { color: '#d4af37', fontWeight: 'bold', fontSize: 16 },
  modalClose: { marginTop: 12, padding: 12, alignItems: 'center' },
  modalCloseText: { color: '#888', fontSize: 16 },
  pickRow: { flexDirection: 'row', marginBottom: 6 },
  pickChip: { backgroundColor: '#2c2c2e', borderRadius: 12, borderWidth: 2, borderColor: 'transparent', padding: 10, marginRight: 8, alignItems: 'center', minWidth: 64 },
  pickChipActive: { borderColor: '#d4af37' },
  pickEmoji: { fontSize: 30 },
  pickCount: { color: '#d4af37', fontWeight: 'bold', fontSize: 12, marginTop: 4 },
  emptyNote: { color: '#757575', fontStyle: 'italic', padding: 10 },
  proposeBtn: { backgroundColor: '#d4af37', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 14 },
  proposeBtnText: { color: '#121212', fontWeight: 'bold', fontSize: 16 },
});