import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function BrowseScreen() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const loggedInId = await AsyncStorage.getItem('userId');
        setCurrentUserId(loggedInId);

        const response = await fetch('http://192.168.50.158:8000/users');
        if (response.ok) {
          const data = await response.json();
          // Filter out the currently logged-in user so they don't see themselves in the "nearby" list
          const nearbyUsers = data.filter(user => user.id.toString() !== loggedInId);
          setUsers(nearbyUsers);
        }
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const renderUser = ({ item }) => {
    const ownerName = item.settings?.ownerName || 'Fellow Jeeper';
    const vehicleTitle = item.settings?.vehicleTitle || 'Unknown Rig';
    const profilePic = item.profile_picture_url;

    return (
      <TouchableOpacity 
        style={styles.userCard} 
        onPress={() => router.push(/rig/ + item.id)}
      >
        <View style={styles.avatarContainer}>
          {profilePic ? (
            <Image source={{ uri: profilePic }} style={styles.avatar} />
          ) : (
            <Text style={styles.avatarPlaceholder}>🚙</Text>
          )}
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{ownerName}</Text>
          <Text style={styles.vehicleName}>{vehicleTitle}</Text>
        </View>
        <Text style={styles.viewBtn}>View</Text>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#4caf50" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Nearby Rigs</Text>
      </View>
      {users.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No other rigs found nearby.</Text>
        </View>
      ) : (
        <FlatList 
          data={users} 
          keyExtractor={item => item.id.toString()} 
          renderItem={renderUser} 
          contentContainerStyle={styles.list} 
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, backgroundColor: '#1a1a1a' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  list: { padding: 15 },
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 12, elevation: 2 },
  avatarContainer: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', marginRight: 15 },
  avatar: { width: '100%', height: '100%' },
  avatarPlaceholder: { fontSize: 24 },
  userInfo: { flex: 1 },
  userName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  vehicleName: { fontSize: 14, color: '#666', marginTop: 4 },
  viewBtn: { color: '#4caf50', fontWeight: 'bold', fontSize: 16 },
  emptyText: { fontSize: 16, color: '#888' }
});
