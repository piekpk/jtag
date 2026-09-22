import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';

export default function RadarMapScreen() {
  const [location, setLocation] = useState(null);
  const [nearbyUsers, setNearbyUsers] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    (async () => {
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

      // 2. Fetch nearby users from your backend using your live coordinates
      try {
        // Replace with your actual Jtap backend API route
        const response = await fetch(
  `http://10.0.2.2:8000/users/nearby?lat=${currentCoords.latitude}&lng=${currentCoords.longitude}&radiusInMeters=8000`
);
        const data = await response.json();
        setNearbyUsers(data); 
      } catch (error) {
        console.error("Failed to fetch nearby users:", error);
      }
    })();
  }, []);

  if (errorMsg) {
    return <View style={styles.centerContainer}><Text>{errorMsg}</Text></View>;
  }

  if (!location) {
    return <View style={styles.centerContainer}><ActivityIndicator size="large" color="#0000ff" /></View>;
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={location}
        showsUserLocation={true}
      >
        {/* Current User Marker */}
        <Marker
          coordinate={{ latitude: location.latitude, longitude: location.longitude }}
          title="2025 Jeep Wrangler 4xe Sahara"
          description="Jtap Proximity Active"
          pinColor="blue" 
        />
        
        {/* Nearby Users Markers */}
        {nearbyUsers.map((user) => (
          <Marker
            key={user.id}
            coordinate={{ latitude: user.latitude, longitude: user.longitude }}
            title={user.vehicle_model || "Jeep Wrangler"}
            description={`Last seen: ${new Date(user.last_login).toLocaleDateString()}`}
            pinColor="red"
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});