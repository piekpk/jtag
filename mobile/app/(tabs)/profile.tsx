import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Image, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { API_URL } from '../config.js'; //file that contains backend URL[cite: 9]

export default function MyRigScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // State variables for profile data
  const [ownerName, setOwnerName] = useState('');
  const [vehicleTitle, setVehicleTitle] = useState('');
  const [specs, setSpecs] = useState({
    engine: '',
    wheels: '',
    interior: ''
  });
  const [mods, setMods] = useState('');
  const [photos, setPhotos] = useState<string[]>(['', '', '', '']);

  // 1. Load the user's profile from the database when the screen opens[cite: 9]
  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const storedUserId = await AsyncStorage.getItem('userId');
        if (!storedUserId) {
          setIsLoading(false);
          return;
        }
        setUserId(storedUserId);

        const response = await fetch(`${API_URL}/users/${storedUserId}/profile`, {
          headers: {
            'ngrok-skip-browser-warning': 'true'
          }
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
      setIsSaving(true);
      try {
        const response = await fetch(`${API_URL}/users/${userId}/profile`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true'
          },
          body: JSON.stringify({
            settings: {
              ownerName,
              vehicleTitle,
              specs,
              mods,
              photos
            }
          }),
        });

        if (!response.ok) {
          Alert.alert("Save Failed", "Could not save your profile changes.");
          setIsSaving(false);
          return; // Don't exit edit mode if save failed[cite: 9]
        }
      } catch (error) {
        Alert.alert("Network Error", "Failed to connect to the server.");
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
      Alert.alert("Error", "Could not log out.");
    }
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
      const localUri = result.assets[0].uri;
      const filename = localUri.split('/').pop() || `photo_${index}.jpg`;
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image/jpeg`;

      // 1. Format the image for the backend[cite: 9]
      const formData = new FormData();
      // @ts-ignore - React Native FormData expects this specific structure[cite: 9]
      formData.append('file', {
        uri: localUri,
        name: filename,
        type: type,
      });

      try {
        // 2. Upload it to your backend via Ngrok[cite: 9]
        const response = await fetch(`${API_URL}/users/${userId}/profile-picture`, {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'multipart/form-data',
            'ngrok-skip-browser-warning': 'true'
          },
        });

        if (response.ok) {
          const data = await response.json();
          // 3. Update the state with the new network URL from the server[cite: 9]
          const newPhotos = [...photos];
          newPhotos[index] = data.url; 
          setPhotos(newPhotos);
        } else {
          Alert.alert("Upload Failed", "Could not upload the image to the server.");
        }
      } catch (error) {
        console.error("Upload error:", error);
        Alert.alert("Network Error", "Could not connect to the server.");
      }
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
        <ActivityIndicator size="large" color="#4caf50" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {isEditing ? (
            <TextInput
              style={styles.editTitleInput}
              value={ownerName}
              onChangeText={setOwnerName}
              placeholder="Your Name"
              placeholderTextColor="#888"
            />
          ) : (
            <Text style={styles.title}>{ownerName}'s Rig</Text>
          )}
          
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
          />
        ) : (
          <Text style={styles.subtitle}>{vehicleTitle}</Text>
        )}
      </View>

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { padding: 25, backgroundColor: '#1a1a1a' },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '900', color: '#ffffff', letterSpacing: 1, flex: 1 },
  editTitleInput: { fontSize: 24, fontWeight: '900', color: '#ffffff', backgroundColor: '#333', padding: 5, borderRadius: 6, flex: 1, marginRight: 10 },
  editBtn: { backgroundColor: '#4caf50', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  editBtnText: { color: '#fff', fontWeight: 'bold' },
  subtitle: { fontSize: 16, color: '#4caf50', marginTop: 8, fontWeight: '600' },
  editSubtitleInput: { fontSize: 16, color: '#4caf50', marginTop: 8, fontWeight: '600', backgroundColor: '#333', padding: 5, borderRadius: 6 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 10, justifyContent: 'space-between' },
  photoBox: { width: '48%', height: 120, backgroundColor: '#e0e0e0', marginBottom: 10, borderRadius: 8, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  photoPlaceholder: { color: '#757575', fontWeight: '600' },
  photo: { width: '100%', height: '100%' },
  section: { marginHorizontal: 15, marginBottom: 15, padding: 20, backgroundColor: '#ffffff', borderRadius: 12, elevation: 3 },
  sectionTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#eeeeee', paddingBottom: 8 },
  specRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  specLabel: { fontSize: 16, color: '#666666', flex: 1 },
  specValue: { fontSize: 16, fontWeight: '600', color: '#333333', flex: 2, textAlign: 'right' },
  input: { flex: 2, backgroundColor: '#f0f0f0', padding: 8, borderRadius: 6, fontSize: 16, color: '#333', textAlign: 'right' },
  multiline: { textAlign: 'left', minHeight: 80, textAlignVertical: 'top' },
  modText: { fontSize: 16, paddingVertical: 6, color: '#444444', lineHeight: 24 },
  logoutContainer: { marginHorizontal: 15, marginBottom: 30, alignItems: 'center' },
  logoutButton: { backgroundColor: '#d32f2f', width: '100%', padding: 15, borderRadius: 8, alignItems: 'center' },
  logoutButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});