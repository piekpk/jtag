import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export default function MyRigScreen() {
  const [isEditing, setIsEditing] = useState(false);
  
  const [ownerName, setOwnerName] = useState('Paul Piekarski');
  const [vehicleTitle, setVehicleTitle] = useState('2025 Jeep Wrangler 4xe Sahara');

  const [specs, setSpecs] = useState({
    engine: '2.0L Turbocharged Hybrid',
    wheels: '20-inch Factory',
    interior: 'Manual Cloth Seats'
  });
  
  const [mods, setMods] = useState("• Green Filter 7347 Drop-in Air Filter\n• Custom 6.5\" Rear Cargo Leveling Platform");
  const [photos, setPhotos] = useState<string[]>(['', '', '', '']);

  const pickImage = async (index: number) => {
    if (!isEditing) return;
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      const newPhotos = [...photos];
      newPhotos[index] = result.assets[0].uri;
      setPhotos(newPhotos);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {isEditing ? (
            <TextInput
              style={styles.editTitleInput}
              value={ownerName}
              onChangeText={setOwnerName}
            />
          ) : (
            <Text style={styles.title}>{ownerName}'s Rig</Text>
          )}
          
          <TouchableOpacity onPress={() => setIsEditing(!isEditing)} style={styles.editBtn}>
            <Text style={styles.editBtnText}>{isEditing ? 'Save' : 'Edit'}</Text>
          </TouchableOpacity>
        </View>

        {isEditing ? (
          <TextInput
            style={styles.editSubtitleInput}
            value={vehicleTitle}
            onChangeText={setVehicleTitle}
          />
        ) : (
          <Text style={styles.subtitle}>{vehicleTitle}</Text>
        )}
      </View>

      <View style={styles.photoGrid}>
        {[0, 1, 2, 3].map((i) => (
          <TouchableOpacity key={i} style={styles.photoBox} onPress={() => pickImage(i)}>
            {photos[i] ? (
              <Image source={{ uri: photos[i] }} style={styles.photo} />
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
  modText: { fontSize: 16, paddingVertical: 6, color: '#444444', lineHeight: 24 }
});