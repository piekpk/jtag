import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, Modal, TextInput, StatusBar, Platform, KeyboardAvoidingView, ScrollView, Linking } from 'react-native';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config.js';
import { getAuthHeaders } from '../auth.js';
import { showAlert } from '../themedAlert.js';
import { getActiveDrops, createDrop, claimDrop, getInventory, formatExpiry, rarityColor, celebrateMilestones } from '../duckApi.js';
import { getActiveMeetups, createMeetup, rsvpMeetup, leaveMeetup, cancelMeetup, formatMeetupTime, formatDistance } from '../meetupApi.js';
import DuckIcon from '../DuckIcon';

const RADIUS_CHOICES = [50, 100, 200, 500];
const DURATION_CHOICES = [
  { label: '1 hr', hours: 1 },
  { label: '6 hrs', hours: 6 },
  { label: '24 hrs', hours: 24 },
];
const MEETUP_DURATION_CHOICES = [
  { label: '2 hrs', hours: 2 },
  { label: '4 hrs', hours: 4 },
  { label: '8 hrs', hours: 8 },
];

// Default meetup start: 3 hours from now, rounded to the hour.
const defaultMeetupStart = () => {
  const d = new Date(Date.now() + 3 * 3600e3);
  d.setMinutes(0, 0, 0);
  return d;
};

