import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, SafeAreaView, TextInput, Animated, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { API_URL } from '../config.js';
import { getAuthHeaders } from '../auth.js';

// Rotating browse header banners (bundled assets).
const BROWSE_HEADERS = [
  require('../../assets/browse-headers/browse-convoy.webp'),
  require('../../assets/browse-headers/browse-nightrun.webp'),
  require('../../assets/browse-headers/browse-dunes.webp'),
  require('../../assets/browse-headers/browse-campfire.webp'),
];
const BROWSE_HEADER_KEY = 'jtap_browse_header_idx';

// Helper function to safely format image URLs and bypass hardcoded local IPs
const getImageUrl = (imagePath: string) => {
  if (!imagePath) return null;
  
  if (imagePath.includes('http://192.168.')) {
    return imagePath.replace(/http:\/\/192\.168\.\d+\.\d+:\d+/, API_URL);
  }
  
  if (imagePath.startsWith('http')) return imagePath;
  return `${API_URL}/${imagePath.startsWith('/') ? imagePath.slice(1) : imagePath}`;
};

export default function BrowseScreen() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = not searching
  const [isSearching, setIsSearching] = useState(false);
  // Squads section state (S7.2, #58).
  const [segment, setSegment] = useState('people'); // 'people' | 'squads'
  const [squadQuery, setSquadQuery] = useState('');
  const [mySquads, setMySquads] = useState([]);
  const [squads, setSquads] = useState([]);
  const [squadsLoading, setSquadsLoading] = useState(false);
  const [headerIdx, setHeaderIdx] = useState(0);
  const headerFade = useRef(new Animated.Value(1)).current;

  // Load the user's chosen browse header; tapping the header switches it.
  useEffect(() => {
    AsyncStorage.getItem(BROWSE_HEADER_KEY).then((v) => {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n) && n >= 0 && n < BROWSE_HEADERS.length) setHeaderIdx(n);
    }).catch(() => {});
  }, []);

  const chooseHeader = (i) => {
    const next = ((i % BROWSE_HEADERS.length) + BROWSE_HEADERS.length) % BROWSE_HEADERS.length;
    if (next === headerIdx) return;
    Animated.timing(headerFade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
      setHeaderIdx(next);
      AsyncStorage.setItem(BROWSE_HEADER_KEY, String(next)).catch(() => {});
      Animated.timing(headerFade, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    });
  };

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const loggedInId = await AsyncStorage.getItem('userId');
        setCurrentUserId(loggedInId);

        // 1. Get the current location
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.error("Permission to access location was denied");
          setIsLoading(false);
          return;
        }
        let location = await Location.getCurrentPositionAsync({});

        // 2. Save this user's live location to the database
        if (loggedInId) {
          await fetch(`${API_URL}/users/${loggedInId}/location`, {
            method: 'PUT',
            headers: await getAuthHeaders(),
            body: JSON.stringify({
              lat: location.coords.latitude,
              lng: location.coords.longitude
            })
          });
        }

        // 3. Fetch nearby users (8046.72 meters = 5 miles)
        const response = await fetch(
          `${API_URL}/users/nearby?lat=${location.coords.latitude}&lng=${location.coords.longitude}&radiusInMeters=8046.72`,
          {
            headers: await getAuthHeaders()
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          // Filter out the currently logged-in user so they don't see themselves
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

  // Global user search (debounced). Finds any registered, discoverable user —
  // no location needed and none is returned.
  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const t = setTimeout(async () => {
      try {
        const loggedInId = await AsyncStorage.getItem('userId');
        const res = await fetch(
          `${API_URL}/users/search?q=${encodeURIComponent(query.trim())}`,
          { headers: await getAuthHeaders() }
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.filter((u) => u.id.toString() !== loggedInId));
        }
      } catch (e) {
        console.error('User search failed:', e);
      } finally {
        setIsSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  // Squad discovery (S7.2, #58): "My squads" plus public discovery, debounced search.
  useEffect(() => {
    if (segment !== 'squads') return;
    let cancelled = false;
    const load = async () => {
      setSquadsLoading(true);
      try {
        const headers = await getAuthHeaders();
        const q = squadQuery.trim();
        const [mineRes, allRes] = await Promise.all([
          fetch(`${API_URL}/squads?mine=true&limit=50`, { headers }),
          fetch(`${API_URL}/squads?limit=20${q ? `&q=${encodeURIComponent(q)}` : ''}`, { headers }),
        ]);
        if (cancelled) return;
        if (mineRes.ok) setMySquads(await mineRes.json());
        if (allRes.ok) setSquads(await allRes.json());
      } catch (e) {
        console.error('Squad discovery failed:', e);
      } finally {
        if (!cancelled) setSquadsLoading(false);
      }
    };
    const t = setTimeout(load, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [segment, squadQuery]);

  const renderUser = ({ item }) => {
    const ownerName = item.settings?.ownerName || 'Fellow Jeeper';
    const vehicleTitle = item.settings?.vehicleTitle || 'Unknown Rig';
    const profilePic = item.profile_picture_url;

    return (
      <TouchableOpacity 
        style={styles.userCard} 
        onPress={() => router.push(`/rig/${item.id}`)}
      >
        <View style={styles.avatarContainer}>
          {profilePic ? (
            <Image 
              source={{ 
                uri: getImageUrl(profilePic),
                headers: { 
                  'ngrok-skip-browser-warning': 'true',
                  'User-Agent': 'JtapApp/1.0'
                }
              }} 
              style={styles.avatar} 
            />
          ) : (
            <Text style={styles.avatarPlaceholder}>🚙</Text>
          )}
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{ownerName}</Text>
          <Text style={styles.vehicleName}>{vehicleTitle}</Text>
        </View>
        <TouchableOpacity 
          style={styles.viewBtn} 
          onPress={() => router.push(`/rig/${item.id}`)}
        >
          <Text style={styles.viewBtnText}>View</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderSquad = ({ item }) => {
    return (
      <TouchableOpacity
        style={styles.userCard}
        onPress={() => router.push(`/squads/${item.id}`)}
      >
        <View style={styles.avatarContainer}>
          {item.avatar_url ? (
            <Image
              source={{
                uri: getImageUrl(item.avatar_url),
                headers: {
                  'ngrok-skip-browser-warning': 'true',
                  'User-Agent': 'JtapApp/1.0'
                }
              }}
              style={styles.avatar}
            />
          ) : (
            <Text style={styles.avatarPlaceholder}>\uD83D\uDEE1\uFE0F</Text>
          )}
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.name}{item.is_private ? ' \uD83D\uDD12' : ''}</Text>
          <Text style={styles.vehicleName}>
            {item.member_count} {item.member_count === 1 ? 'member' : 'members'}
            {item.my_role ? ` \u00B7 ${item.my_role}` : ''}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.viewBtn}
          onPress={() => router.push(`/squads/${item.id}`)}
        >
          <Text style={styles.viewBtnText}>View</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  const searching = searchResults !== null;
  const listData = searching ? searchResults : users;
  const emptyText = searching
    ? (isSearching ? 'Searching…' : `No rigs found for "${query.trim()}".`)
    : 'No other rigs found nearby.';

  return (
    <SafeAreaView style={styles.container}>
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={() => chooseHeader(headerIdx + 1)}
        style={styles.browseHeader}
      >
        <Animated.Image
          source={BROWSE_HEADERS[headerIdx]}
          style={[styles.browseHeaderImg, { opacity: headerFade }]}
          resizeMode="cover"
        />
        <View style={styles.browseHeaderDim} />
        <Text style={styles.browseSwitchHint}>tap to switch</Text>
        <View style={styles.browseHeaderTextWrap}>
          <Text style={styles.browseHeaderTitle}>{searching ? 'Search Results' : 'Nearby Rigs'}</Text>
        </View>
        <View style={styles.browseDots}>
          {BROWSE_HEADERS.map((_, i) => (
            <View key={i} style={[styles.browseDot, i === headerIdx && styles.browseDotActive]} />
          ))}
        </View>
      </TouchableOpacity>
      <View style={styles.segmentRow}>
        <TouchableOpacity
          style={[styles.segmentBtn, segment === 'people' && styles.segmentBtnActive]}
          onPress={() => setSegment('people')}
        >
          <Text style={[styles.segmentText, segment === 'people' && styles.segmentTextActive]}>People</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, segment === 'squads' && styles.segmentBtnActive]}
          onPress={() => setSegment('squads')}
        >
          <Text style={[styles.segmentText, segment === 'squads' && styles.segmentTextActive]}>Squads</Text>
        </TouchableOpacity>
      </View>
      {segment === 'people' ? (
      <>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search all Jeepers by name or rig…"
          placeholderTextColor="#888"
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>
      {listData.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={item => item.id.toString()}
          renderItem={renderUser}
          contentContainerStyle={styles.list}
        />
      )}
      </>
      ) : (
      <>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          value={squadQuery}
          onChangeText={setSquadQuery}
          placeholder="Search squads by name\u2026"
          placeholderTextColor="#888"
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>
      <TouchableOpacity
        style={styles.createSquadBtn}
        onPress={() => router.push('/squads/create')}
      >
        <Text style={styles.createSquadText}>+ Create squad</Text>
      </TouchableOpacity>
      {squadsLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#d4af37" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {mySquads.length > 0 && (
            <View>
              <Text style={styles.sectionHeader}>My squads</Text>
              {mySquads.map((s) => (
                <View key={`mine-${s.id}`}>{renderSquad({ item: s })}</View>
              ))}
            </View>
          )}
          {squads.length > 0 && (
            <View>
              <Text style={styles.sectionHeader}>Discover</Text>
              {squads.map((s) => (
                <View key={`all-${s.id}`}>{renderSquad({ item: s })}</View>
              ))}
            </View>
          )}
          {mySquads.length === 0 && squads.length === 0 && (
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No squads found. Create one to get started.</Text>
            </View>
          )}
        </ScrollView>
      )}
      </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  browseHeader: { height: 150, overflow: 'hidden', backgroundColor: '#1e1e1e' },
  browseHeaderImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  browseHeaderDim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  browseHeaderTextWrap: { position: 'absolute', left: 20, bottom: 14 },
  browseHeaderTitle: { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: 0.5, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  browseSwitchHint: { position: 'absolute', top: 10, right: 12, fontSize: 10, color: 'rgba(255,255,255,0.65)', fontStyle: 'italic' },
  browseDots: { position: 'absolute', right: 12, bottom: 16, flexDirection: 'row' },
  browseDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)', marginLeft: 5 },
  browseDotActive: { backgroundColor: '#d4af37' },
  searchBar: { paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#1a1a1a' },
  searchInput: {
    backgroundColor: '#2c2c2e', color: '#fff', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 14, fontSize: 15,
  },
  list: { padding: 15 },
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', padding: 15, borderRadius: 12, marginBottom: 12, elevation: 2 },
  avatarContainer: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#2c2c2e', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', marginRight: 15 },
  avatar: { width: '100%', height: '100%' },
  avatarPlaceholder: { fontSize: 24 },
  userInfo: { flex: 1 },
  userName: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  vehicleName: { fontSize: 14, color: '#aaa', marginTop: 4 },
  viewBtn: { backgroundColor: '#d4af37', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
  viewBtnText: { color: '#121212', fontWeight: 'bold', fontSize: 16 },
  emptyText: { fontSize: 16, color: '#888' },
  segmentRow: { flexDirection: 'row', backgroundColor: '#1a1a1a', paddingHorizontal: 20, paddingTop: 12 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  segmentBtnActive: { borderBottomColor: '#d4af37' },
  segmentText: { fontSize: 16, fontWeight: '600', color: '#888' },
  segmentTextActive: { color: '#d4af37' },
  sectionHeader: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginTop: 4, marginBottom: 8 },
  createSquadBtn: { backgroundColor: '#d4af37', marginHorizontal: 20, marginTop: 12, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  createSquadText: { color: '#121212', fontWeight: 'bold', fontSize: 16 },
});