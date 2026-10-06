import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Image, ActivityIndicator, Switch, Modal, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useFocusEffect } from 'expo-router';
import { API_URL } from '../config.js'; //file that contains backend URL[cite: 9]
import { getAuthHeaders } from '../auth.js';
import { showAlert } from '../themedAlert.js';
import { SOCIAL_PLATFORMS, platformById, validSocialLinks, normalizeSocialUrl } from '../socialLinks.js';
import { getDuckCatalog, getInventory, getMyPond } from '../duckApi.js';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../notificationsApi.js';
import DuckIcon from '../DuckIcon';
import { BUILD_NUMBER } from '../buildInfo.js';
import DuckShowcase from '../DuckShowcase';

const MAX_SHOWCASE = 5;

export default function MyRigScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // State variables for profile data
  const [ownerName, setOwnerName] = useState('');
  const [vehicleTitle, setVehicleTitle] = useState('');
  const [discoverable, setDiscoverable] = useState(true);
  const [specs, setSpecs] = useState({
    engine: '',
    wheels: '',
    interior: ''
  });
  const [mods, setMods] = useState('');
  const [photos, setPhotos] = useState<string[]>(['', '', '', '']);
  const [coverPhoto, setCoverPhoto] = useState('');
  const [socialLinks, setSocialLinks] = useState<{ platform: string; url: string }[]>([]);
  const [showcaseDucks, setShowcaseDucks] = useState<number[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [pondSlots, setPondSlots] = useState<any[]>([]);
  const [alertsVisible, setAlertsVisible] = useState(false);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [inventory, setInventory] = useState<any[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [urlPlatform, setUrlPlatform] = useState<string | null>(null);
  const [urlValue, setUrlValue] = useState('');

  // 1. Load the user's profile from the database when the screen opens[cite: 9]
  const refreshAlerts = useCallback(async () => {
    try {
      const data = await listNotifications(50);
      const items = data.notifications || [];
      setAlerts(items);
      setUnreadAlerts(items.filter((n) => !n.is_read).length);
    } catch (e) {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshAlerts();
    }, [refreshAlerts])
  );

  const openAlerts = () => {
    refreshAlerts();
    setAlertsVisible(true);
  };

  const closeAlerts = () => setAlertsVisible(false);

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      refreshAlerts();
    } catch (e) {}
  };

  const handleAlertTap = async (n) => {
    try {
      if (!n.is_read) {
        await markNotificationRead(n.id);
        refreshAlerts();
      }
    } catch (e) {}
    setAlertsVisible(false);
    if (n.type === 'ducked') router.push('/(tabs)/ducks');
    else if (n.type === 'meetup') router.push('/(tabs)/map');
    else if (n.type === 'sos' && n.data && n.data.sos_id) router.push({ pathname: '/(tabs)/map', params: { sosId: String(n.data.sos_id) } });
    else if (n.type === 'sos') router.push('/(tabs)/map');
  };

  const alertIcon = (type) => (type === 'ducked' ? '🦆' : type === 'meetup' ? '📍' : type === 'sos' ? '🆘' : '🔔');

  const timeAgo = (ts) => {
    const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  };

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const storedUserId = await AsyncStorage.getItem('userId');
        if (!storedUserId) {
          setIsLoading(false);
          return;
        }
        setUserId(storedUserId);
        // Duck catalog + inventory back the featured-ducks picker and showcase.
        getDuckCatalog().then(setCatalog).catch(() => {});
        getInventory().then(setInventory).catch(() => {});
        getMyPond().then((p) => setPondSlots(p.slots || [])).catch(() => {});

        const response = await fetch(`${API_URL}/users/${storedUserId}/profile`, {
          headers: await getAuthHeaders()
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // If the user has saved settings in the database, populate the screen[cite: 9]
          if (data.settings && Object.keys(data.settings).length > 0) {
            if (data.settings.ownerName) setOwnerName(data.settings.ownerName);
            if (data.settings.vehicleTitle) setVehicleTitle(data.settings.vehicleTitle);
            if (data.settings.specs) setSpecs(data.settings.specs);
            if (data.settings.mods) setMods(data.settings.mods);
            if (data.settings.photos) setPhotos(data.settings.photos);
            if (data.settings.coverPhoto) setCoverPhoto(data.settings.coverPhoto);
            if (data.settings.socialLinks) setSocialLinks(validSocialLinks(data.settings.socialLinks));
            if (data.settings.discoverable === false) setDiscoverable(false);
            if (Array.isArray(data.settings.showcaseDucks)) {
              setShowcaseDucks(data.settings.showcaseDucks.filter((x) => typeof x === 'number').slice(0, MAX_SHOWCASE));
            }
          } else {
            // Default placeholder data for brand new users[cite: 9]
            setOwnerName('New User');
            setVehicleTitle('Add your rig details');
            setSpecs({ engine: 'e.g., 2.0L Turbo', wheels: 'e.g., 35" MT', interior: 'e.g., Leather' });
            setMods('List your active mods here...');
          }
        }
      } catch (error) {
        console.error("Failed to load profile:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfileData();
  }, []);

  // 2. Save the user's profile to the database when they click "Save"[cite: 9]
  const handleEditToggle = async () => {
    if (isEditing && userId) {
      if (/(.)\1{5,}/.test(mods)) {
        showAlert("Save Failed", "Mods can't repeat the same character more than 5 times in a row.");
        return;
      }
      setIsSaving(true);
      try {
        const response = await fetch(`${API_URL}/users/${userId}/profile`, {
          method: 'PATCH',
          headers: await getAuthHeaders(),
          body: JSON.stringify({
            settings: {
              ownerName,
              vehicleTitle,
              specs,
              mods,
              photos,
              coverPhoto,
              socialLinks: validSocialLinks(socialLinks),
              showcaseDucks,
              discoverable
            }
          }),
        });

        if (!response.ok) {
          let msg = "Could not save your profile changes.";
          try {
            const err = await response.json();
            if (err && typeof err.detail === "string" && err.detail) msg = err.detail;
          } catch (_) {}
          showAlert("Save Failed", msg);
          setIsSaving(false);
          return; // Don't exit edit mode if save failed[cite: 9]
        }
      } catch (error) {
        showAlert("Network Error", "Failed to connect to the server.");
        setIsSaving(false);
        return; // Don't exit edit mode if network failed[cite: 9]
      }
      setIsSaving(false);
    }
    setIsEditing(!isEditing);
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('userId');
      router.replace('/');
    } catch (error) {
      console.error("Failed to log out:", error);
      showAlert("Error", "Could not log out.");
    }
  };

  const uploadPhoto = async (localUri: string) => {
    const filename = localUri.split('/').pop() || `photo_${Date.now()}.jpg`;
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : `image/jpeg`;

    const formData = new FormData();
    // @ts-ignore - React Native FormData expects this specific structure
    formData.append('file', {
      uri: localUri,
      name: filename,
      type: type,
    });

    try {
      const response = await fetch(`${API_URL}/users/${userId}/profile-picture`, {
        method: 'POST',
        body: formData,
        headers: await getAuthHeaders(false),
      });

      if (response.ok) {
        const data = await response.json();
        return data.url;
      } else {
        showAlert("Upload Failed", "Could not upload the image to the server.");
      }
    } catch (error) {
      console.error("Upload error:", error);
      showAlert("Network Error", "Could not connect to the server.");
    }
    return null;
  };

  const pickImage = async (index: number) => {
    if (!isEditing || !userId) return;

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      const url = await uploadPhoto(result.assets[0].uri);
      if (url) {
        const newPhotos = [...photos];
        newPhotos[index] = url;
        setPhotos(newPhotos);
      }
    }
  };

  const pickCover = async () => {
    if (!isEditing || !userId) return;

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled) {
      const url = await uploadPhoto(result.assets[0].uri);
      if (url) setCoverPhoto(url);
    }
  };

  // Helper function to safely format image URLs[cite: 9]
  const getImageUrl = (imagePath: string) => {
    if (!imagePath) return null;
    
    // Swap hardcoded local IPs from the backend with the active Ngrok tunnel[cite: 9]
    if (imagePath.includes('http://192.168.')) {
      return imagePath.replace(/http:\/\/192\.168\.\d+\.\d+:\d+/, API_URL);
    }
    
    if (imagePath.startsWith('http')) return imagePath;
    return `${API_URL}/${imagePath.startsWith('/') ? imagePath.slice(1) : imagePath}`;
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#d4af37" />
      </View>
    );
  }

  // Featured-ducks picker: toggle a duck type in/out of the showcase (max 5).
  const toggleShowcaseDuck = (duckId: number) => {
    setShowcaseDucks((prev) => {
      if (prev.includes(duckId)) return prev.filter((x) => x !== duckId);
      if (prev.length >= MAX_SHOWCASE) return prev;
      return [...prev, duckId];
    });
  };

  // Resolve showcase ids to duck objects for display.
  const catalogById: Record<number, any> = {};
  catalog.forEach((d) => { catalogById[d.id] = d; });
  const showcaseDuckObjs = showcaseDucks.map((duckId) => catalogById[duckId]).filter(Boolean);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        {!isEditing && <DuckShowcase ducks={showcaseDuckObjs} />}
        <View style={styles.headerTop}>
          {isEditing ? (
            <TextInput
              style={styles.editTitleInput}
              value={ownerName}
              onChangeText={setOwnerName}
              placeholder="Your Name"
              placeholderTextColor="#888"
              maxLength={30}
            />
          ) : (
            <Text style={styles.title}>{ownerName}'s Rig</Text>
          )}
          
          <TouchableOpacity onPress={openAlerts} style={styles.bellBtn} activeOpacity={0.8}>
            <Text style={styles.bellIcon}>🔔</Text>
            {unreadAlerts > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadAlerts > 99 ? '99+' : unreadAlerts}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={handleEditToggle} 
            style={[styles.editBtn, isSaving && { opacity: 0.7 }]}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.editBtnText}>{isEditing ? 'Save' : 'Edit'}</Text>
            )}
          </TouchableOpacity>
        </View>

        {isEditing ? (
          <TextInput
            style={styles.editSubtitleInput}
            value={vehicleTitle}
            onChangeText={setVehicleTitle}
            placeholder="Vehicle Year Make & Model"
            placeholderTextColor="#888"
            maxLength={30}
          />
        ) : (
          <Text style={styles.subtitle}>{vehicleTitle}</Text>
        )}
        {validSocialLinks(socialLinks).length > 0 && (
          <View style={styles.socialRow}>
            {validSocialLinks(socialLinks).map((l) => {
              const p = platformById(l.platform);
              return (
                <TouchableOpacity
                  key={l.platform}
                  style={styles.socBtn}
                  onPress={() => Linking.openURL(normalizeSocialUrl(l.url)).catch(() => {})}
                >
                  <Image source={p.icon} style={styles.socImg} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {isEditing && (
          <View style={styles.discoverRow}>
            <Text style={styles.discoverLabel}>Show me in search results</Text>
            <Switch
              value={discoverable}
              onValueChange={setDiscoverable}
              trackColor={{ false: '#3a3a3c', true: '#d4af37' }}
              thumbColor={discoverable ? '#121212' : '#f4f3f4'}
            />
          </View>
        )}
      </View>

      {isEditing && (
        <View style={styles.coverWrap}>
          <Text style={styles.coverLabel}>Cover photo — shown at the top of your public profile</Text>
          <TouchableOpacity style={styles.coverBox} onPress={pickCover}>
            {coverPhoto ? (
              <Image
                source={{
                  uri: getImageUrl(coverPhoto),
                  headers: {
                    'ngrok-skip-browser-warning': 'true',
                    'User-Agent': 'JtapApp/1.0'
                  }
                }}
                style={styles.photo}
              />
            ) : (
              <Text style={styles.photoPlaceholder}>+ Add cover photo</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {isEditing && (
        <View style={styles.coverWrap}>
          <Text style={styles.coverLabel}>Featured ducks — shown on your profile (up to {MAX_SHOWCASE})</Text>
          {pondSlots.filter((s) => s.unlocked).length === 0 ? (
            <Text style={styles.showcaseEmpty}>No ducks yet — claim a drop on the map first.</Text>
          ) : (
            <View style={styles.showcaseGrid}>
              {pondSlots.filter((s) => s.unlocked).map((item) => {
                const selected = showcaseDucks.includes(item.duck.id);
                return (
                  <TouchableOpacity
                    key={item.duck.id}
                    style={[styles.showcaseCell, selected && styles.showcaseCellActive]}
                    onPress={() => toggleShowcaseDuck(item.duck.id)}
                    activeOpacity={0.8}
                  >
                    <DuckIcon duck={item.duck} size={40} />
                    {item.count > 0 && <Text style={styles.showcaseCount}>×{item.count}</Text>}
                    {selected && (
                      <View style={styles.showcaseCheck}>
                        <Text style={styles.showcaseCheckText}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      )}

      {isEditing && (
        <View style={styles.socialSection}>
          <Text style={styles.coverLabel}>Social links — shown on your public profile</Text>
          {socialLinks.map((l) => {
            const p = platformById(l.platform);
            if (!p) return null;
            return (
              <View key={l.platform} style={styles.socialItem}>
                <View style={styles.socialItemIcon}><Image source={p.icon} style={styles.socImg} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.socialItemName}>{p.name}</Text>
                  <Text style={styles.socialItemUrl} numberOfLines={1}>{l.url}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSocialLinks(socialLinks.filter((x) => x.platform !== l.platform))}
                  style={styles.socialRemove}
                >
                  <Text style={styles.socialRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          <TouchableOpacity style={styles.socialAdd} onPress={() => setShowPicker(true)} activeOpacity={0.8}>
            <Text style={styles.socialAddText}>＋ Add social link</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.photoGrid}>
        {[0, 1, 2, 3].map((i) => (
          <TouchableOpacity key={i} style={styles.photoBox} onPress={() => pickImage(i)} disabled={!isEditing}>
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
              <Text style={styles.photoPlaceholder}>{isEditing ? '+ Add Photo' : 'No Photo'}</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Vehicle Specs</Text>
        {Object.keys(specs).map((key) => (
          <View style={styles.specRow} key={key}>
            <Text style={styles.specLabel}>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
            {isEditing ? (
              <TextInput
                style={styles.input}
                value={specs[key as keyof typeof specs]}
                onChangeText={(val) => setSpecs({ ...specs, [key]: val })}
                maxLength={30}
              />
            ) : (
              <Text style={styles.specValue}>{specs[key as keyof typeof specs]}</Text>
            )}
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Active Mods & Gear</Text>
        {isEditing ? (
          <TextInput
            style={[styles.input, styles.multiline]}
            value={mods}
            onChangeText={setMods}
            multiline
            maxLength={500}
          />
        ) : (
          <Text style={styles.modText}>{mods}</Text>
        )}
      </View>

      {/* Log Out Button Section */}
      <View style={styles.logoutContainer}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </View>

      {/* Platform picker modal */}
      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Add social link</Text>
            <Text style={styles.modalSubtitle}>CHOOSE PLATFORM</Text>
            {SOCIAL_PLATFORMS.map((p) => {
              const added = socialLinks.some((l) => l.platform === p.id);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.platformRow, added && { opacity: 0.35 }]}
                  disabled={added}
                  onPress={() => { setUrlPlatform(p.id); setUrlValue(''); setShowPicker(false); }}
                >
                  <View style={styles.socialItemIcon}><Image source={p.icon} style={styles.socImg} /></View>
                  <Text style={styles.platformName}>{p.name}</Text>
                  <Text style={styles.platformGo}>{added ? 'Added ✓' : '›'}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowPicker(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* URL entry modal */}
      <Modal visible={!!urlPlatform} transparent animationType="slide" onRequestClose={() => setUrlPlatform(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            {urlPlatform && (() => {
              const p = platformById(urlPlatform);
              return (
                <>
                  <View style={styles.urlIconWrap}><Image source={p.icon} style={styles.urlImg} /></View>
                  <Text style={styles.modalTitle}>{p.name}</Text>
                  <TextInput
                    style={styles.urlInput}
                    value={urlValue}
                    onChangeText={setUrlValue}
                    placeholder={p.placeholder}
                    placeholderTextColor="#666"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                  <Text style={styles.urlHint}>e.g. {p.placeholder}</Text>
                  <TouchableOpacity
                    style={[styles.urlAddBtn, !urlValue.trim() && { opacity: 0.4 }]}
                    disabled={!urlValue.trim()}
                    onPress={() => {
                      const url = normalizeSocialUrl(urlValue);
                      setSocialLinks([...socialLinks.filter((l) => l.platform !== urlPlatform), { platform: urlPlatform, url }]);
                      setUrlPlatform(null);
                      setUrlValue('');
                    }}
                  >
                    <Text style={styles.urlAddText}>Add link</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalCancel} onPress={() => setUrlPlatform(null)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Alerts history sheet */}
      <Modal
        visible={alertsVisible}
        transparent
        animationType="slide"
        onRequestClose={closeAlerts}
      >
        <View style={styles.alertsBackdrop}>
          <TouchableOpacity style={styles.alertsDismiss} activeOpacity={1} onPress={closeAlerts} />
          <View style={styles.alertsSheet}>
            <View style={styles.alertsHandle} />
            <View style={styles.alertsHeader}>
              <Text style={styles.alertsTitle}>Alerts</Text>
              <TouchableOpacity onPress={handleMarkAllRead} activeOpacity={0.8}>
                <Text style={styles.alertsMarkAll}>Mark all read</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.alertsList}>
              {alerts.length === 0 && (
                <Text style={styles.alertsEmpty}>No alerts yet.</Text>
              )}
              {alerts.map((n) => (
                <TouchableOpacity
                  key={n.id}
                  style={[styles.alertRow, !n.is_read && styles.alertRowUnread]}
                  onPress={() => handleAlertTap(n)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.alertEmoji}>{alertIcon(n.type)}</Text>
                  <View style={styles.alertTextWrap}>
                    <Text style={styles.alertTitle} numberOfLines={1}>{n.title}</Text>
                    {!!n.body && (
                      <Text style={styles.alertBody} numberOfLines={2}>{n.body}</Text>
                    )}
                  </View>
                  <Text style={styles.alertTime}>{timeAgo(n.created_at)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Text style={styles.buildNumber}>Build {BUILD_NUMBER}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  header: { padding: 25, backgroundColor: '#1a1a1a' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bellBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#1e1e1e',
    borderWidth: 1, borderColor: '#d4af37', justifyContent: 'center', alignItems: 'center',
    marginRight: 8,
  },
  bellIcon: { fontSize: 20 },
  bellBadge: {
    position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: '#ff3b30', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5,
  },
  bellBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  alertsBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  alertsDismiss: { flex: 1 },
  alertsSheet: { backgroundColor: '#1e1e1e', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%', paddingBottom: 24 },
  alertsHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#2c2c2e', alignSelf: 'center', marginTop: 10 },
  alertsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  alertsTitle: { color: '#d4af37', fontSize: 22, fontWeight: '800' },
  alertsMarkAll: { color: '#d4af37', fontSize: 14, fontWeight: '600' },
  alertsList: { paddingHorizontal: 16 },
  alertsEmpty: { color: '#888', fontSize: 14, fontStyle: 'italic', textAlign: 'center', paddingVertical: 24 },
  alertRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#262626', borderRadius: 12, padding: 12, marginBottom: 8 },
  alertRowUnread: { borderLeftWidth: 3, borderLeftColor: '#d4af37' },
  alertEmoji: { fontSize: 24, marginRight: 12 },
  alertTextWrap: { flex: 1 },
  alertTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  alertBody: { color: '#bbb', fontSize: 13, marginTop: 2 },
  alertTime: { color: '#888', fontSize: 12, marginLeft: 8 },
  title: { fontSize: 28, fontWeight: '900', color: '#ffffff', letterSpacing: 1, flex: 1 },
  editTitleInput: { fontSize: 24, fontWeight: '900', color: '#ffffff', backgroundColor: '#333', padding: 5, borderRadius: 6, flex: 1, marginRight: 10 },
  editBtn: { backgroundColor: '#d4af37', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  editBtnText: { color: '#121212', fontWeight: 'bold' },
  subtitle: { fontSize: 16, color: '#d4af37', marginTop: 8, fontWeight: '600' },
  discoverRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 16, backgroundColor: '#1e1e1e', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14,
  },
  discoverLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  editSubtitleInput: { fontSize: 16, color: '#d4af37', marginTop: 8, fontWeight: '600', backgroundColor: '#333', padding: 5, borderRadius: 6 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 10, justifyContent: 'space-between' },
  coverWrap: { paddingHorizontal: 10, marginBottom: 4 },
  coverLabel: { color: '#d4af37', fontWeight: '600', fontSize: 13, marginBottom: 8 },
  showcaseEmpty: { color: '#888', fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
  showcaseGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  showcaseCell: {
    width: 68, alignItems: 'center', paddingVertical: 10, marginRight: 8, marginBottom: 8,
    backgroundColor: '#1e1e1e', borderRadius: 12, borderWidth: 2, borderColor: '#2c2c2e',
  },
  showcaseCellActive: { borderColor: '#d4af37', backgroundColor: '#26241a' },
  showcaseCount: { color: '#d4af37', fontSize: 11, fontWeight: '700', marginTop: 4 },
  showcaseCheck: {
    position: 'absolute', top: -7, right: -7, width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#d4af37', alignItems: 'center', justifyContent: 'center',
  },
  showcaseCheckText: { color: '#121212', fontSize: 13, fontWeight: '800' },
  socialRow: { flexDirection: 'row', marginTop: 12 },
  socBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#2c2c2e', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  socImg: { width: 22, height: 22, resizeMode: 'contain' },
  socialSection: { paddingHorizontal: 10, marginBottom: 12 },
  socialItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e1e1e', borderRadius: 12, padding: 10, marginBottom: 8 },
  socialItemIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#2c2c2e', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  socialItemName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  socialItemUrl: { color: '#888', fontSize: 12, marginTop: 2 },
  socialRemove: { padding: 8 },
  socialRemoveText: { color: '#e5484d', fontSize: 16, fontWeight: 'bold' },
  socialAdd: { borderWidth: 1, borderColor: '#d4af37', borderStyle: 'dashed', borderRadius: 12, padding: 14, alignItems: 'center' },
  socialAddText: { color: '#d4af37', fontWeight: '700', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#1e1e1e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 4, textAlign: 'center' },
  modalSubtitle: { color: '#d4af37', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  platformRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2c2c2e' },
  platformName: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600' },
  platformGo: { color: '#d4af37', fontSize: 18 },
  modalCancel: { marginTop: 14, padding: 12, alignItems: 'center' },
  modalCancelText: { color: '#888', fontSize: 15, fontWeight: '600' },
  urlIconWrap: { width: 64, height: 64, borderRadius: 18, backgroundColor: '#2c2c2e', borderWidth: 1, borderColor: '#d4af37', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 8 },
  urlImg: { width: 34, height: 34, resizeMode: 'contain' },
  urlInput: { backgroundColor: '#2c2c2e', borderRadius: 10, padding: 14, color: '#fff', fontSize: 15, marginTop: 12 },
  urlHint: { color: '#888', fontSize: 12, marginTop: 6, textAlign: 'center' },
  urlAddBtn: { backgroundColor: '#d4af37', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 14 },
  urlAddText: { color: '#121212', fontWeight: '800', fontSize: 15 },
  coverBox: { width: '100%', height: 170, backgroundColor: '#2c2c2e', borderRadius: 8, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  photoBox: { width: '48%', height: 120, backgroundColor: '#2c2c2e', marginBottom: 10, borderRadius: 8, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  photoPlaceholder: { color: '#757575', fontWeight: '600' },
  photo: { width: '100%', height: '100%' },
  section: { marginHorizontal: 15, marginBottom: 15, padding: 20, backgroundColor: '#1e1e1e', borderRadius: 12, elevation: 3 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#2c2c2e', paddingBottom: 8 },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  specLabel: { fontSize: 16, color: '#aaa', flex: 1 },
  specValue: { fontSize: 16, fontWeight: '600', color: '#fff', flex: 2, textAlign: 'right' },
  input: { flex: 2, backgroundColor: '#2c2c2e', padding: 8, borderRadius: 6, fontSize: 16, color: '#fff', textAlign: 'right' },
  multiline: { textAlign: 'left', minHeight: 80, textAlignVertical: 'top' },
  modText: { fontSize: 16, paddingVertical: 6, color: '#ccc', lineHeight: 24 },
  logoutContainer: { marginHorizontal: 15, marginBottom: 30, alignItems: 'center' },
  logoutButton: { backgroundColor: '#d32f2f', width: '100%', padding: 15, borderRadius: 8, alignItems: 'center' },
  logoutButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  buildNumber: { color: '#555', fontSize: 12, textAlign: 'center', marginBottom: 30, marginTop: 10 }
});