export default function RadarMapScreen() {
  const router = useRouter();
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
  const [myUserId, setMyUserId] = useState(null);
  // Meetup state
  const [meetups, setMeetups] = useState([]);
  const [placePins, setPlacePins] = useState([]);
  const [placeCategory, setPlaceCategory] = useState(null);
  const routeParams = useLocalSearchParams();
  const [selectedMeetup, setSelectedMeetup] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (routeParams.placePins) {
      try {
        const parsed = JSON.parse(routeParams.placePins);
        const pins = (parsed.results || []).filter((r) => r.lat && r.lng);
        setPlacePins(pins);
        setPlaceCategory(parsed.category || null);
        if (pins.length > 0 && mapRef.current) {
          mapRef.current.fitToCoordinates(
            pins.map((r) => ({ latitude: r.lat, longitude: r.lng })),
            { edgePadding: { top: 120, right: 60, bottom: 120, left: 60 }, animated: true }
          );
        }
      } catch (e) {
        console.log('bad placePins param', e);
      }
    }
  }, [routeParams.placePins]);
  const [chooserVisible, setChooserVisible] = useState(false);
  const [chooserCoord, setChooserCoord] = useState(null);
  const [meetupModalVisible, setMeetupModalVisible] = useState(false);
  const [meetupCoord, setMeetupCoord] = useState(null);
  const [meetupTitle, setMeetupTitle] = useState('');
  const [meetupDesc, setMeetupDesc] = useState('');
  const [meetupStartDate, setMeetupStartDate] = useState(defaultMeetupStart);
  const [pickerMode, setPickerMode] = useState(null); // 'date' | 'time' | null
  const [meetupDuration, setMeetupDuration] = useState(4);
  const [isCreatingMeetup, setIsCreatingMeetup] = useState(false);
  const [isRsvping, setIsRsvping] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // Map layer filters
  const [showRigs, setShowRigs] = useState(true);
  const [showDucks, setShowDucks] = useState(true);
  const [showMeetups, setShowMeetups] = useState(true);
  // Tutorial popup (duck drops)
  const [showTutorial, setShowTutorial] = useState(false);
  const [dontShowTutorial, setDontShowTutorial] = useState(false);
  const TUTORIAL_KEY = 'jtap_map_tutorial_dismissed_v2';

  const openTutorial = () => {
    setDontShowTutorial(false);
    setShowTutorial(true);
  };

  const dismissTutorial = async () => {
    if (dontShowTutorial) {
      try {
        await AsyncStorage.setItem(TUTORIAL_KEY, '1');
      } catch (e) {
        console.error('Failed to save tutorial preference:', e);
      }
    }
    setShowTutorial(false);
  };

  // Show the tutorial each time the Map tab is selected, unless dismissed for good
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const dismissed = await AsyncStorage.getItem(TUTORIAL_KEY);
          if (!dismissed) setShowTutorial(true);
        } catch (e) {
          setShowTutorial(true);
        }
      })();
    }, [])
  );
  // Weather widget (Open-Meteo: free, no API key)
  const [weather, setWeather] = useState(null);
  const [weatherExpanded, setWeatherExpanded] = useState(false);

  // WMO weather code -> [emoji, label]
  const wmoInfo = (code) => ({
    0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'],
    45: ['🌫️', 'Fog'], 48: ['🌫️', 'Icy fog'],
    51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌦️', 'Heavy drizzle'],
    56: ['🌧️', 'Freezing drizzle'], 57: ['🌧️', 'Freezing drizzle'],
    61: ['🌧️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
    66: ['🌧️', 'Freezing rain'], 67: ['🌧️', 'Freezing rain'],
    71: ['❄️', 'Light snow'], 73: ['❄️', 'Snow'], 75: ['❄️', 'Heavy snow'], 77: ['❄️', 'Snow grains'],
    80: ['🌧️', 'Light showers'], 81: ['🌧️', 'Showers'], 82: ['🌧️', 'Heavy showers'],
    85: ['❄️', 'Snow showers'], 86: ['❄️', 'Snow showers'],
    95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Storm + hail'], 99: ['⛈️', 'Storm + hail'],
  }[code] || ['🌡️', '']);

  const fetchWeather = async (lat, lng) => {
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.current) setWeather(data.current);
      }
    } catch (e) {
      console.error('Weather fetch failed:', e);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const loggedInId = await AsyncStorage.getItem('userId');
        setMyUserId(loggedInId);

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
        fetchWeather(currentCoords.latitude, currentCoords.longitude);

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

        // 5. Fetch active meetups near this location
        try {
          const activeMeetups = await getActiveMeetups(currentCoords.latitude, currentCoords.longitude);
          setMeetups(activeMeetups);
        } catch (e) {
          console.error("Failed to fetch meetups:", e);
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
      showAlert("🦆 Duck claimed!", `You got a ${result.duck.emoji} ${result.duck.name}!`);
      celebrateMilestones(result.milestones_completed);
      setDrops(drops.filter((d) => d.id !== selectedDrop.id));
      setSelectedDrop(null);
    } catch (e) {
      showAlert("Couldn't claim", e.message || "Move closer and try again.");
    } finally {
      setIsClaiming(false);
    }
  };

  const handleNavigateToDrop = () => {
    if (!selectedDrop) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${selectedDrop.latitude},${selectedDrop.longitude}&travelmode=driving`;
    Linking.openURL(url).catch(() =>
      showAlert("Couldn't open maps", "No map app available on this device."));
  };

  const refreshMeetups = async () => {
    if (!location) return;
    try {
      const fresh = await getActiveMeetups(location.latitude, location.longitude);
      setMeetups(fresh);
      return fresh;
    } catch (e) {
      console.error("Failed to refresh meetups:", e);
      return null;
    }
  };

  const handleCreateMeetup = async () => {
    if (!meetupTitle.trim() || !meetupCoord || isCreatingMeetup) return;
    setIsCreatingMeetup(true);
    try {
      const start = meetupStartDate;
      const end = new Date(start.getTime() + meetupDuration * 3600e3);
      const title = meetupTitle.trim();
      await createMeetup({
        title,
        description: meetupDesc.trim() || null,
        latitude: meetupCoord.latitude,
        longitude: meetupCoord.longitude,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      });
      setMeetupModalVisible(false);
      setMeetupTitle('');
      setMeetupDesc('');
      await refreshMeetups();
      showAlert("📍 Meetup planned!", `"${title}" is on the map for nearby Jeepers.`);
    } catch (e) {
      showAlert("Couldn't create meetup", e.message || "Try again.");
    } finally {
      setIsCreatingMeetup(false);
    }
  };

  const onPickerChange = (event, selected) => {
    setPickerMode(null);
    if (event?.type === 'dismissed' || !selected) return;
    setMeetupStartDate((cur) => {
      const next = new Date(cur);
      if (pickerMode === 'date') {
        next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      } else {
        next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      }
      return next;
    });
  };

  const handleRsvpMeetup = async () => {
    if (!selectedMeetup || isRsvping) return;
    setIsRsvping(true);
    try {
      if (selectedMeetup.joined_by_me) {
        await leaveMeetup(selectedMeetup.id);
      } else {
        await rsvpMeetup(selectedMeetup.id);
      }
      const fresh = await refreshMeetups();
      setSelectedMeetup((fresh || []).find((x) => x.id === selectedMeetup.id) || null);
    } catch (e) {
      showAlert("Couldn't update RSVP", e.message || "Try again.");
    } finally {
      setIsRsvping(false);
    }
  };

  const handleCancelMeetup = async () => {
    if (!selectedMeetup) return;
    if (!confirmingCancel) {
      setConfirmingCancel(true);
      return;
    }
    try {
      await cancelMeetup(selectedMeetup.id);
      setSelectedMeetup(null);
      setConfirmingCancel(false);
      await refreshMeetups();
      showAlert("Meetup cancelled", "It's off the map.");
    } catch (e) {
      showAlert("Couldn't cancel", e.message || "Try again.");
    }
  };

  const handleNavigateToMeetup = () => {
    if (!selectedMeetup) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${selectedMeetup.latitude},${selectedMeetup.longitude}&travelmode=driving`;
    Linking.openURL(url).catch(() =>
      showAlert("Couldn't open maps", "No map app available on this device."));
  };

  const handleAddToCalendar = () => {
    if (!selectedMeetup) return;
    // Backend times are UTC; format as UTC for the calendar template.
    const asUtc = (iso) => new Date(/Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : iso + 'Z');
    const fmt = (iso) => {
      const d = asUtc(iso);
      const p = (n) => String(n).padStart(2, '0');
      return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
        `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00Z`;
    };
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: selectedMeetup.title,
      dates: `${fmt(selectedMeetup.start_time)}/${fmt(selectedMeetup.end_time)}`,
      details: `Hosted by ${selectedMeetup.host_name} via Jtap${selectedMeetup.description ? '\n\n' + selectedMeetup.description : ''}`,
      location: `${selectedMeetup.latitude},${selectedMeetup.longitude}`,
    });
    Linking.openURL(`https://calendar.google.com/calendar/render?${params.toString()}`).catch(() =>
      showAlert("Couldn't open calendar", "No browser available on this device."));
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
        showAlert("No ducks", "You're out of ducks! Claim a drop or trade with someone first.");
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
      showAlert("Error", "Could not load your ducks.");
    }
  };

  const maxClaimsFor = (item) => Math.min(item ? item.count : 1, 20);

  const handleCreateDrop = async () => {
    if (!dropDuck || !dropCoord || isDropping) return;
    setIsDropping(true);
    try {
      const result = await createDrop({
        duck_type_id: dropDuck.duck.id,
        latitude: dropCoord.latitude,
        longitude: dropCoord.longitude,
        radius_m: dropRadius,
        duration_hours: dropDuration,
        max_claims: dropClaims,
        label: dropLabel.trim() || null,
      });
      celebrateMilestones(result.milestones_completed);
      setDropModalVisible(false);
      const fresh = await getActiveDrops(location.latitude, location.longitude);
      setDrops(fresh);
      showAlert("🦆 Drop is live!", `${dropClaims}× ${dropDuck.duck.emoji} ${dropDuck.duck.name} waiting for nearby Jeepers.`);
    } catch (e) {
      showAlert("Couldn't create drop", e.message || "Not enough ducks of that type.");
    } finally {
      setIsDropping(false);
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={location}
        showsUserLocation={true}
        onPress={() => { setSelectedDrop(null); setSelectedMeetup(null); setConfirmingCancel(false); }}
        onLongPress={(e) => { setChooserCoord(e.nativeEvent.coordinate); setChooserVisible(true); }}
      >
        {/* Current User Marker */}
        <Marker
          coordinate={{ latitude: location.latitude, longitude: location.longitude }}
          title="2025 Jeep Wrangler 4xe Sahara"
          description="Jtap Proximity Active"
          pinColor="blue" 
        />
        
        {/* Nearby Users Markers */}
        {showRigs && nearbyUsers.map((user) => {
          const ownerName = user.settings?.ownerName || 'Fellow Jeeper';
          const vehicleTitle = user.settings?.vehicleTitle || 'Jeep Wrangler';
          return (
            <Marker
              key={user.id}
              coordinate={{ latitude: user.latitude, longitude: user.longitude }}
              title={ownerName}
              description={vehicleTitle}
              pinColor="red"
              onCalloutPress={() => router.push(`/rig/${user.id}`)}
            />
          );
        })}

        {/* Duck Drop Markers */}
        {showDucks && drops.map((drop) => (
          <Marker
            key={`drop-${drop.id}`}
            coordinate={{ latitude: drop.latitude, longitude: drop.longitude }}
            onPress={(e) => { e.stopPropagation(); setSelectedMeetup(null); setSelectedDrop(drop); }}
          >
            <View style={[styles.dropMarker, drop.claimed_by_me && { opacity: 0.4 }]}>
              <DuckIcon duck={drop.duck} size={30} />
            </View>
          </Marker>
        ))}

        {/* JtapBot place pins */}
        {placePins.map((r, i) => (
          <Marker
            key={`place-${i}`}
            coordinate={{ latitude: r.lat, longitude: r.lng }}
            title={r.name}
            description={[r.hours, r.phone].filter(Boolean).join(' • ')}
            pinColor="#d4af37"
          />
        ))}

        {/* Meetup Markers */}
        {showMeetups && meetups.map((m) => (
          <Marker
            key={`meetup-${m.id}`}
            coordinate={{ latitude: m.latitude, longitude: m.longitude }}
            onPress={(e) => { e.stopPropagation(); setSelectedDrop(null); setConfirmingCancel(false); setSelectedMeetup(m); }}
          >
            <View style={styles.meetupMarker}>
              <Text style={styles.meetupPin}>📍</Text>
              {m.attendee_count > 0 && (
                <View style={styles.meetupBadge}>
                  <Text style={styles.meetupBadgeText}>{m.attendee_count > 99 ? '99+' : m.attendee_count}</Text>
                </View>
              )}
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Dark scrim behind the system status bar. On most devices the native
          bar is opaque black (see app.config.js); on edge-to-edge displays
          (Android 15+) the bar is transparent, so this keeps the status icons
          readable over the map. Non-interactive. */}
      {Platform.OS === 'android' && <View style={styles.statusScrim} pointerEvents="none" />}

      {/* Weather widget */}
      {weather && (
        <TouchableOpacity
          style={styles.weatherBox}
          onPress={() => setWeatherExpanded(!weatherExpanded)}
          activeOpacity={0.85}
        >
          <Text style={styles.weatherMain}>
            {wmoInfo(weather.weather_code)[0]} {Math.round(weather.temperature_2m)}°
          </Text>
          <Text style={styles.weatherCond}>{wmoInfo(weather.weather_code)[1]}</Text>
          {weatherExpanded && (
            <View style={styles.weatherDetails}>
              <Text style={styles.weatherDetail}>
                Feels like {Math.round(weather.apparent_temperature)}°F
              </Text>
              <Text style={styles.weatherDetail}>
                💧 {weather.relative_humidity_2m}% humidity
              </Text>
              <Text style={styles.weatherDetail}>
                💨 {Math.round(weather.wind_speed_10m)} mph wind
              </Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* Selected drop detail card */}
      {selectedDrop && (
        <View style={styles.dropCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dropTitle}>
              <DuckIcon duck={selectedDrop.duck} size={18} /> {selectedDrop.duck.name}
            </Text>
            <Text style={styles.dropMeta}>
              {formatExpiry(selectedDrop.expires_at)} • {selectedDrop.claims_left} left
              {selectedDrop.label ? ` • ${selectedDrop.label}` : ''}
            </Text>
            {selectedDrop.clue ? (
              <Text style={styles.dropClue}>🔍 {selectedDrop.clue}</Text>
            ) : null}
            {!inRange && !selectedDrop.claimed_by_me && (
              <Text style={styles.dropHint}>
                {Math.round(selectedDrop.distance_m)}m away — get within {Math.round(selectedDrop.radius_m)}m to claim
              </Text>
            )}
            {!inRange && !selectedDrop.claimed_by_me && (
              <TouchableOpacity style={styles.navBtn} onPress={handleNavigateToDrop} activeOpacity={0.8}>
                <Text style={styles.navBtnText}>🧭 Navigate there</Text>
              </TouchableOpacity>
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

      {/* Selected meetup detail card */}
      {selectedMeetup && (
        <View style={styles.dropCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dropTitle}>📍 {selectedMeetup.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.dropMeta, { flex: 1 }]}>
                {formatMeetupTime(selectedMeetup.start_time)} – {formatMeetupTime(selectedMeetup.end_time)}
              </Text>
              <TouchableOpacity
                style={styles.calChip}
                onPress={handleAddToCalendar}
                activeOpacity={0.8}
              >
                <Text style={styles.calChipText}>📅 Add</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.dropMeta}>
              Hosted by {selectedMeetup.host_name} • {formatDistance(selectedMeetup.distance_m)}
            </Text>
            <Text style={styles.dropHint}>
              {selectedMeetup.attendee_count} going{selectedMeetup.joined_by_me ? " • You're in ✓" : ''}
            </Text>
            {!!selectedMeetup.description && (
              <Text style={styles.dropClue}>{selectedMeetup.description}</Text>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
              <TouchableOpacity
                style={[styles.navBtn, { marginRight: 8, marginBottom: 8 }]}
                onPress={handleNavigateToMeetup}
                activeOpacity={0.8}
              >
                <Text style={styles.navBtnText}>🧭 Navigate there</Text>
              </TouchableOpacity>
              {String(selectedMeetup.created_by) === String(myUserId) && (
                <TouchableOpacity
                  style={[styles.navBtn, { marginBottom: 8, borderColor: '#c0392b' }]}
                  onPress={handleCancelMeetup}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.navBtnText, { color: '#e74c3c' }]}>
                    {confirmingCancel ? 'Tap to confirm' : 'Cancel meetup'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <TouchableOpacity
            style={[styles.claimBtn, isRsvping && { opacity: 0.4 }]}
            onPress={handleRsvpMeetup}
            disabled={isRsvping}
          >
            <Text style={styles.claimBtnText}>
              {isRsvping ? '...' : selectedMeetup.joined_by_me ? 'Leave' : 'Join'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Long-press chooser: duck drop vs meetup */}
      <Modal visible={chooserVisible} transparent animationType="fade" onRequestClose={() => setChooserVisible(false)}>
        <TouchableOpacity style={styles.chooserBackdrop} activeOpacity={1} onPress={() => setChooserVisible(false)}>
          <View style={styles.chooserBox}>
            <Text style={styles.chooserTitle}>What goes here?</Text>
            <TouchableOpacity
              style={styles.chooserBtn}
              onPress={() => { setChooserVisible(false); if (chooserCoord) openDropModal(chooserCoord); }}
              activeOpacity={0.85}
            >
              <Text style={styles.chooserEmoji}>🦆</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.chooserLabel}>Drop a duck</Text>
                <Text style={styles.chooserDesc}>Hide ducks for nearby Jeepers to find</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chooserBtn}
              onPress={() => {
                setChooserVisible(false);
                if (chooserCoord) {
                  setMeetupCoord(chooserCoord);
                  setMeetupStartDate(defaultMeetupStart());
                  setMeetupDuration(4);
                  setMeetupModalVisible(true);
                }
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.chooserEmoji}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.chooserLabel}>Plan a meetup</Text>
                <Text style={styles.chooserDesc}>Rally the crew at this spot</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalClose} onPress={() => setChooserVisible(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Meetup creation modal */}
      <Modal visible={meetupModalVisible} transparent animationType="slide" onRequestClose={() => setMeetupModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalBox}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>📍 Plan a meetup</Text>

              <TextInput
                style={styles.labelInput}
                placeholder="Title (e.g. Sunset Trail Run)"
                placeholderTextColor="#757575"
                value={meetupTitle}
                onChangeText={setMeetupTitle}
                maxLength={80}
              />
              <TextInput
                style={[styles.labelInput, { marginTop: 10, minHeight: 70, textAlignVertical: 'top' }]}
                placeholder="Description (optional)"
                placeholderTextColor="#757575"
                value={meetupDesc}
                onChangeText={setMeetupDesc}
                maxLength={500}
                multiline
              />

              <Text style={styles.modalLabel}>Starts</Text>
              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity
                  style={[styles.dateTimeBtn, { flex: 1, marginRight: 6 }]}
                  onPress={() => setPickerMode('date')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.dateTimeBtnText}>
                    📅 {meetupStartDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.dateTimeBtn, { flex: 1, marginLeft: 6 }]}
                  onPress={() => setPickerMode('time')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.dateTimeBtnText}>
                    🕘 {meetupStartDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </TouchableOpacity>
              </View>
              {pickerMode && (
                <DateTimePicker
                  value={meetupStartDate}
                  mode={pickerMode}
                  display="default"
                  minimumDate={new Date()}
                  onChange={onPickerChange}
                />
              )}

              <Text style={styles.modalLabel}>Lasts</Text>
              <View style={styles.chipRow}>
                {MEETUP_DURATION_CHOICES.map((d) => (
                  <TouchableOpacity
                    key={d.hours}
                    style={[styles.optChip, meetupDuration === d.hours && styles.optChipActive]}
                    onPress={() => setMeetupDuration(d.hours)}
                  >
                    <Text style={[styles.optChipText, meetupDuration === d.hours && styles.optChipTextActive]}>{d.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.dropHint, { marginTop: 10 }]}>
                {formatMeetupTime(meetupStartDate.toISOString())}
                {'  →  '}
                {formatMeetupTime(new Date(meetupStartDate.getTime() + meetupDuration * 3600e3).toISOString())}
              </Text>

              <TouchableOpacity
                style={[styles.dropBtn, (!meetupTitle.trim() || isCreatingMeetup) && { opacity: 0.5 }]}
                onPress={handleCreateMeetup}
                disabled={!meetupTitle.trim() || isCreatingMeetup}
              >
                <Text style={styles.dropBtnText}>{isCreatingMeetup ? 'Planning...' : 'Create meetup'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalClose} onPress={() => setMeetupModalVisible(false)}>
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Drop creation modal (long-press on map) */}
      <Modal visible={dropModalVisible} transparent animationType="slide" onRequestClose={() => setDropModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalBox}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>🦆 Drop ducks here</Text>

            <Text style={styles.modalLabel}>Which duck?</Text>
            <View style={styles.chipRow}>
              {inventory.map((item) => (
                <TouchableOpacity
                  key={item.duck.id}
                  style={[styles.pickChip, dropDuck?.duck.id === item.duck.id && styles.pickChipActive]}
                  onPress={() => { setDropDuck(item); setDropClaims(1); }}
                >
                  <DuckIcon duck={item.duck} size={28} />
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
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Help button: reopens the duck drop tutorial */}
      <TouchableOpacity style={styles.helpBtn} onPress={openTutorial}>
        <Text style={styles.helpBtnText}>?</Text>
      </TouchableOpacity>

      {/* Map layer filters */}
      <View style={styles.filterRow} pointerEvents="box-none">
        {[
          { label: 'Rigs', on: showRigs, set: setShowRigs },
          { label: 'Ducks', on: showDucks, set: setShowDucks },
          { label: 'Meetups', on: showMeetups, set: setShowMeetups },
        ].map((f) => (
          <TouchableOpacity
            key={f.label}
            style={[styles.filterChip, !f.on && styles.filterChipOff]}
            onPress={() => f.set(!f.on)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterChipText, !f.on && styles.filterChipTextOff]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {placePins.length > 0 && (
        <TouchableOpacity
          style={styles.clearPlacesChip}
          onPress={() => { setPlacePins([]); setPlaceCategory(null); }}
          activeOpacity={0.8}
        >
          <Text style={styles.clearPlacesText}>✕ Clear {placeCategory || 'places'}</Text>
        </TouchableOpacity>
      )}

      {/* Duck drop tutorial popup */}
      <Modal
        visible={showTutorial}
        transparent={true}
        animationType="fade"
        onRequestClose={dismissTutorial}
      >
        <View style={styles.tutorialBackdrop}>
          <View style={styles.tutorialCard}>
            <Text style={styles.tutorialTitle}>🗺️ Drops & Meetups</Text>
            <Text style={styles.tutorialSubtitle}>
              Hide ducks and rally the crew — all from the map.
            </Text>
            {[
              ['📍', 'Long-press anywhere on the map, then choose Drop a duck or Plan a meetup.'],
              ['🦆', 'Drops: pick the duck, how many can claim it, the radius, and how long it lasts. Get inside the radius and tap Claim — unclaimed ducks disappear at expiry.'],
              ['📍', 'Meetups: give it a title and a start time. Everyone within 25 miles gets an alert, and the gold pin shows who\'s going. Tap it to Join.'],
              ['🔍', 'Use the Rigs / Ducks / Meetups chips at the top to declutter the map.'],
            ].map(([emoji, text], idx) => (
              <View key={idx} style={styles.tutorialStep}>
                <Text style={styles.tutorialStepEmoji}>{emoji}</Text>
                <Text style={styles.tutorialStepText}>{text}</Text>
              </View>
            ))}
            <TouchableOpacity
              style={styles.tutorialCheckRow}
              onPress={() => setDontShowTutorial(!dontShowTutorial)}
              activeOpacity={0.7}
            >
              <View style={[styles.tutorialCheckbox, dontShowTutorial && styles.tutorialCheckboxChecked]}>
                {dontShowTutorial && <Text style={styles.tutorialCheckmark}>✓</Text>}
              </View>
              <Text style={styles.tutorialCheckLabel}>Don't show this again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tutorialBtn} onPress={dismissTutorial}>
              <Text style={styles.tutorialBtnText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  statusScrim: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1,
    height: StatusBar.currentHeight || 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  map: { ...StyleSheet.absoluteFillObject },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dropMarker: {
    backgroundColor: '#d4af37', width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#121212',
  },
  dropEmoji: { fontSize: 24 },
  weatherBox: {
    position: 'absolute', top: 12, left: 12, zIndex: 2,
    backgroundColor: 'rgba(18,18,18,0.88)', borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: '#d4af37', minWidth: 108,
  },
  weatherMain: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  weatherCond: { color: '#d4af37', fontSize: 11, fontWeight: '600', marginTop: 2 },
  weatherDetails: {
    marginTop: 6, borderTopWidth: 1, borderTopColor: '#2c2c2e', paddingTop: 6,
  },
  weatherDetail: { color: '#ccc', fontSize: 11, marginTop: 2 },
  helpBtn: {
    position: 'absolute', top: 12, right: 12, zIndex: 2,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(18,18,18,0.88)',
    borderWidth: 1, borderColor: '#d4af37',
    justifyContent: 'center', alignItems: 'center',
  },
  helpBtnText: { color: '#d4af37', fontSize: 18, fontWeight: 'bold' },
  tutorialBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  tutorialCard: {
    width: '100%', backgroundColor: '#1e1e1e', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: '#d4af37',
  },
  tutorialTitle: { color: '#d4af37', fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
  tutorialSubtitle: { color: '#aaa', fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: 14 },
  tutorialStep: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  tutorialStepEmoji: { fontSize: 20, marginRight: 10, marginTop: 1 },
  tutorialStepText: { color: '#eee', fontSize: 13.5, flex: 1, lineHeight: 19 },
  tutorialCheckRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, marginBottom: 14 },
  tutorialCheckbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: '#d4af37',
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  tutorialCheckboxChecked: { backgroundColor: '#d4af37' },
  tutorialCheckmark: { color: '#121212', fontSize: 14, fontWeight: 'bold' },
  tutorialCheckLabel: { color: '#ccc', fontSize: 13 },
  tutorialBtn: {
    backgroundColor: '#d4af37', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  tutorialBtnText: { color: '#121212', fontSize: 16, fontWeight: 'bold' },
  dropCard: {
    position: 'absolute', bottom: 20, left: 15, right: 15,
    backgroundColor: '#1e1e1e', borderRadius: 14, padding: 15,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#d4af37',
  },
  dropTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  dropMeta: { color: '#d4af37', fontSize: 13, marginTop: 4 },
  dropHint: { color: '#888', fontSize: 12, marginTop: 4 },
  dropClue: { color: '#d4af37', fontSize: 13, fontStyle: 'italic', marginTop: 6, lineHeight: 18 },
  claimBtn: { backgroundColor: '#d4af37', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, marginLeft: 10 },
  navBtn: { marginTop: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#d4af37', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  navBtnText: { color: '#d4af37', fontWeight: 'bold', fontSize: 13 },
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
  chooserBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  chooserBox: {
    width: '100%', backgroundColor: '#1e1e1e', borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: '#d4af37',
  },
  chooserTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  chooserBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#2c2c2e', borderRadius: 12, padding: 14, marginBottom: 10,
  },
  chooserEmoji: { fontSize: 28, marginRight: 12 },
  chooserLabel: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  chooserDesc: { color: '#888', fontSize: 12, marginTop: 2 },
  meetupMarker: {
    backgroundColor: '#d4af37', width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#121212',
  },
  meetupPin: { fontSize: 24 },
  meetupBadge: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: '#121212', borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#d4af37', paddingHorizontal: 4,
  },
  meetupBadgeText: { color: '#d4af37', fontSize: 11, fontWeight: 'bold' },
  filterRow: {
    position: 'absolute', top: 64, left: 0, right: 0, zIndex: 2,
    flexDirection: 'row', justifyContent: 'center',
  },
  filterChip: {
    backgroundColor: 'rgba(18,18,18,0.88)',
    borderWidth: 1, borderColor: '#d4af37', borderRadius: 16,
    paddingVertical: 6, paddingHorizontal: 14, marginHorizontal: 4,
  },
  filterChipOff: { borderColor: '#444', opacity: 0.6 },
  filterChipText: { color: '#d4af37', fontSize: 12, fontWeight: '700' },
  clearPlacesChip: {
    position: 'absolute', top: 104, alignSelf: 'center', backgroundColor: '#1e1e1e',
    borderWidth: 1, borderColor: '#d4af37', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12, zIndex: 5,
  },
  clearPlacesText: { color: '#d4af37', fontSize: 13, fontWeight: '600' },
  filterChipTextOff: { color: '#888' },
  dateTimeBtn: {
    backgroundColor: '#2c2c2e', borderRadius: 10, borderWidth: 1, borderColor: '#d4af37',
    paddingVertical: 12, alignItems: 'center',
  },
  dateTimeBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  calChip: {
    flexDirection: 'row', alignItems: 'center', flexShrink: 0,
    borderWidth: 1, borderColor: '#d4af37', borderRadius: 14,
    paddingVertical: 5, paddingHorizontal: 10, marginLeft: 8,
  },
  calChipText: { color: '#d4af37', fontSize: 12, fontWeight: '700' },
});