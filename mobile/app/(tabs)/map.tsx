import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config.js';
import { getAuthHeaders } from '../auth.js';
import { getActiveDrops, claimDrop, formatExpiry } from '../duckApi.js';

export default function RadarMapScreen() {
  const [location, setLocation] = useState(null);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [drops, setDrops] = useState([]);
  const [selectedDrop, setSelectedDrop] = useState(null);
  const [isClaiming, setIsClaiming] = useState(false);

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

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={location}
        showsUserLocation={true}
        onPress={() => setSelectedDrop(null)}
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
});