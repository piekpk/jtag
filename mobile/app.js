import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, FlatList, Image, 
  TouchableOpacity, ActivityIndicator, Alert, SafeAreaView 
} from 'react-native';
import * as Location from 'expo-location';

// Use your computer's LAN IP so your phone can reach FastAPI over Wi-Fi
const API_BASE_URL = 'http://192.168.86.34:8000';

export default function App() {
  const [rigs, setRigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [coords, setCoords] = useState(null);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Allow location access to find nearby rigs.');
        // Fallback default coordinates (Long Island area)
        fetchNearbyRigs(40.7523, -73.4277);
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      setCoords(location.coords);
      fetchNearbyRigs(location.coords.latitude, location.coords.longitude);
    })();
  }, []);

  const fetchNearbyRigs = async (latitude, longitude) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/api/rigs/nearby?lat=${latitude}&lon=${longitude}`);
      const data = await res.json();
      setRigs(data);
    } catch (err) {
      Alert.alert('Network Error', 'Could not connect to FastAPI backend.');
    } finally {
      setLoading(false);
    }
  };

  const handleDuckWave = (handle) => {
    Alert.alert('Wave Sent!', `You tagged @${handle} with a digital duck.`);
  };

  const renderRigItem = ({ item }) => (
    <View style={styles.card}>
      <Image source={{ uri: item.image_url }} style={styles.cardImage} />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{item.distance_miles} mi away</Text>
      </View>
      <View style={styles.cardContent}>
        <View style={styles.row}>
          <Text style={styles.handle}>@{item.handle}</Text>
          <Text style={styles.radio}>{item.radio_channel}</Text>
        </View>
        <Text style={styles.specs}>{item.model_gen} • {item.trim} • {item.tire_size}" Tires</Text>
        <Text style={styles.winchText}>{item.has_winch ? 'Winch Equipped' : 'No Winch'}</Text>
        
        <TouchableOpacity 
          style={styles.waveButton} 
          onPress={() => handleDuckWave(item.handle)}
        >
          <Text style={styles.waveButtonText}>Send Wave</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>TRAILGRID</Text>
        <Text style={styles.subtitle}>Nearby 4x4 Rigs</Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#e67e22" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={rigs}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderRigItem}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={() => {
            if (coords) fetchNearbyRigs(coords.latitude, coords.longitude);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#272727' },
  title: { fontSize: 22, fontWeight: '900', color: '#e67e22', letterSpacing: 2 },
  subtitle: { fontSize: 13, color: '#888', marginTop: 2 },
  list: { padding: 12 },
  card: { backgroundColor: '#1e1e1e', borderRadius: 10, marginBottom: 16, overflow: 'hidden' },
  cardImage: { width: '100%', height: 180 },
  badge: { position: 'absolute', top: 12, right: 12, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cardContent: { padding: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  handle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  radio: { fontSize: 12, color: '#e67e22', fontWeight: '600' },
  specs: { fontSize: 14, color: '#aaa', marginTop: 4 },
  winchText: { fontSize: 12, color: '#4cd137', marginTop: 2 },
  waveButton: { marginTop: 12, backgroundColor: '#e67e22', paddingVertical: 10, borderRadius: 6, alignItems: 'center' },
  waveButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 }
});