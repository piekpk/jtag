import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, Alert, Modal, TextInput } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config.js';
import { getAuthHeaders } from '../auth.js';
import { getActiveDrops, createDrop, claimDrop, getInventory, formatExpiry, rarityColor } from '../duckApi.js';

const RADIUS_CHOICES = [50, 100, 200, 500];
const DURATION_CHOICES = [
  { label: '1 hr', hours: 1 },
  { label: '6 hrs', hours: 6 },
  { label: '24 hrs', hours: 24 },
];

export default function RadarMapScreen() {
  const [location, setLocation] = useState(null);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [drops, setDrops] = useState([]);
  const [selectedDrop, setSelectedDrop] = useState(null);
  const [isClaiming, setIsClaiming] = useState(false);
  // Drop creation state
  const [dropModalVisible, setDropModalVisible] = useState(false);
  const [dropCoord, setDropCoord] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [dropDuck, setDropDuck] = useState(null);
  const [dropClaims, setDropClaims] = useState(1);
  const [dropRadius, setDropRadius] = useState(100);
  const [dropDuration, setDropDuration] = useState(6);
  const [dropLabel, setDropLabel] = useState('');
  const [isDropping, setIsDropping] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const loggedInId = await AsyncStorage.getItem('userId');

        // 1. Get local permissions and coordinates
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          return;
        }

        let currentLocation = await Location.getCurrentPositionAsync({});
        const currentCoords = {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        };
        
        setLocation(currentCoords);

        // 2. Save this user's live location to the database (Matches browse screen logic)
        if (loggedInId) {
          await fetch(`${API_URL}/users/${loggedInId}/location`, {
            method: 'PUT',
            headers: await getAuthHeaders(),
            body: JSON.stringify({
              lat: currentCoords.latitude,
              lng: currentCoords.longitude
            })
          });
        }

        // 3. Fetch nearby users from your backend using your live coordinates via Ngrok
        const response = await fetch(
          `${API_URL}/users/nearby?lat=${currentCoords.latitude}&lng=${currentCoords.longitude}&radiusInMeters=8000`,
          {
            headers: await getAuthHeaders()
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          // Filter out the currently logged-in user so they don't overlap with your blue marker
          const nearbyUsersFiltered = data.filter(user => user.id.toString() !== loggedInId);
          setNearbyUsers(nearbyUsersFiltered); 
        }

        // 4. Fetch active duck drops near this location
        try {
          const activeDrops = await getActiveDrops(currentCoords.latitude, currentCoords.longitude);
          setDrops(activeDrops);
        } catch (e) {
          console.error("Failed to fetch drops:", e);
        }
      } catch (error) {
        console.error("Failed to fetch nearby users:", error);
      }
    })();
  }, []);

  const handleClaimDrop = async () => {
    if (!selectedDrop || isClaiming || !location) return;
    setIsClaiming(true);
    try {
      const result = await claimDrop(selectedDrop.id, location.latitude, location.longitude);
      Alert.alert("🦆 Duck claimed!", `You got a ${result.duck.emoji} ${result.duck.name}!`);
      setDrops(drops.filter((d) => d.id !== selectedDrop.id));
      setSelectedDrop(null);
    } catch (e) {
      Alert.alert("Couldn't claim", e.message || "Move closer and try again.");
    } finally {
      setIsClaiming(false);
    }
  };

  if (errorMsg) {
    return <View style={styles.centerContainer}><Text>{errorMsg}</Text></View>;
  }

  if (!location) {
    return <View style={styles.centerContainer}><ActivityIndicator size="large" color="#d4af37" /></View>;
  }

  const inRange = selectedDrop && selectedDrop.distance_m <= selectedDrop.radius_m && !selectedDrop.claimed_by_me;

  const openDropModal = async (coordinate) => {
    try {
      const inv = await getInventory();
      const spendable = inv.filter((i) => i.count > 0);
      if (spendable.length === 0) {
        Alert.alert("No ducks", "You're out of ducks! Claim a drop or trade with someone first.");
        return;
      }
      setInventory(spendable);
      setDropDuck(spendable[0]);
      setDropClaims(1);
      setDropRadius(100);
      setDropDuration(6);
      setDropLabel('');
      setDropCoord(coordinate);
      setDropModalVisible(true);
    } catch (e) {
      Alert.alert("Error", "Could not load your ducks.");
    }
  };

  const maxClaimsFor = (item) => Math.min(item ? item.count : 1, 20);

  const handleCreateDrop = async () => {
    if (!dropDuck || !dropCoord || isDropping) return;
    setIsDropping(true);
    try {
      await createDrop({
        duck_type_id: dropDuck.duck.id,
        latitude: dropCoord.latitude,
        longitude: dropCoord.longitude,
        radius_m: dropRadius,
        duration_hours: dropDuration,
        max_claims: dropClaims,
        label: dropLabel.trim() || null,
      });
      setDropModalVisible(false);
      const fresh = await getActiveDrops(location.latitude, location.longitude);
      setDrops(fresh);
      Alert.alert("🦆 Drop is live!", `${dropClaims}× ${dropDuck.duck.emoji} ${dropDuck.duck.name} waiting for nearby Jeepers.`);
    } catch (e) {
      Alert.alert("Couldn't create drop", e.message || "Not enough ducks of that type.");
    } finally {
      setIsDropping(false);
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={location}
        showsUserLocation={true}
        onPress={() => setSelectedDrop(null)}
        onLongPress={(e) => openDropModal(e.nativeEvent.coordinate)}
      >
        {/* Current User Marker */}
        <Marker
          coordinate={{ latitude: location.latitude, longitude: location.longitude }}
          title="2025 Jeep Wrangler 4xe Sahara"
          description="Jtap Proximity Active"
          pinColor="blue" 
        />
        
        {/* Nearby Users Markers */}
        {nearbyUsers.map((user) => {
          const ownerName = user.settings?.ownerName || 'Fellow Jeeper';
          const vehicleTitle = user.settings?.vehicleTitle || 'Jeep Wrangler';
          return (
            <Marker
              key={user.id}
              coordinate={{ latitude: user.latitude, longitude: user.longitude }}
              title={ownerName}
              description={vehicleTitle}
              pinColor="red"
            />
          );
        })}

        {/* Duck Drop Markers */}
        {drops.map((drop) => (
          <Marker
            key={`drop-${drop.id}`}
            coordinate={{ latitude: drop.latitude, longitude: drop.longitude }}
            onPress={(e) => { e.stopPropagation(); setSelectedDrop(drop); }}
          >
            <View style={[styles.dropMarker, drop.claimed_by_me && { opacity: 0.4 }]}>
              <Text style={styles.dropEmoji}>{drop.duck.emoji}</Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Selected drop detail card */}
      {selectedDrop && (
        <View style={styles.dropCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dropTitle}>
              {selectedDrop.duck.emoji} {selectedDrop.duck.name}
            </Text>
            <Text style={styles.dropMeta}>
              {formatExpiry(selectedDrop.expires_at)} • {selectedDrop.claims_left} left
              {selectedDrop.label ? ` • ${selectedDrop.label}` : ''}
            </Text>
            {!inRange && !selectedDrop.claimed_by_me && (
              <Text style={styles.dropHint}>
                {Math.round(selectedDrop.distance_m)}m away — get within {Math.round(selectedDrop.radius_m)}m to claim
              </Text>
            )}
            {selectedDrop.claimed_by_me && (
              <Text style={styles.dropHint}>Already claimed ✓</Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.claimBtn, (!inRange || isClaiming) && { opacity: 0.4 }]}
            onPress={handleClaimDrop}
            disabled={!inRange || isClaiming}
          >
            <Text style={styles.claimBtnText}>{isClaiming ? '...' : 'Claim'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Drop creation modal (long-press on map) */}
      <Modal visible={dropModalVisible} transparent animationType="slide" onRequestClose={() => setDropModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>🦆 Drop ducks here</Text>

            <Text style={styles.modalLabel}>Which duck?</Text>
            <View style={styles.chipRow}>
              {inventory.map((item) => (
                <TouchableOpacity
                  key={item.duck.id}
                  style={[styles.pickChip, dropDuck?.duck.id === item.duck.id && styles.pickChipActive]}
                  onPress={() => { setDropDuck(item); setDropClaims(1); }}
                >
                  <Text style={styles.pickEmoji}>{item.duck.emoji}</Text>
                  <Text style={styles.pickCount}>×{item.count}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>How many? <Text style={styles.modalHint}>(spent from your inventory)</Text></Text>
            <View style={styles.stepper}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setDropClaims(Math.max(1, dropClaims - 1))}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.stepValue}>{dropClaims}</Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setDropClaims(Math.min(maxClaimsFor(dropDuck), dropClaims + 1))}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>Claim radius</Text>
            <View style={styles.chipRow}>
              {RADIUS_CHOICES.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.optChip, dropRadius === r && styles.optChipActive]}
                  onPress={() => setDropRadius(r)}
                >
                  <Text style={[styles.optChipText, dropRadius === r && styles.optChipTextActive]}>{r}m</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.modalLabel}>Lasts</Text>
            <View style={styles.chipRow}>
              {DURATION_CHOICES.map((d) => (
                <TouchableOpacity
                  key={d.hours}
                  style={[styles.optChip, dropDuration === d.hours && styles.optChipActive]}
                  onPress={() => setDropDuration(d.hours)}
                >
                  <Text style={[styles.optChipText, dropDuration === d.hours && styles.optChipTextActive]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.labelInput}
              placeholder="Label (optional)"
              placeholderTextColor="#757575"
              value={dropLabel}
              onChangeText={setDropLabel}
              maxLength={60}
            />

            <TouchableOpacity
              style={[styles.dropBtn, isDropping && { opacity: 0.5 }]}
              onPress={handleCreateDrop}
              disabled={isDropping}
            >
              <Text style={styles.dropBtnText}>
                {isDropping ? 'Dropping...' : `Drop ${dropClaims}× ${dropDuck ? dropDuck.duck.emoji : ''}`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalClose} onPress={() => setDropModalVisible(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dropMarker: {
    backgroundColor: '#d4af37', width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#121212',
  },
  dropEmoji: { fontSize: 24 },
  dropCard: {
    position: 'absolute', bottom: 20, left: 15, right: 15,
    backgroundColor: '#1e1e1e', borderRadius: 14, padding: 15,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#d4af37',
  },
  dropTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  dropMeta: { color: '#d4af37', fontSize: 13, marginTop: 4 },
  dropHint: { color: '#888', fontSize: 12, marginTop: 4 },
  claimBtn: { backgroundColor: '#d4af37', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, marginLeft: 10 },
  claimBtnText: { color: '#121212', fontWeight: 'bold', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#1e1e1e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  modalLabel: { color: '#d4af37', fontWeight: '600', marginTop: 12, marginBottom: 8 },
  modalHint: { color: '#757575', fontWeight: '400', fontSize: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  pickChip: { backgroundColor: '#2c2c2e', borderRadius: 12, borderWidth: 2, borderColor: 'transparent', padding: 10, marginRight: 8, marginBottom: 8, alignItems: 'center', minWidth: 64 },
  pickChipActive: { borderColor: '#d4af37' },
  pickEmoji: { fontSize: 30 },
  pickCount: { color: '#d4af37', fontWeight: 'bold', fontSize: 12, marginTop: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: { backgroundColor: '#2c2c2e', borderWidth: 1, borderColor: '#d4af37', borderRadius: 8, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { color: '#d4af37', fontSize: 22, fontWeight: 'bold' },
  stepValue: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginHorizontal: 20, minWidth: 30, textAlign: 'center' },
  optChip: { backgroundColor: '#2c2c2e', borderRadius: 20, borderWidth: 1, borderColor: '#444', paddingVertical: 8, paddingHorizontal: 16, marginRight: 8, marginBottom: 8 },
  optChipActive: { borderColor: '#d4af37', backgroundColor: '#3a3220' },
  optChipText: { color: '#aaa', fontWeight: '600' },
  optChipTextActive: { color: '#d4af37' },
  labelInput: { backgroundColor: '#2c2c2e', borderRadius: 10, color: '#fff', padding: 12, marginTop: 14, fontSize: 15 },
  dropBtn: { backgroundColor: '#d4af37', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 16 },
  dropBtnText: { color: '#121212', fontWeight: 'bold', fontSize: 16 },
  modalClose: { marginTop: 8, padding: 12, alignItems: 'center' },
  modalCloseText: { color: '#888', fontSize: 16 },
});